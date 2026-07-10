// Server-side mirror of the frontend hero-name allowlist (src/utils/validation.js).
// Defense in depth (#security): a crafted client that bypasses the UI must not be
// able to persist a hero name outside the safe allowlist. Keep this rule in sync
// with the frontend helper. The DB layer is already parameterized (postgres.js
// tagged templates), so this is not the primary SQLi defense; it stops junk /
// injection-shaped names from ever reaching storage or an AI prompt.

export const HERO_NAME_MIN = 2;
export const HERO_NAME_MAX = 40;

// Latin letters with diacritics, digits, space, straight apostrophe, hyphen.
// Accented ranges are the Latin-1 Supplement and Latin Extended-A letter blocks
// with the multiplication (×) and division (÷) signs carved out.
const HERO_NAME_ALLOWED = /^[A-Za-z0-9À-ÖØ-öø-ſ '-]+$/;

export interface NameCheck {
  valid: boolean;
  name: string;
  reason: string | null;
}

/** Collapse internal whitespace runs to single spaces and trim the ends. */
export function sanitizeHeroName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim();
}

/** Validate a hero name against the safe allowlist. name is the sanitized value. */
export function validateHeroName(raw: unknown): NameCheck {
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
