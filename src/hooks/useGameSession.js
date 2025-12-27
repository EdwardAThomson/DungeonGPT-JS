import { useState, useEffect, useRef } from 'react';

const useGameSession = (loadedConversation, setSettings, setSelectedProvider, setSelectedModel) => {
    const [sessionId, setSessionId] = useState(() => {
        const id = loadedConversation?.sessionId || null;
        return id;
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

    // Generate session ID on mount if needed and restore settings
    useEffect(() => {
        if (!loadedConversation && !sessionId) {
            const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            setSessionId(newSessionId);
            console.log("Generated NEW Session ID:", newSessionId);
        } else if (loadedConversation) {
            console.log("Loaded conversation with Session ID:", loadedConversation.sessionId);

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
