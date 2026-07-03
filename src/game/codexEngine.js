// Codex engine (#51): the discovered-only compendium behind the Adventure Book's
// Codex tab. Two halves:
//
//   1. Entry generation — the Bestiary and Item lists are AUTO-GENERATED from live
//      game data (storyTemplates bosses, QUEST_ENEMIES, encounter-table hostiles,
//      ITEM_CATALOG). Zero authoring: adding an enemy or item to those sources adds
//      its codex card automatically. Entries are deliberately SPOILER-LIGHT — name,
//      art, flavor description, rarity/tier only. No drop tables, DCs, HP, or damage
//      profiles ever leave this module (the open repo is the soft ceiling on secrecy;
//      official surfaces stay mysterious).
//
//   2. Discovery tracking — pure, additive helpers over `settings.codex`
//      ({ items: [keys], enemies: [keys] }), persisted with the save like any other
//      setting (guests included). Items are discovered when they enter the party's
//      possession; enemies when an encounter with them RESOLVES (fought counts, win
//      or lose — you met the thing). Old saves without settings.codex start empty
//      and are seeded on load from the party's current inventory/equipment.
//
// All record* helpers return the SAME codex object when nothing changed, so callers
// (React setSettings updaters) can cheaply skip no-op writes.

import { encounterTables, poiEncounterTables } from '../data/encounterTables';
import { encounterTemplates } from '../data/encounters';
import { QUEST_ENEMIES } from '../data/questEnemies';
import { storyTemplates } from '../data/storyTemplates';
import { ITEM_CATALOG, RARITY_RANK } from '../utils/inventorySystem';

// --- Discovery set primitives -----------------------------------------------

export const slugify = (name) =>
  String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const createEmptyCodex = () => ({ items: [], enemies: [] });

/** Coerce whatever is stored on the save into { items: [], enemies: [] }.
 *  Returns the input object untouched when it is already well-formed (identity
 *  matters: callers use reference equality to detect no-op updates). */
export const normalizeCodex = (raw) => {
  if (raw && Array.isArray(raw.items) && Array.isArray(raw.enemies)) return raw;
  return {
    items: Array.isArray(raw?.items) ? raw.items : [],
    enemies: Array.isArray(raw?.enemies) ? raw.enemies : []
  };
};

/** Additively record item discoveries. Returns { codex, added }. `codex` is the
 *  same object as the (normalized) input when every key was already known. */
export const recordItemDiscoveries = (codex, itemKeys) => {
  const base = normalizeCodex(codex);
  const known = new Set(base.items);
  const added = [];
  (itemKeys || []).forEach((key) => {
    if (key && !known.has(key)) {
      known.add(key);
      added.push(key);
    }
  });
  if (added.length === 0) return { codex: base, added };
  return { codex: { ...base, items: [...base.items, ...added] }, added };
};

/** Every key an encounter can be recognized by later: authored enemy id, the
 *  encounter-table template key, and a slug of the display name (random-table
 *  encounters reach resolution carrying only some of these). */
export const enemyDiscoveryKeys = (encounter) => {
  const keys = [];
  const push = (k) => { if (k && !keys.includes(k)) keys.push(k); };
  push(encounter?.enemyId);
  push(encounter?.templateKey);
  push(slugify(encounter?.name));
  return keys;
};

/** Additively record an enemy discovery from a resolved encounter.
 *  Returns { codex, added } with the same identity contract as items. */
export const recordEnemyDiscovery = (codex, encounter) => {
  const base = normalizeCodex(codex);
  const keys = enemyDiscoveryKeys(encounter);
  if (keys.length === 0) return { codex: base, added: [] };
  const known = new Set(base.enemies);
  const added = keys.filter((k) => !known.has(k));
  if (added.length === 0) return { codex: base, added: [] };
  return { codex: { ...base, enemies: [...base.enemies, ...added] }, added };
};

/** All item keys currently in the party's possession (inventory + equipped). */
export const partyItemKeys = (party) => {
  const keys = new Set();
  (party || []).forEach((hero) => {
    (hero?.inventory || []).forEach((it) => {
      const k = typeof it === 'string' ? it : it?.key;
      if (k) keys.add(k);
    });
    Object.values(hero?.equipment || {}).forEach((k) => { if (k) keys.add(k); });
  });
  return [...keys];
};

/** Back-compat seeding: mark everything the party already carries as discovered.
 *  Silent (no "new entry" fanfare) and idempotent — returns the same codex object
 *  when nothing new is carried, so a React updater can skip the write. */
export const seedCodexFromParty = (codex, party) =>
  recordItemDiscoveries(codex, partyItemKeys(party)).codex;

// --- Discovery queries -------------------------------------------------------

export const isItemDiscovered = (codex, itemKey) =>
  normalizeCodex(codex).items.includes(itemKey);

/** A bestiary entry is discovered if ANY of its match keys was recorded. */
export const isEnemyDiscovered = (codex, entry) => {
  const known = new Set(normalizeCodex(codex).enemies);
  return (entry?.matchKeys || []).some((k) => known.has(k));
};

/** The bestiary entry a resolved encounter corresponds to, or null. Callers gate
 *  discovery recording on this so non-hostile narrative encounters (merchants,
 *  strangers, shrines) never mint phantom "new codex entry" announcements. */
export const findBestiaryMatch = (entries, encounter) => {
  const keys = new Set(enemyDiscoveryKeys(encounter));
  if (keys.size === 0) return null;
  return (entries || []).find((e) => (e.matchKeys || []).some((k) => keys.has(k))) || null;
};

// --- Entry generation (spoiler-light, zero authoring) ------------------------

const RARITY_ORDER = (rarity) => RARITY_RANK[rarity] ?? 0;

/** Item compendium from ITEM_CATALOG. Currency is excluded. Only flavor fields. */
export const getItemCodexEntries = () =>
  Object.entries(ITEM_CATALOG)
    .filter(([, item]) => !item.isGold)
    .map(([id, item]) => ({
      id,
      name: item.name || id,
      rarity: item.rarity || 'common',
      description: item.description || null,
      icon: item.icon || null,
      type: item.type || null
    }))
    .sort((a, b) => RARITY_ORDER(a.rarity) - RARITY_ORDER(b.rarity) || a.name.localeCompare(b.name));

// Keep ONLY flavor fields off an encounter block. HP / damage / DCs / rewards /
// suggested actions must not reach the UI (mystery line, #51).
const toBestiaryEntry = (id, source, category, tier) => ({
  id,
  name: source.name || id,
  icon: source.icon || null,
  image: source.image || null,
  description: source.description || null,
  category, // 'boss' | 'hostile'
  tier: tier ?? source.tier ?? null,
  matchKeys: [id, slugify(source.name)].filter((k, i, arr) => k && arr.indexOf(k) === i)
});

const collectHostileTemplateKeys = () => {
  const keys = new Set();
  const harvest = (table) => (table || []).forEach((row) => {
    if (row.hostile && row.template && row.template !== 'none') keys.add(row.template);
  });
  Object.values(encounterTables).forEach(harvest);
  Object.values(poiEncounterTables).forEach(harvest);
  return keys;
};

/**
 * The full bestiary: campaign bosses (storyTemplates), quest enemies
 * (QUEST_ENEMIES), and every hostile on the encounter tables. Pass the current
 * save's milestones so bosses that only exist on this save (premium templates,
 * chained campaigns) get cards too — deduped by enemy id, authored sources win.
 * Sorted: bosses by tier then name, then wilds hostiles by name.
 */
export const getBestiaryEntries = (milestones = []) => {
  const entries = new Map();
  const put = (id, entry) => { if (id && !entries.has(id)) entries.set(id, entry); };

  // 1. Campaign bosses authored in story templates.
  storyTemplates.forEach((t) => {
    (t.settings?.milestones || []).forEach((m) => {
      if (m.type === 'combat' && m.trigger?.enemy && m.encounter) {
        put(m.trigger.enemy, toBestiaryEntry(m.trigger.enemy, m.encounter, 'boss', t.tier));
      }
    });
  });

  // 2. Quest enemy registry (milestone combat pool).
  Object.entries(QUEST_ENEMIES).forEach(([id, enemy]) => {
    put(id, toBestiaryEntry(id, enemy, 'boss', enemy.tier));
  });

  // 3. Bosses carried by THIS save's milestones (covers premium/local templates
  //    whose data isn't in the public storyTemplates list).
  (milestones || []).forEach((m) => {
    if (m && m.type === 'combat' && m.trigger?.enemy && m.encounter) {
      put(m.trigger.enemy, toBestiaryEntry(m.trigger.enemy, m.encounter, 'boss', m.tier ?? null));
    }
  });

  // 4. Encounter-table hostiles (wilds, roads, caves, ruins, mountains...).
  collectHostileTemplateKeys().forEach((key) => {
    const template = encounterTemplates[key];
    if (template) put(key, toBestiaryEntry(key, template, 'hostile', null));
  });

  const all = [...entries.values()];
  const bosses = all.filter((e) => e.category === 'boss')
    .sort((a, b) => (a.tier ?? 99) - (b.tier ?? 99) || a.name.localeCompare(b.name));
  const hostiles = all.filter((e) => e.category !== 'boss')
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...hostiles, ...bosses];
};
