// sideQuests.js
// POOL of optional side quests. At new-game time the game SELECTS a few that fit the map
// (questEngine.selectSideQuests). Each quest is a chain of steps:
//   - an OBJECTIVE step (item / combat / location, optionally with `count`, optionally
//     bound to a `site` cave/ruin), then
//   - a TURN-IN step (return to the giver / deliver to a building) gated by `requires`.
// status: 'available' -> 'active' -> 'completed'. Objective steps complete on game events;
// turn-in steps complete when the player hands in at a matching building (questEngine).

// Standard "return to an inn/tavern for your reward" turn-in step.
const returnToInn = (qid, requires, text = 'Return to the inn to claim your reward') => ({
  id: `${qid}_turnin`, type: 'turnin', text,
  trigger: { turnIn: { building: ['inn', 'tavern'] } }, requires, completed: false,
  rewards: { xp: 0, gold: 0, items: [] },
});

export const SIDE_QUESTS = [
  // --- cave quests (objective in the cave, then report back) ---
  {
    id: 'lost_heirloom', title: 'The Lost Heirloom',
    description: "A grieving villager's silver locket was lost in the cave. Recover it and return.",
    giver: { building: ['inn', 'tavern'], hook: 'My family\'s locket is lost in the cave. Bring it back to me.' },
    status: 'available',
    milestones: [
      { id: 'lh1', type: 'item', text: 'Recover the silver locket from the cave', trigger: { item: 'silver_locket' }, requires: [], completed: false, site: { type: 'cave', objectiveType: 'item', id: 'silver_locket', name: 'the Silver Locket' }, rewards: { xp: 60, gold: 0, items: [] } },
      returnToInn('lost_heirloom', ['lh1'], 'Return the locket to its owner'),
    ],
    rewards: { xp: 60, gold: 120, items: [] },
  },
  {
    id: 'cave_beast', title: 'The Beast Below',
    description: 'A monstrous beast lairs in the cave and raids the farms. Slay it, then report back.',
    giver: { building: ['tavern', 'shop'], hook: 'A beast in the cave takes our livestock by night. End it.' },
    status: 'available',
    milestones: [
      { id: 'cb1', type: 'combat', text: 'Slay the beast lairing in the cave', trigger: { enemy: 'cave_tyrant' }, requires: [], completed: false, site: { type: 'cave', objectiveType: 'combat', id: 'cave_tyrant', name: 'the Cave Tyrant' }, rewards: { xp: 150, gold: 0, items: ['raw_gems'] } },
      returnToInn('cave_beast', ['cb1']),
    ],
    rewards: { xp: 120, gold: 150, items: [] },
  },
  {
    id: 'missing_miners', title: 'The Missing Miners',
    description: 'Miners vanished in the deep galleries of the cave. Find how far they got and report back.',
    giver: { building: ['mill', 'townhall'], hook: 'Our miners went into the deep gallery and never returned. Please look for them.' },
    status: 'available',
    milestones: [
      { id: 'mm1', type: 'location', text: 'Reach the deep gallery in the cave', trigger: { location: 'deep_gallery' }, requires: [], completed: false, site: { type: 'cave', objectiveType: 'location', id: 'deep_gallery', name: 'the Deep Gallery' }, rewards: { xp: 70, gold: 0, items: [] } },
      returnToInn('missing_miners', ['mm1']),
    ],
    rewards: { xp: 80, gold: 90, items: [] },
  },

  // --- ruins quests ---
  {
    id: 'ruin_menace', title: 'Menace in the Ruins',
    description: 'A dark thing preys on travellers near the ruins. Put it to rest, then report back.',
    giver: { building: ['temple', 'shrine'], hook: 'Travellers vanish near the old ruins. A dark thing dwells there. Will you face it?' },
    status: 'available',
    milestones: [
      { id: 'rm1', type: 'combat', text: 'Defeat the wraith lord in the ruins', trigger: { enemy: 'wraith_lord' }, requires: [], completed: false, site: { type: 'ruins', objectiveType: 'combat', id: 'wraith_lord', name: 'the Wraith Lord' }, rewards: { xp: 200, gold: 0, items: ['dark_tome'] } },
      returnToInn('ruin_menace', ['rm1']),
    ],
    rewards: { xp: 100, gold: 150, items: [] },
  },
  {
    id: 'relic_hunt', title: "The Scholar's Relic",
    description: 'A scholar seeks an ancient relic in the ruins. Retrieve it and bring it back.',
    giver: { building: ['library', 'archives', 'magetower'], hook: 'An ancient relic rests in the ruins. Bring it to me and be well paid.' },
    status: 'available',
    milestones: [
      { id: 'rh1', type: 'item', text: 'Retrieve the ancient relic from the ruins', trigger: { item: 'ancient_relic' }, requires: [], completed: false, site: { type: 'ruins', objectiveType: 'item', id: 'ancient_relic', name: 'the Ancient Relic' }, rewards: { xp: 80, gold: 0, items: [] } },
      returnToInn('relic_hunt', ['rh1'], 'Bring the relic to the scholar'),
    ],
    rewards: { xp: 90, gold: 200, items: [] },
  },
  {
    id: 'sealed_vault', title: 'The Sealed Vault',
    description: 'Old maps speak of a sealed vault deep in the ruins. Find it, then report your discovery.',
    giver: { building: ['library', 'archives'], hook: 'A sealed vault lies deep in the ruins, unreached in an age. Find it.' },
    status: 'available',
    milestones: [
      { id: 'sv1', type: 'location', text: 'Find the sealed vault in the ruins', trigger: { location: 'sealed_vault' }, requires: [], completed: false, site: { type: 'ruins', objectiveType: 'location', id: 'sealed_vault', name: 'the Sealed Vault' }, rewards: { xp: 70, gold: 0, items: [] } },
      returnToInn('sealed_vault', ['sv1']),
    ],
    rewards: { xp: 80, gold: 110, items: [] },
  },

  // --- gather (count) — no site, collect anywhere ---
  {
    id: 'alchemist_reagents', title: "Reagents for the Apothecary",
    description: 'The apothecary needs spider silk for her tinctures. Gather three skeins and bring them in.',
    giver: { building: ['inn', 'tavern'], hook: 'I need three skeins of spider silk for my brews. Gather them and I\'ll reward you.' },
    status: 'available',
    milestones: [
      { id: 'ar1', type: 'item', text: 'Collect 3 skeins of spider silk', trigger: { item: 'spider_silk', count: 3 }, requires: [], completed: false, rewards: { xp: 40, gold: 0, items: [] } },
      returnToInn('alchemist_reagents', ['ar1'], 'Bring the silk to the apothecary'),
    ],
    rewards: { xp: 40, gold: 90, items: [] },
  },

  // --- bounty (count any) — prove your mettle ---
  {
    id: 'prove_mettle', title: 'Prove Your Mettle',
    description: 'The captain wants seasoned blades. Defeat three foes in the wilds, then report.',
    giver: { building: ['tavern', 'inn'], hook: 'Show me you can fight — best three foes out in the wilds and come back.' },
    status: 'available',
    milestones: [
      { id: 'pm1', type: 'combat', text: 'Defeat 3 foes in the wilds', trigger: { enemy: 'any', count: 3 }, requires: [], completed: false, rewards: { xp: 60, gold: 0, items: [] } },
      returnToInn('prove_mettle', ['pm1']),
    ],
    rewards: { xp: 80, gold: 120, items: [] },
  },

  // --- courier / delivery — hand in at the town hall ---
  {
    id: 'sealed_letter', title: 'A Letter for the Magistrate',
    description: 'Carry a sealed letter to the town hall and deliver it to the magistrate.',
    giver: { building: ['tavern', 'inn'], hook: 'Carry this sealed letter to the magistrate at the town hall. Discreetly.' },
    status: 'available',
    milestones: [
      { id: 'sl1', type: 'turnin', text: 'Deliver the sealed letter to the town hall', trigger: { turnIn: { building: 'townhall' } }, requires: [], completed: false, rewards: { xp: 0, gold: 0, items: [] } },
    ],
    rewards: { xp: 50, gold: 100, items: [] },
  },
];

// Fresh, mutable copy of the FULL pool (debug page; new games use selectSideQuests).
export const initialSideQuests = () => SIDE_QUESTS.map((q) => ({
  ...q,
  milestones: q.milestones.map((m) => ({ ...m, completed: false, progress: 0 })),
  status: 'available',
}));

export default SIDE_QUESTS;
