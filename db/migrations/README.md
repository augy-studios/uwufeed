# db/migrations

Plain SQL, applied in filename order. No migration tool and no down
migrations: every file is written to be safe to re-run, using
`create table if not exists` and `create or replace`.

## The auth tables are not here

`uwu_users` and `uwu_sessions` already exist in Supabase. They are shared
across the uwu suite, they predate this project, and nothing in this
directory creates, alters or grants on them.

That is why the numbering starts at `0003`. The gap is deliberate: 0001 and
0002 would have been those two tables. Renumbering would be worse than the
gap, because these files may already have been applied somewhere.

Three tables carry a foreign key to `uwu_users(id)`, so that table has to
exist before `0005` runs.

## Order

| File | What it creates |
| --- | --- |
| `0003_uwufeed_sources.sql` | `uwufeed_sources` and the due and lease indexes |
| `0004_uwufeed_items.sql` | `uwufeed_items` with `unique (source_id, external_id)` |
| `0005_uwufeed_subscriptions.sql` | `uwufeed_subscriptions` |
| `0006_uwufeed_templates.sql` | `uwufeed_templates`, before targets because targets reference it |
| `0007_uwufeed_targets.sql` | `uwufeed_targets` |
| `0008_uwufeed_deliveries.sql` | `uwufeed_deliveries` with the composite primary key |
| `0009_realtime.sql` | adds `uwufeed_items` to the Realtime publication |
| `0010_rls.sql` | RLS on the `uwufeed_` tables only, no policies, service role only |
| `0011_pending_deliveries.sql` | `uwufeed_pending_deliveries()` for dispatcher catch up |

## Applying

Paste each file into the Supabase SQL editor in order, or from the VPS:

```sh
for f in db/migrations/[0-9]*.sql; do
  psql "$SUPABASE_DB_URL_DIRECT" -v ON_ERROR_STOP=1 -f "$f"
done
```

`0009_realtime.sql` is the one that is not idempotent. `alter publication
... add table` errors if the table is already a member, which is harmless,
but it will stop the loop above. Run it on its own the first time.

## Adding a migration

Next number, one concern per file, and update the table above. If a change
alters the shape of an item, update [`../schema.md`](../schema.md) in the
same commit. That file is the contract the JS and Python halves both build
against, and it going stale is how the two sides drift apart.
