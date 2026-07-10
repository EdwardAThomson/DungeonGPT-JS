import { describe, it, expect } from "vitest";
import { validateHeroName, sanitizeHeroName, HERO_NAME_MAX } from "../src/services/validation";

describe("worker validateHeroName - safe names", () => {
  const valid = ["Aelin", "Aelin Ashryver", "O'Brien", "Jean-Luc", "Renée", "Björn"];
  it.each(valid)("accepts %p", (name) => {
    expect(validateHeroName(name).valid).toBe(true);
  });

  it("returns the sanitized (trimmed) name", () => {
    expect(validateHeroName("  Aelin  ")).toEqual({ valid: true, name: "Aelin", reason: null });
  });
});

describe("worker validateHeroName - unsafe names rejected", () => {
  const rejected = [
    "Robert'); DROP TABLE heroes;--",
    'Bobby "Tables"',
    "1 OR '1'='1",
    "<script>alert(1)</script>",
    "admin=1",
    "back\\slash",
    "paren(theses)",
    "a", // too short
    "x".repeat(HERO_NAME_MAX + 1), // too long
  ];
  it.each(rejected)("rejects %p", (name) => {
    expect(validateHeroName(name).valid).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(validateHeroName(undefined).valid).toBe(false);
    expect(validateHeroName(null).valid).toBe(false);
    expect(validateHeroName(1234).valid).toBe(false);
  });
});

describe("worker sanitizeHeroName", () => {
  it("collapses whitespace and trims", () => {
    expect(sanitizeHeroName("  a   b ")).toBe("a b");
  });
});
