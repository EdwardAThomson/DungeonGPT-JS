import React, { useState, useEffect, useRef } from 'react';
import { ITEM_CATALOG, rollDice, removeItem } from '../utils/inventorySystem';
import { applyHealing, getHPStatus } from '../utils/healthSystem';
import { useModal } from '../contexts/ModalContext';
import ModalShell from './ModalShell';

const PartyInventoryModal = () => {
  const { isOpen, data, close } = useModal('inventory');
  const selectedHeroes = data?.selectedHeroes || [];
  const onUseItem = data?.onUseItem;
  const [selectedImage, setSelectedImage] = useState(null);
  const [useItemState, setUseItemState] = useState(null); // { itemKey } — hero picker
  const [useResults, setUseResults] = useState([]); // [{ heroName, itemName, rolled, healed, id }]
  const [usedItems, setUsedItems] = useState({}); // { itemKey: count } — local consumption tracker
  const [hpAdjustments, setHpAdjustments] = useState({}); // { characterId: healedAmount }
  const resultTimers = useRef([]);

  // Clear results and state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setUseItemState(null);
      setUseResults([]);
      setUsedItems({});
      setHpAdjustments({});
      resultTimers.current.forEach(clearTimeout);
      resultTimers.current = [];
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const allItems = selectedHeroes.flatMap((hero) => hero.inventory || []);
  const totalGold = selectedHeroes.reduce((sum, hero) => sum + (hero.gold || 0), 0);

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

    if (itemMap[key]) {
      itemMap[key].quantity += quantity;
    } else {
      itemMap[key] = { name, quantity, rarity, icon, description, effect, amount };
    }
  }

  // Subtract locally consumed items from displayed quantities
  for (const [key, count] of Object.entries(usedItems)) {
    if (itemMap[key]) {
      itemMap[key].quantity -= count;
      if (itemMap[key].quantity <= 0) delete itemMap[key];
    }
  }

  const isHealingItem = (item) => item.effect === 'heal' && item.amount;
  const injuredHeroes = selectedHeroes
    .map(h => {
      const adj = hpAdjustments[h.characterId] || 0;
      return adj ? { ...h, currentHP: Math.min(h.maxHP, h.currentHP + adj) } : h;
    })
    .filter(h => h.currentHP < h.maxHP && !h.isDefeated);

  // Find which hero actually owns an item (first hero with it in inventory)
  const findItemOwner = (itemKey) => {
    return selectedHeroes.find(h =>
      (h.inventory || []).some(i => (typeof i === 'string' ? i : i.key) === itemKey)
    );
  };

  const handleUsePotion = (heroIndex) => {
    const { itemKey } = useItemState;
    const target = selectedHeroes[heroIndex];
    const catalogEntry = ITEM_CATALOG[itemKey];
    const rolled = rollDice(catalogEntry.amount);
    const before = target.currentHP;
    const healed = applyHealing(target, rolled);
    const actualHeal = healed.currentHP - before;

    // Remove item from the hero who owns it
    const owner = findItemOwner(itemKey);
    const updatedInventory = removeItem(owner.inventory || [], itemKey, 1);
    const updatedOwner = { ...owner, inventory: updatedInventory };

    // If owner is the same as target, merge both changes
    const finalHero = owner.characterId === target.characterId
      ? { ...healed, inventory: updatedInventory }
      : healed;

    // Update the target hero (healed)
    if (onUseItem) {
      onUseItem(target.characterId, itemKey, finalHero);
      // If owner is different from target, also update the owner's inventory
      if (owner.characterId !== target.characterId) {
        onUseItem(owner.characterId, itemKey, updatedOwner);
      }
    }

    // Track locally for instant UI updates
    setUsedItems(prev => ({ ...prev, [itemKey]: (prev[itemKey] || 0) + 1 }));
    setHpAdjustments(prev => ({
      ...prev,
      [target.characterId]: (prev[target.characterId] || 0) + actualHeal
    }));

    const resultId = Date.now();
    setUseResults(prev => [...prev, {
      heroName: target.characterName || target.name,
      itemName: catalogEntry.name,
      rolled,
      healed: actualHeal,
      id: resultId
    }]);
    const timer = setTimeout(() => {
      setUseResults(prev => prev.filter(r => r.id !== resultId));
    }, 4000);
    resultTimers.current.push(timer);
    setUseItemState(null);
  };

  const rarityColors = {
    common: '#9d9d9d',
    uncommon: '#1eff00',
    rare: '#0070dd',
    very_rare: '#a335ee',
    legendary: '#ff8000'
  };

  return (
    <ModalShell modalId="inventory" ariaLabel="Party Inventory" style={{
          maxWidth: '600px',
          width: '90%',
          background: 'var(--surface)',
          border: '2px solid var(--border)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          color: 'var(--text)',
          borderRadius: '12px',
          padding: '24px'
        }}>
        <h2 style={{
          marginBottom: '24px',
          marginTop: 0,
          textAlign: 'center',
          fontSize: '2rem',
          color: 'var(--primary)',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '16px'
        }}>
          Party Inventory
        </h2>

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
          maxHeight: '35vh',
          overflowY: 'auto',
          border: '1px solid var(--border)',
          boxShadow: 'inset 0 4px 15px rgba(0,0,0,0.8)'
        }}>
          {allItems.length === 0 ? (
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
                    border: `1px solid ${rarityColors[item.rarity] || rarityColors.common}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: item.icon ? 'pointer' : 'default',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    boxShadow: `0 0 5px ${item.rarity !== 'common' ? (rarityColors[item.rarity] + '33') : 'rgba(0,0,0,0.5)'}`
                  }}
                  title={item.description || ''}
                  onClick={item.icon ? () => setSelectedImage({ src: `/${item.icon}`, name: item.name, description: item.description }) : undefined}
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
                      color: rarityColors[item.rarity] || rarityColors.common,
                      fontWeight: '500',
                      fontSize: '0.95rem'
                    }}>
                      {item.name}
                    </span>
                    {item.description && (
                      <span style={{
                        color: 'var(--text-secondary, #aaa)',
                        fontSize: '0.75rem',
                        fontStyle: 'italic',
                        marginTop: '2px',
                        opacity: 0.85
                      }}>
                        {item.description}
                      </span>
                    )}
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

        {/* Hero picker for using a healing item */}
        {useItemState && (
          <div style={{
            marginTop: '16px',
            padding: '16px',
            background: 'rgba(39, 174, 96, 0.1)',
            border: '1px solid #27ae60',
            borderRadius: '8px'
          }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#27ae60', fontFamily: 'var(--header-font)' }}>
              Use {ITEM_CATALOG[useItemState.itemKey]?.name} on...
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {injuredHeroes.map((hero) => {
                const hpStatus = getHPStatus(hero.currentHP, hero.maxHP);
                const heroIndex = selectedHeroes.findIndex(h => h.characterId === hero.characterId);
                return (
                  <button
                    key={hero.characterId}
                    onClick={() => handleUsePotion(heroIndex)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 14px',
                      background: 'rgba(0,0,0,0.2)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      fontFamily: 'var(--body-font)',
                      fontSize: '0.95rem'
                    }}
                  >
                    <span style={{ fontWeight: 'bold' }}>{hero.characterName || hero.name}</span>
                    <span style={{ color: hpStatus.color, fontSize: '0.85rem' }}>
                      {hero.currentHP} / {hero.maxHP} HP
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setUseItemState(null)}
              style={{
                marginTop: '10px',
                padding: '6px 14px',
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

        <button
          onClick={close}
          style={{
            marginTop: '24px',
            padding: '14px 20px',
            background: 'var(--primary)',
            color: 'var(--bg)',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            width: '100%',
            fontWeight: 'bold',
            fontSize: '1.1rem',
            textTransform: 'uppercase',
            letterSpacing: '0.2em',
            boxShadow: '0 4px 8px var(--shadow)'
          }}
        >
          Return to Adventure
        </button>

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
    </ModalShell>
  );
};

export default PartyInventoryModal;
