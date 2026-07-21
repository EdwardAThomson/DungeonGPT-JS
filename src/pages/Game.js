import React, { useContext, useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import SettingsContext from "../contexts/SettingsContext";
import { useAuth } from '../contexts/AuthContext';
import { useGuidedTour } from '../contexts/GuidedTourContext';
import { useModal } from '../contexts/ModalContext';
import { checkForEncounter, rollSiteWanderingEncounter } from '../utils/encounterGenerator';
import { encounterTemplates } from '../data/encounters';
import { isTownTileWalkable } from '../utils/townMapGenerator';
import useGameSession from '../hooks/useGameSession';
import useGameMap from '../hooks/useGameMap';
import useGameInteraction from '../hooks/useGameInteraction';
import useGamePersistence from '../hooks/useGamePersistence';
import useRagSync from '../hooks/useRagSync';
import { getTile } from '../utils/mapGenerator';
import PartySidebar from '../components/PartySidebar';
import GameMainPanel from '../components/GameMainPanel';
import GameModals from '../components/GameModals';
import ModalShell from '../components/ModalShell';
import { calculateMaxHP, shortRest, longRest } from '../utils/healthSystem';
import { addGold, addItem, ITEM_CATALOG } from '../utils/inventorySystem';
import { replaceHeroInParty, normalizeParty, heroUid } from '../utils/partyUtils';
import { composeMovementNarrativePrompt, composeNpcMeetingPrompt } from '../game/promptComposer';
import { composeLocalMovementNarrative, composeLocalAmbientNarrative, composeNpcMeeting } from '../game/localNarrator';
import { composeRewardSentence, composeLootSentence, narrateRewardMessages } from '../game/rewardNarrator';
import { getStepHint, getQuestObjectiveStep, summarizeQuestReward, describeTurnInTarget } from '../game/questHints';
import { generateMovementNarrative } from '../game/movementController';
import { computeWalkPath, runTileWalk, TILE_STEP_MS } from '../game/tileWalk';
import { stepMobs, spawnWanderingMob, countActiveWanderingMobs, WANDERING_MOB_CAP } from '../game/mobMovement';
import { buildSaveName } from '../game/saveController';
import { conversationsApi } from '../services/conversationsApi';
import {
  applyWorldMapMove,
  buildPendingNarrativeTile,
  buildPoiEncounter,
  getAreaIdentifiers,
  getAreaVisitState,
  isAdjacentWorldMove,
  trackAreaVisits
} from '../game/worldMoveController';
import {
  ageNarrativeHook,
  applyEncounterOutcomeToParty,
  applyPartyRewardsToAll,
  applyTeamEncounterOutcomeToParty,
  planWorldTileEncounterFlow,
  formatEncounterPenaltyLog,
  formatEncounterRewardLog,
  isEncounterVictory,
  isFleeOutcome,
  getFleeReposition
} from '../game/encounterController';
import { resolveProviderAndModel } from '../llm/modelResolver';
import { appendLedgerEvents } from '../game/heroLedger';
import { healPartyUpward, reconcileHeroWithLedger } from '../game/heroInvariants';
import { checkMilestoneCompletion, getMilestoneRewards, getMilestoneBossForTile, getMilestoneItemForTile, getMilestoneLocationForTile, migrateNarrativeMilestones } from '../game/milestoneEngine';
import { locationKey, retainLocationLocks } from '../game/skillCheck';
import { recordItemDiscoveries, recordEnemyDiscovery, seedCodexFromParty, getBestiaryEntries, findBestiaryMatch, slugify as slugifyCodexKey } from '../game/codexEngine';
import { buyItem, sellItem } from '../game/shopController';
import { checkSideQuestEvent, acceptSideQuest, getActiveSiteObjectives, getActiveGatherResources, turnInQuest, getRevealedSiteTypes, effectivePartyLevel, pickOfferableSideQuest, resolveQuestOrigin, stampQuestOrigin } from '../game/questEngine';
import { buildInSaveContinuation, applyContinuationToSettings, healPartyForNextChapter } from '../game/campaignChain';
import ContinueLegendPicker from '../components/ContinueLegendPicker';
import { QUEST_ITEM_ICON_FROM } from '../data/sideQuests';
import { embedAndStore, query as ragQuery } from '../game/ragEngine';
import { createLogger } from '../utils/logger';
import { resolveProfilePicture } from '../utils/assetHelper';

const logger = createLogger('game');

const SaveConfirmationModal = () => {
  const { data, close } = useModal('saveConfirmation');
  const [root, setRoot] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [renamed, setRenamed] = useState(false);

  useEffect(() => {
    if (data) {
      setRoot(data.root || '');
      setDisplayName(data.title || '');
      setRenamed(false);
    }
  }, [data]);

  const applyRename = async () => {
    const clean = root.trim();
    if (!clean || !data?.onRename) return;
    await data.onRename(clean);
    setDisplayName(buildSaveName(clean));
    setRenamed(true);
  };

  const status = data?.status || 'saved';
  const isSuccess = status === 'saved' || status === 'nochange' || status === 'savedLocal';
  let heading, headingColor, blurb;
  if (status === 'error') {
    heading = '⚠ Save failed';
    headingColor = 'var(--state-error, #d9534f)';
    blurb = 'Your game could not be saved to this browser. Storage may be blocked (a private window?) or full. Try again, or free up space.';
  } else if (status === 'savedLocal') {
    // Honest fallback: the write landed locally for an account-holding player
    // (auth absent or unreachable). A warning, not an error: progress is safe.
    heading = '⚠ Saved on this device';
    headingColor = 'var(--state-warning, #e0a800)';
    blurb = 'Your account could not be reached, so this save is stored on this device for now. It will sync to your account automatically. Saved as:';
  } else if (status === 'forked') {
    // Rev conflict (SAVE_SYNC_PLAN Phase 3, §6.2): honest fork, nothing lost.
    // No rename UI here: renaming would target the adopted cloud row, not the
    // parked copy this session now saves to.
    heading = '⚠ Saved as a separate copy';
    headingColor = 'var(--state-warning, #e0a800)';
    blurb = 'Another device advanced this save while you were playing here. Your local progress was preserved as a separate save ("diverged on this device") in your saved games, and this device will keep saving to that copy. Nothing was lost.';
  } else if (status === 'skipped') {
    heading = 'Nothing to save yet';
    headingColor = 'var(--text)';
    blurb = 'Begin your adventure before saving.';
  } else if (status === 'nochange') {
    heading = '✓ Already saved';
    headingColor = 'var(--state-success)';
    blurb = 'No new changes since your last save. Your progress is safe as:';
  } else {
    heading = '✓ Game Saved!';
    headingColor = 'var(--state-success)';
    blurb = 'Your progress has been saved as:';
  }

  return (
    <ModalShell modalId="saveConfirmation" ariaLabel="Save Confirmation" style={{ maxWidth: '420px', textAlign: 'center' }}>
      <h3 style={{ marginBottom: '15px', color: headingColor }}>{heading}</h3>
      <p style={{ marginBottom: '10px', color: 'var(--text)' }}>
        {blurb}
      </p>

      {isSuccess && (
        <>
          <p style={{ marginBottom: '8px', fontWeight: 'bold', color: 'var(--primary)' }}>
            {displayName}
          </p>
          <p style={{ marginBottom: '18px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {status === 'savedLocal'
              ? '💾 On this device only. It will sync to your account automatically.'
              : data?.signedIn
                ? '☁️ Saved to your account (syncs across your devices)'
                : '💾 Saved on this device (this browser)'}
          </p>

          <div style={{ textAlign: 'left', marginBottom: '20px' }}>
            <label htmlFor="save-root-name" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Campaign name
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                id="save-root-name"
                type="text"
                value={root}
                onChange={(e) => { setRoot(e.target.value); setRenamed(false); }}
                maxLength={60}
                placeholder="Adventure"
                style={{ flex: 1, padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
              />
              <button onClick={applyRename} className="secondary-button" disabled={!root.trim()} style={{ whiteSpace: 'nowrap' }}>
                Rename
              </button>
            </div>
            <p style={{ fontSize: '0.78rem', opacity: 0.7, marginTop: '6px' }}>
              The date and time are added automatically. {renamed ? '✓ Renamed.' : ''}
            </p>
          </div>
        </>
      )}

      <button onClick={close} className="primary-button" style={{ padding: '10px 30px' }}>
        Continue
      </button>
    </ModalShell>
  );
};

const QuestOfferModal = () => {
  const { data, close } = useModal('questOffer');
  const quest = data?.quest;
  // Same modal, source-flavoured heading: a town Quest Board posting vs a travelling rumour.
  const heading = data?.source === 'board' ? '📜 A Posting Catches Your Eye' : '📜 A Rumour Reaches You';
  // Derive the informative bits from live quest data so an accept is an informed choice:
  // the objective step + its "how do I do this?" hint (reused from the journal so the
  // wording stays consistent), the giver's venue, and a full reward preview.
  const objective = getQuestObjectiveStep(quest);
  const objectiveHint = objective ? getStepHint(objective, quest) : '';
  // "From" the giver: prefer the town's ACTUAL generated building name (a proper noun,
  // e.g. a specific guildhall) when known, else the generic building label; the origin
  // town supplies the specificity ("the guild in Millhaven"), addressing playtest #1a.
  const giverBase = quest?.giver?.buildingName || describeTurnInTarget(quest?.giver?.building);
  const giverLabel = giverBase
    ? (quest?.giver?.town ? `${giverBase} in ${quest.giver.town}` : giverBase)
    : '';
  const rewardTotals = summarizeQuestReward(quest);
  const rewardItemNames = (rewardTotals.items || []).map((id) => (ITEM_CATALOG[id]?.name) || id);
  const rewardSentence = composeRewardSentence({
    xp: rewardTotals.xp, gold: rewardTotals.gold, items: rewardItemNames, xpPartyWide: true
  });
  return (
    <ModalShell modalId="questOffer" ariaLabel="Quest Offer" style={{ maxWidth: '460px' }}>
      <h3 className="rumour-heading">{heading}</h3>
      <p className="rumour-title">{quest?.title}</p>
      {(quest?.giver?.hook || quest?.description) && (
        <p className="rumour-hook">"{quest?.giver?.hook || quest?.description}"</p>
      )}
      <div className="rumour-details">
        {giverLabel && (
          <p className="rumour-detail"><span className="rumour-detail-label">From</span>{giverLabel}</p>
        )}
        {objective?.text && (
          <p className="rumour-detail"><span className="rumour-detail-label">Objective</span>{objective.text}</p>
        )}
        {objectiveHint && (
          <p className="rumour-detail"><span className="rumour-detail-label">Where</span>{objectiveHint}</p>
        )}
        {rewardSentence && (
          <p className="rumour-detail"><span className="rumour-detail-label">Reward</span>{rewardSentence}</p>
        )}
      </div>
      <div className="rumour-actions">
        <button className="primary-button" onClick={() => { data?.onAccept?.(); close(); }}>Accept the Quest</button>
        <button className="secondary-button" onClick={close}>Not now</button>
      </div>
    </ModalShell>
  );
};

const Game = ({ resumeConversation = null }) => {
  const { state } = useLocation();
  // On a hard reload BrowserRouter restores location.state, but that is the STALE starting
  // snapshot (initial heroes / generated map / seed from when the game began). When the
  // resume gate hands us a saved row, that row is authoritative, so ignore the stale router
  // state entirely and hydrate only from resumeConversation. This mirrors the Saved Games
  // "Load Game" path (which carries just loadedConversation). Reading the stale generatedMap
  // here would silently revert map/position progress made since the game began.
  const effectiveState = resumeConversation ? null : state;
  const { selectedHeroes: stateHeroes, loadedConversation: stateLoadedConversation, worldSeed: stateSeed, gameSessionId: stateGameSessionId, generatedMap: stateGeneratedMap, townMapsCache: stateTownMapsCache } = effectiveState || { selectedHeroes: [], loadedConversation: null, worldSeed: null, gameSessionId: null, generatedMap: null, townMapsCache: null };
  const loadedConversation = resumeConversation || stateLoadedConversation;
  // Load-time hero check (SAVE_SYNC_PLAN.md 9.1): normalize + backfill as before,
  // then verify each hero's mechanics invariants and self-heal UPWARD (level from
  // xp, maxHP from the formula, HP clamp, dangling equipment, negative floors).
  // When the save carries a grant ledger (9.2, settings.heroLedger) the heroes are
  // also reconciled against it, raising xp/gold snapshots that regressed below the
  // ledgered sums. Computed once in the lazy initializer so the first render
  // already shows the healed party; the report is stashed here and surfaced as one
  // system line by the startup effect below. Never throws: any failure falls back
  // to the unhealed heroes.
  const [initialPartyCheck] = useState(() => {
    // Normalize first (de-dupe + migrate legacy characterId -> heroId), then backfill
    // progression fields. normalizeParty repairs saves corrupted by the old hero-overwrite bug.
    const normalized = normalizeParty(loadedConversation?.selected_heroes || stateHeroes || []);
    const heroes = normalized.map(hero => {
      if (hero.xp === undefined) {
        // Use healthSystem's calculateMaxHP for consistency
        const maxHP = hero.maxHP || calculateMaxHP(hero);
        return {
          ...hero,
          xp: hero.xp || 0,
          level: hero.level || 1,
          gold: hero.gold || 0,
          inventory: hero.inventory || [],
          maxHP,
          currentHP: hero.currentHP ?? maxHP
        };
      }
      return hero;
    });
    try {
      const savedSettings = typeof loadedConversation?.game_settings === 'string'
        ? JSON.parse(loadedConversation.game_settings)
        : loadedConversation?.game_settings;
      const ledger = Array.isArray(savedSettings?.heroLedger) ? savedSettings.heroLedger : null;
      const { party, healed } = healPartyUpward(heroes);
      let finalParty = party;
      const healedMessages = [...healed];
      const reportedMessages = [];
      if (ledger && ledger.length > 0) {
        finalParty = finalParty.map(hero => {
          const result = reconcileHeroWithLedger(hero, ledger);
          healedMessages.push(...result.healed);
          reportedMessages.push(...result.reported);
          return result.hero;
        });
      }
      return { heroes: finalParty, healedMessages, reportedMessages };
    } catch (err) {
      logger.error('Hero invariant check failed on load; using heroes as loaded', err);
      return { heroes, healedMessages: [], reportedMessages: [] };
    }
  });
  const [selectedHeroes, setSelectedHeroes] = useState(initialPartyCheck.heroes);

  // Robust seed extraction
  const settingsObj = typeof loadedConversation?.game_settings === 'string'
    ? JSON.parse(loadedConversation.game_settings)
    : loadedConversation?.game_settings;
  const worldSeed = settingsObj?.worldSeed || stateSeed;

  const subMapsObj = typeof loadedConversation?.sub_maps === 'string'
    ? JSON.parse(loadedConversation.sub_maps)
    : (loadedConversation?.sub_maps || loadedConversation?.subMaps);

  const {
    settings,
    setSettings,
    selectedProvider,
    setSelectedProvider,
    selectedModel,
    setSelectedModel,
    assistantProvider,
    setAssistantProvider,
    assistantModel,
    setAssistantModel
  } = useContext(SettingsContext);

  // Reload rehydration for an unsaved fresh game. On a hard reload the world map and
  // gameSessionId survive because they ride router navigation state, but the campaign
  // settings (milestones/story/goal/tone) live only in the in-memory SettingsContext
  // and reset to {}. NewGame stashed the launch snapshot in sessionStorage keyed by
  // the gameSessionId; when the context is empty AND we have a restored session/map
  // but NO saved row (loadedConversation), read it back so the journal and the AI
  // opening are grounded instead of falling back to a bare templated scene. Runs once;
  // all sessionStorage access is guarded (storage can throw in private mode).
  const launchRehydratedRef = useRef(false);
  useEffect(() => {
    if (launchRehydratedRef.current) return;
    let gsId = stateGameSessionId;
    try {
      if (!gsId) gsId = localStorage.getItem('activeGameSessionId');
    } catch (e) { /* private mode: no fallback id */ }
    const hasRestoredSession = !!(gsId || stateGeneratedMap);
    if (loadedConversation || !hasRestoredSession) return;
    if (Object.keys(settings).length !== 0) return;
    if (!gsId) return;
    launchRehydratedRef.current = true;
    try {
      const raw = sessionStorage.getItem(`dgpt:launchSettings:${gsId}`);
      if (raw) {
        setSettings(JSON.parse(raw));
      }
    } catch (e) {
      logger.warn('Could not rehydrate launch settings snapshot', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, loadedConversation]);

  // Cleanup: once a real saved row is loaded, the launch snapshot for that session is
  // stale (the save supersedes it), so drop it. Conservative on purpose: we never
  // remove it merely because settings are non-empty in some render, since a reload
  // before the first save still needs it.
  useEffect(() => {
    const gsId = loadedConversation?.sessionId || stateGameSessionId;
    if (!loadedConversation || !gsId) return;
    try {
      sessionStorage.removeItem(`dgpt:launchSettings:${gsId}`);
    } catch (e) {
      logger.debug('Could not clear launch settings snapshot', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Modal Manager hooks ---
  const { open: openHowToPlay } = useModal('howToPlay');
  const { open: openHero } = useModal('hero');
  const { open: openDice } = useModal('dice');
  const { open: openSaveConfirmation } = useModal('saveConfirmation');
  const { open: openEncounterInfo, close: closeEncounterInfo } = useModal('encounterInfo');
  const { open: openQuestOffer } = useModal('questOffer');
  const { open: openEncounterAction, close: closeEncounterAction, data: encounterActionData } = useModal('encounterAction');
  // #52: the Adventure Book hub (Journal / Side Quests / Codex / Party / AI). It
  // replaced the boolean-state Journal (settings) modal and the Party Inventory
  // modal; both the Journal and Inventory header buttons open it at their tab.
  const { open: openAdventureBook, close: closeAdventureBook } = useModal('adventureBook');

  const [movesSinceEncounter, setMovesSinceEncounter] = useState(
    subMapsObj?.movesSinceEncounter || 0
  );
  const [pendingNarrativeTile, setPendingNarrativeTile] = useState(null);
  // Smart narration (B3b): movement appends a local line; full AI narration is on
  // demand (Look-around / typed actions). A narrative-tier encounter detected on a
  // move is parked here so an on-demand Look-around can still weave it into the AI
  // description (movement itself no longer auto-narrates it).
  const [pendingLookEncounter, setPendingLookEncounter] = useState(null);
  // #35/#37: once a Look-around narration consumes a parked hook, the encounter's
  // suggestedActions are offered as tappable chips (plus a small image) under that
  // narration message. TRANSIENT ONLY: keyed by message object identity, never
  // written into the saved conversation, so reloaded saves never show stale chips.
  // Shape: { message, encounter, hookMoves }, aged/expired like the parked hook.
  const [lookHookChips, setLookHookChips] = useState(null);
  // Bumped on each guest/local Look-around so repeated looks at the same tile vary.
  const lookNonceRef = useRef(0);
  // Rolling window of recently-shown local movement lines, so templated biome prose
  // doesn't repeat back to back or too soon (passed to composeLocalMovementNarrative).
  const recentNarrationRef = useRef([]);
  const [aiNarrativeEnabled, setAiNarrativeEnabled] = useState(true);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [isMobilePartySidebarOpen, setIsMobilePartySidebarOpen] = useState(false);

  // The AI Dungeon Master requires auth; guests play the local mechanical loop
  // (exploration + deterministic combat) and the AI is the sign-in upsell.
  // authLoading is true until AuthContext's initial getSession() resolves. During a
  // reload the Supabase session re-hydrates asynchronously, so `user` is briefly null
  // even for a signed-in player; treating that window as "guest" would fire the no-AI
  // opening. We keep aiAvailable a live !!user (guests really do lack AI), but pass
  // authReady down so the Start Adventure action can defer committing to the guest
  // path until auth has actually finished loading.
  const { user, loading: authLoading } = useAuth();
  const aiAvailable = !!user;
  const authReady = !authLoading;
  // Reopen the map after an encounter that interrupted exploration.
  const reopenMapAfterEncounterRef = useRef(false);
  // Tile-by-tile walk plumbing (town + site movement). The active walk's cancel handle
  // lives here so a fresh click (or leaving the sub-map / unmount) can stop it. Encounter
  // rolls inside the async stepping callback read movesSinceEncounter/settings from refs,
  // not the render-time closure, so per-step values never go stale mid-walk.
  const walkCancelRef = useRef(null);
  const movesSinceEncounterRef = useRef(movesSinceEncounter);
  // Persistent town step counter so the "roll only every 3rd tile" throttle survives across
  // clicks. The local `index` passed to runTownStep resets to 0 on every runTileWalk call
  // (tileWalk.js), so short multi-click town hops rolled on the FIRST tile every time,
  // defeating the throttle (playtest 2026-07-18). This ref counts steps across the visit.
  const townStepCounterRef = useRef(0);
  // Tavern brawls fire only on VISITING a tavern/inn (not random town walking), on their
  // own cooldown: the town-step-clock at the last brawl. Requires TAVERN_BRAWL_COOLDOWN
  // steps between brawls so back-to-back tavern visits don't brawl every time.
  const tavernBrawlAtRef = useRef(-999);
  const settingsRef = useRef(settings);
  useEffect(() => { movesSinceEncounterRef.current = movesSinceEncounter; }, [movesSinceEncounter]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // #76 load-time heal: retire the AI-judged `narrative` milestone by migrating legacy saves'
  // narrative milestones to their engine-completable type (talk/location/item) off their
  // spawn, so removing the completion-marker path never strands an old objective (or its
  // campaign — completion needs EVERY milestone done). Idempotent: migrateNarrativeMilestones
  // returns the same ref when there's nothing to migrate, so this writes once then no-ops;
  // the next autosave persists it. New games already author engine types, so this is inert
  // for them.
  useEffect(() => {
    const ms = settings?.milestones;
    if (!ms || migrateNarrativeMilestones(ms) === ms) return;
    setSettings(prev => ({ ...prev, milestones: migrateNarrativeMilestones(prev.milestones) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.milestones]);

  // Moving-mob plumbing for site walks. Like the counters above, these read from refs so
  // the async per-step callback (runSiteStep) sees the freshest mob positions / grid
  // mid-walk instead of the stale render-time closure. The mob objects are mutated in
  // place (they share the cached site's mobs array), so the cache stays in sync and a
  // leave/re-enter keeps positions + defeats. activeSiteMobIdRef remembers which mob
  // triggered the current fight so handleEncounterResolve can mark it defeated on victory.
  const siteMobsRef = useRef([]);
  const siteMapDataRef = useRef(null);
  const activeSiteMobIdRef = useRef(null);
  // Pre-encounter position for FLEE/disengage. A move-triggered encounter fires AFTER the
  // party has already stepped ONTO the threat tile, so to flee we must send them back to
  // the tile they came from. Captured at move time as { level: 'world'|'town'|'site', x, y }
  // and restored in handleEncounterResolve when the outcome is a flee. Stationary encounters
  // (POI boss, look-hook chip) clear it to null so a flee there never teleports to a stale tile.
  const preEncounterPosRef = useRef(null);
  // Monotonic move counter that clocks the quest-offer cooldown (rumour + Quest Board
  // share it via pickOfferableSideQuest). Bumped once per move (world tile, town step,
  // site step). It is NOT persisted every move (that would churn settings); instead the
  // clock is written into settings.questOfferClock alongside settings.lastQuestOfferAt
  // whenever an offer is actually shown, and reseeded from that on load. After a reload
  // the clock therefore reads conservatively (never below the last offer), so at worst it
  // re-applies one cooldown window rather than letting offers flood.
  const questOfferClockRef = useRef(settings?.questOfferClock || 0);
  // Resumed saves hydrate SettingsContext AFTER mount, so seed the clock from the
  // persisted value once settings arrive (before the player can move). max() keeps any
  // (rare) pre-hydration local increments; a fresh game has no questOfferClock -> 0.
  const questClockSeededRef = useRef(false);
  useEffect(() => {
    if (questClockSeededRef.current) return;
    if (settings && Object.keys(settings).length > 0) {
      questOfferClockRef.current = Math.max(questOfferClockRef.current, settings.questOfferClock || 0);
      questClockSeededRef.current = true;
    }
  }, [settings]);
  // Guided tour: advance the in-game coachmarks (Start Adventure -> Map) as the
  // player acts.
  const { tourActive, activeStep: tourStep, advanceStep: advanceTour } = useGuidedTour();

  // --- HOOKS ---
  const {
    sessionId,
    hasAdventureStarted,
    setHasAdventureStarted,
    saveConversationToBackend,
    sideQuestsBackfilled
  } = useGameSession(loadedConversation, setSettings, setSelectedProvider, setSelectedModel, stateGameSessionId);

  // Pass dummy/empty functions for now where we handle logic in Game.js wrapper
  // Biome theme for lazily-generated town maps (Phase 2b). Falls back to the raw parsed
  // settings (loaded saves) and finally 'grassland' so older saves are unaffected.
  const mapTheme = settings?.theme || settingsObj?.theme || 'grassland';
  const mapHook = useGameMap(loadedConversation, hasAdventureStarted, false, () => { }, worldSeed, stateGeneratedMap, settings?.requiredBuildings, stateTownMapsCache, mapTheme, getActiveSiteObjectives(settings?.sideQuests), settings?.milestones, getActiveGatherResources(settings?.sideQuests));

  // #83 Phase 2: entering a town/site clears every OTHER location's spent check locks —
  // arriving somewhere else is what resets a prior place's approaches. Does NOTHING on the
  // world map, so stepping out of a town and straight back in resets nothing (no cheese).
  // retainLocationLocks returns the same array when nothing drops, so this write no-ops then.
  // MUST come after mapHook is declared (its fields are read in the dependency array).
  useEffect(() => {
    const key = locationKey({
      isInsideTown: mapHook.isInsideTown,
      townName: mapHook.currentTownTile?.townName,
      isInsideSite: mapHook.isInsideSite,
      siteName: mapHook.currentSiteMap?.name,
    });
    if (key === 'world') return;
    setSettings(prev => {
      const kept = retainLocationLocks(prev?.checkLocks, key);
      return kept === prev?.checkLocks ? prev : { ...prev, checkLocks: kept };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapHook.isInsideTown, mapHook.currentTownTile?.townName, mapHook.isInsideSite, mapHook.currentSiteMap?.name]);

  // Cancel any in-progress town/site walk when the sub-map changes (leaving a town/site
  // flips currentMapLevel back to 'world') or the component unmounts, so no scheduled step
  // fires against a torn-down map. Declared after mapHook so it does not read it in the TDZ.
  useEffect(() => () => {
    if (walkCancelRef.current) { walkCancelRef.current(); walkCancelRef.current = null; }
  }, [mapHook.currentMapLevel]);

  // Keep the moving-mob refs fresh so runSiteStep (async, stale closure) reads the latest
  // mob array + grid. Declared after mapHook so the dependency does not read it in the TDZ.
  useEffect(() => {
    siteMobsRef.current = mapHook.currentSiteMap?.mobs || [];
    siteMapDataRef.current = mapHook.currentSiteMap?.mapData || null;
  }, [mapHook.currentSiteMap]);

  const interactionHook = useGameInteraction(
    loadedConversation,
    settings,
    setSettings,
    selectedProvider,
    selectedModel,
    selectedHeroes,
    mapHook.worldMap,
    mapHook.playerPosition,
    hasAdventureStarted,
    setHasAdventureStarted,
    {
      isInsideTown: mapHook.isInsideTown,
      currentTownTile: mapHook.currentTownTile,
      currentTownMap: mapHook.currentTownMap,
      townPlayerPosition: mapHook.townPlayerPosition,
      // #83 Phase 2: site identity so a free-text check inside a cave/ruin keys its lock to
      // that site (not a generic 'world'), matching the location-change lock clear below.
      isInsideSite: mapHook.isInsideSite,
      currentSiteName: mapHook.currentSiteMap?.name
    },
    sessionId,
    aiAvailable,
    // Talk-milestone dual completion: when the AI marker resolves a present talk NPC,
    // route it through the SAME engine event as the Talk button so rewards/codex/ledger/
    // save/message and idempotency are identical. checkMilestoneEvent is defined below;
    // this wrapper defers the reference so the hoisted binding is used at call time.
    (npcId) => checkMilestoneEvent({ type: 'npc_talked', npcId }, selectedHeroes),
    authReady
  );
  const { performSave, saveStatus, isSaving } = useGamePersistence({
    sessionId,
    hasAdventureStarted,
    loadedConversation,
    saveConversationToBackend,
    interactionHook,
    mapHook,
    settings,
    selectedProvider,
    selectedModel,
    selectedHeroes,
    movesSinceEncounter,
    logger
  });

  // --- RAG Sync (backfill on load) ---
  const { ragStatus, isBackfilling, backfillProgress } = useRagSync(
    sessionId,
    interactionHook.conversation,
    hasAdventureStarted,
    aiAvailable
  );

  // Advance the tour from the "Start Adventure" coachmark to the "Map" coachmark
  // once the adventure has begun.
  useEffect(() => {
    if (tourActive && hasAdventureStarted && tourStep?.id === 'start-adventure') {
      advanceTour();
    }
  }, [tourActive, hasAdventureStarted, tourStep, advanceTour]);

  // #45 side-quest backfill notice: when loading topped up the save from the enlarged
  // quest pool (useGameSession hydration), drop ONE subtle system line. The backfilled
  // quests themselves surface organically through the existing rumour/giver flows; no
  // modal, no list. The ref throttles to once per mount, and the sideQuestPoolSize
  // stamp means the whole event fires at most once per pool growth anyway.
  const backfillAnnouncedRef = useRef(false);
  useEffect(() => {
    if (!sideQuestsBackfilled || backfillAnnouncedRef.current) return;
    backfillAnnouncedRef.current = true;
    interactionHook.setConversation(prev => [...prev, {
      role: 'system',
      content: '🗨️ New rumours have reached the region.'
    }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideQuestsBackfilled]);

  // 9.1 visible honesty: if the load-time invariant check healed anything, say so
  // ONCE, in one system line (same philosophy as the save-fallback notice and the
  // "New rumours" backfill line above). Item-level ledger reports are log-only:
  // consumables get spent in normal play, so a missing granted potion is not news.
  const healAnnouncedRef = useRef(false);
  useEffect(() => {
    if (healAnnouncedRef.current) return;
    healAnnouncedRef.current = true;
    const { healedMessages, reportedMessages } = initialPartyCheck;
    if (reportedMessages.length > 0) {
      logger.info(`[HERO LEDGER] ${reportedMessages.join(' · ')}`);
    }
    if (healedMessages.length === 0) return;
    logger.info(`[HERO INVARIANTS] Restored: ${healedMessages.join(' · ')}`);
    interactionHook.setConversation(prev => [...prev, {
      role: 'system',
      content: `🛡️ Restored: ${healedMessages.join(' · ')}`
    }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Hero grant ledger (SAVE_SYNC_PLAN.md 9.2) -----------------------------
  // Every irreversible hero gain appends { t, heroId, kind, amount?|key?, source }
  // into settings.heroLedger at the same chokepoints that record codex
  // discoveries. Gold SPENDS are appended as negative amounts so the ledgered
  // gold sum keeps tracking real gold (reconciliation raises gold up to the sum).
  // Functional setSettings, additive and capped inside appendLedgerEvents; old
  // saves without a ledger start one on their first grant.
  const appendHeroLedger = (events, source) => {
    if (!Array.isArray(events) || events.length === 0) return;
    const stamped = events.map(e => ({ ...e, source }));
    setSettings(prev => (prev ? appendLedgerEvents(prev, stamped) : prev));
  };

  // Per-hero gold deltas between two party snapshots, as ledger events. Used for
  // flows that move gold across several heroes at once (pooled shop spending,
  // resurrection costs) where the controller does not report per-hero amounts.
  const goldDeltaEvents = (before, after) => {
    const beforeByUid = new Map((before || []).map(h => [heroUid(h), h.gold || 0]));
    const events = [];
    (after || []).forEach(h => {
      const uid = heroUid(h);
      if (!uid || !beforeByUid.has(uid)) return;
      const delta = (h.gold || 0) - beforeByUid.get(uid);
      if (delta !== 0) events.push({ heroId: uid, kind: 'gold', amount: delta });
    });
    return events;
  };

  // --- Quest chaining: "Continue your legend" (in-save continuation) ---
  // The picker continues the next campaign INSIDE THIS SAVE: the new campaign's
  // POIs/enemies/buildings/NPCs are stamped additively onto the existing world and
  // cached towns (copy-on-write), the settings swap to the new campaign's
  // milestones, the party is healed in place, and a chapter-divider prologue is
  // appended to the ongoing journal. Same sessionId, so RAG memories continue.
  const [legendPicker, setLegendPicker] = useState({ open: false, celebrate: false });
  const [legendLaunching, setLegendLaunching] = useState(false);
  const [legendError, setLegendError] = useState(null);
  const navigate = useNavigate();
  // Auto-celebrate ONLY when the campaign completes during this session. Saves that
  // were already complete at load get the CTA through the Journal banner instead of
  // an auto-modal (retroactive, non-intrusive). Cleared on continuation so the NEXT
  // chapter's completion celebrates again.
  const celebrationBlockedRef = useRef(!!settingsObj?.campaignComplete);
  useEffect(() => {
    if (celebrationBlockedRef.current) return;
    if (settings?.campaignComplete) {
      celebrationBlockedRef.current = true;
      // Let the CAMPAIGN COMPLETE chat message land before the celebration modal.
      const timer = setTimeout(() => setLegendPicker({ open: true, celebrate: true }), 1200);
      return () => clearTimeout(timer);
    }
  }, [settings?.campaignComplete]);

  const handleContinueLegend = (template) => {
    if (legendLaunching) return;
    setLegendLaunching(true);
    setLegendError(null);
    try {
      const chapter = (settings?.currentChapter || settings?.chain?.chapter || 1) + 1;
      const continuation = buildInSaveContinuation({
        template,
        worldMap: mapHook.worldMap,
        townMapsCache: mapHook.townMapsCache,
        worldSeed,
        existingSideQuests: settings?.sideQuests || [],
        party: selectedHeroes,
        chapter
      });

      // Apply the continuation: additive world stamps (copy-on-write), cached-town
      // retro-injection, campaign-settings swap (functional, so chain records
      // derive from the freshest state), party healed in place.
      mapHook.setWorldMap(continuation.mapData);
      mapHook.setTownMapsCache(continuation.townMapsCache);
      setSettings(prev => applyContinuationToSettings(prev, continuation));
      setSelectedHeroes(prev => healPartyForNextChapter(prev));

      // Chapter divider appended to the ONGOING journal (never replaced); embed it
      // so the DM's memory of the new chapter starts immediately.
      interactionHook.setConversation(prev => {
        const updated = [...prev, { role: 'ai', content: continuation.prologue }];
        if (sessionId) {
          embedAndStore(sessionId, continuation.prologue, { msgIndex: updated.length - 1 })
            .catch(err => logger.warn('RAG embed failed (chapter prologue):', err));
        }
        return updated;
      });

      celebrationBlockedRef.current = false; // the new campaign may celebrate later
      setLegendPicker({ open: false, celebrate: false });
      setLegendLaunching(false);
      // Persist promptly (refs pick up the new state after this render).
      setTimeout(() => performSave(), 600);
    } catch (err) {
      logger.error('Failed to continue the campaign in this save', err);
      setLegendError(err?.message || 'Failed to start the next chapter. Please try again.');
      setLegendLaunching(false);
    }
  };

  // Incompatible-geography picks hand off to New Game with the template
  // preselected ("new map = new game": no linked-save machinery).
  const handleLegendNewAdventure = (template) => {
    navigate('/new-game', { state: { preselectTemplateId: template.id } });
  };

  // --- Hero HP Update Handler ---
  const handleHeroUpdate = (updatedHero) => {
    // Match on heroId||characterId (never on a missing id) so a single-hero combat update
    // replaces exactly that hero, not the whole party. See partyUtils for the bug history.
    setSelectedHeroes(prev => replaceHeroInParty(prev, updatedHero));
  };

  // --- Codex (#51): discovery recording -------------------------------------
  // settings.codex = { items: [keys], enemies: [keys] } — additive, persisted with
  // the save (guests included). Items are recorded at the acquisition chokepoints
  // (site loot, objective grants, purchases, encounter/milestone/side-quest
  // rewards); enemies when an encounter resolves in handleEncounterResolve.
  // First discoveries get one "📚 New codex entry" system line PER GRANT (bulk
  // loot announces once); announcedCodexRef stops re-announcements when several
  // grants land before settings re-renders.
  const announcedCodexRef = useRef(new Set());

  const recordItemsInCodex = (itemKeys) => {
    const keys = (itemKeys || []).map(k => slugifyCodexKey(k)).filter(Boolean);
    if (keys.length === 0) return;
    setSettings(prev => {
      const { codex } = recordItemDiscoveries(prev?.codex, keys);
      return codex === prev?.codex ? prev : { ...prev, codex };
    });
    // Announce only entries that exist as codex cards (catalog items), were not
    // already discovered, and haven't been announced this session — quest items
    // are tracked silently. Checked against the current settings snapshot; the
    // announcedCodexRef guard covers grants racing within one render.
    const { added } = recordItemDiscoveries(settings?.codex, keys);
    const toAnnounce = added.filter(k => ITEM_CATALOG[k] && !announcedCodexRef.current.has(`item:${k}`));
    if (toAnnounce.length === 0) return;
    toAnnounce.forEach(k => announcedCodexRef.current.add(`item:${k}`));
    const names = toAnnounce.map(k => ITEM_CATALOG[k].name);
    interactionHook.setConversation(prev => [...prev, {
      role: 'system',
      content: names.length === 1
        ? `📚 New codex entry: ${names[0]}`
        : `📚 New codex entries: ${names.join(', ')}`
    }]);
  };

  const recordEnemyInCodex = (encounter) => {
    if (!encounter) return;
    // Only creatures with a bestiary card count: non-hostile narrative encounters
    // (merchants, strangers, shrines) resolve through the same modal for guests
    // and must not mint phantom "new codex entry" announcements.
    const entry = findBestiaryMatch(getBestiaryEntries(settings?.milestones), encounter);
    if (!entry) return;
    setSettings(prev => {
      const { codex } = recordEnemyDiscovery(prev?.codex, encounter);
      return codex === prev?.codex ? prev : { ...prev, codex };
    });
    const { added } = recordEnemyDiscovery(settings?.codex, encounter);
    const tag = `enemy:${entry.id}`;
    if (added.length === 0 || announcedCodexRef.current.has(tag)) return;
    announcedCodexRef.current.add(tag);
    interactionHook.setConversation(prev => [...prev, {
      role: 'system',
      content: `📚 New codex entry: ${entry.name}`
    }]);
  };

  // Codex back-compat seeding + safety net: anything the party currently carries
  // counts as discovered. Old saves (no settings.codex) get their codex stamped on
  // load from inventory/equipment; any item that slipped in through an unhooked
  // path is captured on the next render. Silent (no fanfare) and cheap — the seed
  // returns the same object when there is nothing new, so this write no-ops.
  useEffect(() => {
    setSettings(prev => {
      if (!prev) return prev;
      const seeded = seedCodexFromParty(prev.codex, selectedHeroes);
      return seeded === prev.codex ? prev : { ...prev, codex: seeded };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHeroes, settings?.codex]);

  // --- Milestone Engine: deterministic completion check ---
  const checkMilestoneEvent = (event, currentParty) => {
    const heroLevel = currentParty?.[0]?.level || 1;

    // --- Side quests (optional parallel chains) — checked first + independently ---
    const sideQuests = settings?.sideQuests;
    if (sideQuests && sideQuests.length > 0) {
      const { updatedSideQuests, completions } = checkSideQuestEvent(sideQuests, event, heroLevel);
      // Persist whenever ANY step advanced, not only on completion. A multi-item gather
      // step ("collect 3 glowing fungi") bumps PROGRESS without completing; gating the
      // write on `completions` discarded that partial progress on every pickup, so a
      // count>1 gather (or defeat-N) quest could never finish (playtest 2026-07-18). The
      // per-quest reference is preserved for unchanged quests (checkSideQuestEvent returns
      // the same object when nothing matched), so an element-wise compare detects the bump.
      // Recompute against prev INSIDE the updater: `updatedSideQuests` came from a snapshot,
      // and successive events in one handler (e.g. a two-item loot bundle) must each apply
      // to the latest state — writing the snapshot wholesale would revert a sibling change.
      const sideQuestsChanged = updatedSideQuests.some((q, i) => q !== sideQuests[i]);
      if (sideQuestsChanged) {
        setSettings(prev => ({
          ...prev,
          sideQuests: checkSideQuestEvent(prev.sideQuests || [], event, heroLevel).updatedSideQuests
        }));
      }
      if (completions.length > 0) {
        let party = currentParty;
        completions.forEach(c => {
          const stepRewards = c.rewards || { xp: 0, gold: 0, items: [] };
          // Quest rewards are party-wide too (#55): full XP each, loot via lead.
          const stepResult = applyPartyRewardsToAll({ party, rewards: stepRewards });
          party = stepResult.updatedParty;
          // #8: display copy only; the machine rewardMessages stay untouched.
          const rewardLines = narrateRewardMessages(stepResult.rewardMessages);
          const grantEvents = [...(stepResult.ledgerEvents || [])];
          if (c.questCompleted && c.questRewards) {
            const questResult = applyPartyRewardsToAll({ party, rewards: c.questRewards });
            party = questResult.updatedParty;
            rewardLines.push(...narrateRewardMessages(questResult.rewardMessages));
            grantEvents.push(...(questResult.ledgerEvents || []));
          }
          appendHeroLedger(grantEvents, `sidequest:${c.questId}`); // grant ledger (9.2)
          // Codex (#51): reward items entering the party's hands are discoveries.
          recordItemsInCodex([...(stepRewards.items || []), ...((c.questCompleted && c.questRewards?.items) || [])]);
          // Surface the XP/loot payout with the completion line (it used to be silent),
          // and mirror it into the site notice when the step completed inside a site.
          const headline = c.questCompleted ? `🎉 Side quest complete: ${c.title}!` : `✓ ${c.milestone.text}`;
          const content = rewardLines.length > 0 ? `${headline}\n${rewardLines.join(' ')}` : headline;
          interactionHook.setConversation(prev => [...prev, { role: 'system', content }]);
          if (mapHook.isInsideSite) mapHook.pushSiteNotice(content);
        });
        setSelectedHeroes(party);
        setTimeout(() => performSave(), 500);
      }
    }

    // --- Main campaign milestones ---
    const milestones = settings?.milestones;
    if (!milestones || milestones.length === 0) return null;

    const result = checkMilestoneCompletion(milestones, event, heroLevel);
    if (!result) return null;

    if (result.type === 'completed') {
      logger.info(`[MILESTONE] Completed: #${result.milestoneId} — ${result.milestone.text}`);
      // Mark the completion BY ID against prev — result.updatedMilestones was computed from
      // a snapshot, and writing it wholesale reverted sibling completions when two events
      // fired before a re-render (the "I had to redo milestones" bug). Legacy saves whose
      // milestones lack ids fall back to the computed array.
      setSettings(prev => {
        const prevMs = prev.milestones || [];
        const hasIds = prevMs.every(m => m && typeof m === 'object' && m.id != null);
        return {
          ...prev,
          milestones: hasIds
            ? prevMs.map(m => (m.id === result.milestoneId ? { ...m, completed: true } : m))
            : result.updatedMilestones
        };
      });
      // Persist promptly — milestone completions previously waited up to 30s for autosave.
      setTimeout(() => performSave(), 500);

      // Milestones are party achievements (#55): full XP to every member;
      // gold/items still pool through the lead.
      const rewards = getMilestoneRewards(result.milestone);
      if (rewards.items.length > 0) recordItemsInCodex(rewards.items); // codex (#51)
      if (rewards.xp > 0 || rewards.gold > 0 || rewards.items.length > 0) {
        const rewardResult = applyPartyRewardsToAll({ party: currentParty, rewards });
        setSelectedHeroes(rewardResult.updatedParty);
        appendHeroLedger(rewardResult.ledgerEvents, `milestone:${result.milestoneId}`); // grant ledger (9.2)
        if (rewardResult.rewardMessages.length > 0) {
          logger.info(`[MILESTONE REWARDS] ${rewardResult.rewardMessages.join(' · ')}`);
        }
      }

      // Chat celebration message (also serves as context for the AI's next narration).
      // #8: seeded templated sentence instead of the flat "+50 XP +12 gold" line
      // (milestone XP is party-wide, #55, so the sentence says so).
      // Resolve item ids to catalog display names so the celebration reads
      // "the Quest Key", not "the quest_key" (mirrors the rumour offer + loot lines).
      const rewardItemNames = (rewards.items || []).map((id) => (ITEM_CATALOG[id]?.name) || id);
      const rewardSentence = composeRewardSentence({
        xp: rewards.xp, gold: rewards.gold, items: rewardItemNames, xpPartyWide: true
      });
      const rewardSummary = rewardSentence ? `\n${rewardSentence}` : '';
      const celebrationMsg = {
        role: 'system',
        content: result.campaignComplete
          ? `🏆 CAMPAIGN COMPLETE! 🏆\n${settings.campaignGoal || 'Victory Achieved!'}\n\nThe tale of your heroic deeds will be sung for generations to come!`
          : `🎉 Milestone Achieved! 🎉\n${result.milestone.text}${rewardSummary}`
      };
      interactionHook.setConversation(prev => [...prev, celebrationMsg]);
      // Milestones completed while exploring a site (e.g. reaching an objective room)
      // must be visible in the map modal too, not just in the hidden chat log.
      if (mapHook.isInsideSite) {
        mapHook.pushSiteNotice(result.campaignComplete
          ? '🏆 CAMPAIGN COMPLETE!'
          : `🎉 Milestone achieved: ${result.milestone.text}${rewardSummary}`);
      }

      if (result.campaignComplete) {
        setSettings(prev => ({ ...prev, campaignComplete: true }));
      }
    } else if (result.type === 'blocked') {
      logger.debug(`[MILESTONE] Blocked: #${result.milestoneId} — needs: ${result.unmetRequirements.map(r => r.text).join(', ')}`);
    } else if (result.type === 'level_blocked') {
      logger.debug(`[MILESTONE] Level blocked: #${result.milestoneId} — needs Lv.${result.requiredLevel}, have Lv.${result.currentLevel}`);
      // Never let a level-gated milestone vanish silently: the trigger matched but the
      // party is under the required level, so completion returns level_blocked. Surface
      // a brief player-facing system line instead of only a debug log (mirrors the
      // milestone celebration path: chat message, plus a site notice when exploring a
      // site). The gate semantics are unchanged; this only makes them visible.
      const deedName = result.milestone.spawn?.name || result.milestone.text;
      const gateMsg = `⚔️ You have bested ${deedName}, but your party must reach level ${result.requiredLevel} before this deed is recognized.`;
      interactionHook.setConversation(prev => [...prev, { role: 'system', content: gateMsg }]);
      if (mapHook.isInsideSite) {
        mapHook.pushSiteNotice(gateMsg);
      }
    }
    // Callers can chain on the result (e.g. a location completion unlocking a boss
    // fight on the same arrival) — setSettings above is async, so this is the only
    // way to see updatedMilestones synchronously.
    return result;
  };

  // Per-tile town effect: move onto the entered tile, then (only on every 3rd entered
  // tile) roll a town encounter for that step. Returns 'halt' (stop the walk here, on
  // the tile the encounter fired) or 'continue'. Reads movesSinceEncounter/settings from
  // refs so successive steps see fresh values.
  //
  // The party MOVES on every tile so the walk animates smoothly, but we only ROLL for an
  // encounter on tiles 0, 3, 6, ... A town crossing is a quiet stroll, not a gauntlet:
  // per-tile rolling made even a short crossing very likely to trigger a fight. Combined
  // with the town pity exemption in shouldTriggerEncounter, this keeps town encounters rare.
  const runTownStep = (pos, index = 0) => {
    // Tile the party is leaving THIS step, captured before the move so a flee from a
    // town encounter can send them back to it (see handleEncounterResolve).
    const fromTownPos = mapHook.townPlayerPosition;
    const moved = mapHook.moveTownPlayerTo(pos.x, pos.y);
    if (!moved) return 'halt'; // unwalkable/unexpected: stop rather than fall through
    questOfferClockRef.current += 1; // clock the quest-offer cooldown

    // Only roll on every 3rd entered tile ACROSS the town visit (persistent counter, not
    // the per-walk `index` which resets each click — playtest 2026-07-18).
    townStepCounterRef.current += 1;
    if (townStepCounterRef.current % 3 !== 0) return 'continue';

    // Synthetic tile the encounter generator recognizes as 'town'.
    const syntheticTownTile = { poi: 'town', biome: 'plains' };
    const townEncounter = checkForEncounter(syntheticTownTile, false, settingsRef.current, movesSinceEncounterRef.current);

    if (townEncounter) {
      movesSinceEncounterRef.current = 0;
      setMovesSinceEncounter(0);
      // Tier-aware, mirroring the world map (planWorldTileEncounterFlow): only IMMEDIATE
      // encounters (e.g. a tavern brawl) open the blocking action modal. Narrative town
      // encounters (market, healer, stranger) are pure FLAVOR — a full fight-style modal
      // that had to be fled to escape blocked town movement every few steps (playtest
      // 2026-07-18). Surface them as a one-line, non-blocking note and keep walking.
      if (townEncounter.encounterTier !== 'immediate') {
        interactionHook.setConversation(prev => [...prev, { role: 'system', content: `🏘️ ${townEncounter.description}` }]);
        return 'continue';
      }
      mapHook.setIsMapModalOpen(false);
      reopenMapAfterEncounterRef.current = true; // reopen once the encounter resolves
      preEncounterPosRef.current = fromTownPos
        ? { level: 'town', x: fromTownPos.x, y: fromTownPos.y }
        : null;
      openEncounterAction({ encounter: townEncounter });
      return 'halt';
    }
    movesSinceEncounterRef.current += 1;
    setMovesSinceEncounter(prev => prev + 1);
    return 'continue';
  };

  // A brawl fires only when the party VISITS a tavern/inn (called from the town
  // building-click flow), never while walking the streets, and on its own cooldown
  // (measured in town-walk steps, so a couple of tavern visits in a row can't both brawl).
  // Returns true when a brawl opened, so the caller skips the normal building view.
  const TAVERN_BRAWL_COOLDOWN = 12;
  const TAVERN_BRAWL_CHANCE = 0.30;
  const handleVisitTavern = (buildingType) => {
    if (buildingType !== 'tavern' && buildingType !== 'inn') return false;
    const now = townStepCounterRef.current;
    if (now - tavernBrawlAtRef.current < TAVERN_BRAWL_COOLDOWN) return false;
    if (Math.random() >= TAVERN_BRAWL_CHANCE) return false;
    tavernBrawlAtRef.current = now;
    // The party walked in, so they stay put; a flee returns them to this tile.
    mapHook.setIsMapModalOpen(false);
    reopenMapAfterEncounterRef.current = true;
    const p = mapHook.townPlayerPosition;
    preEncounterPosRef.current = p ? { level: 'town', x: p.x, y: p.y } : null;
    openEncounterAction({ encounter: { ...encounterTemplates.tavern_brawl, encounterTier: 'immediate' } });
    return true;
  };

  // --- Town Tile Click Wrapper: walk to ANY reachable tile, one step every TILE_STEP_MS,
  // rolling an encounter per step and halting where one fires. ---
  const handleTownTileClick = (clickedX, clickedY) => {
    if (interactionHook.isLoading) return; // no walking while an AI request is in flight
    const townMap = mapHook.currentTownMap;
    const start = mapHook.townPlayerPosition;
    if (!townMap || !start) return;
    if (clickedX === start.x && clickedY === start.y) return;

    // Walkability by tile TYPE (isTownTileWalkable), not the stored `walkable` flag:
    // town maps are cached and never regenerated, so an old save can carry a stale
    // non-walkable flag on a bridge/shore tile. Deriving from type heals that
    // retroactively (only water and buildings block the party).
    const path = computeWalkPath(townMap.mapData, start, { x: clickedX, y: clickedY }, isTownTileWalkable);
    if (path.length === 0) {
      mapHook.setTownError('You cannot reach that tile.');
      return;
    }

    // A new click cancels the in-progress walk and starts fresh from the current position.
    if (walkCancelRef.current) walkCancelRef.current();
    walkCancelRef.current = runTileWalk({
      path,
      stepIntervalMs: TILE_STEP_MS,
      onEnterTile: (pos, index) => runTownStep(pos, index),
    });
  };

  // --- Site Tile Click Wrapper (caves / ruins): fires room content + wandering monsters ---
  const grantSiteLoot = (loot) => {
    if (!loot) return;
    setSelectedHeroes(prev => {
      if (!prev || prev.length === 0) return prev;
      const heroes = [...prev];
      let hero = { ...heroes[0] };
      hero = addGold(hero, loot.gold || 0);
      let inv = hero.inventory || [];
      (loot.items || []).forEach(k => { inv = addItem(inv, k, 1); });
      hero.inventory = inv;
      heroes[0] = hero;
      return heroes;
    });
    // Grant ledger (9.2): loot lands on the lead hero (shared-pool convention).
    const lootLeadId = heroUid(selectedHeroes?.[0]);
    if (lootLeadId) {
      const events = [];
      if (loot.gold > 0) events.push({ heroId: lootLeadId, kind: 'gold', amount: loot.gold });
      (loot.items || []).forEach(k => events.push({ heroId: lootLeadId, kind: 'item', key: k }));
      appendHeroLedger(events, 'site');
    }
    const itemNames = (loot.items || []).map(k => (ITEM_CATALOG[k]?.name) || k);
    // #8: seeded templated sentence instead of the flat "You find X and Y" line;
    // the 💰 marker prefix stays (site notices key off it visually).
    const lootSentence = composeLootSentence({ gold: loot.gold || 0, items: itemNames });
    const message = lootSentence ? `💰 ${lootSentence}` : '💰 You find nothing of value.';
    interactionHook.setConversation(prev => [...prev, { role: 'system', content: message }]);
    // The chat log is hidden behind the fullscreen map modal, so mirror the grant into
    // the in-modal site notice (playtest R1/R4-R6: pickups looked like nothing happened).
    if (mapHook.isInsideSite) mapHook.pushSiteNotice(message);
    recordItemsInCodex(loot.items); // codex (#51): looted items are discoveries
    (loot.items || []).forEach(k => checkMilestoneEvent({ type: 'item_acquired', itemId: k }, selectedHeroes));
    setTimeout(() => performSave(), 500);
  };

  // Grant a milestone quest item found in a site, then fire the completion event. Quest
  // items aren't always in ITEM_CATALOG, so fall back to a minimal quest_item entry.
  const grantObjectiveItem = (item) => {
    if (!item) return;
    setSelectedHeroes(prev => {
      if (!prev || prev.length === 0) return prev;
      const heroes = [...prev];
      const hero = { ...heroes[0] };
      if (ITEM_CATALOG[item.id]) {
        hero.inventory = addItem(hero.inventory || [], item.id, 1);
      } else {
        // quest item: borrow an existing item's icon (no new art) for inventory display
        const iconFrom = QUEST_ITEM_ICON_FROM[item.id];
        const icon = iconFrom && ITEM_CATALOG[iconFrom] ? ITEM_CATALOG[iconFrom].icon : undefined;
        hero.inventory = [...(hero.inventory || []), { key: item.id, name: item.name, type: 'quest_item', quantity: 1, rarity: 'rare', value: 0, ...(icon ? { icon } : {}) }];
      }
      heroes[0] = hero;
      return heroes;
    });
    // Grant ledger (9.2): quest/objective items also count as granted.
    const objectiveLeadId = heroUid(selectedHeroes?.[0]);
    if (objectiveLeadId) {
      appendHeroLedger([{ heroId: objectiveLeadId, kind: 'item', key: item.id }], 'site');
    }
    interactionHook.setConversation(prev => [...prev, { role: 'system', content: `❗ You recover ${item.name}.` }]);
    if (mapHook.isInsideSite) mapHook.pushSiteNotice(`❗ You recover ${item.name}.`);
    recordItemsInCodex([item.id]); // codex (#51): catalog items announce; quest items track silently
    checkMilestoneEvent({ type: 'item_acquired', itemId: item.id }, selectedHeroes);
    setTimeout(() => performSave(), 500);
  };

  // A cave/ruins tile is "hidden" until a quest reveals it (quest-gated, sticky). Until
  // then it reads as plain ground — no entrance offered, no POI drawn.
  const isSiteHidden = (tile) => {
    if (!tile || (tile.poi !== 'cave_entrance' && tile.poi !== 'ruins')) return false;
    const sq = settings?.sideQuests;
    if (!sq || sq.length === 0) return false; // no quest system on this save -> sites stay visible
    const revealed = getRevealedSiteTypes(sq);
    return !revealed[tile.poi === 'cave_entrance' ? 'cave' : 'ruins'];
  };

  // Advance the site's moving mobs one player-step and write the new positions back.
  // Reads/writes the mob array through refs (runSiteStep is a stale async closure) and
  // mutates the mob objects in place so the cached site stays in sync (mirrors
  // markSiteContentConsumed). Returns the first mob now in contact with the party (the one
  // that forces a fight this step), or null. TODO(fast-follow): a guarded idle setInterval
  // (mobs also creep while any is aggro and the party stands still) is a planned v2; v1
  // deliberately moves mobs ONLY on the player's step so everything stays deterministic.
  const advanceMobs = (playerPos) => {
    const mobs = siteMobsRef.current;
    const mapData = siteMapDataRef.current;
    if (!Array.isArray(mobs) || mobs.length === 0 || !mapData) return null;
    const { mobs: nextMobs, combatMob } = stepMobs(mobs, playerPos, { mapData });
    // Copy stepped state onto the SHARED mob objects (same array the cache holds), then
    // re-render. Keeps positions/defeats persistent across a leave/re-enter and a save.
    mobs.forEach((m, i) => {
      const n = nextMobs[i];
      if (!m || !n) return;
      m.x = n.x; m.y = n.y; m.state = n.state; m.defeated = n.defeated;
    });
    mapHook.setCurrentSiteMap(prev => (prev ? { ...prev } : prev));
    return combatMob;
  };

  // Per-tile site effect: move onto the entered tile, then resolve AT MOST ONE halt in a
  // fixed order so two triggers never fire on one step: (1) a MOVING MOB in contact forces
  // combat; else (2) the tile's fixed content (loot / objective-item / location; legacy
  // cached encounter content still fires here for old saves); else (3) a wandering-monster
  // roll. The wandering roll no longer halts: on an immediate hit it SPAWNS a visible mob
  // that engages later on contact (only a no-reachable-tile fallback opens the fight and
  // halts), so the only halts are the mob-contact (1) and fixed-combat (2) branches.
  // Non-combat content is a passing notice and returns 'continue'. Reads
  // settings/movesSinceEncounter from refs so successive steps see fresh values.
  const runSiteStep = (pos) => {
    // Tile the party is leaving THIS step, captured before the move so a flee from a
    // site encounter (mob / legacy combat / wandering) can send them back to it.
    const fromSitePos = mapHook.sitePlayerPosition;
    const movedTile = mapHook.moveSitePlayerTo(pos.x, pos.y);
    if (!movedTile) return 'halt'; // unwalkable/unexpected: stop rather than fall through
    questOfferClockRef.current += 1; // clock the quest-offer cooldown
    // Default: this step is not a mob fight. Only the mob-contact branch below re-sets it,
    // so a fled mob's id can never leak into a later wandering/legacy fight's victory.
    activeSiteMobIdRef.current = null;

    // (1) Moving mobs advance first. A mob (wandering chaser or milestone boss guard) now
    // in contact forces the fight and halts the walk before any content / wandering roll.
    const combatMob = advanceMobs(pos);
    if (combatMob) {
      activeSiteMobIdRef.current = combatMob.id; // resolve marks this mob defeated on victory
      mapHook.setIsMapModalOpen(false);
      reopenMapAfterEncounterRef.current = true;
      preEncounterPosRef.current = fromSitePos
        ? { level: 'site', x: fromSitePos.x, y: fromSitePos.y }
        : null;
      // A boss carries enemyId so its defeat completes the milestone (handleEncounterResolve).
      openEncounterAction({
        encounter: combatMob.isBoss
          ? { ...combatMob.encounter, enemyId: combatMob.enemyId }
          : combatMob.encounter,
      });
      return 'halt'; // stop the walk on the tile where the mob caught the party
    }

    // (2) Fixed room set-piece.
    if (movedTile.content && !movedTile.content.consumed) {
      const c = movedTile.content;
      // Combat is a moving-mob entity now (handled in step 1) and carries no tile-content
      // encounter. LEGACY cached sites still store combat as content WITH an `encounter`
      // and must keep firing here for backwards compatibility; a mob-era combat objective
      // marker (no encounter) is skipped so the boss mob is the single source of the fight.
      const isLegacyCombatContent =
        (c.kind === 'encounter' || (c.kind === 'objective' && c.objectiveType === 'combat')) && c.encounter;
      const isMobObjectiveMarker =
        c.kind === 'objective' && c.objectiveType === 'combat' && !c.encounter;
      if (isMobObjectiveMarker) return 'continue'; // boss handled by advanceMobs

      mapHook.markSiteContentConsumed(pos.x, pos.y);
      if (isLegacyCombatContent) {
        mapHook.setIsMapModalOpen(false);
        reopenMapAfterEncounterRef.current = true;
        preEncounterPosRef.current = fromSitePos
          ? { level: 'site', x: fromSitePos.x, y: fromSitePos.y }
          : null;
        openEncounterAction({ encounter: c.encounter });
        return 'halt'; // stop the walk on the tile the (legacy) fight fired
      } else if (c.kind === 'loot') {
        grantSiteLoot(c.loot);
      } else if (c.kind === 'objective' && c.objectiveType === 'item') {
        grantObjectiveItem(c.item);
        // The objective may have been injected over a loot slot (the deep hoard):
        // the carried loot still pays out alongside the quest item (playtest R1).
        if (c.loot) grantSiteLoot(c.loot);
      } else if (c.kind === 'objective' && c.objectiveType === 'location') {
        interactionHook.setConversation(prev => [...prev, { role: 'system', content: `❗ You reach ${c.name}.` }]);
        mapHook.pushSiteNotice(`❗ You reach ${c.name}.`);
        if (c.loot) grantSiteLoot(c.loot); // carried hoard under the objective (R1)
        checkMilestoneEvent({ type: 'location_visited', locationId: c.locationId }, selectedHeroes);
        setTimeout(() => performSave(), 500);
      }
      // Non-combat content (loot / item / location) is a passing notice: keep walking.
      return 'continue';
    }

    // A small per-STEP chance of wandering monsters in the corridors. This uses the
    // dedicated per-step site roll (rollSiteWanderingEncounter), NOT checkForEncounter: the
    // latter's POI path is a ONE-TIME 50% arrival roll and re-firing it every tile flooded a
    // cave crawl with combats (playtest 2026-07-18: cave_bats popped almost every step). The
    // site roll draws from the same POI table but at a low base chance with the pity timer,
    // and rolls no open-air weather (enclosed interiors have no sky). Reads settings/moves
    // from refs so per-step values stay fresh during a multi-tile walk.
    const siteType = mapHook.currentSiteMap?.type || 'cave';
    // Level-gate the wandering pool with the SAME party-level metric the placed slot mobs
    // use (effectivePartyLevel), so a low party is never randomly blindsided by the hard
    // nest / deadly guardian on the wandering path (they stay reachable at higher levels).
    const wandering = rollSiteWanderingEncounter(
      siteType, settingsRef.current, movesSinceEncounterRef.current, effectivePartyLevel(selectedHeroes)
    );
    if (wandering && wandering.encounterTier === 'immediate') {
      // The roll fired, so it consumes the pity timer whether or not it produces a spawn.
      // (Not resetting would re-roll immediate every subsequent step and flood the corridor;
      // the actual fight, on contact, is handled by the advanceMobs branch above.)
      movesSinceEncounterRef.current = 0;
      setMovesSinceEncounter(0);

      // A one-shot HAZARD (weather like a storm/fog, OR a single-round swarm like the
      // bats) is not a creature: it has no enemy HP and can never report a combat
      // 'victory', so spawning it as a chasing mob trapped the party in an unwinnable loop
      // (mobs clear only on victory) and sat it on the party's own tile (playtest
      // 2026-07-18: the storm, then cave_bats). These resolve as a ONE-OFF event modal
      // instead — it appears once, the party deals with it, it passes. Only genuine
      // multi-round fights (enemy HP to deplete) become chasing mobs. activeSiteMobIdRef
      // was already reset to null at the top of this step, so the resolve touches no mob.
      if (wandering.environmental || !wandering.multiRound) {
        mapHook.setIsMapModalOpen(false);
        reopenMapAfterEncounterRef.current = true;
        preEncounterPosRef.current = fromSitePos
          ? { level: 'site', x: fromSitePos.x, y: fromSitePos.y }
          : null;
        openEncounterAction({ encounter: wandering });
        return 'halt';
      }

      // A wandering monster is no longer an out-of-nowhere modal: it spawns as a VISIBLE,
      // already-aggro'd mob a few tiles off (SITES ONLY: the entity layer exists only here;
      // world/town wandering rolls are untouched and still open the modal). The party sees it
      // coming, reads its threat ring, and can flee. It engages later on CONTACT through the
      // same advanceMobs path as any placed mob (so no halt here, and threat ring + flee
      // de-aggro come for free). advanceMobs already ran this step, so this fresh mob first
      // moves on the NEXT step: no double-fire.
      const spawnedMob = spawnWanderingMob(
        { mapData: siteMapDataRef.current, mobs: siteMobsRef.current },
        pos,
        wandering
      );
      if (spawnedMob) {
        mapHook.addSiteMob(spawnedMob);
        return 'continue'; // a spawn does not halt the walk; the mob engages on contact later
      }
      // No spawn produced. If we are AT the wandering cap, the party already has visible
      // pursuers, so do not pop a modal on top of them; just keep walking. Otherwise no
      // reachable spawn tile was found, so FALL BACK to the old behavior (open the fight)
      // rather than silently dropping the wandering monster.
      if (countActiveWanderingMobs(siteMobsRef.current) >= WANDERING_MOB_CAP) {
        return 'continue';
      }
      mapHook.setIsMapModalOpen(false);
      reopenMapAfterEncounterRef.current = true;
      preEncounterPosRef.current = fromSitePos
        ? { level: 'site', x: fromSitePos.x, y: fromSitePos.y }
        : null;
      openEncounterAction({ encounter: wandering });
      return 'halt'; // fallback: stop the walk on the tile the wandering monster fired
    }
    movesSinceEncounterRef.current += 1;
    setMovesSinceEncounter(prev => prev + 1);
    return 'continue';
  };

  // --- Site Tile Click Wrapper: walk to ANY reachable tile, one step every TILE_STEP_MS,
  // firing content + wandering rolls per step and halting where combat fires. ---
  const handleSiteTileClick = (clickedX, clickedY) => {
    if (interactionHook.isLoading) return; // no walking while an AI request is in flight
    const siteMap = mapHook.currentSiteMap;
    const start = mapHook.sitePlayerPosition;
    if (!siteMap || !start) return;
    if (clickedX === start.x && clickedY === start.y) return;

    const path = computeWalkPath(siteMap.mapData, start, { x: clickedX, y: clickedY }, (t) => !!t && t.walkable);
    if (path.length === 0) {
      mapHook.setSiteError('You cannot reach that tile.');
      return;
    }

    // A fresh walk clears the previous pickup/objective notice; grants during this walk
    // then accumulate into a clean notice.
    mapHook.clearSiteNotice();

    // A new click cancels the in-progress walk and starts fresh from the current position.
    if (walkCancelRef.current) walkCancelRef.current();
    walkCancelRef.current = runTileWalk({
      path,
      stepIntervalMs: TILE_STEP_MS,
      onEnterTile: (pos) => runSiteStep(pos),
    });
  };

  // Click-to-attack a visible site mob. Site combat is otherwise contact-only (the mob has to
  // reach the party), so a fled/idle mob that won't re-approach was impossible to finish off
  // (playtest 2026-07-20). The player choosing to attack drops the mob's flee de-aggro so it
  // engages, then: if already adjacent, opens the fight immediately (mirroring runSiteStep's
  // mob-contact branch); otherwise walks the party to a tile beside the mob, where the normal
  // per-step contact check engages it.
  const handleAttackSiteMob = (mob) => {
    if (interactionHook.isLoading || !mob || mob.defeated) return;
    const siteMap = mapHook.currentSiteMap;
    const start = mapHook.sitePlayerPosition;
    if (!siteMap || !start) return;
    // Player-initiated: clear any flee cooldown so the mob can be engaged right now.
    mapHook.setSiteMobFleeCooldown(mob.id, 0);

    if (Math.abs(start.x - mob.x) + Math.abs(start.y - mob.y) <= 1) {
      if (walkCancelRef.current) walkCancelRef.current();
      activeSiteMobIdRef.current = mob.id;
      preEncounterPosRef.current = { level: 'site', x: start.x, y: start.y };
      mapHook.setIsMapModalOpen(false);
      reopenMapAfterEncounterRef.current = true;
      openEncounterAction({ encounter: mob.isBoss ? { ...mob.encounter, enemyId: mob.enemyId } : mob.encounter });
      return;
    }

    // Not adjacent: walk to the reachable walkable tile beside the mob nearest the party; the
    // uncooled mob engages on contact during the walk (runSiteStep's advanceMobs branch).
    const beside = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }]
      .map(d => ({ x: mob.x + d.dx, y: mob.y + d.dy }))
      .filter(t => { const tile = siteMap.mapData[t.y] && siteMap.mapData[t.y][t.x]; return tile && tile.walkable; })
      .sort((a, b) => (Math.abs(a.x - start.x) + Math.abs(a.y - start.y)) - (Math.abs(b.x - start.x) + Math.abs(b.y - start.y)));
    if (beside[0]) handleSiteTileClick(beside[0].x, beside[0].y);
    else mapHook.setSiteError('You cannot reach that creature.');
  };

  // Accept an offered side quest (from a building quest-giver). Activates it so its steps
  // start tracking and any site it targets gets revealed/injected on entry.
  const handleAcceptSideQuest = (questId, origin = null) => {
    const q = (settings?.sideQuests || []).find(x => x.id === questId);
    if (!q || q.status !== 'available') return;
    setSettings(prev => {
      let sq = acceptSideQuest(prev.sideQuests || [], questId);
      // Persist the origin town stamped at offer time so the turn-in stays anchored there.
      if (origin) sq = sq.map(x => (x.id === questId ? stampQuestOrigin(x, origin) : x));
      return { ...prev, sideQuests: sq };
    });
    // Accepting a site-bound quest reveals its site type on the world map (sticky) — but
    // the player was never TOLD, which made "recover X from the cave" read as a mystery.
    // Gather steps carry a `sites` source hint; only cave/ruins are actually hidden, so
    // only those belong in the reveal note (forest/hills/mountain are always visible).
    const siteTypes = [...new Set((q.milestones || []).flatMap(m => [
      ...(m.site ? [m.site.type] : []),
      ...((m.sites || []).filter(t => t === 'cave' || t === 'ruins')),
    ]))];
    const revealNote = siteTypes.length > 0
      ? `\n🗺️ ${siteTypes.map(t => (t === 'ruins' ? 'Ruins have' : `A ${t} has`)).join(' and ')} been revealed on your world map.`
      : '';
    interactionHook.setConversation(prev => [...prev, { role: 'system', content: `📜 New quest: ${q.title} — ${q.description}${revealNote}` }]);
    setTimeout(() => performSave(), 500);
  };

  // Whenever ANY quest offer is shown (rumour OR the town Quest Board), stamp the current
  // move-clock into settings so the shared cooldown survives a reload. Both fields ride
  // along in the persisted settings blob, so no dedicated save wiring is needed; old saves
  // simply lack them and behave as "no recent offer".
  const recordQuestOffer = () => {
    const at = questOfferClockRef.current;
    setSettings(prev => ({ ...prev, lastQuestOfferAt: at, questOfferClock: at }));
  };

  // Show a side-quest offer through the shared rumour modal. `source` lets the modal pick
  // board- vs rumour-flavoured copy. Records the cooldown stamp so rumours and the board
  // cannot both flood the player.
  const showQuestOffer = (quest, source) => {
    // Anchor the quest to a real origin town (playtest 2026-07-18): the offer names it and
    // the turn-in is restricted back to it. Stamp at OFFER time so the modal can show it
    // and acceptance persists the same town/building the player will actually return to.
    const origin = resolveQuestOrigin(quest, {
      worldMap: mapHook.worldMap,
      townMapsCache: mapHook.townMapsCache,
      currentTownName: mapHook.currentTownTile?.townName || null,
      playerPos: mapHook.playerPosition,
    });
    const offered = origin ? stampQuestOrigin(quest, origin) : quest;
    openQuestOffer({ quest: offered, source, onAccept: () => handleAcceptSideQuest(quest.id, origin) });
    recordQuestOffer();
  };

  // Exploration rumour: occasionally OFFER an available, map-valid side quest while
  // travelling (every quest in sideQuests is already validated by selection, so its POI
  // exists). Offer-based: the player chooses, and accepting reveals its site. The
  // selection + guardrails (available/in-level, active-quest cap, cooldown) live in the
  // shared pickOfferableSideQuest; here we only keep the extra RUMOUR_CHANCE dice gate.
  const RUMOUR_CHANCE = 0.12;
  const maybeOfferRumour = () => {
    if (Math.random() >= RUMOUR_CHANCE) return;
    const quest = pickOfferableSideQuest(settings?.sideQuests, selectedHeroes, {
      now: questOfferClockRef.current,
      lastOfferAt: settings?.lastQuestOfferAt ?? null,
    });
    if (!quest) return;
    showQuestOffer(quest, 'rumour');
  };

  // Hand in completed side-quest turn-ins at a building (return-to-giver / courier).
  const handleTurnInQuest = (ctx) => {
    const sideQuests = settings?.sideQuests;
    if (!sideQuests || sideQuests.length === 0) return;
    const { updatedSideQuests, completions } = turnInQuest(sideQuests, ctx);
    if (completions.length === 0) return;
    // Recompute against prev inside the updater (see checkMilestoneEvent) so this write
    // can't revert side-quest changes that landed since the snapshot.
    setSettings(prev => ({ ...prev, sideQuests: turnInQuest(prev.sideQuests || [], ctx).updatedSideQuests }));
    let party = selectedHeroes;
    completions.forEach(c => {
      // Turn-in rewards are party-wide (#55): full XP each, loot via lead.
      const stepResult = applyPartyRewardsToAll({ party, rewards: c.rewards || { xp: 0, gold: 0, items: [] } });
      party = stepResult.updatedParty;
      // #8: display copy only; the machine rewardMessages stay untouched.
      const rewardLines = narrateRewardMessages(stepResult.rewardMessages);
      const grantEvents = [...(stepResult.ledgerEvents || [])];
      if (c.questCompleted && c.questRewards) {
        const questResult = applyPartyRewardsToAll({ party, rewards: c.questRewards });
        party = questResult.updatedParty;
        rewardLines.push(...narrateRewardMessages(questResult.rewardMessages));
        grantEvents.push(...(questResult.ledgerEvents || []));
      }
      appendHeroLedger(grantEvents, `sidequest:${c.questId}`); // grant ledger (9.2)
      // Codex (#51): turn-in reward items are discoveries.
      recordItemsInCodex([...((c.rewards?.items) || []), ...((c.questCompleted && c.questRewards?.items) || [])]);
      const headline = c.questCompleted ? `🎉 Side quest complete: ${c.title}!` : `✓ ${c.milestone.text}`;
      const content = rewardLines.length > 0 ? `${headline}\n${rewardLines.join(' ')}` : headline;
      interactionHook.setConversation(prev => [...prev, { role: 'system', content }]);
    });
    setSelectedHeroes(party);
    setTimeout(() => performSave(), 500);
  };

  // Location is shown in the header bar, no need for chat reminders

  // --- Effect to monitor AI Check Requests ---
  useEffect(() => {
    if (interactionHook.checkRequest) {
      const req = interactionHook.checkRequest;
      logger.debug('Opening dice modal for check request', req);
      const skill = req.type === 'skill' ? req.skill : null;
      const mode = req.type === 'skill' ? 'skill' : 'dice';
      openDice({
        skill,
        mode,
        character: selectedHeroes.length > 0 ? selectedHeroes[0] : null,
        onCleanup: () => interactionHook.setCheckRequest(null)
      });
    }
  }, [interactionHook.checkRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  // Guest (no-AI) movement narration: append deterministic, templated prose to the log
  // so logged-out players get on-tone movement narration instead of silence. Pure local
  // path — no /api/ai call, no RAG embed (matches guest play today). The signed-in AI
  // path is untouched. (Phase B3a of TIERED_NARRATION_PLAN.md.)
  const appendLocalMovementNarrative = ({ tile, coords, isNewArea, heroes }) => {
    const recent = recentNarrationRef.current;
    const text = composeLocalMovementNarrative({
      tile,
      coords,
      worldSeed,
      worldMap: mapHook.worldMap,
      settings,
      selectedHeroes: heroes || selectedHeroes,
      isNewArea,
      recent
    });
    // Keep the avoid-window bounded (the composer appends the lines it just used).
    if (recent.length > 8) recent.splice(0, recent.length - 8);
    if (!text || !text.trim()) return;
    interactionHook.setConversation((prev) => [...prev, { role: 'ai', content: text }]);
  };

  // On-demand local ambient line for the Look-around button on the no-AI path
  // (guests, or master toggle off). Deterministic per tile, but varied across
  // repeated looks via a click nonce. No /api/ai call.
  const appendLocalAmbientNarrative = ({ tile, coords }) => {
    const nonce = lookNonceRef.current++;
    const text = composeLocalAmbientNarrative({
      tile,
      coords,
      worldSeed,
      worldMap: mapHook.worldMap,
      settings,
      nonce
    });
    if (!text || !text.trim()) return;
    interactionHook.setConversation((prev) => [...prev, { role: 'ai', content: text }]);
  };

  // Open the location modal for a POI tile (arrival, or re-opened by clicking the tile
  // you stand on). Offers the Enter button and, when an active milestone boss lairs
  // here, the Confront action.
  const openPoiLocationModal = (tile, milestones) => {
    const poiEncounter = tile ? buildPoiEncounter(tile) : null;
    if (!poiEncounter || isSiteHidden(tile)) return false;
    const ms = milestones || settings?.milestones || [];
    // Active location milestone at this POI: offers a Search action instead of the old
    // silent auto-completion on arrival. It takes priority over a co-located boss so the
    // location objective completes FIRST: a combat milestone that gates behind it (e.g.
    // the Goblin Chieftain requires the hideout be found) only unlocks once the Search
    // re-opens this modal with the location milestone completed. This also protects the
    // rare tile where a POI and a directly-stamped milestone enemy coincide, where showing
    // the boss first would let the party fight before completing the gating location and
    // strand the combat milestone.
    const search = getMilestoneLocationForTile(ms, tile);
    const boss = search ? null : getMilestoneBossForTile(ms, tile);
    // Wilderness item milestone at this location (e.g. herbs in the Grey Moors) —
    // offers a Gather action; grantObjectiveItem fires item_acquired and completes it.
    const gather = getMilestoneItemForTile(ms, tile);
    mapHook.setIsMapModalOpen(false); // close map so the location modal is visible
    openEncounterInfo({
      encounter: poiEncounter,
      boss,
      gather,
      search,
      onGather: gather ? () => grantObjectiveItem({ id: gather.itemId, name: gather.name }) : null,
      onSearch: search ? () => searchMilestoneLocation(tile, search) : null,
      onFight: boss ? () => {
        mapHook.setIsMapModalOpen(false);
        reopenMapAfterEncounterRef.current = true;
        // Stationary boss fight (party is standing on the POI): no move preceded it, so
        // clear any stale pre-encounter tile so a flee here does not teleport the party.
        preEncounterPosRef.current = null;
        // enemyId rides on the encounter so handleEncounterResolve fires
        // enemy_defeated with the right id and the milestone completes.
        openEncounterAction({ encounter: { ...boss.encounter, enemyId: boss.enemyId } });
      } : null,
      onEnterLocation: () => mapHook.handleEnterLocation(poiEncounter, interactionHook.setConversation, interactionHook.conversation, effectivePartyLevel(selectedHeroes)),
      onViewMap: () => mapHook.setIsMapModalOpen(true)
    });
    return true;
  };

  // Search an active location milestone's POI. Fires the same location_visited event
  // the arrival used to fire silently, so rewards/codex/ledger/save/idempotency all
  // flow through checkMilestoneEvent exactly as before. Completion is idempotent (the
  // engine ignores an already-completed milestone), so a stray double-click is safe.
  // After a successful search we re-open the POI modal with the fresh milestone state
  // so a now-unlocked boss fight (e.g. the Goblin Chieftain once the hideout is found)
  // appears on the same visit, preserving the old arrive-and-confront flow.
  const searchMilestoneLocation = (tile, search) => {
    if (!search) return;
    interactionHook.setConversation(prev => [...prev, { role: 'system', content: `🔍 You search ${search.name}...` }]);
    const result = checkMilestoneEvent({ type: 'location_visited', locationId: search.locationId }, selectedHeroes);
    if (result?.type === 'level_blocked') {
      // Rare: only a minLevel-gated location milestone reaches here. Give feedback so the
      // Search click isn't a silent dead end, then leave the button for a later attempt.
      interactionHook.setConversation(prev => [...prev, {
        role: 'system',
        content: `You are not yet seasoned enough to press on here (Level ${result.requiredLevel} required). Return when you are stronger.`
      }]);
      return;
    }
    const freshMs = result?.updatedMilestones || settings?.milestones || [];
    openPoiLocationModal(tile, freshMs);
  };

  // --- Map Movement Handler (Smart narration: local line per move, AI on demand) ---
  const handleMoveOnWorldMap = async (clickedX, clickedY) => {
    if (!hasAdventureStarted || interactionHook.isLoading) return;

    if (!isAdjacentWorldMove(mapHook.playerPosition, clickedX, clickedY)) {
      // Clicking the tile you're STANDING ON re-opens its location modal — needed when
      // a random encounter interrupted the arrival and auto-closed the Enter offer
      // (modal conflict rule), which otherwise left the location unenterable.
      const { x, y } = mapHook.playerPosition;
      if (clickedX === x && clickedY === y) {
        const tile = getTile(mapHook.worldMap, x, y);
        openPoiLocationModal(tile);
        return; // same-tile click is never a move; no "adjacent only" nag
      }
      // Append to the conversation (a positioned log entry) rather than the sticky error
      // banner, which always shows the latest message regardless of where it happened.
      interactionHook.setConversation(prev => [...prev, {
        role: 'system',
        content: 'You can only move to an adjacent tile.'
      }]);
      return;
    }

    // Capture the tile we are LEAVING before the move commits. If an encounter fires on
    // the destination, fleeing sends the party back here (see handleEncounterResolve).
    const fromWorldPos = mapHook.playerPosition;

    const { newMap, targetTile, wasExplored } = applyWorldMapMove(
      mapHook.worldMap,
      clickedX,
      clickedY
    );
    mapHook.setWorldMap(newMap);
    mapHook.setPlayerPosition({ x: clickedX, y: clickedY });
    if (!targetTile) return;

    const { biomeType, townName } = getAreaIdentifiers(targetTile);
    const { isBiomeVisited, isTownVisited } = getAreaVisitState({
      biomeType,
      townName,
      visitedBiomes: mapHook.visitedBiomes,
      visitedTowns: mapHook.visitedTowns
    });
    trackAreaVisits({
      biomeType,
      townName,
      isBiomeVisited,
      isTownVisited,
      trackBiomeVisit: mapHook.trackBiomeVisit,
      trackTownVisit: mapHook.trackTownVisit
    });

    // Location milestones no longer auto-complete on arrival. Reaching the tile now
    // offers a deliberate "Search this location" action in the POI modal (see
    // getMilestoneLocationForTile / searchMilestoneLocation), so the player DOES
    // something at the site instead of it completing silently. A co-located boss fight
    // therefore unlocks only after the search, when the location milestone completes.
    const effectiveMilestones = settings?.milestones || [];

    // POI Check (for location Modal — towns, etc.). Secret sites (caves/ruins) don't offer
    // an entrance until a quest has revealed them, so they read as plain ground until then.
    // If an ACTIVE milestone boss lairs on this tile (stamped enemy, or a combat milestone
    // authored at this milestone POI's location), the modal offers the fight. If a random
    // encounter interrupts this modal, clicking the tile you stand on re-opens it.
    const poiShown = openPoiLocationModal(targetTile, effectiveMilestones);

    // --- Random Encounter Check (Phase 2.4: Two-Tier System) ---
    const isFirstVisitToTile = !wasExplored;
    logger.debug('About to check for encounter', {
      targetTile: { biome: targetTile.biome, poi: targetTile.poi, x: targetTile.x, y: targetTile.y },
      isFirstVisitToTile,
      movesSinceEncounter,
      settings: { grimnessLevel: settings?.grimnessLevel }
    });
    const randomEncounter = checkForEncounter(targetTile, isFirstVisitToTile, settings, movesSinceEncounter);
    logger.debug('checkForEncounter returned', randomEncounter ? randomEncounter.name : null);

    const plannedEncounterFlow = planWorldTileEncounterFlow({
      randomEncounter,
      targetTile,
      // Narrative-tier (non-hostile) encounters are woven into Look-around AI narration,
      // where the player acts by TYPING a follow-up. Guests can't type, so for them that
      // path is a dead end (a treasure hook with no way to claim it). Route guests to the
      // interactive fallback modal instead, same as when narration is toggled off.
      aiNarrativeEnabled: aiNarrativeEnabled && aiAvailable,
      pendingNarrativeTile: buildPendingNarrativeTile({
        targetTile,
        clickedX,
        clickedY,
        biomeType,
        townName,
        isBiomeVisited,
        isTownVisited
      })
    });

    if (plannedEncounterFlow.shouldResetMoves) {
      setMovesSinceEncounter(0);
    } else if (plannedEncounterFlow.shouldIncrementMoves) {
      setMovesSinceEncounter((prev) => prev + 1);
    }
    // Arriving on this world tile is a move: clock the quest-offer cooldown regardless
    // of whether an encounter fired (movesSinceEncounter resets on encounters, so it
    // cannot double as the offer clock).
    questOfferClockRef.current += 1;

    if (plannedEncounterFlow.openActionEncounter) {
      mapHook.setIsMapModalOpen(false); // close map so the encounter is visible
      reopenMapAfterEncounterRef.current = true; // reopen once the encounter resolves
      preEncounterPosRef.current = fromWorldPos
        ? { level: 'world', x: fromWorldPos.x, y: fromWorldPos.y }
        : null;
      setTimeout(() => {
        // Conflict rule encounter→closes navigation handles closing encounterInfo automatically
        openEncounterAction({ encounter: randomEncounter });
      }, plannedEncounterFlow.delayMs || 0);
    }

    if (plannedEncounterFlow.flowType === 'immediate') {
      setPendingNarrativeTile(plannedEncounterFlow.pendingNarrativeTile || null);
      return; // local narration triggers after encounter resolution
    }

    // A narrative-tier encounter on this tile is parked for the Look-around button
    // (movement no longer auto-narrates). A parked hook now survives up to
    // NARRATIVE_HOOK_PERSIST_MOVES further moves (#36): the first move away gets a
    // subtle reminder line, then it expires silently so stale hooks don't teleport.
    if (plannedEncounterFlow.flowType === 'narrative_context') {
      setPendingLookEncounter(
        plannedEncounterFlow.narrativeEncounter
          ? { ...plannedEncounterFlow.narrativeEncounter, hookMoves: 0 }
          : null
      );
    } else if (pendingLookEncounter) {
      const { hookState, reminderText } = ageNarrativeHook(pendingLookEncounter, { remind: true });
      setPendingLookEncounter(hookState);
      if (reminderText) {
        interactionHook.setConversation(prev => [...prev, { role: 'system', content: reminderText }]);
      }
    }

    // Offered action chips (#35) age on the same window, with no reminder; the chips
    // themselves are the visible affordance; they just quietly go away.
    if (lookHookChips) {
      setLookHookChips(ageNarrativeHook(lookHookChips).hookState);
    }

    // Smart narration (B3b): every move — guest OR signed-in — appends a short local
    // templated line. No automatic /api/ai call; full AI narration is on demand only
    // (Look-around button + typed free-text actions). aiNarrativeEnabled stays as a
    // master on/off for the local lines.
    // First visit to a new biome/town gets a richer arrival line.
    const isNewArea = !isBiomeVisited || (townName && !isTownVisited);
    if (aiNarrativeEnabled) {
      appendLocalMovementNarrative({ tile: targetTile, coords: { x: clickedX, y: clickedY }, isNewArea });
    }

    // On a quiet move (no POI prompt, no encounter), a rumour may offer a side quest.
    if (!poiShown && !plannedEncounterFlow.openActionEncounter) maybeOfferRumour();
  };

  // --- Look-around: on-demand description of the CURRENT tile ---
  // Signed-in -> full AI location narration (reuses the movement-narrative path).
  // Guest / master-off -> a local ambient line, never /api/ai. Respects isLoading so
  // repeated clicks don't fire concurrent requests.
  const handleLookAround = async () => {
    if (!hasAdventureStarted || interactionHook.isLoading) return;

    const { x, y } = mapHook.playerPosition;
    const tile = getTile(mapHook.worldMap, x, y);
    if (!tile) return;
    const coords = { x, y };

    // No-AI path (guests, or master toggle off): local ambient line.
    if (!aiAvailable || !aiNarrativeEnabled) {
      appendLocalAmbientNarrative({ tile, coords });
      return;
    }

    const resolvedModel = resolveProviderAndModel(selectedProvider, selectedModel);
    interactionHook.setIsLoading(true);

    // Query RAG for relevant past events (appended at end for cache-friendliness)
    let ragContext = '';
    if (sessionId) {
      try {
        const tileDesc = `${tile.biome} ${tile.poi || ''} ${tile.townName || ''}`.trim();
        const ragResults = await ragQuery(sessionId, tileDesc);
        if (ragResults.length > 0) {
          ragContext = '\n\n[RECALLED MEMORIES FROM PAST EVENTS]\n' +
            ragResults.map(r => `- ${r.text.slice(0, 300)}`).join('\n');
        }
      } catch (err) {
        logger.warn('RAG query failed for look-around, continuing without:', err);
      }
    }

    // Consume any parked narrative-tier encounter so the AI can weave it in.
    const narrativeEncounter = pendingLookEncounter;
    if (narrativeEncounter) setPendingLookEncounter(null);

    const { fullPrompt } = composeMovementNarrativePrompt({
      tile,
      coords,
      settings,
      selectedHeroes,
      currentSummary: interactionHook.currentSummary,
      narrativeEncounter,
      worldMap: mapHook.worldMap,
      isNewArea: true,
      conversation: interactionHook.conversation,
      includeRecentContext: true,
      ragContext
    });
    interactionHook.setLastPrompt(fullPrompt);

    try {
      const aiResponse = await generateMovementNarrative({
        provider: resolvedModel.provider,
        model: resolvedModel.model,
        prompt: fullPrompt,
        onProgress: (p) => interactionHook.setProgressStatus(p)
      });
      interactionHook.setProgressStatus(null);
      if (!aiResponse || !aiResponse.trim()) {
        logger.warn('Empty look-around AI response, skipping');
        // The hook wasn't delivered, so re-park it: it must not be silently lost (#36).
        if (narrativeEncounter) setPendingLookEncounter(narrativeEncounter);
        return;
      }
      const aiMessage = { role: 'ai', content: aiResponse };
      // #35: the narration above wove the hook in, so surface the encounter's
      // suggestedActions as chips under THIS message so acting on it is one tap
      // (the modal flow rolls skills and pays rewards, which typed-only hooks
      // previously left unreachable). Keyed by the message object itself: the ref
      // only lives in this session's state, so saved conversations reload chip-free.
      if (narrativeEncounter?.encounter) {
        setLookHookChips({ message: aiMessage, encounter: narrativeEncounter.encounter, hookMoves: 0 });
      }
      interactionHook.setConversation(prev => {
        const updated = [...prev, aiMessage];
        // Fire-and-forget: embed for RAG
        if (sessionId) {
          embedAndStore(sessionId, aiResponse, { msgIndex: updated.length - 1 })
            .catch(err => logger.warn('RAG embed failed (look-around):', err));
        }
        return updated;
      });
    } catch (error) {
      logger.error('Look-around AI error', error);
      interactionHook.setError(error.message);
      interactionHook.setProgressStatus(null);
      // Generation failed, so re-park the hook: it must not be silently lost (#36).
      if (narrativeEncounter) setPendingLookEncounter(narrativeEncounter);
    } finally {
      interactionHook.setIsLoading(false);
    }
  };

  // --- Narrative-hook chips (#35): engage or dismiss a woven Look-around hook ---
  // Tapping any suggested action opens the REAL encounter action modal (skill
  // rolls + rewards); Ignore just clears the chips. Either way the chips are
  // one-shot: they disappear from the message as soon as the player decides.
  const handleHookChipAction = () => {
    const encounter = lookHookChips?.encounter;
    setLookHookChips(null);
    // Look-hook engagement is stationary (the party acts where it stands): clear any stale
    // pre-encounter tile so a flee from this fight does not teleport them to an old tile.
    preEncounterPosRef.current = null;
    if (encounter) openEncounterAction({ encounter });
  };

  const handleHookChipIgnore = () => setLookHookChips(null);

  // --- Talk to a milestone NPC (deterministic 'talk' milestones) ---
  // Fired by the building "Talk" button (npc = the placed NPC) or its building-level
  // "Ask for..." fallback (npc = null). Fires npc_talked — checkMilestoneEvent
  // completes the milestone, applies rewards, and posts the "Milestone Achieved"
  // system message — then adds a meeting beat so the click isn't mute: one AI
  // narration when signed in (same programmatic path as Look-around), a local
  // templated line for guests.
  const handleTalkToNpc = async (npcId, npc = null) => {
    if (!npcId || interactionHook.isLoading) return;
    const milestones = settings?.milestones || [];
    const milestone = milestones.find(m =>
      m.type === 'talk' && !m.completed && m.trigger?.npc === npcId
    );
    if (!milestone) return; // already completed / not active — no-op (button shouldn't render)

    // Close the town map (and the building/NPC modal nested inside it) so the player is
    // returned to the Adventure Log, where the milestone-completion message and the AI
    // meeting narration land. Without this the response resolves silently behind the map.
    mapHook.setIsMapModalOpen(false);

    checkMilestoneEvent({ type: 'npc_talked', npcId }, selectedHeroes);
    setTimeout(() => performSave(), 500);

    // Meeting beat — canonical identity from the milestone; the placed NPC fills gaps.
    const name = milestone.spawn?.name || npc?.name || 'the contact';
    const role = milestone.spawn?.role || npc?.job || npc?.title || null;
    const personality = milestone.spawn?.personality || npc?.personality || null;
    const buildingName = milestone.building?.name || null;
    const townName = mapHook.currentTownTile?.townName || milestone.location || null;

    // No-AI path (guests, or master toggle off): deterministic templated line.
    if (!aiAvailable || !aiNarrativeEnabled) {
      const text = composeNpcMeeting({ name, role, building: buildingName, townName, personality, worldSeed });
      if (text) interactionHook.setConversation(prev => [...prev, { role: 'ai', content: text }]);
      return;
    }

    const resolvedModel = resolveProviderAndModel(selectedProvider, selectedModel);
    interactionHook.setIsLoading(true);

    const { fullPrompt } = composeNpcMeetingPrompt({
      npc: { name, role, personality },
      buildingName,
      townName,
      milestoneText: milestone.text,
      settings,
      selectedHeroes,
      currentSummary: interactionHook.currentSummary
    });
    interactionHook.setLastPrompt(fullPrompt);

    try {
      let aiResponse = await generateMovementNarrative({
        provider: resolvedModel.provider,
        model: resolvedModel.model,
        prompt: fullPrompt,
        onProgress: (p) => interactionHook.setProgressStatus(p)
      });
      interactionHook.setProgressStatus(null);
      // The engine already completed this milestone; strip any stray completion
      // markers so they never render in the log.
      aiResponse = (aiResponse || '')
        .replace(/\[COMPLETE_MILESTONE:[\s\S]*?\]/gi, '')
        .replace(/\[COMPLETE_CAMPAIGN\]/gi, '')
        .trim();
      if (!aiResponse) {
        logger.warn('Empty NPC-meeting AI response, skipping');
        return;
      }
      const aiMessage = { role: 'ai', content: aiResponse };
      interactionHook.setConversation(prev => {
        const updated = [...prev, aiMessage];
        // Fire-and-forget: embed for RAG so later turns recall the meeting
        if (sessionId) {
          embedAndStore(sessionId, aiResponse, { msgIndex: updated.length - 1 })
            .catch(err => logger.warn('RAG embed failed (npc meeting):', err));
        }
        return updated;
      });
    } catch (error) {
      logger.error('NPC meeting AI error', error);
      interactionHook.setError(error.message);
      interactionHook.setProgressStatus(null);
    } finally {
      interactionHook.setIsLoading(false);
    }
  };

  const handleEncounterResolve = (result) => {
    logger.info('Encounter resolved', result);

    // Flee/disengage detection. A successful flee (EncounterActionModal sets
    // outcome:'fled') or the multi-round 'escaped' outcome means the party broke away:
    // they must NOT count the foe as defeated, and they should be sent back to the tile
    // they came from (preEncounterPosRef, captured at move time per map level). A FAILED
    // flee never sets outcome:'fled', so a caught party stays put and takes its lumps.
    const from = getFleeReposition(result, preEncounterPosRef.current);
    if (from) {
      // Restore to the pre-encounter tile with the setter for that level. That tile was
      // walkable and adjacent (the party just stood there), so no extra validation is
      // needed; a missing ref (stationary/legacy encounter) simply skips the reposition.
      if (from.level === 'world') mapHook.setPlayerPosition({ x: from.x, y: from.y });
      else if (from.level === 'town') mapHook.setTownPlayerPosition({ x: from.x, y: from.y });
      else if (from.level === 'site') mapHook.setSitePlayerPosition({ x: from.x, y: from.y });
      // A fled site mob (from the chasing model, #115) is not defeated, so on its own it
      // would just re-close and re-contact the repositioned party next step (a speed-2
      // hunter re-contacts immediately). Stamp a brief flee cooldown on it so it de-aggros
      // and the party actually breaks contact; the reposition above buys the distance the
      // cooldown then protects. Only a SUCCESSFUL flee reaches here (from is truthy).
      if (activeSiteMobIdRef.current) {
        mapHook.setSiteMobFleeCooldown(activeSiteMobIdRef.current);
      }
    }
    // A multi-round SITE MOB fight that ended WITHOUT a win and WITHOUT a successful flee —
    // a stalemate ("you broke off"), a defeat, or a failed flee — used to leave the party
    // standing on the mob's tile with the mob still aggro, re-triggering the SAME fight on
    // the very next step (an unwilling loop the narration already claims the party escaped).
    // Treat any such disengage like a flee for the mob: send the party back to their
    // pre-encounter tile and stamp a brief de-aggro cooldown so "you broke off" is true
    // (audit 2026-07-18). Victory (mob cleared below) and a successful flee (handled above,
    // hence `else`) are excluded; single-round hazards clear on any non-flee outcome below.
    else if (activeSiteMobIdRef.current && encounterActionData?.encounter?.multiRound
             && !isEncounterVictory(result) && preEncounterPosRef.current?.level === 'site') {
      const back = preEncounterPosRef.current;
      mapHook.setSitePlayerPosition({ x: back.x, y: back.y });
      mapHook.setSiteMobFleeCooldown(activeSiteMobIdRef.current);
    }
    preEncounterPosRef.current = null; // consume: never reposition on a later encounter

    // #43: team boss fights split XP across the whole party (+10% pot per
    // supporter); gold/items/penalties still flow through the lead. Solo results
    // keep the classic single-hero path. HP damage was already applied live during
    // the fight via onCharacterUpdate, so only rewards/penalties land here.
    const {
      updatedParty,
      heroIndex,
      rewardMessages,
      penaltyMessages,
      ledgerEvents
    } = (result?.isTeamEncounter ? applyTeamEncounterOutcomeToParty : applyEncounterOutcomeToParty)({
      party: selectedHeroes,
      result
    });
    setSelectedHeroes(updatedParty);

    const heroName = result?.isTeamEncounter
      ? 'the party'
      : (updatedParty[heroIndex]?.characterName || updatedParty[heroIndex]?.heroName || 'Hero');
    const rewardLog = formatEncounterRewardLog(heroName, rewardMessages);
    const penaltyLog = formatEncounterPenaltyLog(heroName, penaltyMessages);
    if (rewardLog) logger.info(rewardLog);
    if (penaltyLog) logger.info(penaltyLog);

    // Milestone checks after encounter resolution
    const activeEncounter = encounterActionData?.encounter;
    const encounterName = activeEncounter?.name || 'Encounter';

    // Grant ledger (9.2): record the rewards/penalties this encounter implied.
    appendHeroLedger(ledgerEvents, `encounter:${slugifyCodexKey(encounterName) || 'unknown'}`);

    // Codex (#51): facing an enemy discovers it — the encounter RESOLVED (win,
    // loss, or flight), so the party has met the creature either way.
    recordEnemyInCodex(activeEncounter);
    // Reward items entering the inventory are item discoveries.
    if (result?.rewards?.items?.length > 0) recordItemsInCodex(result.rewards.items);

    // A SINGLE-ROUND site mob is a one-shot hazard (e.g. a bat swarm — no enemy HP, so it
    // resolves in one action and can NEVER report 'victory'): clear it on ANY non-flee
    // outcome, else it re-triggers forever (playtest 2026-07-18, cave_bats). multiRound
    // fights still clear only on a real victory (below).
    if (activeSiteMobIdRef.current && activeEncounter && !activeEncounter.multiRound && !isFleeOutcome(result)) {
      mapHook.setSiteMobDefeated(activeSiteMobIdRef.current);
    }

    if (isEncounterVictory(result)) {
      // A flee (outcome 'fled'/'escaped') is NOT a victory, so a fled foe is never marked
      // defeated here; the enemy/mob-defeat + enemy_defeated milestone are win-only.
      // A site MOB that triggered this fight is now dead: mark it defeated so it stops
      // rendering / chasing and never re-triggers (mirrors markSiteContentConsumed).
      if (activeSiteMobIdRef.current) {
        mapHook.setSiteMobDefeated(activeSiteMobIdRef.current);
      }
      // Check enemy_defeated milestone
      const enemyId = activeEncounter?.enemyId || activeEncounter?.name?.toLowerCase().replace(/\s+/g, '_');
      if (enemyId) {
        checkMilestoneEvent({ type: 'enemy_defeated', enemyId }, updatedParty);
      }
    }
    // Check item_acquired for any reward items
    if (result?.rewards?.items?.length > 0) {
      for (const itemName of result.rewards.items) {
        const itemId = itemName.replace(/ /g, '_').toLowerCase();
        checkMilestoneEvent({ type: 'item_acquired', itemId }, updatedParty);
      }
    }

    if (result?.narration) {
      const encounterContent = `⚔️ **${encounterName}**: ${result.narration}`;
      const encounterMsg = { role: 'ai', content: encounterContent };
      interactionHook.setConversation((prev) => {
        const updated = [...prev, encounterMsg];
        if (sessionId) {
          embedAndStore(sessionId, encounterContent, { msgIndex: updated.length - 1 })
            .catch(err => logger.warn('RAG embed failed (encounter):', err));
        }
        return updated;
      });
    }

    // Consume the active-mob ref so a later encounter that is NOT a mob fight (or a mob at a
    // colliding coordinate) can never read a stale id — mirrors the preEncounterPosRef
    // consume above (audit 2026-07-18). Every reader (flee/disengage/victory paths) has run.
    activeSiteMobIdRef.current = null;

    // A FULL party wipe outside a town used to strand the player: no game-over and no forced
    // return, only an undocumented walk-the-dead-party-to-a-Temple recovery that could be
    // impossible if a still-aggro site mob kept re-triggering combat they couldn't act on
    // (audit 2026-07-18). Detect an all-defeated party the instant a fight resolves and
    // auto-return: revive everyone to half HP and teleport to the nearest town (a free
    // rescue, not a reward). HP was applied live during the fight, so updatedParty holds the
    // real post-fight HP. No towns on the map (degenerate) → revive in place so the party can
    // at least act/flee rather than loop on a "you are defeated" card.
    const partyWiped = Array.isArray(updatedParty) && updatedParty.length > 0
      && updatedParty.every(h => h && (h.isDefeated || (h.currentHP || 0) <= 0));
    if (partyWiped) {
      let town = null, bestD = Infinity;
      (mapHook.worldMap || []).forEach((row, y) => (row || []).forEach((tile, x) => {
        if (!tile || tile.poi !== 'town') return;
        const d = Math.abs(x - mapHook.playerPosition.x) + Math.abs(y - mapHook.playerPosition.y);
        if (d < bestD) { bestD = d; town = { x, y, name: tile.townName || 'town' }; }
      }));
      const revived = updatedParty.map(h => ({
        ...h,
        isDefeated: false,
        currentHP: Math.max(1, Math.floor((h.maxHP || 20) * 0.5)),
      }));
      setSelectedHeroes(revived);
      interactionHook.setConversation(prev => [...prev, { role: 'system', content:
        `💀 Your party falls in battle. Kindly strangers carry you to safety; you awaken, battered but alive,${town ? ` in ${town.name}` : ' back in the wilds'}.` }]);
      reopenMapAfterEncounterRef.current = false; // never reopen a site map onto a wiped party
      closeEncounterAction();
      if (town) {
        mapHook.evacuateToWorldTile({ x: town.x, y: town.y });
        mapHook.setIsMapModalOpen(true);
      }
      setTimeout(() => performSave(), 500);
      return;
    }

    closeEncounterAction();

    // Reopen the map so the player can keep exploring after the fight.
    if (reopenMapAfterEncounterRef.current) {
      reopenMapAfterEncounterRef.current = false;
      mapHook.setIsMapModalOpen(true);
    }

    // Quest Board hook: a successful board read OFFERS a real side quest, reusing the
    // shared rumour offer flow and its guardrails (pickOfferableSideQuest: available and
    // in-level, active-quest cap, cooldown). The board cannot invent quests; it only ever
    // surfaces one already in the available pool, so it can never over-spawn. On a
    // cap/cooldown/empty-pool miss it drops a brief flavour line instead of a modal, so a
    // success never dead-ends.
    if (
      activeEncounter?.templateKey === 'town_quest_board' &&
      (result?.outcomeTier === 'success' || result?.outcomeTier === 'criticalSuccess')
    ) {
      const offered = pickOfferableSideQuest(settings?.sideQuests, updatedParty, {
        now: questOfferClockRef.current,
        lastOfferAt: settings?.lastQuestOfferAt ?? null,
      });
      if (offered) {
        // Sequence AFTER the encounter modal tears down: questOffer (info group) and
        // encounterAction (encounter group) both sit on layer 1, and the info group has
        // no conflict rule to auto-close the encounter, so a same-tick open could leave
        // two FocusTraps fighting. The setTimeout lets closeEncounterAction settle first.
        setTimeout(() => showQuestOffer(offered, 'board'), 0);
      } else {
        interactionHook.setConversation(prev => [...prev, { role: 'system', content: '📜 Nothing new on the board catches your eye.' }]);
      }
    }

    // Trigger immediate save after encounter to preserve rewards
    setTimeout(() => performSave(), 500);

    // Trigger deferred narration if there's a pending tile. Smart narration (B3b):
    // the post-encounter move gets the same local templated line as any other move,
    // for everyone — no automatic AI call. The player can Look-around for full AI.
    if (!pendingNarrativeTile) return;
    const { tile, coords, needsAiDescription } = pendingNarrativeTile;
    setPendingNarrativeTile(null);

    if (aiNarrativeEnabled) {
      appendLocalMovementNarrative({ tile, coords, isNewArea: !!needsAiDescription, heroes: updatedParty });
    }
  };

  const currentTile = getTile(mapHook.worldMap, mapHook.playerPosition.x, mapHook.playerPosition.y);
  const currentBiome = currentTile?.biome || 'Unknown Area';
  const townName = mapHook.isInsideTown ? (mapHook.currentTownTile?.townName || 'Town') : null;

  let subLocationName = null;
  if (mapHook.isInsideTown && mapHook.currentTownMap && mapHook.townPlayerPosition) {
    const tileX = mapHook.townPlayerPosition.x;
    const tileY = mapHook.townPlayerPosition.y;
    const townMapData = mapHook.currentTownMap.mapData;
    if (townMapData && townMapData[tileY] && townMapData[tileY][tileX]) {
      const townTile = townMapData[tileY][tileX];
      if (townTile.type === 'building') {
        if (townTile.buildingName) {
          subLocationName = townTile.buildingName;
        } else if (townTile.buildingType) {
          subLocationName = townTile.buildingType.charAt(0).toUpperCase() + townTile.buildingType.slice(1);
        } else {
          subLocationName = 'Building';
        }
      } else if (townTile.type === 'town_square') {
        subLocationName = 'Town Square';
      } else if (townTile.type?.includes('path') || townTile.type === 'grass') {
        subLocationName = 'Street';
      } else {
        subLocationName = townTile.type ? townTile.type.charAt(0).toUpperCase() + townTile.type.slice(1).replace('_', ' ') : 'Town';
      }
    }
  }

  return (
    <div className="game-page-wrapper">
      {isBackfilling && backfillProgress && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          padding: '4px 16px',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span>Building DM memory index... {backfillProgress.indexed}/{backfillProgress.total}</span>
          <div style={{
            flex: 1,
            height: '4px',
            background: 'var(--border)',
            borderRadius: '2px',
            overflow: 'hidden',
            maxWidth: '200px'
          }}>
            <div style={{
              width: `${Math.round((backfillProgress.indexed / backfillProgress.total) * 100)}%`,
              height: '100%',
              background: 'var(--primary)',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>
      )}
      <div className="game-container">
        <GameMainPanel
          campaignGoal={settings.campaignGoal}
          partyLeadName={selectedHeroes?.[0]?.heroName || selectedHeroes?.[0]?.characterName || null}
          templateName={settings?.templateName || null}
          townName={townName}
          subLocationName={subLocationName}
          townPosition={mapHook.townPlayerPosition}
          worldPosition={mapHook.playerPosition}
          currentBiome={currentBiome}
          onOpenMap={() => {
            mapHook.setIsMapModalOpen(true);
            if (tourActive && tourStep?.id === 'open-map') advanceTour();
          }}
          onOpenInventory={() => openAdventureBook({ tab: 'party' })}
          onOpenHowToPlay={openHowToPlay}
          onLookAround={handleLookAround}
          // No pinned tab: the Journal button opens the book at the remembered
          // last tab (#52); first open defaults to Campaign. The Inventory button
          // above pins the Party tab because its intent is unambiguous.
          onOpenSettings={() => openAdventureBook()}
          onManualSave={async () => {
            const currentRoot = (settings?.saveName || '').trim();
            const title = buildSaveName(currentRoot);
            // performSave reports what actually happened so the confirmation is honest:
            // 'saved' | 'savedLocal' | 'forked' | 'nochange' | 'skipped' | 'error'.
            const status = await performSave();
            openSaveConfirmation({
              status,
              title,
              signedIn: !!user, // drives the "where did it save" indicator
              root: settings?.saveName || '',
              // Change the campaign root name: keep it for future saves (settings) and
              // update the just-saved row's name immediately.
              onRename: async (newRoot) => {
                setSettings(prev => ({ ...prev, saveName: newRoot }));
                try {
                  await conversationsApi.updateName(sessionId, newRoot);
                } catch (e) {
                  logger.error('Failed to rename save', e);
                }
              }
            });
          }}
          canManualSave={!!sessionId}
          saveStatus={saveStatus}
          isSaving={isSaving}
          signedIn={!!user}
          hasAdventureStarted={hasAdventureStarted}
          isLoading={interactionHook.isLoading}
          onStartAdventure={interactionHook.handleStartAdventure}
          conversation={interactionHook.conversation}
          progressStatus={interactionHook.progressStatus}
          error={interactionHook.error}
          onSubmit={interactionHook.handleSubmit}
          userInput={interactionHook.userInput}
          onInputChange={interactionHook.handleInputChange}
          selectedModel={selectedModel}
          selectedProvider={selectedProvider}
          sessionId={sessionId}
          onToggleDebug={() => setShowDebugInfo((prev) => !prev)}
          showDebugInfo={showDebugInfo}
          onToggleAiNarrative={() => setAiNarrativeEnabled((prev) => !prev)}
          aiNarrativeEnabled={aiNarrativeEnabled}
          aiAvailable={aiAvailable}
          isMapLoaded={!!mapHook.worldMap}
          lastPrompt={interactionHook.lastPrompt}
          hookChips={lookHookChips}
          onHookChipAction={handleHookChipAction}
          onHookChipIgnore={handleHookChipIgnore}
        />

        <PartySidebar
          selectedHeroes={selectedHeroes}
          onOpenCharacter={(hero) => {
            openHero({ hero, onHeroUpdate: handleHeroUpdate });
            setIsMobilePartySidebarOpen(false); // Close sidebar when opening modal
          }}
          className={isMobilePartySidebarOpen ? 'mobile-open' : ''}
        />

        {/* Mobile party toggle button - uses first hero portrait */}
        <button
          className="mobile-party-toggle"
          onClick={() => setIsMobilePartySidebarOpen(!isMobilePartySidebarOpen)}
          aria-label="Toggle party sidebar"
        >
          {isMobilePartySidebarOpen ? (
            '✕'
          ) : selectedHeroes[0]?.profilePicture ? (
            <img
              src={resolveProfilePicture(selectedHeroes[0].profilePicture)}
              alt="Party"
              className="mobile-party-toggle-portrait"
            />
          ) : (
            '⚔️'
          )}
        </button>

        {/* Mobile overlay */}
        {isMobilePartySidebarOpen && (
          <div
            className="mobile-party-overlay"
            onClick={() => setIsMobilePartySidebarOpen(false)}
          />
        )}
      </div>

      <GameModals
        onContinueLegend={() => {
          closeAdventureBook();
          setLegendPicker({ open: true, celebrate: false });
        }}
        settings={settings}
        selectedProvider={selectedProvider}
        setSelectedProvider={setSelectedProvider}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        assistantProvider={assistantProvider}
        setAssistantProvider={setAssistantProvider}
        assistantModel={assistantModel}
        setAssistantModel={setAssistantModel}
        selectedHeroes={selectedHeroes}
        mapHook={mapHook}
        handleMoveOnWorldMap={handleMoveOnWorldMap}
        interactionHook={interactionHook}
        currentTile={currentTile}
        hasAdventureStarted={hasAdventureStarted}
        handleTownTileClick={handleTownTileClick}
        handleSiteTileClick={handleSiteTileClick}
        handleAttackSiteMob={handleAttackSiteMob}
        handleEncounterResolve={handleEncounterResolve}
        handleHeroUpdate={handleHeroUpdate}
        onUseItem={(heroId, itemKey, healedHero) => {
          setSelectedHeroes(prev => replaceHeroInParty(prev, healedHero));
        }}
        onQuestItemFound={(itemId, itemName) => {
          // Route through grantObjectiveItem so the item actually lands in inventory:
          // this handler previously only fired the milestone + codex and never called
          // addItem, so town quest-building pickups (e.g. the Frostbound Ledger) ticked
          // the milestone but never materialized. grantObjectiveItem also appends the
          // grant ledger, records the codex, fires the milestone event, and saves.
          grantObjectiveItem({ id: itemId, name: itemName });
        }}
        party={selectedHeroes}
        onResurrect={(heroId, goldCost) => {
          // Deduct gold from party members (spread cost across heroes with gold)
          let remaining = goldCost;
          const afterGold = selectedHeroes.map(h => {
            if (remaining <= 0) return h;
            const available = h.gold || 0;
            const deducted = Math.min(available, remaining);
            remaining -= deducted;
            return { ...h, gold: available - deducted };
          });

          // Resurrect the hero at 50% HP
          const updatedHeroes = afterGold.map(h => {
            if (heroUid(h) !== heroId) return h;
            const halfHP = Math.max(1, Math.floor(h.maxHP * 0.5));
            return { ...h, currentHP: halfHP, isDefeated: false };
          });

          const hero = updatedHeroes.find(h => heroUid(h) === heroId);
          setSelectedHeroes(updatedHeroes);
          // Grant ledger (9.2): resurrection gold spends, per hero, as negative
          // amounts so the ledgered gold sum keeps tracking real gold.
          appendHeroLedger(goldDeltaEvents(selectedHeroes, updatedHeroes), 'resurrect');
          return {
            heroName: hero.heroName || hero.characterName || 'Unknown',
            hpRestored: hero.currentHP,
            goldCost
          };
        }}
        onRest={(restType) => {
          const restFn = restType === 'long' ? longRest : shortRest;
          const healingResults = [];
          const updatedHeroes = selectedHeroes.map(hero => {
            if (hero.isDefeated) return hero;
            const name = hero.heroName || hero.characterName || 'Unknown';
            const before = hero.currentHP;
            const healed = restFn(hero);
            healingResults.push({ name, before, after: healed.currentHP, maxHP: healed.maxHP });
            return healed;
          });
          setSelectedHeroes(updatedHeroes);
          // #83 Phase 2: a LONG rest is the deliberate "time passed" reset — clear every spent
          // check lock so the party can attempt those approaches afresh. A short rest does not.
          if (restType === 'long' && settings?.checkLocks?.length) {
            setSettings(prev => ({ ...prev, checkLocks: [] }));
          }
          return { restType, healingResults };
        }}
        sideQuests={settings?.sideQuests}
        onAcceptSideQuest={handleAcceptSideQuest}
        onTurnInQuest={handleTurnInQuest}
        onTalkToNpc={handleTalkToNpc}
        onVisitTavern={handleVisitTavern}
        onBuy={(itemKey) => {
          const result = buyItem(selectedHeroes, itemKey);
          if (result.ok) {
            setSelectedHeroes(result.party);
            // Grant ledger (9.2): the bought item plus the pooled gold spend
            // (negative amounts, per hero) so the ledgered gold sum stays true.
            const buyLeadId = heroUid(result.party?.[0]);
            appendHeroLedger([
              ...goldDeltaEvents(selectedHeroes, result.party),
              ...(buyLeadId ? [{ heroId: buyLeadId, kind: 'item', key: itemKey }] : [])
            ], 'shop');
            recordItemsInCodex([itemKey]); // codex (#51): bought items are discoveries
            // Buying IS acquiring: without this, purchasing a quest item (e.g. healing
            // herbs at the apothecary) silently failed to progress its item milestone.
            checkMilestoneEvent({ type: 'item_acquired', itemId: itemKey }, result.party);
          }
          return result;
        }}
        onSell={(itemKey) => {
          const result = sellItem(selectedHeroes, itemKey);
          if (result.ok) {
            setSelectedHeroes(result.party);
            // Grant ledger (9.2): sale gold is a gain like any other.
            appendHeroLedger(goldDeltaEvents(selectedHeroes, result.party), 'shop');
          }
          return result;
        }}
      />

      {/* Save Confirmation Modal */}
      <SaveConfirmationModal />
      <QuestOfferModal />

      {/* Quest chaining: campaign-complete celebration + next-campaign picker */}
      <ContinueLegendPicker
        isOpen={legendPicker.open}
        celebrate={legendPicker.celebrate}
        onClose={() => setLegendPicker({ open: false, celebrate: false })}
        settings={settings}
        party={selectedHeroes}
        worldMap={mapHook.worldMap}
        onPick={handleContinueLegend}
        onNewAdventure={handleLegendNewAdventure}
        launching={legendLaunching}
        error={legendError}
      />
    </div>
  );
};

export default Game;
