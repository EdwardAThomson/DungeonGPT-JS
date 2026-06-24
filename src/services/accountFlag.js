// accountFlag.js
// A tiny, PII-free breadcrumb: "this browser has signed into an account before."
// Set on sign-in, it lets logged-out empty states tell the difference between a
// brand-new guest ("create your first hero") and a returning user whose heroes
// live in their account ("sign in to access them"). No hero/game data is stored —
// just a boolean — so it's safe to leave behind after logout.

const KEY = 'hadAccount';

export const markHadAccount = () => {
  try { localStorage.setItem(KEY, 'true'); } catch (e) { /* storage unavailable */ }
};

export const hasHadAccount = () => {
  try { return localStorage.getItem(KEY) === 'true'; } catch (e) { return false; }
};
