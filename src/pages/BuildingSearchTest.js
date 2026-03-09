import React, { useState } from 'react';
import BuildingModal from '../components/BuildingModal';

const PRESET_HEROES = [
  {
    characterName: 'Aelindra the Scholar',
    stats: { Strength: 8, Dexterity: 12, Constitution: 10, Intelligence: 18, Wisdom: 14, Charisma: 13 },
    label: 'High INT (18) / WIS (14) — Scholar'
  },
  {
    characterName: 'Gruk the Barbarian',
    stats: { Strength: 18, Dexterity: 14, Constitution: 16, Intelligence: 6, Wisdom: 8, Charisma: 10 },
    label: 'Low INT (6) / WIS (8) — Barbarian'
  },
  {
    characterName: 'Mira the Cleric',
    stats: { Strength: 10, Dexterity: 10, Constitution: 12, Intelligence: 12, Wisdom: 18, Charisma: 14 },
    label: 'High WIS (18) / INT (12) — Cleric'
  },
  {
    characterName: 'Commoner',
    stats: { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 10, Wisdom: 10, Charisma: 10 },
    label: 'All 10s — No modifier'
  },
];

const PRESET_BUILDINGS = [
  {
    buildingType: 'archives',
    buildingName: 'The Grand Archives',
    questBuilding: true,
    questItemId: 'shadow_tome',
    questItemName: 'Tome of Shadows',
    x: 3,
    y: 5,
    npcs: [{ id: 'archivist', name: 'Maldris the Archivist', job: 'Archivist' }],
  },
  {
    buildingType: 'blacksmith',
    buildingName: 'Ironforge Smithy',
    questBuilding: true,
    questItemId: 'enchanted_blade',
    questItemName: 'Enchanted Silver Blade',
    x: 7,
    y: 2,
    npcs: [
      { id: 'smith', name: 'Duran Hammerfist', job: 'Blacksmith' },
      { id: 'apprentice', name: 'Pip', job: 'Apprentice' },
    ],
  },
  {
    buildingType: 'temple',
    buildingName: 'Sanctum of Light',
    questBuilding: true,
    questItemId: 'holy_relic',
    questItemName: 'Relic of Dawn',
    x: 5,
    y: 4,
    npcs: [],
  },
  {
    buildingType: 'tavern',
    buildingName: 'The Rusty Tankard',
    questBuilding: false,
    x: 2,
    y: 3,
    npcs: [{ id: 'barkeep', name: 'Old Greta', job: 'Barkeeper' }],
  },
];

const labelStyle = {
  fontSize: '12px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-muted, #888)',
  marginBottom: '8px',
};

const cardStyle = {
  padding: '12px 16px',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  cursor: 'pointer',
  transition: 'border-color 0.2s',
  backgroundColor: 'var(--surface)',
};

const BuildingSearchTest = () => {
  const [selectedHeroIdx, setSelectedHeroIdx] = useState(0);
  const [openBuilding, setOpenBuilding] = useState(null);
  const [foundItems, setFoundItems] = useState([]);

  const hero = PRESET_HEROES[selectedHeroIdx];
  const intMod = Math.floor(((hero.stats.Intelligence || 10) - 10) / 2);
  const wisMod = Math.floor(((hero.stats.Wisdom || 10) - 10) / 2);
  const effectiveMod = Math.max(intMod, wisMod);

  const handleQuestItemFound = (itemId, itemName) => {
    setFoundItems(prev => [...prev, { itemId, itemName, hero: hero.characterName, timestamp: Date.now() }]);
  };

  return (
    <div>
      <h2 style={{ marginTop: 0, fontFamily: 'var(--header-font)' }}>Building Search Test</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
        Test the quest item search mechanic. Select a hero and click a quest building to open it.
        The search uses a progressive DC system: base DC 12, decreasing by 3 per failed attempt.
      </p>

      {/* Hero Selection */}
      <div style={{ marginBottom: '24px' }}>
        <div style={labelStyle}>Select Hero (affects search modifier)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
          {PRESET_HEROES.map((h, i) => (
            <div
              key={i}
              onClick={() => setSelectedHeroIdx(i)}
              style={{
                ...cardStyle,
                borderColor: i === selectedHeroIdx ? 'var(--primary)' : 'var(--border)',
                boxShadow: i === selectedHeroIdx ? '0 0 8px var(--primary)' : 'none',
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{h.characterName}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{h.label}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          INT modifier: <strong>{intMod >= 0 ? '+' : ''}{intMod}</strong> |
          WIS modifier: <strong>{wisMod >= 0 ? '+' : ''}{wisMod}</strong> |
          Effective (best): <strong style={{ color: 'var(--primary)' }}>{effectiveMod >= 0 ? '+' : ''}{effectiveMod}</strong>
        </div>
      </div>

      {/* Building Selection */}
      <div style={{ marginBottom: '24px' }}>
        <div style={labelStyle}>Buildings (click to open modal)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
          {PRESET_BUILDINGS.map((b, i) => (
            <div
              key={i}
              onClick={() => setOpenBuilding(b)}
              style={{
                ...cardStyle,
                borderColor: b.questItemId ? 'var(--accent, var(--primary))' : 'var(--border)',
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{b.buildingName}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                {b.buildingType} ({b.x}, {b.y})
              </div>
              {b.questItemId ? (
                <div style={{ fontSize: '12px', color: 'var(--accent, var(--primary))', fontWeight: 600 }}>
                  Quest: {b.questItemName}
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: 'var(--text-muted, #888)', fontStyle: 'italic' }}>
                  No quest item
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Found Items Log */}
      <div style={{ marginBottom: '24px' }}>
        <div style={labelStyle}>Found Items Log</div>
        {foundItems.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>
            No items found yet. Search a quest building to find one.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {foundItems.map((item, i) => (
              <div key={i} style={{
                padding: '8px 12px',
                border: '1px solid rgba(50, 180, 80, 0.4)',
                borderRadius: '6px',
                backgroundColor: 'rgba(50, 180, 80, 0.08)',
                fontSize: '13px',
              }}>
                <strong>{item.itemName}</strong> (id: {item.itemId}) — found by {item.hero}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* DC Progression Reference */}
      <div>
        <div style={labelStyle}>DC Progression Reference</div>
        <table style={{ borderCollapse: 'collapse', fontSize: '13px', width: '100%', maxWidth: '500px' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '6px 12px', borderBottom: '2px solid var(--border)' }}>Attempt</th>
              <th style={{ textAlign: 'center', padding: '6px 12px', borderBottom: '2px solid var(--border)' }}>DC</th>
              <th style={{ textAlign: 'center', padding: '6px 12px', borderBottom: '2px solid var(--border)' }}>Need (with +{effectiveMod})</th>
              <th style={{ textAlign: 'right', padding: '6px 12px', borderBottom: '2px solid var(--border)' }}>Success %</th>
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2, 3, 4].map(attempt => {
              const dc = Math.max(2, 12 - attempt * 3);
              const needed = Math.max(1, dc - effectiveMod);
              const chance = Math.min(100, Math.max(5, (21 - needed) / 20 * 100));
              return (
                <tr key={attempt} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 12px' }}>{attempt + 1}{attempt === 0 ? 'st' : attempt === 1 ? 'nd' : attempt === 2 ? 'rd' : 'th'}</td>
                  <td style={{ textAlign: 'center', padding: '6px 12px' }}>{dc}</td>
                  <td style={{ textAlign: 'center', padding: '6px 12px' }}>{needed}+</td>
                  <td style={{ textAlign: 'right', padding: '6px 12px', color: chance >= 90 ? 'rgba(50,180,80,1)' : chance >= 50 ? 'var(--primary)' : 'var(--text)' }}>
                    {chance.toFixed(0)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* BuildingModal */}
      {openBuilding && (
        <BuildingModal
          building={openBuilding}
          npcs={openBuilding.npcs}
          onClose={() => setOpenBuilding(null)}
          firstHero={hero}
          onQuestItemFound={handleQuestItemFound}
        />
      )}
    </div>
  );
};

export default BuildingSearchTest;
