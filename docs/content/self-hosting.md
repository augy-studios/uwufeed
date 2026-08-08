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

The numbering starts at `0003` on purpose. `uwu_users` and `uwu_sessions`
are shared across the uwu suite, already exist, and are never created or
altered from this repository. If you are deploying uwuFeed standalone
rather than alongside the other uwu apps, you have to create those two
tables yourself before `0005` runs, since three tables hold a foreign key
into `uwu_users(id)`.

Row level security is on for every table with no policies attached, so the
anonymous key can read nothing. Access is service role only.

## 2. Vercel

Point a project at the repository with **root directory set to
`main-site`**. No build command and no output directory.

Environment variables:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
PUBLIC_BASE_URL
WEBSUB_CALLBACK_SECRET
WEBSUB_LEASE_SECONDS
ADMIN_TOKEN
CRON_SECRET
USER_AGENT_CONTACT
```

`PUBLIC_BASE_URL` is what hubs call back. If it is wrong, every
subscription verifies against nothing and no notification ever arrives,
with no error to tell you.

## 3. The docs

This site is a separate Vercel project with root directory `docs`. It is
entirely static and shares nothing with the app but the theme.

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

The service role key bypasses row level security entirely. Anything holding
it has full access to the database, so it belongs in exactly two places:
Vercel's environment settings, and a mode 600 `.env` on the VPS.

Never in the repository, never in the browser, never in a bot message.

:::warn Renew the leases
`/api/cron/renew-leases` is a stub. A WebSub lease lasts at most ten days,
so an untouched deployment stops receiving push notifications after one
lease period with nothing logging an error. Finish that cron before
trusting a deployment, or resubscribe by hand.
:::

## Costs at rest

The push tier costs nothing while idle. A deployment following 200 YouTube
channels that publish twice a week does almost no work: no polling, no
requests, and one webhook per upload.

The poll tier is where cost lives, and conditional requests plus adaptive
intervals are what keep it small.
