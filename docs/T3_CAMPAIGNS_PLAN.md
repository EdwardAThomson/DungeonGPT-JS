# Tier-3 Campaigns & Combat-Depth Program

Status: DESIGN ONLY, no implementation. Planning pass, 2026-07.

This plan started as "author the four t3 campaign stubs" and grew, through maintainer
review, into the combined program it actually is: t3 content is the destination, but
getting there requires fixing combat depth first (bosses that hit back, party combat,
a real gear ladder, an XP economy that reaches the t3 entry level), all tuned through
a balance-sim harness. Sections 1-3 are the audit; sections 4-8 are the program design;
section 9 is the build order.

Related docs: `QUEST_CHAINING_PLAN.md` (same-world sequels are the end goal, t3 is the
destination of chaining), `PREMIUM_ACCOUNTS_PLAN.md` (tier ladder: "higher-tier campaign
content" is a Members perk), `CAMPAIGN_MILESTONE_SYSTEM.md`, `ENCOUNTER_SYSTEM.md`
(Phase 5 team combat, the core dependency of this program).

All numbers in this doc were verified against code, and the win-rate figures come from
an offline Monte-Carlo (200k trials per scenario) that replicates the exact resolution
rules in `encounterResolver.js` / `multiRoundEncounter.js` / `healthSystem.js`.

Changelog:
- 2026-07-03: amended after maintainer playtest review. Corrected two overstated claims
  (the "enemyHP is cosmetic" and "bosses deal zero damage" phrasings, sections 3.1-3.2),
  added the gear-inventory, boss-ladder, XP-economy, and team-combat-connection analyses
  (sections 2.1, 5-7), and replaced the 4-step build order with the 5-step combat-depth
  program (section 9). Backlog rows #43-#46 added to `OUTSTANDING_ISSUES.md`.
- 2026-07-03 (later, Part II added): full Lv 1-7 progression-curve audit (sections
  11-17): the leveling-power finding (level moves boss win rates by ZERO percentage
  points), the level-up max-HP bug, an obtainability audit that corrects two Part I
  numbers (the "+9 best case" is unreachable; the +2 weapon is unobtainable), the
  low-end verdict (Lv 1-2 is the healthiest band, the deserts are Lv 4-7), the
  level-band table, the progression-lint design, and build-order amendments.
  Backlog rows #47-#50 added to `OUTSTANDING_ISSUES.md`.
- 2026-07-03 (later still, section 18 added): the #47 decision memo. Four options for
  HOW levels should grant combat power (level term into the resolver / wire the
  dormant ASI system / hybrid / intentional status quo), each with exact-enumeration
  win-rate projections at Lv 1/3/5/7 vs DC 15/18/20/25, a decision table, and a
  staged recommendation (A now, B later). Decision needed before step 2 of section 9.

---

## 1. Current state: the four t3 stubs

`src/data/storyTemplates.js:975-1018`. Each stub has exactly seven fields:
`id`, `theme`, `tier: 3`, `levelRange: [5, 7]`, `name`, `subtitle`, `icon`,
`description`, `comingSoon: true`. Nothing else.

| id | subtitle | icon | premise (from `description`) |
|---|---|---|---|
| `heroic-fantasy-t3` (L975) | The Shattered Throne | ⚔️ | Civil war tears the kingdom apart; reunite the realm |
| `grimdark-survival-t3` (L987) | The Last Winter | 💀 | The sun is dying, the world freezes |
| `arcane-renaissance-t3` (L998) | The Clockwork God | 🔮 | A thinking machine wants to reshape the world |
| `eldritch-horror-t3` (L1009) | The Drowned City | 🐙 | A risen city; those who enter hear singing |

**Missing vs a playable template** (reference shape: `heroic-fantasy-t2`,
`storyTemplates.js:115-205`):

- `customNames` (`{ towns: [...], mountains: [...] }`), consumed at map-gen time
- `settings.shortDescription` (the preview-modal blurb, NewGame.js:510)
- `settings.campaignGoal`
- `settings.milestones[]` (t1/t2 use 4 each): per milestone `id`, `text`, `location`,
  `type` (item/talk/narrative/location/combat), `requires`, `trigger`, `spawn`,
  `building`, `rewards { xp, gold, items }`, `minLevel`
- the finale `encounter` block on the combat milestone: `name`, `icon`, `image`,
  `encounterTier: 'boss'`, `difficulty`, `multiRound: true`, `enemyHP`,
  `suggestedActions` (3 actions with varied skills), `consequences` (4 tiers),
  `rewards` (with the bespoke finale item)
- tone settings: `grimnessLevel`, `darknessLevel`, `magicLevel`, `technologyLevel`,
  `responseVerbosity`
- a `premium` flag decision (see section 8)

**What already exists beyond the stubs:** template card art for all four
(`public/assets/templates/*-t3.webp`) and a large unused boss-art library
(`public/assets/encounters/bosses/`: `warlord`, `fallen_paladin`, `blood_wendigo`,
`plague_lord`, `arcane_colossus`, `rune_golem`, `void_leviathan`, `psionic_devourer`,
`worm_that_walks`, `lich`, `dragon_wyrm`, `leyline_dragon`, ...).

**How the stubs render today: they don't.** `NewGame.js:747` filters the picker to
`t.tier === 1` only, so t2 and t3 templates never appear anywhere in the UI. The
`comingSoon` handling (`NewGame.js:659-711`: grayed card, no click handler, "COMING
SOON" ribbon, no details button) is dead code for t3 until a higher-tier surface
exists. Premium gating: `isTemplatePremium` (`src/game/entitlements.js:64-68`) returns
false for the stubs (no `premium: true` flag, no `settings.theme`), so if they were
surfaced they would be free, locked only by `comingSoon`. **Authoring t3 content is
therefore necessary but not sufficient: it also needs an entry point**, which is
exactly Quest Chaining Phase 2 ("Continue your legend" picker) per
`QUEST_CHAINING_PLAN.md` section 6.

---

## 2. Progression math: can a party reach Lv 5-7?

XP thresholds (`src/utils/progressionSystem.js:7-28`): Lv2 = 300, Lv3 = 900,
Lv4 = 2,700, **Lv5 = 6,500, Lv6 = 14,000, Lv7 = 23,000**.

Who gets XP matters: milestone rewards go to the **lead hero only** (`Game.js:388-389`),
encounter rewards go to the **acting hero only**
(`encounterController.js:75-103`, `applyEncounterOutcomeToParty` writes one hero).

Authored campaign totals (milestone `rewards.xp` sums from `storyTemplates.js`):

| Campaign | Milestone XP | Boss encounter XP (per success round, see quirk below) |
|---|---|---|
| heroic t1 | 150 | 75/round, boss `enemyHP: 30`, medium |
| heroic t2 | 750 | 500/round, `enemyHP: 250`, deadly |
| grimdark t2 | 550 | 350/round, `enemyHP: 150`, hard |
| arcane t2 | 625 | 450/round, `enemyHP: 200`, deadly |
| eldritch t2 | 675 | 500/round, `enemyHP: 300`, deadly |

Multi-round XP quirk: each successful round pays the FULL `encounter.rewards.xp`
(`multiRoundEncounter.js:161-168`, sums `result.rewards.xp` across rounds; victory
multiplies by 1.2, `:196-197`). A 3-success t2 boss kill pays up to 1,800 XP, a
1-success win pays 600. Authored boss XP is therefore a 1x-3.6x range, not a number.

**Conclusion: t1 + t2 leaves the lead hero at roughly 1,700-3,200 XP, i.e. Lv 3, Lv 4
on a good run.** Lv5 (6,500) needs ~70-90 additional medium encounters (50 XP base,
level-scaled down by `calculateEncounterXP`, `progressionSystem.js:235-253`) plus side
quests. The [5,7] entry range is not reachable from authored content alone. This
matches `QUEST_CHAINING_PLAN.md:312-317` ("verify t1-exit level... add a renown bonus")
and `PREMIUM_ACCOUNTS_PLAN.md:46-47` ("t1/t2 campaigns naturally top out ~Lv 4-5").

Options (pick one, decide with maintainer):
1. **Lower t3 entry to `levelRange: [4, 6]`** and set boss `minLevel: 5`. Cheapest,
   matches where parties actually land.
2. **Renown XP bonus on campaign completion** (already proposed in the chaining plan):
   e.g. +500 XP on t1 completion, +2,500 on t2, tuned so a two-campaign veteran sits
   at ~Lv 5.
3. Raise t2 milestone XP going-forward (safe: milestones are snapshotted per save).

Recommendation: 1 + 2 together, sized via the sim harness's expected-XP output.

### 2.1 XP economy and the content budget (added 2026-07-03)

The Lv-5 gap is not just a numbers problem, it is a content-volume problem. What a
world can actually pay out today:

- **Authored campaigns**: t1 + t2 leaves the lead hero at roughly 1,700-3,200 XP
  (table above) vs the 6,500 needed for Lv 5 (`progressionSystem.js:12`,
  `XP_THRESHOLDS`).
- **Side quests**: the pool holds 30 quests (`src/data/sideQuests.js:43`,
  `SIDE_QUESTS`). Per-quest total XP (objective steps + turn-in reward) runs 30-400,
  median ~140; the fetch/scout quests pay 80-180 and the three site-combat quests
  (Cave Tyrant, Wraith Lord, Arcane Horror) pay 270-400. But only **2-4 quests are
  selected per world**, scaled to town count
  (`NewGame.js:390`, `sideQuestCount = Math.min(4, Math.max(2, townCount))`;
  `questEngine.js:71`, `selectSideQuests`), so side quests add roughly 200-600 XP to
  a typical world. That narrows the gap; it does not close it.

**Healthiest fix: more content, not inflated numbers.**
1. **Side-quest pool expansion** plus backfilling side quests into in-progress saves
   (`FEATURE_SIDEQUEST_BACKFILL.md` covers the backfill mechanism; the pool itself
   also needs new entries so 2-4 picks per world can grow).
2. **Same-world sequels** per `QUEST_CHAINING_PLAN.md`, so a party's XP carries
   across chapters instead of each campaign being an island.
3. **XP-budget audit tool**, added to the sim tooling (section 4): sum the obtainable
   XP per generated world (milestones + selected side quests + expected encounter XP)
   and compare it against the next tier's entry threshold, so "can a party actually
   reach t3" becomes a computed number, not a guess.

Adjunct (not instead of content): lower the t3 entry to `levelRange: [4, 6]` (option 1
above), which meets parties where the current economy actually leaves them.

---

## 3. Combat winnability: the deterministic model, end to end

The maintainer's concern ("we have to test the fights so we know whether they're
winnable, with/without gear") is well founded. The full resolution path is
deterministic code plus `Math.random`; **the LLM is nowhere in it**.

### 3.1 The resolution pipeline (all inputs that decide a boss fight)

1. **Acting hero**: ONE hero fights the whole boss fight
   (`EncounterActionModal.js:62-77, 132-140`). With a multi-hero party there is a 15%
   "initiative failed" chance that a random other living hero is forced to act instead
   (`:94-121`).
2. **Modifier**: `floor((stat - 10) / 2)` (`rules.js:8-10`) for the stat behind the
   chosen action's skill (`SKILLS` map, `rules.js:15-35`), plus weapon `attack` bonus
   if the stat is Strength/Dexterity OR the encounter name matches a hostile keyword,
   plus accessory `misc` bonus always (`encounterResolver.js:10-13, 43-50`;
   `equipment.js:67-82`).
3. **Roll**: d20 + modifier vs `DIFFICULTY_DC` (`src/data/encounters/difficultyDc.js`:
   trivial 5 / easy 10 / medium 15 / hard 20 / **deadly 25**). Natural 20/1 are
   crit success/failure (`dice.js` `rollCheck`; advantage exists in `rollCheck` but is
   never used by this path).
4. **Multi-round loop** (`multiRoundEncounter.js`, `maxRounds: 3`):
   - Enemy HP bars are real and deplete round by round (`:117`,
     `enemyCurrentHP -= enemyDamage`), and victory does check `enemyCurrentHP <= 0`
     (`:125-127`). But the damage dealt to the enemy each round is a **percent of its
     max HP**: crit 40%, success 20%, failure 5%, crit-failure 0%
     (`multiRoundEncounter.js:96-117`). **So max-HP size does not affect
     rounds-to-kill**: 30 HP and 300 HP bosses die in the same number of successes,
     and the tier legend (`storyTemplates.js:8-10`, "Tier 3 boss HP 250-400") buys
     zero difficulty. The DC (`difficulty`) is the only difficulty knob.
     *Open design question (2026-07-03): should enemy damage become flat-per-success
     (e.g. weapon dice + modifier vs a real HP pool) so big monsters genuinely take
     longer to kill? That would make `enemyHP` a second tuning knob and make the HP
     legend honest; it interacts with `maxRounds: 3`, which would need to scale.*
   - Advantage: +2 / +1 / -1 / -2 per tier; morale: -40 / -20 / +10 / +20.
   - Resolution (`:124-140`): victory if enemy HP ≤ 0 (needs cumulative 100%, i.e.
     crit+crit+success minimum) or morale ≤ 0; **defeat if advantage ≤ -3** (three net
     failures, or crit-fail + fail); after round 3, victory iff advantage > 0, else
     stalemate. Tactical Retreat exits as 'escaped'.
   - So in practice **a boss fight is "score at least 2 successes in 3 rolls"**.
5. **Hero HP: the two-path rule, stated precisely (corrected 2026-07-03).** Two
   different gates share the same keyword list, and they must not be conflated:
   - *Weapon-bonus gate* (`encounterResolver.js:12-13`, `isCombatAction`): a weapon's
     attack bonus applies when the chosen action's stat is PHYSICAL
     (Strength/Dexterity) OR the encounter name matches `shouldDealDamage`'s keyword
     list.
   - *Incoming-damage gate* (`encounterResolver.js:78`): the hero takes HP damage
     ONLY when the encounter name matches the keyword list
     (`healthSystem.js:134-139`: goblin, wolf, bandit, spider, bear, ambush, attack),
     regardless of which action was chosen. Damage is a percent of the HERO's maxHP
     scaled by difficulty (`healthSystem.js:38-73`), minus flat armor soak
     (`encounterResolver.js:81`). Acting hero at 0 HP forces defeat
     (`EncounterActionModal.js:158-169`).

   **Consequence: 9 of the 10 template bosses can be fought entirely DAMAGE-FREE.**
   Of the ten authored milestone bosses (Goblin Chieftain, Shadow Overlord, Sandstorm
   Cult Leader, The Hoarfrost Wraith, Blightspawn, The Rot-Heart, Rogue Automaton,
   Herald of the Old Gods, The Hooded Priest, The Great Dreamer, all verified in
   `storyTemplates.js`), only "Goblin Chieftain" matches a keyword ("goblin"). The
   other nine never touch hero HP, no matter what the player picks; choosing
   non-physical actions (Persuasion, Arcana, Medicine, ...) additionally sidesteps
   nothing but the weapon bonus. A boss defeat costs only reduced XP and some gold,
   so the low-win-rate bosses (0.7% deadly, section 3.2) degrade into **safe
   infinite-retry loops** rather than actual walls.

   **Fix direction (decided 2026-07-03): put an explicit damage profile on the
   encounter data** (e.g. `dealsDamage: true` or damage dice per boss) and drop the
   keyword matching entirely. Name-substring matching is the wrong layer for a combat
   rule and can never cover authored boss names.
6. **Outcome plumbing**: victory fires the combat milestone
   (`Game.js:1015-1020` via `checkMilestoneEvent({ type: 'enemy_defeated' })`); loot is
   rarity-gated by campaign tier (`encounterResolver.js:264-270`,
   `inventorySystem.js:279-284`).
7. **Narration**: `encounterResolver.js:70-72` uses the authored consequence string
   directly, "fully local, no AI calls". The AI narrates around the fight in chat, it
   never decides it.

### 3.2 Measured win rates (Monte-Carlo of the exact rules, 200k trials each)

| Scenario | Win | Defeat | Stalemate | Notes |
|---|---|---|---|---|
| t1 Goblin Chieftain, medium DC 15, Lv2 mid gear (+3) | **40%** | 19% | 41% | ~2.4 HP lost/attempt (hostile) |
| t2 Shadow Overlord, deadly DC 25, Lv5 mid gear (+5) | **0.7%** | 86% | 13% | success only on nat 20 |
| t2 deadly DC 25, best-in-game gear (+9: 18 stat, +2 weapon, +3 artifact) | **15%** | 44% | 41% | |
| t2 Rot-Heart, hard DC 20, Lv4 mid gear (+5) | **21%** | 37% | 43% | |
| Hypothetical t3 deadly DC 25, Lv7 best case (+10) | **21%** | 37% | 43% | |
| DC sweep at Lv6 mid gear (+6) | DC 18 → 40%, DC 19 → 33%, DC 20 → 27%, DC 22 → 15% | | | |

**Headline findings:**
- The three t2 "deadly" bosses are effectively unwinnable per attempt at their intended
  level (0.7% mid-gear, 15% with the best gear in the game). Players win them today by
  free retry-grinding (~30-140 expected attempts), which is exactly the "we never
  tested the fights" smell.
- `enemyHP` is real but does not scale difficulty (enemy damage is percent-of-max,
  section 3.1.4); `difficulty` (the DC) is the ONLY difficulty knob, and the jump
  from hard (20) to deadly (25) crosses from "tense" to "lottery".
- Stalemate is the most common outcome at ~40% in nearly every tuned fight; worth a
  design look (e.g. stalemate could re-offer the fight immediately with carried enemy
  HP, or maxRounds could scale for bosses).
- For t3, DC 18-20 with mid gear at Lv 5-6 lands in the healthy 27-40% band; deadly 25
  should NOT be the default t3 boss difficulty under current mechanics.

### 3.3 Feasibility of a simulation harness: YES, cleanly

The entire path (`resolveEncounter` → `resolveRound` → `generateEncounterSummary`) is
pure JS with no React, no network, no LLM. `resolveEncounter` is async but never awaits
I/O. The ONLY non-determinism is global `Math.random` (dice rolls, damage variance,
loot chance, the modal's initiative roll, which lives in UI and is skipped by driving
the pure functions directly). Nothing needs stubbing except seeding the RNG.

---

## 4. Balance-sim harness design (`src/game/balanceSim.js`, design only)

A pure module, colocated test, no new dependencies.

### 4.1 API sketch

```js
// Build a canonical sim hero. Loadouts are named gear presets:
//   none: no equipment
//   mid:  magic_weapon (+1) + studded_leather (+2 def) + enchanted_trinket (+1)
//   full: legendary_weapon (+2) + dragonscale_plate (+4 def) + crown_of_sunfire (+3)
buildSimHero({ level, characterClass = 'Fighter', primaryStat = 16, loadout = 'mid' })
// -> hero with stats, maxHP via progressionSystem.calculateMaxHP, inventory+equipment

// Monte-Carlo one encounter block (the authored `encounter` object from a template).
simulateEncounter(encounter, hero, {
  runs = 5000,
  seed = 1,                    // deterministic PRNG (mulberry32)
  settings = { tier },         // for loot gating parity
  policy = 'best-modifier'     // or 'random' | 'fixed:<label>'
})
// -> {
//   winRate, defeatRate, stalemateRate, escapeRate,
//   meanRounds, meanHeroHpLoss, koRate,           // TPK proxy: acting hero at 0 HP
//   expectedXp, expectedGoldDelta,                 // makes authored numbers honest
//   expectedAttemptsToWin                          // 1 / winRate
// }

// Sweep helper for authoring: matrix across levels x loadouts.
sweepEncounter(encounter, { levels = [5, 6, 7], loadouts = ['none', 'mid', 'full'] })
```

### 4.2 Implementation notes

- **Drive the real code**: `createMultiRoundEncounter` / `resolveRound` /
  `generateEncounterSummary` for `multiRound` blocks, `resolveEncounter` otherwise, so
  the sim can never drift from production rules.
- **Action policy** mirrors a competent player: from `getRoundActions(state)` pick the
  action whose effective modifier is highest, computed with the same rules as the
  resolver (stat mod + weapon-if-applicable + misc). Tactical Retreat excluded from
  the default policy.
- **RNG seeding**: `dice.js` and `healthSystem.js` call global `Math.random`. Simplest
  zero-prod-change approach: the harness swaps `Math.random` for a seeded mulberry32
  inside `simulateEncounter` (try/finally restore). Acceptable for a test/dev tool;
  alternatively (cleaner, later) thread an optional `rng` through `rollCheck` and
  `calculateDamage` as a default-argument, both are additive signature changes.
- **Nothing else to stub**: no LLM (narration is authored strings,
  `encounterResolver.js:70-72`), no persistence, no React.

### 4.3 As a test guard and retroactive CI lint

`src/game/balanceSim.test.js` (Jest, colocated per convention) iterates EVERY template
in `storyTemplates.js`, finds every milestone with an `encounter` block, sims it at the
boss's `minLevel` (fallback `levelRange[0]`) and asserts, with a fixed seed:

Proposed thresholds (per authored boss, at intended level):
- **mid loadout: 30% ≤ win rate ≤ 90%** (the maintainer's proposed band)
- full loadout: win rate ≥ 50% (gear must matter)
- no gear: win rate ≥ 10% (grind viable, not a wall)
- KO rate ≤ 25% per attempt (for hostile bosses)
- stalemate ≤ 45%

**Known consequence: the guard fails TODAY for the three deadly t2 bosses** (Shadow
Overlord, Herald of the Old Gods, Great Dreamer, all ~0.7-5% mid-gear). Ship the
harness with an explicit `KNOWN_UNBALANCED` allowlist asserting their CURRENT numbers
(so regressions are still caught), then burn the list down with a t2 rebalance
decision. Note that a DC-table or mechanics change retroactively affects existing
saves' unfought bosses (resolution is code, not save data), while changing a
template's `difficulty` label only affects new saves (milestones are snapshotted).
This same guard automatically lints all future content: t3, premium biome campaigns,
and (later) custom-quest builder output.

Optional follow-up: a `/debug/balance` page (pattern: `CampaignMilestoneTest.js`)
rendering the sweep matrix for authoring iteration.

### 4.4 Extensions decided 2026-07-03: model the target mechanics from day one

The harness must not only replicate today's rules; it must be able to model the
mechanics this program is building toward, BEFORE they are coded, so the design
decisions in steps 2-3 of the build order are made on numbers:

- **Party size + Lead/Support bonuses.** Add a `party` input (1-4 sim heroes) and a
  pluggable modifier hook that applies the Phase 5 support-bonus formula from
  `ENCOUNTER_SYSTEM.md` (one lead roll per round, deterministic support bonuses from
  the other heroes' best stats). Even while Phase 5 is unimplemented, the sim answers
  "what DC band is healthy for a 3-hero party with mid gear", which is exactly what
  t3 authoring needs.
- **Boss damage profiles.** Simulate `dealsDamage` / damage-dice profiles (section
  3.1.5 fix) instead of only the keyword rule, so KO-rate and armor-value numbers
  exist before the resolver change lands. Include the flat-vs-percent enemy-damage
  variant (section 3.1.4 open question) as a sim mode so that decision is made on
  measured rounds-to-kill, not taste.
- **XP-budget audit** (section 2.1): a `auditWorldXpBudget(template, worldSeed)`
  style helper that sums obtainable XP per world (milestones + selected side quests +
  expected encounter/boss XP with the per-round quirk) and reports it against the
  next tier's `XP_THRESHOLDS` entry. Runs in the same colocated test to catch
  authored worlds that cannot reach their sequel's entry level.

---

## 5. Gear inventory & gaps

### 5.1 Full equippable inventory by slot x rarity (verified 2026-07-03)

Equippability is defined by `SLOT_FOR_TYPE` (`src/game/equipment.js:12-18`): item
`type` weapon → weapon slot, armor → armor slot, ring/charm/artifact → accessory
slot; everything else in `ITEM_CATALOG` (`inventorySystem.js:90-235`) is not gear.
Counting every equippable catalog entry:

| Slot | common | uncommon | rare | very_rare | legendary |
|---|---|---|---|---|---|
| **Weapons** (9) | 3 (rusty dagger, shortsword, bar-stool leg) | 4 (+1: silver/ritual/poisoned dagger, enchanted staff) | 1 (`magic_weapon`, +1, L104) | **0** | 1 (`legendary_weapon`, +2, L108) |
| **Armor** (5) | 1 (+1 def, L212) | 2 (+2 def, L213-214) | 1 (`scale_mail`, +3 def, L215) | 1 (`dragonscale_plate`, +4 def, L216) | **0** |
| **Accessories** (10) | **0** | 4 (+1 charms, L137-139, L160) | 2 (`ring_protection` L105, `fey_charm` L131, both +1) | 4 (L109-112: `crown_of_sunfire` +3, three +2 artifacts) | **0** |

### 5.2 The gaps

- **No weapon ladder between rare +1 and legendary +2**: zero very_rare weapons. A
  hero jumps from Enchanted Blade (+1, 500g) straight to the generic Legendary
  Weapon (+2, 2500g); there is nothing to find or buy in between, exactly the level
  band (Lv 3-6) this program targets.
- **Armor is thin (5 pieces total) and has no legendary**: the ceiling is
  `dragonscale_plate` (very_rare, +4 defense).
- **The top end is dominated by quest-artifact accessories, not findable loot**:
  of the four very_rare accessories, three (`crown_of_sunfire`, `seal_of_binding`,
  `purified_heart_shard`) are bespoke t2 finale rewards. Random drops effectively
  top out at rare, so exploration and shops have nothing aspirational to offer.
- **Systemic: armor/defense is nearly worthless until bosses reliably deal damage.**
  Defense only soaks incoming HP damage (`encounterResolver.js:81`), and incoming
  damage only happens against keyword-named encounters (section 3.1.5), which
  excludes 9 of 10 bosses. Expanding the armor ladder is pointless before the boss
  damage-profile fix lands; the two must ship together (build order steps 2-3).

### 5.3 The t3 legendary shelf specifically

Tier 3 unlocks legendary drops (`maxRarityRankForTier`, `inventorySystem.js:279-284`),
but the legendary shelf is nearly empty:

- `legendary` rarity: **`legendary_weapon`** (generic "Legendary Weapon", +2, L108) and
  `dragon_egg` (5,000g valuable, not equippable, L168). That is the whole pool.
- Compare the t2 finales, which award bespoke `very_rare` artifacts:
  `crown_of_sunfire` (+3, L110), `seal_of_binding` (+2, L111), `purified_heart_shard`
  (+2, L112). Inconsistency: arcane t2's finale awards `enchanted_staff`, a mere
  UNCOMMON +1 (L177), so arcane players arrive at t3 under-geared vs other genres.
- No legendary armor (ceiling: `dragonscale_plate`, very_rare +4 defense, L216) and no
  legendary accessory. Armor only matters against hostile-named bosses (section 3.1.5),
  which t3 should actually have.

Proposed additions (names indicative; each needs a webp icon):

| Key | Type / bonus | Rarity | Source |
|---|---|---|---|
| `blade_of_the_shattered_throne` | weapon +3 | legendary | heroic t3 finale |
| `heart_of_the_last_winter` | artifact +3 | legendary | grimdark t3 finale |
| `clockwork_god_core` | artifact +3 | legendary | arcane t3 finale |
| `crown_of_the_drowned_city` | artifact +3 | legendary | eldritch t3 finale |
| `aegis_of_dawn` (or similar) | armor +5 defense | legendary | mid-campaign t3 milestone reward |
| (fix) arcane t2 finale item | upgrade to a very_rare artifact | very_rare | consistency with other t2s |

Caution: every +1 of gear shifts boss win rates by ~7 percentage points near the DC
cliff, so item bonuses and boss DCs must be tuned TOGETHER, through the sim. Keep t3
finale items at +3 and treat +9 total (stat +4, weapon +2, accessory +3) as the
designed-for "full gear" modifier.

---

## 6. Boss ladder audit (added 2026-07-03)

What boss-tier content exists, and where the ladder breaks:

- **10 template bosses** (`storyTemplates.js`, the finale `encounter` blocks), and
  they are **bimodal**:
  - **6 tier-1 bosses**, all `difficulty: 'medium'` (DC 15), `enemyHP` 25-35
    (L90, L284, L388, L483, L669, L855). Healthy: ~40% win per attempt at intended
    level with mid gear (section 3.2).
  - **4 tier-2 bosses**, `hard`/`deadly` (DC 20/25), `enemyHP` 150-300 (L181 deadly
    250, L574 hard 150, L760 deadly 200, L946 deadly 300). Broken: the deadly ones
    sit at ~0.7% win mid-gear (section 3.2).
- **30 boss-tier encounters in the `QUEST_ENEMIES` registry**
  (`src/data/questEnemies.js:9`, all `encounterTier: 'boss'`, consumed by the
  NewGame custom-campaign configurator): 16 tier-1 (all medium, HP 20-40) and
  14 tier-2 (6 hard at HP 150-180, 8 deadly at HP 180-300). **Zero tier-3 entries**,
  despite the file's own legend promising "Tier 3 (Lv 5+): HP 250-400"
  (`questEnemies.js:7`).
- **Side-quest site bosses** ("dungeon guardians"): generated at runtime by
  `makeBossEncounter` (`src/game/sitePopulator.js:172-192`), always
  `difficulty: 'hard'`, `multiRound: true`, flat 150 XP.

**The break: there is no tuned ladder for Lv 3-6.** Everything is either medium
(DC 15, comfortable at Lv 1-2) or hard/deadly (DC 20/25, a lottery per section 3.2's
sweep). And since DC is the only difficulty knob under current mechanics (section
3.1.4), **the ladder must be expressed in DCs**: the sweep at Lv 6 mid gear gives
DC 18 → 40%, DC 19 → 33%, DC 20 → 27%, so the missing Lv 3-6 rungs live in the
DC 16-19 band, which today has no label between medium and hard. Options: add
intermediate difficulty labels, or (after the flat-damage decision) let `enemyHP`
carry part of the load. Either way the rungs come out of the sim, not intuition.

---

## 7. Team combat: the connection this program hangs on (added 2026-07-03)

`ENCOUNTER_SYSTEM.md` Phase 5, "Team Encounters -- Lead + Support Model"
(`ENCOUNTER_SYSTEM.md:145`), is fully designed: each round one hero leads with a full
action and the others contribute deterministic support bonuses, keeping combat to one
roll per round (`:150-157`). It is also **zero code**: "designed but not yet
implemented" (`:9`), tracked as backlog #3 in `OUTSTANDING_ISSUES.md` ("Design
complete, zero code", size L). Today one hero fights the whole boss fight alone
(`EncounterActionModal.js:62-77`).

The maintainer's direction (2026-07-03): **boss fights should be party fights.** That
turns Phase 5 from a nice-to-have into the load-bearing first mechanical step of this
program, because everything else chains off it:

> team combat + boss-hits-back (damage profiles, section 3.1.5)
> → defense and hero HP matter
> → gear expansion (section 5) becomes meaningful, armor included
> → the sim (section 4.4) tunes DCs across party sizes and loadouts
> → t3 bosses are authored against those tuned numbers

Authoring t3 before this chain lands would mean writing finale fights against
mechanics that are about to change under them; that is why the build order (section
9) puts combat depth ahead of content.

---

## 8. Authoring a t3 campaign: the checklist

Per template (using `heroic-fantasy-t2` at `storyTemplates.js:115-205` as the shape):

1. **Geography: reuse t1's world (recommended).** Per the 2026-07-03 decision in
   `QUEST_CHAINING_PLAN.md:7-19`, same-world sequels are the end goal and the t2s will
   be re-authored onto t1 geography. t3 should be born same-world-ready, not repeat
   the t2 mistake: `customNames.towns` = the t1 towns (e.g. heroic: Willowdale,
   Briarwood, Thornfield, Millhaven), plus at most ONE new region name
   (`customNames.mountains`) for the finale, since new POIs can be placed additively
   on a live map while towns cannot be regenerated. Quest `building` entries should
   prefer building types every town already has (tavern/barracks/temple, per
   `FEATURE_QUEST_GIVERS.md` commonness) so future same-world injection stays additive.
   Standalone starts are unaffected: `customNames` seed the fresh map generator as
   today.
2. **Structure: 5-6 milestones** (t3 is the epic chapter; t1/t2 use 4). Mix types:
   1-2 item, 1 talk/narrative, 1-2 location, finale combat. Chain `requires` and use
   `minLevel` on the finale (entry-level decision from section 2).
3. **Finale encounter block**: `encounterTier: 'boss'`, `multiRound: true`,
   `difficulty` chosen BY SIM (expect hard/DC 20 territory, not deadly/DC 25, under
   current mechanics), `enemyHP` 250-400 per the tier legend (does not affect
   rounds-to-kill today, section 3.1.4, but keep the convention so the HP pool is
   already right if flat-per-success damage lands), 3 `suggestedActions` spanning
   physical + mental + social stats, 4 `consequences`, bespoke legendary reward item.
   Give the boss an explicit damage profile (section 3.1.5 fix: `dealsDamage` /
   damage dice on the encounter data, not a keyword-matching name) so t3 bosses
   actually threaten HP; sim the KO rate.
4. **Rewards**: milestone XP totaling ~1,200-1,600 plus finale (tier legend says
   300-500 XP; remember the per-round payout multiplies it). Gold `3d20`-`5d20` scale.
5. **Tone settings** per genre (copy the genre's t2 block).
6. **Boss art**: reuse the library, e.g. `warlord`/`fallen_paladin` (Shattered
   Throne), `blood_wendigo`/`plague_lord` (Last Winter), `arcane_colossus`/
   `rune_golem` (Clockwork God), `void_leviathan`/`psionic_devourer` (Drowned City).
7. **Flags**: remove `comingSoon`; set `premium: true` (see below).
8. **Validation**: item ids exist in `ITEM_CATALOG`; `spawnWorldMapEntities` resolves
   every spawn on a generated map (unit test exists for t1/t2 patterns); balance-sim
   guard passes; one manual playthrough via `/debug/milestones` fast paths.

**Premium placement** (per `PREMIUM_ACCOUNTS_PLAN.md:35-60` tier ladder): "higher-tier
campaign content" is a **Members ($5/m)** perk, so t3 → `premium: true`, unlocked at
Members. (Elite's "Lv-5 starting templates" perk pairs naturally with t3 later.) One
structural caveat: this repo is public, so fully authored t3 JSON in
`storyTemplates.js` is readable by anyone; the premium plan (#40) already prescribes
server-delivered premium content (`premium_templates` table, locked stubs in the list
endpoint). Recommendation: author in-repo now for velocity and playtesting (the
entitlement gate still controls the UI), and migrate t3 JSON to the server-content
path when #40 lands, before marketing t3 as a paid perk.

**Entry point dependency**: t3 has no launch surface until Quest Chaining Phase 2's
"Continue your legend" picker (or a NewGame higher-tier section for eligible parties)
exists. Sequencing below assumes chaining Phase 2 is the surface.

---

## 9. Build order: the 5-step combat-depth program (amended 2026-07-03)

This replaces the earlier 4-step order. The change from maintainer review: combat
depth (team combat + bosses that hit back) moves AHEAD of content authoring, and the
sim is built wide enough on day one to tune the target mechanics, not just audit the
current ones.

| # | Step | Size | Notes |
|---|---|---|---|
| 1 | **Balance-sim harness, extended from day one** (`balanceSim.js` + colocated test guard with KNOWN_UNBALANCED baseline, section 4): models **party size + Lead/Support bonuses and boss damage profiles** per section 4.4, even before Phase 5 is coded, plus the XP-budget audit (section 2.1) | M (2-3 days) | Build FIRST: retroactively audits t1/t2, and every later step's numbers come from it |
| 2 | **Combat depth**: implement `ENCOUNTER_SYSTEM.md` Phase 5 **Lead + Support** for multi-round boss fights, plus **explicit boss damage profiles** on encounter data (kill the `shouldDealDamage` keyword matching, section 3.1.5). Includes the **flat-vs-percent enemy-damage decision** (section 3.1.4), made on sim output | L | Backlog #3 + new #43; boss fights become party fights (section 7); decide rebalance retroactivity stance here |
| 3 | **Gear expansion**: fill the weapon and armor ladders (very_rare weapon rung, legendary armor, section 5.2) plus the t3 legendary shelf (5.3) and the arcane t2 fix, all bonuses sim-tuned; **fewer artifact-accessory top-end pieces, more findable loot** | S-M (0.5-1 day) + icon art | Only meaningful after step 2 makes defense matter; every +1 shifts win rates ~7pp near the DC cliff |
| 4 | **XP economy**: side-quest pool expansion + backfill (`FEATURE_SIDEQUEST_BACKFILL.md`) + same-world sequels (`QUEST_CHAINING_PLAN.md`) + run the XP-budget audit; **decide the t3 entry range** ([5,7] + renown XP vs [4,6], section 2) | M | Content-first fix per section 2.1 |
| 5 | **Flagship t3: `heroic-fantasy-t3` "The Shattered Throne"** on t1 geography (section 8 checklist), then the remaining three t3s | M-L (3-5 days total) | Authored against step-2 mechanics and step-1 numbers; proves the same-world pattern |
| — | Entry point (chaining Phase 2 picker) | separate | Tracked in `QUEST_CHAINING_PLAN.md` |

Premium placement is unchanged from the original plan (section 8): t3 ships as a
**Members ($5/m)** perk per `PREMIUM_ACCOUNTS_PLAN.md`, authored in-repo for velocity
but migrated to the server-delivered premium content channel (#40) **before** it is
marketed as a paid perk.

Backlog tracking: steps 1-4 are `OUTSTANDING_ISSUES.md` #46, #43, #44, #45
respectively (added 2026-07-03); step 2's team-combat half is the existing #3.

**Amended by Part II (section 17): the Lv 1-7 curve audit adds a leveling-power fix
and an obtainability repair to steps 2-3, and folds the progression lint into step 1.
Read section 17 alongside this table.**

## 10. Open questions for the maintainer

1. **Which t3 first?** Plan assumes heroic-fantasy (flagship starter genre). Eldritch
   is the alternative (its t2 finale sets up "echoes linger" → The Drowned City).
2. **Premium placement confirmed?** t3 at Members ($5/m) per the tier ladder, and is
   in-repo authoring acceptable until #40's server-delivered content lands?
3. **Rebalance retroactivity**: fixing the deadly DC / multi-round math changes
   unfought bosses in EXISTING saves (code, not save data). Acceptable, or do we only
   relabel difficulties in templates (new saves only) and leave old saves as-is?
4. **t3 entry level**: keep [5,7] and add renown XP bonuses, or drop to [4,6]?
5. **Boss threat**: ~~extend `shouldDealDamage` so bosses deal HP damage, or keep
   bosses HP-safe retry-grinds?~~ **Decided 2026-07-03**: bosses hit back via explicit
   damage profiles on encounter data, keyword matching dropped (section 3.1.5); the
   remaining question is tuning (dice sizes, KO-rate ceiling), owned by the sim.
6. **Multi-round mechanics scope**: is changing `maxRounds`/advantage thresholds for
   bosses on the table (helps the 40% stalemate rate), or must t3 tune within current
   mechanics (DC + modifiers only)?
7. **Same-world strictness**: plain t1 town names in t3 `customNames` now (this plan),
   or wait for the symbolic-location authoring format (Option B-prime) before writing
   any t3 prose?

---

---

# Part II: Full progression curve (Lv 1-7) audit (added 2026-07-03)

Part I covered the top end (t3, boss ladder, XP ceiling). This part audits the WHOLE
curve, especially the low end, answering the maintainer's "we might need more low-end
content too?" All claims verified in code; the win-rate figures in section 11 come
from a fresh Monte-Carlo (60k trials per scenario) driving the REAL production code
(`createMultiRoundEncounter` / `resolveRound` via a throwaway Jest run, since the whole
path is pure JS), not a reimplementation. Sections: 11 leveling power, 12 corrections
to Part I, 13 low end, 14 mid curve, 15 the band table, 16 progression lint,
17 build-order amendments.

## 11. What leveling actually does (the headline finding)

### 11.1 Level never enters the dice

The full modifier a check gets is: stat modifier + weapon attack bonus (if physical
stat or hostile-named encounter) + accessory misc bonus
(`encounterResolver.js:39-50`). **There is no level term anywhere in the resolution
path**, and stats can never change after creation:

- Point-buy caps every stat at 15 (`heroData.js:31-34`, `POINT_BUY_MAX = 15`), and all
  12 class templates use the standard array topping at 15 (`heroData.js:44-117`), so
  the best stat modifier any hero can ever have is **+2**.
- The ASI system exists on paper (`progressionSystem.js:126-139`,
  `getAbilityScoreImprovements` / `levelGrantsASI`, "+2 to distribute at Lv 4/8/...")
  but is consumed ONLY by the debug page `ProgressionTest.js` (lines 11, 383-388).
  **No production code path ever raises a stat.** `awardXP`
  (`progressionSystem.js:147-174`) changes exactly three things on level-up: `level`,
  `maxHP`, and a heal-to-full.

### 11.2 Measured: leveling moves boss win rates by 0.0 percentage points

Sim of the real `resolveRound` loop, t1-boss shape (medium DC 15, `enemyHP` 30,
hostile-named), Fighter template stats, best-modifier action, 60k runs each:

| Scenario | Win | Defeat | Stalemate | Mean HP lost/attempt |
|---|---|---|---|---|
| **Lv 1**, no gear (+2) | 33.4% | 24.2% | 42.5% | 7.1 |
| **Lv 5**, no gear (+2) | 33.5% | 23.8% | 42.8% | 7.1 |
| Lv 1, 25g shortsword (+3) | 40.1% | 19.2% | 40.7% | 6.8 |
| Lv 1, shortsword + trinket (+4) | 47.0% | 15.0% | 38.0% | 6.5 |

**Lv 1 and Lv 5 are statistically identical. Four levels of grinding buy nothing; one
25-gold shopping trip buys +7 percentage points.** Gear is the only power axis, and
(section 12) obtainable gear tops out at +4 of equipment bonus.

What leveling DOES buy: (a) more `maxHP` via the level-up recalc, which only matters
against the 7 keyword-named encounter families that deal HP damage at all
(`healthSystem.js:134-139`; 9 of 10 authored bosses deal none, Part I section 3.1.5);
(b) content keys: milestone `minLevel` gates and side-quest reveal
(`milestoneEngine`/`questEngine.js:182`). Level is a progress meter and a content key,
not a power stat.

**Design consequence, stated plainly: with static DCs and no level term, the game
never gets easier as the party levels.** A Lv 7 hero facing the t1 goblin boss wins
exactly as often as a Lv 1 hero with the same gear. Conversely no amount of grinding
makes a DC 25 boss winnable (section 12.2). Every "level up and come back" instinct a
player brings from RPGs is false here. This needs an explicit mechanic, either
applying the already-designed ASI (+2 at Lv 4 alone would be +1 modifier at the cliff,
~7pp) or a proficiency-style bonus (e.g. `floor((level-1)/2)`, +0/+1/+2/+3 across
Lv 1-7), tuned through the sim with the DC ladder. Tracked as **#47**.

### 11.3 Bonus bug: leveling up can LOWER max HP

Two independent `calculateMaxHP` implementations disagree, and a field-name mismatch
makes it worse:

- At creation/selection, heroes get HP from `healthSystem.calculateMaxHP`
  (`healthSystem.js:11-18`): `10 + conMod * 5`, clamped 5-30, level-independent
  (`HeroSelection.js:96` via `initializeHP`; `Game.js:178-186` backfill). Con 14
  (every class template) → **20 HP**.
- On level-up, `awardXP` recalculates via `progressionSystem.calculateMaxHP`
  (`progressionSystem.js:159-165`), a hit-die formula keyed on
  `character.characterClass`. But heroes store their class as **`heroClass`**
  (`HeroCreation.js:121`), so the lookup misses and every class defaults to a d8
  (`progressionSystem.js:110`).

Verified with the real `awardXP` path (Con 14): **Lv 1 = 20 → Lv 2 = 17 → Lv 3 = 24
→ Lv 5 = 38.** Reaching level 2 REDUCES max HP by 3, for every class. (Had
`characterClass` resolved, d6/d8 classes would still drop at Lv 2; only d10/d12
classes would hold or gain.) Small fix, real trust damage when a player notices;
also blocks any future "HP matters" combat depth from making sense. Tracked as
**#48**: unify on one maxHP formula and fix the field name.

### 11.4 XP is not level-scaled either (corrects a Part I aside)

`calculateEncounterXP` with its level-decay (`progressionSystem.js:235-253`) is
consumed only by `ProgressionTest.js:58`, another debug-only function. Production
awards raw authored `rewards.xp` (`encounterResolver.js` `generateLoot` →
`encounterController.js:12-15`). Part I section 2's "level-scaled down by
calculateEncounterXP" does not apply in production: grinding pays constant XP per
encounter (~50-120 per hostile win, times the multi-round per-round quirk). The Lv 4→5
gap (3,800 XP) is therefore ~40-70 encounter wins, not 70-90; still a wall, slightly
lower than Part I stated.

## 12. Obtainability audit: what can actually be acquired (corrects Part I)

Part I section 5 catalogued what EXISTS in `ITEM_CATALOG`. Auditing what is
OBTAINABLE (some source among: shop stock, encounter drops after the tier gate, site
loot pools as actually rolled, milestone/quest rewards) changes the picture:

### 12.1 Four gear items have NO live source

| Item | Bonus | Why unobtainable |
|---|---|---|
| `legendary_weapon` | **+2 attack** (the only one) | Sole drop is `ruin_treasure_vault` 15% (`ruinsEncounters.js:70`), but legendary rarity is tier-gated to t3+ (`inventorySystem.js:279-284`) and no playable t3 exists. Not in any `SHOP_STOCK` (`shopStock.js:12`), not a milestone reward. |
| `dragonscale_plate` | +4 defense | Catalog only (`inventorySystem.js:216`). No shop (excluded by design comment `shopStock.js:10-11`), no drop table, no reward anywhere. |
| `hide_armor` | +2 defense | Only source is `HOARD_BONUS.forest/hills` (`sitePopulator.js:52-53`), which are dead pools (12.3). |
| `ring_protection` | +1 | Catalog only (`inventorySystem.js:105`). No source at all. |

### 12.2 The real gear ceiling is +6, not +9, and t2 deadly is even worse than stated

Part I's "best-in-game gear (+9: 18 stat, +2 weapon, +3 artifact) → 15% win" is a
hypothetical that cannot occur in production: 18 stat is impossible (15 cap, no ASI,
section 11.1), and the +2 weapon is unobtainable (12.1). The true obtainable maximum
is **+6** (stat +2, any +1 weapon, `crown_of_sunfire` +3 from the heroic t2 finale) and
that only AFTER beating the hardest fight in the game; the other genres cap at +5.
Re-simmed at real ceilings:

| Scenario | Win | Defeat | Stalemate |
|---|---|---|---|
| t2 deadly DC 25, obtainable mid gear (+4) | **0.8%** | 86.2% | 13.0% |
| t2 deadly DC 25, obtainable BEST (+6) | **2.7%** | 73.7% | 23.6% |
| t2 hard DC 20, obtainable mid (+4) | 15.0% | 44.0% | 41.1% |
| t2 hard DC 20, obtainable best (+6) | 26.8% | 29.9% | 43.3% |

So the three deadly t2 bosses are ~1-3% per attempt with anything a player can
actually own, not the 15% Part I's full-gear row implied. The Part I conclusion
("deadly 25 must not be the t3 default") gets stronger, and the gear-expansion step
must include **making the existing top shelf reachable**, not only adding new items.

Also worth fixing while there: the price ladder is dishonest at the bottom. The 25g
common `shortsword`, 100g `silver_dagger`, 125g `ritual_dagger`, and the 500g rare
`magic_weapon` ("Enchanted Blade") are ALL +1 attack (`inventorySystem.js:101-104,
211, 227`; parsed by `parseBonus`, `equipment.js:31-36`). The blacksmith's entire
weapon wall (`shopStock.js:12`) is a zero-upgrade after the first 25g purchase. Armor
does ladder (+1/30g → +2/90g → +3/350g) but defense is dead against 9 of 10 bosses
(Part I 5.2).

### 12.3 Dead site-loot pools and lying quest hints

`populateSite` coerces every non-ruins site to `'cave'`
(`sitePopulator.js:128`), so the themed `LOOT` / `HOARD_BONUS` pools for
`forest` / `hills` / `mountain` (`sitePopulator.js:44-46, 52-54`) are **never rolled**:
a forest site hands out cave mushrooms and cave hoards (which is also why
`magic_weapon` shows up in EVERY site type's hoard at 1-in-3, `sitePopulator.js:49`).
Two knock-on effects: `hide_armor` and the forest/hills exclusives are unobtainable
(12.1), and `questHints.describeItemSources` (`questHints.js:41-48`), which reads
those pools, tells players items are found "in forest or hills sites" where they never
drop. Site loot is also granted with no tier gate (`Game.js:519`, `grantSiteLoot`
direct), unlike encounter drops. Tracked as **#49**.

## 13. Low-end audit (Lv 1-2): the verdict is that the low end is FINE

### 13.1 Content volume for a fresh party

Counted from data:

- **6 t1 campaigns** (all `levelRange: [1, 2]`: heroic `storyTemplates.js:23-24`,
  desert `:215-216`, frozen `:320-321`, grimdark `:420-421`, arcane `:606-607`,
  eldritch `:792-793`), **4 milestones each** (40 milestone entries across the 10
  playable templates), finale bosses all medium DC 15 at `minLevel: 2`.
- **22 of the 30 side quests serve Lv 1-2** (`sideQuests.js:43-121`): 10 at
  `minLevel: 1`, 12 at `minLevel: 2`. Only 2-4 are selected per world
  (`NewGame.js:390-391`), but selection guarantees at least one `minLevel ≤ 2` pick
  (`questEngine.js:80-82`), so a fresh party always has a startable quest.
- **47 random-encounter templates** across the biome, town, POI, and environmental
  tables (counted per file: base 10, wilderness 8, town 6, cave/ruins/environmental 5
  each, grove/mountain 4 each), all available from level 1; encounter selection has no
  level or tier input at all (`rollRandomEncounter(tile, settings)`,
  `encounterGenerator.js:138-168`).
- **Explorable sites from minute one**: forest/hills/mountain sites are always
  enterable, no quest gate (`useGameMap.js:286-291`); each carries 2+ content slots,
  a guaranteed deepest-room hoard (40-99 gold + a bonus item,
  `sitePopulator.js:106-118`), and 1-3 harvestable crystal deposits. Caves/ruins are
  quest-revealed.

XP pacing: Lv 2 needs 300 XP, Lv 3 needs 900 (`progressionSystem.js:9-10`). A t1
campaign pays 150 milestone XP + ~90-270 boss XP (75/success-round × up to 3 × 1.2,
`multiRoundEncounter.js:161-197`), so **the campaign alone lands the lead hero at
Lv 2 right as the `minLevel: 2` finale unlocks**, and a cleared world (campaign + 2-4
side quests at ~90-250 XP each + 15-25 encounter wins) exits around 900-1,800 XP,
i.e. **Lv 3, exactly the t2 entry level**. Estimated play time for that (the one
number here not verifiable in code): roughly 2-4 sessions. Nobody levels past t1
before finishing it, and nobody exits under-leveled for t2. The band is well paced.

### 13.2 Early gear: no gear desert at the bottom

Heroes start with literally nothing: no starter equipment, `gold: 0`, empty inventory
(`progressionSystem.js:181-194` `initializeProgression`; `Game.js:179-186` backfill;
`HeroCreation.js` creates no inventory). But the **first +1 attack moment is minutes
away**: the 25g `shortsword` (+1) sits in every blacksmith (`shopStock.js:12`) at
face value, no markup (`shopController.js:14-17`), and one bandit win pays `3d10`
gold (~16) plus milestone gold. Realistically: **first or second town visit, within
the first session.** Alternative early +1s, all verified in drop tables:

- `shortsword:25%` and `leather_armor:15%` from Bandit Roadblock
  (`baseEncounters.js:67`); `ritual_dagger:60%` (+1) from Ruin Cultists
  (`ruinsEncounters.js:95`); `poisoned_dagger:10%` (`townEncounters.js:149`);
  `enchanted_staff:15%` (`mountainEncounters.js:70`).
- Accessories: every equipped accessory grants at least +1
  (`ACCESSORY_DEFAULT_BONUS`, `equipment.js:22`); +1 charms drop from groves
  (`nature_charm:30%`, `fey_charm:40%`, `groveEncounters.js:45,95`), ruins
  (`ghostly_trinket:35%`), and the wilds (`enchanted_trinket:15%`); the arcane t1
  first milestone's map pickup IS `enchanted_trinket` (`storyTemplates.js:624`).
- Site hoards: `magic_weapon` (+1) is 1-in-3 of every cave-coerced hoard
  (`sitePopulator.js:49`), ungated by tier; `silver_dagger` is a guaranteed
  `stolen_blade` quest reward at `minLevel: 2` (`sideQuests.js:99-100`).

So a Lv 1-2 party can hit +4 total (+2 stat, +1 weapon, +1 accessory) inside the
first world, which is exactly the "mid gear" the t1 bosses are comfortable at
(47% per attempt, section 11.2). **The maintainer does not need more Lv 1-2 content.**
The honest answer is that Lv 1-2 is the game's healthiest band on every axis
(campaign count, quest count, encounter variety, gear access, XP pacing), and effort
spent there would be effort taken from the real deserts (section 14). Two low-end
polish items only: the Lv-2 max-HP drop (#48, lands exactly in this band) and the
flat +1 weapon price ladder (12.2).

### 13.3 One gating caveat: party size trivializes minLevel

Quest reveal uses `effectivePartyLevel` = highest hero level + `floor(partySize / 2)`
(`questEngine.js:95-100`, consumed at `BuildingModal.js:630` and `Game.js:568`). A
4-hero Lv 1 party has effective level 3, so 28 of 30 quests (everything but
`ruin_menace` Lv 4 and `unstable_rift` Lv 5) are offerable on day one, including the
`hard`-DC site-boss quests (Cave Tyrant, `sideQuests.js:57-58`). The code comments
call this intentional ("a full party can take on quests above the lead's level"), but
combined with section 11 (party size adds zero combat power today; one hero fights
alone) it offers fights the party mathematically cannot punch at. Once Lead+Support
(#3/#43) lands, party size WILL mean power and this gate becomes honest; until then
the lint (16, guard a) should measure bands with the formula as it is.

## 14. Mid-curve audit (Lv 3-5): the boss-ladder hole IS also a content hole

- **Two of six genres dead-end at t1.** Only heroic, grimdark, arcane, eldritch have
  a t2; `desert-expedition` and `frozen-frontier` stop at Lv 2 with no sequel (full
  template list, `storyTemplates.js`). A player who started in those genres has no
  authored campaign at all for Lv 3+ (they must start an unrelated genre's t2 from
  the picker, abandoning their world; note `NewGame.js:747` currently filters the
  picker to tier 1 anyway, the Part I entry-point problem).
- **8 of 30 side quests serve Lv 3+** (6 at `minLevel: 3`, 1 at 4, 1 at 5), and
  section 13.3 means most of those are consumed at Lv 1-2 by any multi-hero party.
  Reserved mid-game quest content is effectively just `ruin_menace` and
  `unstable_rift`.
- **Random encounters never change.** No level/tier input (13.1), so the Lv 3-5
  party faces the same goblin ambushes at the same DCs for the same XP as at Lv 1.
  Nothing new to fight, and (section 11) no easier either. `QUEST_ENEMIES` has 14 t2
  boss entries but they only exist in the custom-campaign configurator (Part I
  section 6).
- **Gold has nothing to buy.** After scale mail (350g) and the pointless 500g
  Enchanted Blade, shops offer no upgrade forever; t2 gold income (3d20-5d20 per
  milestone, 20d20 dragon hoards) accumulates against an empty shelf.
- **The t2 finales themselves are the wall**: hard DC 20 at obtainable mid gear is
  15%, the three deadly DC 25s are ~1% (12.2), reached at Lv 4-5 where the XP curve
  also steepens (Lv 5 = 6,500). So the mid curve is simultaneously content-thin AND
  capped by near-unwinnable bosses. This compounds Part I's finding: the Lv 3-6 hole
  is not just missing DC rungs, it is missing campaigns, quests, encounters, and
  shop stock.

## 15. The level-band table

"Win rate" = per-attempt boss win at that band's obtainable gear (sims, 11.2/12.2).

| Band | Campaigns | Side quests (cumulative pool) | Gear obtainable | Bosses aimed here | Win rate | Gaps |
|---|---|---|---|---|---|---|
| **Lv 1** | 6 t1 (milestones 1-3) | 10 (22 for a 2+ hero party, 13.3) | +1 weapon (25g), +1 charm, leather; up to +4 total | none (t1 finales gated Lv 2) | 33-47% vs field encounters | none material; #48 HP bug lands at Lv 2 |
| **Lv 2** | 6 t1 finales (`minLevel: 2`, medium DC 15) | 22 | same; +4 is band ceiling | 6 t1 bosses, healthy | 40-47% | flat +1 price ladder (12.2) |
| **Lv 3** | 4 t2 (2 genres dead-end) | 28 | scale mail +3 def; +4 attack unchanged | none tuned (DC 16-19 empty, Part I §6) | 15% vs hard DC 20 | genre dead-ends; no new encounters; nothing to buy |
| **Lv 4** | t2 mid/finales (grimdark, arcane `minLevel: 4`) | 29 | +5 with a very_rare artifact (t2 drops unlock, `legendary_artifact:25%` `mountainEncounters.js:45`) | 1 hard (Rot-Heart), 1 deadly (Herald) | 15-21% hard; ~1% deadly | deadly cliff; XP wall to Lv 5 (3,800 = ~40-70 wins, 11.4) |
| **Lv 5** | heroic/eldritch t2 finales (`minLevel: 5`, deadly); t3 stubs unplayable | 30 (`unstable_rift`) | +6 absolute ceiling (crown, AFTER heroic finale) | 2 deadly | 0.8-2.7% | the top of the playable game is a ~1% lottery |
| **Lv 6-7** | **zero** | **zero** | nothing new obtainable (legendary shelf gated to nonexistent t3) | **zero** | n/a | the entire band is empty; t3's [5,7] range has no on-ramp |

## 16. Progression lint: the unified automated suite

Extends the Part I balance-sim (#46) and XP-budget audit into one guard family.
Location: `src/game/progressionLint.test.js` (Jest, colocated per convention),
importing `balanceSim.js` for anything that rolls dice; the static guards are pure
data reads. Data sources: `storyTemplates.js`, `sideQuests.js`, `SHOP_STOCK`,
`sitePopulator.js` `LOOT`/`HOARD_BONUS` (as ACTUALLY rolled, i.e. modeling the
type coercion until #49 fixes it), `encounterTemplates` reward strings,
`ITEM_CATALOG` + `RARITY_RANK` + `maxRarityRankForTier`, `XP_THRESHOLDS`,
`QUEST_ENEMIES`. Guards, each a separate `describe` block so failures read as design
lint, with a pinned `KNOWN_GAPS` allowlist (same pattern as Part I's
`KNOWN_UNBALANCED`) so today's failures are captured, not silenced:

- **(a) Band coverage.** For each level 1-7: at least one playable (non-`comingSoon`)
  template whose `levelRange` covers it, and at least N side quests with
  `minLevel ≤ band` (N=3 suggested). Compute with `effectivePartyLevel` both at party
  size 1 and 4 to expose the 13.3 skew. **Fails today for Lv 6-7** (zero campaigns,
  zero quests) and is the machine-readable form of section 15.
- **(b) Gear obtainability.** For every equippable in `ITEM_CATALOG`
  (`SLOT_FOR_TYPE` members), derive its source set exactly the way
  `questHints.describeItemSources` does, but tier-aware: shops (always), encounter
  drops (apply `filterDropsByTier` at each tier), site pools (post-coercion),
  milestone/quest `rewards.items`. Assert (1) every item has ≥1 source at some
  reachable tier, (2) every slot has an obtainable item at every bonus rung that
  exists, (3) `describeItemSources` never names a source the derivation says is dead.
  **Fails today**: `legendary_weapon`, `dragonscale_plate`, `hide_armor`,
  `ring_protection` (12.1), plus the hint mismatch (12.3).
- **(c) Boss win-rate bands.** Part I 4.3 unchanged, with one amendment from this
  audit: the "full" loadout must be built from OBTAINABLE items at the boss's band
  (derived via guard b), never a hypothetical (+9 does not exist; 12.2).
- **(d) World XP budget.** Part I 4.4's `auditWorldXpBudget` unchanged: obtainable
  world XP ≥ next tier's entry threshold. Fails today for t2 → Lv 5 (Part I §2).
- **(e) Leveling power.** Sim the same authored boss at level L and L+1 with the
  band-standard loadout and assert `winRate(L+1) − winRate(L) ≥ ε` (ε = 2pp
  suggested) for at least the levels inside the boss's `levelRange`. **Fails today at
  exactly 0.0pp for every boss and every level, by section 11; that is the point.**
  Pin it in `KNOWN_GAPS` until #47 ships a leveling-power mechanic, then flip it to
  enforcing so leveling can never silently go flat again.
- **(f) Reward integrity** (cheap extras while we are here): every `rewards.items`
  key across templates/quests/encounters exists in `ITEM_CATALOG` (a milestone
  spawn/reward typo is invisible until a player hits it), and every side quest's
  gather target actually drops somewhere (the `sideQuests.js` header demands it,
  nothing enforces it).

Guards a, b, f are pure and fast (no RNG); c, d, e ride the seeded sim. All read
production data files directly so new content is linted the moment it is authored,
which is the "everything testable and functional before shipping" property the
maintainer asked for.

## 17. Build-order amendments (from this audit)

The 5-step order (section 9) survives, with three changes:

1. **Step 1 (sim harness) absorbs the progression lint** (section 16): guards a/b/f
   are static and land with the harness on day one; e is trivial once c exists. The
   step stays size M.
2. **Step 2 (combat depth) gains the leveling-power fix (#47) and the max-HP bug fix
   (#48).** Rationale for slotting #47 early rather than after content: every DC
   chosen in steps 3-5 depends on what a modifier IS at a given level; if leveling
   starts granting +1/2 levels (or ASI at 4), all tuning shifts ~7pp per point and
   must be done AFTER the decision, not before. #48 is a half-day fix that belongs
   with the same files. The deadly-t2 rebalance decision (Part I §3.2) also becomes
   more urgent given the corrected 0.8-2.7% obtainable-gear numbers (12.2).
3. **Step 3 (gear expansion) becomes "obtainability repair + expansion" (#49 + #44).**
   Before adding new items: give `legendary_weapon`, `dragonscale_plate`,
   `hide_armor`, `ring_protection` live sources (or cut them), fix the
   `sitePopulator` type coercion so the themed pools and `questHints` stop
   disagreeing, and differentiate the +1 weapon price ladder (e.g. `magic_weapon`
   to +2 once #47/#43 set the new modifier budget).
4. **Step 4 (XP economy / content) explicitly includes the mid-band**: desert and
   frozen t2 sequels (or chaining those worlds into existing t2s) so no genre
   dead-ends at Lv 2, plus the Lv 3+ side-quest pool. Low-end content is explicitly
   NOT needed (section 13 verdict); do not spend there.

Backlog: this audit adds **#47 (leveling power), #48 (level-up HP bug), #49
(unobtainable gear / dead pools / wrong hints), #50 (mid+top band content coverage)**
to `OUTSTANDING_ISSUES.md`; #50 overlaps #45 and can merge into it at prioritization
time if preferred.

Verification notes: every number above traces to the cited file:line; the sim rows
come from driving `createMultiRoundEncounter`/`resolveRound`/`resolveEncounter`
directly (60k runs per scenario, throwaway test, deleted after the run; the +3 row
reproduced Part I's 40% figure, cross-validating both harnesses). The one
unverifiable-in-code claim is the session-count estimate in 13.1, marked as such.
The 15% initiative-steal (`EncounterActionModal.js:94-121`) is UI-layer and excluded
from sims here, same as Part I.

## 18. Leveling-power fix options — DECIDED 2026-07-03

> **Decision: Option A now, Option B later.** Ship the level term
> (`+floor((level-1)/2)`, capped +3, shown in the roll breakdown) immediately and
> RETROACTIVELY (computed from level in code; existing mid-campaign saves simply
> gain their earned bonus). The ASI picker modal (Option B — the level-up
> stat-choice moment) ships as its own later feature; the N=2-vs-N=3 restack
> question is deferred to that point. Lint guard (e) flips from pinned-failing to
> passing when A lands.

Added 2026-07-03. This is the decision memo for **#47** (section 11: leveling moves
boss win rates by 0.0pp because the check modifier is stat mod + gear only,
`encounterResolver.js:39-50`; stats are frozen at creation, point-buy cap 15 → +2
mod; the ASI machinery in `progressionSystem.js:126-139` is consumed only by
`ProgressionTest.js`). The maintainer must pick HOW levels grant power before step 2
of the build order, because every DC tuned afterwards depends on what a modifier IS
at a given level (section 17.2).

Method note: the projections below are an EXACT enumeration of the 64 outcome-paths
of the real 3-round loop (`multiRoundEncounter.js` update rules: damage 40/20/5/0%,
morale -40/-20/+10/+20, advantage +2/+1/-1/-2, defeat at ≤ -3, round-3 victory iff
advantage > 0), not a Monte-Carlo, so they carry no sampling noise. Cross-validated
against Part II's 60k-run sims: +4 vs DC 15 → 47.0% (both), +6 vs DC 25 → 2.8% vs
2.7%, +2 vs DC 15 → 33.4% (both). Working rule of thumb, confirmed exactly:
**each +1 of total modifier is worth ~6.7pp of win rate in the DC 15-20 band**
(the "+1 ≈ 7pp" finding, Part I section 5.3). "Mid gear" below = obtainable mid,
total +4 (stat +2, any +1 weapon, any +1 accessory); "full" = obtainable best,
total +6 (12.2).

### Option A: proficiency-style level term in the resolver

`modifier += floor((level - 1) / N)` added in `encounterResolver.js` next to the
gear bonuses. Projected win rate, mid gear, by level (the master modifier-x-DC
lookup behind these rows is reproducible from the method note):

| N | Lv | mod | DC 15 | DC 18 | DC 20 | DC 25 |
|---|---|---|---|---|---|---|
| — | 1 (any N) | +4 | 47.0 | 26.8 | 15.0 | 0.7 |
| **2** | 3 | +5 | 53.7 | 33.4 | 20.7 | 0.7 |
| **2** | 5 | +6 | 60.3 | 40.1 | 26.8 | 2.8 |
| **2** | 7 | +7 | 66.4 | 47.0 | 33.4 | 5.9 |
| 3 | 5 | +5 | 53.7 | 33.4 | 20.7 | 0.7 |
| 3 | 7 | +6 | 60.3 | 40.1 | 26.8 | 2.8 |

- **Feel**: automatic, no choice moment; must be SHOWN to be felt (roll breakdown
  "d20 + 4 gear/stat + 2 level" in `EncounterActionModal`, else it fixes the math
  but not the complaint). "Come back stronger" finally becomes true: the t1 boss a
  Lv 1 party beats 47% of the time falls 66% at Lv 7.
- **Math**: N=2 gives +0/+1/+2/+3 across Lv 1-7. Nice property: the term is +0 at
  Lv 1-2, so the healthy low band (section 13) is untouched and t1 needs NO retune.
  t2 hard DC 20 improves 15% → 21-27% at Lv 4-5 (near-healthy without relabeling);
  t2 deadly DC 25 is still broken (2.8% at Lv 5), so the deadly decision in #43
  stands regardless. Gear interaction: Lv 7 full gear = +9 total → DC 20 at 47%,
  DC 25 at 15%; deadly becomes a legitimate "max level + full gear + retries" target
  instead of a pure lottery. Cap the term at +3 for now (content stops at Lv 7;
  revisit if Lv 8+ content ever exists, else Lv 20 would mean +9 term and trivialize
  every authored DC).
- **Surface**: `progressionSystem.js` (new `getLevelCheckBonus(level)`, one pure
  function), `encounterResolver.js:50` (one line), roll-breakdown display, sim
  loadouts + `KNOWN_UNBALANCED` baseline refresh. Smallest option by far.
- **Back-compat**: resolution is code, not save data, so existing mid-campaign
  heroes get the term instantly (a Lv 4 hero wakes up +1). It is a pure buff;
  acceptable, but it is the same retroactivity stance as open question 3.
- **DC retune impact**: t3 default lands cleanly on hard DC 20 (33% mid / 47% full
  at Lv 7), inside the 30-90 guard band, without inventing DC 16-19 labels for t3.
  The DC 16-19 rungs are still wanted for the Lv 3-5 mid-band ladder (section 6),
  but they stop being load-bearing for t3.

### Option B: wire the existing ASI system into real level-ups

The dormant machinery (`levelGrantsASI`, ASI at Lv 4/8/12/16/19, +2 points to
distribute) starts firing in production: `encounterController.js:17-20` flags
pending points on `leveledUp`, a picker modal spends them, stats actually rise, and
stat mods grow naturally through the existing resolver path (zero resolver change).

- **Math (the honest problem)**: from the 15 cap, the first ASI (Lv 4, both points
  into the primary stat: 15 → 17) is exactly **+1 modifier**, and the next is at
  Lv 8, OUTSIDE the entire current content band. So across Lv 1-7 option B delivers
  one +1 (~7pp) total: mid gear DC 20 goes 15% → 20.7% at Lv 4 and then flatlines to
  Lv 7. A faster variant (+1 point every 2 levels) still only reaches +2 mod by Lv 7
  (stat 18), because two points buy one modifier. **ASI alone cannot fix #47 in the
  band the game actually occupies**; it saturates immediately.
- **Feel**: the best of any option. A real choice on level-up, character identity
  (the Wizard raises Int, the Fighter Str), the classic "ding" moment. Also makes
  Con meaningful (maxHP recalc), which entangles it with the #48 HP-bug fix; ship
  them together.
- **Surface**: medium. `progressionSystem.js` (spent-points accounting; earned can
  stay derived from level), `encounterController.js` (pending flag),
  a new `AsiPickerModal` via `ModalContext`/`ModalShell` (registry entry + conflict
  group), `Game.js` trigger, save payload gains an additive `asiSpent` field
  (renderer-tolerant per the back-compat rules).
- **Back-compat**: existing heroes at Lv ≥ 4 get retroactive unspent points on load
  (a pleasant surprise, additive field, old saves unaffected until they level).
- **DC retune impact**: nearly none, which is the problem; DCs would still need the
  Option A-style shift to open the top of the ladder.

### Option C: hybrid (small level term + the ASI moment)

A(N=3) + ASI at Lv 4: trajectory +0/+0/+2/+3 across Lv 1/3/5/7 (both bumps land at
Lv 4-5), numerically identical to A(N=2) at Lv 5-7 (60/40/27 → 66/47/33 mid gear vs
DC 15/18/20). A(N=2) + ASI would reach +4 by Lv 7 (DC 20 at 40% mid), which starts
pressing the 90% guard ceiling on t1 content and forces a wider retune. Cost is the
sum of A's and B's surfaces. This is the "right" long-term shape, but as a single
step it couples a one-line math fix to a modal/UX project.

### Option D: nothing in the roll; levels gate content only (status quo, made intentional)

The honest case FOR it: this is a gear-progression game (section 11.2: one 25g
shopping trip buys what four levels don't), levels already buy maxHP and content
keys (`minLevel` gates, side-quest reveal), and Zelda-style "power is found, not
ground" is a coherent design. The honest case AGAINST it: the game SURFACES XP bars,
level-up fanfare ("🎉 LEVEL UP!", `encounterController.js:19`), and D&D-adjacent
stats, so every player instinct says levels = power; D keeps the complaint by
design. It also leaves "level up and come back" permanently false while `minLevel`
gates imply the opposite, and maxHP growth stays worthless until boss damage
profiles land (9 of 10 bosses deal none). If chosen, it must be made explicit:
reframe level as "renown" in the UI (progress meter + content key, not power), and
flip lint guard (e) from "winRate(L+1) − winRate(L) ≥ 2pp" to asserting what levels
DO grant (maxHP strictly increases post-#48, and each level unlocks ≥ 1 content
item, tying into guard (a)). Defensible on paper; weakest against the actual
playtest complaint.

### Decision table

| | A: level term (N=2, cap +3) | B: wire ASI | C: hybrid (N=3 + ASI) | D: intentional status quo |
|---|---|---|---|---|
| Power by Lv 7 (mid gear) | +3 mod (~20pp) | +1 mod (~7pp), saturates at Lv 4 | +3 mod (~20pp) | +0 |
| DC 20 boss at Lv 7 mid / full | 33% / 47% | 21% / 33% | 33% / 47% | 15% / 27% |
| Fixes lint guard (e) | yes, every level pair ≥ ~3pp | only across Lv 3→4 | yes (from Lv 4) | no (guard must be rewritten) |
| Player feel | invisible unless shown in roll UI | best (choice + identity) | both | complaint persists by design |
| Surface | XS (2 functions + display) | M (modal, save field, retro-grant) | A + B | S (UI reframe + lint rewrite) |
| Save back-compat | retro buff via code (no data) | additive field + retro points | both | n/a |
| DC retune (#43) | t1 untouched; t3 = DC 20; deadly still needs its own fix | none (still stuck) | as A | full DC 16-19 relabel still required |
| New UI | roll-breakdown line | ASI picker modal | both | renown reframe |

### Recommendation: staged A then B

1. **Now (inside build-order step 2, with #43/#48)**: ship **A with N=2, capped at
   +3**, displayed in the roll breakdown. It is a two-function change, it makes
   guard (e) pass for every level pair, it leaves Lv 1-2 tuning untouched, and it
   lets the t3 finales be authored at hard DC 20 against known numbers (33% mid /
   47% full at Lv 7).
2. **Later (with the modal-migration work)**: wire **B** as the feel upgrade, ASI at
   Lv 4/8 unchanged, points into stats (Con finally matters, alongside #48). At that
   moment decide the stacking question: either drop the level term to N=3 (becoming
   Option C's curve exactly, no retune needed vs step 1's Lv 5-7 numbers) or keep
   N=2 and re-run the sweep, accepting ~+4 total by Lv 7 and retuning the guard
   ceiling.

Decision questions for the maintainer:
1. Is the retroactive buff to existing mid-campaign saves acceptable (same stance as
   open question 3), or must the level term key off a `mapVersion`-style flag and
   apply to new campaigns only?
2. Does the staged pair (A now, B later) fit, or should B's ASI modal ship in the
   same step because the level-up moment is judged the more urgent complaint?
3. When B lands, N=3 + ASI (option C's curve, no re-retune) or N=2 + ASI (stronger
   curve, re-run the sweep)?
