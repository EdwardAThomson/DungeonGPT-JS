# Redemption codes

Time-boxed membership via pre-generated codes: the billing MVP (backlog #6 first
slice), shipping BEFORE payment rails. Use cases: playtester rewards, launch promos,
refund/goodwill instruments (maintainer 2026-07-06/07). When the code and this doc
disagree, the code wins.

## Schema (migration `cf-worker/migrations/006_redemption_codes.sql`)

Three tables in the data Postgres (applied manually via psql, runbook in the file):

- **`redemption_codes`**: `code` (PK, canonical dashed `XXXX-XXXX-XXXX`, Crockford-style
  base32 with no 0/O/1/I), `grants_tier` ('member' | 'premium' | 'elite'),
  `grant_days`, `max_uses` / `uses`, `expires_at` (mandatory: the code's redemption
  window), `disabled` (kill switch), `note`, `created_at`.
- **`tier_grants`**: append-only grants per user: `user_id`, `tier`, `source`
  (`code:<CODE>` for this feature; future billing/admin sources share the table),
  `starts_at`, `expires_at`. Indexed on `(user_id, expires_at)`.
- **`code_redemptions`**: audit + uniqueness: PK `(code, user_id)` means one
  redemption of a given code per account, enforced by the database.

## Endpoint contract

`POST /api/db/redeem-code` (authed like the rest of the `/api/db` group), body
`{ "code": "<as typed>" }`. The Worker normalizes input (uppercase, strip
spaces/dashes) before lookup and stores/compares the canonical dashed form.

Success `200 { tier, expiresAt }` after, atomically in one transaction:
claim a use (`UPDATE ... SET uses = uses + 1 WHERE ... uses < max_uses RETURNING`,
so a race on the last use cannot oversubscribe), insert the `tier_grants` row
(`now() + grant_days`, source `code:<CODE>`), insert the `code_redemptions` row.

Errors (honest but unhelpful to brute force):

| Status | `code` | Meaning |
| --- | --- | --- |
| 400 | `code_invalid` | not found, expired, disabled, exhausted or malformed: ONE generic bucket, no oracle |
| 409 | `already_redeemed` | this account already redeemed this code (the one distinct case; it helps real users and leaks nothing new) |
| 429 | `rate_limited` | over the per-user attempt allowance (10 per UTC day, `redeem-code` bucket in `request_counters`) |
| 503 | `redeem_unavailable` | attempt counter unreachable; this guard fails CLOSED (abuse surface), unlike the fail-open AI limiter |

`GET /api/db/entitlements` gained an additive field: `expiresAt` is the grant's end
date when the effective tier comes from a grant, `null` when the stored tier already
covers it. `{ tier, updatedAt }` are unchanged.

## Effective tier

`getAccountTier` / `getEffectiveTier` (`cf-worker/src/services/tiers.ts`) resolve the
MAX rank of the `account_tiers` base row and any `tier_grants` row with
`expires_at > now()`, in one UNION ALL round trip. A grant can raise the tier, never
lower it (premium base + member grant stays premium). Expiry is passive: a lapsed
grant simply stops counting; nothing is ever deleted. Grandfathering is unaffected:
tiers gate creation, never play. Every existing tier consumer (entitlements,
premium-templates delivery, premium AI gate, member rate allowances) flows through
this automatically.

## Code lifecycle

- Created in the **private admin panel**, small batches, each batch with a `note`.
  There is no generator in this repo and no create/list endpoint on the Worker.
- Every code carries a mandatory `expires_at`: no immortal codes, no code sprawl.
- A code dies by: its `expires_at` passing, `uses` reaching `max_uses`, or
  `disabled = true` (leaked-batch kill switch). All three collapse into the same
  generic `code_invalid` at the endpoint.
- Redemption appends (grant + redemption rows) and increments `uses`; nothing in the
  feature deletes rows, so the tables are the audit trail.

## Client

Redemption happens on the **Profile page** (`src/pages/Profile.js`): a "Redeem a
code" field in the membership section. On success the page confirms the granted tier
and end date and re-resolves entitlements the same way sign-in does
(`refreshTier` in `AuthContext` -> `refreshUserTier()` + premium-template reload),
so gates unlock without re-login. The Membership row shows "active until <date>"
when the tier is grant-backed. Service hop: `src/services/redemptionApi.js`.
