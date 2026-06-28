import React from 'react';

// Reusable map key/legend. `groups` come from src/utils/mapLegend.js (worldLegendGroups,
// townLegendGroups, siteLegendGroups) — each item is a tile swatch ({ bg, label }) or an
// overlay marker ({ emoji, label }). Pure presentation; safe to drop beside any map.

const SWATCH = 22;

const Swatch = ({ item }) => (
  item.bg
    ? <span style={{
        width: SWATCH, height: SWATCH, flex: '0 0 auto', borderRadius: 3,
        border: '1px solid rgba(0,0,0,0.35)', backgroundImage: item.bg, backgroundSize: 'cover',
      }} />
    : <span style={{
        width: SWATCH, height: SWATCH, flex: '0 0 auto', borderRadius: 3,
        border: '1px solid var(--border)', background: 'var(--surface)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: SWATCH * 0.7,
      }}>{item.emoji}</span>
);

const MapLegend = ({ groups = [], title = 'Map Key', columns = 1, style, onMinimize }) => (
  <div className="map-legend" style={{
    border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px',
    background: 'var(--surface)', fontSize: 12, minWidth: 150, ...style,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
      <span style={{ fontWeight: 700, fontSize: 13, fontFamily: 'var(--header-font)' }}>{title}</span>
      {onMinimize && (
        <button
          onClick={onMinimize}
          aria-label="Minimize map key"
          title="Hide key"
          style={{
            border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)',
            color: 'var(--text)', cursor: 'pointer', lineHeight: 1, padding: '1px 7px',
            fontSize: 14, fontWeight: 700, flex: '0 0 auto',
          }}
        >−</button>
      )}
    </div>
    {groups.map((group) => (
      <div key={group.heading} style={{ marginBottom: 10 }}>
        <div style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
          color: 'var(--text-muted, #888)', marginBottom: 5,
        }}>{group.heading}</div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '5px 12px' }}>
          {group.items.map((item) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              <Swatch item={item} />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

export default MapLegend;
