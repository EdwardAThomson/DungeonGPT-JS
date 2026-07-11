import React from 'react';
import { tileBackground, SITE_POI, ART_POI } from '../utils/siteTileArt';
import { resolveProfilePicture } from '../utils/assetHelper';

const TILE = 30; // a 20x20 site is 600px wide — fits the map modal
const MOB_STEP_MS = 400; // matches TILE_STEP_MS: a mob glides one tile per player-step

// Per-alert-state telegraph styling for a mob glyph. idle is calm; alerted shows the
// one-step amber tell before the mob commits; aggro is a red pulse (it is chasing).
const mobRingStyle = (state) => {
  if (state === 'aggro') {
    return { boxShadow: '0 0 6px 2px rgba(220,40,40,0.9)', border: '2px solid #e23b3b', animation: 'siteMobPulse 0.9s ease-in-out infinite' };
  }
  if (state === 'alerted') {
    return { boxShadow: '0 0 5px 1px rgba(255,180,60,0.85)', border: '2px solid #ffb23c' };
  }
  return { border: '2px solid rgba(30,28,34,0.6)' }; // idle
};

const mobGlyph = (mob) => (mob.encounter && mob.encounter.icon) || (mob.isBoss ? '👹' : '⚔️');

/**
 * Renders an explorable wilderness site (cave / ruin) sub-map: the SVG tileset, decoration
 * + content-slot overlays, the moving mobs, and the player marker. Mirrors TownMapDisplay
 * but simpler (no buildings / NPC modals). Movement is driven by tile clicks via onTileClick.
 * `siteNotice` surfaces loot/objective/quest feedback INSIDE the map modal (the chat log
 * is hidden behind it, so without this a pickup looks like nothing happened).
 *
 * MOVING MOBS (site.mobs) are drawn as an absolutely-positioned overlay keyed by mob id, so
 * a step animates the SAME element between tiles (a CSS transform transition) instead of
 * teleporting. Their fight/AI lives in the game loop; this component only visualizes them.
 */
const SiteMapDisplay = ({ siteMapData, playerPosition, onTileClick, onLeaveSite, showLeaveButton = true, firstHero, siteError, siteNotice }) => {
  if (!siteMapData) return null;
  const { width, height, mapData, theme } = siteMapData;

  const typeAt = (c, r) => (r >= 0 && r < height && c >= 0 && c < width && mapData[r][c]) ? mapData[r][c].type : null;

  // Live mobs, indexed by coordinate so a tile knows to suppress its ◆ slot marker under a
  // mob (defeated mobs vanish and their tile renders normally again).
  const liveMobs = (siteMapData.mobs || []).filter((m) => m && !m.defeated);
  const mobCoords = new Set(liveMobs.map((m) => `${m.x},${m.y}`));

  return (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${width}, ${TILE}px)`,
        width: width * TILE, border: '2px solid #1b1a1f', background: '#1b1a1f', margin: '0 auto',
        position: 'relative',
      }}>
        <style>{'@keyframes siteMobPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.12); } }'}</style>
        {mapData.flat().map((tile) => {
          const neighbours = { n: typeAt(tile.x, tile.y - 1), e: typeAt(tile.x + 1, tile.y), s: typeAt(tile.x, tile.y + 1), w: typeAt(tile.x - 1, tile.y) };
          const isPlayer = playerPosition && tile.x === playerPosition.x && tile.y === playerPosition.y;
          const hasMob = mobCoords.has(`${tile.x},${tile.y}`);
          // Any walkable floor tile is clickable now (no 5-tile cap); the party walks the
          // shortest path to it. Walls stay unclickable so a stray click does not error.
          const isClickable = !!onTileClick && !!tile.walkable && !isPlayer;
          return (
            <div
              key={`${tile.x},${tile.y}`}
              onClick={() => isClickable && onTileClick(tile.x, tile.y)}
              style={{
                width: TILE, height: TILE, position: 'relative', cursor: isClickable ? 'pointer' : 'default',
                backgroundImage: tileBackground(tile, neighbours, tile.x, tile.y, theme),
                backgroundSize: 'cover',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: TILE * 0.6, lineHeight: 1,
              }}
            >
              {tile.poi && !ART_POI.has(tile.poi) && SITE_POI[tile.poi]}
              {tile.content && (
                <span style={{ position: 'absolute', fontSize: TILE * 0.55, opacity: tile.content.consumed ? 0.35 : 1, textShadow: '0 0 3px #000' }}>
                  {tile.content.consumed ? '·'
                    // Combat is a moving mob now: draw NO content glyph for a mob-era combat
                    // objective marker (objective/combat without an encounter). Legacy cached
                    // encounter content (with an encounter) still draws its ⚔️.
                    : (tile.content.kind === 'objective' && tile.content.objectiveType === 'combat' && !tile.content.encounter) ? ''
                    : tile.content.kind === 'encounter' ? '⚔️'
                    : tile.content.kind === 'objective' ? '❗'
                    // loot: harvestable nodes (e.g. crystal deposits) carry `display`, a
                    // SITE_POI key, so the node LOOKS like the thing you harvest; plain
                    // loot (and older saves without the field) falls back to 💰.
                    : (SITE_POI[tile.content.display] || '💰')}
                </span>
              )}
              {/* Suppress the reserved-slot ◆ under a live mob (the mob occupies the tile). */}
              {!tile.content && tile.contentSlot && !hasMob && <span style={{ color: '#ffd34d', fontSize: TILE * 0.5, textShadow: '0 0 3px #000' }}>◆</span>}
              {isPlayer && (firstHero
                ? <img src={resolveProfilePicture(firstHero.profilePicture)} alt={firstHero.characterName} width={TILE - 6} height={TILE - 6} style={{ borderRadius: '50%', border: '2px solid #ffd34d', position: 'absolute' }} loading="lazy" />
                : <span style={{ position: 'absolute', fontSize: TILE * 0.7 }}>⭐</span>)}
            </div>
          );
        })}
        {/* Moving-mob overlay: one persistent element per mob id, positioned by transform so
            a step animates smoothly between tiles instead of jumping. */}
        {liveMobs.map((mob) => (
          <div
            key={mob.id}
            style={{
              position: 'absolute', left: 0, top: 0, width: TILE, height: TILE,
              transform: `translate(${mob.x * TILE}px, ${mob.y * TILE}px)`,
              transition: `transform ${MOB_STEP_MS}ms linear`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none', zIndex: 2,
            }}
          >
            <span style={{
              width: TILE - 8, height: TILE - 8, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: TILE * 0.55, lineHeight: 1, background: 'rgba(20,18,24,0.55)',
              textShadow: '0 0 3px #000', ...mobRingStyle(mob.state),
            }}>
              {mobGlyph(mob)}
            </span>
          </div>
        ))}
      </div>
      {siteNotice && (
        <div
          role="status"
          className="message system"
          style={{
            margin: '10px auto', display: 'block', maxWidth: 460, whiteSpace: 'pre-line',
            background: 'rgba(34, 58, 38, 0.95)', border: '1px solid #7fd08a', color: '#eaffea',
            padding: '8px 14px', borderRadius: 6, fontWeight: 600, textAlign: 'center',
          }}
        >
          {siteNotice}
        </div>
      )}
      {siteError && (
        <div className="message system error" style={{ margin: '10px auto', display: 'block', maxWidth: 400 }}>⚠️ {siteError}</div>
      )}
      {showLeaveButton && onLeaveSite && (
        <button className="secondary-button" onClick={onLeaveSite} style={{ marginTop: 10 }}>Leave</button>
      )}
    </div>
  );
};

export default SiteMapDisplay;
