// progressionLint.test.js — the unified progression lint (#46).
// Design: docs/T3_CAMPAIGNS_PLAN.md Part II §16 (guards a-f), riding the balance-sim
// harness (balanceSim.js, §4/§4.4) for everything that rolls dice.
//
// Every guard reads LIVE game data (storyTemplates, sideQuests, shopStock,
// sitePopulator pools as ACTUALLY rolled, encounter tables, ITEM_CATALOG,
// XP_THRESHOLDS), so new content is linted the moment it is authored.
//
// KNOWN_GAPS pins the failures that are TRUE TODAY BY DESIGN DEBT (#44/#45/#50).
// For a pinned entry the guard asserts the CURRENT (broken) value instead of the
// healthy band, so:
//   - a REGRESSION (things get worse) fails the pin, and
//   - a SILENT FIX (things get better) ALSO fails the pin — update/remove the pin
//     and, where noted, flip the guard to enforcing.
// The suite as a whole passes.
//
// BOSS BAND SEMANTICS (#43, Lead + Support shipped 2026-07-03):
// Boss fights are party fights, and boss win-rate bands are measured against the
// party each tier is DESIGNED for:
//   - tier 1 bosses: a SOLO hero at the boss's intended level (t1 must stay
//     beatable alone — Phase 5's zero-regression rule for 1-hero parties);
//   - tier 2+ bosses: a 3-HERO party (Fighter lead + Wizard + Cleric, all at the
//     intended level, all wearing the named loadout). "Requires more party
//     members" is the design intent: solo attempts on t2+ bosses may sit BELOW
//     the band and that is correct, not a gap.
// Healthy bands per loadout: mid 30-90%, best >= 50%, none >= 10%. Wipe risk
// (tpkRisk: the WHOLE party downed — for solo heroes identical to the old
// koRate) <= 25% and stalemate <= 45% at mid. Since #43 all ten authored bosses
// sim inside these bands (the old deadly-DC-25 pins are gone: those bosses now
// carry explicit `dc` overrides in the 19-20 range plus damage profiles).

import { storyTemplates } from '../data/storyTemplates';
import { SIDE_QUESTS, QUEST_ITEM_ICON_FROM } from '../data/sideQuests';
import { SHOP_STOCK } from '../data/shopStock';
import { encounterTemplates } from '../data/encounters';
import { populateSite, LOOT, HOARD_BONUS } from './sitePopulator';
import { describeItemSources } from './questHints';
import { effectivePartyLevel } from './questEngine';
import {
  ITEM_CATALOG,
  isItemAllowedForTier
} from '../utils/inventorySystem';
import { XP_THRESHOLDS, getLevelBonus } from '../utils/progressionSystem';
import { SLOT_FOR_TYPE, parseBonus } from './equipment';
import {
  buildSimHero,
  simulateEncounter,
  auditWorldXpBudget,
  equippableCatalogEntries
} from './balanceSim';

jest.setTimeout(120000);

// ---------------------------------------------------------------------------------
// Sim configuration: deterministic seed; 3000 trials keeps the whole suite fast
// while holding win rates stable to well under ±2pp per seed.
const TRIALS = 3000;
const SEED = 1;
const LEVELING_SEED = 7;

// ---------------------------------------------------------------------------------
// KNOWN_GAPS — the pinned design-debt ledger. Backlog refs in comments.
const KNOWN_GAPS = {
  // (a) #45/#50: Lv 6-7 have NO playable campaign (t3 is comingSoon). Remove levels
  // from this list as t3 content ships.
  bandsWithoutCampaigns: [6, 7],

  // (a) §13.3: party size trivializes minLevel — 4 heroes at Lv 1 have effective
  // level 3 and are offered 37 of the 48 side quests on day one (#45 tripled the
  // Lv3+ band; #65 Phase 6 added 6 water-town quests, 5 of them Lv <= 2 flavor).
  // Intentional today; pinned so a gating change is noticed. In practice the
  // water six only surface on maps that generate a harbormaster/boathouse.
  questsOfferedToLevel1PartyOf4: 37,

  // (b) #44/#49: gear with no live source at any REACHABLE tier (max playable tier
  // is 2 today; legendary rarity unlocks at t3, which has no playable template).
  // hide_armor / ring_protection / dragonscale_plate got sources in #49, and #44 gave
  // artifact_trinket one (ruins hoard pool) — none of those are pinned; the guard
  // reads their live sources. What remains pinned is the LEGENDARY SHELF, which is
  // unobtainable BY DESIGN until a playable t3 ships: legendary_weapon (ruin-vault
  // drop, gated to t3) plus the five bespoke t3 reward items authored by #44
  // (T3_CAMPAIGNS_PLAN §5.3). t3 authoring wires them to milestones and removes them
  // from this pin.
  unobtainableGear: [
    'aegis_of_dawn',
    'bell_of_the_last_tide', // #70: The Drowned Bells finale reward (private flagship, server-delivered); no public source by design
    'blade_of_the_shattered_throne',
    'clockwork_god_core',
    'crown_of_the_drowned_city',
    'heart_of_the_last_winter',
    'legendary_weapon'
  ],

  // (b) #44: bonus rungs that exist in the catalog but cannot be obtained. The old
  // weapon-+2 gap is HEALED (runic_greatsword, very_rare, ruin-vault/dragon-lair
  // drops at t2). The pinned rungs now belong to the t3 legendary shelf: weapon +3
  // (blade_of_the_shattered_throne) and armor +5 (aegis_of_dawn) go live with t3.
  unobtainableSlotRungs: { weapon: [3], armor: [5], accessory: [] },

  // (c) boss win-rate pins. HEALED 2026-07-03 by #43 (Lead + Support party
  // fights, flat enemy damage, explicit boss damage profiles, deadly-DC retune to
  // 19-20): every authored boss now sims inside the healthy bands under the band
  // semantics in the header (t1 solo / t2+ 3-hero party), so NO pins remain.
  // Re-measured at TRIALS/SEED after #44 (gear-ladder expansion): t1 mid 69-85%
  // (t1 'best' == mid win rate — the tier-1 rare cap adds defense, not attack),
  // t2 3-hero mid 42-56% (unchanged; the mid preset is fixed), t2 best 79-95%
  // (up ~8-10pp: 'best' now derives runic_greatsword, the very_rare +2 weapon
  // rung, at tier 2). All none >= 10%, all tpk <= 25%, all stalemate <= 45%.
  // Add a pin here only for future intentionally-unbalanced content.
  bossBalance: {},

  // (d) HISTORY: Part I §2 pinned that no t2 world's XP reached the t3 entry
  // (Lv 5 = 6,500 XP; totals ~3,800-4,600 after #45/#50). GAP CLOSED
  // 2026-07-07: tidewater-t3 (The Drowned Bells, a Lv 4-entry bridge t3)
  // joined the catalog as a shop-window stub, lowering the tier's entry target
  // to Lv 4 (2,700 XP), which every t2 budget already covers. Pins removed per
  // the pin's own instruction.
  worldsBelowXpBudget: [],

  // (f) 'gemstone' was rewarded with no ITEM_CATALOG entry (nameless zero-value
  // item) — FIXED 2026-07-03 by splitting the drops onto existing items
  // (raw_gems weighted common, rare_gem the rarer cut). No unknowns remain.
  unknownRewardItems: [],

  // (e) #47 RESOLVED 2026-07-03: the level term shipped (getLevelBonus — +1 per
  // 2 levels, cap +3, in the resolver). The guard is now bonus-aware: win rate
  // must step up (>= EPSILON) exactly where getLevelBonus steps between adjacent
  // levels, and stay ~flat where it doesn't.
  levelingPowerIsFlat: false
};

const EPSILON = 0.02; // 2pp — guard (e) improvement threshold
const HEALTHY = {
  mid: [0.30, 0.90],
  best: [0.50, 1.0],
  none: [0.10, 1.0],
  maxTpkRisk: 0.25, // whole-party wipe per attempt (== old koRate for solo heroes)
  maxStalemateRate: 0.45
};

// ---------------------------------------------------------------------------------
// Shared live-data derivations
// Teaser stubs are card faces for server-delivered campaigns (2026-07-07):
// their playable content lives in premium_templates and is validated by the
// deploy pipeline + the private repo's sim records, not this public lint.
const playableTemplates = storyTemplates.filter((t) => !t.comingSoon && !t.teaser);
const maxReachableTier = Math.max(...playableTemplates.map((t) => t.tier || 1));

const bossEntries = playableTemplates
  .map((template) => ({
    template,
    milestone: (template.settings?.milestones || []).find((m) => m.encounter)
  }))
  .filter((e) => e.milestone);

const intendedLevel = ({ template, milestone }) =>
  milestone.minLevel || (template.levelRange ? template.levelRange[0] : 1);

// --- site loot, as ACTUALLY rolled -------------------------------------------------
// Measure what populateSite really hands out per site type by running the LIVE
// populator over synthetic sites across many seeds (deterministic LCG inside).
// This models coercion bugs and their fixes automatically (#49): if a pool is dead,
// its items simply never show up here.
const syntheticSite = (type) => {
  const size = 8;
  const mapData = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => ({ x, y, type: 'floor', walkable: true }))
  );
  const contentSlots = [
    { x: 2, y: 2 }, { x: 5, y: 2 }, { x: 2, y: 5 },
    { x: 5, y: 5 }, { x: 7, y: 7 }, { x: 4, y: 7 }
  ];
  contentSlots.forEach(({ x, y }) => { mapData[y][x].contentSlot = true; });
  return { type, name: `sim-${type}`, mapData, contentSlots, entryPoint: { x: 0, y: 0 } };
};

const measureSiteItems = (type, seeds = 80) => {
  const items = new Set();
  for (let s = 1; s <= seeds; s++) {
    const site = populateSite(syntheticSite(type), s * 131);
    site.mapData.forEach((row) => row.forEach((tile) => {
      if (tile.content?.kind === 'loot') {
        (tile.content.loot?.items || []).forEach((i) => items.add(i));
      }
    }));
  }
  return items;
};

const siteTypes = Object.keys(LOOT);
const measuredSiteItems = {}; // type -> Set of item keys actually rolled
siteTypes.forEach((type) => { measuredSiteItems[type] = measureSiteItems(type); });
const anySiteItem = new Set(siteTypes.flatMap((t) => [...measuredSiteItems[t]]));

// --- encounter drops (tier-aware) ---------------------------------------------------
const stripChance = (s) => String(s).split(':')[0];

const randomEncounterDropKeys = new Set(
  Object.values(encounterTemplates).flatMap((e) => (e.rewards?.items || []).map(stripChance))
);

// Authored boss-encounter drops still pass through the resolver's tier gate at their
// template's tier (generateLoot -> filterDropsByTier).
const bossDropKeys = new Set(
  bossEntries.flatMap(({ template, milestone }) =>
    (milestone.encounter.rewards?.items || [])
      .map(stripChance)
      .filter((key) => isItemAllowedForTier(key, { tier: template.tier }))
  )
);

// Hand-authored milestone / side-quest rewards are explicit design (not tier-clamped).
const authoredRewardKeys = new Set([
  ...playableTemplates.flatMap((t) =>
    (t.settings?.milestones || []).flatMap((m) => (m.rewards?.items || []).map(stripChance))
  ),
  ...SIDE_QUESTS.flatMap((q) => [
    ...(q.rewards?.items || []).map(stripChance),
    ...q.milestones.flatMap((m) => (m.rewards?.items || []).map(stripChance))
  ])
]);

const shopKeys = new Set(Object.values(SHOP_STOCK).flat());

/** All live sources of an item, at the reachable tiers. */
const sourcesOf = (key) => {
  const sources = [];
  if (shopKeys.has(key)) sources.push('shop');
  if (randomEncounterDropKeys.has(key) && isItemAllowedForTier(key, { tier: maxReachableTier })) {
    sources.push('encounter-drop');
  }
  if (bossDropKeys.has(key)) sources.push('boss-drop');
  if (anySiteItem.has(key)) sources.push('site-loot'); // granted ungated (Game.js grantSiteLoot)
  if (authoredRewardKeys.has(key)) sources.push('authored-reward');
  return sources;
};

// --- sims (computed once in beforeAll, asserted synchronously in the guards) -------
const simCache = new Map(); // `${bossName}|L${level}|${loadout}` -> result
const simKey = (name, level, loadout) => `${name}|L${level}|${loadout}`;

// The band-semantics party (see header): t1 = solo Fighter; t2+ = 3-hero party
// (Fighter lead + Wizard + Cleric), everyone at the same level and loadout.
const bandParty = (tier, level, loadout) => {
  if ((tier || 1) <= 1) return buildSimHero({ level, loadout, tier });
  return [
    buildSimHero({ level, characterClass: 'Fighter', loadout, tier }),
    buildSimHero({ level, characterClass: 'Wizard', loadout, tier }),
    buildSimHero({ level, characterClass: 'Cleric', loadout, tier })
  ];
};

const runSim = async (entry, level, loadout, seed = SEED) => {
  const { template, milestone } = entry;
  return simulateEncounter(milestone.encounter, bandParty(template.tier, level, loadout), {
    trials: TRIALS,
    seed,
    settings: { tier: template.tier }
  });
};

const xpAudits = new Map(); // templateId -> audit result

beforeAll(async () => {
  for (const entry of bossEntries) {
    const level = intendedLevel(entry);
    for (const loadout of ['none', 'mid', 'best']) {
      simCache.set(
        simKey(entry.milestone.encounter.name, level, loadout),
        await runSim(entry, level, loadout)
      );
    }
    // Guard (e): mid loadout at every level in the template's band (own seed so the
    // per-level comparison shares an identical dice stream).
    const [lo, hi] = entry.template.levelRange;
    for (let L = lo; L <= hi; L++) {
      simCache.set(
        simKey(entry.milestone.encounter.name, L, 'mid-leveling'),
        await runSim(entry, L, 'mid', LEVELING_SEED)
      );
    }
  }
  for (const template of playableTemplates) {
    xpAudits.set(
      template.id,
      await auditWorldXpBudget(template, { sideQuests: SIDE_QUESTS, trials: TRIALS, seed: SEED })
    );
  }
});

// ===================================================================================
describe('guard (a): every level band 1-7 has serving content', () => {
  const MIN_QUESTS_PER_BAND = 3;

  test.each([1, 2, 3, 4, 5, 6, 7])('level %i has a playable campaign (or is a pinned gap)', (level) => {
    const covering = playableTemplates.filter(
      (t) => t.levelRange && t.levelRange[0] <= level && level <= t.levelRange[1]
    );
    if (KNOWN_GAPS.bandsWithoutCampaigns.includes(level)) {
      // PINNED (#45/#50): shipping a campaign for this band must update the pin.
      expect(covering.length).toBe(0);
    } else {
      expect(covering.length).toBeGreaterThanOrEqual(1);
    }
  });

  test.each([1, 2, 3, 4, 5, 6, 7])(`level %i has >= ${MIN_QUESTS_PER_BAND} side quests in reach`, (level) => {
    const quests = SIDE_QUESTS.filter((q) => (q.minLevel || 1) <= level);
    expect(quests.length).toBeGreaterThanOrEqual(MIN_QUESTS_PER_BAND);
  });

  test('party-size skew: quests offered to a 4-hero level-1 party (pinned, §13.3)', () => {
    const party = Array.from({ length: 4 }, () => buildSimHero({ level: 1, loadout: 'none' }));
    const effLevel = effectivePartyLevel(party);
    expect(effLevel).toBe(3); // lead 1 + floor(4/2)
    const offered = SIDE_QUESTS.filter((q) => (q.minLevel || 1) <= effLevel);
    expect(offered.length).toBe(KNOWN_GAPS.questsOfferedToLevel1PartyOf4);
  });
});

// ===================================================================================
describe('guard (b): gear obtainability', () => {
  const equippables = equippableCatalogEntries();

  test('every equippable has a live source at a reachable tier (gaps pinned, #44)', () => {
    const dead = equippables
      .filter(([key]) => sourcesOf(key).length === 0)
      .map(([key]) => key)
      .sort();
    // Exact pin: an item gaining a source (fix) or losing one (regression) both land here.
    expect(dead).toEqual([...KNOWN_GAPS.unobtainableGear].sort());
  });

  test('every bonus rung that exists per slot is obtainable (gaps pinned, #44)', () => {
    const gaps = { weapon: [], armor: [], accessory: [] };
    const bySlot = { weapon: [], armor: [], accessory: [] };
    for (const [key, def, slot] of equippables) {
      const bonus = slot === 'accessory' ? (parseBonus(def.bonus) || 1) : parseBonus(def.bonus);
      bySlot[slot].push({ key, bonus });
    }
    for (const slot of Object.keys(bySlot)) {
      const rungs = [...new Set(bySlot[slot].map((i) => i.bonus))].sort((a, b) => a - b);
      for (const rung of rungs) {
        const obtainable = bySlot[slot].some(
          (i) => i.bonus === rung && sourcesOf(i.key).length > 0
        );
        if (!obtainable) gaps[slot].push(rung);
      }
    }
    expect(gaps).toEqual(KNOWN_GAPS.unobtainableSlotRungs);
  });

  test('describeItemSources never names a site type that does not actually roll the item (#49)', () => {
    const mismatches = [];
    for (const [key] of equippables) {
      const staticTypes = siteTypes.filter(
        (t) => (LOOT[t] || []).includes(key) || (HOARD_BONUS[t] || []).includes(key)
      );
      for (const type of staticTypes) {
        if (!measuredSiteItems[type].has(key)) mismatches.push(`${key} @ ${type}`);
      }
    }
    // #49 fixed the dead-pool coercion; any regression (a hinted pool going dead
    // again) shows up here as a lie in the journal's derived hints.
    expect(mismatches).toEqual([]);
  });

  test('sanity: the hint text derivation has sources for the gather-quest items', () => {
    const gatherTargets = SIDE_QUESTS.flatMap((q) =>
      q.milestones.filter((m) => m.trigger?.item && m.trigger?.count).map((m) => m.trigger.item)
    );
    for (const item of new Set(gatherTargets)) {
      expect(describeItemSources(item)).not.toBe('');
    }
  });
});

// ===================================================================================
describe('guard (c): every authored boss sims inside its win band', () => {
  const inRange = (value, [lo, hi]) => value >= lo && value <= hi;

  test('all 10 playable templates author exactly one boss encounter', () => {
    expect(bossEntries.length).toBe(playableTemplates.length);
  });

  describe.each(bossEntries.map((e) => [e.milestone.encounter.name, e]))('%s', (name, entry) => {
    const level = intendedLevel(entry);

    test.each(['none', 'mid', 'best'])('win rate at intended level, %s loadout', (loadout) => {
      const result = simCache.get(simKey(name, level, loadout));
      expect(result).toBeDefined();
      const pin = KNOWN_GAPS.bossBalance[name]?.[loadout];
      if (pin) {
        // PINNED: current (unhealthy) value. A rebalance OR a regression must
        // update this pin (deadly-t2 decision / #44 gear rungs).
        expect(inRange(result.winRate, pin)).toBe(true);
      } else {
        expect(inRange(result.winRate, HEALTHY[loadout])).toBe(true);
      }
    });

    test('wipe risk and stalemate stay inside band (mid loadout)', () => {
      const result = simCache.get(simKey(name, level, 'mid'));
      // #43: bosses hit back now, so individual KOs (lead rotations) are part of
      // an epic fight; the guarded ceiling is the WHOLE party going down.
      expect(result.tpkRisk).toBeLessThanOrEqual(HEALTHY.maxTpkRisk);
      expect(result.stalemateRate).toBeLessThanOrEqual(HEALTHY.maxStalemateRate);
    });
  });
});

// ===================================================================================
describe('guard (d): world XP budget reaches the next tier entry', () => {
  // Entry level of tier N+1 = the lowest levelRange floor authored for that tier
  // (comingSoon templates count: they ARE the declared target).
  const nextTierEntryXp = (tier) => {
    const nextTier = storyTemplates.filter((t) => (t.tier || 1) === tier + 1);
    if (nextTier.length === 0) return null;
    const entryLevel = Math.min(...nextTier.map((t) => (t.levelRange ? t.levelRange[0] : 1)));
    return { entryLevel, xp: XP_THRESHOLDS[entryLevel - 1] };
  };

  test.each(playableTemplates.map((t) => [t.id, t]))('%s', (id, template) => {
    const target = nextTierEntryXp(template.tier || 1);
    if (!target) return; // no authored sequel tier — nothing to reach
    const audit = xpAudits.get(id);
    expect(audit).toBeDefined();
    if (KNOWN_GAPS.worldsBelowXpBudget.includes(id)) {
      // PINNED (Part I §2 / #50): t2 worlds cannot pay their way to Lv 5. Content
      // or XP changes that close the gap must remove the pin.
      expect(audit.totalXp).toBeLessThan(target.xp);
      expect(audit.totalXp).toBeGreaterThan(target.xp * 0.25); // regression floor
    } else {
      expect(audit.totalXp).toBeGreaterThanOrEqual(target.xp);
    }
  });
});

// ===================================================================================
describe('guard (e): leveling improves boss outcomes above epsilon', () => {
  test.each(bossEntries.map((e) => [e.milestone.encounter.name, e]))(
    'leveling delta across the band: %s',
    (name, entry) => {
      const [lo, hi] = entry.template.levelRange;
      const steps = [];
      for (let L = lo; L < hi; L++) {
        const at = simCache.get(simKey(name, L, 'mid-leveling'));
        const next = simCache.get(simKey(name, L + 1, 'mid-leveling'));
        steps.push({ from: L, delta: next.winRate - at.winRate });
      }
      expect(steps.length).toBeGreaterThan(0);
      if (KNOWN_GAPS.levelingPowerIsFlat) {
        // PINNED (#47): no level term in the dice, so every delta is ~0. Delete
        // the pin when a leveling-power mechanic ships (done 2026-07-03).
        steps.forEach(({ delta }) => expect(Math.abs(delta)).toBeLessThan(EPSILON));
      } else {
        // Bonus-aware (#47 shipped): win rate must step up (>= EPSILON) where the
        // level term steps (getLevelBonus: +1 per 2 levels, cap +3). Where the
        // term does NOT step, leveling may still drift the rate UP a little —
        // since #43 bosses deal real damage, so the max-HP gained per level buys
        // genuine survivability — but it must never REGRESS: delta >= -EPSILON.
        const minStep = KNOWN_GAPS.bossBalance[name] ? EPSILON / 2 : EPSILON;
        steps.forEach(({ from, delta }) => {
          const bonusStep = getLevelBonus(from + 1) - getLevelBonus(from);
          if (bonusStep >= 1) {
            expect(delta).toBeGreaterThanOrEqual(minStep);
          } else {
            expect(delta).toBeGreaterThanOrEqual(-EPSILON);
          }
        });
      }
    }
  );
});

// ===================================================================================
describe('guard (f): reward integrity', () => {
  test('every rewards.items key across templates/quests/encounters exists in ITEM_CATALOG', () => {
    const unknown = new Set();
    const check = (key) => { if (!ITEM_CATALOG[stripChance(key)]) unknown.add(stripChance(key)); };

    playableTemplates.forEach((t) =>
      (t.settings?.milestones || []).forEach((m) => {
        (m.rewards?.items || []).forEach(check);
        (m.encounter?.rewards?.items || []).forEach(check);
      })
    );
    SIDE_QUESTS.forEach((q) => {
      (q.rewards?.items || []).forEach(check);
      q.milestones.forEach((m) => (m.rewards?.items || []).forEach(check));
    });
    Object.values(encounterTemplates).forEach((e) => (e.rewards?.items || []).forEach(check));

    // Exact pin: fixing a pinned key or introducing a new unknown key both land here.
    expect([...unknown].sort()).toEqual([...KNOWN_GAPS.unknownRewardItems].sort());
  });

  test('every side-quest gather target actually drops somewhere', () => {
    const gatherTargets = new Set(
      SIDE_QUESTS.flatMap((q) =>
        q.milestones.filter((m) => m.trigger?.item && m.trigger?.count).map((m) => m.trigger.item)
      )
    );
    const dead = [...gatherTargets].filter(
      (item) =>
        !randomEncounterDropKeys.has(item) && !anySiteItem.has(item) && !shopKeys.has(item)
    );
    expect(dead).toEqual([]);
  });

  test('quest find-item icon borrows point at real catalog entries', () => {
    Object.values(QUEST_ITEM_ICON_FROM).forEach((key) => {
      expect(ITEM_CATALOG[key]).toBeDefined();
    });
  });
});
