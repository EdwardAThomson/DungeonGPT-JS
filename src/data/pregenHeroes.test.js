// Content-integrity guard for the ready-made hero set: every pregen must build
// into a hero that passes full creation-time validation (structure + point-buy),
// with a real portrait matching its gender. A pregen failing here would render a
// broken card or a hero the Start Game gate rejects.

import { PREGEN_HEROES, buildPregenHero } from "./pregenHeroes";
import { profilePictures } from "./heroData";
import { validateHero } from "../game/heroValidation";

describe("pregen heroes", () => {
  test.each(PREGEN_HEROES.map((p) => [p.heroName, p]))(
    "%s builds a fully valid hero",
    (_name, pregen) => {
      const hero = buildPregenHero(pregen);
      const { valid, reasons } = validateHero(hero, { enforcePointBuy: true });
      expect(reasons).toEqual([]);
      expect(valid).toBe(true);
      expect(hero.heroRace).toBe("Human");
      expect(hero.heroLevel).toBe(1);
    }
  );

  test("every portrait exists in profilePictures and matches the pregen's gender", () => {
    for (const pregen of PREGEN_HEROES) {
      const pic = profilePictures.find((p) => p.src === pregen.profilePicture);
      expect(pic).toBeDefined();
      expect(pic.gender).toBe(pregen.heroGender);
    }
  });

  test("pregen names are unique (names double as the shown-or-hidden key on HeroSelection)", () => {
    const names = PREGEN_HEROES.map((p) => p.heroName);
    expect(new Set(names).size).toBe(names.length);
  });

  test("each build mints a fresh heroId", () => {
    const a = buildPregenHero(PREGEN_HEROES[0]);
    const b = buildPregenHero(PREGEN_HEROES[0]);
    expect(a.heroId).not.toBe(b.heroId);
  });
});
