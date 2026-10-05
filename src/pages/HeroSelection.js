// HeroSelection.js
// "Choose your party" (step 2 of New Game), on the redesign primitives (#82). One grid of
// roster heroes plus ready-made heroes; a sticky party bar with four slots and the Start
// button stays in reach while scrolling. Styles: .rd-page / .rd-app in redesign.css.

import React, { useState, useContext, useEffect, useRef } from 'react';
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
import { calculateModifier } from '../utils/rules';
import '../styles/redesign.css';

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
        // this page's state on return, so the launched campaign survives the
        // detour. selectedHeroIds restores the party picked before leaving
        // (HeroSummary appends the just-created hero).
        launchState: {
          generatedMap,
          worldSeed,
          gameSessionId,
          townMapsCache,
          selectedHeroIds: selectedHeroes.map((h) => h.heroId),
        },
      },
    });
  };

  // Restore the party picked before a create-hero detour (ids ride launchState
  // and are spread back onto this page's state). One-shot once the roster has
  // loaded; capped at the 4-hero limit like manual selection.
  const partyRestoredRef = useRef(false);
  useEffect(() => {
    if (partyRestoredRef.current) return;
    const ids = state?.selectedHeroIds;
    if (!ids?.length || heroes.length === 0) return;
    partyRestoredRef.current = true;
    setSelectedHeroes(heroes.filter((h) => ids.includes(h.heroId)).slice(0, 4));
  }, [heroes, state]);

  // Preselect the last-launched party (#88a): on a fresh entry (no create-hero
  // detour restore to honour), quietly re-pick the heroes used last time,
  // filtered to those still in the roster and capped at 4. Same scan-and-adjust
  // intent as the New Game "last played" template preselect — silent, and
  // everything stays editable. A stale/deleted id just drops out; an empty
  // result leaves the party blank. One-shot once the roster has loaded.
  const lastPartyPreselectedRef = useRef(false);
  useEffect(() => {
    if (lastPartyPreselectedRef.current) return;
    if (state?.selectedHeroIds?.length) return; // detour restore owns the party
    if (heroes.length === 0) return;
    lastPartyPreselectedRef.current = true;
    let ids = null;
    try {
      ids = JSON.parse(localStorage.getItem('dungeongpt:lastParty') || 'null');
    } catch (e) {
      ids = null;
    }
    if (!Array.isArray(ids) || ids.length === 0) return;
    const restored = heroes.filter((h) => ids.includes(h.heroId)).slice(0, 4);
    if (restored.length > 0) setSelectedHeroes(restored);
  }, [heroes, state]);

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


  // Level warning: the campaign's authored band vs the CHOSEN party (soft warning
  // only, Start stays enabled; engine minLevel gates already protect deep
  // milestones). Same honesty class as the continue-legend picker: when the
  // campaign's opening milestone is ungated we say the opening is within reach,
  // otherwise that it may be deadly.
  const levelNotice = getLevelFitNotice(settings || {}, selectedHeroes);

  const levelWarningBanner = levelNotice && (
    <div className="app-callout warning" role="note">
      <span>
        <b>Level warning.</b> This adventure is made for level {levelNotice.levelRange[0]}-{levelNotice.levelRange[1]}; your party is level {levelNotice.partyLevel}.{' '}
        {levelNotice.openingAccessible
          ? 'The opening steps are within reach, and rumours in nearby towns will strengthen you for the deeper chapters.'
          : 'The opening may be deadly, but you may still try.'}
      </span>
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

    // Remember this party so the next new game preselects it (#88a). Ids only;
    // resolved against the live roster on the next visit, so a since-deleted hero
    // just drops out. Best-effort — a storage failure never blocks the launch.
    try {
      localStorage.setItem('dungeongpt:lastParty', JSON.stringify(selectedHeroes.map((h) => h.heroId)));
    } catch (e) {
      // ignore (private mode / quota); preselect simply won't populate next time
    }

    // Initialize HP for all selected heroes
    const heroesWithHP = selectedHeroes.map(hero => initializeHP(hero));

    navigate('/game', { state: { selectedHeroes: heroesWithHP, generatedMap, worldSeed, gameSessionId, townMapsCache } });

  };

  const handleBack = () => {
    navigate('/new-game');
  };

  // Redirecting (no launch context): render nothing rather than a flash of the page.
  if (!hasLaunchContext) return null;

  const STAT_ORDER = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'];
  const fmtMod = (score) => {
    const m = calculateModifier(score);
    return m >= 0 ? `+${m}` : `${m}`;
  };
  const campaignName = settings?.templateName;
  const partyFull = selectedHeroes.length >= 4;

  return (
    <div className="rd-page rd-app party-page">
      <section className="page-header app-header">
        <div className="wrap">
          {/* Step 2 of the adventure-first journey. Step 1 (Choose Adventure) is always
              truthfully done here: the launch-context guard above bounces any entry that
              didn't come through New Game. Step 2 ticks to done from real state, the moment
              a hero is in the party (#88b). */}
          <OnboardingSteps currentStep={2} completedSteps={selectedHeroes.length > 0 ? [1, 2] : [1]} />
          <button type="button" className="crumb crumb-button" onClick={handleBack}>← Back to story setup</button>
          <p className="eyebrow">Step 2 · Choose your party</p>
          <div className="app-header-row">
            <div>
              <h1>Who answers the call?</h1>
              <p className="lede">
                Pick one to four heroes{campaignName ? <> for <b className="campaign-name">{campaignName}</b></> : null}. Click a card to add or remove it.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          {levelWarningBanner}

          <div className="party-layout">
          <ul className="roster-grid party-grid">
            {heroes.map((hero) => {
              const isSelected = selectedHeroes.some(h => h.heroId === hero.heroId);
              const atLimit = partyFull && !isSelected;
              return (
                <li
                  key={hero.heroId}
                  className={`roster-card pickable ${isSelected ? 'selected' : ''}${atLimit ? ' at-limit' : ''}${hero.heroId === justAddedId ? ' just-added' : ''}`}
                  onAnimationEnd={() => { if (hero.heroId === justAddedId) setJustAddedId(null); }}
                  onClick={() => toggleHeroSelection(hero)}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-label={`${hero.heroName}, level ${hero.heroLevel} ${hero.heroClass}${isSelected ? ', in party' : ''}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleHeroSelection(hero);
                    }
                  }}
                >
                  <div className="roster-portrait">
                    <img src={resolveProfilePicture(hero.profilePicture)} alt="" loading="lazy" />
                    {isSelected && <span className="pick-check" aria-hidden="true">✓</span>}
                  </div>
                  <div className="roster-body">
                    <h3>{hero.heroName}</h3>
                    <p className="roster-sub">Level {hero.heroLevel} {hero.heroClass}</p>
                    {hero.stats && (
                      <dl className="roster-stats">
                        {STAT_ORDER.filter((k) => hero.stats[k] != null).map((k) => (
                          <div key={k}>
                            <dt>{k.substring(0, 3)}</dt>
                            <dd>{hero.stats[k]}<small>{fmtMod(hero.stats[k])}</small></dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    <span className={`pick-state${isSelected ? ' on' : ''}`}>
                      {isSelected ? 'In party' : (atLimit ? 'Party full' : 'Add to party')}
                    </span>
                  </div>
                </li>
              );
            })}

            {/* Ready-made heroes not yet on the roster, in the same grid: one click adds
                them to the roster AND the party. Pregens already on the roster (matched
                by name) are hidden rather than disabled, so none is offered twice. */}
            {availablePregens.map((p) => (
              <li key={p.heroName} className={`roster-card pickable ready${partyFull ? ' at-limit' : ''}`}>
                <button type="button" className="pick-ready" onClick={() => handleAddPregen(p)} disabled={addingPregen || partyFull}>
                  <div className="roster-portrait">
                    <img src={resolveProfilePicture(p.profilePicture)} alt="" loading="lazy" />
                    <span className="price-badge price-badge-muted">Ready-made</span>
                  </div>
                  <div className="roster-body">
                    <h3>{p.heroName}</h3>
                    <p className="roster-sub">Level 1 {p.heroClass}</p>
                    <span className="pick-state">{partyFull ? 'Party full' : 'Add to party'}</span>
                  </div>
                </button>
              </li>
            ))}

          </ul>

          {/* Create-a-hero lives in its own right-hand column (sticky on desktop, above
              the grid on phones), so it never ends up below a long roster. */}
          <aside className="party-create" aria-label="Create a new hero">
            <div className="roster-card roster-new">
              <button type="button" onClick={handleCreateHero}>
                <span className="plus" aria-hidden="true">+</span>
                <span>Create a hero</span>
                <small>Your party is kept while you're away</small>
              </button>
            </div>
          </aside>
          </div>
        </div>
      </section>

      {/* Sticky party dock (not .party-bar: that is the in-game sidebar): the four slots, any error, and the one Start button. */}
      <div className="party-dock" role="region" aria-label="Your party">
        <div className="wrap party-dock-inner">
          <ol className="party-slots">
            {[0, 1, 2, 3].map((i) => {
              const h = selectedHeroes[i];
              return h ? (
                <li key={h.heroId} className="slot filled">
                  <button type="button" onClick={() => toggleHeroSelection(h)} title={`Remove ${h.heroName}`} aria-label={`Remove ${h.heroName} from the party`}>
                    <img src={resolveProfilePicture(h.profilePicture)} alt="" />
                  </button>
                </li>
              ) : (
                <li key={`empty-${i}`} className="slot" aria-hidden="true" />
              );
            })}
          </ol>
          <div className="party-dock-text">
            {selectionError
              ? <span className="party-error" role="alert">{selectionError}</span>
              : <span><b>{selectedHeroes.length} of 4</b> {selectedHeroes.length ? selectedHeroes.map((h) => h.heroName.split(' ')[0]).join(', ') : 'Pick at least one hero'}</span>}
          </div>
          <button onClick={handleNext} className="btn btn-primary party-start" disabled={selectedHeroes.length === 0 || selectedHeroes.length > 4} data-tour="start-game">
            Start game
          </button>
        </div>
      </div>
    </div>
  );
};

export default HeroSelection;
