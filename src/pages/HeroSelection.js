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
import { PREGEN_HEROES, buildPregenHero } from '../data/pregenHeroes';

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
  const [addingPregen, setAddingPregen] = useState(false);
  const [justAddedId, setJustAddedId] = useState(null);

  // Step guard: party selection is only meaningful for a launched campaign. With
  // no launch context in the router state (deep link, stale bookmark), starting
  // from here would enter /game with no settings/map/session, so send the player
  // to choose an adventure instead. The create-hero detour keeps its context via
  // the launchState round trip below.
  const hasLaunchContext = Boolean(gameSessionId || generatedMap);
  useEffect(() => {
    if (!hasLaunchContext) {
      navigate('/new-game', { replace: true });
    }
  }, [hasLaunchContext, navigate]);

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

    // Fetch unconditionally on mount (mirrors AllHeroes). Fetching only when the
    // shared HeroContext was empty could leave a just-created hero missing until a
    // full reload; the cached context list still renders immediately below, so the
    // refetch never causes a blank flash.
    fetchHeroes();
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
    navigate('/hero-creation', {
      state: {
        returnToHeroSelection: true,
        settingsData: settings,
        // Round-tripped through HeroCreation -> HeroSummary and spread back into
        // this page's state on return, so the launched campaign survives the detour.
        launchState: { generatedMap, worldSeed, gameSessionId, townMapsCache },
      },
    });
  };

  // Pregens already in the roster (matched by name) are hidden rather than
  // disabled, so the strip never offers a duplicate.
  const availablePregens = PREGEN_HEROES.filter(
    (p) => !heroes.some((h) => h.heroName === p.heroName)
  );

  // One click: build the hero, put it in the roster and the party immediately,
  // then persist. Mirrors HeroSummary's optimistic order (context first, server
  // after; a failed server save keeps the local copy usable for this game).
  const handleAddPregen = async (pregen) => {
    if (addingPregen) return;
    setSelectionError('');
    const hero = buildPregenHero(pregen);
    setAddingPregen(true);
    setHeroes((prev) => [...prev, hero]);
    setSelectedHeroes((prev) => (prev.length < 4 ? [...prev, hero] : prev));
    setJustAddedId(hero.heroId);
    try {
      await heroesApi.create(hero);
    } catch (error) {
      logger.error('Error saving ready-made hero:', error);
      setSelectionError(
        `${hero.heroName} joined your party but could not be saved to your roster. You can still start the game.`
      );
    } finally {
      setAddingPregen(false);
    }
  };

  const renderPregenCard = (pregen, index, compact) => (
    <button
      key={pregen.heroName}
      type="button"
      className={`pregen-card${compact ? ' compact' : ''}`}
      onClick={() => handleAddPregen(pregen)}
      disabled={addingPregen}
      title={`${pregen.heroClass}: ${pregen.tagline}`}
      style={compact ? undefined : { '--pregen-delay': `${index * 0.7}s` }}
    >
      <span className="pregen-portrait">
        <img
          src={resolveProfilePicture(pregen.profilePicture)}
          alt=""
          loading="lazy"
          width={compact ? 64 : 128}
          height={compact ? 64 : 128}
        />
      </span>
      <span className="pregen-text">
        <span className="pregen-name">{pregen.heroName}</span>
        <span className="pregen-sub">
          {compact ? pregen.heroClass : `${pregen.heroClass} · ${pregen.tagline}`}
        </span>
      </span>
    </button>
  );

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

    // Block starting a game with a structurally invalid character. Point-buy and
    // the name allowlist are not enforced here so heroes made before those rules
    // aren't locked out.
    const invalidHeroes = selectedHeroes.filter(
      (hero) => !validateHero(hero, { enforcePointBuy: false, enforceNameRules: false }).valid
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

  // Redirecting (no launch context): render nothing rather than a flash of the page.
  if (!hasLaunchContext) return null;

  return (
    <div className="page-container hero-selection-page">
      {/* Step 2 of the adventure-first journey. Step 1 (Choose Adventure) is
          always truthfully done here: the launch-context guard above bounces any
          entry that didn't come through New Game. */}
      <OnboardingSteps currentStep={2} completedSteps={[1]} />
      <div className="hero-selection-top-nav">
        <button onClick={handleBack} className="back-button">
          ← Back to Story Setup
        </button>
      </div>
      <div className="page-header">
        <div className="page-header-titles">
          <h2>Select Your Party</h2>
          <p className="selection-instructions">Click a hero to add them to your party — choose 1 to 4.</p>
          {/* States the real mechanics (support bonuses vs the shared XP pot)
              rather than nudging a "right" party size. */}
          <p className="party-size-tip">
            Bigger parties fight stronger together, but share the XP. A lone hero levels fastest and risks the most.
          </p>
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
        <div className="pregen-band">
          <h3 className="pregen-band-title">⚔ Choose a ready-made hero to begin</h3>
          <div className="pregen-grid">
            {availablePregens.map((p, i) => renderPregenCard(p, i, false))}
          </div>
          <p className="pregen-band-note">
            Ready to play, and fully yours to edit later. Or{' '}
            <button type="button" className="pregen-link-button" onClick={handleCreateHero}>
              craft your own from scratch
            </button>
            .
          </p>
        </div>
      ) : (
        <ul className="all-heroes-list hero-selection-list">
          {heroes.map((hero) => {
            const isSelected = selectedHeroes.some(h => h.heroId === hero.heroId);
            const atLimit = selectedHeroes.length >= 4 && !isSelected;
            return (
              <li
                key={hero.heroId}
                className={`hero-item ${isSelected ? 'selected' : ''}${atLimit ? ' at-limit' : ''}${hero.heroId === justAddedId ? ' just-added' : ''}`}
                onAnimationEnd={() => { if (hero.heroId === justAddedId) setJustAddedId(null); }}
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

      {heroes.length > 0 && availablePregens.length > 0 && (
        <div className="pregen-strip">
          <span className="pregen-strip-label">Ready-made heroes:</span>
          {availablePregens.map((p, i) => renderPregenCard(p, i, true))}
        </div>
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
