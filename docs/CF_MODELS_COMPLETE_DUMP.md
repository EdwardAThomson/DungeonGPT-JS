# Cloudflare Workers AI — Production Model Reference

**Scope:** Canonical reference for the CF Workers AI models DungeonGPT serves via `cf-worker/`.
**Last refresh:** April 2026 (commits `2a9ac5f`, `e454761`).
**Source of truth:** `cf-worker/src/services/models.ts` — if this doc and the registry disagree, the code wins.

---

## Current Production Models (April 2026)

Seven models across six tiers. IDs, display names, and `maxTokens` come directly from `MODEL_REGISTRY`. Default serving model is `@cf/meta/llama-3.1-8b-instruct-fast` (see `DEFAULT_MODEL_ID`).

| Tier     | Model ID                                      | Display Name        | Family        | maxTokens | Role / Notes |
|----------|------------------------------------------------|---------------------|---------------|-----------|--------------|
| ultra    | `@cf/openai/gpt-oss-120b`                      | GPT-OSS 120B        | OpenAI OW     | 4096      | Best narrative quality; slower. Reserve for showcase or "premium" UX. |
| premium  | `@cf/meta/llama-3.3-70b-instruct-fp8-fast`     | Llama 3.3 70B       | Meta Llama 3  | 4096      | FP8 quantized; function-calling. Target in `FALLBACK_MAP`. |
| quality  | `@cf/openai/gpt-oss-20b`                       | GPT-OSS 20B         | OpenAI OW     | 4096      | UI default pick for "good DM" — strong quality-per-second. |
| quality  | `@cf/meta/llama-4-scout-17b-16e-instruct`      | Llama 4 Scout 17B   | Meta Llama 4  | 4096      | 17B MoE, multimodal-capable, function-calling. |
| quality  | `@cf/google/gemma-3-12b-it`                    | Gemma 3 12B         | Google Gemma  | 4096      | Acts as the fallback target for the default model. |
| balanced | `@cf/meta/llama-3.1-8b-instruct-fast`          | Llama 3.1 8B Fast   | Meta Llama 3  | 2048      | `DEFAULT_MODEL_ID` — low-latency baseline. |
| fast     | `@cf/meta/llama-3.2-3b-instruct`               | Llama 3.2 3B        | Meta Llama 3  | 2048      | Budget tier; ~95% protocol compliance in tests, occasional failures. |

### Fallback chain (`FALLBACK_MAP` in `models.ts`)

```
llama-3.1-8b-instruct-fast  ->  gemma-3-12b-it
gemma-3-12b-it              ->  llama-3.3-70b-instruct-fp8-fast
llama-3.3-70b-instruct-fp8-fast -> llama-3.1-8b-instruct-fast
```

Only these three models have fallbacks; other models fail closed (the primary error propagates to the client). Unknown model IDs are remapped to `DEFAULT_MODEL_ID` before the primary call — see below.

### Known quirks

- **maxTokens caps** — `generateText` takes `min(requested, model.maxTokens)`. The 8B-Fast and 3B models are capped at 2048; everything else at 4096. Callers that pass high values silently get clamped.
- **Response shape varies** — legacy CF returns `{ response: "text" }`; newer models (GPT-OSS family, Llama 4 Scout) use OpenAI-compatible `{ choices: [{ message: { content } }] }`. `callWorkersAi` handles both.
- **Reasoning field** — see "Reasoning-Model Handling" below. None of the seven currently-registered models are R1-style reasoners, but the handler is defensive for future adds.

---

## Decision Context — Why 15 → 7

Commit `2a9ac5f` (Apr 11 2026): re-ran the 3-scenario DM benchmark from the March baseline against all 15 registered models. Removed 8 that lost on speed, quality, or both:

| Removed                | Reason |
|------------------------|--------|
| DeepSeek R1 32B        | Reasoning model, 15s @ 74% quality |
| QwQ 32B Reasoning      | Reasoning model, 19s @ 74% quality |
| Qwen3 30B MoE          | 8s, no advantage over kept models |
| Mistral Small 3.1 24B  | 15s @ 100% (GPT-OSS 20B gets 100% in 2.8s) |
| Gemma 4 26B MoE        | 13s, hit a CF 502, no win over Gemma 3 12B |
| Granite 4.0 Micro      | 7s @ 95%, slower than GPT-OSS 20B |
| GLM 4.7 Flash          | 8s, Llama 3.1 8B Fast is 3x faster |
| Llama 3.2 1B           | 1.4s @ 90% but real failures, not edge cases |

Notable kept timings from April run: GPT-OSS 120B 3.7s, Llama 3.3 70B 7.2s (down from 17s in March), Llama 3.1 8B Fast 2.6s. The `FALLBACK_MAP` targets all survived the trim, so the chain was left untouched.

---

## Reasoning-Model Handling (commit `e454761`)

Some CF Workers AI models emit chain-of-thought into `choices[0].message.reasoning` and only populate `choices[0].message.content` once they finish thinking. If `max_tokens` runs out mid-reasoning, `content` comes back `null` while `reasoning` holds partial planning text. Discovered on `@cf/google/gemma-4-26b-a4b-it` — a 50-token smoke test 502'd; 1600 tokens succeeded.

**Handler in `cf-worker/src/services/ai.ts` (`callWorkersAi`):**

1. Prefer `choices[0].message.content` if present and non-empty.
2. Otherwise, if `choices[0].message.reasoning` is a non-empty string, return it as a **degraded fallback** and log a `console.warn` like:
   > `Model <id> returned null content with reasoning text; using reasoning as degraded fallback (likely max_tokens exhausted mid-thinking).`
3. If neither is usable, log the raw response and throw `AiServiceError("Unexpected Workers AI response format", 502)`.

**Operational signal:** seeing that warn in worker logs means a caller's `maxTokens` is too low for that model. Either bump `DEFAULT_MAX_TOKENS` (currently 500 in `ai.ts`) or have the caller pass a higher value — the reasoning text is not real DM narration.

**Unknown model IDs** (same commit): `generateText` no longer 400s when a client sends an ID that isn't in `MODEL_REGISTRY` (e.g. a user has a removed model cached in localStorage). It logs a warn and substitutes `DEFAULT_MODEL_ID`. Only if the default itself is missing from the registry does it throw (500, misconfiguration).

---

## Manual Testing Procedure

Adapted from the pre-trim testing guide (archived under `docs/archive/CF_AI_MANUAL_TESTING_GUIDE.md`). Cut test cases referencing removed models.

### Setup

- `cf-worker/` running locally: `nvm use 20 && npm run dev`
- Test harness: `scripts/test-cf-models-simple.mjs` (worker-proxy) — `TEST_MODELS` array should match the 7 IDs above.
- For local runs without a Supabase JWT, see "Local worker auth bypass" note at the bottom.

### Phase 1 — Automated protocol compliance

Run `scripts/test-cf-models-simple.mjs` against all 7. Scenarios: opening, interaction, movement, milestone, combat, town, skill_check, invalid_action. Acceptance: ≥90% average quality score for production-ready, ≥80% minimum.

### Phase 2 — Multi-turn consistency (10 turns)

**Test set (adapted):** GPT-OSS 20B (primary), Gemma 3 12B, Llama 3.1 8B Fast (baseline default). Optional: Llama 3.3 70B, Llama 4 Scout 17B.

**Scenario "The Cursed Village":** War-torn kingdom, grim intensity, level-5 party (Kael/Lyra/Bram), arriving at Ashwood. Ten turns covering arrival → elder dialogue → cemetery investigation → skeleton combat (3 skeletons, Kael rolls 16 hits for 8) → curse-breaking ritual (milestone) → departure.

Score 1-5 on: Consistency, Tone, Milestone Tracking (must emit `[COMPLETE_MILESTONE: text]`), Combat Handling, NPC Characterization. Target ≥20/25.

### Phase 3 — Comparative quality (4 scenarios, top 3 models)

Models: GPT-OSS 20B, Gemma 3 12B, Llama 3.1 8B Fast.

1. **Mysterious Artifact** — Lyra casts Detect Magic on a whispering orb. Score Creativity, Detail, Player Agency.
2. **Destroyed Bridge** — 50ft wide fast river, undead on far side. Score Problem-Solving, Realism, Player Agency.
3. **Nervous Innkeeper** — tavern keeper eyeing hooded figure. Score NPC Depth, Intrigue, Dialogue.
4. **Moral Dilemma** — captured undead soldier begs for mercy, offers secret entrance. Score Moral Complexity, Consequences, Player Agency.

Target ≥45/60. Use identical prompts across models.

### Phase 4 — Stress

- **4A Long context (20 turns):** dungeon crawl — note turn where quality degrades and whether model recalls turn-1 events at turn 20.
- **4B Invalid input:** nonsensical ("fireball at the moon"), impossible ("teleport to Lich King"), meta-breaking ("make next encounter easier"), contradictory ("attack dragon" while in town). Expect in-character redirection.
- **4C Rapid milestones:** three back-to-back completions — verify each emits the tag.
- **4D Character death:** Kael fails 3 death saves, Bram attempts revive. Expect rules-aware, emotionally weighted handling.

Target ≥4/5 average for production-ready.

### Success criteria (condensed)

| Gate              | Production-ready | Minimum |
|-------------------|------------------|---------|
| Phase 1 average   | ≥90%             | ≥80%    |
| Phase 2 total     | ≥20/25           | ≥16/25  |
| Phase 3 total     | ≥45/60           | ≥36/60  |
| Phase 4 average   | ≥4/5             | ≥3/5    |

### Local worker auth bypass (testing only)

`test-cf-models-simple.mjs` hits the local worker, which requires a Supabase JWT. To bypass: back up `cf-worker/.dev.vars`, comment out `SUPABASE_URL` and `OCTONION_SUPABASE_URL`, add `ALLOW_UNAUTHENTICATED_DEV=true`. `middleware/auth.ts` only honors the bypass when no JWKS URL is configured. **Restore `.dev.vars` after testing.**

The `CF_API_TOKEN` in `.dev.vars` is only used by the FLUX image route — text generation goes through the `env.AI` binding directly.

---

## Adding a New Model

Four files, none derived from the others — forgetting one leaves the model invisible, unservable, or untested:

1. `cf-worker/src/services/models.ts` — add to `MODEL_REGISTRY`. Set `maxTokens` to match the model's context window cap (most are 4096; some jump to 8192). Consider whether it belongs in `FALLBACK_MAP`.
2. `src/llm/llm_constants.js` — add to `AVAILABLE_MODELS['cf-workers']` so the UI picker shows it.
3. `scripts/test-cf-models.mjs` — add to `ALL_MODELS` (direct CF API test).
4. `scripts/test-cf-models-simple.mjs` — add to `TEST_MODELS` (worker-proxy test).

**If the model is a reasoner** (emits chain-of-thought into `message.reasoning`): verify `DEFAULT_MAX_TOKENS` in `ai.ts` is high enough, or have the caller pass a larger `maxTokens`. The fallback path will keep it from 502ing, but the resulting text is degraded.

**Validation:** run Phase 1 automated tests against just the new model; if it clears ≥80%, proceed to Phase 2/3 comparison against the incumbent in its tier. If it replaces a model currently in `FALLBACK_MAP`, update the map too.
