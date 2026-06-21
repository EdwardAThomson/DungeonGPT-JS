// localHeroStore.js
// Browser-local hero roster for logged-out (guest) players. Heroes are kept in
// localStorage so people can build a roster before creating an account; on
// sign-in they're imported to the cloud and cleared from here (see LocalHeroSync).
// Mirrors the heroesApi CRUD shape so it can be used interchangeably.

import { createLogger } from '../utils/logger';

const logger = createLogger('local-hero-store');
const KEY = 'dungeongpt:localHeroes';

const read = () => {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    logger.error('Failed to read local heroes:', e);
    return [];
  }
};

const write = (heroes) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(heroes));
  } catch (e) {
    logger.error('Failed to write local heroes:', e);
  }
};

export const localHeroStore = {
  // Synchronous read for callers that aren't async (e.g. routing decisions).
  listSync() {
    return read();
  },

  hasHeroes() {
    return read().length > 0;
  },

  async list() {
    return read();
  },

  async create(hero) {
    const heroes = read();
    heroes.push(hero);
    write(heroes);
    return hero;
  },

  async update(heroId, hero) {
    const heroes = read().map((h) => (h.heroId === heroId ? { ...h, ...hero } : h));
    write(heroes);
    return hero;
  },

  async delete(heroId) {
    write(read().filter((h) => h.heroId !== heroId));
    return { success: true };
  },

  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      logger.error('Failed to clear local heroes:', e);
    }
  },
};
