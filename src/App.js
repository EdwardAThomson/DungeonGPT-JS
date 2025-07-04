// App.js

import React, { useState } from "react";
import { BrowserRouter as Router, Route, Link, Routes } from "react-router-dom";
import CharacterCreation from "./CharacterCreation";
import CharacterSummary from "./CharacterSummary";
import AllCharacters from "./AllCharacters";
import HomePage from "./HomePage";
import GameSettings from "./GameSettings";
import HeroSelection from './HeroSelection';
import Game from './Game';
import SavedConversations from './SavedConversations';

import "./App.css";

const App = () => {
  const [characters, setCharacters] = useState([]);
  const [editingCharacterIndex, setEditingCharacterIndex] = useState(null);
  // const [newCharacter, setNewCharacter] = useState(null); // This state doesn't seem to be used here

  return (
    <Router>
      <div className="App">
        {/* Add className="main-nav" here for the nav styles */}
        <nav className="main-nav">
          <ul>
            <li><Link to="/">Home</Link></li>
            <li><Link to="/character-creation">Character Creator</Link></li>
            <li><Link to="/all-characters">All Characters</Link></li>
            <li><Link to="/game-settings">New Game</Link></li>
            <li><Link to="/saved-conversations">Saved Games</Link></li>
          </ul>
        </nav>

        {/* === Add this wrapper div === */}
        <div className="main-content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route
              path="/character-creation"
              element={
                <CharacterCreation
                  // Pass necessary props
                  // Note: characters/setCharacters defined here are passed down,
                  // but CharacterContext is also used inside? Might need cleanup later.
                  characters={characters}
                  setCharacters={setCharacters}
                  editingCharacterIndex={editingCharacterIndex}
                  setEditingCharacterIndex={setEditingCharacterIndex}
                />
              }
            />
            <Route
              path="/character-summary"
              element={<CharacterSummary characters={characters} setCharacters={setCharacters} />}
            />
            <Route
              path="/all-characters"
              element={<AllCharacters characters={characters} setEditingCharacterIndex={setEditingCharacterIndex}/>}
            />
            <Route path="/game-settings" element={<GameSettings />} />
            <Route path="/hero-selection" element={<HeroSelection />} />
            <Route path="/game" element={<Game />} />
            <Route path="/saved-conversations" element={<SavedConversations />} />
          </Routes>
        </div>

      </div>
    </Router>
  );
};

export default App;
