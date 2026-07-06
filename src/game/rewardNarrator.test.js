// #8 (de-scoped): the flat "+50 XP, +12 gold" system lines become seeded templated
// sentences. Pins the contract: fully deterministic (content-seeded, no
// Math.random), the reward DATA always survives into the prose verbatim, and the
// machine-formatted messages other code parses pass through untouched when
// unrecognised (level-ups, healing).

import {
  composeRewardSentence,
  composeLootSentence,
  narrateRewardMessages
} from './rewardNarrator';

describe('composeRewardSentence', () => {
  it('is deterministic: the same payout always narrates the same way', () => {
    const rewards = { xp: 50, gold: 12, items: ['Iron Sword'] };
    expect(composeRewardSentence(rewards)).toBe(composeRewardSentence({ ...rewards }));
  });

  it('never calls Math.random (seeded from content only)', () => {
    const spy = jest.spyOn(Math, 'random');
    composeRewardSentence({ xp: 50, gold: 12, items: ['Iron Sword'] });
    composeLootSentence({ gold: 30, items: ['Raw Gems'] });
    narrateRewardMessages(['+100 XP', '+5 gold']);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('keeps the data identical: every value and item name appears verbatim', () => {
    const s = composeRewardSentence({ xp: 50, gold: 12, items: ['Iron Sword', 'Healing Potion'] });
    expect(s).toContain('50 XP');
    expect(s).toContain('12 gold');
    expect(s).toContain('Iron Sword');
    expect(s).toContain('Healing Potion');
    expect(s).toMatch(/\.$/); // reads as a sentence
  });

  it('says so when the XP is party-wide (#55 milestone convention)', () => {
    expect(composeRewardSentence({ xp: 200, xpPartyWide: true })).toContain('200 XP for each party member');
    expect(composeRewardSentence({ xp: 200 })).not.toContain('each party member');
  });

  it('varies the sentence shape across different payouts', () => {
    const shapes = new Set(
      [1, 2, 3, 7, 11, 25, 40, 75, 120, 999].map((xp) => {
        const s = composeRewardSentence({ xp, gold: xp + 1 });
        return s.replace(/\d+/g, 'N'); // shape, not values
      })
    );
    expect(shapes.size).toBeGreaterThan(1);
  });

  it('returns null when there is nothing to announce', () => {
    expect(composeRewardSentence({})).toBeNull();
    expect(composeRewardSentence({ xp: 0, gold: 0, items: [] })).toBeNull();
  });
});

describe('composeLootSentence (site loot, #8)', () => {
  it('is deterministic and carries gold + item names verbatim', () => {
    const loot = { gold: 12, items: ['Iron Sword'] };
    const s = composeLootSentence(loot);
    expect(s).toBe(composeLootSentence({ ...loot }));
    expect(s).toContain('12 gold');
    expect(s).toContain('Iron Sword');
  });

  it('handles gold-only and items-only finds', () => {
    expect(composeLootSentence({ gold: 5 })).toContain('5 gold');
    expect(composeLootSentence({ items: ['Raw Gems'] })).toContain('Raw Gems');
  });

  it('returns null for an empty find (call site keeps its own fallback line)', () => {
    expect(composeLootSentence({})).toBeNull();
    expect(composeLootSentence({ gold: 0, items: [] })).toBeNull();
  });
});

describe('narrateRewardMessages (display copy over the machine messages)', () => {
  it('collapses the recognised flat entries into one sentence, data intact', () => {
    const out = narrateRewardMessages(['+100 XP to each party member', '+30 gold', 'Found: Quest Key']);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('100 XP for each party member');
    expect(out[0]).toContain('30 gold');
    expect(out[0]).toContain('Quest Key');
  });

  it('passes level-up (and other unrecognised) lines through unchanged, after the sentence', () => {
    const levelUp = 'Ara 🎉 LEVEL UP! Now level 2!';
    const out = narrateRewardMessages(['+100 XP to each party member', levelUp]);
    expect(out).toHaveLength(2);
    expect(out[1]).toBe(levelUp);
  });

  it('parses the single-hero "+N XP" / "+N gold" forms too', () => {
    const out = narrateRewardMessages(['+25 XP', '+10 gold']);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('25 XP');
    expect(out[0]).not.toContain('each party member');
    expect(out[0]).toContain('10 gold');
  });

  it('returns unrecognisable input as-is and never mutates the input array', () => {
    const input = ['💚 Fully healed to 20 HP!'];
    const out = narrateRewardMessages(input);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);

    const mixed = ['+10 XP', 'custom line'];
    narrateRewardMessages(mixed);
    expect(mixed).toEqual(['+10 XP', 'custom line']);
  });

  it('handles an empty array', () => {
    expect(narrateRewardMessages([])).toEqual([]);
    expect(narrateRewardMessages()).toEqual([]);
  });
});
