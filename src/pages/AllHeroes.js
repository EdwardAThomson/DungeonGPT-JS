// AllHeroes.js

import React, { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { downloadJSONFile } from "../utils/fileHelper";
import HeroContext from "../contexts/HeroContext";
import { calculateMaxHP } from "../utils/healthSystem";
import { heroesApi } from "../services/heroesApi";
import { createLogger } from "../utils/logger";

const logger = createLogger('all-heroes');

const AllHeroes = () => {
  const { heroes, setHeroes, setEditingHeroIndex } = useContext(HeroContext);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const navigate = useNavigate();

  // insert database retrieval here
  useEffect(() => {
    const fetchHeroes = async () => {
      try {
        const data = await heroesApi.list();
        setHeroes(data);
      } catch (error) {
        logger.error('Error fetching heroes:', error);
        // Optionally, provide feedback to the user in the UI
      }
    };

    fetchHeroes();
  }, [setHeroes]);

  const handleEdit = (hero) => { // Pass the whole hero object
    const index = heroes.findIndex((h) => h.heroId === hero.heroId);
    if (index !== -1) {
      setEditingHeroIndex(index);
      // Pass the specific hero to edit as newCharacter state
      navigate("/hero-creation", { state: { newCharacter: hero, editing: true } });
    } else {
      logger.error("Hero not found for editing:", hero.heroId);
    }
  };

  const handleDeleteClick = (hero) => {
    setDeleteConfirm(hero);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    
    try {
      await heroesApi.delete(deleteConfirm.heroId);
      setHeroes(heroes.filter(h => h.heroId !== deleteConfirm.heroId));
      logger.info(`Hero deleted: ${deleteConfirm.heroName}`);
      setDeleteConfirm(null);
    } catch (error) {
      logger.error('Error deleting hero:', error);
      alert(`Failed to delete hero: ${error.message}`);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirm(null);
  };

  return (
    <div className="page-container all-heroes-page">
      {/* Add a header container for Title + Button */}
      <div className="page-header">
        <h2>All Heroes</h2>
        {/* Wrapper for header buttons */}
        <div className="page-header-actions">
          <button onClick={() => navigate("/game-settings")} className="primary-button">
            + Start New Game
          </button>
          <button onClick={() => navigate("/hero-creation")} className="secondary-button">
            + Create New Hero
          </button>
        </div>
      </div>

      {heroes.length === 0 ? (
        <h3>No heroes found. Create one or make sure the server is running.</h3>
      ) : (
        <ul className="all-heroes-list">
          {heroes.map((hero) => (
            <li key={hero.heroId} className="hero-item">
              <div className="hero-item-image">
                <img src={hero.profilePicture} alt={`${hero.heroName}'s profile`} />
              </div>

              <div className="hero-item-info">
                <h3>{hero.heroName}</h3>
                <p>
                  <span className="detail-label">Level:</span> {hero.heroLevel} {hero.heroClass}
                </p>
                <p>
                  <span className="detail-label">Gender:</span> {hero.heroGender || 'N/A'}
                </p>
                <p>
                  <span className="detail-label">Race:</span> {hero.heroRace}
                </p>
                <p>
                  <span className="detail-label">Alignment:</span> {hero.heroAlignment}
                </p>
                {/* Uncommented Background Display */}
                <p><span className="detail-label">BG:</span> {hero.heroBackground ? `${hero.heroBackground.substring(0, 60)}...` : 'N/A'}</p>
                {hero.stats && (
                  <ul className="hero-item-stats">
                    {Object.entries(hero.stats).map(([stat, value]) => (
                      <li key={stat}>{stat.substring(0, 3)}: {value}</li>
                    ))}
                  </ul>
                )}
                {hero.stats && (
                  <p>
                    <span className="detail-label">Max HP:</span> {hero.maxHP || calculateMaxHP(hero)}
                  </p>
                )}
              </div>

              <div className="hero-item-actions">
                <button onClick={() => handleEdit(hero)} className="action-button edit-button">
                  Edit
                </button>
                <button
                  onClick={() => downloadJSONFile(`${hero.heroName}-hero.json`, hero)}
                  className="action-button download-button"
                >
                  Download
                </button>
                <button
                  onClick={() => handleDeleteClick(hero)}
                  className="action-button delete-button"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={handleDeleteCancel}>
          <div className="modal-content delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Hero?</h3>
            <p>Are you sure you want to delete <strong>{deleteConfirm.heroName}</strong>?</p>
            <p className="warning-text">This action cannot be undone.</p>
            <div className="modal-actions">
              <button onClick={handleDeleteCancel} className="action-button cancel-button">
                Cancel
              </button>
              <button onClick={handleDeleteConfirm} className="action-button delete-button">
                Delete Hero
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AllHeroes;

//  Not sure I need a Back button here.
// <button onClick={() => navigate("/")}>Back</button>
