// AllHeroes.js

import React, { useContext, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
// import { downloadJSONFile } from "../utils/fileHelper"; // unused while Download hero is hidden
import { hasHadAccount } from "../services/accountFlag";
import HeroContext from "../contexts/HeroContext";
import { calculateMaxHP } from "../utils/healthSystem";
import { heroesApi } from "../services/heroesApi";
import { createLogger } from "../utils/logger";
import { resolveProfilePicture } from "../utils/assetHelper";
import { useAuth } from "../contexts/AuthContext";
import { PREGEN_HEROES, buildPregenHero } from "../data/pregenHeroes";
import { PregenBand } from "../components/ReadyMadeHeroes";

const logger = createLogger('all-heroes');

const AllHeroes = () => {
  const { heroes, setHeroes, setEditingHeroIndex } = useContext(HeroContext);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [alertMessage, setAlertMessage] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  // Set when arriving straight from creating a hero — spotlight the next step.
  const justAdded = location.state?.justAdded;

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
      setAlertMessage(`Failed to delete hero: ${error.message}`);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirm(null);
  };

  // Ready-made heroes as the empty state (same picker as party selection, but
  // roster-only: no party to select here). Optimistic add, server after.
  const [addingPregen, setAddingPregen] = useState(false);
  const availablePregens = PREGEN_HEROES.filter(
    (p) => !heroes.some((h) => h.heroName === p.heroName)
  );
  const handleAddPregen = async (pregen) => {
    if (addingPregen) return;
    const hero = buildPregenHero(pregen);
    setAddingPregen(true);
    setHeroes((prev) => [...prev, hero]);
    try {
      await heroesApi.create(hero);
    } catch (error) {
      logger.error('Error saving ready-made hero:', error);
      setAlertMessage(`${hero.heroName} could not be saved: ${error.message}`);
    } finally {
      setAddingPregen(false);
    }
  };

  return (
    <div className="page-container all-heroes-page">
      {/* No onboarding bar here: the Hall of Heroes is roster management, not the
          adventure-first journey (Choose Adventure -> Choose Heroes -> Begin Quest).
          The next-step banner below carries the "Ready to play?" guidance. */}
      {/* Add a header container for Title + Button */}
      <div className="page-header">
        <h2>All Heroes</h2>
        {/* Wrapper for header buttons */}
        <div className="page-header-actions">
          <button onClick={() => navigate("/new-game")} className="primary-button">
            New Game
          </button>
          <button onClick={() => navigate("/hero-creation")} className="secondary-button">
            New Hero
          </button>
        </div>
      </div>

      {!user && heroes.length > 0 && (
        <div className="guest-roster-note">
          🔒 These heroes live only in this browser. <button className="link-button" onClick={() => navigate('/login')}>Sign in</button> free to keep them across devices.
        </div>
      )}

      {heroes.length > 0 && (
        <div className={`next-step-banner${justAdded ? ' highlight' : ''}`}>
          <div className="next-step-banner-text">
            <span className="next-step-banner-title">
              {justAdded ? "Hero added to your roster!" : "Ready to play?"}
            </span>
            <span className="next-step-banner-subtitle">
              Start a new game, choose a story, and pick your party.
            </span>
          </div>
          <button onClick={() => navigate("/new-game")} className="primary-button" data-tour="start-new-game">
            Start a New Game →
          </button>
        </div>
      )}

      {heroes.length === 0 ? (
        !user && hasHadAccount() ? (
          <div className="onboarding-empty">
            <div className="onboarding-empty-icon">🔒</div>
            <h3>Your heroes are in your account</h3>
            <p>You're browsing as a guest on this device. Sign in to access the heroes saved to your account.</p>
            <button onClick={() => navigate("/login")} className="primary-button">
              Sign In →
            </button>
          </div>
        ) : (
          <PregenBand
            pregens={availablePregens}
            disabled={addingPregen}
            onPick={handleAddPregen}
            title="⚔ Add a ready-made hero to your roster"
            note={
              <>
                One click adds them to your roster, fully yours to edit. Or{' '}
                <button type="button" className="pregen-link-button" onClick={() => navigate("/hero-creation")}>
                  craft your own from scratch
                </button>
                .
              </>
            }
          />
        )
      ) : (
        <ul className="all-heroes-list">
          {heroes.map((hero) => (
            <li key={hero.heroId} className="hero-item">
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
                {/* Download — hidden for now (unused); re-enable if requested.
                <button
                  onClick={() => downloadJSONFile(`${hero.heroName}-hero.json`, hero)}
                  className="action-button download-button"
                >
                  Download
                </button>
                */}
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

      {/* Alert Modal */}
      {alertMessage && (
        <div className="modal-overlay" onClick={() => setAlertMessage(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px', textAlign: 'center' }}>
            <h2 style={{ fontFamily: 'var(--header-font)', color: 'var(--primary)', margin: '0 0 16px 0' }}>Alas!</h2>
            <p style={{ color: 'var(--text)', lineHeight: '1.6', margin: '0 0 20px 0' }}>{alertMessage}</p>
            <button className="modal-close-button" onClick={() => setAlertMessage(null)} style={{ width: '100%', padding: '12px' }}>
              Understood
            </button>
          </div>
        </div>
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
