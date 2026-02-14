import { useState, useEffect, useRef } from 'react';

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
            console.log("[SESSION] Loaded conversation with Session ID:", loadedConversation.sessionId);
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
            console.log("[SESSION] Generated fallback Session ID:", newSessionId);
        } else {
            // Ensure localStorage is in sync with the resolved session ID
            localStorage.setItem('activeGameSessionId', sessionId);
            console.log("[SESSION] Using Session ID:", sessionId);
        }
    }, []);

    const saveConversationToBackend = async (currentSessionId, gameState) => {
        try {
            console.log('[SAVE] Starting save operation...');
            // Adjust URL to your backend endpoint
            const response = await fetch('http://localhost:5000/api/conversations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sessionId: currentSessionId,
                    timestamp: new Date().toISOString(),
                    conversationName: `Adventure - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
                    ...gameState // spread the rest of the game state
                }),
            });

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`Failed to save conversation: ${response.statusText} - ${errorData}`);
            }

            const result = await response.json();
            console.log('Conversation saved successfully:', result);

        } catch (error) {
            console.error('Error saving conversation:', error);
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
