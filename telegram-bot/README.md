# telegram-bot

The Telegram half of uwuFeed, built on Telethon. Follow YouTube channels,
blogs and anything with a feed, and get the new post in a chat within
seconds.

It shares one database with the web app and the Discord bot, so a source
followed in any of the three is the same source everywhere.

## Commands

| Command | What it does | Status |
| --- | --- | --- |
| `/start` | What this is, every command, and links to the app and the donation page | Working |
| `/add` | Follow a channel, a blog or a feed | Working |
| `/list` | Everything this chat follows | Working |
| `/remove` | Stop following one of them | Working |
| `/route` | Send one source only to some destinations | Working |
| `/pause` | Hold delivery here, run it again to resume | Working |
| `/latest` | The most recent items, on demand | Working |
| `/status` | Health of the sources this chat follows | Working |
| `/settings` | Delivery preferences for this chat | Working, partial |
| `/link` | Connect this chat to a web account | Working |

There is deliberately no help command. Everything belongs in `/start`, and
two commands that print the same thing is one more thing to keep in sync.

## Files

| File | What it does |
| --- | --- |
| `main.py` | Client bootstrap, the callback router, the run loop |
| `config.py` | Environment, and a check that fails fast when something is missing |
| `db.py` | Bot local SQLite: buttons, chat preferences, scheduling, account links |
| `buttons.py` | Persistent inline buttons |
| `feed_store.py` | The only module that talks to Supabase |
| `commands/` | One module per command |

## Setup

Creating the bot with BotFather, installing it and running it on the VPS
are all in [`SETUP.md`](SETUP.md).

## Where state lives

**Supabase Postgres** holds sources, items and subscriptions. Shared with
the site and the Discord bot, and never copied here.

**SQLite** holds only what belongs to this bot: button state, per chat
preferences, scheduling, and the chat to account mapping. SQLite tables
take no prefix; that rule is for Postgres.

The one Supabase identifier stored in SQLite is `account_links.user_id`,
which is a pointer rather than a copy of feed data.

## Persistent buttons

Telegram callback data is capped at 64 bytes and lives on the message
forever. A button carries a token, and the payload sits in the `buttons`
table, so a callback still resolves months later, after a restart or a
redeploy.

An unknown token means the row was pruned. The router says so rather than
failing silently. `buttons.prune()` clears anything older than 90 days.

## Environment

`TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_SQLITE_PATH`, `TELEGRAM_SESSION_NAME`, `WEB_APP_URL`,
`DONATION_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`. See
[`../.env.example`](../.env.example).

The `.session` file Telethon writes is a credential. It is in
`.gitignore` and must stay there.

## Knowledge base content

If quotes, facts or similar are ever needed, call an open source REST API
for them. No static list baked into the repository.
