import { getTile } from '../utils/mapGenerator';

export const isAdjacentWorldMove = (currentPosition, clickedX, clickedY) => {
  const dx = Math.abs(clickedX - currentPosition.x);
  const dy = Math.abs(clickedY - currentPosition.y);
  return dx <= 1 && dy <= 1 && (dx + dy) > 0;
};

export const applyWorldMapMove = (worldMap, clickedX, clickedY) => {
  const originalTile = getTile(worldMap, clickedX, clickedY);
  const wasExplored = originalTile?.isExplored || false;

  const newMap = worldMap.map((row) =>
    row.map((tile) =>
      tile.x === clickedX && tile.y === clickedY ? { ...tile, isExplored: true } : tile
    )
  );
  const targetTile = getTile(newMap, clickedX, clickedY);

  return { newMap, targetTile, wasExplored };
};

export const getAreaIdentifiers = (targetTile) => {
  return {
    biomeType: targetTile.biome || 'Unknown Area',
    townName: targetTile.townName || (targetTile.poi === 'town' ? 'Unknown Town' : null)
  };
};

export const getAreaVisitState = ({ biomeType, townName, visitedBiomes, visitedTowns }) => {
  return {
    isBiomeVisited: visitedBiomes.has(biomeType),
    isTownVisited: townName ? visitedTowns.has(townName) : true
  };
};

export const trackAreaVisits = ({
  biomeType,
  townName,
  isBiomeVisited,
  isTownVisited,
  trackBiomeVisit,
  trackTownVisit
}) => {
  if (!isBiomeVisited) {
    trackBiomeVisit(biomeType);
  }
  if (townName && !isTownVisited) {
    trackTownVisit(townName);
  }
};

export const buildPoiEncounter = (targetTile) => {
  if (!targetTile.poi) return null;
  const poiType = targetTile.poiType || targetTile.poi;
  return {
    name: targetTile.townName || targetTile.poi,
    poiType,
    description: targetTile.descriptionSeed || `You have arrived at ${targetTile.poi}.`,
    canEnter: ['town', 'city', 'village', 'hamlet', 'dungeon'].includes(poiType),
    tile: targetTile
  };
};

export const buildMovementSystemMessage = ({ targetTile, biomeType, clickedX, clickedY }) => {
  if (targetTile.poi === 'town' && targetTile.townName) {
    return {
      role: 'system',
      content: `You arrived at ${targetTile.townName}, a ${targetTile.townSize || 'settlement'} (${clickedX}, ${clickedY}).`
    };
  }
  return {
    role: 'system',
    content: `You moved to ${biomeType} (${clickedX}, ${clickedY}).`
  };
};

export const buildPendingNarrativeTile = ({
  targetTile,
  clickedX,
  clickedY,
  biomeType,
  townName,
  isBiomeVisited,
  isTownVisited
}) => ({
  tile: targetTile,
  coords: { x: clickedX, y: clickedY },
  biomeType,
  townName,
  needsAiDescription: !isBiomeVisited || (townName && !isTownVisited)
});
