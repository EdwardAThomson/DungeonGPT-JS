import { normalizeWorldSeed } from './worldSeed';
import { generateMapData } from './mapGenerator';

describe('normalizeWorldSeed', () => {
  it('passes integers through', () => {
    expect(normalizeWorldSeed(12345)).toBe(12345);
    expect(normalizeWorldSeed(0)).toBe(0);
  });

  it('parses typed (string) seeds', () => {
    expect(normalizeWorldSeed('12345')).toBe(12345);
    expect(normalizeWorldSeed(' 77 ')).toBe(77);
    expect(normalizeWorldSeed('0')).toBe(0);
  });

  it('drops fractions and signs', () => {
    expect(normalizeWorldSeed('12.9')).toBe(12);
    expect(normalizeWorldSeed(-500)).toBe(500);
    expect(normalizeWorldSeed('-500')).toBe(500);
  });

  it('returns null when there is no usable seed', () => {
    expect(normalizeWorldSeed(null)).toBeNull();
    expect(normalizeWorldSeed(undefined)).toBeNull();
    expect(normalizeWorldSeed('')).toBeNull();
    expect(normalizeWorldSeed('abc')).toBeNull();
    expect(normalizeWorldSeed(Infinity)).toBeNull();
  });

  it('makes a typed seed build its own world, not the seed-42 world', () => {
    const fallback = generateMapData(10, 10, 42);
    const typedA = generateMapData(10, 10, normalizeWorldSeed('12345'));
    const typedB = generateMapData(10, 10, normalizeWorldSeed('999999'));
    expect(typedA).toEqual(generateMapData(10, 10, 12345));
    expect(typedA).not.toEqual(fallback);
    expect(typedB).not.toEqual(fallback);
    expect(typedA).not.toEqual(typedB);
  });

  it('gives negative typed seeds a world instead of a crash', () => {
    expect(() => generateMapData(10, 10, normalizeWorldSeed('-37'))).not.toThrow();
  });
});
