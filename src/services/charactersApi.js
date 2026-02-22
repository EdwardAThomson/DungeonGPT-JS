import { apiFetch, getErrorMessage } from './apiClient';

export const charactersApi = {
  async list() {
    const response = await apiFetch('/characters');
    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to fetch characters'));
    }
    return response.json();
  },

  async create(character) {
    const response = await apiFetch('/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(character),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to add character'));
    }
    return response.json();
  },

  async update(characterId, character) {
    const response = await apiFetch(`/characters/${characterId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(character),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to update character'));
    }
    return response.json();
  }
};

