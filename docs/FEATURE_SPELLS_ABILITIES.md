# Feature: Spells & class abilities

Give each class a **mechanical identity** in combat. Today a hero's class is mostly stat
flavour (`heroTemplates` in `src/data/heroData.js` sets a stat spread and a one-line
background, nothing more); level-up only recalculates HP (`progressionSystem.js`); and the
one "spell" in the game, `scroll_fireball`, is a catalog entry with `effect: 'spell',
spell: 'fireball'` that **nothing casts**. This feature adds real, **code-resolved**
abilities: the player picks "Cast Fireball", the engine rolls the dice and applies the
numbers, and the AI only narrates the result. No AI-decided outcomes, ever.

This is the **largest** feature in the current batch. It touches a new pure module, the
combat resolver and the multi-round loop, the (already large) `EncounterActionModal`,
progression, hero init/save shape, and a lot of data. **Phase it aggressively** (see
Phased rollout). The MVP is "a handful of damage/heal abilities for a few classes, used in
multi-round combat". Everything else is later.

## Player-facing behaviour

- A hero **knows abilities** determined by their class and level (derived, not hand-picked
  at creation in the MVP). At level 1 a Wizard knows Magic Missile and Shield; a Cleric
  knows Cure Wounds and Guiding Bolt; a Fighter knows Second Wind; and so on.
- Each hero has a **resource pool** (see Resource model). Casting/using an ability spends
  it. The pool shows as a small bar next to the HP bar (combat) and on the character sheet.
- **In combat** (`EncounterActionModal`), alongside the existing skill actions (Fight,
  Negotiate, etc.) the acting hero gets an **Abilities** section: one button per ability
  they know and can currently afford, each showing its cost and a short effect line
  ("Fireball - 6 MP - 3d6 fire to the enemy"). Unaffordable or level-locked abilities are
  shown disabled/greyed (so the player can see what they will unlock), or hidden in the MVP.
- Using an offensive ability rolls in code and reduces the enemy's HP / morale; a heal
  ability restores a hero's HP; a buff/debuff shifts the round's numbers (advantage, soak,
  enemy morale). The AI narrates the flavour ("you hurl a roaring ball of fire ...") but
  never decides the magnitude.
- **Out of combat** (later phase) heal/utility abilities can be used from the character
  sheet or party inventory flow, the same way healing potions already work in
  `PartyInventoryModal`.
- The resource pool **refills on rest** (reuse `shortRest`/`longRest` in `healthSystem.js`).

## Resource model (decision: a single per-hero pool)

We need a resource that gates ability use. Three options were considered:

| Option | Save shape | Fits our combat? | Verdict |
|---|---|---|---|
| **Spell slots** (5e: N slots per spell level, prepared lists, upcasting) | Heavy: nested per-level slot counts + prepared list per hero | Poor. Our combat is a single d20 roll resolved in ~3 rounds; per-level slot bookkeeping is wildly over-engineered for it. | **Rejected** |
| **Mana / MP pool** (one integer; each ability costs N; regen on rest) | Tiny: two ints (`mp`, `maxMP`), mirrors `currentHP`/`maxHP` | Good. One number to spend, trivially back-compatible, works in and out of combat. | **Recommended** |
| **Cooldowns** (each ability usable every N rounds) | Medium: per-ability timers carried in `roundState` | Weak as the *primary* gate: fights are only ~3 rounds and out-of-combat has no turn clock, so cooldowns barely bite. | Defer (good later layer for signature abilities) |

**Recommendation: a single per-hero pool**, stored as `hero.mp` / `hero.maxMP`, exactly
mirroring the existing HP fields so the save shape, the rest helpers, and the UI bar all
reuse what we already have. Flavour the pool per class group (call it **Mana** for casters,
**Focus/Stamina** for martials) but keep **one numeric mechanic** to avoid branching the
engine. Cooldowns can be added later for a few signature abilities (e.g. Barbarian Rage)
without disturbing the pool.

**Pool sizing** (proposed formula, in a new `progressionSystem` helper
`calculateMaxMP(characterClass, level, stats)`):

| Class group | Classes | `maxMP` |
|---|---|---|
| Full caster | Wizard, Sorcerer, Cleric, Druid, Warlock, Bard | `6 + (level - 1) * 2` |
| Half caster | Paladin, Ranger | `3 + (level - 1)` |
| Martial | Fighter, Barbarian, Monk, Rogue | `2 + floor((level - 1) / 2)` |

Costs are kept small (1-6) so a full caster at level 1 (`maxMP` 6) gets ~3 cheap casts or
one big one per fight, and martials get 2-3 ability uses. Tune in MVP playtest. Pool does
**not** regen mid-combat in the MVP (a long rest sets `mp = maxMP`; a short rest refills
half), so resource management is "how do I spend this fight's pool", which suits the short
combats.

## Data model

Abilities live in a **static registry**, `src/data/abilities.js` (data only, no logic),
keyed by id. They are **derived per hero from class + level**, not stored on the hero, so
there is nothing per-hero to migrate. An optional `hero.knownAbilities` (array of ids) is
reserved for a future hand-pick/learn-from-scroll path but is unset in the MVP.

```js
// src/data/abilities.js
export const ABILITY_REGISTRY = {
  fireball: {
    id: 'fireball',
    name: 'Fireball',
    class: 'Wizard',          // single class id, or an array, or 'any'
    minLevel: 5,              // gates availability via progression
    cost: 6,                  // MP/Focus spent
    target: 'allEnemies',     // 'enemy' | 'allEnemies' | 'self' | 'ally' | 'party'
    category: 'offensive',    // 'offensive' | 'heal' | 'buff' | 'debuff'
    rollToHit: true,          // offensive: roll d20 + scaleStat vs DC (reuse tiers); else auto
    scaleStat: 'Intelligence',// modifier added to the to-hit roll and (optionally) damage
    effect: {
      type: 'damage',         // 'damage' | 'heal' | 'buff' | 'debuff'
      dice: '3d6',            // CODE-resolved via dice.rollDice
      addMod: true,           // add calculateModifier(scaleStat) to the result
      status: {               // OPTIONAL, status-effect system is a separate feature (stub)
        id: 'burning', duration: 2, magnitude: '1d4'
      }
    },
    narrationHint: 'hurls a roaring ball of fire that bursts among the enemies'
  },
  // ...
};
```

Field meaning (every magnitude is **a number the code rolls**, never an AI judgement):

- `effect.type: 'damage'` -> `rollDice(dice).total + (addMod ? mod : 0)`, subtracted from
  `roundState.enemyCurrentHP` (and, optionally, a morale hit). Crit tiers scale it (below).
- `effect.type: 'heal'` -> rolled amount fed to `applyHealing(target, amount)`.
- `effect.type: 'buff'` -> a numeric effect on the caster's side for this fight, e.g.
  `{ kind: 'soak', amount: 2, duration: 1 }` (flat damage soak next round, reuses the
  armour-soak path) or `{ kind: 'toHit', amount: 2, duration: 1 }`.
- `effect.type: 'debuff'` -> a numeric effect on the enemy, e.g.
  `{ kind: 'morale', amount: 20 }` or `{ kind: 'enemyToHit', amount: -2, duration: 1 }`.
- `effect.status` -> handed to the **status-effect stub** (see dependency section). In the
  MVP it resolves to an immediate one-shot numeric proxy so the ability still does something
  deterministic; when the real status system lands, the same field feeds a queued effect, no
  data migration.

Resolution lives in a new pure module **`src/game/abilities.js`** (no React, no I/O, same
shape as `equipment.js`):

- `getUnlockedAbilities(characterClass, level)` -> ability defs from the registry whose
  `class` matches and `minLevel <= level`.
- `getKnownAbilities(hero)` -> `getUnlockedAbilities(hero.characterClass, hero.level)`
  (or `hero.knownAbilities` if ever set). Returns `[]` for old heroes with no class/level.
- `canUseAbility(hero, ability)` -> `(hero.mp ?? 0) >= ability.cost`.
- `resolveAbility(ability, caster, context)` -> the math. `context` carries `roundState`
  (enemy HP/morale) and/or a target hero. Returns a plain result object:
  `{ mpSpent, enemyDamage, enemyMoraleDelta, selfHeal, targetHeal, buff, debuff,
  statusApplied, rollResult, narrationHint }`. The caller applies it. Pure and unit-testable
  (mock `dice`).
- `spendMp(hero, cost)` -> new hero with `mp` reduced (never below 0).

**Crit scaling** reuses the existing tier logic: for `rollToHit` abilities, roll
`rollCheck(mod)` vs `DIFFICULTY_DC[encounter.difficulty]`; `criticalSuccess` -> damage x1.5
(or max dice), `success` -> full rolled, `failure` -> half (a glancing cast), `criticalFailure`
-> fizzle (cost still spent, minimal/no effect). Auto-hit abilities (heals, self-buffs)
skip the roll and always apply.

## Per-class starter kits

Concrete kits for the 12 classes in `heroData.js`. Numbers are anchored to the small HP pool
(base 5-30, scaling with level) and the cheap MP costs above. `L` = `minLevel`,
cost in MP/Focus. MVP ships the **bold** classes first; the rest land in Phase 2.

**Wizard** (Mana, INT)
- Magic Missile - L1, 2 - enemy, 2d4 force, auto-hit (+INT)
- Shield - L1, 2 - self buff, +2 soak next round
- Frost Bolt - L3, 3 - enemy, 2d6 cold + `chilled` (enemy -2 to-hit 1 round)
- Fireball - L5, 6 - allEnemies, 3d6 fire (+INT) + `burning` (1d4 next round)

**Cleric** (Mana, WIS)
- Cure Wounds - L1, 2 - ally/self heal, 2d4 + WIS
- Guiding Bolt - L1, 3 - enemy, 2d6 radiant (+WIS)
- Bless - L1, 2 - self buff, +2 to-hit next round
- Mass Heal - L5, 6 - party heal, 2d4 each

**Fighter** (Focus, STR)
- Second Wind - L1, 2 - self heal, 1d10 + level
- Power Attack - L1, 2 - self buff, next attack +1d6 damage (spend before Fight)
- Rally - L3, 3 - party buff, +1 to-hit next round
- Action Surge - L5, 4 - self, resolve an extra Fight action this round

**Barbarian** (Focus, STR)
- Reckless Attack - L1, 2 - self buff, advantage on next attack (and +2 incoming)
- Intimidating Roar - L1, 2 - enemy debuff, -20 morale
- Rage - L3, 4 - self buff, +1d4 damage and 2 soak for 2 rounds (signature; cooldown later)

Druid (Mana, WIS): Thorn Whip L1/2 enemy 1d6+WIS; Healing Word L1/2 ally heal 1d4+WIS;
Entangle L3/3 enemy `restrained` debuff; Moonbeam L5/5 enemy 3d6.
Sorcerer (Mana, CHA): Chaos Bolt L1/2 enemy 2d4+CHA; Shield L1/2 self soak; Scorching Ray
L3/4 enemy 3d4; Fireball L5/6 allEnemies 3d6.
Warlock (Mana, CHA): Eldritch Blast L1/2 enemy 1d10+CHA; Hex L1/2 enemy debuff -2; Dark
Mending L3/3 ally heal 2d4; Hunger of Hadar L5/5 allEnemies 3d6.
Bard (Mana, CHA): Vicious Mockery L1/2 enemy 1d4 + -2 to-hit; Inspire L1/2 ally buff +2;
Cure L3/3 ally heal 2d4; Shatter L5/5 allEnemies 3d6.
Paladin (Focus, CHA/STR): Lay on Hands L1/2 ally heal 1d8+level; Divine Smite L2/3 next
attack +2d8 radiant; Shield of Faith L3/3 self +2 soak.
Ranger (Focus, DEX): Hunter's Mark L1/2 enemy debuff (your attacks +1d6 vs it); Cure Light
L3/3 self heal 1d8; Volley L5/4 allEnemies 2d6.
Rogue (Focus, DEX): Sneak Attack L1/2 enemy +2d6 if you have advantage; Cunning Dodge L1/2
self +3 soak next round; Feint L3/3 enemy debuff -2.
Monk (Focus, DEX): Flurry of Blows L1/2 enemy +2 strikes (1d4 each); Patient Defense L1/2
self +3 soak; Stunning Strike L5/4 enemy + `stunned` (skip a round).

## Integration: where the math hooks in

**Multi-round combat** (`src/utils/multiRoundEncounter.js`) is the primary surface. Today
`resolveRound(roundState, playerAction)` calls `resolveEncounter`, then derives
`enemyDamage` from the outcome tier as a **percentage of `enemyMaxHP`**. For an ability
action we branch:

1. `EncounterActionModal` passes the chosen action; an ability button carries
   `action.ability = <id>` (plus its `label`/`skill` so existing rendering still works).
2. In `resolveRound`, if `action.ability` is set, call `resolveAbility(ability, caster,
   { roundState })` instead of the percentage-tier path. Apply the returned numbers:
   `enemyCurrentHP -= enemyDamage`, `enemyMorale += enemyMoraleDelta`, apply `buff`/`debuff`
   to `roundState` (new optional fields `playerSoak`, `enemyToHitMod`, `playerToHitMod`,
   carried one round), and `spendMp(caster, cost)`. Healing/ally abilities update the target
   hero (returned to the modal for `onCharacterUpdate`).
3. The existing resolution checks (`enemyCurrentHP <= 0`, morale, advantage) are unchanged,
   so abilities feed the same victory/defeat conditions.

**Buff/soak reuse:** `resolveEncounter` already subtracts `equipBonuses.defense` from
`hpDamage`. Add the round's `playerSoak` to that subtraction, and add `playerToHitMod` to
`modifier`, so spell buffs ride the existing damage/roll path rather than a parallel one.

**Single-round** (`resolveEncounter`): support the same `action.ability` branch for
non-multi-round encounters (lower priority; most ability use is in multi-round fights).

**Resource init / regen:** extend `progressionSystem.initializeProgression` and `awardXP`
to set/raise `mp`/`maxMP` via `calculateMaxMP` (parallel to the existing `maxHP` recalc on
level-up). Add `mp`/`maxMP` to `healthSystem.shortRest`/`longRest` (half / full). Lazily
initialize `mp`/`maxMP` on load for old saves (the same pattern as `initializeHP`).

## Combat action UI

In `EncounterActionModal.js`:

- Compute `abilityActions = getKnownAbilities(currentCharacter)` and render them in a new
  **Abilities** group under the existing `action-buttons` block. Each button shows name,
  cost, and effect line; `disabled` when `!canUseAbility` (or below `minLevel` if we show
  locked ones). Clicking routes through the existing `handleAction(action)` with
  `action.ability` set, so the resolve/round/result flow is reused.
- Add an **MP/Focus bar** beside the existing HP bar (clone the `encounter-hp-bar` block;
  read `currentCharacter.mp`/`maxMP`). On a successful ability, deduct MP locally and via
  `onCharacterUpdate` (mirrors how `applyDamage` is wired today).
- Ally/party-target abilities (heals) need a small target picker; in the MVP restrict heal
  to **self only** to avoid new picker UI, and add ally-targeting in Phase 2.

Out of combat, surface heal/utility abilities through the `PartyInventoryModal`-style "use
on ..." flow (Phase 3), reusing `applyHealing` and the `onUseItem` callback shape.

## Dependency: the status-effect system (separate feature)

`docs/OUTSTANDING_ISSUES.md` #28 ("No conditions / status effects") is a **separate,
not-yet-built** feature. Several abilities above want statuses (burning, chilled, stunned,
restrained, hexed). To avoid blocking on it:

- **Keep the `effect.status` field in the data model now** (id, duration, magnitude) so no
  data migration is needed when the real system lands.
- **Stub it with an immediate numeric proxy in the MVP.** A tiny `applyStatusStub(target,
  status, context)` resolves a status to a one-shot deterministic number *now*:
  `burning` -> add `magnitude` rolled damage to `enemyDamage` immediately; `chilled` /
  `hexed` -> apply the debuff as a one-round `enemyToHitMod`; `stunned` -> set a
  `roundState.enemySkipsNext` flag (enemy deals no return damage next round);
  `restrained` -> morale/advantage nudge. No persistent condition tracking yet.
- Also store the status on `target.statuses = [...]` (additive array, ignored by current
  math) so when the real engine arrives it can take over tick/duration handling and the
  proxy can be deleted. Renderers must tolerate a missing `statuses` field (old saves).

## Tests

New `src/game/abilities.test.js`:
- `getUnlockedAbilities` gates by class and `minLevel` (Wizard L1 lacks Fireball, gains it
  at L5; a Fighter never sees Wizard abilities).
- `canUseAbility` true/false across the MP threshold; old hero with no `mp` -> false,
  `getKnownAbilities` still returns the class list but every button is unaffordable.
- `resolveAbility` damage = `rollDice(dice).total + mod` (mock `dice` for determinism);
  heal clamps to `maxHP` via `applyHealing`; cost is spent; crit tiers scale damage
  (crit success > success > failure; crit failure fizzles but still spends MP).
- Status stub returns the expected one-shot proxy (burning adds damage, stun sets the flag).
- `calculateMaxMP` per class group and per level; `spendMp` floors at 0.

`multiRoundEncounter.test.js` additions:
- An ability action reduces `enemyCurrentHP` by the **rolled** amount, not the
  percentage-of-maxHP tier amount.
- A self-buff (soak) reduces the player damage taken next round.
- MP is deducted across rounds and a hero out of MP can no longer pick the ability.

Back-compat regression: a hero with no `mp`/`maxMP`/`knownAbilities` runs the full combat
flow exactly as today (no ability buttons, no MP bar, identical numbers).

## Back-compat

- Old heroes (no `mp`/`maxMP`) behave exactly as today: `getKnownAbilities` may list class
  abilities but `canUseAbility` is false for all (pool is 0/undefined), so the UI shows them
  disabled or hidden, and combat math is untouched. Lazily initialize `mp`/`maxMP` on load
  (like `initializeHP`) so a resaved old hero gains a pool going forward.
- Abilities are **derived from class + level**, so there is no per-hero ability list to
  migrate. `knownAbilities` is optional and unset by default.
- `effect.status` rides inside the static registry, not in saves; `target.statuses` is an
  additive optional array that old saves simply lack (renderers fall back to none).
- The existing `scroll_fireball` catalog item is left as-is in the MVP; routing it through
  the casting system (consume scroll -> cast Fireball at 0 MP) is a Phase 3 tidy-up.

## Non-goals

Spell slots / prepared-spell lists / upcasting; concentration; reactions and readied
actions; the full status-effect engine (we only stub it); AoE positioning, line/cone shapes,
or friendly fire (AoE just hits "all enemies"); enemy spellcasting (enemies stay abstract
HP + morale); ability crafting/learning from scrolls beyond the reserved `knownAbilities`
hook; rebalancing the HP/damage economy; multiclassing; verbal/somatic/material components
or any item-consumption cost beyond MP.

## Phased rollout

**Phase 0 - plumbing (small).** Add `mp`/`maxMP` to hero init, level-up, and rest; lazy
init on load; `calculateMaxMP`; the MP bar in the encounter modal and on the character
sheet. Create `src/data/abilities.js` (registry) and `src/game/abilities.js`
(`getUnlockedAbilities`, `canUseAbility`, `spendMp`) with tests. No combat effect yet.

**Phase 1 - MVP (the bulk of the value).** Ship **damage + self-heal** abilities for a few
representative classes (**Wizard, Cleric, Fighter, Barbarian**) used in **multi-round
combat**. Implement `resolveAbility` (damage/heal/self-buff + crit scaling), the
`resolveRound` ability branch, the Abilities button group, MP deduction. Status = immediate
numeric proxy. Heal is self-only (no target picker). This is where the deterministic combat
identity actually arrives.

**Phase 2 - full kits.** All 12 class kits; buffs/debuffs via `roundState` soak / to-hit /
morale fields; ally + party targeting (target picker); single-round `resolveEncounter`
support.

**Phase 3 - polish + dependencies.** Integrate the real status-effect system (#28) behind
the existing `effect.status` field (delete the proxy); add cooldowns for signature abilities
(Rage, Action Surge); out-of-combat heal/utility via the inventory-style flow; route
`scroll_fireball` through casting; optional learn-from-scroll (`knownAbilities`).

**Cost (honest).** Phase 0 is a day-ish of plumbing. Phase 1 is the expensive part: it
edits the already-large and stateful `EncounterActionModal` and the combat resolver, plus a
new module and a wide test surface. Budget Phase 1 as the single biggest item in this batch.
Phases 2-3 are additive but Phase 3's status integration is gated on a feature that does not
exist yet.

## Open questions

1. **Resource flavour:** one pool reskinned per class (Mana vs Focus), or genuinely
   different mechanics for martials? Recommendation keeps one mechanic; confirm that is OK.
2. **Should martials have a resource at all,** or use pure cooldowns? (Cleaner identity vs a
   second system to build.)
3. **Regen rate:** long rest = full, short rest = half, nothing mid-combat. Acceptable, or
   do we want a small per-round regen so abilities feel usable every fight?
4. **To-hit vs auto-hit** for offensive spells: roll d20 (reuses tiers, can miss/crit) or
   auto-hit with dice damage only? The doc assumes roll-to-hit; confirm.
5. **Enemies have no actions/abilities today** (just HP + morale). Do we ever want enemy
   spells, or is one-sided player ability use fine for now?
6. **Multi-target / ally targeting UI:** acceptable to ship MVP as self-heal-only and
   "all enemies" with no picker, adding a picker in Phase 2?
7. **AoE on a single abstract enemy:** "all enemies" currently means one enemy HP bar.
   Should AoE just hit harder, or do we need multiple enemies first (bigger combat rework)?
8. **`scroll_fireball`:** retire it into the casting system, or keep scrolls as a separate
   consumable path that anyone can use regardless of class?
9. **Where does the ability list live for the character sheet** (HeroModal) so players can
   see what they will unlock before combat?
</content>
</invoke>
