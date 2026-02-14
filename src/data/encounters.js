// Encounter templates for narrative-first resolution system
// Each encounter offers multiple approaches resolved through skill checks

export const encounterTemplates = {
  'goblin_ambush': {
    name: 'Goblin Ambush',
    icon: '👺',
    description: 'A band of goblins leaps from the undergrowth, weapons drawn and eyes gleaming with malice!',
    difficulty: 'easy',
    multiRound: true,
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
    description: 'Hungry wolves circle your party, growling menacingly as their alpha watches from the shadows.',
    difficulty: 'medium',
    multiRound: true,
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
    description: 'Armed bandits block the road ahead, their leader demanding a toll for safe passage.',
    difficulty: 'medium',
    multiRound: true,
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
    description: 'Massive webs stretch between the trees, and you hear the clicking of enormous mandibles.',
    difficulty: 'medium',
    multiRound: true,
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
    description: 'A massive bear rears up on its hind legs, roaring a challenge as you enter its territory.',
    difficulty: 'hard',
    multiRound: true,
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
