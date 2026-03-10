# Team Encounter System — Design Document

**Status:** Draft
**Phase:** 3 (Campaign Builder)
**Last updated:** 2026-03-09

---

## Problem Statement

The current encounter system is **single-hero-centric**: one hero is chosen as "champion," and they alone act, take damage, and receive rewards. The rest of the party watches. This undersells the party system — players build a team of 1-4 heroes but only use one per fight.

### Current Flow
```
Encounter triggers
  → Hero Selection (pick 1 champion, 15% initiative fail)
    → Action Phase (champion acts alone, 1-3 rounds)
      → Rewards applied to champion only
```

### Goal
Make the whole party participate in encounters without turning combat into a slow, complex mini-game. Keep it fast, keep it fun, keep it narratively rich.

---

## Design Principles

1. **Fast over deep.** A 4-hero encounter should take ~30 seconds longer than a 1-hero encounter, not 4x longer.
2. **Every hero matters.** Each party member contributes, even if they're not the "lead."
3. **Build on what exists.** Reuse the dice system, action templates, HP tracking, and multi-round state machine. Don't rebuild combat from scratch.
4. **Solo still works.** A 1-hero party must play identically to today. Zero regression.
5. **AI narrates, engine judges.** The dice and code decide outcomes. The AI describes what happened.

---

## Proposal: Lead + Support Model

### Core Concept

Each round, **one hero leads** and **the others support**. The lead hero picks a full action (Fight, Negotiate, etc.). Supporting heroes each contribute a **support action** — a simpler, passive contribution that modifies the lead's roll or adds secondary effects.

```
Round Start
  → Lead hero picks a main action (existing action buttons)
  → Each support hero auto-assigned or player-picks a support role
  → Lead rolls d20 + modifier + support bonuses
  → Outcome resolved with combined effects
  → Damage split across party based on roles
```

### Why Lead + Support?

| Alternative | Problem |
|---|---|
| **Sequential turns** (each hero acts independently) | 4x slower, complex initiative order, hard to narrate |
| **Simultaneous actions** (everyone picks full action) | Overwhelming UI, 4 dice rolls per round, outcome matrix explosion |
| **Vote/consensus** (party picks one action together) | Boring — removes individual hero identity |
| **Lead + Support** | Fast (1 main roll), meaningful (support matters), scalable (1-4 heroes) |

---

## Support Actions

Support actions are tied to hero stats/class. Each hero contributes based on what they're good at.

### Support Role Types

| Role | Stat | Effect | Narrative |
|---|---|---|---|
| **Guard** | CON/STR | Absorbs 30% of incoming damage for the lead | Shields the lead, takes hits |
| **Flank** | DEX/STR | +2 to lead's attack roll | Attacks from the side, creating openings |
| **Inspire** | CHA | +1 to lead's roll, +10% morale damage to enemy | Rallies the team, demoralizes foe |
| **Heal** | WIS | Restores 1d4+WIS_mod HP to lead after round | Patches wounds between strikes |
| **Analyze** | INT | Reveals enemy morale %, +1 to lead's roll on round 2+ | Studies patterns, calls out weaknesses |
| **Cover** | DEX | 25% chance to negate lead's damage entirely | Pulls lead out of harm's way |

### Auto-Assignment Logic

Support roles are **auto-suggested** based on highest stat, but the player can override:

```javascript
function suggestSupportRole(hero) {
  const stats = hero.stats;
  const best = Object.entries(stats).sort(([,a], [,b]) => b - a)[0];

  const statToRole = {
    Strength: 'guard',    // or 'flank' if DEX is close
    Dexterity: 'flank',   // or 'cover'
    Constitution: 'guard',
    Intelligence: 'analyze',
    Wisdom: 'heal',
    Charisma: 'inspire'
  };

  return statToRole[best[0]] || 'guard';
}
```

### Support Roll

Support heroes don't roll separately. Their contribution is **deterministic** based on their stat modifier:

```
Support bonus = floor(stat_modifier / 2)  (minimum +1)
```

This keeps combat to **one dice roll per round** — the lead's roll — while support heroes still contribute meaningfully based on their builds.

---

## Round Flow (Multi-Hero)

### Phase 1: Formation (Once per Encounter)

Replaces the current "Choose Your Champion" screen. Shows all party members and lets the player:

1. **Assign Lead** — Who takes the main action this round
2. **Assign Support Roles** — Auto-suggested, player can swap
3. **Confirm** — No initiative failure mechanic (removed; team coordination replaces individual initiative)

```
┌─────────────────────────────────────────────┐
│  ⚔️ Goblin Chieftain                        │
│  [encounter image]                          │
│  "A snarling goblin chief..."               │
│                                             │
│  ── Form Your Party ──                      │
│                                             │
│  [★ LEAD]  Thorin  (Fighter)    HP 24/24    │
│  [🛡 Guard] Elara  (Paladin)    HP 20/20    │
│  [✨ Inspire] Pip   (Bard)      HP 14/14    │
│  [🔍 Analyze] Zara (Wizard)     HP 12/12    │
│                                             │
│  (tap a hero to change role / swap lead)    │
│                                             │
│  [   Begin Encounter   ]                    │
└─────────────────────────────────────────────┘
```

### Phase 2: Action (Each Round)

Lead hero picks from available actions (same as today). Support contributions are shown as modifiers.

```
┌─────────────────────────────────────────────┐
│  Round 1 of 3           Enemy: 30/30 HP     │
│                                             │
│  Lead: Thorin (Fighter)                     │
│  Support: +2 (Flank) +1 (Inspire) +1 (Analyze) │
│  Total bonus: +4 to roll                    │
│                                             │
│  What does Thorin do?                       │
│  ┌─────────────────────────────────────┐    │
│  │ ⚔️ Fight (Athletics)               │    │
│  │ Charge the chieftain head-on        │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │ 🗣 Intimidate (Intimidation)       │    │
│  │ Demand the goblins surrender        │    │
│  └─────────────────────────────────────┘    │
│  ...                                        │
└─────────────────────────────────────────────┘
```

### Phase 3: Resolution (Each Round)

One roll. Support bonuses applied. Outcome determined. Damage distributed.

```
Roll: d20 (14) + Athletics mod (+3) + support (+4) = 21 vs DC 14
→ Success!

Damage to enemy: 20% of max HP = 6
Damage to party:
  - Thorin (lead): 4 HP (reduced from 6 by Guard)
  - Elara (guard): 2 HP (absorbed 30% of Thorin's incoming)
  - Pip (inspire): 0 HP
  - Zara (analyze): 0 HP
```

### Phase 4: Between Rounds

Player can **rotate the lead** between rounds. This lets them:
- Swap in a fresh hero if the lead is injured
- Use a different skill for a different action
- React to changing combat conditions

Support roles stay unless manually changed (reduce friction).

---

## Damage Distribution

### Current System
- Lead takes 100% of damage. Others take 0%.

### Team System

| Who | Damage Taken |
|---|---|
| **Lead** | Base damage (modified by support) |
| **Guard** | Absorbs 30% of lead's damage |
| **Flank** | 15% chance to take splash damage (half of base) |
| **Others** | 0% normally; critical failure = 25% base to all |

### Critical Failure (Team)

On a critical failure, the whole party suffers:
- Lead takes full damage + penalty
- All support heroes take 25% of base damage
- Enemy morale +20 (same as today)
- Player advantage -2 (same as today)

This creates real stakes for the whole team.

### Critical Success (Team)

On a critical success:
- 50% enemy max HP damage (up from 40% solo)
- Morale -50 (up from -40)
- Support heroes with "Heal" role restore an extra 1d6 to lead
- Bonus XP multiplier for team synergy

---

## Reward Distribution

### Current System
- Rewards go to `heroIndex` (the acting hero only)

### Team System

| Reward | Distribution |
|---|---|
| **XP** | Split evenly across all party members |
| **Gold** | Added to shared party pool (already shared) |
| **Items** | Added to shared inventory (already shared) |
| **Bonus XP** | +10% per support hero (encourages full party) |

Example: 4-hero party defeats Goblin Chieftain (75 XP base)
- Base: 75 XP
- Team bonus: +30% (3 support heroes × 10%)
- Total: 97 XP → 24 XP each (vs. 75 XP to one hero today)
- Net effect: More total XP generated, spread across party

---

## Data Model Changes

### Encounter Definition (No Changes)

Encounters don't need to change. The team system is a **combat resolution upgrade**, not a data format change. Same `suggestedActions`, `rewards`, `consequences`, `enemyHP`.

### Round State Extension

```javascript
// multiRoundEncounter.js — extended state
{
  // ...existing fields...

  // Team fields (new)
  isTeamEncounter: true,
  leadHeroIndex: 0,
  supportRoles: {
    1: { role: 'guard', bonus: 2 },     // party[1] → guard
    2: { role: 'inspire', bonus: 1 },    // party[2] → inspire
    3: { role: 'analyze', bonus: 1 },    // party[3] → analyze
  },
  teamDamageLog: [],   // Track damage per hero per round
}
```

### Support Role Registry

```javascript
// New file: src/data/supportRoles.js
export const SUPPORT_ROLES = {
  guard:   { label: 'Guard',   icon: '🛡',  stat: 'Constitution', effect: 'Absorbs 30% of lead damage' },
  flank:   { label: 'Flank',   icon: '⚔️',  stat: 'Dexterity',    effect: '+2 to lead attack roll' },
  inspire: { label: 'Inspire', icon: '✨',   stat: 'Charisma',     effect: '+1 roll, +10% morale damage' },
  heal:    { label: 'Heal',    icon: '💚',   stat: 'Wisdom',       effect: 'Restore 1d4+mod HP after round' },
  analyze: { label: 'Analyze', icon: '🔍',   stat: 'Intelligence', effect: '+1 roll on round 2+' },
  cover:   { label: 'Cover',   icon: '🏹',   stat: 'Dexterity',    effect: '25% to negate lead damage' },
};
```

---

## UI Changes

### EncounterActionModal Modifications

1. **Formation Phase** replaces hero selection
   - Grid of hero cards with role dropdowns
   - Lead hero highlighted with star
   - Tap hero card to toggle lead
   - Role auto-assigned, tappable to cycle

2. **Action Phase** shows support bonus
   - "Support: +4" summary line above actions
   - Tooltip/expand shows per-hero breakdown

3. **Round Result** shows team damage
   - Damage dealt (same as today)
   - Damage distribution table (who took what)
   - Support effects that triggered (e.g., "Elara absorbs 2 damage")

4. **Between Rounds** adds lead rotation
   - "Swap Lead?" option with hero portraits
   - Quick-tap to rotate, or skip to keep same lead

5. **Final Summary** shows team stats
   - Per-hero damage taken
   - XP split
   - MVP callout (most effective support)

### Mobile Considerations

The formation phase needs to work on small screens:
- Vertical stack of hero cards (not grid)
- Role shown as icon badge on card
- Tap card → expand to show role picker
- Swipe to cycle roles (stretch goal)

---

## Implementation Plan

### Step 1: Support Role Data
- Create `src/data/supportRoles.js` with role definitions
- Add `suggestSupportRole(hero)` helper
- Add support bonus calculation function

### Step 2: Team Round Resolution
- Extend `createMultiRoundEncounter()` with team fields
- Modify `resolveRound()` to apply support bonuses to roll
- Add team damage distribution logic
- Add team reward splitting

### Step 3: Formation UI
- Replace hero selection in `EncounterActionModal` with formation phase
- Show role assignments and lead selection
- Maintain backward compat for solo heroes

### Step 4: Round UI Updates
- Show support bonus on action phase
- Show per-hero damage on round result
- Add lead rotation between rounds

### Step 5: AI Narration Integration
- Pass team composition to AI prompt context
- Include support actions in narration prompt
- AI describes team coordination in combat narration

### Step 6: Testing & Tuning
- Balance support bonuses (currently theoretical)
- Test with 1, 2, 3, 4 hero parties
- Ensure solo play is unchanged
- Add team encounter to CampaignMilestoneTest page

---

## Edge Cases

| Case | Handling |
|---|---|
| **1-hero party** | No formation phase, no support. Identical to current system. |
| **Hero at 0 HP** | Cannot be lead or support. Grayed out in formation. |
| **All support heroes at 0 HP** | Lead fights alone (graceful degradation). |
| **Lead defeated mid-fight** | Auto-swap to highest-HP support hero. Support roles reassigned. |
| **Narrative encounters** | Support roles still apply but with narrative flavor (e.g., Guard = "watches the door") |
| **Single-round encounters** | Formation + one action. Quick but still team-flavored. |
| **Flee** | Whole party flees. Each hero rolls individually for flee damage (15% max HP each on failure). |

---

## What This Doesn't Cover (Future Work)

- **Combo attacks** — Special actions when specific class combinations support (e.g., Wizard + Fighter = "Arcane Strike"). Requires class-pair registry. Phase 5+.
- **Positioning/formation** — Front row / back row affecting who gets hit. Too complex for now.
- **Hero-specific actions** — Support heroes choosing from their own action list. Multiplies UI complexity. Deferred.
- **Split encounters** — Party splits to handle two threats simultaneously. Entirely different system.
- **Summons/companions** — Pets, familiars, summoned creatures as pseudo-party-members. Out of scope.

---

## Resolved Questions

1. **Support roles assigned at encounter start only.** Lead can rotate between rounds, but support roles stay locked. Keeps it fast.
2. **Support role types are good as-is.** Guard, Flank, Inspire, Heal, Analyze, Cover. Can revisit if testing reveals gaps.

## Open Questions

1. **Should support bonuses scale with level?** Current design uses flat stat modifiers. Could add proficiency bonus at higher tiers.
2. **Should "Analyze" reveal exact enemy HP numbers?** Currently enemy HP bar is visible. Analyze could add morale % readout.
3. **How does this interact with narrative encounters?** Support roles could map to social equivalents (Guard → "Watch the exits", Inspire → "Back up the speaker").

---

## Appendix A: Combo Attacks (Future — Phase 5+)

Special bonus actions that unlock when specific class combinations are in the party. These are **not** part of the Lead + Support MVP — they layer on top later.

### Concept

When the lead and a support hero form a recognized class pair, a **combo action** appears in the action list alongside normal actions. Combos are stronger than regular actions but require the right party composition, rewarding players who build synergistic teams.

### Combo Registry (Draft)

| Lead Class | Support Class | Combo Name | Effect |
|---|---|---|---|
| Fighter | Wizard | Arcane Strike | +4 to roll, deal magic + physical damage (35% HP) |
| Fighter | Cleric | Holy Charge | +3 to roll, heal lead 1d6 on success |
| Rogue | Ranger | Shadow Volley | +3 to roll, double morale damage |
| Wizard | Bard | Resonance Blast | +2 to roll, AoE morale damage (-30) |
| Paladin | Cleric | Divine Wrath | +3 to roll, 40% HP damage, +15% crit chance |
| Barbarian | Bard | War Cry | +2 to roll, negate all party damage this round |
| Ranger | Druid | Nature's Fury | +3 to roll, poison DoT (5% HP next 2 rounds) |
| Rogue | Wizard | Misdirection | Auto-success on flee, keep 50% loot |

### How It Would Work

```javascript
// src/data/comboAttacks.js (future)
export const COMBO_ATTACKS = {
  'fighter+wizard': {
    name: 'Arcane Strike',
    icon: '⚡',
    skill: 'Athletics',          // Lead's skill
    rollBonus: 4,
    damageMultiplier: 1.75,      // 35% HP instead of 20%
    description: 'Your wizard channels arcane energy through your blade!',
    supportRole: 'flank',        // Support hero must be in this role
  },
  // ...
};

// Lookup: sort class pair alphabetically for consistent keys
function getComboKey(leadClass, supportClass) {
  return [leadClass, supportClass].sort().join('+').toLowerCase();
}
```

### Party Synergy Hints (Hero Selection)

During hero selection, show synergy hints to nudge players toward complementary parties. This helps new players without being prescriptive.

**Where:** [HeroSelection.js](src/pages/HeroSelection.js) — below the selected heroes list

**When:** 2+ heroes selected

**What:** A small, dismissible hint showing detected synergies:

```
┌──────────────────────────────────────────────┐
│ ✨ Party Synergy                              │
│                                               │
│ Thorin (Fighter) + Zara (Wizard)              │
│ → Unlocks "Arcane Strike" combo in combat     │
│                                               │
│ Consider adding a Cleric for healing support  │
└──────────────────────────────────────────────┘
```

**Implementation sketch:**

```javascript
// src/utils/partySynergy.js (future)
export function detectSynergies(selectedHeroes) {
  const classes = selectedHeroes.map(h => h.heroClass?.toLowerCase());
  const synergies = [];

  for (let i = 0; i < classes.length; i++) {
    for (let j = i + 1; j < classes.length; j++) {
      const key = [classes[i], classes[j]].sort().join('+');
      if (COMBO_ATTACKS[key]) {
        synergies.push({
          heroes: [selectedHeroes[i].heroName, selectedHeroes[j].heroName],
          combo: COMBO_ATTACKS[key].name,
        });
      }
    }
  }

  return synergies;
}

export function suggestMissingRoles(selectedHeroes) {
  const classes = new Set(selectedHeroes.map(h => h.heroClass?.toLowerCase()));
  const suggestions = [];

  if (!classes.has('cleric') && !classes.has('paladin')) {
    suggestions.push('Consider adding a Cleric or Paladin for healing support');
  }
  if (!classes.has('wizard') && !classes.has('sorcerer')) {
    suggestions.push('A spellcaster would add Analyze support and combo potential');
  }
  // etc.

  return suggestions;
}
```

**UX notes:**
- Hints are informational, never blocking — player can pick any party they want
- Show as a collapsible card below the hero list, not a modal or popup
- Only appears when combos are actually detected or party has a clear gap
- Disappears for 1-hero parties (no synergy possible)
