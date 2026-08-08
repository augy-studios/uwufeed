# workers

Python processes that run continuously on the Debian VPS. Everything here
holds a connection open, keeps a loop running, or both, which is exactly
what a serverless function cannot do. Request shaped work belongs in
[`../main-site/api/`](../main-site/api/) instead.

| Directory | What it does | Status |
| --- | --- | --- |
| [`dispatcher/`](dispatcher/) | Listens on Supabase Realtime, fans out to targets | Working, Discord only |
| [`poller/`](poller/) | The poll tier, `next_check_at` batches | Stub, Phase 2, except `normalize.py` |
| [`streams/`](streams/) | Bluesky and Mastodon long lived connections | Stub, Phase 6 |

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
```

Run from this directory, as a module. The channel modules import their
siblings with relative imports, so running `dispatcher/main.py` as a script
fails on the first import.

Under tmux and systemd on the VPS, see [`../infra/`](../infra/).

## Database connections

Workers are long lived, so they may use the direct connection,
`SUPABASE_DB_URL_DIRECT`, rather than the pooler. The dispatcher currently
uses PostgREST anyway because its queries are small, and that keeps it to
one HTTP dependency. The poller will want real SQL, because
`for update skip locked` has no REST equivalent.

Never point a worker at the transaction pooler for `skip locked` work.
Transaction mode pooling and row locks held across statements do not mix.

## Item shape

`poller/normalize.py` is the Python half of the contract in
[`../db/schema.md`](../db/schema.md). Its JavaScript twin is
`main-site/api/_lib/normalize.js`. Change one without the other and the two
halves of the project start writing different rows for the same feed.

## Environment

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL_DIRECT`,
`DISCORD_WEBHOOK_URL`, `USER_AGENT_CONTACT`, and later
`VAPID_*` and `NTFY_BASE_URL`. See [`../.env.example`](../.env.example).
