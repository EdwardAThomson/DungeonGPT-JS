import { z } from "zod";

/**
 * Grimness level — matches grimnessOptions from GameSettings.js.
 */
export const grimnessLevelSchema = z.enum(["Noble", "Neutral", "Bleak", "Grim"]);

export type GrimnessLevel = z.infer<typeof grimnessLevelSchema>;

/**
 * Darkness level — matches darknessOptions from GameSettings.js.
 */
export const darknessLevelSchema = z.enum(["Bright", "Neutral", "Grey", "Dark"]);

export type DarknessLevel = z.infer<typeof darknessLevelSchema>;

/**
 * Magic level — matches magicOptions from GameSettings.js.
 */
export const magicLevelSchema = z.enum([
  "No Magic",
  "Low Magic",
  "High Magic",
  "Arcane Tech",
]);

export type MagicLevel = z.infer<typeof magicLevelSchema>;

/**
 * Technology level — matches technologyOptions from GameSettings.js.
 */
export const technologyLevelSchema = z.enum([
  "Ancient",
  "Medieval",
  "Renaissance",
  "Industrial",
]);

export type TechnologyLevel = z.infer<typeof technologyLevelSchema>;

/**
 * Response verbosity — matches verbosityOptions from GameSettings.js.
 */
export const responseVerbositySchema = z.enum([
  "Concise",
  "Moderate",
  "Descriptive",
]);

export type ResponseVerbosity = z.infer<typeof responseVerbositySchema>;

/**
 * Milestone object — matches the milestone shape from GameSettings.js and useGameInteraction.js.
 *
 * Fields:
 *   text: milestone description
 *   location: town/mountain name or null
 *   mapX: resolved x coordinate (optional, added by resolveMilestoneCoords)
 *   mapY: resolved y coordinate (optional, added by resolveMilestoneCoords)
 *   id: milestone index (optional, added by normalizeMilestones)
 *   completed: whether milestone is done (optional, added by normalizeMilestones)
 */
export const milestoneSchema = z.object({
  text: z.string(),
  location: z.string().nullable().optional(),
  mapX: z.number().int().optional(),
  mapY: z.number().int().optional(),
  id: z.number().int().optional(),
  completed: z.boolean().optional(),
});

export type Milestone = z.infer<typeof milestoneSchema>;

/**
 * Game settings schema — matches settingsData from GameSettings.js handleSubmit
 * and the shape stored in the conversations table game_settings JSON column.
 *
 * Ported exactly from GameSettings.js lines 230-241.
 * campaignComplete added by useGameInteraction.js line 306.
 */
export const gameSettingsSchema = z.object({
  shortDescription: z.string(),
  grimnessLevel: grimnessLevelSchema.or(z.literal("")),
  darknessLevel: darknessLevelSchema.or(z.literal("")),
  magicLevel: magicLevelSchema,
  technologyLevel: technologyLevelSchema,
  responseVerbosity: responseVerbositySchema,
  campaignGoal: z.string(),
  milestones: z.array(milestoneSchema),
  worldSeed: z.union([z.number(), z.string(), z.null()]).optional(),
  templateName: z.string().optional(),
  campaignComplete: z.boolean().optional(),
});

export type GameSettings = z.infer<typeof gameSettingsSchema>;
