// HeroCreation.js
// Create / edit a hero, on the redesign primitives (#82): an identity card (portrait, name,
// gender, alignment, background), one-click class templates, and a live character sheet
// (point-buy with modifiers and HP). Styles: .rd-page / .rd-app in src/styles/redesign.css.

import React, { useState, useContext } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";

import HeroContext from "../contexts/HeroContext";
import { generateName } from "../utils/npcGenerator";
import { sanitizeHeroName } from "../utils/validation";
import { calculateMaxHP } from "../utils/healthSystem";
import OnboardingSteps from "../components/OnboardingSteps";
import PortraitPickerModal from "../components/PortraitPickerModal";
import { resolveProfilePicture } from "../utils/assetHelper";
import { calculateModifier } from "../utils/rules";
import "../styles/redesign.css";
import {
  heroGenders,
  heroClasses,
  alignmentOptions,
  STAT_KEYS,
  INITIAL_STATS,
  heroTemplates,
  profilePictures,
  POINT_BUY_BUDGET,
} from "../data/heroData";
import {
  validateHero,
  pointsRemaining,
  canIncreaseStat,
  canDecreaseStat,
  increaseCost,
  decreaseRefund,
} from "../game/heroValidation";

const HeroCreation = () => {

  const { heroes, editingHeroIndex } = useContext(HeroContext);

  const { state } = useLocation();
  const heroToEdit = state?.newCharacter || heroes[editingHeroIndex];

  // State for selected template
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [alertMessage, setAlertMessage] = useState(null);
  // Whether the portrait picker modal is open.
  const [showPortraitModal, setShowPortraitModal] = useState(false);
  // Unspent-points confirmation: { hero, points } when warning before create.
  const [confirmUnspent, setConfirmUnspent] = useState(null);

  const [heroName, setHeroName] = useState(heroToEdit?.heroName || "");
  const [selectedGender, setSelectedGender] = useState(heroToEdit?.heroGender || "");
  // Older heroes store a legacy picture value ("barbarian.png"); normalise it to the
  // current "assets/characters/<name>.webp" form so the preview renders, the gender check
  // below can match it against profilePictures, and saving the edit migrates the field.
  const [selectedProfilePicture, setSelectedProfilePicture] = useState(resolveProfilePicture(heroToEdit?.profilePicture) || null);
  // Race selector is hidden (human-only portraits); new heroes default to Human. Legacy
  // heroes keep their saved race. setSelectedRace is still driven by the class template.
  const [selectedRace, setSelectedRace] = useState(heroToEdit?.heroRace || "Human");
  const [selectedClass, setSelectedClass] = useState(heroToEdit?.heroClass || "");
  const [stats, setStats] = useState(heroToEdit?.stats || INITIAL_STATS);
  const [heroBackground, setHeroBackground] = useState(heroToEdit?.heroBackground || "");
  const [alignment, setAlignment] = useState(heroToEdit?.heroAlignment || "");

  // Level is fixed at 1 for new characters (premium higher-level templates come
  // later). Editing preserves an existing character's level.
  const heroLevel = heroToEdit?.heroLevel || 1;

  const navigate = useNavigate();

  const remainingPoints = pointsRemaining(stats);

  const handlePortraitSelect = (src) => {
    setSelectedProfilePicture(src);
    setShowPortraitModal(false); // pick + close in one click
  };

  const handleGenderChange = (newGender) => {
    setSelectedGender(newGender);

    // Clear profile picture if it doesn't match the new gender
    if (selectedProfilePicture) {
      const currentPic = profilePictures.find(pic => pic.src === selectedProfilePicture);
      if (currentPic && currentPic.gender !== newGender) {
        setSelectedProfilePicture(null);
      }
    }
  };

  const handleClassChange = (e) => setSelectedClass(e.target.value);
  const handleAlignmentChange = (e) => setAlignment(e.target.value);
  const handleNameChange = (e) => setHeroName(e.target.value);
  const handleBackgroundChange = (e) => setHeroBackground(e.target.value);

  const increaseStat = (stat) => {
    if (canIncreaseStat(stats, stat)) {
      setStats((prev) => ({ ...prev, [stat]: prev[stat] + 1 }));
    }
  };

  const decreaseStat = (stat) => {
    if (canDecreaseStat(stats, stat)) {
      setStats((prev) => ({ ...prev, [stat]: prev[stat] - 1 }));
    }
  };

  // --- Apply a class template (level 1, valid 27-point spread) ---
  // One click on a class chip applies it (the old select-then-Apply was two steps).
  const handleApplyTemplate = (templateName) => {
    if (!templateName || !heroTemplates[templateName]) {
      setAlertMessage("Please select a class template to apply.");
      return;
    }
    setSelectedTemplate(templateName);
    const template = heroTemplates[templateName];
    setSelectedClass(templateName);
    setSelectedRace(template.race);
    setStats(template.stats);
    setAlignment(template.alignment);
    setHeroBackground(template.backgroundSnippet);

    // Quick-fill (#88): on a fresh hero, also fill the EMPTY identity fields so
    // one click yields a complete, fully editable character (scan-and-adjust
    // instead of compose-from-scratch). Player-set values are never overwritten,
    // and editing an existing hero never triggers this.
    if (!state?.editing) {
      let gender = selectedGender;
      if (!gender) {
        gender = heroGenders[Math.floor(Math.random() * heroGenders.length)];
        setSelectedGender(gender);
      }
      if (!heroName.trim()) setHeroName(generateName(gender));
      if (!selectedProfilePicture) {
        const pool = profilePictures.filter((pic) => pic.gender === gender);
        // Prefer the portrait drawn for this class when one exists (portraits are
        // named by class); otherwise any portrait matching the gender.
        const classPic = pool.find((pic) => pic.src.includes(templateName.toLowerCase()));
        const pick = classPic || pool[Math.floor(Math.random() * pool.length)];
        if (pick) setSelectedProfilePicture(pick.src);
      }
    }
  };

  // When this page was entered from HeroSelection, the return-flow flag and the
  // campaign's launch context must survive the summary hop; dropping them strands
  // the player on /all-heroes with the launched map/session lost.
  const heroSelectionReturnState = state?.returnToHeroSelection
    ? {
        returnToHeroSelection: true,
        settingsData: state.settingsData,
        launchState: state.launchState,
      }
    : {};

  const handleSubmit = async () => {
    const newHero = {
      heroId: heroToEdit?.heroId || uuidv4(),
      // Trim/collapse whitespace so the saved name is clean; validateHero below
      // rejects any disallowed characters and shows the reason inline.
      heroName: sanitizeHeroName(heroName),
      heroGender: selectedGender,
      profilePicture: selectedProfilePicture,
      heroRace: selectedRace,
      heroClass: selectedClass,
      heroLevel,
      heroBackground,
      heroAlignment: alignment,
      stats,
    };

    // Point-buy applies to new heroes and to any edit that changes the stats. An edit
    // that leaves the stats alone (rename, new portrait) stays lenient, so a legacy hero
    // made before the budget existed can still be saved without a forced respec.
    const statsChanged = !state?.editing
      || JSON.stringify(stats) !== JSON.stringify(heroToEdit?.stats || INITIAL_STATS);
    const { valid, reasons } = validateHero(newHero, { enforcePointBuy: statsChanged });
    if (!valid) {
      setAlertMessage(reasons);
      return;
    }

    // Warn (don't block) if the player left point-buy points unspent (new heroes only).
    if (!state?.editing && remainingPoints > 0) {
      setConfirmUnspent({ hero: newHero, points: remainingPoints });
      return;
    }

    navigate("/hero-summary", { state: { newCharacter: newHero, ...heroSelectionReturnState } });
  };

  // Name generation is tied to gender. If no gender is chosen yet, the dice picks
  // one first so the name always matches a gender.
  const generateRandomName = () => {
    let gender = selectedGender;
    if (!gender) {
      gender = heroGenders[Math.floor(Math.random() * heroGenders.length)];
      setSelectedGender(gender);
      // Clear a portrait that doesn't match the newly-picked gender.
      if (selectedProfilePicture) {
        const currentPic = profilePictures.find(pic => pic.src === selectedProfilePicture);
        if (currentPic && currentPic.gender !== gender) setSelectedProfilePicture(null);
      }
    }
    setHeroName(generateName(gender));
  };

  const fmtMod = (score) => {
    const m = calculateModifier(score);
    return m >= 0 ? `+${m}` : `${m}`;
  };
  const isEditing = !!state?.editing;
  const inJourney = !isEditing && state?.returnToHeroSelection;

  return (
    <div className="rd-page rd-app hero-forge">
      <section className="page-header app-header">
        <div className="wrap">
          {/* The journey bar only renders when creation is part of the game-start flow
              (entered from party selection). Standalone creation is roster management. */}
          {inJourney && <OnboardingSteps currentStep={2} completedSteps={[1]} />}
          <p className="eyebrow">{isEditing ? 'Edit hero' : 'New hero'}</p>
          <h1 className="hero-creation-title">{isEditing ? 'Edit Hero' : 'Create Your Hero'}</h1>
          <p className="lede">
            {isEditing
              ? 'Change anything. Stat changes must still fit the 27-point budget.'
              : 'Start from a class template for a ready hero in one click, or build every detail yourself.'}
          </p>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          {/* Quick start: one click applies a class template */}
          <div className="forge-quick" data-tour="hero-template">
            <h2 className="forge-label">Quick start: pick a class template</h2>
            <div className="forge-chips" role="group" aria-label="Class templates">
              {Object.keys(heroTemplates).map((className) => (
                <button
                  key={className}
                  type="button"
                  className={`forge-chip${selectedTemplate === className ? ' on' : ''}`}
                  onClick={() => handleApplyTemplate(className)}
                  title={`Apply the ${className} template: class, stats, alignment and background`}
                >
                  {className}
                </button>
              ))}
            </div>
          </div>

          <div className="forge-grid">
            {/* Identity */}
            <div className="forge-card forge-identity" data-tour="hero-identity">
              <div className="forge-portrait-row">
                <button
                  type="button"
                  className={`forge-portrait${selectedProfilePicture ? ' has-pic' : ''}`}
                  onClick={() => setShowPortraitModal(true)}
                  disabled={!selectedGender}
                  aria-label={selectedProfilePicture ? 'Change portrait' : 'Choose portrait'}
                >
                  {selectedProfilePicture
                    ? <img src={selectedProfilePicture} alt="Selected portrait" className="picture-selected-img" />
                    : <span className="forge-portrait-empty" aria-hidden="true">?</span>}
                  <span className="forge-portrait-cta">{selectedProfilePicture ? 'Change' : 'Choose portrait'}</span>
                </button>
                <div className="forge-name">
                  <label htmlFor="heroName">Name</label>
                  <div className="forge-inline">
                    <input
                      type="text"
                      id="heroName"
                      maxLength="50"
                      placeholder="Enter or roll a name"
                      value={heroName}
                      onChange={handleNameChange}
                      required
                    />
                    <button
                      type="button"
                      onClick={generateRandomName}
                      className="btn btn-ghost forge-roll"
                      title="Generate a random name (picks a gender if none is set)"
                    >
                      Roll
                    </button>
                  </div>
                  <span className="forge-label-text" id="gender-label">Gender</span>
                  <div className="forge-seg" role="radiogroup" aria-labelledby="gender-label">
                    {heroGenders.map((g) => (
                      <button
                        key={g}
                        type="button"
                        role="radio"
                        aria-checked={selectedGender === g}
                        className={selectedGender === g ? 'on' : ''}
                        onClick={() => handleGenderChange(g)}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                  {!selectedGender && <p className="field-hint">Choose a gender to pick a portrait.</p>}
                </div>
              </div>

              {/* Race selector is hidden for now: we only have human portraits, so every hero
                  is created as Human. heroRace stays on the data model (legacy heroes keep it). */}
              <div className="forge-fields">
                <div>
                  <label htmlFor="class">Class</label>
                  <select id="class" value={selectedClass} onChange={handleClassChange} required>
                    <option value="">Select class</option>
                    {heroClasses.map((cls) => (
                      <option key={cls} value={cls}>{cls}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="alignment">Alignment</label>
                  <select id="alignment" value={alignment} onChange={handleAlignmentChange} required>
                    <option value="">Choose alignment</option>
                    {alignmentOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="forge-field">
                <label htmlFor="background">Background <small>{heroBackground.length}/200</small></label>
                <textarea
                  id="background"
                  value={heroBackground}
                  onChange={handleBackgroundChange}
                  maxLength="200"
                  placeholder="Where they come from, and what drives them"
                  rows="3"
                  required
                />
              </div>
            </div>

            {/* Live character sheet */}
            <div className="forge-card forge-sheet" data-tour="hero-stats">
              <div className="forge-sheet-head">
                <h2>Ability scores</h2>
                <span className={`forge-points${remainingPoints < 0 ? ' over' : remainingPoints === 0 ? ' done' : ''}`}>
                  <b>{remainingPoints}</b> / {POINT_BUY_BUDGET} points left
                </span>
              </div>
              <p className="forge-hint">Each score starts at 8. Raising to 14 or 15 costs 2 points per step.</p>
              <div className="forge-stats">
                {STAT_KEYS.map((stat) => {
                  const upCost = increaseCost(stats[stat]);
                  const downRefund = decreaseRefund(stats[stat]);
                  return (
                    <div key={stat} className="forge-stat">
                      <span className="name">{stat}</span>
                      <button
                        type="button"
                        className="step"
                        onClick={() => decreaseStat(stat)}
                        disabled={!canDecreaseStat(stats, stat)}
                        aria-label={`Decrease ${stat}${downRefund ? ` (refunds ${downRefund})` : ''}`}
                      >
                        −
                      </button>
                      <span className="score">{stats[stat]}</span>
                      <button
                        type="button"
                        className="step"
                        onClick={() => increaseStat(stat)}
                        disabled={!canIncreaseStat(stats, stat)}
                        aria-label={`Increase ${stat}${upCost ? ` (costs ${upCost})` : ''}`}
                      >
                        +
                      </button>
                      <span className="mod">{fmtMod(stats[stat])}</span>
                      <span className="cost">{canIncreaseStat(stats, stat) && upCost ? `+1 costs ${upCost}` : ''}</span>
                    </div>
                  );
                })}
              </div>
              <div className="forge-derived">
                <div><span>Level</span><b>{heroLevel}</b></div>
                <div><span>Max HP</span><b>{calculateMaxHP({ stats })}</b></div>
                <div><span>Class</span><b>{selectedClass || 'None yet'}</b></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="party-dock" role="region" aria-label="Hero actions">
        <div className="wrap party-dock-inner">
          {selectedProfilePicture && (
            <ol className="party-slots"><li className="slot filled"><img src={selectedProfilePicture} alt="" /></li></ol>
          )}
          <div className="party-dock-text">
            <span><b>{heroName.trim() || 'Unnamed hero'}</b>{selectedClass ? ` · Level ${heroLevel} ${selectedClass}` : ''}</span>
          </div>
          <button type="button" className="btn btn-primary party-start" onClick={handleSubmit} data-tour="create-hero">
            {isEditing ? 'Update Hero' : 'Create Hero'}
          </button>
        </div>
      </div>

      {/* Portrait Picker Modal */}
      {showPortraitModal && (
        <PortraitPickerModal
          gender={selectedGender}
          selected={selectedProfilePicture}
          onSelect={handlePortraitSelect}
          onClose={() => setShowPortraitModal(false)}
        />
      )}

      {/* Validation Alert Modal */}
      {alertMessage && (
        <div className="modal-overlay" onClick={() => setAlertMessage(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <h2 style={{ fontFamily: 'var(--header-font)', color: 'var(--primary)', margin: '0 0 16px 0', textAlign: 'center' }}>Hold, Adventurer!</h2>
            {Array.isArray(alertMessage) ? (
              <ul style={{ color: 'var(--text)', lineHeight: '1.6', margin: '0 0 20px 0', paddingLeft: '20px' }}>
                {alertMessage.map((reason, i) => <li key={i}>{reason}</li>)}
              </ul>
            ) : (
              <p style={{ color: 'var(--text)', lineHeight: '1.6', margin: '0 0 20px 0', textAlign: 'center' }}>{alertMessage}</p>
            )}
            <button className="modal-close-button" onClick={() => setAlertMessage(null)} style={{ width: '100%', padding: '12px' }}>
              Understood
            </button>
          </div>
        </div>
      )}

      {/* Unspent points warning (non-blocking) */}
      {confirmUnspent && (
        <div className="modal-overlay" onClick={() => setConfirmUnspent(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px', textAlign: 'center' }}>
            <h2 style={{ fontFamily: 'var(--header-font)', color: 'var(--primary)', margin: '0 0 16px 0' }}>Unspent Points</h2>
            <p style={{ color: 'var(--text)', lineHeight: '1.6', margin: '0 0 20px 0' }}>
              You still have <strong>{confirmUnspent.points}</strong> unspent stat point{confirmUnspent.points === 1 ? '' : 's'}. Spending them now makes your hero stronger — you can't add them later.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                className="modal-close-button"
                onClick={() => setConfirmUnspent(null)}
                style={{ background: 'transparent', color: 'var(--text)' }}
              >
                Keep editing
              </button>
              <button
                className="modal-close-button"
                onClick={() => {
                  const hero = confirmUnspent.hero;
                  setConfirmUnspent(null);
                  navigate('/hero-summary', { state: { newCharacter: hero, ...heroSelectionReturnState } });
                }}
              >
                Create anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HeroCreation;
