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
      return `${m.text}${typeTag}`;
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
    locationInfo += ` The party has arrived at ${tile.townName}, a ${tile.townSize || 'settlement'}. They are standing at the edge of the town.`;
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
