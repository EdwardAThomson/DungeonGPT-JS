// Encounter templates for narrative-first resolution system
// Each encounter offers multiple approaches resolved through skill checks

export const encounterTemplates = {
  'goblin_ambush': {
    name: 'Goblin Ambush',
    icon: '👺',
    encounterTier: 'immediate',
    description: 'A band of goblins leaps from the undergrowth, weapons drawn and eyes gleaming with malice!',
    difficulty: 'easy',
    multiRound: true,
    enemyHP: 15,
    suggestedActions: [
      { label: 'Fight', skill: 'Athletics', description: 'Charge into battle with weapons ready' },
      { label: 'Intimidate', skill: 'Intimidation', description: 'Roar and brandish weapons to scare them off' },
      { label: 'Flee', skill: 'Acrobatics', description: 'Sprint away before they surround you' },
      { label: 'Negotiate', skill: 'Persuasion', description: 'Offer gold or safe passage' }
    ],
    rewards: { xp: 50, gold: '2d10', items: ['rusty_dagger:30%', 'healing_potion:20%'] },
    consequences: {
      criticalSuccess: 'The goblins flee in terror, dropping valuable loot in their panic.',
      success: 'You overcome the goblins with minimal injury and claim their meager possessions.',
      failure: 'The goblins wound you before retreating into the wilderness.',
      criticalFailure: 'The ambush goes badly - you lose equipment and take serious injuries before escaping.'
    }
  },

  'wolf_pack': {
    name: 'Wolf Pack',
    icon: '🐺',
    encounterTier: 'immediate',
    description: 'Hungry wolves circle your party, growling menacingly as their alpha watches from the shadows.',
    difficulty: 'medium',
    multiRound: true,
    enemyHP: 20,
    suggestedActions: [
      { label: 'Fight', skill: 'Athletics', description: 'Defend against the pack with steel and courage' },
      { label: 'Scare Off', skill: 'Intimidation', description: 'Use fire and noise to frighten them' },
      { label: 'Sneak Away', skill: 'Stealth', description: 'Slowly back away without sudden movements' },
      { label: 'Animal Handling', skill: 'Animal Handling', description: 'Calm the alpha and show respect' }
    ],
    rewards: { xp: 75, gold: '1d6', items: ['wolf_pelt:60%', 'wolf_fang:40%'] },
    consequences: {
      criticalSuccess: 'The alpha wolf respects your strength and the pack disperses peacefully.',
      success: 'You drive off the wolves without serious harm to your party.',
      failure: 'The wolves bite before fleeing - you need to tend your wounds.',
      criticalFailure: 'The pack overwhelms you, stealing supplies and leaving you wounded and shaken.'
    }
  },

  'bandit_roadblock': {
    name: 'Bandit Roadblock',
    icon: '🗡️',
    encounterTier: 'immediate',
    description: 'Armed bandits block the road ahead, their leader demanding a toll for safe passage.',
    difficulty: 'medium',
    multiRound: true,
    enemyHP: 25,
    suggestedActions: [
      { label: 'Fight', skill: 'Athletics', description: 'Draw weapons and fight your way through' },
      { label: 'Intimidate', skill: 'Intimidation', description: 'Show them you\'re not easy prey' },
      { label: 'Pay Toll', skill: 'Persuasion', description: 'Negotiate a reasonable price' },
      { label: 'Deceive', skill: 'Deception', description: 'Trick them with false promises' }
    ],
    rewards: { xp: 100, gold: '3d10', items: ['shortsword:25%', 'leather_armor:15%', 'healing_potion:30%'] },
    consequences: {
      criticalSuccess: 'You defeat or outwit the bandits, claiming their ill-gotten gains.',
      success: 'You pass through with minimal cost and no injuries.',
      failure: 'You lose some gold or supplies but escape unharmed.',
      criticalFailure: 'The bandits rob you blind and rough you up for good measure.'
    },
    affectedFactions: {
      criticalSuccess: { 'Merchant Guild': 2, 'Bandit Clans': -2 },
      success: { 'Merchant Guild': 1, 'Bandit Clans': -1 },
      failure: { 'Merchant Guild': -1 },
      criticalFailure: { 'Bandit Clans': 1 }
    }
  },

  'traveling_merchant': {
    name: 'Traveling Merchant',
    icon: '🛒',
    encounterTier: 'narrative',
    narrativeHook: 'a merchant with a laden cart traveling the road',
    aiContext: 'A traveling merchant with a colorful cart approaches along the road. They seem friendly and eager to trade goods or share news from other settlements.',
    description: 'A cheerful merchant with a laden cart waves you down, offering exotic wares and news from distant lands.',
    difficulty: 'easy',
    suggestedActions: [
      { label: 'Browse Wares', skill: 'Persuasion', description: 'Haggle for good prices on supplies' },
      { label: 'Ask for News', skill: 'Persuasion', description: 'Learn rumors and information' },
      { label: 'Offer Protection', skill: 'Persuasion', description: 'Escort them for a reward' },
      { label: 'Move On', skill: null, description: 'Politely decline and continue your journey' }
    ],
    rewards: { xp: 25, gold: '1d10', items: ['healing_potion:50%', 'rations:70%', 'map_fragment:20%'] },
    consequences: {
      criticalSuccess: 'The merchant is so pleased they give you a rare item and valuable information.',
      success: 'You make a fair trade and learn useful news about the road ahead.',
      failure: 'The merchant is cagey and offers poor prices, but you part on good terms.',
      criticalFailure: 'The merchant suspects you of ill intent and refuses to deal with you.'
    },
    affectedFactions: {
      criticalSuccess: { 'Merchant Guild': 2 },
      success: { 'Merchant Guild': 1 }
    }
  },

  'wandering_minstrel': {
    name: 'Wandering Minstrel',
    icon: '🎵',
    encounterTier: 'narrative',
    narrativeHook: 'a bard playing music by the roadside',
    aiContext: 'A traveling minstrel sits beneath a tree, playing a haunting melody on their lute. They seem lost in the music but might welcome company or have tales to share.',
    description: 'A bard sits by the roadside, playing a melancholy tune on a well-worn lute.',
    difficulty: 'easy',
    suggestedActions: [
      { label: 'Listen to Song', skill: 'Perception', description: 'The song may contain hidden lore' },
      { label: 'Share Stories', skill: 'Persuasion', description: 'Exchange tales of adventure' },
      { label: 'Request a Ballad', skill: 'Persuasion', description: 'Ask for a morale-boosting performance' },
      { label: 'Give Coin', skill: null, description: 'Tip the bard and move on' }
    ],
    rewards: { xp: 30, gold: '0', items: ['inspiration:40%', 'quest_clue:30%'] },
    consequences: {
      criticalSuccess: 'The bard teaches you an ancient song that grants a powerful blessing.',
      success: 'You gain inspiration and learn valuable lore about your quest.',
      failure: 'The bard is pleasant but offers little of value.',
      criticalFailure: 'The bard is offended and spreads unflattering songs about your party.'
    }
  },

  'giant_spiders': {
    name: 'Giant Spider Nest',
    icon: '🕷️',
    encounterTier: 'immediate',
    description: 'Massive webs stretch between the trees, and you hear the clicking of enormous mandibles.',
    difficulty: 'medium',
    multiRound: true,
    enemyHP: 18,
    suggestedActions: [
      { label: 'Fight', skill: 'Athletics', description: 'Battle the spiders before they strike' },
      { label: 'Burn Webs', skill: 'Survival', description: 'Use fire to clear a path' },
      { label: 'Sneak Past', skill: 'Stealth', description: 'Move silently around the nest' },
      { label: 'Retreat', skill: 'Acrobatics', description: 'Back away carefully' }
    ],
    rewards: { xp: 90, gold: '2d8', items: ['spider_silk:70%', 'venom_sac:40%', 'healing_potion:25%'] },
    consequences: {
      criticalSuccess: 'You destroy the nest and claim valuable spider silk and venom.',
      success: 'You overcome the spiders with minor injuries and some useful materials.',
      failure: 'Spider venom weakens you, but you escape the nest.',
      criticalFailure: 'You\'re badly poisoned and wrapped in webbing before cutting yourself free.'
    }
  },

  'bear_encounter': {
    name: 'Angry Bear',
    icon: '🐻',
    encounterTier: 'immediate',
    description: 'A massive bear rears up on its hind legs, roaring a challenge as you enter its territory.',
    difficulty: 'hard',
    multiRound: true,
    enemyHP: 35,
    suggestedActions: [
      { label: 'Fight', skill: 'Athletics', description: 'Stand your ground and fight the beast' },
      { label: 'Intimidate', skill: 'Intimidation', description: 'Make yourself large and loud' },
      { label: 'Calm', skill: 'Animal Handling', description: 'Show you mean no harm' },
      { label: 'Flee', skill: 'Acrobatics', description: 'Run before it charges' }
    ],
    rewards: { xp: 120, gold: '1d4', items: ['bear_pelt:80%', 'bear_claw:60%'] },
    consequences: {
      criticalSuccess: 'The bear backs down and even leads you to a hidden cache of food.',
      success: 'You drive off the bear without serious injury.',
      failure: 'The bear mauls you before retreating - you\'re badly wounded.',
      criticalFailure: 'The bear\'s attack is devastating, leaving you near death and without supplies.'
    }
  },

  'mysterious_shrine': {
    name: 'Mysterious Shrine',
    icon: '⛩️',
    encounterTier: 'narrative',
    narrativeHook: 'an ancient shrine covered in glowing runes',
    aiContext: 'An old shrine stands among the trees, its stone surface covered in moss and strange runes that pulse with faint magical light. It radiates an aura of forgotten power.',
    description: 'An ancient shrine stands before you, covered in moss and strange runes that seem to pulse with faint light.',
    difficulty: 'medium',
    suggestedActions: [
      { label: 'Pray', skill: 'Religion', description: 'Offer prayers to the forgotten deity' },
      { label: 'Study Runes', skill: 'Arcana', description: 'Decipher the magical inscriptions' },
      { label: 'Leave Offering', skill: 'Religion', description: 'Place gold or items at the altar' },
      { label: 'Ignore', skill: null, description: 'Pass by without disturbing it' }
    ],
    rewards: { xp: 80, gold: '0', items: ['divine_blessing:50%', 'ancient_knowledge:30%', 'cursed_item:10%'] },
    consequences: {
      criticalSuccess: 'The shrine grants you a powerful blessing and reveals hidden knowledge.',
      success: 'You receive a minor blessing or useful insight.',
      failure: 'The shrine remains silent, offering neither help nor harm.',
      criticalFailure: 'You anger the shrine\'s guardian spirit and are cursed.'
    }
  },

  'rockslide': {
    name: 'Rockslide',
    icon: '🪨',
    encounterTier: 'immediate',
    description: 'The ground trembles and rocks begin tumbling down the mountainside toward you!',
    difficulty: 'medium',
    suggestedActions: [
      { label: 'Run', skill: 'Acrobatics', description: 'Sprint to safety' },
      { label: 'Take Cover', skill: 'Survival', description: 'Find shelter behind a boulder' },
      { label: 'Shield Party', skill: 'Athletics', description: 'Use shields to protect everyone' },
      { label: 'Magic Shield', skill: 'Arcana', description: 'Create a magical barrier' }
    ],
    rewards: { xp: 60, gold: '0', items: ['gemstone:30%', 'rare_ore:20%'] },
    consequences: {
      criticalSuccess: 'You avoid all harm and discover valuable gems in the rubble.',
      success: 'You escape with minor scrapes and bruises.',
      failure: 'Falling rocks injure you and damage equipment.',
      criticalFailure: 'You\'re badly hurt and buried under debris, losing precious time digging out.'
    }
  },

  'lost_child': {
    name: 'Lost Child',
    icon: '👧',
    encounterTier: 'narrative',
    narrativeHook: 'a child crying alone by the roadside',
    aiContext: 'A young child sits by the path, tears streaming down their face. They claim to be lost and separated from their family, but something about the situation feels uncertain.',
    description: 'A young child sits crying by the roadside, claiming to be separated from their family.',
    difficulty: 'easy',
    suggestedActions: [
      { label: 'Help Find Family', skill: 'Survival', description: 'Track the family\'s trail' },
      { label: 'Comfort Child', skill: 'Persuasion', description: 'Calm them and learn what happened' },
      { label: 'Sense Deception', skill: 'Perception', description: 'Check if this is a trap' },
      { label: 'Leave', skill: null, description: 'Continue on your way' }
    ],
    rewards: { xp: 40, gold: '1d20', items: ['family_heirloom:25%', 'healing_potion:40%'] },
    consequences: {
      criticalSuccess: 'You reunite the child with their grateful family, who reward you generously.',
      success: 'You help the child and receive modest thanks.',
      failure: 'The child was bait for bandits, but you escape their ambush.',
      criticalFailure: 'You fall for the trap completely and are robbed by the child\'s accomplices.'
    }
  },

  // === TOWN ENCOUNTERS ===

  'tavern_brawl': {
    name: 'Tavern Brawl',
    icon: '🍺',
    encounterTier: 'immediate',
    description: 'A drunken argument erupts into a full-blown brawl at the local tavern. Chairs fly and fists swing!',
    difficulty: 'easy',
    suggestedActions: [
      { label: 'Join the Fight', skill: 'Athletics', description: 'Wade in and start throwing punches' },
      { label: 'Break It Up', skill: 'Intimidation', description: 'Bellow for order and separate the fighters' },
      { label: 'Slip Away', skill: 'Stealth', description: 'Grab your drink and find a quiet corner' },
      { label: 'Pick Pockets', skill: 'Sleight of Hand', description: 'Use the chaos to lighten some purses' }
    ],
    rewards: { xp: 30, gold: '1d8', items: ['ale_mug:50%', 'bar_stool_leg:20%'] },
    consequences: {
      criticalSuccess: 'You emerge as the hero of the tavern, earning free drinks and a useful contact.',
      success: 'You handle the situation well and earn some respect from the locals.',
      failure: 'You get a black eye but nothing worse. The barkeep gives you a dirty look.',
      criticalFailure: 'You get knocked out cold and wake up missing some coin.'
    }
  },

  'town_market': {
    name: 'Bustling Market',
    icon: '🏪',
    encounterTier: 'narrative',
    narrativeHook: 'a bustling market square filled with vendors',
    aiContext: 'The town market is alive with activity. Vendors hawk their wares, fresh produce is piled high, and mysterious trinkets catch the eye. The air is filled with the sounds of haggling and the smell of fresh bread.',
    description: 'The town market is alive with vendors hawking exotic wares, fresh produce, and mysterious trinkets.',
    difficulty: 'easy',
    suggestedActions: [
      { label: 'Browse Wares', skill: 'Persuasion', description: 'Haggle with merchants for supplies' },
      { label: 'Gather Rumors', skill: 'Perception', description: 'Listen to gossip among the crowd' },
      { label: 'Perform', skill: 'Performance', description: 'Entertain the crowd for coin' },
      { label: 'Look Around', skill: null, description: 'Take in the sights and move on' }
    ],
    rewards: { xp: 20, gold: '2d6', items: ['rations:60%', 'healing_potion:30%', 'map_fragment:15%'] },
    consequences: {
      criticalSuccess: 'A merchant takes a shine to you and offers a rare item at a steep discount.',
      success: 'You find good deals and pick up useful information about the region.',
      failure: 'Prices are high and the merchants are tight-lipped today.',
      criticalFailure: 'A pickpocket lifts some of your coin while you browse.'
    }
  },

  'town_quest_board': {
    name: 'Quest Board',
    icon: '📜',
    encounterTier: 'narrative',
    narrativeHook: 'a notice board covered in postings and warnings',
    aiContext: 'A weathered notice board stands prominently in the town square, its surface covered with parchments - bounties, requests for help, warnings about dangers, and notices of missing persons.',
    description: 'A weathered notice board stands in the town square, covered with requests for help and warnings.',
    difficulty: 'easy',
    suggestedActions: [
      { label: 'Read Notices', skill: 'Perception', description: 'Study the postings carefully' },
      { label: 'Ask Locals', skill: 'Persuasion', description: 'Chat with townsfolk about the notices' },
      { label: 'Take a Job', skill: null, description: 'Accept a bounty or errand' },
      { label: 'Move On', skill: null, description: 'Nothing catches your eye' }
    ],
    rewards: { xp: 25, gold: '0', items: ['quest_clue:60%', 'map_fragment:30%'] },
    consequences: {
      criticalSuccess: 'You find a highly lucrative posting and learn crucial information about your quest.',
      success: 'You pick up a useful lead and learn something about the area.',
      failure: 'Most of the postings are outdated or irrelevant.',
      criticalFailure: 'You accidentally accept a job that turns out to be a scam.'
    }
  },

  'town_healer': {
    name: 'Traveling Healer',
    icon: '⚕️',
    encounterTier: 'narrative',
    narrativeHook: 'a healer\'s tent with the scent of medicinal herbs',
    aiContext: 'A colorful tent stands near the town well, its entrance marked by bundles of drying herbs. A kindly healer tends to the sick and injured, offering remedies and blessings to those in need.',
    description: 'A kindly healer has set up a tent near the town well, offering remedies and blessings to weary travelers.',
    difficulty: 'easy',
    suggestedActions: [
      { label: 'Seek Healing', skill: 'Persuasion', description: 'Ask for treatment of injuries' },
      { label: 'Buy Potions', skill: 'Persuasion', description: 'Purchase healing supplies' },
      { label: 'Trade Knowledge', skill: 'Medicine', description: 'Exchange medical knowledge' },
      { label: 'Decline', skill: null, description: 'Thank them and move on' }
    ],
    rewards: { xp: 15, gold: '0', items: ['healing_potion:70%', 'antidote:40%', 'herbal_remedy:50%'] },
    consequences: {
      criticalSuccess: 'The healer mends your wounds completely and gifts you a powerful restorative.',
      success: 'You receive helpful treatment and affordable potions.',
      failure: 'The healer is busy but offers a minor remedy.',
      criticalFailure: 'The healer\'s remedy has an unpleasant side effect, though it wears off.'
    }
  },

  'suspicious_stranger': {
    name: 'Suspicious Stranger',
    icon: '🕵️',
    encounterTier: 'narrative',
    narrativeHook: 'a hooded figure lurking in the shadows',
    aiContext: 'A mysterious hooded figure watches from a quiet alley, their face obscured. They seem to be waiting for someone - or watching for an opportunity. Something about them suggests they have secrets to share.',
    description: 'A hooded figure approaches you in a quiet alley, claiming to have information... for a price.',
    difficulty: 'medium',
    suggestedActions: [
      { label: 'Listen', skill: 'Perception', description: 'Hear them out while staying alert' },
      { label: 'Intimidate', skill: 'Intimidation', description: 'Demand they speak plainly' },
      { label: 'Pay Up', skill: 'Persuasion', description: 'Offer coin for information' },
      { label: 'Walk Away', skill: null, description: 'Ignore the stranger and leave' }
    ],
    rewards: { xp: 40, gold: '1d10', items: ['quest_clue:50%', 'stolen_goods:20%', 'poisoned_dagger:10%'] },
    consequences: {
      criticalSuccess: 'The stranger reveals critical intelligence about dangers ahead and a hidden cache.',
      success: 'You learn useful information, though you\'re not sure how much to trust.',
      failure: 'The information seems dubious at best. You may have wasted your time.',
      criticalFailure: 'It was a setup! Thugs emerge from the shadows, though you manage to escape.'
    }
  },

  // === ADDITIONAL WILDERNESS ENCOUNTERS ===

  'herb_gathering': {
    name: 'Medicinal Herbs',
    icon: '🌿',
    encounterTier: 'narrative',
    narrativeHook: 'rare medicinal herbs growing among wildflowers',
    aiContext: 'A patch of unusual plants catches your eye - rare medicinal herbs with distinctive leaves and flowers. They could be valuable for healing or trade.',
    description: 'You spot a patch of rare medicinal herbs growing among the wildflowers.',
    difficulty: 'easy',
    suggestedActions: [
      { label: 'Gather Herbs', skill: 'Nature', description: 'Carefully harvest the plants' },
      { label: 'Study Plants', skill: 'Medicine', description: 'Identify their properties' },
      { label: 'Take All', skill: 'Survival', description: 'Harvest everything you can carry' },
      { label: 'Leave Them', skill: null, description: 'Continue your journey' }
    ],
    rewards: { xp: 15, gold: '0', items: ['healing_herbs:80%', 'rare_ingredient:30%', 'healing_potion:20%'] },
    consequences: {
      criticalSuccess: 'You find an exceptionally rare specimen worth a small fortune to the right buyer.',
      success: 'You gather a useful supply of medicinal herbs.',
      failure: 'You pick the wrong plants and end up with worthless weeds.',
      criticalFailure: 'You disturb a nest of insects hidden among the plants and get badly stung.'
    }
  },

  'abandoned_campsite': {
    name: 'Abandoned Campsite',
    icon: '🏕️',
    encounterTier: 'narrative',
    narrativeHook: 'an abandoned campsite with cold ashes',
    aiContext: 'An abandoned campsite lies ahead. The fire pit is cold, supplies are scattered, and there are signs of a hasty departure. What happened here?',
    description: 'You come across an abandoned campsite. The fire is cold, but supplies remain scattered about.',
    difficulty: 'easy',
    suggestedActions: [
      { label: 'Search Camp', skill: 'Investigation', description: 'Look through what was left behind' },
      { label: 'Track Owners', skill: 'Survival', description: 'Follow the trail of whoever was here' },
      { label: 'Set Up Camp', skill: 'Survival', description: 'Rest here for a while' },
      { label: 'Move On', skill: null, description: 'Best not to linger' }
    ],
    rewards: { xp: 20, gold: '1d8', items: ['rations:60%', 'rope:40%', 'journal_page:25%'] },
    consequences: {
      criticalSuccess: 'You find a hidden stash of valuable supplies and a journal with useful information.',
      success: 'You salvage some useful supplies from the abandoned camp.',
      failure: 'The camp has been picked clean — nothing of value remains.',
      criticalFailure: 'The camp was abandoned for a reason — you trigger a trap left for looters.'
    }
  },

  'mountain_hermit': {
    name: 'Mountain Hermit',
    icon: '🧙',
    encounterTier: 'narrative',
    narrativeHook: 'a hermit meditating outside a mountain cave',
    aiContext: 'A weathered hermit sits cross-legged outside a cave entrance, eyes closed in meditation. Their presence radiates wisdom and peace. They seem aware of your approach despite their closed eyes.',
    description: 'A weathered hermit sits outside a cave, eyes twinkling with ancient knowledge.',
    difficulty: 'easy',
    suggestedActions: [
      { label: 'Seek Wisdom', skill: 'Persuasion', description: 'Ask the hermit for guidance' },
      { label: 'Trade Stories', skill: 'Persuasion', description: 'Share tales of your adventures' },
      { label: 'Request Training', skill: 'Athletics', description: 'Ask for combat or survival tips' },
      { label: 'Leave', skill: null, description: 'Respect the hermit\'s solitude' }
    ],
    rewards: { xp: 35, gold: '0', items: ['ancient_knowledge:50%', 'quest_clue:40%', 'rare_herb:30%'] },
    consequences: {
      criticalSuccess: 'The hermit shares a powerful secret that will aid you greatly on your quest.',
      success: 'You gain useful wisdom and a sense of clarity about your journey.',
      failure: 'The hermit speaks in riddles you can\'t decipher.',
      criticalFailure: 'The hermit is annoyed by your intrusion and curses you with bad luck.'
    }
  },

  'elf_patrol': {
    name: 'Elven Patrol',
    icon: '🧝',
    encounterTier: 'narrative',
    narrativeHook: 'elven rangers watching from the forest',
    aiContext: 'Silent figures emerge from the treeline - elven rangers in forest green cloaks. Their bows are drawn but not aimed. They watch with cautious curiosity, clearly guardians of this woodland realm.',
    description: 'Silent elven rangers emerge from the treeline, bows drawn but not hostile — they wish to know your business.',
    difficulty: 'medium',
    suggestedActions: [
      { label: 'Explain Yourself', skill: 'Persuasion', description: 'State your purpose honestly' },
      { label: 'Show Respect', skill: 'Religion', description: 'Honor their customs and traditions' },
      { label: 'Offer Trade', skill: 'Persuasion', description: 'Propose a mutually beneficial exchange' },
      { label: 'Stand Down', skill: null, description: 'Lower weapons and cooperate' }
    ],
    rewards: { xp: 50, gold: '0', items: ['elven_rations:50%', 'forest_map:30%', 'elven_blessing:20%'] },
    consequences: {
      criticalSuccess: 'The elves welcome you as friends and share valuable forest lore and supplies.',
      success: 'The patrol lets you pass and offers directions through the forest.',
      failure: 'The elves are suspicious but allow you through with a warning.',
      criticalFailure: 'The elves escort you out of their territory, costing you time and dignity.'
    }
  },

  // === NEW NARRATIVE ENCOUNTERS (Phase 2.4) ===

  'mysterious_stranger': {
    name: 'Mysterious Stranger',
    icon: '🎭',
    encounterTier: 'narrative',
    narrativeHook: 'a cloaked stranger observing you from a distance',
    aiContext: 'A mysterious hooded figure stands near the path, watching the party with interest. They don\'t appear hostile, but something about them seems significant. The stranger might have information, a quest, or hidden motives.',
    description: 'A hooded figure watches from the shadows, their face obscured but their attention clearly fixed on you.',
    difficulty: 'medium',
    suggestedActions: [
      { label: 'Approach', skill: 'Persuasion', description: 'Greet the stranger openly' },
      { label: 'Observe', skill: 'Insight', description: 'Study them from afar before deciding' },
      { label: 'Ignore', skill: null, description: 'Continue on your way' },
      { label: 'Confront', skill: 'Intimidation', description: 'Demand to know why they\'re watching' }
    ],
    rewards: { xp: 40, gold: '1d12', items: ['quest_clue:60%', 'mysterious_letter:30%', 'enchanted_trinket:15%'] },
    consequences: {
      criticalSuccess: 'The stranger reveals they\'ve been searching for someone like you and offers a lucrative quest.',
      success: 'You learn valuable information about the road ahead and potential opportunities.',
      failure: 'The stranger is evasive and disappears before you can learn much.',
      criticalFailure: 'The stranger was scouting for bandits - you barely avoid an ambush.'
    }
  },

  'wounded_traveler': {
    name: 'Wounded Traveler',
    icon: '🩹',
    encounterTier: 'narrative',
    narrativeHook: 'someone lying injured beside the path',
    aiContext: 'A wounded traveler is slumped against a tree, clutching their side. They appear to have been attacked recently. Blood stains their clothing. They might need help, or this could be a trap.',
    description: 'An injured traveler lies by the roadside, groaning in pain and calling weakly for help.',
    difficulty: 'easy',
    suggestedActions: [
      { label: 'Help', skill: 'Medicine', description: 'Tend to their wounds' },
      { label: 'Question', skill: 'Insight', description: 'Ask what happened while staying alert' },
      { label: 'Search Area', skill: 'Investigation', description: 'Look for signs of attackers' },
      { label: 'Leave', skill: null, description: 'Walk away - it might be a trap' }
    ],
    rewards: { xp: 30, gold: '2d8', items: ['healing_potion:40%', 'traveler_map:35%', 'family_heirloom:20%'] },
    consequences: {
      criticalSuccess: 'You save their life and they reward you with valuable information and a family treasure.',
      success: 'You help the traveler and they share useful knowledge about the area.',
      failure: 'Your aid is clumsy but the traveler survives and thanks you.',
      criticalFailure: 'It was a trap! Bandits emerge, though you manage to fight them off.'
    }
  },

  'hidden_treasure': {
    name: 'Hidden Cache',
    icon: '💎',
    encounterTier: 'narrative',
    narrativeHook: 'a metallic glint catching the light among the bushes',
    aiContext: 'Sharp eyes notice something unusual - a metallic gleam partially hidden in the vegetation. It could be treasure, a trap, or something left behind by previous travelers.',
    description: 'Something glints in the undergrowth - metal or perhaps gemstones catching the sunlight.',
    difficulty: 'easy',
    suggestedActions: [
      { label: 'Investigate', skill: 'Investigation', description: 'Carefully examine the object' },
      { label: 'Check for Traps', skill: 'Perception', description: 'Look for dangers before touching' },
      { label: 'Dig Around', skill: 'Athletics', description: 'Excavate the area thoroughly' },
      { label: 'Ignore', skill: null, description: 'Keep moving - could be trouble' }
    ],
    rewards: { xp: 25, gold: '3d10', items: ['gemstone:50%', 'gold_coins:60%', 'magic_item:15%', 'cursed_item:10%'] },
    consequences: {
      criticalSuccess: 'You discover a hidden cache of treasure - gold, gems, and a magical item!',
      success: 'You find a modest amount of coin and valuables.',
      failure: 'The glint was just broken glass or worthless metal.',
      criticalFailure: 'You trigger a trap protecting the cache and take damage.'
    }
  },

  'distant_smoke': {
    name: 'Distant Smoke',
    icon: '💨',
    encounterTier: 'narrative',
    narrativeHook: 'a column of smoke rising in the distance',
    aiContext: 'A thin column of smoke rises from beyond the next hill. It could be a campfire, a settlement, or something burning. The source is unclear but investigating might reveal something important.',
    description: 'You notice smoke rising in the distance. Is it a campfire, a village, or something more sinister?',
    difficulty: 'medium',
    suggestedActions: [
      { label: 'Investigate', skill: 'Survival', description: 'Track the smoke to its source' },
      { label: 'Approach Cautiously', skill: 'Stealth', description: 'Scout ahead quietly' },
      { label: 'Observe from Distance', skill: 'Perception', description: 'Study the smoke pattern' },
      { label: 'Avoid', skill: null, description: 'Steer clear - not your problem' }
    ],
    rewards: { xp: 45, gold: '2d10', items: ['quest_clue:50%', 'survivor_reward:30%', 'salvaged_goods:40%'] },
    consequences: {
      criticalSuccess: 'You discover survivors of an attack who reward you and share critical information.',
      success: 'You find a campsite or small settlement and make useful contacts.',
      failure: 'The smoke was from a controlled burn - nothing of interest.',
      criticalFailure: 'You stumble into a bandit camp and must fight or flee.'
    }
  }

};

// Difficulty Class (DC) table for skill checks
export const DIFFICULTY_DC = {
  'trivial': 5,
  'easy': 10,
  'medium': 15,
  'hard': 20,
  'deadly': 25
};
