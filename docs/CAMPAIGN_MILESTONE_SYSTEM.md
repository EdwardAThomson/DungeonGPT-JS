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

### Campaign Creator UI Additions

For Custom Tale mode, the milestone editor needs:
- A **type dropdown** per milestone (item / combat / location / narrative)
- A **prerequisite selector** (which other milestones must be completed first)
- Conditional fields based on type:
  - Item: item name, building/context where it's found
  - Combat: enemy name, difficulty, stats, suggested actions
  - Location: POI name
  - Narrative: NPC name, role, personality notes
- Location assignment (which town/area to spawn in)
- Rewards per milestone (XP, gold, items)

For template-based campaigns, these are all pre-defined and locked.

---

## Implementation Plan

### Phase 1: Foundation (Start Here)
- [x] Write this design document
- [x] Create `CampaignMilestoneTest.js` debug page for prototyping
- [x] Define milestone data structure with `type`, `trigger`, `requires`, and `spawn`
- [x] Build milestone checker logic with dependency enforcement
- [x] Test in debug page with simulated game events
- [ ] Add `encounter` and `rewards` fields to milestone data in test page
- [ ] Update `storyTemplates.js` with typed milestones for all 4 templates

### Phase 2: Spawning & Integration
- [ ] Build `spawnMilestoneEntities()` to place items/NPCs/POIs at map generation
- [ ] Ensure quest-critical buildings exist in target towns
- [ ] Wire milestone checker into the game loop (listen for inventory changes, combat results, movement)
- [ ] Connect combat milestones to the encounter system (`resolveEncounter()`)
- [ ] Update the AI prompt to narrate completions instead of judging them
- [ ] Update `NewGame.js` form with milestone type editor for Custom Tale mode

### Phase 3: Encounter Enhancements
- [ ] Add `minLevel` enforcement for boss encounters (soft or hard gate)
- [ ] Design team/party encounter system (separate design effort)
- [ ] Extract quest enemies into shared data file if warranted
- [ ] Add encounter images for quest bosses

### Phase 4: Narrative Milestones
- [ ] Design NPC conversation system with gated outcomes
- [ ] Spawn quest NPCs at designated locations in specific buildings
- [ ] Build conversation UI that constrains interaction to the specific NPC
- [ ] Explore function calls as a more robust alternative to text markers
- [ ] Consider skill check gates within NPC conversations

### Phase 5: Campaign Variety
- [ ] Add more pre-built templates with diverse milestone types
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
| `promptComposer.js` | Builds AI prompts with milestone context | Update to distinguish mechanical vs narrative |
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

## Design Principles

1. **The game engine is the judge, the AI is the narrator.** For mechanical milestones, code checks completion. The AI describes what happens.
2. **Spawn what you need.** If a milestone requires an item, that item must exist in the game world before the player can find it. If it needs a building, that building must exist in the town.
3. **Reuse existing systems.** Combat milestones use the encounter system. Items use the inventory system. NPCs use the NPC generator. Don't build parallel implementations.
4. **Two reward layers.** Encounters give loot (fight rewards). Milestones give achievement bonuses (quest rewards). Both stack.
5. **Determinism over flexibility for core objectives.** The main campaign arc should be reliable. Emergent storytelling happens in the spaces between milestones.
6. **Progressive enhancement.** Start with mechanical milestones. Improve narrative milestones later. Don't block the whole system on the hardest problem.
7. **Test in isolation.** Use the debug page to prototype and validate before touching the main game code.
