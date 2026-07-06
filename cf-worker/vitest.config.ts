import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

// Worker test config (see docs/CF_WORKER_GUIDE.md "Automated tests").
//
// Tests run inside workerd via @cloudflare/vitest-pool-workers, so they exercise
// the same runtime (crypto.subtle, fetch, nodejs_compat modules) as production.
// Everything is offline by design; no test needs credentials, a database, or the
// network:
//   - No real database: tests hand-build `env` with a fake HYPERDRIVE connection
//     string, and query execution is intercepted by mocking the `postgres` module
//     (vi.mock + test/helpers/fakeSql) before it ever opens a socket.
//   - No real Workers AI: tests pass their own `env` to `app.request(...)` with a
//     stubbed `AI.run` (test/helpers/env stubAi).
//   - No real network: outbound fetch (OpenRouter, JWKS) goes through the
//     `fetchMock` helper from "cloudflare:test".
//
// Deliberately NOT `wrangler: { configPath: "./wrangler.toml" }`: inheriting the
// real config would provision the `[ai]` binding, and Workers AI bindings are
// remote-only, so pool startup then demands a CLOUDFLARE_API_TOKEN / wrangler
// login even though no test uses that binding. Instead the compatibility settings
// are read out of wrangler.toml below so the runtime stays in lockstep with
// production without pulling in its bindings.

function wranglerCompat(): { date: string; flags: string[] } {
  const toml = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
  const date = toml.match(/^compatibility_date\s*=\s*"([^"]+)"/m)?.[1];
  const flagsRaw = toml.match(/^compatibility_flags\s*=\s*\[([^\]]*)\]/m)?.[1] ?? "";
  const flags = [...flagsRaw.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (!date) {
    throw new Error("vitest.config.ts: compatibility_date not found in wrangler.toml");
  }
  return { date, flags };
}

const compat = wranglerCompat();

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: compat.date,
        compatibilityFlags: compat.flags,
        bindings: {
          ENVIRONMENT: "test",
        },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
  },
});
