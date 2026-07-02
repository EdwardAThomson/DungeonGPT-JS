import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import SiteMapDisplay from './SiteMapDisplay';

// Minimal one-row site map. Covers the four content shapes the renderer must handle:
// old-save decorative crystal (poi only), new harvestable deposit (content.display),
// a harvested deposit (consumed), and old-save plain loot (no display field).
const tile = (x, extra = {}) => ({ x, y: 0, type: 'floor', walkable: true, poi: null, ...extra });

const makeSite = (tiles) => ({
  width: tiles.length,
  height: 1,
  theme: 'cave',
  mapData: [tiles],
});

describe('SiteMapDisplay content rendering (issue #38)', () => {
  test('old cached sites: decorative crystal poi still renders (back-compat)', () => {
    render(<SiteMapDisplay siteMapData={makeSite([tile(0, { poi: 'crystal' })])} />);
    expect(screen.getByText('💎')).toBeInTheDocument();
  });

  test('harvestable deposit renders the crystal, not the money bag', () => {
    const deposit = { kind: 'loot', display: 'crystal', loot: { gold: 0, items: ['raw_gems'] }, consumed: false };
    render(<SiteMapDisplay siteMapData={makeSite([tile(0, { content: deposit })])} />);
    expect(screen.getByText('💎')).toBeInTheDocument();
    expect(screen.queryByText('💰')).not.toBeInTheDocument();
  });

  test('harvested deposit stops showing the crystal (dim dot instead)', () => {
    const harvested = { kind: 'loot', display: 'crystal', loot: { gold: 0, items: ['raw_gems'] }, consumed: true };
    render(<SiteMapDisplay siteMapData={makeSite([tile(0, { content: harvested })])} />);
    expect(screen.queryByText('💎')).not.toBeInTheDocument();
    const dot = screen.getByText('·');
    expect(dot).toBeInTheDocument();
    expect(dot).toHaveStyle({ opacity: 0.35 });
  });

  test('loot without a display field falls back to 💰 (old saves / hoards)', () => {
    const loot = { kind: 'loot', loot: { gold: 12, items: ['healing_potion'] }, consumed: false };
    render(<SiteMapDisplay siteMapData={makeSite([tile(0, { content: loot })])} />);
    expect(screen.getByText('💰')).toBeInTheDocument();
  });

  test('an unknown display key falls back to 💰 rather than rendering nothing', () => {
    const loot = { kind: 'loot', display: 'not_a_real_key', loot: { gold: 0, items: [] }, consumed: false };
    render(<SiteMapDisplay siteMapData={makeSite([tile(0, { content: loot })])} />);
    expect(screen.getByText('💰')).toBeInTheDocument();
  });

  test('encounter and objective markers are unaffected', () => {
    const enc = tile(0, { content: { kind: 'encounter', encounter: {}, consumed: false } });
    const obj = tile(1, { content: { kind: 'objective', objectiveType: 'location', consumed: false } });
    render(<SiteMapDisplay siteMapData={makeSite([enc, obj])} />);
    expect(screen.getByText('⚔️')).toBeInTheDocument();
    expect(screen.getByText('❗')).toBeInTheDocument();
  });
});
