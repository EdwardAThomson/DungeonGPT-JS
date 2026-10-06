// gameLayout: which layout /game renders. The map-stage workspace (#84) is the default;
// the classic layout stays one switch away at runtime, so a problem in the new layout is a
// click (or a URL), not a redeploy:
//   - `?layout=classic` / `?layout=workspace` on /game switches and is remembered;
//   - the Layout setting in the Adventure Book does the same from inside a game;
//   - otherwise the remembered choice, else DEFAULT_GAME_LAYOUT.
// Both layouts are the same Game component with the same save format, so switching is safe
// in either direction. A code-level revert is changing DEFAULT_GAME_LAYOUT.

export const DEFAULT_GAME_LAYOUT = 'workspace';
export const GAME_LAYOUTS = ['workspace', 'classic'];
const STORAGE_KEY = 'dgpt:gameLayout';

const isLayout = (v) => GAME_LAYOUTS.includes(v);

export const getStoredLayout = () => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isLayout(v) ? v : null;
  } catch (e) {
    return null; // storage blocked: fall back to the default
  }
};

export const setStoredLayout = (layout) => {
  if (!isLayout(layout)) return;
  try { localStorage.setItem(STORAGE_KEY, layout); } catch (e) { /* in-memory only */ }
};

/** The layout /game will use, without reading or writing the URL (for UI outside it). */
export const currentGameLayout = () => getStoredLayout() || DEFAULT_GAME_LAYOUT;

/**
 * Resolve the layout for /game. A valid `?layout=` wins and is remembered; then the
 * remembered choice; then the default.
 * @param {string} [search] location.search
 */
export const resolveGameLayout = (search = '') => {
  let fromUrl = null;
  try { fromUrl = new URLSearchParams(search).get('layout'); } catch (e) { fromUrl = null; }
  if (isLayout(fromUrl)) {
    setStoredLayout(fromUrl);
    return fromUrl;
  }
  return getStoredLayout() || DEFAULT_GAME_LAYOUT;
};
