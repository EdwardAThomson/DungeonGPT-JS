import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../src/middleware/auth";
import type { Env } from "../src/types";
import { makeEnv, makeBypassEnv } from "./helpers/env";
import { FetchStub } from "./helpers/fetchStub";
import { createAuthKit, validClaims, type AuthKit } from "./helpers/jwt";

// Auth middleware contract:
//   - fail closed (500) when no JWKS URL is configured, unless the explicit
//     ALLOW_UNAUTHENTICATED_DEV bypass is set;
//   - 401 for missing/malformed/expired/wrong-role tokens;
//   - happy path verifies a real ES256 signature against a JWKS document
//     (served via the fetch stub, no network) and exposes `sub` as userId.

const ISSUER = "https://auth.test";
const JWKS_URL = `${ISSUER}/auth/v1/.well-known/jwks.json`;

function makeApp() {
  const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
  app.use("*", requireAuth);
  app.get("/whoami", (c) => c.json({ userId: c.get("userId") ?? null }));
  return app;
}

async function request(
  app: ReturnType<typeof makeApp>,
  env: Env,
  headers: Record<string, string> = {}
) {
  const ctx = createExecutionContext();
  const res = await app.request("/whoami", { headers }, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

let kit: AuthKit;
const fetchStub = new FetchStub();

beforeAll(async () => {
  kit = await createAuthKit();
  // Persistent JWKS endpoint: the middleware caches keys for 10 minutes per
  // isolate, so only the first verification in this file actually "fetches".
  fetchStub.install().on(JWKS_URL, () => kit.jwks);
});

afterAll(() => {
  fetchStub.restore();
});

describe("requireAuth: unconfigured JWKS URL", () => {
  it("returns 500 when no JWKS URL is configured and no bypass is set", async () => {
    const res = await request(makeApp(), makeEnv());
    expect(res.status).toBe(500);
    expect(((await res.json()) as any).error).toBe("Authentication not configured");
  });

  it("bypasses auth when ALLOW_UNAUTHENTICATED_DEV=true and no JWKS URL", async () => {
    const res = await request(makeApp(), makeBypassEnv());
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).userId).toBeNull();
  });

  it("ignores the bypass once a JWKS URL is configured (fails closed)", async () => {
    const env = makeEnv({
      OCTONION_SUPABASE_URL: ISSUER,
      ALLOW_UNAUTHENTICATED_DEV: "true",
    });
    const res = await request(makeApp(), env);
    expect(res.status).toBe(401);
  });
});

describe("requireAuth: token validation", () => {
  const env = () => makeEnv({ OCTONION_SUPABASE_URL: ISSUER });

  it("401 without an Authorization header", async () => {
    const res = await request(makeApp(), env());
    expect(res.status).toBe(401);
    expect(((await res.json()) as any).error).toBe("Unauthorized");
  });

  it("401 for a non-Bearer Authorization header", async () => {
    const res = await request(makeApp(), env(), { Authorization: "Basic abc" });
    expect(res.status).toBe(401);
  });

  it("401 for a malformed token (not three parts)", async () => {
    const res = await request(makeApp(), env(), {
      Authorization: "Bearer not.a-jwt",
    });
    expect(res.status).toBe(401);
  });

  it("accepts a validly signed token and exposes sub as userId", async () => {
    const token = await kit.signToken(validClaims(ISSUER, { sub: "user-42" }));
    const res = await request(makeApp(), env(), {
      Authorization: `Bearer ${token}`,
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).userId).toBe("user-42");
  });

  it("401 for an expired token", async () => {
    const token = await kit.signToken(
      validClaims(ISSUER, { exp: Math.floor(Date.now() / 1000) - 60 })
    );
    const res = await request(makeApp(), env(), {
      Authorization: `Bearer ${token}`,
    });
    expect(res.status).toBe(401);
    expect(((await res.json()) as any).error).toBe("Token has expired");
  });

  it("401 for a wrong issuer", async () => {
    const token = await kit.signToken(
      validClaims(ISSUER, { iss: "https://evil.test/auth/v1" })
    );
    const res = await request(makeApp(), env(), {
      Authorization: `Bearer ${token}`,
    });
    expect(res.status).toBe(401);
    expect(((await res.json()) as any).error).toBe("Invalid token issuer");
  });

  it("401 for a non-authenticated role (service_role/anon rejected)", async () => {
    const token = await kit.signToken(validClaims(ISSUER, { role: "service_role" }));
    const res = await request(makeApp(), env(), {
      Authorization: `Bearer ${token}`,
    });
    expect(res.status).toBe(401);
    expect(((await res.json()) as any).error).toBe("Invalid token role");
  });

  it("401 for a token missing sub", async () => {
    const claims = validClaims(ISSUER);
    delete (claims as any).sub;
    const token = await kit.signToken(claims);
    const res = await request(makeApp(), env(), {
      Authorization: `Bearer ${token}`,
    });
    expect(res.status).toBe(401);
    expect(((await res.json()) as any).error).toBe("Token missing subject");
  });

  it("401 for a tampered signature", async () => {
    const token = await kit.signToken(validClaims(ISSUER));
    const [h, p] = token.split(".");
    const forged = `${h}.${p}.${"A".repeat(86)}`;
    const res = await request(makeApp(), env(), {
      Authorization: `Bearer ${forged}`,
    });
    expect(res.status).toBe(401);
  });
});
