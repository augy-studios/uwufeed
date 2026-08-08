# Setting the bot up with BotFather

End to end, from nothing to a running bot. Fifteen minutes, most of it
waiting for BotFather to answer.

## 1. API credentials

The bot token alone is not enough. Telethon is a full MTProto client and
needs an API id and hash as well.

1. Sign in at <https://my.telegram.org> with your phone number.
2. Open **API development tools**.
3. Create an application. The name and short name are only shown to you.
4. Copy **App api_id** and **App api_hash**.

These belong to your Telegram account rather than to the bot, so they are
reused across every bot you run. Treat the hash as a password.

```text
TELEGRAM_API_ID=1234567
TELEGRAM_API_HASH=your_api_hash
```

## 2. Create the bot

Open [@BotFather](https://t.me/BotFather).

```text
/newbot
```

It asks two questions:

- **Name.** The display name at the top of the chat. Spaces are fine.
  `uwuFeed` is the obvious choice.
- **Username.** Must end in `bot` and must be unique. For example
  `uwufeed_bot`, or `uwufeedapp_bot` if that is taken.

BotFather replies with the token. Put it straight in `.env` and never in
the repository.

```text
TELEGRAM_BOT_TOKEN=1234567890:AA...
```

If the token ever leaks, `/revoke` in BotFather issues a new one and kills
the old one immediately.

## 3. About text

Shown on the bot's profile before anyone starts it, capped at 120
characters. This is the shop window, so it should say what the thing does
rather than what it is.

```text
/setabouttext
```

Then pick the bot, then send:

```text
Follow YouTube channels, blogs and feeds, and get new posts here within seconds. Free forever.
```

## 4. Description

Shown inside the empty chat, above the start button, capped at 512
characters. There is room to be useful here.

```text
/setdescription
```

Then:

```text
Push first feed aggregator.

Follow a YouTube channel, a blog or anything with a feed, and the new post lands in this chat within seconds rather than after a refresh loop. Sources that support push arrive in about two to ten seconds, everything else is polled.

Free forever, no account needed to start. The same subscriptions work on the web app and in Discord.

Send /start for the full command list.
```

## 5. Command list

This is what fills the menu button next to the message box. Keep it in step
with `COMMANDS` in `commands/start.py`.

```text
/setcommands
```

Then pick the bot and send this block exactly, one command per line, no
leading slashes:

```text
start - What this is and every command
add - Follow a channel, a blog or a feed
list - Everything this chat follows
remove - Stop following one of them
pause - Hold delivery here, run it again to resume
latest - The most recent items, on demand
status - Health of the sources this chat follows
settings - Quiet hours, format, digest instead of instant
link - Connect this chat to a web account
```

Note there is no `help` entry. That is deliberate: `/start` is the only
place the command list lives.

## 6. Profile picture

```text
/setuserpic
```

Then send the image. Requirements:

- Square, at least 512 by 512.
- PNG or JPEG. Send it as a **photo**, not as a file, or BotFather rejects
  it.
- It gets cropped to a circle in most places, so keep the important part in
  the middle and away from the corners.
- It is shown at about 40 pixels in a chat list. Anything with fine detail
  or small text turns to mush at that size.

Use the same artwork as the web app icon so the two read as one product.

## 7. Privacy mode

By default a bot in a group only sees messages that start with a command,
which is what we want. Leave it on unless something later needs to read
ordinary messages.

To check or change it:

```text
/setprivacy
```

If you ever turn it off, the change only applies after the bot is removed
from a group and added again.

## 8. Groups

If the bot should work in groups:

```text
/setjoingroups
```

Leave this enabled. A group is a good place for a feed to land.

Inside a group, Telegram sends commands as `/add@uwufeed_bot`. Every
handler pattern already allows for that, so nothing else is needed.

## 9. Inline mode

Not used, and it should stay off. It is off by default.

## 10. Run it

```sh
cd telegram-bot
cp ../.env.example .env
# fill in TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_BOT_TOKEN
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python main.py
```

On the first run Telethon writes a `.session` file next to `main.py`. That
file is a live credential: it is in `.gitignore` and must stay there.

Send `/start` in a private chat. You should get the intro, the command list
and two buttons.

## 11. Keep it running

```sh
tmux new -s uwufeed-telegram
cd ~/uwufeed/telegram-bot && . .venv/bin/activate && python main.py
```

Detach with ctrl-b then d. Reattach with
`tmux attach -t uwufeed-telegram`.

For restart on boot, see [`../infra/systemd/`](../infra/systemd/).

## Checklist

- [ ] `api_id` and `api_hash` from my.telegram.org, in `.env`
- [ ] Bot created, token in `.env` and nowhere else
- [ ] About text set, under 120 characters
- [ ] Description set
- [ ] Command list set and matching `commands/start.py`
- [ ] Profile picture set, square and legible at 40 pixels
- [ ] Privacy mode on
- [ ] `/start` answers with the intro and both buttons
- [ ] `.session` file is not in git
