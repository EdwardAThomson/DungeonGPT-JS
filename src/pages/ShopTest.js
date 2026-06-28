import React, { useState } from 'react';
import { getShopStock, SHOP_STOCK } from '../data/shopStock';
import { buyItem, sellItem, buyPrice, sellPrice, canAfford, isSellable, partyGold } from '../game/shopController';
import { addItem, ITEM_CATALOG } from '../utils/inventorySystem';

// Debug harness for the shop system (buy / sell). Exercises shopController against a mock
// party without needing a town: pick a shop type, buy from its stock (gold pooled across
// the party, item lands on the lead hero) and sell the lead hero's loot back. Mirrors the
// in-game "Wares" section of BuildingModal.

const SHOP_TYPES = Object.keys(SHOP_STOCK); // shop, market, blacksmith, alchemist

const card = { border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', padding: '12px 14px', marginBottom: 10 };
const btn = (primary, disabled) => ({
  padding: '6px 12px', border: `1px solid ${primary ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 6,
  background: disabled ? 'var(--surface)' : (primary ? 'var(--primary)' : 'var(--surface)'),
  color: primary && !disabled ? '#fff' : 'var(--text)', cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: 13, opacity: disabled ? 0.5 : 1,
});
const gold = { color: '#d4af37', fontWeight: 'bold' };
const costColor = { color: '#c0552e', fontWeight: 'bold' };   // spend (buy)
const earnColor = { color: '#2e8b57', fontWeight: 'bold' };   // receive (sell)
const colHead = (accent) => ({
  fontSize: 14, fontWeight: 700, letterSpacing: '0.03em', padding: '6px 10px', borderRadius: 6,
  marginBottom: 10, background: 'var(--surface)', borderLeft: `4px solid ${accent}`,
});

// Build a fresh mock party: two heroes (pooled gold), the lead carrying assorted loot
// including a non-sellable quest item to prove the guard.
const makeParty = () => {
  let inv = [];
  inv = addItem(inv, 'healing_potion', 2);
  inv = addItem(inv, 'raw_gems', 1);
  inv = addItem(inv, 'shortsword', 1);
  inv = addItem(inv, 'pearl', 1);
  inv = addItem(inv, 'treasure_map', 1); // quest_item -> not sellable
  return [
    { heroName: 'Aldric', gold: 120, inventory: inv },
    { heroName: 'Bryn', gold: 45, inventory: [] },
  ];
};

const ShopTest = () => {
  const [party, setParty] = useState(makeParty);
  const [shopType, setShopType] = useState('shop');
  const [log, setLog] = useState([]);

  const addLog = (line) => setLog((prev) => [line, ...prev].slice(0, 25));

  const buy = (key) => {
    const result = buyItem(party, key);
    if (result.ok) {
      setParty(result.party);
      addLog(`🛒 Bought ${ITEM_CATALOG[key]?.name || key} for ${buyPrice(key)} GP`);
    } else {
      addLog(`✋ Could not buy ${ITEM_CATALOG[key]?.name || key} (${result.reason})`);
    }
  };

  const sell = (key) => {
    const result = sellItem(party, key);
    if (result.ok) {
      setParty(result.party);
      addLog(`💰 Sold ${ITEM_CATALOG[key]?.name || key} for ${result.gold} GP`);
    } else {
      addLog(`✋ Could not sell ${ITEM_CATALOG[key]?.name || key} (${result.reason})`);
    }
  };

  const reset = () => { setParty(makeParty()); setLog([]); };

  const stock = getShopStock(shopType);
  const lead = party[0];
  // Aggregate identical items into one row per key (non-stackable items like rope produce
  // multiple inventory entries that share a key; rendering them as separate rows would mean
  // duplicate React keys and broken reconciliation). count = total units held of that key.
  const nameOf = (it) => it.name || ITEM_CATALOG[it.key]?.name || it.key;
  const sellable = Object.values(
    (lead.inventory || [])
      .filter((i) => i.key && ITEM_CATALOG[i.key])
      .reduce((acc, i) => {
        if (!acc[i.key]) acc[i.key] = { ...i, count: 0 };
        acc[i.key].count += i.quantity || 1;
        return acc;
      }, {})
  ).sort((a, b) => nameOf(a).localeCompare(nameOf(b))); // stable order: rows never jump as stacks deplete
  const pooled = partyGold(party);

  return (
    <div>
      <h2 style={{ marginTop: 0, fontFamily: 'var(--header-font)' }}>
        Shop Test <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>— buy / sell against a mock party</span>
      </h2>
      <p style={{ color: 'var(--text-secondary)', maxWidth: 760, fontSize: 14 }}>
        Pure <code>shopController</code> over a two-hero party. Gold is pooled for affordability and
        spending (lead hero first); bought items land on the lead hero; selling pulls from the lead
        hero's inventory. Buy price = catalog value, sell price = half (rounded). Quest items can't
        be sold.
      </p>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted, #888)', marginBottom: 6 }}>Shop type</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {SHOP_TYPES.map((t) => (
              <button key={t} style={btn(shopType === t)} onClick={() => setShopType(t)}>{t}</button>
            ))}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted, #888)' }}>Party gold (pooled)</div>
          <div style={{ ...gold, fontSize: 22 }}>{pooled} GP</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {party.map((h) => `${h.heroName}: ${h.gold || 0}`).join('  ·  ')}
          </div>
        </div>
        <button style={btn(false)} onClick={reset}>Reset</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Buy column */}
        <div>
          <div style={colHead('#c0552e')}>🛒 BUY — {shopType} stock <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>(spend gold)</span></div>
          {stock.map((key) => {
            const item = ITEM_CATALOG[key];
            if (!item) return null;
            const affordable = canAfford(party, key);
            return (
              <div key={key} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  <strong>{item.name}</strong>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}> · {item.rarity}{item.type ? ` · ${item.type}` : ''}</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ ...costColor, minWidth: 70, textAlign: 'right' }}>-{buyPrice(key)} GP</span>
                  <button style={btn(true, !affordable)} disabled={!affordable} onClick={() => buy(key)}>Buy</button>
                </span>
              </div>
            );
          })}
        </div>

        {/* Sell column */}
        <div>
          <div style={colHead('#2e8b57')}>💰 SELL — {lead.heroName}'s inventory <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>(earn gold)</span></div>
          {sellable.length === 0 && <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Nothing to sell.</div>}
          {sellable.map((item) => {
            const ok = isSellable(item.key);
            return (
              <div key={item.key} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  <strong>{item.name || ITEM_CATALOG[item.key]?.name || item.key}</strong>
                  {item.count > 1 && <span style={{ color: 'var(--text-secondary)' }}> x{item.count}</span>}
                  {!ok && <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}> · quest item</span>}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ ...earnColor, minWidth: 70, textAlign: 'right' }}>{ok ? `+${sellPrice(item.key)} GP` : '—'}</span>
                  <button style={btn(false, !ok)} disabled={!ok} onClick={() => sell(item.key)}>Sell</button>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Transaction log */}
      <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #888)', marginTop: 20 }}>Log</h3>
      <div style={{ ...card, minHeight: 80, fontFamily: 'monospace', fontSize: 13 }}>
        {log.length === 0 ? <span style={{ color: 'var(--text-secondary)' }}>No transactions yet.</span>
          : log.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  );
};

export default ShopTest;
