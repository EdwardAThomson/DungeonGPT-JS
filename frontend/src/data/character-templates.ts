/**
 * Character creation data — profile pictures and class templates.
 *
 * Ported from src/pages/CharacterCreation.js (lines 12-132).
 * Zero changes to data values.
 */

import type {
  CharacterAlignment,
  CharacterClass,
  CharacterGender,
  CharacterRace,
  CharacterStats,
} from "@dungeongpt/shared";

// ── Profile Pictures ────────────────────────────────────────────────────────

export interface ProfilePicture {
  readonly imageId: number;
  readonly src: string;
  readonly gender: CharacterGender;
}

export const profilePictures: readonly ProfilePicture[] = [
  // Male portraits
  { imageId: 1, src: "/barbarian.webp", gender: "Male" },
  { imageId: 2, src: "/wizard.webp", gender: "Male" },
  { imageId: 3, src: "/ranger.webp", gender: "Male" },
  { imageId: 4, src: "/paladin.webp", gender: "Male" },
  { imageId: 5, src: "/cleric.webp", gender: "Male" },
  { imageId: 6, src: "/bard.webp", gender: "Male" },
  { imageId: 7, src: "/fighter.webp", gender: "Male" },
  { imageId: 8, src: "/druid.webp", gender: "Male" },
  // Female portraits
  { imageId: 9, src: "/female_barbarian.webp", gender: "Female" },
  { imageId: 10, src: "/female_wizard.webp", gender: "Female" },
  { imageId: 11, src: "/female_ranger.webp", gender: "Female" },
  { imageId: 12, src: "/female_paladin.webp", gender: "Female" },
  { imageId: 13, src: "/female_cleric.webp", gender: "Female" },
  { imageId: 14, src: "/female_bard.webp", gender: "Female" },
  { imageId: 15, src: "/female_fighter.webp", gender: "Female" },
  { imageId: 16, src: "/female_druid.webp", gender: "Female" },
] as const;

// ── Initial Stats ───────────────────────────────────────────────────────────

export const initialStats: CharacterStats = {
  Strength: 8,
  Dexterity: 8,
  Constitution: 8,
  Intelligence: 8,
  Wisdom: 8,
  Charisma: 8,
};

// ── Alignment constants (extracted to satisfy sonarjs/no-duplicate-string) ──

const CHAOTIC_NEUTRAL: CharacterAlignment = "Chaotic Neutral";
const CHAOTIC_GOOD: CharacterAlignment = "Chaotic Good";
const LAWFUL_GOOD: CharacterAlignment = "Lawful Good";
const LAWFUL_NEUTRAL: CharacterAlignment = "Lawful Neutral";

// ── Class Templates ─────────────────────────────────────────────────────────

export interface ClassTemplate {
  readonly race: CharacterRace;
  readonly stats: CharacterStats;
  readonly alignment: CharacterAlignment;
  readonly backgroundSnippet: string;
}

export const characterTemplates: Record<CharacterClass, ClassTemplate> = {
  Barbarian: {
    race: "Half-Orc",
    stats: {
      Strength: 15,
      Dexterity: 13,
      Constitution: 14,
      Intelligence: 8,
      Wisdom: 12,
      Charisma: 10,
    },
    alignment: CHAOTIC_NEUTRAL,
    backgroundSnippet:
      "Hails from a remote tribe, fiercely protective and quick to anger.",
  },
  Bard: {
    race: "Half-Elf",
    stats: {
      Strength: 10,
      Dexterity: 14,
      Constitution: 12,
      Intelligence: 10,
      Wisdom: 13,
      Charisma: 15,
    },
    alignment: CHAOTIC_GOOD,
    backgroundSnippet:
      "A charismatic wanderer who collects stories and inspires others.",
  },
  Cleric: {
    race: "Human",
    stats: {
      Strength: 14,
      Dexterity: 10,
      Constitution: 13,
      Intelligence: 10,
      Wisdom: 15,
      Charisma: 12,
    },
    alignment: LAWFUL_GOOD,
    backgroundSnippet:
      "Devoted servant of a deity, provides healing and guidance.",
  },
  Druid: {
    race: "Elf",
    stats: {
      Strength: 10,
      Dexterity: 14,
      Constitution: 13,
      Intelligence: 12,
      Wisdom: 15,
      Charisma: 10,
    },
    alignment: "Neutral",
    backgroundSnippet:
      "Guardian of the wilds, draws power from nature itself.",
  },
  Fighter: {
    race: "Dwarf",
    stats: {
      Strength: 15,
      Dexterity: 10,
      Constitution: 14,
      Intelligence: 10,
      Wisdom: 13,
      Charisma: 12,
    },
    alignment: LAWFUL_NEUTRAL,
    backgroundSnippet:
      "A disciplined warrior, master of arms and tactics.",
  },
  Monk: {
    race: "Human",
    stats: {
      Strength: 10,
      Dexterity: 15,
      Constitution: 13,
      Intelligence: 10,
      Wisdom: 14,
      Charisma: 12,
    },
    alignment: LAWFUL_NEUTRAL,
    backgroundSnippet:
      "A practitioner of ancient martial arts, seeks inner harmony.",
  },
  Paladin: {
    race: "Dragonborn",
    stats: {
      Strength: 15,
      Dexterity: 10,
      Constitution: 13,
      Intelligence: 10,
      Wisdom: 12,
      Charisma: 14,
    },
    alignment: LAWFUL_GOOD,
    backgroundSnippet:
      "A holy warrior bound by an oath to uphold justice and righteousness.",
  },
  Ranger: {
    race: "Elf",
    stats: {
      Strength: 10,
      Dexterity: 15,
      Constitution: 13,
      Intelligence: 10,
      Wisdom: 14,
      Charisma: 12,
    },
    alignment: "Neutral Good",
    backgroundSnippet:
      "A skilled hunter and tracker, comfortable in the wilderness.",
  },
  Rogue: {
    race: "Halfling",
    stats: {
      Strength: 8,
      Dexterity: 15,
      Constitution: 12,
      Intelligence: 14,
      Wisdom: 10,
      Charisma: 14,
    },
    alignment: CHAOTIC_NEUTRAL,
    backgroundSnippet:
      "Operates in the shadows, relies on stealth and cunning.",
  },
  Sorcerer: {
    race: "Tiefling",
    stats: {
      Strength: 8,
      Dexterity: 14,
      Constitution: 14,
      Intelligence: 12,
      Wisdom: 10,
      Charisma: 15,
    },
    alignment: CHAOTIC_GOOD,
    backgroundSnippet:
      "Wields innate magical power derived from an arcane bloodline.",
  },
  Warlock: {
    race: "Tiefling",
    stats: {
      Strength: 8,
      Dexterity: 13,
      Constitution: 14,
      Intelligence: 12,
      Wisdom: 10,
      Charisma: 15,
    },
    alignment: CHAOTIC_NEUTRAL,
    backgroundSnippet:
      "Gained magical abilities through a pact with an otherworldly patron.",
  },
  Wizard: {
    race: "Gnome",
    stats: {
      Strength: 8,
      Dexterity: 14,
      Constitution: 14,
      Intelligence: 15,
      Wisdom: 12,
      Charisma: 10,
    },
    alignment: LAWFUL_NEUTRAL,
    backgroundSnippet:
      "A dedicated scholar of the arcane arts, seeks knowledge and power.",
  },
};

// ── Enum arrays for selects ─────────────────────────────────────────────────

export const characterGenders: readonly CharacterGender[] = [
  "Male",
  "Female",
] as const;

export const characterClasses: readonly CharacterClass[] = [
  "Barbarian",
  "Bard",
  "Cleric",
  "Druid",
  "Fighter",
  "Monk",
  "Paladin",
  "Ranger",
  "Rogue",
  "Sorcerer",
  "Warlock",
  "Wizard",
] as const;

export const characterRaces: readonly CharacterRace[] = [
  "Human",
  "Dwarf",
  "Elf",
  "Halfling",
  "Dragonborn",
  "Gnome",
  "Half-Elf",
  "Half-Orc",
  "Tiefling",
] as const;

export const alignmentOptions: readonly CharacterAlignment[] = [
  LAWFUL_GOOD,
  "Neutral Good",
  CHAOTIC_GOOD,
  LAWFUL_NEUTRAL,
  "True Neutral",
  CHAOTIC_NEUTRAL,
  "Lawful Evil",
  "Neutral Evil",
  "Chaotic Evil",
] as const;
