import { DM_PROTOCOL } from '../data/prompts';
import { detectNarrationProblem } from '../utils/responseGuard';
import { buildMovementPrompt, LOOK_TONE_EXAMPLES } from '../utils/promptBuilder';
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
    // A leaked or looping reply already in an older save must not be fed back as context.
    .filter((msg) => typeof msg.content !== 'string' || !detectNarrationProblem(msg.content))
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
  ragContext = '',
  look = false,
  placeName = null
}) => {
  const partyInfo = formatPartyInfo(selectedHeroes);
  const movementDescription = buildMovementPrompt(tile, settings, narrativeEncounter, worldMap, { look, placeName });
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

// What a Look around inside an explorable site (cave, ruins, ...) should be framed as.
// Enclosed sites have no sky or open land; open-air ones sit in the world tile's biome.
const SITE_LOOK_SETTING = {
  cave: 'inside a cave, underground, with rock on every side and no daylight beyond the entrance',
  mountain: 'inside a rocky mountain pass, hemmed in by stone walls',
  ruins: 'among old ruins standing in open country',
  forest: 'in a clearing deep in a wood',
  hills: 'among rolling hills and rocky outcrops'
};

// Decoration keys -> plain nouns for the AI (SITE_DECORATIONS keys, siteTileArt.js).
const SITE_FEATURE_NOUNS = {
  boulder: 'a boulder', crystal: 'crystals in the rock', mushroom: 'pale mushrooms',
  ore: 'an ore vein', pool: 'a still pool', column: 'a broken column', statue: 'a weathered statue',
  overgrowth: 'thick overgrowth', urn: 'an old urn', tree: 'an old tree', bush: 'a thicket',
  flowers: 'wildflowers', snow: 'drifted snow'
};

// Distinct decorations within `radius` tiles of the party, nearest first.
export const nearbySiteFeatures = (mapData, pos, radius = 3, max = 3) => {
  if (!Array.isArray(mapData) || !pos) return [];
  const found = [];
  for (let y = pos.y - radius; y <= pos.y + radius; y++) {
    for (let x = pos.x - radius; x <= pos.x + radius; x++) {
      const key = mapData[y]?.[x]?.poi;
      if (!key || !SITE_FEATURE_NOUNS[key]) continue;
      found.push({ key, d: Math.abs(x - pos.x) + Math.abs(y - pos.y) });
    }
  }
  found.sort((a, b) => a.d - b.d);
  const seen = new Set();
  const out = [];
  for (const f of found) {
    if (seen.has(f.key)) continue;
    seen.add(f.key);
    out.push(SITE_FEATURE_NOUNS[f.key]);
    if (out.length >= max) break;
  }
  return out;
};

/**
 * Look around inside an explorable site. Describes the site itself (its name, type and
 * what is near the party), never the world tile outside it, and carries no encounter
 * hook: world-map hooks belong to the world map.
 */
export const composeSiteLookPrompt = ({
  siteMap,
  sitePosition,
  biome = null,
  settings = {},
  selectedHeroes = [],
  currentSummary = '',
  conversation = [],
  includeRecentContext = true,
  ragContext = ''
}) => {
  const partyInfo = formatPartyInfo(selectedHeroes);
  const type = siteMap?.type === 'cave_entrance' ? 'cave' : (siteMap?.type || 'cave');
  const name = siteMap?.name || 'this place';
  const setting = SITE_LOOK_SETTING[type] || SITE_LOOK_SETTING.cave;
  const enclosed = type === 'cave' || type === 'mountain';
  const entry = siteMap?.entryPoint;
  const nearEntrance = entry && sitePosition
    && Math.abs(entry.x - sitePosition.x) + Math.abs(entry.y - sitePosition.y) <= 2;
  const features = nearbySiteFeatures(siteMap?.mapData, sitePosition);

  let place = `The party is ${setting}, in the place called "${name}" (this is the name of the PLACE, not a person).`;
  if (!enclosed && biome) place += ` The surrounding land is ${biome}.`;
  place += nearEntrance ? ' They stand near the way they came in.' : ' They are some way in from the entrance.';
  if (features.length) place += ` Close by: ${features.join(', ')}.`;

  const goalInfo = settings.campaignGoal ? `\nCampaign Goal: ${settings.campaignGoal}` : '';
  const milestonesInfo = formatCampaignMilestones(settings.milestones);
  const gameContext = `Setting: ${settings.shortDescription}. Mood: ${settings.grimnessLevel}.${goalInfo}${milestonesInfo}\n${place} Party: ${partyInfo}.`;
  const recentContext = includeRecentContext ? buildRecentAiContext(conversation) : '';
  const task = `The party stops and looks around ${name}. Describe what they see, hear and smell right here, in 2-3 sentences, atmospheric and brief.`
    + (enclosed ? ' They are enclosed: no sky, sun, wind across open land or distant views.' : '')
    + ' Stay inside this place: do not describe travel or other terrain. Do not invent creatures, fights or treasure.'
    + `\n\n${LOOK_TONE_EXAMPLES}`;
  const prompt = `Game Context: ${gameContext}\n\nStory summary so far: ${currentSummary}${recentContext}\n\n${task}${ragContext}`;

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
  meetingText = null,
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
  // Authored scene from the story template: the facts and direction to convey, in
  // the model's own words.
  const briefInfo = meetingText ? ` Authored brief for this scene (keep its facts and direction, retell it in your own words): ${meetingText}` : '';
  const goalInfo = settings.campaignGoal ? `\nCampaign Goal: ${settings.campaignGoal}` : '';
  const gameContext = `Setting: ${settings.shortDescription || 'Fantasy Realm'}. Mood: ${settings.grimnessLevel || 'Normal'}.${goalInfo}\nParty: ${partyInfo}.`;
  const task = `The party seeks out ${who} ${where}.${personaInfo}${objectiveInfo}${briefInfo} Narrate the meeting: how ${name} receives the party, what is said about the matter at hand, and what direction ${name} offers for what comes next. Use ${name}'s exact name and do not invent other named officials. Keep it to 1-2 short paragraphs.`;
  const prompt = `Game Context: ${gameContext}\n\nStory summary so far: ${currentSummary || 'The tale unfolds.'}\n\n${task}`;

  return {
    prompt,
    fullPrompt: DM_PROTOCOL + prompt
  };
};
