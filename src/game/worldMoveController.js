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

// Never show a raw underscored id to the player ("goblin_hideout" -> "Goblin Hideout").
const titleCaseId = (id) => String(id).split(/[_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

export const buildPoiEncounter = (targetTile) => {
  if (!targetTile.poi) return null;
  const poiType = targetTile.poiType || targetTile.poi;
  const NICE_NAMES = { cave_entrance: 'a Cave', cave: 'a Cave', ruins: 'Ruins', forest: 'a Forest', hills: 'the Hills', mountain: 'the Mountains' };
  const POI_IMAGES = {
    cave_entrance: '/assets/encounters/cave_site_arrival.webp',
    cave: '/assets/encounters/cave_site_arrival.webp',
    ruins: '/assets/encounters/ruins_site_arrival.webp',
    goblin_hideout: '/assets/encounters/goblin_hideout.webp',
    mountain: '/assets/encounters/mountain_site_arrival.webp',
    forest: '/assets/encounters/forest_site_arrival.webp',
    hills: '/assets/encounters/hills_site_arrival.webp'
  };
  // Milestone POIs carry their authored display name on the tile (poiName); named mountain
  // ranges show their range name ("the Grey Moors", not "the Mountains"); the raw poi id
  // is only ever a last resort and gets title-cased so it never renders underscored.
  const rangeName = poiType === 'mountain' && targetTile.mountainName ? `the ${targetTile.mountainName}` : null;
  const displayName = targetTile.townName || targetTile.poiName || rangeName || NICE_NAMES[poiType] || titleCaseId(targetTile.poi);
  return {
    name: displayName,
    poiType,
    image: POI_IMAGES[poiType] || null,
    isMilestonePoi: !!targetTile.milestonePoi,
    description: targetTile.descriptionSeed || `You have arrived at ${displayName}.`,
    canEnter: ['town', 'city', 'village', 'hamlet', 'dungeon', 'cave_entrance', 'cave', 'ruins', 'forest', 'hills', 'mountain'].includes(poiType),
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
