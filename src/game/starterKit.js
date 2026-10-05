// Starter kit: every hero sets out with a basic weapon, armour, two healing items and a
// little gold. Combat is tuned around a hero carrying at least a +1 weapon (the starting-
// advantage baseline in multiRoundEncounter.js assumes "weapon +1"), but nothing used to
// hand one out: ready-made and newly created heroes began with no gear and 0 gold, so
// every new player started below the line the fights were balanced for.
//
// Granted at game load (Game.js, before the hero invariants run) because in-game gear lives
// in each save, not on the hero roster. Once per hero per save: `starterKitGranted` marks
// it. A hero who already has a weapon or armour equipped (a veteran from an older save) is
// only marked, never re-kitted, so this cannot hand out a second set of gear.

import { addItem } from '../utils/inventorySystem';
import { equipItem } from './equipment';
import { heroUid } from '../utils/partyUtils';

export const STARTER_KIT = Object.freeze({
  weapon: 'shortsword', // the only common +1 weapon
  armor: 'leather_armor', // common +1 defence
  items: Object.freeze(['healing_potion', 'herbal_remedy']),
  gold: 20,
});

/**
 * Grant the starter kit to one hero if it hasn't had one.
 * @returns {{ hero: Object, granted: boolean, events: Array }} `events` are hero-ledger
 *   grant events (item / gold) for the caller to append; empty when nothing was granted.
 */
export const grantStarterKit = (hero) => {
  if (!hero || hero.starterKitGranted) return { hero, granted: false, events: [] };
  const eq = hero.equipment || {};
  if (eq.weapon || eq.armor) {
    return { hero: { ...hero, starterKitGranted: true }, granted: false, events: [] };
  }
  const keys = [STARTER_KIT.weapon, STARTER_KIT.armor, ...STARTER_KIT.items];
  let inventory = Array.isArray(hero.inventory) ? hero.inventory : [];
  keys.forEach((key) => { inventory = addItem(inventory, key, 1); });
  let next = { ...hero, inventory, gold: (hero.gold || 0) + STARTER_KIT.gold, starterKitGranted: true };
  next = equipItem(next, STARTER_KIT.weapon);
  next = equipItem(next, STARTER_KIT.armor);
  const heroId = heroUid(hero);
  const events = heroId
    ? [
      ...keys.map((key) => ({ heroId, kind: 'item', key, count: 1 })),
      { heroId, kind: 'gold', amount: STARTER_KIT.gold },
    ]
    : [];
  return { hero: next, granted: true, events };
};

/**
 * Apply the starter kit across a party.
 * @returns {{ party: Array, grantedNames: string[], events: Array }}
 */
export const grantPartyStarterKits = (party) => {
  const grantedNames = [];
  const events = [];
  const out = (party || []).map((hero) => {
    const r = grantStarterKit(hero);
    if (r.granted) {
      grantedNames.push(hero.heroName || hero.characterName || 'A hero');
      events.push(...r.events);
    }
    return r.hero;
  });
  return { party: out, grantedNames, events };
};

/** One Adventure Log line describing what each outfitted hero received. */
export const starterKitMessage = (grantedNames) => {
  if (!grantedNames || grantedNames.length === 0) return null;
  const who = grantedNames.length === 1
    ? grantedNames[0]
    : `${grantedNames.slice(0, -1).join(', ')} and ${grantedNames[grantedNames.length - 1]}`;
  const each = grantedNames.length === 1 ? 'sets out with' : 'each set out with';
  return `🎒 ${who} ${each} a shortsword and leather armour (equipped), a healing potion, a herbal remedy and ${STARTER_KIT.gold} gold.`;
};
