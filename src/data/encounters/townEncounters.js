// Town-specific encounters

export const TOWN_ENCOUNTERS = {
  'tavern_brawl': {
    name: 'Tavern Brawl',
    icon: '🍺',
    encounterTier: 'immediate',
    description: 'A drunken argument erupts into a full-blown brawl at the local tavern. Chairs fly and fists swing!',
    image: '/assets/encounters/tavern_brawl.webp',
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
    aiContext: 'The town square is alive with color and noise. Merchants hawking their wares, guards patrolling, and people from all walks of life going about their business.',
    description: 'The town square is packed with stalls and people. The air is filled with the scent of spices and the sound of trade.',
    image: '/assets/encounters/town_market.webp',
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
    aiContext: 'A large wooden board stands in the center of town, covered in small scrolls and posters. Some offer work, others warn of dangers in the surrounding lands.',
    description: 'Bounties, requests for help, and warnings for travelers are pinned to this central notice board.',
    image: '/assets/encounters/town_quest_board.webp',
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

  'traveling_healer': {
    name: 'Traveling Healer',
    icon: '⚕️',
    encounterTier: 'narrative',
    narrativeHook: 'a healer\'s tent with the scent of medicinal herbs',
    aiContext: 'A colorful tent stands near the town well, its entrance marked by bundles of drying herbs. A kindly healer tends to the sick and injured, offering remedies and blessings to those in need.',
    description: 'A kindly healer has set up a tent near the town well, offering remedies and blessings to weary travelers.',
    image: '/assets/encounters/traveling_healer.webp',
    difficulty: 'easy',
    suggestedActions: [
      { label: 'Seek Healing', skill: 'Persuasion', description: 'Ask for treatment of injuries' },
      { label: 'Buy Potions', skill: 'Persuasion', description: 'Purchase healing supplies' },
      { label: 'Trade Knowledge', skill: 'Medicine', description: 'Exchange medical knowledge' },
      { label: 'Decline', skill: null, description: 'Thank them and move on' }
    ],
    rewards: { xp: 15, gold: '0', items: ['healing_potion:70%', 'antidote:40%', 'herbal_remedy:50%'], healing: '2d8+4' },
    consequences: {
      criticalSuccess: 'The healer mends your wounds completely and gifts you a powerful restorative.',
      success: 'You receive helpful treatment and your wounds begin to close.',
      failure: 'The healer is busy but applies a minor salve to your wounds.',
      criticalFailure: 'The healer\'s remedy stings painfully, though it does provide minor relief.'
    },
    healingByTier: {
      criticalSuccess: 'full',  // Full heal
      success: '2d8+4',         // Good healing
      failure: '1d4',           // Minor healing
      criticalFailure: '1d4'    // Minor healing despite side effects
    }
  },

  'town_healer': {
    name: 'Town Healer',
    icon: '🏥',
    encounterTier: 'narrative',
    narrativeHook: 'a professional-looking clinic in the heart of town',
    aiContext: 'A clean, well-lit building serves as the town\'s primary medical facility. Inside, a dignified physician oversees several assistants. The atmosphere is professional and organized, suggesting reliable but potentially expensive care.',
    description: 'You visit the local physician, whose clinic is filled with neatly labeled jars and clean bandages.',
    image: '/assets/encounters/town_healer.webp',
    difficulty: 'easy',
    suggestedActions: [
      { label: 'Consult Healer', skill: 'Persuasion', description: 'Ask for professional medical help' },
      { label: 'Stock Up', skill: 'Persuasion', description: 'Buy official medical supplies' },
      { label: 'Volunteer', skill: 'Medicine', description: 'Offer to help for experience' },
      { label: 'Leave', skill: null, description: 'Step back out into the street' }
    ],
    rewards: { xp: 20, gold: '0', items: ['healing_potion:80%', 'medicine_kit:50%', 'medical_journal:20%'], healing: '3d8+6' },
    consequences: {
      criticalSuccess: 'The physician is impressed by your constitution and treats you as a priority, providing exceptional care.',
      success: 'The treatment is efficient and highly effective.',
      failure: 'The clinic is busy; you wait a long time for basic treatment.',
      criticalFailure: 'The treatment is exorbitant and only moderately effective.'
    },
    healingByTier: {
      criticalSuccess: 'full',
      success: '3d8+6',
      failure: '1d8',
      criticalFailure: '1d4'
    }
  },

  'suspicious_stranger': {
    name: 'Suspicious Stranger',
    icon: '🕵️',
    encounterTier: 'narrative',
    narrativeHook: 'a hooded figure lurking in the shadows',
    aiContext: 'A figure cloaked in shadows leans against a wall in a narrow alley, watching the crowd with keen eyes. They seem to be waiting for someone.',
    description: 'A hooded figure signals you to follow them into a dark alleyway.',
    image: '/assets/encounters/suspicious_stranger.webp',
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

};
