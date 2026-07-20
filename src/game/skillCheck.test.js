import {
  canonicalSkill, canonicalTier, parseCheckMarker, resolveSkillCheck,
  formatCheckRollLine, formatCheckResultForPrompt, DEFAULT_CHECK_TIER,
} from './skillCheck';

describe('canonicalSkill', () => {
  it('accepts canonical skill names case-insensitively', () => {
    expect(canonicalSkill('Persuasion')).toBe('Persuasion');
    expect(canonicalSkill('stealth')).toBe('Stealth');
  });
  it('maps common verbs/synonyms to a canonical skill', () => {
    expect(canonicalSkill('persuade')).toBe('Persuasion');
    expect(canonicalSkill('sneak')).toBe('Stealth');
    expect(canonicalSkill('pick lock')).toBe('Sleight of Hand');
    expect(canonicalSkill('recall lore')).toBe('History');
  });
  it('returns null for something that is not a skill', () => {
    expect(canonicalSkill('vibes')).toBeNull();
    expect(canonicalSkill('')).toBeNull();
  });
});

describe('canonicalTier', () => {
  it('passes tier words through and defaults to medium', () => {
    expect(canonicalTier('hard')).toBe('hard');
    expect(canonicalTier(undefined)).toBe(DEFAULT_CHECK_TIER);
    expect(canonicalTier('nonsense')).toBe(DEFAULT_CHECK_TIER);
  });
  it('clamps a raw number to the NEAREST tier (no self-dealt DCs)', () => {
    expect(canonicalTier('2')).toBe('trivial');  // DC 5
    expect(canonicalTier('13')).toBe('medium');  // nearest DC 15
    expect(canonicalTier('100')).toBe('deadly'); // DC 25
  });
});

describe('parseCheckMarker', () => {
  it('parses [CHECK: skill, tier]', () => {
    expect(parseCheckMarker('...he leans in. [CHECK: Persuasion, hard]')).toMatchObject({ skill: 'Persuasion', tier: 'hard' });
  });
  it('defaults tier to medium when omitted', () => {
    expect(parseCheckMarker('[CHECK: Stealth]')).toMatchObject({ skill: 'Stealth', tier: 'medium' });
  });
  it('returns null when the skill is unrecognizable', () => {
    expect(parseCheckMarker('[CHECK: flibberty, hard]')).toBeNull();
    expect(parseCheckMarker('no marker here')).toBeNull();
  });
});

describe('resolveSkillCheck', () => {
  const hero = { level: 1, stats: { Charisma: 16 } }; // +3 stat mod, no gear/level bonus at L1

  afterEach(() => { jest.restoreAllMocks(); });

  it('a nat 20 is a critical success regardless of DC', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.9999); // rollDie(20) -> 20
    const r = resolveSkillCheck({ skill: 'Persuasion', tier: 'deadly', hero });
    expect(r.rollResult.naturalRoll).toBe(20);
    expect(r.outcomeTier).toBe('criticalSuccess');
    expect(r.success).toBe(true);
  });

  it('a nat 1 is a critical failure regardless of modifier', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0); // rollDie(20) -> 1
    const r = resolveSkillCheck({ skill: 'Persuasion', tier: 'trivial', hero });
    expect(r.rollResult.naturalRoll).toBe(1);
    expect(r.outcomeTier).toBe('criticalFailure');
    expect(r.success).toBe(false);
  });

  it('beats the DC on total (roll + modifier) for a plain success', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.6); // rollDie(20) -> 13
    const r = resolveSkillCheck({ skill: 'Persuasion', tier: 'medium', hero }); // DC 15; 13 + 3 = 16
    expect(r.dc).toBe(15);
    expect(r.rollResult.total).toBe(16);
    expect(r.outcomeTier).toBe('success');
  });

  it('misses the DC for a failure', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.35); // rollDie(20) -> 8
    const r = resolveSkillCheck({ skill: 'Persuasion', tier: 'hard', hero }); // DC 20; 8 + 3 = 11
    expect(r.outcomeTier).toBe('failure');
    expect(r.success).toBe(false);
  });

  it('adds the party support bonus to the roll', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.6); // 13
    const r = resolveSkillCheck({ skill: 'Persuasion', tier: 'medium', hero, supportBonus: 2 });
    expect(r.rollResult.total).toBe(13 + 3 + 2);
    expect(r.supportBonus).toBe(2);
  });
});

describe('presentation', () => {
  const r = { skill: 'Persuasion', tier: 'hard', dc: 20, heroModifier: 3, supportBonus: 1,
    outcomeTier: 'failure', success: false, rollResult: { total: 12, naturalRoll: 8 } };
  it('roll line shows skill, DC, total and verdict', () => {
    const line = formatCheckRollLine(r, 'Aria');
    expect(line).toContain('Persuasion');
    expect(line).toContain('DC 20');
    expect(line).toContain('12');
    expect(line).toContain('FAILURE');
  });
  it('result-for-prompt carries the anti-retry guidance on a failure', () => {
    const fact = formatCheckResultForPrompt(r);
    expect(fact).toMatch(/CHECK RESULT/);
    expect(fact).toMatch(/FAILURE/);
    expect(fact.toLowerCase()).toMatch(/stands/);
  });
});

describe('#83 Phase 2 — lock ledger', () => {
  const { normalizeTarget, locationKey, isCheckLocked, addCheckLock, retainLocationLocks, formatActiveLocksForPrompt } = require('./skillCheck');

  it('parses an optional target and normalizes it', () => {
    expect(parseCheckMarker('[CHECK: Persuasion, hard, the Gate Captain]')).toMatchObject({ skill: 'Persuasion', tier: 'hard', target: 'gate captain' });
    expect(parseCheckMarker('[CHECK: Stealth]').target).toBe('');
    expect(normalizeTarget('The  Old   Warden')).toBe('old warden');
  });

  it('builds a location key for town / site / world', () => {
    expect(locationKey({ isInsideTown: true, townName: 'Briar' })).toBe('town:Briar');
    expect(locationKey({ isInsideSite: true, siteName: 'Echo Hollow' })).toBe('site:Echo Hollow');
    expect(locationKey({})).toBe('world');
  });

  it('locks a (location, target, skill) and is idempotent', () => {
    const e = { location: 'town:Briar', target: 'captain', skill: 'Persuasion' };
    let locks = addCheckLock([], e);
    expect(isCheckLocked(locks, e)).toBe(true);
    expect(addCheckLock(locks, e)).toBe(locks); // idempotent -> same ref
    // a different target or skill is NOT locked
    expect(isCheckLocked(locks, { ...e, target: 'merchant' })).toBe(false);
    expect(isCheckLocked(locks, { ...e, skill: 'Intimidation' })).toBe(false);
  });

  it('caps the ledger, dropping oldest', () => {
    let locks = [];
    for (let i = 0; i < 45; i++) locks = addCheckLock(locks, { location: `town:T${i}`, target: '', skill: 'Persuasion' }, 40);
    expect(locks.length).toBe(40);
    expect(locks[0].location).toBe('town:T5'); // first 5 dropped
  });

  it('retains only the entered location\'s locks (a different place clears the rest)', () => {
    const locks = [
      { location: 'town:A', target: '', skill: 'Persuasion' },
      { location: 'town:B', target: '', skill: 'Stealth' },
    ];
    const afterEnterB = retainLocationLocks(locks, 'town:B');
    expect(afterEnterB).toEqual([{ location: 'town:B', target: '', skill: 'Stealth' }]);
    // re-entering the SAME place keeps its own locks (no reset)
    expect(retainLocationLocks(locks, 'town:A')).toEqual([{ location: 'town:A', target: '', skill: 'Persuasion' }]);
    // nothing to drop -> same ref
    const onlyB = [{ location: 'town:B', target: '', skill: 'Stealth' }];
    expect(retainLocationLocks(onlyB, 'town:B')).toBe(onlyB);
  });

  it('formats only the current location\'s spent approaches for the prompt', () => {
    const locks = [
      { location: 'town:A', target: 'captain', skill: 'Persuasion' },
      { location: 'town:B', target: '', skill: 'Stealth' },
    ];
    const line = formatActiveLocksForPrompt(locks, 'town:A');
    expect(line).toContain('Persuasion vs captain');
    expect(line).not.toContain('Stealth');
    expect(formatActiveLocksForPrompt(locks, 'town:C')).toBe('');
  });
});
