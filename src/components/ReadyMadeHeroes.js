// ReadyMadeHeroes.js
// Shared presentation for the ready-made hero picker (data: src/data/pregenHeroes.js).
// Two shapes over the same card: the glowing PregenBand for empty-roster surfaces
// (party selection, Hall of Heroes) and the quiet compact PregenStrip shown under a
// stocked roster. Styles live in heroes.css under "Ready-made hero picker".

import React from 'react';
import { resolveProfilePicture } from '../utils/assetHelper';

const PregenCard = ({ pregen, index, compact, disabled, onPick }) => (
  <button
    type="button"
    className={`pregen-card${compact ? ' compact' : ''}`}
    onClick={() => onPick(pregen)}
    disabled={disabled}
    title={`${pregen.heroClass}: ${pregen.tagline}`}
    style={compact ? undefined : { '--pregen-delay': `${index * 0.7}s` }}
  >
    <span className="pregen-portrait">
      <img
        src={resolveProfilePicture(pregen.profilePicture)}
        alt=""
        loading="lazy"
        width={compact ? 64 : 128}
        height={compact ? 64 : 128}
      />
    </span>
    <span className="pregen-text">
      <span className="pregen-name">{pregen.heroName}</span>
      <span className="pregen-sub">
        {compact ? pregen.heroClass : `${pregen.heroClass} · ${pregen.tagline}`}
      </span>
    </span>
  </button>
);

export const PregenBand = ({ pregens, disabled = false, onPick, title, note }) => (
  <div className="pregen-band-wrap">
    {/* Heading sits ABOVE the bordered container, like other section headers */}
    <h3 className="pregen-band-title">{title || '⚔ Choose a ready-made hero to begin'}</h3>
    <div className="pregen-band">
      <div className="pregen-grid">
        {pregens.map((p, i) => (
          <PregenCard key={p.heroName} pregen={p} index={i} compact={false} disabled={disabled} onPick={onPick} />
        ))}
      </div>
      {note && <p className="pregen-band-note">{note}</p>}
    </div>
  </div>
);

export const PregenStrip = ({ pregens, disabled = false, onPick, label = 'Ready-made heroes' }) => (
  <div className="pregen-strip">
    <span className="pregen-strip-label">{label}</span>
    <div className="pregen-strip-cards">
      {pregens.map((p, i) => (
        <PregenCard key={p.heroName} pregen={p} index={i} compact disabled={disabled} onPick={onPick} />
      ))}
    </div>
  </div>
);
