import React, { useState } from 'react';
import { tileBackground, waterwayMask, OFF_MAP, POI_EMOJI } from '../utils/townTileArt';
import { isTownTileWalkable } from '../utils/townMapGenerator';
import BuildingModal from './BuildingModal';
import { createLogger } from '../utils/logger';
import { resolveProfilePicture } from '../utils/assetHelper';

const logger = createLogger('town-map-display');

const TILE = 34; // bigger than the original 30 but small enough that a 20x20 town fits a laptop

// Decoration / POI overlay emoji live in townTileArt (the art module) so the live
// renderer, the tileset gallery, and themed towns share one source of truth.

/**
 * TownMapDisplay - Renders a town map with the SVG tileset, buildings, and player.
 * @param {Object} townMapData - Town map data from generateTownMap()
 * @param {Object} playerPosition - Player position {x, y} within town
 * @param {Function} onTileClick - Optional callback for tile clicks
 * @param {Function} onLeaveTown - Optional callback for leave town button
 * @param {boolean} showLeaveButton - Whether to show the leave town button
 * @param {Object} firstHero - First hero for player portrait display
 * @param {string} townError - Error message to display in town map
 * @param {Function} markBuildingDiscovered - Callback to mark a building as seen
 */
const TownMapDisplay = ({ townMapData, playerPosition, onTileClick, onLeaveTown, showLeaveButton = true, firstHero, townError, markBuildingDiscovered, onQuestItemFound, onRest, onResurrect, onBuy, onSell, party, sideQuests, onAcceptSideQuest, onTurnInQuest, milestones, onTalkToNpc }) => {
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [distanceWarning, setDistanceWarning] = useState(false);

  if (!townMapData) return null;

  const discoveredBuildings = townMapData.discoveredBuildings || [];

  // Findability pass (maintainer 2026-07-07: "I can't tell what these are"):
  // a quest building carries an evocative name (The Icemoor Sanctuary) that hides
  // its type (a temple). Show name AND type, mark the active-quest venue, and glow
  // it. A quest building whose milestone is already complete stops glowing.
  const prettyType = (type) => {
    if (!type) return 'Building';
    return String(type)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };
  // Milestones with a named building tell us completion; if the component gets no
  // such data (e.g. debug pages), fall back to glowing every quest tile.
  const buildingMilestones = (milestones || []).filter((m) => m && m.building && m.building.name);
  const haveMilestoneData = buildingMilestones.length > 0;
  const activeQuestBuildingNames = new Set(
    buildingMilestones
      .filter((m) => m.status !== 'completed' && !m.completed)
      .map((m) => String(m.building.name).toLowerCase())
  );
  const isActiveQuestTile = (tile) =>
    !!tile.questBuilding &&
    (haveMilestoneData
      ? activeQuestBuildingNames.has(String(tile.buildingName || '').toLowerCase())
      : true); // no completion info at all: glow every quest building (safe default)

  const { width, height, mapData } = townMapData;
  // Biome theme drives the ground palette (sand for desert). Older cached town maps
  // lack this field and fall back to grassland — unchanged rendering.
  const townTheme = townMapData.theme || 'grassland';

  const tileAt = (c, r) => (r >= 0 && r < height && c >= 0 && c < width && mapData[r][c]) ? mapData[r][c] : null;
  const typeAt = (c, r) => { const t = tileAt(c, r); return t ? t.type : null; };
  // waterwayMask neighbour getter: positions beyond the map border are OFF_MAP (a border
  // channel renders open and flows off the map), missing in-bounds tiles stay null.
  const wetAt = (c, r) => (r >= 0 && r < height && c >= 0 && c < width) ? (mapData[r][c] || null) : OFF_MAP;

  const handleBuildingClick = (tile) => {
    if (!playerPosition) return;

    // Calculate distance
    const distance = Math.abs(tile.x - playerPosition.x) + Math.abs(tile.y - playerPosition.y);
    const coordString = `${tile.x},${tile.y}`;
    const isDiscovered = discoveredBuildings.includes(coordString);

    logger.debug('Building click debug:', { tileCoords: coordString, discoveredBuildings, isDiscovered, distance });

    // Allow seeing info if close enough (within 2 tiles) OR if already discovered
    if (distance <= 2 || isDiscovered) {
      // Find NPCs in this building (workers here OR residents whose home is here)
      const buildingNpcs = (townMapData.npcs || []).filter(npc => {
        if (!npc.location) return false;
        const isWorkingHere = npc.location.x === tile.x && npc.location.y === tile.y;
        const livesHere = npc.location.homeCoords &&
          npc.location.homeCoords.x === tile.x && npc.location.homeCoords.y === tile.y;
        return isWorkingHere || livesHere;
      });

      setSelectedBuilding({ ...tile, npcs: buildingNpcs });

      // Mark as discovered if not already and within range
      if (!isDiscovered && distance <= 2 && markBuildingDiscovered) {
        markBuildingDiscovered(townMapData.townName, tile.x, tile.y);
      }
    } else {
      // Too far and not discovered - show modal warning
      setDistanceWarning(true);
    }
  };

  return (
    <div>
      <style>{`
        @keyframes questPulse {
          0%, 100% { box-shadow: 0 0 3px 1px rgba(255, 210, 90, 0.65), inset 0 0 4px rgba(255, 210, 90, 0.5); }
          50%      { box-shadow: 0 0 10px 4px rgba(255, 225, 130, 0.95), inset 0 0 7px rgba(255, 225, 130, 0.75); }
        }
      `}</style>
      <div style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: `repeat(${width}, ${TILE}px)`,
        gap: 0,
        border: '2px solid #5d4530',
        borderRadius: 4,
        width: `${width * TILE}px`,
        margin: '20px auto',
        boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
        fontSize: '16px',
      }}>
        {mapData.flat().map((tile, index) => {
          const row = Math.floor(index / width);
          const col = index % width;
          const isPlayer = playerPosition && playerPosition.x === col && playerPosition.y === row;
          const isBuilding = tile.type === 'building';

          const distance = playerPosition ? Math.abs(col - playerPosition.x) + Math.abs(row - playerPosition.y) : 999;
          const isDiscovered = discoveredBuildings.includes(`${tile.x},${tile.y}`);
          const canSeeName = distance <= 2 || isDiscovered;
          const displayName = canSeeName && tile.buildingName ? tile.buildingName : (tile.buildingType || tile.type);
          // The party now walks to ANY reachable tile (the 5-tile cap is gone); a tile is
          // clickable if it is walkable ground (or a building, which opens its info popup).
          // Reachability is enforced by the walk itself (an unreachable click errors).
          // Walkability keys off tile TYPE (isTownTileWalkable), matching the walk's BFS
          // predicate, so clickability and reachability agree on bridges/shores even on
          // old cached town maps whose stored `walkable` flag is stale.
          const isClickable = onTileClick && distance > 0 && (isTownTileWalkable(tile) || isBuilding) && !isPlayer;

          const neighbours = { n: typeAt(col, row - 1), e: typeAt(col + 1, row), s: typeAt(col, row + 1), w: typeAt(col - 1, row) };
          // waterway-neighbour mask (canal banks, quay lips, bridge-over-canal): the
          // canal autotiler's input, same technique as the wall mask above but keyed on
          // the additive waterway flag, so pre-canal maps always yield 0 (old art)
          const wetMask = waterwayMask(tile, { n: wetAt(col, row - 1), e: wetAt(col + 1, row), s: wetAt(col, row + 1), w: wetAt(col - 1, row), ne: wetAt(col + 1, row - 1), se: wetAt(col + 1, row + 1), sw: wetAt(col - 1, row + 1), nw: wetAt(col - 1, row - 1) });
          const poiEmoji = tile.poi ? (POI_EMOJI[tile.poi] || null) : null;

          return (
            <div
              key={index}
              style={{
                width: TILE,
                height: TILE,
                backgroundImage: tileBackground(tile, neighbours, col, row, townTheme, wetMask),
                backgroundSize: 'cover',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                outline: (isPlayer || tile.isEntry) ? '2px solid yellow' : 'none',
                outlineOffset: '-2px',
                cursor: isClickable ? 'pointer' : 'default',
                ...(isBuilding && isActiveQuestTile(tile)
                  ? { animation: 'questPulse 1.6s ease-in-out infinite', zIndex: 3, borderRadius: 3 }
                  : {}),
              }}
              onClick={() => {
                if (isBuilding) {
                  handleBuildingClick(tile);
                } else if (isClickable) {
                  onTileClick(col, row);
                }
              }}
              title={`(${tile.x}, ${tile.y}) - ${displayName}${isBuilding && tile.buildingType ? ` (${prettyType(tile.buildingType)})` : ''}${isBuilding && isActiveQuestTile(tile) ? ' (QUEST)' : ''}${distance > 0 ? ` [${distance} tiles away]` : ''}${isDiscovered ? ' (Discovered)' : ''}`}
            >
              {isBuilding && isActiveQuestTile(tile) && (
                <span style={{
                  position: 'absolute', top: -6, right: -4, zIndex: 4, fontSize: 13,
                  filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.6))', pointerEvents: 'none',
                }} aria-label="quest objective">❗</span>
              )}
              {poiEmoji && (
                <span style={{ position: 'relative', zIndex: 2, fontSize: 18, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.45))' }}>
                  {poiEmoji}
                </span>
              )}
            </div>
          );
        })}
        {/* Animated player marker overlay */}
        {playerPosition && (
          <div
            style={{
              position: 'absolute',
              left: `${playerPosition.x * TILE}px`,
              top: `${playerPosition.y * TILE}px`,
              width: TILE,
              height: TILE,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 10,
              transition: 'left 0.6s ease-in-out, top 0.6s ease-in-out',
            }}
          >
            {firstHero ? (
              <div className="player-marker-portrait">
                <img
                  src={resolveProfilePicture(firstHero.profilePicture)}
                  alt={firstHero.characterName}
                  loading="lazy"
                  width="40"
                  height="40"
                />
                <div className="player-marker-pointer"></div>
              </div>
            ) : (
              <span style={{ fontSize: '16px' }}>⭐</span>
            )}
          </div>
        )}
      </div>
      {townError && (
        <div className="message system error" style={{ margin: '10px auto', display: 'block', maxWidth: '400px' }}>
          ⚠️ {townError}
        </div>
      )}
      {showLeaveButton && onLeaveTown && (
        <div style={{ textAlign: 'center', marginTop: '10px' }}>
          <button onClick={onLeaveTown} className="secondary-button">
            Leave Town
          </button>
        </div>
      )}

      {selectedBuilding && (
        <BuildingModal
          building={selectedBuilding}
          npcs={selectedBuilding.npcs}
          onClose={() => setSelectedBuilding(null)}
          firstHero={firstHero}
          onQuestItemFound={onQuestItemFound}
          onRest={onRest}
          onResurrect={onResurrect}
          onBuy={onBuy}
          onSell={onSell}
          party={party}
          sideQuests={sideQuests}
          onAcceptSideQuest={onAcceptSideQuest}
          onTurnInQuest={onTurnInQuest}
          townName={townMapData?.townName}
          milestones={milestones}
          onTalkToNpc={onTalkToNpc}
        />
      )}

      {distanceWarning && (
        <div className="modal-overlay" onClick={() => setDistanceWarning(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <h2>Too Far Away</h2>
            <p>You are too far away to identify this building clearly. Move closer to discover what it is.</p>
            <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <button onClick={() => setDistanceWarning(false)} className="primary-button">
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TownMapDisplay;
