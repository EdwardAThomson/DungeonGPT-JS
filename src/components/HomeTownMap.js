// HomeTownMap: a live, non-interactive town map for the marketing pages (#82). Renders the
// REAL generateTownMap() output with the game's own townTileArt, the same per-tile pipeline
// as TownMapDisplay (neighbour + waterway masks), minus all the game UI (player marker,
// building modals, quest pulses), so it stays correct when the in-game chrome is redesigned.

import React, { useMemo } from 'react';
import { generateTownMap } from '../utils/townMapGenerator';
import { tileBackground, waterwayMask, OFF_MAP, POI_EMOJI } from '../utils/townTileArt';

const HomeTownMap = ({ size = 'town', seed = 4242, tile = 26, name = 'Briarwood', hasRiver = false }) => {
  const town = useMemo(() => generateTownMap(size, name, 'south', seed, hasRiver), [size, name, seed, hasRiver]);
  const { width, height, mapData } = town;
  const theme = town.theme || 'grassland';
  const typeAt = (c, r) => (r >= 0 && r < height && c >= 0 && c < width && mapData[r][c] ? mapData[r][c].type : null);
  const wetAt = (c, r) => ((r >= 0 && r < height && c >= 0 && c < width) ? (mapData[r][c] || null) : OFF_MAP);

  return (
    <div className="realmap-wrap">
      <div
        className="realmap"
        role="img"
        aria-label={`A generated town map of ${name}, with streets, buildings and a market`}
        style={{ display: 'grid', gridTemplateColumns: `repeat(${width}, ${tile}px)`, width: width * tile }}
      >
        {mapData.flat().map((t, i) => {
          const col = i % width;
          const row = Math.floor(i / width);
          const neighbours = { n: typeAt(col, row - 1), e: typeAt(col + 1, row), s: typeAt(col, row + 1), w: typeAt(col - 1, row) };
          const wet = waterwayMask(t, { n: wetAt(col, row - 1), e: wetAt(col + 1, row), s: wetAt(col, row + 1), w: wetAt(col - 1, row), ne: wetAt(col + 1, row - 1), se: wetAt(col + 1, row + 1), sw: wetAt(col - 1, row + 1), nw: wetAt(col - 1, row - 1) });
          const emoji = t.poi ? POI_EMOJI[t.poi] : null;
          return (
            <div key={i} style={{ width: tile, height: tile, backgroundImage: tileBackground(t, neighbours, col, row, theme, wet), backgroundSize: 'cover', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(tile * 0.5) }}>
              {emoji}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default HomeTownMap;
