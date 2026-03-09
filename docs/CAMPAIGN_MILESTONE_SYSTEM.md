# Campaign & Milestone System Design

## Overview

This document outlines a redesigned adventure/milestone system that replaces AI-judged text markers with deterministic, game-engine-driven completion checks where possible, while preserving flexibility for narrative-driven milestones.

The goal is to make quest completion **reliable and verifiable** without sacrificing the creative, emergent storytelling that makes the game compelling.

---

## The Problem with the Current System

The existing milestone system (see `MilestoneTest.js`) relies on the AI emitting text markers like `[COMPLETE_MILESTONE: text]` in its response. The game parses these with regex and fuzzy string matching.

**Weaknesses:**
- The AI self-reports milestone completion — it is both narrator and judge
- The AI may emit markers too eagerly (player says "I look for the map" and the AI decides they found it)
- The AI may forget to emit markers entirely
- Text matching is fragile — slight wording differences break detection
- There is no mechanical verification that the milestone was actually achieved
- Players could potentially talk the AI into completing milestones prematurely

---

## The New Approach: Two Milestone Types

### 1. Mechanical Milestones (Deterministic)

These milestones have clear, verifiable triggers tied to game state. The **game engine** detects completion, not the AI.

| Type | Trigger | Example |
|------|---------|---------|
| `item` | Item enters party inventory | "Find the hidden map in the archives" |
| `combat` | Enemy is defeated (HP reaches 0) | "Defeat the Shadow Overlord" |
| `location` | Party visits a specific tile/area | "Breach the Shadow Fortress" |

**How it works:**
1. Adventure creation defines the milestone with a `type` and `trigger`
2. The game engine spawns the required entities (items, enemies, locations) at map generation time
3. During gameplay, the engine listens for state changes (item acquired, enemy defeated, tile visited)
4. When a trigger fires, the engine marks the milestone complete and **tells the AI** to narrate the achievement
5. The AI becomes the narrator, not the judge

**Key principle:** The AI never decides if a mechanical milestone is complete. It only describes what happens when the game engine confirms completion.

### 2. Narrative Milestones (Guided Flexibility)

These milestones involve subjective outcomes that can't be checked mechanically — convincing an NPC, uncovering a conspiracy, negotiating a treaty.

**Approach: Gated NPC Conversations**

Rather than letting the AI freely decide if a narrative goal is met, we constrain it:

- The relevant NPC must be **spawned into the game** at a specific location
- The milestone can **only** be completed by interacting with that NPC
- The NPC has defined personality traits, goals, and a set of possible outcomes
- The player converses with the NPC in natural language, but the NPC has guardrails
- The player cannot simply declare "I convinced them" in the regular game chat — they must actually talk to the NPC
- Completion is gated: the NPC interaction produces a structured outcome, not a free-form AI judgment

**This is the harder problem and is lower priority.** For now, narrative milestones can continue using the existing marker system with the understanding that they are less robust. The key improvement is that mechanical milestones no longer depend on AI judgment at all.

**Future options for narrative milestones:**
- Pre-scripted dialogue trees (like a traditional CRPG)
- AI-powered conversation with structured function call outputs
- Hybrid: AI conversation with a skill check gate (e.g., must pass a Persuasion check during the conversation)

---

## Data Structure

### Current milestone format (storyTemplates.js)

```javascript
{
  text: 'Find the hidden map in the archives of Oakhaven',
  location: 'Oakhaven'
}
```

### New milestone format

```javascript
{
  id: 1,
  text: 'Find the hidden map in the archives of Oakhaven',
  location: 'Oakhaven',
  type: 'item',                // 'item' | 'combat' | 'location' | 'narrative'
  requires: [],                // IDs of milestones that must be completed first
  trigger: {
    item: 'hidden_map',        // what to check for
    action: 'acquire'          // what event completes it
  },
  spawn: {                     // what the game engine needs to place in the world
    type: 'item',
    id: 'hidden_map',
    name: 'Hidden Map',
    location: 'Oakhaven',
    building: 'archives'       // POI/building where the item is found
  },
  rewards: {                   // milestone-level rewards (quest turn-in bonus)
    xp: 100,
    gold: '2d10',
    items: []
  }
}
```

### Milestone Dependencies

Milestones have a `requires` field — an array of milestone IDs that must be completed before this milestone becomes active. This enforces narrative ordering and gives the story coherence.

**Example: Heroic Fantasy campaign (4 milestones)**

```
 [1] Find the hidden map          [2] Convince the Silver Guard
      (no prerequisites)                (no prerequisites)
              \                              /
               \                            /
                v                          v
         [3] Breach the Shadow Fortress
                  (requires: [1, 2])
                          |
                          v
          [4] Defeat the Shadow Overlord
                  (requires: [3])
```

- Milestones 1 and 2 can be done in any order (parallel paths)
- Milestone 3 is locked until both 1 and 2 are complete (the map reveals the location, the guard provides the army)
- Milestone 4 is locked until 3 is complete (must breach the fortress to reach the Overlord)
- Locked milestones' entities are not spawned (or are inaccessible) until prerequisites are met
- When all milestones are complete, the campaign is complete

---

## Combat Milestones & Encounter Integration

Combat milestones should use the existing encounter system (`encounterResolver.js`, `encounterController.js`) rather than being a parallel combat implementation. A boss fight is just an encounter with a milestone trigger attached.

### How it works

1. The milestone defines an `encounter` field using the same schema as `BASE_ENCOUNTERS`
2. When the player reaches the milestone's location (and prerequisites are met), the encounter triggers
3. The existing encounter system handles combat resolution (dice rolls, HP, damage, actions)
4. If the encounter resolves with success, the milestone completes
5. If the encounter resolves with failure, the player can retry (the enemy is still there)

### Combat milestone example

```javascript
{
  id: 4,
  text: 'Defeat the Shadow Overlord',
  location: 'Cinder Mountains',
  type: 'combat',
  requires: [3],
  trigger: { enemy: 'shadow_overlord', action: 'defeat' },

  // Encounter definition (same format as baseEncounters.js)
  encounter: {
    name: 'Shadow Overlord',
    icon: '👑',
    encounterTier: 'boss',
    difficulty: 'deadly',
    multiRound: true,
    enemyHP: 250,
    minLevel: 5,                    // party must be at least level 5
    suggestedActions: [
      { label: 'Fight', skill: 'Athletics', description: 'Engage the Overlord in direct combat' },
      { label: 'Use the Map', skill: 'Investigation', description: 'Exploit weaknesses revealed by the hidden map' },
      { label: 'Rally the Guard', skill: 'Persuasion', description: 'Command the Silver Guard to flank' }
    ],
    consequences: {
      criticalSuccess: 'The Overlord falls with a thunderous crash, the Crown of Sunfire clattering free.',
      success: 'After a grueling battle, the Overlord is vanquished. The Crown gleams in the darkness.',
      failure: 'The Overlord strikes back with devastating force, wounding your party badly.',
      criticalFailure: 'The Overlord nearly destroys you. You must retreat and regroup.'
    },
    // Encounter-level loot (dropped by the enemy)
    rewards: { xp: 500, gold: '5d20', items: ['crown_of_sunfire'] }
  },

  // Milestone-level rewards (quest turn-in bonus, on top of encounter loot)
  rewards: { xp: 300, gold: '3d20', items: [] },

  spawn: {
    type: 'enemy',
    id: 'shadow_overlord',
    name: 'Shadow Overlord',
    location: 'Cinder Mountains'
  }
}
```

### Two reward layers

| Layer | When | Source | Example |
|-------|------|--------|---------|
| **Encounter rewards** | On winning the fight | `encounter.rewards` | Loot from the boss (Crown of Sunfire, gold, XP) |
| **Milestone rewards** | On milestone completion | `milestone.rewards` | Campaign achievement bonus (extra XP, gold) |

Both go through the existing `applyEncounterRewards()` in `encounterController.js`.

### Level requirements

Boss encounters can define a `minLevel` field. This prevents a level 1 party from stumbling into a fight they can't win.

**Enforcement options (to decide during implementation):**
- **Soft gate:** The encounter triggers but a warning is shown ("Your party may not be strong enough"). The player can attempt it anyway. This is more in the spirit of open-world RPGs.
- **Hard gate:** The encounter simply doesn't trigger. The AI narrates why ("The fortress gates hold fast — you need more strength/allies"). This is safer for campaign pacing.
- **Scaling:** The encounter difficulty adjusts to party level. Simpler but less dramatic — a boss that scales down feels less boss-like.

The `minLevel` is a recommendation. Implementation can decide how strictly to enforce it.

### Team encounters (future consideration)

Currently, encounters are single-hero. A boss fight against the Shadow Overlord should logically involve the whole party.

**Options to explore:**
- **Sequential turns:** Each party member takes an action per round (biggest change to encounter system)
- **Lead hero + support:** One hero leads the fight; others provide passive bonuses (least invasive)
- **Party skill check:** Roll the best modifier from the party, with bonus for party size (simplest)

This is a significant change to the encounter system and should be its own design effort. For now, combat milestones can use the existing single-hero encounter flow. The important thing is that the milestone/encounter integration works — team combat is an enhancement on top.

---

## Spawning: Items, Enemies, NPCs, and POIs

Every milestone that requires something to exist in the world has a `spawn` field. The game engine uses this to place entities at map generation time (or when prerequisites unlock them).

### Spawn types

| Spawn Type | What it creates | Where it goes | Example |
|------------|----------------|---------------|---------|
| `item` | A quest item in a building/location | Inside a POI within a town | Hidden Map in the archives of Oakhaven |
| `enemy` | A boss/quest enemy | At a specific map location | Shadow Overlord in the Cinder Mountains |
| `npc` | A quest NPC to interact with | Inside a town, specific building | Captain Aldric at the barracks in Silverton |
| `poi` | A point of interest on the map | On the world or town map | Shadow Fortress in the Cinder Mountains |
| `building` | A visitable building in a town | On the town map | Archives building in Oakhaven |

### The building/POI problem

If a milestone says "find the map in the archives", the archives must exist as a visitable place. This connects to the town map system.

**Current state:** Towns are generated with buildings, but the buildings are somewhat random. Quest-critical buildings need to be guaranteed.

**Approach:**
- The `spawn` field can include a `building` property that ensures a specific building type exists in the target town
- `spawnMilestoneEntities()` checks if the building exists in the town; if not, it adds it
- The item/NPC is then placed inside that building
- When the player visits the building, they can interact with the item/NPC

```javascript
// Item milestone — needs a building to house the item
{
  spawn: {
    type: 'item',
    id: 'hidden_map',
    name: 'Hidden Map',
    location: 'Oakhaven',
    building: 'archives',           // ensure this building exists in Oakhaven
    buildingName: 'The Great Archives'  // display name
  }
}

// NPC milestone — needs a building for the NPC
{
  spawn: {
    type: 'npc',
    id: 'silver_guard_captain',
    name: 'Captain Aldric',
    location: 'Silverton',
    building: 'barracks',
    buildingName: 'Silver Guard Barracks',
    role: 'Guard',                  // maps to npcGenerator.js roles
    personality: 'proud, honorable, skeptical of outsiders'
  }
}

// POI milestone — exists on the world map
{
  spawn: {
    type: 'poi',
    id: 'shadow_fortress',
    name: 'Shadow Fortress',
    location: 'Cinder Mountains'   // placed on/near this named location
  }
}
```

### Spawn timing

Not all entities should exist from the start:

| Scenario | When to spawn | Example |
|----------|--------------|---------|
| No prerequisites | At map generation | The archives and hidden map exist from the start |
| Has prerequisites | When prerequisites are met | The Shadow Fortress appears after finding the map + convincing the guard |
| Boss enemy | When the player enters the location (and prerequisites met) | Shadow Overlord encounter triggers on entering the fortress |

For simplicity, **Phase 1 can spawn everything at map generation** and just make locked entities non-interactive until prerequisites are met. Dynamic spawning is an optimization for later.

---

## Quest Enemy & NPC Data

Rather than embedding full enemy/NPC stats in every milestone definition, we can reference a shared data file for reusable entities.

### Approach: Inline for now, extract later

For Phase 1, enemy stats and encounter definitions live directly in the milestone data. This keeps things simple and self-contained.

When we have enough quest enemies to warrant it, we can extract them into a shared data file (e.g., `questEnemies.js`):

```javascript
// Future: src/data/questEnemies.js
export const QUEST_ENEMIES = {
  shadow_overlord: {
    name: 'Shadow Overlord',
    icon: '👑',
    difficulty: 'deadly',
    enemyHP: 250,
    minLevel: 5,
    suggestedActions: [ ... ],
    consequences: { ... },
    rewards: { ... }
  },
  rot_heart: {
    name: 'The Rot-Heart',
    icon: '🫀',
    difficulty: 'hard',
    enemyHP: 150,
    minLevel: 3,
    ...
  }
};
```

The milestone would then reference by ID:

```javascript
{
  type: 'combat',
  trigger: { enemy: 'shadow_overlord', action: 'defeat' },
  encounter: 'shadow_overlord',  // looks up from QUEST_ENEMIES
  ...
}
```

**Decision: defer this until we have more than 4-5 quest enemies.** Inline definitions are fine for now.

---

## Milestone Completion Engine

A new module that checks game state against milestone triggers:

```javascript
const areRequirementsMet = (milestone, allMilestones) => {
  if (!milestone.requires || milestone.requires.length === 0) return true;
  return milestone.requires.every(reqId =>
    allMilestones.find(m => m.id === reqId)?.completed
  );
};

const checkMilestones = (milestones, event) => {
  for (const milestone of milestones) {
    if (milestone.completed) continue;
    if (milestone.type === 'narrative') continue;
    if (!areRequirementsMet(milestone, milestones)) continue;

    const trigger = milestone.trigger;
    if (!trigger) continue;

    let completed = false;

    switch (milestone.type) {
      case 'item':
        completed = event.type === 'item_acquired'
                 && event.itemId === trigger.item;
        break;

      case 'combat':
        completed = event.type === 'enemy_defeated'
                 && event.enemyId === trigger.enemy;
        break;

      case 'location':
        completed = event.type === 'location_visited'
                 && event.locationId === trigger.location;
        break;
    }

    if (completed) {
      milestone.completed = true;

      // Check if all milestones are now complete
      const campaignComplete = milestones.every(m => m.completed);

      return {
        milestoneCompleted: milestone,
        campaignComplete
      };
    }
  }
  return null;
};
```

---

## Adventure Creation Flow

### Current flow
1. Player picks a template (or Custom Tale / AI Generated)
2. Templates define: description, campaign goal, milestones, tone settings
3. Map is generated with named towns/mountains
4. `resolveMilestoneCoords()` maps milestone locations to map coordinates
5. Game starts

### New flow
1. Player picks a template (or Custom Tale / AI Generated)
2. Templates define milestones **with types, triggers, encounters, and rewards**
3. Map is generated with named towns/mountains
4. `resolveMilestoneCoords()` maps milestone locations to map coordinates (unchanged)
5. **NEW: `spawnMilestoneEntities()`** ensures required buildings exist in towns, places items/NPCs in buildings, and marks POI/enemy locations on the map
6. Game starts with all milestone-related entities in the world (locked ones are non-interactive)

### Campaign Creator UI: Tabbed Design

The New Game page should be split into **tabs** rather than trying to squeeze everything into one view. Each tab is a fundamentally different experience.

#### Tab 1: Template Adventures

Pre-built campaigns with fixed milestones, encounters, and rewards. The player picks one and goes.

- **Read-only presentation** — adventure info is displayed as text, not in editable input fields. There's nothing to change.
- Show: campaign name, description, goal, milestone summary (count, types), tone settings
- The milestone dependency graph could be shown visually
- "Start Adventure" button at the bottom

#### Tab 2: Custom Adventures

Player-authored campaigns using the milestone system. This is the complex tab and needs significant design work.

- A **milestone editor** where the player builds their quest chain:
  - Type dropdown per milestone (item / combat / location / narrative)
  - Prerequisite selector (which other milestones must be completed first)
  - Conditional fields based on type:
    - Item: pick from item registry, building/context where it's found
    - Combat: pick from enemy registry, difficulty, suggested actions
    - Location: POI name
    - Narrative: NPC name, role, personality notes
  - Location assignment (which town/area to spawn in)
  - Rewards per milestone (XP, gold, items)
- **Level-gated content** — items, enemies, and encounters filtered by player level
- **Entity validation** — all references checked against registries before saving
- Tone/setting controls (grimness, darkness, magic, tech level)

This tab needs deep thinking and is likely a Phase 3+ effort. The current Custom Tale mode is a text-input form that doesn't understand the milestone system at all.

#### Tab 3: Freeform Adventures (Future / Low Priority)

Campaigns that bypass the structured milestone system entirely. Pure AI-narrated storytelling with no deterministic quest tracking — closer to the current system where the AI is both narrator and judge.

- Useful for players who just want open-ended roleplay
- No milestone tracking, no dependency graph, no spawned entities
- The AI drives everything — including deciding when "quests" are complete
- Could use the existing text marker system (`[COMPLETE_MILESTONE]`) as a lightweight fallback
- Low priority — the structured system is the main focus

---

## Implementation Plan

### Phase 1: Foundation (Start Here)
- [x] Write this design document
- [x] Create `CampaignMilestoneTest.js` debug page for prototyping
- [x] Define milestone data structure with `type`, `trigger`, `requires`, and `spawn`
- [x] Build milestone checker logic with dependency enforcement
- [x] Test in debug page with simulated game events
- [x] Add `encounter` and `rewards` fields to milestone data in test page
- [x] Update `storyTemplates.js` with typed milestones for all 4 templates

### Phase 2: Spawning & Integration ✅
- [x] Build `spawnMilestoneEntities()` to place items/NPCs/POIs at map generation
- [x] Ensure quest-critical buildings exist in target towns
- [x] Wire milestone checker into the game loop (listen for inventory changes, combat results, movement)
- [x] Connect combat milestones to the encounter system (`resolveEncounter()`)
- [x] Update the AI prompt to narrate completions instead of judging them
- [x] Redesign `NewGame.js` with tabbed layout (Templates / Custom Tale)
- [x] Template tab: read-only adventure cards grouped by theme, detail modal, tier badges
- [x] Add quest item search mechanic in BuildingModal (progressive DC dice roll)
- [x] Fix SSE text normalization and milestone marker regex for cross-chunk detection
- [x] Add LLM milestone prompt tests (Tests 6-7) to debug page
- [ ] ~~Custom tab: milestone editor with registry-backed entity pickers~~ (deferred to Phase 3+)

### Phase 3: Custom Campaign Builder & Registries
- [x] Extract quest enemies into shared data file (`questEnemies.js`) — 31 bosses, 4 themes × 2 tiers, `getEnemiesByTierAndTheme()` helper
- [x] Extract quest items into shared registry — `QUEST_ITEMS` + `SEARCHABLE_ITEMS` in `questPickerData.js`
- [x] Extract quest POIs into shared registry — `POI_TYPES` in `questPickerData.js` (10 types with terrain tags)
- [x] Build menu-driven Custom tab with registry-backed pickers (not free text) — theme, tier, enemy, item, building, NPC, POI, town/mountain name pickers
- [x] Milestone slot system: fixed dependency graph, player picks what fills each slot — 4-slot diamond `[1,2] → 3 → 4`
- [x] Add `QUEST_BUILDINGS` (14 types), `NPC_ROLES` (9 roles), `THEME_NAMES`, `THEME_DEFAULTS` registries
- [x] Per-slot town/mountain name selection feeding into `customNames` for map generation
- [x] Template modal contextual progression buttons (Generate Map → Hero Selection)
- [x] Entity validation at campaign creation time — pickers prevent invalid picks; `validateCustomSlots()` catches partial slots and requires ≥1 complete milestone; `shortDescription` auto-generated from selections
- [ ] Design team/party encounter system (separate design effort)
- [ ] Add encounter images for quest bosses

### Phase 4: Narrative Milestones
- [ ] Design NPC conversation system with gated outcomes
- [ ] Spawn quest NPCs at designated locations in specific buildings
- [ ] Build conversation UI that constrains interaction to the specific NPC
- [ ] Explore function calls as a more robust alternative to text markers
- [ ] Consider skill check gates within NPC conversations

### Phase 5: Campaign Variety & Tiers
- [x] Define tier system (Tier 1-3 with level ranges, HP/reward scaling)
- [x] Add Tier 1 templates for all 4 themes (level 1-2 content)
- [x] Add `tier`, `levelRange`, `theme`, `subtitle` fields to template data structure
- [x] Group template picker by theme with tier badges
- [x] Add Tier 3 template stubs (coming soon placeholders) for all 4 themes
- [ ] Add level-based warnings at hero selection (party too low for chosen template)
- [ ] Generate template card images for all adventures
- [ ] Flesh out Tier 3 templates with full milestone data
- [ ] AI-assisted campaign creation that outputs structured milestone data
- [ ] Player customization options (difficulty, milestone count, theme)

---

## Relationship to Existing Systems

| System | Role | Changes Needed |
|--------|------|----------------|
| `storyTemplates.js` | Defines campaigns and milestones | Add `type`, `trigger`, `requires`, `spawn`, `encounter`, `rewards` |
| `NewGame.js` | Campaign creation UI | Add milestone type editor for Custom Tale |
| `MilestoneTest.js` | Tests AI marker detection | Keep as-is for narrative milestone testing |
| `CampaignMilestoneTest.js` | Tests deterministic milestone system | Prototype for encounter + reward integration |
| `promptComposer.js` | Builds AI prompts with milestone context | **Done:** Shows Active/Completed/Locked with type tags |
| `saveController.js` | Saves game state | Should already preserve new fields via settings |
| `useGameSession.js` | Manages game session state | Wire in milestone checker events |
| `inventorySystem.js` | Tracks items and rewards | Emit events when quest items are acquired |
| `encounterController.js` | Applies encounter rewards/penalties | Handle milestone encounter outcomes |
| `encounterResolver.js` | Resolves encounter dice/combat | Feed in quest encounter definitions |
| `baseEncounters.js` | Random encounter definitions | Quest encounters use same format |
| `npcGenerator.js` | Generates NPCs with roles/stats | Generate quest NPCs from milestone spawn data |
| `mapGenerator.js` | Generates the world map | Ensure quest POIs are placed correctly |
| Town map system | Town layout with buildings | Ensure quest buildings exist in target towns |

---

## Campaign Creation Constraints

### Campaign Tiers

Themes (Heroic Fantasy, Grimdark, etc.) and difficulty tiers are **separate axes**. A theme provides narrative flavor; a tier scales enemies, HP, rewards, and level gates. This means each theme can have multiple campaigns at different power levels.

#### Tier definitions

| Tier | Level Range | Boss HP | Reward Scale | Narrative Stakes |
|------|------------|---------|--------------|-----------------|
| **Tier 1** | 1-2 | 20-40 HP | 25-75 XP, 1d10 gold | Local threats — bandits, beasts, petty villains |
| **Tier 2** | 3-4 | 100-200 HP | 100-200 XP, 2d20 gold | Regional threats — warlords, plagues, conspiracies |
| **Tier 3** | 5+ | 250-400 HP | 300-500 XP, 4d20 gold | Epic threats — demon lords, elder gods, world-enders |

#### Theme x Tier matrix

| Theme | Tier 1 (Lv 1-2) | Tier 2 (Lv 3-4) | Tier 3 (Lv 5+) |
|-------|-----------------|-----------------|----------------|
| **Heroic Fantasy** | The Goblin Threat | Crown of Sunfire | The Shattered Throne *(coming soon)* |
| **Grimdark Survival** | The Blighted Village | The Rot-Heart | The Last Winter *(coming soon)* |
| **Arcane Renaissance** | The Rogue Automaton | Herald of the Old Gods | The Clockwork God *(coming soon)* |
| **Eldritch Horror** | The Blackwood Cult | The Great Dreamer | The Drowned City *(coming soon)* |

All themes have Tier 1 and Tier 2 templates with full milestone data. Tier 3 templates exist as stubs (coming soon).

#### Why separate stories instead of scaling

A level 1 party fighting the "Shadow Overlord" with 30 HP feels wrong narratively. The story should match the stakes:
- **Tier 1:** Goblin raiders threaten the farmlands. Appropriate for new adventurers.
- **Tier 2:** A dark lord threatens the kingdom. Appropriate for experienced parties.
- **Tier 3:** A cosmic entity threatens reality. Appropriate for legendary heroes.

Scaling numbers within a single template would make the narrative incoherent. Separate templates let each story stand on its own.

#### Data structure

Each template gains a `tier` and `levelRange` field:

```javascript
{
    id: 'heroic-fantasy-t1',
    name: 'Heroic Fantasy',
    tier: 1,
    levelRange: [1, 2],
    subtitle: 'The Goblin Threat',
    theme: 'heroic-fantasy',
    // ...rest of template
}
```

The template picker groups by theme, shows tier badges, and filters by player level. Higher-tier templates are visible but locked until the player reaches the minimum level.

### Level-Gated Campaign Availability

Players should only be able to create campaigns appropriate for their level.

**Approach:**
- Each template has an explicit `tier` and `levelRange`
- The campaign picker filters available templates by the player's current level
- Higher-tier templates are visible but locked with a level indicator
- For Custom Tale mode, the milestone editor restricts available enemies, items, and reward tiers based on player level

### Item & Entity Validation (Registry Requirement)

Milestones must only reference items, enemies, NPCs, and buildings that **exist in the game's data files**. You can't spawn a "crown_of_sunfire" if there's no item definition for it. You can't spawn a "blue_dragon" if only "red_dragon" exists.

**Current state:** The test page uses placeholder IDs (e.g., `hidden_map`, `shadow_overlord`) that don't correspond to real game entities. This is fine for prototyping but will break at integration time.

**What needs to happen before the campaign builder ships:**
1. **Item registry** — All quest items must be defined in the item system (id, name, icon, description, rarity, tier)
2. **Enemy registry** — All quest enemies must be defined with stats, icons, and encounter data
3. **Building registry** — All quest-critical building types must be supported by the town map generator
4. **NPC role support** — Quest NPCs must use roles that `npcGenerator.js` can handle
5. **Validation at campaign creation** — The campaign builder validates all entity references against registries before saving. If a milestone references `crown_of_sunfire`, that item must exist.
6. **AI-generated campaigns** — When AI generates milestone data, it must pick from the existing registries, not invent new entity IDs

**Implication:** We may need to significantly expand the item, enemy, and building registries before the campaign builder can offer meaningful variety. The current item set is small; campaigns will need quest-specific items, boss-specific loot, and building types beyond what's currently available.

---

## Design Principles

1. **The game engine is the judge, the AI is the narrator.** For mechanical milestones, code checks completion. The AI describes what happens.
2. **Spawn what you need.** If a milestone requires an item, that item must exist in the game world before the player can find it. If it needs a building, that building must exist in the town.
3. **Reuse existing systems.** Combat milestones use the encounter system. Items use the inventory system. NPCs use the NPC generator. Don't build parallel implementations.
4. **Two reward layers.** Encounters give loot (fight rewards). Milestones give achievement bonuses (quest rewards). Both stack.
5. **Determinism over flexibility for core objectives.** The main campaign arc should be reliable. Emergent storytelling happens in the spaces between milestones.
6. **Progressive enhancement.** Start with mechanical milestones. Improve narrative milestones later. Don't block the whole system on the hardest problem.
7. **Test in isolation.** Use the debug page to prototype and validate before touching the main game code.
