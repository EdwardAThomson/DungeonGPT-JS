// PortraitPickerModal.js
// Modal grid for choosing a hero portrait. Gender lives on the creation form (it's
// tied to the name) and is passed in here to filter which portraits are shown. Picking one
// closes the picker (HeroCreation's onSelect). Rendered in the shared RdDialog shell.

import React from 'react';
import { profilePictures } from '../data/heroData';
import RdDialog from './RdDialog';

const PortraitPickerModal = ({ gender, selected, onSelect, onClose }) => {
  const options = profilePictures.filter((pic) => pic.gender === gender);

  return (
    <RdDialog title="Choose a portrait" wide onClose={onClose} actions={<button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>}>
      {options.length === 0 ? (
        <p>Select a gender on the form first to see matching portraits.</p>
      ) : (
        <div className="portrait-choices">
          {options.map((pic) => (
            <button
              key={pic.imageId}
              type="button"
              className={`portrait-pick${selected === pic.src ? ' on' : ''}`}
              onClick={() => onSelect(pic.src)}
              aria-label={`Portrait ${pic.imageId}`}
              aria-pressed={selected === pic.src}
            >
              <img src={pic.src} alt={`Portrait ${pic.imageId}`} />
            </button>
          ))}
        </div>
      )}
    </RdDialog>
  );
};

export default PortraitPickerModal;
