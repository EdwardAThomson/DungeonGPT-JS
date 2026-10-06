// sideQuests.js
// POOL of optional side quests. At new-game time the game SELECTS a map-fitting few
// (questEngine.selectSideQuests / isQuestEligible) and reveals each at its giver building
// once the party is strong enough (minLevel vs effective party level). Each quest is a
// chain: an objective step (item/combat/location, optionally `count`, optionally `site`)
// then a turn-in step (return to giver, or courier to another building). Multi-step
// quests (Chain) add more objectives, ordered via `requires`, and errands at other
// buildings partway through; the final step is always the turn-in.
//
// Completability rules: specific item/boss/room objectives must be SITE-bound (injected);
// overworld combat must be count-of-`any`; gather items should be ones that actually drop.
// See docs/SIDE_QUEST_POOL.md.

// --- step builders -----------------------------------------------------------
const turnIn = (qid, requires, building, text = 'Return to claim your reward') =>
  ({ id: `${qid}_in`, type: 'turnin', text, trigger: { turnIn: { building } }, requires, completed: false, rewards: { xp: 0, gold: 0, items: [] } });
const siteItem = (id, text, type, itemId, name, rewards) =>
  ({ id, type: 'item', text, trigger: { item: itemId }, requires: [], completed: false, site: { type, objectiveType: 'item', id: itemId, name }, rewards });
const siteCombat = (id, text, type, enemyId, name, rewards) =>
  ({ id, type: 'combat', text, trigger: { enemy: enemyId }, requires: [], completed: false, site: { type, objectiveType: 'combat', id: enemyId, name }, rewards });
const siteLoc = (id, text, type, locId, name, rewards) =>
  ({ id, type: 'location', text, trigger: { location: locId }, requires: [], completed: false, site: { type, objectiveType: 'location', id: locId, name }, rewards });
// `sites` = the site types where the item can actually be harvested/looted (source hint):
// isQuestEligible requires at least one to exist on the map, getRevealedSiteTypes reveals
// them once the quest is active, and questHints/the DM prompt point the player at them.
const gather = (id, text, itemId, count, rewards, sites) =>
  ({ id, type: 'item', text, trigger: { item: itemId, count }, requires: [], completed: false, ...(sites ? { sites } : {}), rewards });
const bounty = (id, text, count, rewards) =>
  ({ id, type: 'combat', text, trigger: { enemy: 'any', count }, requires: [], completed: false, rewards });
const Q = (id, title, minLevel, description, giverBuilding, hook, objective, turnInBuilding, turnInText, rewards) => ({
  id, title, minLevel, description,
  giver: { building: giverBuilding, hook },
  status: 'available',
  milestones: [objective, turnIn(id, [objective.id], turnInBuilding, turnInText)],
  rewards,
});
// courier quest: a single turn-in (deliver) step, no separate objective
const Courier = (id, title, minLevel, description, giverBuilding, hook, deliverTo, deliverText, rewards) => ({
  id, title, minLevel, description,
  giver: { building: giverBuilding, hook },
  status: 'available',
  milestones: [{ id: `${id}_deliver`, type: 'turnin', text: deliverText, trigger: { turnIn: { building: deliverTo } }, requires: [], completed: false, rewards: { xp: 0, gold: 0, items: [] } }],
  rewards,
});

// multi-step quest: explicit steps (set `requires` with `after` for order; steps with no
// requires run in parallel), then a final turn-in that requires every step before it.
const after = (step, ...requires) => ({ ...step, requires });
// errand partway through a quest: a turn-in step at another building
const visit = (id, text, building, rewards) =>
  ({ id, type: 'turnin', text, trigger: { turnIn: { building } }, requires: [], completed: false, rewards });
const Chain = (id, title, minLevel, description, giverBuilding, hook, steps, turnInBuilding, turnInText, rewards) => ({
  id, title, minLevel, description,
  giver: { building: giverBuilding, hook },
  status: 'available',
  milestones: [...steps, turnIn(id, steps.map((st) => st.id), turnInBuilding, turnInText)],
  rewards,
});

// limit a quest to worlds of the given biomes (settings.theme: grassland | desert | snow)
const only = (themes, quest) => ({ ...quest, themes });
// tone: 'horror' quests appear only in Dark games and 'light' ones only outside them
// (settings.darknessLevel)
const horror = (quest) => ({ ...quest, tone: 'horror' });
const light = (quest) => ({ ...quest, tone: 'light' });

const INN = ['inn', 'tavern'];

export const SIDE_QUESTS = [
  // --- tavern / inn ---
  Q('lost_heirloom', 'The Lost Heirloom', 2, "A villager's silver locket was lost in the cave.", INN, 'My family\'s locket is lost in the cave. Bring it back to me.',
    siteItem('lh1', 'Recover the silver locket from the cave', 'cave', 'silver_locket', 'the Silver Locket', { xp: 60, gold: 0, items: [] }), INN, 'Return the locket to its owner', { xp: 60, gold: 120, items: [] }),
  Q('prove_mettle', 'Prove Your Mettle', 2, 'A captain wants seasoned blades.', INN, 'Show me you can fight — best three foes out in the wilds and come back.',
    bounty('pm1', 'Defeat 3 foes in the wilds', 3, { xp: 60, gold: 0, items: [] }), INN, 'Show the captain your notched blade', { xp: 80, gold: 120, items: [] }),
  light(Q('bards_songbook', "The Bard's Lost Songbook", 2, 'A bard left her prized songbook in the ruins.', INN, 'My songbook is lost among the old ruins. I\'d pay dearly to sing from it again.',
    siteItem('bs1', 'Recover the lost songbook from the ruins', 'ruins', 'lost_songbook', 'the Lost Songbook', { xp: 60, gold: 0, items: [] }), INN, 'Return the songbook to the bard', { xp: 50, gold: 110, items: [] })),
  Q('singing_cavern', 'The Singing Cavern', 1, 'Travellers speak of a hollow that sings on the wind.', INN, 'They say a deep hollow in the cave sings on the wind. See it and tell me true.',
    siteLoc('sc1', 'Reach the echoing hollow in the cave', 'cave', 'echo_hollow', 'the Echoing Hollow', { xp: 50, gold: 0, items: [] }), INN, 'Bring back the tale', { xp: 50, gold: 80, items: [] }),
  Courier('sealed_letter', 'A Letter for the Magistrate', 1, 'Carry a sealed letter to the town hall.', INN, 'Carry this sealed letter to the magistrate at the town hall. Discreetly.',
    'townhall', 'Deliver the sealed letter to the town hall', { xp: 50, gold: 100, items: [] }),

  // --- tavern / shop ---
  Q('cave_beast', 'The Beast Below', 3, 'A beast lairs in the cave and raids the farms.', ['tavern', 'shop'], 'A beast in the cave takes our livestock by night. End it.',
    siteCombat('cb1', 'Slay the beast lairing in the cave', 'cave', 'cave_tyrant', 'the Cave Tyrant', { xp: 150, gold: 0, items: ['raw_gems'] }), ['tavern', 'shop'], 'Tell the farmers the beast is dead', { xp: 120, gold: 150, items: [] }),
  Q('caravan_refund', 'Refund in Blood', 2, 'Bandits robbed a merchant caravan.', ['shop', 'market'], 'Bandits robbed my caravan. Make them pay and I\'ll see you compensated.',
    bounty('cr1', 'Win 3 fights on the caravan road', 3, { xp: 70, gold: 0, items: [] }), ['shop', 'market'], 'Tell the merchant the debt is paid', { xp: 60, gold: 140, items: [] }),
  Courier('overdue_delivery', 'Overdue Delivery', 1, 'A merchant needs goods carried across town.', ['shop', 'market'], 'These goods are overdue at the inn. Carry them over for me?',
    INN, 'Deliver the goods to the inn', { xp: 30, gold: 80, items: [] }),

  // --- temple / shrine ---
  Q('ruin_menace', 'Menace in the Ruins', 4, 'A dark thing preys on travellers near the ruins.', ['temple', 'shrine'], 'Travellers vanish near the old ruins. A dark thing dwells there. Will you face it?',
    siteCombat('rm1', 'Defeat the wraith lord in the ruins', 'ruins', 'wraith_lord', 'the Wraith Lord', { xp: 200, gold: 0, items: ['dark_tome'] }), ['temple', 'shrine'], 'Tell the temple the road is safe again', { xp: 100, gold: 150, items: [] }),
  Q('consecrated_relic', 'Consecrated Relic', 3, 'A holy relic was lost when the temple-of-old fell to ruin.', ['temple', 'shrine'], 'A consecrated relic lies in the ruins. Restore it to us and be blessed.',
    siteItem('co1', 'Retrieve the holy relic from the ruins', 'ruins', 'holy_relic', 'the Holy Relic', { xp: 90, gold: 0, items: [] }), ['temple', 'shrine'], 'Return the relic to the temple', { xp: 90, gold: 120, items: ['dryad_blessing'] }),
  Q('tend_sick', 'Tend the Sick', 1, 'The temple needs healing reagents for the sick.', ['temple', 'shrine'], 'The sick need glowing cave mushrooms for poultices. Gather three.',
    gather('ts1', 'Collect 3 glowing cave mushrooms', 'cave_mushrooms', 3, { xp: 40, gold: 0, items: [] }, ['cave']), ['temple', 'shrine'], 'Bring the mushrooms to the temple', { xp: 40, gold: 90, items: [] }),
  Q('lay_to_rest', 'Lay the Dead to Rest', 2, 'Restless dead stir in a forgotten burial vault.', ['temple', 'shrine'], 'The dead are restless in the ruins\' burial vault. Find it so we may consecrate it.',
    siteLoc('lr1', 'Reach the burial vault in the ruins', 'ruins', 'burial_vault', 'the Burial Vault', { xp: 70, gold: 0, items: [] }), ['temple', 'shrine'], 'Report the vault\'s location', { xp: 70, gold: 100, items: [] }),

  // --- library / archives / magetower ---
  Q('relic_hunt', "The Scholar's Relic", 3, 'A scholar seeks an ancient relic in the ruins.', ['library', 'archives', 'magetower'], 'An ancient relic rests in the ruins. Bring it to me and be well paid.',
    siteItem('rh1', 'Retrieve the ancient relic from the ruins', 'ruins', 'ancient_relic', 'the Ancient Relic', { xp: 80, gold: 0, items: [] }), ['library', 'archives'], 'Bring the relic to the scholar', { xp: 90, gold: 200, items: [] }),
  Q('sealed_vault', 'The Sealed Vault', 2, 'Old maps speak of a sealed vault deep in the ruins.', ['library', 'archives'], 'A sealed vault lies deep in the ruins, unreached in an age. Find it.',
    siteLoc('sv1', 'Find the sealed vault in the ruins', 'ruins', 'sealed_vault', 'the Sealed Vault', { xp: 70, gold: 0, items: [] }), ['library', 'archives'], 'Report your discovery', { xp: 80, gold: 110, items: [] }),
  Q('lost_codex', 'The Lost Codex', 2, 'A codex of forgotten lore lies in the cave dark.', ['library', 'archives'], 'A lost codex lies somewhere in the cave. Recover it for the archive.',
    siteItem('lc1', 'Recover the lost codex from the cave', 'cave', 'lost_codex', 'the Lost Codex', { xp: 80, gold: 0, items: [] }), ['library', 'archives'], 'Return the codex to the archive', { xp: 80, gold: 130, items: [] }),
  Q('field_samples', 'Field Samples', 1, 'A naturalist wants raw mineral samples.', ['library', 'archives'], 'I need three raw gemstones for study. Gather them from the cave.',
    gather('fs1', 'Collect 3 raw gemstones', 'raw_gems', 3, { xp: 40, gold: 0, items: [] }, ['cave']), ['library', 'archives'], 'Bring the samples in', { xp: 40, gold: 110, items: [] }),
  Q('arcane_reagents', 'Arcane Reagents', 2, 'A mage needs luminous fungi for an experiment.', 'magetower', 'I require three glowing fungi from the deep places. Fetch them.',
    gather('ar1', 'Collect 3 glowing cave fungi', 'glowing_fungi', 3, { xp: 50, gold: 0, items: [] }, ['cave']), 'magetower', 'Deliver the reagents', { xp: 50, gold: 130, items: [] }),
  Q('unstable_rift', 'The Unstable Rift', 5, 'An arcane horror has clawed through into the ruins.', 'magetower', 'Something has torn through into the ruins. Destroy it before the rift widens.',
    siteCombat('ur1', 'Destroy the arcane horror in the ruins', 'ruins', 'arcane_horror', 'the Arcane Horror', { xp: 250, gold: 0, items: ['magic_item'] }), 'magetower', 'Report to the mage that the rift is closed', { xp: 150, gold: 220, items: [] }),

  // --- alchemist / apothecary ---
  Q('alchemist_reagents', 'Reagents for the Apothecary', 1, 'The apothecary needs spider silk for tinctures.', ['alchemist', 'apothecary'], 'I need three skeins of spider silk for my brews. Gather them.',
    gather('al1', 'Collect 3 skeins of spider silk', 'spider_silk', 3, { xp: 40, gold: 0, items: [] }, ['cave']), ['alchemist', 'apothecary'], 'Bring the silk to the apothecary', { xp: 40, gold: 90, items: [] }),
  Q('antidote_ingredients', 'Antidote Ingredients', 1, 'An antidote calls for raw minerals.', ['alchemist', 'apothecary'], 'For the antidote I need three lumps of exposed minerals. Mind the dark.',
    gather('an1', 'Collect 3 lumps of exposed minerals', 'exposed_minerals', 3, { xp: 40, gold: 0, items: [] }, ['cave', 'hills', 'mountain']), ['alchemist', 'apothecary'], 'Bring the minerals in', { xp: 40, gold: 80, items: [] }),
  Q('cursed_patient', 'The Cursed Patient', 2, 'A dying patient needs a cure-root from the cave.', ['alchemist', 'apothecary'], 'My patient fades. The cure-root grows only in the cave. Hurry!',
    siteItem('cp1', 'Recover the cure-root from the cave', 'cave', 'cure_root', 'the Cure-Root', { xp: 80, gold: 0, items: [] }), ['alchemist', 'apothecary'], 'Bring the cure-root back', { xp: 80, gold: 140, items: ['greater_healing_potion'] }),

  // --- blacksmith ---
  Q('rare_ore', 'Rare Ore', 1, 'The smith needs ore from the deep cave.', 'blacksmith', 'Bring me three lumps of exposed minerals from the cave and I\'ll forge you something fine.',
    gather('ro1', 'Collect 3 lumps of ore', 'exposed_minerals', 3, { xp: 40, gold: 0, items: [] }, ['cave', 'hills', 'mountain']), 'blacksmith', 'Deliver the ore to the smith', { xp: 40, gold: 100, items: [] }),
  Q('stolen_blade', 'The Stolen Blade', 2, 'A masterwork blade was looted and hidden in the ruins.', 'blacksmith', 'Thieves took my masterwork and hid it in the ruins. Recover it.',
    siteItem('sb1', 'Recover the stolen blade from the ruins', 'ruins', 'stolen_blade', 'the Stolen Blade', { xp: 80, gold: 0, items: [] }), 'blacksmith', 'Return the blade to the smith', { xp: 80, gold: 120, items: ['silver_dagger'] }),

  // --- mill / stables ---
  Q('missing_miners', 'The Missing Miners', 2, 'Miners vanished in the deep galleries of the cave.', ['mill', 'townhall'], 'Our miners went into the deep gallery and never returned. Please look for them.',
    siteLoc('mm1', 'Reach the deep gallery in the cave', 'cave', 'deep_gallery', 'the Deep Gallery', { xp: 70, gold: 0, items: [] }), ['mill', 'townhall'], 'Tell the miners\' families what you found', { xp: 80, gold: 90, items: [] }),
  Q('vermin_stores', 'Vermin in the Stores', 1, 'Pests are ruining the mill\'s grain.', 'mill', 'Vermin are at the grain. Cull a few and I\'ll make it worth your while.',
    bounty('vs1', 'Win 3 fights around the mill', 3, { xp: 40, gold: 0, items: [] }), 'mill', 'Show the miller his grain is safe', { xp: 40, gold: 70, items: [] }),
  Q('spooked_mare', 'The Spooked Mare', 1, 'A bolted mare fled toward the cave mouth.', 'stables', 'My mare bolted toward the cave. Track her to the mouth and I\'ll know she\'s near.',
    siteLoc('sm1', 'Reach the cave mouth where the mare fled', 'cave', 'cave_mouth', 'the Cave Mouth', { xp: 50, gold: 0, items: [] }), 'stables', 'Tell the hostler', { xp: 50, gold: 70, items: [] }),

  // --- civic: town hall / bank / jail (town/city) ---
  Q('clear_roads', 'Clear the Roads', 3, 'The magistrate posts a bounty on road-foes.', 'townhall', 'The roads are thick with foes. Cull five and claim the town\'s bounty.',
    bounty('cl1', 'Defeat 5 foes on the roads', 5, { xp: 100, gold: 0, items: [] }), 'townhall', 'Claim the town\'s bounty at the hall', { xp: 100, gold: 200, items: [] }),
  Q('stolen_ledger', 'The Stolen Ledger', 3, "The bank's ledger was stolen and hidden in the ruins.", 'bank', 'Our ledger was stolen and hidden in the ruins. Recover it — quietly.',
    siteItem('le1', 'Recover the stolen ledger from the ruins', 'ruins', 'stolen_ledger', 'the Stolen Ledger', { xp: 90, gold: 0, items: [] }), 'bank', 'Return the ledger to the bank', { xp: 90, gold: 220, items: [] }),
  Q('catch_cutpurse', 'Catch the Cutpurse', 3, 'A fugitive cutpurse hides in the cave.', 'jail', 'A cutpurse fled to the cave. Bring them to justice — alive or otherwise.',
    siteCombat('cc1', 'Apprehend the fugitive in the cave', 'cave', 'fugitive', 'the Fugitive Cutpurse', { xp: 150, gold: 0, items: [] }), 'jail', 'Report to the jail', { xp: 100, gold: 160, items: [] }),

  // --- harbormaster (coastal towns) ---
  Q('lost_cargo', 'Lost Cargo', 2, 'Storm-lost cargo washed into a sea cave.', 'harbormaster', 'A storm drove cargo into the cave. Recover the crate for the harbour.',
    siteItem('lo1', 'Recover the lost cargo from the cave', 'cave', 'lost_cargo', 'the Lost Cargo', { xp: 80, gold: 0, items: [] }), 'harbormaster', 'Return the cargo to the harbour', { xp: 80, gold: 150, items: [] }),

  // --- water towns (#65 Phase 6): harbormaster / boathouse flavor ---
  // Venue-gated by the normal eligibility rules: isQuestEligible requires the giver
  // and every turn-in building to exist on the map, and harbormaster/boathouse only
  // generate in settlements on water (boathouse: canal cities only), so landlocked
  // worlds never see these quests. No new mechanics; all composed from the factories.
  Q('dockside_contraband', 'The Contraband Cache', 3, 'Smugglers land untaxed cargo by night and cache it in a sea cave.', 'harbormaster', 'Someone is running contraband past my ledgers and caching it in the cave. Bust the ring and bring me proof.',
    siteCombat('dct1', 'Defeat the smuggler captain at the cave cache', 'cave', 'smuggler_captain', 'the Smuggler Captain', { xp: 150, gold: 0, items: ['stolen_goods'] }), ['harbormaster', 'townhall'], 'Report the bust', { xp: 100, gold: 180, items: [] }),
  Courier('ferry_grievance', "The Ferryman's Grievance", 1, 'The boatwright wants a ferry dispute put before the magistrate.', 'boathouse', 'A rival ferryman poles my crossing and pockets my fares. Take my grievance to the town hall before there is blood on the water.',
    'townhall', 'Deliver the ferry grievance to the town hall', { xp: 50, gold: 100, items: [] }),
  Courier('harbor_fees', 'A Question of Harbour Fees', 2, 'The harbour and the town cannot agree on mooring tolls.', 'harbormaster', 'The magistrate doubled the mooring toll and the merchants are ready to riot. Carry my fee ledger into town so cooler heads can argue over numbers instead of knives.',
    ['townhall', 'market'], 'Deliver the harbour fee ledger', { xp: 60, gold: 120, items: [] }),
  Q('quayside_cargo', 'Washed Downriver', 2, 'A strongbox slipped off the quay and washed downriver.', 'boathouse', 'A strongbox went off the quay in the last flood and fetched up somewhere in the old ruins downriver. Bring it back unopened.',
    siteItem('qsc1', 'Recover the ferry strongbox from the ruins', 'ruins', 'ferry_strongbox', 'the Ferry Strongbox', { xp: 80, gold: 0, items: [] }), 'boathouse', 'Return the strongbox to the boathouse', { xp: 80, gold: 140, items: [] }),
  only(['grassland', 'snow'], Q('boatwright_resin', 'Pitch for the Hulls', 1, 'The boatwright needs pine resin to caulk a leaking hull.', 'boathouse', 'Every hull on this bank weeps at the seams. Tap me three lumps of pine resin from the forest and I will see you paid.',
    gather('bwr1', 'Collect 3 lumps of pine resin', 'pine_resin', 3, { xp: 40, gold: 0, items: [] }, ['forest']), 'boathouse', 'Bring the resin to the boatwright', { xp: 40, gold: 90, items: [] })),
  Q('harbor_pests', 'Pests off the Pier', 2, 'Something keeps gnawing through mooring lines by night.', ['harbormaster', 'boathouse'], 'Vermin off the water chew through my mooring lines faster than I can splice them. Cull a few and the harbour will owe you.',
    bounty('hbp1', 'Win 3 fights along the waterfront', 3, { xp: 50, gold: 0, items: [] }), ['harbormaster', 'boathouse'], 'Tell the harbour the moorings are safe', { xp: 50, gold: 100, items: [] }),

  // =========================================================================
  // Mid/top-band expansion (#45/#50): quests reserved for levelled parties.
  // XP curve: minLevel 3-4 ~250-340 total, minLevel 5 ~440-450, minLevel 6-7
  // ~500-560 (objective step + turn-in reward; see docs/T3_CAMPAIGNS_PLAN.md §2.1).
  // Completability rules still apply: sites are cave/ruins only, overworld
  // combat is count-of-any, gather targets all have live drop sources.
  // =========================================================================

  // --- minLevel 3 ---
  only(['grassland', 'snow'], Q('wolfpack_cull', 'Thin the Wolfpack', 3, 'Beasts grown bold are stalking the pastures.', ['stables', 'mill'], 'Something has the beasts of the wilds emboldened — they take a horse a week. Drive off four and the purse is yours.',
    bounty('wpc1', 'Win 4 fights near the pastures', 4, { xp: 110, gold: 0, items: [] }), ['stables', 'mill'], 'Tell the hostler the pastures are quiet', { xp: 140, gold: 180, items: [] })),
  Q('guild_waystation', "The Guild's Lost Waystation", 3, 'A trade-guild waystation in the ruins went silent a generation ago.', 'guild', 'Our charter names a waystation in the old ruins, abandoned in my grandmother\'s day. Find what remains of it and the guild will owe you.',
    siteLoc('gws1', "Find the guild's lost waystation in the ruins", 'ruins', 'guild_waystation', 'the Lost Waystation', { xp: 120, gold: 0, items: [] }), 'guild', 'Report back to the guild', { xp: 140, gold: 200, items: [] }),
  Courier('requisition_orders', 'Requisition for the Forge', 3, 'The magistrate\'s iron requisition must reach the smith — and the roads are watched.', 'townhall', 'These requisition orders must reach the blacksmith unopened. Word is the war-bands pay well for town seals, so go armed.',
    'blacksmith', 'Deliver the requisition orders to the blacksmith', { xp: 180, gold: 190, items: [] }),

  // --- minLevel 4 ---
  Q('broodmother', 'The Broodmother', 4, 'A giant spider broods in the cave, and her young are spreading.', ['alchemist', 'apothecary'], 'The silk I buy comes from that cave, but nothing has come out of it in weeks. A broodmother has claimed it. Kill her before the valley crawls.',
    siteCombat('bro1', 'Slay the broodmother nesting in the cave', 'cave', 'cave_broodmother', 'the Cave Broodmother', { xp: 190, gold: 0, items: ['spider_silk'] }), ['alchemist', 'apothecary'], 'Tell the apothecary the silk cave is clear', { xp: 130, gold: 220, items: ['antidote'] }),
  Q('sunken_bell', 'The Sunken Bell', 4, 'The temple-of-old\'s great bell lies somewhere in the ruins.', ['temple', 'shrine'], 'When the old temple fell, its consecrated bell fell with it. Raise it from the ruins and its voice will bless this town again.',
    siteItem('bell1', 'Recover the temple bell from the ruins', 'ruins', 'sunken_bell', 'the Sunken Bell', { xp: 150, gold: 0, items: [] }), ['temple', 'shrine'], 'Bring the bell to the temple', { xp: 170, gold: 240, items: [] }),
  Q('storm_crystals', 'Storm-Charged Crystals', 4, 'A mage needs crystals that hold the mountain\'s lightning.', 'magetower', 'Ordinary crystal won\'t do — I need three storm crystals, charged where the peaks meet the sky. Dangerous country. Priced accordingly.',
    gather('stc1', 'Collect 3 storm crystals', 'storm_crystal', 3, { xp: 150, gold: 0, items: [] }, ['mountain']), 'magetower', 'Deliver the storm crystals', { xp: 170, gold: 280, items: [] }),

  // --- minLevel 5 ---
  Q('bandit_warcamp', 'Break the Warcamp', 5, 'A warband has grown from nuisance to army. The magistrate wants it broken.', 'townhall', 'This is no longer banditry, it is a warcamp. Scatter five of their raiders in the field and their nerve will break with them.',
    bounty('bwc1', "Win 5 fights in the warband's country", 5, { xp: 220, gold: 0, items: [] }), 'townhall', 'Report the warcamp broken to the magistrate', { xp: 230, gold: 400, items: [] }),
  Q('vault_of_kings', 'Regalia of the Old Kings', 5, 'The old kings\' regalia lies in a vault deep beneath the ruins.', 'bank', 'Before the crown fell, its regalia was sealed in a vault beneath what is now ruin. The bank holds the deed — recover it and the finder\'s share is princely.',
    siteItem('vok1', 'Recover the royal regalia from the deep ruins', 'ruins', 'kings_regalia', 'the Regalia of the Old Kings', { xp: 210, gold: 0, items: [] }), 'bank', 'Deliver the regalia to the bank', { xp: 230, gold: 420, items: [] }),
  Q('deep_horror', 'The Horror Below', 5, 'Miners talk of something old waking in the deepest gallery.', INN, 'The deep gallery has gone wrong. Lamps gutter, tools vanish, and old Marta swears the dark looked back at her. Whatever woke down there — end it.',
    siteCombat('dho1', 'Destroy the horror in the deep gallery of the cave', 'cave', 'gallery_horror', 'the Horror of the Deep Gallery', { xp: 260, gold: 0, items: [] }), INN, 'Tell old Marta the gallery is quiet', { xp: 180, gold: 320, items: ['rare_gem'] }),

  // --- minLevel 6 ---
  Q('wyrm_tribute', "The Wyrm's Tribute", 6, 'For years the town paid tribute to a wyrm. The lord wants it back.', 'keep', 'My predecessors bought peace with a chest of gold a year, carried to the cave and never seen again. The wyrm is gone or sleeping. Bring my treasury home.',
    siteItem('wyt1', "Recover the tribute chest from the wyrm's hoard in the cave", 'cave', 'tribute_chest', 'the Tribute Chest', { xp: 250, gold: 0, items: [] }), 'keep', 'Return the tribute to the keep', { xp: 250, gold: 500, items: [] }),
  Q('cleanse_dark_roads', 'Cleanse the Dark Roads', 6, 'The temple calls doughty souls to purge the encroaching darkness.', ['temple', 'shrine'], 'What walks the roads now is not banditry but darkness given teeth. The temple sanctifies this charge: destroy six of them, and be named a defender of the faith.',
    bounty('cdr1', 'Win 6 fights on the darkened roads', 6, { xp: 250, gold: 0, items: [] }), ['temple', 'shrine'], 'Return to the temple to be named its defender', { xp: 270, gold: 450, items: [] }),

  // --- minLevel 7 ---
  Q('sealed_gate', 'The Sealed Gate', 7, 'Beneath the ruins stands a gate the ancients sealed — and its keeper still watches.', 'magetower', 'Every ward I cast frays toward the ruins. The ancients sealed a gate down there and set a keeper on it; the keeper has outlived its purpose and now feeds the seal with stolen life. Destroy it, and bring me what it guards.',
    siteCombat('sgt1', 'Defeat the Gatekeeper beyond the sealed gate in the ruins', 'ruins', 'gatekeeper', 'the Gatekeeper of the Sealed Ways', { xp: 320, gold: 0, items: ['forbidden_knowledge'] }), 'magetower', 'Bring what the keeper guarded to the mage tower', { xp: 240, gold: 500, items: ['runic_greatsword'] }),
  // =========================================================================
  // Multi-step quests (2026-10): parallel objectives, ordered objectives and errands
  // partway through. Ordered site steps sit in DIFFERENT site types: objectives are
  // placed on site entry, so a later step in the same site would only appear after
  // leaving and re-entering.
  // =========================================================================
  Chain('millers_dispute', "The Miller's Boundary", 2, 'A neighbour claims half the mill-race is on his land.', 'mill', 'My neighbour swears the mill-race crosses onto his land. The town hall keeps the old boundary roll, and the roll names a stone in the ruins. Find it and settle this before we come to blows.',
    [
      visit('mdi1', 'Fetch the old boundary roll from the town hall', 'townhall', { xp: 20, gold: 0, items: [] }),
      after(siteLoc('mdi2', 'Find the boundary stone named in the roll, in the ruins', 'ruins', 'boundary_stone', 'the Old Boundary Stone', { xp: 70, gold: 0, items: [] }), 'mdi1'),
    ], 'mill', 'Show the miller where the boundary lies', { xp: 70, gold: 120, items: [] }),
  Chain('tax_collector', 'The Missing Tax-Collector', 3, 'The tax-collector rode out a fortnight ago and never came back.', 'townhall', 'Our tax-collector rode out with the quarter\'s takings and never came back. His road passed the old ruins. Find out what became of him.',
    [
      siteItem('tco1', "Find the tax-collector's satchel in the ruins", 'ruins', 'tax_satchel', "the Tax-Collector's Satchel", { xp: 60, gold: 0, items: [] }),
      after(siteCombat('tco2', 'Hunt down the robbers in the cave the satchel points to', 'cave', 'tithe_robbers', 'the Road Robbers', { xp: 120, gold: 0, items: [] }), 'tco1'),
    ], 'townhall', "Return the satchel and the takings to the town hall", { xp: 100, gold: 240, items: [] }),
  Chain('magistrates_warrant', "The Magistrate's Warrant", 3, 'A forger of seals hides in the ruins, and the gaol wants him.', 'jail', 'A forger has been sealing false deeds with the town\'s own seal. He hides in the ruins. Fetch the warrant from the magistrate and serve it on him.',
    [
      visit('mwa1', 'Collect the warrant from the town hall', 'townhall', { xp: 40, gold: 0, items: [] }),
      after(siteCombat('mwa2', 'Serve the warrant on the forger in the ruins', 'ruins', 'seal_forger', 'the Seal-Forger', { xp: 130, gold: 0, items: [] }), 'mwa1'),
    ], 'jail', 'Deliver the forger to the gaol', { xp: 110, gold: 200, items: [] }),
  Chain('fair_roads', 'Safe Roads for the Fair', 3, 'The fair opens soon, and merchants will not travel dangerous roads.', 'market', 'The fair opens in three days and the merchants will not travel while the roads are dangerous. And I promised the jewellers pearls to sell.',
    [
      bounty('frd1', 'Win 4 fights on the roads to town', 4, { xp: 80, gold: 0, items: [] }),
      gather('frd2', 'Collect 3 pearls for the jewellers', 'pearl', 3, { xp: 80, gold: 0, items: [] }, ['ruins']),
    ], 'market', 'Tell the market wardens the roads are open', { xp: 100, gold: 230, items: [] }),
  Chain('empty_reliquary', 'The Empty Reliquary', 4, "The temple's reliquary was stripped in the bad years.", ['temple', 'shrine'], 'Our reliquary was stripped in the bad years: the relic carried off to the ruins, the stones prised out and sold. Bring back both and it shall be whole.',
    [
      siteItem('erq1', "Recover the temple's relic from the ruins", 'ruins', 'temple_relic', "the Temple's Relic", { xp: 110, gold: 0, items: [] }),
      gather('erq2', 'Collect 3 raw gems to reset the reliquary', 'raw_gems', 3, { xp: 80, gold: 0, items: [] }, ['cave']),
    ], ['temple', 'shrine'], 'Bring the relic and the stones to the temple', { xp: 140, gold: 260, items: [] }),
  Chain('smiths_masterwork', "The Smith's Masterwork", 5, 'The smith means to forge a blade worth a lord\'s ransom.', 'blacksmith', 'I have one great blade left in me. I need rare ore and mountain crystal for it, and the foundry\'s furnace to smelt them. Bring me the bar and the blade is yours.',
    [
      gather('smw1', 'Collect 3 lumps of rare ore', 'rare_ore', 3, { xp: 100, gold: 0, items: [] }, ['hills', 'mountain']),
      gather('smw2', 'Collect 3 mountain crystals', 'mountain_crystal', 3, { xp: 100, gold: 0, items: [] }, ['mountain']),
      after(visit('smw3', 'Have the ore and crystal smelted at the foundry', 'foundry', { xp: 60, gold: 0, items: [] }), 'smw1', 'smw2'),
    ], 'blacksmith', 'Bring the smelted bar to the smith', { xp: 180, gold: 150, items: ['magic_weapon'] }),
  Chain('lost_patrol', 'The Lost Patrol', 6, 'A patrol rode out from the keep and none came back.', 'keep', 'Eight good soldiers went out on patrol and none came back. Find their last camp and learn what took them. Then end it.',
    [
      siteLoc('lpt1', "Find the patrol's last camp in the cave", 'cave', 'patrol_camp', "the Patrol's Last Camp", { xp: 120, gold: 0, items: [] }),
      after(siteCombat('lpt2', 'Destroy what slew the patrol, in the ruins its tracks lead to', 'ruins', 'patrol_slayer', 'the Patrol-Slayer', { xp: 260, gold: 0, items: [] }), 'lpt1'),
    ], 'keep', "Report the patrol's fate to the keep", { xp: 200, gold: 500, items: [] }),
  // =========================================================================
  // Trades, lords and open country (2026-10): quests for the barn, warehouse, tailor,
  // fletcher, foundry, guild and manor, and the first site objectives in forests, hills
  // and mountains.
  // =========================================================================

  // --- hamlet and farm ---
  only(['grassland', 'snow'], Q('seed_corn', 'The Seed Corn', 1, 'Thieves took the seed corn and holed up in the ruins.', 'barn', 'Thieves took the seed corn from my barn and holed up in the old ruins. No seed, no sowing, and no bread come winter.',
    siteItem('scn1', 'Recover the sacks of seed corn from the ruins', 'ruins', 'seed_corn_sacks', 'the Sacks of Seed Corn', { xp: 50, gold: 0, items: [] }), 'barn', 'Bring the seed corn home before sowing', { xp: 40, gold: 70, items: [] })),
  Courier('reeve_tally', "The Reeve's Tally", 1, "The reeve's tally sticks must reach the mill.", 'barn', "The reeve's tally sticks must reach the miller before he grinds, or he'll take his toll twice over.",
    'mill', 'Deliver the tally sticks to the mill', { xp: 40, gold: 60, items: [] }),
  only(['grassland', 'snow'], Q('strayed_flock', 'The Strayed Flock', 1, 'A flock broke loose in the storm and fled into the hills.', 'barn', "My flock broke the hurdles in the storm and went up into the hills. Find the old sheepfold; they'll have gone to ground there.",
    siteLoc('sfk1', 'Reach the old sheepfold in the hills', 'hills', 'old_sheepfold', 'the Old Sheepfold', { xp: 50, gold: 0, items: [] }), 'barn', 'Tell the shepherd where the flock lies', { xp: 40, gold: 70, items: [] })),
  Q('pilgrim_badge', "The Pilgrim's Badge", 2, "A pilgrim lost her badge at a hermit's cell in the mountains.", 'shrine', "A pilgrim lost her badge at the hermit's cell on the mountain road. Without it she cannot prove she made the journey.",
    siteItem('pgb1', "Find the pilgrim's badge at the hermit's cell in the mountains", 'mountain', 'pilgrim_badge', "the Pilgrim's Badge", { xp: 60, gold: 0, items: [] }), 'shrine', 'Return the badge to the pilgrim', { xp: 60, gold: 90, items: [] }),

  // --- town trades ---
  Q('salvage_rights', 'Salvage Rights', 1, 'A warehouse factor bought salvage rights to the ruins.', 'warehouse', "The guild sold me salvage rights to the old ruins. Bring me three bundles of anything worth selling and I'll split the take.",
    gather('slv1', 'Collect 3 bundles of salvaged goods', 'salvaged_goods', 3, { xp: 40, gold: 0, items: [] }, ['ruins']), 'warehouse', 'Bring the salvage to the warehouse', { xp: 40, gold: 80, items: [] }),
  Courier('short_weight', 'Short Weight', 2, "Someone has been shaving the warehouse's weights.", 'warehouse', "Someone's been shaving the weights on my scales. Carry the true weigh-book to the guild before the cheat does.",
    'guild', 'Deliver the weigh-book to the guild', { xp: 60, gold: 110, items: [] }),
  light(only(['grassland'], Q('dyers_madder', 'Madder for the Dyers', 1, 'The tailor needs rare blooms for a red dye.', 'tailor', "The fair is in a week and I've no red dye. Bring me three rare blooms from the forest and I'll have cloth fit for a lord.",
    gather('dym1', 'Collect 3 rare flowers', 'rare_flower', 3, { xp: 40, gold: 0, items: [] }, ['forest']), 'tailor', 'Bring the flowers to the tailor', { xp: 40, gold: 90, items: [] }))),
  light(Courier('wedding_gown', 'The Wedding Gown', 2, "A gown for the lord's daughter must reach the manor.", 'tailor', "The lord's daughter weds in three days and her gown is finished. Carry it to the manor and do not let it touch the mud.",
    'manor', 'Deliver the gown to the manor', { xp: 50, gold: 120, items: [] })),
  Courier('arrow_order', 'The Arrow Order', 1, 'The fletcher needs arrowheads from the smith.', 'fletcher', 'The smith owes me two hundred arrowheads and I owe the muster two thousand arrows. Take him my order and remind him.',
    'blacksmith', 'Deliver the order to the blacksmith', { xp: 40, gold: 70, items: [] }),
  Q('poachers_chase', 'Poachers in the Chase', 3, "Poachers are taking the lord's deer with arrows like the fletcher's.", 'fletcher', "Someone is taking the lord's deer with arrows fletched in my style, and the verderer thinks it's me. Find the poachers' leader in the forest.",
    siteCombat('pch1', 'Defeat the poacher chief in the forest', 'forest', 'poacher_chief', 'the Poacher Chief', { xp: 130, gold: 0, items: [] }), 'fletcher', "Clear the fletcher's name with the proof", { xp: 120, gold: 180, items: ['hunters_longbow'] }),
  Q('bell_metal', 'Bell-Metal', 3, 'The foundry needs rare ore to cast a great bell.', 'foundry', 'The great temple wants a new bell and the founders want good metal. Bring three lumps of rare ore from the hills or mountains.',
    gather('blm1', 'Collect 3 lumps of rare ore', 'rare_ore', 3, { xp: 120, gold: 0, items: [] }, ['hills', 'mountain']), 'foundry', 'Deliver the ore to the foundry', { xp: 130, gold: 220, items: [] }),
  Courier('guild_dues', 'Guild Dues', 1, "The guild's quarter-dues must be lodged at the bank.", 'guild', "The quarter's dues must be lodged with the bank by sundown, and I trust you more than I trust my apprentices.",
    'bank', "Lodge the guild's dues at the bank", { xp: 40, gold: 80, items: [] }),
  Q('alewife_herbs', 'Herbs for the Alewife', 1, 'The alewife needs hill herbs for her ale.', INN, 'My ale wants bitter herbs, and the hill herbs are best. Bring me three bundles and drink free all week.',
    gather('awh1', 'Collect 3 bundles of mountain herbs', 'mountain_herbs', 3, { xp: 40, gold: 0, items: [] }, ['hills', 'mountain']), INN, 'Bring the herbs to the alewife', { xp: 40, gold: 70, items: [] }),

  // --- law, lords and coin ---
  Q('disputed_charter', 'The Disputed Charter', 4, "A manor's charter to its mill rights was stolen.", 'manor', 'My family\'s charter to the mill rights was stolen and hidden in the ruins. Without it the town will seize the mill at the autumn reckoning.',
    siteItem('dch1', 'Recover the manor charter from the ruins', 'ruins', 'manor_charter', 'the Manor Charter', { xp: 150, gold: 0, items: [] }), 'townhall', 'Lay the charter before the magistrate', { xp: 160, gold: 260, items: [] }),
  Q('clipped_coin', 'The Clipped Coin', 3, 'Coin-clippers are melting their shavings in a cave.', 'bank', 'Half the silver crossing my counter is clipped. The clippers melt the shavings in a cave outside town. Shut them down.',
    siteCombat('ccn1', 'Defeat the master coiner in the cave', 'cave', 'master_coiner', 'the Master Coiner', { xp: 140, gold: 0, items: [] }), 'bank', "Report the coiners' den to the bank", { xp: 120, gold: 220, items: [] }),
  Q('highwayman', 'The Highwayman', 4, 'A highwayman works the forest road.', 'jail', 'A highwayman works the forest road and laughs at our warrants. Bring him in.',
    siteCombat('hwy1', 'Defeat the highwayman in the forest', 'forest', 'forest_highwayman', 'the Highwayman', { xp: 170, gold: 0, items: [] }), 'jail', 'Deliver the highwayman to the gaol', { xp: 150, gold: 260, items: [] }),
  Q('ridge_beacon', 'The Beacon on the Ridge', 4, 'The border beacon on the ridge has gone dark.', 'keep', 'The border beacon on the ridge has gone dark three nights running. If raiders come, we will have no warning.',
    siteLoc('rbn1', 'Reach the old beacon in the hills', 'hills', 'ridge_beacon', 'the Ridge Beacon', { xp: 150, gold: 0, items: [] }), 'keep', "Report to the keep's marshal", { xp: 160, gold: 250, items: [] }),
  Q('deserters', 'The Deserters', 5, 'Deserters took the muster pay chest into the ruins.', 'keep', "A captain and his men deserted the muster and took the pay chest with them. They're hiding in the ruins. I want the chest; the captain's fate is your affair.",
    siteCombat('dsr1', 'Defeat the deserter captain in the ruins', 'ruins', 'deserter_captain', 'the Deserter Captain', { xp: 230, gold: 0, items: [] }), 'keep', 'Return the pay chest to the keep', { xp: 220, gold: 400, items: [] }),
  Q('robber_baron', 'The Robber Baron', 5, 'A disinherited knight tolls the high road from the ruins.', 'townhall', 'A disinherited knight has walled himself into the old ruins and charges a toll on the high road. Merchants pay or vanish. End his little kingdom.',
    siteCombat('rbr1', 'Defeat the robber baron in the ruins', 'ruins', 'robber_baron', 'the Robber Baron', { xp: 230, gold: 0, items: [] }), 'townhall', 'Tell the magistrate the high road is free', { xp: 220, gold: 380, items: [] }),

  // --- temple and shrine ---
  Q('founders_bones', "The Founder's Bones", 3, "A relic-monger stole the bones of the shrine's founder.", ['temple', 'shrine'], "A relic-monger stole the bones of the shrine's founder and means to sell them in the city. He hides in the cave on the old road.",
    siteCombat('fbn1', 'Defeat the relic-monger in the cave', 'cave', 'relic_monger', 'the Relic-Monger', { xp: 140, gold: 0, items: [] }), ['temple', 'shrine'], 'Restore the bones to their altar', { xp: 120, gold: 200, items: [] }),

  // --- high level ---
  Q('oathbreaker', 'The Oathbreaker', 6, 'A knight sold the mountain pass he swore to hold.', ['keep', 'temple'], 'Sir Aldric swore to hold the mountain pass and sold it instead. He holds it now for himself, and takes his toll in blood.',
    siteCombat('obk1', 'Defeat the oathbreaker knight at the mountain pass', 'mountain', 'oathbreaker_knight', 'the Oathbreaker Knight', { xp: 280, gold: 0, items: [] }), ['keep', 'temple'], "Bring the knight's broken spurs to the keep", { xp: 260, gold: 500, items: [] }),

  // =========================================================================
  // Biome-themed quests (2026-10): `themes` limits a quest to worlds of that biome
  // (settings.theme: grassland | desert | snow). Quests without it fit any world.
  // =========================================================================

  // --- desert ---
  only(['desert'], Q('buried_well', 'The Buried Well', 1, 'Sand has swallowed the old caravan well.', INN, 'The old caravan well out by the ruins is lost under the sand. Find it and the caravans can water there again.',
    siteLoc('bwl1', 'Find the buried well near the ruins', 'ruins', 'buried_well', 'the Buried Well', { xp: 50, gold: 0, items: [] }), INN, 'Tell the caravan masters where the well lies', { xp: 40, gold: 80, items: [] })),
  only(['desert'], Courier('salt_debt', "The Salt-Trader's Debt", 2, 'A salt-trader owes the town its share of the season.', ['shop', 'market'], 'The salt-trader finally paid his dues, and I want them in the magistrate\'s hands before he changes his mind. Carry the purse to the town hall.',
    'townhall', "Deliver the salt-trader's payment to the town hall", { xp: 60, gold: 110, items: [] })),
  only(['desert'], Chain('water_caravan', 'The Lost Water Caravan', 3, 'A water caravan never reached the town.', ['shop', 'market'], 'Our water caravan never came in. If raiders have it, the wells in town will not last the month. Find out what happened.',
    [
      siteItem('wcv1', "Find the caravan master's seal in the ruins", 'ruins', 'caravan_seal', "the Caravan Master's Seal", { xp: 60, gold: 0, items: [] }),
      after(siteCombat('wcv2', 'Defeat the raiders holding the caravan in the cave', 'cave', 'dune_raiders', 'the Dune Raiders', { xp: 120, gold: 0, items: [] }), 'wcv1'),
    ], ['shop', 'market'], 'Bring the caravan home to the market', { xp: 100, gold: 240, items: [] })),
  only(['desert'], Q('robbed_tomb', 'The Robbed Tomb', 4, "Tomb robbers have broken into an old king's tomb.", ['temple', 'shrine'], 'Robbers have broken into the tomb of the old sun-kings beneath the ruins. Stop them before they strip it bare.',
    siteCombat('rtb1', 'Defeat the tomb robbers in the ruins', 'ruins', 'tomb_robber_chief', 'the Tomb Robber Chief', { xp: 160, gold: 0, items: [] }), ['temple', 'shrine'], 'Tell the temple the tomb is sealed again', { xp: 150, gold: 260, items: [] })),
  only(['desert'], Q('dune_lion', 'The Dune Lion', 5, 'A great lion is taking caravan beasts on the dunes.', ['keep', 'townhall'], 'A lion the size of a pony is taking our caravan beasts, and it drags them back to a cave in the bluffs. Kill it and the caravans can travel again.',
    siteCombat('dln1', 'Kill the dune lion in its cave', 'cave', 'dune_lion', 'the Dune Lion', { xp: 230, gold: 0, items: [] }), ['keep', 'townhall'], 'Bring the lion\'s mane to the town', { xp: 220, gold: 380, items: [] })),

  // --- snow ---
  only(['snow'], Q('snowed_lodge', 'The Snowed-In Lodge', 1, 'Hunters went up to the mountain lodge and have not come back.', INN, 'The hunters went up to the lodge before the snows closed the trail. Nobody has heard from them since. Get up there and see.',
    siteLoc('snl1', 'Reach the hunting lodge in the mountains', 'mountain', 'hunting_lodge', 'the Hunting Lodge', { xp: 50, gold: 0, items: [] }), INN, "Tell the hunters' families they are safe", { xp: 40, gold: 80, items: [] })),
  only(['snow'], Q('missing_sledge', 'The Missing Sledge', 2, 'A supply sledge went off the trail in the blizzard.', ['shop', 'market'], 'My supply sledge ran off the trail in the blizzard and slid into a cave mouth. Get it back before someone else does.',
    siteItem('msl1', 'Recover the supply sledge from the cave', 'cave', 'supply_sledge', 'the Supply Sledge', { xp: 60, gold: 0, items: [] }), ['shop', 'market'], 'Return the sledge to the merchant', { xp: 60, gold: 100, items: [] })),
  only(['snow'], Q('winter_furs', 'Furs for the Winter', 2, 'The tailor needs bear pelts before the deep cold.', 'tailor', 'The deep cold is coming and half the town has no proper cloak. Bring me three bear pelts from the mountains.',
    gather('wfr1', 'Collect 3 bear pelts', 'bear_pelt', 3, { xp: 50, gold: 0, items: [] }, ['mountain']), 'tailor', 'Bring the pelts to the tailor', { xp: 50, gold: 100, items: [] })),
  only(['snow'], Chain('thaw_fever', 'The Thaw Fever', 3, 'A fever spreads with the thaw, and the apothecary is out of herbs.', ['alchemist', 'apothecary'], 'Every thaw brings the fever, and this year I have nothing left to brew with. I need hill herbs and forest herbs both.',
    [
      gather('tfv1', 'Collect 3 bundles of mountain herbs', 'mountain_herbs', 3, { xp: 80, gold: 0, items: [] }, ['hills', 'mountain']),
      gather('tfv2', 'Collect 3 bundles of healing herbs', 'healing_herbs', 3, { xp: 80, gold: 0, items: [] }, ['forest']),
    ], ['alchemist', 'apothecary'], 'Bring the herbs to the apothecary', { xp: 110, gold: 220, items: [] })),
  only(['snow'], Q('white_wolf', 'The White Wolf', 4, 'A white wolf is driving the packs down into the villages.', ['keep', 'townhall'], 'A white wolf leads the packs now, and it has driven them right to our doors. Kill it in the forest and the rest will scatter.',
    siteCombat('wwf1', 'Kill the white wolf in the forest', 'forest', 'white_wolf', 'the White Wolf', { xp: 160, gold: 0, items: [] }), ['keep', 'townhall'], 'Bring the white pelt to the town', { xp: 150, gold: 260, items: [] })),
  // =========================================================================
  // Horror quests (2026-10): tone 'horror' keeps them to Dark games (Grimdark Survival,
  // Eldritch Horror, or a custom Dark game).
  // =========================================================================
  horror(Q('plague_pit', 'The Plague Pit', 1, 'The dead of the last sickness were never buried.', ['apothecary', 'alchemist'], 'The dead of the last sickness were tipped into a pit in the old ruins and left open. The crows carry it back to us. Find the pit so we can burn it.',
    siteLoc('ppt1', 'Find the plague pit in the ruins', 'ruins', 'plague_pit', 'the Plague Pit', { xp: 50, gold: 0, items: [] }), ['apothecary', 'alchemist'], 'Tell the apothecary where the pit lies', { xp: 40, gold: 80, items: [] })),
  horror(Q('corpse_lights', 'The Corpse Lights', 2, 'Pale lights in the forest lead travellers off the road.', INN, 'Three travellers followed pale lights off the forest road this month. We found two of them drowned in a pool no deeper than your knee. Put out whatever makes those lights.',
    siteCombat('crl1', 'Destroy the thing behind the lights in the forest', 'forest', 'corpse_light', 'the Corpse Light', { xp: 90, gold: 0, items: [] }), INN, 'Tell the inn the forest road is safe', { xp: 80, gold: 160, items: [] })),
  horror(Q('emptied_graves', 'The Emptied Graves', 3, 'Fresh graves are being opened from below.', ['keep', 'townhall'], 'Our fresh graves are opening from beneath, and the dead dragged off down tunnels that run to the cave. Go down there and end it.',
    siteCombat('egr1', 'Kill the ghoul matriarch in the cave', 'cave', 'ghoul_matriarch', 'the Ghoul Matriarch', { xp: 130, gold: 0, items: [] }), ['keep', 'townhall'], 'Tell the town the graves are quiet', { xp: 120, gold: 220, items: [] })),
  horror(Chain('whispering_well', 'The Whispering Well', 3, 'The town well whispers names at night.', INN, 'At night the well whispers names, and the people it names walk out into the dark and do not come back. Find where the water runs and what is calling them.',
    [
      siteLoc('wwl1', "Follow the well's water to the old cistern in the ruins", 'ruins', 'old_cistern', 'the Old Cistern', { xp: 60, gold: 0, items: [] }),
      after(siteCombat('wwl2', 'Destroy the thing that whispers in the cave', 'cave', 'well_whisperer', 'the Whisperer', { xp: 120, gold: 0, items: [] }), 'wwl1'),
    ], INN, 'Tell the town the well is silent', { xp: 100, gold: 220, items: [] })),
  horror(Chain('faceless_stranger', 'The Faceless Stranger', 5, 'A hooded stranger has bought every mirror in town.', ['library', 'archives'], 'A stranger in a deep hood bought every mirror in town, and those who saw beneath the hood will not speak of it. He carried the mirrors out to the ruins. Find out why, and stop him.',
    [
      siteItem('fcs1', "Find the stranger's black mirror in the ruins", 'ruins', 'black_mirror', 'the Black Mirror', { xp: 100, gold: 0, items: [] }),
      siteCombat('fcs2', 'Defeat the faceless one in the ruins', 'ruins', 'faceless_one', 'the Faceless One', { xp: 200, gold: 0, items: [] }),
    ], ['library', 'archives'], 'Bring the black mirror to the library', { xp: 220, gold: 440, items: [] })),
];

// Quest "find" items aren't real catalog items (kept unique so random loot can't complete
// a quest early). For inventory display they BORROW an existing item's icon — no new art.
// Maps quest item id -> the ITEM_CATALOG id whose icon to reuse.
export const QUEST_ITEM_ICON_FROM = {
  silver_locket: 'enchanted_trinket',
  lost_songbook: 'history_tome',
  holy_relic: 'artifact_trinket',
  ancient_relic: 'artifact_trinket',
  lost_codex: 'history_tome',
  stolen_ledger: 'history_tome',
  cure_root: 'healing_herbs',
  stolen_blade: 'silver_dagger',
  lost_cargo: 'salvaged_goods',
  ferry_strongbox: 'drowned_treasure',
  sunken_bell: 'artifact_trinket',
  kings_regalia: 'legendary_artifact',
  tribute_chest: 'ancient_gold',
  tax_satchel: 'salvaged_goods',
  temple_relic: 'artifact_trinket',
  seed_corn_sacks: 'salvaged_goods',
  pilgrim_badge: 'enchanted_trinket',
  manor_charter: 'history_tome',
  caravan_seal: 'enchanted_trinket',
  supply_sledge: 'salvaged_goods',
  black_mirror: 'enchanted_trinket',
};

// Per-boss presentation for site-combat objectives, keyed by enemy id. makeBossEncounter
// (sitePopulator.js) borrows a hard encounter from the site's pool for stats and damage, and
// overlays these fields so each boss has its own art, actions and outcome text.
export const SIDE_QUEST_BOSSES = {
  cave_tyrant: {
    icon: '🐻',
    image: '/assets/encounters/cave_lurker.webp',
    description: 'A hulking beast rises from a bed of gnawed bones, the reek of the farms\' lost livestock thick about it.',
    suggestedActions: [
      { label: 'Attack', skill: 'Athletics', description: 'Meet the beast head-on' },
      { label: 'Goad It', skill: 'Survival', description: 'Read its rushes and turn them against it' },
      { label: 'Dodge', skill: 'Acrobatics', description: 'Slip aside from its charge' },
      { label: 'Retreat', skill: 'Athletics', description: 'Fall back toward the entrance' },
    ],
    consequences: {
      criticalSuccess: 'The beast crashes down and does not rise. No more livestock will vanish in the night.',
      success: 'After a brutal struggle the beast lies still among its bones.',
      failure: 'Claws rake you as the beast drives you back against the rock.',
      criticalFailure: 'The beast mauls you badly before you scramble clear of its den.',
    },
  },
  fugitive: {
    icon: '🗡️',
    image: '/assets/encounters/suspicious_stranger.webp',
    description: 'The cutpurse crouches behind a heap of stolen purses, knife out, eyes on the way you came in.',
    suggestedActions: [
      { label: 'Seize', skill: 'Athletics', description: 'Close the distance and grapple' },
      { label: 'Corner', skill: 'Perception', description: 'Cut off every way out' },
      { label: 'Talk Down', skill: 'Persuasion', description: 'Convince them surrender is the better bargain' },
      { label: 'Intimidate', skill: 'Intimidation', description: 'Make it plain how this ends' },
    ],
    consequences: {
      criticalSuccess: 'The cutpurse drops the knife and holds out their wrists. The stolen purses are all here.',
      success: 'You wrestle the cutpurse down and bind their hands.',
      failure: 'The knife flicks out and opens a cut before you can close in.',
      criticalFailure: 'The cutpurse slashes you and nearly slips past into the dark.',
    },
  },
  smuggler_captain: {
    icon: '🏴',
    image: '/assets/encounters/bosses/bandit_king.webp',
    description: 'Among stacked crates of untaxed cargo, the smuggler captain draws a cutlass and whistles up the crew.',
    suggestedActions: [
      { label: 'Fight', skill: 'Athletics', description: 'Cross blades with the captain' },
      { label: 'Topple Crates', skill: 'Athletics', description: 'Bring the stacked cargo down on the crew' },
      { label: 'Flank', skill: 'Stealth', description: 'Slip round the crates and strike from the side' },
      { label: 'Bargain', skill: 'Persuasion', description: 'Offer the crew a way out if they abandon their captain' },
    ],
    consequences: {
      criticalSuccess: 'The captain yields and the crew throw down their arms. The harbour\'s ledgers will balance again.',
      success: 'The captain falls and the rest of the crew flee into the tunnels.',
      failure: 'The cutlass bites deep as the crew press in around you.',
      criticalFailure: 'The smugglers drive you back among the crates, bloodied and outnumbered.',
    },
  },
  cave_broodmother: {
    icon: '🕷️',
    image: '/assets/encounters/cave_spider_nest.webp',
    description: 'The broodmother hangs above a carpet of egg-sacs, legs as long as spears, while her young skitter at the edges of the light.',
    suggestedActions: [
      { label: 'Attack', skill: 'Athletics', description: 'Strike at her body between the legs' },
      { label: 'Burn the Sacs', skill: 'Survival', description: 'Set fire to the eggs and draw her down' },
      { label: 'Dodge', skill: 'Acrobatics', description: 'Keep clear of her fangs' },
      { label: 'Retreat', skill: 'Athletics', description: 'Pull back before the young swarm you' },
    ],
    consequences: {
      criticalSuccess: 'The broodmother curls and dies, and her eggs blacken in the flames. The valley is safe from her brood.',
      success: 'The broodmother falls from her web and lies still.',
      failure: 'Her fangs find you and the venom burns as it spreads.',
      criticalFailure: 'Her young swarm over you and you stagger back, poisoned and weak.',
    },
  },
  gallery_horror: {
    icon: '👁️',
    image: '/assets/encounters/bosses/worm_that_walks.webp',
    description: 'Something old and many-limbed uncoils from the deepest gallery. The lamps gutter as it turns toward you.',
    suggestedActions: [
      { label: 'Attack', skill: 'Athletics', description: 'Hack at whatever you can reach' },
      { label: 'Steady Nerves', skill: 'Insight', description: 'Hold your mind against its gaze' },
      { label: 'Use the Shafts', skill: 'Survival', description: 'Draw it into the old workings and bring them down' },
      { label: 'Retreat', skill: 'Athletics', description: 'Run for the upper galleries' },
    ],
    consequences: {
      criticalSuccess: 'The horror shrieks and collapses into the dark it came from. The lamps burn steady again.',
      success: 'The horror sinks back into the deep and goes still.',
      failure: 'Its gaze bores into you and your hands shake on your weapon.',
      criticalFailure: 'It hurls you against the gallery wall and the lamps die around you.',
    },
  },
  wraith_lord: {
    icon: '👻',
    image: '/assets/encounters/ruin_ghost.webp',
    description: 'A crowned shade rises from a broken throne, cold light spilling from its eyes, and the air turns to frost.',
    suggestedActions: [
      { label: 'Attack', skill: 'Athletics', description: 'Strike through the chill' },
      { label: 'Break Its Hold', skill: 'Arcana', description: 'Sever the bond that keeps it here' },
      { label: 'Endure', skill: 'Athletics', description: 'Weather its touch and press on' },
      { label: 'Retreat', skill: 'Athletics', description: 'Fall back from the throne room' },
    ],
    consequences: {
      criticalSuccess: 'The wraith lord unravels into mist with a long sigh. Travellers can pass the ruins safely again.',
      success: 'The wraith lord fades, its crown clattering to the stones.',
      failure: 'Its cold touch saps the strength from your limbs.',
      criticalFailure: 'The wraith lord\'s wail drives you from the ruins, shaking and drained.',
    },
  },
  arcane_horror: {
    icon: '🌀',
    image: '/assets/encounters/bosses/shadow_stalker.webp',
    description: 'A shape of wrong angles pours through a tear in the air, and the stones around the rift begin to float.',
    suggestedActions: [
      { label: 'Attack', skill: 'Athletics', description: 'Strike before it fully crosses over' },
      { label: 'Seal the Rift', skill: 'Arcana', description: 'Force the tear closed behind it' },
      { label: 'Dodge', skill: 'Acrobatics', description: 'Keep away from its reaching limbs' },
      { label: 'Retreat', skill: 'Athletics', description: 'Get clear of the rift' },
    ],
    consequences: {
      criticalSuccess: 'The horror is torn back through the rift, and the tear snaps shut behind it.',
      success: 'The horror dissolves and the floating stones fall back to earth.',
      failure: 'Raw power lashes out from the rift and sears you.',
      criticalFailure: 'The rift flares and throws you across the chamber.',
    },
  },
  gatekeeper: {
    icon: '🗿',
    image: '/assets/encounters/bosses/rune_golem.webp',
    description: 'Before the sealed gate stands its keeper, carved stone veined with stolen light. It steps forward to bar your way.',
    suggestedActions: [
      { label: 'Attack', skill: 'Athletics', description: 'Batter at the keeper\'s stone' },
      { label: 'Read the Runes', skill: 'Arcana', description: 'Find the flaw in its binding' },
      { label: 'Outmanoeuvre', skill: 'Acrobatics', description: 'Stay inside its reach and strike at the joints' },
      { label: 'Retreat', skill: 'Athletics', description: 'Back away from the gate' },
    ],
    consequences: {
      criticalSuccess: 'The keeper\'s runes go dark and it crumbles. The gate stands open, and what it guarded is yours.',
      success: 'The keeper cracks apart and falls silent before the gate.',
      failure: 'A stone fist slams into you and drives the breath from your chest.',
      criticalFailure: 'The keeper hurls you back from the gate, battered and bleeding.',
    },
  },
  tithe_robbers: {
    icon: '🪓',
    image: '/assets/encounters/bandit_roadblock.webp',
    description: 'The road robbers have made a den of the cave mouth, the tax-collector\'s strongbox broken open at their feet.',
    suggestedActions: [
      { label: 'Fight', skill: 'Athletics', description: 'Take them head-on' },
      { label: 'Ambush', skill: 'Stealth', description: 'Strike before they reach their weapons' },
      { label: 'Intimidate', skill: 'Intimidation', description: 'Tell them the town\'s men are right behind you' },
      { label: 'Retreat', skill: 'Athletics', description: 'Pull back out of the cave' },
    ],
    consequences: {
      criticalSuccess: 'The robbers throw down their weapons. The tax-collector, bound but alive, is at the back of the cave with most of the takings.',
      success: 'The last robber falls and the stolen takings are yours to return.',
      failure: 'An axe catches you as the robbers rush you together.',
      criticalFailure: 'The robbers drive you out of the cave, bleeding and outnumbered.',
    },
  },
  seal_forger: {
    icon: '🖋️',
    image: '/assets/encounters/mysterious_stranger.webp',
    description: 'Among stacks of forged deeds and a brazier of melted wax, the forger looks up from his work and reaches for a blade.',
    suggestedActions: [
      { label: 'Arrest', skill: 'Athletics', description: 'Seize him before he can run' },
      { label: 'Read the Warrant', skill: 'Persuasion', description: 'Lay out the charge and the penalty for resisting' },
      { label: 'Watch His Hands', skill: 'Insight', description: 'Spot the trick before he springs it' },
      { label: 'Retreat', skill: 'Athletics', description: 'Back away from the brazier' },
    ],
    consequences: {
      criticalSuccess: 'The forger surrenders with his seals and false deeds intact, evidence enough for any magistrate.',
      success: 'You overpower the forger and gather up his forged seals.',
      failure: 'He flings hot wax and slashes at you as you flinch.',
      criticalFailure: 'The forger kicks the brazier over and you stagger back through the smoke, burned.',
    },
  },
  patrol_slayer: {
    icon: '💀',
    image: '/assets/encounters/bosses/feral_ghoul.webp',
    description: 'Among the scattered shields of the lost patrol, a gaunt thing rises from its feeding and turns its eyes on you.',
    suggestedActions: [
      { label: 'Attack', skill: 'Athletics', description: 'Avenge the patrol' },
      { label: 'Shield Wall', skill: 'Athletics', description: 'Hold together and take its charge' },
      { label: 'Use the Ruins', skill: 'Survival', description: 'Draw it into the rubble where it cannot leap' },
      { label: 'Retreat', skill: 'Athletics', description: 'Fall back from the ruins' },
    ],
    consequences: {
      criticalSuccess: 'The thing falls and does not rise. You gather the patrol\'s badges to carry home.',
      success: 'The creature lies dead among the patrol\'s shields.',
      failure: 'Its claws tear through your guard as it springs.',
      criticalFailure: 'It drags you down and you barely break free, torn and shaken.',
    },
  },
  master_coiner: {
    icon: '🪙',
    image: '/assets/encounters/hidden_cache.webp',
    description: 'By the glow of a crucible full of melted shavings, the master coiner lifts a pair of red-hot tongs and calls his workmen to him.',
    suggestedActions: [
      { label: 'Fight', skill: 'Athletics', description: 'Close on the coiner before the workmen gather' },
      { label: 'Upset the Crucible', skill: 'Acrobatics', description: 'Tip the molten silver between you and them' },
      { label: 'Intimidate', skill: 'Intimidation', description: 'Remind the workmen what the law does to coiners' },
      { label: 'Retreat', skill: 'Athletics', description: 'Back out of the workshop' },
    ],
    consequences: {
      criticalSuccess: 'The workmen flee and the coiner yields beside his dies and moulds, all the proof the bank could want.',
      success: 'The coiner falls and his workshop goes quiet.',
      failure: 'The hot tongs catch you across the arm as the workmen close in.',
      criticalFailure: 'Molten silver spatters you and you stagger out of the smoke, burned.',
    },
  },
  relic_monger: {
    icon: '🦴',
    image: '/assets/encounters/traveling_merchant.webp',
    description: 'The relic-monger crouches over a bundle wrapped in altar cloth, a hired bravo at each shoulder and a knife in his own hand.',
    suggestedActions: [
      { label: 'Fight', skill: 'Athletics', description: 'Cut through his bravos' },
      { label: 'Outbid', skill: 'Persuasion', description: 'Offer the bravos more to walk away' },
      { label: 'Snatch the Bundle', skill: 'Sleight of Hand', description: 'Get the bones clear before he can harm them' },
      { label: 'Retreat', skill: 'Athletics', description: 'Pull back into the tunnels' },
    ],
    consequences: {
      criticalSuccess: 'His bravos abandon him and the relic-monger hands over the bundle, the founder\'s bones unharmed.',
      success: 'The relic-monger and his bravos lie beaten, and the bones are safe.',
      failure: 'A bravo\'s club catches you as the relic-monger clutches the bundle tighter.',
      criticalFailure: 'The bravos drive you back and the relic-monger laughs as you retreat.',
    },
  },
  deserter_captain: {
    icon: '⚔️',
    image: '/assets/encounters/bosses/warlord.webp',
    description: 'The deserter captain sits on the stolen pay chest with his sword across his knees. His men form up behind him, still in the keep\'s colours.',
    suggestedActions: [
      { label: 'Fight', skill: 'Athletics', description: 'Cross swords with the captain' },
      { label: 'Call Them Back', skill: 'Persuasion', description: 'Offer the men a pardon if they return to the muster' },
      { label: 'Break the Line', skill: 'Athletics', description: 'Drive through the line to the chest' },
      { label: 'Retreat', skill: 'Athletics', description: 'Fall back out of the ruins' },
    ],
    consequences: {
      criticalSuccess: 'His men lower their spears and the captain stands alone. He yields the chest without another blow.',
      success: 'The captain falls, his men scatter, and the pay chest is yours to return.',
      failure: 'Soldiers\' drill tells: their spears drive you back.',
      criticalFailure: 'The deserters close ranks and beat you out of the ruins.',
    },
  },
  robber_baron: {
    icon: '🏰',
    image: '/assets/encounters/bosses/bandit_king.webp',
    description: 'From a broken hall he has roofed and barred, the robber baron steps out in old plate, his men-at-arms behind him.',
    suggestedActions: [
      { label: 'Fight', skill: 'Athletics', description: 'Meet the baron blade to blade' },
      { label: 'Challenge', skill: 'Intimidation', description: 'Call him out to fight alone, as a knight' },
      { label: 'Find the Gaps', skill: 'Perception', description: 'Look for the weak joints in his old armour' },
      { label: 'Retreat', skill: 'Athletics', description: 'Withdraw from his hall' },
    ],
    consequences: {
      criticalSuccess: 'The baron goes down in his own hall and his men throw open the gate. The high road is free.',
      success: 'The robber baron falls, and his men-at-arms flee into the hills.',
      failure: 'His heavy blade crashes through your guard.',
      criticalFailure: 'The baron\'s men pour out of the hall and drive you off, battered.',
    },
  },
  poacher_chief: {
    icon: '🏹',
    image: '/assets/encounters/abandoned_campsite.webp',
    description: 'Deer carcasses hang from the trees around the poachers\' camp. Their chief nocks an arrow fletched exactly in the fletcher\'s style.',
    suggestedActions: [
      { label: 'Charge', skill: 'Athletics', description: 'Close the distance before he can loose again' },
      { label: 'Stalk', skill: 'Stealth', description: 'Move through the trees and take him from behind' },
      { label: 'Take Cover', skill: 'Survival', description: 'Use the trees to stay out of his sight' },
      { label: 'Retreat', skill: 'Athletics', description: 'Fall back out of bowshot' },
    ],
    consequences: {
      criticalSuccess: 'The poacher chief surrenders with his quiver of copied arrows, all the proof the fletcher needs.',
      success: 'The poacher chief falls among his stolen deer.',
      failure: 'An arrow takes you in the shoulder as you cross the clearing.',
      criticalFailure: 'Arrows hiss out of the trees and you are driven back, bleeding.',
    },
  },
  forest_highwayman: {
    icon: '🎭',
    image: '/assets/encounters/bandit_roadblock.webp',
    description: 'A masked rider steps his horse out onto the forest road, a crossbow levelled and a grin under the mask.',
    suggestedActions: [
      { label: 'Fight', skill: 'Athletics', description: 'Drag him from the saddle' },
      { label: 'Spook the Horse', skill: 'Animal Handling', description: 'Startle his mount and unseat him' },
      { label: 'Bluff', skill: 'Deception', description: 'Pretend to hand over your purse, then strike' },
      { label: 'Retreat', skill: 'Athletics', description: 'Get off the road and into the trees' },
    ],
    consequences: {
      criticalSuccess: 'The highwayman tumbles from the saddle and you bind him before he can rise. The gaol will be glad of him.',
      success: 'The highwayman is beaten and his horse bolts riderless down the road.',
      failure: 'A bolt grazes you as he wheels his horse around for another pass.',
      criticalFailure: 'He rides you down and is gone into the trees, laughing.',
    },
  },
  oathbreaker_knight: {
    icon: '🛡️',
    image: '/assets/encounters/bosses/fallen_paladin.webp',
    description: 'At the head of the pass waits Sir Aldric, his oath-shield turned to the wall of the gatehouse behind him and his sword already drawn.',
    suggestedActions: [
      { label: 'Fight', skill: 'Athletics', description: 'Face the knight in the pass' },
      { label: 'Shame Him', skill: 'Persuasion', description: 'Remind him of the oath he broke' },
      { label: 'Use the Slope', skill: 'Survival', description: 'Fight from the high ground of the pass' },
      { label: 'Retreat', skill: 'Athletics', description: 'Give ground down the mountain road' },
    ],
    consequences: {
      criticalSuccess: 'Sir Aldric kneels in the snow and unbuckles his spurs. The pass belongs to the keep again.',
      success: 'The oathbreaker falls at the head of the pass he betrayed.',
      failure: 'His sword work is a knight\'s, and it cuts you badly.',
      criticalFailure: 'Sir Aldric drives you back down the mountain road, bleeding.',
    },
  },
  dune_raiders: {
    icon: '🏜️',
    image: '/assets/encounters/sandstorm_hideout_arrival.webp',
    description: 'The raiders have dragged the water casks deep into the cave. Their leader stands on a cask with a curved blade drawn.',
    suggestedActions: [
      { label: 'Fight', skill: 'Athletics', description: 'Take the fight to the raiders' },
      { label: 'Douse the Torches', skill: 'Stealth', description: 'Fight them in the dark, where their numbers count for less' },
      { label: 'Intimidate', skill: 'Intimidation', description: 'Make them think the town guard is behind you' },
      { label: 'Retreat', skill: 'Athletics', description: 'Pull back to the cave mouth' },
    ],
    consequences: {
      criticalSuccess: 'The raiders break and run. The water casks are all here, barely touched.',
      success: 'The raiders fall or flee, and the caravan is yours to bring home.',
      failure: 'A curved blade opens a cut as the raiders surround you.',
      criticalFailure: 'The raiders drive you out into the sun, bleeding and parched.',
    },
  },
  tomb_robber_chief: {
    icon: '⚱️',
    image: '/assets/encounters/ruin_scavengers.webp',
    description: 'Lamps flicker over broken grave-goods. The robbers\' chief looks up from a gilded coffin with a crowbar in his hand.',
    suggestedActions: [
      { label: 'Fight', skill: 'Athletics', description: 'Drive the robbers off the tomb' },
      { label: 'Trigger the Wards', skill: 'Investigation', description: 'Set off the tomb\'s old traps under the robbers' },
      { label: 'Intimidate', skill: 'Intimidation', description: 'Warn them what the old kings do to thieves' },
      { label: 'Retreat', skill: 'Athletics', description: 'Back out of the tomb' },
    ],
    consequences: {
      criticalSuccess: 'The robbers drop their loot and flee into the dark. The tomb\'s treasures are untouched.',
      success: 'The chief falls and his men scatter, leaving the grave-goods behind.',
      failure: 'The crowbar catches you hard across the ribs.',
      criticalFailure: 'The robbers bury you under a toppled statue and escape with their loot.',
    },
  },
  dune_lion: {
    icon: '🦁',
    image: '/assets/encounters/forest_beast.webp',
    description: 'Bones of camels and mules litter the cave floor. The dune lion rises from them, mane dusted with sand, and roars.',
    suggestedActions: [
      { label: 'Attack', skill: 'Athletics', description: 'Meet the lion head-on' },
      { label: 'Spear Wall', skill: 'Survival', description: 'Brace weapons and let it charge onto them' },
      { label: 'Dodge', skill: 'Acrobatics', description: 'Roll clear of its leap' },
      { label: 'Retreat', skill: 'Athletics', description: 'Back out of its den' },
    ],
    consequences: {
      criticalSuccess: 'The lion falls with one last roar. The caravan routes are safe again.',
      success: 'After a savage fight the dune lion lies dead among its bones.',
      failure: 'Its claws rake you as it springs.',
      criticalFailure: 'The lion mauls you badly before you can drag yourself out of its den.',
    },
  },
  white_wolf: {
    icon: '🐺',
    image: '/assets/encounters/wolf_pack.webp',
    description: 'Out of the snow-heavy trees steps a wolf as white as the drifts, its pack fanning out behind it.',
    suggestedActions: [
      { label: 'Attack', skill: 'Athletics', description: 'Go straight for the white wolf' },
      { label: 'Back to Back', skill: 'Survival', description: 'Stand together so the pack cannot flank you' },
      { label: 'Fire', skill: 'Survival', description: 'Light a brand and drive the pack back' },
      { label: 'Retreat', skill: 'Athletics', description: 'Fall back through the trees' },
    ],
    consequences: {
      criticalSuccess: 'The white wolf falls and the pack melts away into the snow. The villages will sleep easier.',
      success: 'The white wolf lies dead in the snow, and its pack scatters.',
      failure: 'Teeth close on your arm as the pack darts in.',
      criticalFailure: 'The pack drags you down in the snow, and you barely fight your way out.',
    },
  },
  corpse_light: {
    icon: '🕯️',
    image: '/assets/encounters/strange_lights.webp',
    description: 'The pale light drifts over black water, and beneath it something thin and drowned rises to meet you.',
    suggestedActions: [
      { label: 'Attack', skill: 'Athletics', description: 'Strike at the shape beneath the light' },
      { label: 'Look Away', skill: 'Insight', description: 'Refuse the light\'s pull and keep your footing' },
      { label: 'Douse It', skill: 'Survival', description: 'Drive it out onto open ground, away from the water' },
      { label: 'Retreat', skill: 'Athletics', description: 'Back away toward the road' },
    ],
    consequences: {
      criticalSuccess: 'The light gutters out and the drowned thing sinks for good. The forest road is dark and quiet again.',
      success: 'The thing slips under the water and the light goes out with it.',
      failure: 'The light fills your eyes and you stumble knee-deep into the pool.',
      criticalFailure: 'Cold hands drag you under, and you claw your way out half-drowned.',
    },
  },
  ghoul_matriarch: {
    icon: '🧟',
    image: '/assets/encounters/bosses/feral_ghoul.webp',
    description: 'In a den of stolen shrouds crouches a long-limbed ghoul, grey and swollen, her brood scuttling about her.',
    suggestedActions: [
      { label: 'Attack', skill: 'Athletics', description: 'Cut through the brood to reach her' },
      { label: 'Fire', skill: 'Survival', description: 'Use torches to keep the brood at bay' },
      { label: 'Steady Nerves', skill: 'Insight', description: 'Hold your ground against the stench and the screaming' },
      { label: 'Retreat', skill: 'Athletics', description: 'Fall back up the tunnel' },
    ],
    consequences: {
      criticalSuccess: 'The matriarch falls and her brood flees into the deep tunnels. No more graves will open.',
      success: 'The matriarch lies still among the shrouds, and the brood scatters.',
      failure: 'Her claws open a gash, and the wound burns.',
      criticalFailure: 'The brood swarms you and you barely escape up the tunnel.',
    },
  },
  well_whisperer: {
    icon: '🐙',
    image: '/assets/encounters/bosses/deep_one_scout.webp',
    description: 'Something rises from the black water at the back of the cave, its voice the same whisper as the well, and it speaks your name.',
    suggestedActions: [
      { label: 'Attack', skill: 'Athletics', description: 'Strike before it finishes speaking' },
      { label: 'Shut It Out', skill: 'Insight', description: 'Hold your mind against the whispering' },
      { label: 'Break the Voice', skill: 'Arcana', description: 'Find what carries its voice to the well and sever it' },
      { label: 'Retreat', skill: 'Athletics', description: 'Back away from the water' },
    ],
    consequences: {
      criticalSuccess: 'The whisperer sinks back into the dark water with a last hiss. In town, the well falls silent.',
      success: 'The whisperer slides beneath the water and stays down.',
      failure: 'Its whisper fills your head and you lose a moment you cannot account for.',
      criticalFailure: 'The voice drives you, stumbling, out of the cave and into the cold.',
    },
  },
  faceless_one: {
    icon: '🎭',
    image: '/assets/encounters/bosses/old_god_herald.webp',
    description: 'Ringed by the town\'s mirrors, the stranger lowers his hood. There is no face beneath it, and every mirror shows you instead.',
    suggestedActions: [
      { label: 'Attack', skill: 'Athletics', description: 'Strike at the thing beneath the hood' },
      { label: 'Break the Mirrors', skill: 'Athletics', description: 'Smash the mirrors that ring him' },
      { label: 'Steady Nerves', skill: 'Insight', description: 'Do not look at your reflections' },
      { label: 'Retreat', skill: 'Athletics', description: 'Get out of the circle' },
    ],
    consequences: {
      criticalSuccess: 'The mirrors crack one after another and the faceless one comes apart with them. The ruins are only ruins again.',
      success: 'The faceless one falls, and the reflections in the mirrors are your own again.',
      failure: 'Your reflections reach for you, and you feel their cold hands.',
      criticalFailure: 'The mirrors fill with you, and you flee before they can step out.',
    },
  },
};

// Fresh, mutable copy of the FULL pool (debug page; new games use selectSideQuests).
export const initialSideQuests = () => SIDE_QUESTS.map((q) => ({
  ...q,
  milestones: q.milestones.map((m) => ({ ...m, completed: false, progress: 0 })),
  status: 'available',
}));

export default SIDE_QUESTS;
