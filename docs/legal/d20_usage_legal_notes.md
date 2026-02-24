# d20 System Usage - Legal Notes

## Summary

DungeonGPT-JS uses d20 game mechanics (rolling a 20-sided die for checks, attacks, etc.) which are **legally safe** to use.

## Legal Analysis

### What We Can Use ✅

- **The d20 die itself** - A 20-sided die is a physical object and game component
- **d20 mechanics** - Rolling a d20 for attacks, skill checks, saving throws, etc.
- **Core game mechanics** - These are not copyrightable under U.S. law
- **The term "d20"** - When referring to the die or mechanic generically

### What We Cannot Use ❌

- **"D20 System" as a product name** - This is trademarked by Wizards of the Coast
- **Official d20 logo** - Trademarked and copyrighted by WotC
- **Specific D&D content** - Spells, monsters, settings, artwork from D&D books
- **"d20" to identify our game system** - Cannot market as "a d20 game" without OGL

## Legal Basis

### Game Mechanics Are Not Copyrightable

In the United States, **game mechanics cannot be copyrighted**. Only the specific written expression of those mechanics (rulebooks, text, artwork, character designs) are protected.

**Source:** U.S. Copyright Office - "Copyright does not protect the idea for a game, its name or title, or the method or methods for playing it."

### Trademark Considerations

Wizards of the Coast holds a **trademark** on the term "d20" when used to **identify their specific game system**, particularly in the context of Dungeons & Dragons.

**What this means:**
- ❌ Cannot name our game "D20 System"
- ❌ Cannot use the official d20 logo
- ✅ Can use "d20" to describe the die or mechanic
- ✅ Can say "uses a d20 for skill checks" in documentation

### Open Game License (OGL)

WotC provides the Open Game License which allows creators to use d20 system mechanics under specific conditions.

**For DungeonGPT-JS:** We are **NOT using the OGL** because:
1. We don't need it - we're only using generic game mechanics
2. Avoiding OGL gives us more freedom and fewer restrictions
3. Our content is original, not derived from OGL sources

## How DungeonGPT-JS Uses d20

### In Code (Internal)

```javascript
// utils/dice.js
/**
 * Performs a standard check (d20 + modifier).
 */
function rollD20Check(modifier) {
  const roll = Math.floor(Math.random() * 20) + 1;
  return roll + modifier;
}
```

**Status:** ✅ Safe - Internal code comments describing game mechanics

### In UI (User-Facing)

```javascript
// EncounterActionModal.js
(d20: {result.rollResult.naturalRoll} + modifier: {result.rollResult.modifier})
```

**Status:** ✅ Safe - Describing the die roll result to the user

### In Documentation

We describe our game as using "d20 mechanics" or "20-sided die rolls" for skill checks.

**Status:** ✅ Safe - Generic description of game mechanics

## Best Practices

### DO ✅

- Use "d20" to refer to the 20-sided die
- Use "d20 roll" or "d20 check" to describe game actions
- Implement d20-based game mechanics freely
- Use standard dice notation (1d20, 2d6, etc.)
- Describe mechanics in generic terms

### DON'T ❌

- Name the game "D20 System" or similar
- Use the official d20 logo
- Claim compatibility with "the d20 System"
- Use OGL content without including the license
- Copy specific text from D&D rulebooks

## Conclusion

**DungeonGPT-JS's use of d20 mechanics is legally sound.** We are:

1. Using generic game mechanics (not copyrightable)
2. Using "d20" as a descriptive term for the die/mechanic (not as a system identifier)
3. Not using the OGL (avoiding licensing restrictions)
4. Not using any copyrighted D&D content

**No changes needed** to our current d20 usage.

---

**References:**
- U.S. Copyright Office FAQ: https://www.copyright.gov/help/faq/
- Wizards of the Coast OGL: https://www.wizards.com/default.asp?x=d20/oglfaq/20040123f
- General game design copyright principles

**Last Updated:** 2026-02-24  
**Status:** Approved for use
