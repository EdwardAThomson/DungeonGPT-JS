import React from 'react';
import { render, screen } from '@testing-library/react';
import MapLegend from './MapLegend';
import { siteLegendGroups, worldLegendGroups, townLegendGroups } from '../utils/mapLegend';

describe('MapLegend', () => {
  test('renders site legend (cave) with labels + swatches', () => {
    render(<MapLegend title="Key" groups={siteLegendGroups('cave')} />);
    expect(screen.getByText('Key')).toBeTruthy();
    expect(screen.getByText('Floor')).toBeTruthy();
    expect(screen.getByText('Cave wall')).toBeTruthy();
    expect(screen.getByText('Boulder')).toBeTruthy(); // the 🪨 decoration is now keyed
    expect(screen.getByText('Exit')).toBeTruthy();
    expect(screen.getByText('Encounter')).toBeTruthy();
    expect(screen.getByText('Treasure')).toBeTruthy();
  });

  test('renders ruins legend', () => {
    render(<MapLegend title="Key" groups={siteLegendGroups('ruins')} />);
    expect(screen.getByText('Ruined wall')).toBeTruthy();
    expect(screen.getByText('Statue')).toBeTruthy();
  });

  test('renders forest / hills / mountain legends with their own labels', () => {
    const { rerender } = render(<MapLegend title="Key" groups={siteLegendGroups('forest')} />);
    expect(screen.getByText('Trees')).toBeTruthy();
    expect(screen.getByText('Clearing')).toBeTruthy();

    rerender(<MapLegend title="Key" groups={siteLegendGroups('hills')} />);
    expect(screen.getByText('Rocky outcrop')).toBeTruthy();

    rerender(<MapLegend title="Key" groups={siteLegendGroups('mountain')} />);
    expect(screen.getByText('Rock face')).toBeTruthy();
  });

  test('world + town legends produce non-empty groups', () => {
    expect(worldLegendGroups().every((g) => g.items.length > 0)).toBe(true);
    expect(townLegendGroups().every((g) => g.items.length > 0)).toBe(true);
    ['cave', 'ruins', 'forest', 'hills', 'mountain'].forEach((theme) => {
      expect(siteLegendGroups(theme).every((g) => g.items.length > 0)).toBe(true);
    });
  });

  test('town legend follows the town theme; default and unknown themes stay temperate', () => {
    const labels = (groups) => groups.flatMap((g) => g.items.map((i) => i.label));
    // default temperate legend keeps its historical entries
    expect(labels(townLegendGroups())).toEqual(expect.arrayContaining(['Grass', 'Tree', 'Flowers']));
    // desert swaps ground + natural cover and re-tints the building swatches
    const desert = townLegendGroups('desert');
    expect(labels(desert)).toEqual(expect.arrayContaining(['Sand', 'Cactus', 'Rocks']));
    expect(labels(desert)).not.toContain('Grass');
    // snow does the same with its own set
    expect(labels(townLegendGroups('snow'))).toEqual(expect.arrayContaining(['Snow', 'Pine', 'Snowdrift']));
    // unknown themes fall back to the temperate legend, byte-identical swatches
    expect(townLegendGroups('jungle')).toEqual(townLegendGroups());
    // themed building swatches differ from the temperate ones
    const swatch = (groups, label) => groups.find((g) => g.heading === 'Buildings').items.find((i) => i.label === label).bg;
    expect(swatch(desert, 'House')).not.toBe(swatch(townLegendGroups(), 'House'));
  });
});
