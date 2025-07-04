// CharacterCreation.js

import React, { useState, useContext } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";

import CharacterContext from "./CharacterContext";


const profilePictures = [
  // images are in the Public directory (not src).
  { imageId: 1, src: "barbarian.png" },
  { imageId: 2, src: "wizard.png" },
  { imageId: 3, src: "ranger.png" },
  { imageId: 4, src: "paladin.png" },
  { imageId: 5, src: "cleric.png" },
  { imageId: 6, src: "bard.png" },
  { imageId: 7, src: "fighter.png" },
  { imageId: 8, src: "druid.png" },

  // ...
];

const characterGenders = ["Male", "Female"];
const characterClasses = ["Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard"]
const characterRaces = ["Human", "Dwarf", "Elf", "Halfling", "Dragonborn", "Gnome", "Half-Elf", "Half-Orc", "Tiefling"];

const alignmentOptions = [
  "Lawful Good",
  "Neutral Good",
  "Chaotic Good",
  "Lawful Neutral",
  "True Neutral",
  "Chaotic Neutral",
  "Lawful Evil",
  "Neutral Evil",
  "Chaotic Evil",
];

const initialStats = {
  Strength: 8,
  Dexterity: 8,
  Constitution: 8,
  Intelligence: 8,
  Wisdom: 8,
  Charisma: 8,
};

// --- Sample Name Lists (Expand these!) ---
const maleFantasyFirstNames = ["Aelar", "Cael", "Darius", "Finnian", "Gareth", "Joric", "Kaelen", "Marius", "Orion", "Peregrine", "Ronan", "Tavish", "Uriel", "Warrick", "Zephyr"];
const femaleFantasyFirstNames = ["Brynn", "Elara", "Isolde", "Lyra", "Nadia", "Quilla", "Seraphina", "Vanya", "Xylia", "Yarrow", "Anya", "Fiona", "Genevieve", "Helena", "Rowan"];
// Keep last names gender-neutral for simplicity
const fantasyLastNames = ["Ashwood", "Blackwater", "Copperleaf", "Dawnbringer", "Evenfall", "Frostbeard", "Goldfeather", "Highwind", "Ironhand", "Jadefire", "Kingsley", "Lightfoot", "Moonwhisper", "Nightshade", "Oakenshield", "Pinecroft", "Quickfoot", "Redfern", "Shadowclaw", "Stormblade", "Thornwood", "Underhill", "Valerius", "Wolfsbane", "Youngblood", "Zephyrson"];

// --- Character Class Templates (Level 1) ---
const characterTemplates = {
  Barbarian: {
    race: "Half-Orc",
    stats: { Strength: 15, Dexterity: 13, Constitution: 14, Intelligence: 8, Wisdom: 12, Charisma: 10 },
    alignment: "Chaotic Neutral",
    backgroundSnippet: "Hails from a remote tribe, fiercely protective and quick to anger.",
  },
  Bard: {
    race: "Half-Elf",
    stats: { Strength: 10, Dexterity: 14, Constitution: 12, Intelligence: 10, Wisdom: 13, Charisma: 15 },
    alignment: "Chaotic Good",
    backgroundSnippet: "A charismatic wanderer who collects stories and inspires others.",
  },
  Cleric: {
    race: "Human",
    stats: { Strength: 14, Dexterity: 10, Constitution: 13, Intelligence: 10, Wisdom: 15, Charisma: 12 },
    alignment: "Lawful Good",
    backgroundSnippet: "Devoted servant of a deity, provides healing and guidance.",
  },
  Druid: {
    race: "Elf", // Wood Elf often
    stats: { Strength: 10, Dexterity: 14, Constitution: 13, Intelligence: 12, Wisdom: 15, Charisma: 10 },
    alignment: "Neutral",
    backgroundSnippet: "Guardian of the wilds, draws power from nature itself.",
  },
  Fighter: {
    race: "Dwarf", // Hill Dwarf often
    stats: { Strength: 15, Dexterity: 10, Constitution: 14, Intelligence: 10, Wisdom: 13, Charisma: 12 },
    alignment: "Lawful Neutral",
    backgroundSnippet: "A disciplined warrior, master of arms and tactics.",
  },
  Monk: {
    race: "Human",
    stats: { Strength: 10, Dexterity: 15, Constitution: 13, Intelligence: 10, Wisdom: 14, Charisma: 12 },
    alignment: "Lawful Neutral",
    backgroundSnippet: "A practitioner of ancient martial arts, seeks inner harmony.",
  },
  Paladin: {
    race: "Dragonborn",
    stats: { Strength: 15, Dexterity: 10, Constitution: 13, Intelligence: 10, Wisdom: 12, Charisma: 14 },
    alignment: "Lawful Good",
    backgroundSnippet: "A holy warrior bound by an oath to uphold justice and righteousness.",
  },
  Ranger: {
    race: "Elf", // Wood Elf often
    stats: { Strength: 10, Dexterity: 15, Constitution: 13, Intelligence: 10, Wisdom: 14, Charisma: 12 },
    alignment: "Neutral Good",
    backgroundSnippet: "A skilled hunter and tracker, comfortable in the wilderness.",
  },
  Rogue: {
    race: "Halfling", // Lightfoot often
    stats: { Strength: 8, Dexterity: 15, Constitution: 12, Intelligence: 14, Wisdom: 10, Charisma: 14 },
    alignment: "Chaotic Neutral",
    backgroundSnippet: "Operates in the shadows, relies on stealth and cunning.",
  },
  Sorcerer: {
    race: "Tiefling",
    stats: { Strength: 8, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 15 },
    alignment: "Chaotic Good",
    backgroundSnippet: "Wields innate magical power derived from an arcane bloodline.",
  },
  Warlock: {
    race: "Tiefling",
    stats: { Strength: 8, Dexterity: 13, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 15 },
    alignment: "Chaotic Neutral",
    backgroundSnippet: "Gained magical abilities through a pact with an otherworldly patron.",
  },
  Wizard: {
    race: "Gnome", // Rock Gnome often
    stats: { Strength: 8, Dexterity: 14, Constitution: 14, Intelligence: 15, Wisdom: 12, Charisma: 10 },
    alignment: "Lawful Neutral",
    backgroundSnippet: "A dedicated scholar of the arcane arts, seeks knowledge and power.",
  },
};

const CharacterCreation = () => {

  const { characters, setCharacters, editingCharacterIndex, setEditingCharacterIndex } = useContext(CharacterContext);

  const { state } = useLocation();
  const characterToEdit = state?.newCharacter || characters[editingCharacterIndex];


  // State for selected template
  const [selectedTemplate, setSelectedTemplate] = useState('');

  /*
   Name
   Gender
   Profile Picture
   Race
   Class
   Level
   Stats
   Background
   Alignment
   */
  const [characterName, setCharacterName] = useState(characterToEdit?.characterName || "");
  const [selectedGender, setSelectedGender] = useState(characterToEdit?.characterGender || "");
  const [selectedProfilePicture, setSelectedProfilePicture] = useState(characterToEdit?.profilePicture || null);
  const [selectedRace, setSelectedRace] = useState(characterToEdit?.characterRace || "");
  const [selectedClass, setSelectedClass] = useState(characterToEdit?.characterClass || "");
  const [level, setLevel] = useState(characterToEdit?.characterLevel || 1);
  const [stats, setStats] = useState(characterToEdit?.stats || initialStats);
  const [characterBackground, setCharacterBackground] = useState(characterToEdit?.characterBackground || "");
  const [alignment, setAlignment] = useState(characterToEdit?.characterAlignment || "");

  const navigate = useNavigate();

  const handleProfilePictureChange = (e) => {
    setSelectedProfilePicture(e.target.value);
  };

  const handleGenderChange = (e) => {
    setSelectedGender(e.target.value);
  };

  const handleRaceChange = (e) => {
    setSelectedRace(e.target.value);
  };

  const handleClassChange = (e) => {
    setSelectedClass(e.target.value);
  };

  const handleStatChange = (stat, value) => {
    setStats((prevStats) => ({
      ...prevStats,
      [stat]: parseInt(value) || 0,
    }));
  };

  const handleLevelChange = (e) => setLevel(parseInt(e.target.value) || 1);

  const handleAlignmentChange = (e) => setAlignment(e.target.value);

  const handleNameChange = (e) => setCharacterName(e.target.value);

  const handleBackgroundChange = (e) => setCharacterBackground(e.target.value);

  // --- New Template Application Function ---
  const handleApplyTemplate = () => {
    if (!selectedTemplate || !characterTemplates[selectedTemplate]) {
      alert("Please select a class template to apply.");
      return;
    }
    const template = characterTemplates[selectedTemplate];

    // Apply template values to state
    setSelectedClass(selectedTemplate); // Set class to the selected template key
    setSelectedRace(template.race);
    setStats(template.stats);
    setAlignment(template.alignment);
    setCharacterBackground(template.backgroundSnippet);
    setLevel(1); // Always set level to 1 for templates
  };

  const handleSubmit = async () => {
    // Specific check for profile picture first
    if (!selectedProfilePicture) {
      alert("Please select a profile picture.");
      return;
    }

    // Check other required fields
    if (!characterName || !selectedRace || !selectedClass || !characterBackground || !alignment || !selectedGender || !level) {
      alert("Please fill in all remaining character details (Name, Gender, Race, Class, Level, Alignment, Background).");
      return;
    }

    // If all checks pass, proceed
    const newCharacter = {
      characterId: characterToEdit?.characterId || uuidv4(),
      characterName: characterName,
      characterGender: selectedGender,
      profilePicture: selectedProfilePicture,
      characterRace: selectedRace,
      characterClass: selectedClass,
      characterLevel: level,
      characterBackground: characterBackground,
      characterAlignment: alignment,
      stats: stats,
    };

    if (state?.editing) {
      // Don't update context here, just navigate back to summary with updated data
      /*
      const updatedCharacters = characters.map((char, index) =>
        index === editingCharacterIndex ? newCharacter : char
      );
      setCharacters(updatedCharacters);
      setEditingCharacterIndex(null);
      navigate("/all-characters");
      */
      // Navigate back to summary page with the edited character data
      navigate("/character-summary", { state: { newCharacter } });
    } else {
      // This is for initial creation, navigate to summary
      navigate("/character-summary", { state: { newCharacter } });
    }
  };

  // --- Update Name Generation Function --- // (Moved definition up)
  const generateRandomName = () => {
    let firstName;
    // Choose list based on selected gender
    if (selectedGender === "Male") {
      firstName = maleFantasyFirstNames[Math.floor(Math.random() * maleFantasyFirstNames.length)];
    } else if (selectedGender === "Female") {
      firstName = femaleFantasyFirstNames[Math.floor(Math.random() * femaleFantasyFirstNames.length)];
    } else {
      // Default: Combine lists or pick from one if gender is not set or 'Other'
      const combinedFirstNames = [...maleFantasyFirstNames, ...femaleFantasyFirstNames];
      firstName = combinedFirstNames[Math.floor(Math.random() * combinedFirstNames.length)];
    }

    const lastName = fantasyLastNames[Math.floor(Math.random() * fantasyLastNames.length)];
    setCharacterName(`${firstName} ${lastName}`);
  };

  return (
    <div className="Home-page character-creation-form">
      {/* Top Container: Header, Name, Gender, and Pictures */}
      <div className="top-container">
        {/* Header + Name */}
        <div className="form-section">
          <h1>{state?.editing ? "Edit Character" : "Create Your Character"}</h1>
          <div className="name-section">
            <label htmlFor="characterName">Character Name:</label>
            <div className="name-input-group">
              <input
                type="text"
                id="characterName"
                maxLength="50"
                placeholder="Enter or Generate Name"
                value={characterName}
                onChange={handleNameChange}
                required
              />
              <button type="button" onClick={generateRandomName} className="generate-name-btn" title="Generate Random Name">
                🎲
              </button>
            </div>
          </div>
        </div>

        {/* Gender Selection - Moved here */}
        <div className="form-section">
            <label htmlFor="gender">Gender:</label>
            <select id="gender" value={selectedGender} onChange={handleGenderChange} required>
              <option value="">Select Gender</option>
              {characterGenders.map((characterGender) => (
                <option key={characterGender} value={characterGender}>
                  {characterGender}
                </option>
              ))}
            </select>
        </div>

        {/* Picture Selection */}
        <div className="form-section profile-pictures">
          <label>Profile Picture:</label>
          <div className="picture-options">
            {profilePictures.map((pic) => (
              <label key={pic.imageId} className={selectedProfilePicture === pic.src ? 'selected' : ''}>
                <input
                  type="radio"
                  name="profilePicture"
                  value={pic.src}
                  checked={selectedProfilePicture === pic.src}
                  onChange={handleProfilePictureChange}
                  required
                />
                <img src={pic.src} alt={`Profile ${pic.imageId}`} />
              </label>
            ))}
          </div>
        </div>
      </div> {/* End Top Container */}

      {/* Middle Container: Details Left (NO GENDER), Stats Right */}
      <div className="middle-container">
        {/* Middle Left Column */}
        <div className="middle-left">
          {/* Apply Template Section - NEW */}
          <div className="form-section">
            <label htmlFor="template-select">Apply Class Template (Level 1):</label>
            <div className="template-controls">
              <select
                id="template-select"
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
              >
                <option value="">Select Class Template</option>
                {Object.keys(characterTemplates).map(className => (
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

          {/* Details Row (Race, Class, Level, Alignment ONLY) */}
          <div className="form-row">
           {/* Race */}
            <div className="form-item">
              <label htmlFor="race">Race:</label>
              <select id="race" value={selectedRace} onChange={handleRaceChange} required>
                <option value="">Select Race</option>
                {characterRaces.map((race) => (
                  <option key={race} value={race}>{race}</option>
                ))}
              </select>
            </div>
            {/* Class */}
            <div className="form-item">
              <label htmlFor="class">Class:</label>
              <select id="class" value={selectedClass} onChange={handleClassChange} required>
                <option value="">Select Class</option>
                {characterClasses.map((cls) => (
                  <option key={cls} value={cls}>{cls}</option>
                ))}
              </select>
            </div>
            {/* Level */}
            <div className="form-item form-item-level">
              <label htmlFor="level">Level:</label>
              <input
                type="number"
                id="level"
                min="1"
                max="20"
                value={level}
                onChange={handleLevelChange}
                required
              />
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
              value={characterBackground}
              onChange={handleBackgroundChange}
              maxLength="200"
              placeholder="Enter character background"
              rows="4"
              required
            />
          </div>
        </div> {/* End Middle Left */}

        {/* Middle Right Column */}
        <div className="middle-right">
          {/* Stats */}
          <h2>Stats</h2>
          <div className="stats-section">
            {Object.entries(stats).map(([stat, value]) => (
              <div key={stat} className="stat-input">
                <label htmlFor={stat}>{stat}:</label>
                <input
                  type="number"
                  id={stat}
                  min="1"
                  max="20"
                  value={value}
                  onChange={(e) => handleStatChange(stat, e.target.value)}
                  required
                />
              </div>
            ))}
          </div>
        </div> {/* End Middle Right */}
      </div> {/* End Middle Container */}

      {/* Actions Row */}
      <div className="form-actions">
        <button type="button" onClick={handleSubmit}>{state?.editing ? "Update Character" : "Create Character"}</button>
      </div>
    </div>
  );
};

export default CharacterCreation;
