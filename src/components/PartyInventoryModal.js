import React, { useState } from 'react';
import { ITEM_CATALOG } from '../utils/inventorySystem';

const PartyInventoryModal = ({ isOpen, onClose, selectedHeroes = [] }) => {
  const [selectedImage, setSelectedImage] = useState(null);

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
    const icon = catalogEntry?.icon || item.icon || null;

    if (itemMap[key]) {
      itemMap[key].quantity += quantity;
    } else {
      itemMap[key] = { name, quantity, rarity, icon };
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
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%' }}>
        <h2 style={{ marginBottom: '20px' }}>Party Inventory</h2>

        <div
          style={{
            padding: '15px',
            background: 'linear-gradient(135deg, #f39c12 0%, #e67e22 100%)',
            borderRadius: '8px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '15px',
            cursor: 'pointer',
            transition: 'transform 0.1s'
          }}
          onClick={() => setSelectedImage({ src: '/assets/icons/items/gold_coins.png', name: 'Gold Coins' })}
          title="Click to enlarge"
          onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.98)'}
          onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <img
            src="/assets/icons/items/gold_coins.png"
            alt="Gold"
            loading="lazy"
            style={{ width: '48px', height: '48px', objectFit: 'contain' }}
          />
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
          minHeight: '100px',
          maxHeight: '40vh',
          overflowY: 'auto'
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
                    gap: '8px',
                    cursor: item.icon ? 'pointer' : 'default'
                  }}
                  onClick={item.icon ? () => setSelectedImage({ src: `/${item.icon}`, name: item.name }) : undefined}
                >
                  {item.icon && (
                    <img
                      src={`/${item.icon}`}
                      alt={item.name}
                      loading="lazy"
                      style={{
                        width: '32px',
                        height: '32px',
                        objectFit: 'contain',
                        borderRadius: '4px',
                        background: 'rgba(0,0,0,0.2)'
                      }}
                    />
                  )}
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
            padding: '12px 20px',
            background: 'var(--primary)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            width: '100%',
            fontWeight: 'bold'
          }}
        >
          Close
        </button>
      </div>

      {selectedImage && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.9)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 11000,
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
              background: '#1a1a1a',
              padding: '24px',
              borderRadius: '12px',
              border: '1px solid #444',
              boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
            }}
          />
          <h2 style={{ color: 'white', marginTop: '24px', fontSize: '2rem' }}>{selectedImage.name}</h2>
          <p style={{ color: '#888', marginTop: '8px' }}>Click anywhere to close</p>
        </div>
      )}
    </div>
  );
};

export default PartyInventoryModal;
