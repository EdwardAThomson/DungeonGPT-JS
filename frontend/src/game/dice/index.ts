/**
 * Dice rolling mechanics.
 * Ported from src/utils/dice.js — zero behavioral changes.
 */

/** Result of rolling multiple dice of the same type. */
export interface DiceRollResult {
  readonly total: number;
  readonly results: readonly number[];
}

/** Result of a d20 skill/ability check. */
export interface CheckResult {
  readonly total: number;
  readonly naturalRoll: number;
  readonly modifier: number;
  readonly hasAdvantage: boolean;
  readonly hasDisadvantage: boolean;
  readonly rolls: readonly number[];
  readonly isCriticalSuccess: boolean;
  readonly isCriticalFailure: boolean;
}

/**
 * Rolls a single die of the specified number of sides.
 * @param sides - Number of sides (e.g., 6, 20).
 * @returns The result of the roll (1 to sides).
 */
export const rollDie = (sides: number): number => {
  return Math.floor(Math.random() * sides) + 1;
};

/**
 * Rolls multiple dice of the same type.
 * @param count - Number of dice to roll.
 * @param sides - Number of sides on each die.
 * @returns An object containing the total and individual results.
 * @example
 * rollDice(2, 6) // { total: 7, results: [3, 4] }
 */
export const rollDice = (count: number, sides: number): DiceRollResult => {
  const results: number[] = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    const result = rollDie(sides);
    results.push(result);
    total += result;
  }
  return { total, results };
};

/**
 * Performs a standard check (d20 + modifier).
 * @param modifier - The ability score modifier or skill bonus.
 * @param hasAdvantage - Roll twice and take higher.
 * @param hasDisadvantage - Roll twice and take lower.
 * @returns Object with total, natural roll(s), and details.
 */
export const rollCheck = (
  modifier = 0,
  hasAdvantage = false,
  hasDisadvantage = false,
): CheckResult => {
  const roll1 = rollDie(20);
  const roll2 = rollDie(20);
  let naturalRoll = roll1;
  let ignoredRoll: number | null = null;

  if (hasAdvantage && !hasDisadvantage) {
    naturalRoll = Math.max(roll1, roll2);
    ignoredRoll = Math.min(roll1, roll2);
  } else if (hasDisadvantage && !hasAdvantage) {
    naturalRoll = Math.min(roll1, roll2);
    ignoredRoll = Math.max(roll1, roll2);
  }
  // If both (or neither), standard roll (uses roll1)
  // NOTE: ignoredRoll is intentionally unused in the return — preserving original behavior
  void ignoredRoll;

  // Check for Critical Success/Failure (Natural 20 / Natural 1)
  const isCriticalSuccess = naturalRoll === 20;
  const isCriticalFailure = naturalRoll === 1;

  const total = naturalRoll + modifier;

  return {
    total,
    naturalRoll,
    modifier,
    hasAdvantage,
    hasDisadvantage,
    rolls:
      hasAdvantage || hasDisadvantage ? [roll1, roll2] : [roll1],
    isCriticalSuccess,
    isCriticalFailure,
  };
};
