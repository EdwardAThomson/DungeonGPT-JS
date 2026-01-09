// HomePage.js

import React, { useState, useContext } from "react";
import { Link } from "react-router-dom";
import CharacterContext from "../contexts/CharacterContext";
import ApiKeysContext from "../contexts/ApiKeysContext"; // New multi-key context
import SettingsContext from "../contexts/SettingsContext";

const HomePage = () => {
  const { setIsSettingsModalOpen } = useContext(SettingsContext);

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

      <div style={{ textAlign: 'center', marginTop: '20px' }}>
        <h3>AI Configuration</h3>
        <p>Configure your AI providers, models, and API keys.</p>
        <button
          onClick={() => setIsSettingsModalOpen(true)}
          style={{
            padding: '10px 20px',
            fontSize: '1rem',
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          ⚙️ Open Global Settings
        </button>
      </div>
    </div>
  );
};

export default HomePage;
