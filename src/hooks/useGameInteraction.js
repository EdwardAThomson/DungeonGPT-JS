import { useMemo, useRef, useState } from 'react';
import { getTile } from '../utils/mapGenerator';
import { llmService } from '../services/llmService';
import { DM_PROTOCOL } from '../data/prompts';
import { buildModelOptions, resolveProviderAndModel } from '../llm/modelResolver';
import { areRequirementsMet } from '../game/milestoneEngine';
import { parseCheckMarker, resolveSkillCheck, formatCheckRollLine, formatCheckResultForPrompt } from '../game/skillCheck';
import { getSupportBonus } from '../utils/multiRoundEncounter';
import { getStepHint } from '../game/questHints';
import { formatPartyInfo } from '../game/promptComposer';
import { embedAndStore, query as ragQuery } from '../game/ragEngine';
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

// Format RAG results into a prompt block (appended at end for cache-friendliness)
const formatRagContext = (results) => {
    if (!results || results.length === 0) return '';
    const items = results.map((r, i) => `- ${r.text.slice(0, 300)}`).join('\n');
    return `\n\n[RECALLED MEMORIES FROM PAST EVENTS]\n${items}`;
};

// Any stray check/roll marker outside the resolved check flow (e.g. in the authored opening,
// where a check must never fire) is scrubbed from display. The live check path uses
// parseCheckMarker (skillCheck.js), which handles the two-argument [CHECK: skill, tier] form.
const STRAY_CHECK_MARKER = /\[(?:CHECK|ROLL):[^\]]*\]/gi;

// Helper function to normalize milestones (backward compatibility)
const normalizeMilestones = (milestones) => {
    if (!milestones || milestones.length === 0) return [];

    // Check if already in new format (array of objects)
    if (typeof milestones[0] === 'object' && milestones[0].hasOwnProperty('text')) {
        return milestones;
    }

    // Old format (array of strings) - convert to new format
    return milestones.map((text, index) => ({
        id: index + 1,
        text,
        completed: false,
        location: null
    }));
};

// Helper function to get milestone status for prompts
const getMilestoneStatus = (milestones) => {
    const normalized = normalizeMilestones(milestones);
    const completed = normalized.filter(m => m.completed);
    const remaining = normalized.filter(m => !m.completed);
    const active = remaining.filter(m => areRequirementsMet(m, normalized));
    const locked = remaining.filter(m => !areRequirementsMet(m, normalized));
    const current = active[0] || null;

    return { current, completed, remaining, active, locked, all: normalized };
};

// Format milestone status as prompt text with type and state info
const formatMilestonePromptText = (milestoneStatus) => {
    const { completed, active, locked } = milestoneStatus;
    if (completed.length === 0 && active.length === 0 && locked.length === 0) return '';

    let text = '';
    if (active.length > 0) {
        text += '\nActive Milestones: ' + active.map((m, i) => {
            const typeTag = m.type ? ` [${m.type}]` : '';
            const levelTag = m.minLevel ? ` (Lv.${m.minLevel}+)` : '';
            let line = `${m.text}${typeTag}${levelTag}`;
            // Ground authored NPC objectives: name the canonical figure + venue so the
            // model reuses them instead of inventing a name ("Jorik", "the mayor").
            if (m.spawn?.type === 'npc' && m.spawn.name) {
                const who = m.spawn.role ? `${m.spawn.name} (${m.spawn.role})` : m.spawn.name;
                const where = m.building?.name || m.spawn.location;
                line += ` — speak with ${who}${where ? ` at ${where}` : ''}`;
                if (m.spawn.personality) line += `; ${m.spawn.personality}`;
            }
            // Talk objectives complete via the engine's Talk action (npc_talked), never by
            // the model. Cue the model to steer the party toward that conversation without
            // adjudicating it (the "outcomes are the engine's" protocol rule covers the rest).
            if (i === 0 && m.type === 'talk') {
                const who = m.spawn?.name || 'this person';
                line += ` (guide the party toward speaking with ${who}; the game completes this when they do — do not declare it done yourself)`;
            }
            return line;
        }).join('; ');
    }
    if (completed.length > 0) {
        text += '\nCompleted: ' + completed.map(m => m.text).join('; ');
    }
    if (locked.length > 0) {
        text += '\nLocked (prerequisites not met): ' + locked.map(m => m.text).join('; ');
    }
    return text;
};

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

// Ground ACTIVE side quests in the prompt so the DM narrates their real sources instead
// of inventing locations ("the herbalist in the next valley") for quest items. Compact:
// title + current step + the factual questHints source line, capped at a few quests.
const formatSideQuestPromptText = (sideQuests) => {
    const active = (sideQuests || []).filter(q => q && q.status === 'active').slice(0, 3);
    if (active.length === 0) return '';
    const lines = active.map(q => {
        const step = (q.milestones || []).find(m => !m.completed);
        if (!step) return q.title;
        const hint = getStepHint(step, q);
        return `${q.title}: ${step.text}${hint ? ` [${hint}]` : ''}`;
    });
    return `\nActive Side Quests: ${lines.join('; ')}. Quest items and objectives are found exactly where these bracketed hints say; do not invent other locations, vendors, or sources for them.`;
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

// Convert tile distance to a narrative descriptor
const describeDistance = (dist) => {
    if (dist <= 2) return 'nearby';
    if (dist <= 5) return 'not far';
    if (dist <= 10) return 'some distance away';
    return 'far away';
};

// Convert compass direction from dx/dy
const describeDirection = (dx, dy) => {
    const ns = dy < 0 ? 'north' : dy > 0 ? 'south' : '';
    const ew = dx > 0 ? 'east' : dx < 0 ? 'west' : '';
    return ns + ew || 'nearby';
};

// Find nearby POIs on the world map (towns, caves, etc.)
const findNearbyLandmarks = (worldMap, px, py, maxDist = 12) => {
    if (!worldMap) return [];
    const landmarks = [];
    const height = worldMap.length;
    const width = worldMap[0]?.length || 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (x === px && y === py) continue;
            const tile = worldMap[y]?.[x];
            if (!tile?.poi) continue;

            const dist = Math.abs(x - px) + Math.abs(y - py); // Manhattan distance
            if (dist > maxDist) continue;

            const label = tile.poi === 'town' && tile.townName
                ? `${tile.townName} (${tile.townSize || 'settlement'})`
                : tile.poi === 'mountain' && tile.mountainName
                    ? tile.mountainName
                    : null;

            // Only include named landmarks (towns, named mountains) — skip generic forest/mountain tiles
            if (!label) continue;

            landmarks.push({
                label,
                dist,
                direction: describeDirection(x - px, y - py),
                proximity: describeDistance(dist)
            });
        }
    }

    // Sort by distance, take closest few
    landmarks.sort((a, b) => a.dist - b.dist);
    return landmarks.slice(0, 4);
};

// Surface the NPCs actually present in the town so the DM narrates and names the
// real placed people (e.g. Captain Marta) rather than inventing names. Token-conscious:
// the current building's occupants (with the milestone NPC's personality) plus a short
// town roster, capped. Reads townMapData.npcs written by populateTown.
const formatTownNpcs = (townMap, pos) => {
    const npcs = townMap?.npcs;
    if (!Array.isArray(npcs) || npcs.length === 0) return '';

    const label = (n) => {
        const role = n.job || n.title || n.role || 'townsfolk';
        return `${n.name} (${role})`;
    };

    let out = '';

    // Occupants of the building the party is standing on.
    if (pos) {
        const here = npcs.filter(n => n.location?.x === pos.x && n.location?.y === pos.y);
        if (here.length > 0) {
            out += ` Present here: ${here.map(n => {
                let s = label(n);
                if (n.personality) s += ` — ${n.personality}`;
                return s;
            }).join('; ')}.`;
        }
    }

    // A short town roster, milestone NPCs first, capped to stay token-light.
    const roster = [...npcs]
        .sort((a, b) => (b.milestoneNpcId ? 1 : 0) - (a.milestoneNpcId ? 1 : 0))
        .slice(0, 6);
    if (roster.length > 0) {
        out += ` Notable townsfolk: ${roster.map(label).join('; ')}.`;
        out += ' Use these exact names for the people the party meets; do not invent names or officials for anyone listed here.';
    }

    return out;
};

// Build rich location context based on whether player is inside a town, at a town edge, or on the world map
const buildLocationContext = (worldTile, worldPos, locationCtx, worldMap) => {
    const { isInsideTown, currentTownTile, currentTownMap, townPlayerPosition } = locationCtx;
    const biome = worldTile?.biome || 'Unknown Area';

    if (isInsideTown && currentTownTile) {
        const townName = currentTownTile.townName || 'Town';
        const townSize = currentTownTile.townSize || 'settlement';
        let info = `The party is INSIDE ${townName}, a ${townSize}.`;

        // Determine what the player is standing on within the town
        if (currentTownMap?.mapData && townPlayerPosition) {
            const townTile = currentTownMap.mapData[townPlayerPosition.y]?.[townPlayerPosition.x];
            if (townTile) {
                if (townTile.type === 'building') {
                    const name = townTile.buildingName || townTile.buildingType || 'a building';
                    info += ` They are at ${name}.`;
                } else if (townTile.type === 'town_square') {
                    info += ' They are in the town square.';
                } else if (townTile.type?.includes('path') || townTile.type === 'grass') {
                    info += ' They are walking along a street.';
                }
            }

            // List nearby buildings for richer context
            const buildings = [];
            const mapData = currentTownMap.mapData;
            const seen = new Set();
            for (let dy = -3; dy <= 3; dy++) {
                for (let dx = -3; dx <= 3; dx++) {
                    const t = mapData[townPlayerPosition.y + dy]?.[townPlayerPosition.x + dx];
                    if (t?.type === 'building') {
                        const bName = t.buildingName || t.buildingType;
                        if (bName && !seen.has(bName)) {
                            seen.add(bName);
                            buildings.push(bName);
                        }
                    }
                }
            }
            if (buildings.length > 0) {
                info += ` Nearby: ${buildings.join(', ')}.`;
            }
        }

        // Name the NPCs actually placed in this town (occupants here + short roster).
        info += formatTownNpcs(currentTownMap, townPlayerPosition);

        return info;
    }

    // On the world map
    let info = `The party is traveling through ${biome} terrain.`;

    if (worldTile?.poi === 'town' && worldTile?.townName) {
        info += ` They are standing at the edge of ${worldTile.townName}, a ${worldTile.townSize || 'settlement'}. They have not entered the town.`;
    } else if (worldTile?.poi === 'cave_entrance') {
        info += ' There is a cave entrance here.';
    } else if (worldTile?.poi) {
        info += ` Point of interest: ${worldTile.poi}.`;
    }

    // Add nearby landmarks for world map orientation
    const landmarks = findNearbyLandmarks(worldMap, worldPos.x, worldPos.y);
    if (landmarks.length > 0) {
        const parts = landmarks.map(l => `${l.label} (${l.proximity}, to the ${l.direction})`);
        info += ` Landmarks: ${parts.join('; ')}.`;
    }

    return info;
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

        const gameContext = `Setting: ${settings.shortDescription || 'Fantasy Realm'}. Mood: ${settings.grimnessLevel || 'Normal'}.${goalInfo}${milestonesInfoRegular}${sideQuestsInfoRegular}\n${locationInfo}. Party: ${partyInfo}.`;

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
            const checkProposal = parseCheckMarker(aiResponse);
            if (checkProposal) {
                resolvedCheck = resolveSkillCheck({
                    skill: checkProposal.skill,
                    tier: checkProposal.tier,
                    hero: selectedHeroes?.[0],
                    supportBonus: getSupportBonus(selectedHeroes || [], 0),
                });
                aiResponse = aiResponse.replace(checkProposal.raw, '').replace(/[ \t]{2,}/g, ' ').trim();
                logger.info(`[CHECK] ${resolvedCheck.skill} (${resolvedCheck.tier}, DC ${resolvedCheck.dc}) -> rolled ${resolvedCheck.rollResult.total}: ${resolvedCheck.outcomeTier}`);
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
