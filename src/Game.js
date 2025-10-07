import React, { useState, useContext, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import ApiKeysContext from './ApiKeysContext'; // New context
import SettingsContext from "./SettingsContext";
import { generateText } from "./llmHelper"; // Ensure this path is correct after rename
import { SettingsModalContent, HowToPlayModalContent } from './Modals'; // Import modals
import WorldMapDisplay from './WorldMapDisplay'; // Import the map display
import { generateMapData, getTile, findStartingTown, testMapGeneration } from './mapGenerator'; // Import map generator and helper

// --- Map Modal --- //
const MapModalContent = ({ isOpen, onClose, mapData, playerPosition, onTileClick, firstHero }) => {
    if (!isOpen) return null;
  
    return (
      <div className="modal-overlay" onClick={onClose}>
        {/* Add specific class for map styling if needed */}
        <div className="modal-content map-modal-content" onClick={(e) => e.stopPropagation()}>
          <h2>World Map</h2>
          <WorldMapDisplay 
            mapData={mapData} 
            playerPosition={playerPosition} 
            onTileClick={onTileClick}
            firstHero={firstHero}
          />
          <button className="modal-close-button" onClick={onClose}>
            Close Map
          </button>
        </div>
      </div>
    );
  };

const Game = () => {
  const { state } = useLocation();
  // Handle both new games and loaded conversations
  const { selectedHeroes: stateHeroes, loadedConversation, generatedMap } = state || { selectedHeroes: [], loadedConversation: null, generatedMap: null };
  const selectedHeroes = loadedConversation?.selected_heroes || stateHeroes || [];

  // Get API keys and the selected provider from context
  const { apiKeys } = useContext(ApiKeysContext);
  const { settings, setSettings, selectedProvider, setSelectedProvider, selectedModel, setSelectedModel } = useContext(SettingsContext);

  // Combined provider-model options
  const modelOptions = [
    { provider: 'openai', model: 'gpt-5', label: 'OpenAI - GPT-5' },
    { provider: 'openai', model: 'gpt-5-mini', label: 'OpenAI - GPT-5 Mini' },
    { provider: 'openai', model: 'o4-mini', label: 'OpenAI - O4 Mini' },
    { provider: 'gemini', model: 'gemini-2.5-pro', label: 'Gemini - 2.5 Pro' },
    { provider: 'gemini', model: 'gemini-2.5-flash', label: 'Gemini - 2.5 Flash' },
    { provider: 'claude', model: 'claude-sonnet-4-5-20250929', label: 'Claude - Sonnet 4.5' }
  ];

  const [userInput, setUserInput] = useState('');
  const [conversation, setConversation] = useState(loadedConversation?.conversation_data || []);
  const [currentSummary, setCurrentSummary] = useState(loadedConversation?.summary || '');
  const [isLoading, setIsLoading] = useState(false); // State for loading indicator
  const [error, setError] = useState(null); // State for error messages
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false); // State for modal visibility
  const [isHowToPlayModalOpen, setIsHowToPlayModalOpen] = useState(false); // State for How to Play modal
  const [isMapModalOpen, setIsMapModalOpen] = useState(false); // State for Map modal
  const [sessionId, setSessionId] = useState(() => {
    const id = loadedConversation?.sessionId || null;
    console.log("Initializing sessionId:", id, "from loadedConversation:", !!loadedConversation);
    return id;
  }); // State for Session ID
  // Generate map and starting position together to ensure consistency
  const [mapAndPosition] = useState(() => {
    if (loadedConversation?.world_map && loadedConversation?.player_position) {
      return {
        map: loadedConversation.world_map,
        position: loadedConversation.player_position
      };
    }
    
    // Generate new map
    const newMap = generatedMap || generateMapData();
    const startingPos = findStartingTown(newMap);
    console.log('[MAP INIT] Starting town found at:', startingPos);
    console.log('[MAP INIT] Player position will be set to:', startingPos);
    
    // Mark starting position as explored
    newMap[startingPos.y][startingPos.x].isExplored = true;
    
    return {
      map: newMap,
      position: startingPos
    };
  });

  const [worldMap, setWorldMap] = useState(mapAndPosition.map);
  const [playerPosition, setPlayerPosition] = useState(mapAndPosition.position);
  const [hasAdventureStarted, setHasAdventureStarted] = useState(loadedConversation ? true : false); // State for initial start
  const [showDebugInfo, setShowDebugInfo] = useState(false); // Debug info toggle

  // Refs to hold the latest state for the cleanup function
  const conversationRef = useRef(conversation);
  const sessionIdRef = useRef(sessionId);
  // Initialize provider and model refs from loadedConversation if available, otherwise from Context
  console.log('[DEBUG] loadedConversation?.provider:', loadedConversation?.provider);
  console.log('[DEBUG] loadedConversation?.model:', loadedConversation?.model);
  console.log('[DEBUG] selectedProvider from Context:', selectedProvider);
  console.log('[DEBUG] selectedModel from Context:', selectedModel);
  
  const selectedProviderRef = useRef(loadedConversation?.provider || selectedProvider);
  const selectedModelRef = useRef(loadedConversation?.model || selectedModel);
  const worldMapRef = useRef(worldMap);
  const playerPositionRef = useRef(playerPosition);
  const settingsRef = useRef(loadedConversation?.game_settings || settings);

  // Log initial ref values for debugging
  console.log('[REFS INIT] Provider ref:', selectedProviderRef.current, 'Model ref:', selectedModelRef.current);

  // Update refs whenever the state changes
  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    selectedProviderRef.current = selectedProvider;
  }, [selectedProvider]);

  useEffect(() => {
    console.log('[REF UPDATE] Updating selectedModelRef from:', selectedModelRef.current, 'to:', selectedModel);
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  useEffect(() => {
    worldMapRef.current = worldMap;
  }, [worldMap]);

  useEffect(() => {
    playerPositionRef.current = playerPosition;
  }, [playerPosition]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Generate session ID on component mount (only if not loading a saved conversation)
  useEffect(() => {
    if (!loadedConversation && !sessionId) {
      // Only generate new session ID if we don't have one already
      const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setSessionId(newSessionId);
      console.log("Generated NEW Session ID:", newSessionId);
    } else if (loadedConversation) {
      console.log("Loaded conversation with Session ID:", loadedConversation.sessionId);
      console.log("Full loaded conversation object:", loadedConversation);
      
      // Restore game settings to Context if they were saved
      if (loadedConversation.game_settings) {
        // Check if it's a string that needs parsing
        const parsedSettings = typeof loadedConversation.game_settings === 'string' 
          ? JSON.parse(loadedConversation.game_settings) 
          : loadedConversation.game_settings;
        setSettings(parsedSettings);
        console.log("Restored game settings from saved conversation:", parsedSettings);
      } else {
        console.log("No game_settings found in loaded conversation");
      }
      
      // Restore provider and model from saved conversation
      if (loadedConversation.provider) {
        setSelectedProvider(loadedConversation.provider);
        console.log("Restored provider from saved conversation:", loadedConversation.provider);
      }
      if (loadedConversation.model) {
        setSelectedModel(loadedConversation.model);
        console.log("Restored model from saved conversation:", loadedConversation.model);
      } else {
        console.warn("No model found in loaded conversation! Provider:", loadedConversation.provider);
      }
    }

    // Cleanup function to save conversation on unmount
    return () => {
      const finalConversation = conversationRef.current;
      const finalSessionId = sessionIdRef.current;

      if (finalSessionId) {
        console.log(`[UNMOUNT] Attempting to save conversation for session: ${finalSessionId}`);
        console.log(`[UNMOUNT] Conversation length: ${finalConversation?.length || 0}`);
        console.log(`[UNMOUNT] Provider: ${selectedProviderRef.current}, Model: ${selectedModelRef.current}`);
        // Save even if conversation is empty - we still want to save settings, map, etc.
        saveConversationToBackend(finalSessionId, finalConversation || []);
      } else {
        console.log("[UNMOUNT] Skipping save: No session ID.");
      }
    };
  }, []); // Empty dependency array ensures this runs only once on mount and cleanup on unmount

  // Periodic auto-save effect - save every 30 seconds
  useEffect(() => {
    if (!sessionId || !hasAdventureStarted) return;

    const autoSaveInterval = setInterval(() => {
      console.log('[AUTO-SAVE] Triggering auto-save...');
      console.log('[AUTO-SAVE] Provider:', selectedProviderRef.current, 'Model:', selectedModelRef.current);
      saveConversationToBackend(sessionId, conversationRef.current || []);
    }, 30000); // Save every 30 seconds

    return () => {
      console.log('[AUTO-SAVE] Clearing auto-save interval');
      clearInterval(autoSaveInterval);
    };
  }, [sessionId, hasAdventureStarted]); // Re-run if sessionId or adventure state changes

  // Function to send data to backend
  const saveConversationToBackend = async (sessionIdToSave, conversationToSave) => {
    try {
        console.log('[SAVE] Starting save operation...');
        console.log('[SAVE] Session ID:', sessionIdToSave);
        console.log('[SAVE] Provider:', selectedProviderRef.current, 'Model:', selectedModelRef.current);
        console.log('[SAVE] Conversation messages:', conversationToSave?.length || 0);
        // Adjust URL to your backend endpoint
      const response = await fetch('http://localhost:5000/api/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: sessionIdToSave,
          conversation: conversationToSave,
          provider: selectedProviderRef.current,
          model: selectedModelRef.current, // Save the selected model
          timestamp: new Date().toISOString(),
          conversationName: `Adventure - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
          gameSettings: settingsRef.current,
          selectedHeroes: selectedHeroes,
          currentSummary: currentSummary,
          worldMap: worldMapRef.current,
          playerPosition: playerPositionRef.current,
        }),
      });

      if (!response.ok) {
        // Handle non-OK responses (like 400, 500)
        const errorData = await response.text(); // Or response.json() if backend sends JSON error
        throw new Error(`Failed to save conversation: ${response.statusText} - ${errorData}`);
      }

      const result = await response.json();
      console.log('Conversation saved successfully:', result);

    } catch (error) {
      console.error('Error saving conversation:', error);
      // Optionally display an error to the user, though it might be too late if navigating away
      // setError(`Failed to save game session: ${error.message}`);
    }
  };

  // When the text input box is updated,
  // the text is taken from this event and set as UserInput
  const handleInputChange = (event) => {
    setUserInput(event.target.value);
  };

  // Handle combined selection change
  const handleModelSelection = (value) => {
    const selected = modelOptions.find(opt => `${opt.provider}:${opt.model}` === value);
    if (selected) {
      setSelectedProvider(selected.provider);
      setSelectedModel(selected.model);
    }
  };
  
  // Get current selection value for dropdown
  const getCurrentSelection = () => {
    if (selectedProvider && selectedModel) {
      return `${selectedProvider}:${selectedModel}`;
    }
    return '';
  };

  // Get current model - use selected model or fallback to first available
  const getCurrentModel = () => {
    if (selectedModel) return selectedModel;
    
    // Fallback to first model of selected provider
    if (selectedProvider) {
      const firstModel = modelOptions.find(opt => opt.provider === selectedProvider);
      if (firstModel) return firstModel.model;
    }
    
    return 'gpt-5'; // Ultimate fallback
  };

  // Summarization function - updated to use selected provider and API key
  const summarizeConversation = async (summary, newMessages) => {
    const model = getCurrentModel(); // Use the same model logic for summarization
    const apiKey = apiKeys[selectedProvider];

    if (!apiKey) {
      console.error(`API key for ${selectedProvider} is missing. Cannot summarize.`);
      // Maybe return the old summary or handle error differently
      return summary; // Avoid making API call without key
    }

    const prompt = `Old summary: ${summary}\nRecent exchange: ${newMessages.map(msg => `${msg.role === 'ai' ? 'AI' : 'User'}: ${msg.content}`).join('\n')}\n\nCreate a concise new summary based on the old summary and recent exchange, capturing the key events and character actions.`;
    console.log('Prompt to be summarized: ', prompt);

    try {
      // Pass provider, key, model to generateText
      const updatedSummary = await generateText(selectedProvider, apiKey, model, prompt, 1500, 0.5); // Use lower tokens/temp for summary
      console.log('New summary:', updatedSummary);
      return updatedSummary;
    } catch (error) {
      console.error("Summarization failed:", error);
      setError(`Summarization failed: ${error.message}`);
      // Decide how to proceed: return old summary? throw error?
      return summary; // Return old summary on error for now
    }
  };

  // Function to trigger the initial LLM response
  const handleStartAdventure = async () => {
    if (hasAdventureStarted || isLoading) return; // Prevent multiple starts

    // --- Validation (Heroes, API Key) --- //
    if (!selectedHeroes || selectedHeroes.length === 0) {
      setError('Cannot start game without selecting heroes.'); return;
    }
    const currentApiKey = apiKeys[selectedProvider];
    if (!currentApiKey) {
      setError(`API Key for ${selectedProvider} is not set.`); return;
    }

    // --- Prepare for API Call --- //
    setHasAdventureStarted(true);
    setIsLoading(true);
    setError(null);
    const model = getCurrentModel();
    
    // Mark starting tile as explored
    const updatedMap = worldMap.map(row => 
      row.map(tile => 
        tile.x === playerPosition.x && tile.y === playerPosition.y 
          ? { ...tile, isExplored: true }
          : tile
      )
    );
    setWorldMap(updatedMap);

    // --- Construct Prompt --- //
    const partyInfo = selectedHeroes.map(h => `${h.characterName} (${h.characterClass})`).join(', ');
    const currentTile = getTile(worldMap, playerPosition.x, playerPosition.y);
    const locationInfo = `Player starts at coordinates (${playerPosition.x}, ${playerPosition.y}) in a ${currentTile?.biome || 'Unknown Area'} biome.${currentTile?.poi ? ` POI: ${currentTile.poi}.` : ''}`;
    const gameContext = `Setting: ${settings.shortDescription || 'A generic fantasy world'}. Mood: ${settings.grimnessLevel || 'Neutral'} Grimness, ${settings.darknessLevel || 'Neutral'} Darkness. Magic: ${settings.magicLevel || 'Low'}. Tech: ${settings.technologyLevel || 'Medieval'}. ${locationInfo}. Party: ${partyInfo}.`;
    // Specific prompt to kick off the adventure
    const prompt = `Game Context: ${gameContext}\n\nStory summary so far: ${currentSummary || 'The adventure begins.'}\n\nThe player party has just arrived. Start the adventure by describing the scene and presenting the initial situation based on the game context and starting location.`;

    console.log(`Sending START prompt to ${selectedProvider} (${model}):`, prompt);

    // --- API Call & Update State --- //
    try {
      const aiResponse = await generateText(selectedProvider, currentApiKey, model, prompt, 1600, 0.7, settings.responseVerbosity);
      const aiMessage = { role: 'ai', content: aiResponse };
      // Prepend to conversation? Or just add? Let's just add for now.
      const finalConversation = [...conversation, aiMessage]; 
      setConversation(finalConversation);

      // Summarize this initial description
      const updatedSummary = await summarizeConversation(currentSummary, [aiMessage]); // Only summarize the AI's intro
      setCurrentSummary(updatedSummary);
    } catch (error) {
      console.error('Failed to fetch initial AI response:', error);
      setError(`Error starting adventure: ${error.message}`);
      // Optionally add error to conversation
      setConversation([...conversation, { role: 'ai', content: `Error: Could not start the adventure. ${error.message}` }]);
      // Maybe reset hasAdventureStarted? Or just let user try regular input?
      // setHasAdventureStarted(false); 
    } finally {
      setIsLoading(false);
    }
  };

  // Handle regular text input submission
  const handleSubmit = async (event) => {
    event.preventDefault();
    // Ensure adventure has started before allowing regular input
    if (!hasAdventureStarted || !userInput.trim() || isLoading) return;

    // Check for selectedHeroes (with added safety check at the top)
    if (!selectedHeroes || selectedHeroes.length === 0) {
      console.error('Selected heroes data is missing or empty');
      setError('Cannot start game without selecting heroes.');
      return;
    }

    // Get the current provider's API key
    const currentApiKey = apiKeys[selectedProvider];
    if (!currentApiKey) {
      setError(`API Key for ${selectedProvider} is not set. Please configure it.`);
      console.error(`API Key for ${selectedProvider} is not set.`);
      return;
    }

    const model = getCurrentModel();
    const userMessage = { role: 'user', content: userInput };
    const updatedConversation = [...conversation, userMessage];

    setConversation(updatedConversation);
    setUserInput(''); // Clear input immediately
    setIsLoading(true);
    setError(null); // Clear previous errors

    // Construct the prompt including game settings and party info
    const partyInfo = selectedHeroes.map(h => `${h.characterName} (${h.characterClass})`).join(', ');
    const currentTile = getTile(worldMap, playerPosition.x, playerPosition.y);
    const locationInfo = `Player is at coordinates (${playerPosition.x}, ${playerPosition.y}) in a ${currentTile?.biome || 'Unknown Area'} biome.${currentTile?.poi ? ` Point Of Interest: ${currentTile.poi}.` : ''}`;
    const gameContext = `Setting: ${settings.shortDescription || 'A generic fantasy world'}. Mood: ${settings.grimnessLevel || 'Neutral'} Grimness, ${settings.darknessLevel || 'Neutral'} Darkness. Magic: ${settings.magicLevel || 'Low'}. Tech: ${settings.technologyLevel || 'Medieval'}. ${locationInfo}. Party: ${partyInfo}.`;
    const prompt = `Game Context: ${gameContext}\n\nStory summary so far: ${currentSummary || 'The adventure begins.'}\n\nUser action: ${userMessage.content}`;

    console.log(`Sending prompt to ${selectedProvider} (${model}):`, prompt);

    try {
      // Call the generalized generateText function
      const aiResponse = await generateText(selectedProvider, currentApiKey, model, prompt, 1600, 0.7, settings.responseVerbosity);

      console.log("AI Response:", aiResponse);
      const aiMessage = { role: 'ai', content: aiResponse };
      const finalConversation = [...updatedConversation, aiMessage];
      setConversation(finalConversation);

      // Update the summary asynchronously after getting the response
      const updatedSummary = await summarizeConversation(currentSummary, [userMessage, aiMessage]);
      setCurrentSummary(updatedSummary);

    } catch (error) {
      console.error('Failed to fetch AI response:', error);
      setError(`Error getting response from ${selectedProvider}: ${error.message}`);
      // Add an error message to the conversation flow
      setConversation([...updatedConversation, { role: 'ai', content: `Error: Could not get response from ${selectedProvider}.` }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle clicking on a map tile for movement
  const handleMapTileClick = async (clickedX, clickedY) => {
    // Ensure adventure has started before allowing movement
    if (!hasAdventureStarted || isLoading) return; 

    const currentX = playerPosition.x;
    const currentY = playerPosition.y;

    // Check adjacency (including diagonals - one square in any direction)
    const dx = Math.abs(clickedX - currentX);
    const dy = Math.abs(clickedY - currentY);
    const isAdjacent = dx <= 1 && dy <= 1 && (dx + dy) > 0;

    if (!isAdjacent) {
      console.log("Cannot move: Tile is not adjacent.");
      setError("You can only move to adjacent tiles (including diagonals).");
      return;
    }

    const targetTile = getTile(worldMap, clickedX, clickedY);
    // TODO: Add check for traversability (e.g., targetTile.biome !== 'water') later
    if (!targetTile) {
        console.log("Cannot move: Target tile is invalid.");
        return;
    }

    console.log(`Moving player to: ${clickedX}, ${clickedY}`);
    
    // Mark the target tile as explored
    const updatedMap = worldMap.map(row => 
      row.map(tile => 
        tile.x === clickedX && tile.y === clickedY 
          ? { ...tile, isExplored: true }
          : tile
      )
    );
    setWorldMap(updatedMap);
    setPlayerPosition({ x: clickedX, y: clickedY });

    // --- Trigger LLM description for the new location --- //
    const currentApiKey = apiKeys[selectedProvider];
    if (!currentApiKey) {
      setError(`API Key for ${selectedProvider} is not set.`); return;
    }
    const model = getCurrentModel();
    const systemMessage = { role: 'system', content: `You moved to coordinates (${clickedX}, ${clickedY}).` }; // Add system message
    const updatedConversation = [...conversation, systemMessage];
    setConversation(updatedConversation);
    setIsLoading(true);
    setError(null);

    const partyInfo = selectedHeroes.map(h => `${h.characterName} (${h.characterClass})`).join(', ');
    const locationInfo = `Player has moved to coordinates (${clickedX}, ${clickedY}) in a ${targetTile.biome} biome.${targetTile.poi ? ` POI: ${targetTile.poi}.` : ''} Description seed: ${targetTile.descriptionSeed || 'Describe the area.'}`;
    const gameContext = `Setting: ${settings.shortDescription || 'A generic fantasy world'}. Mood: ${settings.grimnessLevel || 'Neutral'} Grimness, ${settings.darknessLevel || 'Neutral'} Darkness. Magic: ${settings.magicLevel || 'Low'}. Tech: ${settings.technologyLevel || 'Medieval'}. Party: ${partyInfo}.`;
    // Prompt focused on describing the arrival
    const prompt = `Game Context: ${gameContext}\n\nStory summary so far: ${currentSummary || 'The adventure begins.'}\n\n${locationInfo}\n\nDescribe what the player sees upon arriving at this new location.`;

    console.log(`Sending movement prompt to ${selectedProvider} (${model}):`, prompt);

    try {
      const aiResponse = await generateText(selectedProvider, currentApiKey, model, prompt, 1600, 0.7, settings.responseVerbosity);
      const aiMessage = { role: 'ai', content: aiResponse };
      const finalConversation = [...updatedConversation, aiMessage]; // Add AI description
      setConversation(finalConversation);

      // Update summary - maybe simpler for movement?
      const updatedSummary = await summarizeConversation(currentSummary, [systemMessage, aiMessage]); 
      setCurrentSummary(updatedSummary);
    } catch (error) { // ... (error handling as in handleSubmit) ...
      console.error('Failed to fetch AI response after move:', error);
      setError(`Error getting description from ${selectedProvider}: ${error.message}`);
      setConversation([...updatedConversation, { role: 'ai', content: `Error: Could not get description from ${selectedProvider}.` }]);
    } finally {
      setIsLoading(false);
    }
  };

  // --- UI Rendering --- //
  // Get current tile info for display
  const currentTile = getTile(worldMap, playerPosition.x, playerPosition.y);
  const currentBiome = currentTile?.biome || 'Unknown Area';

  return (
    // Renamed outer div
    <div className="game-page-wrapper">
      {/* New flex container */}
      <div className="game-container">
        {/* Game Main remains mostly the same, but its parent is now game-container */}
        <div className="game-main">
          <div className="game-top">
            <h2>Adventure Log</h2>
            <div className="game-info-header">
              <div>
                <p><strong>Setting:</strong> {settings.shortDescription || "Not set"}</p>
                {/* Updated Location Display */}
                <p><strong>Location:</strong> ({playerPosition.x}, {playerPosition.y}) - {currentBiome}</p>
                <div style={{fontSize: '12px', color: '#666', marginTop: '5px'}}>
                  <strong>Debug:</strong> Player at ({playerPosition.x}, {playerPosition.y}) | 
                  Starting town at: {(() => {
                    for (let y = 0; y < worldMap.length; y++) {
                      for (let x = 0; x < worldMap[y].length; x++) {
                        if (worldMap[y][x].poi === 'town' && worldMap[y][x].descriptionSeed === "A small village") {
                          return `(${x}, ${y})`;
                        }
                      }
                    }
                    return 'Not found';
                  })()} | 
                  Match: {playerPosition.x === (() => {
                    for (let y = 0; y < worldMap.length; y++) {
                      for (let x = 0; x < worldMap[y].length; x++) {
                        if (worldMap[y][x].poi === 'town' && worldMap[y][x].descriptionSeed === "A small village") {
                          return x;
                        }
                      }
                    }
                    return -1;
                  })() && playerPosition.y === (() => {
                    for (let y = 0; y < worldMap.length; y++) {
                      for (let x = 0; x < worldMap[y].length; x++) {
                        if (worldMap[y][x].poi === 'town' && worldMap[y][x].descriptionSeed === "A small village") {
                          return y;
                        }
                      }
                    }
                    return -1;
                  })() ? 'YES' : 'NO'}
                </div>
              </div>
              <div className="header-button-group">
                <button onClick={() => setIsMapModalOpen(true)} className="view-map-button">
                    View Map
                </button>
                <button onClick={() => setIsHowToPlayModalOpen(true)} className="how-to-play-button">
                    How to Play
                </button>
                <button onClick={() => setIsSettingsModalOpen(true)} className="view-settings-button">
                    View Full Settings
                </button>
                <button 
                  onClick={() => {
                    console.log('[MANUAL SAVE] User clicked save button');
                    saveConversationToBackend(sessionId, conversation);
                  }} 
                  className="manual-save-button"
                  disabled={!sessionId}
                  title="Manually save game progress"
                >
                    💾 Save Now
                </button>
              </div>
            </div>
          </div>

          <div className="conversation">
            {/* Render Start Button Overlay if adventure hasn't started */}            {!hasAdventureStarted && !isLoading && (
              <div className="start-adventure-overlay">
                <button onClick={handleStartAdventure} className="start-adventure-button">
                  Start the Adventure!
                </button>
              </div>
            )}
            
            {/* Render conversation messages */}            {conversation.map((msg, index) => (
              <p key={index} className={`message ${msg.role}`}>
                {msg.content}
              </p>
            ))}
            {isLoading && <p className="message system">AI is thinking...</p>} 
            {error && <p className="message error">{error}</p>} 
          </div>

          <div className="game-lower-section">
            <form onSubmit={handleSubmit}>
              <textarea
                value={userInput}
                onChange={handleInputChange}
                placeholder={hasAdventureStarted ? "Type your action..." : "Click 'Start Adventure' above..."}
                rows="4"
                className="user-input"
                disabled={!hasAdventureStarted || isLoading} // Disable if not started or loading
              />
              <button 
                type="submit" 
                className="game-send-button" 
                disabled={!hasAdventureStarted || !userInput.trim() || isLoading} // Disable if not started, empty, or loading
              >
                {isLoading ? '...' : '↑ Send'} 
              </button>
            </form>
            <p className="info">AI responses may not always be accurate or coherent.</p>
            {/* Model selector and Session info */}
            <div className="model-selector-container">
              <select 
                id="model-select"
                value={getCurrentSelection()}
                onChange={(e) => handleModelSelection(e.target.value)}
                className="provider-select"
                disabled={isLoading}
              >
                <option value="">Select AI Model...</option>
                {modelOptions.map(option => (
                  <option key={`${option.provider}:${option.model}`} value={`${option.provider}:${option.model}`}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="status-bar">
              <p className="session-info">Session ID: {sessionId || 'Generating...'}</p>
              <div className="api-key-status">
                <span 
                  className={`status-light ${apiKeys[selectedProvider] ? 'status-active' : 'status-inactive'}`}
                  title={apiKeys[selectedProvider] ? `${selectedProvider} API key is set` : `${selectedProvider} API key is missing`}
                ></span>
                <span className="status-text">
                  API Key: {apiKeys[selectedProvider] ? 'Set' : 'Missing'}
                </span>
              </div>
            </div>
            <button 
              onClick={() => setShowDebugInfo(!showDebugInfo)} 
              className="debug-toggle-button"
              title="Toggle debug information"
            >
              {showDebugInfo ? '🐛 Hide Debug' : '🐛 Show Debug'}
            </button>
            <button 
              onClick={() => {
                console.log('=== MANUAL MAP TEST ===');
                testMapGeneration();
              }} 
              className="debug-toggle-button"
              title="Test map generation"
            >
              🗺️ Test Map Gen
            </button>
            
            {showDebugInfo && (
              <div className="debug-info-box">
                <h4>Debug Information</h4>
                <div className="debug-section">
                  <strong>Loaded Conversation:</strong>
                  <pre>{loadedConversation ? 'Yes' : 'No (New Game)'}</pre>
                </div>
                {loadedConversation && (
                  <>
                    <div className="debug-section">
                      <strong>Game Settings:</strong>
                      <pre>{JSON.stringify(loadedConversation.game_settings, null, 2)}</pre>
                    </div>
                    <div className="debug-section">
                      <strong>Provider:</strong> {loadedConversation.provider || 'Not set'}
                    </div>
                    <div className="debug-section">
                      <strong>Model:</strong> {loadedConversation.model || 'Not set'}
                    </div>
                  </>
                )}
                <div className="debug-section">
                  <strong>Current Context Settings:</strong>
                  <pre>{JSON.stringify(settings, null, 2)}</pre>
                </div>
                <div className="debug-section">
                  <strong>Current Provider:</strong> {selectedProvider || 'Not set'}
                </div>
                <div className="debug-section">
                  <strong>Current Model:</strong> {selectedModel || 'Not set'}
                </div>
                <div className="debug-section">
                  <strong>What will be saved:</strong>
                  <pre>{JSON.stringify({
                    provider: selectedProviderRef.current,
                    model: selectedModelRef.current
                  }, null, 2)}</pre>
                </div>
                
                <div className="debug-section">
                  <strong>Map & Position Debug:</strong>
                  <pre>{JSON.stringify({
                    playerPosition: playerPosition,
                    startingTownSearch: (() => {
                      // Search for starting town in current map
                      for (let y = 0; y < worldMap.length; y++) {
                        for (let x = 0; x < worldMap[y].length; x++) {
                          if (worldMap[y][x].poi === 'town' && worldMap[y][x].descriptionSeed === "A small village") {
                            return { x, y, found: true };
                          }
                        }
                      }
                      return { found: false };
                    })(),
                    allTowns: (() => {
                      const towns = [];
                      for (let y = 0; y < worldMap.length; y++) {
                        for (let x = 0; x < worldMap[y].length; x++) {
                          if (worldMap[y][x].poi === 'town') {
                            towns.push({ x, y, desc: worldMap[y][x].descriptionSeed });
                          }
                        }
                      }
                      return towns;
                    })()
                  }, null, 2)}</pre>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Party bar is now a direct child of game-container */}
        <div className="party-bar">
          <h2>Party Members</h2>
          {selectedHeroes && selectedHeroes.length > 0 ? (
            selectedHeroes.map(hero => (
              <div key={hero.characterId || hero.characterName} className="party-member"> {/* Add fallback key */}
                {hero.profilePicture && <img src={hero.profilePicture} alt={`${hero.characterName}'s profile`} width="80" />} {/* Check if image exists */}
                <h3>{hero.characterName}</h3>
                <p>Level {hero.characterLevel} {hero.characterRace} {hero.characterClass}</p>
                {/* Removed individual p tags for Class, Level, Race */}
                {/* 
                <p>Class: {hero.characterClass}</p>
                <p>Level: {hero.characterLevel}</p>
                <p>Race: {hero.characterRace}</p> 
                */}
                {hero.stats && (
                  <div className="stats">
                    <h4>Stats:</h4>
                    <div className="stats-grid">
                      {Object.entries(hero.stats).map(([stat, value]) => (
                        <div key={stat} className="stat-item">
                          {stat.substring(0, 3).toUpperCase()}: {value}
                        </div> 
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <p>No heroes selected.</p>
          )}
        </div>
      </div>

      {/* --- Modals --- */}
      <SettingsModalContent 
        isOpen={isSettingsModalOpen} 
        onClose={() => setIsSettingsModalOpen(false)} 
        settings={settings} 
        selectedProvider={selectedProvider}
        selectedModel={selectedModel}
      />
      <HowToPlayModalContent
        isOpen={isHowToPlayModalOpen}
        onClose={() => setIsHowToPlayModalOpen(false)}
      />
      <MapModalContent
        isOpen={isMapModalOpen}
        onClose={() => setIsMapModalOpen(false)}
        mapData={worldMap}
        playerPosition={playerPosition}
        onTileClick={handleMapTileClick}
        firstHero={selectedHeroes && selectedHeroes.length > 0 ? selectedHeroes[0] : null}
      />
    </div>
  );
};

export default Game;






