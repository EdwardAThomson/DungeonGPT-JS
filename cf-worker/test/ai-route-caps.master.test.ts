import { describe, it, expect } from "vitest";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import app from "../src/index";
import { makeBypassEnv, stubAi } from "./helpers/env";
import type { Env } from "../src/types";

// MASTER-PINNED cost caps for POST /api/ai/generate: prompt <= 50000 chars,
// maxTokens <= 4096. The premium-ai-ratelimit branch tightens these to
// 32000/1500; this file therefore SKIPS itself once that branch's module
// (src/services/openrouter.ts) is present, and test/premium/ai-route-caps.branch.test.ts
// takes over with the new pins. Exactly one of the two files runs on any commit.
const premiumBranchPresent = await import("../src/services/openrouter" as string)
  .then(() => true)
  .catch(() => false);

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

describe.skipIf(premiumBranchPresent)(
  "ai generate caps (master values: prompt 50000, maxTokens 4096)",
  () => {
    it("accepts a prompt of exactly 50000 chars", async () => {
      const ai = stubAi(() => ({ response: "ok" }));
      const env = makeBypassEnv({ AI: ai.binding });
      const res = await post({ ...valid, prompt: "p".repeat(50000) }, env);
      expect(res.status).toBe(200);
    });

    it("rejects a prompt of 50001 chars with 400", async () => {
      const env = makeBypassEnv();
      const res = await post({ ...valid, prompt: "p".repeat(50001) }, env);
      expect(res.status).toBe(400);
      expect(((await res.json()) as any).error).toBe("Validation failed");
    });

    it("accepts maxTokens of exactly 4096", async () => {
      const ai = stubAi(() => ({ response: "ok" }));
      const env = makeBypassEnv({ AI: ai.binding });
      const res = await post({ ...valid, maxTokens: 4096 }, env);
      expect(res.status).toBe(200);
    });

    it("rejects maxTokens of 4097 with 400", async () => {
      const env = makeBypassEnv();
      const res = await post({ ...valid, maxTokens: 4097 }, env);
      expect(res.status).toBe(400);
    });
  }
);

// Keep the file from reporting "no tests" when the branch is merged and the
// pinned suite above is skipped.
describe.skipIf(!premiumBranchPresent)("ai generate caps (master pins superseded)", () => {
  it("branch code detected; caps are pinned by test/premium/ai-route-caps.branch.test.ts", () => {
    expect(premiumBranchPresent).toBe(true);
  });
});
