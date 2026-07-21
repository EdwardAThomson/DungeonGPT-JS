// pregenHeroes.js
// Ready-made level-1 heroes offered on the party-selection page (and, later, the
// home-page Quick Start). An authored set with fixed names and portraits so they
// read as characters to choose, not dice rolls. All pregens are human (the race
// selector is hidden and human-only). Stats and alignment come from the class
// templates in heroData, so every pregen passes point-buy validation by
// construction; pregenHeroes.test.js enforces that.

import { v4 as uuidv4 } from "uuid";
import { heroTemplates } from "./heroData";

export const PREGEN_HEROES = [
  {
    heroName: "Marius Winterbourne",
    heroClass: "Fighter",
    heroGender: "Male",
    profilePicture: "assets/characters/fighter.webp",
    tagline: "Steadfast blade, front and center",
    heroBackground:
      "A steadfast blade who holds the front line. Disciplined, dependable, and first through the door.",
  },
  {
    heroName: "Rowena Thornwood",
    heroClass: "Ranger",
    heroGender: "Female",
    profilePicture: "assets/characters/female_ranger.webp",
    tagline: "Bow, tracking, a sharp eye",
    heroBackground:
      "A huntress more at home under open sky than any roof. Bow, tracking, and a sharp eye for trouble.",
  },
  {
    heroName: "Alden Raven",
    heroClass: "Wizard",
    heroGender: "Male",
    profilePicture: "assets/characters/wizard.webp",
    tagline: "Arcane fire and old secrets",
    heroBackground:
      "A scholar of arcane fire and old secrets, forever one page away from something dangerous.",
  },
  {
    heroName: "Dahlia Summerfield",
    heroClass: "Paladin",
    heroGender: "Female",
    profilePicture: "assets/characters/female_paladin.webp",
    tagline: "Oath, shield, and holy light",
    heroBackground:
      "Sworn to oath, shield, and holy light. Her word is her armor, and she keeps both polished.",
  },
];

// Build a full, saveable hero from a pregen entry. Mints a fresh heroId per call
// so re-adding after a delete never collides with an old roster row.
export const buildPregenHero = (pregen) => {
  const template = heroTemplates[pregen.heroClass];
  return {
    heroId: uuidv4(),
    heroName: pregen.heroName,
    heroGender: pregen.heroGender,
    profilePicture: pregen.profilePicture,
    heroRace: "Human",
    heroClass: pregen.heroClass,
    heroLevel: 1,
    heroBackground: pregen.heroBackground,
    heroAlignment: template.alignment,
    stats: { ...template.stats },
  };
};
