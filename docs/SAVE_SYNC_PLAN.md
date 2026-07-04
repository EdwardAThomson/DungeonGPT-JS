# Save Storage & Sync Plan — local-first saves, honest durability, divergence-safe reconcile

Status: **Phase 1 implemented (pending review)**, 2026-07-04; Phases 2-3 planned. Backlog item #54.
Origin: playtest 2026-07-04. The t1 goblin-campaign save "teleported" between the
cloud backend and the browser depending on login state (split-brain, see §2.4).
Builds on `GUEST_MODE_PLAN.md` (localGameStore / LocalGameSync, Phase B).

## 1. Current architecture (what exists today)

Every game save/load/list/rename goes through `src/services/conversationsApi.js`,
which picks a storage backend **per call, at call time**:

```js
async save(payload) {
  return (await isSignedIn()) ? backend.save(payload) : localGameStore.save(payload);
}
```

- `isSignedIn()` = live `supabase.auth.getSession()` against the Octonion hub;
  `catch (e) { return false; }`.
- Signed in → cloud backend (CF Worker in prod, Express/SQLite in dev).
- Guest → `localGameStore` (IndexedDB `dungeongpt-games`, rows in the backend's
  snake_case shape).
- `LocalGameSync` runs on the sign-in event: uploads every local row to the cloud,
  deletes each local row as it goes. No timestamp comparison.
- `heroesApi.js` + `localHeroStore` mirror the same pattern for heroes.

## 2. The defects (why this is "very close" but not right)

The **fallback itself is correct**. If auth silently expires mid-game, writing to
IndexedDB is strictly better than failing the save: forcing re-auth means leaving
the game page and losing in-memory progress. Keep the fallback. The defects are
all downstream of it:

1. **Silent.** "Game Saved!" reads the same whether the row is in the player's
   account or in a browser profile that might get cleared. Different durability
   promises, one message.
2. **Never reconciled.** Sync fires only on the sign-in *event*. A token that
   quietly refreshes back to life mid-session never triggers it; the local copy
   strands until the next explicit sign-in.
3. **Split-brain is invisible.** `list()`/`getById()` consult exactly one store
   based on current auth state. A game with rows in both stores shows whichever
   copy matches how you are logged in right now; the other copy is invisible.
4. **Errors read as "guest".** A transient network blip during the auth check is
   indistinguishable from being logged out, so a signed-in player's save can
   route local for no user-visible reason.
5. **Sync can clobber.** `LocalGameSync` upserts unconditionally; a stale local
   row can overwrite a newer cloud row for the same `session_id`.

### 2.4 Case study (2026-07-04)

Heroes + several games landed in dev SQLite (session was live at those moments,
persisted in localStorage across restarts, so "logged out" *feeling* ≠ no
session). The goblin-campaign marathon outlived or lost the session; its saves
fell back to IndexedDB. Result: that one save appears only while logged out,
the rest only while signed in. Nothing was lost, but nothing explained itself
either.

## 3. Design goals

1. **Never lose progress.** A save must always land somewhere durable,
   regardless of auth state. (Already true; preserve it.)
2. **Never lie about durability.** The player always knows whether a save
   reached their account.
3. **Forks are visible and healable.** Any local/cloud divergence is surfaced
   and reconciled; nothing is silently overwritten or stranded.
4. **No forced re-auth mid-game.** Auth loss degrades to local saving with a
   notice, never to a blocking flow.

## 4. Target design: local-first write-through

Storage stops being an either/or decision. For the **live session**, IndexedDB
is always the write-ahead copy; the cloud is the durable home it syncs to.

**Write path** (per save):
1. Write the full row to IndexedDB unconditionally (fast, cannot fail on auth).
   Stamp `synced: false`.
2. If auth is present, push to the cloud backend. On success set `synced: true`
   (and record the new `rev`, §6).
3. If auth is absent or the push fails: leave `synced: false`, tell the truth in
   the confirmation ("Saved on this device — will sync to your account").

**Reconcile pass** (background):
- Runs on: sign-in event (as today), auth restoration (token becomes valid again
  mid-session), app start with a session present, and after any save that left
  `synced: false` once auth returns.
- For each unsynced local row: fast-forward or fork per the rev protocol (§6).
- Synced local rows for **non-live** sessions can be pruned (the live session
  keeps its local copy as the write-ahead cache).

**Read path:**
- `getById`: prefer the newer of local/cloud copies (rev-aware once §6 lands;
  `updated_at` until then).
- `list`: merge both stores by `session_id`, newest copy wins the row, with a
  badge for anything unsynced ("on this device"). This kills the teleporting
  save: the player sees one list that is always the truth.

**Auth-check hardening:** a failed `getSession()` is "unknown", not "guest".
Keep the last known auth state for routing decisions; only an explicit signed-out
state (or persistent failure) downgrades to guest behavior. With write-through
this mostly stops mattering (the local write always happens), but the ambiguity
should not survive into the sync logic.

## 5. Interim option (Phase 1, if shipped before the full write-through)

Status: **implemented 2026-07-04 (pending review)**. What shipped, by mechanism:
- `conversationsApi.resolveRoute()` replaces `isSignedIn()`: routes per call as
  before, but tracks module-level `lastKnownAuth` ('signed-in' | 'guest' |
  'unknown') plus `hasSeenSignedIn`; a getSession() throw falls back to the last
  known state instead of silently meaning "guest" (§4 last paragraph).
- `save`/`updateMessages` results carry a non-breaking `storage: 'cloud' | 'local'`
  marker and `pendingCloudSync`; account-holder fallback rows are stamped
  `pending_cloud_sync: true` in IndexedDB (localGameStore; plain guest rows stay
  unstamped, old rows without the field behave as unstamped).
- `useGamePersistence.performSave` returns a new `'savedLocal'` status; the
  Game.js save confirmation renders it as a warning ("Saved on this device...
  will sync when you sign back in"). Guest saves keep the normal 'saved' flow.
- `LocalGameSync.runLocalGameSyncPass()` (extracted, testable) is timestamp-guarded:
  a cloud row newer than the local one is never overwritten; the local copy is
  parked as `<session_id>-local-<rand>` named "(diverged on this device, <date>)"
  per §6.2. The component also re-arms on `SIGNED_IN` / `TOKEN_REFRESHED` auth
  events, so restoration mid-session syncs too, and a write that routes back to
  local mid-pass is kept for retry instead of being deleted.

Original scope (kept for reference). Keeps per-call routing, fixes the silence and
the stranding (~20% of the work):
- On fallback (auth expected but absent): stamp the local row
  `pendingCloudSync: true`; confirmation copy says "Saved on this device".
- Extend `LocalGameSync` to also run on auth restoration, not just sign-in.
- Make the sync timestamp-aware: never overwrite a cloud row whose `updated_at`
  is newer than the local row's (park the local copy as a conflict instead,
  §6.3 naming).
- Fix `isSignedIn()` error handling (§4, last paragraph).
- Known remainder: the one-store-at-a-time list oddity persists until the
  merged list exists.

## 6. Multi-device divergence (the hard case)

Scenario: a cloud save falls back to local on device A (auth lapsed) and keeps
being played. Meanwhile device B opens the **cloud** copy and plays forward.
Two real timelines now descend from the same ancestor.

### 6.1 Detection: revisions, not timestamps

Timestamps cannot distinguish *fast-forward* from *fork*: both devices are
"newer" than the other's base. Lineage needs a marker:

- Cloud row gains an integer `rev`, incremented on every successful cloud write.
- Every device records `baseRev` on its local copy: the cloud rev it last
  synced from (on load or successful push).
- Push protocol (optimistic concurrency):
  - `cloud.rev == local.baseRev` → **fast-forward**: write, `rev + 1`, done.
  - `cloud.rev > local.baseRev` → **fork**: another device advanced from the
    common ancestor. Do not overwrite.
- The guarded write is a conditional upsert (`... DO UPDATE SET ... WHERE
  conversations.rev = $expectedRev`), which slots into the Worker's existing
  raw-SQL upsert. Express/SQLite dev backend gets the same guard.

### 6.2 Resolution: fork, never merge, never silent last-write-wins

Two divergent RPG timelines cannot be merged (different XP, milestones,
inventory, world state), and last-write-wins silently deletes someone's evening
of play. So conflicts **fork**, Dropbox-style:

- The losing push is saved as a **new** save (`session_id` + new suffix), named
  `"<root> (diverged on this device, <date>)"`.
- Both timelines appear in the merged saved-games list; the player continues
  whichever they prefer and deletes the other when ready.
- Nothing is ever discarded without the player doing it.

### 6.3 Deterrent (optional, cheap)

A soft lease: stamp the cloud row with `last_opened_by` / `last_opened_at` on
load; if another device opened it recently, show a non-blocking notice ("This
save was opened on another device 2h ago") before continuing. Reduces fork
frequency; forks remain fully handled when they happen anyway.

### 6.4 Frequency argument

This is a single-player game with one human per account. Divergence requires
playing the same save on two devices while one is unsynced. Rare by
construction, which is exactly why the resolution favors a simple, lossless
fork over sync-engine cleverness.

## 7. Data model changes

| Where | Field | Purpose |
|---|---|---|
| Cloud `conversations` | `rev INTEGER NOT NULL DEFAULT 0` | lineage counter (§6.1) |
| Local row (IndexedDB) | `synced: boolean` | write-through dirty flag (§4) |
| Local row | `baseRev: number` | cloud rev this copy descends from (§6.1) |
| Local row | `pendingCloudSync: boolean` | Phase-1-only precursor of `synced` (§5) |

Missing fields on old rows are treated as `synced: false` / `baseRev: 0`
(renderer-tolerance rule; first reconcile heals them).

## 8. Phasing & dependencies

- **Phase 1 — honest fallback** (S): §5. No backend changes; can ship now.
- **Phase 2 — local-first write-through + merged list** (M): §4. No schema
  change strictly required (timestamp-guarded until rev lands).
- **Phase 3 — rev protocol + fork-on-conflict** (M): §6–7. Needs the `rev`
  column + conditional upsert in the Worker DB routes, so it is **gated on the
  Hetzner/Hyperdrive cutover settling** (that code is active WIP).
- Heroes (`heroesApi` + `localHeroStore`) get the same treatment afterwards;
  hero rows are small and conflicts even rarer, so games go first.

## 9. Hero ledger & mechanics invariants (added 2026-07-04, maintainer direction)

Playtest losses (equipment, then XP/levels, both "after a save") shared one
property: current state is stored as a mutable snapshot, so any skipped write,
stale-twin load, or field-shape change silently rewrites history. Direction:
make progression history immutable and current state verifiable.

### 9.1 Invariant checker (small, ship first)
On load, verify per hero and self-heal upward, never downward:
- `level` must equal the level implied by `xp` (XP_THRESHOLDS); if xp implies
  MORE than the stored level, heal up and report; if less, trust xp only when
  a ledger (9.2) confirms, otherwise keep the higher level and flag.
- `maxHP` must equal calculateMaxHPForLevel(class, level, con); heal upward.
- every equipped item key must exist in inventory (equipment.js already
  drops the bonus; the checker reports the dangling slot).
- A one-line system message when anything healed: visible honesty, same
  philosophy as the save-fallback notice.

### 9.2 Append-only grant ledger (medium)
Every irreversible gain appends an event to `settings.heroLedger` (capped,
compact): `{ t, heroId, kind: 'xp'|'level'|'item'|'gold', amount|key, source }`
written at the same chokepoints that already record codex discoveries. The
ledger rides inside the save payload (both stores), so:
- current state can be AUDITED against summed history ("this hero has 557 xp
  but the ledger sums 890: a stale snapshot overwrote progress"),
- the invariant checker gains a source of truth for healing DOWNWARD cases,
- twin-copy divergence (§6) becomes mergeable for progression specifically:
  union the ledgers, rebuild xp/gold/items, even when narrative state forks.
Not a full event-sourcing rewrite: snapshots stay authoritative for world
state; the ledger covers hero progression only.

### 9.3 Relationship to the rest of the plan
The rev protocol (§6) makes save lineage immutable; the ledger makes hero
progression immutable within a lineage. Together: an upgrade can change how
state is computed but can no longer silently lose what was earned.

## 10. Open questions

- Should the live session's IndexedDB write-ahead copy persist after a clean
  cloud sync (crash insurance) or be pruned aggressively (privacy on shared
  machines)? Leaning: keep while the session is live, prune on clean exit.
- Does the merged list need a "sync now" affordance, or is background reconcile
  + badge enough? Leaning: badge only; a manual button invites confusion.
- Guest→account conversion already covered by `LocalGameSync`; confirm the
  fork naming reads sensibly for that flow too (it should never fork: fresh
  accounts have no cloud rows).
