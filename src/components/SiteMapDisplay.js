import React from 'react';
import { tileBackground, SITE_POI, ART_POI } from '../utils/siteTileArt';
import { resolveProfilePicture } from '../utils/assetHelper';
import { getRelativeThreat } from '../game/threat';
import { HUNTER_SPEED } from '../game/mobMovement';

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

// Outer THREAT ring: a colored ring showing how dangerous the mob is RELATIVE to the
// party's current level (green trivial -> gold fair -> orange tough -> red deadly). It
// is concentric with (does not replace) the inner alert-state telegraph, so "how
// dangerous" and "has it noticed you" both read at a glance. A hunter (speed ===
// HUNTER_SPEED, an unavoidable chaser) gets a distinct pulse on this ring plus a
// corner chevron. Returns null when threat is unknown (no ring, never crashes).
const threatRingStyle = (threat, isHunter) => {
  if (!threat) return null;
  return {
    position: 'absolute', left: 1, top: 1, width: TILE - 2, height: TILE - 2,
    borderRadius: '50%', border: `2px solid ${threat.color}`,
    boxShadow: `0 0 4px 1px ${threat.color}`,
    pointerEvents: 'none', boxSizing: 'border-box',
    ...(isHunter ? { animation: 'siteThreatHunterPulse 1.1s ease-in-out infinite' } : {}),
  };
};

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
const SiteMapDisplay = ({ siteMapData, playerPosition, onTileClick, onLeaveSite, showLeaveButton = true, firstHero, siteError, siteNotice, partyLevel }) => {
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
        <style>{'@keyframes siteMobPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.12); } } @keyframes siteThreatHunterPulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.18); opacity: 0.55; } }'}</style>
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
                ? <img src={resolveProfilePicture(firstHero.profilePicture)} alt={firstHero.characterName} width={TILE - 6} height={TILE - 6} style={{ borderRadius: '50%', border: '2px solid #ffd34d', position: 'absolute', zIndex: 3 }} loading="lazy" />
                : <span style={{ position: 'absolute', fontSize: TILE * 0.7, zIndex: 3 }}>⭐</span>)}
            </div>
          );
        })}
        {/* Moving-mob overlay: one persistent element per mob id, positioned by transform so
            a step animates smoothly between tiles instead of jumping. A mob is never meant to
            REST on the party's tile (spawn excludes it, chasers stop one tile short), but the
            contact check fires at distance <= 1 including co-location; if a mob transiently
            shares the hero's tile we skip its glyph so the hero marker never vanishes
            (playtest 2026-07-18: "hero icon disappeared" after a fight). */}
        {liveMobs
          .filter((mob) => !(playerPosition && mob.x === playerPosition.x && mob.y === playerPosition.y))
          .map((mob) => {
          // RELATIVE threat vs the party's current level (null tolerates a mob with
          // no encounter/difficulty: it simply gets no threat ring). isHunter marks an
          // unavoidable chaser (speed === HUNTER_SPEED) for the distinct pulse + chevron.
          const threat = getRelativeThreat(mob.encounter && mob.encounter.difficulty, partyLevel);
          const isHunter = mob.speed === HUNTER_SPEED;
          return (
          <div
            key={mob.id}
            title={threat ? `${threat.label} threat${isHunter ? ' · Hunter (will chase)' : ''}` : undefined}
            style={{
              position: 'absolute', left: 0, top: 0, width: TILE, height: TILE,
              transform: `translate(${mob.x * TILE}px, ${mob.y * TILE}px)`,
              transition: `transform ${MOB_STEP_MS}ms linear`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none', zIndex: 2,
            }}
          >
            {/* Threat ring (concentric with the inner alert-state telegraph). */}
            {threat && <span aria-hidden="true" style={threatRingStyle(threat, isHunter)} />}
            <span style={{
              width: TILE - 8, height: TILE - 8, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: TILE * 0.55, lineHeight: 1, background: 'rgba(20,18,24,0.55)',
              textShadow: '0 0 3px #000', ...mobRingStyle(mob.state),
            }}>
              {mobGlyph(mob)}
            </span>
            {/* Hunter chevron: an unavoidable chaser reads differently from a normal mob
                of the same difficulty (in the threat color, so it does not fight the ring). */}
            {isHunter && (
              <span aria-hidden="true" style={{
                position: 'absolute', top: -2, right: -2,
                width: TILE * 0.36, height: TILE * 0.36, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: TILE * 0.32, lineHeight: 1, fontWeight: 700,
                color: (threat && threat.color) || '#e74c3c',
                background: 'rgba(20,18,24,0.85)', textShadow: '0 0 2px #000',
              }}>»</span>
            )}
          </div>
          );
        })}
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
