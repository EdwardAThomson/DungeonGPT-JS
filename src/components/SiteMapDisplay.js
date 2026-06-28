import React from 'react';
import { tileBackground, SITE_POI } from '../utils/siteTileArt';
import { resolveProfilePicture } from '../utils/assetHelper';

const TILE = 30; // a 20x20 site is 600px wide — fits the map modal

/**
 * Renders an explorable wilderness site (cave / ruin) sub-map: the SVG tileset, decoration
 * + content-slot overlays, and the player marker. Mirrors TownMapDisplay but simpler
 * (no buildings / NPC modals). Movement is driven by tile clicks via onTileClick.
 */
const SiteMapDisplay = ({ siteMapData, playerPosition, onTileClick, onLeaveSite, showLeaveButton = true, firstHero, siteError }) => {
  if (!siteMapData) return null;
  const { width, height, mapData, theme } = siteMapData;

  const typeAt = (c, r) => (r >= 0 && r < height && c >= 0 && c < width && mapData[r][c]) ? mapData[r][c].type : null;

  return (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${width}, ${TILE}px)`,
        width: width * TILE, border: '2px solid #1b1a1f', background: '#1b1a1f', margin: '0 auto',
      }}>
        {mapData.flat().map((tile) => {
          const neighbours = { n: typeAt(tile.x, tile.y - 1), e: typeAt(tile.x + 1, tile.y), s: typeAt(tile.x, tile.y + 1), w: typeAt(tile.x - 1, tile.y) };
          const isPlayer = playerPosition && tile.x === playerPosition.x && tile.y === playerPosition.y;
          return (
            <div
              key={`${tile.x},${tile.y}`}
              onClick={() => onTileClick && onTileClick(tile.x, tile.y)}
              style={{
                width: TILE, height: TILE, position: 'relative', cursor: onTileClick ? 'pointer' : 'default',
                backgroundImage: tileBackground(tile, neighbours, tile.x, tile.y, theme),
                backgroundSize: 'cover',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: TILE * 0.6, lineHeight: 1,
              }}
            >
              {tile.poi && SITE_POI[tile.poi]}
              {tile.content && (
                <span style={{ position: 'absolute', fontSize: TILE * 0.55, opacity: tile.content.consumed ? 0.35 : 1, textShadow: '0 0 3px #000' }}>
                  {tile.content.consumed ? '·' : tile.content.kind === 'encounter' ? '⚔️' : tile.content.kind === 'objective' ? '❗' : '💰'}
                </span>
              )}
              {!tile.content && tile.contentSlot && <span style={{ color: '#ffd34d', fontSize: TILE * 0.5, textShadow: '0 0 3px #000' }}>◆</span>}
              {isPlayer && (firstHero
                ? <img src={resolveProfilePicture(firstHero.profilePicture)} alt={firstHero.characterName} width={TILE - 6} height={TILE - 6} style={{ borderRadius: '50%', border: '2px solid #ffd34d', position: 'absolute' }} loading="lazy" />
                : <span style={{ position: 'absolute', fontSize: TILE * 0.7 }}>⭐</span>)}
            </div>
          );
        })}
      </div>
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
