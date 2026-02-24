import { apiFetch, getErrorMessage } from './apiClient';

export const heroesApi = {
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
  }
};

