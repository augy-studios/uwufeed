# main-site/api

Vercel serverless functions, plain JavaScript, no dependencies and no build
step. Vercel's root directory is `main-site`, so a file at
`main-site/api/hooks/websub.js` is served at `/api/hooks/websub`.

Request shaped work only. Anything that runs continuously belongs on the
VPS, in [`../../workers/`](../../workers/).

## Directories

| Directory | Contains |
| --- | --- |
| [`_lib/`](_lib/) | Shared modules. The underscore keeps Vercel from routing them |
| [`hooks/`](hooks/) | Webhook receivers, the instant path |
| [`auth/`](auth/) | Custom auth against `uwu_users` and `uwu_sessions` |
| [`sources/`](sources/) | Resolving a URL into a source, and hub subscriptions |
| [`items/`](items/) | Reading the timeline |
| [`targets/`](targets/) | Where notifications go, per channel |
| [`cron/`](cron/) | Scheduled work. Never on the delivery path |

## Endpoints

| Path | Method | Status |
| --- | --- | --- |
| `/api/hooks/websub` | GET, POST | Working |
| `/api/hooks/eventsub` | POST | Stub, Phase 5 |
| `/api/sources/resolve` | POST | Working |
| `/api/sources/subscribe` | POST | Working |
| `/api/sources/unsubscribe` | POST | Working |
| `/api/auth/register`, `/login`, `/logout` | POST | Stub, Phase 4 |
| `/api/items/list` | GET | Stub, Phase 4 |
| `/api/targets/webpush` | POST, DELETE | Stub, Phase 4 |
| `/api/targets/ntfy` | POST, DELETE | Stub, Phase 6 |
| `/api/cron/renew-leases` | GET | Stub, scheduled daily |
| `/api/cron/cleanup` | GET | Working, scheduled daily |
| `/api/cron/digest`, `/heartbeat` | GET | Stub, scheduled |

Stubs answer `501` with the phase they belong to, so a caller gets a clear
signal rather than a 404 that looks like a routing bug.

## Database access

Every function talks to Supabase over PostgREST through
[`_lib/db.js`](_lib/db.js), never a direct Postgres connection. Serverless
functions opening direct connections is how the pool gets exhausted, which
the plan calls out as a failure mode. `SUPABASE_DB_URL_POOLER` exists for
the day something genuinely needs SQL from here, and nothing uses it yet.

Writes go in with the conflict handled by the database:
`insertIgnoreDuplicates("uwufeed_items", rows, ["source_id", "external_id"])`.

## Authentication

Until Phase 4 lands there is no user session, so the privileged endpoints
in `sources/` require `Authorization: Bearer $ADMIN_TOKEN`. They fail
closed: an unset `ADMIN_TOKEN` answers `503` rather than running
unauthenticated.

Cron handlers check `CRON_SECRET`, which Vercel sends as a bearer token on
scheduled invocations.

`/api/hooks/websub` is deliberately public, because a hub calls it. It is
protected instead by an HMAC in the callback URL plus the per source
WebSub secret. See [`hooks/README.md`](hooks/README.md).

## Environment

`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `PUBLIC_BASE_URL`,
`WEBSUB_CALLBACK_SECRET`, `WEBSUB_LEASE_SECONDS`, `ADMIN_TOKEN`,
`CRON_SECRET`, `USER_AGENT_CONTACT`. See [`../../.env.example`](../../.env.example).

## Local development

```sh
npm i -g vercel
cd main-site
vercel dev
```

`vercel dev` reads `.env` from the `main-site` directory. A hub cannot
reach `localhost`, so to exercise the push path end to end, point
`PUBLIC_BASE_URL` at a tunnel and use that as the callback host.

## Conventions

- ES modules, `export default async function handler(req, res)`.
- One file, one endpoint. Shared logic goes in `_lib/`.
- Never read a row to decide whether to insert it. Let the unique
  constraint decide.
- Short comments. No banners.
