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
| `/add` | Follow a channel, a blog or a feed | Working |
| `/list` | Everything this server follows | Working |
| `/remove` | Stop following one of them | Working |
| `/pause` | Hold delivery here, run it again to resume | Working |
| `/latest` | The most recent items, on demand | Working |
| `/status` | Health of the sources this server follows | Working |
| `/settings` | Choose the channel that receives posts | Working |
| `/route` | Send one source only to some destinations | Working |
| `/link` | Connect this server to a web account | Working |

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

Creating the application in the Discord Developer Portal, the permissions
the invite URL needs, installing it and running it on the VPS are all in
[`SETUP.md`](SETUP.md).

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

## Environment

`DISCORD_BOT_TOKEN`, `DISCORD_SQLITE_PATH`, `DISCORD_DEV_GUILD_ID`,
`WEB_APP_URL`, `DONATION_URL`, `SUPABASE_URL`,
`SUPABASE_SERVICE_KEY`. See [`../.env.example`](../.env.example).

Delivery to Discord does not run here at all. It goes through a
webhook from the dispatcher, in [`../workers/dispatcher/`](../workers/dispatcher/),
because webhooks have friendlier rate limits than the bot gateway.

## Knowledge base content

If quotes, facts or similar are ever needed, call an open source REST API
for them. No static list baked into the repository.
