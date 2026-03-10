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
    const name = catalogEntry?.name || item.name || key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    const quantity = item.quantity || 1;
    const rarity = catalogEntry?.rarity || item.rarity || 'common';
    const icon = catalogEntry?.icon || item.icon || null;

    const description = catalogEntry?.description || item.description || null;

    if (itemMap[key]) {
      itemMap[key].quantity += quantity;
    } else {
      itemMap[key] = { name, quantity, rarity, icon, description };
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
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '600px',
          width: '90%',
          background: 'var(--surface)',
          border: '2px solid var(--border)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          color: 'var(--text)',
          borderRadius: '12px',
          padding: '24px'
        }}
      >
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
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={onClose}
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
      </div>

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

export default PartyInventoryModal;
