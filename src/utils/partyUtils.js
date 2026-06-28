// Canonical hero identity + safe party updates.
//
// Heroes created in the app carry `heroId` (a uuid from HeroCreation); only the dev-only
// Express server and debug pages use `characterId`. Code that matched heroes on
// `characterId` alone therefore compared `undefined === undefined`, which is TRUE for every
// real hero — so a single-hero update overwrote the ENTIRE party with one hero. That is the
// cause of the combat hero-duplication bug (a 2-hero party becoming [Vanya, Vanya] after one
// hero took damage). Always match on this combined key, and NEVER match a missing id.

export const heroUid = (h) => (h && (h.heroId || h.characterId)) || null;

/**
 * Return a new party with the one hero sharing `updatedHero`'s id replaced.
 * If the updated hero has no stable id, the party is returned unchanged (we would rather
 * skip the update than overwrite every hero).
 * @param {Array} party
 * @param {Object} updatedHero
 * @returns {Array}
 */
export const replaceHeroInParty = (party, updatedHero) => {
  if (!Array.isArray(party)) return party;
  const uid = heroUid(updatedHero);
  if (!uid) return party;
  return party.map((h) => (heroUid(h) === uid ? updatedHero : h));
};

/**
 * Normalize a loaded party: guarantee each hero has a stable `heroId`, migrate the legacy
 * `characterId` onto `heroId` then drop it, and de-duplicate heroes that share an id. This
 * repairs saves corrupted by the old overwrite-all bug (collapses [Vanya, Vanya] back to a
 * single Vanya), though a hero that was overwritten in the save cannot be recovered. Pure.
 * @param {Array} heroes
 * @returns {Array}
 */
export const normalizeParty = (heroes) => {
  if (!Array.isArray(heroes)) return heroes;
  const seen = new Set();
  const out = [];
  heroes.forEach((h, i) => {
    if (!h || typeof h !== 'object') return;
    const uid = heroUid(h) || `legacy-${i}`;
    if (seen.has(uid)) return; // de-dupe heroes sharing an id
    seen.add(uid);
    const rest = { ...h };
    delete rest.characterId; // remove the legacy field; heroId is the canonical id now
    out.push(rest.heroId ? rest : { ...rest, heroId: uid });
  });
  return out;
};
