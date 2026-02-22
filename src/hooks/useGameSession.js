import { useState, useEffect, useRef } from 'react';
import { conversationsApi } from '../services/conversationsApi';
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
                setSettings(parsedSettings);
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

    const saveConversationToBackend = async (currentSessionId, gameState) => {
        try {
            logger.debug('Starting save operation');
            // Adjust URL to your backend endpoint
            const result = await conversationsApi.save({
                sessionId: currentSessionId,
                timestamp: new Date().toISOString(),
                conversationName: `Adventure - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
                ...gameState // spread the rest of the game state
            });
            logger.debug('Conversation saved successfully', result);

        } catch (error) {
            logger.error('Error saving conversation', error);
        }
    };

    return {
        sessionId,
        hasAdventureStarted,
        setHasAdventureStarted,
        saveConversationToBackend
    };
};

export default useGameSession;
