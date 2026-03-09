// Milestone type legend:
//   item     — player acquires a specific item (deterministic check)
//   combat   — player defeats a specific enemy (deterministic check)
//   location — player visits a specific tile/POI (deterministic check)
//   narrative — player resolves an NPC conversation (guided, future system)
//
// Tier legend:
//   Tier 1 (Lv 1-2) — local threats, boss HP 20-40, rewards 25-75 XP
//   Tier 2 (Lv 3-4) — regional threats, boss HP 100-200, rewards 100-200 XP
//   Tier 3 (Lv 5+)  — epic threats, boss HP 250-400, rewards 300-500 XP
//
// All item IDs in rewards reference entries in ITEM_CATALOG (inventorySystem.js).
// Existing item IDs (treasure_map, dark_tome, quest_key, etc.) are real.
// See docs/CAMPAIGN_MILESTONE_SYSTEM.md for the full design.

export const storyTemplates = [
    // ============================================================
    // HEROIC FANTASY
    // ============================================================
    {
        id: 'heroic-fantasy-t1',
        theme: 'heroic-fantasy',
        tier: 1,
        levelRange: [1, 2],
        name: 'Heroic Fantasy',
        subtitle: 'The Goblin Threat',
        icon: '⚔️',
        description: 'Goblin raiders are pillaging the farmlands. Rally the militia and end the threat before it grows.',
        customNames: { towns: ['Willowdale', 'Briarwood', 'Thornfield', 'Millhaven'], mountains: ['Greenridge Hills'] },
        settings: {
            shortDescription: 'Goblin raiders have been attacking farms around Willowdale. The townsfolk are desperate for someone brave enough to track the goblins back to their hideout and put an end to the raids.',
            campaignGoal: 'Drive the goblin raiders from the farmlands and defeat their chieftain.',
            milestones: [
                {
                    id: 1,
                    text: 'Find the goblin scout\'s map in the Willowdale tavern',
                    location: 'Willowdale',
                    type: 'item',
                    requires: [],
                    trigger: { item: 'map_fragment', action: 'acquire' },
                    spawn: { type: 'item', id: 'map_fragment', name: 'Goblin Scout\'s Map', location: 'Willowdale' },
                    building: { type: 'tavern', name: 'The Crooked Pint', location: 'Willowdale' },
                    rewards: { xp: 25, gold: '1d6', items: [] },
                    minLevel: null
                },
                {
                    id: 2,
                    text: 'Warn the militia captain at Briarwood',
                    location: 'Briarwood',
                    type: 'narrative',
                    requires: [],
                    trigger: null,
                    spawn: { type: 'npc', id: 'militia_captain', name: 'Captain Marta', location: 'Briarwood', role: 'Guard', personality: 'gruff, practical, protective of her people' },
                    building: { type: 'barracks', name: 'Briarwood Militia Hall', location: 'Briarwood' },
                    rewards: { xp: 25, gold: '1d6', items: ['rations'] },
                    minLevel: null
                },
                {
                    id: 3,
                    text: 'Track the goblins to their hideout in the Greenridge Hills',
                    location: 'Greenridge Hills',
                    type: 'location',
                    requires: [1, 2],
                    trigger: { location: 'goblin_hideout', action: 'visit' },
                    spawn: { type: 'poi', id: 'goblin_hideout', name: 'Goblin Hideout', location: 'Greenridge Hills' },
                    building: null,
                    rewards: { xp: 50, gold: '1d10', items: [] },
                    minLevel: null
                },
                {
                    id: 4,
                    text: 'Defeat the Goblin Chieftain',
                    location: 'Greenridge Hills',
                    type: 'combat',
                    requires: [3],
                    trigger: { enemy: 'goblin_chieftain', action: 'defeat' },
                    spawn: { type: 'enemy', id: 'goblin_chieftain', name: 'Goblin Chieftain', location: 'Greenridge Hills' },
                    building: null,
                    encounter: {
                        name: 'Goblin Chieftain',
                        icon: '👺',
                        image: '/assets/encounters/bosses/goblin_chieftain.webp',
                        encounterTier: 'boss',
                        difficulty: 'medium',
                        multiRound: true,
                        enemyHP: 30,
                        suggestedActions: [
                            { label: 'Fight', skill: 'Athletics', description: 'Charge the chieftain head-on' },
                            { label: 'Outflank', skill: 'Stealth', description: 'Use the map to approach from a blind spot' },
                            { label: 'Rally Militia', skill: 'Persuasion', description: 'Call the militia to back you up' }
                        ],
                        consequences: {
                            criticalSuccess: 'The chieftain falls with a single decisive blow. The goblins scatter in panic.',
                            success: 'After a scrappy fight, the chieftain is defeated. The remaining goblins flee.',
                            failure: 'The chieftain lands a nasty hit before you drive it back.',
                            criticalFailure: 'The chieftain\'s bodyguards swarm you. You barely escape with your life.'
                        },
                        rewards: { xp: 75, gold: '2d10', items: ['rusty_dagger'] }
                    },
                    rewards: { xp: 50, gold: '1d10', items: [] },
                    minLevel: 2
                }
            ],
            grimnessLevel: 'Noble',
            darknessLevel: 'Bright',
            magicLevel: 'High Magic',
            technologyLevel: 'Medieval',
            responseVerbosity: 'Descriptive'
        }
    },
    {
        id: 'heroic-fantasy-t2',
        theme: 'heroic-fantasy',
        tier: 2,
        levelRange: [3, 5],
        name: 'Heroic Fantasy',
        subtitle: 'Crown of Sunfire',
        icon: '⚔️',
        description: 'A classic tale of heroes, magic, and clear conflicts between good and evil.',
        customNames: { towns: ['Eldoria', 'Sunfire', 'Oakhaven', 'Silverton'], mountains: ['Cinder Mountains'] },
        settings: {
            shortDescription: 'In the kingdom of Eldoria, light-hearted adventurers set out to recover the lost Crown of Sunfire and unite the shattered provinces against a rising darkness.',
            campaignGoal: 'Recover the Crown of Sunfire and defeat the Shadow Overlord to restore peace to Eldoria.',
            milestones: [
                {
                    id: 1,
                    text: 'Find the hidden map in the archives of Oakhaven',
                    location: 'Oakhaven',
                    type: 'item',
                    requires: [],
                    trigger: { item: 'treasure_map', action: 'acquire' },
                    spawn: { type: 'item', id: 'treasure_map', name: 'Hidden Map', location: 'Oakhaven' },
                    building: { type: 'archives', name: 'The Great Archives', location: 'Oakhaven' },
                    rewards: { xp: 100, gold: '2d10', items: [] },
                    minLevel: null
                },
                {
                    id: 2,
                    text: 'Convince the Silver Guard to join the resistance',
                    location: 'Silverton',
                    type: 'narrative',
                    requires: [],
                    trigger: null,
                    spawn: { type: 'npc', id: 'silver_guard_captain', name: 'Captain Aldric', location: 'Silverton', role: 'Guard', personality: 'proud, honorable, skeptical of outsiders' },
                    building: { type: 'barracks', name: 'Silver Guard Barracks', location: 'Silverton' },
                    rewards: { xp: 150, gold: '1d20', items: ['quest_key'] },
                    minLevel: null
                },
                {
                    id: 3,
                    text: 'Breach the Shadow Fortress in the Cinder Mountains',
                    location: 'Cinder Mountains',
                    type: 'location',
                    requires: [1, 2],
                    trigger: { location: 'shadow_fortress', action: 'visit' },
                    spawn: { type: 'poi', id: 'shadow_fortress', name: 'Shadow Fortress', location: 'Cinder Mountains' },
                    building: null,
                    rewards: { xp: 200, gold: '3d20', items: [] },
                    minLevel: 3
                },
                {
                    id: 4,
                    text: 'Defeat the Shadow Overlord',
                    location: 'Cinder Mountains',
                    type: 'combat',
                    requires: [3],
                    trigger: { enemy: 'shadow_overlord', action: 'defeat' },
                    spawn: { type: 'enemy', id: 'shadow_overlord', name: 'Shadow Overlord', location: 'Cinder Mountains' },
                    building: null,
                    encounter: {
                        name: 'Shadow Overlord',
                        icon: '👑',
                        image: '/assets/icons/items/ritual_dagger.webp',
                        encounterTier: 'boss',
                        difficulty: 'deadly',
                        multiRound: true,
                        enemyHP: 250,
                        suggestedActions: [
                            { label: 'Fight', skill: 'Athletics', description: 'Engage the Overlord in direct combat' },
                            { label: 'Use the Map', skill: 'Investigation', description: 'Exploit weaknesses revealed by the hidden map' },
                            { label: 'Rally the Guard', skill: 'Persuasion', description: 'Command the Silver Guard to flank' }
                        ],
                        consequences: {
                            criticalSuccess: 'The Overlord falls with a thunderous crash, the Crown of Sunfire clattering free.',
                            success: 'After a grueling battle, the Overlord is vanquished. The Crown gleams in the darkness.',
                            failure: 'The Overlord strikes back with devastating force, wounding your party badly.',
                            criticalFailure: 'The Overlord nearly destroys you. You must retreat and regroup.'
                        },
                        rewards: { xp: 500, gold: '5d20', items: ['crown_of_sunfire'] }
                    },
                    rewards: { xp: 300, gold: '3d20', items: [] },
                    minLevel: 5
                }
            ],
            grimnessLevel: 'Noble',
            darknessLevel: 'Bright',
            magicLevel: 'High Magic',
            technologyLevel: 'Medieval',
            responseVerbosity: 'Descriptive'
        }
    },

    // ============================================================
    // GRIMDARK SURVIVAL
    // ============================================================
    {
        id: 'grimdark-survival-t1',
        theme: 'grimdark-survival',
        tier: 1,
        levelRange: [1, 2],
        name: 'Grimdark Survival',
        subtitle: 'The Blighted Village',
        icon: '💀',
        description: 'A creeping blight is killing the crops and sickening the livestock. Find the source before Ashford starves.',
        customNames: { towns: ['Ashford', 'Mudhollow', 'Grimstead', 'Duskwell'], mountains: ['Grey Moors'] },
        settings: {
            shortDescription: 'The village of Ashford is dying. Crops blacken overnight, livestock collapse in the fields, and a foul smell rises from the old well. Someone must find the source of the blight before winter comes.',
            campaignGoal: 'Find and destroy the source of the blight threatening Ashford.',
            milestones: [
                {
                    id: 1,
                    text: 'Gather healing herbs from the Grey Moors for the village healer',
                    location: 'Grey Moors',
                    type: 'item',
                    requires: [],
                    trigger: { item: 'healing_herbs', action: 'acquire' },
                    spawn: { type: 'item', id: 'healing_herbs', name: 'Moorland Herbs', location: 'Grey Moors' },
                    building: null,
                    rewards: { xp: 25, gold: '1d6', items: ['herbal_remedy'] },
                    minLevel: null
                },
                {
                    id: 2,
                    text: 'Search the abandoned well at Mudhollow for clues',
                    location: 'Mudhollow',
                    type: 'location',
                    requires: [],
                    trigger: { location: 'abandoned_well', action: 'visit' },
                    spawn: { type: 'poi', id: 'abandoned_well', name: 'The Poisoned Well', location: 'Mudhollow' },
                    building: null,
                    rewards: { xp: 25, gold: '1d6', items: ['quest_clue'] },
                    minLevel: null
                },
                {
                    id: 3,
                    text: 'Track the blight to its source in the Grimstead cellar',
                    location: 'Grimstead',
                    type: 'location',
                    requires: [1, 2],
                    trigger: { location: 'grimstead_cellar', action: 'visit' },
                    spawn: { type: 'poi', id: 'grimstead_cellar', name: 'Grimstead Cellar', location: 'Grimstead' },
                    building: null,
                    rewards: { xp: 50, gold: '1d10', items: [] },
                    minLevel: null
                },
                {
                    id: 4,
                    text: 'Slay the Blightspawn lurking beneath Grimstead',
                    location: 'Grimstead',
                    type: 'combat',
                    requires: [3],
                    trigger: { enemy: 'blightspawn', action: 'defeat' },
                    spawn: { type: 'enemy', id: 'blightspawn', name: 'Blightspawn', location: 'Grimstead' },
                    building: null,
                    encounter: {
                        name: 'Blightspawn',
                        icon: '🦠',
                        image: '/assets/icons/items/ritual_dagger.webp',
                        encounterTier: 'boss',
                        difficulty: 'medium',
                        multiRound: true,
                        enemyHP: 25,
                        suggestedActions: [
                            { label: 'Strike', skill: 'Athletics', description: 'Hack at the writhing mass' },
                            { label: 'Use Herbs', skill: 'Medicine', description: 'Apply the healer\'s herbs to burn the blight' },
                            { label: 'Burn It', skill: 'Survival', description: 'Set a torch to the infected roots' }
                        ],
                        consequences: {
                            criticalSuccess: 'The blightspawn shrieks and dissolves. The air clears almost immediately.',
                            success: 'You destroy the creature. The blight will take time to fade, but the source is gone.',
                            failure: 'Toxic spores burst from the creature, burning your lungs.',
                            criticalFailure: 'The blightspawn splits into smaller horrors. You flee the cellar, coughing and bleeding.'
                        },
                        rewards: { xp: 50, gold: '1d10', items: ['antidote'] }
                    },
                    rewards: { xp: 50, gold: '1d10', items: [] },
                    minLevel: 2
                }
            ],
            grimnessLevel: 'Grim',
            darknessLevel: 'Dark',
            magicLevel: 'Low Magic',
            technologyLevel: 'Medieval',
            responseVerbosity: 'Concise'
        }
    },
    {
        id: 'grimdark-survival-t2',
        theme: 'grimdark-survival',
        tier: 2,
        levelRange: [3, 4],
        name: 'Grimdark Survival',
        subtitle: 'The Rot-Heart',
        icon: '💀',
        description: 'A bleak world where survival is the only victory and every choice has a price.',
        customNames: { towns: ['Rotfall', 'Ironhold', 'Shadow-Crest', 'Pale-Reach'], mountains: ['Blightspine Ridge'] },
        settings: {
            shortDescription: 'The empire has fallen to the rot. Survivors huddle in the ruins of once-great cities, fighting for scraps while monsters—both human and otherwise—prowl the shadows.',
            campaignGoal: 'Secure a safe haven from the rot and find a permanent way to cleanse the spreading plague.',
            milestones: [
                {
                    id: 1,
                    text: 'Establish a fortified camp in the ruins of Ironhold',
                    location: 'Ironhold',
                    type: 'location',
                    requires: [],
                    trigger: { location: 'ironhold_ruins', action: 'visit' },
                    spawn: { type: 'poi', id: 'ironhold_ruins', name: 'Ironhold Ruins', location: 'Ironhold' },
                    building: null,
                    rewards: { xp: 75, gold: '1d10', items: ['rations'] },
                    minLevel: null
                },
                {
                    id: 2,
                    text: 'Capture a mutated specimen for the alchemist at Pale-Reach',
                    location: 'Pale-Reach',
                    type: 'item',
                    requires: [],
                    trigger: { item: 'venom_sac', action: 'acquire' },
                    spawn: { type: 'item', id: 'venom_sac', name: 'Mutated Specimen', location: 'Pale-Reach' },
                    building: { type: 'alchemist', name: 'The Blighted Laboratory', location: 'Pale-Reach' },
                    rewards: { xp: 125, gold: '2d10', items: ['antidote'] },
                    minLevel: null
                },
                {
                    id: 3,
                    text: 'Navigate the rot tunnels beneath Rotfall',
                    location: 'Rotfall',
                    type: 'location',
                    requires: [1, 2],
                    trigger: { location: 'rot_tunnels', action: 'visit' },
                    spawn: { type: 'poi', id: 'rot_tunnels', name: 'The Rot Tunnels', location: 'Rotfall' },
                    building: null,
                    rewards: { xp: 150, gold: '2d20', items: ['cave_map'] },
                    minLevel: 3
                },
                {
                    id: 4,
                    text: 'Destroy the Rot-Heart in the depths of Rotfall',
                    location: 'Rotfall',
                    type: 'combat',
                    requires: [3],
                    trigger: { enemy: 'rot_heart', action: 'defeat' },
                    spawn: { type: 'enemy', id: 'rot_heart', name: 'The Rot-Heart', location: 'Rotfall' },
                    building: null,
                    encounter: {
                        name: 'The Rot-Heart',
                        icon: '🫀',
                        image: '/assets/icons/items/ritual_dagger.webp',
                        encounterTier: 'boss',
                        difficulty: 'hard',
                        multiRound: true,
                        enemyHP: 150,
                        suggestedActions: [
                            { label: 'Strike', skill: 'Athletics', description: 'Attack the pulsing core directly' },
                            { label: 'Apply Antidote', skill: 'Medicine', description: 'Use the alchemist\'s serum to weaken it' },
                            { label: 'Burn It', skill: 'Survival', description: 'Set fire to the rot tendrils' }
                        ],
                        consequences: {
                            criticalSuccess: 'The Rot-Heart shrivels and dies, its tendrils crumbling to ash. The air clears instantly.',
                            success: 'With a final strike, the heart bursts. The rot recedes slowly from the tunnels.',
                            failure: 'The heart lashes out with putrid tendrils, infecting your wounds.',
                            criticalFailure: 'Rot spores engulf you. You barely escape, badly poisoned and weakened.'
                        },
                        rewards: { xp: 350, gold: '3d20', items: ['purified_heart_shard'] }
                    },
                    rewards: { xp: 200, gold: '2d20', items: [] },
                    minLevel: 4
                }
            ],
            grimnessLevel: 'Grim',
            darknessLevel: 'Dark',
            magicLevel: 'Low Magic',
            technologyLevel: 'Medieval',
            responseVerbosity: 'Concise'
        }
    },

    // ============================================================
    // ARCANE RENAISSANCE
    // ============================================================
    {
        id: 'arcane-renaissance-t1',
        theme: 'arcane-renaissance',
        tier: 1,
        levelRange: [1, 2],
        name: 'Arcane Renaissance',
        subtitle: 'The Rogue Automaton',
        icon: '🔮',
        description: 'A malfunctioning automaton is terrorizing the market district. Find out what went wrong and shut it down.',
        customNames: { towns: ['Cogsworth', 'Tinker-Row', 'Brasswick', 'Gear-End'], mountains: ['Copper Ridge'] },
        settings: {
            shortDescription: 'An automaton has gone haywire in the streets of Cogsworth, smashing market stalls and attacking anyone who gets close. The artificer who built it has gone missing, and the town guard is outmatched.',
            campaignGoal: 'Find the automaton\'s control rod and shut it down before it destroys the market district.',
            milestones: [
                {
                    id: 1,
                    text: 'Find the control rod in the Tinker-Row workshop',
                    location: 'Tinker-Row',
                    type: 'item',
                    requires: [],
                    trigger: { item: 'enchanted_trinket', action: 'acquire' },
                    spawn: { type: 'item', id: 'enchanted_trinket', name: 'Automaton Control Rod', location: 'Tinker-Row' },
                    building: { type: 'workshop', name: 'Tinker-Row Workshop', location: 'Tinker-Row' },
                    rewards: { xp: 25, gold: '1d6', items: [] },
                    minLevel: null
                },
                {
                    id: 2,
                    text: 'Interview the artificer\'s apprentice at Brasswick',
                    location: 'Brasswick',
                    type: 'narrative',
                    requires: [],
                    trigger: null,
                    spawn: { type: 'npc', id: 'artificer_apprentice', name: 'Pip Gearsley', location: 'Brasswick', role: 'Merchant', personality: 'nervous, guilt-ridden, knows more than they let on' },
                    building: { type: 'workshop', name: 'Gearsley\'s Parts Shop', location: 'Brasswick' },
                    rewards: { xp: 25, gold: '1d6', items: ['journal_page'] },
                    minLevel: null
                },
                {
                    id: 3,
                    text: 'Locate the automaton\'s lair in the Gear-End sewers',
                    location: 'Gear-End',
                    type: 'location',
                    requires: [1, 2],
                    trigger: { location: 'gear_end_sewers', action: 'visit' },
                    spawn: { type: 'poi', id: 'gear_end_sewers', name: 'Gear-End Sewers', location: 'Gear-End' },
                    building: null,
                    rewards: { xp: 50, gold: '1d10', items: [] },
                    minLevel: null
                },
                {
                    id: 4,
                    text: 'Disable the Rogue Automaton',
                    location: 'Gear-End',
                    type: 'combat',
                    requires: [3],
                    trigger: { enemy: 'rogue_automaton', action: 'defeat' },
                    spawn: { type: 'enemy', id: 'rogue_automaton', name: 'Rogue Automaton', location: 'Gear-End' },
                    building: null,
                    encounter: {
                        name: 'Rogue Automaton',
                        icon: '🤖',
                        image: '/assets/icons/items/ritual_dagger.webp',
                        encounterTier: 'boss',
                        difficulty: 'medium',
                        multiRound: true,
                        enemyHP: 35,
                        suggestedActions: [
                            { label: 'Smash', skill: 'Athletics', description: 'Batter the automaton with brute force' },
                            { label: 'Use Control Rod', skill: 'Arcana', description: 'Insert the control rod to override its commands' },
                            { label: 'Find Weakness', skill: 'Investigation', description: 'Look for exposed gears or loose plating' }
                        ],
                        consequences: {
                            criticalSuccess: 'The control rod slots in perfectly. The automaton shudders and powers down with a gentle hiss.',
                            success: 'After a tense fight, you jam the rod into its core. The automaton collapses in a shower of sparks.',
                            failure: 'The automaton swats you aside with a metal arm. Gears grind ominously.',
                            criticalFailure: 'The automaton goes into overdrive. You scramble to safety as it tears through the sewer walls.'
                        },
                        rewards: { xp: 75, gold: '2d10', items: ['rare_ore'] }
                    },
                    rewards: { xp: 50, gold: '1d10', items: [] },
                    minLevel: 2
                }
            ],
            grimnessLevel: 'Neutral',
            darknessLevel: 'Grey',
            magicLevel: 'Arcane Tech',
            technologyLevel: 'Renaissance',
            responseVerbosity: 'Moderate'
        }
    },
    {
        id: 'arcane-renaissance-t2',
        theme: 'arcane-renaissance',
        tier: 2,
        levelRange: [3, 4],
        name: 'Arcane Renaissance',
        subtitle: 'Herald of the Old Gods',
        icon: '🔮',
        description: 'A world of booming industry, discovery, and the dangerous fusion of magic and machine.',
        customNames: { towns: ['Novaris', 'Aether-Gate', 'Steam-Wharf', 'Cog-Hill'], mountains: ['Ironpeak Range'] },
        settings: {
            shortDescription: 'The discovery of Aether-Steam has transformed the city of Novaris. Alchemists and engineers work side-by-side, but the old gods are not pleased with the noise of progress.',
            campaignGoal: 'Uncover the conspiracy behind the Aether-Steam accidents and prevent the awakening of the Old Gods.',
            milestones: [
                {
                    id: 1,
                    text: 'Investigate the explosion at the Cog-Hill foundry',
                    location: 'Cog-Hill',
                    type: 'location',
                    requires: [],
                    trigger: { location: 'coghill_foundry', action: 'visit' },
                    spawn: { type: 'poi', id: 'coghill_foundry', name: 'Destroyed Foundry', location: 'Cog-Hill' },
                    building: { type: 'foundry', name: 'The Cog-Hill Foundry', location: 'Cog-Hill' },
                    rewards: { xp: 100, gold: '2d10', items: ['journal_page'] },
                    minLevel: null
                },
                {
                    id: 2,
                    text: 'Retrieve the stolen blueprints from the Aether-Gate syndicate',
                    location: 'Aether-Gate',
                    type: 'item',
                    requires: [],
                    trigger: { item: 'ancient_scroll', action: 'acquire' },
                    spawn: { type: 'item', id: 'ancient_scroll', name: 'Stolen Aether Blueprints', location: 'Aether-Gate' },
                    building: { type: 'warehouse', name: 'Syndicate Warehouse', location: 'Aether-Gate' },
                    rewards: { xp: 125, gold: '2d20', items: [] },
                    minLevel: null
                },
                {
                    id: 3,
                    text: 'Consult the Oracle of Steam in the depths of Steam-Wharf',
                    location: 'Steam-Wharf',
                    type: 'narrative',
                    requires: [1, 2],
                    trigger: null,
                    spawn: { type: 'npc', id: 'oracle_of_steam', name: 'The Oracle of Steam', location: 'Steam-Wharf', role: 'Merchant', personality: 'cryptic, ancient, speaks in riddles and hissing steam' },
                    building: { type: 'temple', name: 'The Steam Sanctum', location: 'Steam-Wharf' },
                    rewards: { xp: 150, gold: '1d20', items: ['hermit_wisdom'] },
                    minLevel: 2
                },
                {
                    id: 4,
                    text: 'Banish the Herald of the Old Gods at Ironpeak Range',
                    location: 'Ironpeak Range',
                    type: 'combat',
                    requires: [3],
                    trigger: { enemy: 'old_god_herald', action: 'defeat' },
                    spawn: { type: 'enemy', id: 'old_god_herald', name: 'Herald of the Old Gods', location: 'Ironpeak Range' },
                    building: null,
                    encounter: {
                        name: 'Herald of the Old Gods',
                        icon: '⚙️',
                        image: '/assets/icons/items/ritual_dagger.webp',
                        encounterTier: 'boss',
                        difficulty: 'deadly',
                        multiRound: true,
                        enemyHP: 200,
                        suggestedActions: [
                            { label: 'Fight', skill: 'Athletics', description: 'Strike at the Herald with enchanted weapons' },
                            { label: 'Disrupt the Ritual', skill: 'Arcana', description: 'Use the blueprints to overload the Aether conduits' },
                            { label: 'Invoke the Oracle', skill: 'Persuasion', description: 'Channel the Oracle\'s knowledge to weaken the Herald' }
                        ],
                        consequences: {
                            criticalSuccess: 'The Herald screams as the Aether conduits overload, banishing it back to the void between worlds.',
                            success: 'The Herald is defeated. The mountains fall silent, and the Old Gods sleep once more.',
                            failure: 'The Herald\'s power surges. Reality cracks around you as ancient forces stir.',
                            criticalFailure: 'The Herald nearly completes the awakening. You flee as the mountain splits open.'
                        },
                        rewards: { xp: 450, gold: '4d20', items: ['enchanted_staff'] }
                    },
                    rewards: { xp: 250, gold: '3d20', items: [] },
                    minLevel: 4
                }
            ],
            grimnessLevel: 'Neutral',
            darknessLevel: 'Grey',
            magicLevel: 'Arcane Tech',
            technologyLevel: 'Renaissance',
            responseVerbosity: 'Moderate'
        }
    },

    // ============================================================
    // ELDRITCH HORROR
    // ============================================================
    {
        id: 'eldritch-horror-t1',
        theme: 'eldritch-horror',
        tier: 1,
        levelRange: [1, 2],
        name: 'Eldritch Horror',
        subtitle: 'The Blackwood Cult',
        icon: '🐙',
        description: 'Strange chanting echoes from the marshes at night. A cult is gathering, and their ritual must be stopped.',
        customNames: { towns: ['Hollowmarsh', 'Grey-Haven', 'Mistfall', 'Fogmere'], mountains: ['The Barrows'] },
        settings: {
            shortDescription: 'Livestock are vanishing near Hollowmarsh, and villagers report robed figures in the marshes at night. A small cult has taken root in the area, and their dark ritual is nearing completion.',
            campaignGoal: 'Disrupt the cult\'s gathering and defeat their leader before the ritual is complete.',
            milestones: [
                {
                    id: 1,
                    text: 'Find the cult\'s coded journal in the Hollowmarsh inn',
                    location: 'Hollowmarsh',
                    type: 'item',
                    requires: [],
                    trigger: { item: 'journal_page', action: 'acquire' },
                    spawn: { type: 'item', id: 'journal_page', name: 'Cult Journal', location: 'Hollowmarsh' },
                    building: { type: 'tavern', name: 'The Drowned Lantern', location: 'Hollowmarsh' },
                    rewards: { xp: 25, gold: '1d6', items: ['quest_clue'] },
                    minLevel: null
                },
                {
                    id: 2,
                    text: 'Investigate the desecrated shrine at Grey-Haven',
                    location: 'Grey-Haven',
                    type: 'location',
                    requires: [],
                    trigger: { location: 'desecrated_shrine', action: 'visit' },
                    spawn: { type: 'poi', id: 'desecrated_shrine', name: 'Desecrated Shrine', location: 'Grey-Haven' },
                    building: null,
                    rewards: { xp: 25, gold: '1d6', items: ['mysterious_letter'] },
                    minLevel: null
                },
                {
                    id: 3,
                    text: 'Follow the cult to their meeting place in The Barrows',
                    location: 'The Barrows',
                    type: 'location',
                    requires: [1, 2],
                    trigger: { location: 'cult_meeting_place', action: 'visit' },
                    spawn: { type: 'poi', id: 'cult_meeting_place', name: 'The Barrow Circle', location: 'The Barrows' },
                    building: null,
                    rewards: { xp: 50, gold: '1d10', items: [] },
                    minLevel: null
                },
                {
                    id: 4,
                    text: 'Defeat the Cult Leader and disrupt the ritual',
                    location: 'The Barrows',
                    type: 'combat',
                    requires: [3],
                    trigger: { enemy: 'cult_leader', action: 'defeat' },
                    spawn: { type: 'enemy', id: 'cult_leader', name: 'The Hooded Priest', location: 'The Barrows' },
                    building: null,
                    encounter: {
                        name: 'The Hooded Priest',
                        icon: '🕯️',
                        image: '/assets/icons/items/ritual_dagger.webp',
                        encounterTier: 'boss',
                        difficulty: 'medium',
                        multiRound: true,
                        enemyHP: 30,
                        suggestedActions: [
                            { label: 'Fight', skill: 'Athletics', description: 'Attack the cult leader directly' },
                            { label: 'Disrupt Ritual', skill: 'Arcana', description: 'Scatter the ritual components using clues from the journal' },
                            { label: 'Intimidate', skill: 'Intimidation', description: 'Break the cultists\' morale so the leader stands alone' }
                        ],
                        consequences: {
                            criticalSuccess: 'You shatter the ritual circle. The cult leader screams as their borrowed power evaporates.',
                            success: 'The cult leader falls. The remaining cultists flee into the night.',
                            failure: 'Dark energy lashes out from the ritual. You take a hit but keep fighting.',
                            criticalFailure: 'The ritual partially completes. Something stirs in the barrow as you barely escape.'
                        },
                        rewards: { xp: 75, gold: '2d10', items: ['ritual_dagger'] }
                    },
                    rewards: { xp: 50, gold: '1d10', items: [] },
                    minLevel: 2
                }
            ],
            grimnessLevel: 'Bleak',
            darknessLevel: 'Dark',
            magicLevel: 'Low Magic',
            technologyLevel: 'Industrial',
            responseVerbosity: 'Descriptive'
        }
    },
    {
        id: 'eldritch-horror-t2',
        theme: 'eldritch-horror',
        tier: 2,
        levelRange: [3, 5],
        name: 'Eldritch Horror',
        subtitle: 'The Great Dreamer',
        icon: '🐙',
        description: 'Mystery and dread in a world where gods are uncaring and knowledge is a burden.',
        customNames: { towns: ['Blackwood', 'Whisper-Cove', 'Mourn-Peak', 'Abyssal-Rest'], mountains: ['Mourn-Peak Heights'] },
        settings: {
            shortDescription: 'In the mist-shrouded town of Blackwood, the stars have aligned. Unspeakable entities stir in the depths, and those who seek the truth often lose their minds before they find it.',
            campaignGoal: 'Seal the Abyssal Breach and prevent the Great Dreamer from awakening.',
            milestones: [
                {
                    id: 1,
                    text: 'Decode the ritual text found in the Blackwood library',
                    location: 'Blackwood',
                    type: 'item',
                    requires: [],
                    trigger: { item: 'dark_tome', action: 'acquire' },
                    spawn: { type: 'item', id: 'dark_tome', name: 'Forbidden Ritual Text', location: 'Blackwood' },
                    building: { type: 'library', name: 'Blackwood Library', location: 'Blackwood' },
                    rewards: { xp: 100, gold: '1d10', items: ['forbidden_knowledge'] },
                    minLevel: null
                },
                {
                    id: 2,
                    text: 'Cleanse the corrupted lighthouse at Whisper-Cove',
                    location: 'Whisper-Cove',
                    type: 'location',
                    requires: [],
                    trigger: { location: 'corrupted_lighthouse', action: 'visit' },
                    spawn: { type: 'poi', id: 'corrupted_lighthouse', name: 'Corrupted Lighthouse', location: 'Whisper-Cove' },
                    building: null,
                    rewards: { xp: 125, gold: '2d10', items: ['divine_blessing'] },
                    minLevel: null
                },
                {
                    id: 3,
                    text: 'Survive a vision of the Void at the summit of Mourn-Peak',
                    location: 'Mourn-Peak',
                    type: 'location',
                    requires: [1, 2],
                    trigger: { location: 'mourn_peak_summit', action: 'visit' },
                    spawn: { type: 'poi', id: 'mourn_peak_summit', name: 'Mourn-Peak Summit', location: 'Mourn-Peak' },
                    building: null,
                    rewards: { xp: 150, gold: '1d20', items: ['ancient_knowledge'] },
                    minLevel: 3
                },
                {
                    id: 4,
                    text: 'Seal the Abyssal Breach and banish the Great Dreamer',
                    location: 'Abyssal-Rest',
                    type: 'combat',
                    requires: [3],
                    trigger: { enemy: 'great_dreamer', action: 'defeat' },
                    spawn: { type: 'enemy', id: 'great_dreamer', name: 'The Great Dreamer', location: 'Abyssal-Rest' },
                    building: null,
                    encounter: {
                        name: 'The Great Dreamer',
                        icon: '🐙',
                        image: '/assets/icons/items/ritual_dagger.webp',
                        encounterTier: 'boss',
                        difficulty: 'deadly',
                        multiRound: true,
                        enemyHP: 300,
                        suggestedActions: [
                            { label: 'Fight', skill: 'Athletics', description: 'Strike at the writhing mass of tentacles' },
                            { label: 'Read the Ritual', skill: 'Arcana', description: 'Use the decoded text to perform the sealing ritual' },
                            { label: 'Resist the Madness', skill: 'Wisdom', description: 'Steel your mind against the psychic onslaught' }
                        ],
                        consequences: {
                            criticalSuccess: 'The sealing ritual blazes with light. The Dreamer shrieks and collapses back into the void.',
                            success: 'The Breach narrows and seals. The Dreamer\'s presence fades, though echoes linger.',
                            failure: 'The Dreamer lashes out with psychic force. Your mind fractures under the weight of alien thoughts.',
                            criticalFailure: 'The Breach widens. You barely escape as reality warps around the Dreamer\'s awakening form.'
                        },
                        rewards: { xp: 500, gold: '4d20', items: ['seal_of_binding'] }
                    },
                    rewards: { xp: 300, gold: '3d20', items: [] },
                    minLevel: 5
                }
            ],
            grimnessLevel: 'Bleak',
            darknessLevel: 'Dark',
            magicLevel: 'Low Magic',
            technologyLevel: 'Industrial',
            responseVerbosity: 'Descriptive'
        }
    },

    // ============================================================
    // TIER 3 — COMING SOON
    // ============================================================
    {
        id: 'heroic-fantasy-t3',
        theme: 'heroic-fantasy',
        tier: 3,
        levelRange: [5, 7],
        name: 'Heroic Fantasy',
        subtitle: 'The Shattered Throne',
        icon: '⚔️',
        description: 'A civil war tears the kingdom apart. Only a true hero can reunite the fractured realm.',
        comingSoon: true,
    },
    {
        id: 'grimdark-survival-t3',
        theme: 'grimdark-survival',
        tier: 3,
        levelRange: [5, 7],
        name: 'Grimdark Survival',
        subtitle: 'The Last Winter',
        icon: '💀',
        description: 'The sun is dying. The world freezes. Survival means making choices no one should have to make.',
        comingSoon: true,
    },
    {
        id: 'arcane-renaissance-t3',
        theme: 'arcane-renaissance',
        tier: 3,
        levelRange: [5, 7],
        name: 'Arcane Renaissance',
        subtitle: 'The Clockwork God',
        icon: '🔮',
        description: 'An artificer has built a machine that thinks. Now it wants to reshape the world in its image.',
        comingSoon: true,
    },
    {
        id: 'eldritch-horror-t3',
        theme: 'eldritch-horror',
        tier: 3,
        levelRange: [5, 7],
        name: 'Eldritch Horror',
        subtitle: 'The Drowned City',
        icon: '🐙',
        description: 'An ancient city has risen from the sea. Those who enter hear singing. None have returned.',
        comingSoon: true,
    }
];
