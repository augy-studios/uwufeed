# Quick start

The fastest path to seeing a real notification arrive. This is the Phase 1
path, so it runs against your own deployment rather than a hosted service.

## What you need

- A Supabase project, free tier is fine
- A Vercel project, with the root directory set to `main-site`
- A Discord webhook URL for a channel you can watch
- A machine to run the dispatcher, which can be a VPS or your laptop

## 1. Create the database

Apply the migrations in `db/migrations/` in filename order, either through
the Supabase SQL editor or with psql.

The shared auth tables, `uwu_users` and `uwu_sessions`, are not created
here. They belong to the uwu suite as a whole and already exist. Three
uwuFeed tables hold a foreign key into `uwu_users(id)`, so it has to be
there before `0005` runs.

```sh
for f in db/migrations/[0-9]*.sql; do
  psql "$SUPABASE_DB_URL_DIRECT" -v ON_ERROR_STOP=1 -f "$f"
done
```

:::warn One migration is not idempotent
`0009_realtime.sql` adds `uwufeed_items` to the Realtime publication and
errors if it is already a member. Run it on its own the first time.
:::

## 2. Deploy the site

Point a Vercel project at the repository with the root directory set to
`main-site`. No build command and no output directory. Set these
environment variables in the project settings:

```text
SUPABASE_URL
SUPABASE_SERVICE_KEY
PUBLIC_BASE_URL
WEBSUB_CALLBACK_SECRET
ADMIN_TOKEN
CRON_SECRET
USER_AGENT_CONTACT
DISCORD_WEBHOOK_URL
```

`PUBLIC_BASE_URL` has to be the real deployed URL. It is what the hub will
call back, so a placeholder means no notifications ever arrive.

## 3. Add a source

```sh
curl -X POST "$PUBLIC_BASE_URL/api/sources/resolve" \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"url":"https://www.youtube.com/@SomeChannel"}'
```

The response tells you which tier it landed in:

```json
{
  "source": { "id": 1, "tier": "push", "hub_url": "https://pubsubhubbub.appspot.com/" },
  "created": true,
  "seeded_items": 15,
  "subscription": { "ok": true, "status": 202 }
}
```

`"tier": "push"` means a hub was found and a subscription was requested.
`"tier": "poll"` means there is no hub, so the poller picks it up on its
next cycle.

## 4. Run the dispatcher

```sh
cd workers
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python -m dispatcher.main
```

With `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` and `DISCORD_WEBHOOK_URL`
in the environment. It prints the target it is delivering to, then waits.

## 5. Run the poller

Only needed if any of your sources landed in the poll tier. Separate
process, same virtualenv:

```sh
cd workers
. .venv/bin/activate
python -m poller.main
```

This one needs `SUPABASE_DB_URL_DIRECT`, the direct connection rather than
the pooler, plus `USER_AGENT_CONTACT` so outbound requests identify
themselves to feed hosts.

## 6. Wait for an upload

The next time that channel publishes, the hub calls
`/api/hooks/websub`, the item is written, Realtime fires, and the
dispatcher posts to Discord. Ten seconds end to end is normal.

To check it without waiting for a real upload, replay a notification by
hand. The recipe is in `main-site/api/hooks/README.md`.

## What is not wired up yet

- The web timeline, accounts and per user subscriptions, which are Phase 4
- Bot commands for following sources, Phase 3 and Phase 5
- Fan out to more than one destination. Everything goes to the single
  configured Discord webhook until targets exist

:::note Leases renew themselves
`/api/cron/renew-leases` runs nightly and resubscribes anything expiring
within three days, so the push tier keeps itself alive. It alerts through
`DISCORD_WEBHOOK_URL` if a night looks wrong, which means that variable
needs setting in Vercel as well as on the machine running the dispatcher.
:::
