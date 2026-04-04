import { apiFetch, getErrorMessage } from './apiClient';
import { supabase } from './supabaseClient';

// Use CF Worker in production, Express/SQLite in dev
const forceSQLite = process.env.REACT_APP_USE_SQLITE === 'true';
const isProduction = process.env.REACT_APP_CF_PAGES === 'true';
const useCfWorker = !forceSQLite && isProduction;

if (useCfWorker) {
  console.log('[heroesApi] Using CF Worker backend (production)');
} else {
  console.log('[heroesApi] Using Express/SQLite backend (dev)', forceSQLite ? '(forced via REACT_APP_USE_SQLITE)' : '');
}

const CF_WORKER_URL = process.env.REACT_APP_CF_WORKER_URL || '';

async function cfFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  const response = await fetch(`${CF_WORKER_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const msg = await getErrorMessage(response, `Request failed: ${path}`);
    throw new Error(msg);
  }
  return response.json();
}

// CF Worker implementation (production)
const cfWorkerHeroesApi = {
  async list() {
    return cfFetch('/api/db/heroes');
  },

  async create(hero) {
    return cfFetch('/api/db/heroes', {
      method: 'POST',
      body: JSON.stringify(hero),
    });
  },

  async update(heroId, hero) {
    return cfFetch(`/api/db/heroes/${heroId}`, {
      method: 'PUT',
      body: JSON.stringify(hero),
    });
  },

  async delete(heroId) {
    return cfFetch(`/api/db/heroes/${heroId}`, {
      method: 'DELETE',
    });
  }
};

// Express implementation (local dev)
const expressHeroesApi = {
  async list() {
    const response = await apiFetch('/heroes');
    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to fetch heroes'));
    }
    return response.json();
  },

  async create(hero) {
    const response = await apiFetch('/heroes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hero),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to add hero'));
    }
    return response.json();
  },

  async update(heroId, hero) {
    const response = await apiFetch(`/heroes/${heroId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hero),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to update hero'));
    }
    return response.json();
  },

  async delete(heroId) {
    const response = await apiFetch(`/heroes/${heroId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to delete hero'));
    }
    return response.json();
  }
};

export const heroesApi = {
  async list() {
    return useCfWorker ? cfWorkerHeroesApi.list() : expressHeroesApi.list();
  },

  async create(hero) {
    return useCfWorker ? cfWorkerHeroesApi.create(hero) : expressHeroesApi.create(hero);
  },

  async update(heroId, hero) {
    return useCfWorker ? cfWorkerHeroesApi.update(heroId, hero) : expressHeroesApi.update(heroId, hero);
  },

  async delete(heroId) {
    return useCfWorker ? cfWorkerHeroesApi.delete(heroId) : expressHeroesApi.delete(heroId);
  }
};
