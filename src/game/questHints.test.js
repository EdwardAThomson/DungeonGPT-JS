import {
  describeItemSources,
  describeTurnInTarget,
  formatStepProgress,
  getStepHint,
  isQuestReadyToTurnIn
} from './questHints';

describe('describeItemSources (derived from live game data)', () => {
  it('knows healing_herbs come from the wilds, sites, and the apothecary', () => {
    const s = describeItemSources('healing_herbs').toLowerCase();
    expect(s).toContain('wilds');       // encounter drops (herb_gathering etc.)
    expect(s).toContain('sites');       // forest/hills LOOT pools
    expect(s).toContain('apothecary');  // shopStock.apothecary
  });

  it('knows shop-only items', () => {
    // scale_mail is blacksmith stock but not encounter/site loot
    const s = describeItemSources('scale_mail').toLowerCase();
    expect(s).toContain('blacksmith');
  });

  it('returns empty for unknown items rather than guessing', () => {
    expect(describeItemSources('no_such_item_xyz')).toBe('');
    expect(describeItemSources(null)).toBe('');
  });

  // Issue #49: these hints used to lie — the pools they described never rolled because
  // populateSite coerced every non-ruins site to 'cave'. Now the described sources are real.
  it('hide_armor points at forest/hills sites, where it now actually drops', () => {
    expect(describeItemSources('hide_armor')).toBe('In forest or hills sites');
  });

  it('ring_protection points at ruins sites (its single hoard path)', () => {
    expect(describeItemSources('ring_protection')).toBe('In ruins sites');
  });

  it('dragonscale_plate points at the wilds (Dragon\'s Lair encounter drop)', () => {
    expect(describeItemSources('dragonscale_plate')).toBe('Found in the wilds');
  });
});

describe('describeTurnInTarget', () => {
  it('labels single buildings and arrays', () => {
    expect(describeTurnInTarget('townhall')).toBe('the town hall');
    expect(describeTurnInTarget(['inn', 'tavern'])).toBe('an inn or a tavern');
  });
  it('tolerates unknown buildings and missing input', () => {
    expect(describeTurnInTarget('watchtower')).toBe('the watchtower');
    expect(describeTurnInTarget(null)).toBe('');
  });
});

describe('formatStepProgress', () => {
  it('shows progress for counted steps only', () => {
    expect(formatStepProgress({ trigger: { enemy: 'any', count: 3 }, progress: 1 })).toBe(' (1/3)');
    expect(formatStepProgress({ trigger: { enemy: 'any', count: 3 } })).toBe(' (0/3)');
    expect(formatStepProgress({ trigger: { item: 'x' } })).toBe('');
    expect(formatStepProgress(null)).toBe('');
  });
  it('caps display at the threshold', () => {
    expect(formatStepProgress({ trigger: { count: 3 }, progress: 7 })).toBe(' (3/3)');
  });
});

describe('getStepHint', () => {
  const quest = (steps) => ({ status: 'active', milestones: steps });

  it('site steps point at the revealed map site', () => {
    const step = { site: { type: 'cave' }, trigger: { item: 'silver_locket' }, completed: false };
    expect(getStepHint(step)).toBe('In a cave — marked on your world map');
  });

  it('open bounties say any victory counts', () => {
    expect(getStepHint({ trigger: { enemy: 'any', count: 3 }, completed: false })).toBe('Any victory in the wilds counts');
  });

  it('gather steps derive their sources', () => {
    const hint = getStepHint({ trigger: { item: 'healing_herbs', count: 3 }, completed: false });
    expect(hint.toLowerCase()).toContain('apothecary');
  });

  it('turn-in steps show the target, and readiness once prerequisites complete', () => {
    const obj = { id: 'a', trigger: { item: 'x' }, completed: false };
    const turnin = { id: 'b', trigger: { turnIn: { building: ['inn', 'tavern'] } }, requires: ['a'], completed: false };
    expect(getStepHint(turnin, quest([obj, turnin]))).toBe('Return to an inn or a tavern');
    const done = { ...obj, completed: true };
    expect(getStepHint(turnin, quest([done, turnin]))).toBe('✅ Ready — return to an inn or a tavern');
  });

  it('completed steps get no hint', () => {
    expect(getStepHint({ site: { type: 'cave' }, completed: true })).toBe('');
  });
});

describe('isQuestReadyToTurnIn', () => {
  const mk = (objDone) => ({
    status: 'active',
    milestones: [
      { id: 'a', trigger: { item: 'x' }, completed: objDone },
      { id: 'b', trigger: { turnIn: { building: 'inn' } }, requires: ['a'], completed: false }
    ]
  });

  it('is true only once the objective is done and the turn-in is pending', () => {
    expect(isQuestReadyToTurnIn(mk(false))).toBe(false);
    expect(isQuestReadyToTurnIn(mk(true))).toBe(true);
  });

  it('is false for completed/available quests and bad input', () => {
    expect(isQuestReadyToTurnIn({ ...mk(true), status: 'completed' })).toBe(false);
    expect(isQuestReadyToTurnIn({ ...mk(true), status: 'available' })).toBe(false);
    expect(isQuestReadyToTurnIn(null)).toBe(false);
  });
});
