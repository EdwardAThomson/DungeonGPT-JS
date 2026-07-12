import React, { useState, useEffect, useRef } from 'react';
import { ITEM_CATALOG, getRarityColor, consumeHealingItem } from '../utils/inventorySystem';
import { getHPStatus } from '../utils/healthSystem';
import { heroUid } from '../utils/partyUtils';
import { useModal } from '../contexts/ModalContext';
import {
  EQUIP_SLOTS,
  getEquippedItem,
  getEquippablePartyItems,
  equipItemFromParty,
  unequipSlot,
  parseBonus
} from '../game/equipment';

const SLOT_LABELS = { weapon: 'Weapon', armor: 'Armour', accessory: 'Accessory' };
const STAT_FOR_SLOT = { weapon: 'attack', armor: 'armour soak', accessory: 'to checks' };
// "+N stat" label for an equip bonus; accessories with no number still grant +1 to checks.
const formatSlotBonus = (slot, bonusStr) => {
  let n = parseBonus(bonusStr);
  if (slot === 'accessory' && !n) n = 1;
  if (!n) return null;
  return `${n >= 0 ? '+' : ''}${n} ${STAT_FOR_SLOT[slot] || ''}`.trim();
};

// #52: formerly a standalone modal (useModal('inventory') + ModalShell), now the
// content of the Adventure Book's 🎒 Party tab. The hub mounts it only while the
// tab is active, so transient UI state (hero picker, result toasts, overrides)
// resets naturally on tab switch / hub close. Receives LIVE party props (not an
// open-time snapshot), so external HP/inventory changes stay in sync.
const PartyInventoryContent = ({ selectedHeroes = [], onUseItem, onHeroUpdate }) => {
  const [selectedImage, setSelectedImage] = useState(null);
  const { open: openItemDetail } = useModal('itemDetail'); // item-detail modal (child of adventureBook)
  const [useItemState, setUseItemState] = useState(null); // { itemKey } — hero picker
  const [useResults, setUseResults] = useState([]); // [{ heroName, itemName, rolled, healed, id }]
  const [activeTab, setActiveTab] = useState('items'); // 'items' | 'loadout'
  // Session-only hero edits (potion use / equip / unequip) layered over the live
  // props so the UI updates instantly. Each edit is also persisted via the callbacks.
  const [overrides, setOverrides] = useState({}); // heroUid -> updated hero
  const resultTimers = useRef([]);

  // Clear pending result-toast timers on unmount (tab switch / hub close).
  useEffect(() => () => {
    resultTimers.current.forEach(clearTimeout);
    resultTimers.current = [];
  }, []);

  // The party as currently shown: the snapshot with any local edits applied on top.
  const party = selectedHeroes.map((h) => overrides[heroUid(h)] || h);
  const applyHeroes = (heroes) => setOverrides((prev) => {
    const next = { ...prev };
    heroes.forEach((h) => { const id = heroUid(h); if (id) next[id] = h; });
    return next;
  });

  const allItems = party.flatMap((hero) => hero.inventory || []);
  const totalGold = party.reduce((sum, hero) => sum + (hero.gold || 0), 0);

  const itemMap = {};
  for (const item of allItems) {
    const key = typeof item === 'string' ? item : (item.key || 'unknown');
    const catalogEntry = ITEM_CATALOG[key];
    const name = catalogEntry?.name || item.name || key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    const quantity = item.quantity || 1;
    const rarity = catalogEntry?.rarity || item.rarity || 'common';
    const icon = catalogEntry?.icon || item.icon || null;
    const description = catalogEntry?.description || item.description || null;
    const effect = catalogEntry?.effect || null;
    const amount = catalogEntry?.amount || null;
    const value = catalogEntry?.value ?? item.value ?? 0;
    const type = catalogEntry?.type || item.type || null;

    if (itemMap[key]) {
      itemMap[key].quantity += quantity;
    } else {
      itemMap[key] = { key, name, quantity, rarity, icon, description, effect, amount, value, type };
    }
  }

  // Subtract items currently equipped by any hero so a worn item isn't also
  // shown as available loot. Counts (not filtering by key) so spare copies of
  // the same item still appear.
  const equippedCounts = {};
  for (const hero of party) {
    for (const equippedKey of Object.values(hero.equipment || {})) {
      if (equippedKey) equippedCounts[equippedKey] = (equippedCounts[equippedKey] || 0) + 1;
    }
  }
  for (const [key, count] of Object.entries(equippedCounts)) {
    if (itemMap[key]) {
      itemMap[key].quantity -= count;
      if (itemMap[key].quantity <= 0) delete itemMap[key];
    }
  }

  const isHealingItem = (item) => item.effect === 'heal' && item.amount;
  const injuredHeroes = party.filter(h => h.currentHP < h.maxHP && !h.isDefeated);

  // Find which hero actually owns an item (first hero with it in inventory)
  const findItemOwner = (itemKey) => {
    return party.find(h =>
      (h.inventory || []).some(i => (typeof i === 'string' ? i : i.key) === itemKey)
    );
  };

  const handleUsePotion = (heroIndex) => {
    const { itemKey } = useItemState;
    const target = party[heroIndex];
    // Remove one instance from whichever hero owns the item (pooled inventory), and
    // heal the target via the SHARED consume path also used by in-combat item use.
    const owner = findItemOwner(itemKey);
    const res = consumeHealingItem(itemKey, target, owner);
    if (!res.ok) { setUseItemState(null); return; }

    // Persist to the party state, and reflect it locally for instant UI updates.
    if (onUseItem) {
      onUseItem(heroUid(target), itemKey, res.healedTarget);
      if (!res.sameOwner) onUseItem(heroUid(owner), itemKey, res.updatedOwner);
    }
    applyHeroes(res.sameOwner ? [res.healedTarget] : [res.healedTarget, res.updatedOwner]);

    const resultId = Date.now();
    setUseResults(prev => [...prev, {
      heroName: target.heroName || target.characterName || target.name,
      itemName: res.itemName,
      rolled: res.rolled,
      healed: res.actualHeal,
      id: resultId
    }]);
    const timer = setTimeout(() => {
      setUseResults(prev => prev.filter(r => r.id !== resultId));
    }, 4000);
    resultTimers.current.push(timer);
    setUseItemState(null);
  };

  // Equip an item onto a hero from the shared party pool. May move one instance
  // between heroes, so persist every hero the operation changed.
  const handleEquip = (targetUid, itemKey) => {
    const changed = equipItemFromParty(party, targetUid, itemKey);
    if (!changed.length) return;
    applyHeroes(changed);
    if (onHeroUpdate) changed.forEach((h) => onHeroUpdate(h));
  };

  const handleUnequip = (hero, slot) => {
    const updated = unequipSlot(hero, slot);
    if (updated === hero) return;
    applyHeroes([updated]);
    if (onHeroUpdate) onHeroUpdate(updated);
  };

  return (
    <div style={{ color: 'var(--text)', maxWidth: '640px', margin: '0 auto' }}>
        {/* Themed Gold Section */}
        <div
          style={{
            padding: '20px',
            background: 'var(--primary)',
            color: 'var(--bg)', /* High contrast text against primary */
            borderRadius: '8px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: '0 4px 12px var(--shadow)'
          }}
          onClick={() => setSelectedImage({ src: '/assets/icons/items/gold_coins.webp', name: 'Gold Coins' })}
          title="Click to enlarge"
          onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.98)'}
          onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <img
            src="/assets/icons/items/gold_coins.webp"
            alt="Gold"
            loading="lazy"
            style={{
              width: '56px',
              height: '56px',
              objectFit: 'contain',
              filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))'
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: '14px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              opacity: 0.9,
              fontWeight: 'bold',
              fontFamily: 'var(--header-font)'
            }}>
              Treasury
            </div>
            <div style={{
              fontSize: '28px',
              fontWeight: 'bold',
              fontFamily: 'var(--header-font)',
              display: 'flex',
              alignItems: 'baseline',
              gap: '8px'
            }}>
              {totalGold} <span style={{ fontSize: '18px', opacity: 0.8 }}>GP</span>
            </div>
          </div>
          <div style={{ fontSize: '24px', opacity: 0.7 }}>🔍</div>
        </div>

        {/* Tabs: collected items vs per-hero loadout */}
        <div className="inventory-tabs" role="tablist" aria-label="Inventory view" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'items'}
            className={activeTab === 'items' ? 'primary-button' : 'secondary-button'}
            onClick={() => setActiveTab('items')}
            style={{ flex: 1 }}
          >
            ⚔️ Items
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'loadout'}
            className={activeTab === 'loadout' ? 'primary-button' : 'secondary-button'}
            onClick={() => setActiveTab('loadout')}
            style={{ flex: 1 }}
          >
            🛡️ Loadout
          </button>
        </div>

        {activeTab === 'items' && (
        <>
        <h3 style={{
          marginBottom: '12px',
          fontSize: '1.2rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: 'var(--text-secondary)'
        }}>
          <span>⚔️</span> Collected Items
        </h3>

        {/* High Contrast Item Container (Themed Vault Background) */}
        <div style={{
          background: 'var(--inventory-shelf-bg)',
          borderRadius: '8px',
          padding: '20px',
          minHeight: '120px',
          // No inner scroll: the item shelf grows with its content and the Adventure Book
          // body (overflowY:auto) provides the single scrollbar. A maxHeight+overflow here
          // nested inside that body produced an awful double scrollbar on the party view.
          border: '1px solid var(--border)',
          boxShadow: 'inset 0 4px 15px rgba(0,0,0,0.8)'
        }}>
          {Object.keys(itemMap).length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '80px',
              color: 'var(--bg)',
              opacity: 0.6,
              fontStyle: 'italic'
            }}>
              <p>Empty satchels and hollow boxes.</p>
              <p style={{ fontSize: '0.9rem' }}>Loot enemies and chests to fill your inventory.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {Object.entries(itemMap).map(([key, item]) => (
                <div
                  key={key}
                  style={{
                    padding: '10px 14px',
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: '6px',
                    border: `1px solid ${getRarityColor(item.rarity)}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    boxShadow: `0 0 5px ${item.rarity !== 'common' ? (getRarityColor(item.rarity) + '33') : 'rgba(0,0,0,0.5)'}`
                  }}
                  title="View item details"
                  onClick={() => openItemDetail({ item })}
                >
                  {item.icon && (
                    <img
                      src={`/${item.icon}`}
                      alt={item.name}
                      loading="lazy"
                      style={{
                        width: '36px',
                        height: '36px',
                        objectFit: 'contain',
                        borderRadius: '4px',
                        background: 'rgba(255,255,255,0.05)'
                      }}
                    />
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{
                      color: getRarityColor(item.rarity),
                      fontWeight: '500',
                      fontSize: '0.95rem'
                    }}>
                      {item.name}
                    </span>
                    {/* Description lives in the item-detail modal (openItemDetail on
                        click -> ItemDetailModal), not inline in this list. */}
                  </div>
                  {item.quantity > 1 && (
                    <span
                      style={{
                        background: 'var(--primary)',
                        color: 'var(--bg)',
                        borderRadius: '12px',
                        padding: '0 6px',
                        height: '18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        minWidth: '22px'
                      }}
                    >
                      x{item.quantity}
                    </span>
                  )}
                  {isHealingItem(item) && injuredHeroes.length > 0 && onUseItem && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setUseItemState({ itemKey: key });
                      }}
                      style={{
                        background: '#27ae60',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '4px 10px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      Use
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Hero picker for using a healing item.
            #: previously an in-flow block appended AFTER the (scrollable, 35vh-capped)
            item grid inside the Adventure Book's overflow:auto body, so clicking "Use"
            mounted it below the fold and nothing appeared to happen. It is now a
            FIXED, centered overlay with a dimmed backdrop layered above the book, so it
            is always on screen regardless of scroll position. */}
        {useItemState && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Use ${ITEM_CATALOG[useItemState.itemKey]?.name || 'item'}`}
            onClick={() => setUseItemState(null)}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 4000,
              padding: '20px'
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: '380px',
                maxHeight: '80vh',
                overflowY: 'auto',
                padding: '20px',
                background: 'var(--surface)',
                border: '1px solid #27ae60',
                borderRadius: '10px',
                boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
              }}
            >
              <h4 style={{ margin: '0 0 12px 0', color: '#27ae60', fontFamily: 'var(--header-font)' }}>
                Use {ITEM_CATALOG[useItemState.itemKey]?.name} on...
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {party.filter(h => !h.isDefeated).map((hero) => {
                  const hpStatus = getHPStatus(hero.currentHP, hero.maxHP);
                  const heroIndex = party.findIndex(h => heroUid(h) === heroUid(hero));
                  const atFull = hero.currentHP >= hero.maxHP;
                  return (
                    <button
                      key={heroUid(hero)}
                      onClick={() => { if (!atFull) handleUsePotion(heroIndex); }}
                      disabled={atFull}
                      title={atFull ? 'Already at full health' : `Heal ${hero.heroName || hero.characterName || hero.name}`}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 14px',
                        background: 'rgba(0,0,0,0.2)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        color: 'var(--text)',
                        cursor: atFull ? 'not-allowed' : 'pointer',
                        opacity: atFull ? 0.5 : 1,
                        fontFamily: 'var(--body-font)',
                        fontSize: '0.95rem'
                      }}
                    >
                      <span style={{ fontWeight: 'bold' }}>{hero.heroName || hero.characterName || hero.name}</span>
                      <span style={{ color: hpStatus.color, fontSize: '0.85rem' }}>
                        {hero.currentHP} / {hero.maxHP} HP{atFull ? ' · Already at full health' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setUseItemState(null)}
                style={{
                  marginTop: '12px',
                  padding: '8px 14px',
                  width: '100%',
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Potion use results */}
        {useResults.length > 0 && (
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {useResults.map(result => (
              <div key={result.id} style={{
                padding: '14px 16px',
                background: 'rgba(39, 174, 96, 0.1)',
                border: '1px solid #27ae60',
                borderRadius: '8px',
                textAlign: 'center',
                color: 'var(--text)',
                fontFamily: 'var(--body-font)'
              }}>
                <span style={{ fontSize: '1.1rem' }}>
                  {result.itemName} restored <strong style={{ color: '#27ae60' }}>{result.healed} HP</strong> to {result.heroName}
                </span>
                <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  (rolled {result.rolled})
                </span>
              </div>
            ))}
          </div>
        )}
        </>
        )}

        {activeTab === 'loadout' && (
          <div className="loadout-view" style={{
            background: 'var(--inventory-shelf-bg)',
            borderRadius: '8px',
            padding: '16px',
            // No inner scroll: the loadout grows with its content and the Adventure Book
            // body (overflowY:auto) provides the single scrollbar. A maxHeight+overflow
            // here nested inside that body produced a double scrollbar (matches the item shelf).
            border: '1px solid var(--border)',
            boxShadow: 'inset 0 4px 15px rgba(0,0,0,0.8)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}>
            {party.length === 0 ? (
              <p style={{ color: 'var(--bg)', opacity: 0.6, fontStyle: 'italic', textAlign: 'center', margin: 0 }}>
                No heroes in the party.
              </p>
            ) : party.map((hero) => {
              // Attribute each loadout card to its hero, matching the party-bar labelling
              // (support legacy character* and new hero* field names, append class when known).
              const heroName = hero.heroName || hero.characterName || hero.name || 'Unknown';
              const heroClass = hero.heroClass || hero.characterClass || '';
              return (
              <div key={heroUid(hero)} style={{
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '12px 14px'
              }}>
                <div style={{ fontWeight: 'bold', color: 'var(--primary)', marginBottom: '8px', fontFamily: 'var(--header-font)' }}>
                  {heroName}{heroClass ? ` (${heroClass})` : ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {EQUIP_SLOTS.map((slot) => {
                    const equipped = getEquippedItem(hero, slot);
                    const options = getEquippablePartyItems(party, slot);
                    return (
                      <div key={slot} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ minWidth: '78px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          {SLOT_LABELS[slot]}
                        </span>
                        {equipped ? (
                          <>
                            <span style={{ flex: 1, fontSize: '0.92rem' }}>
                              <span style={{ color: getRarityColor(equipped.rarity) }}>{equipped.name || equipped.key}</span>
                              {formatSlotBonus(slot, equipped.bonus) ? (
                                <span style={{ color: 'var(--text-secondary)' }}> ({formatSlotBonus(slot, equipped.bonus)})</span>
                              ) : null}
                            </span>
                            <button
                              type="button"
                              className="secondary-button"
                              style={{ padding: '4px 10px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                              onClick={() => handleUnequip(hero, slot)}
                            >
                              Unequip
                            </button>
                          </>
                        ) : options.length > 0 ? (
                          <select
                            value=""
                            onChange={(e) => { if (e.target.value) handleEquip(heroUid(hero), e.target.value); }}
                            style={{ flex: 1, padding: '5px', borderRadius: '4px', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
                          >
                            <option value="">Equip…</option>
                            {options.map((item) => (
                              <option key={item.key} value={item.key}>
                                {item.name || item.key}
                                {formatSlotBonus(slot, item.bonus) ? ` (${formatSlotBonus(slot, item.bonus)})` : ''}
                                {item.available > 1 ? ` ×${item.available}` : ''}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ flex: 1, color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.85rem' }}>
                            Empty
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              );
            })}
          </div>
        )}

      {selectedImage && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3000,
            cursor: 'pointer'
          }}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedImage(null);
          }}
        >
          <img
            src={selectedImage.src}
            alt={selectedImage.name}
            style={{
              maxWidth: '85vw',
              maxHeight: '75vh',
              objectFit: 'contain',
              background: '#0a0a0a',
              padding: '32px',
              borderRadius: '12px',
              border: '2px solid #333',
              boxShadow: '0 30px 60px rgba(0,0,0,0.9)'
            }}
          />
          <h2 style={{
            color: '#d4af37',
            marginTop: '24px',
            fontSize: '2.5rem',
            fontFamily: 'var(--header-font)',
            textShadow: '0 2px 10px rgba(0,0,0,0.5)'
          }}>{selectedImage.name}</h2>
          {selectedImage.description && (
            <p style={{
              color: '#ccc',
              marginTop: '12px',
              fontSize: '1.1rem',
              fontStyle: 'italic',
              maxWidth: '500px',
              textAlign: 'center',
              lineHeight: '1.5'
            }}>{selectedImage.description}</p>
          )}
          <p style={{ color: '#888', marginTop: '12px', fontSize: '1.1rem' }}>Click anywhere to return</p>
        </div>
      )}
    </div>
  );
};

export default PartyInventoryContent;
