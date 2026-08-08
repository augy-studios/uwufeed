# Self hosting

Running your own uwuFeed. Two halves: a Vercel project for anything request
shaped, and a Debian box for anything that runs continuously.

## What you need

| Piece | Why |
| --- | --- |
| A Supabase project | Postgres, plus Realtime for the dispatcher |
| A Vercel project | The web app, the API and the webhook receivers |
| A small VPS | The dispatcher, the poller and both bots |
| A domain | The WebSub callback has to be publicly reachable |

The free tiers of Supabase and Vercel are enough to start. The VPS is the
only guaranteed cost, and the workloads are light enough for the smallest
box on offer.

## 1. Database

Apply everything in `db/migrations/` in filename order. `0009_realtime.sql`
errors if the table is already in the publication, so run it separately the
first time.

Everything uwuFeed needs is created by these files, accounts included, so
a standalone deployment needs nothing set up beforehand. See
[accounts](#/accounts) for why it does not share the suite wide auth
tables.

Row level security is on for every table with no policies attached, so the
anonymous key can read nothing. Access is service role only.

## 2. Vercel

Point a project at the repository with **root directory set to
`main-site`**. No build command and no output directory.

Environment variables:

```text
SUPABASE_URL
SUPABASE_SERVICE_KEY
PUBLIC_BASE_URL
WEBSUB_CALLBACK_SECRET
WEBSUB_LEASE_SECONDS
ADMIN_TOKEN
CRON_SECRET
USER_AGENT_CONTACT
DISCORD_WEBHOOK_URL
```

`PUBLIC_BASE_URL` is what hubs call back. If it is wrong, every
subscription verifies against nothing and no notification ever arrives,
with no error to tell you.

:::warn Deployment protection and the callback URL
If the project has Vercel Authentication or password protection enabled,
set it to apply to everything **except** custom domains, and make
`PUBLIC_BASE_URL` the custom domain.

A protected URL answers a hub with a login page rather than the webhook
receiver. The hub sees a 401, gives up, and the push tier receives nothing
ever again. Nothing appears in the application logs, because the request
never reaches the application.

It also means preview deployments cannot exercise the push path, since
preview URLs are protected. Test it on production or through a tunnel.
:::

## 3. The docs

This site is a separate Vercel project with root directory `docs`. It is
entirely static and shares nothing with the app but the theme.

The live deployment uses two domains:

| Site | Domain | Vercel root directory |
| --- | --- | --- |
| App | `feed.uwuapps.org` | `main-site` |
| Docs | `docs.feed.uwuapps.org` | `docs` |

They are separate origins, so nothing is shared between them at runtime,
not the service worker, not the cache, not `localStorage`.

## 4. The VPS

```sh
sudo apt install -y python3 python3-venv python3-pip git tmux
sudo adduser --system --group --home /home/uwufeed uwufeed
sudo -u uwufeed git clone <repo> /home/uwufeed/uwufeed
cd /home/uwufeed/uwufeed
cp .env.example .env && chmod 600 .env

for dir in workers telegram-bot discord-bot; do
  python3 -m venv "$dir/.venv"
  "$dir/.venv/bin/pip" install -r "$dir/requirements.txt"
done
```

Then install the systemd units from `infra/systemd/`, or start everything
in tmux with `infra/tmux-bootstrap.sh`.

Keep the box on UTC. The lease cron, quiet hours and digests all reason
about time, and localising at the edges is far easier than unpicking a
server in a different zone.

## 5. Add a source

```sh
curl -X POST "$PUBLIC_BASE_URL/api/sources/resolve" \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"url":"https://www.youtube.com/@SomeChannel"}'
```

## Secrets

Two kinds. Most come from somewhere: the Supabase keys from your project
settings, the bot tokens from BotFather and the Discord developer portal.

Four you generate yourself, and nothing will hand them to you:
`ADMIN_TOKEN`, `CRON_SECRET`, `WEBSUB_CALLBACK_SECRET` and
`LINK_TOKEN_SECRET`.

### Generating them

Any of these produces 32 random bytes, which is plenty for all four:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
python -c "import secrets; print(secrets.token_urlsafe(32))"
openssl rand -base64 32
```

On Windows, in PowerShell:

```powershell
$b = [byte[]]::new(32)
([Security.Cryptography.RNGCryptoServiceProvider]::new()).GetBytes($b)
[Convert]::ToBase64String($b)
```

Generate a **separate value for each**. Reusing one across two means
leaking one leaks both, and they have different blast radii.

Do not use a password manager's "memorable" generator, a UUID, or anything
you thought of yourself. These are compared byte for byte by machines and
never typed by a person, so there is no reason for them to be anything but
random.

### Where each one goes, and what changing it costs

| Variable | Set it in | Rotating it |
| --- | --- | --- |
| `CRON_SECRET` | Vercel only | Free. Take effect on the next deploy |
| `ADMIN_TOKEN` | Vercel **and** `telegram-bot/.env` | Free, if you change both. Change one and `/add` starts failing |
| `LINK_TOKEN_SECRET` | Vercel **and** both bot `.env` files | Free, if you change all of them. Any link code already issued stops working, which lasts ten minutes |
| `WEBSUB_CALLBACK_SECRET` | Vercel only | **Expensive.** See below |

### Rotating WEBSUB_CALLBACK_SECRET breaks every push source

The callback URL handed to every hub contains an HMAC derived from this
value. Change it and every URL a hub already holds stops verifying, so the
push tier goes quiet on the next lease renewal for every source at once.

Recovering means resubscribing everything through
`/api/sources/subscribe`, which the nightly cron will eventually do on its
own, but only as each lease comes up for renewal, so it takes up to ten
days to fully heal.

Set it once and leave it alone unless it leaks.

### The service role key

`SUPABASE_SERVICE_KEY` bypasses row level security entirely. Anything
holding it has full access to the database, so it belongs in exactly two
places: Vercel's environment settings, and a mode 600 `.env` on the VPS.

Never in the repository, never in the browser, never in a bot message.

:::warn Set the webhook in Vercel too
`DISCORD_WEBHOOK_URL` is read in two places: by the dispatcher on the VPS
to deliver items, and by the Vercel crons to report operational problems.
Without it in Vercel, lease renewal still works but goes silent when it
fails, which defeats the point of it alerting.
:::

## Costs at rest

The push tier costs nothing while idle. A deployment following 200 YouTube
channels that publish twice a week does almost no work: no polling, no
requests, and one webhook per upload.

The poll tier is where cost lives, and conditional requests plus adaptive
intervals are what keep it small.
