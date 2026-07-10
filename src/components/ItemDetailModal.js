import React from 'react';
import { getRarityColor } from '../utils/inventorySystem';
import { useModal } from '../contexts/ModalContext';
import ModalShell from './ModalShell';

// Human-readable rarity labels (mirrors CodexTab's RARITY_LABELS; kept local so the
// modal stays self-contained). Falls back to the raw key for unknown rarities.
const RARITY_LABELS = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  very_rare: 'Very Rare',
  legendary: 'Legendary'
};

// Turn a snake_case type/rarity key into Title Case (e.g. quest_item -> Quest Item).
const titleCase = (str) =>
  String(str || '')
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

// Best-effort display type. Uses the catalog `type` when present; otherwise infers
// a sensible category from the item's effect so the row is never blank.
const displayType = (item) => {
  if (item.type) return titleCase(item.type);
  if (item.effect === 'heal' || item.effect === 'cure_poison' || item.effect === 'spell') return 'Consumable';
  return 'Miscellaneous';
};

// Gold value line. Quest items / blessings / lore carry value 0 and cannot be sold,
// so they read "No sale value" rather than "0 gold".
const valueLabel = (value) => {
  const v = Number(value) || 0;
  return v > 0 ? `${v} gold` : 'No sale value';
};

/**
 * Item detail modal. Opened from the Adventure Book's Party tab when a collected
 * item is clicked. Registered as a child of `adventureBook` so it layers above the
 * hub without closing it and is torn down when the hub closes.
 *
 * Reads its item from modal data: { item: { key, name, rarity, icon, description,
 * value, type, quantity } }.
 */
const ItemDetailModal = () => {
  const { data, close } = useModal('itemDetail');
  const item = data?.item;
  if (!item) return null;

  const rarityColor = getRarityColor(item.rarity);
  const rarityLabel = RARITY_LABELS[item.rarity] || titleCase(item.rarity) || 'Common';
  const imgSrc = item.icon ? `/${item.icon}` : null;

  return (
    <ModalShell
      modalId="itemDetail"
      className="item-detail-modal"
      ariaLabel={`${item.name} details`}
      usePortal
      style={{ maxWidth: '440px', width: '90%', padding: 0, overflow: 'hidden' }}
    >
      {/* Full-size item image (or an icon-less placeholder) on a dark plate. */}
      <div style={{
        background: '#0a0a0a',
        borderBottom: `3px solid ${rarityColor}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '28px',
        minHeight: '200px'
      }}>
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={item.name}
            style={{
              maxWidth: '260px',
              maxHeight: '260px',
              objectFit: 'contain',
              filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.6))'
            }}
          />
        ) : (
          <div style={{
            width: '160px',
            height: '160px',
            borderRadius: '12px',
            border: `2px dashed ${rarityColor}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '4rem',
            color: rarityColor,
            opacity: 0.7
          }}>
            📦
          </div>
        )}
      </div>

      {/* Details: name, rarity, type, value, description. */}
      <div style={{ padding: '20px 24px 24px' }}>
        <h2 style={{
          margin: '0 0 6px 0',
          color: rarityColor,
          fontFamily: 'var(--header-font)',
          fontSize: '1.6rem',
          lineHeight: 1.2
        }}>
          {item.name}
          {item.quantity > 1 && (
            <span style={{ color: 'var(--text-secondary)', fontSize: '1rem', fontWeight: 'normal' }}> ×{item.quantity}</span>
          )}
        </h2>

        {/* Rarity + type badges. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '0 0 16px 0' }}>
          <span style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: '12px',
            fontSize: '0.78rem',
            fontWeight: 'bold',
            letterSpacing: '0.04em',
            color: rarityColor,
            border: `1px solid ${rarityColor}`,
            background: `${rarityColor}1a`
          }}>
            {rarityLabel}
          </span>
          <span style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: '12px',
            fontSize: '0.78rem',
            fontWeight: 'bold',
            letterSpacing: '0.04em',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
            background: 'rgba(0,0,0,0.2)'
          }}>
            {displayType(item)}
          </span>
        </div>

        {/* Value / price. */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '16px',
          color: 'var(--text)',
          fontSize: '0.95rem'
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>Value:</span>
          <strong style={{ color: 'var(--primary)' }}>{valueLabel(item.value)}</strong>
        </div>

        {/* Description (fallback keeps the section from ever reading empty). */}
        <p style={{
          margin: 0,
          color: 'var(--text-secondary)',
          fontSize: '0.95rem',
          fontStyle: 'italic',
          lineHeight: 1.55
        }}>
          {item.description || 'No further details are known about this item.'}
        </p>

        <button
          className="modal-close-button"
          onClick={close}
          style={{ marginTop: '20px', width: '100%' }}
        >
          Close
        </button>
      </div>
    </ModalShell>
  );
};

export default ItemDetailModal;
