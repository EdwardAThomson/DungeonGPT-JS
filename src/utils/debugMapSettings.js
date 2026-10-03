// debugMapSettings.js
// Shared, session-persisted map generation settings (seed/width/height/theme) for the
// world-map debug pages (RiverPathTest, WorldMapArtTest, WorldMapTest). Two problems this
// solves at once:
//  1. Each debug page previously held these in local component state, which React Router
//     throws away whenever you navigate off the page and back — annoying on its own.
//  2. When comparing the SAME map across two different debug pages (e.g. "does this page
//     render town names / this anomaly and that one doesn't?"), it's easy to accidentally
//     compare two DIFFERENT maps because each page defaulted to its own seed. Sharing one
//     sessionStorage-backed store means switching pages keeps you looking at the same map.
// sessionStorage (not localStorage) so it resets per-tab/session rather than following the
// browser forever — these are debug-only values, not a real user preference.

import { useEffect, useState } from 'react';

const KEY = 'debugMapSettings.v1';
const DEFAULTS = { seed: 469414, width: 20, height: 14, theme: 'grassland' };

function load() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) { /* ignore — storage disabled/unavailable, fall back to defaults */ }
  return { ...DEFAULTS };
}

function save(settings) {
  try { sessionStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
}

// Returns [settings, updateFn]. updateFn(patch) merges patch into the shared settings and
// persists immediately, so any other debug page mounted next reads the same values.
export function useDebugMapSettings() {
  const [settings, setSettings] = useState(load);
  useEffect(() => { save(settings); }, [settings]);
  const update = (patch) => setSettings((s) => ({ ...s, ...patch }));
  return [settings, update];
}
