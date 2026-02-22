// Mountain POI encounters

export const MOUNTAIN_ENCOUNTERS = {
  'mountain_pass': {
    name: 'Treacherous Pass',
    icon: '🏔️',
    encounterTier: 'narrative',
    poiType: 'mountain',
    narrativeHook: 'a narrow path winding along a sheer cliff face',
    aiContext: 'The mountain pass is narrow and dangerous, with sheer drops and loose rocks. One wrong step could be fatal, but it\'s the only way through the peaks.',
    description: 'A narrow trail clings to the mountainside, with deadly drops on one side and unstable rocks above.',
    difficulty: 'medium',
    suggestedActions: [
      { label: 'Proceed Carefully', skill: 'Acrobatics', description: 'Navigate with extreme care' },
      { label: 'Climb Above', skill: 'Athletics', description: 'Find a higher route' },
      { label: 'Scout Ahead', skill: 'Perception', description: 'Identify the safest path' },
      { label: 'Turn Back', skill: null, description: 'Find another way' }
    ],
    rewards: { xp: 45, gold: '0', items: ['mountain_crystal:50%', 'eagle_feather:30%', 'rare_ore:25%'] },
    consequences: {
      criticalSuccess: 'You find a hidden shortcut and rare mountain treasures.',
      success: 'You cross safely and continue your journey.',
      failure: 'The crossing is slow and exhausting.',
      criticalFailure: 'A rockslide blocks the path - you must dig through or retreat.'
    }
  },

  'mountain_dragon': {
    name: 'Dragon\'s Lair',
    icon: '🐲',
    encounterTier: 'immediate',
    poiType: 'mountain',
    description: 'A dragon emerges from its mountain lair, ancient and terrible, demanding tribute or combat!',
    difficulty: 'deadly',
    multiRound: true,
    enemyHP: 120,
    suggestedActions: [
      { label: 'Fight', skill: 'Athletics', description: 'Battle the dragon' },
      { label: 'Negotiate', skill: 'Persuasion', description: 'Offer tribute or service' },
      { label: 'Flee', skill: 'Athletics', description: 'Run for your lives' },
      { label: 'Riddle', skill: 'Intelligence', description: 'Challenge it to a battle of wits' }
    ],
    rewards: { xp: 200, gold: '20d20', items: ['dragon_scale:80%', 'dragon_gold:90%', 'legendary_artifact:25%', 'dragon_egg:5%'] },
    consequences: {
      criticalSuccess: 'You slay or outsmart the dragon and claim its hoard!',
      success: 'You survive the encounter and escape with some treasure.',
      failure: 'You escape with your lives but nothing else.',
      criticalFailure: 'The dragon pursues you - lose equipment and take heavy damage.'
    }
  },

  'mountain_hermit_cave': {
    name: 'Mountain Cave Hermit',
    icon: '🧙',
    encounterTier: 'narrative',
    poiType: 'mountain',
    narrativeHook: 'smoke rising from a cave dwelling high on the mountainside',
    aiContext: 'A hermit dwells in a mountain cave, having left civilization behind to seek wisdom or hide from their past. They might share knowledge, trade, or prefer to be left alone.',
    description: 'An elderly hermit tends a fire outside their mountain cave, eyeing your approach with suspicion.',
    difficulty: 'easy',
    suggestedActions: [
      { label: 'Greet Friendly', skill: 'Persuasion', description: 'Approach with respect' },
      { label: 'Offer Trade', skill: 'Persuasion', description: 'Propose an exchange' },
      { label: 'Ask for Wisdom', skill: 'Insight', description: 'Seek their knowledge' },
      { label: 'Leave Alone', skill: null, description: 'Respect their solitude' }
    ],
    rewards: { xp: 40, gold: '1d10', items: ['hermit_wisdom:60%', 'mountain_herbs:50%', 'old_map:35%', 'enchanted_staff:15%'] },
    consequences: {
      criticalSuccess: 'The hermit was once a great wizard and teaches you powerful secrets.',
      success: 'The hermit shares useful knowledge about the mountains.',
      failure: 'The hermit is unfriendly but not hostile.',
      criticalFailure: 'The hermit is paranoid and attacks, or their past catches up.'
    }
  },

  'mountain_eagle_nest': {
    name: 'Giant Eagle Nest',
    icon: '🦅',
    encounterTier: 'narrative',
    poiType: 'mountain',
    narrativeHook: 'massive feathers scattered on a high ledge',
    aiContext: 'A giant eagle\'s nest sits on a high ledge, containing eggs or fledglings. The eagles are intelligent and might be befriended or could attack intruders.',
    description: 'A massive nest of woven branches perches on a ledge, the screech of giant eagles echoing off the peaks.',
    difficulty: 'medium',
    suggestedActions: [
      { label: 'Approach Slowly', skill: 'Animal Handling', description: 'Try to befriend the eagles' },
      { label: 'Offer Food', skill: 'Survival', description: 'Share your rations' },
      { label: 'Climb to Nest', skill: 'Athletics', description: 'Investigate the nest' },
      { label: 'Observe', skill: 'Perception', description: 'Watch from a safe distance' }
    ],
    rewards: { xp: 55, gold: '0', items: ['giant_feather:80%', 'eagle_blessing:30%', 'mountain_view:50%', 'eagle_ally:20%'] },
    consequences: {
      criticalSuccess: 'You befriend the eagles - they offer to carry you where you need to go.',
      success: 'The eagles accept you and you gather valuable feathers.',
      failure: 'The eagles tolerate your presence but nothing more.',
      criticalFailure: 'The eagles attack to protect their nest!'
    }
  },

};
