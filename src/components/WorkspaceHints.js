// WorkspaceHints: first-time tips for the #84 workspace (map stage + docked log). Each
// tip shows once, when its situation first comes up (on the world map, when suggestion
// buttons appear, inside a town), using the same coach-mark look as the guided tour.
// "Got it" retires that tip; "Skip tips" retires them all. Seen tips are kept per
// browser; if storage is blocked they simply show again next visit.

import React, { useState } from 'react';
import { Coachmark } from './TourOverlay';

const SEEN_KEY = 'dgpt:wsHintsSeen';

export const WORKSPACE_HINTS = [
  {
    id: 'ws-move',
    inside: '.ws-stage-map',
    title: 'Moving around',
    body: 'Click a neighbouring tile to step there, or any tile further away and your party walks the whole route. A random encounter can stop the journey: press Continue to carry on. Click the map while travelling to stop.',
    when: (s) => s.started && s.level === 'world',
  },
  {
    id: 'ws-suggest',
    target: '.ws-chips',
    title: 'Suggested actions',
    body: 'These buttons follow your quest: travel to the next objective, enter a town, or walk straight to the right building. They only point at places you already know about.',
    when: (s) => s.started && s.suggestions > 0,
  },
  {
    id: 'ws-town',
    inside: '.ws-stage-map',
    title: 'Inside a town',
    body: 'Click a street to walk there. Click a building to look inside: you need to be within three tiles, unless you have been there before. Leave by the gate with the yellow outline, or use a Travel button.',
    when: (s) => s.started && s.level === 'town',
  },
];

const readSeen = () => {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch (e) { return []; }
};

/** The tip to show now: the first unseen one whose situation holds, or null. */
export const pickHint = (state, seen = []) =>
  WORKSPACE_HINTS.find((h) => !seen.includes(h.id) && h.when(state)) || null;

const WorkspaceHints = ({ started, level, suggestions = 0, paused = false }) => {
  const [seen, setSeen] = useState(readSeen);
  const [minimized, setMinimized] = useState(null);
  const remember = (ids) => {
    const next = [...new Set([...seen, ...ids])];
    setSeen(next);
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch (e) { /* in-memory only */ }
  };
  if (paused) return null; // never sit over a pop-up
  const hint = pickHint({ started, level, suggestions }, seen);
  if (!hint) return null;
  return (
    <div className="ws-hints">
    <Coachmark
      step={hint}
      minimized={minimized === hint.id}
      onNext={() => remember([hint.id])}
      onSkip={() => remember(WORKSPACE_HINTS.map((h) => h.id))}
      onMinimize={() => setMinimized(hint.id)}
      onExpand={() => setMinimized(null)}
      skipLabel="Skip tips"
    />
    </div>
  );
};

export default WorkspaceHints;
