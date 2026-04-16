import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import type { Env } from '../types';
import type { AuthVariables } from '../middleware/auth';

const dbRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

function getSupabase(env: Env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase not configured');
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ============================================
// HEROES ENDPOINTS
// ============================================

dbRoutes.get('/heroes', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const userId = c.get('userId');

    const { data, error } = await supabase
      .from('heroes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return c.json((data || []).map(hero => ({
      heroId: hero.hero_id,
      heroName: hero.hero_name,
      heroGender: hero.hero_gender,
      heroRace: hero.hero_race,
      heroClass: hero.hero_class,
      heroLevel: hero.hero_level,
      heroBackground: hero.hero_background,
      heroAlignment: hero.hero_alignment,
      profilePicture: hero.profile_picture,
      stats: hero.stats,
    })));
  } catch (error: any) {
    console.error('Error fetching heroes:', {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      stack: error?.stack,
    });
    return c.json({ error: 'Failed to fetch heroes' }, 500);
  }
});

dbRoutes.post('/heroes', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const userId = c.get('userId');
    const hero = await c.req.json();

    const insertData: Record<string, unknown> = {
      user_id: userId,
      hero_id: hero.heroId,
      hero_name: hero.heroName,
      hero_race: hero.heroRace,
      hero_class: hero.heroClass,
      hero_level: hero.heroLevel || 1,
      hero_background: hero.heroBackground,
      stats: hero.stats,
    };
    if (hero.heroGender) insertData.hero_gender = hero.heroGender;
    if (hero.profilePicture) insertData.profile_picture = hero.profilePicture;
    if (hero.heroAlignment) insertData.hero_alignment = hero.heroAlignment;

    const { data, error } = await supabase
      .from('heroes')
      .insert([insertData])
      .select()
      .single();

    if (error) throw error;

    return c.json({
      heroId: data.hero_id,
      heroName: data.hero_name,
      heroGender: data.hero_gender,
      heroRace: data.hero_race,
      heroClass: data.hero_class,
      heroLevel: data.hero_level,
      heroBackground: data.hero_background,
      heroAlignment: data.hero_alignment,
      profilePicture: data.profile_picture,
      stats: data.stats,
    }, 201);
  } catch (error: any) {
    console.error('Error creating hero:', {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      stack: error?.stack,
    });
    return c.json({ error: 'Failed to create hero' }, 500);
  }
});

dbRoutes.put('/heroes/:heroId', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const userId = c.get('userId');
    const heroId = c.req.param('heroId');
    const hero = await c.req.json();

    const updateData: Record<string, unknown> = {};
    if (hero.heroName !== undefined) updateData.hero_name = hero.heroName;
    if (hero.heroRace !== undefined) updateData.hero_race = hero.heroRace;
    if (hero.heroClass !== undefined) updateData.hero_class = hero.heroClass;
    if (hero.heroLevel !== undefined) updateData.hero_level = hero.heroLevel;
    if (hero.heroBackground !== undefined) updateData.hero_background = hero.heroBackground;
    if (hero.heroAlignment !== undefined) updateData.hero_alignment = hero.heroAlignment;
    if (hero.heroGender !== undefined) updateData.hero_gender = hero.heroGender;
    if (hero.profilePicture !== undefined) updateData.profile_picture = hero.profilePicture;
    if (hero.stats !== undefined) updateData.stats = hero.stats;

    if (Object.keys(updateData).length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    const { data, error } = await supabase
      .from('heroes')
      .update(updateData)
      .eq('hero_id', heroId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    return c.json({
      heroId: data.hero_id,
      heroName: data.hero_name,
      heroGender: data.hero_gender,
      heroRace: data.hero_race,
      heroClass: data.hero_class,
      heroLevel: data.hero_level,
      heroBackground: data.hero_background,
      heroAlignment: data.hero_alignment,
      profilePicture: data.profile_picture,
      stats: data.stats,
    });
  } catch (error: any) {
    console.error('Error updating hero:', {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      stack: error?.stack,
    });
    return c.json({ error: 'Failed to update hero' }, 500);
  }
});

dbRoutes.delete('/heroes/:heroId', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const userId = c.get('userId');
    const heroId = c.req.param('heroId');

    const { error } = await supabase
      .from('heroes')
      .delete()
      .eq('hero_id', heroId)
      .eq('user_id', userId);

    if (error) throw error;
    return c.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting hero:', {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      stack: error?.stack,
    });
    return c.json({ error: 'Failed to delete hero' }, 500);
  }
});

// ============================================
// CONVERSATIONS ENDPOINTS
// ============================================

dbRoutes.get('/conversations', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const userId = c.get('userId');

    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return c.json((data || []).map(row => ({ ...row, sessionId: row.session_id })));
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return c.json({ error: 'Failed to fetch conversations' }, 500);
  }
});

dbRoutes.get('/conversations/:sessionId', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const userId = c.get('userId');
    const sessionId = c.req.param('sessionId');

    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return c.json({ error: 'Conversation not found' }, 404);

    return c.json({ ...data, sessionId: data.session_id });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return c.json({ error: 'Failed to fetch conversation' }, 500);
  }
});

dbRoutes.post('/conversations', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const userId = c.get('userId');
    const payload = await c.req.json();

    const { data, error } = await supabase
      .from('conversations')
      .upsert([{
        user_id: userId,
        session_id: payload.sessionId,
        conversation_name: payload.conversationName,
        conversation_data: payload.conversation || payload.conversationData,
        game_settings: payload.gameSettings || payload.settingsSnapshot || null,
        selected_heroes: payload.selectedHeroes || null,
        summary: payload.currentSummary || null,
        world_map: payload.worldMap || null,
        player_position: payload.playerPosition || null,
        sub_maps: payload.sub_maps || null,
        provider: payload.provider || null,
        model: payload.model || null,
        timestamp: payload.timestamp || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }], { onConflict: 'session_id' })
      .select()
      .single();

    if (error) throw error;
    return c.json(data, 201);
  } catch (error) {
    console.error('Error saving conversation:', error);
    return c.json({ error: 'Failed to save conversation' }, 500);
  }
});

dbRoutes.put('/conversations/:sessionId', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const userId = c.get('userId');
    const sessionId = c.req.param('sessionId');
    const { conversation_data } = await c.req.json();

    const { data, error } = await supabase
      .from('conversations')
      .update({
        conversation_data,
        updated_at: new Date().toISOString(),
      })
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return c.json(data);
  } catch (error) {
    console.error('Error updating conversation:', error);
    return c.json({ error: 'Failed to update conversation' }, 500);
  }
});

dbRoutes.put('/conversations/:sessionId/name', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const userId = c.get('userId');
    const sessionId = c.req.param('sessionId');
    const { conversationName } = await c.req.json();

    const { data, error } = await supabase
      .from('conversations')
      .update({
        conversation_name: conversationName,
        updated_at: new Date().toISOString(),
      })
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return c.json(data);
  } catch (error) {
    console.error('Error updating conversation name:', error);
    return c.json({ error: 'Failed to update conversation name' }, 500);
  }
});

dbRoutes.delete('/conversations/:sessionId', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const userId = c.get('userId');
    const sessionId = c.req.param('sessionId');

    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('session_id', sessionId)
      .eq('user_id', userId);

    if (error) throw error;
    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return c.json({ error: 'Failed to delete conversation' }, 500);
  }
});

export default dbRoutes;
