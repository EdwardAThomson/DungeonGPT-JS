// WorldWaterwaysLayer.js
// Rivers, roads and bridges over the world map's ground tiles, as one SVG covering the
// whole grid (see worldWaterways.js). Sits under the upright 3/4 sprites.

import React, { useMemo } from 'react';
import { waterwaysSvg } from '../utils/worldWaterways';

const WorldWaterwaysLayer = ({ map, theme = 'grassland', zIndex = 1 }) => {
  const rows = map?.length || 0, cols = map?.[0]?.length || 0;
  const markup = useMemo(() => waterwaysSvg(map, { theme }), [map, theme]);
  if (!rows || !cols) return null;
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${cols} ${rows}`}
      preserveAspectRatio="none"
      style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex }}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
};

export default WorldWaterwaysLayer;
