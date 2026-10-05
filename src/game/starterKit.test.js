import { grantStarterKit, grantPartyStarterKits, starterKitMessage, STARTER_KIT } from './starterKit';
import { getEquippedBonuses } from './equipment';
import { healHeroUpward } from './heroInvariants';

const fresh = (over = {}) => ({ heroId: 'h1', heroName: 'Marius', heroClass: 'Fighter', level: 1, xp: 0, gold: 0, inventory: [], ...over });
const keys = (hero) => hero.inventory.map((i) => (typeof i === 'string' ? i : i.key));

describe('grantStarterKit', () => {
  it('outfits a bare hero: weapon and armour equipped, two healing items, gold', () => {
    const { hero, granted, events } = grantStarterKit(fresh());
    expect(granted).toBe(true);
    expect(hero.starterKitGranted).toBe(true);
    expect(hero.equipment).toMatchObject({ weapon: 'shortsword', armor: 'leather_armor' });
    expect(keys(hero)).toEqual(['shortsword', 'leather_armor', 'healing_potion', 'herbal_remedy']);
    expect(hero.gold).toBe(STARTER_KIT.gold);
    // The +1 weapon the combat baseline assumes is now actually there.
    expect(getEquippedBonuses(hero)).toMatchObject({ attack: 1, defense: 1 });
    expect(events).toEqual(expect.arrayContaining([
      { heroId: 'h1', kind: 'item', key: 'shortsword', count: 1 },
      { heroId: 'h1', kind: 'gold', amount: STARTER_KIT.gold },
    ]));
  });

  it('is granted once: a marked hero (even after selling everything) gets nothing more', () => {
    const once = grantStarterKit(fresh()).hero;
    const sold = { ...once, inventory: [], equipment: { weapon: null, armor: null, accessory: null }, gold: 0 };
    const again = grantStarterKit(sold);
    expect(again.granted).toBe(false);
    expect(again.hero).toBe(sold);
  });

  it('only marks a veteran who already has gear equipped', () => {
    const vet = fresh({ inventory: ['silver_dagger'], equipment: { weapon: 'silver_dagger', armor: null, accessory: null }, gold: 7 });
    const { hero, granted, events } = grantStarterKit(vet);
    expect(granted).toBe(false);
    expect(events).toEqual([]);
    expect(hero.starterKitGranted).toBe(true);
    expect(hero.inventory).toEqual(['silver_dagger']);
    expect(hero.gold).toBe(7);
  });

  it('keeps what a gearless hero already carries (an older save) and adds the kit', () => {
    const { hero } = grantStarterKit(fresh({ inventory: [{ key: 'quest_clue', quantity: 1 }], gold: 5 }));
    expect(keys(hero)).toContain('quest_clue');
    expect(hero.gold).toBe(5 + STARTER_KIT.gold);
  });

  it('survives the load-time invariant pass (equipped keys are carried)', () => {
    const { hero } = grantStarterKit(fresh());
    const healed = healHeroUpward({ ...hero, maxHP: 20, currentHP: 20 }).hero;
    expect(healed.equipment).toMatchObject({ weapon: 'shortsword', armor: 'leather_armor' });
  });
});

describe('party grant + log line', () => {
  it('outfits each new hero and names them in one line', () => {
    const { party, grantedNames, events } = grantPartyStarterKits([fresh(), fresh({ heroId: 'h2', heroName: 'Dahlia' })]);
    expect(party.every((h) => h.starterKitGranted)).toBe(true);
    expect(grantedNames).toEqual(['Marius', 'Dahlia']);
    expect(events.filter((e) => e.kind === 'gold')).toHaveLength(2);
    expect(starterKitMessage(grantedNames)).toMatch(/^🎒 Marius and Dahlia each set out with a shortsword/);
    expect(starterKitMessage([])).toBeNull();
  });
});

describe('balance: the kit sits between no gear and the mid baseline', () => {
  // Tier-1 campaign bosses, solo Fighter at level 1 (the band party for t1).
  const { buildSimHero, simulateEncounter } = require('./balanceSim');
  const { storyTemplates } = require('../data/storyTemplates');
  const bosses = storyTemplates.filter((t) => t.tier === 1 && !t.premium)
    .flatMap((t) => (t.settings?.milestones || []).filter((m) => m.encounter).map((m) => m.encounter));

  it.each(bosses.map((e) => [e.name, e]))('%s', async (_name, enc) => {
    const win = async (loadout) => (await simulateEncounter(enc, buildSimHero({ level: 1, loadout, tier: 1 }),
      { trials: 1500, seed: 11, settings: { tier: 1 } })).winRate;
    const [none, starter, mid] = [await win('none'), await win('starter'), await win('mid')];
    expect(starter).toBeGreaterThan(none);
    expect(starter).toBeLessThanOrEqual(mid + 0.02);
  });
});
