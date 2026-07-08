import { useMemo, useState } from 'react';
import { getTile } from '../utils/mapGenerator';
import { llmService } from '../services/llmService';
import { DM_PROTOCOL } from '../data/prompts';
import { buildModelOptions, resolveProviderAndModel } from '../llm/modelResolver';
import { areRequirementsMet, findMarkerMilestoneIndex } from '../game/milestoneEngine';
import { getStepHint } from '../game/questHints';
import { formatPartyInfo } from '../game/promptComposer';
import { embedAndStore, query as ragQuery } from '../game/ragEngine';
import { composeIntro } from '../game/introComposer';
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

const TRIGGER_REGEX = /\[(CHECK|ROLL):\s*([a-zA-Z0-9\s]+)\]/i;
const MILESTONE_COMPLETE_REGEX = /\[COMPLETE_MILESTONE:\s*([\s\S]+?)\]/i;
const CAMPAIGN_COMPLETE_REGEX = /\[COMPLETE_CAMPAIGN\]/i;

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
        text += '\nActive Milestones: ' + active.map(m => {
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

// Format ONLY the current milestone as a grounded objective line for the new-game
// opening. Unlike formatMilestonePromptText (which dumps every active/completed/locked
// milestone), this returns a single line for the one immediate step, plus the real
// destination it lives in so the opening can frame it as somewhere ELSEWHERE to travel
// to rather than part of the starting scene. Mirrors introComposer's grounded style.
const formatStartObjective = (current) => {
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
    aiAvailable = true
) => {
    const [userInput, setUserInput] = useState('');
    const [conversation, setConversation] = useState(loadedConversation?.conversation_data || []);
    const [currentSummary, setCurrentSummary] = useState(loadedConversation?.summary || '');
    const [isLoading, setIsLoading] = useState(false);
    const [progressStatus, setProgressStatus] = useState(null); // { status, elapsed } for LLM progress
    const [error, setError] = useState(null);
    const [checkRequest, setCheckRequest] = useState(null); // { type: 'skill', skill: 'Perception' } or null
    const [lastPrompt, setLastPrompt] = useState('');

    const modelOptions = useMemo(() => buildModelOptions(), []);

    const getCurrentModel = () => {
        return resolveProviderAndModel(selectedProvider, selectedModel).model;
    };

    const generateResponse = async (model, prompt) => {
        // Append the player's Narrative Style directive so it actually affects the narration.
        const style = VERBOSITY_DIRECTIVE[settings?.responseVerbosity] || VERBOSITY_DIRECTIVE.Moderate;
        const fullPrompt = `${DM_PROTOCOL}${prompt}\n\nStyle directive (shapes how you write; do not repeat it): ${style}`;
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

        if (!selectedHeroes || selectedHeroes.length === 0) {
            setError('Cannot start game without selecting heroes.'); return;
        }

        setHasAdventureStarted(true);
        setIsLoading(true);
        setError(null);

        // Guests (no AI): open with a local templated intro instead of calling the AI.
        if (!aiAvailable) {
            const startTile = getTile(worldMap, playerPosition.x, playerPosition.y);
            const introText = composeIntro(settings, selectedHeroes, startTile);
            setConversation(prev => [...prev, { role: 'ai', content: introText }]);
            setIsLoading(false);
            return;
        }

        const model = getCurrentModel();

        // Note: marking tile as explored is handled in Game.js/useGameMap, or we assume starting town is explored.
        // Ideally useGameMap handles the 'explored' bit, here we just do the AI part.

        // Construct Prompt
        // Two-stage opening (playtest 2026-07-07: a single under-grounded prompt that
        // dumped ALL active milestones conflated the start town with a future town it
        // named a venue/NPC from). Stage 1 grounds the scene to HERE only (reusing the
        // same buildLocationContext/formatTownNpcs the movement path uses, so the
        // current town's OWN placed NPCs are named). Stage 2 points at ONLY the current
        // milestone, framed as somewhere elsewhere to travel to.
        const partyInfo = formatPartyInfo(selectedHeroes);
        const currentTile = getTile(worldMap, playerPosition.x, playerPosition.y);

        // Stage 1: Scene, grounded to the current location only.
        const locationInfo = buildLocationContext(currentTile, playerPosition, locationContext, worldMap);
        const sceneContext = `Setting: ${settings.shortDescription || 'A mystery fantasy world'}. Mood: ${settings.grimnessLevel || 'Normal'} Intensity. Magic: ${settings.magicLevel || 'Standard'}. Tech: ${settings.technologyLevel || 'Medieval'}.\n${locationInfo}. Party: ${partyInfo}.`;

        const scenePrompt = `[ADVENTURE START - SCENE]\n\n[CONTEXT]\n${sceneContext}\n\n[TASK]\nDescribe the arrival of the party and the immediate atmosphere of THIS location only. Describe ONLY the location, buildings, and people named in the context above. Do not name, place, or invent any building or NPC that is not listed here, and do not reference other towns as if they are part of this scene. Begin your response directly with the narrative description.`;

        // Stage 2: Objective/hook, using ONLY the current milestone (not the full active
        // array). This is the core of the fix: the opening must not surface every active
        // milestone's venue/NPC as if it were nearby.
        const milestoneStatus = getMilestoneStatus(settings.milestones);
        const current = milestoneStatus.current;
        const { line: objectiveLine, destination: objectiveDest } = formatStartObjective(current);
        const currentPlaceName = locationContext?.currentTownTile?.townName
            || (currentTile?.poi === 'town' ? currentTile?.townName : null)
            || currentTile?.biome
            || 'this place';

        try {
            // Sequential calls: scene first, then the objective hook. Both go through the
            // same generateResponse (DM_PROTOCOL + style directive) + cleanAIResponse path.
            let sceneText = await generateResponse(model, scenePrompt);
            sceneText = cleanAIResponse(sceneText, sceneContext);

            if (!sceneText || !sceneText.trim()) {
                // An empty opening is a failed start: keep the adventure un-started so
                // the Start Adventure button stays and the player can retry.
                logger.warn('Empty AI scene response at adventure start; keeping the start available for retry');
                setHasAdventureStarted(false);
                setError('The Dungeon Master gave no reply. Please try starting the adventure again.');
                return;
            }

            // Objective stage: best-effort. If it fails or returns nothing, fall back to a
            // deterministic objective line rather than dropping the hook or crashing.
            let objectiveText = '';
            if (current && objectiveLine) {
                const goalInfo = settings.campaignGoal ? `Campaign goal: ${settings.campaignGoal}.\n` : '';
                const objectiveContext = `${goalInfo}The party's current location: ${currentPlaceName}.\nThe party's immediate objective (the ONLY next step): ${objectiveLine}.${objectiveDest ? `\nThat objective lies in ${objectiveDest}, a place elsewhere the party must travel to.` : ''}`;
                const objectivePrompt = `[ADVENTURE START - OBJECTIVE]\n\n[CONTEXT]\n${objectiveContext}\n\n[TASK]\nIn one short paragraph (2-3 sentences), point the party toward this immediate objective. Any destination named here is a place ELSEWHERE the party must travel to; never describe it, its buildings, or its people as part of the current scene at ${currentPlaceName}. Do not invent NPCs or places beyond those named above. Close on the concrete next step by its real name. Begin your response directly with the narrative.`;
                try {
                    let objRaw = await generateResponse(model, objectivePrompt);
                    objectiveText = cleanAIResponse(objRaw, objectiveContext).trim();
                } catch (objErr) {
                    logger.warn('Objective stage failed at adventure start; using deterministic hook', objErr);
                }
                if (!objectiveText) {
                    // Deterministic fallback mirrors introComposer's "First steps" line.
                    objectiveText = `**First steps:** ${current.text}${objectiveDest ? ` (travel to ${objectiveDest})` : ''}`;
                }
            }

            // Combine the two stages into the single opening message the player sees.
            let aiResponse = objectiveText ? `${sceneText}\n\n${objectiveText}` : sceneText;

            // Parse for Triggers
            const match = aiResponse.match(TRIGGER_REGEX);
            if (match) {
                const type = match[1].toUpperCase();
                const value = match[2].trim();
                logger.debug(`AI trigger detected: ${type}`, value);

                if (type === 'CHECK') {
                    setCheckRequest({ type: 'skill', skill: value });
                }
                // Optional: Remove tag from display? 
                // aiResponse = aiResponse.replace(match[0], '').trim();
            }

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

        const prompt = `[CONTEXT]\n${gameContext}\n\n[SUMMARY]\n${currentSummary || 'The tale unfolds.'}\n\n[PLAYER ACTION]\n${userMessage.content}\n\n[NARRATE]${ragContext}`;

        try {
            let aiResponse = await generateResponse(model, prompt);

            // Clean the response
            aiResponse = cleanAIResponse(aiResponse, gameContext);

            // Check for milestone completion
            const milestoneMatch = aiResponse.match(MILESTONE_COMPLETE_REGEX);
            if (milestoneMatch) {
                const milestoneText = milestoneMatch[1].replace(/\s+/g, ' ').trim();
                logger.info(`Milestone complete signaled: ${milestoneText}`);

                // Find and mark milestone as complete. Guarded: the AI marker may only
                // complete 'narrative' (or legacy untyped) milestones — mechanical types
                // (item/combat/location/talk) are engine-detected and a stray marker must
                // not complete them. Old saves' narrative milestones still work here.
                //
                // IMPORTANT: this runs seconds after the generation started, so `settings`
                // here is a stale capture. Recompute against prev INSIDE the functional
                // update — a `{ ...settings }` spread would silently revert every settings
                // change made during the generation (accepted side quests, engine-completed
                // milestones, renames). That stale-spread bug ate a player's side quest.
                const matched = normalizeMilestones(settings.milestones)[
                    findMarkerMilestoneIndex(normalizeMilestones(settings.milestones), milestoneText)
                ];

                if (matched) {
                    setSettings(prev => {
                        const prevNormalized = normalizeMilestones(prev.milestones);
                        const idx = findMarkerMilestoneIndex(prevNormalized, milestoneText);
                        if (idx === -1) return prev; // already completed meanwhile — no-op
                        return {
                            ...prev,
                            milestones: prevNormalized.map((m, i) => (i === idx ? { ...m, completed: true } : m))
                        };
                    });

                    // Add celebration message to conversation
                    const celebrationMsg = {
                        role: 'system',
                        content: `🎉 Milestone Achieved! 🎉\n${matched.text}`
                    };
                    setConversation(prev => [...prev, celebrationMsg]);
                }

                // Remove the tool call from display
                aiResponse = aiResponse.replace(milestoneMatch[0], '').trim();
            }

            // Check for campaign completion
            const campaignMatch = aiResponse.match(CAMPAIGN_COMPLETE_REGEX);
            if (campaignMatch) {
                logger.info('Campaign complete signaled');

                // Mark campaign as complete (functional — `settings` is a stale capture here)
                setSettings(prev => ({ ...prev, campaignComplete: true }));

                // Add epic completion message
                const completionMsg = {
                    role: 'system',
                    content: `🏆 CAMPAIGN COMPLETE! 🏆\n${settings.campaignGoal || 'Victory Achieved!'}\n\nThe tale of your heroic deeds will be sung for generations to come!`
                };
                setConversation(prev => [...prev, completionMsg]);

                // Remove the tool call from display
                aiResponse = aiResponse.replace(campaignMatch[0], '').trim();
            }

            // Parse for other Triggers
            const match = aiResponse.match(TRIGGER_REGEX);
            if (match) {
                const type = match[1].toUpperCase();
                const value = match[2].trim();
                logger.debug(`AI trigger detected: ${type}`, value);

                if (type === 'CHECK') {
                    setCheckRequest({ type: 'skill', skill: value });
                }
                // Optional: Remove tag from display? 
                // aiResponse = aiResponse.replace(match[0], '').trim();
            }

            if (!aiResponse || !aiResponse.trim()) {
                logger.warn('Empty AI response received, skipping');
                setError('AI returned an empty response. Please try again.');
                return;
            }
            const aiMessage = { role: 'ai', content: aiResponse };

            const updatedConv = [...tempConversation, aiMessage];
            setConversation(updatedConv);

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
