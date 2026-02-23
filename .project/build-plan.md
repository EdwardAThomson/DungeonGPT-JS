# DungeonGPT Build Plan

> **CRITICAL INSTRUCTIONS FOR ENGINEERS**
>
> ## Project Structure
> All project documentation lives in the `.project/` directory at the repository root:
> ```
> .project/
> ├── prd.md           # Product Requirements Document
> ├── tech-stack.md    # Technology choices and rationale
> ├── build-plan.md    # This file - task tracking
> └── changelog.md     # Version history and updates
> ```
>
> ## Build Discipline
> 1. **Keep this document up to date** — Mark tasks as completed immediately after finishing them
> 2. **Build after every task** — Run the build command after completing each task
> 3. **Zero tolerance for warnings/errors** — Fix any warnings or errors before moving to the next task
> 4. **Update changelog.md** — Log significant changes, fixes, and milestones
> 5. **Update this file** — Mark task status, update progress bars and counts after each completion
>
> ```bash
> # Build command (run after each task)
> pnpm ci:check   # lint + typecheck + knip + format + build
> ```
>
> If warnings or errors appear, fix them immediately. Do not proceed until the build is clean.
>
> ## Engineer Assignments
> Engineers are defined in `.claude/agents/`:
> - **🔵 backend-engineer** — Cloudflare Workers, Hono, D1, AI Gateway, middleware, security
> - **🟣 frontend-engineer** — React 19, Vite 7, TanStack, Tailwind, shadcn, Zustand, game UI
>
> Tasks are tagged with the responsible engineer. Where marked **⚡ PARALLEL**, both engineers can work simultaneously on independent tasks.
>
> ## Parallelization Strategy
> Phases marked with ⚡ have independent workstreams that can be executed by both engineers concurrently. Within a phase, tasks with the same engineer should be executed sequentially. Tasks across engineers within a ⚡ phase can run in parallel.

---

## Status Legend

| Icon | Status | Description |
|------|--------|-------------|
| ⬜ | Not Started | Task has not begun |
| 🔄 | In Progress | Currently being worked on |
| ✅ | Completed | Task finished |
| ⛔ | Blocked | Cannot proceed due to external dependency |
| ⚠️ | Has Blockers | Waiting on another task |
| 🔍 | In Review | Pending review/approval |
| 🚫 | Skipped | Intentionally not doing |
| ⏸️ | Deferred | Postponed to later phase/sprint |

---

## Project Progress Summary

```
Phase 1: Monorepo Scaffold        [████████████████████] 100%  ✅
Phase 2: Shared Schemas            [████████████████████] 100%  ✅
Phase 3: Backend Worker            [████████████████████] 100%  ✅
Phase 4: Design System             [████████████████████] 100%  ✅
Phase 5: Frontend Scaffold         [████████████████████] 100%  ✅
Phase 6: Game Engine Port          [████████████████████] 100%  ✅
Phase 7: Pages & Components        [████████████████████] 100%  ✅
Phase 8: AI Integration            [████████████████████] 100%  ✅
Phase 9: Security Hardening        [████████████████████] 100%  ✅
Phase 10: Deployment               [████████████████████] 100%  ✅
Phase 11: Gameplay Loop            [████████████████████] 100%  ✅
─────────────────────────────────────────────────────────────────
Overall Progress                   [████████████████████] 100%
```

| Phase | Tasks | Completed | Blocked | Deferred | Progress | Engineer |
|-------|-------|-----------|---------|----------|----------|----------|
| Phase 1: Monorepo Scaffold | 11 | 11 | 0 | 0 | 100% | 🔵🟣 |
| Phase 2: Shared Schemas | 6 | 6 | 0 | 0 | 100% | 🔵 |
| Phase 3: Backend Worker | 14 | 14 | 0 | 0 | 100% | 🔵 |
| Phase 4: Design System | 10 | 10 | 0 | 0 | 100% | 🟣 |
| Phase 5: Frontend Scaffold | 8 | 8 | 0 | 0 | 100% | 🟣 |
| Phase 6: Game Engine Port | 10 | 10 | 0 | 0 | 100% | 🟣 |
| Phase 7: Pages & Components | 16 | 16 | 0 | 0 | 100% | 🟣 |
| Phase 8: AI Integration | 11 | 11 | 0 | 0 | 100% | 🔵🟣 |
| Phase 9: Security Hardening | 8 | 8 | 0 | 0 | 100% | 🔵🟣 |
| Phase 10: Deployment | 6 | 6 | 0 | 0 | 100% | 🔵 |
| Phase 11: Gameplay Loop | 17 | 17 | 0 | 0 | 100% | 🟣 |
| **Total** | **114** | **114** | **0** | **0** | **100%** | |

---

## Phase 1: Monorepo Scaffold

> Both engineers collaborate on initial setup. Sequential — must complete before any other phase.

### 1.1 Repository & Workspace Setup

| Status | Task | Description | Engineer |
|--------|------|-------------|----------|
| ✅ | 1.1.1 | Initialize pnpm workspace — `pnpm-workspace.yaml` with `frontend`, `backend`, `shared` packages | 🔵 |
| ✅ | 1.1.2 | Create `tsconfig.base.json` — strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, no `any` ever | 🔵 |
| ✅ | 1.1.3 | Create `frontend/package.json`, `frontend/tsconfig.json` extending base | 🟣 |
| ✅ | 1.1.4 | Create `backend/package.json`, `backend/tsconfig.json` extending base | 🔵 |
| ✅ | 1.1.5 | Create `shared/package.json` as `@dungeongpt/shared`, `shared/tsconfig.json` extending base | 🔵 |
| ✅ | 1.1.6 | Configure ESLint 9 flat config — all plugins (security, no-unsanitized, react, react-hooks, jsx-a11y, unicorn, sonarjs, import-x, regexp, typescript-eslint). All rules set to error. Zero warnings. | 🟣 |
| ✅ | 1.1.7 | Configure Prettier + eslint-config-prettier integration | 🟣 |
| ✅ | 1.1.8 | Configure Knip — `knip.config.ts` for all three packages | 🟣 |
| ✅ | 1.1.9 | Root `package.json` scripts — `dev`, `build`, `lint`, `lint:fix`, `typecheck`, `knip`, `format`, `format:fix`, `ci:check` | 🔵 |
| ✅ | 1.1.10 | Migrate static assets — Copy character portraits (barbarian, bard, cleric, druid, fighter, paladin, ranger, wizard — male + female variants), `through_the_forest.webp`, and `favicon.ico` from `public/` to `frontend/public/`. Do NOT copy CRA artifacts (logo192, logo512, manifest.json, robots.txt, index.html). These are Edward's game assets — preserve every file exactly. | 🟣 |
| ✅ | 1.1.11 | **BUILD CHECK** — `pnpm ci:check` passes clean on empty scaffold | 🔵🟣 |

---

## Phase 2: Shared Schemas

> 🔵 **backend-engineer** owns this phase. Defines the Zod schemas that both frontend and backend depend on. Must complete before Phase 3 and Phase 5.

### 2.1 Zod Schema Definitions

| Status | Task | Description | Engineer |
|--------|------|-------------|----------|
| ✅ | 2.1.1 | Create `shared/src/schemas/character.ts` — Zod schema for Character (characterId, name, gender, profilePicture, race, class, level, background, alignment, stats object). Infer `Character` type. Port from current `CharacterCreation.js` data shape. | 🔵 |
| ✅ | 2.1.2 | Create `shared/src/schemas/conversation.ts` — Zod schema for Conversation (sessionId, conversation_data array, provider, model, timestamp, conversation_name, game_settings, selected_heroes, summary, world_map, player_position, sub_maps). Infer `Conversation` type. Port from current `server.js` table shape. | 🔵 |
| ✅ | 2.1.3 | Create `shared/src/schemas/game-settings.ts` — Zod schema for GameSettings (shortDescription, grimnessLevel, magicLevel, technologyLevel, campaignGoal, milestones array, worldSeed, verbosity). Infer `GameSettings` type. Port from current `SettingsContext.js`. | 🔵 |
| ✅ | 2.1.4 | Create `shared/src/schemas/api.ts` — Zod schemas for all API request/response bodies (CreateCharacterRequest, UpdateCharacterRequest, SaveConversationRequest, GenerateAIRequest, etc.). | 🔵 |
| ✅ | 2.1.5 | Create `shared/src/index.ts` — re-export all schemas and inferred types | 🔵 |
| ✅ | 2.1.6 | **BUILD CHECK** — `pnpm --filter @dungeongpt/shared typecheck` passes clean | 🔵 |

---

## Phase 3: Backend Worker ⚡

> 🔵 **backend-engineer** owns this phase. Can run in parallel with Phase 4 (frontend design system).

### 3.1 Worker Foundation

| Status | Task | Description | Engineer |
|--------|------|-------------|----------|
| ✅ | 3.1.1 | Initialize Hono app — `backend/src/index.ts` with Hono, mount route groups, export default worker | 🔵 |
| ✅ | 3.1.2 | Create `backend/src/types.ts` — Worker Env bindings type (D1 database, AI binding, secrets) | 🔵 |
| ✅ | 3.1.3 | Create `backend/wrangler.toml` — D1 binding, AI binding, environment config (dev/staging/prod) | 🔵 |
| ✅ | 3.1.4 | **BUILD CHECK** — `pnpm --filter backend build` produces valid Worker | 🔵 |

### 3.2 Database Layer

| Status | Task | Description | Engineer |
|--------|------|-------------|----------|
| ✅ | 3.2.1 | Create `backend/src/db/schema.ts` — Drizzle table definitions for `characters` and `conversations` matching shared Zod schemas | 🔵 |
| ✅ | 3.2.2 | Create `backend/drizzle.config.ts` — Drizzle config for D1 | 🔵 |
| ✅ | 3.2.3 | Generate initial D1 migration from Drizzle schema — `backend/migrations/0001_initial.sql` | 🔵 |
| ✅ | 3.2.4 | Create `backend/src/db/characters.ts` — Character query functions (getAll, getById, create, update, delete) using Drizzle. All queries parameterized. | 🔵 |
| ✅ | 3.2.5 | Create `backend/src/db/conversations.ts` — Conversation query functions (getAll, getById, upsert, updateMessages, updateName, delete) using Drizzle. Port upsert logic from current `server.js`. | 🔵 |
| ✅ | 3.2.6 | **BUILD CHECK** — `pnpm --filter backend typecheck` passes clean | 🔵 |

### 3.3 Middleware & Routes

| Status | Task | Description | Engineer |
|--------|------|-------------|----------|
| ✅ | 3.3.1 | Create `backend/src/middleware/validate.ts` — Zod validation middleware for Hono. Validate request body against shared schemas, reject with 400 on failure. | 🔵 |
| ✅ | 3.3.2 | Create `backend/src/middleware/errors.ts` — Global error handler. No stack traces leaked. Structured error responses. | 🔵 |
| ✅ | 3.3.3 | Create `backend/src/routes/characters.ts` — Hono route group: `GET /api/characters`, `POST /api/characters`, `PUT /api/characters/:id`, `DELETE /api/characters/:id`. Zod validation on all inputs. Port logic from current `server.js` lines 161-245. | 🔵 |
| ✅ | 3.3.4 | Create `backend/src/routes/conversations.ts` — Hono route group: `GET /api/conversations`, `GET /api/conversations/:sessionId`, `POST /api/conversations`, `PUT /api/conversations/:sessionId`, `PUT /api/conversations/:sessionId/name`, `DELETE /api/conversations/:sessionId`. Zod validation on all inputs. Port logic from current `server.js` lines 272-473. | 🔵 |

---

## Phase 4: Design System ⚡

> 🟣 **frontend-engineer** owns this phase. Can run in parallel with Phase 3 (backend worker).
>
> **CRITICAL: No visual changes.** Preserve Edward's exact colors, fonts (Cinzel, Lora, Inter), and light-fantasy/dark-fantasy themes. This phase is organization and componentization only.

### 4.1 Tailwind v4 Setup

| Status | Task | Description | Engineer |
|--------|------|-------------|----------|
| ✅ | 4.1.1 | Install Tailwind v4, configure in Vite 7. Create `frontend/src/design-system/theme/tailwind.css` with `@theme` directive mapping all existing CSS custom properties (--bg, --surface, --primary, --accent, --text, --text-secondary, --border, --shadow, --header-font, --body-font, --font-ui). Port from current `index.css` `:root` and `[data-theme]` blocks exactly. | 🟣 |
| ✅ | 4.1.2 | Create `frontend/src/design-system/tokens/colors.css` — Extract color variables from `index.css`. Both light-fantasy and dark-fantasy palettes. Exact values, no changes. | 🟣 |
| ✅ | 4.1.3 | Create `frontend/src/design-system/tokens/typography.css` — Font families (Cinzel, Lora, Inter), Google Fonts import, size scale, weights. Port from current `index.css`. | 🟣 |
| ✅ | 4.1.4 | Create `frontend/src/design-system/tokens/spacing.css` — Consistent spacing scale derived from current padding/margin values in `App.css`. | 🟣 |
| ✅ | 4.1.5 | Create `frontend/src/design-system/theme/theme-provider.tsx` — `data-theme` attribute switching between light-fantasy and dark-fantasy. Port logic from current `SettingsContext.js` theme handling. | 🟣 |

### 4.2 shadcn Components

| Status | Task | Description | Engineer |
|--------|------|-------------|----------|
| ✅ | 4.2.1 | Initialize shadcn — `frontend/components.json` config pointing to `src/design-system/ui/`. Install Radix dependencies. | 🟣 |
| ✅ | 4.2.2 | Add and restyle core shadcn components: `button.tsx`, `input.tsx`, `select.tsx`, `dialog.tsx`, `sheet.tsx`, `tabs.tsx`, `tooltip.tsx`, `toast.tsx` (Sonner), `form.tsx`, `command.tsx`. Restyle all with fantasy theme tokens — Cinzel headers, Lora body, existing color palette. Must match current visual aesthetic. | 🟣 |
| ✅ | 4.2.3 | Create game-specific design-system components: `hp-bar.tsx`, `xp-bar.tsx`, `stat-block.tsx`, `dice-result.tsx`, `message.tsx`. Port visual styling from current `App.css` game sections. Exact same appearance, now as reusable Tailwind+React components. | 🟣 |
| ✅ | 4.2.4 | Create layout components: `game-layout.tsx` (sidebar + main content + chat bar), `page-layout.tsx` (standard page wrapper with nav). Port layout structure from current `Game.js` and `App.js`. | 🟣 |
| ✅ | 4.2.5 | **BUILD CHECK** — Design system builds, all components render, no visual regressions from current styling | 🟣 |

---

## Phase 5: Frontend Scaffold ⚡

> 🟣 **frontend-engineer** owns this phase. Can run in parallel with remaining Phase 3 tasks if backend foundation is done.
>
> Depends on: Phase 2 (shared schemas), Phase 4 (design system)

### 5.1 Vite + React 19 + TanStack Setup

| Status | Task | Description | Engineer |
|--------|------|-------------|----------|
| ✅ | 5.1.1 | Initialize Vite 7 React 19 project in `frontend/`. Install React 19, Vite 7, `@vitejs/plugin-react`. Configure `vite.config.ts` with dev proxy to backend Worker. | 🟣 |
| ✅ | 5.1.2 | Install and configure TanStack Router — file-based routing, route tree generation. Create route files for: `/` (home), `/characters/create`, `/characters`, `/game/settings`, `/game/heroes`, `/game/play`, `/saves`, `/debug/*` | 🟣 |
| ✅ | 5.1.3 | Install and configure TanStack Query — `QueryClient`, `QueryClientProvider` in `main.tsx` | 🟣 |
| ✅ | 5.1.4 | Install TanStack Form, TanStack Virtual, TanStack Pacer | 🟣 |
| ✅ | 5.1.5 | Create Zustand stores — `frontend/src/stores/game-store.ts` (game session state: conversation, heroes, map position, encounter), `frontend/src/stores/ui-store.ts` (modals, sidebar, theme), `frontend/src/stores/settings-store.ts` (grimness, magic, model selection). Port state shapes from current `SettingsContext.js`, `CharacterContext.js`, `useGameSession.js`. | 🟣 |
| ✅ | 5.1.6 | Create API client module — `frontend/src/api/client.ts`. Typed fetch wrapper using shared Zod schemas for request/response validation. TanStack Query hooks: `useCharacters()`, `useConversations()`, `useConversation(id)`, `useSaveConversation()`, `useGenerateAI()`. | 🟣 |
| ✅ | 5.1.7 | Wire up `main.tsx` — QueryClientProvider, ThemeProvider, RouterProvider. Verify blank app loads with routing. | 🟣 |
| ✅ | 5.1.8 | **BUILD CHECK** — `pnpm --filter frontend build` produces clean bundle, `pnpm ci:check` passes | 🟣 |

---

## Phase 6: Game Engine Port ⚡

> 🟣 **frontend-engineer** owns this phase. Can run in parallel with Phase 3 backend work.
>
> Port all game mechanics from `src/utils/` to `frontend/src/game/` as TypeScript. These are pure functions — no React, no API calls, just game logic. Add types, keep behavior identical.

### 6.1 Core Game Systems

| Status | Task | Description | Engineer |
|--------|------|-------------|----------|
| ✅ | 6.1.1 | Port `healthSystem.js` (97 lines) → `frontend/src/game/health/index.ts`. Add types for HP calculation, damage, max HP. | 🟣 |
| ✅ | 6.1.2 | Port `progressionSystem.js` (152 lines) → `frontend/src/game/progression/index.ts`. Add types for XP thresholds, level-up, stat bonuses. | 🟣 |
| ✅ | 6.1.3 | Port `inventorySystem.js` (175 lines) → `frontend/src/game/inventory/index.ts`. Add types for items, equipment slots. | 🟣 |
| ✅ | 6.1.4 | Port `dice.js` (39 lines) + `rules.js` (34 lines) → `frontend/src/game/dice/index.ts` + `frontend/src/game/rules/index.ts`. Add types for roll results, modifiers. | 🟣 |
| ✅ | 6.1.5 | Port `encounterGenerator.js` (189 lines) + `encounterResolver.js` (221 lines) + `multiRoundEncounter.js` (154 lines) → `frontend/src/game/encounters/`. Split into `generator.ts`, `resolver.ts`, `combat.ts`. Add types for encounter templates, outcomes, combat rounds. | 🟣 |

### 6.2 Map & World Generation

| Status | Task | Description | Engineer |
|--------|------|-------------|----------|
| ✅ | 6.2.1 | Port `mapGenerator.js` (490 lines) → `frontend/src/game/maps/world-generator.ts`. Add types for tiles, biomes, POIs. | 🟣 |
| ✅ | 6.2.2 | Port `townMapGenerator.js` (612 lines) → `frontend/src/game/maps/town-generator.ts`. Add types for buildings, town layout. | 🟣 |
| ✅ | 6.2.3 | Port `townNameGenerator.js` (238 lines) + `nameData.js` (18 lines) → `frontend/src/game/maps/name-generator.ts`. | 🟣 |
| ✅ | 6.2.4 | Port `npcGenerator.js` (438 lines) + `pathfinding.js` (228 lines) → `frontend/src/game/npcs/generator.ts` + `frontend/src/game/npcs/pathfinding.ts`. | 🟣 |
| ✅ | 6.2.5 | **BUILD CHECK** — All game engine modules build with strict TypeScript, `pnpm ci:check` passes | 🟣 |

---

## Phase 7: Pages & Components ⚡

> 🟣 **frontend-engineer** owns this phase. The largest phase — port and refactor all React pages and components.
>
> Depends on: Phase 4 (design system), Phase 5 (frontend scaffold), Phase 6 (game engine)
>
> **Key refactoring rules:**
> - No component over 200 lines — extract sub-components
> - All `dangerouslySetInnerHTML` eliminated — use `react-markdown`
> - All forms use TanStack Form + Zod
> - All data fetching uses TanStack Query hooks
> - All client state via Zustand stores
> - All conversation rendering via TanStack Virtual
> - All styling via Tailwind + design-system components

### 7.1 Core Pages

| Status | Task | Description | Engineer |
|--------|------|-------------|----------|
| ✅ | 7.1.1 | Port `HomePage.js` (57 lines) → `frontend/src/pages/home/`. Convert to TS, TanStack Router, Tailwind. Small file, straightforward port. | 🟣 |
| ✅ | 7.1.2 | Port `CharacterCreation.js` (464 lines) → `frontend/src/pages/characters/create/`. Break into: `CreateCharacterPage.tsx` (shell), `StatAllocation.tsx`, `RaceClassSelect.tsx`, `BackgroundAlignment.tsx`, `PortraitSelect.tsx`, `CharacterPreview.tsx`. Use TanStack Form + Zod validation. Use shadcn Select, Input, Form components. | 🟣 |
| ✅ | 7.1.3 | Port `AllCharacters.js` → `frontend/src/pages/characters/list/`. Use TanStack Query for data fetching. Use design-system character card component. | 🟣 |
| ✅ | 7.1.4 | Port `GameSettings.js` (573 lines) → `frontend/src/pages/game/settings/`. Break into: `GameSettingsPage.tsx` (shell), `MoodSettings.tsx`, `WorldSettings.tsx`, `AISettings.tsx`, `MilestoneEditor.tsx`. Use TanStack Form + shadcn components. | 🟣 |
| ✅ | 7.1.5 | Port `HeroSelection.js` → `frontend/src/pages/game/heroes/`. Use TanStack Query for character list, Zustand for party selection state. | 🟣 |
| ✅ | 7.1.6 | Port `SavedConversations.js` (279 lines) → `frontend/src/pages/saves/`. Use TanStack Query for save list. Use shadcn Dialog for delete confirmation. | 🟣 |

### 7.2 Main Game Page (The Big One)

> `Game.js` is 1,132 lines. This is the most critical refactor.

| Status | Task | Description | Engineer |
|--------|------|-------------|----------|
| ✅ | 7.2.1 | Create `frontend/src/pages/game/play/GamePage.tsx` — thin shell that composes sub-components using `game-layout`. Wire up Zustand game store, TanStack Query for save/load. | 🟣 |
| ✅ | 7.2.2 | Create `ChatPanel.tsx` — conversation display using TanStack Virtual for message list. Render AI messages with `react-markdown` (NO dangerouslySetInnerHTML). User input form with TanStack Pacer debounce. Port from `Game.js` lines 560-600. | 🟣 |
| ✅ | 7.2.3 | Create `HeroSidebar.tsx` — party display with HP bars, XP bars, stats. Uses design-system `hp-bar`, `xp-bar`, `stat-block` components. Port from `Game.js` lines 650-750. | 🟣 |
| ✅ | 7.2.4 | Create `GameHeader.tsx` — session info, model display, save status, settings button. | 🟣 |
| ✅ | 7.2.5 | Port `useGameInteraction.js` (381 lines) → split into: `useGamePrompts.ts` (prompt construction), `useAIResponse.ts` (AI call + response parsing), `useMilestones.ts` (milestone tracking + completion). Each hook under 150 lines. | 🟣 |
| ✅ | 7.2.6 | Port `useGameSession.js` (81 lines) → `useGameSession.ts`. Convert to TanStack Query mutations for save/load. Zustand for session state. | 🟣 |
| ✅ | 7.2.7 | Port `useGameMap.js` (415 lines) → split into: `useWorldMap.ts` (world map state, exploration), `useTownMap.ts` (town generation, navigation). Each hook under 200 lines. | 🟣 |

### 7.3 Modals & Overlays

| Status | Task | Description | Engineer |
|--------|------|-------------|----------|
| ✅ | 7.3.1 | Port `Modals.js` (532 lines) — split into individual modal files using shadcn Dialog: `SettingsModal.tsx`, `HelpModal.tsx`, `DebugModal.tsx`. Each under 150 lines. | 🟣 |
| ✅ | 7.3.2 | Port `EncounterModal.js` (60 lines) + `EncounterActionModal.js` (707 lines) → `frontend/src/pages/game/components/encounter/`. Break into: `EncounterModal.tsx` (shell + shadcn Dialog), `CombatRound.tsx`, `HeroSelection.tsx`, `CombatResult.tsx`, `encounter-types.ts`. | 🟣 |
| ✅ | 7.3.3 | Port `CharacterModal.js` + `MapModal.js` + `BuildingModal.js` → individual modal components using shadcn Dialog. | 🟣 |

### 7.4 Map Displays & Misc

| Status | Task | Description | Engineer |
|--------|------|-------------|----------|
| ✅ | 7.4.1 | Port `WorldMapDisplay.js` (275 lines) + `TownMapDisplay.js` (330 lines) → `frontend/src/pages/game/components/`. Convert to TS + Tailwind. | 🟣 |
| ✅ | 7.4.2 | Port `AiAssistantPanel.js` (231 lines) + `DiceRoller.js` + `DebugMenu.js` → individual components. | 🟣 |
| ✅ | 7.4.3 | Port debug/test pages (`TerrainStudio`, `LLMDebug`, `EncounterDebug`) → `frontend/src/pages/debug/`. Group under `/debug` route. TerrainStudio is a placeholder (depends on Three.js). | 🟣 |

---

## Phase 8: AI Integration ⚡

> Both engineers work in parallel. Backend wires up AI Gateway + Workers AI. Frontend wires up the AI service calls.
>
> Depends on: Phase 3 (backend routes), Phase 7.2 (game page)

### 8.1 Backend AI Service

| Status | Task | Description | Engineer |
|--------|------|-------------|----------|
| ✅ | 8.1.1 | Create `backend/src/services/models.ts` — Model tier definitions (free: Llama 8B/Mistral Nemo, standard: Llama 70B/Qwen 72B, premium: GPT-5/Claude/Gemini). Model metadata (id, name, tier, provider). | 🔵 |
| ✅ | 8.1.2 | Create `backend/src/services/ai.ts` — AI Gateway routing logic. Workers AI for free/standard tier. AI Gateway proxy for premium tier (OpenAI, Anthropic, Google). Fallback chains. Streaming support via Web Streams API. | 🔵 |
| ✅ | 8.1.3 | Create `backend/src/routes/ai.ts` — Hono route group: `POST /api/ai/generate` (standard), `GET /api/ai/models` (available models by tier). Zod validation on prompt input. Max prompt length enforcement. | 🔵 |
| ✅ | 8.1.4 | **BUILD CHECK** — AI routes build, Workers AI binding configured in `wrangler.toml` | 🔵 |

### 8.2 Frontend AI Integration

| Status | Task | Description | Engineer |
|--------|------|-------------|----------|
| ✅ | 8.2.1 | AI generation mutation already in `frontend/src/api/client.ts` (`useGenerateAI`). Zod validates response via `generateAiResponseSchema` from shared. | 🟣 |
| ✅ | 8.2.2 | Prompts already ported to `use-game-prompts.ts`. DM_PROTOCOL moved to backend-only (`backend/src/services/ai.ts`). Frontend no longer wraps with protocol (fixed double-wrapping bug). | 🟣 |
| ✅ | 8.2.3 | Model selection in `settings-modal.tsx` — shows Workers AI models grouped by tier (fast/balanced/quality) with `<optgroup>`. Persists in Zustand settings store. Default model aligned to `@cf/meta/llama-3.1-8b-instruct-fast`. | 🟣 |
| ✅ | 8.2.4 | **BUILD CHECK** — End-to-end AI flow works: user input → prompt build → Workers AI → response → sanitized render. `pnpm ci:check` passes clean. | 🔵🟣 |

### 8.3 Legacy Cleanup Ports

| Status | Task | Description | Engineer |
|--------|------|-------------|----------|
| ✅ | 8.3.1 | Add `sanitizeResponse()` to `backend/src/services/ai.ts` — strip protocol markers (`[STRICT DUNGEON MASTER PROTOCOL]`, `[ADVENTURE START]`, `[GAME INFORMATION]`, `[TASK]`, `[CONTEXT]`, `[SUMMARY]`, `[PLAYER ACTION]`, `[NARRATE]`) from AI responses before returning. Apply to both `generateText` and streaming output. Ported from `src/services/llmService.js`. | 🔵 |
| ✅ | 8.3.2 | Port `src/utils/fileHelper.js` → `frontend/src/lib/download.ts`. Convert `downloadJSONFile()` to TypeScript with proper types. 12-line utility for save export. | 🟣 |
| ✅ | 8.3.3 | Port `src/pages/ConversationManager.js` → `frontend/src/pages/saves/conversation-manager-page.tsx` + route at `/saves/manage/$sessionId`. Convert to TS + Tailwind + TanStack Query/Router. Replace `dangerouslySetInnerHTML` + hand-rolled markdown with `react-markdown`. Add `useUpdateConversationMessages` mutation to `frontend/src/api/client.ts`. Add "Manage" button to SavedConversationsPage cards linking to this page. | 🟣 |

---

## Phase 9: Security Hardening ⚡

> Both engineers work in parallel on their respective layers.
>
> Depends on: Phase 7 (pages), Phase 8 (AI integration)

### 9.1 Backend Security

| Status | Task | Description | Engineer |
|--------|------|-------------|----------|
| ✅ | 9.1.1 | Add CORS middleware — explicit origin whitelist (production domain only), no wildcard | 🔵 |
| ✅ | 9.1.2 | Add security headers middleware — CSP, HSTS, X-Frame-Options: DENY, X-Content-Type-Options: nosniff on all responses | 🔵 |
| ✅ | 9.1.3 | Add payload size limits — reject request bodies over reasonable limit (1MB for conversation saves, 10KB for other endpoints) | 🔵 |
| ✅ | 9.1.4 | Audit all D1 queries — verify parameterized, verify JSON.parse wrapped in try-catch, verify no SQL concatenation | 🔵 |

### 9.2 Frontend Security

| Status | Task | Description | Engineer |
|--------|------|-------------|----------|
| ✅ | 9.2.1 | Verify zero `dangerouslySetInnerHTML` in codebase — ESLint no-unsanitized rule enforces this. All AI/user content rendered via react-markdown or text nodes. | 🟣 |
| ✅ | 9.2.2 | Add URL validation utility — validate all image `src` attributes (reject `javascript:`, allow only `https:` and approved `data:image` URIs). Apply to character profile pictures. | 🟣 |
| ✅ | 9.2.3 | Verify all API responses validated with Zod before use — no raw casts, no `as`, no trust | 🟣 |
| ✅ | 9.2.4 | **BUILD CHECK** — `pnpm ci:check` passes. Run ESLint security + no-unsanitized rules. Zero violations. | 🔵🟣 |

---

---

## Phase 10: Deployment

> 🔵 **backend-engineer** owns this phase. Final deployment configuration and push.

### 10.1 Production Config

| Status | Task | Description | Engineer |
|--------|------|-------------|----------|
| ✅ | 10.1.1 | Both `wrangler.toml` configured. Backend: D1 binding (`dungeongpt-db`), Workers AI binding, observability logging. Frontend: Workers Static Assets + Service Binding to backend. Account ID `<ACCOUNT_ID>`. No AI Gateway — Workers AI only. | 🔵 |
| 🚫 | 10.1.2 | SKIPPED — No external API keys needed. All AI runs on Workers AI (free, no keys). Clerk auth deferred to Phase 10. | 🔵 |
| ✅ | 10.1.3 | D1 migration `0001_initial.sql` applied to production database `<DATABASE_ID>` (ENAM region). Tables: `characterstable`, `conversations`. | 🔵 |
| ✅ | 10.1.4 | Backend Worker deployed to `https://dungeongpt-api.devteam-203.workers.dev`. Bindings: D1, Workers AI, ENVIRONMENT var. | 🔵 |
| ✅ | 10.1.5 | Frontend Worker deployed to `https://dungeongpt.devteam-203.workers.dev`. Workers Static Assets (NOT Pages). Service Binding proxies `/api/*` to backend. SPA fallback for client-side routing. | 🔵 |
| ✅ | 10.1.6 | **FINAL VERIFICATION** — Production app accessible ✅, game playable ✅ (narrative flow works), AI responds ✅, character creation ✅, world map ✅, save/load ✅. Live at `https://dungeongpt.devteam-203.workers.dev`. | 🔵🟣 |

---

## Phase 11: Gameplay Loop Integration

> 🟣 **frontend-engineer** owns this phase. All work is frontend-only — game state lives client-side in Zustand and persists via the existing save/load mechanism.
>
> Depends on: Phase 6 (game engine), Phase 7 (pages & components)
>
> The game engine was fully built in Phase 6 (`frontend/src/game/`) but disconnected from the gameplay loop. Players could only chat with the AI narrator — no map movement, no encounter triggers, no HP changes, no loot, no XP gain, no visible dice rolls. This phase wires the systems in.

### 11.1 Game Store Expansion (Foundation)

> Must complete before all other sub-phases.

| Status | Task | Description | Engineer |
|--------|------|-------------|----------|
| ✅ | 11.1.1 | Add `HeroMechanicalState` and `heroStates` to game store — Define interface with `currentHP`, `maxHP`, `xp`, `level`, `gold`, `inventory` (typed as `InventoryItem[]`). Add `heroStates: Record<string, HeroMechanicalState>` to `GameState`. Add actions: `initializeHeroStates(heroes)` (calls `initializeHP()` + `initializeProgression()` per hero), `updateHeroState(heroId, partial)`. | 🟣 |
| ✅ | 11.1.2 | Add encounter tracking fields to game store — Add `encounterHistory: EncounterHistoryEntry[]` (capped at 20), `movesSinceEncounter: number`, `activeEncounter: RolledEncounter | null`. Add actions: `addEncounterHistoryEntry`, `incrementMovesSinceEncounter`, `resetMovesSinceEncounter`, `setActiveEncounter`. | 🟣 |
| ✅ | 11.1.3 | Update save/load to persist new fields — Extend `useGameSession.saveGame()` to include `heroStates` and `encounterHistory` in payload (embedded in `subMaps`). Extend restore to hydrate them. Backward compatible: if missing from save, call `initializeHeroStates` from Character data. | 🟣 |

### 11.2 Interactive Map

> Depends on 11.1. Can run in parallel with 11.4 and 11.5.

| Status | Task | Description | Engineer |
|--------|------|-------------|----------|
| ✅ | 11.2.1 | Create `useMapMovement` hook — New hook at `frontend/src/hooks/use-map-movement.ts`. Validates adjacency (Manhattan distance = 1), blocks water tiles, updates `playerPosition`, marks tile `isExplored`, increments `movesSinceEncounter`. Exposes `canMoveTo(x, y)` for UI highlighting. | 🟣 |
| ✅ | 11.2.2 | Wire tile click handler in MapModal — Replace no-op in `map-modal.tsx` with `useMapMovement().moveToTile`. In `world-map-display.tsx`, highlight adjacent movable tiles with ring CSS. | 🟣 |
| ✅ | 11.2.3 | Add town entry/exit transitions — In `useMapMovement.moveToTile`, detect town tiles and set `subMaps.isInsideTown`. Add system messages: "The party arrives at {townName}" / "The party departs from {townName}". | 🟣 |
| ✅ | 11.2.4 | Add keyboard navigation — Arrow keys move the player when map modal is open. Reuse `moveToTile` from `useMapMovement`. | 🟣 |

### 11.3 Encounter Integration

> Depends on 11.1, 11.2. Sequential after map movement works.

| Status | Task | Description | Engineer |
|--------|------|-------------|----------|
| ✅ | 11.3.1 | Trigger encounters on movement — In `useMapMovement.moveToTile`, after position update, call `checkForEncounter()`. If encounter returned: `setActiveEncounter`, `resetMovesSinceEncounter`, `setEncounterModalOpen(true)`. | 🟣 |
| ✅ | 11.3.2 | Wire EncounterModal into GameModals — Add `EncounterModal` to `game-modals.tsx`. Read `activeEncounter` from game store, `isEncounterModalOpen` from ui-store. Pass `selectedHeroes` as party. | 🟣 |
| ✅ | 11.3.3 | Apply encounter resolution results to game store — `onResolve` handler: apply HP damage, award XP via `awardXP()`, add loot via `addItem()`/`addGold()`, apply penalties. Add encounter history entry. Surface dice rolls as system messages. Clear encounter state. | 🟣 |

### 11.4 AI Game State Context

> Depends on 11.1. Can run in parallel with 11.2 and 11.5.

| Status | Task | Description | Engineer |
|--------|------|-------------|----------|
| ✅ | 11.4.1 | Add party HP/inventory to AI prompts — In `use-game-prompts.ts`, add `[PARTY STATUS]` section with each hero's HP (via `getHPStatus()`), level, and notable inventory items (uncommon+ rarity). Include gold total. | 🟣 |
| ✅ | 11.4.2 | Add encounter history to AI prompts — Include last 3 encounters as `[RECENT ENCOUNTERS]` section: "{name} — {outcome} ({heroName})". Gives AI narrative continuity. | 🟣 |

### 11.5 Inventory UI

> Depends on 11.1. Can run in parallel with 11.2 and 11.4.

| Status | Task | Description | Engineer |
|--------|------|-------------|----------|
| ✅ | 11.5.1 | Create InventoryPanel component — New at `frontend/src/pages/game/components/inventory-panel.tsx`. Shows party inventory from `heroStates`. Items with name, quantity, rarity color, value. Gold display. shadcn Tabs for per-hero filtering. | 🟣 |
| ✅ | 11.5.2 | Add consumable item usage — "Use" button on heal consumables. On click: roll healing dice, apply via `applyHealing()`, remove item via `removeItem()`, update `heroStates`, add system message. | 🟣 |
| ✅ | 11.5.3 | Add inventory access to game UI — Add `isInventoryModalOpen` to ui-store. Add inventory button to GameHeader. Render in Dialog modal. Add to GameModals. | 🟣 |

### 11.6 Dice Roll Visibility

> 11.6.1 depends on 11.3.3. 11.6.2 is independent (can start after 11.1).

| Status | Task | Description | Engineer |
|--------|------|-------------|----------|
| ✅ | 11.6.1 | Surface encounter dice rolls as chat messages — In encounter `onResolve` handler, if result includes `rollResult`, add system message: "d20: {natural} + {modifier} = {total} — {outcomeTier}". Flag crits. | 🟣 |
| ✅ | 11.6.2 | Enable player-initiated skill checks — When `checkRequest` is detected (from AI `[CHECK: Skill]`), open DiceRoller modal pre-configured for that skill. Wire `onRollComplete` to add roll result as system message and clear `checkRequest`. | 🟣 |

---

## Parallelization Map

```
Phase 1: Scaffold ──────────────────────────────────────── (sequential, both engineers)
         │
Phase 2: Shared Schemas ────────────────────────────────── (🔵 backend)
         │
         ├──────────────────┬───────────────────────────┐
         │                  │                           │
Phase 3: Backend Worker   Phase 4: Design System    Phase 6: Game Engine Port
         (🔵 backend)       (🟣 frontend)              (🟣 frontend)
         │                  │                           │
         │                  ├───────────────────────────┘
         │                  │
         │              Phase 5: Frontend Scaffold
         │                  (🟣 frontend)
         │                  │
         │              Phase 7: Pages & Components
         │                  (🟣 frontend)
         │                  │
         ├──────────────────┘
         │
Phase 8: AI Integration ──────────────────────────────── (⚡ both in parallel)
         │
Phase 9: Security Hardening ──────────────────────────── (⚡ both in parallel)
         │
Phase 10: Deployment ─────────────────────────────────── (🔵 backend)
         │
Phase 11: Gameplay Loop ──────────────────────────────── (🟣 frontend)
    11.1 (Store) ── sequential: 1→2→3
         │
         ├────────────────┬──────────────────┐
         │                │                  │
    11.2 (Map)       11.4 (AI Context)  11.5 (Inventory)
         │           [parallel]          [parallel]
    11.3 (Encounters)
         │
    11.6 (Dice Visibility)
```

**Maximum parallelism window: Phases 3 + 4 + 6**
- 🔵 backend-engineer: Phase 3 (backend Worker — D1, routes, middleware)
- 🟣 frontend-engineer: Phase 4 (design system) → Phase 6 (game engine port)
- These three phases have zero dependencies on each other and can run fully concurrent.

**Phase 11 internal parallelism**: After 11.1 (store), sub-phases 11.2, 11.4, and 11.5 run concurrently. 11.3 follows 11.2, then 11.6 follows 11.3.

---

## Changelog Reference

See `.project/changelog.md` for detailed version history.

---

## Notes & Decisions

### Architecture Decisions
- All-Cloudflare infrastructure (Workers, D1, Workers AI) — no AI Gateway, no external API keys
- pnpm monorepo with `frontend/`, `backend/`, `shared/`
- Frontend served via Workers Static Assets with Service Binding to backend (no CORS)
- Clerk for auth (future — not in current plan)
- TanStack ecosystem (Router, Query, Form, Virtual, Pacer)
- Zustand for client state, TanStack Query for server state
- Tailwind v4 + shadcn/ui for design system
- Zod schemas in shared — single source of truth, both sides validate at runtime
- No visual changes to existing design — preserve colors, fonts, themes exactly
- DM_PROTOCOL is backend-only — frontend sends raw prompts, backend wraps with protocol

### Known Issues
- CLI runners (codex, claude, gemini) will not be ported — Workers can't spawn processes
- Encounter marker system (`[COMPLETE_MILESTONE]`) is fragile — keeping as-is for now, improving later
- ~~**Game systems are orphaned**~~ — **Resolved in Phase 11.** Encounters, health, inventory, XP/progression, dice are now fully wired into the gameplay loop. Map movement triggers encounters, encounter resolution applies HP/XP/loot, inventory UI allows consumable usage, dice rolls surface in chat.
- Images converted from PNG → WebP (87% size reduction, 15MB → 2MB)
- Global button CSS in `spacing.css` was overriding Tailwind utility classes — removed
- `game-settings-page.tsx` was not storing `worldMap` in Zustand before navigating — fixed
- `map-modal.tsx` and `game-settings-page.tsx` had placeholder text instead of actual `WorldMapDisplay` component — fixed
- `createCharacterResponseSchema` was missing from shared package — added

### Files Removed
- `react-scripts` (CRA) — replaced by Vite 7
- `styled-components` — was in package.json but never used
- `@anthropic-ai/sdk`, `@google/generative-ai`, `openai` — replaced by Workers AI (no AI Gateway)
- `cors`, `dotenv`, `express`, `sqlite3`, `sequelize`, `pg` — replaced by Workers + Hono + D1
- `web-vitals` — CRA artifact
- `App.css` (3,346 lines) — replaced by Tailwind + design-system
- `frontend/src/data/prompts.ts` — DM_PROTOCOL moved to backend-only
- ~600 lines of dead AI Gateway code removed from `backend/src/services/ai.ts`
- Root `/public/` directory (old CRA assets) — deleted, assets live in `frontend/public/` as WebP

### Deployment Info
- **Account**: `<ACCOUNT_ID>`
- **Backend**: `https://dungeongpt-api.devteam-203.workers.dev` (Worker: `dungeongpt-api`)
- **Frontend**: `https://dungeongpt.devteam-203.workers.dev` (Worker: `dungeongpt`)
- **D1 Database**: `dungeongpt-db` (`<DATABASE_ID>`, ENAM)
- **Architecture**: Frontend Worker serves static assets + proxies `/api/*` to backend via Service Binding (no CORS needed)

---

*Last updated: 2026-02-22*
*Current Phase: All phases COMPLETE — Gameplay loop integration complete*
*All Phases: 100% — Build plan fully executed (114 tasks)*
*Security Report: `.project/security-report.md` — 0 open findings, all remediation items resolved*

### Future (Not Planned)
- Auth (Clerk) — JWT verification, user scoping, sign-in/sign-up UI
- Testing & QA — Vitest, integration tests, manual QA
