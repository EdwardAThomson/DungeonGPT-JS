import {
  acceptSideQuest, checkSideQuestEvent, turnInQuest, getReadyTurnIns, getAvailableQuestsAt,
  getActiveSideQuests, getAvailableSideQuests, getCompletedSideQuests,
  getSideQuestProgress, getActiveSiteObjectives, selectSideQuests,
} from './questEngine';
import { initialSideQuests } from '../data/sideQuests';

const seededRng = (seed) => { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };
const accept = (id) => acceptSideQuest(initialSideQuests(), id);
const find = (sq, id) => sq.find((q) => q.id === id);

describe('questEngine — basics', () => {
  test('side quests start available and inactive', () => {
    const sq = initialSideQuests();
    expect(getAvailableSideQuests(sq).length).toBe(sq.length);
    expect(getActiveSideQuests(sq).length).toBe(0);
  });

  test('accepting a quest activates only that one', () => {
    const sq = accept('lost_heirloom');
    expect(getActiveSideQuests(sq).map((q) => q.id)).toEqual(['lost_heirloom']);
  });

  test('events only affect ACTIVE quests', () => {
    const { completions } = checkSideQuestEvent(initialSideQuests(), { type: 'item_acquired', itemId: 'silver_locket' });
    expect(completions.length).toBe(0);
  });

  test('quests are offered by their giver building, not all at the inn', () => {
    const sq = initialSideQuests();
    // the wraith-lord quest is given at a temple/shrine, not an inn
    expect(getAvailableQuestsAt(sq, { buildingType: 'temple' }).map((q) => q.id)).toContain('ruin_menace');
    expect(getAvailableQuestsAt(sq, { buildingType: 'inn' }).map((q) => q.id)).not.toContain('ruin_menace');
    // the relic quest is offered at a library, not at a blacksmith
    expect(getAvailableQuestsAt(sq, { buildingType: 'library' }).map((q) => q.id)).toContain('relic_hunt');
    expect(getAvailableQuestsAt(sq, { buildingType: 'blacksmith' }).length).toBe(0);
    // accepted/active quests are no longer "available" to offer
    const accepted = acceptSideQuest(sq, 'ruin_menace');
    expect(getAvailableQuestsAt(accepted, { buildingType: 'temple' }).map((q) => q.id)).not.toContain('ruin_menace');
  });

  test('site objectives exposed only for active quests', () => {
    expect(getActiveSiteObjectives(initialSideQuests())).toEqual({});
    const objs = getActiveSiteObjectives(accept('ruin_menace'));
    expect(objs.ruins?.id).toBe('wraith_lord');
    expect(objs.cave).toBeUndefined();
  });
});

describe('questEngine — return-to-giver (multi-step + turn-in)', () => {
  test('completing the objective advances the quest but does NOT finish it (turn-in remains)', () => {
    const sq = accept('lost_heirloom');
    const { updatedSideQuests, completions } = checkSideQuestEvent(sq, { type: 'item_acquired', itemId: 'silver_locket' });
    expect(completions.length).toBe(1);
    expect(completions[0].questCompleted).toBe(false);          // not done — must turn in
    expect(find(updatedSideQuests, 'lost_heirloom').status).toBe('active');
  });

  test('turning in at the inn after the objective completes the quest + grants quest reward', () => {
    let sq = accept('lost_heirloom');
    sq = checkSideQuestEvent(sq, { type: 'item_acquired', itemId: 'silver_locket' }).updatedSideQuests;
    // turn-in ready only at an inn/tavern
    expect(getReadyTurnIns(sq, { buildingType: 'shop' }).length).toBe(0);
    expect(getReadyTurnIns(sq, { buildingType: 'inn' }).map((q) => q.id)).toEqual(['lost_heirloom']);
    const { updatedSideQuests, completions } = turnInQuest(sq, { buildingType: 'inn' });
    expect(completions.some((c) => c.questCompleted)).toBe(true);
    expect(completions.find((c) => c.questCompleted).questRewards).toEqual({ xp: 60, gold: 120, items: [] });
    expect(find(updatedSideQuests, 'lost_heirloom').status).toBe('completed');
  });

  test('cannot turn in before the objective is done', () => {
    const sq = accept('lost_heirloom'); // objective not done
    expect(getReadyTurnIns(sq, { buildingType: 'inn' }).length).toBe(0);
    expect(turnInQuest(sq, { buildingType: 'inn' }).completions.length).toBe(0);
  });
});

describe('questEngine — count triggers (gather / bounty)', () => {
  test('a count objective completes only at the threshold', () => {
    let sq = accept('alchemist_reagents'); // collect 3 spider_silk
    const ev = { type: 'item_acquired', itemId: 'spider_silk' };
    sq = checkSideQuestEvent(sq, ev).updatedSideQuests;
    sq = checkSideQuestEvent(sq, ev).updatedSideQuests;
    expect(find(sq, 'alchemist_reagents').milestones[0].completed).toBe(false); // 2/3
    const third = checkSideQuestEvent(sq, ev);
    expect(third.completions.length).toBe(1); // 3/3 completes the objective step
    expect(find(third.updatedSideQuests, 'alchemist_reagents').milestones[0].completed).toBe(true);
  });

  test('"any" enemy bounty counts any kill', () => {
    let sq = accept('prove_mettle'); // defeat 3 of any
    for (let i = 0; i < 3; i++) sq = checkSideQuestEvent(sq, { type: 'enemy_defeated', enemyId: `mob_${i}` }).updatedSideQuests;
    expect(find(sq, 'prove_mettle').milestones[0].completed).toBe(true);
  });
});

describe('questEngine — courier / delivery', () => {
  test('letter quest turns in at the town hall, not an inn', () => {
    const sq = accept('sealed_letter'); // single turn-in step at townhall
    expect(getReadyTurnIns(sq, { buildingType: 'inn' }).length).toBe(0);
    expect(getReadyTurnIns(sq, { buildingType: 'townhall' }).map((q) => q.id)).toEqual(['sealed_letter']);
    const { updatedSideQuests, completions } = turnInQuest(sq, { buildingType: 'townhall' });
    expect(completions.find((c) => c.questCompleted)?.questRewards).toEqual({ xp: 50, gold: 100, items: [] });
    expect(find(updatedSideQuests, 'sealed_letter').status).toBe('completed');
  });
});

describe('questEngine — selection + eligibility (startable AND completable)', () => {
  // every giver / turn-in building used by the pool, so building-availability never filters
  // except where a test deliberately omits one.
  const ALL = ['inn', 'tavern', 'shop', 'mill', 'townhall', 'temple', 'shrine', 'library', 'archives', 'magetower', 'alchemist', 'apothecary'];
  const avail = (sites, buildings = ALL) => ({ sites, buildings });

  test('only picks quests whose target site exists (non-site quests always eligible)', () => {
    for (let s = 1; s <= 20; s++) {
      selectSideQuests(avail({ cave: true, ruins: false }), 2, seededRng(s)).forEach((q) => {
        const siteStep = q.milestones.find((m) => m.site);
        if (siteStep) expect(siteStep.site.type).toBe('cave');
      });
    }
  });

  test('fresh + available, capped to count, deterministic per seed', () => {
    const a = selectSideQuests(avail({ cave: true, ruins: true }), 2, seededRng(42));
    const b = selectSideQuests(avail({ cave: true, ruins: true }), 2, seededRng(42));
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
    expect(a.length).toBe(2);
    a.forEach((q) => { expect(q.status).toBe('available'); expect(q.milestones.every((m) => !m.completed)).toBe(true); });
  });

  test('a quest is excluded if its GIVER building is missing (unstartable)', () => {
    // ruin_menace is given at a temple/shrine; without either it can never be started
    const noTemple = ALL.filter((b) => b !== 'temple' && b !== 'shrine');
    const picked = selectSideQuests({ sites: { cave: true, ruins: true }, buildings: noTemple }, 9, seededRng(1));
    expect(picked.map((q) => q.id)).not.toContain('ruin_menace');
  });

  test('a quest is excluded if its TURN-IN building is missing (uncompletable)', () => {
    // sealed_letter must be handed in at a town hall; no town hall -> excluded
    const noHall = ALL.filter((b) => b !== 'townhall');
    const picked = selectSideQuests({ sites: { cave: true, ruins: true }, buildings: noHall }, 9, seededRng(1));
    expect(picked.map((q) => q.id)).not.toContain('sealed_letter');
  });

  test('a site quest is excluded if its site is missing even when buildings exist', () => {
    const picked = selectSideQuests({ sites: { cave: false, ruins: false }, buildings: ALL }, 9, seededRng(1));
    picked.forEach((q) => expect(q.milestones.some((m) => m.site)).toBe(false));
  });

  test('no eligible quests at all -> empty (no dead quests)', () => {
    // no sites and no giver buildings -> nothing is offerable
    expect(selectSideQuests({ sites: {}, buildings: [] }, 5, seededRng(1))).toEqual([]);
  });

  test('progress reporting counts all steps', () => {
    expect(getSideQuestProgress(find(accept('lost_heirloom'), 'lost_heirloom'))).toEqual({ done: 0, total: 2 });
  });
});
