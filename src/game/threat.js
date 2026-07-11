// Relative-threat helper: how dangerous a foe is RELATIVE TO THE PARTY'S CURRENT
// LEVEL. Mobs/encounters have no numeric level; they carry a `difficulty`
// ('easy' | 'medium' | 'hard' | 'deadly'). We compare that difficulty against the
// party-level-appropriate band from difficultyBandForLevel (the SAME scale spawn
// selection uses), so a fixed foe's threat shifts toward green as the party levels
// up. This is DISPLAY-ONLY; it changes no spawn or scaling logic.
//
// Single source of truth for BOTH surfaces that show threat: the ring around a site
// mob icon (SiteMapDisplay) and the badge in the combat modal (EncounterActionModal).
import { difficultyBandForLevel } from './sitePopulator';

// Ordinal rank of each authored difficulty. `deadly` (authored quest/milestone
// bosses) sits above the random band, which tops out at 'hard'.
export const DIFFICULTY_ORDINAL = { easy: 1, medium: 2, hard: 3, deadly: 4 };

// Tier -> { tier, color, label }. Colors are readable, distinct hex values reused
// verbatim by the ring and the badge so the two surfaces always agree. They line up
// with the app's --state-* palette (green/gold/orange/red) but are inlined here so
// pure/SVG consumers do not depend on CSS custom properties resolving.
export const THREAT_TIERS = {
  trivial: { tier: 'trivial', color: '#2ecc71', label: 'Trivial' }, // green
  fair:    { tier: 'fair',    color: '#f1c40f', label: 'Fair' },     // gold/yellow
  tough:   { tier: 'tough',   color: '#e67e22', label: 'Tough' },    // orange
  deadly:  { tier: 'deadly',  color: '#e74c3c', label: 'Deadly' },   // red
};

/**
 * Relative threat of a foe of the given `difficulty` for a party at `partyLevel`.
 *
 * @param {string} difficulty - 'easy' | 'medium' | 'hard' | 'deadly'
 * @param {number} partyLevel - effectivePartyLevel(party)
 * @returns {{tier:string,color:string,label:string}|null} tier descriptor, or null
 *          when the difficulty is missing/unknown (caller renders no ring).
 *
 * Rules:
 *  - 'deadly' is ALWAYS { tier:'deadly' } (a boss reads red regardless of level).
 *  - otherwise compare the difficulty ordinal to the party's band
 *    (difficultyBandForLevel): below band min -> 'trivial' (outgrown); inside
 *    [bandMin, bandMax] -> 'fair'; above band max -> 'tough'.
 *  - non-finite partyLevel / null band (legacy or unknown) falls back to the neutral
 *    'fair' tier so nothing crashes.
 */
export function getRelativeThreat(difficulty, partyLevel) {
  if (difficulty === 'deadly') return THREAT_TIERS.deadly;

  const ordinal = DIFFICULTY_ORDINAL[difficulty];
  if (!ordinal) return null; // missing/unknown difficulty: no ring, never crash

  const band = difficultyBandForLevel(partyLevel);
  if (!band || band.length === 0) return THREAT_TIERS.fair; // neutral fallback

  const bandMin = DIFFICULTY_ORDINAL[band[0]];
  const bandMax = DIFFICULTY_ORDINAL[band[band.length - 1]];

  if (ordinal < bandMin) return THREAT_TIERS.trivial;
  if (ordinal > bandMax) return THREAT_TIERS.tough;
  return THREAT_TIERS.fair;
}
