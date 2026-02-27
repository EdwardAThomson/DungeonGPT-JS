import React, { useState, useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import HeroContext from "../contexts/HeroContext";
import SettingsContext from "../contexts/SettingsContext";
import { useAuth } from "../contexts/AuthContext";
import { generateMapData, findStartingTown } from "../utils/mapGenerator";
import WorldMapDisplay from "../components/WorldMapDisplay";
import { storyTemplates } from "../data/storyTemplates";
import { llmService } from "../services/llmService";
import { createLogger } from "../utils/logger";

const logger = createLogger('game-settings');

// Resolve milestone location names to map coordinates by matching town and mountain names
const resolveMilestoneCoords = (milestones, mapData) => {
  if (!milestones || !mapData) return milestones;

  // Build a lookup of named locations -> coordinates from the map
  const locationLookup = {};
  for (let y = 0; y < mapData.length; y++) {
    for (let x = 0; x < mapData[y].length; x++) {
      const tile = mapData[y][x];
      if (tile.poi === 'town' && tile.townName) {
        locationLookup[tile.townName.toLowerCase()] = { x, y };
      }
      // For mountains, store the first tile found for each range name
      if (tile.poi === 'mountain' && tile.mountainName) {
        const key = tile.mountainName.toLowerCase();
        if (!locationLookup[key]) {
          locationLookup[key] = { x, y };
        }
      }
    }
  }

  return milestones
    .filter(m => m.text && m.text.trim())
    .map(m => {
      const resolved = { ...m };
      if (m.location) {
        const coords = locationLookup[m.location.toLowerCase()];
        if (coords) {
          resolved.mapX = coords.x;
          resolved.mapY = coords.y;
        }
      }
      return resolved;
    });
};

const GameSettings = () => {

  // characters should be saved in Context
  const { heroes } = useContext(HeroContext);
  // Get settings, provider, and model state from context
  const { settings, setSettings, selectedProvider, selectedModel } = useContext(SettingsContext);
  const { user } = useAuth();
  const navigate = useNavigate();

  // Clear any stale session ID when starting a new game
  useEffect(() => {
    localStorage.removeItem('activeGameSessionId');
  }, []);

  // Existing state
  const [shortDescription, setShortDescription] = useState(settings?.shortDescription || '');
  const [grimnessLevel, setGrimnessLevel] = useState(settings?.grimnessLevel || '');
  const [darknessLevel, setDarknessLevel] = useState(settings?.darknessLevel || '');

  // New state for additional settings
  const [magicLevel, setMagicLevel] = useState(settings?.magicLevel || 'Low Magic'); // Default example
  const [technologyLevel, setTechnologyLevel] = useState(settings?.technologyLevel || 'Medieval'); // Default example
  const [responseVerbosity, setResponseVerbosity] = useState(settings?.responseVerbosity || 'Moderate'); // Default example
  const [campaignGoal, setCampaignGoal] = useState(settings?.campaignGoal || '');
  const [milestones, setMilestones] = useState(() => {
    if (!settings?.milestones || settings.milestones.length === 0) return [];
    if (typeof settings.milestones[0] === 'object') return settings.milestones;
    return settings.milestones.map(text => ({ text, location: null }));
  });

  // State for validation error message
  const [formError, setFormError] = useState('');

  // State for generated map
  const [generatedMap, setGeneratedMap] = useState(null);
  const [worldSeed, setWorldSeed] = useState(settings?.worldSeed || null);
  const [showMapPreview, setShowMapPreview] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [customNames, setCustomNames] = useState({ towns: [], mountains: [] });

  // AI Generation state
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiError, setAiError] = useState('');
  const [rawAiResponse, setRawAiResponse] = useState('');
  const [showStoryDebug, setShowStoryDebug] = useState(false);



  // Possible options
  const grimnessOptions = ['Noble', 'Neutral', 'Bleak', 'Grim'];
  const darknessOptions = ['Bright', 'Neutral', 'Grey', 'Dark'];

  const magicOptions = ['No Magic', 'Low Magic', 'High Magic', 'Arcane Tech'];
  const technologyOptions = ['Ancient', 'Medieval', 'Renaissance', 'Industrial']; // Excluded 'Futuristic'
  const verbosityOptions = ['Concise', 'Moderate', 'Descriptive'];

  const { setIsSettingsModalOpen } = useContext(SettingsContext);

  // Fields are locked when a preset template or AI-generated story is selected (only custom is editable)
  const isTemplateLocked = selectedTemplate && selectedTemplate !== 'custom';

  const applyTemplate = (template) => {
    setSelectedTemplate(template.id);
    setShortDescription(template.settings.shortDescription);
    setGrimnessLevel(template.settings.grimnessLevel);
    setDarknessLevel(template.settings.darknessLevel);
    setMagicLevel(template.settings.magicLevel);
    setTechnologyLevel(template.settings.technologyLevel);
    setResponseVerbosity(template.settings.responseVerbosity);
    setCampaignGoal(template.settings.campaignGoal || '');
    setMilestones(template.settings.milestones || []);
    setCustomNames(template.customNames || { towns: [], mountains: [] });
  };

  const handleAiGenerateStory = async () => {
    setIsAiGenerating(true);
    setAiError('');
    setSelectedTemplate('ai');

    const prompt = `You are a world-class RPG campaign designer. Create a unique, compelling story preset for a tabletop-style RPG.
    Provide the output in STRICT JSON format with the following keys:
    - shortDescription: A 2-sentence overview of the world and the conflict.
    - campaignGoal: The ultimate objective of the campaign (1 sentence).
    - milestones: An array of 3 objects, each with "text" (the objective) and "location" (one of the town or mountain names where it takes place, or null if it's an unknown location).
    - grimnessLevel: Choose one [Noble, Neutral, Bleak, Grim].
    - darknessLevel: Choose one [Bright, Neutral, Grey, Dark].
    - magicLevel: Choose one [No Magic, Low Magic, High Magic, Arcane Tech].
    - technologyLevel: Choose one [Ancient, Medieval, Renaissance, Industrial].
    - responseVerbosity: Choose one [Concise, Moderate, Descriptive].
    - customNames: An object with two arrays: "towns" (4 thematic town names, first should be the capital) and "mountains" (1 thematic mountain range name).

    Make it creative and atmospheric. Do not include any text other than the JSON object.`;

    try {
      const response = await llmService.generateUnified({
        provider: selectedProvider,
        model: selectedModel,
        prompt: prompt,
        maxTokens: 1000,
        temperature: 0.9
      });

      setRawAiResponse(response);

      // Improved JSON extraction and sanitization
      const extractAndParseJson = (str) => {
        // 1. Find the actual JSON object bounds
        const start = str.indexOf('{');
        const end = str.lastIndexOf('}');
        if (start === -1 || end === -1) throw new Error("AI failed to provide a valid JSON object.");

        let json = str.substring(start, end + 1);

        // 2. Sanitize literal control characters (like newlines) inside strings
        // JSON.parse fails on literal newlines in strings, but LLMs often include them.
        let sanitized = '';
        let inString = false;
        let escaped = false;
        for (let i = 0; i < json.length; i++) {
          const char = json[i];
          if (char === '"' && !escaped) inString = !inString;

          if (inString && (char === '\n' || char === '\r')) {
            sanitized += '\\n';
          } else {
            sanitized += char;
          }
          escaped = (char === '\\' && !escaped);
        }

        return JSON.parse(sanitized);
      };

      const data = extractAndParseJson(response);

      // Apply the generated data
      setShortDescription(data.shortDescription || '');
      setCampaignGoal(data.campaignGoal || '');
      setMilestones((data.milestones || []).map(m => {
        if (typeof m === 'object' && m.text) return { text: m.text, location: m.location || null };
        return { text: String(m), location: null };
      }));
      setGrimnessLevel(data.grimnessLevel || 'Neutral');
      setDarknessLevel(data.darknessLevel || 'Neutral');
      setMagicLevel(data.magicLevel || 'Low Magic');
      setTechnologyLevel(data.technologyLevel || 'Medieval');
      setResponseVerbosity(data.responseVerbosity || 'Moderate');
      // Normalize customNames: support both structured object and legacy flat array
      const rawNames = data.customNames || [];
      if (Array.isArray(rawNames)) {
        setCustomNames({ towns: rawNames, mountains: [] });
      } else {
        setCustomNames({ towns: rawNames.towns || [], mountains: rawNames.mountains || [] });
      }

    } catch (error) {
      logger.error("AI Story Generation failed:", error);
      setAiError(error.message);
    } finally {
      setIsAiGenerating(false);
    }
  };

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

    const templateName = selectedTemplate === 'ai' ? 'AI Generated World' :
      selectedTemplate === 'custom' || !selectedTemplate ? 'Custom Tale' :
        storyTemplates.find(t => t.id === selectedTemplate)?.name || 'Unknown Template';

    const settingsData = {
      shortDescription,
      grimnessLevel,
      darknessLevel,
      magicLevel,
      technologyLevel,
      responseVerbosity,
      campaignGoal,
      milestones: resolveMilestoneCoords(milestones, generatedMap),
      worldSeed,
      templateName
    };

    if (!generatedMap) {
      setFormError('Please generate a world map before proceeding.');
      return;
    }

    // Generate a fresh game session ID for this new game
    const gameSessionId = `game-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem('activeGameSessionId', gameSessionId);

    setSettings(settingsData);
    navigate('/hero-selection', { state: { heroes, generatedMap, worldSeed, gameSessionId } });
  };

  return (
    <div className="page-container game-settings-page">
      <h1>New Game Setup</h1>
      <p>Configure your adventure's world and narrative style below.</p>



      {/* Story Settings Section */}
      <div className="form-section story-settings-section">
        <h2>Story Configuration</h2>
        <p>Choose a template or write your own custom story setting.</p>

        <div className="template-selector" style={{ marginBottom: '30px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--state-muted-strong)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Quick Templates</h4>
            <div style={{ position: 'relative' }}>
              <button
                onClick={handleAiGenerateStory}
                disabled={isAiGenerating || !user}
                className={`ai-generate-button ${isAiGenerating ? 'loading' : ''}`}
                title={!user ? 'Sign in to use AI generation' : ''}
                style={{
                  background: !user ? 'var(--text-secondary)' : 'linear-gradient(135deg, #6c5ce7, #a29bfe)',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '20px',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  cursor: !user ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: !user ? 'none' : '0 4px 15px rgba(108, 92, 231, 0.3)',
                  transition: 'all 0.3s ease',
                  opacity: !user ? 0.6 : 1
                }}
              >
                {isAiGenerating ? '✨ Spawning World...' : '✨ Generate with AI'}
              </button>
              {!user && (
                <span style={{ 
                  display: 'block', 
                  fontSize: '0.7rem', 
                  color: 'var(--text-secondary)', 
                  textAlign: 'center',
                  marginTop: '4px'
                }}>
                  Sign in required
                </span>
              )}
            </div>
          </div>
          {aiError && <p className="error-message" style={{ marginBottom: '15px' }}>{aiError}</p>}

          <div style={{ marginBottom: '15px' }}>
            <button
              type="button"
              onClick={() => setShowStoryDebug(!showStoryDebug)}
              style={{ background: 'none', border: 'none', color: 'var(--state-muted-strong)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
            >
              {showStoryDebug ? 'Hide AI Debug' : 'Show AI Debug Info'}
            </button>

            {showStoryDebug && (
              <div style={{ marginTop: '10px', padding: '10px', background: 'var(--bg)', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.8rem' }}>
                <h5 style={{ margin: '0 0 5px 0', color: 'var(--text)' }}>Raw AI Response:</h5>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text-secondary)', maxHeight: '200px', overflowY: 'auto' }}>
                  {rawAiResponse || 'No data yet. Generate a story to see output.'}
                </pre>
              </div>
            )}
          </div>

          <div className="template-grid">
            {storyTemplates.map(template => (
              <div
                key={template.id}
                className={`template-card ${selectedTemplate === template.id ? 'active' : ''}`}
                onClick={() => applyTemplate(template)}
              >
                <div className="template-icon">{template.icon}</div>
                <div className="template-info">
                  <h5>{template.name}</h5>
                  <p>{template.description}</p>
                </div>
              </div>
            ))}
            <div
              className={`template-card ${selectedTemplate === 'custom' || !selectedTemplate ? 'active' : ''}`}
              onClick={() => {
                setSelectedTemplate('custom');
                setCustomNames({ towns: [], mountains: [] });
                setCampaignGoal('');
                setMilestones([]);
              }}
            >
              <div className="template-icon">✍️</div>
              <div className="template-info">
                <h5>Custom Tale</h5>
                <p>Start with a blank slate and define your own world logic.</p>
              </div>
            </div>
          </div>
        </div>

        {isTemplateLocked && (
          <div style={{ padding: '10px 14px', background: 'var(--primary-tint-10)', border: '1px solid var(--primary)', borderRadius: '8px', marginBottom: '20px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            🔒 Story fields are locked to keep milestones in sync with map locations. Choose <strong>Custom Tale</strong> for full editing freedom.
          </div>
        )}

        <div className="settings-row">
          <div className="settings-group full-width">
            <label htmlFor="shortDescription">Adventure Description</label>
            <textarea
              id="shortDescription"
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              placeholder="e.g., A group of mercenaries investigating a haunted mine..."
              className="settings-textarea"
              readOnly={isTemplateLocked}
              style={isTemplateLocked ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
            />
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-group full-width">
            <label htmlFor="campaignGoal">Campaign Ultimate Goal</label>
            <textarea
              id="campaignGoal"
              value={campaignGoal}
              onChange={(e) => setCampaignGoal(e.target.value)}
              placeholder="e.g., Defeat the dragon terrorizing the kingdom..."
              className="settings-textarea"
              readOnly={isTemplateLocked}
              style={{ minHeight: '60px', ...(isTemplateLocked ? { opacity: 0.7, cursor: 'not-allowed' } : {}) }}
            />
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-group full-width">
            <label htmlFor="milestones">Intermediate Milestones (one per line)</label>
            <textarea
              id="milestones"
              value={milestones.map(m => m.text).join('\n')}
              onChange={(e) => {
                if (isTemplateLocked) return;
                const lines = e.target.value.split('\n');
                setMilestones(lines.map((line, i) => {
                  const existing = milestones[i];
                  if (existing && existing.text === line) return existing;
                  return { text: line, location: existing?.location || null };
                }));
              }}
              placeholder="e.g., Find the ancient key&#10;Bribe the castle guard..."
              className="settings-textarea"
              readOnly={isTemplateLocked}
              style={{ minHeight: '80px', ...(isTemplateLocked ? { opacity: 0.7, cursor: 'not-allowed' } : {}) }}
            />
            {milestones.some(m => m.location) && (
              <div style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {milestones.filter(m => m.text.trim()).map((m, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <span style={{ opacity: 0.7 }}>{i + 1}.</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.text}</span>
                    {m.location
                      ? <span style={{ color: 'var(--primary)', fontWeight: 'bold', whiteSpace: 'nowrap' }}>📍 {m.location}</span>
                      : <span style={{ opacity: 0.4, whiteSpace: 'nowrap' }}>No location</span>
                    }
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="settings-grid">
          <div className="settings-group">
            <label htmlFor="grimness">Grimness</label>
            <select id="grimness" value={grimnessLevel} onChange={(e) => setGrimnessLevel(e.target.value)} className="settings-select" disabled={isTemplateLocked}>
              <option value="">Select...</option>
              {grimnessOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>

          <div className="settings-group">
            <label htmlFor="darkness">Darkness</label>
            <select id="darkness" value={darknessLevel} onChange={(e) => setDarknessLevel(e.target.value)} className="settings-select" disabled={isTemplateLocked}>
              <option value="">Select...</option>
              {darknessOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>

          <div className="settings-group">
            <label htmlFor="magic">Magic Level</label>
            <select id="magic" value={magicLevel} onChange={(e) => setMagicLevel(e.target.value)} className="settings-select" disabled={isTemplateLocked}>
              {magicOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>

          <div className="settings-group">
            <label htmlFor="tech">Technology</label>
            <select id="tech" value={technologyLevel} onChange={(e) => setTechnologyLevel(e.target.value)} className="settings-select" disabled={isTemplateLocked}>
              {technologyOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>

          <div className="settings-group">
            <label htmlFor="verbosity">Narrative Style</label>
            <select id="verbosity" value={responseVerbosity} onChange={(e) => setResponseVerbosity(e.target.value)} className="settings-select" disabled={isTemplateLocked}>
              {verbosityOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
        </div>
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
              style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border-soft)', width: '150px' }}
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
              const newMap = generateMapData(10, 10, seedToUse, customNames);
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
                  logger.error('Error finding starting town in preview:', error);
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

      <div style={{ textAlign: 'center', marginTop: '40px', marginBottom: '40px', padding: '20px', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: '0 4px 12px var(--shadow)' }}>
        <h4 style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px' }}>🤖 Global AI Configuration</h4>
        <p style={{ margin: '0 0 15px 0', fontSize: '0.9rem', color: 'var(--text)' }}>Current: <strong>{selectedProvider}</strong> / <strong>{selectedModel}</strong></p>
        <button
          onClick={() => setIsSettingsModalOpen(true)}
          style={{ padding: '8px 20px', background: 'transparent', color: 'var(--primary)', border: '2px solid var(--primary)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}
        >
          ⚙️ Technical AI Settings
        </button>
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
