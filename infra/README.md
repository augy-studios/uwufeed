# infra

Everything needed to run the VPS half of uwuFeed on Debian 13. Nothing here
is deployed by Vercel and nothing here is imported by application code.

| Path | What it is |
| --- | --- |
| [`systemd/`](systemd/) | Unit files for the dispatcher, both bots and the poller |
| [`rsshub/`](rsshub/) | RSSHub container, for the long tail |
| [`tmux-bootstrap.sh`](tmux-bootstrap.sh) | Start every process in one tmux session |
| [`backup.sh`](backup.sh) | Back up the bot SQLite files, which nothing else covers |

## What runs on the VPS and why

| Process | Why it cannot be serverless |
| --- | --- |
| Dispatcher | Holds a websocket open to Supabase Realtime |
| Poller | A loop with row locks held across statements |
| Bluesky listener | One long lived Jetstream connection covering every Bluesky source |
| Telegram bot | Long polling or a persistent connection |
| Discord bot | A gateway websocket that must stay connected |
| RSSHub | A container, and a stateful cache |

The webhook receivers are on Vercel even though they are part of the
instant path, because a webhook is request shaped. The rule is not push
versus poll, it is request shaped versus continuous.

## Setting up a fresh box

Packages, the service user, virtualenvs, the clock, systemd and backups are
all in [`SETUP.md`](SETUP.md).

## Secrets

One `.env` at the repository root, mode 600, owned by the `uwufeed` user.
Every unit file reads it through `EnvironmentFile`. It is in `.gitignore`
and must never be committed.

The service role key bypasses row level security entirely. Anything holding
it has full access to the database, which is why it lives only on this box
and in Vercel's environment settings.

## Database connections

VPS processes use the direct connection, `SUPABASE_DB_URL_DIRECT`, not the
pooler. The poller needs `for update skip locked`, which holds row locks
across statements, and transaction mode pooling breaks that.

Vercel functions are the opposite case and use PostgREST or the pooler,
never a direct connection.

## Backups

Supabase covers Postgres. The bot SQLite files are covered by nothing else
and hold button state, per chat preferences and the chat to account
mapping. Losing one means every button in that bot's history stops working
and every linked chat forgets which account it belongs to.

[`backup.sh`](backup.sh) handles it, and the crontab line is in
[`SETUP.md`](SETUP.md). It uses `sqlite3 .backup` rather than `cp`, because
copying a database while a bot has it open can capture a torn write.
