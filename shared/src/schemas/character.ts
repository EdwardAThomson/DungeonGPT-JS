import { z } from "zod";

// ── Profile picture URL validation ──────────────────────────────────────────

/**
 * Allowed data:image MIME subtypes for profile picture data URIs.
 * Matches the frontend sanitizeImageUrl utility for defense-in-depth.
 */
const ALLOWED_IMAGE_DATA_PREFIXES: readonly string[] = [
  "data:image/png",
  "data:image/jpeg",
  "data:image/gif",
  "data:image/webp",
  "data:image/svg+xml",
];

/**
 * Validate that a profile picture URL is safe.
 *
 * Allowed:
 *  - Relative paths starting with `/` (same-origin static assets)
 *  - `https://` URLs
 *  - `data:image/` URIs with approved MIME types (png, jpeg, gif, webp, svg+xml)
 *
 * Rejected:
 *  - `javascript:` URIs (XSS vector)
 *  - `vbscript:` URIs (XSS vector)
 *  - `http://` URLs (insecure transport)
 *  - `data:` URIs with non-image MIME types (XSS via data:text/html)
 *  - Protocol-relative URLs (`//`) (scheme downgrade risk)
 *  - All other schemes (ftp:, file:, etc.)
 */
function isValidProfilePictureUrl(url: string): boolean {
  const trimmed = url.trim();

  // Relative paths — same-origin static assets (e.g. /barbarian.webp)
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return true;
  }

  // HTTPS URLs
  if (trimmed.startsWith("https://")) {
    return true;
  }

  // Approved data:image URIs
  const lower = trimmed.toLowerCase();
  for (const prefix of ALLOWED_IMAGE_DATA_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

/** Zod schema for a safe profile picture URL. */
const profilePictureSchema = z
  .string()
  .min(1)
  .refine(isValidProfilePictureUrl, {
    message:
      "Profile picture must be a relative path (/), https:// URL, or data:image/ URI",
  });

/**
 * Character stats object.
 * Matches the exact shape from CharacterCreation.js initialStats.
 */
export const characterStatsSchema = z.object({
  Strength: z.number().int().min(1).max(20),
  Dexterity: z.number().int().min(1).max(20),
  Constitution: z.number().int().min(1).max(20),
  Intelligence: z.number().int().min(1).max(20),
  Wisdom: z.number().int().min(1).max(20),
  Charisma: z.number().int().min(1).max(20),
});

export type CharacterStats = z.infer<typeof characterStatsSchema>;

/**
 * Character genders — matches characterGenders array from CharacterCreation.js.
 */
export const characterGenderSchema = z.enum(["Male", "Female"]);

export type CharacterGender = z.infer<typeof characterGenderSchema>;

/**
 * Character races — matches characterRaces array from CharacterCreation.js.
 */
export const characterRaceSchema = z.enum([
  "Human",
  "Dwarf",
  "Elf",
  "Halfling",
  "Dragonborn",
  "Gnome",
  "Half-Elf",
  "Half-Orc",
  "Tiefling",
]);

export type CharacterRace = z.infer<typeof characterRaceSchema>;

/**
 * Character classes — matches characterClasses array from CharacterCreation.js.
 */
export const characterClassSchema = z.enum([
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
]);

export type CharacterClass = z.infer<typeof characterClassSchema>;

/**
 * Alignment options — matches alignmentOptions array from CharacterCreation.js.
 * Note: "True Neutral" and "Neutral" both appear in the codebase.
 * The Druid template uses "Neutral" while the alignment selector uses "True Neutral".
 * We accept both for backward compatibility.
 */
export const characterAlignmentSchema = z.enum([
  "Lawful Good",
  "Neutral Good",
  "Chaotic Good",
  "Lawful Neutral",
  "True Neutral",
  "Neutral",
  "Chaotic Neutral",
  "Lawful Evil",
  "Neutral Evil",
  "Chaotic Evil",
]);

export type CharacterAlignment = z.infer<typeof characterAlignmentSchema>;

/**
 * Full character schema — matches the newCharacter object from CharacterCreation.js handleSubmit.
 * Also matches the characterstable schema from server.js.
 *
 * Fields ported exactly from:
 *   characterId: characterToEdit?.characterId || uuidv4()
 *   characterName: characterName
 *   characterGender: selectedGender
 *   profilePicture: selectedProfilePicture
 *   characterRace: selectedRace
 *   characterClass: selectedClass
 *   characterLevel: level
 *   characterBackground: characterBackground
 *   characterAlignment: alignment
 *   stats: stats
 */
export const characterSchema = z.object({
  characterId: z.string().min(1),
  characterName: z.string().min(1).max(50),
  characterGender: characterGenderSchema,
  profilePicture: profilePictureSchema,
  characterRace: characterRaceSchema,
  characterClass: characterClassSchema,
  characterLevel: z.number().int().min(1).max(20),
  characterBackground: z.string().min(1).max(200),
  characterAlignment: characterAlignmentSchema,
  stats: characterStatsSchema,
});

export type Character = z.infer<typeof characterSchema>;
