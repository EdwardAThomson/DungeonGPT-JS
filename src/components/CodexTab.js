import React, { useMemo, useState } from 'react';
import {
  getBestiaryEntries,
  getItemCodexEntries,
  isEnemyDiscovered,
  isItemDiscovered
} from '../game/codexEngine';
import { getRarityColor } from '../utils/inventorySystem';

// Codex (#51): discovered-only compendium rendered inside the Adventure Book.
// Entries are auto-generated from live data (codexEngine); undiscovered ones show
// as dimmed "???" silhouettes with only a rarity/tier tease. Discovered entries
// show art, name, and flavor — never stats, DCs, or drop tables.

const RARITY_LABELS = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  very_rare: 'Very Rare',
  legendary: 'Legendary'
};

const tierLabel = (entry) =>
  entry.category === 'boss'
    ? (entry.tier ? `Tier ${entry.tier} Boss` : 'Boss')
    : 'Wilds & Roads';

const cardStyle = (discovered, accent) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '10px 12px',
  background: 'var(--bg)',
  border: `1px solid ${discovered ? accent : 'var(--border)'}`,
  borderRadius: '8px',
  opacity: discovered ? 1 : 0.55,
  minWidth: 0
});

const artBoxStyle = {
  width: '44px',
  height: '44px',
  flex: '0 0 44px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '6px',
  background: 'rgba(0,0,0,0.18)',
  overflow: 'hidden'
};

// Silhouette treatment for undiscovered art: fully darkened, so the SHAPE teases
// the entry without giving it away.
const silhouetteFilter = { filter: 'brightness(0) opacity(0.5)' };

const EntryArt = ({ discovered, icon, image, name }) => {
  const style = { width: '100%', height: '100%', objectFit: 'contain', ...(discovered ? {} : silhouetteFilter) };
  if (image) {
    return <img src={image.startsWith('/') ? image : `/${image}`} alt={discovered ? name : 'Unknown entry'} loading="lazy" style={style} />;
  }
  if (icon && icon.length <= 4) {
    // emoji icon
    return <span aria-hidden="true" style={{ fontSize: '1.6rem', ...(discovered ? {} : silhouetteFilter) }}>{icon}</span>;
  }
  if (icon) {
    return <img src={icon.startsWith('/') ? icon : `/${icon}`} alt={discovered ? name : 'Unknown entry'} loading="lazy" style={style} />;
  }
  return <span aria-hidden="true" style={{ fontSize: '1.4rem', opacity: 0.4 }}>❔</span>;
};

const CodexCard = ({ discovered, name, description, art, badge, badgeColor }) => (
  <div style={cardStyle(discovered, badgeColor || 'var(--border)')} title={discovered && description ? description : undefined}>
    <div style={artBoxStyle}>{art}</div>
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
      <span style={{
        fontWeight: 600,
        fontSize: '0.95rem',
        color: discovered ? (badgeColor || 'var(--text)') : 'var(--text-secondary)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }}>
        {discovered ? name : '???'}
      </span>
      {discovered && description && (
        <span style={{
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
          fontStyle: 'italic',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical'
        }}>
          {description}
        </span>
      )}
      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', opacity: 0.85, marginTop: '2px' }}>
        {badge}
      </span>
    </div>
  </div>
);

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: '8px'
};

const CodexTab = ({ codex, milestones }) => {
  const [section, setSection] = useState('bestiary'); // 'bestiary' | 'items'

  const bestiary = useMemo(() => getBestiaryEntries(milestones), [milestones]);
  const items = useMemo(() => getItemCodexEntries(), []);

  const discoveredEnemies = bestiary.filter((e) => isEnemyDiscovered(codex, e)).length;
  const discoveredItems = items.filter((e) => isItemDiscovered(codex, e.id)).length;

  return (
    <div>
      <div role="tablist" aria-label="Codex section" style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'bestiary'}
          className={section === 'bestiary' ? 'primary-button' : 'secondary-button'}
          onClick={() => setSection('bestiary')}
          style={{ flex: 1 }}
        >
          🐲 Bestiary ({discoveredEnemies}/{bestiary.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'items'}
          className={section === 'items' ? 'primary-button' : 'secondary-button'}
          onClick={() => setSection('items')}
          style={{ flex: 1 }}
        >
          🧪 Items ({discoveredItems}/{items.length})
        </button>
      </div>

      <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', opacity: 0.8 }}>
        {section === 'bestiary'
          ? 'Creatures reveal themselves once you have faced them in the field.'
          : 'Items are catalogued as they pass through your party’s hands.'}
      </p>

      {section === 'bestiary' ? (
        <div style={gridStyle}>
          {bestiary.map((entry) => {
            const discovered = isEnemyDiscovered(codex, entry);
            return (
              <CodexCard
                key={entry.id}
                discovered={discovered}
                name={entry.name}
                description={entry.description}
                badge={tierLabel(entry)}
                badgeColor={discovered ? 'var(--primary)' : null}
                art={<EntryArt discovered={discovered} icon={entry.icon} image={entry.image} name={entry.name} />}
              />
            );
          })}
        </div>
      ) : (
        <div style={gridStyle}>
          {items.map((entry) => {
            const discovered = isItemDiscovered(codex, entry.id);
            return (
              <CodexCard
                key={entry.id}
                discovered={discovered}
                name={entry.name}
                description={entry.description}
                badge={RARITY_LABELS[entry.rarity] || entry.rarity}
                badgeColor={discovered ? getRarityColor(entry.rarity) : null}
                art={<EntryArt discovered={discovered} icon={entry.icon} image={null} name={entry.name} />}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CodexTab;
