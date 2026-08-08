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

## First run on a fresh box

```sh
sudo apt update
sudo apt install -y python3 python3-venv python3-pip git tmux

sudo adduser --system --group --home /home/uwufeed uwufeed
sudo -u uwufeed git clone <repo> /home/uwufeed/uwufeed
cd /home/uwufeed/uwufeed

cp .env.example .env    # then fill it in
chmod 600 .env

for dir in workers telegram-bot discord-bot; do
  python3 -m venv "$dir/.venv"
  "$dir/.venv/bin/pip" install -r "$dir/requirements.txt"
done
```

Debian 13 ships Python 3.13, which is comfortably above the 3.11 floor.

## Two ways to run

**tmux**, for working on things:

```sh
./infra/tmux-bootstrap.sh
tmux attach -t uwufeed
```

**systemd**, for anything that should survive a reboot. See
[`systemd/README.md`](systemd/README.md).

Use systemd for the real thing and tmux while iterating. Running both at
once means two dispatchers, which is survivable, because the delivery claim
stops a double send, but confusing.

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

```sh
./infra/backup.sh
```

Daily, from crontab:

```text
0 5 * * * /home/uwufeed/uwufeed/infra/backup.sh
```

It uses `sqlite3 .backup` rather than `cp`, because copying a database
while the bot has it open can capture a torn write.

## Time

The lease renewal cron, quiet hours and digests all reason about time.
Keep the box on UTC and let the presentation layer localise:

```sh
sudo timedatectl set-timezone UTC
```
