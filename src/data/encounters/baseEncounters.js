// Core and foundational wilderness encounters

export const BASE_ENCOUNTERS = {
  'goblin_ambush': {
    name: 'Goblin Ambush',
    icon: '👺',
    encounterTier: 'immediate',
    description: 'A band of goblins leaps from the undergrowth, weapons drawn and eyes gleaming with malice!',
    difficulty: 'easy',
    dealsDamage: true, // #43 explicit damage flag (was keyword-matched or newly hostile)
    multiRound: true,
    enemyHP: 15,
    suggestedActions: [
      { label: 'Fight', skill: 'Athletics', description: 'Charge into battle with weapons ready' },
      { label: 'Intimidate', skill: 'Intimidation', description: 'Roar and brandish weapons to scare them off' },
      { label: 'Flee', skill: 'Acrobatics', description: 'Sprint away before they surround you' },
      { label: 'Negotiate', skill: 'Persuasion', description: 'Offer gold or safe passage' }
    ],
    image: '/assets/encounters/goblin_ambush.webp',
    rewards: { xp: 50, gold: '2d10', items: ['rusty_dagger:30%', 'healing_potion:20%'] },
    consequences: {
      criticalSuccess: 'The goblins break and run, and in their panic they leave half of what they carried in the grass.',
      success: 'The goblins give up the fight after a few sharp exchanges, and you pick over what they dropped: not much, but something.',
      failure: 'The goblins wound you before retreating into the wilderness.',
      criticalFailure: 'The ambush goes badly. You break clear at last, hurt, and lighter by whatever the goblins got their hands on.'
    }
  },

  'wolf_pack': {
    name: 'Wolf Pack',
    icon: '🐺',
    encounterTier: 'immediate',
    description: 'Hungry wolves circle your party, growling menacingly as their alpha watches from the shadows.',
    image: '/assets/encounters/wolf_pack.webp',
    difficulty: 'medium',
    dealsDamage: true, // #43 explicit damage flag (was keyword-matched or newly hostile)
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
      failure: 'The wolves get their teeth in before they go, and the bites will want tending tonight.',
      criticalFailure: 'The pack comes in from every side at once. When they finally draw off you are bleeding, shaken, and short of the food they tore from your packs.'
    }
  },

  'bandit_roadblock': {
    name: 'Bandit Roadblock',
    icon: '🗡️',
    encounterTier: 'immediate',
    description: 'Armed bandits block the road ahead, their leader demanding a toll for safe passage.',
    image: '/assets/encounters/bandit_roadblock.webp',
    difficulty: 'medium',
    dealsDamage: true, // #43 explicit damage flag (was keyword-matched or newly hostile)
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
      success: 'A few coins change hands, or a few hard words, and the bandits stand aside and let you by unhurt.',
      failure: 'The toll is steeper than you liked, but you pay it and walk on with your skin whole.',
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
    image: '/assets/encounters/traveling_merchant.webp',
    difficulty: 'easy',
    suggestedActions: [
      { label: 'Browse Wares', skill: 'Persuasion', description: 'Haggle for good prices on supplies' },
      { label: 'Ask for News', skill: 'Persuasion', description: 'Learn rumors and information' },
      { label: 'Offer Protection', skill: 'Persuasion', description: 'Escort them for a reward' },
      { label: 'Move On', skill: null, description: 'Politely decline and continue your journey' }
    ],
    rewards: { xp: 25, gold: '1d10', items: ['healing_potion:50%', 'rations:70%', 'map_fragment:20%'] },
    consequences: {
      criticalSuccess: 'The merchant takes such a liking to you that a rare piece comes out from under the cart, along with the kind of road gossip only pedlars hear.',
      success: 'A fair trade, and over it the merchant tells you which stretch of road to hurry through and which inn waters its ale.',
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
    image: '/assets/encounters/wandering_minstrel.webp',
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
      success: 'The minstrel\'s songs lift your spirits, and one old ballad turns out to be about the very matter you are chasing.',
      failure: 'The bard is pleasant but offers little of value.',
      criticalFailure: 'The bard is offended and spreads unflattering songs about your party.'
    }
  },

  'giant_spiders': {
    name: 'Giant Spider Nest',
    icon: '🕷️',
    encounterTier: 'immediate',
    description: 'Massive webs stretch between the trees, and you hear the clicking of enormous mandibles.',
    image: '/assets/encounters/giant_spiders.webp',
    difficulty: 'medium',
    dealsDamage: true, // #43 explicit damage flag (was keyword-matched or newly hostile)
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
      criticalSuccess: 'You burn the nest out and come away with silk by the armful and venom sacs any apothecary would pay for.',
      success: 'The spiders are beaten off, at the cost of a few bites, and you cut free what silk is worth carrying.',
      failure: 'Spider venom weakens you, but you escape the nest.',
      criticalFailure: 'You\'re badly poisoned and wrapped in webbing before cutting yourself free.'
    }
  },

  'bear_encounter': {
    name: 'Angry Bear',
    icon: '🐻',
    encounterTier: 'immediate',
    description: 'A massive bear rears up on its hind legs, roaring a challenge as you enter its territory.',
    image: '/assets/encounters/bear_encounter.webp',
    difficulty: 'hard',
    dealsDamage: true, // #43 explicit damage flag (was keyword-matched or newly hostile)
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
      criticalSuccess: 'The bear thinks better of it and lumbers off; following its trail, you find the honey-tree it was guarding.',
      success: 'You drive off the bear without serious injury.',
      failure: 'The bear gets one good swipe in before it goes, and the claws went deep.',
      criticalFailure: 'The bear tears through you and through your packs alike. You crawl away alive, barely, and with nothing left to eat.'
    }
  },

  'mysterious_shrine': {
    name: 'Mysterious Shrine',
    icon: '⛩️',
    encounterTier: 'narrative',
    narrativeHook: 'an ancient shrine covered in glowing runes',
    aiContext: 'An old shrine stands among the trees, its stone surface covered in moss and strange runes that pulse with faint magical light. It radiates an aura of forgotten power.',
    description: 'An ancient shrine stands before you, covered in moss and strange runes that seem to pulse with faint light.',
    image: '/assets/encounters/mysterious_shrine.webp',
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
      success: 'A small warmth settles on you as you leave the shrine, and with it a clearer sense of the road ahead.',
      failure: 'The shrine remains silent, offering neither help nor harm.',
      criticalFailure: 'You anger the shrine\'s guardian spirit and are cursed.'
    }
  },

  'rockslide': {
    name: 'Rockslide',
    icon: '🪨',
    encounterTier: 'immediate',
    description: 'The ground trembles and rocks begin tumbling down the mountainside toward you!',
    image: '/assets/encounters/rockslide.webp',
    difficulty: 'medium',
    suggestedActions: [
      { label: 'Run', skill: 'Acrobatics', description: 'Sprint to safety' },
      { label: 'Take Cover', skill: 'Survival', description: 'Find shelter behind a boulder' },
      { label: 'Shield Party', skill: 'Athletics', description: 'Use shields to protect everyone' },
      { label: 'Magic Shield', skill: 'Arcana', description: 'Create a magical barrier' }
    ],
    rewards: { xp: 60, gold: '0', items: ['raw_gems:25%', 'rare_gem:5%', 'rare_ore:20%'] },
    consequences: {
      criticalSuccess: 'You get clear without a scratch, and the slide has laid bare a seam of stones that glitter in the fresh-broken rock.',
      success: 'You scramble clear with scraped hands and a few bruises, and nothing worse.',
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
    image: '/assets/encounters/lost_child.webp',
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

};
