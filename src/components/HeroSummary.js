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
import { validateHero } from "../game/heroValidation";

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
        ? ' Saved on this device — sign in to keep your heroes across devices.'
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
      // and its step guard bounces to /new-game when they're missing.
      navigate('/hero-selection', { state: { heroes: finalHeroes, settingsData: state.settingsData, ...(state.launchState || {}) } });
    } else {
      // Flag a freshly-added hero so the roster can spotlight the next step.
      navigate("/all-heroes", { state: { justAdded: !isEditing } });
    }
  };

  if (!newHero) {
    return <p className="page-container">No hero data found. Please create a hero first.</p>;
  }

  const closeFeedbackModal = () => {
    const onConfirm = feedbackModal?.onConfirm;
    setFeedbackModal(null);
    if (onConfirm) onConfirm();
  };

  return (
    // Use a specific container class
    <div className="summary-container">
      {/* Journey bar only when this summary is part of the game-start flow (came
          from party selection); standalone crafting shows no bar, matching
          HeroCreation. */}
      {!isEditing && state?.returnToHeroSelection && (
        <OnboardingSteps currentStep={2} completedSteps={[1]} />
      )}
      {/* Removed main h2, using name as header */}
      <div className="summary-content">
        {/* Image Column */}
        <div className="summary-image">
          <img
            src={resolveProfilePicture(newHero.profilePicture)}
            alt={`${newHero.heroName}'s profile`}
            loading="lazy"
            width="300"
            height="300"
          />
        </div>

        {/* Details Column */}
        <div className="summary-details">
          <h2>{newHero.heroName}</h2>
          <div className="summary-info-grid">
            <p className="kv-row">
              <span className="detail-label">Level:</span> {newHero.heroLevel}
            </p>
            <p className="kv-row">
              <span className="detail-label">Class:</span> {newHero.heroClass}
            </p>
            <p className="kv-row">
              <span className="detail-label">Race:</span> {newHero.heroRace}
            </p>
            <p className="kv-row">
              <span className="detail-label">Alignment:</span> {newHero.heroAlignment}
            </p>
          </div>
          <p className="kv-row summary-background">
            <span className="detail-label">Background:</span> {newHero.heroBackground}
          </p>
          {/* Stats List */}
          {newHero.stats && (
            <div className="summary-stats-list">
              <h4>Stats:</h4>
              <ul>
                {Object.entries(newHero.stats).map(([stat, value]) => (
                  <li key={stat}>
                    {stat}: {value}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {newHero.stats && (
            <p className="kv-row summary-max-hp">
              <span className="detail-label">Max HP:</span> {newHero.maxHP || calculateMaxHP(newHero)}
            </p>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="summary-actions">
        {/* Back Button - always takes you back to edit */}
        <button
          onClick={() => {
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
          }}
          className="summary-action-btn summary-back-btn"
        >
          Back (Edit)
        </button>
        {/* Save/Add Button - Text changes based on isEditing */}
        <button onClick={handleSaveOrUpdate} className="summary-action-btn summary-primary-btn" data-tour="save-hero">
          {state?.returnToHeroSelection
            ? (isEditing ? "Save Changes & Continue" : "Add & Continue to Party")
            : (isEditing ? "Save Changes" : "Add to Roster")}
        </button>
        {/* Download Button — hidden for now (unused); re-enable if requested.
        <button
          onClick={() => downloadJSONFile(`${newHero.heroName}-hero.json`, newHero)}
          className="summary-action-btn summary-download-btn"
        >
          Download Hero JSON
        </button>
        */}
      </div>

      {feedbackModal && (
        <div className="modal-overlay" onClick={closeFeedbackModal}>
          <div className="modal-content summary-feedback-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{feedbackModal.title}</h3>
            <p>{feedbackModal.message}</p>
            <div className="summary-feedback-actions">
              {/* Standalone creation ends at the Hall of Heroes; offer the jump
                  into play so hero-first crafting isn't a dead end. The in-flow
                  path (returnToHeroSelection) already continues to the party. */}
              {feedbackModal.showStartAdventure && (
                <button
                  className="modal-close-button summary-start-adventure-btn"
                  onClick={() => navigate('/new-game')}
                >
                  ⚔️ Start an Adventure
                </button>
              )}
              <button className="modal-close-button" onClick={closeFeedbackModal}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default HeroSummary;
