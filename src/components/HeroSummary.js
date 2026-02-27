// HeroSummary.js

import React, { useContext, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { downloadJSONFile } from "../utils/fileHelper";
import HeroContext from "../contexts/HeroContext";
import { useAuth } from "../contexts/AuthContext";
import { calculateMaxHP } from "../utils/healthSystem";
import { heroesApi } from "../services/heroesApi";
import { createLogger } from "../utils/logger";

const logger = createLogger('hero-summary');

const HeroSummary = () => {
  const { heroes, setHeroes } = useContext(HeroContext);
  const { user } = useAuth();
  const { state } = useLocation();
  const newHero = state?.newCharacter;
  const [feedbackModal, setFeedbackModal] = useState(null);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const navigate = useNavigate();

  // Check if the hero exists in the context (means we are editing)
  const isEditing = heroes.some(hero => hero.heroId === newHero?.heroId);

  const handleSaveOrUpdate = async () => {
    if (!newHero) return; // Safety check

    // Check if user is logged in
    if (!user) {
      // Store hero data in localStorage for recovery after login
      localStorage.setItem('pendingHero', JSON.stringify(newHero));
      setShowLoginPrompt(true);
      return;
    }

    // Determine endpoint and method based on whether it's an edit or add
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
      setFeedbackModal({
        title: isUpdate ? "Hero Updated" : "Hero Added",
        message: `Hero ${isUpdate ? 'updated' : 'added'} successfully.`,
        onConfirm: () => handleProgress(updatedHeroes)
      });
    } catch (error) {
      logger.error(`Error ${isUpdate ? 'updating' : 'adding'} hero in DB:`, error);
      setFeedbackModal({
        title: "Save Warning",
        message: `Failed to ${isUpdate ? 'update' : 'add'} hero in database: ${error.message}. Changes were applied locally.`,
        onConfirm: () => handleProgress(updatedHeroes)
      });
    }
  };

  const handleProgress = async (currentHeroes) => { // Accept heroes array
    // This function only handles navigation now
    const finalHeroes = currentHeroes || heroes; // Use passed array or context
    if (state?.returnToHeroSelection) {
      navigate('/hero-selection', { state: { heroes: finalHeroes, settingsData: state.settingsData } });
    } else {
      navigate("/all-heroes");
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
      {/* Removed main h2, using name as header */}
      <div className="summary-content">
        {/* Image Column */}
        <div className="summary-image">
          <img 
            src={newHero.profilePicture} 
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
          onClick={() => { navigate("/hero-creation", { state: { newCharacter: newHero, editing: true } }); }}
          className="summary-action-btn summary-back-btn"
        >
          Back (Edit)
        </button>
        {/* Save/Add Button - Text changes based on isEditing */}
        <button onClick={handleSaveOrUpdate} className="summary-action-btn summary-primary-btn">
          {isEditing ? "Save Changes & Continue" : "Add to Roster & Continue"}
        </button>
        {/* Download Button */}
        <button
          onClick={() => downloadJSONFile(`${newHero.heroName}-hero.json`, newHero)}
          className="summary-action-btn summary-download-btn"
        >
          Download Hero JSON
        </button>
      </div>

      {feedbackModal && (
        <div className="modal-overlay" onClick={closeFeedbackModal}>
          <div className="modal-content summary-feedback-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{feedbackModal.title}</h3>
            <p>{feedbackModal.message}</p>
            <div className="summary-feedback-actions">
              <button className="modal-close-button" onClick={closeFeedbackModal}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {showLoginPrompt && (
        <div className="modal-overlay" onClick={() => setShowLoginPrompt(false)}>
          <div className="modal-content summary-feedback-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Sign In Required</h3>
            <p>You need to sign in to save your hero. Your hero data will be preserved.</p>
            <div className="summary-feedback-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button 
                className="modal-close-button" 
                onClick={() => setShowLoginPrompt(false)}
                style={{ background: 'transparent', color: 'var(--text)' }}
              >
                Cancel
              </button>
              <button 
                className="modal-close-button" 
                onClick={() => navigate('/login', { state: { from: { pathname: '/hero-summary' } } })}
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HeroSummary;
