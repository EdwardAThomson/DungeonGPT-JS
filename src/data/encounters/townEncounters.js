// Town-specific encounters

export const TOWN_ENCOUNTERS = {
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

};
