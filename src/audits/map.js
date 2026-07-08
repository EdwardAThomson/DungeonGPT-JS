// MAP domain (MAP) — cross-checks the authored milestone POIs and the biome
// vocabulary the world generator can produce against the world-render + encounter
// capability tables (arrival art, world sprites, getEncounterBiome, tile art).
// Same contract as items.js. Data from ./context.js: milestonePois, producibleBiomes,
// encounterBiomeCases, biomeArtCases, poiSpriteTypes, poiArrivalImageKeys.

import { SEVERITY } from './types';

const DOMAIN = 'map';

// -----------------------------------------------------------------------------
// KNOWN ACCEPTED DEBT (CI-green ratchet, MAP-01).
//
// Milestone POI ids that have NO entry in POI_IMAGES (worldMoveController.js), so
// arriving at them shows no arrival art. This is PRE-EXISTING, intentionally-held
// debt: POI arrival art is generated externally (a Gemini image pipeline) and
// dropped in over time; only `goblin_hideout` has shipped so far. MAP-01 (error)
// allowlists the 16 currently-artless POIs so the gate stays green on today's
// debt but FAILS the moment a NEW milestone POI ships without arrival art — the
// single most important guard here: no new location may silently ship art-less.
// MAP-02 (warn) additionally lists the world-sprite gap. Documented in
// docs/CONTENT_AUDIT.md under "Known accepted gaps / debt".
export const POI_ARRIVAL_IMAGE_DEBT_ALLOWLIST = Object.freeze([
  'shadow_fortress', 'sandstorm_hideout', 'sunken_spire', 'glacier_hollow',
  'silent_steading', 'famine_barrow', 'abandoned_well', 'grimstead_cellar',
  'ironhold_ruins', 'rot_tunnels', 'gear_end_sewers', 'coghill_foundry',
  'desecrated_shrine', 'cult_meeting_place', 'corrupted_lighthouse',
  'mourn_peak_summit'
]);

// A display name that is really a raw id (all lower snake_case, no spaces).
const looksLikeRawId = (s) => typeof s === 'string' && /^[a-z0-9]+(_[a-z0-9]+)+$/.test(s.trim());

/**
 * MAP-01 (error, allowlisted): every milestone POI id has an ARRIVAL image in
 * POI_IMAGES (worldMoveController.js). The generator stamps tile.poi with the
 * spawn id, and the arrival modal looks up POI_IMAGES[tile.poi]; a missing key
 * means an art-less arrival. Known pre-existing gaps are absorbed by
 * POI_ARRIVAL_IMAGE_DEBT_ALLOWLIST so the gate stays green on today's debt but
 * fails on any NEW POI shipped without arrival art.
 */
const map01 = {
  id: 'MAP-01',
  domain: DOMAIN,
  title: 'Every milestone POI has arrival art (new POIs only; known art debt allowlisted)',
  severity: SEVERITY.ERROR,
  run(ctx) {
    const haveArt = new Set(ctx.poiArrivalImageKeys);
    const allow = new Set(POI_ARRIVAL_IMAGE_DEBT_ALLOWLIST);
    const violations = [];
    const seen = new Set();
    for (const p of ctx.milestonePois) {
      if (!p.id || seen.has(p.id)) continue;
      seen.add(p.id);
      if (haveArt.has(p.id)) continue;
      if (allow.has(p.id)) continue; // known accepted debt (surfaced by MAP-02)
      violations.push({
        message: `milestone POI '${p.id}' has no arrival image in POI_IMAGES — arriving there shows no art; add it (or, if intentional debt, to the allowlist)`,
        location: `${p.loc} — worldMoveController.js POI_IMAGES`
      });
    }
    return violations;
  }
};

/**
 * MAP-02 (warn): every milestone POI id has a DISTINCTIVE world-map sprite in
 * poiSprite (worldTileArt.js), rather than falling through to the generic red
 * milestone flag. poiSprite only branches on generic tile.poi kinds
 * (town/forest/mountain/hills/cave_entrance/ruins); a milestone POI stamps
 * tile.poi with its spawn id, so it currently always renders the generic flag.
 * Advisory (does not fail CI): this is the world-sprite debt surface.
 */
const map02 = {
  id: 'MAP-02',
  domain: DOMAIN,
  title: 'Every milestone POI has a distinctive world sprite (else it renders the generic flag)',
  severity: SEVERITY.WARN,
  run(ctx) {
    const distinctive = new Set(ctx.poiSpriteTypes);
    const violations = [];
    const seen = new Set();
    for (const p of ctx.milestonePois) {
      if (!p.id || seen.has(p.id)) continue;
      seen.add(p.id);
      if (distinctive.has(p.id)) continue;
      violations.push({
        message: `milestone POI '${p.id}' has no distinctive poiSprite branch — it renders the generic milestone flag on the world map`,
        location: `${p.loc} — worldTileArt.js poiSprite`
      });
    }
    return violations;
  }
};

/**
 * MAP-03 (error): every biome the production generator can stamp on a tile has
 * BOTH a getEncounterBiome case (else it silently collapses to the 'plains'
 * encounter table — the snow-collapses-to-plains class of bug) AND tile art in
 * biomeBackground (else it renders the plains sprite). Covers theme parity across
 * plains / desert / snow.
 */
const map03 = {
  id: 'MAP-03',
  domain: DOMAIN,
  title: 'Every producible biome has a getEncounterBiome case and tile art',
  severity: SEVERITY.ERROR,
  run(ctx) {
    const encCases = new Set(ctx.encounterBiomeCases);
    const artCases = new Set(ctx.biomeArtCases);
    const violations = [];
    for (const biome of ctx.producibleBiomes) {
      if (!encCases.has(biome)) {
        violations.push({
          message: `biome '${biome}' can be generated but has no getEncounterBiome case — its encounters silently fall back to the 'plains' table`,
          location: 'encounterGenerator.js getEncounterBiome'
        });
      }
      if (!artCases.has(biome)) {
        violations.push({
          message: `biome '${biome}' can be generated but has no biomeBackground branch — it renders the plains tile art`,
          location: 'worldTileArt.js biomeBackground'
        });
      }
    }
    return violations;
  }
};

/**
 * MAP-04 (warn): every milestone POI has an authored display `name`, so the
 * arrival modal never has to fall back to the title-cased raw id. The arrival
 * chain (townName || poiName || rangeName || NICE_NAMES || titleCaseId(poi)) never
 * renders a bare underscored id, but a POI with no authored name shows a generic
 * title-cased id instead of its intended name. Advisory; complements DISP-01.
 */
const map04 = {
  id: 'MAP-04',
  domain: DOMAIN,
  title: 'Every milestone POI has an authored display name (else it title-cases its id)',
  severity: SEVERITY.WARN,
  run(ctx) {
    const violations = [];
    for (const p of ctx.milestonePois) {
      if (p.name && String(p.name).trim() && !looksLikeRawId(p.name)) continue;
      const why = !p.name || !String(p.name).trim()
        ? 'has no authored name'
        : `name '${p.name}' looks like a raw id`;
      violations.push({
        message: `milestone POI '${p.id || '(no id)'}' ${why} — arrival would show a generic title-cased id`,
        location: p.loc
      });
    }
    return violations;
  }
};

export const checks = [map01, map02, map03, map04];

export default checks;
