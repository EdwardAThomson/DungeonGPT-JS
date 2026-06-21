// PortraitPickerModal.js
// Modal grid for choosing a hero portrait. Gender lives on the creation form (it's
// tied to the name) and is passed in here to filter which portraits are shown.

import React from 'react';
import { profilePictures } from '../data/heroData';

const PortraitPickerModal = ({ gender, selected, onSelect, onClose }) => {
  const options = profilePictures.filter((pic) => pic.gender === gender);

  return (
    <div className="modal-overlay portrait-modal-overlay" onClick={onClose}>
      <div className="modal-content portrait-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="portrait-modal-title">Choose a Portrait</h3>
        {options.length === 0 ? (
          <p>Select a gender on the form first to see matching portraits.</p>
        ) : (
          <div className="portrait-modal-grid">
            {options.map((pic) => (
              <button
                key={pic.imageId}
                type="button"
                className={`portrait-option${selected === pic.src ? ' selected' : ''}`}
                onClick={() => onSelect(pic.src)}
                aria-label={`Portrait ${pic.imageId}`}
                aria-pressed={selected === pic.src}
              >
                <img src={pic.src} alt={`Portrait ${pic.imageId}`} />
              </button>
            ))}
          </div>
        )}
        <div className="portrait-modal-actions">
          <button className="modal-close-button" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
};

export default PortraitPickerModal;
