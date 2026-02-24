// HeroSelection.js

import React, { useState, useContext, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import HeroContext from '../contexts/HeroContext';
import SettingsContext from '../contexts/SettingsContext';
import { initializeHP } from '../utils/healthSystem';
import { heroesApi } from '../services/heroesApi';
import { createLogger } from '../utils/logger';

const logger = createLogger('hero-selection');

const HeroSelection = () => {
  const { state } = useLocation();
  const { heroes, setHeroes } = useContext(HeroContext);
  const { settings } = useContext(SettingsContext);
  const navigate = useNavigate();

  // Get generated map from navigation state
  const generatedMap = state?.generatedMap;
  const worldSeed = state?.worldSeed;
  const gameSessionId = state?.gameSessionId;

  const [selectedHeroes, setSelectedHeroes] = useState([]);
  const [selectionError, setSelectionError] = useState('');

  // Fetch characters from database on component mount
  useEffect(() => {
    const fetchHeroes = async () => {
      try {
        const data = await heroesApi.list();
        setHeroes(data);
      } catch (error) {
        logger.error('Error fetching heroes:', error);
        setSelectionError('Failed to load heroes. Please ensure the server is running.');
      }
    };

    // Only fetch if heroes array is empty
    if (heroes.length === 0) {
      fetchHeroes();
    }
  }, [setHeroes]);

  const toggleHeroSelection = (hero) => {
    setSelectionError('');
    setSelectedHeroes((prevSelected) => {
      const isSelected = prevSelected.some(h => h.heroId === hero.heroId);
      if (isSelected) {
        return prevSelected.filter((h) => h.heroId !== hero.heroId);
      } else {
        if (prevSelected.length < 4) {
          return [...prevSelected, hero];
        } else {
          setSelectionError('You can select a maximum of 4 heroes.');
          return prevSelected;
        }
      }
    });
  };

  const handleCreateHero = () => {
    navigate('/hero-creation', { state: { returnToHeroSelection: true, settingsData: settings } });
  };

  const handleNext = () => {
    if (selectedHeroes.length === 0 || selectedHeroes.length > 4) {
      setSelectionError('Please select between 1 and 4 heroes to start.');
      return;
    }
    setSelectionError('');

    // Initialize HP for all selected heroes
    const heroesWithHP = selectedHeroes.map(hero => initializeHP(hero));

    navigate('/game', { state: { selectedHeroes: heroesWithHP, generatedMap, worldSeed, gameSessionId } });

  };

  const handleBack = () => {
    navigate('/game-settings');
  };

  return (
    <div className="page-container hero-selection-page">
      <div className="page-header">
        <h2>Select Your Party (1-4 Heroes)</h2>
        <button onClick={handleCreateHero} className="create-new-button">
          + Create New Hero
        </button>
      </div>

      {heroes.length === 0 ? (
        <p>No heroes available. Please create heroes first.</p>
      ) : (
        <ul className="all-heroes-list hero-selection-list">
          {heroes.map((hero) => {
            const isSelected = selectedHeroes.some(h => h.heroId === hero.heroId);
            return (
              <li
                key={hero.heroId}
                className={`hero-item ${isSelected ? 'selected' : ''}`}
                onClick={() => toggleHeroSelection(hero)}
              >
                <div className="hero-item-image">
                  <img src={hero.profilePicture} alt={`${hero.heroName}'s profile`} />
                </div>

                <div className="hero-item-info">
                  <h3>{hero.heroName}</h3>
                  <p>
                    <span className="detail-label">Level:</span> {hero.heroLevel} {hero.heroClass}
                  </p>
                  <p>
                    <span className="detail-label">Race:</span> {hero.heroRace}
                  </p>
                  <p>
                    <span className="detail-label">Gender:</span> {hero.heroGender || 'N/A'}
                  </p>
                  <p>
                    <span className="detail-label">Alignment:</span> {hero.heroAlignment || 'N/A'}
                  </p>
                  <p>
                    <span className="detail-label">BG:</span> {hero.heroBackground ? `${hero.heroBackground.substring(0, 60)}...` : 'N/A'}
                  </p>
                </div>

                {hero.stats && (
                  <ul className="hero-item-stats">
                    {Object.entries(hero.stats).map(([stat, value]) => (
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
