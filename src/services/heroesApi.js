import { apiFetch, getErrorMessage } from './apiClient';
import { supabase } from './supabaseClient';

// Use Supabase only in production (CloudFlare Pages)
// In dev, always use Express/SQLite even if Supabase is configured
const isProduction = process.env.REACT_APP_CF_PAGES === 'true';
const useSupabase = isProduction && !!supabase;

if (useSupabase) {
  console.log('[heroesApi] Using Supabase backend (production)');
} else {
  console.log('[heroesApi] Using Express/SQLite backend (dev)');
}

// Supabase implementation
const supabaseHeroesApi = {
  async list() {
    if (!supabase) {
      throw new Error('Supabase not configured');
    }
    
    const { data, error } = await supabase
      .from('heroes')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw new Error(`Failed to fetch heroes: ${error.message}`);
    return data || [];
  },

  async create(hero) {
    if (!supabase) {
      throw new Error('Supabase not configured');
    }
    
    const { data, error } = await supabase
      .from('heroes')
      .insert([{
        hero_id: hero.heroId,
        name: hero.name,
        race: hero.race,
        class: hero.class,
        alignment: hero.alignment,
        background: hero.background,
        stats: hero.stats,
        skills: hero.skills,
        equipment: hero.equipment,
        backstory: hero.backstory,
        personality: hero.personality,
        current_hp: hero.currentHP,
        max_hp: hero.maxHP,
        level: hero.level || 1,
        experience: hero.experience || 0
      }])
      .select()
      .single();
    
    if (error) throw new Error(`Failed to add hero: ${error.message}`);
    return data;
  },

  async update(heroId, hero) {
    if (!supabase) {
      throw new Error('Supabase not configured');
    }
    
    const { data, error } = await supabase
      .from('heroes')
      .update({
        name: hero.name,
        race: hero.race,
        class: hero.class,
        alignment: hero.alignment,
        background: hero.background,
        stats: hero.stats,
        skills: hero.skills,
        equipment: hero.equipment,
        backstory: hero.backstory,
        personality: hero.personality,
        current_hp: hero.currentHP,
        max_hp: hero.maxHP,
        level: hero.level,
        experience: hero.experience
      })
      .eq('hero_id', heroId)
      .select()
      .single();
    
    if (error) throw new Error(`Failed to update hero: ${error.message}`);
    return data;
  },

  async delete(heroId) {
    if (!supabase) {
      throw new Error('Supabase not configured');
    }
    
    const { error } = await supabase
      .from('heroes')
      .delete()
      .eq('hero_id', heroId);
    
    if (error) throw new Error(`Failed to delete hero: ${error.message}`);
    return { success: true };
  }
};

// Express implementation (original)
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

// Hybrid API that uses Supabase if configured, otherwise Express
export const heroesApi = {
  async list() {
    return useSupabase ? supabaseHeroesApi.list() : expressHeroesApi.list();
  },

  async create(hero) {
    return useSupabase ? supabaseHeroesApi.create(hero) : expressHeroesApi.create(hero);
  },

  async update(heroId, hero) {
    return useSupabase ? supabaseHeroesApi.update(heroId, hero) : expressHeroesApi.update(heroId, hero);
  },

  async delete(heroId) {
    return useSupabase ? supabaseHeroesApi.delete(heroId) : expressHeroesApi.delete(heroId);
  }
};

