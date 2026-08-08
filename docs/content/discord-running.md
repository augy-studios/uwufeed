# Running the Discord bot

For running your own instance. If you only want to use the hosted bot, the
[commands page](#/discord-commands) is what you want.

## Creating the application

1. Go to <https://discord.com/developers/applications> and create an
   application.
2. Bot tab, Reset Token, and copy it into `DISCORD_BOT_TOKEN`. It is shown
   once.
3. Leave every privileged intent **off**. Slash commands do not need
   message content, and asking for an intent you never use means a review
   for nothing.
4. OAuth2 URL Generator, scopes `bot` and `applications.commands`,
   permissions Send Messages, Embed Links and Use Slash Commands.
5. Open the generated URL and add it to a server.

## Installing

```sh
cd discord-bot
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env
python main.py
```

Python 3.11 or newer.

## Command sync

Global slash commands can take up to an hour to appear, which makes
development miserable. Set `DISCORD_DEV_GUILD_ID` to a test server and
commands sync there instantly.

Unset it for production, so the commands are available everywhere the bot
is added.

## Keeping it running

```sh
tmux new -s uwufeed-discord
cd ~/uwufeed/discord-bot && . .venv/bin/activate && python main.py
```

Detach with ctrl-b then d, reattach with `tmux attach -t uwufeed-discord`.

For restart after a reboot, install the systemd unit from
`infra/systemd/`.

## Delivery does not go through the bot

The dispatcher posts to a Discord webhook directly. Set
`DISCORD_WEBHOOK_URL` where the dispatcher runs, not where the bot runs.

That means posts keep arriving while the bot is restarted, and a server can
receive posts with no bot in it at all.

## Persistent views

Buttons survive a restart only when two things hold: the view has no
timeout, and every component has a stable identifier. Both are handled in
`views.py`.

On startup the stored rows are read and the views re-registered. Discord
routes interactions by identifier, so buttons on old messages start working
again as soon as the classes are registered. The startup log line reports
how many were restored, which is the quickest way to tell that step ran.

## Local state

A SQLite file holds view state, per server preferences, scheduling and the
server to account mapping. Nothing about feeds is in it.

Worth backing up, since losing it means every button in the bot's history
stops working:

```sh
sqlite3 bot.sqlite3 ".backup /home/uwufeed/backups/discord.sqlite3"
```
