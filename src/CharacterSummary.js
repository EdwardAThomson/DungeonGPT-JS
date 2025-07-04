// CharacterSummary.js

import React, { useContext } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { downloadJSONFile } from "./fileHelper";
import CharacterContext from "./CharacterContext";

const CharacterSummary = () => {
  const { characters, setCharacters } = useContext(CharacterContext);
  const { state } = useLocation();
  const newCharacter = state?.newCharacter;

  const navigate = useNavigate();

  // Check if the character exists in the context (means we are editing)
  const isEditing = characters.some(char => char.characterId === newCharacter?.characterId);

  const handleSaveOrUpdate = async () => {
    if (!newCharacter) return; // Safety check

    // Determine endpoint and method based on whether it's an edit or add
    const isUpdate = isEditing;
    const method = isUpdate ? 'PUT' : 'POST';
    const endpoint = isUpdate
      ? `http://localhost:5000/characters/${newCharacter.characterId}`
      : 'http://localhost:5000/characters';

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

    console.log(isUpdate ? "Updating character..." : "Adding character....", newCharacter);

    // Attempt to save/update on the server
    try {
      const response = await fetch(endpoint, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newCharacter),
      });

      const result = await response.json();
      if (response.ok) {
        console.log(`Character ${isUpdate ? 'updated' : 'added'} in database. Response:`, result);
        alert(`Character ${isUpdate ? 'updated' : 'added'} successfully`);
        // Proceed with navigation after successful save/update
        handleProgress(updatedCharacters); // Pass updated characters to navigate function
      } else {
        // Handle server error - maybe revert context state?
        console.error("Server error:", result);
        throw new Error(result.message || 'Unknown server error');
      }
    } catch (error) {
      console.error(`Error ${isUpdate ? 'updating' : 'adding'} character in DB:`, error);
      alert(`Failed to ${isUpdate ? 'update' : 'add'} character in database: ${error.message}. Changes applied locally only.`);
      // Optionally revert context change if DB save fails
      // setCharacters(characters); // Revert to original characters array
      // Or still proceed with navigation, accepting local changes
      handleProgress(updatedCharacters); // Navigate even if DB save fails, using the optimistic update
    }
  };

  const handleProgress = async (currentChars) => { // Accept characters array
    // This function only handles navigation now
    const finalCharacters = currentChars || characters; // Use passed array or context
    if (state?.returnToHeroSelection) {
      navigate('/hero-selection', { state: { characters: finalCharacters, settingsData: state.settingsData } });
    } else {
      navigate("/all-characters");
    }
  };

  if (!newCharacter) {
    return <p className="page-container">No character data found. Please create a character first.</p>;
  }

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
          <p>
            <span className="detail-label">Level:</span> {newCharacter.characterLevel}
          </p>
          <p>
            <span className="detail-label">Class:</span> {newCharacter.characterClass}
          </p>
          <p>
            <span className="detail-label">Race:</span> {newCharacter.characterRace}
          </p>
          <p>
            <span className="detail-label">Alignment:</span> {newCharacter.characterAlignment}
          </p>
          <p>
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
        </div>
      </div>

      {/* Action Buttons */}
      <div className="summary-actions">
        {/* Back Button - always takes you back to edit */}
        <button
          onClick={() => { navigate("/character-creation", { state: { newCharacter, editing: true } }); }}
          className="back-button"
        >
          Back (Edit)
        </button>
        {/* Save/Add Button - Text changes based on isEditing */}
        <button onClick={handleSaveOrUpdate} className="add-button">
          {isEditing ? "Save Changes & Continue" : "Add to Roster & Continue"}
        </button>
        {/* Download Button */}
        <button
          onClick={() => downloadJSONFile(`${newCharacter.characterName}-character.json`, newCharacter)}
          className="download-button"
        >
          Download Character JSON
        </button>
      </div>
    </div>
  );
};

export default CharacterSummary;
