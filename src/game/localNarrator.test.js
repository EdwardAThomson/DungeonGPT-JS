import { composeLocalMovementNarrative, composeLocalAmbientNarrative, composeNpcMeeting, __test__ } from './localNarrator';

const plainsTile = { biome: 'plains', poi: null, x: 3, y: 4, descriptionSeed: 'Open fields' };
const desertTile = { biome: 'desert', poi: null, x: 3, y: 4, descriptionSeed: 'Open desert' };
const snowTile = { biome: 'snow', poi: null, x: 3, y: 4 };
const forestTile = { biome: 'plains', poi: 'forest', x: 3, y: 4, descriptionSeed: 'Dense woods' };
const townTile = { biome: 'plains', poi: 'town', townName: 'Greywater', townSize: 'town', x: 3, y: 4 };

describe('composeLocalMovementNarrative', () => {
  describe('determinism', () => {
    it('produces identical text for the same tile + seed', () => {
      const a = composeLocalMovementNarrative({ tile: plainsTile, coords: { x: 3, y: 4 }, worldSeed: 12345 });
      const b = composeLocalMovementNarrative({ tile: plainsTile, coords: { x: 3, y: 4 }, worldSeed: 12345 });
      expect(a).toBe(b);
      expect(a.length).toBeGreaterThan(0);
    });

    it('is stable across many repeated calls (reload reproduces the log)', () => {
      const first = composeLocalMovementNarrative({ tile: forestTile, coords: { x: 3, y: 4 }, worldSeed: 'seed-abc' });
      for (let i = 0; i < 25; i++) {
        expect(composeLocalMovementNarrative({ tile: forestTile, coords: { x: 3, y: 4 }, worldSeed: 'seed-abc' })).toBe(first);
      }
    });

    it('varies text by coordinates and by seed', () => {
      const base = composeLocalMovementNarrative({ tile: plainsTile, coords: { x: 3, y: 4 }, worldSeed: 1 });
      const otherCoord = composeLocalMovementNarrative({ tile: { ...plainsTile, x: 7, y: 1 }, coords: { x: 7, y: 1 }, worldSeed: 1 });
      const otherSeed = composeLocalMovementNarrative({ tile: plainsTile, coords: { x: 3, y: 4 }, worldSeed: 999 });
      // At least one of the variations should differ (pools are deep enough).
      expect(base === otherCoord && base === otherSeed).toBe(false);
    });

    it('does not produce immediate "You enter the forest. You enter the forest." repetition across a session', () => {
      // Traverse several distinct tiles; first-visit openings should not all be identical.
      const openings = new Set();
      for (let x = 0; x < 8; x++) {
        const text = composeLocalMovementNarrative({
          tile: { ...forestTile, x, y: 0 },
          coords: { x, y: 0 },
          worldSeed: 42
        });
        openings.add(text.split(' *')[0]);
      }
      expect(openings.size).toBeGreaterThan(1);
    });
  });

  describe('biome-awareness', () => {
    it('produces different prose for desert vs snow vs plains', () => {
      const seed = 7;
      const coords = { x: 2, y: 2 };
      const plains = composeLocalMovementNarrative({ tile: { ...plainsTile, ...coords }, coords, worldSeed: seed });
      const desert = composeLocalMovementNarrative({ tile: { ...desertTile, ...coords }, coords, worldSeed: seed });
      const snow = composeLocalMovementNarrative({ tile: { ...snowTile, ...coords }, coords, worldSeed: seed });
      expect(plains).not.toBe(desert);
      expect(desert).not.toBe(snow);
      expect(plains).not.toBe(snow);
    });

    it('uses desert vocabulary for desert tiles and cold vocabulary for snow tiles', () => {
      // Sample across coordinates so we exercise the whole pool, not one seeded pick.
      let desertText = '';
      let snowText = '';
      for (let x = 0; x < 6; x++) {
        desertText += ' ' + composeLocalMovementNarrative({ tile: { biome: 'desert', poi: null, x, y: 0 }, coords: { x, y: 0 }, worldSeed: 5 });
        snowText += ' ' + composeLocalMovementNarrative({ tile: { biome: 'snow', poi: null, x, y: 0 }, coords: { x, y: 0 }, worldSeed: 5 });
      }
      expect(desertText.toLowerCase()).toMatch(/sand|dune|desert|heat/);
      expect(snowText.toLowerCase()).toMatch(/snow|frozen|cold|ice|frost/);
    });

    it('maps forest POI to woodland prose and names towns', () => {
      const woods = composeLocalMovementNarrative({ tile: forestTile, coords: { x: 3, y: 4 }, worldSeed: 3 });
      expect(woods.toLowerCase()).toMatch(/wood|tree|forest|canopy/);
      const town = composeLocalMovementNarrative({ tile: townTile, coords: { x: 3, y: 4 }, worldSeed: 3 });
      expect(town).toContain('Greywater');
    });

    it('resolveTerrainKey collapses biome + poi correctly', () => {
      const { resolveTerrainKey } = __test__;
      expect(resolveTerrainKey({ biome: 'plains', poi: 'forest' })).toBe('woodland');
      expect(resolveTerrainKey({ biome: 'plains', poi: 'mountain' })).toBe('mountain');
      expect(resolveTerrainKey({ biome: 'plains', poi: 'town' })).toBe('town');
      expect(resolveTerrainKey({ biome: 'desert', poi: null })).toBe('desert');
      expect(resolveTerrainKey({ biome: 'water', poi: null })).toBe('water');
      expect(resolveTerrainKey({ biome: 'unknown', poi: null })).toBe('plains');
      expect(resolveTerrainKey(null)).toBe('plains');
    });
  });

  describe('first-visit vs revisit', () => {
    it('yields different prose for a new area vs a revisit', () => {
      const fresh = composeLocalMovementNarrative({ tile: plainsTile, coords: { x: 3, y: 4 }, worldSeed: 8, isNewArea: true });
      const again = composeLocalMovementNarrative({ tile: plainsTile, coords: { x: 3, y: 4 }, worldSeed: 8, isNewArea: false });
      expect(fresh).not.toBe(again);
    });
  });

  describe('party state', () => {
    it('adds a wounded clause when the party is hurt', () => {
      const healthy = composeLocalMovementNarrative({
        tile: plainsTile, coords: { x: 1, y: 1 }, worldSeed: 4,
        selectedHeroes: [{ currentHP: 100, maxHP: 100 }]
      });
      const hurt = composeLocalMovementNarrative({
        tile: plainsTile, coords: { x: 1, y: 1 }, worldSeed: 4,
        selectedHeroes: [{ currentHP: 5, maxHP: 100 }]
      });
      expect(hurt).not.toBe(healthy);
      expect(hurt.length).toBeGreaterThan(healthy.length);
    });
  });

  describe('neighbour landmarks', () => {
    it('mentions a notable neighbouring tile', () => {
      const worldMap = [
        [{ biome: 'plains', poi: null }, { biome: 'plains', poi: null }, { biome: 'plains', poi: null }],
        [{ biome: 'plains', poi: null }, { biome: 'plains', poi: null }, { biome: 'plains', poi: 'mountain' }],
        [{ biome: 'plains', poi: null }, { biome: 'plains', poi: null }, { biome: 'plains', poi: null }]
      ];
      // center tile (1,1) has a mountain to the east (2,1)
      const text = composeLocalMovementNarrative({
        tile: { biome: 'plains', poi: null, x: 1, y: 1 },
        coords: { x: 1, y: 1 },
        worldSeed: 11,
        worldMap
      });
      expect(text.toLowerCase()).toContain('mountains rise to the east');
    });
  });

  describe('markdown + no leaked markers', () => {
    const samples = [plainsTile, desertTile, snowTile, forestTile, townTile];

    it('never uses underscore-italics, only *asterisks*', () => {
      samples.forEach((tile) => {
        for (let x = 0; x < 5; x++) {
          const text = composeLocalMovementNarrative({ tile: { ...tile, x, y: 0 }, coords: { x, y: 0 }, worldSeed: 2 });
          // No underscore-delimited emphasis like _word_
          expect(text).not.toMatch(/_[^_\s][^_]*_/);
        }
      });
    });

    it('uses asterisk italics for ambient flavour', () => {
      const text = composeLocalMovementNarrative({ tile: plainsTile, coords: { x: 3, y: 4 }, worldSeed: 12345 });
      expect(text).toMatch(/\*[^*]+\*/);
    });

    it('does not leak any AI/prompt markers', () => {
      const markers = [
        'STRICT DUNGEON MASTER PROTOCOL', '[TASK]', 'Game Context:', 'Story summary',
        'descriptionSeed', 'COMPLETE_MILESTONE', 'DM_PROTOCOL', 'undefined', 'null'
      ];
      samples.forEach((tile) => {
        for (let x = 0; x < 5; x++) {
          const text = composeLocalMovementNarrative({ tile: { ...tile, x, y: 0 }, coords: { x, y: 0 }, worldSeed: 6 });
          markers.forEach((m) => expect(text).not.toContain(m));
        }
      });
    });
  });

  it('returns an empty string for a missing tile', () => {
    expect(composeLocalMovementNarrative({ tile: null })).toBe('');
    expect(composeLocalMovementNarrative({})).toBe('');
  });
});

describe('composeLocalAmbientNarrative (Look-around, no-AI path)', () => {
  it('is deterministic for the same tile + seed + nonce', () => {
    const a = composeLocalAmbientNarrative({ tile: plainsTile, coords: { x: 3, y: 4 }, worldSeed: 12345, nonce: 0 });
    const b = composeLocalAmbientNarrative({ tile: plainsTile, coords: { x: 3, y: 4 }, worldSeed: 12345, nonce: 0 });
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('varies across nonces so repeated looks at one tile differ', () => {
    const texts = new Set();
    for (let n = 0; n < 6; n++) {
      texts.add(composeLocalAmbientNarrative({ tile: plainsTile, coords: { x: 3, y: 4 }, worldSeed: 7, nonce: n }));
    }
    expect(texts.size).toBeGreaterThan(1);
  });

  it('is biome-aware (desert vs snow vocabulary)', () => {
    let desertText = '';
    let snowText = '';
    for (let n = 0; n < 6; n++) {
      desertText += ' ' + composeLocalAmbientNarrative({ tile: desertTile, coords: { x: 1, y: 1 }, worldSeed: 5, nonce: n });
      snowText += ' ' + composeLocalAmbientNarrative({ tile: snowTile, coords: { x: 1, y: 1 }, worldSeed: 5, nonce: n });
    }
    expect(desertText.toLowerCase()).toMatch(/sand|dune|desert|heat|vulture/);
    expect(snowText.toLowerCase()).toMatch(/snow|frozen|cold|ice|frost|wind/);
  });

  it('uses asterisk italics and never underscore-italics', () => {
    for (let n = 0; n < 5; n++) {
      const text = composeLocalAmbientNarrative({ tile: forestTile, coords: { x: 2, y: 2 }, worldSeed: 9, nonce: n });
      expect(text).toMatch(/\*[^*]+\*/);
      expect(text).not.toMatch(/_[^_\s][^_]*_/);
    }
  });

  it('mentions a notable neighbouring tile', () => {
    const worldMap = [
      [{ biome: 'plains', poi: null }, { biome: 'plains', poi: null }, { biome: 'plains', poi: null }],
      [{ biome: 'plains', poi: null }, { biome: 'plains', poi: null }, { biome: 'plains', poi: 'mountain' }],
      [{ biome: 'plains', poi: null }, { biome: 'plains', poi: null }, { biome: 'plains', poi: null }]
    ];
    const text = composeLocalAmbientNarrative({
      tile: { biome: 'plains', poi: null, x: 1, y: 1 },
      coords: { x: 1, y: 1 },
      worldSeed: 11,
      worldMap
    });
    expect(text.toLowerCase()).toContain('mountains rise to the east');
  });

  it('returns an empty string for a missing tile', () => {
    expect(composeLocalAmbientNarrative({ tile: null })).toBe('');
    expect(composeLocalAmbientNarrative({})).toBe('');
  });
});

describe('composeNpcMeeting', () => {
  const ulric = {
    name: 'Captain Ulric',
    role: 'Guard',
    building: 'Briarwood Militia Hall',
    townName: 'Briarwood',
    personality: 'gruff, practical, protective of his people',
    worldSeed: 12345
  };

  it('is deterministic for the same seed + npc', () => {
    const a = composeNpcMeeting(ulric);
    const b = composeNpcMeeting(ulric);
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('names the NPC in bold and mentions the building', () => {
    const text = composeNpcMeeting(ulric);
    expect(text).toContain('**Captain Ulric**');
    expect(text).toContain('Briarwood Militia Hall');
  });

  it('renders the personality as an italic asterisk clause (never underscores)', () => {
    const text = composeNpcMeeting(ulric);
    expect(text).toContain('*Gruff, practical, protective of his people.*');
    expect(text).not.toMatch(/_[^_\s][^_]*_/);
  });

  it('never doubles the article on building names that already start with "The"', () => {
    const text = composeNpcMeeting({ ...ulric, building: 'The Crooked Pint' });
    expect(text).toContain('The Crooked Pint');
    expect(text).not.toMatch(/the The/);
  });

  it('falls back to the town name, then a generic hall, when no building is given', () => {
    const noBuilding = composeNpcMeeting({ ...ulric, building: null });
    expect(noBuilding).toContain('Briarwood');
    const bare = composeNpcMeeting({ name: 'Someone', worldSeed: 1 });
    expect(bare).toContain('**Someone**');
    expect(bare.length).toBeGreaterThan(0);
  });

  it('returns an empty string without a name', () => {
    expect(composeNpcMeeting({})).toBe('');
    expect(composeNpcMeeting()).toBe('');
  });
});
