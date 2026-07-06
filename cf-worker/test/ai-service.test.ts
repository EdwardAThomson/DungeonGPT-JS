import { describe, it, expect } from "vitest";
import { generateText, AiServiceError } from "../src/services/ai";
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

  it("degrades to message.reasoning when content is empty (reasoning models)", async () => {
    const ai = stubAi(() => ({
      choices: [{ message: { content: null, reasoning: "partial planning" } }],
    }));
    const env = makeEnv({ AI: ai.binding });
    const result = await generateText(env, { prompt: "hi", modelId: KNOWN_MODEL });
    expect(result.text).toBe("partial planning");
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
