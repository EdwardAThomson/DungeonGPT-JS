// AllHeroes.js
// "Your Heroes": the roster, on the redesign primitives (#82, in-app pages after the Your
// Games pilot). A portrait card per hero, ready-made heroes offered in the same card style,
// and a create tile. Styles: .rd-page / .rd-app in src/styles/redesign.css.

import React, { useContext, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
// import { downloadJSONFile } from "../utils/fileHelper"; // unused while Download hero is hidden
import { hasHadAccount } from "../services/accountFlag";
import HeroContext from "../contexts/HeroContext";
import { calculateMaxHP } from "../utils/healthSystem";
import { calculateModifier } from "../utils/rules";
import { heroesApi } from "../services/heroesApi";
import { createLogger } from "../utils/logger";
import { resolveProfilePicture } from "../utils/assetHelper";
import { useAuth } from "../contexts/AuthContext";
import { PREGEN_HEROES, buildPregenHero } from "../data/pregenHeroes";
import "../styles/redesign.css";

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

  const STAT_ORDER = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'];
  const fmtMod = (score) => {
    const m = calculateModifier(score);
    return m >= 0 ? `+${m}` : `${m}`;
  };

  const lede = heroes.length === 0
    ? 'Build a hero from scratch, or add a ready-made one in a click.'
    : `${heroes.length} hero${heroes.length === 1 ? '' : 'es'} ready for a campaign. Take up to four into each game.`;

  return (
    <div className="rd-page rd-app">
      {/* No onboarding bar here: the roster is roster management, not the adventure-first
          journey (Choose Adventure -> Choose Heroes -> Begin Quest). */}
      <section className="page-header app-header">
        <div className="wrap">
          <p className="eyebrow">Your heroes</p>
          <div className="app-header-row">
            <div>
              <h1>Your roster.</h1>
              <p className="lede">{lede}</p>
            </div>
            <div className="app-header-actions">
              <button type="button" onClick={() => navigate("/hero-creation")} className="btn btn-ghost">New hero</button>
              {heroes.length > 0 && (
                <button type="button" onClick={() => navigate("/new-game")} className="btn btn-primary" data-tour="start-new-game">Start a new game</button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          {justAdded && heroes.length > 0 && (
            <div className="app-callout success" role="status">
              <span><b>Hero added to your roster.</b> Start a new game, choose a story, and pick your party.</span>
              <button type="button" onClick={() => navigate("/new-game")} className="btn btn-primary">Start a new game</button>
            </div>
          )}

          {heroes.length === 0 && !user && hasHadAccount() ? (
            <div className="app-empty">
              <div className="app-empty-icon" aria-hidden="true">🔒</div>
              <h2>Your heroes are in your account</h2>
              <p>You're browsing as a guest on this device. Sign in to see the heroes saved to your account.</p>
              <button type="button" onClick={() => navigate("/login")} className="btn btn-primary">Sign in</button>
            </div>
          ) : (
            <>
              {heroes.length > 0 && (
                <ul className="roster-grid">
                  {heroes.map((hero) => (
                    <li key={hero.heroId} className="roster-card">
                      <div className="roster-portrait">
                        <img src={resolveProfilePicture(hero.profilePicture)} alt={`${hero.heroName}'s portrait`} loading="lazy" />
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
                        {hero.stats && <p className="roster-hp">{hero.maxHP || calculateMaxHP(hero)} HP</p>}
                        <div className="roster-actions">
                          <button type="button" onClick={() => handleEdit(hero)} className="btn btn-ghost">Edit</button>
                          {/* Download: hidden for now (unused); re-enable with downloadJSONFile if requested. */}
                          <button type="button" onClick={() => handleDeleteClick(hero)} className="icon-button danger" title="Delete" aria-label={`Delete ${hero.heroName}`}>
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                  <li className="roster-card roster-new">
                    <button type="button" onClick={() => navigate("/hero-creation")}>
                      <span className="plus" aria-hidden="true">+</span>
                      <span>Create a hero</span>
                      <small>Twelve classes, 27 points</small>
                    </button>
                  </li>
                </ul>
              )}

              {/* Ready-made heroes not yet on the roster: the main content for an empty
                  roster, a quieter section under a stocked one. Optimistic add. */}
              {availablePregens.length > 0 && (
                <div className={`pregen-section${heroes.length === 0 ? ' primary' : ''}`}>
                  <div className="pregen-section-head">
                    <h2>{heroes.length === 0 ? 'Start with a ready-made hero' : 'Ready-made heroes'}</h2>
                    <p>One click adds them to your roster, fully yours to edit.{heroes.length === 0 && <> Or <button type="button" className="inline-link" onClick={() => navigate("/hero-creation")}>build your own from scratch</button>.</>}</p>
                  </div>
                  <ul className="roster-grid">
                    {availablePregens.map((p) => (
                      <li key={p.heroName} className="roster-card ready">
                        <div className="roster-portrait">
                          <img src={resolveProfilePicture(p.profilePicture)} alt="" loading="lazy" />
                          <span className="price-badge price-badge-muted">Ready-made</span>
                        </div>
                        <div className="roster-body">
                          <h3>{p.heroName}</h3>
                          <p className="roster-sub">Level 1 {p.heroClass}</p>
                          <div className="roster-actions">
                            <button type="button" className="btn btn-primary" onClick={() => handleAddPregen(p)} disabled={addingPregen}>Add to roster</button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </section>

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
