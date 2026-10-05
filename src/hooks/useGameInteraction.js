import { useMemo, useRef, useState } from 'react';
import { getTile } from '../utils/mapGenerator';
import { llmService } from '../services/llmService';
import { DM_PROTOCOL } from '../data/prompts';
import { buildModelOptions, resolveProviderAndModel } from '../llm/modelResolver';
import { parseCheckMarker, resolveSkillCheck, formatCheckRollLine, formatCheckResultForPrompt,
    locationKey, isCheckLocked, addCheckLock, formatActiveLocksForPrompt, formatBlockedCheckForPrompt } from '../game/skillCheck';
import { getSupportBonus } from '../utils/multiRoundEncounter';
import { getMilestoneStatus, formatMilestonePromptText, formatSideQuestPromptText, buildLocationContext } from '../game/turnContext';
import { formatPartyInfo } from '../game/promptComposer';
import { embedAndStore, query as ragQuery, formatRagContext } from '../game/ragEngine';
import { composeIntro, formatStartObjective } from '../game/introComposer';
import { createLogger } from '../utils/logger';

const logger = createLogger('game-interaction');

// Maps the player's "Narrative Style" (responseVerbosity) setting to a concrete instruction
// appended to every DM narration prompt, so the choice actually shapes the output. Previously
// this setting was saved but never used.
const VERBOSITY_DIRECTIVE = {
  Concise: 'Keep the narration tight and brisk: roughly one short paragraph (2-3 sentences). Favour momentum and clarity over lengthy description.',
  Moderate: 'Keep the narration balanced: about two short paragraphs with a few vivid, well-chosen details.',
  Descriptive: 'Write richly and atmospherically: three or more paragraphs with strong sensory detail, mood, and texture.'
};

// Any stray check/roll marker outside the resolved check flow (e.g. in the authored opening,
// where a check must never fire) is scrubbed from display. The live check path uses
// parseCheckMarker (skillCheck.js), which handles the two-argument [CHECK: skill, tier] form.
const STRAY_CHECK_MARKER = /\[(?:CHECK|ROLL):[^\]]*\]/gi;


// formatStartObjective now lives in introComposer.js (imported above) so the
// destination-naming logic (#69) sits with the authored opening it grounds.

// Validate a polished opening before trusting it. The polish pass may ONLY reword the
// authored text: it must not drop the grounded facts or balloon with invented content.
// Returns true only when the polished text is safe to show; otherwise the caller falls
// back to the authored opening verbatim.
const isPolishSafe = (polished, authored, { startPlaceName, destination }) => {
    if (!polished || !polished.trim()) return false;
    // Gross-size guard against added (or dropped) content: a reword stays close in length.
    const lo = authored.length * 0.4;
    const hi = authored.length * 1.6;
    if (polished.length < lo || polished.length > hi) return false;
    // Must still name the start place (when it is a real name, not the generic fallback).
    if (startPlaceName && startPlaceName !== 'this place' && !polished.includes(startPlaceName)) return false;
    // Must still name the destination settlement when the objective is elsewhere.
    if (destination && destination !== startPlaceName && !polished.includes(destination)) return false;
    return true;
};


// Helper function to clean AI responses
const cleanAIResponse = (response, contextToRemove) => {
    // Remove any echoed context at the beginning
    let cleaned = response;

    // If the response starts with the context, remove it
    if (contextToRemove && cleaned.includes(contextToRemove)) {
        cleaned = cleaned.replace(contextToRemove, '');
    }

    // #76: the LLM no longer adjudicates outcomes. Strip any completion marker it still
    // emits (old few-shot habits / training data) so a leaked control token never reaches
    // the player — the engine completes milestones/campaigns. The [CHECK/ROLL] trigger is
    // deliberately NOT stripped here: it's a bounded skill-check proposal handled downstream.
    cleaned = cleaned.replace(/\[COMPLETE_MILESTONE:[\s\S]*?\]/gi, '');
    cleaned = cleaned.replace(/\[COMPLETE_CAMPAIGN\]/gi, '');
    // #83: a model may echo the injected [CHECK RESULT: ...] fact — never show it. The
    // [CHECK: skill, tier] PROPOSAL is deliberately NOT stripped here; it's parsed first.
    cleaned = cleaned.replace(/\[CHECK RESULT:[\s\S]*?\]/gi, '');

    // Remove common prompt artifacts
    cleaned = cleaned.replace(/\[CONTEXT\][\s\S]*?\[TASK\]/gi, '');
    cleaned = cleaned.replace(/\[ADVENTURE START\]/gi, '');
    cleaned = cleaned.replace(/Current Summary:.*?beginning\./gi, '');
    cleaned = cleaned.replace(/Describe the arrival.*?narrative description\./gi, '');

    // Normalize line breaks: replace single newlines mid-sentence with spaces
    // but preserve paragraph breaks (double newlines).
    // Handles AI output that wraps lines with optional leading whitespace.
    cleaned = cleaned.replace(/([a-z,;:.!?'"\u2014])\n[ \t]*([a-z])/gi, '$1 $2');

    // Clean up extra whitespace
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // Max 2 newlines
    cleaned = cleaned.trim();

    return cleaned;
};


const useGameInteraction = (
    loadedConversation,
    settings,
    setSettings,
    selectedProvider,
    selectedModel,
    selectedHeroes,
    worldMap,
    playerPosition,
    hasAdventureStarted,
    setHasAdventureStarted,
    locationContext = {},
    sessionId = null,
    aiAvailable = true,
    onNpcTalked = null,
    authReady = true
) => {
    const [userInput, setUserInput] = useState('');
    const [conversation, setConversation] = useState(loadedConversation?.conversation_data || []);
    const [currentSummary, setCurrentSummary] = useState(loadedConversation?.summary || '');
    const [isLoading, setIsLoading] = useState(false);
    const [progressStatus, setProgressStatus] = useState(null); // { status, elapsed } for LLM progress
    const [error, setError] = useState(null);
    const [checkRequest, setCheckRequest] = useState(null); // { type: 'skill', skill: 'Perception' } or null
    // #83: holds a resolved check's [CHECK RESULT: ...] line to inject into the NEXT prompt, so
    // the model narrates the consequence as fact without a second AI call. Consumed once.
    const pendingCheckContextRef = useRef(null);
    const [lastPrompt, setLastPrompt] = useState('');

    const modelOptions = useMemo(() => buildModelOptions(), []);

    const getCurrentModel = () => {
        return resolveProviderAndModel(selectedProvider, selectedModel).model;
    };

    const generateResponse = async (model, prompt, opts = {}) => {
        // Append the player's Narrative Style directive so it actually affects the narration.
        // opts.style overrides the player's setting for this one call (the opening polish pass
        // passes a "match the original length" directive so it is NOT told to write richly and
        // expand, which used to fight the reword-only guard). An empty override omits the line.
        const style = opts.style !== undefined
            ? opts.style
            : (VERBOSITY_DIRECTIVE[settings?.responseVerbosity] || VERBOSITY_DIRECTIVE.Moderate);
        const fullPrompt = style
            ? `${DM_PROTOCOL}${prompt}\n\nStyle directive (shapes how you write; do not repeat it): ${style}`
            : `${DM_PROTOCOL}${prompt}`;
        setLastPrompt(fullPrompt);
        const resolved = resolveProviderAndModel(selectedProvider, model);
        return await llmService.generateUnified({
            provider: resolved.provider,
            model: resolved.model,
            prompt: fullPrompt,
            maxTokens: 1500, // server caps at 1500 (cf-worker ai.ts schema); 1600 made zod 400 every request (playtest 2026-07-07)
            temperature: 0.7
        });
    };

    const summarizeConversation = async (summary, newMessages) => {
        const resolved = resolveProviderAndModel(selectedProvider, getCurrentModel());
        const recentText = newMessages.map(msg => `${msg.role === 'ai' ? 'AI' : 'User'}: ${msg.content}`).join('\n');
        const prompt = `You are a concise story summarizer. Combine the old summary with the recent exchange into a single brief summary (2-4 sentences) capturing key events, locations, and character actions. Output ONLY the summary text, nothing else.\n\nOld summary: ${summary || 'The adventure begins.'}\n\nRecent exchange:\n${recentText}\n\nNew summary:`;

        try {
            // Summarization uses generateUnified directly without DM_PROTOCOL wrapper
            return await llmService.generateUnified({
                provider: resolved.provider,
                model: resolved.model,
                prompt,
                maxTokens: 400,
                temperature: 0.3
            });
        } catch (error) {
            logger.error('Summarization failed', error);
            return summary;
        }
    };

    const handleStartAdventure = async () => {
        if (hasAdventureStarted || isLoading) return;

        // Auth may still be re-hydrating the Supabase session on a reload; committing
        // now would take the guest (no-AI) branch below for a signed-in player. Defer
        // without starting so the Start Adventure button stays and can be triggered
        // again the moment auth resolves.
        if (!authReady) return;

        if (!selectedHeroes || selectedHeroes.length === 0) {
            setError('Cannot start game without selecting heroes.'); return;
        }

        setHasAdventureStarted(true);
        setIsLoading(true);
        setError(null);

        // The opening is now AUTHORED and grounded for EVERYONE (playtest 2026-07-07: an
        // LLM composing the scene from scratch kept inventing the wrong town and NPCs the
        // player could then chase, which the in-game AI had no record of). composeIntro
        // builds a good two-part opening (scene + objective) purely from campaign data,
        // referencing ONLY the start town, its atmosphere, any REAL placed NPCs, and the
        // real current milestone + its destination. Signed-in players get a tightly-bounded
        // LLM POLISH pass over that authored text; the model never composes from scratch,
        // so it can never introduce a chaseable figure.
        const currentTile = getTile(worldMap, playerPosition.x, playerPosition.y);
        const milestoneStatus = getMilestoneStatus(settings.milestones);
        const current = milestoneStatus.current;

        const startPlaceName = locationContext?.currentTownTile?.townName
            || (currentTile?.poi === 'town' ? currentTile?.townName : null)
            || currentTile?.biome
            || 'this place';
        const isStartTown = !!(locationContext?.currentTownTile?.townName
            || (currentTile?.poi === 'town' && currentTile?.townName));
        const startSize = locationContext?.currentTownTile?.townSize || currentTile?.townSize || null;

        // Only surface NPCs that are REALLY placed at the start (present when the party
        // begins inside an already-populated town). Never invent anyone.
        const placedNpcs = (locationContext?.isInsideTown && Array.isArray(locationContext?.currentTownMap?.npcs))
            ? locationContext.currentTownMap.npcs.map(n => ({ name: n.name, role: n.job || n.title || n.role }))
            : [];

        const authoredOpening = composeIntro(settings, selectedHeroes, {
            startPlaceName,
            isTown: isStartTown,
            startSize,
            biome: currentTile?.biome,
            currentMilestone: current,
            placedNpcs,
        });

        // Guests (no AI): use the authored opening verbatim, plus the sign-in nudge.
        if (!aiAvailable) {
            const introText = `${authoredOpening}\n\n*Explore the map, face what you find, and forge your path. Sign in any time to wake the AI Dungeon Master for full narration and free-form actions.*`;
            setConversation(prev => [...prev, { role: 'ai', content: introText }]);
            setIsLoading(false);
            return;
        }

        const model = getCurrentModel();
        const { destination: objectiveDest } = formatStartObjective(current);

        try {
            // POLISH PASS (the only LLM involvement): the model may ONLY reword the
            // authored opening for freshness. It must not change any fact, add or rename
            // any entity, or alter the destination/next step. On empty/unsafe/error, fall
            // back to the authored text verbatim so the opening is always grounded.
            let aiResponse = authoredOpening;
            const polishPrompt = `[ADVENTURE START - POLISH]\n\n[OPENING]\n${authoredOpening}\n\n[TASK]\nLightly reword and vary the phrasing of the opening above for freshness. You MUST NOT change any facts, add or rename any person, place, building, item, or objective, introduce any character not already present, or change the destination or next step. Do not add new sentences or content. Return the same opening, same structure and same facts, only rephrased. Begin your response directly with the reworded opening.`;
            try {
                let polished = await generateResponse(model, polishPrompt, { style: 'Match the length and paragraph count of the original exactly. Do not expand, add sentences, or add detail; only rephrase what is there.' });
                polished = cleanAIResponse(polished, authoredOpening).trim();
                if (isPolishSafe(polished, authoredOpening, { startPlaceName, destination: objectiveDest })) {
                    aiResponse = polished;
                } else {
                    logger.warn('Opening polish pass rejected (empty/unsafe/dropped a grounded name); using authored opening verbatim');
                }
            } catch (polishErr) {
                logger.warn('Opening polish pass failed; using authored opening verbatim', polishErr);
            }

            // The authored opening never rolls a check; scrub any stray marker so it can't
            // leak into the first scene the player reads.
            aiResponse = aiResponse.replace(STRAY_CHECK_MARKER, '').trim();

            if (!aiResponse || !aiResponse.trim()) {
                // An empty opening is a failed start: keep the adventure un-started so
                // the Start Adventure button stays and the player can retry.
                logger.warn('Empty AI response received at adventure start; keeping the start available for retry');
                setHasAdventureStarted(false);
                setError('The Dungeon Master gave no reply. Please try starting the adventure again.');
                return;
            }
            const aiMessage = { role: 'ai', content: aiResponse };

            setConversation(prev => {
                const updated = [...prev, aiMessage];
                // Fire-and-forget: embed the AI response for RAG
                if (sessionId) {
                    embedAndStore(sessionId, aiResponse, { msgIndex: updated.length - 1 })
                        .catch(err => logger.warn('RAG embed failed (adventure start):', err));
                }
                return updated;
            });

            const updatedSummary = await summarizeConversation(currentSummary, [aiMessage]);
            setCurrentSummary(updatedSummary);
        } catch (error) {
            logger.error('Failed to fetch initial AI response', error);
            // A failed start must NOT count as started (playtest 2026-07-07: the first
            // start call 400'd and the Start Adventure button vanished forever, since
            // GameMainPanel hides it once hasAdventureStarted is true). Reset the gate
            // so the button stays and a retry runs the full start flow again.
            setHasAdventureStarted(false);
            setError(`Error starting adventure: ${error.message}`);
            setConversation(prev => [...prev, { role: 'ai', content: `Error: Could not start the adventure. ${error.message}` }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!hasAdventureStarted || !userInput.trim() || isLoading) return;
        if (!aiAvailable) return; // free-text actions need the AI DM (gated for guests)

        if (!selectedHeroes || selectedHeroes.length === 0) {
            setError('Cannot start game without selecting heroes.');
            return;
        }

        const model = getCurrentModel();
        const userMessage = { role: 'user', content: userInput };

        // Optimistic update
        const tempConversation = [...conversation, userMessage];
        setConversation(tempConversation);
        setUserInput('');
        setIsLoading(true);
        setError(null);

        const partyInfo = formatPartyInfo(selectedHeroes);
        const currentTile = getTile(worldMap, playerPosition.x, playerPosition.y);
        const locationInfo = buildLocationContext(currentTile, playerPosition, locationContext, worldMap);
        const goalInfo = settings.campaignGoal ? `\nGoal: ${settings.campaignGoal}` : '';

        // Get milestone status
        const milestoneStatusRegular = getMilestoneStatus(settings.milestones);
        const milestonesInfoRegular = formatMilestonePromptText(milestoneStatusRegular);
        const sideQuestsInfoRegular = formatSideQuestPromptText(settings.sideQuests);

        // #83 Phase 2: the current scene's location key, and the approaches already spent
        // (failed) here — injected so the model steers away instead of letting more talking
        // reverse a failed check (the primary anti-retry defense).
        const currentLocation = locationKey({
            isInsideTown: locationContext?.isInsideTown,
            townName: locationContext?.currentTownTile?.townName,
            isInsideSite: locationContext?.isInsideSite,
            siteName: locationContext?.currentSiteName,
        });
        const spentApproaches = formatActiveLocksForPrompt(settings.checkLocks, currentLocation);

        const gameContext = `Setting: ${settings.shortDescription || 'Fantasy Realm'}. Mood: ${settings.grimnessLevel || 'Normal'}.${goalInfo}${milestonesInfoRegular}${sideQuestsInfoRegular}\n${locationInfo}. Party: ${partyInfo}.${spentApproaches ? `\n${spentApproaches}` : ''}`;

        // Query RAG for relevant past events (appended at end for cache-friendliness)
        let ragContext = '';
        if (sessionId) {
            try {
                const ragResults = await ragQuery(sessionId, userMessage.content);
                ragContext = formatRagContext(ragResults);
            } catch (err) {
                logger.warn('RAG query failed, continuing without:', err);
            }
        }

        // #83: a check resolved on the PREVIOUS turn is handed to the model here as fact, so
        // it narrates the consequence (never re-adjudicates it). Consumed once, then cleared.
        const resolvedCheckContext = pendingCheckContextRef.current
            ? `\n\n[RESOLVED CHECK — narrate this as already-decided fact]\n${pendingCheckContextRef.current}`
            : '';
        pendingCheckContextRef.current = null;

        const prompt = `[CONTEXT]\n${gameContext}${resolvedCheckContext}\n\n[SUMMARY]\n${currentSummary || 'The tale unfolds.'}\n\n[PLAYER ACTION]\n${userMessage.content}\n\n[NARRATE]${ragContext}`;

        try {
            let aiResponse = await generateResponse(model, prompt);

            // Clean the response (also strips any leaked [COMPLETE_MILESTONE]/[COMPLETE_CAMPAIGN]
            // control token so it never reaches the player).
            aiResponse = cleanAIResponse(aiResponse, gameContext);

            // #76: milestone and campaign completion are DECIDED BY THE ENGINE, never by the
            // LLM. Mechanical milestones (item/combat/location/talk) complete on their game
            // events via checkMilestoneEvent (Game.js), and the campaign completes when the
            // engine marks the final milestone done (checkMilestoneCompletion.campaignComplete).
            // The former [COMPLETE_MILESTONE]/[COMPLETE_CAMPAIGN] marker-parsing path is gone:
            // free-text judgment misfired (2026-07-15 model trial), and no prompt guard fixed
            // the class. Legacy narrative milestones are migrated to engine types on load
            // (migrateNarrativeMilestones), so no old save is stranded.

            // #83: a proposed skill check. The ENGINE rolls, never the model. Parse the
            // [CHECK: skill, tier] marker, resolve it with the SAME modifier stack combat uses
            // (party Lead + support), and strip the marker from the narration. The visible roll
            // line + next-turn context injection happen just below, after the message is added.
            let resolvedCheck = null;
            let blockedCheck = null;
            const checkProposal = parseCheckMarker(aiResponse);
            if (checkProposal) {
                const lockEntry = { location: currentLocation, target: checkProposal.target, skill: checkProposal.skill };
                if (isCheckLocked(settings.checkLocks, lockEntry)) {
                    // #83 Phase 2 hard backstop: this (location, target, skill) already failed
                    // this scene, so DO NOT roll a fresh die. Tell the model the approach is dead
                    // (next-turn injection) and surface a brief note; the player must find another
                    // route or leave/rest. This is mechanical, not vibes.
                    blockedCheck = checkProposal;
                    pendingCheckContextRef.current = formatBlockedCheckForPrompt(checkProposal.skill, checkProposal.target);
                    logger.info(`[CHECK] blocked (already spent): ${checkProposal.skill}${checkProposal.target ? ` vs ${checkProposal.target}` : ''} @ ${currentLocation}`);
                } else {
                    resolvedCheck = resolveSkillCheck({
                        skill: checkProposal.skill,
                        tier: checkProposal.tier,
                        hero: selectedHeroes?.[0],
                        supportBonus: getSupportBonus(selectedHeroes || [], 0),
                    });
                    logger.info(`[CHECK] ${resolvedCheck.skill} (${resolvedCheck.tier}, DC ${resolvedCheck.dc}) -> rolled ${resolvedCheck.rollResult.total}: ${resolvedCheck.outcomeTier}`);
                }
                aiResponse = aiResponse.replace(checkProposal.raw, '').replace(/[ \t]{2,}/g, ' ').trim();
            }
            // Scrub any remaining check/roll marker (a second one, or a malformed proposal whose
            // skill didn't resolve) so a raw control token never renders to the player.
            aiResponse = aiResponse.replace(STRAY_CHECK_MARKER, '').trim();

            if (!aiResponse || !aiResponse.trim()) {
                logger.warn('Empty AI response received, skipping');
                setError('AI returned an empty response. Please try again.');
                return;
            }
            const aiMessage = { role: 'ai', content: aiResponse };

            const updatedConv = [...tempConversation, aiMessage];
            setConversation(updatedConv);

            // #83: surface the check's d20 breakdown as a system line (the player's immediate,
            // honest feedback, mirroring combat), and stash the result so the NEXT prompt carries
            // it as fact — the AI narrates the consequence on its own turn, no extra AI call.
            if (resolvedCheck) {
                const lead = selectedHeroes?.[0];
                const heroName = lead?.characterName || lead?.heroName || 'The party';
                setConversation(prev => [...prev, { role: 'system', content: formatCheckRollLine(resolvedCheck, heroName) }]);
                pendingCheckContextRef.current = formatCheckResultForPrompt(resolvedCheck);
                // #83 Phase 2: a FAILED check locks this (location, target, skill) for the scene,
                // PERSISTED in the save so a reload is not a free reroll. Cleared on a long rest
                // or on entering a different location (Game.js). Success never locks.
                if (!resolvedCheck.success) {
                    const lockEntry = { location: currentLocation, target: checkProposal.target, skill: resolvedCheck.skill };
                    setSettings(prev => ({ ...prev, checkLocks: addCheckLock(prev.checkLocks, lockEntry) }));
                }
            } else if (blockedCheck) {
                setConversation(prev => [...prev, { role: 'system', content:
                    `🚫 That approach is spent — ${blockedCheck.skill}${blockedCheck.target ? ` on ${blockedCheck.target}` : ''} won't move them further here. Try another way, or come back later.` }]);
            }

            // Fire-and-forget: embed the AI response for RAG
            if (sessionId) {
                embedAndStore(sessionId, aiResponse, { msgIndex: updatedConv.length - 1 })
                    .catch(err => logger.warn('RAG embed failed (submit):', err));
            }

            const updatedSummary = await summarizeConversation(currentSummary, [userMessage, aiMessage]);
            setCurrentSummary(updatedSummary);

        } catch (error) {
            logger.error('Failed to fetch AI response', error);
            setError(`Error getting response from ${selectedProvider}: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleInputChange = (event) => {
        setUserInput(event.target.value);
    };

    return {
        userInput,
        setUserInput, // Exposed in case needed
        conversation, // State
        setConversation, // Exposed helpers
        currentSummary,
        setCurrentSummary,
        isLoading,
        setIsLoading,
        progressStatus,
        setProgressStatus,
        error,
        setError,
        modelOptions,
        handleStartAdventure,
        handleSubmit,
        checkRequest,
        setCheckRequest,
        handleInputChange,
        lastPrompt,
        setLastPrompt
    };
};

export default useGameInteraction;
