import { describe, it, expect } from "vitest";
import {
  generateText,
  AiServiceError,
  AI_QUOTA_CODE,
  quotaRetryAfterSeconds,
} from "../src/services/ai";
import { MODEL_REGISTRY, DEFAULT_MODEL_ID } from "../src/services/models";
import { makeEnv, stubAi } from "./helpers/env";

// generateText behaviour against a stubbed env.AI binding: model resolution,
// token clamping, response-format handling, sanitization, and the fallback walk.

const KNOWN_MODEL = MODEL_REGISTRY[0].id;

function okResponse(text: string) {
  return { response: text };
}

describe("generateText: model resolution and clamping", () => {
  it("runs the requested model when it is in the registry", async () => {
    const ai = stubAi(() => okResponse("hello"));
    const env = makeEnv({ AI: ai.binding });
    const result = await generateText(env, { prompt: "hi", modelId: KNOWN_MODEL });
    expect(result.text).toBe("hello");
    expect(ai.calls[0].modelId).toBe(KNOWN_MODEL);
  });

  it("falls back to the default model for an unknown model id", async () => {
    const ai = stubAi(() => okResponse("ok"));
    const env = makeEnv({ AI: ai.binding });
    await generateText(env, { prompt: "hi", modelId: "@cf/removed/model" });
    expect(ai.calls[0].modelId).toBe(DEFAULT_MODEL_ID);
  });

  it("clamps maxTokens to the model's registry cap", async () => {
    // Use the tightest-capped model so the clamp is unambiguous.
    const model = [...MODEL_REGISTRY].sort((a, b) => a.maxTokens - b.maxTokens)[0];
    const ai = stubAi(() => okResponse("ok"));
    const env = makeEnv({ AI: ai.binding });
    await generateText(env, {
      prompt: "hi",
      modelId: model.id,
      maxTokens: model.maxTokens + 5000,
    });
    expect(ai.calls[0].inputs.max_tokens).toBe(model.maxTokens);
  });

  it("passes systemPrompt as a system message ahead of the user prompt", async () => {
    const ai = stubAi(() => okResponse("ok"));
    const env = makeEnv({ AI: ai.binding });
    await generateText(env, {
      prompt: "the action",
      modelId: KNOWN_MODEL,
      systemPrompt: "be a DM",
    });
    expect(ai.calls[0].inputs.messages).toEqual([
      { role: "system", content: "be a DM" },
      { role: "user", content: "the action" },
    ]);
  });
});

describe("generateText: response format handling", () => {
  it("reads the legacy { response } format", async () => {
    const ai = stubAi(() => ({ response: "legacy text" }));
    const env = makeEnv({ AI: ai.binding });
    const result = await generateText(env, { prompt: "hi", modelId: KNOWN_MODEL });
    expect(result.text).toBe("legacy text");
  });

  it("reads the OpenAI-compatible choices format", async () => {
    const ai = stubAi(() => ({
      choices: [{ message: { content: "openai text" } }],
    }));
    const env = makeEnv({ AI: ai.binding });
    const result = await generateText(env, { prompt: "hi", modelId: KNOWN_MODEL });
    expect(result.text).toBe("openai text");
  });

  it("never returns message.reasoning as narration; falls back to another model", async () => {
    const ai = stubAi((call) =>
      call.modelId === KNOWN_MODEL
        ? { choices: [{ message: { content: null, reasoning: "partial planning" } }] }
        : okResponse("fallback narration")
    );
    const env = makeEnv({ AI: ai.binding });
    const result = await generateText(env, { prompt: "hi", modelId: KNOWN_MODEL });
    expect(result.text).toBe("fallback narration");
    expect(ai.calls.length).toBe(2);
  });
});

describe("generateText: sanitization (protocol-marker stripping)", () => {
  const cases: Array<[string, string, string]> = [
    [
      "strips a leaked protocol block",
      "[STRICT DUNGEON MASTER PROTOCOL]rules here[/STRICT DUNGEON MASTER PROTOCOL]The forest darkens.",
      "The forest darkens.",
    ],
    [
      "strips [TASK] and [CONTEXT] markers",
      "[TASK] Narrate. [CONTEXT] You walk on.",
      "Narrate.  You walk on.",
    ],
    [
      "strips [ADVENTURE START], [GAME INFORMATION], [SUMMARY], [PLAYER ACTION], [NARRATE]",
      "[ADVENTURE START][GAME INFORMATION][SUMMARY][PLAYER ACTION][NARRATE]Dawn breaks.",
      "Dawn breaks.",
    ],
    [
      "is case-insensitive on markers and trims whitespace",
      "  [task] The road bends east.  ",
      "The road bends east.",
    ],
    ["leaves clean narration untouched", "You enter the tavern.", "You enter the tavern."],
  ];

  it.each(cases)("%s", async (_name, raw, expected) => {
    const ai = stubAi(() => okResponse(raw));
    const env = makeEnv({ AI: ai.binding });
    const result = await generateText(env, { prompt: "hi", modelId: KNOWN_MODEL });
    expect(result.text).toBe(expected);
  });
});

describe("generateText: fallback walk", () => {
  it("retries the default model when the primary fails", async () => {
    const nonDefault = MODEL_REGISTRY.find((m) => m.id !== DEFAULT_MODEL_ID)!;
    const ai = stubAi((call) => {
      if (call.modelId === nonDefault.id) throw new Error("model exploded");
      return okResponse("saved by fallback");
    });
    const env = makeEnv({ AI: ai.binding });
    const result = await generateText(env, { prompt: "hi", modelId: nonDefault.id });
    expect(result.text).toBe("saved by fallback");
    expect(ai.calls.map((c) => c.modelId)).toEqual([nonDefault.id, DEFAULT_MODEL_ID]);
  });

  it("tries at most two fallback candidates, then throws AiServiceError 502", async () => {
    const ai = stubAi(() => {
      throw new Error("everything is down");
    });
    const env = makeEnv({ AI: ai.binding });
    const err = await generateText(env, {
      prompt: "hi",
      modelId: DEFAULT_MODEL_ID,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiServiceError);
    expect((err as AiServiceError).status).toBe(502);
    expect((err as AiServiceError).message).toContain("all fallbacks exhausted");
    // primary + 2 fallback candidates
    expect(ai.calls.length).toBe(3);
  });

  it("carries the (already clamped) token budget into the fallback call", async () => {
    // Start from the tightest-capped model so its clamp is visibly below the
    // fallback default's own cap.
    const small = [...MODEL_REGISTRY].sort((a, b) => a.maxTokens - b.maxTokens)[0];
    const ai = stubAi((call) => {
      if (call.modelId === small.id) throw new Error("primary down");
      return okResponse("ok");
    });
    const env = makeEnv({ AI: ai.binding });
    await generateText(env, {
      prompt: "hi",
      modelId: small.id,
      maxTokens: small.maxTokens + 5000,
    });
    const fallbackCall = ai.calls.find((c) => c.modelId !== small.id)!;
    expect(fallbackCall.inputs.max_tokens).toBe(small.maxTokens);
  });
});

describe("generateText: leaked-prompt and repetition guard", () => {
  // The live-game leak (2026-10-06): the model restated DM_PROTOCOL, then looped.
  const LEAK =
    'You are a Dungeon master for a tabletop RPG. You must ALWAYS stay in character. ' +
    '1. NEVER output internal reasoning, plans, or " agentic thoughts (e.g ( e.g., " ' +
    "I will examine any item found in the environment. " +
    "NEVER ".repeat(40);

  it.each([
    ["a protocol echo", 'The wind stirs. 1. NEVER output internal reasoning, plans, or "agentic" thoughts.'],
    ["a repetition loop", "The boar falls. " + "NEVER ".repeat(30)],
    ["a repeated phrase loop", "You look around. " + "the dark the dark the dark ".repeat(5)],
    ["the live-game leak", LEAK],
  ])("rejects %s and serves the fallback model's narration", async (_name, bad) => {
    const ai = stubAi((call) =>
      call.modelId === KNOWN_MODEL ? okResponse(bad) : okResponse("The clearing is quiet.")
    );
    const env = makeEnv({ AI: ai.binding });
    const result = await generateText(env, { prompt: "hi", modelId: KNOWN_MODEL });
    expect(result.text).toBe("The clearing is quiet.");
  });

  it("throws AiServiceError when every model leaks", async () => {
    const ai = stubAi(() => okResponse(LEAK));
    const env = makeEnv({ AI: ai.binding });
    const err = await generateText(env, { prompt: "hi", modelId: KNOWN_MODEL }).catch(
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(AiServiceError);
  });

  it.each([
    ["short emphatic dialogue", '"No, no, no, no!" the miller cries. "Not the mill!"'],
    ["a stat array", "Rolls: 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1"],
    ["ordinary narration mentioning a master", "The dungeon master of the keep, a stooped jailer, eyes you warily."],
  ])("lets %s through", async (_name, text) => {
    const ai = stubAi(() => okResponse(text));
    const env = makeEnv({ AI: ai.binding });
    const result = await generateText(env, { prompt: "hi", modelId: KNOWN_MODEL });
    expect(result.text).toBe(text);
  });
});

describe("generateText: daily allocation used up", () => {
  const QUOTA_MSG =
    "4006: you have used up your daily free allocation of 10,000 neurons, please upgrade to Cloudflare's Workers Paid plan if you would like to continue usage.";

  it("throws an ai_quota error without trying fallback models", async () => {
    const ai = stubAi(() => {
      throw new Error(QUOTA_MSG);
    });
    const env = makeEnv({ AI: ai.binding });
    const err = await generateText(env, { prompt: "hi", modelId: KNOWN_MODEL }).catch(
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(AiServiceError);
    expect((err as AiServiceError).code).toBe(AI_QUOTA_CODE);
    expect(ai.calls.length).toBe(1);
  });

  it("stops the fallback walk when a fallback hits the allocation", async () => {
    const ai = stubAi((call) => {
      if (call.modelId === KNOWN_MODEL) throw new Error("model exploded");
      throw new Error(QUOTA_MSG);
    });
    const env = makeEnv({ AI: ai.binding });
    const err = await generateText(env, { prompt: "hi", modelId: KNOWN_MODEL }).catch(
      (e: unknown) => e
    );
    expect((err as AiServiceError).code).toBe(AI_QUOTA_CODE);
    expect(ai.calls.length).toBe(2);
  });

  it("counts retry-after down to the next 00:00 UTC", () => {
    expect(quotaRetryAfterSeconds(Date.UTC(2026, 9, 6, 22, 0, 0))).toBe(2 * 3600);
    expect(quotaRetryAfterSeconds(Date.UTC(2026, 9, 31, 23, 59, 30))).toBe(30);
  });
});
