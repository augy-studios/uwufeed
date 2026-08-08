# discord-bot

uwuFeed for Discord, built on discord.py with slash commands. Follow
YouTube channels, blogs and anything with a feed, and get the new post in a
channel within seconds.

It shares one database with the web app and the Telegram bot, so a source
followed in any of the three is the same source everywhere.

## Commands

| Command | What it does | Status |
| --- | --- | --- |
| `/help` | What this is, every command, and links to the app and the donation page | Working |
| `/add` | Follow a channel, a blog or a feed | Phase 5 |
| `/list` | Everything this server follows | Phase 5 |
| `/remove` | Stop following one of them | Phase 5 |
| `/pause` | Hold delivery here, run it again to resume | Working, stored |
| `/latest` | The most recent items, on demand | Phase 5 |
| `/status` | Health of the sources this server follows | Phase 5 |
| `/settings` | Which channel receives posts, quiet hours, digest | Phase 5 |
| `/link` | Connect this server to a web account | Phase 5, needs Phase 4 auth |

There is deliberately no start command. Everything belongs in `/help`.

## Files

| File | What it does |
| --- | --- |
| `main.py` | Bot bootstrap, extension loading, command sync, view restoration |
| `config.py` | Environment, and a check that fails fast when something is missing |
| `db.py` | Bot local SQLite: views, guild preferences, scheduling, account links |
| `views.py` | Persistent views and the startup registry |
| `feed_store.py` | The only module that talks to Supabase |
| `cogs/` | One module per group of commands |

## Setup

```sh
cd discord-bot
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env   # then fill it in
python main.py
```

Python 3.11 or newer.

## Creating the application

1. <https://discord.com/developers/applications>, New Application, name it
   uwuFeed.
2. Bot tab, Reset Token, copy it into `DISCORD_BOT_TOKEN`. It is shown
   once.
3. Leave every privileged intent **off**. Slash commands do not need
   message content, and asking for an intent that is unused means a review
   for nothing.
4. OAuth2 URL Generator, scopes `bot` and `applications.commands`,
   permissions Send Messages, Embed Links and Use Slash Commands.
5. Open the generated URL and add it to a server.

Set `DISCORD_DEV_GUILD_ID` while developing. Commands sync to that one
guild instantly, where a global sync can take up to an hour to appear.

## Running on the VPS

```sh
tmux new -s uwufeed-discord
cd ~/uwufeed/discord-bot && . .venv/bin/activate && python main.py
# ctrl-b then d to detach
```

`tmux attach -t uwufeed-discord` to come back. There is a systemd unit in
[`../infra/systemd/`](../infra/systemd/) for restart on boot.

## Where state lives

**Supabase Postgres** holds sources, items and subscriptions. Shared with
the site and the Telegram bot, and never copied here.

**SQLite** holds only what belongs to this bot: view state, per guild
preferences, scheduling, and the guild to account mapping. SQLite tables
take no prefix; that rule is for Postgres.

## Persistent views

A view survives a restart only if it has no timeout and every component
carries a stable `custom_id`. Both are handled in `views.py`.

The `custom_id` is a key into SQLite rather than the payload itself, so the
100 character limit never becomes a constraint and the stored state can
grow later without breaking messages already sent.

`views.restore_all(bot)` runs from `on_ready` and re-registers one instance
per stored kind. Discord routes interactions by `custom_id`, so buttons on
old messages start working again as soon as the class is registered. Skip
this and every button in the server's history answers with an interaction
failure.

## Style rules for messages

- Embeds rather than plain text where there is anything to lay out.
- No em dashes anywhere. Rephrase instead of reaching for one.
- Never mention the bot's own name inside command text.
- No emoji as icons.
- Command replies are ephemeral unless the whole channel benefits from
  seeing them.

## Environment

`DISCORD_BOT_TOKEN`, `DISCORD_SQLITE_PATH`, `DISCORD_DEV_GUILD_ID`,
`WEB_APP_URL`, `DONATION_URL`, `SUPABASE_URL`,
`SUPABASE_SERVICE_KEY`. See [`../.env.example`](../.env.example).

Delivery to Discord in Phase 1 does not run here at all. It goes through a
webhook from the dispatcher, in [`../workers/dispatcher/`](../workers/dispatcher/),
because webhooks have friendlier rate limits than the bot gateway.

## Knowledge base content

If quotes, facts or similar are ever needed, call an open source REST API
for them. No static list baked into the repository.
