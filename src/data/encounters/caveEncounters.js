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
    image: '/assets/encounters/cave_entrance.webp',
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
    image: '/assets/encounters/cave_bats.webp',
    difficulty: 'easy',
    dealsDamage: true, // #43 explicit damage flag (was keyword-matched or newly hostile)
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

  // Level-matched filler (#combat-tuning): a MEDIUM immediate cave fight so a
  // low-level party drawing a random wilderness slot meets a fair foe instead of
  // the hard spider nest / deadly guardian. Selected by party level in
  // sitePopulator (never for quest/milestone bosses). Explicit `dc` pins the
  // sim-validated ~30-90% mid-gear band without inventing a new difficulty label.
  'cave_giant_rats': {
    name: 'Giant Rat Pack',
    icon: '🐀',
    encounterTier: 'immediate',
    poiType: 'cave',
    description: 'A scrabbling tide of dog-sized rats pours out of a side tunnel, teeth bared!',
    image: '/assets/encounters/cave_giant_rats.webp',
    difficulty: 'medium',
    dc: 17,
    dealsDamage: true,
    multiRound: true,
    enemyHP: 40,
    suggestedActions: [
      { label: 'Attack', skill: 'Athletics', description: 'Cut through the pack' },
      { label: 'Hold the Line', skill: 'Athletics', description: 'Fight them off at a chokepoint' },
      { label: 'Dodge', skill: 'Acrobatics', description: 'Stay clear of the swarm' },
      { label: 'Drive Off', skill: 'Intimidation', description: 'Scare them back into the dark' }
    ],
    rewards: { xp: 45, gold: '1d10', items: ['bat_guano:50%', 'raw_gems:30%'] },
    consequences: {
      criticalSuccess: 'You scatter the pack and find a gnawed pouch of coin among the nests.',
      success: 'You beat the rats back and press on.',
      failure: 'The rats nip and bite before fleeing, leaving you scratched.',
      criticalFailure: 'The swarm overwhelms you - you retreat bleeding and short of supplies.'
    }
  },

  'cave_spider_nest': {
    name: 'Spider Nest',
    icon: '🕷️',
    encounterTier: 'immediate',
    poiType: 'cave',
    description: 'Thick webs coat the cave walls, and massive spiders descend from the darkness above!',
    image: '/assets/encounters/cave_spider_nest.webp',
    difficulty: 'hard',
    dealsDamage: true, // #43 explicit damage flag (was keyword-matched or newly hostile)
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
      failure: 'Venomous bites sink deep as the spiders swarm over you.',
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
    image: '/assets/encounters/underground_lake.webp',
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
    image: '/assets/encounters/cave_treasure_guardian.webp',
    difficulty: 'deadly',
    dealsDamage: true, // #43 explicit damage flag (was keyword-matched or newly hostile)
    multiRound: true,
    enemyHP: 80,
    suggestedActions: [
      { label: 'Fight', skill: 'Athletics', description: 'Battle the guardian' },
      { label: 'Negotiate', skill: 'Persuasion', description: 'Try to reason with it' },
      { label: 'Distract', skill: 'Deception', description: 'Create a diversion to grab treasure' },
      { label: 'Flee', skill: 'Athletics', description: 'Run for your life' }
    ],
    // stormbound_ring (#44): very_rare findable accessory; filterDropsByTier holds it
    // back until Tier 2 play.
    rewards: { xp: 150, gold: '10d20', items: ['rare_gem:70%', 'magic_weapon:40%', 'ancient_artifact:30%', 'dragon_scale:20%', 'stormbound_ring:10%'] },
    consequences: {
      criticalSuccess: 'You defeat the guardian and claim its entire hoard!',
      success: 'You defeat the guardian after a fierce battle.',
      failure: 'You grab some treasure but take heavy damage escaping.',
      criticalFailure: 'The guardian drives you out, wounded and empty-handed.'
    }
  },

  // Variety spawns (playtest 2026-07-18): the cave pool was bats + one hard nest + a
  // deadly guardian. These fill the EASY/MEDIUM band so caves are lively but fair — fun
  // with some bite, not a survival grind. Stats sit at or below cave_giant_rats (the
  // sim-validated mid-tier reference); DCs and HP are checked with balanceSim.
  'cave_kobolds': {
    name: 'Kobold Skulkers',
    icon: '🦎',
    encounterTier: 'immediate',
    poiType: 'cave',
    description: 'Yipping kobolds boil out of a side tunnel, jabbing with crude spears and hurling stones from the dark!',
    image: '/assets/encounters/cave_kobolds.webp',
    // 'easy' keeps the damage multiplier gentle; dc/HP tuned so the fight sims inside the
    // 30-90% wilderness band (progressionLint) instead of a ~95% walkover (was dc12/hp24).
    difficulty: 'easy',
    dc: 15,
    dealsDamage: true,
    multiRound: true,
    enemyHP: 32,
    suggestedActions: [
      { label: 'Attack', skill: 'Athletics', description: 'Cut down the skulkers' },
      { label: 'Hold a Chokepoint', skill: 'Athletics', description: 'Funnel them so they can\'t swarm' },
      { label: 'Scare Them Off', skill: 'Intimidation', description: 'Break their nerve with a show of force' },
      { label: 'Dodge Their Traps', skill: 'Acrobatics', description: 'Pick a safe path through the tripwires' }
    ],
    rewards: { xp: 35, gold: '1d12', items: ['raw_gems:35%', 'cave_mushrooms:50%', 'healing_potion:15%'] },
    consequences: {
      criticalSuccess: 'You rout the kobolds and loot their crude stash of shinies.',
      success: 'You drive the kobolds back into the dark and press on.',
      failure: 'A few spears and slung stones find their mark before the kobolds scatter.',
      criticalFailure: 'The kobolds spring their traps - you retreat scraped and rattled.'
    }
  },

  'cave_lurker': {
    name: 'Cave Lurker',
    icon: '👁️',
    encounterTier: 'immediate',
    poiType: 'cave',
    description: 'A pale, blind predator unfolds from a ceiling crevice, tasting the air as it drops toward you!',
    image: '/assets/encounters/cave_lurker.webp',
    difficulty: 'medium',
    dc: 15,
    dealsDamage: true,
    multiRound: true,
    enemyHP: 34,
    suggestedActions: [
      { label: 'Attack', skill: 'Athletics', description: 'Strike before it pins you' },
      { label: 'Hold Still', skill: 'Stealth', description: 'It hunts by sound - go silent and let it pass' },
      { label: 'Blind It With Light', skill: 'Arcana', description: 'A burst of light overwhelms its senses' },
      { label: 'Back Away', skill: 'Acrobatics', description: 'Give ground toward the exit without a sound' }
    ],
    rewards: { xp: 55, gold: '1d10', items: ['spider_silk:40%', 'raw_gems:45%', 'poison_vial:25%'] },
    consequences: {
      criticalSuccess: 'You fell the lurker clean and find its nest lined with swallowed valuables.',
      success: 'You beat the lurker off and move on, wary of the ceiling.',
      failure: 'It rakes you once before slinking back into the dark.',
      criticalFailure: 'The lurker drags you off your feet - you break free bloodied and shaken.'
    }
  },

  // A one-shot HAZARD (single-round, no enemyHP), like cave_bats: it fires as a passing
  // wandering event, never a chasing mob. A quick check to avoid the falling rock.
  'cave_in': {
    name: 'Cave-In',
    icon: '🪨',
    encounterTier: 'immediate',
    poiType: 'cave',
    description: 'A deep groan runs through the rock and the ceiling begins to give way in a rain of dust and stone!',
    image: '/assets/encounters/cave_in.webp',
    difficulty: 'easy',
    dealsDamage: true,
    suggestedActions: [
      { label: 'Dive Clear', skill: 'Acrobatics', description: 'Throw yourself out of the fall zone' },
      { label: 'Shelter', skill: 'Survival', description: 'Duck under a sturdy overhang' },
      { label: 'Sprint Through', skill: 'Athletics', description: 'Outrun the collapse' },
      { label: 'Brace a Beam', skill: 'Athletics', description: 'Hold the timbers long enough to pass' }
    ],
    rewards: { xp: 20, gold: '0', items: ['raw_gems:40%', 'exposed_minerals:55%'] },
    consequences: {
      criticalSuccess: 'You ride out the collapse and spot fresh ore laid bare in the rubble.',
      success: 'You scramble clear as the passage fills behind you.',
      failure: 'Falling stone catches you a glancing blow before you break clear.',
      criticalFailure: 'The collapse batters you and buries the way ahead - you dig out slowly.'
    }
  },

};
