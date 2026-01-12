import { useState, useRef, useEffect } from 'react';
import { getTile } from '../utils/mapGenerator';
import { llmService } from '../services/llmService';
import { DM_PROTOCOL } from '../data/prompts';

const TRIGGER_REGEX = /\[(CHECK|ROLL):\s*([a-zA-Z0-9\s]+)\]/i;
const MILESTONE_COMPLETE_REGEX = /\[COMPLETE_MILESTONE:\s*(.+?)\]/i;
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
        completed: false
    }));
};

// Helper function to get milestone status for prompts
const getMilestoneStatus = (milestones) => {
    const normalized = normalizeMilestones(milestones);
    const completed = normalized.filter(m => m.completed);
    const remaining = normalized.filter(m => !m.completed);
    const current = remaining.length > 0 ? remaining[0] : null;

    return { current, completed, remaining, all: normalized };
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
    // but preserve paragraph breaks (double newlines)
    cleaned = cleaned.replace(/([a-z,])\n([a-z])/gi, '$1 $2');

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
    setHasAdventureStarted
) => {
    const [userInput, setUserInput] = useState('');
    const [conversation, setConversation] = useState(loadedConversation?.conversation_data || []);
    const [currentSummary, setCurrentSummary] = useState(loadedConversation?.summary || '');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [checkRequest, setCheckRequest] = useState(null); // { type: 'skill', skill: 'Perception' } or null
    const [lastPrompt, setLastPrompt] = useState('');

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
        const fullPrompt = DM_PROTOCOL + prompt;
        setLastPrompt(fullPrompt);
        return await llmService.generateUnified({
            provider: selectedProvider,
            model,
            prompt: fullPrompt,
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


        const goalInfo = settings.campaignGoal ? `\nGoal of the Campaign: ${settings.campaignGoal}` : '';

        // Get milestone status
        const milestoneStatus = getMilestoneStatus(settings.milestones);
        let milestonesInfo = '';
        if (milestoneStatus.current) {
            milestonesInfo += `\nCurrent Milestone: ${milestoneStatus.current.text}`;
            if (milestoneStatus.completed.length > 0) {
                milestonesInfo += `\nCompleted Milestones: ${milestoneStatus.completed.map(m => m.text).join(', ')}`;
            }
            if (milestoneStatus.remaining.length > 1) {
                milestonesInfo += `\nRemaining Milestones: ${milestoneStatus.remaining.slice(1).map(m => m.text).join(', ')}`;
            }
        }

        const gameContext = `Setting: ${settings.shortDescription || 'A mystery fantasy world'}. Mood: ${settings.grimnessLevel || 'Normal'} Intensity. Magic: ${settings.magicLevel || 'Standard'}. Tech: ${settings.technologyLevel || 'Medieval'}.${goalInfo}${milestonesInfo}\n${locationInfo}. Party: ${partyInfo}.`;

        const prompt = `[ADVENTURE START]\n\n[CONTEXT]\n${gameContext}\n\nCurrent Summary: ${currentSummary || 'They stand ready at the journey\'s beginning.'}\n\n[TASK]\nDescribe the arrival of the party and the immediate atmosphere of the scene. Present the initial situation to the players. Use the context provided to set the stage. Begin your response directly with the narrative description.`;

        try {
            let aiResponse = await generateResponse(model, prompt);

            // Clean the response: remove any echoed context/task instructions
            // The AI sometimes echoes the entire prompt, so we need to extract just the narrative
            aiResponse = cleanAIResponse(aiResponse, gameContext);

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
        const goalInfo = settings.campaignGoal ? `\nGoal: ${settings.campaignGoal}` : '';

        // Get milestone status
        const milestoneStatusRegular = getMilestoneStatus(settings.milestones);
        let milestonesInfoRegular = '';
        if (milestoneStatusRegular.current) {
            milestonesInfoRegular += `\nCurrent Milestone: ${milestoneStatusRegular.current.text}`;
            if (milestoneStatusRegular.completed.length > 0) {
                milestonesInfoRegular += `\nCompleted: ${milestoneStatusRegular.completed.map(m => m.text).join(', ')}`;
            }
            if (milestoneStatusRegular.remaining.length > 1) {
                milestonesInfoRegular += `\nRemaining: ${milestoneStatusRegular.remaining.slice(1).map(m => m.text).join(', ')}`;
            }
        }

        const gameContext = `Setting: ${settings.shortDescription || 'Fantasy Realm'}. Mood: ${settings.grimnessLevel || 'Normal'}.${goalInfo}${milestonesInfoRegular}\n${locationInfo}. Party: ${partyInfo}.`;
        const prompt = `[CONTEXT]\n${gameContext}\n\n[SUMMARY]\n${currentSummary || 'The tale unfolds.'}\n\n[PLAYER ACTION]\n${userMessage.content}\n\n[NARRATE]`;

        try {
            let aiResponse = await generateResponse(model, prompt);

            // Clean the response
            aiResponse = cleanAIResponse(aiResponse, gameContext);

            // Check for milestone completion
            const milestoneMatch = aiResponse.match(MILESTONE_COMPLETE_REGEX);
            if (milestoneMatch) {
                const milestoneText = milestoneMatch[1].trim();
                console.log(`[MILESTONE COMPLETE] ${milestoneText}`);

                // Find and mark milestone as complete
                const normalized = normalizeMilestones(settings.milestones);
                const milestoneIndex = normalized.findIndex(m =>
                    m.text.toLowerCase().includes(milestoneText.toLowerCase()) ||
                    milestoneText.toLowerCase().includes(m.text.toLowerCase())
                );

                if (milestoneIndex !== -1) {
                    normalized[milestoneIndex].completed = true;
                    setSettings({ ...settings, milestones: normalized });

                    // Add celebration message to conversation
                    const celebrationMsg = {
                        role: 'system',
                        content: `🎉 Milestone Achieved! 🎉\n${normalized[milestoneIndex].text}`
                    };
                    setConversation(prev => [...prev, celebrationMsg]);
                }

                // Remove the tool call from display
                aiResponse = aiResponse.replace(milestoneMatch[0], '').trim();
            }

            // Check for campaign completion
            const campaignMatch = aiResponse.match(CAMPAIGN_COMPLETE_REGEX);
            if (campaignMatch) {
                console.log('[CAMPAIGN COMPLETE]');

                // Mark campaign as complete
                setSettings({ ...settings, campaignComplete: true });

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
        handleInputChange,
        lastPrompt,
        setLastPrompt
    };
};

export default useGameInteraction;
