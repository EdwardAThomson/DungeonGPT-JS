// GameSettings.js

import React, { useState, useContext } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import CharacterContext from "./CharacterContext";
import SettingsContext from "./SettingsContext";
import { generateMapData, findStartingTown } from "./mapGenerator";
import WorldMapDisplay from "./WorldMapDisplay";
import { generateTownMap, getTownTileEmoji } from "./townMapGenerator";

const GameSettings = () => {

  // characters should be saved in Context
  const { characters } = useContext(CharacterContext);
  // Get settings, provider, and model state from context
  const { settings, setSettings, selectedProvider, setSelectedProvider, selectedModel, setSelectedModel } = useContext(SettingsContext);
  const navigate = useNavigate();

  // Existing state
  const [shortDescription, setShortDescription] = useState(settings?.shortDescription || '');
  const [grimnessLevel, setGrimnessLevel] = useState(settings?.grimnessLevel || '');
  const [darknessLevel, setDarknessLevel] = useState(settings?.darknessLevel || '');

  // New state for additional settings
  const [magicLevel, setMagicLevel] = useState(settings?.magicLevel || 'Low Magic'); // Default example
  const [technologyLevel, setTechnologyLevel] = useState(settings?.technologyLevel || 'Medieval'); // Default example
  const [responseVerbosity, setResponseVerbosity] = useState(settings?.responseVerbosity || 'Moderate'); // Default example

  // State for validation error message
  const [formError, setFormError] = useState('');
  
  // State for generated map
  const [generatedMap, setGeneratedMap] = useState(null);
  const [showMapPreview, setShowMapPreview] = useState(false);
  
  // State for town map preview
  const [generatedTownMap, setGeneratedTownMap] = useState(null);
  const [showTownMapPreview, setShowTownMapPreview] = useState(false);
  const [selectedTownSize, setSelectedTownSize] = useState('village');

  // Possible options
  const grimnessOptions = ['Noble', 'Neutral', 'Bleak', 'Grim'];
  const darknessOptions = ['Bright', 'Neutral', 'Grey', 'Dark'];

  const magicOptions = ['No Magic', 'Low Magic', 'High Magic', 'Arcane Tech'];
  const technologyOptions = ['Ancient', 'Medieval', 'Renaissance', 'Industrial']; // Excluded 'Futuristic'
  const verbosityOptions = ['Concise', 'Moderate', 'Descriptive'];
  
  // Combined provider-model options (same as in Game.js)
  const modelOptions = [
    { provider: 'openai', model: 'gpt-5', label: 'OpenAI - GPT-5' },
    { provider: 'openai', model: 'gpt-5-mini', label: 'OpenAI - GPT-5 Mini' },
    { provider: 'openai', model: 'o4-mini', label: 'OpenAI - O4 Mini' },
    { provider: 'gemini', model: 'gemini-2.5-pro', label: 'Gemini - 2.5 Pro' },
    { provider: 'gemini', model: 'gemini-2.5-flash', label: 'Gemini - 2.5 Flash' },
    { provider: 'claude', model: 'claude-sonnet-4-5-20250929', label: 'Claude - Sonnet 4.5' }
  ];

  // Existing handlers
  const handleShortDescriptionChange = (e) => setShortDescription(e.target.value);
  const handleGrimnessChange = (e) => setGrimnessLevel(e.target.value);
  const handleDarknessChange = (e) => setDarknessLevel(e.target.value);
  
  // Handle combined model selection
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

  // New handlers
  const handleMagicLevelChange = (e) => setMagicLevel(e.target.value);
  const handleTechnologyLevelChange = (e) => setTechnologyLevel(e.target.value);
  const handleResponseVerbosityChange = (e) => setResponseVerbosity(e.target.value);
  
  // Map generation handler
  const handleGenerateMap = () => {
    const newMap = generateMapData();
    setGeneratedMap(newMap);
    setShowMapPreview(true);
  };
  
  // Town map generation handler
  const handleGenerateTownMap = () => {
    const townMap = generateTownMap(selectedTownSize, `Test ${selectedTownSize}`, 'south');
    setGeneratedTownMap(townMap);
    setShowTownMapPreview(true);
  };

  const handleSubmit = () => {
    // Validation Checks
    if (!shortDescription.trim()) {
        setFormError('Please enter a story description.');
        return;
    }
    if (!grimnessLevel) {
        setFormError('Please select a Grimness level.');
        return;
    }
    if (!darknessLevel) {
        setFormError('Please select a Darkness level.');
        return;
    }
    // Optional: Add checks for magicLevel, technologyLevel, responseVerbosity if defaults aren't sufficient
    // if (!magicLevel) { setFormError('Please select a Magic level.'); return; }
    // if (!technologyLevel) { setFormError('Please select a Technology level.'); return; }
    // if (!responseVerbosity) { setFormError('Please select Response Verbosity.'); return; }

    // Clear error if validation passes
    setFormError('');

    const settingsData = {
      shortDescription,
      grimnessLevel,
      darknessLevel,
      magicLevel, // Added
      technologyLevel, // Added
      responseVerbosity, // Added
      // Note: selectedProvider is managed directly in context
    };

    // Check if map has been generated
    if (!generatedMap) {
      setFormError('Please generate a world map before proceeding.');
      return;
    }

    // Save the descriptive settings data in context
    setSettings(settingsData);

    // Navigate to hero selection with generated map
    navigate('/hero-selection', { state: { characters, generatedMap } });
  };

  return (
    <div className="page-container game-settings-page">
      <h1>Settings Page</h1>
      <p>
        Configure the settings for your new game session.
      </p>

      {/* Story Details Section */}
      <div className="form-section story-details-section">
        <h2>Story Details</h2>
        <p>
          Provide a short description of the story setting (e.g. Typical high fantasy).
        </p>
        <p>
          The description can be no more than 200 characters:
        </p>
        <textarea
          value={shortDescription}
          onChange={handleShortDescriptionChange}
          maxLength="200"
          placeholder="Enter short description of the story setting"
          rows="4"
          cols="50"
          className="settings-textarea"
        />
      </div>

      {/* Mood Section */}
      <div className="form-section mood-section">
        <h2>Mood</h2>
        <p>
          Set the mood level in the story using a scale of grimdark to noblebright. Using the two drop-downs below select the levels of grimness and darkness.
        </p>

        <div className="mood-selectors">
          {/* Grimness Sub-section */}
          <div className="mood-selector-item">
            <h3>
              Grimness
              <span className="tooltip-trigger" data-tooltip="Grim: Harsh, unforgiving, protagonists struggle. Bleak: Pessimistic, survival is tough. Neutral: Balanced morality. Noble: Idealistic, focus on heroism.">(?)</span>
            </h3>
            <p>Level of Grimness:</p>
            <select value={grimnessLevel} onChange={handleGrimnessChange} className="settings-select" required>
              <option value="">Select grimness...</option>
              {grimnessOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          {/* Darkness Sub-section */}
          <div className="mood-selector-item">
            <h3>
              Darkness
              <span className="tooltip-trigger" data-tooltip="Dark: Moral ambiguity, hard choices. Grey: Complex characters, shades of morality. Neutral: Standard good vs. evil. Bright: Clear heroes, optimistic tone.">(?)</span>
            </h3>
            <p>Level of Darkness:</p>
            <select value={darknessLevel} onChange={handleDarknessChange} className="settings-select" required>
              <option value="">Select darkness...</option>
              {darknessOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* World Settings Section */}
      <div className="form-section world-settings-section">
          <h2>World Settings</h2>
          <div className="world-settings-selectors"> {/* Wrapper for side-by-side */}            
              {/* Magic Level Sub-section */}
              <div className="world-setting-item">
                <h3>Magic Level</h3>
                <p>Prevalence of magic:</p>
                <select value={magicLevel} onChange={handleMagicLevelChange} className="settings-select">
                  {magicOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              {/* Technology Level Sub-section */}
              <div className="world-setting-item">
                <h3>Technology Level</h3>
                <p>Dominant technology:</p>
                <select value={technologyLevel} onChange={handleTechnologyLevelChange} className="settings-select">
                  {technologyOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
          </div>
      </div>

      {/* AI Settings Section */}
      <div className="form-section ai-settings-section">
        <h2>AI Settings</h2>
        <div className="ai-settings-selectors"> {/* Wrapper */}            
            {/* AI Model Selection */}
            <div className="ai-setting-item">
                <h3>AI Model</h3>
                <p>Select the AI model for generating responses:</p>
                <select 
                  value={getCurrentSelection()} 
                  onChange={(e) => handleModelSelection(e.target.value)} 
                  className="settings-select provider-select"
                >
                  <option value="">Select AI Model...</option>
                  {modelOptions.map(option => (
                    <option key={`${option.provider}:${option.model}`} value={`${option.provider}:${option.model}`}>
                      {option.label}
                    </option>
                  ))}
                </select>
            </div>

            {/* Response Verbosity Sub-section */}
            <div className="ai-setting-item">
                <h3>Response Verbosity</h3>
                <p>How detailed should AI responses be?</p>
                <select value={responseVerbosity} onChange={handleResponseVerbosityChange} className="settings-select verbosity-select">
                {verbosityOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                ))}
                </select>
            </div>
        </div>
      </div>

      {/* World Map Generation Section */}
      <div className="form-section map-generation-section">
        <h2>World Map</h2>
        <p>Generate a random world map for your adventure. Each map is unique with forests, mountains, and towns.</p>
        
        <div className="map-generation-controls">
          <button 
            onClick={handleGenerateMap} 
            className="generate-map-button"
            type="button"
          >
            {generatedMap ? '🔄 Regenerate Map' : '🗺️ Generate World Map'}
          </button>
          
          {generatedMap && (
            <span className="map-status">✓ Map generated!</span>
          )}
        </div>

        {showMapPreview && generatedMap && (
          <div className="map-preview-container">
            <h3>Map Preview</h3>
            <p className="map-preview-hint">
              <strong>Towns:</strong> 🛖 Hamlet | 🏡 Village | 🏘️ Town | 🏰 City<br/>
              <strong>Features:</strong> 🌲 Forest | ⛰️ Mountain
            </p>
            <WorldMapDisplay 
              mapData={generatedMap}
              playerPosition={(() => {
                try {
                  return findStartingTown(generatedMap);
                } catch (error) {
                  console.error('Error finding starting town in preview:', error);
                  // Find any town as fallback for preview
                  for (let y = 0; y < generatedMap.length; y++) {
                    for (let x = 0; x < generatedMap[y].length; x++) {
                      if (generatedMap[y][x].poi === 'town') {
                        return { x, y };
                      }
                    }
                  }
                  return { x: 0, y: 0 }; // Last resort
                }
              })()}
              onTileClick={() => {}} // No interaction in preview
              firstHero={null} // No player marker in preview
            />
          </div>
        )}
      </div>

      {/* Town Map Generation Section */}
      <div className="form-section">
        <h2>Town Map Generator (Debug/Test)</h2>
        <p className="section-description">
          Test the town interior map generator for different town sizes.
        </p>
        
        <div className="town-map-controls">
          <label htmlFor="town-size-select">
            <strong>Town Size:</strong>
          </label>
          <select 
            id="town-size-select"
            value={selectedTownSize}
            onChange={(e) => setSelectedTownSize(e.target.value)}
            className="town-size-select"
          >
            <option value="hamlet">Hamlet (8x8)</option>
            <option value="village">Village (12x12)</option>
            <option value="town">Town (16x16)</option>
            <option value="city">City (20x20)</option>
          </select>
          
          <button 
            onClick={handleGenerateTownMap} 
            className="generate-map-button"
            type="button"
          >
            🏘️ Generate Town Map
          </button>
          
          {generatedTownMap && (
            <span className="map-status">✓ Town map generated!</span>
          )}
        </div>

        {showTownMapPreview && generatedTownMap && (
          <div className="map-preview-container">
            <h3>Town Map Preview: {generatedTownMap.townName}</h3>
            <p className="map-preview-hint">
              <strong>Buildings:</strong> 🏠 House | 🏨 Inn | 🏪 Shop | ⛪ Temple | 🍺 Tavern | 🏦 Bank | 🏛️ Guild<br/>
              <strong>Features:</strong> ⛲ Fountain | 🪣 Well | 🌳 Tree
            </p>
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${generatedTownMap.width}, 30px)`,
              gridTemplateRows: `repeat(${generatedTownMap.height}, 30px)`,
              gap: '1px',
              border: '1px solid #ccc',
              width: `${generatedTownMap.width * 30 + (generatedTownMap.width - 1)}px`,
              margin: '20px auto',
              backgroundColor: '#eee',
              fontSize: '16px'
            }}>
              {generatedTownMap.mapData.flat().map((tile, index) => {
                const row = Math.floor(index / generatedTownMap.width);
                const col = index % generatedTownMap.width;
                const isPath = tile.type === 'dirt_path' || tile.type === 'stone_path';
                const isWall = tile.type === 'wall';
                const isKeepWall = tile.type === 'keep_wall';
                const pathColor = tile.type === 'dirt_path' ? '#8B4513' : '#E0E0E0';
                const wallColor = '#A9A9A9';
                const keepWallColor = '#E0E0E0';
                
                // Check adjacent tiles to determine path direction
                let hasPathNorth = false, hasPathSouth = false, hasPathEast = false, hasPathWest = false;
                if (isPath) {
                  const north = row > 0 ? generatedTownMap.mapData[row - 1][col] : null;
                  const south = row < generatedTownMap.height - 1 ? generatedTownMap.mapData[row + 1][col] : null;
                  const east = col < generatedTownMap.width - 1 ? generatedTownMap.mapData[row][col + 1] : null;
                  const west = col > 0 ? generatedTownMap.mapData[row][col - 1] : null;
                  
                  hasPathNorth = north && (north.type === 'dirt_path' || north.type === 'stone_path' || north.type === 'building' || north.type === 'town_square');
                  hasPathSouth = south && (south.type === 'dirt_path' || south.type === 'stone_path' || south.type === 'building' || south.type === 'town_square');
                  hasPathEast = east && (east.type === 'dirt_path' || east.type === 'stone_path' || east.type === 'building' || east.type === 'town_square');
                  hasPathWest = west && (west.type === 'dirt_path' || west.type === 'stone_path' || west.type === 'building' || west.type === 'town_square');
                }
                
                // Check adjacent tiles for wall connections
                let hasWallNorth = false, hasWallSouth = false, hasWallEast = false, hasWallWest = false;
                if (isWall) {
                  const north = row > 0 ? generatedTownMap.mapData[row - 1][col] : null;
                  const south = row < generatedTownMap.height - 1 ? generatedTownMap.mapData[row + 1][col] : null;
                  const east = col < generatedTownMap.width - 1 ? generatedTownMap.mapData[row][col + 1] : null;
                  const west = col > 0 ? generatedTownMap.mapData[row][col - 1] : null;
                  
                  hasWallNorth = north && north.type === 'wall';
                  hasWallSouth = south && south.type === 'wall';
                  hasWallEast = east && east.type === 'wall';
                  hasWallWest = west && west.type === 'wall';
                }
                
                // Check adjacent tiles for keep wall connections
                let hasKeepWallNorth = false, hasKeepWallSouth = false, hasKeepWallEast = false, hasKeepWallWest = false;
                if (isKeepWall) {
                  const north = row > 0 ? generatedTownMap.mapData[row - 1][col] : null;
                  const south = row < generatedTownMap.height - 1 ? generatedTownMap.mapData[row + 1][col] : null;
                  const east = col < generatedTownMap.width - 1 ? generatedTownMap.mapData[row][col + 1] : null;
                  const west = col > 0 ? generatedTownMap.mapData[row][col - 1] : null;
                  
                  hasKeepWallNorth = north && north.type === 'keep_wall';
                  hasKeepWallSouth = south && south.type === 'keep_wall';
                  hasKeepWallEast = east && east.type === 'keep_wall';
                  hasKeepWallWest = west && west.type === 'keep_wall';
                }
                
                return (
                  <div
                    key={index}
                    style={{
                      backgroundColor: tile.type === 'grass' ? '#90EE90' : 
                                     tile.type === 'stone_path' ? '#90EE90' :
                                     tile.type === 'dirt_path' ? '#90EE90' :
                                     tile.type === 'wall' ? '#90EE90' :  // Grass background for walls (draw lines)
                                     tile.type === 'keep_wall' ? '#90EE90' :  // Grass background for keep walls (draw lines)
                                     tile.type === 'town_square' ? '#E0E0E0' :  // Solid grey square
                                     tile.type === 'building' ? '#90EE90' : '#FFF',  // Green under buildings
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: tile.isEntry ? '2px solid yellow' : 'none',
                      position: 'relative'
                    }}
                    title={`(${tile.x}, ${tile.y}) - ${tile.type}${tile.buildingType ? ` (${tile.buildingType})` : ''}${tile.buildingName ? ` - ${tile.buildingName}` : ''}`}
                  >
                    {isPath && (
                      <>
                        {/* North segment - only if there's a path north */}
                        {hasPathNorth && (
                          <div style={{
                            position: 'absolute',
                            width: '4px',
                            height: '50%',
                            backgroundColor: pathColor,
                            left: '50%',
                            top: '0',
                            transform: 'translateX(-50%)'
                          }} />
                        )}
                        {/* South segment - only if there's a path south */}
                        {hasPathSouth && (
                          <div style={{
                            position: 'absolute',
                            width: '4px',
                            height: '50%',
                            backgroundColor: pathColor,
                            left: '50%',
                            bottom: '0',
                            transform: 'translateX(-50%)'
                          }} />
                        )}
                        {/* East segment - only if there's a path east */}
                        {hasPathEast && (
                          <div style={{
                            position: 'absolute',
                            height: '4px',
                            width: '50%',
                            backgroundColor: pathColor,
                            top: '50%',
                            right: '0',
                            transform: 'translateY(-50%)'
                          }} />
                        )}
                        {/* West segment - only if there's a path west */}
                        {hasPathWest && (
                          <div style={{
                            position: 'absolute',
                            height: '4px',
                            width: '50%',
                            backgroundColor: pathColor,
                            top: '50%',
                            left: '0',
                            transform: 'translateY(-50%)'
                          }} />
                        )}
                        {/* Center dot only for corners/intersections (2+ connections) */}
                        {(hasPathNorth || hasPathSouth) && (hasPathEast || hasPathWest) && (
                          <div style={{
                            position: 'absolute',
                            width: '6px',
                            height: '6px',
                            backgroundColor: pathColor,
                            borderRadius: '50%'
                          }} />
                        )}
                      </>
                    )}
                    {isWall && (
                      <>
                        {/* North wall segment - 12px thick (3x paths) */}
                        {hasWallNorth && (
                          <div style={{
                            position: 'absolute',
                            width: '12px',
                            height: '50%',
                            backgroundColor: wallColor,
                            left: '50%',
                            top: '0',
                            transform: 'translateX(-50%)'
                          }} />
                        )}
                        {/* South wall segment */}
                        {hasWallSouth && (
                          <div style={{
                            position: 'absolute',
                            width: '12px',
                            height: '50%',
                            backgroundColor: wallColor,
                            left: '50%',
                            bottom: '0',
                            transform: 'translateX(-50%)'
                          }} />
                        )}
                        {/* East wall segment */}
                        {hasWallEast && (
                          <div style={{
                            position: 'absolute',
                            height: '12px',
                            width: '50%',
                            backgroundColor: wallColor,
                            top: '50%',
                            right: '0',
                            transform: 'translateY(-50%)'
                          }} />
                        )}
                        {/* West wall segment */}
                        {hasWallWest && (
                          <div style={{
                            position: 'absolute',
                            height: '12px',
                            width: '50%',
                            backgroundColor: wallColor,
                            top: '50%',
                            left: '0',
                            transform: 'translateY(-50%)'
                          }} />
                        )}
                        {/* Center square only for corners/intersections (2+ connections) */}
                        {(hasWallNorth || hasWallSouth) && (hasWallEast || hasWallWest) && (
                          <div style={{
                            position: 'absolute',
                            width: '14px',
                            height: '14px',
                            backgroundColor: wallColor,
                            borderRadius: '2px'
                          }} />
                        )}
                      </>
                    )}
                    {isKeepWall && (
                      <>
                        {/* North keep wall segment - 4px like paths */}
                        {hasKeepWallNorth && (
                          <div style={{
                            position: 'absolute',
                            width: '4px',
                            height: '50%',
                            backgroundColor: keepWallColor,
                            left: '50%',
                            top: '0',
                            transform: 'translateX(-50%)'
                          }} />
                        )}
                        {/* South keep wall segment */}
                        {hasKeepWallSouth && (
                          <div style={{
                            position: 'absolute',
                            width: '4px',
                            height: '50%',
                            backgroundColor: keepWallColor,
                            left: '50%',
                            bottom: '0',
                            transform: 'translateX(-50%)'
                          }} />
                        )}
                        {/* East keep wall segment */}
                        {hasKeepWallEast && (
                          <div style={{
                            position: 'absolute',
                            height: '4px',
                            width: '50%',
                            backgroundColor: keepWallColor,
                            top: '50%',
                            right: '0',
                            transform: 'translateY(-50%)'
                          }} />
                        )}
                        {/* West keep wall segment */}
                        {hasKeepWallWest && (
                          <div style={{
                            position: 'absolute',
                            height: '4px',
                            width: '50%',
                            backgroundColor: keepWallColor,
                            top: '50%',
                            left: '0',
                            transform: 'translateY(-50%)'
                          }} />
                        )}
                        {/* Center dot only for corners/intersections (2+ connections) */}
                        {(hasKeepWallNorth || hasKeepWallSouth) && (hasKeepWallEast || hasKeepWallWest) && (
                          <div style={{
                            position: 'absolute',
                            width: '6px',
                            height: '6px',
                            backgroundColor: keepWallColor,
                            borderRadius: '50%'
                          }} />
                        )}
                      </>
                    )}
                    {getTownTileEmoji(tile)}
                  </div>
                );
              })}
            </div>
            <p style={{ textAlign: 'center', fontSize: '12px', color: '#666' }}>
              Entry point marked with yellow border | 
              Size: {generatedTownMap.width}x{generatedTownMap.height} | 
              Buildings: {generatedTownMap.mapData.flat().filter(t => t.type === 'building').length} structures
            </p>
          </div>
        )}
      </div>

      {/* Action Button & Error Message */}
      <div className="form-actions">
        {formError && <p className="error-message">{formError}</p>}
        <button onClick={handleSubmit} className="settings-submit-button">
          Next: Select Heroes
        </button>
      </div>
    </div>
  );
};

export default GameSettings;


  // const { state } = useLocation();
  // const settingsData = state?.settingsData;

  /*
  const [shortDescription, setShortDescription] = useState(settingsData?.shortDescription || '');
  const [grimnessLevel, setGrimnessLevel] = useState(settingsData?.grimnessLevel || '');
  const [darknessLevel, setDarknessLevel] = useState(settingsData?.darknessLevel || '');
  const [magicLevel, setMagicLevel] = useState(settingsData?.magicLevel || 'Low Magic');
  const [technologyLevel, setTechnologyLevel] = useState(settingsData?.technologyLevel || 'Medieval');
  const [responseVerbosity, setResponseVerbosity] = useState(settingsData?.responseVerbosity || 'Moderate');
  */
