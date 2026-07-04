// Default root used when the player hasn't named their campaign.
export const DEFAULT_SAVE_ROOT = 'Adventure';

// Window event fired by useGamePersistence after a save lands device-only
// ('savedLocal'), telling LocalGameSync to attempt a reconcile pass without waiting
// for the next auth event (SAVE_SYNC_PLAN Phase 2, §4). Lives here (pure module)
// so the hook does not have to import the component.
export const PENDING_LOCAL_SAVE_EVENT = 'dungeongpt:pending-local-save';

// A save's display name is "<root> - <date> <time>". The root is player-editable and
// persists across saves (stored in game_settings.saveName); the timestamp refreshes each
// save. Keeping the format in one place means the in-game save, the confirmation modal, and
// the Saved Games rename all agree.
export const buildSaveName = (root, date = new Date()) => {
  const trimmed = (typeof root === 'string' && root.trim()) || DEFAULT_SAVE_ROOT;
  return `${trimmed} - ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
};

// Recover the editable root from a full save name by stripping a trailing
// " - <date> <time>" suffix. Used only as a fallback for older saves that predate the
// stored `saveName` root; prefer game_settings.saveName when it exists.
export const parseSaveRoot = (name) => {
  if (typeof name !== 'string' || !name.trim()) return DEFAULT_SAVE_ROOT;
  const stripped = name.replace(/\s*[-–]\s*\d{1,2}\/\d{1,2}\/\d{2,4}.*$/, '').trim();
  return stripped || name.trim();
};

export const buildSaveFingerprint = ({
  conversation,
  playerPosition,
  townPlayerPosition,
  currentMapLevel,
  isInsideTown,
  currentSummary,
  settings,
  selectedHeroes,
  sitePlayerPosition,
  isInsideSite
}) => {
  const heroes = selectedHeroes || [];
  return [
    conversation?.length || 0,
    playerPosition?.x,
    playerPosition?.y,
    currentMapLevel,
    isInsideTown,
    townPlayerPosition?.x,
    townPlayerPosition?.y,
    isInsideSite,
    sitePlayerPosition?.x,
    sitePlayerPosition?.y,
    currentSummary?.length || 0,
    settings?.storyTitle || '',
    // Quest progress MUST be fingerprinted: without these, a milestone or side-quest
    // change with no other state change was skipped as "no change" and never saved.
    (settings?.milestones || []).map(m => (m && typeof m === 'object' && m.completed ? '1' : '0')).join(''),
    JSON.stringify(settings?.sideQuests || []),
    settings?.campaignComplete ? '1' : '0',
    JSON.stringify(
      heroes.map((hero) => ({
        hp: hero.currentHP,
        gold: hero.gold || 0,
        xp: hero.xp || 0,
        // Inventory by CONTENT and equipment by value (playtest 2026-07-04):
        // fingerprinting only the inventory count made a pure equip, an
        // equal-count swap, or a loadout change read as "no change", so the
        // save was skipped and gear evaporated on the next load.
        inv: (hero.inventory || [])
          .map((i) => (typeof i === 'string' ? i : i?.key || ''))
          .join(','),
        eq: JSON.stringify(hero.equipment || null)
      }))
    )
  ].join('|');
};

export const buildSubMapsPayload = ({
  currentTownMap,
  townPlayerPosition,
  currentTownTile,
  isInsideTown,
  currentMapLevel,
  townMapsCache,
  visitedBiomes,
  visitedTowns,
  movesSinceEncounter,
  // wilderness sites (caves / ruins)
  currentSiteMap,
  sitePlayerPosition,
  currentSiteTile,
  isInsideSite,
  siteMapsCache
}) => ({
  currentTownMap,
  townPlayerPosition,
  currentTownTile,
  isInsideTown,
  currentMapLevel,
  townMapsCache,
  visitedBiomes: Array.from(visitedBiomes || []),
  visitedTowns: Array.from(visitedTowns || []),
  movesSinceEncounter,
  currentSiteMap: currentSiteMap || null,
  sitePlayerPosition: sitePlayerPosition || null,
  currentSiteTile: currentSiteTile || null,
  isInsideSite: isInsideSite || false,
  siteMapsCache: siteMapsCache || {}
});
