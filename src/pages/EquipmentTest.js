import React, { useState } from 'react';
import {
  EQUIP_SLOTS, equipItem, unequipSlot, getEquippedBonuses,
  getEquippableItemsForSlot, getEquippedItem,
} from '../game/equipment';
import { removeItem, ITEM_CATALOG } from '../utils/inventorySystem';

// Debug harness for the equipment system. Equip a weapon / armour / accessory on a mock
// hero and watch getEquippedBonuses update live, with the combat math it feeds. Inventory
// entries carry instance `bonus` fields (which the system overlays on the catalog) so the
// armour soak is visible even though the base catalog armour has no bonus.

const SLOT_LABEL = { weapon: 'Weapon', armor: 'Armour', accessory: 'Accessory' };
const BASE_STR_MOD = 2; // pretend the hero has a Strength modifier of +2 for the combat demo
const SAMPLE_INCOMING_DMG = 8;

const card = { border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', padding: '12px 14px', marginBottom: 10 };
const btn = (primary, disabled) => ({
  padding: '5px 10px', border: `1px solid ${primary ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 6,
  background: primary && !disabled ? 'var(--primary)' : 'var(--surface)', color: primary && !disabled ? '#fff' : 'var(--text)',
  cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 12, opacity: disabled ? 0.5 : 1,
});

// A mock hero. Inventory entries are full objects so we can attach instance `bonus` values
// (the equipment system merges these over the catalog definition).
const makeHero = () => ({
  heroName: 'Test Hero',
  equipment: {},
  // Real catalog items only (keys + types as defined in ITEM_CATALOG). The system merges
  // each key with its catalog definition, so bonuses shown here come straight from the data.
  inventory: [
    { key: 'shortsword' },         // weapon, +1
    { key: 'legendary_weapon' },   // weapon, +2
    { key: 'leather_armor' },      // armour, +1 defense
    { key: 'scale_mail' },         // armour, +3 defense
    { key: 'ring_protection' },    // accessory (ring), +1
    { key: 'fey_charm' },          // accessory (charm), +1
    { key: 'healing_potion' },     // not equippable
  ],
});

const EquipmentTest = () => {
  const [hero, setHero] = useState(makeHero);
  const [log, setLog] = useState([]);

  const addLog = (line) => setLog((prev) => [line, ...prev].slice(0, 20));

  const equip = (key) => { setHero((h) => equipItem(h, key)); addLog(`🗡️ Equipped ${ITEM_CATALOG[key]?.name || key}`); };
  const unequip = (slot) => { setHero((h) => unequipSlot(h, slot)); addLog(`➖ Unequipped ${SLOT_LABEL[slot]}`); };
  const dropFromInventory = (key) => {
    setHero((h) => ({ ...h, inventory: removeItem(h.inventory, key) }));
    addLog(`🗑️ Dropped ${ITEM_CATALOG[key]?.name || key} from inventory (any slot pointing at it loses its bonus)`);
  };
  const reset = () => { setHero(makeHero()); setLog([]); };

  const bonuses = getEquippedBonuses(hero);

  return (
    <div>
      <h2 style={{ marginTop: 0, fontFamily: 'var(--header-font)' }}>
        Equipment Test <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>— equip slots, bonuses & combat math</span>
      </h2>
      <p style={{ color: 'var(--text-secondary)', maxWidth: 760, fontSize: 14 }}>
        Pure <code>equipment</code> helpers on a mock hero. A weapon's bonus feeds <strong>attack</strong>
        {' '}(combat rolls), armour feeds <strong>defense</strong> (flat HP soak), an accessory feeds
        {' '}<strong>misc</strong> (every check; a bonus-less trinket still grants +1). Dropping an
        equipped item from the inventory drops its bonus even while the slot still references it.
      </p>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* Live bonuses */}
        <div style={{ ...card, minWidth: 260 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted, #888)', marginBottom: 8 }}>Equipped bonuses</div>
          <div style={{ display: 'flex', gap: 18, fontSize: 18 }}>
            <span>⚔️ attack <strong>+{bonuses.attack}</strong></span>
            <span>🛡️ defense <strong>+{bonuses.defense}</strong></span>
            <span>✨ misc <strong>+{bonuses.misc}</strong></span>
          </div>
        </div>
        {/* Combat math */}
        <div style={{ ...card, minWidth: 320, flex: 1 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted, #888)', marginBottom: 8 }}>Combat math (sample)</div>
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>
            <div>Combat roll modifier: base +{BASE_STR_MOD} → <strong>+{BASE_STR_MOD + bonuses.attack + bonuses.misc}</strong> <span style={{ color: 'var(--text-secondary)' }}>(+attack +misc)</span></div>
            <div>Non-combat check: base +{BASE_STR_MOD} → <strong>+{BASE_STR_MOD + bonuses.misc}</strong> <span style={{ color: 'var(--text-secondary)' }}>(+misc only)</span></div>
            <div>Incoming {SAMPLE_INCOMING_DMG} dmg → soaked to <strong>{Math.max(0, SAMPLE_INCOMING_DMG - bonuses.defense)} HP</strong> <span style={{ color: 'var(--text-secondary)' }}>(−defense)</span></div>
          </div>
        </div>
        <button style={btn(false)} onClick={reset}>Reset</button>
      </div>

      {/* Slots */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {EQUIP_SLOTS.map((slot) => {
          const equipped = getEquippedItem(hero, slot);
          const options = getEquippableItemsForSlot(hero, slot);
          return (
            <div key={slot} style={card}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted, #888)', marginBottom: 8 }}>{SLOT_LABEL[slot]}</div>
              <div style={{ marginBottom: 10 }}>
                {equipped ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span><strong>{equipped.name}</strong>{equipped.bonus ? <span style={{ color: 'var(--text-secondary)' }}> ({equipped.bonus})</span> : null}</span>
                    <button style={btn(false)} onClick={() => unequip(slot)}>Unequip</button>
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>— empty —</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {options.map((item) => (
                  <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span>{item.name}{item.bonus ? <span style={{ color: 'var(--text-secondary)' }}> {item.bonus}</span> : null}</span>
                    <button
                      style={btn(true, equipped && equipped.key === item.key)}
                      disabled={equipped && equipped.key === item.key}
                      onClick={() => equip(item.key)}
                    >
                      {equipped && equipped.key === item.key ? 'Equipped' : 'Equip'}
                    </button>
                  </div>
                ))}
                {options.length === 0 && <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>No items for this slot.</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Inventory (with drop, to prove bonus removal on item loss) */}
      <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #888)', marginTop: 20 }}>Inventory</h3>
      <div style={{ ...card }}>
        {hero.inventory.map((item) => (
          <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 13 }}>
            <span>
              <strong>{item.name}</strong>
              <span style={{ color: 'var(--text-secondary)' }}> · {item.type}{item.bonus ? ` · ${item.bonus}` : ''}</span>
            </span>
            <button style={btn(false)} onClick={() => dropFromInventory(item.key)}>Drop</button>
          </div>
        ))}
        {hero.inventory.length === 0 && <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Empty.</span>}
      </div>

      {/* Log */}
      <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #888)', marginTop: 20 }}>Log</h3>
      <div style={{ ...card, minHeight: 70, fontFamily: 'monospace', fontSize: 13 }}>
        {log.length === 0 ? <span style={{ color: 'var(--text-secondary)' }}>No actions yet.</span>
          : log.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  );
};

export default EquipmentTest;
