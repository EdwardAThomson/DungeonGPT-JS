// Additional wilderness and road encounters

export const WILDERNESS_ENCOUNTERS = {
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
  },

};
