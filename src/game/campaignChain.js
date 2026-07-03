// campaignChain.js
// Quest chaining Phase 1 (docs/QUEST_CHAINING_PLAN.md): "New Expedition" linked
// saves. When a campaign is complete, the player picks the next campaign and we
// create a NEW save (fresh world via the shared launchCampaign pipeline, carried
// party healed via carryParty, deterministic local prologue) linked back to the
// completed one. The completed save is NEVER destroyed; at most it gains an
// additive `continuedInSessionId` stamp (best-effort).
//
// The fresh RAG index comes free: the new save has a new gameSessionId, and the
// RAG store is keyed by sessionId (ragEngine getBySession), so no old-world
// vectors are ever retrieved into the new chapter.

import { storyTemplates } from '../data/storyTemplates';
import { canUseTemplate } from './entitlements';
import { launchCampaign, specFromTemplate } from './campaignLauncher';
import { composePrologue } from './prologueComposer';
import { buildSaveName, buildSubMapsPayload, parseSaveRoot, DEFAULT_SAVE_ROOT } from './saveController';
import { findStartingTown } from '../utils/mapGenerator';
import { mapPayloadToRow } from '../services/localGameStore';
import { conversationsApi } from '../services/conversationsApi';
import { createLogger } from '../utils/logger';

const logger = createLogger('campaign-chain');

// A save may chain into a next chapter once its campaign is complete. Tolerant of
// missing/old settings (old saves without the flag simply are not eligible).
export const isEligibleForChaining = (settings) => !!(settings && settings.campaignComplete);

// "Adventure — Chapter 2" -> "Adventure" (also tolerates a plain hyphen).
const CHAPTER_SUFFIX_REGEX = /\s*[—-]\s*Chapter\s+\d+\s*$/i;

// Recover the chain's base save-name root from the parent save, stripping any
// existing chapter suffix so Chapter 3 does not become "... — Chapter 2 — Chapter 3".
export const chainRootName = (parentSettings, parentConversationName = null) => {
  const raw = (typeof parentSettings?.saveName === 'string' && parentSettings.saveName.trim())
    || (parentConversationName ? parseSaveRoot(parentConversationName) : '')
    || DEFAULT_SAVE_ROOT;
  return raw.replace(CHAPTER_SUFFIX_REGEX, '').trim() || DEFAULT_SAVE_ROOT;
};

// Which template did this save play? Prefer the additive settings.templateId (stamped
// by launchCampaign going forward); fall back to matching the stored templateName
// label against the catalog (old saves), else keep the label so the record survives.
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

/**
 * The picker's catalog: which campaigns can come NEXT after this save.
 * Same-genre next tier first ("recommended"), then everything else sorted by level
 * fit; comingSoon stubs and already-played campaigns are excluded; premium templates
 * are listed but flagged locked for free users (the existing entitlements gate).
 * Under-levelled picks warn, they never block.
 *
 * @returns {Array<{ template, recommended, sameGenre, premiumLocked, underLeveled }>}
 */
export const getNextCampaignOptions = ({ settings, party } = {}) => {
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
    }));

  const score = (o) =>
    (o.recommended ? 0 : 100)
    + (fits(o.template) ? 0 : 10)
    + (o.sameGenre ? 0 : 5)
    + (o.template.tier || 0);
  options.sort((a, b) => score(a) - score(b));
  return options;
};

// Fallback starting position when findStartingTown throws (mirrors NewGame's preview
// fallback): any town, else the map origin.
const resolveStartingPosition = (mapData) => {
  try {
    return findStartingTown(mapData);
  } catch (e) {
    for (let y = 0; y < mapData.length; y++) {
      for (let x = 0; x < mapData[y].length; x++) {
        if (mapData[y][x].poi === 'town') return { x, y };
      }
    }
    return { x: 0, y: 0 };
  }
};

/**
 * Build the complete NEW linked save for the next chapter. Pure-ish (seeded pipeline;
 * session id + timestamps are minted here) and does NOT touch the store.
 *
 * @param {object} args
 * @param {object} args.template - the next story template (from getNextCampaignOptions)
 * @param {object} args.parent - the completed save:
 *   { sessionId, settings, heroes, summary, conversationName }
 * @param {string} [args.provider] - carried provider (kept on the new row)
 * @param {string} [args.model] - carried model
 * @returns {{ payload, row, prologue }} payload is store-shaped (conversationsApi.save);
 *   row mirrors the persisted row so callers can navigate into it immediately.
 */
export const buildChainedSaveRow = ({ template, parent, provider = null, model = null }) => {
  const parentSettings = parent?.settings || {};
  const chapter = ((parentSettings.chain && parentSettings.chain.chapter) || 1) + 1;
  const root = chainRootName(parentSettings, parent?.conversationName);
  const saveRoot = `${root} — Chapter ${chapter}`;
  const completedCampaigns = [
    ...(parentSettings.completedCampaigns || []),
    resolveCompletedTemplateId(parentSettings),
  ].filter(Boolean);

  const spec = specFromTemplate(template);
  const launch = launchCampaign(spec, {
    party: parent?.heroes || [],
    chainFrom: {
      parentSaveId: parent?.sessionId || null,
      chapter,
      completedCampaigns,
      saveName: saveRoot,
    },
  });

  // Starting position, with the tile marked explored (mirrors useGameMap's
  // fresh-map branch, which this pre-built save bypasses on load).
  const playerPosition = resolveStartingPosition(launch.mapData);
  if (launch.mapData[playerPosition.y]?.[playerPosition.x]) {
    launch.mapData[playerPosition.y][playerPosition.x].isExplored = true;
  }

  const prologue = composePrologue({
    previousSummary: parent?.summary || '',
    previousSettings: parentSettings,
    party: launch.party,
    spec,
    chapter,
  });

  const sub_maps = buildSubMapsPayload({
    currentTownMap: null,
    townPlayerPosition: null,
    currentTownTile: null,
    isInsideTown: false,
    currentMapLevel: 'world',
    townMapsCache: launch.townMapsCache,
    visitedBiomes: [],
    visitedTowns: [],
    movesSinceEncounter: 0,
    currentSiteMap: null,
    sitePlayerPosition: null,
    currentSiteTile: null,
    isInsideSite: false,
    siteMapsCache: {},
  });

  // Same payload shape useGamePersistence sends, so both backends (CF Worker and
  // the guest IndexedDB store) treat this exactly like a normal save.
  const payload = {
    sessionId: launch.gameSessionId,
    timestamp: new Date().toISOString(),
    conversationName: buildSaveName(saveRoot),
    conversation: [{ role: 'ai', content: prologue }],
    provider,
    model,
    gameSettings: launch.settings,
    selectedHeroes: launch.party,
    currentSummary: '',
    worldMap: launch.mapData,
    playerPosition,
    hasAdventureStarted: true,
    sub_maps,
  };

  return { payload, row: mapPayloadToRow(payload), prologue };
};

// Best-effort additive stamp on the completed save so Saved Games can badge it as
// continued. Read-modify-write of the full row; any failure is swallowed because the
// parent save must never be put at risk by the chaining flow.
const stampParentContinued = async (parentSessionId, childSessionId) => {
  const parentRow = await conversationsApi.getById(parentSessionId);
  if (!parentRow) return;
  let settings = parentRow.game_settings;
  if (typeof settings === 'string') {
    try { settings = JSON.parse(settings); } catch (e) { settings = null; }
  }
  if (!settings || typeof settings !== 'object') return; // unreadable: do not risk a rewrite
  await conversationsApi.save({
    sessionId: parentSessionId,
    timestamp: parentRow.timestamp,
    conversationName: parentRow.conversation_name,
    conversation: parentRow.conversation_data || [],
    provider: parentRow.provider || null,
    model: parentRow.model || null,
    gameSettings: { ...settings, continuedInSessionId: childSessionId },
    selectedHeroes: parentRow.selected_heroes || null,
    currentSummary: parentRow.summary || null,
    worldMap: parentRow.world_map || null,
    playerPosition: parentRow.player_position || null,
    sub_maps: parentRow.sub_maps || null,
  });
};

/**
 * Create and persist the next chapter's save, then hand back the row for
 * navigation. The parent save is untouched except the optional additive
 * `continuedInSessionId` stamp (best-effort, never blocks the chain).
 */
export const startChainedCampaign = async ({ template, parent, provider = null, model = null }) => {
  const { payload, row } = buildChainedSaveRow({ template, parent, provider, model });

  await conversationsApi.save(payload);

  try {
    localStorage.setItem('activeGameSessionId', row.sessionId);
  } catch (e) { /* storage may be blocked; the navigation state still carries the row */ }

  try {
    if (parent?.sessionId) await stampParentContinued(parent.sessionId, row.sessionId);
  } catch (e) {
    logger.warn('Could not stamp parent save as continued (non-fatal):', e);
  }

  return row;
};
