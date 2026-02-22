// Ruins POI encounters

export const RUINS_ENCOUNTERS = {
  'ruin_entrance': {
    name: 'Ancient Ruins',
    icon: '🏛️',
    encounterTier: 'narrative',
    poiType: 'ruins',
    narrativeHook: 'crumbling stone pillars emerging from the overgrowth',
    aiContext: 'Ancient ruins rise from the landscape, their original purpose lost to time. Weathered carvings hint at a forgotten civilization. The ruins might hold secrets, treasure, or lingering dangers.',
    description: 'Moss-covered ruins stand before you, remnants of a civilization long forgotten.',
    difficulty: 'medium',
    suggestedActions: [
      { label: 'Explore', skill: 'Investigation', description: 'Search the ruins thoroughly' },
      { label: 'Decipher', skill: 'History', description: 'Study the ancient carvings' },
      { label: 'Check for Traps', skill: 'Perception', description: 'Look for dangers' },
      { label: 'Move On', skill: null, description: 'Continue your journey' }
    ],
    rewards: { xp: 55, gold: '2d20', items: ['ancient_scroll:40%', 'old_coins:60%', 'artifact_fragment:30%'] },
    consequences: {
      criticalSuccess: 'You uncover a hidden chamber filled with ancient treasures.',
      success: 'You find valuable artifacts and learn about the ancient civilization.',
      failure: 'The ruins yield little of value.',
      criticalFailure: 'You trigger an ancient trap and must escape quickly.'
    }
  },

  'ruin_ghost': {
    name: 'Restless Spirit',
    icon: '👻',
    encounterTier: 'immediate',
    poiType: 'ruins',
    description: 'A spectral figure materializes among the ruins, its hollow eyes fixing upon you!',
    difficulty: 'hard',
    multiRound: true,
    enemyHP: 40,
    suggestedActions: [
      { label: 'Attack', skill: 'Athletics', description: 'Fight the spirit' },
      { label: 'Turn Undead', skill: 'Religion', description: 'Use holy power against it' },
      { label: 'Communicate', skill: 'Persuasion', description: 'Try to speak with the spirit' },
      { label: 'Flee', skill: 'Athletics', description: 'Run from the haunted place' }
    ],
    rewards: { xp: 70, gold: '3d10', items: ['ectoplasm:50%', 'ghostly_trinket:35%', 'spirit_essence:20%'] },
    consequences: {
      criticalSuccess: 'The spirit shares ancient knowledge before departing peacefully.',
      success: 'You defeat or calm the spirit.',
      failure: 'The spirit curses you before fading, imposing a minor hex.',
      criticalFailure: 'The spirit possesses a party member temporarily, causing chaos.'
    }
  },

  'ruin_treasure_vault': {
    name: 'Hidden Vault',
    icon: '🗝️',
    encounterTier: 'narrative',
    poiType: 'ruins',
    narrativeHook: 'an ornate door half-buried in rubble',
    aiContext: 'Behind fallen stones, an ornate door with ancient locks hints at a sealed vault. Whatever the ancients locked away might still be inside - treasure, knowledge, or something dangerous.',
    description: 'A sealed vault door bears arcane symbols and complex locks, promising secrets within.',
    difficulty: 'hard',
    suggestedActions: [
      { label: 'Pick Lock', skill: 'Sleight of Hand', description: 'Try to open the locks' },
      { label: 'Force Open', skill: 'Athletics', description: 'Break through the door' },
      { label: 'Dispel Magic', skill: 'Arcana', description: 'Remove magical protections' },
      { label: 'Leave It', skill: null, description: 'The vault is too risky' }
    ],
    rewards: { xp: 90, gold: '5d20', items: ['ancient_gold:80%', 'magic_scroll:50%', 'legendary_weapon:15%'] },
    consequences: {
      criticalSuccess: 'The vault opens to reveal untouched treasure from the ancient era.',
      success: 'You access the vault and find valuable items.',
      failure: 'The vault is mostly looted but you find a few coins.',
      criticalFailure: 'Opening the vault releases a trapped creature!'
    }
  },

  'ruin_cultists': {
    name: 'Dark Ritual',
    icon: '🕯️',
    encounterTier: 'immediate',
    poiType: 'ruins',
    description: 'Hooded figures chant around a glowing altar in the ruins - you\'ve stumbled upon a dark ritual!',
    difficulty: 'hard',
    multiRound: true,
    enemyHP: 60,
    suggestedActions: [
      { label: 'Attack', skill: 'Athletics', description: 'Interrupt the ritual by force' },
      { label: 'Sneak Away', skill: 'Stealth', description: 'Leave before being noticed' },
      { label: 'Disrupt Ritual', skill: 'Arcana', description: 'Counter the magic' },
      { label: 'Infiltrate', skill: 'Deception', description: 'Pretend to be a cultist' }
    ],
    rewards: { xp: 100, gold: '4d12', items: ['ritual_dagger:60%', 'dark_tome:40%', 'cult_treasure:50%', 'cursed_item:30%'] },
    consequences: {
      criticalSuccess: 'You stop the ritual and capture the cult leader for questioning.',
      success: 'You defeat the cultists and prevent the ritual.',
      failure: 'You defeat them but the ritual partially completes - something stirs.',
      criticalFailure: 'The ritual completes - you must face what they summoned!'
    }
  },

  'ruin_ancient_library': {
    name: 'Forgotten Library',
    icon: '📚',
    encounterTier: 'narrative',
    poiType: 'ruins',
    narrativeHook: 'rows of dusty shelves visible through a collapsed wall',
    aiContext: 'A partially intact library contains scrolls and tomes that have survived the ages. The knowledge here could be invaluable - magical formulae, historical secrets, or maps to hidden places.',
    description: 'Ancient books and scrolls line crumbling shelves, their knowledge preserved through centuries.',
    difficulty: 'easy',
    suggestedActions: [
      { label: 'Study', skill: 'History', description: 'Read the ancient texts' },
      { label: 'Search', skill: 'Investigation', description: 'Look for valuable tomes' },
      { label: 'Copy Spells', skill: 'Arcana', description: 'Transcribe magical formulae' },
      { label: 'Take Books', skill: null, description: 'Grab what looks valuable' }
    ],
    rewards: { xp: 45, gold: '1d10', items: ['spell_scroll:50%', 'history_tome:60%', 'treasure_map:25%', 'forbidden_knowledge:15%'] },
    consequences: {
      criticalSuccess: 'You discover a complete spellbook and maps to other ruins.',
      success: 'You gain useful knowledge and a few valuable scrolls.',
      failure: 'Most texts are too damaged to read.',
      criticalFailure: 'A guardian construct activates to protect the library!'
    }
  },

};
