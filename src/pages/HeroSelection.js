// HeroSelection.js

import React, { useState, useContext, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import HeroContext from '../contexts/HeroContext';
import SettingsContext from '../contexts/SettingsContext';
import { initializeHP } from '../utils/healthSystem';
import { heroesApi } from '../services/heroesApi';
import { resolveProfilePicture } from '../utils/assetHelper';
import { createLogger } from '../utils/logger';
import OnboardingSteps from '../components/OnboardingSteps';
import { validateHero } from '../game/heroValidation';
import { getLevelFitNotice } from '../game/campaignChain';

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
  const townMapsCache = state?.townMapsCache;

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

  // Level warning: the campaign's authored band vs the CHOSEN party (soft warning
  // only, Start stays enabled; engine minLevel gates already protect deep
  // milestones). Same honesty class as the continue-legend picker: when the
  // campaign's opening milestone is ungated we say the opening is within reach,
  // otherwise that it may be deadly.
  const levelNotice = getLevelFitNotice(settings || {}, selectedHeroes);

  const levelWarningBanner = levelNotice && (
    <div style={{
      background: 'rgba(255, 152, 0, 0.15)',
      border: '1px solid #ff9800',
      borderRadius: '8px',
      padding: '12px 16px',
      marginBottom: '16px',
      color: 'var(--text)',
      fontSize: '0.9rem',
      width: '100%',
      boxSizing: 'border-box',
    }}>
      <strong style={{ color: '#ff9800' }}>Level Warning:</strong>{' '}
      This adventure is made for Lv {levelNotice.levelRange[0]}-{levelNotice.levelRange[1]}; your party is Lv {levelNotice.partyLevel}.{' '}
      {levelNotice.openingAccessible
        ? 'The opening steps are within your reach, and rumours in nearby towns will strengthen you for the deeper chapters.'
        : 'The opening may be deadly, but you may still try.'}
    </div>
  );

  const handleNext = () => {
    if (selectedHeroes.length === 0 || selectedHeroes.length > 4) {
      setSelectionError('Please select between 1 and 4 heroes to start.');
      return;
    }

    // Block starting a game with a structurally invalid character. Point-buy is
    // not enforced here so heroes made before that rule aren't locked out.
    const invalidHeroes = selectedHeroes.filter(
      (hero) => !validateHero(hero, { enforcePointBuy: false }).valid
    );
    if (invalidHeroes.length > 0) {
      const names = invalidHeroes.map((h) => h.heroName || 'Unnamed hero').join(', ');
      setSelectionError(`These heroes have an incomplete character sheet and can't start a game: ${names}. Edit them to fix.`);
      return;
    }
    setSelectionError('');

    // Initialize HP for all selected heroes
    const heroesWithHP = selectedHeroes.map(hero => initializeHP(hero));

    navigate('/game', { state: { selectedHeroes: heroesWithHP, generatedMap, worldSeed, gameSessionId, townMapsCache } });

  };

  const handleBack = () => {
    navigate('/new-game');
  };

  return (
    <div className="page-container hero-selection-page">
      {/* This page is reached AFTER choosing the adventure (Back goes to /new-game),
          so step 2 is done and the player is on the final step: marking step 2 as
          active here read as "you still need to choose a quest" (playtest 2026-07-06). */}
      <OnboardingSteps currentStep={3} completedSteps={heroes.length > 0 ? [1, 2] : [2]} />
      <div className="hero-selection-top-nav">
        <button onClick={handleBack} className="back-button">
          ← Back to Story Setup
        </button>
      </div>
      <div className="page-header">
        <div className="page-header-titles">
          <h2>Select Your Party</h2>
          <p className="selection-instructions">Click a hero to add them to your party — choose 1 to 4.</p>
        </div>
        <div className="page-header-actions">
          <button onClick={handleCreateHero} className="create-new-button">
            New Hero
          </button>
          <button onClick={handleNext} className="next-button" disabled={selectedHeroes.length === 0 || selectedHeroes.length > 4} data-tour="start-game">
            Start Game ({selectedHeroes.length})
          </button>
        </div>
      </div>

      {levelWarningBanner}

      {heroes.length > 0 && (
        <div className="party-counter">
          Party: <span className={selectedHeroes.length > 0 ? 'count-active' : ''}>{selectedHeroes.length}</span> of 4 selected
        </div>
      )}

      {heroes.length === 0 ? (
        <p>No heroes available. Please create heroes first.</p>
      ) : (
        <ul className="all-heroes-list hero-selection-list">
          {heroes.map((hero) => {
            const isSelected = selectedHeroes.some(h => h.heroId === hero.heroId);
            const atLimit = selectedHeroes.length >= 4 && !isSelected;
            return (
              <li
                key={hero.heroId}
                className={`hero-item ${isSelected ? 'selected' : ''}${atLimit ? ' at-limit' : ''}`}
                onClick={() => toggleHeroSelection(hero)}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleHeroSelection(hero);
                  }
                }}
              >
                <div className="hero-item-image">
                  <img 
                    src={resolveProfilePicture(hero.profilePicture)}
                    alt={`${hero.heroName}'s profile`}
                    loading="lazy"
                    width="150"
                    height="150"
                  />
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

                <div className={`hero-select-cta ${isSelected ? 'is-selected' : ''}`}>
                  {isSelected ? '✓ In party — click to remove' : (atLimit ? 'Party full (max 4)' : '➕ Add to party')}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="form-actions hero-selection-actions">
        {levelWarningBanner}
        {selectionError && <p className="error-message">{selectionError}</p>}
        <button onClick={handleBack} className="back-button">
          ← Back to Story Setup
        </button>
        <button onClick={handleNext} className="next-button" disabled={selectedHeroes.length === 0 || selectedHeroes.length > 4}>
          Start Game with Selected Heroes
        </button>
      </div>
    </div>
  );
};

export default HeroSelection;
