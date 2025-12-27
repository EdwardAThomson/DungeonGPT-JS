// HomePage.js

import React, { useState, useContext } from "react";
import { Link } from "react-router-dom";
import CharacterContext from "../contexts/CharacterContext";
import ApiKeysContext from "../contexts/ApiKeysContext"; // New multi-key context

const HomePage = () => {
  const { characters } = useContext(CharacterContext);
  // Use the new context for multiple API keys
  const { apiKeys, setApiKeys } = useContext(ApiKeysContext);

  // Local state to manage the input fields for each key
  const [localKeys, setLocalKeys] = useState({
    openai: apiKeys.openai || '',
    gemini: apiKeys.gemini || '',
    claude: apiKeys.claude || ''
  });

  // Handle changes in any input field
  const handleInputChange = (provider) => (e) => {
    setLocalKeys(prevKeys => ({
      ...prevKeys,
      [provider]: e.target.value
    }));
  };

  // Handle submission of all keys to the context
  const handleSubmitApiKeys = (e) => {
    e.preventDefault(); // Prevent default form submission if wrapped in form
    setApiKeys(localKeys); // Update the context with the keys from local state
    // Optionally, provide feedback to the user
    alert("API Keys updated!");
  };

  return (
    <div className="Home-page">
      <h1>Welcome to the Character Creator & AI Game!</h1>
      <p>
        Use the links below to manage characters or start a new game.
      </p>
      <nav>
        <p><Link to="/character-creation">Create a New Character</Link></p>
        <p><Link to="/all-characters">View All Characters</Link></p>
        <p><Link to="/game-settings">Start a New Game</Link></p>
      </nav>

      <hr />

      <h2>API Key Configuration</h2>
      <p><strong>Warning:</strong> Storing API keys entered here is insecure for production. Use environment variables or a backend proxy for real applications.</p>
      <form onSubmit={handleSubmitApiKeys} className="api-key-form">
        <div className="api-key-input-group">
          <label htmlFor="openai-key">OpenAI API Key:</label>
          <input
            id="openai-key"
            type="password" // Use password type to obscure key
            value={localKeys.openai}
            onChange={handleInputChange('openai')}
            placeholder="Enter OpenAI Key"
          />
        </div>
        <div className="api-key-input-group">
          <label htmlFor="gemini-key">Gemini API Key:</label>
          <input
            id="gemini-key"
            type="password"
            value={localKeys.gemini}
            onChange={handleInputChange('gemini')}
            placeholder="Enter Gemini Key"
          />
        </div>
        <div className="api-key-input-group">
          <label htmlFor="claude-key">Claude API Key:</label>
          <input
            id="claude-key"
            type="password"
            value={localKeys.claude}
            onChange={handleInputChange('claude')}
            placeholder="Enter Claude Key"
          />
        </div>
        <button type="submit">Save API Keys</button>
      </form>
    </div>
  );
};

export default HomePage;
