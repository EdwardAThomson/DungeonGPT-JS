// BRANCH-GATED SUITE: premium-ai-ratelimit
//
// Pins the TIGHTENED cost caps on POST /api/ai/generate introduced with the
// premium pool (maintainer 2026-07-06): prompt <= 32000 chars (~8k tokens),
// maxTokens <= 1500. Counterpart of test/ai-route-caps.master.test.ts (which
// pins today's 50000/4096 and self-skips once this branch's code is present).
// Skips cleanly on master.

import { describe, it, expect } from "vitest";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import app from "../../src/index";
import { makeBypassEnv, stubAi } from "../helpers/env";
import type { Env } from "../../src/types";

const or: any = await import("../../src/services/openrouter" as string).catch(
  () => null
);

it(`openrouter module ${or ? "present: suite active" : "absent (master): suite skipped"}`, () => {
  expect(true).toBe(true);
});

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
  prompt: "Narrate.",
};

describe.skipIf(!or)(
  "ai generate caps (premium branch values: prompt 32000, maxTokens 1500)",
  () => {
    it("accepts a prompt of exactly 32000 chars", async () => {
      const ai = stubAi(() => ({ response: "ok" }));
      const env = makeBypassEnv({ AI: ai.binding });
      const res = await post({ ...valid, prompt: "p".repeat(32000) }, env);
      expect(res.status).toBe(200);
    });

    it("rejects a prompt of 32001 chars with 400 (input cost cap)", async () => {
      const env = makeBypassEnv();
      const res = await post({ ...valid, prompt: "p".repeat(32001) }, env);
      expect(res.status).toBe(400);
      expect(((await res.json()) as any).error).toBe("Validation failed");
    });

    it("accepts maxTokens of exactly 1500", async () => {
      const ai = stubAi(() => ({ response: "ok" }));
      const env = makeBypassEnv({ AI: ai.binding });
      const res = await post({ ...valid, maxTokens: 1500 }, env);
      expect(res.status).toBe(200);
    });

    it("rejects maxTokens of 1501 with 400 (output cost cap)", async () => {
      const env = makeBypassEnv();
      const res = await post({ ...valid, maxTokens: 1501 }, env);
      expect(res.status).toBe(400);
    });
  }
);
