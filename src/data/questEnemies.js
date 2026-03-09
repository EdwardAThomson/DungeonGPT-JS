// Quest enemy registry for milestone combat encounters.
// Each enemy is a complete encounter definition that can be referenced by ID.
// Organized by tier so the campaign configurator can filter by level range.
//
// Tier 1 (Lv 1-2): HP 20-40, rewards 25-75 XP
// Tier 2 (Lv 3-4): HP 100-200, rewards 100-350 XP
// Tier 3 (Lv 5+):  HP 250-400, rewards 300-500 XP

export const QUEST_ENEMIES = {
    // ============================================================
    // TIER 1 — Local threats
    // ============================================================
    goblin_chieftain: {
        name: 'Goblin Chieftain',
        icon: '👺',
        image: '/assets/encounters/bosses/goblin_chieftain.webp',
        tier: 1,
        theme: 'heroic-fantasy',
        encounterTier: 'boss',
        difficulty: 'medium',
        multiRound: true,
        enemyHP: 30,
        suggestedActions: [
            { label: 'Fight', skill: 'Athletics', description: 'Charge the chieftain head-on' },
            { label: 'Outflank', skill: 'Stealth', description: 'Approach from a blind spot' },
            { label: 'Rally Allies', skill: 'Persuasion', description: 'Call allies to back you up' }
        ],
        consequences: {
            criticalSuccess: 'The chieftain falls with a single decisive blow. Its followers scatter in panic.',
            success: 'After a scrappy fight, the chieftain is defeated. The remaining goblins flee.',
            failure: 'The chieftain lands a nasty hit before you drive it back.',
            criticalFailure: 'The chieftain\'s bodyguards swarm you. You barely escape with your life.'
        },
        rewards: { xp: 75, gold: '2d10', items: ['rusty_dagger'] }
    },

    blightspawn: {
        name: 'Blightspawn',
        icon: '🦠',
        image: '/assets/icons/items/ritual_dagger.webp',
        tier: 1,
        theme: 'grimdark-survival',
        encounterTier: 'boss',
        difficulty: 'medium',
        multiRound: true,
        enemyHP: 25,
        suggestedActions: [
            { label: 'Strike', skill: 'Athletics', description: 'Hack at the writhing mass' },
            { label: 'Use Herbs', skill: 'Medicine', description: 'Apply herbs to burn the blight' },
            { label: 'Burn It', skill: 'Survival', description: 'Set a torch to the infected roots' }
        ],
        consequences: {
            criticalSuccess: 'The blightspawn shrieks and dissolves. The air clears almost immediately.',
            success: 'You destroy the creature. The blight will take time to fade, but the source is gone.',
            failure: 'Toxic spores burst from the creature, burning your lungs.',
            criticalFailure: 'The blightspawn splits into smaller horrors. You flee, coughing and bleeding.'
        },
        rewards: { xp: 50, gold: '1d10', items: ['antidote'] }
    },

    rogue_automaton: {
        name: 'Rogue Automaton',
        icon: '🤖',
        image: '/assets/icons/items/ritual_dagger.webp',
        tier: 1,
        theme: 'arcane-renaissance',
        encounterTier: 'boss',
        difficulty: 'medium',
        multiRound: true,
        enemyHP: 35,
        suggestedActions: [
            { label: 'Smash', skill: 'Athletics', description: 'Attack its joints and gears' },
            { label: 'Use Control Rod', skill: 'Arcana', description: 'Override its commands' },
            { label: 'Disassemble', skill: 'Investigation', description: 'Find and exploit its weak point' }
        ],
        consequences: {
            criticalSuccess: 'You jam the control rod into its core. It freezes mid-swing and powers down.',
            success: 'After a clanking battle, the automaton collapses in a shower of sparks.',
            failure: 'A piston-driven fist sends you sprawling. Gears grind ominously.',
            criticalFailure: 'The automaton goes into overdrive. You barely dodge a lethal swipe.'
        },
        rewards: { xp: 60, gold: '2d10', items: ['enchanted_trinket'] }
    },

    cult_leader: {
        name: 'The Hooded Priest',
        icon: '🕯️',
        image: '/assets/icons/items/ritual_dagger.webp',
        tier: 1,
        theme: 'eldritch-horror',
        encounterTier: 'boss',
        difficulty: 'medium',
        multiRound: true,
        enemyHP: 30,
        suggestedActions: [
            { label: 'Attack', skill: 'Athletics', description: 'Strike before they complete the ritual' },
            { label: 'Disrupt Ritual', skill: 'Arcana', description: 'Break the summoning circle' },
            { label: 'Expose', skill: 'Persuasion', description: 'Turn the cultists against their leader' }
        ],
        consequences: {
            criticalSuccess: 'You shatter the ritual focus. The priest screams as dark power rebounds on them.',
            success: 'The priest falls. The remaining cultists drop their daggers and flee into the night.',
            failure: 'Dark energy lashes out, searing your skin. The priest laughs.',
            criticalFailure: 'Something half-formed writhes in the summoning circle. You run.'
        },
        rewards: { xp: 50, gold: '1d10', items: ['dark_tome'] }
    },

    bandit_king: {
        name: 'Bandit King',
        icon: '🗡️',
        image: '/assets/encounters/bosses/bandit_king.webp',
        tier: 1,
        theme: 'heroic-fantasy',
        encounterTier: 'boss',
        difficulty: 'medium',
        multiRound: true,
        enemyHP: 35,
        suggestedActions: [
            { label: 'Duel', skill: 'Athletics', description: 'Challenge the bandit king to single combat' },
            { label: 'Ambush', skill: 'Stealth', description: 'Turn their own tactics against them' },
            { label: 'Intimidate', skill: 'Intimidation', description: 'Break their nerve with a show of force' }
        ],
        consequences: {
            criticalSuccess: 'Your blade finds its mark. The bandit king crumples, and the camp surrenders.',
            success: 'A hard-fought duel ends with the bandit king disarmed and defeated.',
            failure: 'The bandit king is tougher than expected. You take a deep cut.',
            criticalFailure: 'The bandits close ranks around their leader. You\'re badly outnumbered.'
        },
        rewards: { xp: 65, gold: '3d10', items: ['silver_dagger'] }
    },

    plague_rat_king: {
        name: 'Plague Rat King',
        icon: '🐀',
        image: '/assets/icons/items/ritual_dagger.webp',
        tier: 1,
        theme: 'grimdark-survival',
        encounterTier: 'boss',
        difficulty: 'medium',
        multiRound: true,
        enemyHP: 20,
        suggestedActions: [
            { label: 'Strike', skill: 'Athletics', description: 'Attack the writhing mass of vermin' },
            { label: 'Use Fire', skill: 'Survival', description: 'Torch the nest' },
            { label: 'Poison Bait', skill: 'Medicine', description: 'Lure it with tainted food' }
        ],
        consequences: {
            criticalSuccess: 'The rat king bursts apart as the colony scatters, the plague source destroyed.',
            success: 'The grotesque thing finally stops twitching. The sewer reeks of burnt fur.',
            failure: 'Diseased rats swarm over you, biting and scratching.',
            criticalFailure: 'The rat king seems to grow larger as more vermin join the mass. You retreat.'
        },
        rewards: { xp: 40, gold: '1d6', items: ['antidote'] }
    },

    clockwork_spider: {
        name: 'Clockwork Spider',
        icon: '🕷️',
        image: '/assets/icons/items/ritual_dagger.webp',
        tier: 1,
        theme: 'arcane-renaissance',
        encounterTier: 'boss',
        difficulty: 'medium',
        multiRound: true,
        enemyHP: 30,
        suggestedActions: [
            { label: 'Smash', skill: 'Athletics', description: 'Crush its mechanical legs' },
            { label: 'Short Circuit', skill: 'Arcana', description: 'Overload its arcane core' },
            { label: 'Lure Away', skill: 'Stealth', description: 'Lead it into a trap' }
        ],
        consequences: {
            criticalSuccess: 'The spider\'s core overloads and it collapses in a shower of brass gears.',
            success: 'You pry open its carapace and tear out the power crystal. It goes still.',
            failure: 'A razor-sharp leg slashes your arm. Venom-laced oil burns the wound.',
            criticalFailure: 'The spider deploys a web of copper wire. You\'re tangled and shocked.'
        },
        rewards: { xp: 55, gold: '2d10', items: ['enchanted_trinket'] }
    },

    rune_golem: {
        name: 'Rune Golem',
        icon: '🗿',
        image: '/assets/icons/items/ritual_dagger.webp',
        tier: 1,
        theme: 'arcane-renaissance',
        encounterTier: 'boss',
        difficulty: 'medium',
        multiRound: true,
        enemyHP: 40,
        suggestedActions: [
            { label: 'Strike', skill: 'Athletics', description: 'Batter its stone frame' },
            { label: 'Erase Runes', skill: 'Arcana', description: 'Disrupt the binding glyphs' },
            { label: 'Find Weak Point', skill: 'Investigation', description: 'Locate the cracked binding stone' }
        ],
        consequences: {
            criticalSuccess: 'You scratch through the master rune. The golem crumbles to inert rubble.',
            success: 'Blow by blow, you chip away the runes. The golem staggers and falls.',
            failure: 'A stone fist catches you square. Your shield arm goes numb.',
            criticalFailure: 'The golem regenerates its cracked stones. You need a new approach.'
        },
        rewards: { xp: 70, gold: '2d10', items: ['mountain_crystal'] }
    },

    deep_one_scout: {
        name: 'Deep One Scout',
        icon: '🐟',
        image: '/assets/icons/items/ritual_dagger.webp',
        tier: 1,
        theme: 'eldritch-horror',
        encounterTier: 'boss',
        difficulty: 'medium',
        multiRound: true,
        enemyHP: 25,
        suggestedActions: [
            { label: 'Attack', skill: 'Athletics', description: 'Strike the fish-like abomination' },
            { label: 'Ward', skill: 'Religion', description: 'Use a protective ward to weaken it' },
            { label: 'Trap', skill: 'Survival', description: 'Lure it into a salt circle' }
        ],
        consequences: {
            criticalSuccess: 'The creature shrieks and dissolves into brackish foam. The salt worked.',
            success: 'You drive the scout back into the depths. It won\'t report your presence.',
            failure: 'Its claws rake your chest. The wounds sting with cold saltwater.',
            criticalFailure: 'It calls to others. You hear answering shrieks from the deep. Run.'
        },
        rewards: { xp: 45, gold: '1d10', items: ['dark_tome'] }
    },

    // --- Heroic Fantasy T1 additions ---
    orc_warchief: {
        name: 'Orc Warchief',
        icon: '👹',
        image: '/assets/encounters/bosses/orc_warchief.webp',
        tier: 1,
        theme: 'heroic-fantasy',
        encounterTier: 'boss',
        difficulty: 'medium',
        multiRound: true,
        enemyHP: 40,
        suggestedActions: [
            { label: 'Charge', skill: 'Athletics', description: 'Meet the warchief head-on' },
            { label: 'Shield Wall', skill: 'Athletics', description: 'Hold the line and wait for an opening' },
            { label: 'War Cry', skill: 'Intimidation', description: 'Shake the orc\'s resolve with a battle shout' }
        ],
        consequences: {
            criticalSuccess: 'Your charge shatters the warchief\'s guard. The orcs howl in dismay as their leader falls.',
            success: 'A brutal exchange of blows ends with the warchief on the ground, defeated.',
            failure: 'The warchief\'s greataxe bites deep into your shield. Your arm aches.',
            criticalFailure: 'The warchief rallies its warriors with a roar. You\'re forced to retreat.'
        },
        rewards: { xp: 75, gold: '3d10', items: ['rusty_dagger'] }
    },

    troll_bridge_guard: {
        name: 'Bridge Troll',
        icon: '🧌',
        image: '/assets/encounters/bosses/troll_bridge_guard.webp',
        tier: 1,
        theme: 'heroic-fantasy',
        encounterTier: 'boss',
        difficulty: 'medium',
        multiRound: true,
        enemyHP: 35,
        suggestedActions: [
            { label: 'Fight', skill: 'Athletics', description: 'Attack the troll directly' },
            { label: 'Use Fire', skill: 'Survival', description: 'Trolls fear flame — use it' },
            { label: 'Outsmart', skill: 'Deception', description: 'Trick the dim-witted creature' }
        ],
        consequences: {
            criticalSuccess: 'The torch sends the troll shrieking into the river. The bridge is yours.',
            success: 'The troll staggers back, scorched and beaten. It lumbers away into the dark.',
            failure: 'The troll swats you aside like a rag doll. You hit the bridge railing hard.',
            criticalFailure: 'The troll regenerates its wounds before your eyes. You need fire, and fast.'
        },
        rewards: { xp: 60, gold: '2d10', items: ['healing_potion'] }
    },

    // --- Grimdark Survival T1 additions ---
    carrion_hag: {
        name: 'Carrion Hag',
        icon: '🧙',
        image: '/assets/icons/items/ritual_dagger.webp',
        tier: 1,
        theme: 'grimdark-survival',
        encounterTier: 'boss',
        difficulty: 'medium',
        multiRound: true,
        enemyHP: 25,
        suggestedActions: [
            { label: 'Strike', skill: 'Athletics', description: 'Cut through her dark magic with steel' },
            { label: 'Resist Curse', skill: 'Religion', description: 'Ward against her hexes' },
            { label: 'Destroy Totem', skill: 'Investigation', description: 'Find and smash her power source' }
        ],
        consequences: {
            criticalSuccess: 'You shatter the bone totem. The hag screams as her power drains away.',
            success: 'The hag collapses in a heap of rags and bones, her curses broken.',
            failure: 'Her curse grips your muscles. You move as if wading through tar.',
            criticalFailure: 'The hag vanishes into the mist, cackling. Your skin crawls with hexmarks.'
        },
        rewards: { xp: 55, gold: '1d10', items: ['antidote'] }
    },

    feral_ghoul: {
        name: 'Feral Ghoul',
        icon: '🧟',
        image: '/assets/icons/items/ritual_dagger.webp',
        tier: 1,
        theme: 'grimdark-survival',
        encounterTier: 'boss',
        difficulty: 'medium',
        multiRound: true,
        enemyHP: 30,
        suggestedActions: [
            { label: 'Strike', skill: 'Athletics', description: 'Attack the undead creature' },
            { label: 'Burn Remains', skill: 'Survival', description: 'Use fire to stop its regeneration' },
            { label: 'Bait and Trap', skill: 'Stealth', description: 'Lure it into a prepared snare' }
        ],
        consequences: {
            criticalSuccess: 'The ghoul burns to ash in seconds. The stench is terrible but the threat is gone.',
            success: 'After a grim struggle, the ghoul stops twitching. It won\'t rise again.',
            failure: 'Its paralyzing claws graze your neck. Your muscles seize momentarily.',
            criticalFailure: 'The ghoul\'s bite tears flesh. You feel a creeping numbness spreading from the wound.'
        },
        rewards: { xp: 50, gold: '1d6', items: ['healing_potion'] }
    },

    // --- Arcane Renaissance T1 addition ---
    mad_alchemist: {
        name: 'Mad Alchemist',
        icon: '⚗️',
        image: '/assets/icons/items/ritual_dagger.webp',
        tier: 1,
        theme: 'arcane-renaissance',
        encounterTier: 'boss',
        difficulty: 'medium',
        multiRound: true,
        enemyHP: 25,
        suggestedActions: [
            { label: 'Rush', skill: 'Athletics', description: 'Close distance before they throw another vial' },
            { label: 'Deflect', skill: 'Acrobatics', description: 'Dodge the volatile concoctions' },
            { label: 'Reason', skill: 'Persuasion', description: 'Talk them down from their madness' }
        ],
        consequences: {
            criticalSuccess: 'You knock the vials from their hands. The alchemist surrenders, wild-eyed and shaking.',
            success: 'A well-placed strike ends the fight. Glass shatters and chemicals hiss on the floor.',
            failure: 'An acid flask catches your shoulder. Your armor smokes and pits.',
            criticalFailure: 'The alchemist drinks a mutation serum. Their body warps grotesquely — this just got harder.'
        },
        rewards: { xp: 50, gold: '2d10', items: ['antidote'] }
    },

    // --- Eldritch Horror T1 additions ---
    shadow_stalker: {
        name: 'Shadow Stalker',
        icon: '👤',
        image: '/assets/icons/items/ritual_dagger.webp',
        tier: 1,
        theme: 'eldritch-horror',
        encounterTier: 'boss',
        difficulty: 'medium',
        multiRound: true,
        enemyHP: 20,
        suggestedActions: [
            { label: 'Strike', skill: 'Athletics', description: 'Slash at the shifting shadow' },
            { label: 'Light', skill: 'Arcana', description: 'Flood the area with magical light' },
            { label: 'Stand Ground', skill: 'Insight', description: 'Focus your mind and deny it fear' }
        ],
        consequences: {
            criticalSuccess: 'Light blazes through the shadow. It shrieks and dissolves into nothing.',
            success: 'The shadow recoils from the light, retreating into the cracks between worlds.',
            failure: 'Cold fingers pass through your chest. Your heartbeat stutters.',
            criticalFailure: 'The shadow merges with yours. For a terrifying moment, you can\'t tell which is real.'
        },
        rewards: { xp: 40, gold: '1d6', items: ['enchanted_trinket'] }
    },

    worm_that_walks: {
        name: 'The Worm That Walks',
        icon: '🪱',
        image: '/assets/icons/items/ritual_dagger.webp',
        tier: 1,
        theme: 'eldritch-horror',
        encounterTier: 'boss',
        difficulty: 'medium',
        multiRound: true,
        enemyHP: 35,
        suggestedActions: [
            { label: 'Strike', skill: 'Athletics', description: 'Hack at the writhing humanoid form' },
            { label: 'Burn', skill: 'Survival', description: 'Set fire to the swarm' },
            { label: 'Scatter', skill: 'Arcana', description: 'Use a ward to disperse the colony' }
        ],
        consequences: {
            criticalSuccess: 'Fire consumes the swarm. The worms shriek as one and crumble to ash.',
            success: 'The humanoid form collapses. Worms scatter in all directions, defeated.',
            failure: 'Worms crawl under your armor. The sensation is indescribable.',
            criticalFailure: 'The swarm engulfs you. You tear free, but some of them are still under your skin.'
        },
        rewards: { xp: 60, gold: '1d10', items: ['dark_tome'] }
    },

    // ============================================================
    // TIER 2 — Regional threats
    // ============================================================
    shadow_overlord: {
        name: 'Shadow Overlord',
        icon: '👑',
        image: '/assets/icons/items/ritual_dagger.webp',
        tier: 2,
        theme: 'heroic-fantasy',
        encounterTier: 'boss',
        difficulty: 'deadly',
        multiRound: true,
        enemyHP: 250,
        suggestedActions: [
            { label: 'Fight', skill: 'Athletics', description: 'Engage the Overlord in direct combat' },
            { label: 'Exploit Weakness', skill: 'Investigation', description: 'Use gathered intelligence to find a weakness' },
            { label: 'Rally Allies', skill: 'Persuasion', description: 'Command allies to flank' }
        ],
        consequences: {
            criticalSuccess: 'The Overlord falls with a thunderous crash. Victory is absolute.',
            success: 'After a grueling battle, the Overlord is vanquished.',
            failure: 'The Overlord strikes back with devastating force, wounding your party badly.',
            criticalFailure: 'The Overlord nearly destroys you. You must retreat and regroup.'
        },
        rewards: { xp: 500, gold: '5d20', items: ['legendary_artifact'] }
    },

    rot_heart: {
        name: 'The Rot-Heart',
        icon: '🫀',
        image: '/assets/icons/items/ritual_dagger.webp',
        tier: 2,
        theme: 'grimdark-survival',
        encounterTier: 'boss',
        difficulty: 'hard',
        multiRound: true,
        enemyHP: 150,
        suggestedActions: [
            { label: 'Strike', skill: 'Athletics', description: 'Attack the pulsing core directly' },
            { label: 'Apply Antidote', skill: 'Medicine', description: 'Use a serum to weaken it' },
            { label: 'Burn It', skill: 'Survival', description: 'Set fire to the rot tendrils' }
        ],
        consequences: {
            criticalSuccess: 'The Rot-Heart shrivels and dies, its tendrils crumbling to ash.',
            success: 'With a final strike, the heart bursts. The rot recedes slowly.',
            failure: 'The heart lashes out with putrid tendrils, infecting your wounds.',
            criticalFailure: 'Rot spores engulf you. You barely escape, badly poisoned.'
        },
        rewards: { xp: 350, gold: '3d20', items: ['mountain_crystal'] }
    },

    old_god_herald: {
        name: 'Herald of the Old Gods',
        icon: '⚙️',
        image: '/assets/icons/items/ritual_dagger.webp',
        tier: 2,
        theme: 'arcane-renaissance',
        encounterTier: 'boss',
        difficulty: 'deadly',
        multiRound: true,
        enemyHP: 200,
        suggestedActions: [
            { label: 'Attack', skill: 'Athletics', description: 'Strike at the warped construct' },
            { label: 'Disrupt Magic', skill: 'Arcana', description: 'Counter its eldritch machinery' },
            { label: 'Overload Core', skill: 'Investigation', description: 'Force its power source to critical' }
        ],
        consequences: {
            criticalSuccess: 'The Herald\'s core detonates. Ancient gears rain down as silence returns.',
            success: 'The construct shudders and collapses, its alien intelligence fading.',
            failure: 'Reality warps around you as the Herald channels forbidden power.',
            criticalFailure: 'The Herald opens a rift. Something vast peers through before you flee.'
        },
        rewards: { xp: 400, gold: '4d20', items: ['ancient_artifact'] }
    },

    great_dreamer: {
        name: 'The Great Dreamer',
        icon: '🐙',
        image: '/assets/icons/items/ritual_dagger.webp',
        tier: 2,
        theme: 'eldritch-horror',
        encounterTier: 'boss',
        difficulty: 'deadly',
        multiRound: true,
        enemyHP: 300,
        suggestedActions: [
            { label: 'Strike', skill: 'Athletics', description: 'Attack the physical form' },
            { label: 'Seal the Rift', skill: 'Arcana', description: 'Close the portal sustaining it' },
            { label: 'Break the Dream', skill: 'Insight', description: 'Shatter its psychic hold' }
        ],
        consequences: {
            criticalSuccess: 'The Dreamer\'s form unravels as reality reasserts itself. The nightmares end.',
            success: 'With immense effort, the entity is banished back beyond the veil.',
            failure: 'Psychic tendrils invade your mind. Your vision swims with impossible geometries.',
            criticalFailure: 'The Dreamer pulls you into its nightmare. You barely claw your way back to reality.'
        },
        rewards: { xp: 500, gold: '5d20', items: ['forbidden_knowledge'] }
    },

    warlord: {
        name: 'The Iron Warlord',
        icon: '⚔️',
        image: '/assets/icons/items/ritual_dagger.webp',
        tier: 2,
        theme: 'heroic-fantasy',
        encounterTier: 'boss',
        difficulty: 'hard',
        multiRound: true,
        enemyHP: 180,
        suggestedActions: [
            { label: 'Duel', skill: 'Athletics', description: 'Face the warlord in honorable combat' },
            { label: 'Sabotage', skill: 'Stealth', description: 'Undermine their defenses first' },
            { label: 'Challenge Authority', skill: 'Intimidation', description: 'Turn their own soldiers against them' }
        ],
        consequences: {
            criticalSuccess: 'Your blade shatters the warlord\'s helm. Their army breaks and scatters.',
            success: 'The warlord falls to one knee, defeated. The siege is broken.',
            failure: 'The warlord is a master tactician. You take a punishing blow.',
            criticalFailure: 'Surrounded by elite guards, you\'re forced into a fighting retreat.'
        },
        rewards: { xp: 350, gold: '4d20', items: ['magic_weapon'] }
    },

    lich: {
        name: 'The Bone Tyrant',
        icon: '💀',
        image: '/assets/icons/items/ritual_dagger.webp',
        tier: 2,
        theme: 'grimdark-survival',
        encounterTier: 'boss',
        difficulty: 'deadly',
        multiRound: true,
        enemyHP: 200,
        suggestedActions: [
            { label: 'Strike', skill: 'Athletics', description: 'Shatter its undead form' },
            { label: 'Destroy Phylactery', skill: 'Investigation', description: 'Find and destroy its soul vessel' },
            { label: 'Holy Ward', skill: 'Religion', description: 'Channel divine power against it' }
        ],
        consequences: {
            criticalSuccess: 'You shatter the phylactery. The lich screams as its essence dissolves.',
            success: 'The lich crumbles to dust, its dark magic finally spent.',
            failure: 'Necrotic energy washes over you, draining your strength.',
            criticalFailure: 'The lich raises fallen warriors to fight for it. You\'re overwhelmed.'
        },
        rewards: { xp: 450, gold: '5d20', items: ['spell_scroll'] }
    },

    // --- Heroic Fantasy T2 additions ---
    dragon_wyrm: {
        name: 'The Red Wyrm',
        icon: '🐉',
        image: '/assets/icons/items/ritual_dagger.webp',
        tier: 2,
        theme: 'heroic-fantasy',
        encounterTier: 'boss',
        difficulty: 'deadly',
        multiRound: true,
        enemyHP: 200,
        suggestedActions: [
            { label: 'Charge', skill: 'Athletics', description: 'Rush the wyrm before it takes flight' },
            { label: 'Aim for the Underbelly', skill: 'Investigation', description: 'Target its vulnerable scales' },
            { label: 'Shield Allies', skill: 'Athletics', description: 'Protect your companions from its breath' }
        ],
        consequences: {
            criticalSuccess: 'Your blade pierces the underbelly. The wyrm crashes down in a torrent of flame and blood.',
            success: 'After a harrowing battle, the wyrm retreats to its lair, mortally wounded.',
            failure: 'Dragonfire scorches the ground around you. Your cloak catches flame.',
            criticalFailure: 'The wyrm takes flight and strafes your position. The hillside burns.'
        },
        rewards: { xp: 450, gold: '5d20', items: ['magic_weapon'] }
    },

    fallen_paladin: {
        name: 'The Fallen Paladin',
        icon: '🛡️',
        image: '/assets/icons/items/ritual_dagger.webp',
        tier: 2,
        theme: 'heroic-fantasy',
        encounterTier: 'boss',
        difficulty: 'hard',
        multiRound: true,
        enemyHP: 160,
        suggestedActions: [
            { label: 'Duel', skill: 'Athletics', description: 'Match blade against corrupted blade' },
            { label: 'Break the Curse', skill: 'Religion', description: 'Appeal to the paladin\'s buried honor' },
            { label: 'Disarm', skill: 'Acrobatics', description: 'Separate the knight from the cursed weapon' }
        ],
        consequences: {
            criticalSuccess: 'Your words reach the paladin\'s soul. They drop their weapon and weep.',
            success: 'The cursed blade shatters. The paladin collapses, freed from dark influence.',
            failure: 'The paladin fights with terrible skill. Your defense barely holds.',
            criticalFailure: 'Dark energy surges through their blade. The corruption tries to spread to you.'
        },
        rewards: { xp: 350, gold: '4d20', items: ['spell_scroll'] }
    },

    // --- Grimdark Survival T2 additions ---
    plague_lord: {
        name: 'The Plague Lord',
        icon: '☠️',
        image: '/assets/icons/items/ritual_dagger.webp',
        tier: 2,
        theme: 'grimdark-survival',
        encounterTier: 'boss',
        difficulty: 'deadly',
        multiRound: true,
        enemyHP: 180,
        suggestedActions: [
            { label: 'Strike', skill: 'Athletics', description: 'Attack through the cloud of flies' },
            { label: 'Purify', skill: 'Medicine', description: 'Use a potent antidote to weaken its aura' },
            { label: 'Incinerate', skill: 'Survival', description: 'Burn away the pestilence with fire' }
        ],
        consequences: {
            criticalSuccess: 'The fire catches. The Plague Lord\'s body burns away, and the flies scatter.',
            success: 'The Plague Lord falls. The air clears slowly, but the sickness fades.',
            failure: 'Plague-breath washes over you. Fever grips your body instantly.',
            criticalFailure: 'The Plague Lord\'s touch rots your shield to dust. You stagger back, retching.'
        },
        rewards: { xp: 400, gold: '4d20', items: ['antidote'] }
    },

    blood_wendigo: {
        name: 'The Blood Wendigo',
        icon: '🦌',
        image: '/assets/icons/items/ritual_dagger.webp',
        tier: 2,
        theme: 'grimdark-survival',
        encounterTier: 'boss',
        difficulty: 'hard',
        multiRound: true,
        enemyHP: 170,
        suggestedActions: [
            { label: 'Fight', skill: 'Athletics', description: 'Stand your ground against the beast' },
            { label: 'Use Silver', skill: 'Arcana', description: 'Apply a silver weapon or talisman' },
            { label: 'Set a Trap', skill: 'Survival', description: 'Bait the wendigo into a kill zone' }
        ],
        consequences: {
            criticalSuccess: 'Silver sears its flesh. The wendigo screams — a sound almost human — and dies.',
            success: 'The creature falls after a savage fight. Its antlers crack as it hits the ground.',
            failure: 'It moves impossibly fast. Antlers gore your side before you can react.',
            criticalFailure: 'The wendigo\'s hunger is contagious. You feel a gnawing emptiness in your gut.'
        },
        rewards: { xp: 350, gold: '3d20', items: ['mountain_crystal'] }
    },

    // --- Arcane Renaissance T2 additions ---
    arcane_colossus: {
        name: 'The Arcane Colossus',
        icon: '🏗️',
        image: '/assets/icons/items/ritual_dagger.webp',
        tier: 2,
        theme: 'arcane-renaissance',
        encounterTier: 'boss',
        difficulty: 'hard',
        multiRound: true,
        enemyHP: 180,
        suggestedActions: [
            { label: 'Attack', skill: 'Athletics', description: 'Strike at its massive legs' },
            { label: 'Sever Power Lines', skill: 'Arcana', description: 'Cut the ley-line conduits feeding it' },
            { label: 'Target the Pilot', skill: 'Perception', description: 'Find the mage controlling it' }
        ],
        consequences: {
            criticalSuccess: 'You sever the main conduit. The colossus topples like a felled tree, scattering debris.',
            success: 'The colossus loses power section by section, finally crashing to the ground.',
            failure: 'A massive brass fist slams the earth. The shockwave throws you off your feet.',
            criticalFailure: 'The colossus charges its core weapon. You dive for cover as energy scorches the air.'
        },
        rewards: { xp: 400, gold: '4d20', items: ['ancient_artifact'] }
    },

    void_leviathan: {
        name: 'The Void Leviathan',
        icon: '🌀',
        image: '/assets/icons/items/ritual_dagger.webp',
        tier: 2,
        theme: 'eldritch-horror',
        encounterTier: 'boss',
        difficulty: 'deadly',
        multiRound: true,
        enemyHP: 250,
        suggestedActions: [
            { label: 'Strike', skill: 'Athletics', description: 'Attack its manifested tentacles' },
            { label: 'Banish', skill: 'Arcana', description: 'Chant the words of banishment' },
            { label: 'Sever Anchor', skill: 'Investigation', description: 'Destroy the artifact anchoring it to reality' }
        ],
        consequences: {
            criticalSuccess: 'The anchor shatters. The leviathan howls as it\'s sucked back into the void.',
            success: 'Tentacle by tentacle, the creature retreats through the rift. Silence returns.',
            failure: 'A tentacle wraps around you. The void whispers terrible truths into your mind.',
            criticalFailure: 'The leviathan\'s eye opens fully. Everyone who sees it screams. You barely keep your sanity.'
        },
        rewards: { xp: 500, gold: '5d20', items: ['forbidden_knowledge'] }
    },

    leyline_dragon: {
        name: 'The Leyline Dragon',
        icon: '🐲',
        image: '/assets/icons/items/ritual_dagger.webp',
        tier: 2,
        theme: 'arcane-renaissance',
        encounterTier: 'boss',
        difficulty: 'deadly',
        multiRound: true,
        enemyHP: 220,
        suggestedActions: [
            { label: 'Attack', skill: 'Athletics', description: 'Assault the crystalline dragon' },
            { label: 'Drain Power', skill: 'Arcana', description: 'Siphon energy from its leyline bond' },
            { label: 'Shatter Crystal', skill: 'Investigation', description: 'Target the arcane crystal in its chest' }
        ],
        consequences: {
            criticalSuccess: 'The crystal shatters. The dragon\'s form flickers and dissolves into pure mana.',
            success: 'Drained of power, the dragon crashes to earth and its crystalline scales go dark.',
            failure: 'A beam of concentrated mana scorches the ground at your feet.',
            criticalFailure: 'The dragon draws power from the leyline. It grows brighter. More dangerous.'
        },
        rewards: { xp: 450, gold: '5d20', items: ['ancient_artifact'] }
    },

    psionic_devourer: {
        name: 'The Psionic Devourer',
        icon: '🧠',
        image: '/assets/icons/items/ritual_dagger.webp',
        tier: 2,
        theme: 'eldritch-horror',
        encounterTier: 'boss',
        difficulty: 'hard',
        multiRound: true,
        enemyHP: 160,
        suggestedActions: [
            { label: 'Attack', skill: 'Athletics', description: 'Strike before it seizes your mind' },
            { label: 'Mental Fortress', skill: 'Insight', description: 'Steel your will against its psychic assault' },
            { label: 'Disrupt Focus', skill: 'Stealth', description: 'Attack from a blind spot to break concentration' }
        ],
        consequences: {
            criticalSuccess: 'You strike true while it\'s distracted. The creature\'s psychic grip shatters.',
            success: 'The devourer retreats, its mental defenses crumbling. It slithers into the dark.',
            failure: 'Psychic pressure crushes in on your skull. Your nose bleeds. Thoughts scatter.',
            criticalFailure: 'It seizes control of your arm. For a heartbeat, you turn your weapon on an ally.'
        },
        rewards: { xp: 400, gold: '4d20', items: ['spell_scroll'] }
    },
};

// Helper: get enemies filtered by tier
export const getEnemiesByTier = (tier) =>
    Object.entries(QUEST_ENEMIES)
        .filter(([, e]) => e.tier === tier)
        .map(([id, e]) => ({ id, ...e }));

// Helper: get enemies filtered by theme
export const getEnemiesByTheme = (theme) =>
    Object.entries(QUEST_ENEMIES)
        .filter(([, e]) => e.theme === theme)
        .map(([id, e]) => ({ id, ...e }));

// Helper: get enemies filtered by both tier and theme
export const getEnemiesByTierAndTheme = (tier, theme) =>
    Object.entries(QUEST_ENEMIES)
        .filter(([, e]) => e.tier === tier && e.theme === theme)
        .map(([id, e]) => ({ id, ...e }));

// Helper: get all enemies as array with IDs
export const getAllEnemies = () =>
    Object.entries(QUEST_ENEMIES).map(([id, e]) => ({ id, ...e }));
