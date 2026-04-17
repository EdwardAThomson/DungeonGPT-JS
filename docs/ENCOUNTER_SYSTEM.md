# Encounter System

## Current State

The encounter system is the primary gameplay loop beyond exploration. It uses a storytelling-first approach: the AI Dungeon Master narrates outcomes based on player choices and dice rolls, creating a theater-of-the-mind experience rather than a tactical combat grid. Encounters are resolved through D20 skill checks with advantage/disadvantage and critical success/failure mechanics, and character stat modifiers directly influence outcomes.

The core resolution pipeline (`encounterResolver.js`) handles single-action encounters, while `multiRoundEncounter.js` manages multi-round combat with enemy HP, morale tracking, and contextual actions that evolve as combat progresses. The `encounterGenerator.js` module handles random encounter triggering based on biome, grimness settings, visit history, and moves-since-last-encounter. Encounter data is organized across eight category files under `src/data/encounters/` (base, wilderness, town, cave, ruins, grove, mountain, environmental), merged through an index. The `encounterController.js` module applies rewards (XP via `progressionSystem.js`, gold and items via `inventorySystem.js`) and penalties after resolution.

Phase 1 (core encounters), Phase 2 (random generation + movement integration), and Phase 3 (enhanced POI encounters) are complete. Phase 4 (progression) is partially shipped -- XP/leveling and inventory exist but loot narration is incomplete. The two-tier narrative encounter system (Phase 2.4) has data structures (`encounterTier`, `narrativeHook`, `aiContext` on templates) and a `promptBuilder.js` utility, but the full movement-integration flow (suppressing AI prompts for immediate encounters, injecting context for narrative ones) is not fully wired. The team encounter system (Lead+Support model) is designed but not yet implemented.

### Key Files

| File | Purpose |
|---|---|
| `src/utils/encounterResolver.js` | Single-action encounter resolution (roll, outcome tier, damage) |
| `src/utils/multiRoundEncounter.js` | Multi-round combat state machine (morale, advantage, HP) |
| `src/utils/encounterGenerator.js` | Random encounter triggering and weighted selection |
| `src/utils/promptBuilder.js` | AI prompt construction with narrative encounter context |
| `src/game/encounterController.js` | Post-encounter reward/penalty application |
| `src/data/encounters/` | 8 category files merged via index (40+ templates) |
| `src/data/encounterTables.js` | Biome-specific weighted encounter tables |
| `src/utils/progressionSystem.js` | XP thresholds and leveling (D&D 5e-inspired, cap 20) |
| `src/utils/inventorySystem.js` | Gold management, item drops, dice notation rolling |
| `src/components/EncounterActionModal.js` | Choice-driven encounter UI with HP bars and damage |
| `src/pages/EncounterTest.js` | Isolated encounter testing page (`/encounter-test`) |

---

## Phase 1: Core Encounters (Shipped)

### Design Decisions
- **No AI calls during combat resolution.** Encounter outcomes use pre-written consequence text from templates, eliminating API latency and cost during the action loop. AI narration was originally planned but cut for responsiveness.
- **Skill-based action selection.** Each encounter offers 3-4 actions mapped to different skills (Athletics, Persuasion, Stealth, etc.), giving players meaningful choice beyond "attack."
- **Four outcome tiers.** Critical success / success / failure / critical failure, determined by D20 roll vs. difficulty DC. Each tier has a distinct consequence string.
- **Non-skill escape valve.** Actions with `skill: null` (e.g., "Leave", "Move On") resolve automatically as success, letting players opt out.

### Data Structure (Encounter Template)
```javascript
{
  name: 'Goblin Ambush',
  icon: '...',
  encounterTier: 'immediate',       // or 'narrative'
  difficulty: 'easy',               // maps to DC via DIFFICULTY_DC
  suggestedActions: [
    { label: 'Fight', skill: 'Athletics', description: '...' },
    { label: 'Flee', skill: 'Acrobatics', description: '...' },
  ],
  rewards: { xp: 50, gold: '2d10', items: ['dagger:30%'] },
  consequences: {
    criticalSuccess: '...', success: '...', failure: '...', criticalFailure: '...'
  },
  enemyHP: 20                       // for multi-round encounters
}
```

### Multi-Round Combat
- State machine: `createMultiRoundEncounter()` returns round state with enemy HP, morale (starts 100), and player advantage (starts 0).
- Each round: player picks action, rolls d20 + modifier, outcome affects enemy HP/morale and player HP.
- Contextual actions unlock mid-combat: "Finish Them" at advantage >= 2, "Demand Surrender" at morale < 50, "Tactical Retreat" after round 1.
- Encounter ends on: enemy HP <= 0, enemy morale <= 0, player flees, or max rounds reached.

---

## Phase 2: Random Encounters and Narrative Tiers (Mostly Shipped)

### Encounter Generation
- **Biome-specific tables** in `encounterTables.js` with weighted random selection. Every biome (plains, forest, mountain, town, etc.) has its own table with hostile/non-hostile mix and a `none` entry for peaceful travel.
- **Trigger formula:** Base chance per biome, multiplied by grimness modifier (Noble 0.8x to Grimdark 1.4x), reduced on revisited tiles, boosted after 3+ moves without encounter. Capped at 70%.
- **POI encounters:** Separate tables for caves, ruins, groves, etc. POI type detected from tile data.
- **Environmental encounters:** Weather, hazards, and discoveries as a separate encounter category.

### Two-Tier Encounter System (Phase 2.4 -- In Progress)

**Problem:** Movement triggers both an AI narration prompt and a potential encounter popup, competing for attention.

**Solution:** Two tiers with different UX flows:

| Tier | Trigger | UX |
|---|---|---|
| **Immediate** | Combat/urgent encounters (ambushes, roadblocks) | Modal pops up, AI movement prompt suppressed |
| **Narrative** | Discovery encounters (strangers, treasure, wounded travelers) | Context injected into AI prompt, revealed through conversation |

**Data additions for narrative tier:**
```javascript
{
  encounterTier: 'narrative',
  narrativeHook: 'a hooded figure watching from a distance',   // short phrase for AI
  aiContext: 'A mysterious hooded figure stands near the path...'  // full context block
}
```

**What's implemented:** All encounter templates have `encounterTier` set. `promptBuilder.js` exists with `buildMovementPrompt()` that accepts optional narrative encounter context. Encounter data files include `narrativeHook` and `aiContext` fields.

**What's missing:** The movement handler in `Game.js` does not yet branch on encounter tier (suppress prompt for immediate vs. inject context for narrative). Player engagement detection (keyword matching in chat to trigger modal for narrative encounters) is not wired.

---

## Phase 3: Enhanced POI Encounters (Shipped)

Expanded encounter content to 40+ templates across eight category files:

| Category | File | Examples |
|---|---|---|
| Base | `baseEncounters.js` | Goblin ambush, wolf pack, bandit roadblock |
| Wilderness | `wildernessEncounters.js` | Mysterious stranger, wounded traveler, hidden treasure |
| Town | `townEncounters.js` | Tavern brawl, merchant encounters |
| Cave | `caveEncounters.js` | Cave entrance, underground exploration |
| Ruins | `ruinsEncounters.js` | Ancient ruins, artifact discovery |
| Grove | `groveEncounters.js` | Sacred grove, fey encounters |
| Mountain | `mountainEncounters.js` | Mountain shrine, hermit encounters |
| Environmental | `environmentalEncounters.js` | Rockslides, storms, hazards |

Each POI type has a dedicated encounter table in `encounterTables.js` with `poiEncounterTables` and `poiEncounterChance` configs. POI encounters use the narrative tier by default, letting the AI weave discoveries into movement descriptions.

---

## Phase 4: Progression and Inventory (Partially Shipped)

### Experience System (Shipped)
- **File:** `src/utils/progressionSystem.js`
- D&D 5e-inspired XP thresholds, level cap 20.
- `awardXP(character, amount)` returns updated character with `leveledUp` flag.
- `getLevelUpSummary()` provides level-up details for UI.
- Slow progression: ~20-30 encounters per level at early tiers.

### Inventory System (Shipped)
- **File:** `src/utils/inventorySystem.js`
- `addGold(hero, amount)`, `addItem(inventory, itemKey)` for reward application.
- Dice notation parsing (`3d10`, `2d6+5`) for gold drops.
- Item drop chance parsing (`healing_potion:50%`).

### Loot Narration (Not Shipped)
- AI-narrated loot acquisition was planned but not implemented. Currently rewards are applied silently via `encounterController.js` with text messages (`+50 XP`, `+12 gold`).

---

## Phase 5: Team Encounters -- Lead + Support Model (Planned)

### Problem
The current system is single-hero-centric: one hero acts as "champion" while the rest of the party watches. Players build 1-4 hero parties but only use one per fight.

### Core Design: Lead + Support
Each round, one hero leads (picks a full action) and the others support. Support heroes contribute deterministic bonuses based on their best stat -- no extra dice rolls, keeping combat to one roll per round.

```
Round: Lead picks action -> Support bonuses applied -> d20 + modifier + support -> Outcome resolved
```

**Why this model:** Sequential turns would be 4x slower. Simultaneous full actions create overwhelming UI. Vote/consensus removes individual hero identity. Lead+Support is fast (1 roll), meaningful (support matters), and scales 1-4 heroes.

### Support Roles

| Role | Stat | Effect |
|---|---|---|
| Guard | CON/STR | Absorbs 30% of incoming damage for the lead |
| Flank | DEX/STR | +2 to lead's attack roll |
| Inspire | CHA | +1 to lead's roll, +10% morale damage to enemy |
| Heal | WIS | Restores 1d4+WIS_mod HP to lead after round |
| Analyze | INT | Reveals enemy morale %, +1 to lead's roll on round 2+ |
| Cover | DEX | 25% chance to negate lead's damage entirely |

**Support bonus formula:** `floor(stat_modifier / 2)` (minimum +1). Deterministic, no separate rolls.

**Auto-assignment:** Suggested based on hero's highest stat. Player can override.

### Round Flow
1. **Formation** (once per encounter) -- Assign lead and support roles. Replaces current "Choose Your Champion" screen.
2. **Action** (each round) -- Lead picks from actions (same as today). Support bonuses shown as combined modifier.
3. **Resolution** (each round) -- One roll. Support bonuses applied. Damage distributed across party based on roles.
4. **Between Rounds** -- Player can rotate lead (swap in fresh hero, use different skill). Support roles stay unless manually changed.

### Damage Distribution

| Who | Damage Taken |
|---|---|
| Lead | Base damage (modified by support) |
| Guard | Absorbs 30% of lead's damage |
| Flank | 15% chance to take splash damage (half of base) |
| Others | 0% normally; critical failure = 25% base to all |

### Reward Distribution
- XP split evenly across all party members.
- +10% bonus XP per support hero (encourages full party).
- Gold and items to shared pool (already shared today).

### State Extension
```javascript
// Added to multiRoundEncounter state
{
  isTeamEncounter: true,
  leadHeroIndex: 0,
  supportRoles: {
    1: { role: 'guard', bonus: 2 },
    2: { role: 'inspire', bonus: 1 },
  },
  teamDamageLog: []
}
```

### Edge Cases
- **1-hero party:** No formation phase. Identical to current system.
- **Hero at 0 HP:** Cannot be lead or support. Grayed out.
- **Lead defeated mid-fight:** Auto-swap to highest-HP support hero.
- **Flee:** Whole party flees. Each hero rolls individually for flee damage.

### Solo Backward Compatibility
A 1-hero party must play identically to the current system. Zero regression -- the team layer only activates when party size > 1.

---

## Phase 6: Advanced AI Integration (Planned)

### Dynamic Encounter Variation
AI rewrites encounter descriptions on the fly for repeated templates, using biome and tone settings for variety.

### NPC Dialogue
Conversational non-hostile encounters with generated dialogue (greeting, offer/information, personality quirk).

### Consequence Tracking
Encounter history stored and fed back into AI prompts. Recent failures affect narration tone; recent successes may embolden enemies.

### Reputation / Faction System
Encounter outcomes shift faction relationships. Factions influence which encounters spawn and how NPCs react.

---

## Future Work (Post-MVP)

### Team System Extensions
- **Combo attacks:** Special actions when specific class pairs are in the party (e.g., Fighter + Wizard = "Arcane Strike"). Requires a combo registry. Deferred past team MVP.
- **Party synergy hints:** Show detected class combos during hero selection to nudge complementary teams.
- **Positioning/formation:** Front row / back row affecting damage. Too complex for initial team system.
- **Hero-specific support actions:** Support heroes choosing from their own action list. Multiplies UI complexity.

### World Reactivity
- Faction wars, seasonal events, time-of-day encounters, weather integration.

### Mechanical Depth
- Group skill checks, status effects persisting across encounters, companion abilities.

### Meta Features
- Bestiary (AI-generated creature lore), encounter journal, achievement system, difficulty modes (hardcore/story).

---

## Open Questions

1. **Narrative encounter engagement detection.** How should the system detect that a player is engaging with a narrative encounter via chat? Current plan is keyword matching (`approach`, `investigate`, `help`, etc.) but this is fragile. Could use AI classification instead.
2. **Immediate encounter prompt suppression.** When an immediate encounter fires, should the AI movement prompt be fully suppressed, or should a brief transition sentence still appear?
3. **Support bonus scaling with level.** Current team design uses flat stat modifiers. Should proficiency bonus be added at higher levels?
4. **Analyze role and enemy HP.** Should the Analyze support role reveal exact enemy HP numbers, or just the morale percentage?
5. **Narrative encounters in team combat.** Support roles could map to social equivalents (Guard = "Watch the exits", Inspire = "Back up the speaker") but this needs design work.
6. **Loot narration priority.** AI-narrated loot was planned in Phase 4 but deferred. Is this worth the API cost, or are text-only reward messages sufficient?
