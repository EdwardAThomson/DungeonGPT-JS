import React from 'react';

// A row of selectable "chips" that replaces a dropdown for small option sets (single-select).
// The current value is highlighted; clicking a chip selects it. Keeps every choice visible and
// one tap away instead of hidden behind a popover.
//
// Props:
//   label    - field label (also the group's aria-label)
//   value    - currently selected value ('' = nothing selected)
//   options  - array of strings, or { value, label } objects
//   onChange - (value) => void
//   hint     - optional small helper text under the row
//   disabled - render as non-interactive
const SegmentedControl = ({ label, value, options = [], onChange, hint, disabled = false, id }) => (
  <div className="settings-group">
    {label && <label htmlFor={id}>{label}</label>}
    <div className="segmented-control" role="radiogroup" aria-label={label} id={id}>
      {options.map((opt) => {
        const optValue = typeof opt === 'string' ? opt : opt.value;
        const optLabel = typeof opt === 'string' ? opt : opt.label;
        const selected = value === optValue;
        return (
          <button
            key={optValue}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`segmented-option${selected ? ' selected' : ''}`}
            disabled={disabled}
            onClick={() => onChange(optValue)}
          >
            {optLabel}
          </button>
        );
      })}
    </div>
    {hint && <span className="segmented-hint">{hint}</span>}
  </div>
);

export default SegmentedControl;
