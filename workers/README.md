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

## Setup

```sh
cd workers
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env   # then fill it in
```

Python 3.11 or newer. The code uses `str | None` in annotations at runtime
in a few places, so 3.10 is the hard floor and 3.11 is what Debian 13
ships.

## Running

```sh
cd workers
python -m dispatcher.main
python -m poller.main
python -m streams.bluesky
```

Three separate processes. Run from this directory, as modules: the
submodules import their siblings relatively, so running a file as a script
fails on the first import.

The Bluesky listener is only needed if anyone follows a Bluesky account.
It idles harmlessly otherwise.

Under tmux and systemd on the VPS, see [`../infra/`](../infra/).

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
