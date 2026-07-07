// Redemption-code input handling (backlog #6 first slice).
//
// Codes are 12 characters of Crockford-style base32 with no 0/O/1/I (alphabet:
// digits 2-9 plus A-Z minus I and O = 32 symbols), stored and displayed in the
// canonical dashed form XXXX-XXXX-XXXX (migrations/006_redemption_codes.sql).
// Generation lives in the private admin panel; the Worker only normalizes and
// validates what users type.

/** The 32-symbol code alphabet: 2-9 plus A-Z without I and O. */
export const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const CODE_BODY = /^[2-9A-HJ-NP-Z]{12}$/;

/**
 * Normalize user input to the canonical dashed code, or null when it cannot be a
 * code at all (wrong length/characters). Uppercases and strips spaces and dashes
 * first, so "abcd efgh jklm" and "ABCD-EFGH-JKLM" both resolve to the same code.
 * Returning null lets the endpoint reject junk without a database round trip,
 * and the response is the same generic 'code_invalid' as an unknown code: input
 * shape must not be an oracle.
 */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const body = raw.toUpperCase().replace(/[\s-]/g, '');
  if (!CODE_BODY.test(body)) return null;
  return `${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}
