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
    
    // Transform database schema to frontend schema
    return (data || []).map(hero => ({
      heroId: hero.hero_id,
      heroName: hero.hero_name,
      heroGender: hero.hero_gender,
      heroRace: hero.hero_race,
      heroClass: hero.hero_class,
      heroLevel: hero.hero_level,
      heroBackground: hero.hero_background,
      heroAlignment: hero.hero_alignment,
      profilePicture: hero.profile_picture,
      stats: hero.stats
    }));
  },

  async create(hero) {
    if (!supabase) {
      throw new Error('Supabase not configured');
    }
    
    // Get authenticated user ID for RLS
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // Build insert object with only fields that exist in the table
    // Hero object uses heroName, heroRace, heroClass naming convention
    const insertData = {
      user_id: user.id,
      hero_id: hero.heroId,
      hero_name: hero.heroName,
      hero_race: hero.heroRace,
      hero_class: hero.heroClass,
      hero_level: hero.heroLevel || 1,
      hero_background: hero.heroBackground,
      stats: hero.stats
    };
    
    // Add optional fields if they exist
    if (hero.heroGender) insertData.hero_gender = hero.heroGender;
    if (hero.profilePicture) insertData.profile_picture = hero.profilePicture;
    if (hero.heroAlignment) insertData.hero_alignment = hero.heroAlignment;
    
    const { data, error } = await supabase
      .from('heroes')
      .insert([insertData])
      .select()
      .single();
    
    if (error) throw new Error(`Failed to add hero: ${error.message}`);
    
    // Transform database schema to frontend schema
    return {
      heroId: data.hero_id,
      heroName: data.hero_name,
      heroGender: data.hero_gender,
      heroRace: data.hero_race,
      heroClass: data.hero_class,
      heroLevel: data.hero_level,
      heroBackground: data.hero_background,
      heroAlignment: data.hero_alignment,
      profilePicture: data.profile_picture,
      stats: data.stats
    };
  },

  async update(heroId, hero) {
    if (!supabase) {
      throw new Error('Supabase not configured');
    }
    
    // Build update object matching SQLite schema
    const updateData = {
      hero_name: hero.heroName,
      hero_race: hero.heroRace,
      hero_class: hero.heroClass,
      hero_level: hero.heroLevel,
      hero_background: hero.heroBackground,
      stats: hero.stats
    };
    
    // Add optional fields if they exist
    if (hero.heroGender) updateData.hero_gender = hero.heroGender;
    if (hero.profilePicture) updateData.profile_picture = hero.profilePicture;
    if (hero.heroAlignment) updateData.hero_alignment = hero.heroAlignment;
    
    const { data, error } = await supabase
      .from('heroes')
      .update(updateData)
      .eq('hero_id', heroId)
      .select()
      .single();
    
    if (error) throw new Error(`Failed to update hero: ${error.message}`);
    
    // Transform database schema to frontend schema
    return {
      heroId: data.hero_id,
      heroName: data.hero_name,
      heroGender: data.hero_gender,
      heroRace: data.hero_race,
      heroClass: data.hero_class,
      heroLevel: data.hero_level,
      heroBackground: data.hero_background,
      heroAlignment: data.hero_alignment,
      profilePicture: data.profile_picture,
      stats: data.stats
    };
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

