import { apiFetch, getErrorMessage } from './apiClient';
import { supabase } from './supabaseClient';
import { localGameStore } from './localGameStore';

// Use CF Worker in production, Express/SQLite in dev
const forceSQLite = process.env.REACT_APP_USE_SQLITE === 'true';
const isProduction = process.env.REACT_APP_CF_PAGES === 'true';
const useCfWorker = !forceSQLite && isProduction;

if (useCfWorker) {
  console.log('[conversationsApi] Using CF Worker backend (production)');
} else {
  console.log('[conversationsApi] Using Express/SQLite backend (dev)', forceSQLite ? '(forced via REACT_APP_USE_SQLITE)' : '');
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
const cfWorkerConversationsApi = {
  async list() {
    return cfFetch('/api/db/conversations');
  },

  async getById(sessionId) {
    return cfFetch(`/api/db/conversations/${sessionId}`);
  },

  async save(payload) {
    return cfFetch('/api/db/conversations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateMessages(sessionId, conversationData) {
    return cfFetch(`/api/db/conversations/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify({ conversation_data: conversationData }),
    });
  },

  async updateName(sessionId, conversationName) {
    return cfFetch(`/api/db/conversations/${sessionId}/name`, {
      method: 'PUT',
      body: JSON.stringify({ conversationName }),
    });
  },

  async remove(sessionId) {
    return cfFetch(`/api/db/conversations/${sessionId}`, {
      method: 'DELETE',
    });
  }
};

// Express implementation (local dev)
const expressConversationsApi = {
  async list() {
    const response = await apiFetch('/api/conversations');
    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to fetch conversations'));
    }
    return response.json();
  },

  async getById(sessionId) {
    const response = await apiFetch(`/api/conversations/${sessionId}`);
    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to load conversation'));
    }
    return response.json();
  },

  async save(payload) {
    const response = await apiFetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to save conversation'));
    }
    return response.json();
  },

  async updateMessages(sessionId, conversationData) {
    const response = await apiFetch(`/api/conversations/${sessionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_data: conversationData }),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to update conversation'));
    }
    return response.json();
  },

  async updateName(sessionId, conversationName) {
    const response = await apiFetch(`/api/conversations/${sessionId}/name`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationName }),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to update conversation name'));
    }
    return response.json();
  },

  async remove(sessionId) {
    const response = await apiFetch(`/api/conversations/${sessionId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to delete conversation'));
    }
    return response.json();
  }
};

const backend = useCfWorker ? cfWorkerConversationsApi : expressConversationsApi;

// Logged-out (guest) players save/load games to a browser-local IndexedDB store;
// signed-in players use the cloud backend. Local games are synced on sign-in.
async function isSignedIn() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return !!session?.access_token;
  } catch (e) {
    return false;
  }
}

export const conversationsApi = {
  async list() {
    return (await isSignedIn()) ? backend.list() : localGameStore.list();
  },

  async getById(sessionId) {
    return (await isSignedIn()) ? backend.getById(sessionId) : localGameStore.getById(sessionId);
  },

  async save(payload) {
    return (await isSignedIn()) ? backend.save(payload) : localGameStore.save(payload);
  },

  async updateMessages(sessionId, conversationData) {
    return (await isSignedIn()) ? backend.updateMessages(sessionId, conversationData) : localGameStore.updateMessages(sessionId, conversationData);
  },

  async updateName(sessionId, conversationName) {
    return (await isSignedIn()) ? backend.updateName(sessionId, conversationName) : localGameStore.updateName(sessionId, conversationName);
  },

  async remove(sessionId) {
    return (await isSignedIn()) ? backend.remove(sessionId) : localGameStore.remove(sessionId);
  }
};
