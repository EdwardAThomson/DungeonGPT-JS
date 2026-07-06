import { describe, it, expect } from "vitest";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import app from "../src/index";

// Smallest possible end-to-end check that the worker boots inside workerd and
// Hono routing works. Uses a hand-built env: unit-style tests never rely on the
// real bindings from wrangler.toml.
describe("worker smoke", () => {
  it("GET /health returns ok", async () => {
    const ctx = createExecutionContext();
    const res = await app.request(
      "/health",
      {},
      { ENVIRONMENT: "test" } as any,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe("ok");
    expect(body.service).toBe("dungeongpt-api");
    expect(body.environment).toBe("test");
  });

  it("unknown route returns 404 with path", async () => {
    const ctx = createExecutionContext();
    const res = await app.request(
      "/nope",
      {},
      { ENVIRONMENT: "test" } as any,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.path).toBe("/nope");
  });
});
