import { describe, it, expect } from "vitest";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import app from "../src/index";
import { makeBypassEnv, stubAi } from "./helpers/env";
import type { Env } from "../src/types";

// POST /api/ai/generate schema validation and generation plumbing. These cases
// hold on master AND after the premium-ai-ratelimit branch merges (the branch
// tightens prompt/maxTokens caps; the exact-boundary pins live in
// ai-route-caps.master.test.ts and test/premium/, gated on which code is present).
//
// Uses the ALLOW_UNAUTHENTICATED_DEV bypass env: requireAuth passes without a
// token and, post-merge, the rate limiter skips (no userId to key on).

async function post(body: unknown, env: Env) {
  const ctx = createExecutionContext();
  const res = await app.request(
    "/api/ai/generate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    env,
    ctx
  );
  await waitOnExecutionContext(ctx);
  return res;
}

const valid = {
  provider: "cf-workers",
  model: "@cf/openai/gpt-oss-120b",
  prompt: "Narrate the tavern.",
};

describe("POST /api/ai/generate: schema validation", () => {
  const badBodies: Array<[string, Record<string, unknown>]> = [
    ["missing provider", { ...valid, provider: undefined }],
    ["empty provider", { ...valid, provider: "" }],
    ["missing model", { ...valid, model: undefined }],
    ["empty model", { ...valid, model: "" }],
    ["missing prompt", { ...valid, prompt: undefined }],
    ["empty prompt", { ...valid, prompt: "" }],
    ["systemPrompt over 10000 chars", { ...valid, systemPrompt: "x".repeat(10001) }],
    ["maxTokens zero", { ...valid, maxTokens: 0 }],
    ["maxTokens negative", { ...valid, maxTokens: -5 }],
    ["maxTokens non-integer", { ...valid, maxTokens: 1.5 }],
    ["temperature below 0", { ...valid, temperature: -0.1 }],
    ["temperature above 2", { ...valid, temperature: 2.1 }],
  ];

  it.each(badBodies)("rejects %s with 400 and issue details", async (_name, body) => {
    const env = makeBypassEnv();
    const res = await post(body, env);
    expect(res.status).toBe(400);
    const json = (await res.json()) as any;
    expect(json.error).toBe("Validation failed");
    expect(Array.isArray(json.details)).toBe(true);
    expect(json.details.length).toBeGreaterThan(0);
  });

  it("accepts temperature boundaries 0 and 2", async () => {
    for (const temperature of [0, 2]) {
      const ai = stubAi(() => ({ response: "ok" }));
      const env = makeBypassEnv({ AI: ai.binding });
      const res = await post({ ...valid, temperature }, env);
      expect(res.status).toBe(200);
      expect(ai.calls[0].inputs.temperature).toBe(temperature);
    }
  });
});

describe("POST /api/ai/generate: generation", () => {
  it("returns the generated text on success", async () => {
    const ai = stubAi(() => ({ response: "The tavern hums with low talk." }));
    const env = makeBypassEnv({ AI: ai.binding });
    const res = await post(valid, env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.text).toBe("The tavern hums with low talk.");
  });

  it("sanitizes leaked prompt markers out of the response", async () => {
    const ai = stubAi(() => ({ response: "[TASK]The road forks." }));
    const env = makeBypassEnv({ AI: ai.binding });
    const res = await post(valid, env);
    const json = (await res.json()) as any;
    expect(json.text).toBe("The road forks.");
  });

  it("returns 502 with a generic message when every model fails", async () => {
    const ai = stubAi(() => {
      throw new Error("secret internal detail");
    });
    const env = makeBypassEnv({ AI: ai.binding });
    const res = await post(valid, env);
    expect(res.status).toBe(502);
    const json = (await res.json()) as any;
    expect(json.error).toBe("AI generation failed");
    expect(JSON.stringify(json)).not.toContain("secret internal detail");
  });
});

describe("GET /api/ai/models", () => {
  it("lists the registry and the default model id", async () => {
    const ctx = createExecutionContext();
    const res = await app.request("/api/ai/models", {}, makeBypassEnv(), ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(Array.isArray(json.models)).toBe(true);
    expect(json.models.length).toBeGreaterThan(0);
    expect(typeof json.defaultModelId).toBe("string");
    expect(json.models.map((m: any) => m.id)).toContain(json.defaultModelId);
  });
});
