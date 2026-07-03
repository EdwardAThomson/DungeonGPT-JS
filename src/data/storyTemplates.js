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
// Since #43, enemy HP is a REAL difficulty knob: players deal flat damage per
// outcome (multiRoundEncounter.ENEMY_DAMAGE_BY_OUTCOME), so a 250 HP boss takes
// ~10 successes where a 30 HP boss takes ~2, and t2+ bosses are tuned for a
// 3-hero party (Lead + Support). Boss blocks declare `dealsDamage: true` with an
// authored `damage` dice profile (per outcome tier), and may pin an exact `dc`
// (overrides the difficulty label's DC). Tune through src/game/balanceSim.js;
// the bands are enforced by src/game/progressionLint.test.js.
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
                    text: 'Meet the militia captain at Briarwood',
                    location: 'Briarwood',
                    // 'talk' = mechanical NPC-talk milestone: the engine completes it when the
                    // party talks to the authored NPC (Talk button fires npc_talked). Old saves
                    // carry the previous type:'narrative' copy of this milestone in their
                    // settings and keep completing via the AI marker — unaffected.
                    type: 'talk',
                    requires: [],
                    trigger: { npc: 'militia_captain', action: 'talk' },
                    spawn: { type: 'npc', id: 'militia_captain', name: 'Captain Ulric', location: 'Briarwood', role: 'Guard', gender: 'Male', personality: 'gruff, practical, protective of his people' },
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
                        // #43 explicit damage profile (sim-tuned, solo mid-gear Lv 2 in the 30-90% band)
                        dealsDamage: true,
                        damage: { criticalFailure: '2d6+2', failure: '1d6+1', success: '1d3' },
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
    // SAME-WORLD SEQUEL (QUEST_CHAINING_PLAN decision, 2026-07): re-authored onto
    // heroic-fantasy-t1's geography EXACTLY (Willowdale / Briarwood / Thornfield /
    // Millhaven + Greenridge Hills) so a completed Goblin Threat save can continue
    // this campaign IN the same world (in-save continuation). Venue/NPC choices
    // deliberately avoid t1's quest buildings (t1 used Willowdale's tavern and
    // Briarwood's barracks) so retro-injection into cached towns never collides.
    // Story beats and the balance-validated boss block are unchanged from the
    // original Eldoria authoring.
    {
        id: 'heroic-fantasy-t2',
        theme: 'heroic-fantasy',
        tier: 2,
        levelRange: [3, 5],
        name: 'Heroic Fantasy',
        subtitle: 'Crown of Sunfire',
        icon: '⚔️',
        description: 'The lost Crown of Sunfire resurfaces in the same lands your heroes saved from the goblins. Unite the shattered provinces and cast down the Shadow Overlord.',
        customNames: { towns: ['Willowdale', 'Briarwood', 'Thornfield', 'Millhaven'], mountains: ['Greenridge Hills'] },
        settings: {
            shortDescription: 'The lost Crown of Sunfire, the old realm\'s symbol of unity, has resurfaced in the lands around Willowdale. A Shadow Overlord gathers power in the deep Greenridge Hills, and the shattered provinces must be united before the darkness swallows them.',
            campaignGoal: 'Recover the Crown of Sunfire and defeat the Shadow Overlord to restore peace to the realm.',
            milestones: [
                {
                    id: 1,
                    text: 'Find the hidden map in the archives of Millhaven',
                    location: 'Millhaven',
                    type: 'item',
                    requires: [],
                    trigger: { item: 'treasure_map', action: 'acquire' },
                    spawn: { type: 'item', id: 'treasure_map', name: 'Hidden Map', location: 'Millhaven' },
                    building: { type: 'archives', name: 'The Great Archives', location: 'Millhaven' },
                    rewards: { xp: 100, gold: '2d10', items: [] },
                    minLevel: null
                },
                {
                    id: 2,
                    text: 'Convince the Thornfield Guard to join the resistance',
                    location: 'Thornfield',
                    type: 'narrative',
                    requires: [],
                    trigger: null,
                    spawn: { type: 'npc', id: 'thornfield_guard_captain', name: 'Captain Aldric', location: 'Thornfield', role: 'Guard', personality: 'proud, honorable, skeptical of outsiders' },
                    building: { type: 'barracks', name: 'Thornfield Guard Barracks', location: 'Thornfield' },
                    rewards: { xp: 150, gold: '1d20', items: ['quest_key'] },
                    minLevel: null
                },
                {
                    id: 3,
                    text: 'Breach the Shadow Fortress in the Greenridge Hills',
                    location: 'Greenridge Hills',
                    type: 'location',
                    requires: [1, 2],
                    trigger: { location: 'shadow_fortress', action: 'visit' },
                    spawn: { type: 'poi', id: 'shadow_fortress', name: 'Shadow Fortress', location: 'Greenridge Hills' },
                    building: null,
                    rewards: { xp: 200, gold: '3d20', items: [] },
                    minLevel: 3
                },
                {
                    id: 4,
                    text: 'Defeat the Shadow Overlord',
                    location: 'Greenridge Hills',
                    type: 'combat',
                    requires: [3],
                    trigger: { enemy: 'shadow_overlord', action: 'defeat' },
                    spawn: { type: 'enemy', id: 'shadow_overlord', name: 'Shadow Overlord', location: 'Greenridge Hills' },
                    building: null,
                    encounter: {
                        name: 'Shadow Overlord',
                        icon: '👑',
                        image: '/assets/encounters/bosses/shadow_overlord.webp',
                        encounterTier: 'boss',
                        difficulty: 'deadly',
                        // #43 DC retune: deadly's DC 25 was a ~1% lottery; sim-validated at DC 20
                        // for a 3-hero mid-gear Lv 5 party (~42% win). Label stays 'deadly'.
                        dc: 20,
                        multiRound: true,
                        enemyHP: 250,
                        dealsDamage: true,
                        damage: { criticalFailure: '5d6+5', failure: '2d6+2', success: '1d6' },
                        suggestedActions: [
                            { label: 'Fight', skill: 'Athletics', description: 'Engage the Overlord in direct combat' },
                            { label: 'Use the Map', skill: 'Investigation', description: 'Exploit weaknesses revealed by the hidden map' },
                            { label: 'Rally the Guard', skill: 'Persuasion', description: 'Command the Thornfield Guard to flank' }
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
    // DESERT EXPEDITION (Phase 2b — first themed-region adventure)
    // ============================================================
    // Note: the top-level `theme` here is the campaign GENRE, while `settings.theme`
    // is the world BIOME theme that drives map/town/narration. The genre is what
    // campaignChain uses to recommend the same chain's next tier ("Continue your
    // legend"), so the biome chains carry their own genre (#50): desert t1 must
    // recommend desert t2, not compete with heroic-fantasy-t2 for the badge.
    {
        id: 'desert-expedition-t1',
        theme: 'desert-expedition',
        tier: 1,
        levelRange: [1, 2],
        // Premium content: desert (sand) world-gen + its quest are a paid unlock.
        // Gating derives from settings.theme ('desert' in PREMIUM_THEMES) too, but the
        // explicit flag keeps intent obvious and covers premium templates that ever ship
        // without a premium biome theme. See src/game/entitlements.js.
        premium: true,
        name: 'Desert Expedition',
        subtitle: 'The Sunscorched Road',
        icon: '🏜️',
        description: 'A caravan has vanished in the deep desert and a sandstorm cult stirs among the dunes. Cross the burning sands and end the threat.',
        customNames: { towns: ['Sandreach', 'Dustmere', 'Oasis Karn', 'Suncradle'], mountains: ['The Scorched Bluffs'] },
        settings: {
            theme: 'desert',
            shortDescription: 'The trading caravans out of Sandreach have stopped arriving, swallowed by the dunes. Survivors whisper of robed figures who command the sandstorms. Someone must brave the deep desert and uncover what stalks the Sunscorched Road.',
            campaignGoal: 'Discover the fate of the lost caravans and defeat the leader of the sandstorm cult.',
            milestones: [
                {
                    id: 1,
                    text: 'Recover the lost caravan ledger from the Sandreach trading post',
                    location: 'Sandreach',
                    type: 'item',
                    requires: [],
                    trigger: { item: 'map_fragment', action: 'acquire' },
                    spawn: { type: 'item', id: 'map_fragment', name: 'Caravan Ledger', location: 'Sandreach' },
                    building: { type: 'warehouse', name: 'The Sandreach Caravanserai', location: 'Sandreach' },
                    rewards: { xp: 25, gold: '1d6', items: [] },
                    minLevel: null
                },
                {
                    id: 2,
                    text: 'Win the trust of the well-keeper at Oasis Karn',
                    location: 'Oasis Karn',
                    type: 'narrative',
                    requires: [],
                    trigger: null,
                    spawn: { type: 'npc', id: 'well_keeper', name: 'Keeper Najwa', location: 'Oasis Karn', role: 'Merchant', personality: 'weathered, watchful, fiercely protective of the oasis water' },
                    building: { type: 'inn', name: 'The Last Drop', location: 'Oasis Karn' },
                    rewards: { xp: 25, gold: '1d6', items: ['rations'] },
                    minLevel: null
                },
                {
                    id: 3,
                    text: 'Find the cult\'s hideout among the Scorched Bluffs',
                    location: 'The Scorched Bluffs',
                    type: 'location',
                    requires: [1, 2],
                    trigger: { location: 'sandstorm_hideout', action: 'visit' },
                    spawn: { type: 'poi', id: 'sandstorm_hideout', name: 'Sandstorm Hideout', location: 'The Scorched Bluffs' },
                    building: null,
                    rewards: { xp: 50, gold: '1d10', items: [] },
                    minLevel: null
                },
                {
                    id: 4,
                    text: 'Defeat the Sandstorm Cult Leader',
                    location: 'The Scorched Bluffs',
                    type: 'combat',
                    requires: [3],
                    trigger: { enemy: 'sandstorm_cultist', action: 'defeat' },
                    spawn: { type: 'enemy', id: 'sandstorm_cultist', name: 'Sandstorm Cult Leader', location: 'The Scorched Bluffs' },
                    building: null,
                    encounter: {
                        name: 'Sandstorm Cult Leader',
                        icon: '🌪️',
                        image: '/assets/encounters/bosses/cult_leader.webp',
                        encounterTier: 'boss',
                        difficulty: 'medium',
                        multiRound: true,
                        enemyHP: 30,
                        dealsDamage: true,
                        damage: { criticalFailure: '2d6+2', failure: '1d6+1', success: '1d3' },
                        suggestedActions: [
                            { label: 'Fight', skill: 'Athletics', description: 'Charge through the stinging sand' },
                            { label: 'Read the Wind', skill: 'Survival', description: 'Use the ledger\'s notes to time the storm\'s lulls' },
                            { label: 'Sever the Ritual', skill: 'Arcana', description: 'Disrupt the chant that summons the sandstorm' }
                        ],
                        consequences: {
                            criticalSuccess: 'The storm collapses as the leader falls; the dunes fall silent.',
                            success: 'After a punishing fight in the swirling sand, the cult leader is defeated.',
                            failure: 'A wall of sand batters you, but you keep your footing.',
                            criticalFailure: 'The storm engulfs you. You stagger clear, half-buried and gasping.'
                        },
                        rewards: { xp: 75, gold: '2d10', items: ['rusty_dagger'] }
                    },
                    rewards: { xp: 50, gold: '1d10', items: [] },
                    minLevel: 2
                }
            ],
            grimnessLevel: 'Neutral',
            darknessLevel: 'Bright',
            magicLevel: 'Low Magic',
            technologyLevel: 'Medieval',
            responseVerbosity: 'Descriptive'
        }
    },

    // SAME-WORLD SEQUEL (QUEST_CHAINING_PLAN decision, 2026-07): authored onto
    // desert-expedition-t1's geography EXACTLY (Sandreach / Dustmere / Oasis Karn /
    // Suncradle + The Scorched Bluffs) so a completed Sunscorched Road save can
    // continue this campaign IN the same world (in-save continuation). Venue/NPC
    // choices deliberately avoid t1's quest buildings (t1 used Sandreach's warehouse
    // and Oasis Karn's inn) so retro-injection into cached towns never collides.
    {
        id: 'desert-expedition-t2',
        theme: 'desert-expedition',
        tier: 2,
        levelRange: [3, 5],
        // Premium content, same gating as desert-expedition-t1 (settings.theme 'desert'
        // is in PREMIUM_THEMES; the explicit flag keeps intent obvious).
        premium: true,
        name: 'Desert Expedition',
        subtitle: 'The Waking Sands',
        icon: '🏜️',
        description: 'The sandstorm cult is broken, but the deep desert has gone quiet. The storms were feeding something beneath the dunes, and the tribute has stopped. Slay the Dune Wyrm before it swallows the trade roads.',
        customNames: { towns: ['Sandreach', 'Dustmere', 'Oasis Karn', 'Suncradle'], mountains: ['The Scorched Bluffs'] },
        settings: {
            theme: 'desert',
            shortDescription: 'With the Sandstorm Cult broken, the caravans dared the Sunscorched Road again, and for a season the desert let them pass. Now the dunes themselves are moving. The cult\'s rituals were never commanding the storms; they were feeding them to something asleep beneath the sands, and its tribute has stopped. The scholars of Dustmere whisper an old name from the Sun-Kings\' records: the Dune Wyrm.',
            campaignGoal: 'Uncover what the sandstorm cult was feeding beneath the dunes and slay the Dune Wyrm before it devours the trade roads.',
            milestones: [
                {
                    id: 1,
                    text: 'Recover the Sun-Kings\' star-chart from the Dustmere records hall',
                    location: 'Dustmere',
                    type: 'item',
                    requires: [],
                    trigger: { item: 'ancient_scroll', action: 'acquire' },
                    spawn: { type: 'item', id: 'ancient_scroll', name: 'Sun-Kings\' Star-Chart', location: 'Dustmere' },
                    building: { type: 'archives', name: 'The Dustmere Records Hall', location: 'Dustmere' },
                    rewards: { xp: 100, gold: '2d10', items: [] },
                    minLevel: null
                },
                {
                    id: 2,
                    text: 'Seek out the last wyrm-hunter at Suncradle',
                    location: 'Suncradle',
                    type: 'talk',
                    requires: [],
                    trigger: { npc: 'wyrm_hunter', action: 'talk' },
                    spawn: { type: 'npc', id: 'wyrm_hunter', name: 'Huntress Zahra', location: 'Suncradle', role: 'Guild Master', gender: 'Female', personality: 'scarred, patient, the last sworn blade of the old wyrm-hunting lodge' },
                    building: { type: 'guild', name: 'The Wyrmhunters\' Lodge', location: 'Suncradle' },
                    rewards: { xp: 150, gold: '1d20', items: ['rations'] },
                    minLevel: null
                },
                {
                    id: 3,
                    text: 'Descend into the Sunken Spire beneath the Scorched Bluffs',
                    location: 'The Scorched Bluffs',
                    type: 'location',
                    requires: [1, 2],
                    trigger: { location: 'sunken_spire', action: 'visit' },
                    spawn: { type: 'poi', id: 'sunken_spire', name: 'The Sunken Spire', location: 'The Scorched Bluffs' },
                    building: null,
                    rewards: { xp: 200, gold: '3d20', items: [] },
                    minLevel: 3
                },
                {
                    id: 4,
                    text: 'Slay the Dune Wyrm',
                    location: 'The Scorched Bluffs',
                    type: 'combat',
                    requires: [3],
                    trigger: { enemy: 'dune_wyrm', action: 'defeat' },
                    spawn: { type: 'enemy', id: 'dune_wyrm', name: 'The Dune Wyrm', location: 'The Scorched Bluffs' },
                    building: null,
                    encounter: {
                        name: 'The Dune Wyrm',
                        icon: '🐍',
                        // Boss-art note: closest thematic fit in the current library; shared
                        // with questEnemies' Red Wyrm. Bespoke sand-wyrm art is an art-queue item.
                        image: '/assets/encounters/bosses/dragon_wyrm.webp',
                        encounterTier: 'boss',
                        difficulty: 'deadly',
                        // #43 schema: deadly's default DC 25 is a ~1% lottery; DC pinned into
                        // the sim-validated band. balanceSim @ 3000 trials, seed 1, 3-hero
                        // mid-gear Lv 5 party: 48.5% win, 0.9% tpk, 18.3% stalemate
                        // (none 17.9%, best 88.0%). Label stays 'deadly'.
                        dc: 20,
                        multiRound: true,
                        enemyHP: 250,
                        dealsDamage: true,
                        damage: { criticalFailure: '5d6+5', failure: '2d6+2', success: '1d6' },
                        suggestedActions: [
                            { label: 'Fight', skill: 'Athletics', description: 'Meet the wyrm with steel when it breaches the sand' },
                            { label: 'Read the Sands', skill: 'Survival', description: 'Use the wyrm-hunter\'s lore to predict where it will surface' },
                            { label: 'Strike the Star-Mark', skill: 'Investigation', description: 'Aim for the soft plate the Sun-Kings\' star-chart describes' }
                        ],
                        consequences: {
                            criticalSuccess: 'Your blade finds the star-mark. The wyrm convulses, collapses a dune around itself, and is still. The desert exhales.',
                            success: 'After a battle that reshapes the dunes, the Dune Wyrm sinks dead beneath the sand it ruled.',
                            failure: 'The wyrm breaches beneath you, jaws scything through the party before it dives.',
                            criticalFailure: 'The sands open like a mouth. You claw your way clear of the sinking pit, bleeding and half-buried.'
                        },
                        rewards: { xp: 500, gold: '5d20', items: ['dragonscale_plate'] }
                    },
                    rewards: { xp: 300, gold: '3d20', items: [] },
                    minLevel: 5
                }
            ],
            grimnessLevel: 'Neutral',
            darknessLevel: 'Bright',
            magicLevel: 'Low Magic',
            technologyLevel: 'Medieval',
            responseVerbosity: 'Descriptive'
        }
    },

    // ============================================================
    // FROZEN FRONTIER (Phase 2c — snow biome themed adventure)
    // ============================================================
    // Like the desert template, the top-level `theme` is the campaign GENRE (its own
    // chain genre, so campaignChain recommends frozen t2 after frozen t1), while
    // `settings.theme` is the world BIOME theme ('snow') that drives the map/town/
    // narration. Snow is a premium biome (PREMIUM_THEMES), so this is a premium
    // adventure; `premium: true` is also set explicitly for clarity.
    {
        id: 'frozen-frontier-t1',
        theme: 'frozen-frontier',
        tier: 1,
        levelRange: [1, 2],
        // Premium content: snow world-gen + its quest are a paid unlock. Gating derives from
        // settings.theme ('snow' in PREMIUM_THEMES) too, but the explicit flag keeps intent
        // obvious. See src/game/entitlements.js.
        premium: true,
        name: 'Frozen Frontier',
        subtitle: 'The Deepening Frost',
        icon: '❄️',
        description: 'An unnatural winter is strangling a frontier village. Cross the frozen wilds, find the source of the killing cold, and end it before the snows swallow everyone.',
        customNames: { towns: [{ name: 'Hearthmere', size: 'village' }, 'Frosthollow', 'Icemoor', 'Winterreach'], mountains: ['The Rimefang Peaks'] }, // "the village of Hearthmere"
        settings: {
            theme: 'snow',
            shortDescription: 'The village of Hearthmere is freezing to death. The pass has iced over out of season, the sun barely rises, and something cold and patient stalks the drifts at night. The elders beg for someone to brave the frozen wilds and find what is smothering the frontier in endless winter.',
            campaignGoal: 'Discover the source of the unnatural winter and destroy the frost-cursed wraith bleeding the cold into the frontier.',
            milestones: [
                {
                    id: 1,
                    text: 'Recover the frozen survey ledger from the Hearthmere trading post',
                    location: 'Hearthmere',
                    type: 'item',
                    requires: [],
                    trigger: { item: 'map_fragment', action: 'acquire' },
                    spawn: { type: 'item', id: 'map_fragment', name: 'Frostbound Ledger', location: 'Hearthmere' },
                    building: { type: 'warehouse', name: 'The Hearthmere Trading Post', location: 'Hearthmere' },
                    rewards: { xp: 25, gold: '1d6', items: [] },
                    minLevel: null
                },
                {
                    id: 2,
                    text: 'Win the trust of the pathfinder at Frosthollow',
                    location: 'Frosthollow',
                    type: 'narrative',
                    requires: [],
                    trigger: null,
                    spawn: { type: 'npc', id: 'frost_warden', name: 'Warden Sigrun', location: 'Frosthollow', role: 'Guard', personality: 'weathered, taciturn, knows every drift and crevasse of the frozen pass' },
                    building: { type: 'inn', name: 'The Frosthollow Lodge', location: 'Frosthollow' },
                    rewards: { xp: 25, gold: '1d6', items: ['rations'] },
                    minLevel: null
                },
                {
                    id: 3,
                    text: 'Climb to the wraith\'s lair among the Rimefang Peaks',
                    location: 'The Rimefang Peaks',
                    type: 'location',
                    requires: [1, 2],
                    trigger: { location: 'glacier_hollow', action: 'visit' },
                    spawn: { type: 'poi', id: 'glacier_hollow', name: 'The Glacier Hollow', location: 'The Rimefang Peaks' },
                    building: null,
                    rewards: { xp: 50, gold: '1d10', items: [] },
                    minLevel: null
                },
                {
                    id: 4,
                    text: 'Destroy the Hoarfrost Wraith',
                    location: 'The Rimefang Peaks',
                    type: 'combat',
                    requires: [3],
                    trigger: { enemy: 'hoarfrost_wraith', action: 'defeat' },
                    spawn: { type: 'enemy', id: 'hoarfrost_wraith', name: 'The Hoarfrost Wraith', location: 'The Rimefang Peaks' },
                    building: null,
                    encounter: {
                        name: 'The Hoarfrost Wraith',
                        icon: '🥶',
                        image: '/assets/encounters/bosses/hoarfrost_wraith.webp',
                        encounterTier: 'boss',
                        difficulty: 'medium',
                        multiRound: true,
                        enemyHP: 32,
                        dealsDamage: true,
                        damage: { criticalFailure: '2d6+2', failure: '1d6+1', success: '1d3' },
                        suggestedActions: [
                            { label: 'Fight', skill: 'Athletics', description: 'Shatter the wraith\'s frozen core with steel' },
                            { label: 'Endure the Cold', skill: 'Survival', description: 'Use the warden\'s lore to weather the killing frost' },
                            { label: 'Break the Curse', skill: 'Arcana', description: 'Unravel the frost-ward binding the endless winter' }
                        ],
                        consequences: {
                            criticalSuccess: 'The wraith\'s ward cracks apart and it dissolves into harmless snow. Warmth creeps back into the air almost at once.',
                            success: 'After a bitter fight in the blowing snow, the wraith is destroyed. The unnatural cold begins to lift.',
                            failure: 'A blast of killing frost rimes your armor and numbs your limbs, but you hold your ground.',
                            criticalFailure: 'The blizzard closes over you. You stagger back down the pass, frostbitten and gasping, the winter unbroken.'
                        },
                        rewards: { xp: 75, gold: '2d10', items: ['storm_crystal'] }
                    },
                    rewards: { xp: 50, gold: '1d10', items: [] },
                    minLevel: 2
                }
            ],
            grimnessLevel: 'Bleak',
            darknessLevel: 'Grey',
            magicLevel: 'Low Magic',
            technologyLevel: 'Medieval',
            responseVerbosity: 'Descriptive'
        }
    },

    // SAME-WORLD SEQUEL (QUEST_CHAINING_PLAN decision, 2026-07): authored onto
    // frozen-frontier-t1's geography EXACTLY (Hearthmere [village] / Frosthollow /
    // Icemoor / Winterreach + The Rimefang Peaks) so a completed Deepening Frost
    // save can continue this campaign IN the same world (in-save continuation).
    // Venue/NPC choices deliberately avoid t1's quest buildings (t1 used
    // Hearthmere's warehouse and Frosthollow's inn) so retro-injection into cached
    // towns never collides.
    {
        id: 'frozen-frontier-t2',
        theme: 'frozen-frontier',
        tier: 2,
        levelRange: [3, 5],
        // Premium content, same gating as frozen-frontier-t1 (settings.theme 'snow'
        // is in PREMIUM_THEMES; the explicit flag keeps intent obvious).
        premium: true,
        name: 'Frozen Frontier',
        subtitle: 'The Hungering Thaw',
        icon: '❄️',
        description: 'The Hoarfrost Wraith is destroyed and the false winter is lifting, but the melt is uncovering what the ice had sealed away. Something old and starving walks the thaw.',
        customNames: { towns: [{ name: 'Hearthmere', size: 'village' }, 'Frosthollow', 'Icemoor', 'Winterreach'], mountains: ['The Rimefang Peaks'] }, // "the village of Hearthmere"
        settings: {
            theme: 'snow',
            shortDescription: 'The Hoarfrost Wraith is gone and warmth is creeping back into the frontier, but the thaw is not the mercy it seemed. The retreating ice is uncovering things the old winters buried, and now folk are vanishing from the outlying steadings in the false spring. The sanctuary\'s oldest saga names the thing the famine-winters always wake: the Pale Hunger.',
            campaignGoal: 'Follow the disappearances of the false spring to their source and destroy the Pale Hunger freed by the melting ice.',
            milestones: [
                {
                    id: 1,
                    text: 'Recover the famine-winter saga from the Icemoor sanctuary',
                    location: 'Icemoor',
                    type: 'item',
                    requires: [],
                    trigger: { item: 'history_tome', action: 'acquire' },
                    spawn: { type: 'item', id: 'history_tome', name: 'The Famine-Winter Saga', location: 'Icemoor' },
                    building: { type: 'temple', name: 'The Icemoor Sanctuary', location: 'Icemoor' },
                    rewards: { xp: 100, gold: '2d10', items: [] },
                    minLevel: null
                },
                {
                    id: 2,
                    text: 'Search the silent steading outside Frosthollow',
                    location: 'Frosthollow',
                    type: 'location',
                    requires: [],
                    trigger: { location: 'silent_steading', action: 'visit' },
                    spawn: { type: 'poi', id: 'silent_steading', name: 'The Silent Steading', location: 'Frosthollow' },
                    building: null,
                    rewards: { xp: 125, gold: '2d10', items: ['quest_clue'] },
                    minLevel: null
                },
                {
                    id: 3,
                    text: 'Hear the old hunter\'s counsel at Winterreach',
                    location: 'Winterreach',
                    type: 'talk',
                    requires: [],
                    trigger: { npc: 'old_hunter', action: 'talk' },
                    spawn: { type: 'npc', id: 'old_hunter', name: 'Old Maren', location: 'Winterreach', role: 'Villager', gender: 'Female', personality: 'ancient, unblinking, survived the last famine-winter as a girl and knows what walks in the thaw' },
                    building: { type: 'tavern', name: 'The Long Night Hall', location: 'Winterreach' },
                    rewards: { xp: 150, gold: '1d20', items: ['rations'] },
                    minLevel: null
                },
                {
                    id: 4,
                    text: 'Climb to the Famine Barrow bared by the melting ice',
                    location: 'The Rimefang Peaks',
                    type: 'location',
                    requires: [1, 2, 3],
                    trigger: { location: 'famine_barrow', action: 'visit' },
                    spawn: { type: 'poi', id: 'famine_barrow', name: 'The Famine Barrow', location: 'The Rimefang Peaks' },
                    building: null,
                    rewards: { xp: 175, gold: '3d20', items: [] },
                    minLevel: 3
                },
                {
                    id: 5,
                    text: 'Destroy the Pale Hunger',
                    location: 'The Rimefang Peaks',
                    type: 'combat',
                    requires: [4],
                    trigger: { enemy: 'pale_hunger', action: 'defeat' },
                    spawn: { type: 'enemy', id: 'pale_hunger', name: 'The Pale Hunger', location: 'The Rimefang Peaks' },
                    building: null,
                    encounter: {
                        name: 'The Pale Hunger',
                        icon: '🦴',
                        // Boss-art note: the wendigo is the closest thematic fit in the current
                        // library; shared with questEnemies' Blood Wendigo (grimdark t2) and a
                        // T3_CAMPAIGNS_PLAN candidate for The Last Winter. Bespoke gaunt
                        // frost-revenant art is an art-queue item.
                        image: '/assets/encounters/bosses/blood_wendigo.webp',
                        encounterTier: 'boss',
                        difficulty: 'deadly',
                        // #43 schema: deadly's default DC 25 is a ~1% lottery; DC pinned into
                        // the sim-validated band. balanceSim @ 3000 trials, seed 1, 3-hero
                        // mid-gear Lv 5 party: 48.1% win, 1.0% tpk, 19.4% stalemate
                        // (none 17.2%, best 88.4%). Label stays 'deadly'.
                        dc: 20,
                        multiRound: true,
                        enemyHP: 250,
                        dealsDamage: true,
                        damage: { criticalFailure: '4d8+4', failure: '2d6+2', success: '1d6' },
                        suggestedActions: [
                            { label: 'Fight', skill: 'Athletics', description: 'Hold the line against the starving thing' },
                            { label: 'Firebrand', skill: 'Survival', description: 'Drive it back behind a burning line, as the steadings once did' },
                            { label: 'Recite the Saga', skill: 'Religion', description: 'Speak the old binding-words the famine-winter saga preserves' }
                        ],
                        consequences: {
                            criticalSuccess: 'The binding-words land as the firebrand catches. The Pale Hunger comes apart like rotten ice, and the thaw turns gentle at last.',
                            success: 'Starved of its feast, the Pale Hunger falls beneath fire and steel. The frontier\'s spring is its own again.',
                            failure: 'It moves between heartbeats. Frost-black claws rake through the party before the fire pushes it back.',
                            criticalFailure: 'Its hunger swallows the firelight whole. You flee the barrow with the sound of cracking bone behind you.'
                        },
                        rewards: { xp: 450, gold: '5d20', items: ['runic_greatsword'] }
                    },
                    rewards: { xp: 300, gold: '3d20', items: [] },
                    minLevel: 5
                }
            ],
            grimnessLevel: 'Bleak',
            darknessLevel: 'Grey',
            magicLevel: 'Low Magic',
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
        customNames: { towns: [{ name: 'Ashford', size: 'village' }, 'Mudhollow', 'Grimstead', 'Duskwell'], mountains: ['Grey Moors'] }, // "the village of Ashford"
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
                        image: '/assets/encounters/bosses/blightspawn.webp',
                        encounterTier: 'boss',
                        difficulty: 'medium',
                        multiRound: true,
                        enemyHP: 25,
                        dealsDamage: true,
                        damage: { criticalFailure: '2d6+2', failure: '1d6+1', success: '1d3' },
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
                        image: '/assets/encounters/bosses/rot_heart.webp',
                        encounterTier: 'boss',
                        difficulty: 'hard',
                        multiRound: true,
                        enemyHP: 150,
                        // #43: DC stays hard/20 — sim lands a 3-hero mid-gear Lv 4 party at ~44% win
                        dealsDamage: true,
                        damage: { criticalFailure: '4d6+4', failure: '2d6+2', success: '1d4' },
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
            shortDescription: 'An automaton has gone haywire in the streets of Cogsworth, smashing market stalls and attacking anyone who gets close. The artificer who built it has vanished from their workshop in Tinker-Row, and the town guard is outmatched.',
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
                        image: '/assets/encounters/bosses/rogue_automaton.webp',
                        encounterTier: 'boss',
                        difficulty: 'medium',
                        multiRound: true,
                        enemyHP: 35,
                        dealsDamage: true,
                        damage: { criticalFailure: '2d6+2', failure: '1d6+1', success: '1d3' },
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
        customNames: { towns: [{ name: 'Novaris', size: 'city' }, 'Aether-Gate', 'Steam-Wharf', 'Cog-Hill'], mountains: ['Ironpeak Range'] }, // "the city of Novaris"
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
                        image: '/assets/encounters/bosses/old_god_herald.webp',
                        encounterTier: 'boss',
                        difficulty: 'deadly',
                        // #43 DC retune: fought at Lv 4 (one level-bonus rung below the Lv 5
                        // finales), so DC 19 lands the 3-hero mid-gear band (~45% win).
                        dc: 19,
                        multiRound: true,
                        enemyHP: 200,
                        dealsDamage: true,
                        damage: { criticalFailure: '5d6+5', failure: '2d6+2', success: '1d4' },
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
                        rewards: { xp: 450, gold: '4d20', items: ['stormbound_ring'] } // #44 follow-up: t2 finale pays a very_rare (was an uncommon staff)
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
                        image: '/assets/encounters/bosses/worm_that_walks.webp',
                        encounterTier: 'boss',
                        difficulty: 'medium',
                        multiRound: true,
                        enemyHP: 30,
                        dealsDamage: true,
                        damage: { criticalFailure: '2d6+2', failure: '1d6+1', success: '1d3' },
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
        customNames: { towns: [{ name: 'Blackwood', size: 'town' }, 'Whisper-Cove', 'Mourn-Peak', 'Abyssal-Rest'], mountains: ['Mourn-Peak Heights'] }, // "the town of Blackwood"
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
                        image: '/assets/encounters/bosses/great_dreamer.webp',
                        encounterTier: 'boss',
                        difficulty: 'deadly',
                        // #43 DC retune: the biggest HP pool (300) already makes this the longest
                        // fight in the game; DC 19 keeps the 3-hero mid-gear Lv 5 party ~56% win.
                        dc: 19,
                        multiRound: true,
                        enemyHP: 300,
                        dealsDamage: true,
                        damage: { criticalFailure: '4d8+4', failure: '2d6+2', success: '1d6' },
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

// --- Local premium templates (the MECHANISM is public; the content is not) --------
// Premium campaigns (t3+) are authored in the private content repo and will reach
// players via the server channel (#40). For local playtesting, a gitignored
// src/data/premiumTemplates.local.js (shape: premiumTemplates.local.example.js) is
// merged in at bundle time: entries whose id matches a public template REPLACE it
// (a comingSoon stub becomes playable locally), new ids append. require.context
// tolerates the file being absent under webpack and is undefined under Jest, so
// tests and the progression lint always run against PUBLIC data only.
export const mergeLocalTemplates = (templates, locals) => {
    (locals || []).forEach((tpl) => {
        if (!tpl?.id) return;
        const i = templates.findIndex((t) => t.id === tpl.id);
        if (i >= 0) templates[i] = tpl; else templates.push(tpl);
    });
    return templates;
};
if (typeof require.context === 'function') {
    const ctx = require.context('.', false, /^\.\/premiumTemplates\.local\.js$/);
    ctx.keys().forEach((k) => mergeLocalTemplates(storyTemplates, ctx(k).premiumTemplates));
}
