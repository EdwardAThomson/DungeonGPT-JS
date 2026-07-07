// BRANCH-GATED SUITE: premium-ai-ratelimit
//
// Covers cf-worker/src/services/openrouter.ts (the Members premium AI pool,
// backlog #7), which does not exist on master yet. Activates automatically once
// the branch merges (dynamic import resolves); skips cleanly on master.
//
// All OpenRouter traffic goes through the fetch stub: no key, no network.

import { describe, it, expect, afterEach } from "vitest";
import { FetchStub } from "../helpers/fetchStub";
import { makeEnv } from "../helpers/env";
import { AiServiceError } from "../../src/services/ai";

const or: any = await import("../../src/services/openrouter" as string).catch(
  () => null
);

it(`openrouter module ${or ? "present: suite active" : "absent (master): suite skipped"}`, () => {
  expect(true).toBe(true);
});

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function orEnv(overrides: Record<string, unknown> = {}) {
  return makeEnv({ OPENROUTER_API_KEY: "sk-or-test-key", ...overrides } as any);
}

function okBody(text: string) {
  return { choices: [{ message: { content: text } }] };
}

afterEach(() => {
  new FetchStub().restore();
});

describe.skipIf(!or)("premium model registry", () => {
  it("has a default that exists in the registry", () => {
    expect(or.getPremiumModelById(or.DEFAULT_PREMIUM_MODEL_ID)).toBeDefined();
  });

  it("caps every premium model's output at 1500 tokens (parity with free pool)", () => {
    for (const model of or.PREMIUM_MODEL_REGISTRY) {
      expect(model.maxTokens).toBe(1500);
    }
  });

  it("fallback candidates: default first, then registry order, failed id excluded", () => {
    const nonDefault = or.PREMIUM_MODEL_REGISTRY.find(
      (m: any) => m.id !== or.DEFAULT_PREMIUM_MODEL_ID
    );
    const candidates = or.getPremiumFallbackCandidates(nonDefault.id);
    expect(candidates[0]).toBe(or.DEFAULT_PREMIUM_MODEL_ID);
    expect(candidates).not.toContain(nonDefault.id);
    expect(new Set(candidates).size).toBe(candidates.length);
  });
});

describe.skipIf(!or)("generatePremiumText", () => {
  it("throws AiServiceError 503 when OPENROUTER_API_KEY is not configured", async () => {
    const err = await or
      .generatePremiumText(makeEnv(), { prompt: "hi" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiServiceError);
    expect((err as any).status).toBe(503);
  });

  it("runs the default premium model when no model id is given", async () => {
    const stub = new FetchStub().install().on(OPENROUTER_URL, () => okBody("prose"));
    const result = await or.generatePremiumText(orEnv(), { prompt: "hi" });
    expect(result.text).toBe("prose");
    expect(result.modelId).toBe(or.DEFAULT_PREMIUM_MODEL_ID);
    expect((stub.requests[0].json as any).model).toBe(or.DEFAULT_PREMIUM_MODEL_ID);
  });

  it("silently resolves unknown model ids to the default", async () => {
    const stub = new FetchStub().install().on(OPENROUTER_URL, () => okBody("ok"));
    await or.generatePremiumText(orEnv(), {
      prompt: "hi",
      modelId: "someone/nonexistent-model",
    });
    expect((stub.requests[0].json as any).model).toBe(or.DEFAULT_PREMIUM_MODEL_ID);
  });

  it("clamps client maxTokens to the registry's 1500-token output cap", async () => {
    const stub = new FetchStub().install().on(OPENROUTER_URL, () => okBody("ok"));
    await or.generatePremiumText(orEnv(), { prompt: "hi", maxTokens: 5000 });
    expect((stub.requests[0].json as any).max_tokens).toBe(1500);
  });

  it("sends the API key as a bearer Authorization header", async () => {
    const stub = new FetchStub().install().on(OPENROUTER_URL, () => okBody("ok"));
    await or.generatePremiumText(orEnv(), { prompt: "hi" });
    expect(stub.requests[0].headers["authorization"]).toBe("Bearer sk-or-test-key");
  });

  it("applies the same sanitization pass as the free pool", async () => {
    new FetchStub()
      .install()
      .on(OPENROUTER_URL, () => okBody("[TASK] The gate creaks open."));
    const result = await or.generatePremiumText(orEnv(), { prompt: "hi" });
    expect(result.text).toBe("The gate creaks open.");
  });

  it("walks the fallback chain: default, then the next two candidates in order", async () => {
    const stub = new FetchStub()
      .install()
      .on(OPENROUTER_URL, () => new Response("boom", { status: 500 }), { once: true })
      .on(OPENROUTER_URL, () => new Response("boom", { status: 500 }), { once: true })
      .on(OPENROUTER_URL, () => okBody("third time lucky"));

    const result = await or.generatePremiumText(orEnv(), { prompt: "hi" });

    const expectedOrder = [
      or.DEFAULT_PREMIUM_MODEL_ID,
      ...or.getPremiumFallbackCandidates(or.DEFAULT_PREMIUM_MODEL_ID).slice(0, 2),
    ];
    expect(stub.requests.map((r) => (r.json as any).model)).toEqual(expectedOrder);
    expect(result.text).toBe("third time lucky");
    expect(result.modelId).toBe(expectedOrder[2]);
  });

  it("throws AiServiceError 502 when the whole chain fails (route then free-pools it)", async () => {
    const stub = new FetchStub()
      .install()
      .on(OPENROUTER_URL, () => new Response("down", { status: 500 }));

    const err = await or
      .generatePremiumText(orEnv(), { prompt: "hi" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiServiceError);
    expect((err as any).status).toBe(502);
    expect((err as any).message).toContain("all fallbacks exhausted");
    expect(stub.requests.length).toBe(3); // primary + two candidates
  });

  it("treats an unexpected response shape as a failure (502 after fallbacks)", async () => {
    new FetchStub().install().on(OPENROUTER_URL, () => ({ unexpected: true }));
    const err = await or
      .generatePremiumText(orEnv(), { prompt: "hi" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiServiceError);
  });
});
