
/**
 * Calculates the ability score modifier using the standard RPG formula.
 * Formula: floor((score - 10) / 2)
 * @param {number} score - The raw ability score (e.g., 10, 15, 20).
 * @returns {number} - The modifier (e.g., 0, +2, +5).
 */
export const calculateModifier = (score) => {
    return Math.floor((score - 10) / 2);
};

/**
 * Mapping of standard skills to their associated ability scores.
 */
export const SKILLS = {
    'Acrobatics': 'Dexterity',
    'Animal Handling': 'Wisdom',
    'Arcana': 'Intelligence',
    'Athletics': 'Strength',
    'Deception': 'Charisma',
    'History': 'Intelligence',
    'Insight': 'Wisdom',
    'Intimidation': 'Charisma',
    'Investigation': 'Intelligence',
    'Medicine': 'Wisdom',
    'Nature': 'Intelligence',
    'Perception': 'Wisdom',
    'Performance': 'Charisma',
    'Persuasion': 'Charisma',
    'Religion': 'Intelligence',
    'Sleight of Hand': 'Dexterity',
    'Stealth': 'Dexterity',
    'Survival': 'Wisdom',
    'Initiative': 'Dexterity' // Explicitly treated as a skill for convenience
};

/**
 * List of standard supported dice.
 */
export const SUPPORTED_DICE = [
    { label: 'd3', value: 3 }, // Often used for small effects
    { label: 'd4', value: 4 },
    { label: 'd6', value: 6 },
    { label: 'd8', value: 8 },
    { label: 'd10', value: 10 },
    { label: 'd12', value: 12 },
    { label: 'd20', value: 20 },
    { label: 'd100', value: 100 }
];
