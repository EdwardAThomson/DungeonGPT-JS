# Encounter System

Edward's design spec for a narrative-first encounter system. DungeonGPT treats encounters as storytelling moments rather than tactical combat — the AI DM narrates outcomes based on player choices and dice rolls.

**Status:** ✅ Phase 1 (foundation) is complete, ported, and **fully integrated into the gameplay loop** (Phase 11.3). Phase 2+ (narrative encounters, consequence tracking, enhanced POI encounters) is designed but not yet implemented.

## Files

| File | Description |
|------|-------------|
| [encounter-system-roadmap.md](./encounter-system-roadmap.md) | Full design doc — phases, data structures, AI prompt templates, UI flows |

## What's Implemented (Phase 1) — ✅ COMPLETE

Ported to the new stack and wired into gameplay:
- Encounter templates with suggested actions (fight/flee/negotiate/etc.)
- Dice-based resolution (D20 skill checks with modifiers)
- Multi-round combat with morale, advantage, enemy HP
- HP system integration
- Encounter action modal UI
- **Map movement triggers encounters** via `checkForEncounter()` in `useMapMovement` hook
- **Encounter resolution applies game state** — HP damage, XP awards, gold, loot items via `game-modals.tsx` `onResolve` handler
- **Encounter history tracked** — last 20 encounters stored in game store, last 3 fed to AI prompts
- **Dice rolls surfaced in chat** — d20 results shown as system messages with crit detection
- **Encounter rewards persist** — saved/loaded via `useGameSession` (embedded in `subMaps`)

### Key Integration Files
- `frontend/src/hooks/use-map-movement.ts` — triggers encounters on tile movement
- `frontend/src/pages/game/modals/game-modals.tsx` — encounter resolution + reward application
- `frontend/src/stores/game-store.ts` — `activeEncounter`, `encounterHistory`, `heroStates`
- `frontend/src/hooks/use-game-prompts.ts` — feeds encounter history to AI context

## What's Pending (Phase 2+)

From the roadmap doc:
- Two-tier narrative encounters (quick resolve vs extended narrative)
- AI prompt builder for narrative encounter descriptions
- Consequence tracking (injuries, reputation, time passing)
- Loot distribution through story narration
- Enhanced POI encounters (caves, ruins, temples with unique mechanics)
- Encounter engagement detection in chat flow
