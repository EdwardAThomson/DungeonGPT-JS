// validation.js
// Shared input-validation helpers for player-supplied strings that get persisted
// and later interpolated into AI prompts and stored in the database. A hero name
// is the main free-text field a player controls, so we hold it to a strict
// ALLOWLIST rather than trying to blocklist every dangerous character.
//
// Allowed: Latin letters (including common accented letters), digits, spaces,
// straight apostrophes and hyphens. Everything else (quotes, semicolons, angle
// brackets, backslashes, parentheses, equals, SQL comment markers, control
// characters, ...) is rejected. Keep this rule in sync with its server-side
// mirror in cf-worker/src/services/validation.ts (defense in depth).

export const HERO_NAME_MIN = 2;
export const HERO_NAME_MAX = 40;

// Latin letters with diacritics, digits, space, straight apostrophe, hyphen.
// The accented ranges are the Latin-1 Supplement and Latin Extended-A letter
// blocks with the multiplication (×) and division (÷) signs carved out.
// We deliberately do NOT use \p{L}, which would silently admit CJK, emoji-ish
// letters and RTL/zero-width tricks; a curated Latin allowlist stays predictable.
const HERO_NAME_ALLOWED = /^[A-Za-z0-9À-ÖØ-öø-ſ '-]+$/;

/**
 * Normalize a player-supplied name: collapse internal whitespace runs to single
 * spaces and trim the ends. Trimming/collapsing is a safe silent cleanup; it
 * never introduces or hides a disallowed character.
 */
export function sanitizeHeroName(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * Validate a hero name against the safe allowlist.
 * @returns {{ valid: boolean, name: string, reason: string|null }} name is the
 *   sanitized value (safe to persist) whether or not it passed.
 */
export function validateHeroName(raw) {
  const name = sanitizeHeroName(raw);
  if (name.length < HERO_NAME_MIN) {
    return { valid: false, name, reason: `Name must be at least ${HERO_NAME_MIN} characters.` };
  }
  if (name.length > HERO_NAME_MAX) {
    return { valid: false, name, reason: `Name must be at most ${HERO_NAME_MAX} characters.` };
  }
  if (!HERO_NAME_ALLOWED.test(name)) {
    return {
      valid: false,
      name,
      reason: 'Name can only contain letters, numbers, spaces, apostrophes and hyphens.',
    };
  }
  return { valid: true, name, reason: null };
}

/** Boolean convenience wrapper around validateHeroName. */
export function isValidHeroName(raw) {
  return validateHeroName(raw).valid;
}
