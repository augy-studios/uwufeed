# Setting up the VPS

From a fresh box to everything running and surviving a reboot. Start here
if the machine is new; the per directory setup pages assume this is done.

## 1. Packages and a user

```sh
sudo apt update
sudo apt install -y python3 python3-venv python3-pip git tmux sqlite3

sudo adduser --system --group --home /home/uwufeed uwufeed
sudo -u uwufeed git clone <repo> /home/uwufeed/uwufeed
cd /home/uwufeed/uwufeed
```

Debian 13 ships Python 3.13, comfortably above the 3.11 floor.

## 2. Secrets

```sh
cp .env.example .env
chmod 600 .env
```

`chmod 600` matters. The Supabase service role key in there bypasses row
level security entirely, so it lives in exactly two places: Vercel's
environment settings, and this file.

## 3. Virtualenvs

```sh
for dir in workers telegram-bot discord-bot; do
  python3 -m venv "$dir/.venv"
  "$dir/.venv/bin/pip" install -r "$dir/requirements.txt"
done
```

## 4. Set the clock to UTC

```sh
sudo timedatectl set-timezone UTC
```

Lease renewal, quiet hours and digests all reason about time. Keep the box
on UTC and let the presentation layer localise. A box on local time makes
quiet hours wrong in a way that is very hard to see.

## 5. Start things

**tmux**, while working on things:

```sh
./infra/tmux-bootstrap.sh
tmux attach -t uwufeed
```

**systemd**, for anything that should survive a reboot. Units and install
steps are in [`systemd/README.md`](systemd/README.md).

Use systemd for the real thing and tmux while iterating. Running both at
once means two dispatchers, which is survivable because the delivery claim
stops a double send, but confusing.

## 6. Backups

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
while a bot has it open can capture a torn write.

## 7. RSSHub, optional

Only needed for sites that publish nothing machine readable. The compose
file is in [`rsshub/`](rsshub/), and it binds to localhost on purpose: an
RSSHub reachable from the internet gets found and used by strangers, and
then the sites it scrapes block your VPS rather than theirs.

Leave `RSSHUB_BASE_URL` empty to switch the feature off, in which case
unmapped URLs report no feed found.

## Where to go next

| Next | Page |
| --- | --- |
| The three worker processes | [`../workers/SETUP.md`](../workers/SETUP.md) |
| Telegram bot, from BotFather | [`../telegram-bot/SETUP.md`](../telegram-bot/SETUP.md) |
| Discord bot, from the Developer Portal | [`../discord-bot/SETUP.md`](../discord-bot/SETUP.md) |

## Checklist

- [ ] `uwufeed` user created and repository cloned
- [ ] `.env` filled in and `chmod 600`
- [ ] Three virtualenvs built
- [ ] Timezone is UTC
- [ ] systemd units installed and enabled
- [ ] `backup.sh` in crontab
- [ ] Not running tmux and systemd copies at the same time
