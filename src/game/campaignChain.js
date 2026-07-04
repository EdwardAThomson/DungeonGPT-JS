// campaignChain.js
// Quest chaining: IN-SAVE continuation (docs/QUEST_CHAINING_PLAN.md, superseding
// the Phase-1 linked-save design). When a campaign is complete, the player picks
// the next campaign and continues it INSIDE THE SAME SAVE: same world map, same
// cached towns, same explored fog, same journal and RAG memories (same
// sessionId). The new campaign's content is spawned ADDITIVELY into the existing
// world; nothing is regenerated or removed. A player who wants a different world
// simply starts a normal New Game.
//
// A template can continue in-save only if its geography is compatible: every
// authored location (customNames towns/mountains plus milestone locations) must
// resolve on the CURRENT world map. Incompatible templates are offered as a New
// Game instead ("new map = new game").

import { storyTemplates } from '../data/storyTemplates';
import { SIDE_QUESTS } from '../data/sideQuests';
import { canUseTemplate } from './entitlements';
import { specFromTemplate, mergeLocationNames, resolveMilestoneCoords } from './campaignLauncher';
import { spawnCampaignIntoWorld, retroInjectQuestContent, findLocationOnMap } from './milestoneSpawner';
import { selectSideQuests } from './questEngine';
import { composeChapterPrologue } from './prologueComposer';
import { calculateMaxHP } from '../utils/healthSystem';
import { createLogger } from '../utils/logger';

const logger = createLogger('campaign-chain');

// Eligibility to continue is simply settings.campaignComplete: the Journal's
// CAMPAIGN COMPLETE banner (Modals.js) gates the CTA on it directly.

// Which template did this save play? Prefer the additive settings.templateId
// (stamped by launchCampaign going forward); fall back to matching the stored
// templateName label against the catalog (old saves), else keep the label so the
// record survives.
export const resolveCompletedTemplateId = (settings) => {
  if (settings?.templateId) return settings.templateId;
  const label = settings?.templateName;
  if (label) {
    const match = storyTemplates.find(
      (t) => label === (t.subtitle ? `${t.name} — ${t.subtitle}` : t.name)
    );
    if (match) return match.id;
  }
  return label || null;
};

// Effective party level for level-fit warnings (highest hero level; both field
// spellings are used across the app).
export const getPartyLevel = (party) => {
  if (!Array.isArray(party) || party.length === 0) return 1;
  return Math.max(...party.map((h) => h?.level || h?.heroLevel || 1));
};

// Every location the template's map generation would need: authored customNames
// merged with milestone location names (exactly what a fresh launch would inject).
const templateLocationNames = (template) => {
  const merged = mergeLocationNames(
    template.customNames || { towns: [], mountains: [] },
    template.settings?.milestones || []
  );
  const nameOf = (entry) => (typeof entry === 'string' ? entry : entry?.name || '');
  return [...merged.towns.map(nameOf), ...merged.mountains.map(nameOf)].filter(Boolean);
};

/**
 * Data-driven geography compatibility: can this template's campaign be spawned
 * into the CURRENT world? True only when every authored location resolves on the
 * live map (via the same name matching the spawner uses).
 */
export const isTemplateCompatibleWithWorld = (template, worldMap) => {
  if (!template || !Array.isArray(worldMap) || worldMap.length === 0) return false;
  return templateLocationNames(template).every(
    (name) => !!findLocationOnMap(worldMap, name)
  );
};

/**
 * The picker's catalog: which campaigns can come NEXT after this save.
 * Same-genre next tier first ("recommended"), then everything else sorted by level
 * fit; comingSoon stubs and already-played campaigns are excluded; premium
 * templates are listed but flagged locked for free users. Under-levelled picks
 * warn, they never block. Each option carries `compatible`: whether it can
 * continue IN THIS SAVE's world (all locations resolve) or needs a new adventure.
 *
 * @returns {Array<{ template, recommended, sameGenre, premiumLocked, underLeveled, compatible }>}
 */
export const getNextCampaignOptions = ({ settings, party, worldMap = null } = {}) => {
  const currentId = resolveCompletedTemplateId(settings);
  const currentTemplate = storyTemplates.find((t) => t.id === currentId) || null;
  const genre = currentTemplate?.theme || null;
  const currentTier = currentTemplate?.tier || settings?.tier || 1;
  const played = new Set(
    [...(settings?.completedCampaigns || []), currentId].filter(Boolean)
  );
  const partyLevel = getPartyLevel(party);

  const fits = (t) => !!(t.levelRange && partyLevel >= t.levelRange[0] && partyLevel <= t.levelRange[1]);

  const options = storyTemplates
    .filter((t) => !t.comingSoon && !played.has(t.id))
    .map((template) => ({
      template,
      recommended: !!genre && template.theme === genre && template.tier === currentTier + 1,
      sameGenre: !!genre && template.theme === genre,
      premiumLocked: !canUseTemplate(template),
      underLeveled: !!(template.levelRange && partyLevel < template.levelRange[0]),
      // Campaigns ramp internally (early milestones are often ungated while deep
      // chapters carry minLevel); an under-leveled party can still legitimately
      // START such a quest and grow into it via rumours. Lets the picker tell
      // the truth instead of only warning "may be deadly".
      openingAccessible: (() => {
        const first = (template.settings?.milestones || [])[0];
        return !!first && (!first.minLevel || partyLevel >= first.minLevel);
      })(),
      compatible: isTemplateCompatibleWithWorld(template, worldMap),
    }));

  const score = (o) =>
    (o.recommended ? 0 : 100)
    + (o.compatible ? 0 : 50)
    + (fits(o.template) ? 0 : 10)
    + (o.sameGenre ? 0 : 5)
    + (o.template.tier || 0);
  options.sort((a, b) => score(a) - score(b));
  return options;
};

// Heal the party in place for the next chapter, per the standing "everything,
// healed" decision: full HP, defeat cleared, NOTHING else changes (same save,
// same hero objects' progression). Returns new hero objects (React state
// discipline), never mutates the input.
export const healPartyForNextChapter = (party) =>
  (party || []).map((hero) => {
    const maxHP = hero.maxHP || calculateMaxHP(hero);
    return { ...hero, maxHP, currentHP: maxHP, isDefeated: false };
  });

// Additional side quests for the new chapter: appropriate to the new tier
// (startable within its level range), excluding every quest id already in the
// save (any status, including completed), map-valid, and APPENDED by the caller;
// existing quests keep their state untouched.
const selectContinuationSideQuests = ({ mapData, townMapsCache, existingSideQuests, levelRange, worldSeed, chapter }) => {
  const flatTiles = [].concat(...mapData);
  const availableSites = {
    cave: flatTiles.some((t) => t.poi === 'cave_entrance'),
    ruins: flatTiles.some((t) => t.poi === 'ruins'),
    // Parity with campaignLauncher: gather quests hint at forest/hills/mountain
    // sources too; without these flags mountain-hinted quests were silently
    // under-offered in chain continuations.
    forest: flatTiles.some((t) => t.poi === 'forest'),
    hills: flatTiles.some((t) => t.poi === 'hills'),
    mountain: flatTiles.some((t) => t.poi === 'mountain'),
  };
  const availableBuildings = new Set();
  Object.values(townMapsCache || {}).forEach((tm) => {
    (tm.mapData || []).forEach((row) => row.forEach((t) => {
      if (t.type === 'building' && t.buildingType) availableBuildings.add(t.buildingType);
    }));
  });

  const existingIds = new Set((existingSideQuests || []).map((q) => q.id));
  const maxLevel = (levelRange && levelRange[1]) || 99;
  const pool = SIDE_QUESTS.filter(
    (q) => !existingIds.has(q.id) && (q.minLevel || 1) <= maxLevel
  );

  // Seeded off worldSeed + chapter so a given continuation reproducibly offers
  // the same quests (mirrors the launcher's seeded pick).
  let sqSeed = ((parseInt(worldSeed) || 1) + chapter * 104729) % 233280 || 1;
  const sqRng = () => { sqSeed = (sqSeed * 9301 + 49297) % 233280; return sqSeed / 233280; };

  return selectSideQuests({ sites: availableSites, buildings: [...availableBuildings] }, 2, sqRng, pool);
};

/**
 * Build everything the in-save continuation needs, copy-on-write. Pure given its
 * inputs; nothing here touches React state or the store. The caller (Game.js)
 * applies the pieces: setWorldMap(mapData), setTownMapsCache(townMapsCache),
 * setSettings(prev => applyContinuationToSettings(prev, continuation)), heals the
 * party, appends the prologue to the conversation, and saves.
 *
 * @param {object} args
 * @param {object} args.template - the next story template (compatible with this world)
 * @param {Array}  args.worldMap - the live world map (NOT mutated)
 * @param {Object} args.townMapsCache - the live cached town maps (NOT mutated)
 * @param {number|string} args.worldSeed - the save's world seed
 * @param {Array}  [args.existingSideQuests] - settings.sideQuests (for exclusion)
 * @param {Array}  [args.party] - current party (prologue flavor only)
 * @param {number} [args.chapter] - the NEW chapter number (defaults to 2)
 * @returns {{ spec, mapData, townMapsCache, spawnResult, milestones, sideQuestsToAdd, prologue, chapter }}
 */
export const buildInSaveContinuation = ({
  template,
  worldMap,
  townMapsCache,
  worldSeed,
  existingSideQuests = [],
  party = [],
  chapter = 2,
}) => {
  // Premium backstop: every path that can start a campaign must hold this gate.
  if (!canUseTemplate(template)) {
    throw new Error('This is a Premium adventure. Premium unlock is coming soon; pick a free adventure to continue.');
  }
  if (!isTemplateCompatibleWithWorld(template, worldMap)) {
    throw new Error(`"${template.name}" is set in different lands and cannot continue in this world. Start it as a new adventure instead.`);
  }

  const spec = specFromTemplate(template);

  // Additive world spawn (copy-on-write; occupied tiles fall back to adjacent
  // placement; misses are logged by the spawner, never fatal).
  const { mapData, spawnResult } = spawnCampaignIntoWorld(worldMap, spec.milestones);

  // Resolve the new milestones' coordinates against the live map.
  const milestones = resolveMilestoneCoords(spec.milestones, mapData);

  // Retro-inject quest buildings + milestone NPCs into ALREADY-CACHED towns.
  // Uncached towns get theirs free at first-visit generation (the lazy path reads
  // the updated settings).
  const newTownMapsCache = retroInjectQuestContent({
    townMapsCache,
    requiredBuildings: spawnResult.requiredBuildings,
    milestones: spec.milestones,
    worldSeed,
  });

  const sideQuestsToAdd = selectContinuationSideQuests({
    mapData,
    townMapsCache: newTownMapsCache,
    existingSideQuests,
    levelRange: spec.levelRange,
    worldSeed,
    chapter,
  });

  const prologue = composeChapterPrologue({ spec, chapter, party });

  logger.info(`[CHAIN] Built in-save continuation for "${spec.templateName}" (chapter ${chapter})`);

  return { spec, mapData, townMapsCache: newTownMapsCache, spawnResult, milestones, sideQuestsToAdd, prologue, chapter };
};

/**
 * Apply an in-save continuation to the save's settings. PURE and designed for a
 * functional setSettings updater, so completedCampaigns/currentChapter always
 * derive from the freshest previous state. All fields are additive or replace
 * campaign-scoped fields only; world-scoped fields (theme, worldSeed, mapVersion,
 * saveName) are untouched.
 */
export const applyContinuationToSettings = (prevSettings, continuation) => {
  const prev = prevSettings || {};
  const { spec, spawnResult, milestones, sideQuestsToAdd } = continuation;

  // Merge per-town building requirements so towns not yet generated still get
  // EVERY campaign's buildings at first visit (old entries are kept: they are
  // already baked into cached towns and remain valid history).
  const requiredBuildings = { ...(prev.requiredBuildings || {}) };
  Object.entries(spawnResult.requiredBuildings || {}).forEach(([town, reqs]) => {
    requiredBuildings[town] = [...(requiredBuildings[town] || []), ...reqs];
  });

  return {
    ...prev,
    // The new campaign's identity + content (campaign-scoped, replaced)
    shortDescription: spec.shortDescription,
    grimnessLevel: spec.grimnessLevel,
    darknessLevel: spec.darknessLevel,
    magicLevel: spec.magicLevel,
    technologyLevel: spec.technologyLevel,
    responseVerbosity: spec.responseVerbosity,
    campaignGoal: spec.campaignGoal || (milestones.length > 0 ? milestones[milestones.length - 1].text : ''),
    templateName: spec.templateName,
    templateId: spec.templateId || prev.templateId,
    tier: spec.tier,
    levelRange: spec.levelRange || (spec.tier === 1 ? [1, 2] : [3, 5]),
    milestones,
    campaignComplete: false,
    // Spawn tables: enemy/item spawns are campaign-scoped (replaced); building
    // requirements accumulate (see above).
    requiredBuildings,
    enemySpawns: spawnResult.enemySpawns,
    itemSpawns: spawnResult.itemSpawns,
    // Side quests APPEND; existing quests keep their state.
    sideQuests: [...(prev.sideQuests || []), ...sideQuestsToAdd],
    // Chain record (additive)
    completedCampaigns: [...(prev.completedCampaigns || []), resolveCompletedTemplateId(prev)].filter(Boolean),
    currentChapter: (prev.currentChapter || 1) + 1,
  };
};
