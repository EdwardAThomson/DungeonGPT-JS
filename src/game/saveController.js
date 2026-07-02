// Default root used when the player hasn't named their campaign.
export const DEFAULT_SAVE_ROOT = 'Adventure';

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
    JSON.stringify(
      heroes.map((hero) => ({
        hp: hero.currentHP,
        gold: hero.gold || 0,
        xp: hero.xp || 0,
        inv: (hero.inventory || []).length
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
