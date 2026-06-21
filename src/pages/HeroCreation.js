// HeroCreation.js

import React, { useState, useContext } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";

import HeroContext from "../contexts/HeroContext";
import { generateName } from "../utils/npcGenerator";
import { calculateMaxHP } from "../utils/healthSystem";
import OnboardingSteps from "../components/OnboardingSteps";
import PortraitPickerModal from "../components/PortraitPickerModal";
import {
  heroGenders,
  heroClasses,
  heroRaces,
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
  const [selectedProfilePicture, setSelectedProfilePicture] = useState(heroToEdit?.profilePicture || null);
  const [selectedRace, setSelectedRace] = useState(heroToEdit?.heroRace || "");
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

  const handleGenderChange = (e) => {
    const newGender = e.target.value;
    setSelectedGender(newGender);

    // Clear profile picture if it doesn't match the new gender
    if (selectedProfilePicture) {
      const currentPic = profilePictures.find(pic => pic.src === selectedProfilePicture);
      if (currentPic && currentPic.gender !== newGender) {
        setSelectedProfilePicture(null);
      }
    }
  };

  const handleRaceChange = (e) => setSelectedRace(e.target.value);
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
  const handleApplyTemplate = () => {
    if (!selectedTemplate || !heroTemplates[selectedTemplate]) {
      setAlertMessage("Please select a class template to apply.");
      return;
    }
    const template = heroTemplates[selectedTemplate];
    setSelectedClass(selectedTemplate);
    setSelectedRace(template.race);
    setStats(template.stats);
    setAlignment(template.alignment);
    setHeroBackground(template.backgroundSnippet);
  };

  const handleSubmit = async () => {
    const newHero = {
      heroId: heroToEdit?.heroId || uuidv4(),
      heroName,
      heroGender: selectedGender,
      profilePicture: selectedProfilePicture,
      heroRace: selectedRace,
      heroClass: selectedClass,
      heroLevel,
      heroBackground,
      heroAlignment: alignment,
      stats,
    };

    // Enforce the point-buy budget only when creating a brand-new character;
    // editing an existing one stays lenient (structural checks only).
    const { valid, reasons } = validateHero(newHero, { enforcePointBuy: !state?.editing });
    if (!valid) {
      setAlertMessage(reasons);
      return;
    }

    // Warn (don't block) if the player left point-buy points unspent (new heroes only).
    if (!state?.editing && remainingPoints > 0) {
      setConfirmUnspent({ hero: newHero, points: remainingPoints });
      return;
    }

    navigate("/hero-summary", { state: { newCharacter: newHero } });
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

  return (
    <div className="Home-page hero-creation-form">
      {!state?.editing && <OnboardingSteps currentStep={1} />}
      <h1 className="hero-creation-title">{state?.editing ? "Edit Hero" : "Create Your Hero"}</h1>

      {/* Top Container: Name + Gender (left), Profile Picture (right) */}
      <div className="top-container" data-tour="hero-identity">
        <div className="top-left">
          {/* Name */}
          <div className="form-section">
            <div className="name-section">
              <label htmlFor="heroName">Hero Name:</label>
              <input
                type="text"
                id="heroName"
                maxLength="50"
                placeholder="Enter or Generate Name"
                value={heroName}
                onChange={handleNameChange}
                required
              />
              <button
                type="button"
                onClick={generateRandomName}
                className="generate-name-btn"
                title="Generate a random name (picks a gender if none is set)"
              >
                🎲 Random name
              </button>
            </div>
          </div>

          {/* Gender Selection */}
          <div className="form-section">
            <label htmlFor="gender">Gender:</label>
            <select id="gender" value={selectedGender} onChange={handleGenderChange} required>
              <option value="">Select Gender</option>
              {heroGenders.map((heroGender) => (
                <option key={heroGender} value={heroGender}>
                  {heroGender}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Picture Selection — opens a modal grid */}
        <div className="form-section profile-pictures">
          <label>Profile Picture:</label>
          {selectedProfilePicture ? (
            <div className="picture-selected">
              <img src={selectedProfilePicture} alt="Selected portrait" className="picture-selected-img" />
              <button
                type="button"
                className="change-portrait-btn"
                onClick={() => setShowPortraitModal(true)}
                disabled={!selectedGender}
              >
                Change picture
              </button>
            </div>
          ) : (
            <div className="picture-empty">
              <div className="picture-placeholder" aria-hidden="true">?</div>
              <button
                type="button"
                className="change-portrait-btn"
                onClick={() => setShowPortraitModal(true)}
                disabled={!selectedGender}
              >
                Choose picture
              </button>
            </div>
          )}
          {!selectedGender && (
            <p className="field-hint">Choose a gender first to pick a portrait.</p>
          )}
        </div>
      </div> {/* End Top Container */}

      {/* Middle Container: Details Left, Stats Right */}
      <div className="middle-container">
        {/* Middle Left Column */}
        <div className="middle-left">
          {/* Apply Template Section */}
          <div className="form-section">
            <label htmlFor="template-select">Quick start — apply a class template:</label>
            <div className="template-controls" data-tour="hero-template">
              <select
                id="template-select"
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
              >
                <option value="">Select Class Template</option>
                {Object.keys(heroTemplates).map(className => (
                  <option key={className} value={className}>{className}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleApplyTemplate}
                disabled={!selectedTemplate}
                className="apply-template-btn"
              >
                Apply
              </button>
            </div>
          </div>

          {/* Details Row (Race, Class, Level, Alignment) */}
          <div className="form-row">
            {/* Race */}
            <div className="form-item">
              <label htmlFor="race">Race:</label>
              <select id="race" value={selectedRace} onChange={handleRaceChange} required>
                <option value="">Select Race</option>
                {heroRaces.map((race) => (
                  <option key={race} value={race}>{race}</option>
                ))}
              </select>
            </div>
            {/* Class */}
            <div className="form-item">
              <label htmlFor="class">Class:</label>
              <select id="class" value={selectedClass} onChange={handleClassChange} required>
                <option value="">Select Class</option>
                {heroClasses.map((cls) => (
                  <option key={cls} value={cls}>{cls}</option>
                ))}
              </select>
            </div>
            {/* Level (fixed at 1) */}
            <div className="form-item form-item-level">
              <label htmlFor="level">Level:</label>
              <span id="level" className="level-fixed" title="All heroes start at level 1">{heroLevel}</span>
            </div>
            {/* Alignment */}
            <div className="form-item form-item-alignment">
              <label htmlFor="alignment">Alignment:</label>
              <select id="alignment" value={alignment} onChange={handleAlignmentChange} required>
                <option value="">Choose Alignment</option>
                {alignmentOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div> {/* End Details Row */}

          {/* Background Story */}
          <div className="form-section">
            <label htmlFor="background">Background Story:</label>
            <textarea
              id="background"
              value={heroBackground}
              onChange={handleBackgroundChange}
              maxLength="200"
              placeholder="Enter hero background"
              rows="4"
              required
            />
          </div>
        </div> {/* End Middle Left */}

        {/* Middle Right Column */}
        <div className="middle-right" data-tour="hero-stats">
          {/* Stats — point-buy */}
          <h2>Stats</h2>
          <p className={`points-remaining${remainingPoints < 0 ? ' over-budget' : ''}`}>
            Points remaining: <strong>{remainingPoints}</strong> / {POINT_BUY_BUDGET}
          </p>
          <p className="points-hint">Scores 14 and 15 cost 2 points each.</p>
          <div className="stats-section">
            {STAT_KEYS.map((stat) => {
              const upCost = increaseCost(stats[stat]);
              const downRefund = decreaseRefund(stats[stat]);
              return (
                <div key={stat} className="stat-input pointbuy-row">
                  <label>{stat}:</label>
                  <div className="pointbuy-controls">
                    <button
                      type="button"
                      className="pointbuy-btn"
                      onClick={() => decreaseStat(stat)}
                      disabled={!canDecreaseStat(stats, stat)}
                      aria-label={`Decrease ${stat}${downRefund ? ` (refunds ${downRefund})` : ''}`}
                    >
                      {downRefund ? `−${downRefund}` : '−'}
                    </button>
                    <span className="pointbuy-value">{stats[stat]}</span>
                    <button
                      type="button"
                      className="pointbuy-btn"
                      onClick={() => increaseStat(stat)}
                      disabled={!canIncreaseStat(stats, stat)}
                      aria-label={`Increase ${stat}${upCost ? ` (costs ${upCost})` : ''}`}
                    >
                      {upCost ? `+${upCost}` : '+'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="max-hp-text">
            <span className="detail-label">Max HP:</span> {calculateMaxHP({ stats })}
          </p>
        </div> {/* End Middle Right */}
      </div> {/* End Middle Container */}

      {/* Actions Row */}
      <div className="form-actions">
        <button type="button" onClick={handleSubmit} data-tour="create-hero">{state?.editing ? "Update Hero" : "Create Hero"}</button>
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
                  navigate('/hero-summary', { state: { newCharacter: hero } });
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
