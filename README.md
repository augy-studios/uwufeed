# uwuFeed

Push first feed aggregator. One ingestion pipeline, four delivery channels,
free for users forever.

Follow a YouTube channel, a blog, a subreddit or anything with a feed, and
the new post arrives in seconds rather than minutes. The benchmark to beat
is 13 minutes.

## The idea

At the moment a source is added, uwuFeed fetches it once and looks for
`<link rel="hub">`. A hub means the publisher will tell us when something
changes, so the source joins the push tier and is never polled. No hub
means the poll tier, with conditional requests and an interval that adapts
between 60 seconds and an hour.

That one check is the difference between two second and thirteen minute
latency, and it costs a single HTTP request at signup.

| Source | Mechanism | Latency |
| --- | --- | --- |
| YouTube | WebSub | 2 to 10s |
| Blogs with a hub | WebSub | 2 to 10s |
| Twitch | EventSub | 2 to 10s |
| Bluesky | Jetstream websocket | Live |
| Mastodon | Streaming API | Live |
| Reddit, plain RSS, the rest | Adaptive polling | 60s to 1h |

## Repository layout

| Directory | Contains | Runs on |
| --- | --- | --- |
| [`main-site/`](main-site/) | The PWA and its serverless functions | Vercel |
| [`workers/`](workers/) | Dispatcher, poller, stream listeners | VPS |
| [`telegram-bot/`](telegram-bot/) | Telethon bot | VPS |
| [`discord-bot/`](discord-bot/) | discord.py slash command bot | VPS |
| [`db/`](db/) | Migrations and the item shape contract | Supabase |
| [`infra/`](infra/) | systemd units, tmux bootstrap, RSSHub | VPS |
| [`docs/`](docs/) | The documentation site, its own PWA | Vercel |

Every directory has its own README explaining what lives there, how to run
it and what it depends on.

Vercel's root directory is set to `main-site`, so paths in
`main-site/vercel.json` are relative to that directory and functions
resolve as `/api/...` in production. The docs are a second Vercel project
with its root directory set to `docs`.

## Current state

Built in phases, and the docs mark what works today rather than describing
everything as though it exists.

| Phase | What it is | State |
| --- | --- | --- |
| 0 | Schema and migrations, item shape frozen | Done |
| 1 | The push slice: WebSub, YouTube, one Discord webhook | Done |
| 2 | The poll slice: RSS, adaptive backoff, retention | Done |
| 3 | Telegram bot commands | Scaffolded |
| 4 | Accounts, timeline, web push | Scaffolded |
| 5 | Twitch and Discord bot commands | Scaffolded |
| 6 | RSSHub, Bluesky, Mastodon, ntfy | Scaffolded |
| 7 | Quotas, alerting, backups | Not started |

Both ingestion tiers work. A real YouTube upload reaches Discord in under
ten seconds through the push tier, and a source without a hub is polled on
an adaptive interval between 60 seconds and an hour, with conditional
requests and retirement of dead feeds.

Everything unbuilt answers clearly rather than failing. Vercel functions
return `501` with the phase they belong to, and the bots reply with a short
sentence. Nothing fails silently.

## Keeping the push tier alive

WebSub leases last at most ten days, and a lapsed lease is the worst
failure mode in the system: the push tier goes quiet with no failed
request, no exception and no alert, looking exactly like nobody
publishing.

`/api/cron/renew-leases` runs nightly against anything expiring within
three days, and alerts through the Discord webhook when a night does not
look healthy. A hub that rejects a source five times running drops that
source to the poll tier rather than retiring it, so a blog that abandoned
WebSub keeps working, just more slowly.

That does mean `DISCORD_WEBHOOK_URL` has to be set in Vercel as well as on
the VPS.

## Getting started

- [`docs/`](docs/) is the documentation site. Run it with
  `cd docs && python3 -m http.server 8000`
- [`docs/content/quick-start.md`](docs/content/quick-start.md) is the
  fastest path to a working notification
- [`docs/next-steps.md`](docs/next-steps.md) is what Phase 3 needs
- [`db/schema.md`](db/schema.md) is the contract between the JavaScript and
  Python halves

## Stack

Vanilla HTML, CSS and JavaScript on the front end. No framework, no
bundler, no build step. Vercel functions are plain JavaScript with no
dependencies. Workers and both bots are Python. Supabase Postgres is the
single source of truth for feed data, and SQLite is bot local state only.

Every Postgres table carries the `uwufeed_` prefix, apart from the shared
auth tables `uwu_users` and `uwu_sessions`, which keep the suite wide
naming. SQLite tables inside the bots take no prefix.

## Configuration

Copy [`.env.example`](.env.example) to `.env` and fill it in. Every
variable is listed there with a one line description. Nothing is hardcoded
and no key belongs in this repository.

The Supabase service role key bypasses row level security entirely, so it
lives in exactly two places: Vercel's environment settings, and a mode 600
`.env` on the VPS.

## Conventions

- No em dashes anywhere, in code, comments, docs or bot messages
- No emoji. Every icon is inline SVG
- Short comments, no decorative banners
- Light mode is the default, whatever the operating system says
- Jua everywhere
- Dedup and delivery deduplication are database concerns, never
  application ones

## Licence

See [LICENSE](LICENSE). Contributor expectations are in
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
