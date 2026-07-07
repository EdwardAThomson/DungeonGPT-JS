import { DM_PROTOCOL } from '../data/prompts';
import { buildMovementPrompt } from '../utils/promptBuilder';
import { areRequirementsMet } from '../game/milestoneEngine';
import { getHPStatus } from '../utils/healthSystem';

const formatCampaignMilestones = (milestones) => {
  if (!Array.isArray(milestones) || milestones.length === 0) {
    return '';
  }
  // Handle both old (string) and new (object) milestone formats
  const normalized = milestones.map(m => typeof m === 'object' ? m : { text: String(m), completed: false });
  const completed = normalized.filter(m => m.completed);
  const active = normalized.filter(m => !m.completed && areRequirementsMet(m, normalized));

  let text = '';
  if (active.length > 0) {
    text += '\nActive Milestones: ' + active.map(m => {
      const typeTag = m.type ? ` [${m.type}]` : '';
      let line = `${m.text}${typeTag}`;
      // Ground authored NPC objectives with the canonical name + venue.
      if (m.spawn?.type === 'npc' && m.spawn.name) {
        const who = m.spawn.role ? `${m.spawn.name} (${m.spawn.role})` : m.spawn.name;
        const where = m.building?.name || m.spawn.location;
        line += ` — speak with ${who}${where ? ` at ${where}` : ''}`;
        if (m.spawn.personality) line += `; ${m.spawn.personality}`;
      }
      return line;
    }).join('; ');
  }
  if (completed.length > 0) {
    text += '\nCompleted: ' + completed.map(m => m.text).join('; ');
  }
  return text;
};

// Surface party condition as a coarse band, not raw HP numbers, so the AI can
// narrate wounds believably (a near-death hero shouldn't read as unharmed) while
// combat itself stays deterministic and AI-blind to exact mechanics.
const WOUNDED_STATUS_TAGS = {
  critical: 'critically wounded - near death',
  wounded: 'badly wounded',
  injured: 'injured'
};

export const formatPartyInfo = (selectedHeroes = []) => {
  return selectedHeroes.map((hero) => {
    const name = hero.heroName || hero.characterName || 'Unknown';
    const charClass = hero.heroClass || hero.characterClass || '';
    const label = charClass ? `${name} (${charClass})` : name;
    const defeated = hero.currentHP <= 0 || hero.isDefeated;
    if (defeated) return `${label} [DEFEATED - unconscious/incapacitated, cannot act]`;
    // Only annotate when HP is known and the hero is below full health.
    if (hero.currentHP != null && hero.maxHP) {
      const { status } = getHPStatus(hero.currentHP, hero.maxHP);
      const tag = WOUNDED_STATUS_TAGS[status];
      if (tag) return `${label} [${tag}]`;
    }
    return label;
  }).join(', ');
};

// Map a biome theme to a short region descriptor for the AI's setting context. Grassland
// (the default) returns '' so existing narration prompts are unchanged.
const REGION_THEME_DESCRIPTIONS = {
  desert: ' The whole region is an arid desert of windswept sand, dunes, and scorching sun, with shade and water scarce.',
};
export const buildRegionThemeInfo = (theme) => REGION_THEME_DESCRIPTIONS[theme] || '';

export const buildLocationInfo = ({ tile, coords, isNewArea }) => {
  let locationInfo = `Player has moved to coordinates (${coords.x}, ${coords.y}) in a ${tile.biome} biome.`;
  if (tile.poi === 'town' && tile.townName) {
    // Name the settlement AS a place, explicitly (playtest 2026-07-07: weaker
    // models personified the town name or reused it as a character's name).
    locationInfo += ` The party has arrived at the ${tile.townSize || 'settlement'} named "${tile.townName}" (this is the name of the PLACE, not a person). They are standing at the edge of town.`;
  } else if (tile.poi) {
    locationInfo += ` POI: ${tile.poi}.`;
  }
  locationInfo += ` Description seed: ${tile.descriptionSeed || 'Describe the area.'}`;
  if (!isNewArea) {
    locationInfo += ' The party has been to this type of terrain before. Keep the description brief (1 paragraph) and focus on what is new or different.';
  }
  return locationInfo;
};

const buildRecentAiContext = (conversation = [], maxMessages = 3) => {
  const recentAiMessages = conversation
    .filter((msg) => msg.role === 'ai')
    .slice(-maxMessages)
    .map((msg) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return content.slice(0, 150);
    })
    .join(' | ');

  if (!recentAiMessages) return '';
  return `\n\n**Recent descriptions (DO NOT repeat similar phrases):**\n${recentAiMessages}`;
};

export const composeMovementNarrativePrompt = ({
  tile,
  coords,
  settings,
  selectedHeroes,
  currentSummary,
  narrativeEncounter,
  worldMap,
  isNewArea,
  conversation = [],
  includeRecentContext = true,
  ragContext = ''
}) => {
  const partyInfo = formatPartyInfo(selectedHeroes);
  const movementDescription = buildMovementPrompt(tile, settings, narrativeEncounter, worldMap);
  const locationInfo = buildLocationInfo({ tile, coords, isNewArea });
  const goalInfo = settings.campaignGoal ? `\nCampaign Goal: ${settings.campaignGoal}` : '';
  const milestonesInfo = formatCampaignMilestones(settings.milestones);
  // Themed-region maps (Phase 2b): tell the model the whole region's biome so a desert
  // map reads as desert. Grassland (default) adds nothing, keeping existing prompts intact.
  const themeInfo = buildRegionThemeInfo(settings.theme);
  const gameContext = `Setting: ${settings.shortDescription}.${themeInfo} Mood: ${settings.grimnessLevel}.${goalInfo}${milestonesInfo}\n${locationInfo}. Party: ${partyInfo}.`;
  const recentContext = includeRecentContext ? buildRecentAiContext(conversation) : '';
  const prompt = `Game Context: ${gameContext}\n\nStory summary so far: ${currentSummary}${recentContext}\n\n${movementDescription}${ragContext}`;

  return {
    prompt,
    fullPrompt: DM_PROTOCOL + prompt
  };
};

/**
 * Prompt for the scripted meeting with a milestone NPC (the building "Talk" button on
 * 'talk' milestones). The engine has ALREADY completed the milestone deterministically
 * by the time this runs — the AI only narrates the meeting, so the prompt frames the
 * encounter as happening now and forbids completion markers.
 */
export const composeNpcMeetingPrompt = ({
  npc = {},
  buildingName = null,
  townName = null,
  milestoneText = null,
  settings = {},
  selectedHeroes = [],
  currentSummary = ''
}) => {
  const partyInfo = formatPartyInfo(selectedHeroes);
  const name = npc.name || 'the contact';
  const who = npc.role ? `${name} (${npc.role})` : name;
  const where = buildingName
    ? `at ${buildingName}${townName ? ` in ${townName}` : ''}`
    : (townName ? `in ${townName}` : 'here');
  const personaInfo = npc.personality ? ` ${name} is ${npc.personality}.` : '';
  const objectiveInfo = milestoneText
    ? ` This meeting fulfils the objective "${milestoneText}"; the game engine has already marked it complete, so do NOT emit any completion marker.`
    : '';
  const goalInfo = settings.campaignGoal ? `\nCampaign Goal: ${settings.campaignGoal}` : '';
  const gameContext = `Setting: ${settings.shortDescription || 'Fantasy Realm'}. Mood: ${settings.grimnessLevel || 'Normal'}.${goalInfo}\nParty: ${partyInfo}.`;
  const task = `The party seeks out ${who} ${where}.${personaInfo}${objectiveInfo} Narrate the meeting: how ${name} receives the party, what is said about the matter at hand, and what direction ${name} offers for what comes next. Use ${name}'s exact name and do not invent other named officials. Keep it to 1-2 short paragraphs.`;
  const prompt = `Game Context: ${gameContext}\n\nStory summary so far: ${currentSummary || 'The tale unfolds.'}\n\n${task}`;

  return {
    prompt,
    fullPrompt: DM_PROTOCOL + prompt
  };
};
