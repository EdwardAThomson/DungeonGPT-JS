import React, { useState, useContext } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import CharacterContext from "../contexts/CharacterContext";
import SettingsContext from "../contexts/SettingsContext";
import { generateMapData, findStartingTown } from "../utils/mapGenerator";
import WorldMapDisplay from "../components/WorldMapDisplay";

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
  const [worldSeed, setWorldSeed] = useState(settings?.worldSeed || null);
  const [showMapPreview, setShowMapPreview] = useState(false);



  // Possible options
  const grimnessOptions = ['Noble', 'Neutral', 'Bleak', 'Grim'];
  const darknessOptions = ['Bright', 'Neutral', 'Grey', 'Dark'];

  const magicOptions = ['No Magic', 'Low Magic', 'High Magic', 'Arcane Tech'];
  const technologyOptions = ['Ancient', 'Medieval', 'Renaissance', 'Industrial']; // Excluded 'Futuristic'
  const verbosityOptions = ['Concise', 'Moderate', 'Descriptive'];

  // AI Settings Section removed since it is now global
  const { setIsSettingsModalOpen } = useContext(SettingsContext);

  const handleSubmit = () => {
    // ... validation ...
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

    setFormError('');

    const settingsData = {
      shortDescription,
      grimnessLevel,
      darknessLevel,
      magicLevel,
      technologyLevel,
      responseVerbosity,
      worldSeed,
    };

    if (!generatedMap) {
      setFormError('Please generate a world map before proceeding.');
      return;
    }

    setSettings(settingsData);
    navigate('/hero-selection', { state: { characters, generatedMap, worldSeed } });
  };

  return (
    <div className="page-container game-settings-page">
      <h1>New Game Setup</h1>
      <p>Configure your adventure's world and narrative style below.</p>

      <div style={{ textAlign: 'center', marginBottom: '20px', padding: '15px', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #dee2e6' }}>
        <h4 style={{ margin: '0 0 10px 0' }}>🤖 Global AI Configuration</h4>
        <p style={{ margin: '0 0 15px 0', fontSize: '0.9rem', color: '#6c757d' }}>Provider: <strong>{selectedProvider}</strong> | Model: <strong>{selectedModel}</strong></p>
        <button
          onClick={() => setIsSettingsModalOpen(true)}
          style={{ padding: '8px 16px', background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          ⚙️ Change AI / API Keys
        </button>
      </div>


      {/* World Map Generation Section */}
      <div className="form-section map-generation-section">
        <h2>World Map</h2>
        <p>Generate a random world map for your adventure. Each map is unique with forests, mountains, and towns.</p>

        <div className="map-generation-controls">
          <div className="seed-input-group" style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <label htmlFor="worldSeed" style={{ fontWeight: 'bold' }}>World Seed:</label>
            <input
              id="worldSeed"
              type="number"
              value={worldSeed || ''}
              onChange={(e) => setWorldSeed(e.target.value)}
              placeholder="Leave empty for random"
              className="settings-input"
              style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', width: '150px' }}
            />
            <button
              type="button"
              onClick={() => setWorldSeed(Math.floor(Math.random() * 1000000))}
              className="secondary-button"
              style={{ padding: '6px 12px', fontSize: '0.9rem' }}
            >
              🎲 Randomize
            </button>
          </div>
          <button
            onClick={() => {
              const seedToUse = worldSeed || Math.floor(Math.random() * 1000000);
              if (!worldSeed) setWorldSeed(seedToUse);
              const newMap = generateMapData(10, 10, seedToUse);
              setGeneratedMap(newMap);
              setShowMapPreview(true);
            }}
            className="generate-map-button"
            type="button"
            style={{ width: '100%', maxWidth: '300px' }}
          >
            {generatedMap ? '🔄 Build Map from Seed' : '🗺️ Generate World Map'}
          </button>

          {generatedMap && (
            <span className="map-status">✓ Map generated!</span>
          )}
        </div>

        {showMapPreview && generatedMap && (
          <div className="map-preview-container">
            <h3>Map Preview</h3>
            <p className="map-preview-hint">
              <strong>Towns:</strong> 🛖 Hamlet | 🏡 Village | 🏘️ Town | 🏰 City<br />
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
              onTileClick={() => { }} // No interaction in preview
              firstHero={null} // No player marker in preview
            />
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
