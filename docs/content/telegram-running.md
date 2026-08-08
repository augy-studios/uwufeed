# Running the Telegram bot

For running your own instance. If you only want to use the hosted bot, the
[commands page](#/telegram-commands) is what you want.

## Credentials

Two sets, and both are needed. Telethon is a full MTProto client rather
than a Bot API wrapper, so a bot token on its own is not enough.

**API id and hash** from <https://my.telegram.org>, under API development
tools. These belong to your Telegram account and are reused across every
bot you run.

**A bot token** from [@BotFather](https://t.me/BotFather) with `/newbot`.

```text
TELEGRAM_API_ID=1234567
TELEGRAM_API_HASH=your_api_hash
TELEGRAM_BOT_TOKEN=1234567890:AA...
```

If a token leaks, `/revoke` in BotFather issues a new one and kills the old
one immediately.

## Installing

```sh
cd telegram-bot
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env
python main.py
```

Python 3.11 or newer.

## Setting up the profile

The about text, the description, the command list and the profile picture
are all set through BotFather, and the full walkthrough with the exact text
to paste is in `telegram-bot/SETUP.md` in the repository.

Keep the BotFather command list in step with the list in `/start`. They are
two places saying the same thing, and only one of them is in version
control.

## Keeping it running

Inside tmux, which survives an SSH session ending:

```sh
tmux new -s uwufeed-telegram
cd ~/uwufeed/telegram-bot && . .venv/bin/activate && python main.py
```

Detach with ctrl-b then d, reattach with `tmux attach -t uwufeed-telegram`.

For restart after a reboot, install the systemd unit from
`infra/systemd/`. Use systemd for the real thing and tmux while working on
it.

:::warn The session file is a credential
On the first run Telethon writes a `.session` file next to `main.py`.
Anyone with that file can act as the bot. It is in `.gitignore` and must
stay there.
:::

## Local state

A SQLite file holds button state, per chat preferences, scheduling and the
chat to account mapping. Nothing about feeds is in it.

It is worth backing up. Losing it means every button in the bot's history
stops working:

```sh
sqlite3 bot.sqlite3 ".backup /home/uwufeed/backups/telegram.sqlite3"
```

Supabase covers the feed data. Nothing covers this file unless you do.
