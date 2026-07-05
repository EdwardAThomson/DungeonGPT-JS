// sideQuests.js
// POOL of optional side quests. At new-game time the game SELECTS a map-fitting few
// (questEngine.selectSideQuests / isQuestEligible) and reveals each at its giver building
// once the party is strong enough (minLevel vs effective party level). Each quest is a
// chain: an objective step (item/combat/location, optionally `count`, optionally `site`)
// then a turn-in step (return to giver, or courier to another building).
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

const INN = ['inn', 'tavern'];

export const SIDE_QUESTS = [
  // --- tavern / inn ---
  Q('lost_heirloom', 'The Lost Heirloom', 2, "A villager's silver locket was lost in the cave.", INN, 'My family\'s locket is lost in the cave. Bring it back to me.',
    siteItem('lh1', 'Recover the silver locket from the cave', 'cave', 'silver_locket', 'the Silver Locket', { xp: 60, gold: 0, items: [] }), INN, 'Return the locket to its owner', { xp: 60, gold: 120, items: [] }),
  Q('prove_mettle', 'Prove Your Mettle', 2, 'A captain wants seasoned blades.', INN, 'Show me you can fight — best three foes out in the wilds and come back.',
    bounty('pm1', 'Defeat 3 foes in the wilds', 3, { xp: 60, gold: 0, items: [] }), INN, undefined, { xp: 80, gold: 120, items: [] }),
  Q('bards_songbook', "The Bard's Lost Songbook", 2, 'A bard left her prized songbook in the ruins.', INN, 'My songbook is lost among the old ruins. I\'d pay dearly to sing from it again.',
    siteItem('bs1', 'Recover the lost songbook from the ruins', 'ruins', 'lost_songbook', 'the Lost Songbook', { xp: 60, gold: 0, items: [] }), INN, 'Return the songbook to the bard', { xp: 50, gold: 110, items: [] }),
  Q('singing_cavern', 'The Singing Cavern', 1, 'Travellers speak of a hollow that sings on the wind.', INN, 'They say a deep hollow in the cave sings on the wind. See it and tell me true.',
    siteLoc('sc1', 'Reach the echoing hollow in the cave', 'cave', 'echo_hollow', 'the Echoing Hollow', { xp: 50, gold: 0, items: [] }), INN, 'Bring back the tale', { xp: 50, gold: 80, items: [] }),
  Courier('sealed_letter', 'A Letter for the Magistrate', 1, 'Carry a sealed letter to the town hall.', INN, 'Carry this sealed letter to the magistrate at the town hall. Discreetly.',
    'townhall', 'Deliver the sealed letter to the town hall', { xp: 50, gold: 100, items: [] }),

  // --- tavern / shop ---
  Q('cave_beast', 'The Beast Below', 3, 'A beast lairs in the cave and raids the farms.', ['tavern', 'shop'], 'A beast in the cave takes our livestock by night. End it.',
    siteCombat('cb1', 'Slay the beast lairing in the cave', 'cave', 'cave_tyrant', 'the Cave Tyrant', { xp: 150, gold: 0, items: ['raw_gems'] }), ['tavern', 'shop'], undefined, { xp: 120, gold: 150, items: [] }),
  Q('caravan_refund', 'Refund in Blood', 2, 'Bandits robbed a merchant caravan.', ['shop', 'market'], 'Bandits robbed my caravan. Make them pay and I\'ll see you compensated.',
    bounty('cr1', 'Defeat 3 bandits in the wilds', 3, { xp: 70, gold: 0, items: [] }), ['shop', 'market'], undefined, { xp: 60, gold: 140, items: [] }),
  Courier('overdue_delivery', 'Overdue Delivery', 1, 'A merchant needs goods carried across town.', ['shop', 'market'], 'These goods are overdue at the inn. Carry them over for me?',
    INN, 'Deliver the goods to the inn', { xp: 30, gold: 80, items: [] }),

  // --- temple / shrine ---
  Q('ruin_menace', 'Menace in the Ruins', 4, 'A dark thing preys on travellers near the ruins.', ['temple', 'shrine'], 'Travellers vanish near the old ruins. A dark thing dwells there. Will you face it?',
    siteCombat('rm1', 'Defeat the wraith lord in the ruins', 'ruins', 'wraith_lord', 'the Wraith Lord', { xp: 200, gold: 0, items: ['dark_tome'] }), ['temple', 'shrine'], undefined, { xp: 100, gold: 150, items: [] }),
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
    siteCombat('ur1', 'Destroy the arcane horror in the ruins', 'ruins', 'arcane_horror', 'the Arcane Horror', { xp: 250, gold: 0, items: ['magic_item'] }), 'magetower', undefined, { xp: 150, gold: 220, items: [] }),

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
    siteLoc('mm1', 'Reach the deep gallery in the cave', 'cave', 'deep_gallery', 'the Deep Gallery', { xp: 70, gold: 0, items: [] }), ['mill', 'townhall'], undefined, { xp: 80, gold: 90, items: [] }),
  Q('vermin_stores', 'Vermin in the Stores', 1, 'Pests are ruining the mill\'s grain.', 'mill', 'Vermin are at the grain. Cull a few and I\'ll make it worth your while.',
    bounty('vs1', 'Cull 3 pests', 3, { xp: 40, gold: 0, items: [] }), 'mill', undefined, { xp: 40, gold: 70, items: [] }),
  Q('spooked_mare', 'The Spooked Mare', 1, 'A bolted mare fled toward the cave mouth.', 'stables', 'My mare bolted toward the cave. Track her to the mouth and I\'ll know she\'s near.',
    siteLoc('sm1', 'Reach the cave mouth where the mare fled', 'cave', 'cave_mouth', 'the Cave Mouth', { xp: 50, gold: 0, items: [] }), 'stables', 'Tell the hostler', { xp: 50, gold: 70, items: [] }),

  // --- civic: town hall / bank / jail (town/city) ---
  Q('clear_roads', 'Clear the Roads', 3, 'The magistrate posts a bounty on road-foes.', 'townhall', 'The roads are thick with foes. Cull five and claim the town\'s bounty.',
    bounty('cl1', 'Defeat 5 foes on the roads', 5, { xp: 100, gold: 0, items: [] }), 'townhall', undefined, { xp: 100, gold: 200, items: [] }),
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
  Q('boatwright_resin', 'Pitch for the Hulls', 1, 'The boatwright needs pine resin to caulk a leaking hull.', 'boathouse', 'Every hull on this bank weeps at the seams. Tap me three lumps of pine resin from the forest and I will see you paid.',
    gather('bwr1', 'Collect 3 lumps of pine resin', 'pine_resin', 3, { xp: 40, gold: 0, items: [] }, ['forest']), 'boathouse', 'Bring the resin to the boatwright', { xp: 40, gold: 90, items: [] }),
  Q('harbor_pests', 'Pests off the Pier', 2, 'Something keeps gnawing through mooring lines by night.', ['harbormaster', 'boathouse'], 'Vermin off the water chew through my mooring lines faster than I can splice them. Cull a few and the harbour will owe you.',
    bounty('hbp1', 'Cull 3 of the vermin plaguing the moorings', 3, { xp: 50, gold: 0, items: [] }), ['harbormaster', 'boathouse'], undefined, { xp: 50, gold: 100, items: [] }),

  // =========================================================================
  // Mid/top-band expansion (#45/#50): quests reserved for levelled parties.
  // XP curve: minLevel 3-4 ~250-340 total, minLevel 5 ~440-450, minLevel 6-7
  // ~500-560 (objective step + turn-in reward; see docs/T3_CAMPAIGNS_PLAN.md §2.1).
  // Completability rules still apply: sites are cave/ruins only, overworld
  // combat is count-of-any, gather targets all have live drop sources.
  // =========================================================================

  // --- minLevel 3 ---
  Q('wolfpack_cull', 'Thin the Wolfpack', 3, 'Beasts grown bold are stalking the pastures.', ['stables', 'mill'], 'Something has the beasts of the wilds emboldened — they take a horse a week. Drive off four and the purse is yours.',
    bounty('wpc1', 'Drive off 4 beasts stalking the pastures', 4, { xp: 110, gold: 0, items: [] }), ['stables', 'mill'], undefined, { xp: 140, gold: 180, items: [] }),
  Q('guild_waystation', "The Guild's Lost Waystation", 3, 'A trade-guild waystation in the ruins went silent a generation ago.', 'guild', 'Our charter names a waystation in the old ruins, abandoned in my grandmother\'s day. Find what remains of it and the guild will owe you.',
    siteLoc('gws1', "Find the guild's lost waystation in the ruins", 'ruins', 'guild_waystation', 'the Lost Waystation', { xp: 120, gold: 0, items: [] }), 'guild', 'Report back to the guild', { xp: 140, gold: 200, items: [] }),
  Courier('requisition_orders', 'Requisition for the Forge', 3, 'The magistrate\'s iron requisition must reach the smith — and the roads are watched.', 'townhall', 'These requisition orders must reach the blacksmith unopened. Word is the war-bands pay well for town seals, so go armed.',
    'blacksmith', 'Deliver the requisition orders to the blacksmith', { xp: 180, gold: 190, items: [] }),

  // --- minLevel 4 ---
  Q('broodmother', 'The Broodmother', 4, 'A giant spider broods in the cave, and her young are spreading.', ['alchemist', 'apothecary'], 'The silk I buy comes from that cave, but nothing has come out of it in weeks. A broodmother has claimed it. Kill her before the valley crawls.',
    siteCombat('bro1', 'Slay the broodmother nesting in the cave', 'cave', 'cave_broodmother', 'the Cave Broodmother', { xp: 190, gold: 0, items: ['spider_silk'] }), ['alchemist', 'apothecary'], undefined, { xp: 130, gold: 220, items: ['antidote'] }),
  Q('sunken_bell', 'The Sunken Bell', 4, 'The temple-of-old\'s great bell lies somewhere in the ruins.', ['temple', 'shrine'], 'When the old temple fell, its consecrated bell fell with it. Raise it from the ruins and its voice will bless this town again.',
    siteItem('bell1', 'Recover the temple bell from the ruins', 'ruins', 'sunken_bell', 'the Sunken Bell', { xp: 150, gold: 0, items: [] }), ['temple', 'shrine'], 'Bring the bell to the temple', { xp: 170, gold: 240, items: [] }),
  Q('storm_crystals', 'Storm-Charged Crystals', 4, 'A mage needs crystals that hold the mountain\'s lightning.', 'magetower', 'Ordinary crystal won\'t do — I need three storm crystals, charged where the peaks meet the sky. Dangerous country. Priced accordingly.',
    gather('stc1', 'Collect 3 storm crystals', 'storm_crystal', 3, { xp: 150, gold: 0, items: [] }, ['mountain']), 'magetower', 'Deliver the storm crystals', { xp: 170, gold: 280, items: [] }),

  // --- minLevel 5 ---
  Q('bandit_warcamp', 'Break the Warcamp', 5, 'A warband has grown from nuisance to army. The magistrate wants it broken.', 'townhall', 'This is no longer banditry, it is a warcamp. Scatter five of their raiders in the field and their nerve will break with them.',
    bounty('bwc1', "Scatter 5 of the warband's raiders", 5, { xp: 220, gold: 0, items: [] }), 'townhall', undefined, { xp: 230, gold: 400, items: [] }),
  Q('vault_of_kings', 'Regalia of the Old Kings', 5, 'The old kings\' regalia lies in a vault deep beneath the ruins.', 'bank', 'Before the crown fell, its regalia was sealed in a vault beneath what is now ruin. The bank holds the deed — recover it and the finder\'s share is princely.',
    siteItem('vok1', 'Recover the royal regalia from the deep ruins', 'ruins', 'kings_regalia', 'the Regalia of the Old Kings', { xp: 210, gold: 0, items: [] }), 'bank', 'Deliver the regalia to the bank', { xp: 230, gold: 420, items: [] }),
  Q('deep_horror', 'The Horror Below', 5, 'Miners talk of something old waking in the deepest gallery.', INN, 'The deep gallery has gone wrong. Lamps gutter, tools vanish, and old Marta swears the dark looked back at her. Whatever woke down there — end it.',
    siteCombat('dho1', 'Destroy the horror in the deep gallery of the cave', 'cave', 'gallery_horror', 'the Horror of the Deep Gallery', { xp: 260, gold: 0, items: [] }), INN, undefined, { xp: 180, gold: 320, items: ['rare_gem'] }),

  // --- minLevel 6 ---
  Q('wyrm_tribute', "The Wyrm's Tribute", 6, 'For years the town paid tribute to a wyrm. The lord wants it back.', 'keep', 'My predecessors bought peace with a chest of gold a year, carried to the cave and never seen again. The wyrm is gone or sleeping. Bring my treasury home.',
    siteItem('wyt1', "Recover the tribute chest from the wyrm's hoard in the cave", 'cave', 'tribute_chest', 'the Tribute Chest', { xp: 250, gold: 0, items: [] }), 'keep', 'Return the tribute to the keep', { xp: 250, gold: 500, items: [] }),
  Q('cleanse_dark_roads', 'Cleanse the Dark Roads', 6, 'The temple calls doughty souls to purge the encroaching darkness.', ['temple', 'shrine'], 'What walks the roads now is not banditry but darkness given teeth. The temple sanctifies this charge: destroy six of them, and be named a defender of the faith.',
    bounty('cdr1', 'Destroy 6 of the encroaching darkness', 6, { xp: 250, gold: 0, items: [] }), ['temple', 'shrine'], undefined, { xp: 270, gold: 450, items: [] }),

  // --- minLevel 7 ---
  Q('sealed_gate', 'The Sealed Gate', 7, 'Beneath the ruins stands a gate the ancients sealed — and its keeper still watches.', 'magetower', 'Every ward I cast frays toward the ruins. The ancients sealed a gate down there and set a keeper on it; the keeper has outlived its purpose and now feeds the seal with stolen life. Destroy it, and bring me what it guards.',
    siteCombat('sgt1', 'Defeat the Gatekeeper beyond the sealed gate in the ruins', 'ruins', 'gatekeeper', 'the Gatekeeper of the Sealed Ways', { xp: 320, gold: 0, items: ['forbidden_knowledge'] }), 'magetower', undefined, { xp: 240, gold: 500, items: ['runic_greatsword'] }),
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
};

// Fresh, mutable copy of the FULL pool (debug page; new games use selectSideQuests).
export const initialSideQuests = () => SIDE_QUESTS.map((q) => ({
  ...q,
  milestones: q.milestones.map((m) => ({ ...m, completed: false, progress: 0 })),
  status: 'available',
}));

export default SIDE_QUESTS;
