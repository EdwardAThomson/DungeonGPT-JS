// mapLegend.js
// Builds legend/key entries for each map kind from the SAME tile-art functions the maps
// render with, so the key can never drift from what's drawn. Each entry is either a tile
// swatch (`bg` = a data-URI background string) or an overlay (`emoji`), plus a `label`.
// Grouped into sections for display by <MapLegend>.

import { sampleBiomes, samplePois } from './worldTileArt';
import { sampleTiles as townSamples, buildingTile, POI_EMOJI } from './townTileArt';
import { sampleSiteTiles, SITE_DECORATIONS } from './siteTileArt';

const tile = (bg, label) => ({ bg, label });
const mark = (emoji, label) => ({ emoji, label });

// --- world map ---------------------------------------------------------------
export function worldLegendGroups() {
  return [
    {
      heading: 'Terrain',
      items: [
        tile(sampleBiomes.plains(), 'Plains'),
        tile(sampleBiomes.woodland(), 'Woodland'),
        tile(sampleBiomes.desert(), 'Desert'),
        tile(sampleBiomes.swamp(), 'Swamp'),
        tile(sampleBiomes.snow(), 'Snow'),
        tile(sampleBiomes.water(), 'Sea'),
        tile(sampleBiomes.lake(), 'Lake'),
        tile(sampleBiomes['beach N'](), 'Shore'),
      ],
    },
    {
      heading: 'Locations',
      items: [
        tile(samplePois.forest(), 'Forest'),
        tile(samplePois.mountain(), 'Mountains'),
        tile(samplePois.hills(), 'Hills'),
        tile(samplePois.cave(), 'Cave'),
        tile(samplePois.ruins(), 'Ruins'),
        tile(samplePois.hamlet(), 'Hamlet'),
        tile(samplePois.village(), 'Village'),
        tile(samplePois.town(), 'Town'),
        tile(samplePois.city(), 'City'),
        tile(samplePois.milestone(), 'Quest site'),
      ],
    },
  ];
}

// --- town map ----------------------------------------------------------------
const TOWN_BUILDINGS = [
  ['house', 'House'], ['inn', 'Inn'], ['tavern', 'Tavern'], ['shop', 'Shop'],
  ['market', 'Market'], ['blacksmith', 'Blacksmith'], ['temple', 'Temple'],
  ['shrine', 'Shrine'], ['bank', 'Bank'], ['guild', 'Guild'], ['townhall', 'Town hall'],
  ['alchemist', 'Alchemist'], ['apothecary', 'Apothecary'], ['archives', 'Archives'],
  ['library', 'Library'], ['magetower', 'Mage tower'], ['foundry', 'Foundry'],
  ['warehouse', 'Warehouse'], ['mill', 'Mill'], ['tailor', 'Tailor'], ['fletcher', 'Fletcher'],
  ['stables', 'Stables'], ['barn', 'Barn'], ['barracks', 'Barracks'], ['jail', 'Jail'],
  ['harbormaster', 'Harbormaster'], ['workshop', 'Workshop'], ['manor', 'Manor'], ['keep', 'Keep'],
];

export function townLegendGroups() {
  return [
    {
      heading: 'Ground & paths',
      items: [
        tile(townSamples.grass(), 'Grass'),
        tile(townSamples.dirt(), 'Dirt path'),
        tile(townSamples.town_square(), 'Stone / square'),
        tile(townSamples.farm_field(), 'Farmland'),
        tile(townSamples.water(), 'Water'),
        tile(townSamples.beach(), 'Shore'),
        tile(townSamples.bridge(), 'Bridge'),
      ],
    },
    {
      heading: 'Buildings',
      items: TOWN_BUILDINGS.map(([type, label]) => tile(buildingTile(type), label)),
    },
    {
      heading: 'Features',
      items: [
        mark(POI_EMOJI.fountain, 'Fountain'),
        mark(POI_EMOJI.tree, 'Tree'),
        mark(POI_EMOJI.flowers, 'Flowers'),
      ],
    },
  ];
}

// --- wilderness site map (caves / ruins / forests / hills / mountains) --------
// Terrain + decorations both derive from siteTileArt so the key matches the map exactly.
// Open-air sites (ruins / forest / hills) sit on biome ground, so the legend shows the
// surrounding ground swatch (themed by `biome`); enclosed sites (cave / mountain) don't.
const SITE_OPEN_AIR = ['ruins', 'forest', 'hills'];
const SITE_HEADING = { cave: 'Cave', ruins: 'Ruins', forest: 'Forest', hills: 'Hills', mountain: 'Mountain pass' };
const SITE_WALL_LABEL = { cave: 'Cave wall', ruins: 'Ruined wall', forest: 'Trees', hills: 'Rocky outcrop', mountain: 'Rock face' };
const SITE_FLOOR_LABEL = { forest: 'Clearing', hills: 'Slope' };

export function siteLegendGroups(theme = 'cave', biome = 'grassland') {
  const t = sampleSiteTiles[`${theme}_floor`] ? theme : 'cave';
  const openAir = SITE_OPEN_AIR.includes(t);
  const s = sampleSiteTiles;
  const decos = SITE_DECORATIONS[t] || [];
  const groundSwatch = biome === 'desert' ? s.ground_sand() : biome === 'snow' ? s.ground_snow() : s.ground_grass();
  const groundLabel = biome === 'desert' ? 'Desert sand' : biome === 'snow' ? 'Snow' : 'Field';
  return [
    {
      heading: SITE_HEADING[t] || 'Site',
      items: [
        ...(openAir ? [tile(groundSwatch, groundLabel)] : []),
        tile(s[`${t}_floor`](), SITE_FLOOR_LABEL[t] || 'Floor'),
        tile(s[`${t}_wall`](), SITE_WALL_LABEL[t] || 'Wall'),
        tile(s[`${t}_rubble`](), 'Rubble'),
        tile(s[`${t}_entrance`](), 'Exit'),
      ],
    },
    {
      heading: 'Features',
      items: [
        ...decos.map((d) => mark(d.emoji, d.label)),
        mark('⚔️', 'Encounter'),
        mark('💰', 'Treasure'),
      ],
    },
  ];
}
