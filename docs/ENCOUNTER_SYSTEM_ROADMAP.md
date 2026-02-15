# Encounter System Roadmap

## Design Philosophy

**DungeonGPT is a storytelling-first application, not a traditional CRPG.** Encounters should enhance narrative flow, not interrupt it with rigid combat mechanics. The AI Dungeon Master narrates outcomes based on player choices and dice rolls, creating a theater-of-the-mind experience.

### Core Principles
- **AI narrates everything** - No combat grids or turn trackers
- **Player agency through choices** - Pick approach (fight/flee/negotiate), not just "Attack"
- **Dice create drama** - Existing skill check system resolves all encounters
- **Story consequences** - Outcomes affect narrative, reputation, resources
- **Character stats matter** - Modifiers influence success without feeling gamey

---

## Current State

### ✅ Implemented Features
- **EncounterModal UI** - Modal that displays when arriving at POIs
- **Automatic POI Detection** - Triggers when moving to tiles with points of interest
- **Town Entry System** - Full town interior generation with NPCs
- **Town Map Caching** - Deterministic town generation with persistent layouts
- **NPC Population** - Towns are populated with NPCs on first entry
- **Dice System** - D20 skill checks with advantage/disadvantage, critical success/failure
- **Character Stats Integration** - Modifiers calculated from character attributes
- **Encounter Data Structures** (Phase 1.1) - 10+ encounter templates in `encounters.js`
- **Encounter Resolution System** (Phase 1.2) - `encounterResolver.js` with AI narration, dice rolls, loot
- **Encounter Action Modal** (Phase 1.3) - Choice-driven UI in `EncounterActionModal.js`
- **Multi-Round Combat** - Round-by-round combat with morale, advantage, enemy HP tracking
- **HP System** - Player and enemy HP tracking, damage calculation, defeat states
- **Encounter Test Page** - `/encounter-test` for testing encounters in isolation

### ❌ Missing Features
- Two-tier narrative encounter system (Phase 2.4 - IN PROGRESS)
- AI prompt builder for narrative encounters
- Encounter engagement detection in chat
- Consequence tracking (injuries, reputation, time)
- Loot distribution through story
- Experience and progression
- Enhanced POI encounters (caves, ruins, etc.)

---

## Phase 1: AI-Driven Encounter Resolution (FOUNDATION) ✅ COMPLETED

### 1.1 Encounter Data Structures

**File:** `src/data/encounters.js`

Define encounter templates with narrative focus:
```javascript
export const encounterTemplates = {
  'goblin_ambush': {
    name: 'Goblin Ambush',
    icon: '👺',
    description: 'A band of goblins leaps from the undergrowth, weapons drawn!',
    difficulty: 'easy',
    suggestedActions: [
      { label: 'Fight', skill: 'Athletics', description: 'Charge into battle' },
      { label: 'Intimidate', skill: 'Intimidation', description: 'Scare them off' },
      { label: 'Flee', skill: 'Acrobatics', description: 'Run for it' },
      { label: 'Negotiate', skill: 'Persuasion', description: 'Try to talk them down' }
    ],
    rewards: { xp: 50, gold: '2d10', items: ['dagger:30%', 'healing_potion:20%'] },
    consequences: {
      criticalSuccess: 'The goblins flee in terror, dropping valuable loot.',
      success: 'You overcome the goblins with minimal injury.',
      failure: 'The goblins wound you before retreating.',
      criticalFailure: 'The ambush goes badly - you lose equipment and take serious injuries.'
    }
  },
  'wolf_pack': {
    name: 'Wolf Pack',
    icon: '🐺',
    description: 'Hungry wolves circle your party, growling menacingly.',
    difficulty: 'medium',
    suggestedActions: [
      { label: 'Fight', skill: 'Athletics', description: 'Defend against the pack' },
      { label: 'Scare Off', skill: 'Intimidation', description: 'Use fire or noise' },
      { label: 'Sneak Away', skill: 'Stealth', description: 'Slowly back away' },
      { label: 'Animal Handling', skill: 'Animal Handling', description: 'Calm the alpha' }
    ],
    rewards: { xp: 75, gold: '1d6', items: ['wolf_pelt:60%'] },
    consequences: {
      criticalSuccess: 'The alpha wolf respects your strength and the pack disperses.',
      success: 'You drive off the wolves without serious harm.',
      failure: 'The wolves bite before fleeing - you need medical attention.',
      criticalFailure: 'The pack overwhelms you, stealing supplies and leaving you wounded.'
    }
  }
  // ... more encounter templates
};
```

### 1.2 Encounter Resolution System

**File:** `src/utils/encounterResolver.js`

Core logic for AI-driven encounter resolution:
```javascript
import { llmService } from '../services/llmService';
import { rollCheck } from './dice';
import { calculateModifier } from './rules';

export const resolveEncounter = async (encounter, playerAction, character, settings) => {
  // 1. Determine relevant skill and modifier
  const action = encounter.suggestedActions.find(a => a.label === playerAction);
  const skill = action.skill;
  const statName = SKILLS[skill];
  const statValue = character.stats[statName] || 10;
  const modifier = calculateModifier(statValue);
  
  // 2. Roll the check
  const rollResult = rollCheck(modifier);
  
  // 3. Determine outcome tier
  let outcomeTier;
  if (rollResult.isCriticalSuccess) {
    outcomeTier = 'criticalSuccess';
  } else if (rollResult.isCriticalFailure) {
    outcomeTier = 'criticalFailure';
  } else if (rollResult.total >= getDC(encounter.difficulty)) {
    outcomeTier = 'success';
  } else {
    outcomeTier = 'failure';
  }
  
  // 4. Get base consequence
  const baseConsequence = encounter.consequences[outcomeTier];
  
  // 5. Generate AI narration
  const prompt = buildEncounterPrompt(encounter, playerAction, rollResult, outcomeTier, baseConsequence, settings);
  const aiNarration = await llmService.generateResponse(prompt, {
    temperature: 0.8,
    maxTokens: 200
  });
  
  // 6. Apply rewards/penalties
  const outcome = applyConsequences(outcomeTier, encounter.rewards, character);
  
  return {
    narration: aiNarration,
    rollResult,
    outcomeTier,
    rewards: outcome.rewards,
    penalties: outcome.penalties
  };
};

const buildEncounterPrompt = (encounter, action, rollResult, tier, baseConsequence, settings) => {
  return `
You are the Dungeon Master for a ${settings.grimnessLevel} ${settings.darknessLevel} fantasy adventure.

ENCOUNTER: ${encounter.description}
PLAYER ACTION: ${action}
DICE ROLL: ${rollResult.total} (d20: ${rollResult.naturalRoll} + modifier: ${rollResult.modifier})
OUTCOME: ${tier.toUpperCase()}
${rollResult.isCriticalSuccess ? '⚡ CRITICAL SUCCESS!' : ''}
${rollResult.isCriticalFailure ? '💀 CRITICAL FAILURE!' : ''}

Base Consequence: ${baseConsequence}

Narrate this outcome in 2-3 vivid sentences. Make it dramatic and fitting for the ${settings.responseVerbosity} verbosity level. Include sensory details and emotional impact.
  `.trim();
};

const getDC = (difficulty) => {
  const dcTable = {
    'trivial': 5,
    'easy': 10,
    'medium': 15,
    'hard': 20,
    'deadly': 25
  };
  return dcTable[difficulty] || 15;
};
```

### 1.3 Encounter Action Modal

**File:** `src/components/EncounterActionModal.js`

Replace combat UI with choice-driven interface:
```javascript
const EncounterActionModal = ({ encounter, character, onResolve, onClose }) => {
  const [selectedAction, setSelectedAction] = useState(null);
  const [isResolving, setIsResolving] = useState(false);
  const [result, setResult] = useState(null);
  
  const handleAction = async (action) => {
    setSelectedAction(action);
    setIsResolving(true);
    
    const outcome = await resolveEncounter(encounter, action.label, character, settings);
    setResult(outcome);
    setIsResolving(false);
  };
  
  return (
    <div className="modal-overlay">
      <div className="modal-content encounter-action-modal">
        {!result ? (
          // Show encounter description and action choices
          <>
            <div className="encounter-header">
              <span className="encounter-icon">{encounter.icon}</span>
              <h2>{encounter.name}</h2>
            </div>
            <p className="encounter-description">{encounter.description}</p>
            
            <div className="encounter-actions">
              <h3>What do you do?</h3>
              {encounter.suggestedActions.map(action => (
                <button
                  key={action.label}
                  className="action-button"
                  onClick={() => handleAction(action)}
                  disabled={isResolving}
                >
                  <strong>{action.label}</strong>
                  <span className="action-skill">({action.skill} check)</span>
                  <p className="action-description">{action.description}</p>
                </button>
              ))}
            </div>
          </>
        ) : (
          // Show resolution and outcome
          <>
            <div className="encounter-result">
              <h3>Outcome: {result.outcomeTier}</h3>
              <div className="dice-result">
                🎲 Rolled: {result.rollResult.total} 
                ({result.rollResult.naturalRoll} + {result.rollResult.modifier})
              </div>
              <div className="ai-narration">
                {result.narration}
              </div>
              {result.rewards && (
                <div className="rewards">
                  <h4>Rewards:</h4>
                  <ul>
                    {result.rewards.xp && <li>+{result.rewards.xp} XP</li>}
                    {result.rewards.gold && <li>+{result.rewards.gold} gold</li>}
                    {result.rewards.items?.map(item => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              )}
              {result.penalties && (
                <div className="penalties">
                  <h4>Consequences:</h4>
                  <ul>
                    {result.penalties.map(p => <li key={p}>{p}</li>)}
                  </ul>
                </div>
              )}
            </div>
            <button onClick={() => onResolve(result)}>Continue</button>
          </>
        )}
      </div>
    </div>
  );
};
```

---

## Phase 2: Random Encounter Generation

### 2.1 Biome-Specific Encounter Tables

**File:** `src/data/encounterTables.js`

Define weighted encounter tables by biome:
```javascript
export const encounterTables = {
  'plains': [
    { template: 'goblin_ambush', weight: 25 },
    { template: 'wolf_pack', weight: 20 },
    { template: 'bandit_roadblock', weight: 20 },
    { template: 'traveling_merchant', weight: 15, hostile: false },
    { template: 'wandering_minstrel', weight: 10, hostile: false },
    { template: 'none', weight: 10 }
  ],
  'forest': [
    { template: 'giant_spiders', weight: 25 },
    { template: 'bear_encounter', weight: 20 },
    { template: 'elf_patrol', weight: 15, hostile: false },
    { template: 'druid_circle', weight: 10, hostile: false },
    { template: 'treant_guardian', weight: 5 },
    { template: 'none', weight: 25 }
  ],
  'mountain': [
    { template: 'orc_raiders', weight: 30 },
    { template: 'rockslide', weight: 20, environmental: true },
    { template: 'hermit_monk', weight: 15, hostile: false },
    { template: 'wyvern_nest', weight: 10 },
    { template: 'dragon_lair', weight: 3, boss: true },
    { template: 'none', weight: 22 }
  ],
  'desert': [
    { template: 'scorpion_swarm', weight: 25 },
    { template: 'sandstorm', weight: 20, environmental: true },
    { template: 'nomad_caravan', weight: 20, hostile: false },
    { template: 'mummy_tomb', weight: 10 },
    { template: 'none', weight: 25 }
  ]
  // ... more biomes
};
```

### 2.2 Encounter Generation Logic

**File:** `src/utils/encounterGenerator.js`

```javascript
import { encounterTables } from '../data/encounterTables';
import { encounterTemplates } from '../data/encounters';
import { rollDice } from './dice';

export const rollRandomEncounter = (biome, settings) => {
  const table = encounterTables[biome] || encounterTables['plains'];
  const roll = weightedRandom(table);
  
  if (roll.template === 'none') return null;
  
  // Get the encounter template
  const template = encounterTemplates[roll.template];
  
  // Optionally modify based on campaign settings
  const modifiedEncounter = applySettingsModifiers(template, settings);
  
  return {
    ...modifiedEncounter,
    isHostile: roll.hostile !== false,
    isEnvironmental: roll.environmental || false,
    isBoss: roll.boss || false
  };
};

export const checkForEncounter = (biome, travelDistance, lastEncounterDistance, settings) => {
  // Base encounter chance varies by grimness
  const grimnessModifier = {
    'Noble': 0.10,
    'Gritty': 0.15,
    'Dark': 0.20,
    'Grimdark': 0.25
  };
  
  const baseChance = grimnessModifier[settings.grimnessLevel] || 0.15;
  
  // Increase chance with distance since last encounter
  const distanceSinceEncounter = travelDistance - lastEncounterDistance;
  const distanceModifier = Math.min(distanceSinceEncounter * 0.03, 0.20);
  
  const encounterChance = baseChance + distanceModifier;
  
  return Math.random() < encounterChance;
};

const weightedRandom = (table) => {
  const totalWeight = table.reduce((sum, entry) => sum + entry.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const entry of table) {
    random -= entry.weight;
    if (random <= 0) return entry;
  }
  
  return table[table.length - 1];
};

const applySettingsModifiers = (template, settings) => {
  // Modify encounter based on darkness/grimness levels
  const modified = { ...template };
  
  // Darker campaigns have harsher consequences
  if (settings.darknessLevel === 'Grim' || settings.darknessLevel === 'Dark') {
    modified.consequences.failure = makeConsequenceHarsher(template.consequences.failure);
    modified.consequences.criticalFailure = makeConsequenceHarsher(template.consequences.criticalFailure);
  }
  
  // Adjust difficulty based on grimness
  if (settings.grimnessLevel === 'Grimdark') {
    modified.difficulty = increaseDifficulty(template.difficulty);
  }
  
  return modified;
};
```

### 2.3 Integration with Movement

**Modify:** `src/pages/Game.js` in `handleMove` function

Add encounter check after movement:
```javascript
// After successful move
const biome = targetTile.biome;

// Track distance traveled
const distanceTraveled = Math.abs(newX - playerPosition.x) + Math.abs(newY - playerPosition.y);
setTotalDistanceTraveled(prev => prev + distanceTraveled);

// Check for random encounter (only if not on a POI)
if (!targetTile.poi) {
  const shouldEncounter = checkForEncounter(
    biome, 
    totalDistanceTraveled, 
    lastEncounterDistance,
    settings
  );
  
  if (shouldEncounter) {
    const encounter = rollRandomEncounter(biome, settings);
    if (encounter) {
      setCurrentEncounter(encounter);
      setIsEncounterActionModalOpen(true);
      setLastEncounterDistance(totalDistanceTraveled);
    }
  }
}
```

### 2.4 Narrative Encounters (AI-Integrated)

**Goal:** Resolve the conflict between AI movement prompts and immediate encounter popups by creating a two-tier encounter system.

**Problem:** Currently, when a player moves to a new tile:
1. AI receives a prompt to describe the new location
2. Encounter check may trigger a modal popup
3. These compete for attention and break narrative flow

**Solution:** Distinguish between **immediate action encounters** (combat-focused, urgent) and **narrative encounters** (discovered through conversation).

#### Encounter Tier System

**File:** `src/data/encounters.js`

Add `encounterTier` property to all encounter templates:

```javascript
// IMMEDIATE TIER - Pops up modal, suppresses AI movement prompt
'goblin_ambush': {
  name: 'Goblin Ambush',
  encounterTier: 'immediate',  // NEW PROPERTY
  icon: '👺',
  description: 'A band of goblins leaps from the undergrowth!',
  // ... rest of encounter
},

'bandit_roadblock': {
  name: 'Bandit Roadblock',
  encounterTier: 'immediate',
  icon: '⚔️',
  description: 'Armed bandits block the road ahead, weapons drawn.',
  // ... rest of encounter
},

// NARRATIVE TIER - Revealed through AI conversation
'mysterious_stranger': {
  name: 'Mysterious Stranger',
  encounterTier: 'narrative',  // NEW PROPERTY
  icon: '🎭',
  description: 'A hooded figure watches from the shadows.',
  narrativeHook: 'a cloaked stranger observing you from a distance',  // NEW PROPERTY
  aiContext: `
    A mysterious hooded figure stands near the path, watching the party with interest.
    They don't appear hostile, but something about them seems significant.
    The stranger might have information, a quest, or hidden motives.
  `,  // NEW PROPERTY
  // Can still have suggestedActions if player engages
  suggestedActions: [
    { label: 'Approach', skill: 'Persuasion', description: 'Greet the stranger' },
    { label: 'Observe', skill: 'Insight', description: 'Study them from afar' },
    { label: 'Ignore', skill: null, description: 'Continue on your way' }
  ],
  // ... rest of encounter
},

'wounded_traveler': {
  name: 'Wounded Traveler',
  encounterTier: 'narrative',
  icon: '🩹',
  description: 'An injured traveler lies by the roadside.',
  narrativeHook: 'someone lying injured beside the path',
  aiContext: `
    A wounded traveler is slumped against a tree, clutching their side.
    They appear to have been attacked recently. Blood stains their clothing.
    They might need help, or this could be a trap.
  `,
  suggestedActions: [
    { label: 'Help', skill: 'Medicine', description: 'Tend to their wounds' },
    { label: 'Question', skill: 'Insight', description: 'Ask what happened' },
    { label: 'Search Area', skill: 'Investigation', description: 'Look for attackers' },
    { label: 'Leave', skill: null, description: 'Walk away' }
  ],
  // ... rest of encounter
},

'hidden_treasure': {
  name: 'Hidden Cache',
  encounterTier: 'narrative',
  icon: '💎',
  description: 'Something glints in the undergrowth.',
  narrativeHook: 'a metallic glint catching the light among the bushes',
  aiContext: `
    Sharp eyes notice something unusual - a metallic gleam partially hidden in the vegetation.
    It could be treasure, a trap, or something left behind by previous travelers.
  `,
  suggestedActions: [
    { label: 'Investigate', skill: 'Investigation', description: 'Examine the object' },
    { label: 'Check for Traps', skill: 'Perception', description: 'Look for dangers' },
    { label: 'Ignore', skill: null, description: 'Keep moving' }
  ],
  // ... rest of encounter
}
```

#### Modified Encounter Tables

**File:** `src/data/encounterTables.js`

Update encounter tables to include both tiers:

```javascript
export const encounterTables = {
  'plains': [
    // Immediate encounters (combat/urgent)
    { template: 'goblin_ambush', weight: 15, tier: 'immediate' },
    { template: 'wolf_pack', weight: 12, tier: 'immediate' },
    { template: 'bandit_roadblock', weight: 10, tier: 'immediate' },
    
    // Narrative encounters (discovered through conversation)
    { template: 'mysterious_stranger', weight: 8, tier: 'narrative' },
    { template: 'wounded_traveler', weight: 8, tier: 'narrative' },
    { template: 'traveling_merchant', weight: 10, tier: 'narrative' },
    { template: 'hidden_treasure', weight: 5, tier: 'narrative' },
    { template: 'distant_smoke', weight: 7, tier: 'narrative' },
    
    { template: 'none', weight: 25 }
  ],
  // ... other biomes
};

// Encounter frequency by tier
export const encounterFrequency = {
  immediate: {
    baseChance: 0.25,      // 25% base for combat encounters
    revisitMultiplier: 0.3  // Much lower on revisited tiles
  },
  narrative: {
    baseChance: 0.35,      // 35% base for narrative encounters
    revisitMultiplier: 0.5  // Still fairly common on revisits
  }
};
```

#### Updated Movement Integration

**File:** `src/pages/Game.js`

Modify `handleMoveOnWorldMap` to handle both encounter tiers:

```javascript
const handleMoveOnWorldMap = async (clickedX, clickedY) => {
  // ... existing movement validation ...

  // Check for encounter
  const randomEncounter = checkForEncounter(targetTile, isFirstVisitToTile, settings, movesSinceEncounter);
  
  if (randomEncounter) {
    if (randomEncounter.encounterTier === 'immediate') {
      // IMMEDIATE: Show modal, suppress AI prompt
      setActionEncounter(randomEncounter);
      setIsActionEncounterOpen(true);
      setMovesSinceEncounter(0);
      return; // Exit early - no AI movement prompt
      
    } else if (randomEncounter.encounterTier === 'narrative') {
      // NARRATIVE: Inject into AI context, let AI reveal naturally
      const encounterContext = {
        type: 'narrative_encounter',
        encounter: randomEncounter,
        hook: randomEncounter.narrativeHook,
        aiContext: randomEncounter.aiContext
      };
      
      // Store for AI prompt injection
      setNarrativeEncounter(encounterContext);
      setMovesSinceEncounter(0);
      
      // Continue to AI movement prompt with encounter context
    }
  } else {
    setMovesSinceEncounter(prev => prev + 1);
  }

  // Build AI prompt with optional narrative encounter context
  const movementPrompt = buildMovementPrompt(
    targetTile, 
    settings, 
    narrativeEncounter  // May be null
  );
  
  // Send to AI
  await interactionHook.sendMessage(movementPrompt);
};
```

#### AI Prompt Builder

**File:** `src/utils/promptBuilder.js` (new or existing)

```javascript
export const buildMovementPrompt = (tile, settings, narrativeEncounter = null) => {
  const biomeDescription = getBiomeDescription(tile.biome);
  
  let prompt = `
The party moves to a new location: ${biomeDescription}

Coordinates: (${tile.x}, ${tile.y})
Biome: ${tile.biome}
  `.trim();

  // Inject narrative encounter if present
  if (narrativeEncounter) {
    prompt += `\n\n**IMPORTANT - Encounter Hook:**\n${narrativeEncounter.aiContext}\n`;
    prompt += `\nWeave this discovery naturally into your description. `;
    prompt += `The players can choose to engage with it through conversation or ignore it.`;
  }

  prompt += `\n\nDescribe what the party sees and experiences. Keep it brief (2-3 sentences).`;
  
  return prompt;
};
```

#### Player Engagement with Narrative Encounters

When the AI reveals a narrative encounter, players can:
1. **Ask about it in chat** - "I approach the stranger" → AI narrates, then can trigger `EncounterActionModal` if appropriate
2. **Ignore it** - Continue conversation normally
3. **Use a command** - `/engage encounter` to explicitly trigger the modal

**File:** `src/hooks/useGameInteraction.js`

Add detection for encounter engagement:

```javascript
// In message processing
if (narrativeEncounter && messageContainsEngagement(userMessage, narrativeEncounter)) {
  // Player is engaging with the narrative encounter
  // Trigger the action modal
  setActionEncounter(narrativeEncounter.encounter);
  setIsActionEncounterOpen(true);
  setNarrativeEncounter(null); // Clear it
}

const messageContainsEngagement = (message, encounter) => {
  const engagementKeywords = [
    'approach', 'investigate', 'talk to', 'examine', 
    'help', 'attack', 'engage', 'interact'
  ];
  const messageLower = message.toLowerCase();
  const hookLower = encounter.hook.toLowerCase();
  
  // Check if message references the encounter and includes action keyword
  return engagementKeywords.some(keyword => messageLower.includes(keyword)) &&
         (messageLower.includes(hookLower) || messageLower.includes('stranger') || 
          messageLower.includes('traveler') || messageLower.includes('treasure'));
};
```

#### Benefits of Two-Tier System

1. **No Narrative Conflict** - Immediate encounters suppress AI prompt; narrative encounters enhance it
2. **Player Agency** - Players can choose whether to engage with narrative encounters
3. **Richer Storytelling** - AI can naturally weave discoveries into descriptions
4. **Varied Pacing** - Combat encounters are urgent; narrative encounters allow exploration
5. **Replayability** - Same tile might have different narrative encounters on different playthroughs

#### Example Flow

**Immediate Encounter:**
```
Player clicks tile → Encounter check → Goblin Ambush (immediate)
→ EncounterActionModal pops up immediately
→ No AI movement prompt sent
→ Player resolves encounter → Returns to game
```

**Narrative Encounter:**
```
Player clicks tile → Encounter check → Mysterious Stranger (narrative)
→ AI receives enhanced prompt with encounter context
→ AI: "As you crest the hill, you notice a hooded figure watching you from beneath an old oak tree..."
→ Player: "I approach the stranger"
→ EncounterActionModal opens with stranger encounter
→ Player chooses action → Resolves encounter
```

**No Encounter:**
```
Player clicks tile → No encounter
→ AI receives normal movement prompt
→ AI: "The plains stretch endlessly before you. Tall grass sways in the breeze..."
```

---

## Phase 3: Enhanced POI Encounters

### 3.1 Cave Encounters

**File:** `src/data/encounters.js` (add to encounterTemplates)

```javascript
'cave_exploration': {
  name: 'Dark Cave',
  icon: '🕳️',
  description: 'A yawning cave entrance beckons. Strange sounds echo from within.',
  difficulty: 'medium',
  suggestedActions: [
    { label: 'Explore Carefully', skill: 'Perception', description: 'Search for treasure and dangers' },
    { label: 'Light Torch', skill: 'Survival', description: 'Illuminate the darkness' },
    { label: 'Listen First', skill: 'Perception', description: 'Detect what lurks inside' },
    { label: 'Leave', skill: null, description: 'Continue your journey' }
  ],
  rewards: { xp: 100, gold: '3d20', items: ['gemstone:40%', 'ancient_artifact:10%'] },
  consequences: {
    criticalSuccess: 'You discover a hidden chamber filled with forgotten treasures and ancient knowledge.',
    success: 'You navigate the cave safely and find valuable resources.',
    failure: 'You stumble in the darkness, alerting cave dwellers to your presence.',
    criticalFailure: 'A cave-in traps you temporarily, and hostile creatures close in.'
  }
}
```

**Narrative Focus:** Caves are **story moments** where AI describes:
- What the heroes find (treasure, clues, NPCs)
- Environmental challenges (darkness, tight passages, water)
- Atmospheric details (dripping water, bat colonies, ancient carvings)

### 3.2 Ruins Encounters

```javascript
'ancient_ruins': {
  name: 'Ancient Ruins',
  icon: '🏛️',
  description: 'Crumbling stone pillars mark the remains of a forgotten civilization.',
  difficulty: 'medium',
  suggestedActions: [
    { label: 'Search for Artifacts', skill: 'Investigation', description: 'Look for valuable relics' },
    { label: 'Read Inscriptions', skill: 'Arcana', description: 'Decipher ancient writings' },
    { label: 'Check for Traps', skill: 'Perception', description: 'Proceed cautiously' },
    { label: 'Commune with Spirits', skill: 'Religion', description: 'Seek guidance from the past' }
  ],
  rewards: { xp: 150, gold: '2d20', items: ['ancient_scroll:50%', 'magic_item:20%', 'historical_artifact:30%'] },
  consequences: {
    criticalSuccess: 'You uncover a legendary artifact and learn crucial lore about your quest.',
    success: 'You find valuable relics and piece together the history of this place.',
    failure: 'You trigger a magical ward, suffering minor injuries but escaping with some findings.',
    criticalFailure: 'Ancient guardians awaken, forcing you to flee empty-handed and wounded.'
  }
}
```

**Narrative Focus:** Ruins provide **lore and world-building**:
- Historical context for the campaign
- Clues about milestones or the main quest
- Magical or cursed items with backstories
- Encounters with undead or constructs (resolved through skill checks)

### 3.3 Forest Grove Encounters

```javascript
'sacred_grove': {
  name: 'Sacred Grove',
  icon: '🌳',
  description: 'Ancient trees form a natural cathedral. The air hums with primal magic.',
  difficulty: 'easy',
  suggestedActions: [
    { label: 'Meditate', skill: 'Religion', description: 'Seek nature\'s blessing' },
    { label: 'Gather Herbs', skill: 'Nature', description: 'Collect rare plants' },
    { label: 'Speak to Fey', skill: 'Persuasion', description: 'Negotiate with forest spirits' },
    { label: 'Offer Tribute', skill: 'Religion', description: 'Honor the grove\'s guardians' }
  ],
  rewards: { xp: 75, gold: '1d10', items: ['healing_herbs:80%', 'fey_blessing:30%', 'nature_companion:10%'] },
  consequences: {
    criticalSuccess: 'The grove\'s guardian grants you a powerful blessing and a loyal companion.',
    success: 'You receive healing herbs and the forest\'s favor.',
    failure: 'The fey are offended but allow you to leave unharmed.',
    criticalFailure: 'You anger the grove\'s spirits, who curse you with misfortune.'
  }
}
```

**Narrative Focus:** Groves are **peaceful encounters** that offer:
- Healing and rest
- Magical blessings or curses
- Fey NPCs with quests or information
- Moral choices (respect nature vs. exploit resources)

### 3.4 Mountain Peak Encounters

```javascript
'mountain_shrine': {
  name: 'Mountain Shrine',
  icon: '⛰️',
  description: 'A weathered shrine stands at the peak, offering a breathtaking view of the lands below.',
  difficulty: 'medium',
  suggestedActions: [
    { label: 'Pray at Shrine', skill: 'Religion', description: 'Seek divine guidance' },
    { label: 'Survey the Land', skill: 'Perception', description: 'Gain strategic knowledge' },
    { label: 'Meet the Hermit', skill: 'Persuasion', description: 'Speak with the mountain sage' },
    { label: 'Brave the Elements', skill: 'Survival', description: 'Endure the harsh conditions' }
  ],
  rewards: { xp: 100, gold: '1d20', items: ['divine_blessing:40%', 'map_fragment:30%', 'rare_herb:50%'] },
  consequences: {
    criticalSuccess: 'The hermit shares profound wisdom and reveals a shortcut to your destination.',
    success: 'You gain clarity about your quest and valuable supplies.',
    failure: 'The harsh weather forces you to retreat, but you glimpse something important.',
    criticalFailure: 'A storm strikes, injuring your party and destroying supplies.'
  }
}
```

**Narrative Focus:** Mountain encounters provide:
- Strategic information (map reveals, enemy locations)
- Wise NPCs (hermits, monks, oracles)
- Environmental challenges (altitude, cold, storms)
- Spiritual or philosophical moments

---

## Phase 4: Rewards and Progression

### 4.1 Experience System

**File:** `src/hooks/useExperience.js`

Track XP and leveling:
```javascript
const useExperience = (heroes) => {
  const [heroXP, setHeroXP] = useState({});
  const [heroLevels, setHeroLevels] = useState({});
  
  const awardXP = (heroId, amount) => {
    // Add XP, check for level up
    // Trigger level up modal if needed
  };
  
  const levelUp = (heroId) => {
    // Increase stats
    // Learn new abilities
    // Show celebration
  };
  
  return { awardXP, levelUp, heroXP, heroLevels };
};
```

### 4.2 Inventory System

**File:** `src/hooks/useInventory.js`

Manage party inventory:
```javascript
const useInventory = () => {
  const [inventory, setInventory] = useState({
    gold: 0,
    items: [],
    equipment: {}
  });
  
  const addItem = (item, quantity) => { /* ... */ };
  const removeItem = (itemId, quantity) => { /* ... */ };
  const equipItem = (heroId, item, slot) => { /* ... */ };
  const useItem = (itemId, target) => { /* ... */ };
  
  return { inventory, addItem, removeItem, equipItem, useItem };
};
```

### 4.3 Loot Distribution Through Story

**File:** `src/utils/lootGenerator.js`

```javascript
export const generateLoot = (rewards, rollResult) => {
  const loot = { gold: 0, items: [], xp: rewards.xp || 0 };
  
  // Gold rewards (roll dice formula)
  if (rewards.gold) {
    const goldRoll = parseDiceFormula(rewards.gold);
    loot.gold = rollDice(goldRoll.count, goldRoll.sides).total;
  }
  
  // Item rewards (percentage chance)
  if (rewards.items) {
    for (const itemEntry of rewards.items) {
      const [itemName, chanceStr] = itemEntry.split(':');
      const chance = parseInt(chanceStr) / 100;
      
      // Critical success increases loot chance
      const adjustedChance = rollResult.isCriticalSuccess ? Math.min(chance * 1.5, 1.0) : chance;
      
      if (Math.random() < adjustedChance) {
        loot.items.push(itemName);
      }
    }
  }
  
  return loot;
};

export const narrateLootAcquisition = async (loot, encounter, settings) => {
  // AI narrates how the loot is found
  const prompt = `
Describe how the heroes acquire these rewards after ${encounter.name}:
- ${loot.gold} gold pieces
- Items: ${loot.items.join(', ') || 'none'}

Narrate in 1-2 sentences, fitting the ${settings.responseVerbosity} style.
  `.trim();
  
  return await llmService.generateResponse(prompt, { temperature: 0.7, maxTokens: 100 });
};
```

---

## Phase 5: Advanced AI Integration

### 5.1 Dynamic Encounter Variation

**Goal:** Make repeated encounter templates feel unique through AI variation.

**Implementation:**
```javascript
export const varyEncounterDescription = async (template, biome, settings) => {
  const prompt = `
Base encounter: ${template.description}
Biome: ${biome}
Tone: ${settings.grimnessLevel}, ${settings.darknessLevel}

Rewrite this encounter description with fresh details. Keep it 1-2 sentences. Make it vivid and unique.
  `.trim();
  
  const variedDescription = await llmService.generateResponse(prompt, {
    temperature: 0.9,
    maxTokens: 100
  });
  
  return { ...template, description: variedDescription };
};
```

### 5.2 NPC Dialogue in Non-Hostile Encounters

**For merchants, travelers, quest-givers:**
```javascript
export const generateNPCDialogue = async (encounter, context, settings) => {
  const prompt = `
You are a ${encounter.npcType} in a ${settings.grimnessLevel} fantasy world.
Location: ${context.currentLocation}
Party: ${context.heroes.map(h => h.characterName).join(', ')}

Generate 2-3 lines of dialogue. Include:
1. Greeting
2. Offer or information
3. Personality quirk

Style: ${settings.responseVerbosity}
  `.trim();
  
  return await llmService.generateResponse(prompt, { temperature: 0.8 });
};
```

### 5.3 Consequence Tracking and Callbacks

**Track encounter outcomes to influence future events:**
```javascript
// In Game.js or useGameSession
const [encounterHistory, setEncounterHistory] = useState([]);

const recordEncounter = (encounter, outcome) => {
  setEncounterHistory(prev => [...prev, {
    name: encounter.name,
    outcome: outcome.outcomeTier,
    timestamp: Date.now(),
    consequences: outcome.penalties || []
  }]);
};

// Later encounters reference history
const buildContextualPrompt = (encounter, history) => {
  const recentFailures = history.filter(e => 
    e.outcome === 'failure' || e.outcome === 'criticalFailure'
  ).slice(-3);
  
  if (recentFailures.length >= 2) {
    return `
The party is wounded and demoralized from recent setbacks: ${recentFailures.map(e => e.name).join(', ')}.

${encounter.description}

Narrate this encounter with awareness of their weakened state.
    `.trim();
  }
  
  return encounter.description;
};
```

### 5.4 Reputation and Faction System

**Track how encounter choices affect world state:**
```javascript
const [reputation, setReputation] = useState({
  'Silver Guard': 0,
  'Goblin Tribes': 0,
  'Merchant Guild': 0,
  'Nature Spirits': 0
});

const applyReputationChange = (encounter, outcome) => {
  if (encounter.affectedFactions) {
    const changes = encounter.affectedFactions[outcome.outcomeTier];
    setReputation(prev => {
      const updated = { ...prev };
      for (const [faction, delta] of Object.entries(changes)) {
        updated[faction] = (updated[faction] || 0) + delta;
      }
      return updated;
    });
  }
};

// Example encounter with faction impact
'bandit_roadblock': {
  // ... other properties
  affectedFactions: {
    criticalSuccess: { 'Merchant Guild': +2, 'Bandit Clans': -2 },
    success: { 'Merchant Guild': +1, 'Bandit Clans': -1 },
    failure: { 'Merchant Guild': -1 },
    criticalFailure: { 'Bandit Clans': +1 }
  }
}
```

---

## Implementation Priority

### Phase 1: Foundation (CRITICAL) ✅ COMPLETED
**Goal:** Get basic encounter system working with AI narration
1. ✅ **Encounter Data Structures** (1.1) - 10+ encounter templates with multi-round combat support
2. ✅ **Encounter Resolution System** (1.2) - `encounterResolver.js` with AI narration + `multiRoundEncounter.js`
3. ✅ **Encounter Action Modal** (1.3) - Choice-driven UI with HP bars, damage display, victory/defeat states

**Success Criteria:** ✅ Player can trigger an encounter, choose an action, roll dice, and receive AI-narrated outcome.

### Phase 2: Random Encounters (HIGH PRIORITY) ✅ MOSTLY COMPLETED
**Goal:** Populate the world with dynamic encounters
4. ✅ **Biome Encounter Tables** (2.1) - Define tables for all biomes
5. ✅ **Encounter Generation** (2.2) - Implement weighted random selection
6. ✅ **Movement Integration** (2.3) - Trigger encounters during travel
7. 🔄 **Narrative Encounters** (2.4) - Two-tier encounter system (IN PROGRESS)

**Success Criteria:** ✅ Traveling between towns triggers appropriate random encounters based on biome and settings.
**Phase 2.4 Success Criteria:** Immediate encounters suppress AI prompts; narrative encounters enhance them without conflict.

### Phase 3: Content Expansion (MEDIUM PRIORITY)
**Goal:** Add variety and depth to encounters
7. **Enhanced POI Encounters** (3.1-3.4) - Caves, ruins, groves, mountains
8. **More Encounter Templates** - Expand to 30+ unique encounters
9. **Environmental Encounters** - Weather, hazards, discoveries

**Success Criteria:** Every POI type has unique, story-rich encounters.

### Phase 4: Progression Systems (MEDIUM PRIORITY)
**Goal:** Make encounters meaningful long-term
10. **Experience & Leveling** (4.1) - Track XP and level-ups
11. **Inventory System** (4.2) - Manage gold and items
12. **Loot Narration** (4.3) - AI describes treasure acquisition

**Success Criteria:** Encounter rewards persist and affect character progression.

### Phase 5: Advanced Features (LOW PRIORITY)
**Goal:** Polish and deepen the narrative experience
13. **Dynamic Encounter Variation** (5.1) - AI rewrites templates
14. **NPC Dialogue** (5.2) - Conversational non-hostile encounters
15. **Consequence Tracking** (5.3) - Encounters reference past outcomes
16. **Reputation System** (5.4) - Faction relationships evolve

**Success Criteria:** Encounters feel unique, interconnected, and responsive to player history.

---

## Technical Considerations

### State Management
- **Encounter State:** Add to `Game.js` (current encounter, resolution result, history)
- **Persistence:** Save encounter history, reputation, and consequences to database
- **Distance Tracking:** Track total distance traveled and last encounter distance
- **Reputation:** Store faction relationships in game state

### AI Service Integration
- **Rate Limiting:** Cache AI responses for repeated encounters
- **Fallback:** Use base consequences if AI service fails
- **Token Management:** Keep prompts concise (under 300 tokens)
- **Temperature:** Use 0.7-0.9 for creative narration, 0.5 for consistent mechanics

### Performance
- **Lazy Loading:** Load encounter templates on-demand
- **Caching:** Cache biome encounter tables
- **Debouncing:** Prevent rapid-fire encounter triggers

### Balance
- **Difficulty Scaling:** Adjust DCs based on party level
- **Encounter Frequency:** Tune based on grimness setting
- **Reward Economy:** Balance gold/XP to prevent grinding
- **Consequence Severity:** Match to darkness/grimness levels

### User Experience
- **Loading States:** Show "Resolving encounter..." during AI calls
- **Dice Animation:** Visual feedback for rolls
- **Narration Pacing:** Typewriter effect for AI text
- **Choice Clarity:** Show which skill each action uses

---

## Testing Checklist

### Phase 1 Tests
- [ ] Encounter modal displays correctly with all action buttons
- [ ] Dice rolls calculate modifiers from character stats
- [ ] AI narration generates for all outcome tiers
- [ ] Critical success/failure are detected and narrated
- [ ] Rewards are applied to inventory/XP
- [ ] Encounter resolves and returns to game

### Phase 2 Tests
- [ ] Random encounters trigger while traveling
- [ ] Encounter frequency matches grimness setting
- [ ] Different biomes produce appropriate encounters
- [ ] No encounters trigger on POI tiles
- [ ] Distance tracking prevents encounter spam
- [ ] "None" result allows uninterrupted travel

### Phase 3 Tests
- [ ] All POI types have unique encounters
- [ ] Cave/ruins/grove/mountain encounters work
- [ ] Non-hostile encounters don't force combat
- [ ] Environmental encounters resolve correctly

### Phase 4 Tests
- [ ] XP awards correctly after encounters
- [ ] Gold is added to party inventory
- [ ] Items appear in inventory with correct percentages
- [ ] Save/load preserves encounter history
- [ ] Level-up triggers at correct XP thresholds

### Phase 5 Tests
- [ ] Repeated encounters have varied descriptions
- [ ] NPC dialogue is contextual and in-character
- [ ] Encounter history affects future narration
- [ ] Reputation changes persist across sessions
- [ ] Faction relationships influence encounter outcomes

---

## Future Enhancements (Post-Launch)

### Narrative Depth
- **Branching Encounter Chains** - Choices in one encounter affect later ones
- **Recurring NPCs** - Merchants/travelers you meet multiple times
- **Moral Dilemmas** - Encounters with no clear "right" choice
- **Party Banter** - Heroes comment on encounters based on personality

### World Reactivity
- **Faction Wars** - Reputation affects which encounters spawn
- **Seasonal Events** - Special encounters during in-game seasons
- **Time of Day** - Night encounters are more dangerous
- **Weather Integration** - Storms, fog affect encounter visibility

### Mechanical Depth
- **Group Skill Checks** - Multiple heroes can contribute
- **Advantage/Disadvantage Triggers** - Conditions grant bonuses
- **Status Effects** - Injuries, blessings persist across encounters
- **Companion Abilities** - Pets/mounts provide encounter bonuses

### Meta Features
- **Bestiary** - Record encountered creatures with AI-generated lore
- **Encounter Journal** - Review past encounters and outcomes
- **Achievement System** - Track rare encounter outcomes
- **Difficulty Modes** - Hardcore (permadeath), Story (auto-succeed)
