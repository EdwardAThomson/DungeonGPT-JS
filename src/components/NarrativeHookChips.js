import React from 'react';

// Action chips for a narrative-tier encounter hook woven into a Look-around
// narration (#35). Renders the encounter's suggestedActions as tappable pills
// (echoing the SegmentedControl chip look) plus an "Ignore" chip, and, when the
// encounter has one, a small preview image (#37; the action modal shows the
// full image once the player engages).
//
// This block is driven entirely by TRANSIENT state in Game.js: conversation
// messages persist in saves, so nothing here is ever written into the message:
// on reload the chips are simply gone.
//
// Props:
//   encounter - the encounter template ({ name, image?, suggestedActions?, ... })
//   onAction  - (action) => void; tapping any suggested action engages the encounter
//   onIgnore  - () => void; dismisses the chips without engaging
const NarrativeHookChips = ({ encounter, onAction, onIgnore }) => {
  if (!encounter) return null;
  const actions = Array.isArray(encounter.suggestedActions) ? encounter.suggestedActions : [];

  return (
    <div className="narrative-hook-chips" role="group" aria-label={`Respond to ${encounter.name || 'the encounter'}`}>
      {encounter.image && (
        <img
          src={encounter.image}
          alt={encounter.name || 'Encounter'}
          className="narrative-hook-image"
          loading="lazy"
        />
      )}
      <div className="narrative-hook-chip-row">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className="narrative-hook-chip"
            title={action.description ? `${action.description}${action.skill ? ` (${action.skill})` : ''}` : undefined}
            onClick={() => onAction(action)}
          >
            {action.label}
          </button>
        ))}
        <button
          type="button"
          className="narrative-hook-chip narrative-hook-chip-ignore"
          title="Let it go and move on"
          onClick={onIgnore}
        >
          Ignore
        </button>
      </div>
    </div>
  );
};

export default NarrativeHookChips;
