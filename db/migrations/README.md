# db/migrations

Plain SQL, applied in filename order. No migration tool and no down
migrations: every file is written to be safe to re-run, using
`create table if not exists` and `create or replace`.

## If you have already applied 0003 to 0011

You do **not** need to re-run everything. Run these, in this order:

| File | Why |
| --- | --- |
| `0001_uwufeed_users.sql` | New table |
| `0002_uwufeed_sessions.sql` | New table |
| `0012_repoint_user_fks.sql` | Moves the user foreign keys off `uwu_users` |
| `0013_fanout.sql` | Fan out functions for the dispatcher |
| `0014_subscription_targets.sql` | Per source routing to specific destinations |

`0001` has to run before `0012`, since the constraint it adds points at
`uwufeed_users`.

`0005`, `0006` and `0007` were edited to reference `uwufeed_users`, but
re-running them does nothing, because the tables already exist and
`create table if not exists` skips them. `0012` is what actually repoints
an existing database. That is the whole reason it exists.

Do not re-run `0009_realtime.sql`. It errors if the table is already in the
publication.

## Order, from scratch

| File | What it creates |
| --- | --- |
| `0001_uwufeed_users.sql` | `uwufeed_users`, plus the `pgcrypto` and `citext` extensions |
| `0002_uwufeed_sessions.sql` | `uwufeed_sessions` |
| `0003_uwufeed_sources.sql` | `uwufeed_sources` and the due and lease indexes |
| `0004_uwufeed_items.sql` | `uwufeed_items` with `unique (source_id, external_id)` |
| `0005_uwufeed_subscriptions.sql` | `uwufeed_subscriptions` |
| `0006_uwufeed_templates.sql` | `uwufeed_templates`, before targets because targets reference it |
| `0007_uwufeed_targets.sql` | `uwufeed_targets` |
| `0008_uwufeed_deliveries.sql` | `uwufeed_deliveries` with the composite primary key |
| `0009_realtime.sql` | adds `uwufeed_items` to the Realtime publication |
| `0010_rls.sql` | RLS on the feed tables, no policies, service role only |
| `0011_pending_deliveries.sql` | Superseded by `0013`, kept so the order stays stable |
| `0012_repoint_user_fks.sql` | Repoints user foreign keys, a no-op on a fresh database |
| `0013_fanout.sql` | `uwufeed_targets_for_item()` and `uwufeed_pending_fanout()` |
| `0014_subscription_targets.sql` | Per source routing, and both fan out functions updated |

## uwuFeed owns its accounts

`uwufeed_users` and `uwufeed_sessions` belong to this project. They are
deliberately **not** `uwu_users` and `uwu_sessions`, which are shared
across the uwu suite: uwuFeed creates accounts from bot chats, and that is
not something one app should do to a table the others read.

The consequence is accepted and worth stating plainly: an account from
another uwu app does not sign in here.

Nothing in this directory touches the shared tables at all any more, which
also means uwuFeed can be deployed standalone.

## Applying

Paste each file into the Supabase SQL editor in order, or from the VPS:

```sh
for f in db/migrations/[0-9]*.sql; do
  psql "$SUPABASE_DB_URL_DIRECT" -v ON_ERROR_STOP=1 -f "$f"
done
```

`0009_realtime.sql` is the one that is not idempotent, so run it on its own
the first time.

## Adding a migration

Next number, one concern per file, and update the table above. If a change
alters the shape of an item, update [`../schema.md`](../schema.md) in the
same commit. That file is the contract the JS and Python halves both build
against, and it going stale is how the two sides drift apart.
