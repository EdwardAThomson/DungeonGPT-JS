// World-seed normalisation. The New Game seed field hands back a string (even with
// type="number"), and the generators' seededRandom only accepts a finite number:
// anything else silently became seed 42, so every typed seed built the same world
// while its towns (seeded via parseInt) still differed. Normalise once, where a seed
// enters the launch pipeline, so a typed seed means the same as a randomised one.

/**
 * Turn user or stored seed input into a non-negative integer, or null when there is
 * no usable seed (empty, non-numeric, infinite). Negative seeds are made positive
 * because the generators index arrays with the raw LCG state and crash on negatives.
 *
 * @param {number|string|null|undefined} value
 * @returns {number|null}
 */
export const normalizeWorldSeed = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.abs(Math.trunc(n));
};
