/**
 * Story templates — predefined campaign presets.
 *
 * Ported from src/data/storyTemplates.js — zero changes to data values.
 */

import type { Milestone } from "@dungeongpt/shared";

export interface StoryTemplate {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly description: string;
  readonly customNames: {
    readonly towns: readonly string[];
    readonly mountains: readonly string[];
  };
  readonly settings: {
    readonly shortDescription: string;
    readonly campaignGoal: string;
    readonly milestones: readonly Milestone[];
    readonly grimnessLevel: string;
    readonly darknessLevel: string;
    readonly magicLevel: string;
    readonly technologyLevel: string;
    readonly responseVerbosity: string;
  };
}

export const storyTemplates: readonly StoryTemplate[] = [
  {
    id: "heroic-fantasy",
    name: "Heroic Fantasy",
    icon: "\u2694\uFE0F",
    description:
      "A classic tale of heroes, magic, and clear conflicts between good and evil.",
    customNames: {
      towns: ["Eldoria", "Sunfire", "Oakhaven", "Silverton"],
      mountains: ["Cinder Mountains"],
    },
    settings: {
      shortDescription:
        "In the kingdom of Eldoria, light-hearted adventurers set out to recover the lost Crown of Sunfire and unite the shattered provinces against a rising darkness.",
      campaignGoal:
        "Recover the Crown of Sunfire and defeat the Shadow Overlord to restore peace to Eldoria.",
      milestones: [
        {
          text: "Find the hidden map in the archives of Oakhaven.",
          location: "Oakhaven",
        },
        {
          text: "Convince the Silver Guard to join the resistance.",
          location: "Silverton",
        },
        {
          text: "Locate the Sunfire Vault deep within the Cinder Mountains.",
          location: "Cinder Mountains",
        },
      ],
      grimnessLevel: "Noble",
      darknessLevel: "Bright",
      magicLevel: "High Magic",
      technologyLevel: "Medieval",
      responseVerbosity: "Descriptive",
    },
  },
  {
    id: "grimdark-survival",
    name: "Grimdark Survival",
    icon: "\uD83D\uDC80",
    description:
      "A bleak world where survival is the only victory and every choice has a price.",
    customNames: {
      towns: ["Rotfall", "Ironhold", "Shadow-Crest", "Pale-Reach"],
      mountains: ["Blightspine Ridge"],
    },
    settings: {
      shortDescription:
        "The empire has fallen to the rot. Survivors huddle in the ruins of once-great cities, fighting for scraps while monsters\u2014both human and otherwise\u2014prowl the shadows.",
      campaignGoal:
        "Secure a safe haven from the rot and find a permanent way to cleanse the spreading plague.",
      milestones: [
        {
          text: "Establish a fortified camp in the ruins of Ironhold.",
          location: "Ironhold",
        },
        {
          text: "Capture a mutated specimen for the alchemist at Pale-Reach.",
          location: "Pale-Reach",
        },
        {
          text: "Destroy the Rot-Heart growing in the depths of Rotfall.",
          location: "Rotfall",
        },
      ],
      grimnessLevel: "Grim",
      darknessLevel: "Dark",
      magicLevel: "Low Magic",
      technologyLevel: "Medieval",
      responseVerbosity: "Concise",
    },
  },
  {
    id: "arcane-renaissance",
    name: "Arcane Renaissance",
    icon: "\uD83D\uDD2E",
    description:
      "A world of booming industry, discovery, and the dangerous fusion of magic and machine.",
    customNames: {
      towns: ["Novaris", "Aether-Gate", "Steam-Wharf", "Cog-Hill"],
      mountains: ["Ironpeak Range"],
    },
    settings: {
      shortDescription:
        "The discovery of Aether-Steam has transformed the city of Novaris. Alchemists and engineers work side-by-side, but the old gods are not pleased with the noise of progress.",
      campaignGoal:
        "Uncover the conspiracy behind the Aether-Steam accidents and prevent the awakening of the Old Gods.",
      milestones: [
        {
          text: "Investigate the explosion at the Cog-Hill foundry.",
          location: "Cog-Hill",
        },
        {
          text: "Retrieve the stolen blueprints from the Aether-Gate syndicate.",
          location: "Aether-Gate",
        },
        {
          text: "Consult the Oracle of Steam in the depths of the Steam-Wharf.",
          location: "Steam-Wharf",
        },
      ],
      grimnessLevel: "Neutral",
      darknessLevel: "Grey",
      magicLevel: "Arcane Tech",
      technologyLevel: "Renaissance",
      responseVerbosity: "Moderate",
    },
  },
  {
    id: "eldritch-horror",
    name: "Eldritch Horror",
    icon: "\uD83D\uDC19",
    description:
      "Mystery and dread in a world where gods are uncaring and knowledge is a burden.",
    customNames: {
      towns: ["Blackwood", "Whisper-Cove", "Mourn-Peak", "Abyssal-Rest"],
      mountains: ["Mourn-Peak Heights"],
    },
    settings: {
      shortDescription:
        "In the mist-shrouded town of Blackwood, the stars have aligned. Unspeakable entities stir in the depths, and those who seek the truth often lose their minds before they find it.",
      campaignGoal:
        "Seal the Abyssal Breach and prevent the Great Dreamer from awakening.",
      milestones: [
        {
          text: "Decode the ritual text found in the Blackwood library.",
          location: "Blackwood",
        },
        {
          text: "Cleanse the corrupted lighthouse at Whisper-Cove.",
          location: "Whisper-Cove",
        },
        {
          text: "Survive a vision of the Void at the summit of Mourn-Peak.",
          location: "Mourn-Peak",
        },
      ],
      grimnessLevel: "Bleak",
      darknessLevel: "Dark",
      magicLevel: "Low Magic",
      technologyLevel: "Industrial",
      responseVerbosity: "Descriptive",
    },
  },
];
