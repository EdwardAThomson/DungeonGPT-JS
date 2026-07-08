// introComposer.js
// The authored, grounded new-game opening used by EVERYONE (guests get it verbatim;
// signed-in players get it as the base for a tightly-bounded LLM polish pass).
//
// Built purely from the campaign's own data (start town, biome/atmosphere, the real
// current milestone + its destination, and any REAL placed NPCs). It introduces NO
// invented people, buildings, or places, so nothing here can contradict the in-game
// grounding on the player's next turn. Deterministic and side-effect free.

import { formatPartyInfo } from './promptComposer';

// Atmospheric descriptors keyed off the start tile's biome. Deterministic per biome so
// the opening varies sensibly by campaign without inventing named features.
const BIOME_ATMOSPHERE = {
  plains: { land: 'open grassland', detail: 'Wind combs the tall grass and the horizon runs unbroken in every direction.' },
  grassland: { land: 'open grassland', detail: 'Wind combs the tall grass and the horizon runs unbroken in every direction.' },
  grass: { land: 'open grassland', detail: 'Wind combs the tall grass and the horizon runs unbroken in every direction.' },
  desert: { land: 'sun-scoured desert', detail: 'Heat shimmers off the dunes and every breath tastes of dust and dry wind.' },
  snow: { land: 'frozen frontier', detail: 'Snow squeaks underfoot and the cold bites through every seam of cloak and mail.' },
  swamp: { land: 'sodden marshland', detail: 'The air hangs thick and green, heavy with the smell of stagnant water.' },
  woodland: { land: 'deep woodland', detail: 'Branches lace the sky overhead and the woods breathe with unseen movement.' },
  forest: { land: 'deep woodland', detail: 'Branches lace the sky overhead and the woods breathe with unseen movement.' },
  hills: { land: 'wind-worn hills', detail: 'The land folds and rises around you, hiding as much as it reveals.' },
  mountain: { land: 'high mountain country', detail: 'Thin air and hard stone press close, and the peaks loom grey and indifferent.' },
  water: { land: 'wave-battered coast', detail: 'Salt spray drifts inland and gulls wheel over the grey line of the sea.' },
  beach: { land: 'wave-battered coast', detail: 'Salt spray drifts inland and gulls wheel over the grey line of the sea.' },
};
const DEFAULT_BIOME = { land: 'wilds', detail: 'The land stretches wide and untamed around you.' };

// Mood line keyed off tone (grimnessLevel: Noble | Neutral | Bleak | Grim).
const GRIMNESS_MOOD = {
  Noble: 'A clean light lies over it all, and for a moment the road ahead feels like a thing worth walking.',
  Neutral: '',
  Bleak: 'A weariness hangs about the place, as though it has seen too many hard seasons and expects another.',
  Grim: 'A hush of dread clings to the streets, and the few faces you pass will not meet your eyes.',
};

// Light qualifier keyed off darknessLevel (Bright | Neutral | Grey | Dark).
const DARKNESS_LIGHT = {
  Bright: 'Bright daylight',
  Neutral: '',
  Grey: 'A pale, overcast light',
  Dark: 'A gloom that even midday cannot lift',
};

const biomeInfo = (biome) => BIOME_ATMOSPHERE[(biome || '').toLowerCase()] || DEFAULT_BIOME;

// Format ONLY the current milestone as a grounded objective line, plus the real
// destination settlement it lives in. Returns { line, destination }. Kept here (and
// exported) so the destination-naming logic (#69) lives with the authored opening and
// can be reused by the polish-pass validation guard.
export const formatStartObjective = (current) => {
  if (!current) return { line: '', destination: '' };
  const typeTag = current.type ? ` [${current.type}]` : '';
  let line = `${current.text}${typeTag}`;
  const destination = current.building?.location || current.spawn?.location || current.location || '';
  if (current.spawn?.type === 'npc' && current.spawn.name) {
    const who = current.spawn.role ? `${current.spawn.name} (${current.spawn.role})` : current.spawn.name;
    const where = current.building?.name || current.spawn.location;
    line += `: speak with ${who}${where ? ` at ${where}` : ''}`;
    if (current.spawn.personality) line += `; ${current.spawn.personality}`;
  } else if (current.building?.name) {
    line += ` at ${current.building.name}`;
  }
  return { line, destination };
};

// Build the objective/hook prose from the current milestone. Names the destination
// settlement explicitly and frames it as travel when it is a DIFFERENT place from the
// start (the #69 "name the destination town, not in the current place" framing).
const composeObjective = (current, settings, startPlaceName) => {
  if (!current) {
    // No milestone: lean on the campaign goal if there is one.
    if (settings.campaignGoal) {
      return `**Your purpose:** ${settings.campaignGoal} The first move is yours.`;
    }
    return '';
  }

  const destination = current.building?.location || current.spawn?.location || current.location || '';
  const elsewhere = destination && destination !== startPlaceName;

  const parts = [];
  if (settings.campaignGoal) parts.push(`**Your purpose:** ${settings.campaignGoal}`);

  // The concrete next step, grounded on the milestone's real NPC/building.
  let step;
  if (current.spawn?.type === 'npc' && current.spawn.name) {
    const who = current.spawn.role ? `${current.spawn.name}, ${current.spawn.role},` : current.spawn.name;
    const where = current.building?.name;
    step = `Your path begins with ${who}${where ? ` at ${where}` : ''}`;
    step += elsewhere ? ` in ${destination}.` : `.`;
  } else if (current.building?.name) {
    step = `Your path begins at ${current.building.name}${elsewhere ? ` in ${destination}` : ''}.`;
  } else {
    step = `Your next step: ${current.text}`;
    if (!/[.!?]$/.test(step)) step += '.';
  }
  parts.push(step);

  // Travel framing: the destination is somewhere the party has NOT reached.
  if (elsewhere) {
    parts.push(`${destination} lies beyond ${startPlaceName}; you will have to travel there. Set out from ${startPlaceName} when the party is ready.`);
  } else if (startPlaceName && startPlaceName !== 'this place') {
    parts.push(`It can be found here in ${startPlaceName}, so the road need not take you far yet.`);
  }

  return parts.join(' ');
};

// composeIntro(settings, selectedHeroes, opts)
//   opts.startPlaceName  string  resolved start town/place name
//   opts.isTown          bool    whether the start is a named settlement
//   opts.startSize       string  settlement size (village/town/city), optional
//   opts.biome           string  start tile biome
//   opts.currentMilestone object the single current active milestone (or null)
//   opts.placedNpcs      array   REAL NPCs already placed at the start (optional; { name, role })
//
// Returns a single two-part opening string (scene + objective). Deterministic and free
// of invented entities. Honors an optional per-campaign `settings.openingText` override
// (used verbatim as the scene) additively.
export const composeIntro = (settings = {}, selectedHeroes = [], opts = {}) => {
  const {
    startPlaceName: rawPlace,
    isTown = false,
    startSize = null,
    biome = null,
    currentMilestone = null,
    placedNpcs = [],
  } = opts;

  const startPlaceName = rawPlace || 'this place';
  const party = formatPartyInfo(selectedHeroes) || 'Your party';
  const setting = (settings.shortDescription || '').trim();
  const bio = biomeInfo(biome);

  // ---- SCENE ----
  let scene;
  if (settings.openingText && String(settings.openingText).trim()) {
    // Per-campaign authored override wins verbatim.
    scene = String(settings.openingText).trim();
  } else {
    const sceneLines = [];
    if (setting) sceneLines.push(setting);

    // Arrival, grounded to the real start place + biome.
    const arrival = isTown
      ? `${party} come at last within sight of ${startPlaceName}, ${startSize ? `a ${startSize} ` : 'a settlement '}set amid ${bio.land}.`
      : `${party} arrive in the ${bio.land}, at the threshold of the journey ahead.`;
    sceneLines.push(arrival);

    // Atmosphere: biome detail, then light qualifier, then tone/mood.
    const light = DARKNESS_LIGHT[settings.darknessLevel];
    const atmosphere = [];
    atmosphere.push(bio.detail);
    if (light) atmosphere.push(`${light} lies over ${isTown ? 'the rooftops' : 'the land'}.`);
    const mood = GRIMNESS_MOOD[settings.grimnessLevel];
    if (mood) atmosphere.push(mood);
    sceneLines.push(atmosphere.join(' '));

    // Reference ONLY real placed NPCs, if any. Never invent people.
    const realNpcs = (placedNpcs || []).filter(n => n && n.name).slice(0, 3);
    if (realNpcs.length > 0) {
      const named = realNpcs
        .map(n => (n.role ? `${n.name}, ${n.role}` : n.name))
        .join('; ');
      sceneLines.push(`Among those about are ${named}.`);
    }

    scene = sceneLines.join('\n\n');
  }

  // ---- OBJECTIVE / HOOK ----
  const objective = composeObjective(currentMilestone, settings, startPlaceName);

  const parts = [scene];
  if (objective) parts.push(objective);

  // Guests need the sign-in nudge; it is harmless for signed-in players but they never
  // see the authored text unless the polish pass is skipped/rejected. Keep it out of the
  // authored body so it does not survive into the polished, AI-facing version.
  return parts.join('\n\n');
};
