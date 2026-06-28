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
    expect(screen.getByText('Point of interest')).toBeTruthy();
  });

  test('renders ruins legend', () => {
    render(<MapLegend title="Key" groups={siteLegendGroups('ruins')} />);
    expect(screen.getByText('Ruined wall')).toBeTruthy();
    expect(screen.getByText('Statue')).toBeTruthy();
  });

  test('world + town legends produce non-empty groups', () => {
    expect(worldLegendGroups().every((g) => g.items.length > 0)).toBe(true);
    expect(townLegendGroups().every((g) => g.items.length > 0)).toBe(true);
    expect(siteLegendGroups('cave').every((g) => g.items.length > 0)).toBe(true);
  });
});
