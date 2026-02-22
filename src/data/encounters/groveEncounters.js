// Grove and forest POI encounters

export const GROVE_ENCOUNTERS = {
  'sacred_grove': {
    name: 'Sacred Grove',
    icon: '🌳',
    encounterTier: 'narrative',
    poiType: 'grove',
    narrativeHook: 'an ancient circle of trees radiating peaceful energy',
    aiContext: 'A ring of ancient trees marks a sacred grove. The air feels charged with natural magic. Druids or forest spirits might dwell here, and the grove could offer healing or blessings.',
    description: 'A circle of towering ancient trees surrounds a peaceful clearing, humming with natural magic.',
    difficulty: 'easy',
    suggestedActions: [
      { label: 'Meditate', skill: 'Religion', description: 'Commune with nature spirits' },
      { label: 'Offer Gift', skill: 'Nature', description: 'Leave an offering' },
      { label: 'Rest', skill: null, description: 'Take shelter in the grove' },
      { label: 'Harvest', skill: 'Survival', description: 'Gather rare herbs' }
    ],
    rewards: { xp: 35, gold: '0', items: ['healing_herbs:70%', 'nature_blessing:40%', 'druid_token:25%', 'rare_flower:35%'] },
    consequences: {
      criticalSuccess: 'The grove\'s guardian appears and grants you a powerful blessing.',
      success: 'You feel refreshed and find useful herbs.',
      failure: 'The grove offers rest but no special benefits.',
      criticalFailure: 'You offend the forest spirits who curse your passage.'
    }
  },

  'dryad_encounter': {
    name: 'Dryad Guardian',
    icon: '🧚',
    encounterTier: 'narrative',
    poiType: 'grove',
    narrativeHook: 'a beautiful figure seeming to emerge from an ancient tree',
    aiContext: 'A dryad, guardian of the grove, reveals herself. She might offer aid to those who respect the forest, or punish those who harm it. Her favor could open paths through the deepest woods.',
    description: 'A beautiful spirit steps from an ancient oak, her form shifting between woman and tree.',
    difficulty: 'medium',
    suggestedActions: [
      { label: 'Greet Respectfully', skill: 'Persuasion', description: 'Show proper respect' },
      { label: 'Offer Service', skill: 'Nature', description: 'Promise to help the forest' },
      { label: 'Ask for Aid', skill: 'Persuasion', description: 'Request her assistance' },
      { label: 'Back Away', skill: 'Stealth', description: 'Leave without disturbing her' }
    ],
    rewards: { xp: 50, gold: '0', items: ['dryad_blessing:50%', 'enchanted_seed:40%', 'forest_map:60%', 'nature_charm:30%'] },
    consequences: {
      criticalSuccess: 'The dryad marks you as a friend of the forest - all woodland creatures will aid you.',
      success: 'The dryad shares forest secrets and safe paths.',
      failure: 'The dryad is indifferent and lets you pass.',
      criticalFailure: 'The dryad sees threat and entangles you in vines.'
    }
  },

  'forest_beast': {
    name: 'Awakened Beast',
    icon: '🐗',
    encounterTier: 'immediate',
    poiType: 'grove',
    description: 'A massive boar, its eyes glowing with unnatural intelligence, charges from the undergrowth!',
    difficulty: 'hard',
    multiRound: true,
    enemyHP: 55,
    suggestedActions: [
      { label: 'Fight', skill: 'Athletics', description: 'Stand and fight' },
      { label: 'Calm', skill: 'Animal Handling', description: 'Try to pacify the beast' },
      { label: 'Dodge', skill: 'Acrobatics', description: 'Evade its charge' },
      { label: 'Climb', skill: 'Athletics', description: 'Get to the trees' }
    ],
    rewards: { xp: 75, gold: '0', items: ['beast_hide:70%', 'enchanted_tusk:40%', 'primal_essence:25%'] },
    consequences: {
      criticalSuccess: 'You calm the beast and it becomes a temporary ally.',
      success: 'You defeat or drive off the beast.',
      failure: 'You escape but suffer injuries from its tusks.',
      criticalFailure: 'The beast gores you badly before you escape.'
    }
  },

  'fairy_ring': {
    name: 'Fairy Ring',
    icon: '🍄',
    encounterTier: 'narrative',
    poiType: 'grove',
    narrativeHook: 'a perfect circle of mushrooms glowing softly in the twilight',
    aiContext: 'A ring of luminescent mushrooms marks a fairy crossing. Stepping inside could transport you elsewhere, attract fey attention, or grant strange gifts - but fairy bargains are tricky.',
    description: 'Glowing mushrooms form a perfect circle, the air within shimmering with otherworldly light.',
    difficulty: 'medium',
    suggestedActions: [
      { label: 'Step Inside', skill: 'Arcana', description: 'Enter the fairy ring' },
      { label: 'Speak to Fey', skill: 'Persuasion', description: 'Call out to fairy folk' },
      { label: 'Harvest Mushrooms', skill: 'Nature', description: 'Gather the magical fungi' },
      { label: 'Avoid', skill: null, description: 'Steer clear of fey magic' }
    ],
    rewards: { xp: 60, gold: '2d20', items: ['fairy_dust:60%', 'fey_charm:40%', 'enchanted_mushroom:50%', 'pixie_gold:30%'] },
    consequences: {
      criticalSuccess: 'Friendly fey grant you a wish or powerful boon.',
      success: 'You gain fairy gifts and useful magical items.',
      failure: 'The fey play tricks but cause no lasting harm.',
      criticalFailure: 'You\'re transported elsewhere and must find your way back.'
    }
  },

};
