import {
  isValidHeroName,
  validateHeroName,
  sanitizeHeroName,
  HERO_NAME_MAX,
} from './validation';

describe('sanitizeHeroName', () => {
  it('trims ends and collapses internal whitespace', () => {
    expect(sanitizeHeroName('  Aelin   the   Bold  ')).toBe('Aelin the Bold');
  });

  it('returns an empty string for non-string input', () => {
    expect(sanitizeHeroName(null)).toBe('');
    expect(sanitizeHeroName(undefined)).toBe('');
    expect(sanitizeHeroName(42)).toBe('');
  });
});

describe('validateHeroName - accepts safe names', () => {
  const valid = [
    'Aelin',
    'Aelin Ashryver',
    "O'Brien",
    'Jean-Luc',
    "Mary-Anne O'Neil",
    'Renée',
    'Þórinn',
    'Zoë',
    'Björn',
    'D2',
    'al',
  ];
  it.each(valid)('accepts %p', (name) => {
    expect(isValidHeroName(name)).toBe(true);
  });

  it('accepts accented letters, apostrophe and hyphen together', () => {
    expect(isValidHeroName("Renée-Zoë O'Björn")).toBe(true);
  });
});

describe('validateHeroName - rejects unsafe names', () => {
  const rejected = [
    "Robert'); DROP TABLE heroes;--",
    'Bobby "Tables"',
    'name; DELETE FROM users',
    "1 OR '1'='1",
    'admin=1',
    '<script>alert(1)</script>',
    'back\\slash',
    'paren(theses)',
    'brace{s}',
    'a', // too short
    '   ', // whitespace only -> empty after sanitize
    'x'.repeat(HERO_NAME_MAX + 1), // over length
    'a|b',
    'a`b',
    'emoji😀',
  ];
  it.each(rejected)('rejects %p', (name) => {
    expect(isValidHeroName(name)).toBe(false);
  });

  it('gives a friendly reason for disallowed characters', () => {
    const { valid, reason } = validateHeroName('Bobby; DROP');
    expect(valid).toBe(false);
    expect(reason).toMatch(/letters, numbers, spaces/);
  });

  it('gives a length reason when too short', () => {
    expect(validateHeroName('a').reason).toMatch(/at least/);
  });

  it('gives a length reason when too long', () => {
    expect(validateHeroName('x'.repeat(HERO_NAME_MAX + 1)).reason).toMatch(/at most/);
  });

  it('returns the sanitized name alongside the verdict', () => {
    expect(validateHeroName('  Aelin  ')).toEqual({ valid: true, name: 'Aelin', reason: null });
  });
});
