import React from 'react';
import { ITEM_CATALOG } from '../utils/inventorySystem';

const PartyInventoryModal = ({ isOpen, onClose, selectedHeroes = [] }) => {
  if (!isOpen) return null;

  const allItems = selectedHeroes.flatMap((hero) => hero.inventory || []);
  const totalGold = selectedHeroes.reduce((sum, hero) => sum + (hero.gold || 0), 0);

  const itemMap = {};
  for (const item of allItems) {
    const key = typeof item === 'string' ? item : (item.key || 'unknown');
    const catalogEntry = ITEM_CATALOG[key];
    const name = catalogEntry?.name || item.name || key.replace(/_/g, ' ');
    const quantity = item.quantity || 1;
    const rarity = catalogEntry?.rarity || item.rarity || 'common';
    if (itemMap[key]) {
      itemMap[key].quantity += quantity;
    } else {
      itemMap[key] = { name, quantity, rarity };
    }
  }

  const rarityColors = {
    common: '#9d9d9d',
    uncommon: '#1eff00',
    rare: '#0070dd',
    very_rare: '#a335ee',
    legendary: '#ff8000'
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <h2 style={{ marginBottom: '20px' }}>Party Inventory</h2>

        <div style={{
          padding: '15px',
          background: 'linear-gradient(135deg, #f39c12 0%, #e67e22 100%)',
          borderRadius: '8px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span style={{ fontSize: '32px' }}>💰</span>
          <div>
            <div style={{ fontSize: '12px', opacity: 0.9 }}>Gold Pieces</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{totalGold} GP</div>
          </div>
        </div>

        <h3 style={{ marginBottom: '10px' }}>Items</h3>
        <div style={{
          background: 'var(--surface)',
          borderRadius: '8px',
          padding: '15px',
          minHeight: '100px'
        }}>
          {allItems.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              No items yet. Complete encounters to find loot!
            </p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {Object.entries(itemMap).map(([key, item]) => (
                <div
                  key={key}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--surface-light)',
                    borderRadius: '4px',
                    border: `1px solid ${rarityColors[item.rarity] || rarityColors.common}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span style={{ color: rarityColors[item.rarity] || rarityColors.common }}>{item.name}</span>
                  {item.quantity > 1 && (
                    <span
                      style={{
                        background: 'var(--primary)',
                        color: 'white',
                        borderRadius: '50%',
                        width: '20px',
                        height: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px'
                      }}
                    >
                      x{item.quantity}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: '20px',
            padding: '10px 20px',
            background: 'var(--primary)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            width: '100%'
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default PartyInventoryModal;
