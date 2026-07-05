import { useState, useEffect, useRef, useCallback } from 'react';
import { conversationsApi } from '../services/conversationsApi';
import { buildSaveName } from '../game/saveController';
import { applySideQuestBackfill } from '../game/questEngine';
import { createLogger } from '../utils/logger';

const logger = createLogger('game-session');

const useGameSession = (loadedConversation, setSettings, setSelectedProvider, setSelectedModel, gameSessionId = null) => {
    // Session ID priority: loadedConversation > navigation state > localStorage > generate new
    const [sessionId, setSessionId] = useState(() => {
        if (loadedConversation?.sessionId) return loadedConversation.sessionId;
        if (gameSessionId) return gameSessionId;
        const stored = localStorage.getItem('activeGameSessionId');
        if (stored) return stored;
        return null;
    });

    // Determine if adventure has started
    const [hasAdventureStarted, setHasAdventureStarted] = useState(() => {
        if (loadedConversation?.hasAdventureStarted !== undefined) {
            return loadedConversation.hasAdventureStarted;
        }
        const conversationData = loadedConversation?.conversation_data || loadedConversation?.conversation || [];
        if (conversationData.length > 0) {
            const hasAIMessages = conversationData.some(msg => msg.role === 'ai');
            return hasAIMessages;
        }
        return false;
    });

    // #45 side-quest backfill: how many quests the load-time hydration appended (0 when
    // the pool hasn't grown). State (not a ref) so Game.js can react with its one
    // "new rumours" system line after the conversation has hydrated.
    const [sideQuestsBackfilled, setSideQuestsBackfilled] = useState(0);

    // Resolve session ID on mount and restore settings from loaded conversation
    useEffect(() => {
        if (loadedConversation) {
            logger.info('Loaded conversation session', loadedConversation.sessionId);
            // Persist loaded game's session ID so refreshes keep using it
            if (loadedConversation.sessionId) {
                localStorage.setItem('activeGameSessionId', loadedConversation.sessionId);
            }

            // Restore game settings
            if (loadedConversation.game_settings) {
                const parsedSettings = typeof loadedConversation.game_settings === 'string'
                    ? JSON.parse(loadedConversation.game_settings)
                    : loadedConversation.game_settings;

                // #45 side-quest backfill: if the SIDE_QUESTS pool has grown since this
                // save last saw it (settings.sideQuestPoolSize guard), append newly
                // eligible quests as 'available' before hydrating. Load path only (a
                // brand-new game has no loadedConversation and keeps its fresh
                // selection); additive only; deterministic per save; persisted by the
                // normal autosave since settings are part of the save fingerprint.
                let hydratedSettings = parsedSettings;
                try {
                    const rawWorldMap = loadedConversation.world_map || loadedConversation.worldMap;
                    const worldMap = typeof rawWorldMap === 'string' ? JSON.parse(rawWorldMap) : rawWorldMap;
                    const rawSubMaps = loadedConversation.sub_maps || loadedConversation.subMaps;
                    const subMaps = typeof rawSubMaps === 'string' ? JSON.parse(rawSubMaps) : rawSubMaps;
                    const { settings: backfilledSettings, added } = applySideQuestBackfill(parsedSettings, {
                        worldMap,
                        townMapsCache: subMaps?.townMapsCache,
                        party: loadedConversation.selected_heroes || [],
                    });
                    hydratedSettings = backfilledSettings;
                    if (added.length > 0) {
                        logger.info(`Side-quest backfill: added ${added.length} quest(s) from the enlarged pool`, added.map((q) => q.id));
                        setSideQuestsBackfilled(added.length);
                    }
                } catch (err) {
                    // Never let a migration break loading; the save hydrates as-is.
                    logger.warn('Side-quest backfill skipped (error)', err);
                }
                setSettings(hydratedSettings);
            }

            // Restore provider and model
            if (loadedConversation.provider) {
                setSelectedProvider(loadedConversation.provider);
            }
            if (loadedConversation.model) {
                setSelectedModel(loadedConversation.model);
            }
        } else if (!sessionId) {
            // Last resort: no ID from any source, generate one (shouldn't normally happen)
            const newSessionId = `game-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            setSessionId(newSessionId);
            localStorage.setItem('activeGameSessionId', newSessionId);
            logger.info('Generated fallback session ID', newSessionId);
        } else {
            // Ensure localStorage is in sync with the resolved session ID
            localStorage.setItem('activeGameSessionId', sessionId);
            logger.debug('Using session ID', sessionId);
        }
    }, []);

    const saveConversationToBackend = useCallback(async (currentSessionId, gameState) => {
        try {
            logger.debug('Starting save operation');
            // Adjust URL to your backend endpoint
            // Derive the display name from the player-editable root (game_settings.saveName)
            // so a renamed campaign keeps its name across saves; only the timestamp refreshes.
            const saveRoot = gameState?.gameSettings?.saveName;
            const result = await conversationsApi.save({
                sessionId: currentSessionId,
                timestamp: new Date().toISOString(),
                conversationName: buildSaveName(saveRoot),
                ...gameState // spread the rest of the game state
            });
            logger.debug('Conversation saved successfully', result);
            // Surface where the durable copy landed (SAVE_SYNC_PLAN Phase 2) so
            // useGamePersistence can report an honest status: pendingCloudSync means
            // an account-holder's save is device-only for now (auth absent or the
            // cloud push failed) and awaits reconcile. `forked` (Phase 3, §6.2)
            // means another device advanced this save and the local timeline was
            // preserved as a separate save; the save UI must say so.
            return {
                ok: true,
                storage: result?.storage,
                pendingCloudSync: !!result?.pendingCloudSync,
                forked: !!result?.forked
            };

        } catch (error) {
            // With write-through saves, conversationsApi.save only throws when even
            // the LOCAL write failed (or a cloud-only path had nothing local to fall
            // back on), so `false` really means "nothing was persisted anywhere".
            logger.error('Error saving conversation', error);
            return false;
        }
    }, []);

    return {
        sessionId,
        hasAdventureStarted,
        setHasAdventureStarted,
        saveConversationToBackend,
        sideQuestsBackfilled
    };
};

export default useGameSession;
