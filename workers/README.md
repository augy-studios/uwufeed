# workers

Python processes that run continuously on the Debian VPS. Everything here
holds a connection open, keeps a loop running, or both, which is exactly
what a serverless function cannot do. Request shaped work belongs in
[`../main-site/api/`](../main-site/api/) instead.

| Directory | What it does | Status |
| --- | --- | --- |
| [`dispatcher/`](dispatcher/) | Listens on Supabase Realtime, fans out to targets | Working |
| [`poller/`](poller/) | The poll tier, `next_check_at` batches | Working |
| [`streams/`](streams/) | Bluesky Jetstream. Mastodon uses the poll tier instead | Working |

## Setup and running

Installing, the three processes and how to keep them up are in
[`SETUP.md`](SETUP.md). They run as modules from this directory, which is
the one thing worth knowing before reading anything else here.

## Database connections

Workers are long lived, so they may use the direct connection,
`SUPABASE_DB_URL_DIRECT`, rather than the pooler.

The two workers differ, on purpose:

| Worker | Connection | Why |
| --- | --- | --- |
| Dispatcher | PostgREST over HTTPS | Its queries are a handful of small reads and writes, so REST keeps it to one dependency |
| Poller | Direct, via psycopg | `for update skip locked` has no REST equivalent |

Never point the poller at the transaction pooler. Transaction mode pooling
and row locks do not mix, and the failure is subtle rather than loud.

## Item shape

`poller/normalize.py` is the Python half of the contract in
[`../db/schema.md`](../db/schema.md). Its JavaScript twin is
`main-site/api/_lib/normalize.js`. Change one without the other and the two
halves of the project start writing different rows for the same feed.

## Environment

`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_DB_URL_DIRECT`,
`DISCORD_WEBHOOK_URL`, `USER_AGENT_CONTACT`, and later
`VAPID_*` and `NTFY_BASE_URL`. See [`../.env.example`](../.env.example).
