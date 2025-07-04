import React from 'react';

// --- Settings Modal --- //
export const SettingsModalContent = ({ isOpen, onClose, settings, selectedProvider }) => {
  if (!isOpen) return null;

  const displaySetting = (value) => value || 'Not set';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Current Game Settings</h2>

        <div className="modal-section">
          <h4>Story & Mood</h4>
          <p><strong>Description:</strong> {displaySetting(settings.shortDescription)}</p>
          <p><strong>Grimness:</strong> {displaySetting(settings.grimnessLevel)}</p>
          <p><strong>Darkness:</strong> {displaySetting(settings.darknessLevel)}</p>
        </div>

        <div className="modal-section">
          <h4>World</h4>
          <p><strong>Magic Level:</strong> {displaySetting(settings.magicLevel)}</p>
          <p><strong>Technology Level:</strong> {displaySetting(settings.technologyLevel)}</p>
        </div>

        <div className="modal-section">
          <h4>AI</h4>
          <p><strong>Provider:</strong> {displaySetting(selectedProvider)}</p>
          <p><strong>Response Verbosity:</strong> {displaySetting(settings.responseVerbosity)}</p>
        </div>

        <button className="modal-close-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
};

// --- How to Play Modal --- //
export const HowToPlayModalContent = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>How to Play</h2>
        <p>
          Welcome to the adventure!
        </p>
        <p>
          Simply type what you want your character(s) to do in the text box below the conversation log and press Enter or click the Send button.
        </p>
        <p>
          The AI acts as the Dungeon Master (DM), describing the world, the results of your actions, and controlling any non-player characters (NPCs).
        </p>
        <p>
          Your party members and their stats are shown in the sidebar on the right. The game settings (like mood and magic level) influence the AI's responses.
        </p>
        <button className="modal-close-button" onClick={onClose}>
          Got it!
        </button>
      </div>
    </div>
  );
};
