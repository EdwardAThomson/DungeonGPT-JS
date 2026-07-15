import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FetchStub } from "./helpers/fetchStub";
import { makeEnv } from "./helpers/env";
import {
  getHubEntitlements,
  hubTierToGameTier,
  freeHubEntitlements,
  DEFAULT_HUB_URL,
} from "../src/services/hubEntitlements";

// Hub entitlements helper (hub payments Phase 1). Contract under test:
//   - resolves GET ${HUB_URL}/api/me/entitlements forwarding the user's JWT;
//   - caches the result PER USER for 60 s (JWKS-cache pattern: module-level
//     Map, so tests use a unique userId each to stay isolated);
//   - fails closed to the free-tier shape on ANY failure (network, non-200,
//     invalid JSON, unusable payload) without caching the failure;
//   - maps the hub ladder ('members') onto the game ladder ('member') in one
//     exported function that Phase 3 server enforcement will reuse.

const HUB_URL = "https://hub.test";
const HUB_ENDPOINT = `${HUB_URL}/api/me/entitlements`;

const FREE_SHAPE = {
  tier: "free",
  status: "active",
  lifetime: false,
  currentPeriodEnd: null,
  perks: {},
  credits: null,
};

/** A healthy hub payload for a paying member. */
function membersPayload(overrides: Record<string, unknown> = {}) {
  return {
    tier: "members",
    status: "active",
    lifetime: false,
    currentPeriodEnd: "2026-08-01T00:00:00.000Z",
    perks: {},
    credits: null,
    ...overrides,
  };
}

// Unique per-test user ids: the 60 s cache is module state shared by the whole file.
let userSeq = 0;
const nextUser = () => `hub-user-${++userSeq}`;

// Fresh stub per test: handlers registered by one test must not leak into the
// next (dispatch tries handlers in registration order).
let fetchStub: FetchStub;
let env: ReturnType<typeof makeEnv>;

beforeEach(() => {
  fetchStub = new FetchStub().install();
  env = makeEnv({ HUB_URL });
});

afterEach(() => {
  fetchStub.restore();
  vi.restoreAllMocks();
});

describe("hubTierToGameTier", () => {
  it.each([
    ["free", "free"],
    ["members", "member"], // the hub's plural rung maps onto the game ladder
    ["premium", "premium"],
    ["elite", "elite"],
  ])("maps hub tier %s -> game tier %s", (hubTier, gameTier) => {
    expect(hubTierToGameTier(hubTier)).toBe(gameTier);
  });

  it("fails closed to 'free' for unknown/missing values (incl. the game's own 'member')", () => {
    expect(hubTierToGameTier("member")).toBe("free");
    expect(hubTierToGameTier("platinum")).toBe("free");
    expect(hubTierToGameTier(undefined)).toBe("free");
    expect(hubTierToGameTier(null)).toBe("free");
    expect(hubTierToGameTier(2)).toBe("free");
  });
});

describe("getHubEntitlements: resolve", () => {
  it("fetches ${HUB_URL}/api/me/entitlements forwarding the user's JWT as Bearer", async () => {
    fetchStub.on(HUB_ENDPOINT, () => membersPayload());
    const result = await getHubEntitlements(env, nextUser(), "jwt-abc");
    expect(result).toEqual(membersPayload());
    expect(fetchStub.requests).toHaveLength(1);
    expect(fetchStub.requests[0].url).toBe(HUB_ENDPOINT);
    expect(fetchStub.requests[0].method).toBe("GET");
    expect(fetchStub.requests[0].headers.authorization).toBe("Bearer jwt-abc");
  });

  it("defaults to https://octonion.io when HUB_URL is unset", async () => {
    fetchStub.on(`${DEFAULT_HUB_URL}/api/me/entitlements`, () => membersPayload());
    const result = await getHubEntitlements(makeEnv(), nextUser(), "jwt");
    expect(result.tier).toBe("members");
  });

  it("tolerates a trailing slash on HUB_URL (no double-slash URL)", async () => {
    fetchStub.on(HUB_ENDPOINT, () => membersPayload());
    await getHubEntitlements(makeEnv({ HUB_URL: `${HUB_URL}/` }), nextUser(), "jwt");
    expect(fetchStub.requests[0].url).toBe(HUB_ENDPOINT);
  });

  it("defaults sloppy optional fields but keeps a known tier (forward-compatible)", async () => {
    // A future hub may add fields or omit ones this Worker knows; only the tier
    // is load-bearing.
    fetchStub.on(HUB_ENDPOINT, () => ({ tier: "elite", someFutureField: 1 }));
    const result = await getHubEntitlements(env, nextUser(), "jwt");
    expect(result).toEqual({ ...FREE_SHAPE, tier: "elite" });
  });

  it("passes through a credits balance once the hub ships one (Phase 2+)", async () => {
    fetchStub.on(HUB_ENDPOINT, () =>
      membersPayload({ credits: { month: "2026-07", balance: 480 } })
    );
    const result = await getHubEntitlements(env, nextUser(), "jwt");
    expect(result.credits).toEqual({ month: "2026-07", balance: 480 });
  });
});

describe("getHubEntitlements: 60 s per-user cache", () => {
  it("serves the second call within 60 s from cache (one hub round trip)", async () => {
    fetchStub.on(HUB_ENDPOINT, () => membersPayload());
    const userId = nextUser();
    const first = await getHubEntitlements(env, userId, "jwt-1");
    // Keyed by userId, not by JWT: a refreshed token must still hit the cache.
    const second = await getHubEntitlements(env, userId, "jwt-2-refreshed");
    expect(first).toEqual(second);
    expect(fetchStub.requests).toHaveLength(1);
  });

  it("re-fetches once the 60 s TTL has passed", async () => {
    fetchStub.on(HUB_ENDPOINT, () => membersPayload());
    const userId = nextUser();
    const t0 = Date.now();
    const now = vi.spyOn(Date, "now");

    now.mockReturnValue(t0);
    await getHubEntitlements(env, userId, "jwt");
    now.mockReturnValue(t0 + 59_000); // still cached
    await getHubEntitlements(env, userId, "jwt");
    expect(fetchStub.requests).toHaveLength(1);

    now.mockReturnValue(t0 + 61_000); // TTL expired
    await getHubEntitlements(env, userId, "jwt");
    expect(fetchStub.requests).toHaveLength(2);
  });

  it("caches per user: a different user triggers its own hub round trip", async () => {
    fetchStub.on(HUB_ENDPOINT, () => membersPayload());
    await getHubEntitlements(env, nextUser(), "jwt-a");
    await getHubEntitlements(env, nextUser(), "jwt-b");
    expect(fetchStub.requests).toHaveLength(2);
  });
});

describe("getHubEntitlements: fail closed", () => {
  it("returns the free shape on a network error", async () => {
    fetchStub.on(HUB_ENDPOINT, () => {
      throw new Error("connection refused");
    });
    const result = await getHubEntitlements(env, nextUser(), "jwt");
    expect(result).toEqual(FREE_SHAPE);
  });

  it("returns the free shape on a non-200 response", async () => {
    for (const status of [401, 404, 500]) {
      fetchStub.on(HUB_ENDPOINT, () => new Response("nope", { status }), { once: true });
      const result = await getHubEntitlements(env, nextUser(), "jwt");
      expect(result).toEqual(FREE_SHAPE);
    }
  });

  it("returns the free shape on invalid JSON", async () => {
    fetchStub.on(HUB_ENDPOINT, () => new Response("<html>gateway timeout</html>", { status: 200 }));
    const result = await getHubEntitlements(env, nextUser(), "jwt");
    expect(result).toEqual(FREE_SHAPE);
  });

  it("returns the free shape on an unknown tier value (fail closed, never fail open)", async () => {
    fetchStub.on(HUB_ENDPOINT, () => membersPayload({ tier: "platinum" }));
    const result = await getHubEntitlements(env, nextUser(), "jwt");
    expect(result).toEqual(FREE_SHAPE);
  });

  it("does NOT cache failures: the next call retries the hub", async () => {
    const userId = nextUser();
    fetchStub.on(
      HUB_ENDPOINT,
      () => {
        throw new Error("blip");
      },
      { once: true }
    );
    fetchStub.on(HUB_ENDPOINT, () => membersPayload());

    expect(await getHubEntitlements(env, userId, "jwt")).toEqual(FREE_SHAPE);
    expect((await getHubEntitlements(env, userId, "jwt")).tier).toBe("members");
    expect(fetchStub.requests).toHaveLength(2);
  });
});

describe("freeHubEntitlements", () => {
  it("matches the spec's free-tier shape and returns a fresh object each call", () => {
    const a = freeHubEntitlements();
    expect(a).toEqual(FREE_SHAPE);
    expect(freeHubEntitlements()).not.toBe(a); // no shared mutable state
  });
});
