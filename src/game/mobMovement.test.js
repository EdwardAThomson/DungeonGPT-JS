import {
  makeMob,
  spawnMobsFromSlots,
  stepMobs,
  healMobsToIdle,
  AGGRO_RADIUS,
  DEAGGRO_RADIUS,
  LEASH_RADIUS,
  DEFAULT_MOB_SPEED,
  HUNTER_SPEED,
  FLEE_DEAGGRO_STEPS,
} from './mobMovement';

// An open, all-walkable site grid (only `wall` tiles are non-walkable in real sites).
const makeSite = (width, height) => {
  const mapData = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) row.push({ x, y, walkable: true, type: 'floor' });
    mapData.push(row);
  }
  return { mapData };
};

const site = makeSite(30, 12);
const enc = { name: 'Bat Swarm', icon: '🦇', rewards: {}, suggestedActions: [{}] };

describe('makeMob', () => {
  test('defaults: idle, home at spawn, speed 1, not a boss', () => {
    const m = makeMob({ x: 3, y: 4, encounter: enc });
    expect(m.state).toBe('idle');
    expect(m.home).toEqual({ x: 3, y: 4 });
    expect(m.speed).toBe(DEFAULT_MOB_SPEED);
    expect(m.defeated).toBe(false);
    expect(m.isBoss).toBeUndefined();
    expect(m.id).toBe('mob_3_4');
  });

  test('a boss defaults to speed 0 (stationary guard) and carries its ids', () => {
    const b = makeMob({ x: 9, y: 1, encounter: enc, enemyId: 'tyrant', isBoss: true, milestoneId: 'm1' });
    expect(b.speed).toBe(0);
    expect(b.isBoss).toBe(true);
    expect(b.enemyId).toBe('tyrant');
    expect(b.milestoneId).toBe('m1');
  });
});

describe('spawnMobsFromSlots', () => {
  test('only encounter slots become mobs; hard foes become fast hunters', () => {
    const s = { contentSlots: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }] };
    const kinds = ['encounter', 'loot', 'encounter'];
    const encs = { 0: { ...enc, difficulty: 'medium' }, 2: { ...enc, difficulty: 'hard' } };
    const mobs = spawnMobsFromSlots(s, kinds, (i) => encs[i] || null);
    expect(mobs).toHaveLength(2);
    expect(mobs[0]).toMatchObject({ x: 1, y: 1, speed: DEFAULT_MOB_SPEED });
    expect(mobs[1]).toMatchObject({ x: 3, y: 3, speed: HUNTER_SPEED }); // hard -> hunter
  });
});

describe('stepMobs - aggro flip at radius', () => {
  test('idle mob within AGGRO_RADIUS wakes to alerted (the one-step tell, no move)', () => {
    const mob = makeMob({ x: 0, y: 0, encounter: enc });
    const { mobs, combatMob } = stepMobs([mob], { x: AGGRO_RADIUS, y: 0 }, site);
    expect(mobs[0].state).toBe('alerted');
    expect(mobs[0]).toMatchObject({ x: 0, y: 0 }); // alerted does NOT move
    expect(combatMob).toBeNull();
  });

  test('idle mob beyond AGGRO_RADIUS stays idle and still', () => {
    const mob = makeMob({ x: 0, y: 0, encounter: enc });
    const { mobs } = stepMobs([mob], { x: AGGRO_RADIUS + 1, y: 0 }, site);
    expect(mobs[0].state).toBe('idle');
    expect(mobs[0]).toMatchObject({ x: 0, y: 0 });
  });
});

describe('stepMobs - chasing', () => {
  test('an aggro mob takes one BFS step toward the party', () => {
    const mob = { ...makeMob({ x: 0, y: 0, encounter: enc }), state: 'aggro' };
    const { mobs, combatMob } = stepMobs([mob], { x: 5, y: 0 }, site);
    expect(mobs[0]).toMatchObject({ x: 1, y: 0, state: 'aggro' });
    expect(combatMob).toBeNull();
  });

  test('a speed:2 hunter closes TWO tiles per step', () => {
    const mob = { ...makeMob({ x: 0, y: 0, encounter: enc, speed: HUNTER_SPEED }), state: 'aggro' };
    const { mobs } = stepMobs([mob], { x: 6, y: 0 }, site);
    expect(mobs[0]).toMatchObject({ x: 2, y: 0 });
  });

  test('alerted commits to aggro next step and then moves', () => {
    const mob = { ...makeMob({ x: 0, y: 0, encounter: enc }), state: 'alerted' };
    const { mobs } = stepMobs([mob], { x: 5, y: 0 }, site);
    expect(mobs[0].state).toBe('aggro');
    expect(mobs[0]).toMatchObject({ x: 1, y: 0 });
  });
});

describe('stepMobs - leash / deaggro return home', () => {
  test('a chaser past DEAGGRO_RADIUS gives up and reverts to idle', () => {
    const mob = { ...makeMob({ x: 5, y: 0, encounter: enc }), state: 'aggro' }; // home (5,0)
    const { mobs } = stepMobs([mob], { x: 5 + DEAGGRO_RADIUS + 1, y: 0 }, site);
    expect(mobs[0].state).toBe('idle');
    expect(mobs[0]).toMatchObject({ x: 5, y: 0 }); // already home, no move
  });

  test('a chaser dragged past LEASH_RADIUS from home turns back toward home', () => {
    const homeX = 0;
    const mob = { ...makeMob({ x: LEASH_RADIUS + 1, y: 0, encounter: enc, home: { x: homeX, y: 0 } }), state: 'aggro' };
    // party close by (within deaggro) so ONLY the leash rule fires
    const { mobs } = stepMobs([mob], { x: LEASH_RADIUS + 1, y: 4 }, site);
    expect(mobs[0].state).toBe('idle');
    expect(mobs[0]).toMatchObject({ x: LEASH_RADIUS, y: 0 }); // one step back toward home
  });
});

describe('stepMobs - contact detection', () => {
  test('a mob that ends adjacent to the party is returned as combatMob', () => {
    const mob = { ...makeMob({ x: 2, y: 0, encounter: enc }), state: 'aggro' };
    const { combatMob } = stepMobs([mob], { x: 4, y: 0 }, site);
    expect(combatMob).toBeTruthy();
    expect(combatMob.x).toBe(3); // stepped from 2 to 3, adjacent to the party at 4
  });

  test('the FIRST mob in contact wins (stable array order)', () => {
    const a = { ...makeMob({ id: 'A', x: 4, y: 0, encounter: enc }), state: 'aggro' };
    const b = { ...makeMob({ id: 'B', x: 5, y: 1, encounter: enc }), state: 'aggro' };
    const { combatMob } = stepMobs([a, b], { x: 5, y: 0 }, site);
    expect(combatMob.id).toBe('A');
  });

  test('no contact when every mob stays out of reach', () => {
    const mob = { ...makeMob({ x: 0, y: 0, encounter: enc }), state: 'aggro' };
    const { combatMob } = stepMobs([mob], { x: 8, y: 0 }, site);
    expect(combatMob).toBeNull();
  });
});

describe('stepMobs - bosses / guards', () => {
  test('a boss guard never leaves its tile, but fires on contact', () => {
    const boss = makeMob({ x: 5, y: 5, encounter: enc, isBoss: true, enemyId: 'tyrant' });
    const near = stepMobs([boss], { x: 5, y: 6 }, site); // adjacent
    expect(near.mobs[0]).toMatchObject({ x: 5, y: 5, state: 'aggro' }); // did not move
    expect(near.combatMob.enemyId).toBe('tyrant');

    const far = stepMobs([boss], { x: 5, y: 11 }, site); // out of range
    expect(far.mobs[0]).toMatchObject({ x: 5, y: 5, state: 'idle' });
    expect(far.combatMob).toBeNull();
  });
});

describe('stepMobs - defeated + determinism', () => {
  test('defeated mobs are passed through untouched and never trigger combat', () => {
    const dead = { ...makeMob({ x: 4, y: 0, encounter: enc }), defeated: true, state: 'aggro' };
    const { mobs, combatMob } = stepMobs([dead], { x: 4, y: 0 }, site); // co-located
    expect(mobs[0]).toBe(dead); // same reference, unchanged
    expect(combatMob).toBeNull();
  });

  test('same input yields identical output (pure / deterministic)', () => {
    const mobs = [
      { ...makeMob({ x: 0, y: 0, encounter: enc }), state: 'aggro' },
      makeMob({ x: 10, y: 5, encounter: enc }),
    ];
    const player = { x: 6, y: 0 };
    const r1 = stepMobs(mobs, player, site);
    const r2 = stepMobs(mobs, player, site);
    expect(r1.mobs).toEqual(r2.mobs);
    expect(r1.combatMob).toEqual(r2.combatMob);
  });
});

describe('stepMobs - flee cooldown (de-aggro after a successful flee)', () => {
  test('a cooling-down mob adjacent to the party stays idle, is not combatMob, and decrements', () => {
    // Mob sits ON its home so it cannot step away; adjacent to the party. Without the
    // cooldown it would wake and immediately contact (the forced-fight loop).
    const mob = { ...makeMob({ x: 4, y: 0, encounter: enc }), fleeCooldown: FLEE_DEAGGRO_STEPS };
    const { mobs, combatMob } = stepMobs([mob], { x: 5, y: 0 }, site); // party adjacent
    expect(mobs[0].state).toBe('idle');
    expect(combatMob).toBeNull(); // no contact fight while cooling down
    expect(mobs[0].fleeCooldown).toBe(FLEE_DEAGGRO_STEPS - 1); // ticked down one step
  });

  test('the cooldown ticks down one per step and forces idle even inside AGGRO_RADIUS', () => {
    let mob = { ...makeMob({ x: 0, y: 0, encounter: enc, home: { x: 0, y: 0 } }), fleeCooldown: 3 };
    const player = { x: 1, y: 0 }; // well within AGGRO_RADIUS the whole time
    for (let expected = 3; expected > 0; expected--) {
      const { mobs, combatMob } = stepMobs([mob], player, site);
      expect(mobs[0].state).toBe('idle');
      expect(combatMob).toBeNull();
      expect(mobs[0].fleeCooldown).toBe(expected - 1);
      mob = mobs[0];
    }
    expect(mob.fleeCooldown).toBe(0);
  });

  test('once the cooldown reaches 0 the same mob re-aggros and contacts normally', () => {
    // fleeCooldown 1: this step consumes the last tick (still disengaged, no contact)...
    const mob = { ...makeMob({ x: 4, y: 0, encounter: enc }), fleeCooldown: 1 };
    const first = stepMobs([mob], { x: 5, y: 0 }, site);
    expect(first.combatMob).toBeNull();
    expect(first.mobs[0].fleeCooldown).toBe(0);
    // ...next step, cooldown is 0, so normal aggro/contact resumes (adjacent -> combatMob).
    const second = stepMobs([first.mobs[0]], { x: 5, y: 0 }, site);
    expect(second.combatMob).toBeTruthy();
    expect(second.combatMob.id).toBe(mob.id);
  });

  test('a defeated mob with a stale cooldown stays skipped (defeated wins over cooldown)', () => {
    const dead = { ...makeMob({ x: 4, y: 0, encounter: enc }), defeated: true, fleeCooldown: FLEE_DEAGGRO_STEPS };
    const { mobs, combatMob } = stepMobs([dead], { x: 4, y: 0 }, site); // co-located
    expect(mobs[0]).toBe(dead); // untouched, same reference (cooldown not even decremented)
    expect(mobs[0].fleeCooldown).toBe(FLEE_DEAGGRO_STEPS);
    expect(combatMob).toBeNull();
  });

  test('a cooling-down mob away from home steps back toward home to break contact', () => {
    const mob = { ...makeMob({ x: 4, y: 0, encounter: enc, home: { x: 0, y: 0 } }), fleeCooldown: 2 };
    const { mobs, combatMob } = stepMobs([mob], { x: 5, y: 0 }, site);
    expect(mobs[0]).toMatchObject({ x: 3, y: 0, state: 'idle' }); // one step homeward
    expect(combatMob).toBeNull();
  });
});

describe('healMobsToIdle', () => {
  test('downgrades alerted/aggro back to idle (a mid-chase save must not resume the chase)', () => {
    const mobs = [
      { ...makeMob({ x: 0, y: 0, encounter: enc }), state: 'aggro' },
      { ...makeMob({ x: 1, y: 0, encounter: enc }), state: 'alerted' },
      { ...makeMob({ x: 2, y: 0, encounter: enc }), state: 'idle', defeated: true },
    ];
    healMobsToIdle(mobs);
    expect(mobs.map((m) => m.state)).toEqual(['idle', 'idle', 'idle']);
    expect(mobs[2].defeated).toBe(true); // defeat is untouched
  });
});
