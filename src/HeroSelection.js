// HeroSelection.js

import React, { useState, useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import CharacterContext from './CharacterContext';
import SettingsContext from './SettingsContext';

const HeroSelection = () => {
  const { state } = useLocation();
  const { characters } = useContext(CharacterContext);
  const { settings } = useContext(SettingsContext);
  const navigate = useNavigate();

  const [selectedHeroes, setSelectedHeroes] = useState([]);
  const [selectionError, setSelectionError] = useState('');

  const toggleHeroSelection = (character) => {
    setSelectionError('');
    setSelectedHeroes((prevSelected) => {
      const isSelected = prevSelected.some(hero => hero.characterId === character.characterId);
      if (isSelected) {
        return prevSelected.filter((hero) => hero.characterId !== character.characterId);
      } else {
        if (prevSelected.length < 4) {
          return [...prevSelected, character];
        } else {
          setSelectionError('You can select a maximum of 4 heroes.');
          return prevSelected;
        }
      }
    });
  };

  const handleCreateCharacter = () => {
    navigate('/character-creation', { state: { returnToHeroSelection: true, settingsData: settings } });
  };

  const handleNext = () => {
    if (selectedHeroes.length === 0 || selectedHeroes.length > 4) {
      setSelectionError('Please select between 1 and 4 heroes to start.');
      return;
    }
    setSelectionError('');
    
    navigate('/game', { state: { selectedHeroes } });

  };

  const handleBack = () => {
    navigate('/game-settings');
  };

  return (
    <div className="page-container hero-selection-page">
      <div className="page-header">
        <h2>Select Your Party (1-4 Heroes)</h2>
        <button onClick={handleCreateCharacter} className="create-new-button">
          + Create New Character
        </button>
      </div>

      {characters.length === 0 ? (
        <h3>No characters available. Please create a character.</h3>
      ) : (
        <ul className="all-characters-list hero-selection-list">
          {characters.map((char) => {
            const isSelected = selectedHeroes.some(hero => hero.characterId === char.characterId);
            return (
              <li
                key={char.characterId}
                className={`character-item hero-item ${isSelected ? 'selected' : ''}`}
                onClick={() => toggleHeroSelection(char)}
              >
                <div className="character-item-image">
                  <img src={char.profilePicture} alt={`${char.characterName}'s profile`} />
                </div>

                <div className="character-item-info">
                  <h3>{char.characterName}</h3>
                  <p>
                    <span className="detail-label">Level:</span> {char.characterLevel} {char.characterClass}
                  </p>
                  <p>
                    <span className="detail-label">Race:</span> {char.characterRace}
                  </p>
                  <p>
                    <span className="detail-label">Gender:</span> {char.characterGender || 'N/A'}
                  </p>
                  <p>
                    <span className="detail-label">Alignment:</span> {char.characterAlignment || 'N/A'}
                  </p>
                  <p>
                    <span className="detail-label">BG:</span> {char.characterBackground ? `${char.characterBackground.substring(0, 60)}...` : 'N/A'}
                  </p>
                </div>
                
                {char.stats && (
                  <ul className="character-item-stats">
                    {Object.entries(char.stats).map(([stat, value]) => (
                      <li key={stat}>{stat.substring(0, 3)}: {value}</li>
                    ))}
                  </ul>
                )}
                {isSelected && <div className="selection-indicator">✓</div>}
              </li>
            );
          })}
        </ul>
      )}

      <div className="form-actions hero-selection-actions">
        {selectionError && <p className="error-message">{selectionError}</p>}
        <button onClick={handleBack} className="back-button">
          Back to Settings
        </button>
        <button onClick={handleNext} className="next-button" disabled={selectedHeroes.length === 0 || selectedHeroes.length > 4}>
          Start Game with Selected Heroes
        </button>
      </div>
    </div>
  );
};

export default HeroSelection;
