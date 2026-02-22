// AllCharacters.js

import React, { useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { downloadJSONFile } from "../utils/fileHelper";
import CharacterContext from "../contexts/CharacterContext";
import { calculateMaxHP } from "../utils/healthSystem";
import { charactersApi } from "../services/charactersApi";
import { createLogger } from "../utils/logger";

const logger = createLogger('all-characters');

const AllCharacters = () => {
  const { characters, setCharacters, setEditingCharacterIndex } = useContext(CharacterContext);
  const navigate = useNavigate();

  // insert database retrieval here
  useEffect(() => {
    const fetchCharacters = async () => {
      try {
        const data = await charactersApi.list();
        setCharacters(data);
      } catch (error) {
        logger.error('Error fetching characters:', error);
        // Optionally, provide feedback to the user in the UI
      }
    };

    fetchCharacters();
  }, [setCharacters]);

  const handleEdit = (character) => { // Pass the whole character object
    const index = characters.findIndex((char) => char.characterId === character.characterId);
    if (index !== -1) {
      setEditingCharacterIndex(index);
      // Pass the specific character to edit as newCharacter state
      navigate("/character-creation", { state: { newCharacter: character, editing: true } });
    } else {
      logger.error("Character not found for editing:", character.characterId);
    }
  };

  return (
    <div className="page-container all-characters-page">
      {/* Add a header container for Title + Button */}
      <div className="page-header">
        <h2>All Characters</h2>
        {/* Wrapper for header buttons */}
        <div className="page-header-actions">
          <button onClick={() => navigate("/game-settings")} className="start-game-button">
            + Start New Game
          </button>
          <button onClick={() => navigate("/character-creation")} className="create-new-button">
            + Create New Character
          </button>
        </div>
      </div>

      {characters.length === 0 ? (
        <h3>No characters found. Create one or make sure the server is running.</h3>
      ) : (
        <ul className="all-characters-list">
          {characters.map((char) => (
            <li key={char.characterId} className="character-item">
              <div className="character-item-image">
                <img src={char.profilePicture} alt={`${char.characterName}'s profile`} />
              </div>

              <div className="character-item-info">
                <h3>{char.characterName}</h3>
                <p>
                  <span className="detail-label">Level:</span> {char.characterLevel} {char.characterClass}
                </p>
                <p>
                  <span className="detail-label">Gender:</span> {char.characterGender || 'N/A'}
                </p>
                <p>
                  <span className="detail-label">Race:</span> {char.characterRace}
                </p>
                <p>
                  <span className="detail-label">Alignment:</span> {char.characterAlignment}
                </p>
                {/* Uncommented Background Display */}
                <p><span className="detail-label">BG:</span> {char.characterBackground ? `${char.characterBackground.substring(0, 60)}...` : 'N/A'}</p>
                {char.stats && (
                  <ul className="character-item-stats">
                    {Object.entries(char.stats).map(([stat, value]) => (
                      <li key={stat}>{stat.substring(0, 3)}: {value}</li>
                    ))}
                  </ul>
                )}
                {char.stats && (
                  <p>
                    <span className="detail-label">Max HP:</span> {char.maxHP || calculateMaxHP(char)}
                  </p>
                )}
              </div>

              <div className="character-item-actions">
                <button onClick={() => handleEdit(char)} className="edit-button">
                  Edit
                </button>
                <button
                  onClick={() => downloadJSONFile(`${char.characterName}-character.json`, char)}
                  className="download-button"
                >
                  Download
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AllCharacters;

//  Not sure I need a Back button here.
// <button onClick={() => navigate("/")}>Back</button>
