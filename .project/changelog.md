# [Project Name] - Changelog

> **Document Location:** `.project/changelog.md`
>
> All notable changes to this project will be documented in this file.
> Format based on [Keep a Changelog](https://keepachangelog.com/).

---

## [Unreleased]

### Added
- **Phase 7: Pages & Components** -- All 16 tasks complete. Full frontend page and component port from CRA + JS + CSS to Vite 7 + TS + Tailwind/shadcn (7.1.1-7.4.3)
- **7.1 Core Pages**: HomePage, CharacterCreation (split into 5 sub-components), AllCharacters, GameSettings (with story templates and world settings grids), HeroSelection, SavedConversations. All using TanStack Router, Query, and Zustand stores.
- **7.2 Main Game Page**: GamePage shell, ChatPanel (react-markdown for AI content, no dangerouslySetInnerHTML), HeroSidebar (HP/XP bars), GameHeader. Game hooks: useGamePrompts, useAIResponse, useMilestones, useGameSession, useWorldMap, useTownMap.
- **7.3 Modals**: SettingsModal, HelpModal, MapModal, CharacterModal, GameModals orchestrator. Encounter system: EncounterModal (shell), CombatRound (4 sub-components), CombatResult (with PenaltiesDisplay), HeroSelection (initiative mechanic), encounter-types (shared types/helpers).
- **7.4 Map Displays & Misc**: WorldMapDisplay (biome colors, POI emojis, river/path SVG overlays, player marker), TownMapDisplay (building modals, NPC display, path/wall rendering). AiAssistantPanel (floating OOC rules assistant using backend AI generate). DiceRoller, DebugMenu/DebugPage. Debug sub-pages: EncounterDebugPage (probability testing, game flow simulation), LLMDebugPage (server connectivity, generation, parsing, summarization tests), TerrainStudioPage (placeholder -- depends on Three.js).
- New routes: `/debug/encounters`, `/debug/llm`, `/debug/terrain` with TanStack Router file-based routing.

- **Phase 8.1: Backend AI Service** -- Complete AI Gateway routing, model tiers, and AI routes (8.1.1-8.1.4)
- `backend/src/services/models.ts` -- Model tier definitions: Free (Llama 3.1 8B, Mistral Nemo 12B via Workers AI), Standard (Llama 3.3 70B, Qwen 2.5 72B via Workers AI), Premium (GPT-4o via OpenAI, Claude Sonnet via Anthropic, Gemini Pro via Google, all through AI Gateway). Model metadata (id, displayName, tier, provider, maxTokens), fallback chains per tier, helper functions (getModelById, getModelsByTier, getFallbackModelId). CLI providers intentionally not ported (Workers cannot spawn processes). (8.1.1)
- `backend/src/services/ai.ts` -- AI Gateway routing logic. Workers AI binding (env.AI.run()) for free/standard tier, AI Gateway proxy (fetch to gateway URL) for premium tier. DM_PROTOCOL system prompt ported exactly from src/data/prompts.js. SYSTEM_PROMPT ported from src/llm/llm_constants.js and llmBackend.js. Fallback chains: primary model failure triggers same-tier fallback. Streaming via Web Streams API (ReadableStream). Provider-specific request formatting for OpenAI (chat completions), Anthropic (messages), Google (generateContent). Response extraction with type-safe unknown narrowing (no `any`). Max prompt length enforcement (100K chars). AiServiceError with HTTP status codes. (8.1.2)
- `backend/src/routes/ai.ts` -- Hono route group: POST /api/ai/generate (validates with generateAiRequestSchema from @dungeongpt/shared, supports ?stream=true query param for SSE streaming, structured error responses with status codes), GET /api/ai/models (returns models grouped by tier with metadata). Mounted at /api/ai in index.ts. (8.1.3)
- Updated `backend/src/index.ts` to mount AI route group at /api/ai
- Updated `backend/wrangler.toml` with AI Gateway configuration comments and secret setup instructions
- BUILD CHECK passed: `pnpm --filter backend typecheck` clean, `pnpm --filter backend build` produces valid Worker (424 KiB / 81 KiB gzip), backend lint clean, Knip clean for backend (8.1.4)

- **Phase 5: Frontend Scaffold** -- Complete Vite 7 + React 19 + TanStack + Zustand scaffold (5.1.1-5.1.8)
- `frontend/vite.config.ts` -- Vite 7 config with React plugin, Tailwind v4 plugin (@tailwindcss/vite), TanStack Router Vite plugin for file-based route generation, path alias (@/ -> src/), dev proxy to backend Worker (localhost:8787) (5.1.1)
- `frontend/src/routes/` -- TanStack Router file-based routes: __root.tsx (root layout), index.tsx (/), characters/index.tsx (/characters), characters/create.tsx (/characters/create), game/settings.tsx (/game/settings), game/heroes.tsx (/game/heroes), game/play.tsx (/game/play), saves.tsx (/saves), debug/index.tsx (/debug). Placeholder components for Phase 7 (5.1.2)
- `frontend/src/routeTree.gen.ts` -- Auto-generated route tree from TanStack Router Vite plugin. Type-safe route tree with FileRoutesByFullPath, FileRoutesByTo, FileRoutesById interfaces (5.1.2)
- `frontend/src/api/query-client.ts` -- TanStack Query client with game-appropriate defaults: 5min staleTime, 30min gcTime, 2 retries, no refetch on window focus (5.1.3)
- `frontend/src/stores/game-store.ts` -- Zustand store for game session state: sessionId, hasAdventureStarted, conversation messages, currentSummary, selectedHeroes, playerPosition, worldMap, subMaps, isLoading, progressStatus, error, checkRequest, userInput, lastPrompt. State shape ported from useGameSession.js and useGameInteraction.js (5.1.5)
- `frontend/src/stores/ui-store.ts` -- Zustand store for UI state: modal visibility (settings, help, debug, character, map, encounter), sidebar visibility, activeCharacterId. Ported from SettingsContext.js and Game.js modal toggles (5.1.5)
- `frontend/src/stores/settings-store.ts` -- Zustand store with persist middleware for game settings: GameSettings (from @dungeongpt/shared), selectedProvider, selectedModel, assistantProvider, assistantModel. Persists model selection to localStorage. Ported from SettingsContext.js (5.1.5)
- `frontend/src/api/client.ts` -- Typed fetch wrapper with Zod response validation (apiFetch). TanStack Query hooks: useCharacters, useConversations, useConversation(id), useSaveConversation, useCreateCharacter, useDeleteCharacter, useDeleteConversation, useGenerateAI. Query key factory for cache management. ApiError class for typed error handling. All API responses validated with shared Zod schemas (5.1.6)
- `frontend/src/main.tsx` -- Provider stack wired: StrictMode > QueryClientProvider > ThemeProvider > RouterProvider. TanStack Router Register interface declared for type-safe navigation (5.1.7)
- BUILD CHECK passed: `pnpm ci:check` (lint + typecheck + knip + format + build) all clean. Frontend bundle: 304 KiB / 96 KiB gzip (5.1.8)

- **Phase 3: Backend Worker** -- Complete Hono + D1 + Drizzle backend (3.1.1-3.3.4)
- `backend/src/types.ts` -- Worker Env bindings type with D1, AI, and secret bindings (3.1.2)
- `backend/wrangler.toml` -- Cloudflare Workers config with D1 binding, AI binding, and dev/staging/production environments (3.1.3)
- `backend/src/db/schema.ts` -- Drizzle ORM table definitions for `characterstable` and `conversations`, matching server.js SQLite schema exactly (3.2.1)
- `backend/drizzle.config.ts` -- Drizzle-kit config for D1 SQLite dialect (3.2.2)
- `backend/migrations/0001_initial.sql` -- Initial D1 migration creating both tables with original column names and types (3.2.3)
- `backend/src/db/characters.ts` -- Character CRUD query functions (getAllCharacters, createCharacter, updateCharacter, deleteCharacter) using Drizzle ORM with JSON stats parsing (3.2.4)
- `backend/src/db/conversations.ts` -- Conversation query functions (getAllConversations, getConversationById, upsertConversation, updateConversationMessages, updateConversationName, deleteConversation). Upsert uses raw D1 ON CONFLICT SQL, ported exactly from server.js (3.2.5)
- `backend/src/middleware/validate.ts` -- Zod validation middleware for Hono using `validator("json", ...)`. Rejects with 400 and field-level error details on validation failure (3.3.1)
- `backend/src/middleware/errors.ts` -- Global error handler (onErrorHandler) and 404 handler (onNotFoundHandler). Structured JSON error logging server-side, generic messages to client (3.3.2)
- `backend/src/routes/characters.ts` -- Hono route group: GET /api/characters, POST /api/characters, PUT /api/characters/:id, DELETE /api/characters/:id. All inputs validated with shared Zod schemas. Ported from server.js lines 161-245 (3.3.3)
- `backend/src/routes/conversations.ts` -- Hono route group: GET /api/conversations, GET /api/conversations/:sessionId, POST /api/conversations, PUT /api/conversations/:sessionId, PUT /api/conversations/:sessionId/name, DELETE /api/conversations/:sessionId. All inputs validated with shared Zod schemas. Ported from server.js lines 272-473 (3.3.4)
- `backend/src/index.ts` -- Hono app entry point mounting character and conversation route groups, global error handlers, /health endpoint (3.1.1)
- BUILD CHECKS passed: `pnpm --filter backend build` produces valid Worker (402 KiB / 77 KiB gzip), `pnpm --filter backend typecheck` clean, `pnpm lint` clean for backend, `pnpm format` clean (3.1.4, 3.2.6)

### Changed
- Upgraded Vite from v6 to v7 in frontend/package.json (5.1.1)
- Updated `frontend/tsconfig.json` to include `vite/client` types for import.meta.env support (5.1.1)
- Updated `eslint.config.ts` to ignore generated `routeTree.gen.ts` file (5.1.2)
- Updated `knip.config.ts`: added scaffold entry points (api, stores, design-system, game, lib), workspace-level ignoreDependencies for Phase 7+ deps, eslint-config-react-app to root ignoreDeps, tailwindcss to frontend ignoreDeps (5.1.8)
- Removed `drizzle-zod` from backend dependencies (unused until Phase 8)
- Updated `knip.config.ts` to ignore `**/dist/**` build artifacts globally
- **Phase 2: Shared Schemas** — All Zod schemas and inferred TypeScript types for the shared package (2.1.1-2.1.6)
- `shared/src/schemas/character.ts` — Zod schema for Character with characterId, characterName, characterGender, profilePicture, characterRace, characterClass, characterLevel, characterBackground, characterAlignment, stats (Strength/Dexterity/Constitution/Intelligence/Wisdom/Charisma). Enum schemas for gender, race, class, alignment. Ported exactly from CharacterCreation.js data shape. (2.1.1)
- `shared/src/schemas/game-settings.ts` — Zod schema for GameSettings with shortDescription, grimnessLevel, darknessLevel, magicLevel, technologyLevel, responseVerbosity, campaignGoal, milestones (array of {text, location, mapX, mapY, id, completed}), worldSeed, templateName, campaignComplete. Enum schemas for all option sets. Ported from GameSettings.js and useGameInteraction.js. (2.1.3)
- `shared/src/schemas/conversation.ts` — Zod schema for Conversation matching server.js table: sessionId, conversation_data (message array), provider, model, timestamp, conversation_name, game_settings (nested GameSettings), selected_heroes (Character array), summary, world_map, player_position ({x,y}), sub_maps. ConversationListItem schema for list views. (2.1.2)
- `shared/src/schemas/api.ts` — Zod schemas for all API request/response bodies: CreateCharacterRequest, UpdateCharacterRequest, GetCharactersResponse, SaveConversationRequest, SaveConversationResponse, GetConversationsResponse, GetConversationResponse, UpdateConversationDataRequest, UpdateConversationNameRequest, GenerateAiRequest, GenerateAiResponse, MessageResponse, ErrorResponse. Ported from server.js endpoints. (2.1.4)
- `shared/src/index.ts` — Re-exports all schemas and inferred types from schema files. Single import point for both frontend and backend. (2.1.5)
- BUILD CHECK passed: `pnpm --filter @dungeongpt/shared typecheck`, `pnpm lint`, `pnpm format`, `pnpm --filter @dungeongpt/shared build` all clean. (2.1.6)
- pnpm workspace configuration (`pnpm-workspace.yaml`) with frontend, backend, shared packages (1.1.1)
- Base TypeScript configuration (`tsconfig.base.json`) with strict mode, noUncheckedIndexedAccess, exactOptionalPropertyTypes, noImplicitReturns, noFallthroughCasesInSwitch, noPropertyAccessFromIndexSignature (1.1.2)
- Backend package (`backend/package.json`, `backend/tsconfig.json`) with Hono, Drizzle ORM, Cloudflare Workers types, workspace dependency on @dungeongpt/shared (1.1.4)
- Shared package (`shared/package.json` as `@dungeongpt/shared`, `shared/tsconfig.json`) with Zod dependency, ESM exports config (1.1.5)
- Root workspace scripts: dev, build, lint, lint:fix, typecheck, knip, format, format:fix, ci:check (1.1.9)
- Placeholder entry points: `backend/src/index.ts` (Worker export), `shared/src/index.ts` (empty re-export)
- Frontend package (`frontend/package.json`, `frontend/tsconfig.json`) with React 19, TanStack Router/Query/Form/Virtual/Pacer, Tailwind v4, react-markdown, dompurify, zod, zustand, uuid, workspace dependency on @dungeongpt/shared (1.1.3)
- ESLint 9 flat config (`eslint.config.ts`) with all plugins: typescript-eslint (strict+stylistic), security, no-unsanitized, react, react-hooks, jsx-a11y, unicorn, sonarjs, import-x, regexp. All rules set to error. eslint-config-prettier disables conflicting rules. Frontend-only React/a11y rules via file glob patterns. (1.1.6)
- Prettier configuration (`.prettierrc`) with consistent formatting rules, `.prettierignore` excluding legacy CRA files (1.1.7)
- Knip configuration (`knip.config.ts`) for all three workspace packages (frontend, backend, shared) with entry points and project globs. Legacy root dependencies added to ignoreDependencies. (1.1.8)
- Static assets migrated to `frontend/public/` — 8 male character portraits, 8 female character portraits, `through_the_forest.webp`, `favicon.ico` (18 files total). CRA artifacts excluded. (1.1.10)
- Minimal frontend entry point (`frontend/src/main.tsx`) with React 19 createRoot placeholder
- Vite HTML entry point (`frontend/index.html`) with #root div and module script pointing to main.tsx

### Changed
- Root `package.json` renamed from `character-creation` to `dungeongpt`, added pnpm workspace scripts alongside legacy CRA config

---

## [0.3.0] - YYYY-MM-DD

### Added
- Feature Module A with core business logic
- Input validation for all user inputs
- Service layer architecture

### Changed
- Refactored data models for better type safety

### Fixed
- Build warnings in configuration module

---

## [0.2.0] - YYYY-MM-DD

### Added
- Project scaffolding and directory structure
- Build tooling configuration
- Linting and formatting setup
- Base configuration files
- Environment variable handling

### Changed
- Updated dependencies to latest stable versions

---

## [0.1.0] - YYYY-MM-DD

### Added
- Initial project setup
- `.project/` documentation structure
- Product Requirements Document (prd.md)
- Tech Stack documentation (tech-stack.md)
- Build Plan with task tracking (build-plan.md)
- This changelog

---

## Version Guidelines

### Version Format: `MAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes or significant milestones
- **MINOR**: New features, completed phases
- **PATCH**: Bug fixes, small improvements

### Change Types

| Type | Description |
|------|-------------|
| **Added** | New features or capabilities |
| **Changed** | Changes to existing functionality |
| **Deprecated** | Features marked for removal |
| **Removed** | Features that were removed |
| **Fixed** | Bug fixes |
| **Security** | Security-related changes |

---

## Milestones

| Version | Milestone | Date |
|---------|-----------|------|
| 1.0.0 | Production Release | TBD |
| 0.5.0 | Feature Complete | TBD |
| 0.3.0 | Core Features | YYYY-MM-DD |
| 0.1.0 | Project Setup | YYYY-MM-DD |

---

*Last updated: 2026-02-22*
