/**
 * Encounter template definitions.
 * Ported from src/data/encounters.js — zero behavioral changes.
 *
 * NOTE: This file is intentionally very long because it is a data file
 * containing all encounter templates. Splitting would fragment the data.
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** A suggested action for an encounter. */
export interface SuggestedAction {
  readonly label: string;
  readonly skill: string | null;
  readonly description: string;
}

/** Rewards template for an encounter. */
export interface EncounterRewards {
  readonly xp: number;
  readonly gold: string;
  readonly items: readonly string[];
  readonly healing?: string;
}

/** Consequences text for each outcome tier. */
export interface EncounterConsequences {
  readonly criticalSuccess: string;
  readonly success: string;
  readonly failure: string;
  readonly criticalFailure: string;
}

/** Faction reputation changes by outcome. */
export type FactionEffects = Record<string, Record<string, number>>;

/** Healing by outcome tier (for healer encounters). */
export type HealingByTier = Record<string, string>;

/** A full encounter template. */
export interface EncounterTemplate {
  readonly name: string;
  readonly icon: string;
  readonly encounterTier: string;
  readonly description: string;
  readonly difficulty: string;
  readonly suggestedActions: readonly SuggestedAction[];
  readonly rewards: EncounterRewards;
  readonly consequences: EncounterConsequences;
  readonly multiRound?: boolean;
  readonly enemyHP?: number;
  readonly poiType?: string;
  readonly environmental?: boolean;
  readonly narrativeHook?: string;
  readonly aiContext?: string;
  readonly affectedFactions?: FactionEffects;
  readonly healingByTier?: HealingByTier;
}

// ── Repeated string constants (extracted to satisfy sonarjs/no-duplicate-string) ─

const SKILL_ANIMAL_HANDLING = "Animal Handling";
const DESC_CONTINUE_ON_YOUR_WAY = "Continue on your way";

// ── Difficulty DC table ──────────────────────────────────────────────────────

export const DIFFICULTY_DC: Record<string, number> = {
  trivial: 5,
  easy: 10,
  medium: 15,
  hard: 20,
  deadly: 25,
};

// ── Templates ────────────────────────────────────────────────────────────────

export const encounterTemplates: Record<string, EncounterTemplate> = {
  goblin_ambush: {
    name: "Goblin Ambush",
    icon: "\u{1F47A}",
    encounterTier: "immediate",
    description: "A band of goblins leaps from the undergrowth, weapons drawn and eyes gleaming with malice!",
    difficulty: "easy",
    multiRound: true,
    enemyHP: 15,
    suggestedActions: [
      { label: "Fight", skill: "Athletics", description: "Charge into battle with weapons ready" },
      { label: "Intimidate", skill: "Intimidation", description: "Roar and brandish weapons to scare them off" },
      { label: "Flee", skill: "Acrobatics", description: "Sprint away before they surround you" },
      { label: "Negotiate", skill: "Persuasion", description: "Offer gold or safe passage" },
    ],
    rewards: { xp: 50, gold: "2d10", items: ["rusty_dagger:30%", "healing_potion:20%"] },
    consequences: {
      criticalSuccess: "The goblins flee in terror, dropping valuable loot in their panic.",
      success: "You overcome the goblins with minimal injury and claim their meager possessions.",
      failure: "The goblins wound you before retreating into the wilderness.",
      criticalFailure: "The ambush goes badly - you lose equipment and take serious injuries before escaping.",
    },
  },

  wolf_pack: {
    name: "Wolf Pack",
    icon: "\u{1F43A}",
    encounterTier: "immediate",
    description: "Hungry wolves circle your party, growling menacingly as their alpha watches from the shadows.",
    difficulty: "medium",
    multiRound: true,
    enemyHP: 20,
    suggestedActions: [
      { label: "Fight", skill: "Athletics", description: "Defend against the pack with steel and courage" },
      { label: "Scare Off", skill: "Intimidation", description: "Use fire and noise to frighten them" },
      { label: "Sneak Away", skill: "Stealth", description: "Slowly back away without sudden movements" },
      { label: "Animal Handling", skill: SKILL_ANIMAL_HANDLING, description: "Calm the alpha and show respect" },
    ],
    rewards: { xp: 75, gold: "1d6", items: ["wolf_pelt:60%", "wolf_fang:40%"] },
    consequences: {
      criticalSuccess: "The alpha wolf respects your strength and the pack disperses peacefully.",
      success: "You drive off the wolves without serious harm to your party.",
      failure: "The wolves bite before fleeing - you need to tend your wounds.",
      criticalFailure: "The pack overwhelms you, stealing supplies and leaving you wounded and shaken.",
    },
  },

  bandit_roadblock: {
    name: "Bandit Roadblock",
    icon: "\u{1F5E1}\uFE0F",
    encounterTier: "immediate",
    description: "Armed bandits block the road ahead, their leader demanding a toll for safe passage.",
    difficulty: "medium",
    multiRound: true,
    enemyHP: 25,
    suggestedActions: [
      { label: "Fight", skill: "Athletics", description: "Draw weapons and fight your way through" },
      { label: "Intimidate", skill: "Intimidation", description: "Show them you're not easy prey" },
      { label: "Pay Toll", skill: "Persuasion", description: "Negotiate a reasonable price" },
      { label: "Deceive", skill: "Deception", description: "Trick them with false promises" },
    ],
    rewards: { xp: 100, gold: "3d10", items: ["shortsword:25%", "leather_armor:15%", "healing_potion:30%"] },
    consequences: {
      criticalSuccess: "You defeat or outwit the bandits, claiming their ill-gotten gains.",
      success: "You pass through with minimal cost and no injuries.",
      failure: "You lose some gold or supplies but escape unharmed.",
      criticalFailure: "The bandits rob you blind and rough you up for good measure.",
    },
    affectedFactions: {
      criticalSuccess: { "Merchant Guild": 2, "Bandit Clans": -2 },
      success: { "Merchant Guild": 1, "Bandit Clans": -1 },
      failure: { "Merchant Guild": -1 },
      criticalFailure: { "Bandit Clans": 1 },
    },
  },

  traveling_merchant: {
    name: "Traveling Merchant",
    icon: "\u{1F6D2}",
    encounterTier: "narrative",
    narrativeHook: "a merchant with a laden cart traveling the road",
    aiContext: "A traveling merchant with a colorful cart approaches along the road. They seem friendly and eager to trade goods or share news from other settlements.",
    description: "A cheerful merchant with a laden cart waves you down, offering exotic wares and news from distant lands.",
    difficulty: "easy",
    suggestedActions: [
      { label: "Browse Wares", skill: "Persuasion", description: "Haggle for good prices on supplies" },
      { label: "Ask for News", skill: "Persuasion", description: "Learn rumors and information" },
      { label: "Offer Protection", skill: "Persuasion", description: "Escort them for a reward" },
      { label: "Move On", skill: null, description: "Politely decline and continue your journey" },
    ],
    rewards: { xp: 25, gold: "1d10", items: ["healing_potion:50%", "rations:70%", "map_fragment:20%"] },
    consequences: {
      criticalSuccess: "The merchant is so pleased they give you a rare item and valuable information.",
      success: "You make a fair trade and learn useful news about the road ahead.",
      failure: "The merchant is cagey and offers poor prices, but you part on good terms.",
      criticalFailure: "The merchant suspects you of ill intent and refuses to deal with you.",
    },
    affectedFactions: {
      criticalSuccess: { "Merchant Guild": 2 },
      success: { "Merchant Guild": 1 },
    },
  },

  wandering_minstrel: {
    name: "Wandering Minstrel",
    icon: "\u{1F3B5}",
    encounterTier: "narrative",
    narrativeHook: "a bard playing music by the roadside",
    aiContext: "A traveling minstrel sits beneath a tree, playing a haunting melody on their lute. They seem lost in the music but might welcome company or have tales to share.",
    description: "A bard sits by the roadside, playing a melancholy tune on a well-worn lute.",
    difficulty: "easy",
    suggestedActions: [
      { label: "Listen to Song", skill: "Perception", description: "The song may contain hidden lore" },
      { label: "Share Stories", skill: "Persuasion", description: "Exchange tales of adventure" },
      { label: "Request a Ballad", skill: "Persuasion", description: "Ask for a morale-boosting performance" },
      { label: "Give Coin", skill: null, description: "Tip the bard and move on" },
    ],
    rewards: { xp: 30, gold: "0", items: ["inspiration:40%", "quest_clue:30%"] },
    consequences: {
      criticalSuccess: "The bard teaches you an ancient song that grants a powerful blessing.",
      success: "You gain inspiration and learn valuable lore about your quest.",
      failure: "The bard is pleasant but offers little of value.",
      criticalFailure: "The bard is offended and spreads unflattering songs about your party.",
    },
  },

  giant_spiders: {
    name: "Giant Spider Nest",
    icon: "\u{1F577}\uFE0F",
    encounterTier: "immediate",
    description: "Massive webs stretch between the trees, and you hear the clicking of enormous mandibles.",
    difficulty: "medium",
    multiRound: true,
    enemyHP: 18,
    suggestedActions: [
      { label: "Fight", skill: "Athletics", description: "Battle the spiders before they strike" },
      { label: "Burn Webs", skill: "Survival", description: "Use fire to clear a path" },
      { label: "Sneak Past", skill: "Stealth", description: "Move silently around the nest" },
      { label: "Retreat", skill: "Acrobatics", description: "Back away carefully" },
    ],
    rewards: { xp: 90, gold: "2d8", items: ["spider_silk:70%", "venom_sac:40%", "healing_potion:25%"] },
    consequences: {
      criticalSuccess: "You destroy the nest and claim valuable spider silk and venom.",
      success: "You overcome the spiders with minor injuries and some useful materials.",
      failure: "Spider venom weakens you, but you escape the nest.",
      criticalFailure: "You're badly poisoned and wrapped in webbing before cutting yourself free.",
    },
  },

  bear_encounter: {
    name: "Angry Bear",
    icon: "\u{1F43B}",
    encounterTier: "immediate",
    description: "A massive bear rears up on its hind legs, roaring a challenge as you enter its territory.",
    difficulty: "hard",
    multiRound: true,
    enemyHP: 35,
    suggestedActions: [
      { label: "Fight", skill: "Athletics", description: "Stand your ground and fight the beast" },
      { label: "Intimidate", skill: "Intimidation", description: "Make yourself large and loud" },
      { label: "Calm", skill: SKILL_ANIMAL_HANDLING, description: "Show you mean no harm" },
      { label: "Flee", skill: "Acrobatics", description: "Run before it charges" },
    ],
    rewards: { xp: 120, gold: "1d4", items: ["bear_pelt:80%", "bear_claw:60%"] },
    consequences: {
      criticalSuccess: "The bear backs down and even leads you to a hidden cache of food.",
      success: "You drive off the bear without serious injury.",
      failure: "The bear mauls you before retreating - you're badly wounded.",
      criticalFailure: "The bear's attack is devastating, leaving you near death and without supplies.",
    },
  },

  mysterious_shrine: {
    name: "Mysterious Shrine",
    icon: "\u26E9\uFE0F",
    encounterTier: "narrative",
    narrativeHook: "an ancient shrine covered in glowing runes",
    aiContext: "An old shrine stands among the trees, its stone surface covered in moss and strange runes that pulse with faint magical light. It radiates an aura of forgotten power.",
    description: "An ancient shrine stands before you, covered in moss and strange runes that seem to pulse with faint light.",
    difficulty: "medium",
    suggestedActions: [
      { label: "Pray", skill: "Religion", description: "Offer prayers to the forgotten deity" },
      { label: "Study Runes", skill: "Arcana", description: "Decipher the magical inscriptions" },
      { label: "Leave Offering", skill: "Religion", description: "Place gold or items at the altar" },
      { label: "Ignore", skill: null, description: "Pass by without disturbing it" },
    ],
    rewards: { xp: 80, gold: "0", items: ["divine_blessing:50%", "ancient_knowledge:30%", "cursed_item:10%"] },
    consequences: {
      criticalSuccess: "The shrine grants you a powerful blessing and reveals hidden knowledge.",
      success: "You receive a minor blessing or useful insight.",
      failure: "The shrine remains silent, offering neither help nor harm.",
      criticalFailure: "You anger the shrine's guardian spirit and are cursed.",
    },
  },

  rockslide: {
    name: "Rockslide",
    icon: "\u{1FAA8}",
    encounterTier: "immediate",
    description: "The ground trembles and rocks begin tumbling down the mountainside toward you!",
    difficulty: "medium",
    suggestedActions: [
      { label: "Run", skill: "Acrobatics", description: "Sprint to safety" },
      { label: "Take Cover", skill: "Survival", description: "Find shelter behind a boulder" },
      { label: "Shield Party", skill: "Athletics", description: "Use shields to protect everyone" },
      { label: "Magic Shield", skill: "Arcana", description: "Create a magical barrier" },
    ],
    rewards: { xp: 60, gold: "0", items: ["gemstone:30%", "rare_ore:20%"] },
    consequences: {
      criticalSuccess: "You avoid all harm and discover valuable gems in the rubble.",
      success: "You escape with minor scrapes and bruises.",
      failure: "Falling rocks injure you and damage equipment.",
      criticalFailure: "You're badly hurt and buried under debris, losing precious time digging out.",
    },
  },

  lost_child: {
    name: "Lost Child",
    icon: "\u{1F467}",
    encounterTier: "narrative",
    narrativeHook: "a child crying alone by the roadside",
    aiContext: "A young child sits by the path, tears streaming down their face. They claim to be lost and separated from their family, but something about the situation feels uncertain.",
    description: "A young child sits crying by the roadside, claiming to be separated from their family.",
    difficulty: "easy",
    suggestedActions: [
      { label: "Help Find Family", skill: "Survival", description: "Track the family's trail" },
      { label: "Comfort Child", skill: "Persuasion", description: "Calm them and learn what happened" },
      { label: "Sense Deception", skill: "Perception", description: "Check if this is a trap" },
      { label: "Leave", skill: null, description: DESC_CONTINUE_ON_YOUR_WAY },
    ],
    rewards: { xp: 40, gold: "1d20", items: ["family_heirloom:25%", "healing_potion:40%"] },
    consequences: {
      criticalSuccess: "You reunite the child with their grateful family, who reward you generously.",
      success: "You help the child and receive modest thanks.",
      failure: "The child was bait for bandits, but you escape their ambush.",
      criticalFailure: "You fall for the trap completely and are robbed by the child's accomplices.",
    },
  },

  tavern_brawl: {
    name: "Tavern Brawl",
    icon: "\u{1F37A}",
    encounterTier: "immediate",
    description: "A drunken argument erupts into a full-blown brawl at the local tavern. Chairs fly and fists swing!",
    difficulty: "easy",
    suggestedActions: [
      { label: "Join the Fight", skill: "Athletics", description: "Wade in and start throwing punches" },
      { label: "Break It Up", skill: "Intimidation", description: "Bellow for order and separate the fighters" },
      { label: "Slip Away", skill: "Stealth", description: "Grab your drink and find a quiet corner" },
      { label: "Pick Pockets", skill: "Sleight of Hand", description: "Use the chaos to lighten some purses" },
    ],
    rewards: { xp: 30, gold: "1d8", items: ["ale_mug:50%", "bar_stool_leg:20%"] },
    consequences: {
      criticalSuccess: "You emerge as the hero of the tavern, earning free drinks and a useful contact.",
      success: "You handle the situation well and earn some respect from the locals.",
      failure: "You get a black eye but nothing worse. The barkeep gives you a dirty look.",
      criticalFailure: "You get knocked out cold and wake up missing some coin.",
    },
  },

  town_market: {
    name: "Bustling Market",
    icon: "\u{1F3EA}",
    encounterTier: "narrative",
    narrativeHook: "a bustling market square filled with vendors",
    aiContext: "The town market is alive with activity. Vendors hawk their wares, fresh produce is piled high, and mysterious trinkets catch the eye. The air is filled with the sounds of haggling and the smell of fresh bread.",
    description: "The town market is alive with vendors hawking exotic wares, fresh produce, and mysterious trinkets.",
    difficulty: "easy",
    suggestedActions: [
      { label: "Browse Wares", skill: "Persuasion", description: "Haggle with merchants for supplies" },
      { label: "Gather Rumors", skill: "Perception", description: "Listen to gossip among the crowd" },
      { label: "Perform", skill: "Performance", description: "Entertain the crowd for coin" },
      { label: "Look Around", skill: null, description: "Take in the sights and move on" },
    ],
    rewards: { xp: 20, gold: "2d6", items: ["rations:60%", "healing_potion:30%", "map_fragment:15%"] },
    consequences: {
      criticalSuccess: "A merchant takes a shine to you and offers a rare item at a steep discount.",
      success: "You find good deals and pick up useful information about the region.",
      failure: "Prices are high and the merchants are tight-lipped today.",
      criticalFailure: "A pickpocket lifts some of your coin while you browse.",
    },
  },

  town_quest_board: {
    name: "Quest Board",
    icon: "\u{1F4DC}",
    encounterTier: "narrative",
    narrativeHook: "a notice board covered in postings and warnings",
    aiContext: "A weathered notice board stands prominently in the town square, its surface covered with parchments - bounties, requests for help, warnings about dangers, and notices of missing persons.",
    description: "A weathered notice board stands in the town square, covered with requests for help and warnings.",
    difficulty: "easy",
    suggestedActions: [
      { label: "Read Notices", skill: "Perception", description: "Study the postings carefully" },
      { label: "Ask Locals", skill: "Persuasion", description: "Chat with townsfolk about the notices" },
      { label: "Take a Job", skill: null, description: "Accept a bounty or errand" },
      { label: "Move On", skill: null, description: "Nothing catches your eye" },
    ],
    rewards: { xp: 25, gold: "0", items: ["quest_clue:60%", "map_fragment:30%"] },
    consequences: {
      criticalSuccess: "You find a highly lucrative posting and learn crucial information about your quest.",
      success: "You pick up a useful lead and learn something about the area.",
      failure: "Most of the postings are outdated or irrelevant.",
      criticalFailure: "You accidentally accept a job that turns out to be a scam.",
    },
  },

  town_healer: {
    name: "Traveling Healer",
    icon: "\u2695\uFE0F",
    encounterTier: "narrative",
    narrativeHook: "a healer's tent with the scent of medicinal herbs",
    aiContext: "A colorful tent stands near the town well, its entrance marked by bundles of drying herbs. A kindly healer tends to the sick and injured, offering remedies and blessings to those in need.",
    description: "A kindly healer has set up a tent near the town well, offering remedies and blessings to weary travelers.",
    difficulty: "easy",
    suggestedActions: [
      { label: "Seek Healing", skill: "Persuasion", description: "Ask for treatment of injuries" },
      { label: "Buy Potions", skill: "Persuasion", description: "Purchase healing supplies" },
      { label: "Trade Knowledge", skill: "Medicine", description: "Exchange medical knowledge" },
      { label: "Decline", skill: null, description: "Thank them and move on" },
    ],
    rewards: { xp: 15, gold: "0", items: ["healing_potion:70%", "antidote:40%", "herbal_remedy:50%"], healing: "2d8+4" },
    consequences: {
      criticalSuccess: "The healer mends your wounds completely and gifts you a powerful restorative.",
      success: "You receive helpful treatment and your wounds begin to close.",
      failure: "The healer is busy but applies a minor salve to your wounds.",
      criticalFailure: "The healer's remedy stings painfully, though it does provide minor relief.",
    },
    healingByTier: {
      criticalSuccess: "full",
      success: "2d8+4",
      failure: "1d4",
      criticalFailure: "1d4",
    },
  },

  suspicious_stranger: {
    name: "Suspicious Stranger",
    icon: "\u{1F575}\uFE0F",
    encounterTier: "narrative",
    narrativeHook: "a hooded figure lurking in the shadows",
    aiContext: "A mysterious hooded figure watches from a quiet alley, their face obscured. They seem to be waiting for someone - or watching for an opportunity. Something about them suggests they have secrets to share.",
    description: "A hooded figure approaches you in a quiet alley, claiming to have information... for a price.",
    difficulty: "medium",
    suggestedActions: [
      { label: "Listen", skill: "Perception", description: "Hear them out while staying alert" },
      { label: "Intimidate", skill: "Intimidation", description: "Demand they speak plainly" },
      { label: "Pay Up", skill: "Persuasion", description: "Offer coin for information" },
      { label: "Walk Away", skill: null, description: "Ignore the stranger and leave" },
    ],
    rewards: { xp: 40, gold: "1d10", items: ["quest_clue:50%", "stolen_goods:20%", "poisoned_dagger:10%"] },
    consequences: {
      criticalSuccess: "The stranger reveals critical intelligence about dangers ahead and a hidden cache.",
      success: "You learn useful information, though you're not sure how much to trust.",
      failure: "The information seems dubious at best. You may have wasted your time.",
      criticalFailure: "It was a setup! Thugs emerge from the shadows, though you manage to escape.",
    },
  },

  herb_gathering: {
    name: "Medicinal Herbs",
    icon: "\u{1F33F}",
    encounterTier: "narrative",
    narrativeHook: "rare medicinal herbs growing among wildflowers",
    aiContext: "A patch of unusual plants catches your eye - rare medicinal herbs with distinctive leaves and flowers. They could be valuable for healing or trade.",
    description: "You spot a patch of rare medicinal herbs growing among the wildflowers.",
    difficulty: "easy",
    suggestedActions: [
      { label: "Gather Herbs", skill: "Nature", description: "Carefully harvest the plants" },
      { label: "Study Plants", skill: "Medicine", description: "Identify their properties" },
      { label: "Take All", skill: "Survival", description: "Harvest everything you can carry" },
      { label: "Leave Them", skill: null, description: "Continue your journey" },
    ],
    rewards: { xp: 15, gold: "0", items: ["healing_herbs:80%", "rare_ingredient:30%", "healing_potion:20%"] },
    consequences: {
      criticalSuccess: "You find an exceptionally rare specimen worth a small fortune to the right buyer.",
      success: "You gather a useful supply of medicinal herbs.",
      failure: "You pick the wrong plants and end up with worthless weeds.",
      criticalFailure: "You disturb a nest of insects hidden among the plants and get badly stung.",
    },
  },

  abandoned_campsite: {
    name: "Abandoned Campsite",
    icon: "\u{1F3D5}\uFE0F",
    encounterTier: "narrative",
    narrativeHook: "an abandoned campsite with cold ashes",
    aiContext: "An abandoned campsite lies ahead. The fire pit is cold, supplies are scattered, and there are signs of a hasty departure. What happened here?",
    description: "You come across an abandoned campsite. The fire is cold, but supplies remain scattered about.",
    difficulty: "easy",
    suggestedActions: [
      { label: "Search Camp", skill: "Investigation", description: "Look through what was left behind" },
      { label: "Track Owners", skill: "Survival", description: "Follow the trail of whoever was here" },
      { label: "Set Up Camp", skill: "Survival", description: "Rest here for a while" },
      { label: "Move On", skill: null, description: "Best not to linger" },
    ],
    rewards: { xp: 20, gold: "1d8", items: ["rations:60%", "rope:40%", "journal_page:25%"] },
    consequences: {
      criticalSuccess: "You find a hidden stash of valuable supplies and a journal with useful information.",
      success: "You salvage some useful supplies from the abandoned camp.",
      failure: "The camp has been picked clean - nothing of value remains.",
      criticalFailure: "The camp was abandoned for a reason - you trigger a trap left for looters.",
    },
  },

  mountain_hermit: {
    name: "Mountain Hermit",
    icon: "\u{1F9D9}",
    encounterTier: "narrative",
    narrativeHook: "a hermit meditating outside a mountain cave",
    aiContext: "A weathered hermit sits cross-legged outside a cave entrance, eyes closed in meditation. Their presence radiates wisdom and peace. They seem aware of your approach despite their closed eyes.",
    description: "A weathered hermit sits outside a cave, eyes twinkling with ancient knowledge.",
    difficulty: "easy",
    suggestedActions: [
      { label: "Seek Wisdom", skill: "Persuasion", description: "Ask the hermit for guidance" },
      { label: "Trade Stories", skill: "Persuasion", description: "Share tales of your adventures" },
      { label: "Request Training", skill: "Athletics", description: "Ask for combat or survival tips" },
      { label: "Leave", skill: null, description: "Respect the hermit's solitude" },
    ],
    rewards: { xp: 35, gold: "0", items: ["ancient_knowledge:50%", "quest_clue:40%", "rare_herb:30%"] },
    consequences: {
      criticalSuccess: "The hermit shares a powerful secret that will aid you greatly on your quest.",
      success: "You gain useful wisdom and a sense of clarity about your journey.",
      failure: "The hermit speaks in riddles you can't decipher.",
      criticalFailure: "The hermit is annoyed by your intrusion and curses you with bad luck.",
    },
  },

  elf_patrol: {
    name: "Elven Patrol",
    icon: "\u{1F9DD}",
    encounterTier: "narrative",
    narrativeHook: "elven rangers watching from the forest",
    aiContext: "Silent figures emerge from the treeline - elven rangers in forest green cloaks. Their bows are drawn but not aimed. They watch with cautious curiosity, clearly guardians of this woodland realm.",
    description: "Silent elven rangers emerge from the treeline, bows drawn but not hostile - they wish to know your business.",
    difficulty: "medium",
    suggestedActions: [
      { label: "Explain Yourself", skill: "Persuasion", description: "State your purpose honestly" },
      { label: "Show Respect", skill: "Religion", description: "Honor their customs and traditions" },
      { label: "Offer Trade", skill: "Persuasion", description: "Propose a mutually beneficial exchange" },
      { label: "Stand Down", skill: null, description: "Lower weapons and cooperate" },
    ],
    rewards: { xp: 50, gold: "0", items: ["elven_rations:50%", "forest_map:30%", "elven_blessing:20%"] },
    consequences: {
      criticalSuccess: "The elves welcome you as friends and share valuable forest lore and supplies.",
      success: "The patrol lets you pass and offers directions through the forest.",
      failure: "The elves are suspicious but allow you through with a warning.",
      criticalFailure: "The elves escort you out of their territory, costing you time and dignity.",
    },
  },

  mysterious_stranger: {
    name: "Mysterious Stranger",
    icon: "\u{1F3AD}",
    encounterTier: "narrative",
    narrativeHook: "a cloaked stranger observing you from a distance",
    aiContext: "A mysterious hooded figure stands near the path, watching the party with interest. They don't appear hostile, but something about them seems significant. The stranger might have information, a quest, or hidden motives.",
    description: "A hooded figure watches from the shadows, their face obscured but their attention clearly fixed on you.",
    difficulty: "medium",
    suggestedActions: [
      { label: "Approach", skill: "Persuasion", description: "Greet the stranger openly" },
      { label: "Observe", skill: "Insight", description: "Study them from afar before deciding" },
      { label: "Ignore", skill: null, description: DESC_CONTINUE_ON_YOUR_WAY },
      { label: "Confront", skill: "Intimidation", description: "Demand to know why they're watching" },
    ],
    rewards: { xp: 40, gold: "1d12", items: ["quest_clue:60%", "mysterious_letter:30%", "enchanted_trinket:15%"] },
    consequences: {
      criticalSuccess: "The stranger reveals they've been searching for someone like you and offers a lucrative quest.",
      success: "You learn valuable information about the road ahead and potential opportunities.",
      failure: "The stranger is evasive and disappears before you can learn much.",
      criticalFailure: "The stranger was scouting for bandits - you barely avoid an ambush.",
    },
  },

  wounded_traveler: {
    name: "Wounded Traveler",
    icon: "\u{1FA79}",
    encounterTier: "narrative",
    narrativeHook: "someone lying injured beside the path",
    aiContext: "A wounded traveler is slumped against a tree, clutching their side. They appear to have been attacked recently. Blood stains their clothing. They might need help, or this could be a trap.",
    description: "An injured traveler lies by the roadside, groaning in pain and calling weakly for help.",
    difficulty: "easy",
    suggestedActions: [
      { label: "Help", skill: "Medicine", description: "Tend to their wounds" },
      { label: "Question", skill: "Insight", description: "Ask what happened while staying alert" },
      { label: "Search Area", skill: "Investigation", description: "Look for signs of attackers" },
      { label: "Leave", skill: null, description: "Walk away - it might be a trap" },
    ],
    rewards: { xp: 30, gold: "2d8", items: ["healing_potion:40%", "traveler_map:35%", "family_heirloom:20%"] },
    consequences: {
      criticalSuccess: "You save their life and they reward you with valuable information and a family treasure.",
      success: "You help the traveler and they share useful knowledge about the area.",
      failure: "Your aid is clumsy but the traveler survives and thanks you.",
      criticalFailure: "It was a trap! Bandits emerge, though you manage to fight them off.",
    },
  },

  hidden_treasure: {
    name: "Hidden Cache",
    icon: "\u{1F48E}",
    encounterTier: "narrative",
    narrativeHook: "a metallic glint catching the light among the bushes",
    aiContext: "Sharp eyes notice something unusual - a metallic gleam partially hidden in the vegetation. It could be treasure, a trap, or something left behind by previous travelers.",
    description: "Something glints in the undergrowth - metal or perhaps gemstones catching the sunlight.",
    difficulty: "easy",
    suggestedActions: [
      { label: "Investigate", skill: "Investigation", description: "Carefully examine the object" },
      { label: "Check for Traps", skill: "Perception", description: "Look for dangers before touching" },
      { label: "Dig Around", skill: "Athletics", description: "Excavate the area thoroughly" },
      { label: "Ignore", skill: null, description: "Keep moving - could be trouble" },
    ],
    rewards: { xp: 25, gold: "3d10", items: ["gemstone:50%", "gold_coins:60%", "magic_item:15%", "cursed_item:10%"] },
    consequences: {
      criticalSuccess: "You discover a hidden cache of treasure - gold, gems, and a magical item!",
      success: "You find a modest amount of coin and valuables.",
      failure: "The glint was just broken glass or worthless metal.",
      criticalFailure: "You trigger a trap protecting the cache and take damage.",
    },
  },

  distant_smoke: {
    name: "Distant Smoke",
    icon: "\u{1F4A8}",
    encounterTier: "narrative",
    narrativeHook: "a column of smoke rising in the distance",
    aiContext: "A thin column of smoke rises from beyond the next hill. It could be a campfire, a settlement, or something burning. The source is unclear but investigating might reveal something important.",
    description: "You notice smoke rising in the distance. Is it a campfire, a village, or something more sinister?",
    difficulty: "medium",
    suggestedActions: [
      { label: "Investigate", skill: "Survival", description: "Track the smoke to its source" },
      { label: "Approach Cautiously", skill: "Stealth", description: "Scout ahead quietly" },
      { label: "Observe from Distance", skill: "Perception", description: "Study the smoke pattern" },
      { label: "Avoid", skill: null, description: "Steer clear - not your problem" },
    ],
    rewards: { xp: 45, gold: "2d10", items: ["quest_clue:50%", "survivor_reward:30%", "salvaged_goods:40%"] },
    consequences: {
      criticalSuccess: "You discover survivors of an attack who reward you and share critical information.",
      success: "You find a campsite or small settlement and make useful contacts.",
      failure: "The smoke was from a controlled burn - nothing of interest.",
      criticalFailure: "You stumble into a bandit camp and must fight or flee.",
    },
  },

  // POI Encounters — Caves
  cave_entrance: { name: "Mysterious Cave", icon: "\u{1F573}\uFE0F", encounterTier: "narrative", poiType: "cave", narrativeHook: "a dark cave mouth yawning open in the hillside", aiContext: "A cave entrance beckons from the rocky terrain. Cold air drifts from within, carrying unfamiliar scents. The darkness inside could hide treasure, danger, or both.", description: "A cave entrance looms before you, dark and mysterious. Strange sounds echo from within.", difficulty: "medium", suggestedActions: [{ label: "Enter Cautiously", skill: "Stealth", description: "Slip inside quietly" }, { label: "Light Torch", skill: "Survival", description: "Illuminate before entering" }, { label: "Listen", skill: "Perception", description: "Try to hear what's inside" }, { label: "Pass By", skill: null, description: "Continue on your journey" }], rewards: { xp: 50, gold: "3d12", items: ["cave_mushrooms:60%", "raw_gems:40%", "ancient_artifact:15%"] }, consequences: { criticalSuccess: "You discover a hidden cache of treasure and valuable minerals.", success: "The cave offers shelter and you find useful supplies.", failure: "The cave is empty but provides brief respite.", criticalFailure: "You disturb sleeping creatures who attack!" } },

  cave_bats: { name: "Bat Swarm", icon: "\u{1F987}", encounterTier: "immediate", poiType: "cave", description: "A massive swarm of bats erupts from the cave, filling the air with leathery wings and piercing screeches!", difficulty: "easy", suggestedActions: [{ label: "Duck and Cover", skill: "Acrobatics", description: "Protect yourself from the swarm" }, { label: "Wait It Out", skill: "Constitution", description: "Endure the chaos" }, { label: "Run", skill: "Athletics", description: "Flee the swarm" }, { label: "Create Light", skill: "Arcana", description: "Use magic to scatter them" }], rewards: { xp: 20, gold: "0", items: ["bat_guano:70%", "cave_map:20%"] }, consequences: { criticalSuccess: "You avoid the swarm entirely and notice they fled from something deeper in.", success: "The bats pass quickly, leaving you unharmed.", failure: "You suffer minor scratches and bites from the panicked swarm.", criticalFailure: "The bats leave you disoriented and several follow, attracting predators." } },

  cave_spider_nest: { name: "Spider Nest", icon: "\u{1F577}\uFE0F", encounterTier: "immediate", poiType: "cave", description: "Thick webs coat the cave walls, and massive spiders descend from the darkness above!", difficulty: "hard", multiRound: true, enemyHP: 45, suggestedActions: [{ label: "Attack", skill: "Athletics", description: "Fight the spiders" }, { label: "Burn Webs", skill: "Survival", description: "Use fire to clear a path" }, { label: "Dodge", skill: "Acrobatics", description: "Evade their attacks" }, { label: "Retreat", skill: "Athletics", description: "Run back the way you came" }], rewards: { xp: 80, gold: "2d10", items: ["spider_silk:80%", "poison_vial:40%", "wrapped_corpse_loot:50%"] }, consequences: { criticalSuccess: "You defeat the spiders and find valuable silk and a wrapped corpse with treasure.", success: "You fight through the spiders and continue deeper.", failure: "You defeat the spiders but suffer venomous bites.", criticalFailure: "The spiders overwhelm you - you barely escape, poisoned and weakened." } },

  cave_underground_lake: { name: "Underground Lake", icon: "\u{1F30A}", encounterTier: "narrative", poiType: "cave", narrativeHook: "the sound of dripping water echoing from deep within", aiContext: "The cave opens into a vast underground chamber containing a still, dark lake. Phosphorescent fungi provide dim light. Something might lurk in the depths.", description: "A subterranean lake stretches before you, its dark waters reflecting strange glowing fungi.", difficulty: "medium", suggestedActions: [{ label: "Drink", skill: "Nature", description: "Test if the water is safe" }, { label: "Fish", skill: "Survival", description: "Try to catch cave fish" }, { label: "Swim Across", skill: "Athletics", description: "Reach the far shore" }, { label: "Skirt Around", skill: "Acrobatics", description: "Edge along the narrow shore" }], rewards: { xp: 40, gold: "1d20", items: ["glowing_fungi:70%", "cave_fish:60%", "pearl:25%", "drowned_treasure:20%"] }, consequences: { criticalSuccess: "You discover the lake hides drowned treasure from past explorers.", success: "The lake provides fresh water and useful fungi.", failure: "The water is too mineral-rich to drink safely.", criticalFailure: "Something in the lake grabs at you - you escape but lose equipment." } },

  cave_treasure_guardian: { name: "Treasure Guardian", icon: "\u{1F409}", encounterTier: "immediate", poiType: "cave", description: "A fearsome creature guards a hoard of treasure, awakening as you approach!", difficulty: "deadly", multiRound: true, enemyHP: 80, suggestedActions: [{ label: "Fight", skill: "Athletics", description: "Battle the guardian" }, { label: "Negotiate", skill: "Persuasion", description: "Try to reason with it" }, { label: "Distract", skill: "Deception", description: "Create a diversion to grab treasure" }, { label: "Flee", skill: "Athletics", description: "Run for your life" }], rewards: { xp: 150, gold: "10d20", items: ["rare_gem:70%", "magic_weapon:40%", "ancient_artifact:30%", "dragon_scale:20%"] }, consequences: { criticalSuccess: "You defeat the guardian and claim its entire hoard!", success: "You defeat the guardian after a fierce battle.", failure: "You grab some treasure but take heavy damage escaping.", criticalFailure: "The guardian drives you out, wounded and empty-handed." } },

  // POI Encounters — Ruins
  ruin_entrance: { name: "Ancient Ruins", icon: "\u{1F3DB}\uFE0F", encounterTier: "narrative", poiType: "ruins", narrativeHook: "crumbling stone pillars emerging from the overgrowth", aiContext: "Ancient ruins rise from the landscape, their original purpose lost to time. Weathered carvings hint at a forgotten civilization. The ruins might hold secrets, treasure, or lingering dangers.", description: "Moss-covered ruins stand before you, remnants of a civilization long forgotten.", difficulty: "medium", suggestedActions: [{ label: "Explore", skill: "Investigation", description: "Search the ruins thoroughly" }, { label: "Decipher", skill: "History", description: "Study the ancient carvings" }, { label: "Check for Traps", skill: "Perception", description: "Look for dangers" }, { label: "Move On", skill: null, description: "Continue your journey" }], rewards: { xp: 55, gold: "2d20", items: ["ancient_scroll:40%", "old_coins:60%", "artifact_fragment:30%"] }, consequences: { criticalSuccess: "You uncover a hidden chamber filled with ancient treasures.", success: "You find valuable artifacts and learn about the ancient civilization.", failure: "The ruins yield little of value.", criticalFailure: "You trigger an ancient trap and must escape quickly." } },

  ruin_ghost: { name: "Restless Spirit", icon: "\u{1F47B}", encounterTier: "immediate", poiType: "ruins", description: "A spectral figure materializes among the ruins, its hollow eyes fixing upon you!", difficulty: "hard", multiRound: true, enemyHP: 40, suggestedActions: [{ label: "Attack", skill: "Athletics", description: "Fight the spirit" }, { label: "Turn Undead", skill: "Religion", description: "Use holy power against it" }, { label: "Communicate", skill: "Persuasion", description: "Try to speak with the spirit" }, { label: "Flee", skill: "Athletics", description: "Run from the haunted place" }], rewards: { xp: 70, gold: "3d10", items: ["ectoplasm:50%", "ghostly_trinket:35%", "spirit_essence:20%"] }, consequences: { criticalSuccess: "The spirit shares ancient knowledge before departing peacefully.", success: "You defeat or calm the spirit.", failure: "The spirit curses you before fading, imposing a minor hex.", criticalFailure: "The spirit possesses a party member temporarily, causing chaos." } },

  ruin_treasure_vault: { name: "Hidden Vault", icon: "\u{1F5DD}\uFE0F", encounterTier: "narrative", poiType: "ruins", narrativeHook: "an ornate door half-buried in rubble", aiContext: "Behind fallen stones, an ornate door with ancient locks hints at a sealed vault. Whatever the ancients locked away might still be inside - treasure, knowledge, or something dangerous.", description: "A sealed vault door bears arcane symbols and complex locks, promising secrets within.", difficulty: "hard", suggestedActions: [{ label: "Pick Lock", skill: "Sleight of Hand", description: "Try to open the locks" }, { label: "Force Open", skill: "Athletics", description: "Break through the door" }, { label: "Dispel Magic", skill: "Arcana", description: "Remove magical protections" }, { label: "Leave It", skill: null, description: "The vault is too risky" }], rewards: { xp: 90, gold: "5d20", items: ["ancient_gold:80%", "magic_scroll:50%", "legendary_weapon:15%"] }, consequences: { criticalSuccess: "The vault opens to reveal untouched treasure from the ancient era.", success: "You access the vault and find valuable items.", failure: "The vault is mostly looted but you find a few coins.", criticalFailure: "Opening the vault releases a trapped creature!" } },

  ruin_cultists: { name: "Dark Ritual", icon: "\u{1F56F}\uFE0F", encounterTier: "immediate", poiType: "ruins", description: "Hooded figures chant around a glowing altar in the ruins - you've stumbled upon a dark ritual!", difficulty: "hard", multiRound: true, enemyHP: 60, suggestedActions: [{ label: "Attack", skill: "Athletics", description: "Interrupt the ritual by force" }, { label: "Sneak Away", skill: "Stealth", description: "Leave before being noticed" }, { label: "Disrupt Ritual", skill: "Arcana", description: "Counter the magic" }, { label: "Infiltrate", skill: "Deception", description: "Pretend to be a cultist" }], rewards: { xp: 100, gold: "4d12", items: ["ritual_dagger:60%", "dark_tome:40%", "cult_treasure:50%", "cursed_item:30%"] }, consequences: { criticalSuccess: "You stop the ritual and capture the cult leader for questioning.", success: "You defeat the cultists and prevent the ritual.", failure: "You defeat them but the ritual partially completes - something stirs.", criticalFailure: "The ritual completes - you must face what they summoned!" } },

  ruin_ancient_library: { name: "Forgotten Library", icon: "\u{1F4DA}", encounterTier: "narrative", poiType: "ruins", narrativeHook: "rows of dusty shelves visible through a collapsed wall", aiContext: "A partially intact library contains scrolls and tomes that have survived the ages. The knowledge here could be invaluable - magical formulae, historical secrets, or maps to hidden places.", description: "Ancient books and scrolls line crumbling shelves, their knowledge preserved through centuries.", difficulty: "easy", suggestedActions: [{ label: "Study", skill: "History", description: "Read the ancient texts" }, { label: "Search", skill: "Investigation", description: "Look for valuable tomes" }, { label: "Copy Spells", skill: "Arcana", description: "Transcribe magical formulae" }, { label: "Take Books", skill: null, description: "Grab what looks valuable" }], rewards: { xp: 45, gold: "1d10", items: ["spell_scroll:50%", "history_tome:60%", "treasure_map:25%", "forbidden_knowledge:15%"] }, consequences: { criticalSuccess: "You discover a complete spellbook and maps to other ruins.", success: "You gain useful knowledge and a few valuable scrolls.", failure: "Most texts are too damaged to read.", criticalFailure: "A guardian construct activates to protect the library!" } },

  // POI Encounters — Groves/Forests
  sacred_grove: { name: "Sacred Grove", icon: "\u{1F333}", encounterTier: "narrative", poiType: "grove", narrativeHook: "an ancient circle of trees radiating peaceful energy", aiContext: "A ring of ancient trees marks a sacred grove. The air feels charged with natural magic. Druids or forest spirits might dwell here, and the grove could offer healing or blessings.", description: "A circle of towering ancient trees surrounds a peaceful clearing, humming with natural magic.", difficulty: "easy", suggestedActions: [{ label: "Meditate", skill: "Religion", description: "Commune with nature spirits" }, { label: "Offer Gift", skill: "Nature", description: "Leave an offering" }, { label: "Rest", skill: null, description: "Take shelter in the grove" }, { label: "Harvest", skill: "Survival", description: "Gather rare herbs" }], rewards: { xp: 35, gold: "0", items: ["healing_herbs:70%", "nature_blessing:40%", "druid_token:25%", "rare_flower:35%"] }, consequences: { criticalSuccess: "The grove's guardian appears and grants you a powerful blessing.", success: "You feel refreshed and find useful herbs.", failure: "The grove offers rest but no special benefits.", criticalFailure: "You offend the forest spirits who curse your passage." } },

  dryad_encounter: { name: "Dryad Guardian", icon: "\u{1F9DA}", encounterTier: "narrative", poiType: "grove", narrativeHook: "a beautiful figure seeming to emerge from an ancient tree", aiContext: "A dryad, guardian of the grove, reveals herself. She might offer aid to those who respect the forest, or punish those who harm it. Her favor could open paths through the deepest woods.", description: "A beautiful spirit steps from an ancient oak, her form shifting between woman and tree.", difficulty: "medium", suggestedActions: [{ label: "Greet Respectfully", skill: "Persuasion", description: "Show proper respect" }, { label: "Offer Service", skill: "Nature", description: "Promise to help the forest" }, { label: "Ask for Aid", skill: "Persuasion", description: "Request her assistance" }, { label: "Back Away", skill: "Stealth", description: "Leave without disturbing her" }], rewards: { xp: 50, gold: "0", items: ["dryad_blessing:50%", "enchanted_seed:40%", "forest_map:60%", "nature_charm:30%"] }, consequences: { criticalSuccess: "The dryad marks you as a friend of the forest - all woodland creatures will aid you.", success: "The dryad shares forest secrets and safe paths.", failure: "The dryad is indifferent and lets you pass.", criticalFailure: "The dryad sees threat and entangles you in vines." } },

  forest_beast: { name: "Awakened Beast", icon: "\u{1F417}", encounterTier: "immediate", poiType: "grove", description: "A massive boar, its eyes glowing with unnatural intelligence, charges from the undergrowth!", difficulty: "hard", multiRound: true, enemyHP: 55, suggestedActions: [{ label: "Fight", skill: "Athletics", description: "Stand and fight" }, { label: "Calm", skill: SKILL_ANIMAL_HANDLING, description: "Try to pacify the beast" }, { label: "Dodge", skill: "Acrobatics", description: "Evade its charge" }, { label: "Climb", skill: "Athletics", description: "Get to the trees" }], rewards: { xp: 75, gold: "0", items: ["beast_hide:70%", "enchanted_tusk:40%", "primal_essence:25%"] }, consequences: { criticalSuccess: "You calm the beast and it becomes a temporary ally.", success: "You defeat or drive off the beast.", failure: "You escape but suffer injuries from its tusks.", criticalFailure: "The beast gores you badly before you escape." } },

  fairy_ring: { name: "Fairy Ring", icon: "\u{1F344}", encounterTier: "narrative", poiType: "grove", narrativeHook: "a perfect circle of mushrooms glowing softly in the twilight", aiContext: "A ring of luminescent mushrooms marks a fairy crossing. Stepping inside could transport you elsewhere, attract fey attention, or grant strange gifts - but fairy bargains are tricky.", description: "Glowing mushrooms form a perfect circle, the air within shimmering with otherworldly light.", difficulty: "medium", suggestedActions: [{ label: "Step Inside", skill: "Arcana", description: "Enter the fairy ring" }, { label: "Speak to Fey", skill: "Persuasion", description: "Call out to fairy folk" }, { label: "Harvest Mushrooms", skill: "Nature", description: "Gather the magical fungi" }, { label: "Avoid", skill: null, description: "Steer clear of fey magic" }], rewards: { xp: 60, gold: "2d20", items: ["fairy_dust:60%", "fey_charm:40%", "enchanted_mushroom:50%", "pixie_gold:30%"] }, consequences: { criticalSuccess: "Friendly fey grant you a wish or powerful boon.", success: "You gain fairy gifts and useful magical items.", failure: "The fey play tricks but cause no lasting harm.", criticalFailure: "You're transported elsewhere and must find your way back." } },

  // POI Encounters — Mountains
  mountain_pass: { name: "Treacherous Pass", icon: "\u{1F3D4}\uFE0F", encounterTier: "narrative", poiType: "mountain", narrativeHook: "a narrow path winding along a sheer cliff face", aiContext: "The mountain pass is narrow and dangerous, with sheer drops and loose rocks. One wrong step could be fatal, but it's the only way through the peaks.", description: "A narrow trail clings to the mountainside, with deadly drops on one side and unstable rocks above.", difficulty: "medium", suggestedActions: [{ label: "Proceed Carefully", skill: "Acrobatics", description: "Navigate with extreme care" }, { label: "Climb Above", skill: "Athletics", description: "Find a higher route" }, { label: "Scout Ahead", skill: "Perception", description: "Identify the safest path" }, { label: "Turn Back", skill: null, description: "Find another way" }], rewards: { xp: 45, gold: "0", items: ["mountain_crystal:50%", "eagle_feather:30%", "rare_ore:25%"] }, consequences: { criticalSuccess: "You find a hidden shortcut and rare mountain treasures.", success: "You cross safely and continue your journey.", failure: "The crossing is slow and exhausting.", criticalFailure: "A rockslide blocks the path - you must dig through or retreat." } },

  mountain_dragon: { name: "Dragon's Lair", icon: "\u{1F432}", encounterTier: "immediate", poiType: "mountain", description: "A dragon emerges from its mountain lair, ancient and terrible, demanding tribute or combat!", difficulty: "deadly", multiRound: true, enemyHP: 120, suggestedActions: [{ label: "Fight", skill: "Athletics", description: "Battle the dragon" }, { label: "Negotiate", skill: "Persuasion", description: "Offer tribute or service" }, { label: "Flee", skill: "Athletics", description: "Run for your lives" }, { label: "Riddle", skill: "Intelligence", description: "Challenge it to a battle of wits" }], rewards: { xp: 200, gold: "20d20", items: ["dragon_scale:80%", "dragon_gold:90%", "legendary_artifact:25%", "dragon_egg:5%"] }, consequences: { criticalSuccess: "You slay or outsmart the dragon and claim its hoard!", success: "You survive the encounter and escape with some treasure.", failure: "You escape with your lives but nothing else.", criticalFailure: "The dragon pursues you - lose equipment and take heavy damage." } },

  mountain_hermit_cave: { name: "Mountain Cave Hermit", icon: "\u{1F9D9}", encounterTier: "narrative", poiType: "mountain", narrativeHook: "smoke rising from a cave dwelling high on the mountainside", aiContext: "A hermit dwells in a mountain cave, having left civilization behind to seek wisdom or hide from their past. They might share knowledge, trade, or prefer to be left alone.", description: "An elderly hermit tends a fire outside their mountain cave, eyeing your approach with suspicion.", difficulty: "easy", suggestedActions: [{ label: "Greet Friendly", skill: "Persuasion", description: "Approach with respect" }, { label: "Offer Trade", skill: "Persuasion", description: "Propose an exchange" }, { label: "Ask for Wisdom", skill: "Insight", description: "Seek their knowledge" }, { label: "Leave Alone", skill: null, description: "Respect their solitude" }], rewards: { xp: 40, gold: "1d10", items: ["hermit_wisdom:60%", "mountain_herbs:50%", "old_map:35%", "enchanted_staff:15%"] }, consequences: { criticalSuccess: "The hermit was once a great wizard and teaches you powerful secrets.", success: "The hermit shares useful knowledge about the mountains.", failure: "The hermit is unfriendly but not hostile.", criticalFailure: "The hermit is paranoid and attacks, or their past catches up." } },

  mountain_eagle_nest: { name: "Giant Eagle Nest", icon: "\u{1F985}", encounterTier: "narrative", poiType: "mountain", narrativeHook: "massive feathers scattered on a high ledge", aiContext: "A giant eagle's nest sits on a high ledge, containing eggs or fledglings. The eagles are intelligent and might be befriended or could attack intruders.", description: "A massive nest of woven branches perches on a ledge, the screech of giant eagles echoing off the peaks.", difficulty: "medium", suggestedActions: [{ label: "Approach Slowly", skill: SKILL_ANIMAL_HANDLING, description: "Try to befriend the eagles" }, { label: "Offer Food", skill: "Survival", description: "Share your rations" }, { label: "Climb to Nest", skill: "Athletics", description: "Investigate the nest" }, { label: "Observe", skill: "Perception", description: "Watch from a safe distance" }], rewards: { xp: 55, gold: "0", items: ["giant_feather:80%", "eagle_blessing:30%", "mountain_view:50%", "eagle_ally:20%"] }, consequences: { criticalSuccess: "You befriend the eagles - they offer to carry you where you need to go.", success: "The eagles accept you and you gather valuable feathers.", failure: "The eagles tolerate your presence but nothing more.", criticalFailure: "The eagles attack to protect their nest!" } },

  // Environmental Encounters
  sudden_storm: { name: "Sudden Storm", icon: "\u26C8\uFE0F", encounterTier: "immediate", environmental: true, description: "Dark clouds gather with unnatural speed and a violent storm breaks overhead!", difficulty: "medium", suggestedActions: [{ label: "Find Shelter", skill: "Survival", description: "Locate cover quickly" }, { label: "Press On", skill: "Constitution", description: "Endure the storm" }, { label: "Make Camp", skill: "Survival", description: "Set up emergency shelter" }, { label: "Arcane Shield", skill: "Arcana", description: "Use magic for protection" }], rewards: { xp: 30, gold: "0", items: ["rainwater:70%", "storm_crystal:20%"] }, consequences: { criticalSuccess: "You find excellent shelter and the storm uncovers hidden treasures.", success: "You weather the storm with minimal difficulty.", failure: "The storm soaks your equipment and slows travel.", criticalFailure: "Lightning strikes nearby - you take damage and lose supplies." } },

  thick_fog: { name: "Unnatural Fog", icon: "\u{1F32B}\uFE0F", encounterTier: "narrative", environmental: true, narrativeHook: "a wall of thick fog rolling across the land", aiContext: "Dense fog blankets the area, reducing visibility to nearly nothing. Strange sounds echo through the mist. The fog might be natural, magical, or hiding something.", description: "Impenetrable fog rolls in, reducing visibility to mere feet. Strange sounds echo in the whiteness.", difficulty: "easy", suggestedActions: [{ label: "Navigate", skill: "Survival", description: "Try to maintain direction" }, { label: "Wait", skill: null, description: "Let the fog pass" }, { label: "Listen", skill: "Perception", description: "Identify sounds in the fog" }, { label: "Dispel", skill: "Arcana", description: "Clear the fog magically" }], rewards: { xp: 25, gold: "0", items: ["fog_essence:40%", "hidden_path:30%"] }, consequences: { criticalSuccess: "You navigate perfectly and find something hidden by the fog.", success: "You make it through without incident.", failure: "You get turned around and lose time.", criticalFailure: "You stumble into danger hidden by the fog." } },

  earthquake: { name: "Earthquake", icon: "\u{1F30B}", encounterTier: "immediate", environmental: true, description: "The ground shakes violently as an earthquake strikes!", difficulty: "hard", suggestedActions: [{ label: "Drop and Cover", skill: "Acrobatics", description: "Protect yourself from debris" }, { label: "Find Open Ground", skill: "Athletics", description: "Get away from structures" }, { label: "Stabilize Footing", skill: "Acrobatics", description: "Keep your balance" }, { label: "Help Others", skill: "Athletics", description: "Assist party members" }], rewards: { xp: 50, gold: "0", items: ["exposed_minerals:50%", "uncovered_ruins:25%", "fallen_treasure:30%"] }, consequences: { criticalSuccess: "You help everyone stay safe and the quake reveals something valuable.", success: "You weather the earthquake without injury.", failure: "You take minor injuries from falling debris.", criticalFailure: "You fall into a fissure and must be rescued." } },

  heat_wave: { name: "Scorching Heat", icon: "\u{1F525}", encounterTier: "narrative", environmental: true, narrativeHook: "the air shimmering with intense heat", aiContext: "An oppressive heat wave makes travel dangerous. Dehydration and heat exhaustion threaten the party. Finding water and shade becomes critical.", description: "The sun beats down mercilessly, the air so hot it shimmers. Every step is exhausting.", difficulty: "medium", suggestedActions: [{ label: "Find Water", skill: "Survival", description: "Search for a water source" }, { label: "Travel at Night", skill: "Survival", description: "Rest during the day" }, { label: "Create Shade", skill: "Survival", description: "Improvise sun protection" }, { label: "Push Through", skill: "Constitution", description: "Endure the heat" }], rewards: { xp: 30, gold: "0", items: ["survival_experience:60%", "desert_flower:30%"] }, consequences: { criticalSuccess: "You find an oasis with cool water and shade.", success: "You manage the heat effectively.", failure: "The heat saps your strength - travel is slower.", criticalFailure: "Someone collapses from heat exhaustion." } },

  strange_lights: { name: "Strange Lights", icon: "\u2728", encounterTier: "narrative", environmental: true, narrativeHook: "mysterious lights dancing on the horizon", aiContext: "Unexplained lights appear in the sky or floating above the ground. They could be will-o-wisps, magical phenomena, or signals from other travelers.", description: "Eerie lights dance in the distance, their colors shifting and their movement almost purposeful.", difficulty: "easy", suggestedActions: [{ label: "Follow", skill: "Survival", description: "Track the lights to their source" }, { label: "Study", skill: "Arcana", description: "Analyze the magical nature" }, { label: "Signal Back", skill: "Survival", description: "Try to communicate" }, { label: "Ignore", skill: null, description: DESC_CONTINUE_ON_YOUR_WAY }], rewards: { xp: 35, gold: "1d20", items: ["wisp_essence:40%", "magical_discovery:50%", "traveler_contact:30%"] }, consequences: { criticalSuccess: "The lights lead you to treasure or helpful allies.", success: "You discover the lights are a natural phenomenon and gain knowledge.", failure: "The lights lead nowhere interesting.", criticalFailure: "The lights were a trap - you're ambushed or lost." } },
};
