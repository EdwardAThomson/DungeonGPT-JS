import { Hono } from 'hono';
import postgres from 'postgres';
import type { Env } from '../types';
import type { AuthVariables } from '../middleware/auth';

const dbRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// One postgres.js client per request, reaching Postgres via Cloudflare Hyperdrive.
// Hyperdrive does the real connection pooling, so a small client-side `max` is fine.
// `fetch_types: false` skips per-query type introspection round-trips (recommended on Workers).
function getSql(env: Env) {
  if (!env.HYPERDRIVE?.connectionString) {
    throw new Error('Hyperdrive not configured');
  }
  return postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false });
}

// jsonb columns: postgres.js needs values wrapped in sql.json() on write (it auto-parses on read).
// Pass through real null as SQL NULL (matches the previous supabase-js behaviour).
type Sql = ReturnType<typeof getSql>;
const jsonb = (sql: Sql, v: unknown) => (v === undefined || v === null ? null : sql.json(v as any));

// heroes rows are snake_case in the DB; the API contract is camelCase. Keep this mapping identical
// to the pre-migration shape — the frontend depends on it.
function mapHero(h: any) {
  return {
    heroId: h.hero_id,
    heroName: h.hero_name,
    heroGender: h.hero_gender,
    heroRace: h.hero_race,
    heroClass: h.hero_class,
    heroLevel: h.hero_level,
    heroBackground: h.hero_background,
    heroAlignment: h.hero_alignment,
    profilePicture: h.profile_picture,
    stats: h.stats,
  };
}

// ============================================
// HEROES ENDPOINTS
// ============================================

dbRoutes.get('/heroes', async (c) => {
  const sql = getSql(c.env);
  try {
    const userId = c.get('userId');

    const rows = await sql`
      SELECT * FROM heroes
      WHERE user_id = ${userId}
      ORDER BY created_at DESC`;

    return c.json(rows.map(mapHero));
  } catch (error: any) {
    console.error('Error fetching heroes:', {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      stack: error?.stack,
    });
    return c.json({ error: 'Failed to fetch heroes' }, 500);
  } finally {
    c.executionCtx.waitUntil(sql.end());
  }
});

dbRoutes.post('/heroes', async (c) => {
  const sql = getSql(c.env);
  try {
    const userId = c.get('userId');
    const hero = await c.req.json();

    const [row] = await sql`
      INSERT INTO heroes (
        user_id, hero_id, hero_name, hero_gender, hero_race, hero_class,
        hero_level, hero_background, hero_alignment, profile_picture, stats
      ) VALUES (
        ${userId}, ${hero.heroId}, ${hero.heroName}, ${hero.heroGender ?? null},
        ${hero.heroRace}, ${hero.heroClass}, ${hero.heroLevel || 1},
        ${hero.heroBackground}, ${hero.heroAlignment ?? null},
        ${hero.profilePicture ?? null}, ${jsonb(sql, hero.stats)}
      )
      RETURNING *`;

    return c.json(mapHero(row), 201);
  } catch (error: any) {
    console.error('Error creating hero:', {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      stack: error?.stack,
    });
    return c.json({ error: 'Failed to create hero' }, 500);
  } finally {
    c.executionCtx.waitUntil(sql.end());
  }
});

dbRoutes.put('/heroes/:heroId', async (c) => {
  const sql = getSql(c.env);
  try {
    const userId = c.get('userId');
    const heroId = c.req.param('heroId');
    const hero = await c.req.json();

    // Preserve the "nothing to update -> 400" guard from the supabase-js version.
    const updatable = [
      'heroName', 'heroRace', 'heroClass', 'heroLevel',
      'heroBackground', 'heroAlignment', 'heroGender', 'profilePicture', 'stats',
    ];
    if (!updatable.some((k) => hero[k] !== undefined)) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    // Partial update via COALESCE: a field left undefined keeps its current value.
    const [row] = await sql`
      UPDATE heroes SET
        hero_name       = COALESCE(${hero.heroName ?? null}, hero_name),
        hero_race       = COALESCE(${hero.heroRace ?? null}, hero_race),
        hero_class      = COALESCE(${hero.heroClass ?? null}, hero_class),
        hero_level      = COALESCE(${hero.heroLevel ?? null}, hero_level),
        hero_background = COALESCE(${hero.heroBackground ?? null}, hero_background),
        hero_alignment  = COALESCE(${hero.heroAlignment ?? null}, hero_alignment),
        hero_gender     = COALESCE(${hero.heroGender ?? null}, hero_gender),
        profile_picture = COALESCE(${hero.profilePicture ?? null}, profile_picture),
        stats           = COALESCE(${hero.stats !== undefined ? jsonb(sql, hero.stats) : null}, stats)
      WHERE hero_id = ${heroId} AND user_id = ${userId}
      RETURNING *`;

    if (!row) return c.json({ error: 'Hero not found' }, 404);
    return c.json(mapHero(row));
  } catch (error: any) {
    console.error('Error updating hero:', {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      stack: error?.stack,
    });
    return c.json({ error: 'Failed to update hero' }, 500);
  } finally {
    c.executionCtx.waitUntil(sql.end());
  }
});

dbRoutes.delete('/heroes/:heroId', async (c) => {
  const sql = getSql(c.env);
  try {
    const userId = c.get('userId');
    const heroId = c.req.param('heroId');

    await sql`
      DELETE FROM heroes
      WHERE hero_id = ${heroId} AND user_id = ${userId}`;

    return c.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting hero:', {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      stack: error?.stack,
    });
    return c.json({ error: 'Failed to delete hero' }, 500);
  } finally {
    c.executionCtx.waitUntil(sql.end());
  }
});

// ============================================
// CONVERSATIONS ENDPOINTS
// ============================================

dbRoutes.get('/conversations', async (c) => {
  const sql = getSql(c.env);
  try {
    const userId = c.get('userId');

    const rows = await sql`
      SELECT * FROM conversations
      WHERE user_id = ${userId}
      ORDER BY updated_at DESC`;

    return c.json(rows.map((row) => ({ ...row, sessionId: row.session_id })));
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return c.json({ error: 'Failed to fetch conversations' }, 500);
  } finally {
    c.executionCtx.waitUntil(sql.end());
  }
});

dbRoutes.get('/conversations/:sessionId', async (c) => {
  const sql = getSql(c.env);
  try {
    const userId = c.get('userId');
    const sessionId = c.req.param('sessionId');

    const [row] = await sql`
      SELECT * FROM conversations
      WHERE session_id = ${sessionId} AND user_id = ${userId}
      LIMIT 1`;

    if (!row) return c.json({ error: 'Conversation not found' }, 404);

    return c.json({ ...row, sessionId: row.session_id });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return c.json({ error: 'Failed to fetch conversation' }, 500);
  } finally {
    c.executionCtx.waitUntil(sql.end());
  }
});

dbRoutes.post('/conversations', async (c) => {
  const sql = getSql(c.env);
  try {
    const userId = c.get('userId');
    const payload = await c.req.json();

    const [row] = await sql`
      INSERT INTO conversations (
        user_id, session_id, conversation_name, conversation_data, game_settings,
        selected_heroes, summary, world_map, player_position, sub_maps,
        provider, model, timestamp, updated_at
      ) VALUES (
        ${userId},
        ${payload.sessionId},
        ${payload.conversationName ?? null},
        ${jsonb(sql, payload.conversation || payload.conversationData)},
        ${jsonb(sql, payload.gameSettings || payload.settingsSnapshot || null)},
        ${jsonb(sql, payload.selectedHeroes || null)},
        ${payload.currentSummary || null},
        ${jsonb(sql, payload.worldMap || null)},
        ${jsonb(sql, payload.playerPosition || null)},
        ${jsonb(sql, payload.sub_maps || null)},
        ${payload.provider || null},
        ${payload.model || null},
        ${payload.timestamp || new Date().toISOString()},
        ${new Date().toISOString()}
      )
      ON CONFLICT (session_id) DO UPDATE SET
        user_id           = EXCLUDED.user_id,
        conversation_name = EXCLUDED.conversation_name,
        conversation_data = EXCLUDED.conversation_data,
        game_settings     = EXCLUDED.game_settings,
        selected_heroes   = EXCLUDED.selected_heroes,
        summary           = EXCLUDED.summary,
        world_map         = EXCLUDED.world_map,
        player_position   = EXCLUDED.player_position,
        sub_maps          = EXCLUDED.sub_maps,
        provider          = EXCLUDED.provider,
        model             = EXCLUDED.model,
        timestamp         = EXCLUDED.timestamp,
        updated_at        = EXCLUDED.updated_at
      RETURNING *`;

    return c.json(row, 201);
  } catch (error) {
    console.error('Error saving conversation:', error);
    return c.json({ error: 'Failed to save conversation' }, 500);
  } finally {
    c.executionCtx.waitUntil(sql.end());
  }
});

dbRoutes.put('/conversations/:sessionId', async (c) => {
  const sql = getSql(c.env);
  try {
    const userId = c.get('userId');
    const sessionId = c.req.param('sessionId');
    const { conversation_data } = await c.req.json();

    const [row] = await sql`
      UPDATE conversations SET
        conversation_data = ${jsonb(sql, conversation_data)},
        updated_at = ${new Date().toISOString()}
      WHERE session_id = ${sessionId} AND user_id = ${userId}
      RETURNING *`;

    if (!row) return c.json({ error: 'Conversation not found' }, 404);
    return c.json(row);
  } catch (error) {
    console.error('Error updating conversation:', error);
    return c.json({ error: 'Failed to update conversation' }, 500);
  } finally {
    c.executionCtx.waitUntil(sql.end());
  }
});

dbRoutes.put('/conversations/:sessionId/name', async (c) => {
  const sql = getSql(c.env);
  try {
    const userId = c.get('userId');
    const sessionId = c.req.param('sessionId');
    const { conversationName } = await c.req.json();

    const [row] = await sql`
      UPDATE conversations SET
        conversation_name = ${conversationName},
        updated_at = ${new Date().toISOString()}
      WHERE session_id = ${sessionId} AND user_id = ${userId}
      RETURNING *`;

    if (!row) return c.json({ error: 'Conversation not found' }, 404);
    return c.json(row);
  } catch (error) {
    console.error('Error updating conversation name:', error);
    return c.json({ error: 'Failed to update conversation name' }, 500);
  } finally {
    c.executionCtx.waitUntil(sql.end());
  }
});

dbRoutes.delete('/conversations/:sessionId', async (c) => {
  const sql = getSql(c.env);
  try {
    const userId = c.get('userId');
    const sessionId = c.req.param('sessionId');

    await sql`
      DELETE FROM conversations
      WHERE session_id = ${sessionId} AND user_id = ${userId}`;

    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return c.json({ error: 'Failed to delete conversation' }, 500);
  } finally {
    c.executionCtx.waitUntil(sql.end());
  }
});

// ============================================
// ENTITLEMENTS ENDPOINTS
// ============================================

// Account tier for the calling user (backlog #39). Read-only on purpose: until billing
// lands, tier changes happen manually via psql (see migrations/002_account_tiers.sql for
// the runbook and the INSERT ... ON CONFLICT grant recipe). No row means the account has
// never been granted anything, which is plain 'free'. The tier-to-benefit mapping lives
// client-side (src/game/entitlements.js); this endpoint only reports the stored tier.
dbRoutes.get('/entitlements', async (c) => {
  const sql = getSql(c.env);
  try {
    const userId = c.get('userId');

    const [row] = await sql`
      SELECT tier, updated_at FROM account_tiers
      WHERE user_id = ${userId}
      LIMIT 1`;

    if (!row) return c.json({ tier: 'free', updatedAt: null });
    return c.json({ tier: row.tier, updatedAt: row.updated_at });
  } catch (error: any) {
    console.error('Error fetching entitlements:', {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      stack: error?.stack,
    });
    return c.json({ error: 'Failed to fetch entitlements' }, 500);
  } finally {
    c.executionCtx.waitUntil(sql.end());
  }
});

export default dbRoutes;
