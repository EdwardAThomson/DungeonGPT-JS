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
