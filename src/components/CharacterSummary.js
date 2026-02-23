// CharacterSummary.js

import React, { useContext, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { downloadJSONFile } from "../utils/fileHelper";
import CharacterContext from "../contexts/CharacterContext";
import { calculateMaxHP } from "../utils/healthSystem";
import { charactersApi } from "../services/charactersApi";
import { createLogger } from "../utils/logger";

const logger = createLogger('character-summary');

const CharacterSummary = () => {
  const { characters, setCharacters } = useContext(CharacterContext);
  const { state } = useLocation();
  const newCharacter = state?.newCharacter;
  const [feedbackModal, setFeedbackModal] = useState(null);

  const navigate = useNavigate();

  // Check if the character exists in the context (means we are editing)
  const isEditing = characters.some(char => char.characterId === newCharacter?.characterId);

  const handleSaveOrUpdate = async () => {
    if (!newCharacter) return; // Safety check

    // Determine endpoint and method based on whether it's an edit or add
    const isUpdate = isEditing;
    // Update local context/state first for immediate UI feedback
    let updatedCharacters;
    if (isUpdate) {
      updatedCharacters = characters.map(char =>
        char.characterId === newCharacter.characterId ? newCharacter : char
      );
    } else {
      updatedCharacters = [...characters, newCharacter];
    }
    setCharacters(updatedCharacters); // Update context

    logger.debug(isUpdate ? "Updating character..." : "Adding character....", newCharacter);

    // Attempt to save/update on the server
    try {
      const result = isUpdate
        ? await charactersApi.update(newCharacter.characterId, newCharacter)
        : await charactersApi.create(newCharacter);

      logger.debug(`Character ${isUpdate ? 'updated' : 'added'} in database. Response:`, result);
      setFeedbackModal({
        title: isUpdate ? "Hero Updated" : "Hero Added",
        message: `Character ${isUpdate ? 'updated' : 'added'} successfully.`,
        onConfirm: () => handleProgress(updatedCharacters)
      });
    } catch (error) {
      logger.error(`Error ${isUpdate ? 'updating' : 'adding'} character in DB:`, error);
      setFeedbackModal({
        title: "Save Warning",
        message: `Failed to ${isUpdate ? 'update' : 'add'} character in database: ${error.message}. Changes were applied locally.`,
        onConfirm: () => handleProgress(updatedCharacters)
      });
    }
  };

  const handleProgress = async (currentChars) => { // Accept characters array
    // This function only handles navigation now
    const finalCharacters = currentChars || characters; // Use passed array or context
    if (state?.returnToHeroSelection) {
      navigate('/hero-selection', { state: { characters: finalCharacters, settingsData: state.settingsData } });
    } else {
      navigate("/all-heroes");
    }
  };

  if (!newCharacter) {
    return <p className="page-container">No character data found. Please create a character first.</p>;
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
          <img src={newCharacter.profilePicture} alt={`${newCharacter.characterName}'s profile`} />
        </div>

        {/* Details Column */}
        <div className="summary-details">
          <h2>{newCharacter.characterName}</h2>
          <div className="summary-info-grid">
            <p className="kv-row">
              <span className="detail-label">Level:</span> {newCharacter.characterLevel}
            </p>
            <p className="kv-row">
              <span className="detail-label">Class:</span> {newCharacter.characterClass}
            </p>
            <p className="kv-row">
              <span className="detail-label">Race:</span> {newCharacter.characterRace}
            </p>
            <p className="kv-row">
              <span className="detail-label">Alignment:</span> {newCharacter.characterAlignment}
            </p>
          </div>
          <p className="kv-row summary-background">
            <span className="detail-label">Background:</span> {newCharacter.characterBackground}
          </p>
          {/* Stats List */}
          {newCharacter.stats && (
            <div className="summary-stats-list">
              <h4>Stats:</h4>
              <ul>
                {Object.entries(newCharacter.stats).map(([stat, value]) => (
                  <li key={stat}>
                    {stat}: {value}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {newCharacter.stats && (
            <p className="kv-row summary-max-hp">
              <span className="detail-label">Max HP:</span> {newCharacter.maxHP || calculateMaxHP(newCharacter)}
            </p>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="summary-actions">
        {/* Back Button - always takes you back to edit */}
        <button
          onClick={() => { navigate("/hero-creation", { state: { newCharacter, editing: true } }); }}
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
          onClick={() => downloadJSONFile(`${newCharacter.characterName}-character.json`, newCharacter)}
          className="summary-action-btn summary-download-btn"
        >
          Download Character JSON
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
    </div>
  );
};

export default CharacterSummary;
