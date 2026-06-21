// heroData.js
// Canonical character-creation data: option lists, point-buy constants, starting
// stats, class templates, and portraits. Shared by the creator UI and the
// validation logic so there's a single source of truth.

export const heroGenders = ["Male", "Female"];

export const heroClasses = [
  "Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk",
  "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard",
];

export const heroRaces = [
  "Human", "Dwarf", "Elf", "Smallfolk", "Dragonkin",
  "Gnome", "Half-Elf", "Half-Orc", "Demonkin",
];

export const alignmentOptions = [
  "Lawful Good", "Neutral Good", "Chaotic Good",
  "Lawful Neutral", "True Neutral", "Chaotic Neutral",
  "Lawful Evil", "Neutral Evil", "Chaotic Evil",
];

export const STAT_KEYS = [
  "Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma",
];

// --- Point-buy (5e standard) ---
// Every score starts at 8; each point above costs from this table. Level-1
// characters get POINT_BUY_BUDGET points and scores are capped at 8..15.
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;
export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

// Fresh characters start with every score at the minimum (0 points spent).
export const INITIAL_STATS = {
  Strength: 8, Dexterity: 8, Constitution: 8, Intelligence: 8, Wisdom: 8, Charisma: 8,
};

// --- Class templates (level 1) ---
// Stats are the 5e standard array {15,14,13,12,10,8} assigned to each class's
// priority abilities, so every template costs exactly POINT_BUY_BUDGET (27).
export const heroTemplates = {
  Barbarian: {
    race: "Half-Orc",
    stats: { Strength: 15, Dexterity: 13, Constitution: 14, Intelligence: 8, Wisdom: 12, Charisma: 10 },
    alignment: "Chaotic Neutral",
    backgroundSnippet: "Hails from a remote tribe, fiercely protective and quick to anger.",
  },
  Bard: {
    race: "Half-Elf",
    stats: { Strength: 8, Dexterity: 14, Constitution: 13, Intelligence: 10, Wisdom: 12, Charisma: 15 },
    alignment: "Chaotic Good",
    backgroundSnippet: "A charismatic wanderer who collects stories and inspires others.",
  },
  Cleric: {
    race: "Human",
    stats: { Strength: 13, Dexterity: 10, Constitution: 14, Intelligence: 8, Wisdom: 15, Charisma: 12 },
    alignment: "Lawful Good",
    backgroundSnippet: "Devoted servant of a deity, provides healing and guidance.",
  },
  Druid: {
    race: "Elf",
    stats: { Strength: 8, Dexterity: 13, Constitution: 14, Intelligence: 12, Wisdom: 15, Charisma: 10 },
    alignment: "True Neutral",
    backgroundSnippet: "Guardian of the wilds, draws power from nature itself.",
  },
  Fighter: {
    race: "Dwarf",
    stats: { Strength: 15, Dexterity: 13, Constitution: 14, Intelligence: 8, Wisdom: 12, Charisma: 10 },
    alignment: "Lawful Neutral",
    backgroundSnippet: "A disciplined warrior, master of arms and tactics.",
  },
  Monk: {
    race: "Human",
    stats: { Strength: 12, Dexterity: 15, Constitution: 13, Intelligence: 8, Wisdom: 14, Charisma: 10 },
    alignment: "Lawful Neutral",
    backgroundSnippet: "A practitioner of ancient martial arts, seeks inner harmony.",
  },
  Paladin: {
    race: "Dragonkin",
    stats: { Strength: 15, Dexterity: 10, Constitution: 13, Intelligence: 8, Wisdom: 12, Charisma: 14 },
    alignment: "Lawful Good",
    backgroundSnippet: "A holy warrior bound by an oath to uphold justice and righteousness.",
  },
  Ranger: {
    race: "Elf",
    stats: { Strength: 12, Dexterity: 15, Constitution: 13, Intelligence: 10, Wisdom: 14, Charisma: 8 },
    alignment: "Neutral Good",
    backgroundSnippet: "A skilled hunter and tracker, comfortable in the wilderness.",
  },
  Rogue: {
    race: "Smallfolk",
    stats: { Strength: 8, Dexterity: 15, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 13 },
    alignment: "Chaotic Neutral",
    backgroundSnippet: "Operates in the shadows, relies on stealth and cunning.",
  },
  Sorcerer: {
    race: "Demonkin",
    stats: { Strength: 8, Dexterity: 13, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 15 },
    alignment: "Chaotic Good",
    backgroundSnippet: "Wields innate magical power derived from an arcane bloodline.",
  },
  Warlock: {
    race: "Demonkin",
    stats: { Strength: 8, Dexterity: 13, Constitution: 14, Intelligence: 10, Wisdom: 12, Charisma: 15 },
    alignment: "Chaotic Neutral",
    backgroundSnippet: "Gained magical abilities through a pact with an otherworldly patron.",
  },
  Wizard: {
    race: "Gnome",
    stats: { Strength: 8, Dexterity: 13, Constitution: 14, Intelligence: 15, Wisdom: 12, Charisma: 10 },
    alignment: "Lawful Neutral",
    backgroundSnippet: "A dedicated scholar of the arcane arts, seeks knowledge and power.",
  },
};

export const profilePictures = [
  // Male portraits
  { imageId: 1, src: "assets/characters/barbarian.webp", gender: "Male" },
  { imageId: 2, src: "assets/characters/wizard.webp", gender: "Male" },
  { imageId: 3, src: "assets/characters/ranger.webp", gender: "Male" },
  { imageId: 4, src: "assets/characters/paladin.webp", gender: "Male" },
  { imageId: 5, src: "assets/characters/cleric.webp", gender: "Male" },
  { imageId: 6, src: "assets/characters/bard.webp", gender: "Male" },
  { imageId: 7, src: "assets/characters/fighter.webp", gender: "Male" },
  { imageId: 8, src: "assets/characters/druid.webp", gender: "Male" },
  // Female portraits
  { imageId: 9, src: "assets/characters/female_barbarian.webp", gender: "Female" },
  { imageId: 10, src: "assets/characters/female_wizard.webp", gender: "Female" },
  { imageId: 11, src: "assets/characters/female_ranger.webp", gender: "Female" },
  { imageId: 12, src: "assets/characters/female_paladin.webp", gender: "Female" },
  { imageId: 13, src: "assets/characters/female_cleric.webp", gender: "Female" },
  { imageId: 14, src: "assets/characters/female_bard.webp", gender: "Female" },
  { imageId: 15, src: "assets/characters/female_fighter.webp", gender: "Female" },
  { imageId: 16, src: "assets/characters/female_druid.webp", gender: "Female" },
];
