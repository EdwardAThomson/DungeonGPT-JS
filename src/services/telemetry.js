// telemetry.js
// Privacy-light product analytics (backlog #86): anonymous fire-and-forget
// events to the Worker's /api/events. Design rules:
//   - anon id only (random, minted client-side, browser-scoped); never a user
//     id, never PII. The server additionally enforces an event-name allowlist.
//   - fire-and-forget: failures are swallowed, requests use keepalive, and
//     telemetry must never slow or break the game.
//   - no-op when the Worker URL is unset (local Express-only dev) or when the
//     opt-out flag is set.

import { createLogger } from '../utils/logger';

const logger = createLogger('telemetry');
const CF_WORKER_URL = process.env.REACT_APP_CF_WORKER_URL || '';
const ANON_ID_KEY = 'dungeongpt:anonId';
const OPT_OUT_KEY = 'dungeongpt:telemetryOff';

const getAnonId = () => {
  try {
    let id = localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch (e) {
    return null; // storage unavailable (private mode): silently no-op
  }
};

// One-shot dedupe per page load for events that should fire at most once
// (app_open, ai_gate_shown, ...).
const firedOnce = new Set();

export const sendEvent = (event, props = {}, { once = false } = {}) => {
  try {
    if (!CF_WORKER_URL) return;
    if (localStorage.getItem(OPT_OUT_KEY) === 'true') return;
    if (once) {
      if (firedOnce.has(event)) return;
      firedOnce.add(event);
    }
    const anonId = getAnonId();
    if (!anonId) return;
    fetch(`${CF_WORKER_URL}/api/events`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, anonId, props }),
    }).catch(() => {});
  } catch (e) {
    logger.debug('telemetry drop:', e?.message);
  }
};

// Turn milestones: count player actions (world moves + free-text actions) per
// game session and emit first_action / turn_3 / turn_10 exactly once each.
const turnCounts = new Map();

export const recordTurn = (sessionId) => {
  const key = sessionId || 'no-session';
  const n = (turnCounts.get(key) || 0) + 1;
  turnCounts.set(key, n);
  if (n === 1) sendEvent('first_action', { sessionId: key });
  else if (n === 3) sendEvent('turn_3', { sessionId: key });
  else if (n === 10) sendEvent('turn_10', { sessionId: key });
};
