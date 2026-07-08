import { Hono } from 'hono';
import type { Env } from '../types';
import type { AuthVariables } from '../middleware/auth';
// getSql (per-request postgres.js client over Hyperdrive) and the tier ladder moved
// to services/pg.ts and services/tiers.ts so the rate limiter (#12) and the premium
// AI pool gate (#7) share them; behaviour here is unchanged.
import { getSql, type Sql } from '../services/pg';
import { getAccountTier, getEffectiveTier, tierRank } from '../services/tiers';
import { normalizeCode } from '../services/redemption';
import {
  bumpCounter,
  REDEEM_CODE_BUCKET,
  REDEEM_CODE_DAILY_LIMIT,
  REDEEM_CODE_WINDOW_SECONDS,
} from '../middleware/rateLimit';

const dbRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// jsonb columns: postgres.js needs values wrapped in sql.json() on write (it auto-parses on read).
// Pass through real null as SQL NULL (matches the previous supabase-js behaviour).
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

// Revision-guarded upsert (SAVE_SYNC_PLAN section 6.1, Phase 3). `rev` is the
// lineage counter: a fresh INSERT starts it at 1, every write bumps it by 1.
// When the client sends an integer `expectedRev` (the cloud rev its copy descends
// from), the UPDATE arm only applies while `conversations.rev = expectedRev`:
// optimistic concurrency. A guard miss means another device advanced the row past
// the caller's ancestor (a FORK, 6.2); the caller gets 409 with the CURRENT row's
// rev + updated_at and must park its timeline, never overwrite. Without
// expectedRev (legacy clients, guest sync uploads) the upsert stays unconditional
// as before, but still bumps rev so lineage keeps counting.
dbRoutes.post('/conversations', async (c) => {
  const sql = getSql(c.env);
  try {
    const userId = c.get('userId');
    const payload = await c.req.json();

    const expectedRev: number | undefined =
      Number.isInteger(payload.expectedRev) && payload.expectedRev >= 0
        ? payload.expectedRev
        : undefined;

    const values = sql`
      (
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
        ${new Date().toISOString()},
        1
      )`;
    const updateSet = sql`
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
        updated_at        = EXCLUDED.updated_at,
        rev               = conversations.rev + 1`;

    // Two branches instead of an empty-fragment splice: postgres.js composes
    // sql`` fragments, but an explicit branch keeps the guarded shape readable.
    const [row] =
      expectedRev === undefined
        ? await sql`
            INSERT INTO conversations (
              user_id, session_id, conversation_name, conversation_data, game_settings,
              selected_heroes, summary, world_map, player_position, sub_maps,
              provider, model, timestamp, updated_at, rev
            ) VALUES ${values}
            ON CONFLICT (session_id) DO UPDATE SET ${updateSet}
            RETURNING *`
        : await sql`
            INSERT INTO conversations (
              user_id, session_id, conversation_name, conversation_data, game_settings,
              selected_heroes, summary, world_map, player_position, sub_maps,
              provider, model, timestamp, updated_at, rev
            ) VALUES ${values}
            ON CONFLICT (session_id) DO UPDATE SET ${updateSet}
            WHERE conversations.rev = ${expectedRev}
            RETURNING *`;

    if (!row) {
      // Guard miss: the ON CONFLICT ... WHERE filtered the update away. Report the
      // current lineage so the client can decide (it needs rev AND updated_at).
      const [current] = await sql`
        SELECT rev, updated_at FROM conversations
        WHERE session_id = ${payload.sessionId}
        LIMIT 1`;
      return c.json(
        {
          error: 'Conversation was advanced by another device',
          code: 'rev_conflict',
          rev: current?.rev ?? null,
          updated_at: current?.updated_at ?? null,
        },
        409
      );
    }

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

    // Content write: bumps rev (lineage counter) like the upsert does, so a
    // message edit from one device is detectable as an advance by any other.
    const [row] = await sql`
      UPDATE conversations SET
        conversation_data = ${jsonb(sql, conversation_data)},
        updated_at = ${new Date().toISOString()},
        rev = conversations.rev + 1
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

// Rename deliberately does NOT bump rev: it is metadata, not timeline content.
// Bumping here would make a rename from the saves list 409-fork another device's
// live session over nothing; the client already keeps unsynced local copies'
// names in step (conversationsApi.updateName).
dbRoutes.put('/conversations/:sessionId/name', async (c) => {
  const sql = getSql(c.env);
  try {
    const userId = c.get('userId');
    const sessionId = c.req.param('sessionId');
    const { conversationName, saveName } = await c.req.json();

    // Persist BOTH the display name and the editable root (game_settings.saveName). The
    // root is the source of truth every save re-derives the display name from, so updating
    // conversation_name alone would let the next autosave clobber the rename. Guard against
    // a missing saveName (older client) so we never null out an existing root.
    const [row] = await sql`
      UPDATE conversations SET
        conversation_name = ${conversationName},
        game_settings = CASE
          WHEN ${saveName ?? null}::text IS NULL THEN game_settings
          ELSE jsonb_set(
            COALESCE(game_settings, '{}'::jsonb),
            '{saveName}',
            to_jsonb(${saveName ?? null}::text)
          )
        END,
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

// Account tier for the calling user (backlog #39). Since the #6 redemption-code
// slice this reports the EFFECTIVE tier: the stored account_tiers row raised by any
// active tier_grants row (services/tiers.ts getEffectiveTier). Base-tier writes still
// happen manually via psql (see migrations/002_account_tiers.sql); grants are written
// by POST /redeem-code below. No rows means plain 'free'. The tier-to-benefit mapping
// lives client-side (src/game/entitlements.js); this endpoint only reports the tier.
//
// Response shape is additive for backward compat: { tier, updatedAt } as before,
// plus expiresAt: the grant's end date when the effective tier comes from a grant,
// null when the stored tier already covers it (a stored tier is not time-boxed).
dbRoutes.get('/entitlements', async (c) => {
  const sql = getSql(c.env);
  try {
    const userId = c.get('userId');

    const effective = await getEffectiveTier(sql, userId);
    return c.json({
      tier: effective.tier,
      updatedAt: effective.baseUpdatedAt,
      expiresAt: effective.grantExpiresAt,
    });
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

// Redeem a code for a time-boxed tier grant (backlog #6 first slice; schema in
// migrations/006_redemption_codes.sql, codes are minted in the private admin panel).
//
// Failure contract (honest but unhelpful to brute force): not-found, expired,
// disabled and exhausted all collapse into ONE generic 400 'code_invalid', so a
// scanner learns nothing about which codes exist. The single exception is 409
// 'already_redeemed' for a repeat redemption by the SAME account: that only fires
// on a code this user has already proven knowledge of, so it leaks nothing new and
// it is the one case where a distinct message helps a real person.
dbRoutes.post('/redeem-code', async (c) => {
  const sql = getSql(c.env);
  try {
    const userId = c.get('userId');
    if (!userId) {
      // Only reachable via the ALLOW_UNAUTHENTICATED_DEV bypass; grants and
      // redemptions are keyed by user, so there is nothing to redeem against.
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json().catch(() => ({}));
    const code = normalizeCode((body as { code?: unknown })?.code);

    // Brute-force guard, fail CLOSED (posture rationale on the constants in
    // middleware/rateLimit.ts): if the counter cannot be consulted, redemption is
    // refused rather than left unguarded. Counted before the code lookup so junk
    // input burns attempts too. Malformed input skips the DB entirely but returns
    // the same generic error as an unknown code.
    let attempts: number;
    let retryAfterSeconds: number;
    try {
      ({ count: attempts, retryAfterSeconds } = await bumpCounter(
        sql,
        userId,
        REDEEM_CODE_BUCKET,
        REDEEM_CODE_WINDOW_SECONDS
      ));
    } catch (error) {
      console.error(
        '[redeem-code] attempt counter error; FAILING CLOSED:',
        error instanceof Error ? error.message : error
      );
      return c.json(
        { error: 'Redemption is temporarily unavailable', code: 'redeem_unavailable' },
        503
      );
    }
    if (attempts > REDEEM_CODE_DAILY_LIMIT) {
      c.header('Retry-After', String(retryAfterSeconds));
      return c.json(
        {
          error: 'Too many redemption attempts today',
          code: 'rate_limited',
          retryAfterSeconds,
        },
        429
      );
    }

    if (!code) {
      return c.json({ error: 'That code is not valid', code: 'code_invalid' }, 400);
    }

    // One transaction so a race can never oversubscribe max_uses or double-grant:
    // the claim is an atomic conditional UPDATE (uses < max_uses re-checked under
    // the row lock the UPDATE itself takes), and the code_redemptions PK backstops
    // a same-user double submit (the second insert violates it and the whole
    // transaction, including the uses increment, rolls back).
    type RedeemOutcome =
      | { status: 'already_redeemed' }
      | { status: 'invalid' }
      | { status: 'redeemed'; tier: string; expiresAt: unknown };

    const outcome = (await sql.begin(async (tx) => {
      const [prior] = await tx`
        SELECT 1 AS present FROM code_redemptions
        WHERE code = ${code} AND user_id = ${userId}
        LIMIT 1`;
      if (prior) return { status: 'already_redeemed' } as const;

      // The atomic claim: exists + enabled + unexpired + capacity left, checked and
      // consumed in one statement.
      const [claimed] = await tx`
        UPDATE redemption_codes
        SET uses = uses + 1
        WHERE code = ${code}
          AND disabled = false
          AND expires_at > now()
          AND uses < max_uses
        RETURNING grants_tier, grant_days`;
      if (!claimed) return { status: 'invalid' } as const;

      const [grant] = await tx`
        INSERT INTO tier_grants (user_id, tier, source, expires_at)
        VALUES (
          ${userId}, ${claimed.grants_tier}, ${`code:${code}`},
          now() + make_interval(days => ${claimed.grant_days})
        )
        RETURNING tier, expires_at`;

      await tx`
        INSERT INTO code_redemptions (code, user_id)
        VALUES (${code}, ${userId})`;

      return {
        status: 'redeemed',
        tier: grant.tier,
        expiresAt: grant.expires_at,
      } as const;
    })) as RedeemOutcome;

    if (outcome.status === 'already_redeemed') {
      return c.json(
        { error: 'This code was already redeemed on this account', code: 'already_redeemed' },
        409
      );
    }
    if (outcome.status === 'invalid') {
      return c.json({ error: 'That code is not valid', code: 'code_invalid' }, 400);
    }

    return c.json({
      tier: outcome.tier,
      expiresAt:
        outcome.expiresAt instanceof Date
          ? outcome.expiresAt.toISOString()
          : String(outcome.expiresAt),
    });
  } catch (error: any) {
    // Same-user concurrent double submit: both pass the prior-redemption read, the
    // second INSERT INTO code_redemptions hits the (code, user_id) PK and the whole
    // transaction rolls back (no double grant, no double uses). Report it as the
    // ordinary already-redeemed case.
    if (error?.code === '23505') {
      return c.json(
        { error: 'This code was already redeemed on this account', code: 'already_redeemed' },
        409
      );
    }
    console.error('Error redeeming code:', {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      stack: error?.stack,
    });
    return c.json({ error: 'Failed to redeem code' }, 500);
  } finally {
    c.executionCtx.waitUntil(sql.end());
  }
});

// ============================================
// PREMIUM CONTENT ENDPOINTS
// ============================================

// Server-delivered premium story templates (backlog #40). The `template` JSONB in
// premium_templates IS a storyTemplates entry, served verbatim; the client registers
// the list into its picker array (src/data/storyTemplates.js registerPremiumTemplates,
// fetched via src/services/premiumContentApi.js). Serving only to entitled callers is
// the actual enforcement: premium content never ships in the public bundle, and the
// client-side gates stay UX. Read-only on purpose: rows are loaded/disabled manually
// via psql (see migrations/004_premium_templates.sql for the runbook and recipes).
//
// Entitlement: caller tier from account_tiers (no row = 'free'), a row is delivered
// when tierRank(caller) >= tierRank(min_tier). Free/no-row accounts get
// { templates: [] } with 200, never an error: an empty delivery is the normal state.
dbRoutes.get('/premium-templates', async (c) => {
  const sql = getSql(c.env);
  try {
    const userId = c.get('userId');

    const callerRank = tierRank(await getAccountTier(sql, userId));

    // Ladder comparison in code (few rows, simplest correct): fetch enabled rows,
    // keep those the caller's rank covers.
    const rows = await sql`
      SELECT id, min_tier, template FROM premium_templates
      WHERE enabled = true
      ORDER BY id`;

    // Below-tier templates return as marketing-safe TEASERS instead of being
    // withheld (maintainer 2026-07-06: "the cards should show to all players as
    // a way to encourage them to upgrade"). The teaser carries only card-face
    // metadata; the authored content (settings, milestones, customNames, NPCs,
    // rewards) never reaches a client whose tier does not cover it — that
    // boundary is the whole point of server-delivered premium content (#40).
    const templates = rows.map((row) => {
      if (tierRank(row.min_tier) <= callerRank) return row.template;
      const t = (row.template ?? {}) as Record<string, unknown>;
      return {
        id: t.id ?? row.id,
        name: t.name,
        subtitle: t.subtitle,
        tier: t.tier,
        levelRange: t.levelRange,
        shortDescription: t.shortDescription,
        theme: t.theme,
        premium: true,
        minTier: row.min_tier,
        teaser: true,
      };
    });

    return c.json({ templates });
  } catch (error: any) {
    console.error('Error fetching premium templates:', {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      stack: error?.stack,
    });
    return c.json({ error: 'Failed to fetch premium templates' }, 500);
  } finally {
    c.executionCtx.waitUntil(sql.end());
  }
});

export default dbRoutes;
