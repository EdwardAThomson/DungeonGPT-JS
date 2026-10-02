// HeroSummary.js

import React, { useContext, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
// import { downloadJSONFile } from "../utils/fileHelper"; // unused while Download Hero is hidden
import HeroContext from "../contexts/HeroContext";
import { useAuth } from "../contexts/AuthContext";
import { calculateMaxHP } from "../utils/healthSystem";
import { heroesApi } from "../services/heroesApi";
import { createLogger } from "../utils/logger";
import { resolveProfilePicture } from "../utils/assetHelper";
import OnboardingSteps from "./OnboardingSteps";
import RdDialog from './RdDialog';
import { validateHero } from "../game/heroValidation";
import { calculateModifier } from "../utils/rules";
import "../styles/redesign.css";

const logger = createLogger('hero-summary');

const HeroSummary = () => {
  const { heroes, setHeroes } = useContext(HeroContext);
  const { user } = useAuth();
  const { state } = useLocation();
  const newHero = state?.newCharacter;
  const [feedbackModal, setFeedbackModal] = useState(null);

  const navigate = useNavigate();

  // Check if the hero exists in the context (means we are editing)
  const isEditing = heroes.some(hero => hero.heroId === newHero?.heroId);

  const handleSaveOrUpdate = async () => {
    if (!newHero) return; // Safety check

    // Block saving an invalid character. The point-buy budget is enforced only
    // for new characters; editing an existing one stays lenient (structural only).
    const { valid, reasons } = validateHero(newHero, { enforcePointBuy: !isEditing });
    if (!valid) {
      setFeedbackModal({
        title: "Character Not Ready",
        message: `This character can't be saved yet: ${reasons.join(' ')}`,
      });
      return;
    }

    // Logged-out players save to a browser-local roster (heroesApi routes there
    // automatically); they're imported to the account on sign-in.
    const isUpdate = isEditing;
    // Update local context/state first for immediate UI feedback
    let updatedHeroes;
    if (isUpdate) {
      updatedHeroes = heroes.map(hero =>
        hero.heroId === newHero.heroId ? newHero : hero
      );
    } else {
      updatedHeroes = [...heroes, newHero];
    }
    setHeroes(updatedHeroes); // Update context

    logger.debug(isUpdate ? "Updating hero..." : "Adding hero....", newHero);

    // Attempt to save/update on the server
    try {
      const result = isUpdate
        ? await heroesApi.update(newHero.heroId, newHero)
        : await heroesApi.create(newHero);

      logger.debug(`Hero ${isUpdate ? 'updated' : 'added'} in database. Response:`, result);
      const localNote = !user
        ? ' Saved only in this browser. Sign in free to keep your heroes across devices.'
        : '';
      setFeedbackModal({
        title: isUpdate ? "Hero Updated" : "Hero Added",
        message: `Hero ${isUpdate ? 'updated' : 'added'} successfully.${localNote}`,
        onConfirm: () => handleProgress(updatedHeroes),
        // Captured pre-save: the live isEditing check flips true once the new
        // hero lands in the roster, so it can't be used at modal render time.
        showStartAdventure: !isUpdate && !state?.returnToHeroSelection,
      });
    } catch (error) {
      logger.error(`Error ${isUpdate ? 'updating' : 'adding'} hero in DB:`, error);
      setFeedbackModal({
        title: "Save Warning",
        message: `Failed to ${isUpdate ? 'update' : 'add'} hero in database: ${error.message}. Changes were applied locally.`,
        onConfirm: () => handleProgress(updatedHeroes),
        showStartAdventure: !isUpdate && !state?.returnToHeroSelection,
      });
    }
  };

  const handleProgress = async (currentHeroes) => { // Accept heroes array
    // This function only handles navigation now
    const finalHeroes = currentHeroes || heroes; // Use passed array or context
    if (state?.returnToHeroSelection) {
      // Spread the launch context back to top level: HeroSelection reads
      // generatedMap/worldSeed/gameSessionId/townMapsCache off its router state,
      // and its step guard bounces to /new-game when they're missing. The
      // just-created hero joins the restored party selection.
      const launchState = state.launchState || {};
      const selectedHeroIds = [
        ...(launchState.selectedHeroIds || []),
        ...(newHero?.heroId ? [newHero.heroId] : []),
      ];
      navigate('/hero-selection', { state: { heroes: finalHeroes, settingsData: state.settingsData, ...launchState, selectedHeroIds } });
    } else {
      // Flag a freshly-added hero so the roster can spotlight the next step.
      navigate("/all-heroes", { state: { justAdded: !isEditing } });
    }
  };

  if (!newHero) {
    return <div className="rd-page rd-app"><section className="band"><div className="wrap"><p className="app-status">No hero data found. Please create a hero first.</p></div></section></div>;
  }

  const closeFeedbackModal = () => {
    const onConfirm = feedbackModal?.onConfirm;
    setFeedbackModal(null);
    if (onConfirm) onConfirm();
  };

  const STAT_ORDER = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'];
  const fmtMod = (score) => {
    const m = calculateModifier(score);
    return m >= 0 ? `+${m}` : `${m}`;
  };
  const backToEdit = () => {
    navigate("/hero-creation", {
      state: {
        newCharacter: newHero,
        editing: true,
        // Keep the hero-selection return flow alive through an edit loop.
        returnToHeroSelection: state?.returnToHeroSelection,
        settingsData: state?.settingsData,
        launchState: state?.launchState,
      },
    });
  };

  return (
    <div className="rd-page rd-app hero-review">
      <section className="page-header app-header">
        <div className="wrap">
          {/* Journey bar only when this summary is part of the game-start flow (came from
              party selection); standalone crafting shows no bar, matching HeroCreation. */}
          {!isEditing && state?.returnToHeroSelection && (
            <OnboardingSteps currentStep={2} completedSteps={[1]} />
          )}
          <p className="eyebrow">{isEditing ? 'Review changes' : 'Review your hero'}</p>
          <h1>Ready to {isEditing ? 'save' : 'join the roster'}?</h1>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <article className="review-card">
            <div className="review-portrait">
              <img src={resolveProfilePicture(newHero.profilePicture)} alt={`${newHero.heroName}'s portrait`} loading="lazy" />
            </div>
            <div className="review-body">
              <h2>{newHero.heroName}</h2>
              <p className="roster-sub">Level {newHero.heroLevel} {newHero.heroClass}</p>
              <dl className="review-facts">
                <div><dt>Alignment</dt><dd>{newHero.heroAlignment}</dd></div>
                <div><dt>Race</dt><dd>{newHero.heroRace}</dd></div>
                {newHero.stats && <div><dt>Max HP</dt><dd>{newHero.maxHP || calculateMaxHP(newHero)}</dd></div>}
              </dl>
              {newHero.heroBackground && <p className="review-bg">{newHero.heroBackground}</p>}
              {newHero.stats && (
                <dl className="roster-stats review-stats">
                  {STAT_ORDER.filter((k) => newHero.stats[k] != null).map((k) => (
                    <div key={k}>
                      <dt>{k.substring(0, 3)}</dt>
                      <dd>{newHero.stats[k]}<small>{fmtMod(newHero.stats[k])}</small></dd>
                    </div>
                  ))}
                </dl>
              )}
              <div className="review-actions">
                <button type="button" onClick={backToEdit} className="btn btn-ghost">Back (Edit)</button>
                {/* Download Hero JSON: hidden for now (unused); re-enable with downloadJSONFile if requested. */}
                <button type="button" onClick={handleSaveOrUpdate} className="btn btn-primary" data-tour="save-hero">
                  {state?.returnToHeroSelection
                    ? (isEditing ? "Save Changes & Continue" : "Add & Continue to Party")
                    : (isEditing ? "Save Changes" : "Add to Roster")}
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>

      {feedbackModal && (
        <RdDialog
          title={feedbackModal.title}
          tone="success"
          onClose={closeFeedbackModal}
          actions={<>
            {/* Standalone creation ends at the roster; offer the jump into play so
                hero-first crafting isn't a dead end. The in-flow path
                (returnToHeroSelection) already continues to the party. */}
            {feedbackModal.showStartAdventure && (
              <button type="button" className="btn btn-ghost" onClick={() => navigate('/new-game')}>Start an Adventure</button>
            )}
            <button type="button" className="btn btn-primary" onClick={closeFeedbackModal}>Continue</button>
          </>}
        >
          <p>{feedbackModal.message}</p>
        </RdDialog>
      )}

    </div>
  );
};

export default HeroSummary;
