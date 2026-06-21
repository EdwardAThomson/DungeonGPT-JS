# Guest Mode Plan (Phase B) — local-first, AI-free guest play

Status: **planning, no code yet** (2026-06-21). Phase A (local hero roster + import-on-sign-in) is shipped; this is the next step.

## Goal
Let a logged-out visitor experience real gameplay before creating an account, with everything saved locally and a one-click sync when they sign up — to reduce signup friction and improve retention.

## Chosen approach — Option 3: AI-free guest play
Guests play the **fully-local** slice of the game (exploration, deterministic combat, progression) with their game state persisted on-device. The **AI Dungeon Master** (narration + free-text actions) is the **sign-in upsell**.

**Explicitly avoided** (per product direction):
- No anonymous accounts / no changes to the auth (Octonion/Supabase JWT) system.
- No open/unauthenticated AI endpoint → no anonymous Cloudflare-AI cost/abuse exposure.

This works because the AI endpoints (`/api/ai`, `/api/embed`) require auth, but the **mechanics don't depend on them** — the AI is a narration layer on top of locally-computed state.

## AI touchpoint map (what's local vs. what needs auth)
Fully **local** (no server AI) — the guest-playable surface:
- Ready-Made adventure setup: template data + procedural map (`generateMapData`). *(Freeform/AI-generate world is the only AI setup path — gated for guests.)*
- Map movement, position, biome/town visited tracking.
- Town entry, procedural town maps, buildings, NPCs (`townMapGenerator`, `npcGenerator` — seeded RNG).
- Encounters + **combat**: detection, resolution, damage, XP, loot — deterministic, templated narration, **zero LLM** (`encounterController.js` / `encounterResolver.js`).
- Items, leveling, and **mechanical** milestones (item/combat/location) — engine-detected (`milestoneEngine.js`).

Requires **`/api/ai`** (auth) — gated for guests:
- Adventure intro narration — `useGameInteraction.js:260` (blocking).
- Player free-text action → DM response — `useGameInteraction.js:418` (blocking; this is the core conversational DM, and where `[COMPLETE_MILESTONE]` narrative-milestone judging piggybacks).
- Movement/location prose — `Game.js:430` and post-encounter `Game.js:540` (cosmetic; already behind the `aiNarrativeEnabled` toggle).
- Conversation summarization — `useGameInteraction.js:276` (cosmetic).
- Freeform "✨ Generate with AI" world setup — `NewGame.js:164` (blocking; Ready-Made does not use it).

Requires **`/api/embed`** (auth) — RAG; cosmetic, already fails silently:
- Embed-and-store after AI messages and RAG query embedding — `ragEngine.js:29/58/124`. RAG *retrieval* reads local IndexedDB; only embedding generation hits the server.

## Guest playable surface (what a guest can do)
✅ Pick a **Ready-Made** adventure → select heroes → start a game → explore the map → enter towns/see NPCs → trigger and win **encounters/combat** (fully narrated locally) → loot, level up, complete **mechanical** milestones — all saved locally.

🔒 Gated behind sign-in: the **conversational AI DM** (free-text actions), AI movement/location prose, **narrative** milestones, AI world generation, AI intro, and RAG memory.

## What to build
1. **`localGameStore`** (IndexedDB) mirroring `conversationsApi` (list/get/save/delete by sessionId). IndexedDB (not localStorage) because game state is large (conversation, world_map, sub_maps/town caches). RAG already uses IndexedDB, so there's precedent.
2. **Route `conversationsApi` by auth** (same pattern as `heroesApi` in Phase A): signed-out → `localGameStore`, signed-in → CF Worker. Existing callers (`useGamePersistence`, `SavedConversations`, load flow) unchanged.
3. **Guest AI gating** — a single source of truth (e.g. `useAiAvailable()` / an `aiAvailable` flag = `isSignedIn`). When false:
   - Force `aiNarrativeEnabled` off (skip movement prose).
   - Skip the intro-narration and summarization calls.
   - Replace the **free-text action** input with a *"✨ Sign in to unlock the AI Dungeon Master"* affordance (the one blocking gap in the loop).
   - Skip RAG embed/query (already degrades gracefully).
   - Hide/disable the Freeform "Generate with AI" button for guests (Ready-Made + Custom still work).
4. **Local narration fallback (optional, recommended)** — instead of *nothing* on movement, show a simple templated description from the tile (`descriptionSeed`/biome/`buildMovementPrompt`) so AI-free play doesn't feel empty. No AI, purely local. *(Combat already has local templated narration.)*
5. **Un-gate routes** — remove `ProtectedRoute` from `/hero-selection`, `/game`, `/saved-conversations` (guest-aware empty states). Also fixes the Phase A rough edge where new-game → selection bounced guests to login.
6. **Sync on account creation** — `LocalGameSync` (mirrors the shipped `LocalHeroSync`): on sign-in, upload local games to Supabase via `conversationsApi`, then clear local. Hero IDs are client-provided and preserved by the backend (`db.ts:66`), so a synced game's `selected_heroes` references stay valid after `LocalHeroSync` imports the heroes. Order: import heroes first, then games.
7. **Conversion UX** — a persistent *"Playing as guest — sign in to unlock the AI Dungeon Master & save across devices"* banner, plus a natural prompt at a high-intent moment (e.g. when they hit the gated free-text action, or after a mechanical milestone).

## Open product question
Is a **mechanics-only** taste (explore + deterministic combat + progression, no conversational DM) compelling enough to drive sign-ups? Combat is the strongest showcase. The **local narration fallback** (#4) makes it feel less bare. If we decide the demo *must* include real AI, that reopens the **open rate-limited AI endpoint** path (out of scope here) — but it's a bigger, riskier build (cost/abuse controls).

## Suggested phasing within Phase B
- **B1:** `localGameStore` + `conversationsApi` auth-routing + un-gate routes + guest AI gating (free-text action → sign-in affordance, narration off). → guests can run the mechanical loop and it persists locally.
- **B2:** `LocalGameSync` (sync games on sign-in) + conversion banner/prompts.
- **B3 (optional):** local templated movement/location narration fallback for a richer guest feel.

## Risks & edge cases
- **Device-local**: IndexedDB is per-browser, not a backup — message it ("saved on this device").
- **Mid-game sign-in**: syncing the *active* session, not just saved ones — handle the in-progress game.
- **Quota**: IndexedDB is generous; long games fine. Old/abandoned guest games should be prunable.
- **Mechanical vs narrative milestones**: a guest can complete mechanical milestones but not narrative ones — a Ready-Made adventure with a narrative milestone can't be *finished* as a guest. Acceptable (it's a demo + an upsell hook), but worth surfacing in the UI.
- **RAG**: guest play builds no memory; on sign-in, `useRagSync` backfill will populate it from synced conversation history.

## Out of scope (future)
- Open/unauthenticated AI endpoint for full guest AI (needs rate limiting + Turnstile; revisit only if mechanics-only proves insufficient).
- Anonymous accounts / auth changes.
- Eventually retiring the Express dev server (its data role disappears once local-first is complete; see also the LLM backend strategy notes).
