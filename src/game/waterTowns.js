// waterTowns.js
// Water towns world integration (#65 Phase 3, docs/WATER_TOWNS_PLAN.md section 2).
//
// The launch pipeline (campaignLauncher.launchCampaign) checks the account tier ONCE
// at New Game, enables the world-gen shims (riverToSea + estuaryTown on
// generateMapData) when the tier allows any water town, and STAMPS the world map:
// each chosen settlement's world tile gains an additive `waterTown: 'canal' |
// 'riverfork'` field. The save carries the stamps forever (decision 9): lazy town
// generation (useGameMap via townWater.getTownWaterContext) just reads them, no
// entitlement is ever re-checked, and lapsed subscribers keep their water towns,
// exactly like premium themes. Free-tier and guest worlds get no shims and no
// stamps: byte-identical to today.
//
// Stamping rules as shipped (decision 2):
//   canal      at most ONE per world; a CITY carrying the river band with open sea
//              beside it (the estuary town the shim guarantees), never the starting
//              town; premium tier.
//   riverfork  a seeded ~50% roll over every OTHER eligible river settlement
//              (town + city sizes whose world tile carries `hasRiver`); member tier.
//
// All of this code is public (section 6b): gating flows through entitlements, and
// enforcement is the server's job (#40). These helpers are pure apart from
// resolveWaterTownAccess, which reads the cached tier.

import { analyzeTownWater } from '../utils/townWater';
import { canUseWaterTown } from './entitlements';
import { createLogger } from '../utils/logger';

const logger = createLogger('water-towns');

/** Seeded riverfork frequency: ~half of eligible river settlements (plan section 1). */
export const RIVERFORK_STAMP_RATE = 0.5;

/**
 * The one-time entitlement check for water towns. Called by the launch pipeline (and
 * New Game's map preview so preview and launch build the same world).
 * @returns {{allowRiverfork: boolean, allowCanal: boolean}}
 */
export function resolveWaterTownAccess() {
    return {
        allowRiverfork: canUseWaterTown('riverfork'),
        allowCanal: canUseWaterTown('canal'),
    };
}

/**
 * The generateMapData options for a given access level. Any water-town entitlement
 * turns both shims on (a member's estuary city is riverfork-eligible even without
 * canal access); no entitlement returns {} (byte-identical legacy generation).
 * @param {{allowRiverfork?: boolean, allowCanal?: boolean}} access
 * @returns {{riverToSea?: true, estuaryTown?: true}}
 */
export function waterTownWorldGenOptions(access) {
    if (!access || (!access.allowRiverfork && !access.allowCanal)) return {};
    return { riverToSea: true, estuaryTown: true };
}

// Deterministic per-tile roll in [0, 1): the mapGenerator LCG seeded from the world
// seed and the tile coordinates, burnt in for a few steps so neighbours decorrelate.
function tileRoll(worldSeed, x, y) {
    let state = Math.abs((Number(worldSeed) || 42) + x * 7331 + y * 15187) % 233280;
    for (let i = 0; i < 3; i++) state = (state * 9301 + 49297) % 233280;
    return state / 233280;
}

/**
 * Stamp the world map's water towns in place. Pure and deterministic given the map,
 * seed and access flags; does nothing (and stamps nothing) without access.
 *
 * @param {Array<Array<Object>>} mapData - freshly generated world map (mutated).
 * @param {number|string} worldSeed - the world seed (drives the riverfork roll).
 * @param {{allowRiverfork?: boolean, allowCanal?: boolean}} access
 * @returns {{canal: {x:number,y:number,name?:string}|null,
 *            riverforks: Array<{x:number,y:number,name?:string}>}}
 */
export function stampWaterTowns(mapData, worldSeed, access = {}) {
    const summary = { canal: null, riverforks: [] };
    if (!Array.isArray(mapData) || mapData.length === 0) return summary;
    const allowRiverfork = access.allowRiverfork === true;
    const allowCanal = access.allowCanal === true;
    if (!allowRiverfork && !allowCanal) return summary;

    const height = mapData.length;
    const width = mapData[0].length;

    // Canal city first: a true estuary city when one exists, else a pure-coast city
    // as the fallback lagoon city (plan section 9, question 1: the flagship should
    // never fail to place just because the river mouth tile was occupied). First in
    // scan order, never the starting town, max one per world.
    if (allowCanal) {
        const pickCanal = (needsRiver) => {
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const t = mapData[y][x];
                    if (t.poi !== 'town' || t.townSize !== 'city') continue;
                    if (t.isStartingTown || (needsRiver && !t.hasRiver)) continue;
                    const water = analyzeTownWater(mapData, x, y);
                    if (!water || water.kind !== 'coast') continue;
                    t.waterTown = 'canal';
                    return { x, y, name: t.townName };
                }
            }
            return null;
        };
        summary.canal = pickCanal(true) || pickCanal(false);
        if (summary.canal) {
            logger.info(`[WATER_TOWNS] Canal city: ${summary.canal.name || '(unnamed)'} at (${summary.canal.x}, ${summary.canal.y})`);
        }
    }

    // River cities: seeded ~50% of the remaining eligible river settlements.
    if (allowRiverfork) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const t = mapData[y][x];
                if (t.poi !== 'town' || !t.hasRiver || t.waterTown) continue;
                if (t.townSize !== 'town' && t.townSize !== 'city') continue;
                if (tileRoll(worldSeed, x, y) < RIVERFORK_STAMP_RATE) {
                    t.waterTown = 'riverfork';
                    summary.riverforks.push({ x, y, name: t.townName });
                }
            }
        }
        if (summary.riverforks.length > 0) {
            logger.info(`[WATER_TOWNS] River cities: ${summary.riverforks.map((r) => r.name || `(${r.x},${r.y})`).join(', ')}`);
        }
    }

    return summary;
}
