// HomeWorldMap — the landing world section's live map (#82 §12.3c). Renders the REAL
// generateMapData() output with the game's own worldTileArt (biomes, POIs, river/path
// overlays) and WorldMapLabels, non-interactively, at a fixed curated seed. Extracted from
// the render in src/pages/WorldMapArtTest.js so the landing uses the actual pipeline, not a mock.

import React, { useMemo } from 'react';
import { generateMapData } from '../utils/mapGenerator';
import { biomeBackground, poiSprite } from '../utils/worldTileArt';
import WorldMapLabels from './WorldMapLabels';

const TILE = 40;
const WIDTH = 10;
const HEIGHT = 8;
const SEED = 90210;
const HERO_MARKER = '/assets/characters/fighter.webp';

const pathSVGs = {
  NORTH_SOUTH: 'M20,0 L20,40', EAST_WEST: 'M0,20 L40,20',
  NORTH_EAST: 'M20,0 Q20,20 40,20', NORTH_WEST: 'M20,0 Q20,20 0,20',
  SOUTH_EAST: 'M20,40 Q20,20 40,20', SOUTH_WEST: 'M20,40 Q20,20 0,20',
  INTERSECTION: 'M20,0 L20,40 M0,20 L40,20',
  START_NORTH: 'M20,20 L20,0', START_SOUTH: 'M20,20 L20,40', START_EAST: 'M20,20 L40,20', START_WEST: 'M20,20 L0,20',
  END_NORTH: 'M20,40 L20,20', END_SOUTH: 'M20,0 L20,20', END_EAST: 'M0,20 L20,20', END_WEST: 'M40,20 L20,20',
};
const BEACH_SHIFT = [
  'translateY(10px)', 'translateX(-10px)', 'translateY(-10px)', 'translateX(10px)',
  'translate(-7px, 7px)', 'translate(-7px, -7px)', 'translate(7px, -7px)', 'translate(7px, 7px)',
  'translate(-5px, 5px)', 'translate(-5px, -5px)', 'translate(5px, -5px)', 'translate(5px, 5px)',
];

const Overlay = ({ d, stroke, width, opacity, transform }) => (
  <svg viewBox="0 0 40 40" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1, transform }}>
    <path d={d} stroke={stroke} strokeWidth={width} fill="none" opacity={opacity} strokeLinecap="round" />
  </svg>
);

const HomeWorldMap = () => {
  const world = useMemo(() => generateMapData(WIDTH, HEIGHT, SEED, {}, 'grassland'), []);
  const cols = world[0].length;

  // Stand the party marker on a land tile ADJACENT to the starting town, so the marker
  // (which is larger than a tile) doesn't cover the town's own icon. Prefer below, then
  // the sides, then up, then diagonals; fall back to the town tile itself.
  const markerPos = useMemo(() => {
    let town = null;
    world.flat().forEach((t) => { if (t.isStartingTown) town = t; });
    if (!town) return null;
    const isLand = (x, y) => {
      if (y < 0 || y >= world.length || x < 0 || x >= world[0].length) return false;
      const t = world[y][x];
      return t && t.biome !== 'water' && !t.isStartingTown && !t.poi;
    };
    const candidates = [
      [town.x, town.y + 1], [town.x + 1, town.y], [town.x - 1, town.y], [town.x, town.y - 1],
      [town.x + 1, town.y + 1], [town.x - 1, town.y + 1], [town.x + 1, town.y - 1], [town.x - 1, town.y - 1],
    ];
    const hit = candidates.find(([x, y]) => isLand(x, y));
    return hit ? { x: hit[0], y: hit[1] } : { x: town.x, y: town.y };
  }, [world]);

  const mapLabels = useMemo(() => {
    const out = [];
    world.flat().forEach((t) => {
      const text = t.townName
        || (t.mountainName && t.isFirstMountainInRange ? t.mountainName : null)
        || (t.milestonePoi ? t.poiName : null);
      if (text) out.push({ x: t.x, y: t.y, text, kind: t.milestonePoi ? 'milestone' : t.townName ? 'town' : 'mountain' });
    });
    return out;
  }, [world]);

  return (
    <div className="realmap-wrap">
      <div
        className="realmap"
        role="img"
        aria-label="A generated overworld with towns, roads, rivers and mountains, and a party marker at the starting town"
        style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${cols}, ${TILE}px)`, width: cols * TILE }}
      >
        {world.flat().map((tile) => {
          const poi = poiSprite(tile);
          const beachShift = (tile.biome === 'beach' && tile.beachDirection != null) ? BEACH_SHIFT[tile.beachDirection] : 'none';
          return (
            <div key={`${tile.x},${tile.y}`} style={{ width: TILE, height: TILE, backgroundImage: biomeBackground(tile, tile.x, tile.y), backgroundSize: 'cover', position: 'relative' }}>
              {tile.hasRiver && tile.biome !== 'water' && (
                <Overlay d={pathSVGs[tile.riverDirection] || pathSVGs.NORTH_SOUTH} stroke="#3f7cc2" width={4} opacity={0.85} />
              )}
              {tile.hasPath && (
                <Overlay d={pathSVGs[tile.pathDirection] || pathSVGs.NORTH_SOUTH} stroke="#7a5230" width={3} opacity={0.8} transform={beachShift} />
              )}
              {poi && <div style={{ position: 'absolute', inset: 0, zIndex: 2, backgroundImage: poi, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', transform: beachShift }} />}
              {markerPos && tile.x === markerPos.x && tile.y === markerPos.y && (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute', width: TILE * 1.25, height: TILE * 1.25, left: '50%', top: '46%',
                    transform: 'translate(-50%, -50%)', borderRadius: '50%', backgroundImage: `url('${HERO_MARKER}')`,
                    backgroundSize: 'cover', backgroundPosition: '50% 18%', border: '3px solid var(--gold)',
                    boxShadow: '0 0 0 2px rgba(14,13,19,.6), 0 6px 16px -4px rgba(0,0,0,.7), 0 0 14px rgba(216,166,78,.55)',
                    zIndex: 5, pointerEvents: 'none',
                  }}
                />
              )}
            </div>
          );
        })}
        <WorldMapLabels labels={mapLabels} tile={TILE} />
      </div>
    </div>
  );
};

export default HomeWorldMap;
