# db

Supabase Postgres is the single source of truth for feed data. Everything
in this directory describes that database. Nothing here runs on its own.

## What lives here

- [`migrations/`](migrations/) plain SQL, applied in filename order.
- [`schema.md`](schema.md) the normalized item shape, the contract between
  the JavaScript and Python halves of the project.
- [`shared-auth.md`](shared-auth.md) the shape of the pre-existing
  `uwu_users` and `uwu_sessions` tables. Reference, not a migration.

## Naming

Every table carries the `uwufeed_` prefix, apart from `uwu_users` and
`uwu_sessions`, which keep the suite wide naming because they are shared
with the other uwu apps. SQLite tables inside the bots take no prefix at
all, and SQLite never holds feed data.

## The auth tables are owned elsewhere

`uwu_users` and `uwu_sessions` already exist in Supabase and are shared
across the suite. Nothing in this directory creates them, alters them, or
changes their grants, because an app that is not in this repository is
also using them.

uwuFeed only reads them and holds foreign keys into `uwu_users(id)`, which
is `uuid`. If the shape of those tables ever changes, this project follows
rather than leads.

Their exact definition is recorded in [`shared-auth.md`](shared-auth.md),
along with the three things about it that are easy to get wrong: the email
column is case sensitive rather than `citext`, `username` is required and
unique, and `uwu_sessions.user_id` is nullable.

## Tables

| Table | Holds |
| --- | --- |
| `uwu_users` | Account identity. Pre-existing, shared, not created here |
| `uwu_sessions` | Opaque session tokens. Pre-existing, shared, not created here |
| `uwufeed_sources` | One row per feed, shared across all users |
| `uwufeed_items` | Normalized items, deduped by `(source_id, external_id)` |
| `uwufeed_subscriptions` | Which user follows which source |
| `uwufeed_targets` | Where a notification goes, per channel |
| `uwufeed_deliveries` | What was already sent, keyed `(item_id, target_id)` |
| `uwufeed_templates` | Per user, per channel render bodies |

## Load bearing details

- `tier` decides whether the poller ever looks at a row. Push sources have
  `next_check_at` null, and a check constraint enforces it.
- `lease_expires_at` drives the nightly renewal cron. WebSub leases cap at
  ten days. Skip renewal and the push tier goes quiet after a week and a
  half without a single error anywhere.
- `unique (source_id, external_id)` makes dedup the database's job.
- `uwufeed_deliveries` has a composite primary key, so a dispatcher that
  crashes mid fan out and restarts cannot send twice.
- Sources are shared and subscriptions are per user. One channel followed
  by 400 people is fetched once, which is the whole reason this can stay
  free.

## Connecting

| Component | Connection |
| --- | --- |
| Vercel functions | PostgREST over HTTPS, `SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY`. No connection pool to exhaust |
| Vercel, if raw SQL is ever needed | `SUPABASE_DB_URL_POOLER`, the transaction pooler, never the direct URL |
| VPS workers and bots | `SUPABASE_DB_URL_DIRECT` for SQL, or PostgREST for simple reads and writes |

Serverless functions opening direct connections is the fastest way to
exhaust the database, which is why the functions in `main-site/api/` speak
PostgREST and nothing else.

## Row level security

RLS is on for every table with no policies attached, so the anon and
authenticated roles can read nothing. Access is service role only, which
bypasses RLS. Auth is custom, so no request ever reaches Postgres carrying
a Supabase JWT.

## Applying migrations

See [`migrations/README.md`](migrations/README.md).
