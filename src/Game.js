import React, { useState, useContext, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import ApiKeysContext from './ApiKeysContext'; // New context
import SettingsContext from "./SettingsContext";
import { generateText } from "./llmHelper"; // Ensure this path is correct after rename
import { SettingsModalContent, HowToPlayModalContent } from './Modals'; // Import modals
import WorldMapDisplay from './WorldMapDisplay'; // Import the map display
import { generateMapData, getTile } from './mapGenerator'; // Import map generator and helper

// --- Map Modal --- //
const MapModalContent = ({ isOpen, onClose, mapData, playerPosition, onTileClick }) => {
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
  const { selectedHeroes: stateHeroes, loadedConversation } = state || { selectedHeroes: [], loadedConversation: null };
  const selectedHeroes = loadedConversation?.selected_heroes || stateHeroes || [];

  // Get API keys and the selected provider from context
  const { apiKeys } = useContext(ApiKeysContext);
  const { settings, selectedProvider } = useContext(SettingsContext);

  const [userInput, setUserInput] = useState('');
  const [conversation, setConversation] = useState(loadedConversation?.conversation_data || []);
  const [currentSummary, setCurrentSummary] = useState(loadedConversation?.summary || '');
  const [isLoading, setIsLoading] = useState(false); // State for loading indicator
  const [error, setError] = useState(null); // State for error messages
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false); // State for modal visibility
  const [isHowToPlayModalOpen, setIsHowToPlayModalOpen] = useState(false); // State for How to Play modal
  const [isMapModalOpen, setIsMapModalOpen] = useState(false); // State for Map modal
  const [sessionId, setSessionId] = useState(loadedConversation?.sessionId || null); // State for Session ID
  const [worldMap, setWorldMap] = useState(() => loadedConversation?.world_map || generateMapData()); // Use loaded map or generate new
  const [playerPosition, setPlayerPosition] = useState(loadedConversation?.player_position || { x: 1, y: 1 }); // Use loaded position or start at (1,1)
  const [hasAdventureStarted, setHasAdventureStarted] = useState(loadedConversation ? true : false); // State for initial start

  // Refs to hold the latest state for the cleanup function
  const conversationRef = useRef(conversation);
  const sessionIdRef = useRef(sessionId);
  const selectedProviderRef = useRef(selectedProvider); // Also track provider if needed for saving endpoint

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

  // Generate session ID on component mount (only if not loading a saved conversation)
  useEffect(() => {
    if (!loadedConversation) {
      // Generate a simple unique ID (you could use a library like uuid for more robustness)
      const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setSessionId(newSessionId);
      console.log("Generated Session ID:", newSessionId);
    } else {
      console.log("Loaded conversation with Session ID:", loadedConversation.sessionId);
    }

    // Cleanup function to save conversation on unmount
    return () => {
      const finalConversation = conversationRef.current;
      const finalSessionId = sessionIdRef.current;

      if (finalSessionId && finalConversation && finalConversation.length > 0) {
        console.log(`Attempting to save conversation for session: ${finalSessionId}`);
        saveConversationToBackend(finalSessionId, finalConversation);
      } else {
        console.log("Skipping save: No session ID or conversation is empty.");
      }
    };
  }, []); // Empty dependency array ensures this runs only once on mount and cleanup on unmount

  // Function to send data to backend
  const saveConversationToBackend = async (sessionIdToSave, conversationToSave) => {
    try {
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
          timestamp: new Date().toISOString(),
          conversationName: `Adventure - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
          gameSettings: settings,
          selectedHeroes: selectedHeroes,
          currentSummary: currentSummary,
          worldMap: worldMap,
          playerPosition: playerPosition,
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

  // Determine the appropriate model based on the provider
  const getCurrentModel = () => {
    switch (selectedProvider) {
      case 'openai':
        return 'gpt-4o';
      case 'gemini':
        return 'gemini-2.5-flash';
      case 'claude':
        return 'claude-3-5-sonnet-20241022';
      default:
        console.warn(`Unknown provider selected: ${selectedProvider}, defaulting to OpenAI model.`);
        return 'gpt-4o';
    }
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

    // Check adjacency (simple N, S, E, W for now - optionally add diagonals)
    const dx = Math.abs(clickedX - currentX);
    const dy = Math.abs(clickedY - currentY);
    const isAdjacent = (dx === 1 && dy === 0) || (dx === 0 && dy === 1);

    if (!isAdjacent) {
      console.log("Cannot move: Tile is not adjacent.");
      // Optionally set an error message for the UI
      // setError("You can only move to adjacent tiles.");
      return;
    }

    const targetTile = getTile(worldMap, clickedX, clickedY);
    // TODO: Add check for traversability (e.g., targetTile.biome !== 'water') later
    if (!targetTile) {
        console.log("Cannot move: Target tile is invalid.");
        return;
    }

    console.log(`Moving player to: ${clickedX}, ${clickedY}`);
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
            {/* Add Model info here */}
            <p className="model-info">Model: {getCurrentModel()}</p>
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
      />
    </div>
  );
};

export default Game;






