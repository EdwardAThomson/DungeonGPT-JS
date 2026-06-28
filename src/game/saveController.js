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
