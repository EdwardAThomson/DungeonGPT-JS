import { useState, useRef, useEffect } from 'react';
import { getTile } from '../utils/mapGenerator';
import { llmService } from '../services/llmService';

const TRIGGER_REGEX = /\[(CHECK|ROLL):\s*([a-zA-Z0-9\s]+)\]/i;

const useGameInteraction = (
    loadedConversation,
    settings,
    selectedProvider,
    selectedModel,
    selectedHeroes,
    worldMap,
    playerPosition,
    hasAdventureStarted,
    setHasAdventureStarted
) => {
    const [userInput, setUserInput] = useState('');
    const [conversation, setConversation] = useState(loadedConversation?.conversation_data || []);
    const [currentSummary, setCurrentSummary] = useState(loadedConversation?.summary || '');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [checkRequest, setCheckRequest] = useState(null); // { type: 'skill', skill: 'Perception' } or null

    // Sync conversation ref for parent use if needed, but setState is enough for React updates

    // Model options mapping (could be moved to a constants file)
    const modelOptions = [
        { provider: 'openai', model: 'gpt-5', label: 'OpenAI - GPT-5' },
        { provider: 'openai', model: 'gpt-5-mini', label: 'OpenAI - GPT-5 Mini' },
        { provider: 'openai', model: 'o4-mini', label: 'OpenAI - O4 Mini' },
        { provider: 'gemini', model: 'gemini-2.5-pro', label: 'Gemini - 2.5 Pro' },
        { provider: 'gemini', model: 'gemini-2.5-flash', label: 'Gemini - 2.5 Flash' },
        { provider: 'claude', model: 'claude-sonnet-4-5-20250929', label: 'Claude - Sonnet 4.5' }
    ];

    const getCurrentModel = () => {
        if (selectedModel) return selectedModel;
        if (selectedProvider) {
            const firstModel = modelOptions.find(opt => opt.provider === selectedProvider);
            if (firstModel) return firstModel.model;
        }
        return 'gpt-5';
    };

    const generateResponse = async (model, prompt) => {
        return await llmService.generateUnified({
            provider: selectedProvider,
            model,
            prompt,
            maxTokens: 1600,
            temperature: 0.7
        });
    };

    const summarizeConversation = async (summary, newMessages) => {
        const model = getCurrentModel();
        const prompt = `Old summary: ${summary}\nRecent exchange: ${newMessages.map(msg => `${msg.role === 'ai' ? 'AI' : 'User'}: ${msg.content}`).join('\n')}\n\nCreate a concise new summary based on the old summary and recent exchange, capturing the key events and character actions.`;

        try {
            // Summary is usually small and non-critical to stream, so we use API-style generation if possible
            // But if ONLY CLI is selected, we should probably follow suit or just use a default safe API.
            // For now, let's keep it simple and use generateResponse which handles both.
            return await generateResponse(model, prompt);
        } catch (error) {
            console.error("Summarization failed:", error);
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
        const model = getCurrentModel();

        // Note: marking tile as explored is handled in Game.js/useGameMap, or we assume starting town is explored.
        // Ideally useGameMap handles the 'explored' bit, here we just do the AI part.

        // Construct Prompt
        const partyInfo = selectedHeroes.map(h => `${h.characterName} (${h.characterClass})`).join(', ');
        const currentTile = getTile(worldMap, playerPosition.x, playerPosition.y);

        let locationInfo = `Player starts at coordinates (${playerPosition.x}, ${playerPosition.y}) in a ${currentTile?.biome || 'Unknown Area'} biome.`;
        if (currentTile?.poi === 'town' && currentTile?.townName) {
            locationInfo += ` The party is standing at the edge of ${currentTile.townName}, a ${currentTile.townSize || 'settlement'}.`;
        } else if (currentTile?.poi) {
            locationInfo += ` POI: ${currentTile.poi}.`;
        }

        const goalInfo = settings.campaignGoal ? `\nCampaign Goal: ${settings.campaignGoal}` : '';
        const milestonesInfo = settings.milestones && settings.milestones.length > 0 ? `\nKey Milestones to achieve: ${settings.milestones.join(', ')}` : '';
        const gameContext = `Setting: ${settings.shortDescription || 'A generic fantasy world'}. Mood: ${settings.grimnessLevel || 'Neutral'} Grimness, ${settings.darknessLevel || 'Neutral'} Darkness. Magic: ${settings.magicLevel || 'Low'}. Tech: ${settings.technologyLevel || 'Medieval'}.${goalInfo}${milestonesInfo}\n${locationInfo}. Party: ${partyInfo}.`;
        const prompt = `Game Context: ${gameContext}\n\nStory summary so far: ${currentSummary || 'The adventure begins.'}\n\nThe player party has just arrived. Start the adventure by describing the scene and presenting the initial situation based on the game context and starting location.`;

        try {
            let aiResponse = await generateResponse(model, prompt);

            // Parse for Triggers
            const match = aiResponse.match(TRIGGER_REGEX);
            if (match) {
                const type = match[1].toUpperCase();
                const value = match[2].trim();
                console.log(`[AI TRIGGER] ${type}: ${value}`);

                if (type === 'CHECK') {
                    setCheckRequest({ type: 'skill', skill: value });
                }
                // Optional: Remove tag from display? 
                // aiResponse = aiResponse.replace(match[0], '').trim();
            }

            const aiMessage = { role: 'ai', content: aiResponse };

            setConversation(prev => [...prev, aiMessage]);

            const updatedSummary = await summarizeConversation(currentSummary, [aiMessage]);
            setCurrentSummary(updatedSummary);
        } catch (error) {
            console.error('Failed to fetch initial AI response:', error);
            setError(`Error starting adventure: ${error.message}`);
            setConversation(prev => [...prev, { role: 'ai', content: `Error: Could not start the adventure. ${error.message}` }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!hasAdventureStarted || !userInput.trim() || isLoading) return;

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

        const partyInfo = selectedHeroes.map(h => `${h.characterName} (${h.characterClass})`).join(', ');
        const currentTile = getTile(worldMap, playerPosition.x, playerPosition.y);
        const locationInfo = `Player is at coordinates (${playerPosition.x}, ${playerPosition.y}) in a ${currentTile?.biome || 'Unknown Area'} biome.${currentTile?.poi ? ` Point Of Interest: ${currentTile.poi}.` : ''}`;
        const goalInfo = settings.campaignGoal ? `\nCampaign Goal: ${settings.campaignGoal}` : '';
        const milestonesInfo = settings.milestones && settings.milestones.length > 0 ? `\nKey Milestones to achieve: ${settings.milestones.join(', ')}` : '';
        const gameContext = `Setting: ${settings.shortDescription || 'A generic fantasy world'}. Mood: ${settings.grimnessLevel || 'Neutral'} Grimness, ${settings.darknessLevel || 'Neutral'} Darkness. Magic: ${settings.magicLevel || 'Low'}. Tech: ${settings.technologyLevel || 'Medieval'}.${goalInfo}${milestonesInfo}\n${locationInfo}. Party: ${partyInfo}.`;
        const prompt = `Game Context: ${gameContext}\n\nStory summary so far: ${currentSummary || 'The adventure begins.'}\n\nUser action: ${userMessage.content}`;

        try {
            let aiResponse = await generateResponse(model, prompt);

            // Parse for Triggers
            const match = aiResponse.match(TRIGGER_REGEX);
            if (match) {
                const type = match[1].toUpperCase();
                const value = match[2].trim();
                console.log(`[AI TRIGGER] ${type}: ${value}`);

                if (type === 'CHECK') {
                    setCheckRequest({ type: 'skill', skill: value });
                }
                // Optional: Remove tag from display? 
                // aiResponse = aiResponse.replace(match[0], '').trim();
            }

            const aiMessage = { role: 'ai', content: aiResponse };

            setConversation([...tempConversation, aiMessage]);

            const updatedSummary = await summarizeConversation(currentSummary, [userMessage, aiMessage]);
            setCurrentSummary(updatedSummary);

        } catch (error) {
            console.error('Failed to fetch AI response:', error);
            setError(`Error getting response from ${selectedProvider}: ${error.message}`);
            setConversation([...tempConversation, { role: 'ai', content: `Error: Could not get response from ${selectedProvider}.` }]);
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
        error,
        setError,
        modelOptions,
        handleStartAdventure,
        handleSubmit,
        checkRequest,
        setCheckRequest,
        handleInputChange
    };
};

export default useGameInteraction;
