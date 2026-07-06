import type { Env } from "../../src/types";

// Hand-built Env objects for unit-style tests. Nothing here touches real
// infrastructure: the HYPERDRIVE connection string is a dummy (the `postgres`
// module is mocked before it could ever be dialled), and `stubAi` replaces the
// Workers AI binding entirely.

export const FAKE_HYPERDRIVE = {
  connectionString: "postgresql://test:test@127.0.0.1:5432/dungeongpt_test",
} as unknown as Hyperdrive;

/**
 * A stub Workers AI binding. Provide a `respond` function returning what
 * `env.AI.run` should resolve with (throw inside it to simulate model failure).
 * Every call is recorded on `.calls` as { modelId, inputs }.
 */
export interface StubAiCall {
  modelId: string;
  inputs: {
    messages?: Array<{ role: string; content: string }>;
    max_tokens?: number;
    temperature?: number;
    [key: string]: unknown;
  };
}

export interface StubAi {
  binding: Ai;
  calls: StubAiCall[];
}

export function stubAi(
  respond: (call: StubAiCall) => unknown | Promise<unknown>
): StubAi {
  const calls: StubAiCall[] = [];
  const binding = {
    run: async (modelId: string, inputs: StubAiCall["inputs"]) => {
      const call = { modelId, inputs };
      calls.push(call);
      return respond(call);
    },
  } as unknown as Ai;
  return { binding, calls };
}

/** Baseline test Env; override per test. `AI` defaults to a never-called stub. */
export function makeEnv(overrides: Partial<Env> = {}): Env {
  const neverAi = stubAi(() => {
    throw new Error("env.AI.run called but this test provided no AI stub");
  });
  return {
    AI: neverAi.binding,
    ENVIRONMENT: "test",
    HYPERDRIVE: FAKE_HYPERDRIVE,
    ...overrides,
  } as Env;
}

/** Env that opts into the explicit local-dev auth bypass (no JWKS URL set). */
export function makeBypassEnv(overrides: Partial<Env> = {}): Env {
  return makeEnv({ ALLOW_UNAUTHENTICATED_DEV: "true", ...overrides });
}
