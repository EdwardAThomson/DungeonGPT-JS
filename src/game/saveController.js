export const buildSaveFingerprint = ({
  conversation,
  playerPosition,
  townPlayerPosition,
  currentMapLevel,
  isInsideTown,
  currentSummary,
  settings,
  selectedHeroes
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
  movesSinceEncounter
}) => ({
  currentTownMap,
  townPlayerPosition,
  currentTownTile,
  isInsideTown,
  currentMapLevel,
  townMapsCache,
  visitedBiomes: Array.from(visitedBiomes || []),
  visitedTowns: Array.from(visitedTowns || []),
  movesSinceEncounter
});
