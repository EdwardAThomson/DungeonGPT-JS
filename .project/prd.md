# DungeonGPT - Product Requirements Document

> **Document Location:** `.project/prd.md`
>
> This document defines the product requirements, features, and specifications.
> Keep this document as the single source of truth for what we're building.

---

## Overview

### Problem Statement
DungeonGPT is a functional text-based RPG with an AI dungeon master, but it was built for personal use and grew organically. It cannot be safely deployed for public consumption due to critical security vulnerabilities (XSS, no auth, no user isolation), a monolithic architecture (backend mixed with frontend source), outdated tooling (CRA, JavaScript, SQLite file DB), and no cost controls on LLM usage. The codebase needs a full architectural overhaul to go from "works on my machine" to "public product."

### Solution
Rebuild the application on an all-Cloudflare infrastructure with proper security, user authentication, TypeScript, and an AI gateway that enables both free-tier (open source models) and premium-tier (commercial models) gameplay — while preserving the game mechanics and systems that already work well in JavaScript.

### Target Users
- **Primary:** Tabletop RPG fans who want a solo AI-driven adventure experience
- **Secondary:** Casual gamers looking for a quick narrative game session

### Success Metrics
- [ ] Zero critical security vulnerabilities (no XSS, no unauthenticated data access)
- [ ] Deployable to Cloudflare with a single `wrangler deploy`
- [ ] Sub-3-second AI response times on free-tier models
- [ ] User data fully isolated — no user can access another user's characters or saves
- [ ] Cost-controlled LLM usage with per-user rate limiting

---

## Features

### Core Features (MVP)

#### Feature 1: Secure AI Dungeon Master
**Priority:** P0 (Must Have)

**Description:**
AI-powered narrative generation for the game, routed through Cloudflare AI Gateway with support for multiple model tiers. Free tier uses Workers AI open source models (Llama, Mistral). Premium tier routes to commercial APIs (OpenAI, Anthropic, Google) via AI Gateway.

**User Story:**
> As a player, I want an AI dungeon master that narrates my adventure so that I can experience a dynamic, responsive RPG story.

**Acceptance Criteria:**
- [ ] All LLM calls route through Cloudflare AI Gateway
- [ ] Free tier: Workers AI models respond within 3 seconds
- [ ] Premium tier: Commercial models accessible via AI Gateway proxy
- [ ] AI Gateway caching enabled for repeated prompt patterns
- [ ] Per-user rate limiting prevents abuse and cost overruns
- [ ] AI responses sanitized before rendering (no XSS from LLM output)

**Technical Notes:**
- Current LLM usage is pure narration — no complex reasoning needed
- Small models (8B-12B) are sufficient for narration quality
- System prompt (DM_PROTOCOL) ensures in-character responses
- Summarization keeps context window manageable (400 tokens, temp 0.3)

---

#### Feature 2: User Authentication
**Priority:** P0 (Must Have)

**Description:**
User accounts via Clerk with JWT-based authentication. Every API request verified. All user data (characters, saves, settings) scoped by userId.

**User Story:**
> As a player, I want to create an account so that my characters and game saves are private and persistent.

**Acceptance Criteria:**
- [ ] Clerk sign-up/sign-in flow integrated into the frontend
- [ ] JWT verification on every Workers API request
- [ ] All D1 queries scoped by authenticated userId
- [ ] Protected routes redirect unauthenticated users to sign-in
- [ ] Session management handled by Clerk (token refresh, multi-device)

---

#### Feature 3: Character System
**Priority:** P0 (Must Have)

**Description:**
Create, edit, and manage RPG characters with stats, race, class, background, and alignment. Characters are user-owned and persisted in D1.

**User Story:**
> As a player, I want to create and manage my RPG characters so that I can use them across multiple game sessions.

**Acceptance Criteria:**
- [ ] Character creation with stat allocation (D&D 5e style)
- [ ] Character editing and deletion
- [ ] Profile picture selection from available portraits
- [ ] Characters scoped to authenticated user
- [ ] Character data validated before storage

---

#### Feature 4: Game Session Persistence
**Priority:** P0 (Must Have)

**Description:**
Save and resume game sessions including conversation history, world map state, player position, hero progression (HP, XP, inventory), and game settings.

**User Story:**
> As a player, I want to save my game and resume later so that I don't lose progress.

**Acceptance Criteria:**
- [ ] Auto-save after each turn
- [ ] Manual save with custom session names
- [ ] Load and resume saved sessions with full state restoration
- [ ] Delete saved sessions
- [ ] Sessions scoped to authenticated user

---

#### Feature 5: Game Mechanics Engine
**Priority:** P0 (Must Have)

**Description:**
Core game systems: health/damage, XP/leveling (20 levels), inventory management, dice rolling (D&D 5e rules), encounter generation/resolution, multi-round combat, and procedurally generated world/town maps.

**User Story:**
> As a player, I want meaningful game mechanics so that my choices have consequences and progression feels rewarding.

**Acceptance Criteria:**
- [ ] HP system with damage from encounters
- [ ] XP awards and level progression (1-20)
- [ ] Dice rolling with visible results
- [ ] Encounter generation based on biome, grimness, and move count
- [ ] Procedural world map generation (seeded for consistency)
- [ ] Town map generation with buildings, NPCs, and navigation
- [ ] Party system (1-4 heroes)

**Technical Notes:**
- These systems already work well in JavaScript — port to TypeScript with type safety
- Game mechanics are deterministic (JS), not LLM-dependent
- Encounter trigger chance: base by biome, modified by grimness, revisit multiplier, drought bonus

---

#### Feature 6: Secure Content Rendering
**Priority:** P0 (Must Have)

**Description:**
All AI-generated and user-provided content rendered safely. No XSS vectors. Replace dangerouslySetInnerHTML with safe rendering.

**User Story:**
> As a player, I want to see formatted narrative text without risking my browser security.

**Acceptance Criteria:**
- [ ] All dangerouslySetInnerHTML usage replaced with react-markdown or DOMPurify
- [ ] LLM output treated as untrusted and sanitized before display
- [ ] User input escaped in all display contexts
- [ ] Image URLs validated (reject javascript:, restrict to https/approved data URIs)
- [ ] Content Security Policy headers set on all responses

---

### Secondary Features (Post-MVP)

#### Feature 7: AI Model Selection UI
**Priority:** P1 (Should Have)

**Description:**
Let users choose between free-tier (open source) and premium-tier (commercial) AI models. Display model info, response speed expectations, and usage.

---

#### Feature 8: Milestone & Campaign Tracking
**Priority:** P1 (Should Have)

**Description:**
Track story milestones and campaign completion. Current marker-based system ([COMPLETE_MILESTONE]) to be hardened — consider hybrid approach with deterministic checks for location/inventory milestones and cheap classification calls for narrative milestones.

---

#### Feature 9: AI Assistant Panel
**Priority:** P2 (Nice to Have)

**Description:**
Side panel for out-of-game AI assistance (rules questions, strategy tips). Separate from the in-game DM.

---

## User Interface

### Screens/Views

#### Screen 1: Home / Landing
**Purpose:** Welcome screen, entry point to the game

**Components:**
- Sign in / Sign up (Clerk)
- Start new game
- Resume saved game

#### Screen 2: Character Creation
**Purpose:** Create and configure RPG characters

**Components:**
- Name, gender, race, class selection
- Stat allocation
- Profile picture selection
- Background and alignment
- Character summary and save

#### Screen 3: Game Settings
**Purpose:** Configure campaign parameters

**Components:**
- Campaign description and goal
- Grimness, magic level, technology level
- Milestone editor
- AI model/tier selection
- World seed (optional)

#### Screen 4: Hero Selection
**Purpose:** Choose party composition (1-4 heroes)

**Components:**
- Character roster (user's saved characters)
- Party composition display
- Start adventure button

#### Screen 5: Main Game
**Purpose:** Core gameplay — narrative, map, encounters

**Components:**
- Chat/narrative display (AI DM + player input)
- Hero sidebar (HP, XP, stats)
- World/town map overlay
- Encounter modal (combat/interaction)
- Character detail modal
- Dice roller
- AI assistant panel (optional)

#### Screen 6: Saved Games
**Purpose:** Manage saved game sessions

**Components:**
- Session list with names, dates, providers
- Resume, rename, delete actions

---

## Technical Requirements

### Platform
- Modern web browsers (Chrome, Firefox, Safari, Edge — latest 2 versions)
- Mobile-responsive (playable on tablet/phone)

### Performance
- Initial page load: < 2 seconds on broadband
- AI response (free tier): < 3 seconds
- AI response (premium tier): < 5 seconds
- Auto-save: Non-blocking, < 500ms

### Security
- Clerk JWT authentication on all API routes
- User data isolation at the database query level (every query scoped by userId)
- Input validation on all API endpoints
- Content sanitization on all rendered output
- CORS restricted to production domain
- Security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
- Rate limiting via AI Gateway + application-level checks
- No secrets in client bundle

### Data
- Cloudflare D1 (SQLite at edge) for all persistent data
- Two core tables: characters, conversations (with JSON columns for complex state)
- User-scoped data access — no cross-user data leakage
- Session data includes: conversation history, world map, player position, hero state, game settings

---

## Constraints & Assumptions

### Constraints
- Cloudflare Workers runtime: No Node.js APIs, 128MB memory, CPU time limits
- D1: SQLite dialect, 10GB max per database, 10MB max per row
- Workers AI: Model selection limited to Cloudflare's catalog
- AI Gateway: Rate limits and caching must be configured per-gateway

### Assumptions
- Users have a modern browser with JavaScript enabled
- Free-tier AI models provide acceptable narration quality for casual play
- Game mechanics (dice, encounters, maps) port cleanly from JS to TS
- Clerk free tier (10k MAU) is sufficient for initial launch

### Out of Scope
- Multiplayer / co-op gameplay
- Mobile native app
- Custom character art uploads (use provided portraits)
- Payment processing / Stripe integration (future phase)
- CLI runner support in production (local dev only)
- Voice narration / text-to-speech

---

## Glossary

| Term | Definition |
|------|------------|
| DM | Dungeon Master — the AI narrator that runs the game |
| D1 | Cloudflare's edge SQLite database |
| Workers AI | Cloudflare's inference platform for running open source LLMs |
| AI Gateway | Cloudflare's proxy for AI APIs with caching, rate limiting, analytics |
| Clerk | Third-party authentication service |
| DM_PROTOCOL | System prompt that constrains the AI to stay in character |
| BYOK | Bring Your Own Key — users supply their own API key |
| Milestone | A story objective tracked during a campaign |
| Encounter | A random or scripted event (combat, NPC interaction, discovery) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-22 | .ul0gic | Initial draft — full rewrite from security audit |

---

*Last updated: 2026-02-22*
