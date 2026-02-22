import { DM_PROTOCOL } from '../data/prompts';
import { buildMovementPrompt } from '../utils/promptBuilder';

const formatCampaignMilestones = (milestones) => {
  if (!Array.isArray(milestones) || milestones.length === 0) {
    return '';
  }
  const items = milestones
    .map((milestone) => (typeof milestone === 'object' ? milestone.text : milestone))
    .filter(Boolean);
  if (items.length === 0) return '';
  return `\nKey Milestones to achieve: ${items.join(', ')}`;
};

export const formatPartyInfo = (selectedHeroes = []) => {
  return selectedHeroes.map((hero) => `${hero.characterName} (${hero.characterClass})`).join(', ');
};

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
  includeRecentContext = true
}) => {
  const partyInfo = formatPartyInfo(selectedHeroes);
  const movementDescription = buildMovementPrompt(tile, settings, narrativeEncounter, worldMap);
  const locationInfo = buildLocationInfo({ tile, coords, isNewArea });
  const goalInfo = settings.campaignGoal ? `\nCampaign Goal: ${settings.campaignGoal}` : '';
  const milestonesInfo = formatCampaignMilestones(settings.milestones);
  const gameContext = `Setting: ${settings.shortDescription}. Mood: ${settings.grimnessLevel}.${goalInfo}${milestonesInfo}\n${locationInfo}. Party: ${partyInfo}.`;
  const recentContext = includeRecentContext ? buildRecentAiContext(conversation) : '';
  const prompt = `Game Context: ${gameContext}\n\nStory summary so far: ${currentSummary}${recentContext}\n\n${movementDescription}`;

  return {
    prompt,
    fullPrompt: DM_PROTOCOL + prompt
  };
};
