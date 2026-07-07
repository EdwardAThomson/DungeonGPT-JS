import React from 'react';
import { render } from '@testing-library/react';
import TownMapDisplay from './TownMapDisplay';

// Findability pass (2026-07-07): quest buildings glow, carry a ❗ glyph, and show
// their type alongside the flavour name, so a player told to visit "The Icemoor
// Sanctuary" can find the temple. A completed objective stops glowing.
const questTile = { x: 2, y: 2, type: 'building', buildingType: 'temple', buildingName: 'The Icemoor Sanctuary', questBuilding: true, walkable: false };
const plainTile = { x: 1, y: 1, type: 'building', buildingType: 'tavern', buildingName: 'The Mug', walkable: false };
const g = (x, y) => ({ x, y, type: 'grass', walkable: true });
const town = {
  width: 3, height: 3,
  mapData: [[g(0, 0), plainTile, g(2, 0)], [g(0, 1), g(1, 1), g(2, 1)], [g(0, 2), g(1, 2), questTile]],
  discoveredBuildings: ['2,2'],
};

describe('TownMapDisplay quest-building findability', () => {
  it('an active quest building pulses, shows the glyph, and titles name (Type) QUEST', () => {
    const { container } = render(
      <TownMapDisplay townMapData={town} playerPosition={{ x: 2, y: 2 }}
        milestones={[{ type: 'item', building: { name: 'The Icemoor Sanctuary', type: 'temple' }, status: 'active' }]}
        onTileClick={() => {}} />
    );
    expect(container.innerHTML).toContain('questPulse');
    expect(container.innerHTML).toContain('❗');
    const cell = [...container.querySelectorAll('[title]')].find((el) => /Icemoor/.test(el.getAttribute('title')));
    expect(cell.getAttribute('title')).toMatch(/Temple/);
    expect(cell.getAttribute('title')).toMatch(/QUEST/);
  });

  it('a completed objective does not glow', () => {
    const { container } = render(
      <TownMapDisplay townMapData={town} playerPosition={{ x: 0, y: 0 }}
        milestones={[{ type: 'item', building: { name: 'The Icemoor Sanctuary', type: 'temple' }, status: 'completed' }]}
        onTileClick={() => {}} />
    );
    expect(container.innerHTML).not.toContain('❗');
  });

  it('with no milestone data, quest buildings still glow (debug fallback)', () => {
    const { container } = render(
      <TownMapDisplay townMapData={town} playerPosition={{ x: 0, y: 0 }} onTileClick={() => {}} />
    );
    expect(container.innerHTML).toContain('❗');
  });
});
