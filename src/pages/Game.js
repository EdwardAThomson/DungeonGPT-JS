import React, { useContext, useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import SettingsContext from "../contexts/SettingsContext";
import { useAuth } from '../contexts/AuthContext';
import { useGuidedTour } from '../contexts/GuidedTourContext';
import { useModal } from '../contexts/ModalContext';
import { checkForEncounter } from '../utils/encounterGenerator';
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
import { composeMovementNarrativePrompt } from '../game/promptComposer';
import { composeLocalMovementNarrative, composeLocalAmbientNarrative } from '../game/localNarrator';
import { generateMovementNarrative } from '../game/movementController';
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
  applyEncounterOutcomeToParty,
  planWorldTileEncounterFlow,
  formatEncounterPenaltyLog,
  formatEncounterRewardLog
} from '../game/encounterController';
import { resolveProviderAndModel } from '../llm/modelResolver';
import { checkMilestoneCompletion, getMilestoneRewards } from '../game/milestoneEngine';
import { buyItem, sellItem } from '../game/shopController';
import { checkSideQuestEvent, acceptSideQuest, getActiveSiteObjectives, turnInQuest, getRevealedSiteTypes, effectivePartyLevel } from '../game/questEngine';
import { QUEST_ITEM_ICON_FROM } from '../data/sideQuests';
import { embedAndStore, query as ragQuery } from '../game/ragEngine';
import { createLogger } from '../utils/logger';
import { resolveProfilePicture } from '../utils/assetHelper';

const logger = createLogger('game');

const SaveConfirmationModal = () => {
  const { data, close } = useModal('saveConfirmation');
  return (
    <ModalShell modalId="saveConfirmation" ariaLabel="Save Confirmation" style={{ maxWidth: '400px', textAlign: 'center' }}>
      <h3 style={{ marginBottom: '15px', color: 'var(--state-success)' }}>✓ Game Saved!</h3>
      <p style={{ marginBottom: '10px', color: 'var(--text)' }}>
        Your progress has been saved as:
      </p>
      <p style={{ marginBottom: '20px', fontWeight: 'bold', color: 'var(--primary)' }}>
        {data?.title}
      </p>
      <button onClick={close} className="primary-button" style={{ padding: '10px 30px' }}>
        Continue
      </button>
    </ModalShell>
  );
};

const QuestOfferModal = () => {
  const { data, close } = useModal('questOffer');
  const quest = data?.quest;
  return (
    <ModalShell modalId="questOffer" ariaLabel="Quest Offer" style={{ maxWidth: '460px', textAlign: 'center' }}>
      <h3 style={{ marginBottom: '10px', color: 'var(--primary)', fontFamily: 'var(--header-font)' }}>📜 A Rumour Reaches You</h3>
      <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)', marginBottom: '12px' }}>"{quest?.giver?.hook || quest?.description}"</p>
      <p style={{ fontWeight: 700, marginBottom: '18px', color: 'var(--text)' }}>{quest?.title}</p>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
        <button className="primary-button" onClick={() => { data?.onAccept?.(); close(); }}>Accept the Quest</button>
        <button className="secondary-button" onClick={close}>Not now</button>
      </div>
    </ModalShell>
  );
};

const Game = () => {
  const { state } = useLocation();
  const { selectedHeroes: stateHeroes, loadedConversation, worldSeed: stateSeed, gameSessionId: stateGameSessionId, generatedMap: stateGeneratedMap, townMapsCache: stateTownMapsCache } = state || { selectedHeroes: [], loadedConversation: null, worldSeed: null, gameSessionId: null, generatedMap: null, townMapsCache: null };
  const [selectedHeroes, setSelectedHeroes] = useState(() => {
    // Normalize first (de-dupe + migrate legacy characterId -> heroId), then backfill
    // progression fields. normalizeParty repairs saves corrupted by the old hero-overwrite bug.
    const heroes = normalizeParty(loadedConversation?.selected_heroes || stateHeroes || []);
    return heroes.map(hero => {
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
  });

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

  // --- Modal Manager hooks ---
  const { open: openHowToPlay } = useModal('howToPlay');
  const { open: openHero } = useModal('hero');
  const { open: openDice } = useModal('dice');
  const { open: openInventory } = useModal('inventory');
  const { open: openSaveConfirmation } = useModal('saveConfirmation');
  const { open: openEncounterInfo, close: closeEncounterInfo } = useModal('encounterInfo');
  const { open: openQuestOffer } = useModal('questOffer');
  const { open: openEncounterAction, close: closeEncounterAction, data: encounterActionData } = useModal('encounterAction');

  // --- Modal states not yet migrated ---
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [movesSinceEncounter, setMovesSinceEncounter] = useState(
    subMapsObj?.movesSinceEncounter || 0
  );
  const [pendingNarrativeTile, setPendingNarrativeTile] = useState(null);
  // Smart narration (B3b): movement appends a local line; full AI narration is on
  // demand (Look-around / typed actions). A narrative-tier encounter detected on a
  // move is parked here so an on-demand Look-around can still weave it into the AI
  // description (movement itself no longer auto-narrates it).
  const [pendingLookEncounter, setPendingLookEncounter] = useState(null);
  // Bumped on each guest/local Look-around so repeated looks at the same tile vary.
  const lookNonceRef = useRef(0);
  const [aiNarrativeEnabled, setAiNarrativeEnabled] = useState(true);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [isMobilePartySidebarOpen, setIsMobilePartySidebarOpen] = useState(false);

  // The AI Dungeon Master requires auth; guests play the local mechanical loop
  // (exploration + deterministic combat) and the AI is the sign-in upsell.
  const { user } = useAuth();
  const aiAvailable = !!user;
  // Reopen the map after an encounter that interrupted exploration.
  const reopenMapAfterEncounterRef = useRef(false);
  // Guided tour: advance the in-game coachmarks (Start Adventure -> Map) as the
  // player acts.
  const { tourActive, activeStep: tourStep, advanceStep: advanceTour } = useGuidedTour();

  // --- HOOKS ---
  const {
    sessionId,
    hasAdventureStarted,
    setHasAdventureStarted,
    saveConversationToBackend
  } = useGameSession(loadedConversation, setSettings, setSelectedProvider, setSelectedModel, stateGameSessionId);

  // Pass dummy/empty functions for now where we handle logic in Game.js wrapper
  // Biome theme for lazily-generated town maps (Phase 2b). Falls back to the raw parsed
  // settings (loaded saves) and finally 'grassland' so older saves are unaffected.
  const mapTheme = settings?.theme || settingsObj?.theme || 'grassland';
  const mapHook = useGameMap(loadedConversation, hasAdventureStarted, false, () => { }, worldSeed, stateGeneratedMap, settings?.requiredBuildings, stateTownMapsCache, mapTheme, getActiveSiteObjectives(settings?.sideQuests));

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
      townPlayerPosition: mapHook.townPlayerPosition
    },
    sessionId,
    aiAvailable
  );
  const { performSave } = useGamePersistence({
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

  // --- Hero HP Update Handler ---
  const handleHeroUpdate = (updatedHero) => {
    // Match on heroId||characterId (never on a missing id) so a single-hero combat update
    // replaces exactly that hero, not the whole party. See partyUtils for the bug history.
    setSelectedHeroes(prev => replaceHeroInParty(prev, updatedHero));
  };

  // --- Milestone Engine: deterministic completion check ---
  const checkMilestoneEvent = (event, currentParty) => {
    const heroLevel = currentParty?.[0]?.level || 1;

    // --- Side quests (optional parallel chains) — checked first + independently ---
    const sideQuests = settings?.sideQuests;
    if (sideQuests && sideQuests.length > 0) {
      const { updatedSideQuests, completions } = checkSideQuestEvent(sideQuests, event, heroLevel);
      if (completions.length > 0) {
        setSettings(prev => ({ ...prev, sideQuests: updatedSideQuests }));
        let party = currentParty;
        completions.forEach(c => {
          const stepRewards = c.rewards || { xp: 0, gold: 0, items: [] };
          party = applyEncounterOutcomeToParty({ party, result: { rewards: stepRewards, heroIndex: 0 } }).updatedParty;
          if (c.questCompleted && c.questRewards) {
            party = applyEncounterOutcomeToParty({ party, result: { rewards: c.questRewards, heroIndex: 0 } }).updatedParty;
          }
          interactionHook.setConversation(prev => [...prev, {
            role: 'system',
            content: c.questCompleted ? `🎉 Side quest complete: ${c.title}!` : `✓ ${c.milestone.text}`
          }]);
        });
        setSelectedHeroes(party);
        setTimeout(() => performSave(), 500);
      }
    }

    // --- Main campaign milestones ---
    const milestones = settings?.milestones;
    if (!milestones || milestones.length === 0) return;

    const result = checkMilestoneCompletion(milestones, event, heroLevel);
    if (!result) return;

    if (result.type === 'completed') {
      logger.info(`[MILESTONE] Completed: #${result.milestoneId} — ${result.milestone.text}`);
      setSettings(prev => ({ ...prev, milestones: result.updatedMilestones }));

      // Apply milestone rewards to lead hero
      const rewards = getMilestoneRewards(result.milestone);
      if (rewards.xp > 0 || rewards.gold > 0 || rewards.items.length > 0) {
        const rewardResult = applyEncounterOutcomeToParty({
          party: currentParty,
          result: { rewards, heroIndex: 0 }
        });
        setSelectedHeroes(rewardResult.updatedParty);
        const heroName = rewardResult.updatedParty[0]?.characterName || 'Hero';
        const rewardLog = formatEncounterRewardLog(heroName, rewardResult.rewardMessages);
        if (rewardLog) logger.info(rewardLog);
      }

      // Chat celebration message (also serves as context for the AI's next narration)
      const rewardSummary = rewards.xp > 0 || rewards.gold > 0
        ? `\nRewards: ${rewards.xp > 0 ? `+${rewards.xp} XP` : ''}${rewards.gold > 0 ? ` +${rewards.gold} gold` : ''}${rewards.items.length > 0 ? ` + ${rewards.items.join(', ')}` : ''}`
        : '';
      const celebrationMsg = {
        role: 'system',
        content: result.campaignComplete
          ? `🏆 CAMPAIGN COMPLETE! 🏆\n${settings.campaignGoal || 'Victory Achieved!'}\n\nThe tale of your heroic deeds will be sung for generations to come!`
          : `🎉 Milestone Achieved! 🎉\n${result.milestone.text}${rewardSummary}`
      };
      interactionHook.setConversation(prev => [...prev, celebrationMsg]);

      if (result.campaignComplete) {
        setSettings(prev => ({ ...prev, campaignComplete: true }));
      }
    } else if (result.type === 'blocked') {
      logger.debug(`[MILESTONE] Blocked: #${result.milestoneId} — needs: ${result.unmetRequirements.map(r => r.text).join(', ')}`);
    } else if (result.type === 'level_blocked') {
      logger.debug(`[MILESTONE] Level blocked: #${result.milestoneId} — needs Lv.${result.requiredLevel}, have Lv.${result.currentLevel}`);
    }
  };

  // --- Town Tile Click Wrapper (adds encounter checks) ---
  const handleTownTileClick = (clickedX, clickedY) => {
    // Delegate movement to the hook
    mapHook.handleTownTileClick(clickedX, clickedY, interactionHook.setConversation, interactionHook.conversation);

    // Check for town encounter after moving
    // Create a synthetic tile that the encounter generator recognizes as 'town'
    const syntheticTownTile = { poi: 'town', biome: 'plains' };
    const townEncounter = checkForEncounter(syntheticTownTile, false, settings, movesSinceEncounter);

    if (townEncounter) {
      // Close map modal — conflict rule handles this once map is migrated
      mapHook.setIsMapModalOpen(false);
      reopenMapAfterEncounterRef.current = true; // reopen once the encounter resolves
      openEncounterAction({ encounter: townEncounter });
      setMovesSinceEncounter(0);
    } else {
      setMovesSinceEncounter(prev => prev + 1);
    }
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
    const itemNames = (loot.items || []).map(k => (ITEM_CATALOG[k]?.name) || k);
    const parts = [];
    if (loot.gold) parts.push(`${loot.gold} gold`);
    if (itemNames.length) parts.push(itemNames.join(', '));
    interactionHook.setConversation(prev => [...prev, { role: 'system', content: `💰 You find ${parts.join(' and ')}.` }]);
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
    interactionHook.setConversation(prev => [...prev, { role: 'system', content: `❗ You recover ${item.name}.` }]);
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

  const handleSiteTileClick = (clickedX, clickedY) => {
    const movedTile = mapHook.handleSiteTileClick(clickedX, clickedY);
    if (!movedTile) return; // move rejected (blocked / too far)

    // Fixed room set-piece takes priority over wandering rolls.
    if (movedTile.content && !movedTile.content.consumed) {
      const c = movedTile.content;
      mapHook.markSiteContentConsumed(clickedX, clickedY);
      if (c.kind === 'encounter' || (c.kind === 'objective' && c.objectiveType === 'combat')) {
        // a normal mob or a milestone boss — both run through the combat flow; a boss
        // carries enemyId so its defeat completes the milestone in handleEncounterResolve.
        mapHook.setIsMapModalOpen(false);
        reopenMapAfterEncounterRef.current = true;
        openEncounterAction({ encounter: c.encounter });
      } else if (c.kind === 'loot') {
        grantSiteLoot(c.loot);
      } else if (c.kind === 'objective' && c.objectiveType === 'item') {
        grantObjectiveItem(c.item);
      } else if (c.kind === 'objective' && c.objectiveType === 'location') {
        interactionHook.setConversation(prev => [...prev, { role: 'system', content: `❗ You reach ${c.name}.` }]);
        checkMilestoneEvent({ type: 'location_visited', locationId: c.locationId }, selectedHeroes);
        setTimeout(() => performSave(), 500);
      }
      return;
    }

    // Hybrid: a small per-move chance of wandering monsters in the corridors, using the
    // same probabilistic model as the world map (immediate-tier only — no narrative pops).
    const siteType = mapHook.currentSiteMap?.type || 'cave';
    const wandering = checkForEncounter({ poi: siteType, biome: 'plains' }, false, settings, movesSinceEncounter);
    if (wandering && wandering.encounterTier === 'immediate') {
      mapHook.setIsMapModalOpen(false);
      reopenMapAfterEncounterRef.current = true;
      openEncounterAction({ encounter: wandering });
      setMovesSinceEncounter(0);
    } else {
      setMovesSinceEncounter(prev => prev + 1);
    }
  };

  // Accept an offered side quest (from a building quest-giver). Activates it so its steps
  // start tracking and any site it targets gets revealed/injected on entry.
  const handleAcceptSideQuest = (questId) => {
    const q = (settings?.sideQuests || []).find(x => x.id === questId);
    if (!q || q.status !== 'available') return;
    setSettings(prev => ({ ...prev, sideQuests: acceptSideQuest(prev.sideQuests || [], questId) }));
    interactionHook.setConversation(prev => [...prev, { role: 'system', content: `📜 New quest: ${q.title} — ${q.description}` }]);
    setTimeout(() => performSave(), 500);
  };

  // Exploration rumour: occasionally OFFER an available, map-valid side quest while
  // travelling (every quest in sideQuests is already validated by selection, so its POI
  // exists). Offer-based — the player chooses; accepting reveals its site.
  const RUMOUR_CHANCE = 0.12;
  const maybeOfferRumour = () => {
    const sq = settings?.sideQuests;
    if (!sq || sq.length === 0) return;
    const available = sq.filter(q => q.status === 'available' && (q.minLevel || 1) <= effectivePartyLevel(selectedHeroes));
    if (available.length === 0) return;
    if (Math.random() >= RUMOUR_CHANCE) return;
    const quest = available[Math.floor(Math.random() * available.length)];
    openQuestOffer({ quest, onAccept: () => handleAcceptSideQuest(quest.id) });
  };

  // Hand in completed side-quest turn-ins at a building (return-to-giver / courier).
  const handleTurnInQuest = (ctx) => {
    const sideQuests = settings?.sideQuests;
    if (!sideQuests || sideQuests.length === 0) return;
    const { updatedSideQuests, completions } = turnInQuest(sideQuests, ctx);
    if (completions.length === 0) return;
    setSettings(prev => ({ ...prev, sideQuests: updatedSideQuests }));
    let party = selectedHeroes;
    completions.forEach(c => {
      party = applyEncounterOutcomeToParty({ party, result: { rewards: c.rewards || { xp: 0, gold: 0, items: [] }, heroIndex: 0 } }).updatedParty;
      if (c.questCompleted && c.questRewards) {
        party = applyEncounterOutcomeToParty({ party, result: { rewards: c.questRewards, heroIndex: 0 } }).updatedParty;
      }
      interactionHook.setConversation(prev => [...prev, { role: 'system', content: c.questCompleted ? `🎉 Side quest complete: ${c.title}!` : `✓ ${c.milestone.text}` }]);
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
    const text = composeLocalMovementNarrative({
      tile,
      coords,
      worldSeed,
      worldMap: mapHook.worldMap,
      settings,
      selectedHeroes: heroes || selectedHeroes,
      isNewArea
    });
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

  // --- Map Movement Handler (Smart narration: local line per move, AI on demand) ---
  const handleMoveOnWorldMap = async (clickedX, clickedY) => {
    if (!hasAdventureStarted || interactionHook.isLoading) return;

    if (!isAdjacentWorldMove(mapHook.playerPosition, clickedX, clickedY)) {
      // Append to the conversation (a positioned log entry) rather than the sticky error
      // banner, which always shows the latest message regardless of where it happened.
      interactionHook.setConversation(prev => [...prev, {
        role: 'system',
        content: 'You can only move to an adjacent tile.'
      }]);
      return;
    }

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

    // POI Check (for location Modal — towns, etc.). Secret sites (caves/ruins) don't offer
    // an entrance until a quest has revealed them, so they read as plain ground until then.
    const poiEncounter = buildPoiEncounter(targetTile);
    const poiShown = poiEncounter && !isSiteHidden(targetTile);
    if (poiShown) {
      mapHook.setIsMapModalOpen(false); // close map so the location modal is visible
      openEncounterInfo({
        encounter: poiEncounter,
        onEnterLocation: () => mapHook.handleEnterLocation(poiEncounter, interactionHook.setConversation, interactionHook.conversation),
        onViewMap: () => mapHook.setIsMapModalOpen(true)
      });
    }

    // Milestone check: location_visited
    if (targetTile.poi || targetTile.townName) {
      const locationId = targetTile.poi || targetTile.townName?.toLowerCase().replace(/\s+/g, '_');
      if (locationId) {
        checkMilestoneEvent({ type: 'location_visited', locationId }, selectedHeroes);
      }
    }

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
      aiNarrativeEnabled,
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

    if (plannedEncounterFlow.openActionEncounter) {
      mapHook.setIsMapModalOpen(false); // close map so the encounter is visible
      reopenMapAfterEncounterRef.current = true; // reopen once the encounter resolves
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
    // (movement no longer auto-narrates). Cleared otherwise so it doesn't leak to a
    // later tile.
    if (plannedEncounterFlow.flowType === 'narrative_context') {
      setPendingLookEncounter(plannedEncounterFlow.narrativeEncounter || null);
    } else {
      setPendingLookEncounter(null);
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
        return;
      }
      const aiMessage = { role: 'ai', content: aiResponse };
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
    } finally {
      interactionHook.setIsLoading(false);
    }
  };

  const handleEncounterResolve = (result) => {
    logger.info('Encounter resolved', result);

    const {
      updatedParty,
      heroIndex,
      rewardMessages,
      penaltyMessages
    } = applyEncounterOutcomeToParty({
      party: selectedHeroes,
      result
    });
    setSelectedHeroes(updatedParty);

    const heroName = updatedParty[heroIndex]?.characterName || 'Hero';
    const rewardLog = formatEncounterRewardLog(heroName, rewardMessages);
    const penaltyLog = formatEncounterPenaltyLog(heroName, penaltyMessages);
    if (rewardLog) logger.info(rewardLog);
    if (penaltyLog) logger.info(penaltyLog);

    // Milestone checks after encounter resolution
    const activeEncounter = encounterActionData?.encounter;
    const encounterName = activeEncounter?.name || 'Encounter';
    if (result?.outcome === 'victory' || result?.outcome === 'success') {
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

    closeEncounterAction();

    // Reopen the map so the player can keep exploring after the fight.
    if (reopenMapAfterEncounterRef.current) {
      reopenMapAfterEncounterRef.current = false;
      mapHook.setIsMapModalOpen(true);
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
          townName={townName}
          subLocationName={subLocationName}
          townPosition={mapHook.townPlayerPosition}
          worldPosition={mapHook.playerPosition}
          currentBiome={currentBiome}
          onOpenMap={() => {
            mapHook.setIsMapModalOpen(true);
            if (tourActive && tourStep?.id === 'open-map') advanceTour();
          }}
          onOpenInventory={() => openInventory({
            selectedHeroes,
            onUseItem: (heroId, itemKey, healedHero) => {
              setSelectedHeroes(prev => replaceHeroInParty(prev, healedHero));
            }
          })}
          onOpenHowToPlay={openHowToPlay}
          onLookAround={handleLookAround}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onManualSave={async () => {
            const timestamp = new Date();
            const title = `Adventure - ${timestamp.toLocaleDateString()} ${timestamp.toLocaleTimeString()}`;
            const success = await performSave();
            if (success !== false) {
              openSaveConfirmation({ title });
            }
          }}
          canManualSave={!!sessionId}
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
        isSettingsModalOpen={isSettingsModalOpen}
        setIsSettingsModalOpen={setIsSettingsModalOpen}
        settings={settings}
        setSettings={setSettings}
        selectedProvider={selectedProvider}
        setSelectedProvider={setSelectedProvider}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        assistantProvider={assistantProvider}
        setAssistantProvider={setAssistantProvider}
        assistantModel={assistantModel}
        setAssistantModel={setAssistantModel}
        worldSeed={worldSeed}
        selectedHeroes={selectedHeroes}
        mapHook={mapHook}
        handleMoveOnWorldMap={handleMoveOnWorldMap}
        interactionHook={interactionHook}
        currentTile={currentTile}
        hasAdventureStarted={hasAdventureStarted}
        handleTownTileClick={handleTownTileClick}
        handleSiteTileClick={handleSiteTileClick}
        handleEncounterResolve={handleEncounterResolve}
        handleHeroUpdate={handleHeroUpdate}
        onQuestItemFound={(itemId, itemName) => {
          checkMilestoneEvent({ type: 'item_acquired', itemId }, selectedHeroes);
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
          return { restType, healingResults };
        }}
        sideQuests={settings?.sideQuests}
        onAcceptSideQuest={handleAcceptSideQuest}
        onTurnInQuest={handleTurnInQuest}
        onBuy={(itemKey) => {
          const result = buyItem(selectedHeroes, itemKey);
          if (result.ok) setSelectedHeroes(result.party);
          return result;
        }}
        onSell={(itemKey) => {
          const result = sellItem(selectedHeroes, itemKey);
          if (result.ok) setSelectedHeroes(result.party);
          return result;
        }}
      />

      {/* Save Confirmation Modal */}
      <SaveConfirmationModal />
      <QuestOfferModal />
    </div>
  );
};

export default Game;
