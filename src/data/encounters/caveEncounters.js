// Cave POI encounters

export const CAVE_ENCOUNTERS = {
  'cave_entrance': {
    name: 'Mysterious Cave',
    icon: '🕳️',
    encounterTier: 'narrative',
    poiType: 'cave',
    narrativeHook: 'a dark cave mouth yawning open in the hillside',
    aiContext: 'A cave entrance beckons from the rocky terrain. Cold air drifts from within, carrying unfamiliar scents. The darkness inside could hide treasure, danger, or both.',
    description: 'A cave entrance looms before you, dark and mysterious. Strange sounds echo from within.',
    difficulty: 'medium',
    suggestedActions: [
      { label: 'Enter Cautiously', skill: 'Stealth', description: 'Slip inside quietly' },
      { label: 'Light Torch', skill: 'Survival', description: 'Illuminate before entering' },
      { label: 'Listen', skill: 'Perception', description: 'Try to hear what\'s inside' },
      { label: 'Pass By', skill: null, description: 'Continue on your journey' }
    ],
    rewards: { xp: 50, gold: '3d12', items: ['cave_mushrooms:60%', 'raw_gems:40%', 'ancient_artifact:15%'] },
    consequences: {
      criticalSuccess: 'You discover a hidden cache of treasure and valuable minerals.',
      success: 'The cave offers shelter and you find useful supplies.',
      failure: 'The cave is empty but provides brief respite.',
      criticalFailure: 'You disturb sleeping creatures who attack!'
    }
  },

  'cave_bats': {
    name: 'Bat Swarm',
    icon: '🦇',
    encounterTier: 'immediate',
    poiType: 'cave',
    description: 'A massive swarm of bats erupts from the cave, filling the air with leathery wings and piercing screeches!',
    difficulty: 'easy',
    suggestedActions: [
      { label: 'Duck and Cover', skill: 'Acrobatics', description: 'Protect yourself from the swarm' },
      { label: 'Wait It Out', skill: 'Constitution', description: 'Endure the chaos' },
      { label: 'Run', skill: 'Athletics', description: 'Flee the swarm' },
      { label: 'Create Light', skill: 'Arcana', description: 'Use magic to scatter them' }
    ],
    rewards: { xp: 20, gold: '0', items: ['bat_guano:70%', 'cave_map:20%'] },
    consequences: {
      criticalSuccess: 'You avoid the swarm entirely and notice they fled from something deeper in.',
      success: 'The bats pass quickly, leaving you unharmed.',
      failure: 'You suffer minor scratches and bites from the panicked swarm.',
      criticalFailure: 'The bats leave you disoriented and several follow, attracting predators.'
    }
  },

  'cave_spider_nest': {
    name: 'Spider Nest',
    icon: '🕷️',
    encounterTier: 'immediate',
    poiType: 'cave',
    description: 'Thick webs coat the cave walls, and massive spiders descend from the darkness above!',
    difficulty: 'hard',
    multiRound: true,
    enemyHP: 45,
    suggestedActions: [
      { label: 'Attack', skill: 'Athletics', description: 'Fight the spiders' },
      { label: 'Burn Webs', skill: 'Survival', description: 'Use fire to clear a path' },
      { label: 'Dodge', skill: 'Acrobatics', description: 'Evade their attacks' },
      { label: 'Retreat', skill: 'Athletics', description: 'Run back the way you came' }
    ],
    rewards: { xp: 80, gold: '2d10', items: ['spider_silk:80%', 'poison_vial:40%', 'wrapped_corpse_loot:50%'] },
    consequences: {
      criticalSuccess: 'You defeat the spiders and find valuable silk and a wrapped corpse with treasure.',
      success: 'You fight through the spiders and continue deeper.',
      failure: 'You defeat the spiders but suffer venomous bites.',
      criticalFailure: 'The spiders overwhelm you - you barely escape, poisoned and weakened.'
    }
  },

  'cave_underground_lake': {
    name: 'Underground Lake',
    icon: '🌊',
    encounterTier: 'narrative',
    poiType: 'cave',
    narrativeHook: 'the sound of dripping water echoing from deep within',
    aiContext: 'The cave opens into a vast underground chamber containing a still, dark lake. Phosphorescent fungi provide dim light. Something might lurk in the depths.',
    description: 'A subterranean lake stretches before you, its dark waters reflecting strange glowing fungi.',
    difficulty: 'medium',
    suggestedActions: [
      { label: 'Drink', skill: 'Nature', description: 'Test if the water is safe' },
      { label: 'Fish', skill: 'Survival', description: 'Try to catch cave fish' },
      { label: 'Swim Across', skill: 'Athletics', description: 'Reach the far shore' },
      { label: 'Skirt Around', skill: 'Acrobatics', description: 'Edge along the narrow shore' }
    ],
    rewards: { xp: 40, gold: '1d20', items: ['glowing_fungi:70%', 'cave_fish:60%', 'pearl:25%', 'drowned_treasure:20%'] },
    consequences: {
      criticalSuccess: 'You discover the lake hides drowned treasure from past explorers.',
      success: 'The lake provides fresh water and useful fungi.',
      failure: 'The water is too mineral-rich to drink safely.',
      criticalFailure: 'Something in the lake grabs at you - you escape but lose equipment.'
    }
  },

  'cave_treasure_guardian': {
    name: 'Treasure Guardian',
    icon: '🐉',
    encounterTier: 'immediate',
    poiType: 'cave',
    description: 'A fearsome creature guards a hoard of treasure, awakening as you approach!',
    difficulty: 'deadly',
    multiRound: true,
    enemyHP: 80,
    suggestedActions: [
      { label: 'Fight', skill: 'Athletics', description: 'Battle the guardian' },
      { label: 'Negotiate', skill: 'Persuasion', description: 'Try to reason with it' },
      { label: 'Distract', skill: 'Deception', description: 'Create a diversion to grab treasure' },
      { label: 'Flee', skill: 'Athletics', description: 'Run for your life' }
    ],
    rewards: { xp: 150, gold: '10d20', items: ['rare_gem:70%', 'magic_weapon:40%', 'ancient_artifact:30%', 'dragon_scale:20%'] },
    consequences: {
      criticalSuccess: 'You defeat the guardian and claim its entire hoard!',
      success: 'You defeat the guardian after a fierce battle.',
      failure: 'You grab some treasure but take heavy damage escaping.',
      criticalFailure: 'The guardian drives you out, wounded and empty-handed.'
    }
  },

};
