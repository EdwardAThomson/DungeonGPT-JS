// GameSettings.js

import React, { useState, useContext } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import CharacterContext from "./CharacterContext";
import SettingsContext from "./SettingsContext";

const GameSettings = () => {

  // characters should be saved in Context
  const { characters } = useContext(CharacterContext);
  // Get settings and provider state from context
  const { settings, setSettings, selectedProvider, setSelectedProvider } = useContext(SettingsContext);
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

  // Possible options
  const grimnessOptions = ['Noble', 'Neutral', 'Bleak', 'Grim'];
  const darknessOptions = ['Bright', 'Neutral', 'Grey', 'Dark'];

  const magicOptions = ['No Magic', 'Low Magic', 'High Magic', 'Arcane Tech'];
  const technologyOptions = ['Ancient', 'Medieval', 'Renaissance', 'Industrial']; // Excluded 'Futuristic'
  const verbosityOptions = ['Concise', 'Moderate', 'Descriptive'];
  const providerOptions = ['openai', 'gemini', 'claude'];

  // Existing handlers
  const handleShortDescriptionChange = (e) => setShortDescription(e.target.value);
  const handleGrimnessChange = (e) => setGrimnessLevel(e.target.value);
  const handleDarknessChange = (e) => setDarknessLevel(e.target.value);
  const handleProviderChange = (e) => setSelectedProvider(e.target.value);

  // New handlers
  const handleMagicLevelChange = (e) => setMagicLevel(e.target.value);
  const handleTechnologyLevelChange = (e) => setTechnologyLevel(e.target.value);
  const handleResponseVerbosityChange = (e) => setResponseVerbosity(e.target.value);

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

    // Save the descriptive settings data in context
    setSettings(settingsData);

    // Navigate to hero selection
    navigate('/hero-selection', { state: { characters } });
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
            {/* AI Provider Sub-section */}
            <div className="ai-setting-item">
                <h3>AI Provider</h3>
                <p>Select the AI for generating responses:</p>
                <select value={selectedProvider} onChange={handleProviderChange} className="settings-select provider-select">
                {providerOptions.map((option) => (
                    <option key={option} value={option}>{option.charAt(0).toUpperCase() + option.slice(1)}</option>
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
