import { ITEM_CATALOG } from './inventorySystem';
import { SLOT_FOR_TYPE, parseBonus, getEquippedBonuses, equipItem } from '../game/equipment';

// Data guard for equippable catalog items. Equipment is a single-bonus-per-item model:
// weapon -> attack, armor -> defense, ring/charm/artifact -> accessory (misc). These tests
// keep the catalog honest (no mechanically-dead armour, new items wired to the right slot).

const entriesOfType = (type) => Object.entries(ITEM_CATALOG).filter(([, def]) => def.type === type);

describe('catalog equipment data', () => {
  test('every armour item carries a positive defense bonus (no dead armour)', () => {
    const armours = entriesOfType('armor');
    expect(armours.length).toBeGreaterThan(1); // we added a real ladder, not just leather
    armours.forEach(([key, def]) => {
      expect(SLOT_FOR_TYPE[def.type]).toBe('armor');
      expect(parseBonus(def.bonus)).toBeGreaterThan(0); // key: armour must actually soak
    });
  });

  test('the new armour ladder exists with the expected soak values', () => {
    const expected = { leather_armor: 1, studded_leather: 2, hide_armor: 2, scale_mail: 3, dragonscale_plate: 4 };
    for (const [key, soak] of Object.entries(expected)) {
      expect(ITEM_CATALOG[key]).toBeDefined();
      expect(ITEM_CATALOG[key].type).toBe('armor');
      expect(parseBonus(ITEM_CATALOG[key].bonus)).toBe(soak);
    }
  });

  test('equipping a real catalog armour soaks via getEquippedBonuses', () => {
    const hero = { equipment: {}, inventory: [{ key: 'scale_mail' }] };
    const equipped = equipItem(hero, 'scale_mail');
    expect(equipped.equipment.armor).toBe('scale_mail');
    expect(getEquippedBonuses(equipped).defense).toBe(3);
  });

  test('buffed weapons add to-hit; junk weapons stay neutral', () => {
    const equip = (key) => getEquippedBonuses(equipItem({ equipment: {}, inventory: [{ key }] }, key));
    expect(equip('shortsword').attack).toBe(1);
    expect(equip('silver_dagger').attack).toBe(1);
    expect(equip('legendary_weapon').attack).toBe(2);
    expect(equip('rusty_dagger').attack).toBe(0); // junk: no bonus
  });

  test('accessory artifacts and charms now grant a misc bonus', () => {
    const misc = (key) => getEquippedBonuses(equipItem({ equipment: {}, inventory: [{ key }] }, key)).misc;
    expect(misc('crown_of_sunfire')).toBe(3);
    expect(misc('legendary_artifact')).toBe(2);
    expect(misc('nature_charm')).toBe(1);
    expect(misc('fey_charm')).toBe(1);
  });
});
