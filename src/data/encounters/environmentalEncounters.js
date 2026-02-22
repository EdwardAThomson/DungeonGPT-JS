// Environmental encounters

export const ENVIRONMENTAL_ENCOUNTERS = {
  'sudden_storm': {
    name: 'Sudden Storm',
    icon: '⛈️',
    encounterTier: 'immediate',
    environmental: true,
    description: 'Dark clouds gather with unnatural speed and a violent storm breaks overhead!',
    difficulty: 'medium',
    suggestedActions: [
      { label: 'Find Shelter', skill: 'Survival', description: 'Locate cover quickly' },
      { label: 'Press On', skill: 'Constitution', description: 'Endure the storm' },
      { label: 'Make Camp', skill: 'Survival', description: 'Set up emergency shelter' },
      { label: 'Arcane Shield', skill: 'Arcana', description: 'Use magic for protection' }
    ],
    rewards: { xp: 30, gold: '0', items: ['rainwater:70%', 'storm_crystal:20%'] },
    consequences: {
      criticalSuccess: 'You find excellent shelter and the storm uncovers hidden treasures.',
      success: 'You weather the storm with minimal difficulty.',
      failure: 'The storm soaks your equipment and slows travel.',
      criticalFailure: 'Lightning strikes nearby - you take damage and lose supplies.'
    }
  },

  'thick_fog': {
    name: 'Unnatural Fog',
    icon: '🌫️',
    encounterTier: 'narrative',
    environmental: true,
    narrativeHook: 'a wall of thick fog rolling across the land',
    aiContext: 'Dense fog blankets the area, reducing visibility to nearly nothing. Strange sounds echo through the mist. The fog might be natural, magical, or hiding something.',
    description: 'Impenetrable fog rolls in, reducing visibility to mere feet. Strange sounds echo in the whiteness.',
    difficulty: 'easy',
    suggestedActions: [
      { label: 'Navigate', skill: 'Survival', description: 'Try to maintain direction' },
      { label: 'Wait', skill: null, description: 'Let the fog pass' },
      { label: 'Listen', skill: 'Perception', description: 'Identify sounds in the fog' },
      { label: 'Dispel', skill: 'Arcana', description: 'Clear the fog magically' }
    ],
    rewards: { xp: 25, gold: '0', items: ['fog_essence:40%', 'hidden_path:30%'] },
    consequences: {
      criticalSuccess: 'You navigate perfectly and find something hidden by the fog.',
      success: 'You make it through without incident.',
      failure: 'You get turned around and lose time.',
      criticalFailure: 'You stumble into danger hidden by the fog.'
    }
  },

  'earthquake': {
    name: 'Earthquake',
    icon: '🌋',
    encounterTier: 'immediate',
    environmental: true,
    description: 'The ground shakes violently as an earthquake strikes!',
    difficulty: 'hard',
    suggestedActions: [
      { label: 'Drop and Cover', skill: 'Acrobatics', description: 'Protect yourself from debris' },
      { label: 'Find Open Ground', skill: 'Athletics', description: 'Get away from structures' },
      { label: 'Stabilize Footing', skill: 'Acrobatics', description: 'Keep your balance' },
      { label: 'Help Others', skill: 'Athletics', description: 'Assist party members' }
    ],
    rewards: { xp: 50, gold: '0', items: ['exposed_minerals:50%', 'uncovered_ruins:25%', 'fallen_treasure:30%'] },
    consequences: {
      criticalSuccess: 'You help everyone stay safe and the quake reveals something valuable.',
      success: 'You weather the earthquake without injury.',
      failure: 'You take minor injuries from falling debris.',
      criticalFailure: 'You fall into a fissure and must be rescued.'
    }
  },

  'heat_wave': {
    name: 'Scorching Heat',
    icon: '🔥',
    encounterTier: 'narrative',
    environmental: true,
    narrativeHook: 'the air shimmering with intense heat',
    aiContext: 'An oppressive heat wave makes travel dangerous. Dehydration and heat exhaustion threaten the party. Finding water and shade becomes critical.',
    description: 'The sun beats down mercilessly, the air so hot it shimmers. Every step is exhausting.',
    difficulty: 'medium',
    suggestedActions: [
      { label: 'Find Water', skill: 'Survival', description: 'Search for a water source' },
      { label: 'Travel at Night', skill: 'Survival', description: 'Rest during the day' },
      { label: 'Create Shade', skill: 'Survival', description: 'Improvise sun protection' },
      { label: 'Push Through', skill: 'Constitution', description: 'Endure the heat' }
    ],
    rewards: { xp: 30, gold: '0', items: ['survival_experience:60%', 'desert_flower:30%'] },
    consequences: {
      criticalSuccess: 'You find an oasis with cool water and shade.',
      success: 'You manage the heat effectively.',
      failure: 'The heat saps your strength - travel is slower.',
      criticalFailure: 'Someone collapses from heat exhaustion.'
    }
  },

  'strange_lights': {
    name: 'Strange Lights',
    icon: '✨',
    encounterTier: 'narrative',
    environmental: true,
    narrativeHook: 'mysterious lights dancing on the horizon',
    aiContext: 'Unexplained lights appear in the sky or floating above the ground. They could be will-o-wisps, magical phenomena, or signals from other travelers.',
    description: 'Eerie lights dance in the distance, their colors shifting and their movement almost purposeful.',
    difficulty: 'easy',
    suggestedActions: [
      { label: 'Follow', skill: 'Survival', description: 'Track the lights to their source' },
      { label: 'Study', skill: 'Arcana', description: 'Analyze the magical nature' },
      { label: 'Signal Back', skill: 'Survival', description: 'Try to communicate' },
      { label: 'Ignore', skill: null, description: 'Continue on your way' }
    ],
    rewards: { xp: 35, gold: '1d20', items: ['wisp_essence:40%', 'magical_discovery:50%', 'traveler_contact:30%'] },
    consequences: {
      criticalSuccess: 'The lights lead you to treasure or helpful allies.',
      success: 'You discover the lights are a natural phenomenon and gain knowledge.',
      failure: 'The lights lead nowhere interesting.',
      criticalFailure: 'The lights were a trap - you\'re ambushed or lost.'
    }
  }

};
