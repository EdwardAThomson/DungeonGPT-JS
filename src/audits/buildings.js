// BUILDINGS domain (BLD) — cross-checks authored milestone `building` blocks and
// the town generator's building tables against the code that names, renders, and
// stocks each building type. Same contract as items.js: a default-exported array
// of pure Check objects (see ./types.js). Data comes from ./context.js:
// milestoneBuildings, placeableBuildingTypes, buildingNameGeneratorTypes,
// artBuildingTypes, shopBuildingTypes, shopStock.

import { SEVERITY } from './types';

const DOMAIN = 'buildings';

// -----------------------------------------------------------------------------
// KNOWN ACCEPTED DEBT (CI-green ratchet).
//
// These placeable building types have NO branch in assignBuildingName
// (townMapGenerator.js), so a plain generated instance renders a bare type label
// ("Apothecary") instead of a proper name — the apothecary-name bug. This is
// PRE-EXISTING content debt, not a regression, so BLD-03 (error) allowlists it:
// the gate stays green today but FAILS the moment a NEW placeable type ships
// without a name generator. BLD-06 (warn) prints the same list every run so the
// debt stays visible until it is burned down. Documented in docs/CONTENT_AUDIT.md
// under "Known accepted gaps / debt".
export const NAME_GENERATOR_DEBT_ALLOWLIST = Object.freeze([
  'barn', 'shrine', 'mill', 'stables', 'tailor', 'fletcher', 'apothecary',
  'townhall', 'magetower', 'jail', 'harbormaster', 'boathouse'
]);

/**
 * BLD-01 (error): every milestone `building.type` is a building type the town
 * system knows — either one the generator places (placeableBuildingTypes) or one
 * the renderer has art for (artBuildingTypes, which covers inject-only venues
 * like `barracks`/`workshop`). A typo'd type ('tavernn') matches neither, so the
 * quest venue would stamp a tile with no silhouette and no name.
 */
const bld01 = {
  id: 'BLD-01',
  domain: DOMAIN,
  title: 'Every milestone building.type is a known building type',
  severity: SEVERITY.ERROR,
  run(ctx) {
    const known = new Set([...ctx.placeableBuildingTypes, ...ctx.artBuildingTypes]);
    const violations = [];
    for (const b of ctx.milestoneBuildings) {
      if (!b.type) continue; // absence is BLD-06's concern, not a bad type
      if (known.has(b.type)) continue;
      violations.push({
        message: `milestone building.type '${b.type}' is not a placeable or known-art building type`,
        location: b.loc
      });
    }
    return violations;
  }
};

/**
 * BLD-02 (error): every milestone `building.location` names a town the campaign
 * actually generates (its customNames.towns, or a milestone `location`). A venue
 * pinned to a town that never appears means the quest building is never injected
 * (spawnWorldMapEntities warns and drops it), so the objective is unreachable.
 */
const bld02 = {
  id: 'BLD-02',
  domain: DOMAIN,
  title: 'Every milestone building.location is a town the campaign generates',
  severity: SEVERITY.ERROR,
  run(ctx) {
    const violations = [];
    for (const b of ctx.milestoneBuildings) {
      if (!b.location) continue;
      if (b.townNames.has(String(b.location).toLowerCase())) continue;
      violations.push({
        message: `milestone building.location '${b.location}' is not among the campaign's town names`,
        location: b.loc
      });
    }
    return violations;
  }
};

/**
 * BLD-03 (error, allowlisted): every placeable building type has a name-generator
 * branch in assignBuildingName, so a generated instance shows a real name rather
 * than its bare type. `house` is exempt (anonymous by design). Known pre-existing
 * gaps are absorbed by NAME_GENERATOR_DEBT_ALLOWLIST so the gate stays green on
 * today's debt but fails on any NEW placeable-without-a-name type.
 */
const bld03 = {
  id: 'BLD-03',
  domain: DOMAIN,
  title: 'Every placeable building type has a name generator (new gaps only; known debt allowlisted)',
  severity: SEVERITY.ERROR,
  run(ctx) {
    const named = new Set(ctx.buildingNameGeneratorTypes);
    const allow = new Set(NAME_GENERATOR_DEBT_ALLOWLIST);
    const violations = [];
    for (const type of ctx.placeableBuildingTypes) {
      if (type === 'house') continue; // houses are intentionally nameless
      if (named.has(type)) continue;
      if (allow.has(type)) continue; // known accepted debt (surfaced by BLD-06)
      violations.push({
        message: `placeable building type '${type}' has no assignBuildingName branch and renders a bare type label`,
        location: 'townMapGenerator.js assignBuildingName'
      });
    }
    return violations;
  }
};

/**
 * BLD-04 (warn): every placeable building type has town tile art (a silhouette in
 * townTileArt's BUILDING_TYPES) so it never renders as a blank/gable-fallback
 * tile. Non-blocking: a missing shape degrades the look, it does not break play.
 */
const bld04 = {
  id: 'BLD-04',
  domain: DOMAIN,
  title: 'Every placeable building type has town tile art',
  severity: SEVERITY.WARN,
  run(ctx) {
    const art = new Set(ctx.artBuildingTypes);
    const violations = [];
    for (const type of ctx.placeableBuildingTypes) {
      if (art.has(type)) continue;
      violations.push({
        message: `placeable building type '${type}' has no townTileArt silhouette (renders the gable fallback)`,
        location: 'townTileArt.js BUILDING_SHAPE'
      });
    }
    return violations;
  }
};

/**
 * BLD-05 (error): every shop building type (the ones BuildingModal opens a store
 * for) has a stock list in shopStock.js. A shop type with no stock renders an
 * empty store — the player opens it and can buy nothing, silently.
 */
const bld05 = {
  id: 'BLD-05',
  domain: DOMAIN,
  title: 'Every shop building type has stock defined',
  severity: SEVERITY.ERROR,
  run(ctx) {
    const violations = [];
    for (const type of ctx.shopBuildingTypes) {
      const stock = ctx.shopStock[type];
      if (Array.isArray(stock) && stock.length > 0) continue;
      violations.push({
        message: `shop building type '${type}' has no stock in SHOP_STOCK — its store opens empty`,
        location: `shopStock.js SHOP_STOCK['${type}']`
      });
    }
    return violations;
  }
};

/**
 * BLD-06 (warn): name-generator coverage debt. Lists the placeable building types
 * that currently render a bare type label because assignBuildingName has no branch
 * (the BLD-03 allowlist). Non-blocking on purpose: this is the visibility surface
 * for the known debt so `npm run audit` prints it every run while BLD-03 stops
 * new gaps. Burn the list down and BLD-03's allowlist shrinks with it.
 */
const bld06 = {
  id: 'BLD-06',
  domain: DOMAIN,
  title: 'Name-generator coverage debt (known types that render a bare label)',
  severity: SEVERITY.WARN,
  run(ctx) {
    const named = new Set(ctx.buildingNameGeneratorTypes);
    const violations = [];
    for (const type of ctx.placeableBuildingTypes) {
      if (type === 'house') continue;
      if (named.has(type)) continue;
      violations.push({
        message: `building type '${type}' has no name generator (renders "${type[0].toUpperCase()}${type.slice(1)}"); accepted debt, please add a branch`,
        location: 'townMapGenerator.js assignBuildingName'
      });
    }
    return violations;
  }
};

export const checks = [bld01, bld02, bld03, bld04, bld05, bld06];

export default checks;
