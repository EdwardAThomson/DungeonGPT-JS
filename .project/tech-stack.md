# DungeonGPT - Tech Stack

> **Document Location:** `.project/tech-stack.md`
>
> This document outlines the technology choices and rationale for the project.
> All technology decisions should be documented here with reasoning.

---

## Stack Overview

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│  React 19 + Vite 7 + TanStack + Styled Comp.   │
├─────────────────────────────────────────────────┤
│                    Backend                       │
│  Cloudflare Workers + Hono + TypeScript         │
├─────────────────────────────────────────────────┤
│                   Data Layer                     │
│  Cloudflare D1 (SQLite) + Drizzle ORM          │
├─────────────────────────────────────────────────┤
│                  AI Layer                        │
│  Cloudflare AI Gateway + Workers AI             │
├─────────────────────────────────────────────────┤
│               Validation Layer                   │
│  Zod (shared schemas — single source of truth)  │
├─────────────────────────────────────────────────┤
│                Infrastructure                    │
│  Cloudflare Workers (all-in-one) + pnpm monorepo│
└─────────────────────────────────────────────────┘
```

---

## Core Technologies

### Language & Runtime

| Technology | Version | Purpose |
|------------|---------|---------|
| TypeScript | 5.x (latest) | Primary language — strict mode, all code |
| Cloudflare Workers | V8 Isolates | Edge runtime — no Node.js APIs |

**Rationale:**
- TypeScript for type safety across the full stack — Zod schemas in `shared/` are the single source of truth for all data shapes
- Workers runtime is V8-based (Web Standards APIs: fetch, Request, Response, crypto.subtle, ReadableStream)
- Original codebase is 16,403 lines of JavaScript — converting to TypeScript adds safety without changing logic
- No Node.js APIs available: no `fs`, `child_process`, `process.env`, `Buffer` — use Web APIs and Cloudflare bindings instead

**TypeScript Strictness (non-negotiable):**
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "forceConsistentCasingInFileNames": true
  }
}
```
- No `any` — ever, for any reason, no exceptions
- No `@ts-ignore` or `@ts-expect-error` without a linked issue
- All function signatures explicitly typed
- All API boundaries validated with Zod at runtime

---

### Validation — Zod

| Technology | Version | Purpose |
|------------|---------|---------|
| Zod | 3.x (latest) | Runtime validation, schema definition, type inference |
| drizzle-zod | latest | Generate Zod schemas from Drizzle table definitions |

**Rationale:**
- Zod schemas are the single source of truth for all data shapes
- `z.infer<typeof schema>` derives TypeScript types — no hand-written types that drift
- Both frontend and backend validate at runtime — defense in depth
- Backend validates all incoming requests before touching D1
- Frontend validates all API responses before using data, all form input before sending
- drizzle-zod generates Zod schemas from Drizzle table definitions — DB schema drives validation

**Validation Policy:**
- Every API request body validated with Zod before processing
- Every API response validated with Zod before consuming on frontend
- Every form input validated with Zod before submission
- Every localStorage read validated with Zod before use
- Every LLM response parsed and validated before rendering
- No raw casts, no `as`, no trust — validate or reject

---

### Frontend Framework

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.x (latest) | UI framework |
| Vite | 7.x (latest) | Build tool, dev server, HMR |
| Tailwind CSS | 4.x (latest) | Utility-first styling — no PostCSS needed in v4 |
| shadcn/ui | latest | Accessible UI primitives (Radix-based, copy-paste, Tailwind-styled) |

**Rationale:**
- React 19: Upgrade from 18 — new hooks (`use`, `useFormStatus`, `useOptimistic`), Actions, improved performance
- Vite 7 replaces Create React App (deprecated) — faster builds, modern ESM, better DX
- Tailwind v4 replaces the 3,346-line monolithic App.css — utility classes, no PostCSS config, native CSS `@theme` directive
- Styled Components removed — was in package.json but never imported or used anywhere in the codebase
- shadcn/ui provides accessible component primitives (Dialog, Select, Form, Toast, Sheet, Tabs) built on Radix UI. Copied into project, restyled with existing fantasy design tokens. Behavior + accessibility for free.

**IMPORTANT — No visual changes:**
- All existing colors, fonts (Cinzel, Lora, Inter), and theme tokens preserved exactly
- Light-fantasy and dark-fantasy themes preserved exactly via CSS custom properties
- shadcn components restyled to match existing fantasy aesthetic — not default SaaS look
- The game must look identical after migration

### TanStack Ecosystem

| Technology | Version | Purpose |
|------------|---------|---------|
| @tanstack/react-router | latest | Type-safe routing with Zod search params, file-based routes, loaders |
| @tanstack/react-query | latest | Data fetching, caching, mutations, loading/error states |
| @tanstack/react-form | latest | Type-safe form handling with Zod validation |
| @tanstack/react-virtual | latest | Virtualized lists for conversation history |
| @tanstack/pacer | latest | Debouncing, throttling, rate limiting utilities |

**Rationale:**
- TanStack Router replaces React Router v6 — type-safe routes, Zod-validated search params, file-based routing, route loaders. Game is expanding, this scales better.
- TanStack Query replaces manual fetch + useState — caching, deduplication, background refetch, optimistic updates, retry logic. Cleans up every data fetching hook.
- TanStack Form replaces manual form state — character creation has complex forms (stats, race, class, alignment). Built-in Zod validation, type-safe field state.
- TanStack Virtual — conversation history gets long. Virtualized message list keeps rendering smooth at 60fps.
- TanStack Pacer — debounced user input, throttled auto-save. Purpose-built, replaces hand-rolled setTimeout wrappers.
- One ecosystem — consistent APIs, type-safe, all designed to work together.

**Deferred TanStack packages:**
- TanStack Table — saved games list, character roster. Add when sorting/filtering/pagination needed.
- TanStack Hotkeys — keyboard shortcuts for game actions. Currently alpha, add when stable.

---

### Backend Framework

| Technology | Version | Purpose |
|------------|---------|---------|
| Hono | 4.x (latest) | HTTP framework for Workers |
| Wrangler | 4.x (latest) | Cloudflare dev/deploy CLI |

**Rationale:**
- Hono is lightweight, built for Workers, TypeScript-first with middleware composition
- Replaces Express — Express relies on Node.js APIs not available in Workers runtime
- Hono middleware pattern maps cleanly to existing Express route structure
- Wrangler provides local dev (`wrangler dev`), D1 bindings, secrets management, deployment

---

### Database

| Technology | Version | Purpose |
|------------|---------|---------|
| Cloudflare D1 | - | Primary data store (SQLite at edge) |
| Drizzle ORM | latest | Type-safe query builder, migrations |

**Rationale:**
- D1 is SQLite at the edge — existing SQLite queries port with minimal changes
- Same SQL dialect means existing parameterized queries work as-is
- Two tables (characters, conversations) with JSON columns — simple schema, no need for Postgres
- Drizzle ORM provides type-safe queries, schema definition in TypeScript, and migration tooling
- Drizzle is lightweight (~30KB) and Workers-compatible, unlike Prisma or Sequelize
- D1 supports batch API for multi-statement transactions
- drizzle-zod bridges Drizzle table definitions to Zod schemas — single source of truth from DB to validation

**Schema Location:** `backend/src/db/schema.ts` (Drizzle schema definition)

---

### Authentication (Deferred — Final Build Phase)

| Technology | Version | Purpose |
|------------|---------|---------|
| Clerk | latest | User authentication and session management |
| @clerk/clerk-react | latest | React SDK — sign-in/up components, hooks |

**Rationale:**
- Drop-in React components for auth UI (SignIn, SignUp, UserButton)
- JWT verification on Workers is lightweight (crypto.subtle)
- Handles social login, email/password, magic links, session refresh, multi-device
- Free tier: 10,000 MAU — sufficient for launch
- Alternative considered: Cloudflare Access — too enterprise-focused, no consumer sign-up flow
- Deferred to final build phase — all other features work without auth, add user isolation last

---

### AI / LLM

| Technology | Version | Purpose |
|------------|---------|---------|
| Cloudflare AI Gateway | - | LLM request proxy, caching, rate limiting, analytics |
| Cloudflare Workers AI | - | Run open source models on-edge (free/cheap tier) |

**Rationale:**
- AI Gateway replaces direct SDK calls to OpenAI/Anthropic/Google — single proxy with built-in cost controls
- Workers AI runs open source models (Llama 3.x, Mistral, Qwen) directly on Cloudflare — no external API costs for free tier
- AI Gateway caching: identical prompts return cached responses, reducing LLM calls on common game scenarios
- Rate limiting per-user via AI Gateway prevents abuse and cost overruns
- Fallback chains: primary model → fallback model → graceful error
- Round-robin across models for cost optimization
- Replaces: OpenAI SDK, Anthropic SDK, Google Generative AI SDK, CLI runners (codex, claude, gemini)
- The game's AI usage is pure narration (no reasoning) — small models (8B-70B) are sufficient

**Model Strategy:**

| Tier | Models | Use Case |
|------|--------|----------|
| Free | Llama 3.1 8B, Mistral Nemo 12B | Fast narration, budget-friendly |
| Standard | Llama 3.3 70B, Qwen 2.5 72B | Higher quality narration |
| Premium | GPT-5, Claude Sonnet, Gemini Pro (via AI Gateway) | Best narrative quality |

---

## Monorepo Structure

### Package Manager

| Technology | Version | Purpose |
|------------|---------|---------|
| pnpm | 9.x (latest) | Package manager with workspace support |

**Rationale:**
- Strict dependency resolution — no phantom deps (critical for Workers limited runtime)
- Fastest installs via content-addressable storage
- Native workspace support for monorepo
- `workspace:*` protocol for linking local packages

### Directory Layout

```
dungeongpt/
├── frontend/                    # React 19 + Vite (Cloudflare Worker)
│   ├── src/
│   │   ├── pages/               # Route-level page components
│   │   ├── components/          # Reusable UI components
│   │   ├── hooks/               # Custom React hooks
│   │   ├── stores/              # Zustand stores (game session, UI, settings)
│   │   ├── design-system/       # All styling and UI primitives
│   │   │   ├── tokens/          # CSS custom properties (preserved from original)
│   │   │   │   ├── colors.css   # --bg, --surface, --primary, --accent, etc.
│   │   │   │   ├── typography.css # Cinzel, Lora, Inter font config
│   │   │   │   └── spacing.css  # Consistent spacing scale
│   │   │   ├── ui/              # shadcn components (restyled to fantasy theme)
│   │   │   │   ├── dialog.tsx
│   │   │   │   ├── select.tsx
│   │   │   │   ├── button.tsx
│   │   │   │   ├── input.tsx
│   │   │   │   ├── form.tsx
│   │   │   │   ├── toast.tsx
│   │   │   │   ├── sheet.tsx
│   │   │   │   ├── tabs.tsx
│   │   │   │   ├── tooltip.tsx
│   │   │   │   └── command.tsx
│   │   │   ├── game/            # Game-specific compound components
│   │   │   │   ├── hp-bar.tsx
│   │   │   │   ├── xp-bar.tsx
│   │   │   │   ├── stat-block.tsx
│   │   │   │   ├── dice-result.tsx
│   │   │   │   └── message.tsx
│   │   │   ├── layouts/
│   │   │   │   ├── game-layout.tsx
│   │   │   │   └── page-layout.tsx
│   │   │   └── theme/
│   │   │       ├── tailwind.css  # Tailwind v4 @theme + directives
│   │   │       └── theme-provider.tsx  # data-theme switching
│   │   ├── game/                # Game engine (pure client-side logic)
│   │   │   ├── encounters/      # Encounter generation, resolution
│   │   │   ├── combat/          # Multi-round combat system
│   │   │   ├── progression/     # XP, leveling, stat bonuses
│   │   │   ├── health/          # HP calculation, damage
│   │   │   ├── inventory/       # Item management
│   │   │   ├── dice/            # Dice rolling mechanics
│   │   │   ├── maps/            # World/town map generation
│   │   │   ├── npcs/            # NPC generation
│   │   │   └── rules/           # D&D 5e rule calculations
│   │   └── main.tsx             # Vite entry point
│   ├── public/                  # Static assets (portraits, images)
│   ├── package.json
│   ├── vite.config.ts
│   ├── components.json          # shadcn config
│   └── tsconfig.json
├── backend/                     # Cloudflare Worker (Hono API)
│   ├── src/
│   │   ├── routes/              # Hono route modules
│   │   │   ├── characters.ts    # /api/characters CRUD
│   │   │   ├── conversations.ts # /api/conversations CRUD
│   │   │   └── ai.ts            # /api/ai/generate, model routing
│   │   ├── middleware/          # Composable middleware
│   │   │   ├── auth.ts          # Clerk JWT verification (deferred)
│   │   │   ├── validate.ts      # Zod request validation
│   │   │   └── errors.ts        # Global error handler
│   │   ├── services/            # Business logic
│   │   │   ├── ai.ts            # AI Gateway + Workers AI routing
│   │   │   └── models.ts        # Model tier config, selection
│   │   ├── db/                  # Data access
│   │   │   ├── schema.ts        # Drizzle table definitions
│   │   │   ├── characters.ts    # Character query functions
│   │   │   └── conversations.ts # Conversation query functions
│   │   ├── types.ts             # Worker Env bindings type
│   │   └── index.ts             # Hono app entry, mount routes
│   ├── migrations/              # D1 migration SQL files
│   ├── package.json
│   ├── wrangler.toml
│   ├── drizzle.config.ts
│   └── tsconfig.json
├── shared/                      # Zod schemas and inferred types ONLY
│   ├── src/
│   │   ├── schemas/
│   │   │   ├── character.ts     # Character Zod schema + inferred type
│   │   │   ├── conversation.ts  # Conversation Zod schema + inferred type
│   │   │   ├── game-settings.ts # Game settings Zod schema + inferred type
│   │   │   └── api.ts           # API request/response Zod schemas
│   │   └── index.ts             # Re-exports
│   ├── package.json
│   └── tsconfig.json
├── .project/                    # Project documentation
│   ├── prd.md
│   ├── tech-stack.md
│   ├── build-plan.md
│   └── changelog.md
├── .claude/                     # Claude Code config
│   └── agents/
├── package.json                 # pnpm workspace root
├── pnpm-workspace.yaml          # Workspace package list
├── tsconfig.base.json           # Shared TypeScript config
├── eslint.config.ts             # Shared ESLint config (all packages)
├── .prettierrc                  # Prettier config
├── knip.config.ts               # Knip dead code config
└── .env.example                 # Environment variable template
```

### Workspace Configuration

**pnpm-workspace.yaml:**
```yaml
packages:
  - frontend
  - backend
  - shared
```

**Package References:**
- `frontend/package.json` → `"@dungeongpt/shared": "workspace:*"`
- `backend/package.json` → `"@dungeongpt/shared": "workspace:*"`
- `shared` is bundled into each Worker at build time — never deployed on its own

---

## Linting & Code Quality

### Zero Tolerance Policy
All rules set to **error**. No warnings. CI blocks on any violation. No exceptions.

### ESLint 9 (Flat Config)

| Plugin | Purpose |
|--------|---------|
| `@typescript-eslint/eslint-plugin` | Strict TypeScript rules — no `any`, explicit return types, no non-null assertions |
| `eslint-plugin-security` | Detect eval, innerHTML, non-literal regex, timing attacks, unsafe patterns |
| `eslint-plugin-no-unsanitized` | Block `dangerouslySetInnerHTML`, `innerHTML`, DOM injection patterns |
| `eslint-plugin-react` | React best practices, JSX rules |
| `eslint-plugin-react-hooks` | Exhaustive deps, rules of hooks |
| `eslint-plugin-jsx-a11y` | Accessibility — alt text, ARIA, keyboard navigation, roles |
| `eslint-plugin-unicorn` | Modern syntax enforcement, performance best practices |
| `eslint-plugin-sonarjs` | Cognitive complexity limits, duplicate code detection |
| `eslint-plugin-import-x` | Import ordering, no circular dependencies, no unresolved imports |
| `eslint-plugin-regexp` | Regex performance and correctness |

### Formatting

| Tool | Purpose |
|------|---------|
| Prettier | Consistent code formatting — integrated with ESLint via eslint-config-prettier |

### Dead Code & Housekeeping

| Tool | Purpose |
|------|---------|
| Knip | Detect unused files, unused exports, unused dependencies, unlisted dependencies |

**Knip runs on every CI build.** Zero unused exports, zero unused deps, zero dead files.

### Build Commands

```bash
# Development
pnpm dev                    # Run frontend + backend concurrently
pnpm --filter frontend dev  # Frontend only (Vite)
pnpm --filter backend dev   # Backend only (wrangler dev)

# Production build
pnpm build                  # Build all packages
pnpm --filter frontend build
pnpm --filter backend build

# Deploy
pnpm --filter backend deploy  # Deploy Worker to Cloudflare

# Database
pnpm --filter backend db:generate   # Generate migration from schema changes
pnpm --filter backend db:migrate    # Apply migrations to D1

# Code quality (all set to error, zero tolerance)
pnpm lint                   # ESLint across all packages
pnpm lint:fix               # Auto-fix what's fixable
pnpm typecheck              # TypeScript strict checking across all packages
pnpm knip                   # Dead code detection
pnpm format                 # Prettier check
pnpm format:fix             # Prettier write

# Full CI check (must pass before merge)
pnpm ci:check               # lint + typecheck + knip + format + build
```

---

## Dependencies

### Frontend (`frontend/package.json`) — Production

| Package | Version | Purpose |
|---------|---------|---------|
| react | ^19.x | UI framework |
| react-dom | ^19.x | React DOM rendering |
| @tanstack/react-router | latest | Type-safe routing |
| @tanstack/react-query | latest | Data fetching, caching, mutations |
| @tanstack/react-form | latest | Type-safe form handling |
| @tanstack/react-virtual | latest | Virtualized conversation list |
| @tanstack/pacer | latest | Debounce, throttle, rate limiting |
| tailwindcss | ^4.x | Utility-first CSS |
| @radix-ui/* | latest | Accessible UI primitives (via shadcn) |
| react-markdown | latest | Safe markdown rendering (replaces dangerouslySetInnerHTML) |
| dompurify | latest | HTML sanitization fallback |
| zod | ^3.x | Runtime validation (via @dungeongpt/shared) |
| uuid | ^10.x | Session ID generation |
| three | latest | 3D terrain rendering (experimental) |
| @react-three/fiber | latest | React Three.js integration |
| @react-three/drei | latest | Three.js helpers |
| @dungeongpt/shared | workspace:* | Zod schemas and types |

### Backend (`backend/package.json`) — Production

| Package | Version | Purpose |
|---------|---------|---------|
| hono | ^4.x | Workers HTTP framework |
| drizzle-orm | latest | Type-safe D1 query builder |
| drizzle-zod | latest | Generate Zod schemas from Drizzle tables |
| zod | ^3.x | Runtime validation (via @dungeongpt/shared) |
| @dungeongpt/shared | workspace:* | Zod schemas and types |

### Development (Root `package.json`)

| Package | Version | Purpose |
|---------|---------|---------|
| typescript | ^5.x | TypeScript compiler |
| eslint | ^9.x | Linting (flat config) |
| @typescript-eslint/eslint-plugin | latest | TypeScript ESLint rules |
| @typescript-eslint/parser | latest | TypeScript parser for ESLint |
| eslint-plugin-security | latest | Security-focused lint rules |
| eslint-plugin-no-unsanitized | latest | Block DOM injection patterns |
| eslint-plugin-react | latest | React lint rules |
| eslint-plugin-react-hooks | latest | Hooks lint rules |
| eslint-plugin-jsx-a11y | latest | Accessibility lint rules |
| eslint-plugin-unicorn | latest | Modern JS/TS best practices |
| eslint-plugin-sonarjs | latest | Code quality, complexity |
| eslint-plugin-import-x | latest | Import ordering, no circular deps |
| eslint-plugin-regexp | latest | Regex performance |
| eslint-config-prettier | latest | Disable ESLint rules that conflict with Prettier |
| prettier | latest | Code formatting |
| knip | latest | Dead code detection |
| vite | ^7.x | Frontend build tool |
| @vitejs/plugin-react | latest | Vite React plugin |
| wrangler | ^4.x | Cloudflare dev/deploy CLI |
| drizzle-kit | latest | Drizzle migrations and studio |
| @types/react | latest | React type definitions |
| @types/dompurify | latest | DOMPurify type definitions |

---

## Design Patterns

| Pattern | Where Used | Purpose |
|---------|------------|---------|
| Zustand | `frontend/src/stores/` | Client state (game session, UI, settings) |
| TanStack Query | `frontend/src/hooks/` | Server state (D1 data, AI responses) |
| Context | `frontend/src/contexts/` | Only for dependency injection (theme provider, auth provider) |
| TanStack Query | `frontend/src/hooks/` | Server state, caching, mutations |
| TanStack Form | `frontend/src/pages/` | Form state with Zod validation |
| Middleware chain | `backend/src/middleware/` | Auth, validation, error handling |
| Domain modules | `backend/src/routes/` | Route handlers grouped by domain |
| Repository pattern | `backend/src/db/` | Data access abstraction over D1 |
| Adapter pattern | `backend/src/services/ai.ts` | AI Gateway routing by tier/model |
| Pure functions | `frontend/src/game/` | Game mechanics with no side effects |
| Schema-first | `shared/src/schemas/` | Zod schemas drive types and validation everywhere |

---

## Environment Configuration

### Required Environment Variables

| Variable | Description | Required | Location |
|----------|-------------|----------|----------|
| `VITE_API_URL` | Backend Worker URL | Yes | frontend `.env` |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk frontend key | Deferred | frontend `.env` |
| `CLERK_SECRET_KEY` | Clerk backend key | Deferred | Workers secret |
| `CF_AI_GATEWAY_ID` | AI Gateway identifier | Yes | wrangler.toml |
| `OPENAI_API_KEY` | OpenAI API key (premium tier) | No | Workers secret |
| `ANTHROPIC_API_KEY` | Anthropic API key (premium tier) | No | Workers secret |
| `GEMINI_API_KEY` | Google API key (premium tier) | No | Workers secret |

### Configuration Files

| File | Location | Purpose |
|------|----------|---------|
| `wrangler.toml` | `backend/` | Workers config — D1 bindings, AI bindings, env vars, routes |
| `drizzle.config.ts` | `backend/` | Drizzle ORM config for D1 |
| `vite.config.ts` | `frontend/` | Vite build config, dev proxy to backend Worker |
| `tsconfig.base.json` | root | Shared TypeScript strict config |
| `tsconfig.json` | each package | Extends base, package-specific paths |
| `eslint.config.ts` | root | Single ESLint config for all packages |
| `knip.config.ts` | root | Dead code detection config |
| `.prettierrc` | root | Formatting rules |
| `.env` | each package | Local dev variables (not committed) |
| `.env.example` | root | Template for all environment variables |

---

## External Services

### APIs & Integrations

| Service | Purpose | Documentation |
|---------|---------|---------------|
| Cloudflare Workers | Edge compute runtime | https://developers.cloudflare.com/workers/ |
| Cloudflare D1 | Edge SQLite database | https://developers.cloudflare.com/d1/ |
| Cloudflare AI Gateway | LLM proxy with caching/rate limiting | https://developers.cloudflare.com/ai-gateway/ |
| Cloudflare Workers AI | On-edge open source model inference | https://developers.cloudflare.com/workers-ai/ |
| Clerk | User authentication (deferred) | https://clerk.com/docs |

### Third-Party Services

| Service | Purpose | Account Required |
|---------|---------|------------------|
| Cloudflare | Hosting, compute, database, AI | Yes (free tier available) |
| Clerk | Authentication (deferred) | Yes (free tier: 10k MAU) |
| OpenAI | Premium tier LLM (optional) | Only for premium tier |
| Anthropic | Premium tier LLM (optional) | Only for premium tier |
| Google AI | Premium tier LLM (optional) | Only for premium tier |

---

## Security Considerations

### Validation (Enforced Everywhere)
- Zod validation on every API request body in backend middleware
- Zod validation on every API response in frontend before use
- Zod validation on every form input before submission
- Zod validation on every localStorage read before use
- No `any`, no `as`, no raw casts — validate or reject

### Authentication (Deferred — Final Phase)
- Clerk JWT verification on every Workers API request
- Middleware pattern: verify → extract userId → attach to context → proceed
- Public routes: health check only — everything else requires auth

### Data Protection
- All D1 queries scoped by userId — enforced at the query layer (after auth)
- No secrets in client bundle — all API keys in Workers secrets
- CORS restricted to production domain
- Security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- LLM output sanitized before forwarding to client

### Content Safety
- All rendered content sanitized via react-markdown or DOMPurify
- No `dangerouslySetInnerHTML` anywhere in the codebase — enforced by ESLint rule
- Image URLs validated (reject `javascript:`, restrict protocols)
- User input length-limited and validated at API boundary
- `eslint-plugin-security` + `eslint-plugin-no-unsanitized` enforce at lint time

### Dependency Hygiene
- Knip on every build — zero unused deps, zero dead exports
- Minimal dependency footprint on Workers (small attack surface by design)
- pnpm strict mode prevents phantom dependencies

---

## Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Initial page load | < 2s | Lighthouse, WebPageTest |
| AI response (free tier) | < 3s | AI Gateway analytics |
| AI response (premium) | < 5s | AI Gateway analytics |
| Auto-save latency | < 500ms | D1 query time |
| D1 query time | < 50ms | Workers analytics |
| Time to interactive | < 3s | Lighthouse |
| Bundle size (gzipped) | < 500KB | Vite build output |

---

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-02-22 | All-Cloudflare infrastructure | Single platform, single bill, edge-first. D1 handles the simple schema, AI Gateway provides cost control, Workers AI enables free tier | Supabase (auth+DB) + Render (backend) — more complexity, two platforms |
| 2026-02-22 | Clerk for auth (deferred) | Consumer-facing signup flow, React SDK, JWT verification on Workers, generous free tier. Deferred to final build phase | Cloudflare Access (enterprise-focused, no consumer signup), Supabase Auth (would add second platform) |
| 2026-02-22 | Hono over Express | Express requires Node.js APIs not available on Workers. Hono is Workers-native, TypeScript-first, lightweight | itty-router (too minimal), express-to-workers shims (hacky) |
| 2026-02-22 | Drizzle ORM over raw SQL | Type-safe queries, schema-as-code, migration tooling, D1-compatible. Lightweight (~30KB). drizzle-zod bridges to shared Zod schemas | Raw D1 API (no type safety), Prisma (too heavy for Workers), Kysely (less D1 support) |
| 2026-02-22 | Workers AI for free tier | No external API costs, runs on Cloudflare's GPUs, fast inference for narration-quality tasks | OpenRouter (middleman cost), direct API calls only (no free tier possible) |
| 2026-02-22 | TypeScript strict + Zod everywhere | 16,403 lines of JS — no `any` ever, Zod validates at every boundary, types inferred from schemas. Defense in depth | Stay JavaScript (miss type safety), gradual adoption (inconsistent) |
| 2026-02-22 | Vite over CRA | CRA is deprecated, Vite is faster, modern ESM, active maintenance | Next.js (overkill, SSR not needed), Parcel (less ecosystem) |
| 2026-02-22 | pnpm monorepo | Strict dependency resolution prevents phantom deps on Workers, fast installs, native workspace support | npm workspaces (looser hoisting), yarn (no advantage over pnpm) |
| 2026-02-22 | shared/ for Zod schemas only | Both Workers need runtime Zod validation — shared schemas bundled into each at build time via workspace linking. No utils, no helpers, no constants — only schemas and inferred types | Keep types in backend, `import type` only (no frontend runtime validation) |
| 2026-02-22 | Drop CLI runners for prod | CLI runners (codex, claude, gemini) spawn child processes — impossible on Workers. They're local dev tools, not production-ready | Keep for local dev only (adds maintenance burden) |
| 2026-02-22 | react-markdown over regex | Current renderMarkdown() uses regex to convert markdown to HTML, rendered via dangerouslySetInnerHTML — critical XSS vector. react-markdown renders safely by default | DOMPurify + dangerouslySetInnerHTML (still risky pattern) |
| 2026-02-22 | Tailwind v4 + shadcn/ui | 3,346-line monolithic App.css replaced with utility classes and accessible component primitives. Tailwind v4 needs no PostCSS. shadcn gives Radix-based behavior (focus trapping, keyboard nav, ARIA) for free. All existing colors, fonts, and themes preserved exactly — no visual changes | Styled Components (was in package.json but never used), CSS Modules (no dynamic theming), Keep raw CSS (unmaintainable at scale) |
| 2026-02-22 | Zustand for client state | Selective re-renders (only what changed), no provider wrapping, 1KB, works outside React (game engine can read/write directly), persist middleware for localStorage. Context re-renders all consumers on any change — bad for a game with frequent state updates | React Context (cascade re-renders), Jotai (atomic but more complex), Redux (overkill, boilerplate) |
| 2026-02-22 | TanStack ecosystem over React Router + manual fetch | Type-safe routing with Zod params, automatic data caching/mutations, form validation, virtual scrolling, debounce — one consistent ecosystem. Game is expanding, needs to scale. | React Router v6 (no type safety), manual fetch + useState (boilerplate), react-hook-form (separate ecosystem) |
| 2026-02-22 | Vite 7 | Latest major — faster builds, improved HMR, modern ESM | Vite 6 (previous major) |
| 2026-02-22 | ESLint security + performance plugins | Zero tolerance — eslint-plugin-security, no-unsanitized, sonarjs, unicorn, regexp. All errors, no warnings. CI blocks on any violation | Basic ESLint only (miss security patterns) |
| 2026-02-22 | Knip for housekeeping | Zero dead exports, unused deps, dead files. Runs on every build. Keeps the codebase tight | Manual cleanup (inconsistent, things slip through) |

---

*Last updated: 2026-02-22*
