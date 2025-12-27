
/**
 * Rolls a single die of the specified number of sides.
 * @param {number} sides - Number of sides (e.g., 6, 20).
 * @returns {number} - The result of the roll (1 to sides).
 */
export const rollDie = (sides) => {
    return Math.floor(Math.random() * sides) + 1;
};

/**
 * Rolls multiple dice of the same type.
 * @param {number} count - Number of dice to roll.
 * @param {number} sides - Number of sides on each die.
 * @returns {Object} - An object containing the total and individual results.
 * @example
 * rollDice(2, 6) // { total: 7, results: [3, 4] }
 */
export const rollDice = (count, sides) => {
    const results = [];
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
 * @param {number} modifier - The ability score modifier or skill bonus.
 * @param {boolean} hasAdvantage - Roll twice and take higher.
 * @param {boolean} hasDisadvantage - Roll twice and take lower.
 * @returns {Object} - Object with total, natural roll(s), and details.
 */
export const rollCheck = (modifier = 0, hasAdvantage = false, hasDisadvantage = false) => {
    let roll1 = rollDie(20);
    let roll2 = rollDie(20);
    let naturalRoll = roll1;
    let ignoredRoll = null;

    if (hasAdvantage && !hasDisadvantage) {
        naturalRoll = Math.max(roll1, roll2);
        ignoredRoll = Math.min(roll1, roll2);
    } else if (hasDisadvantage && !hasAdvantage) {
        naturalRoll = Math.min(roll1, roll2);
        ignoredRoll = Math.max(roll1, roll2);
    }
    // If both (or neither), standard roll (uses roll1)

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
        rolls: (hasAdvantage || hasDisadvantage) ? [roll1, roll2] : [roll1],
        isCriticalSuccess,
        isCriticalFailure
    };
};
