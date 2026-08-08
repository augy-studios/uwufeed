# main-site/api/cron

Scheduled work. Crons are never on the delivery path: an item reaching a
user goes webhook to database to dispatcher, and nothing here is involved.
These handle upkeep that would otherwise rot.

Schedules are declared in [`../../vercel.json`](../../vercel.json).

| File | Route | Schedule | Status |
| --- | --- | --- | --- |
| [`renew-leases.js`](renew-leases.js) | `/api/cron/renew-leases` | `0 3 * * *` | Stub |
| [`cleanup.js`](cleanup.js) | `/api/cron/cleanup` | `0 4 * * *` | Working |
| [`digest.js`](digest.js) | `/api/cron/digest` | `0 8 * * *` | Stub |
| [`heartbeat.js`](heartbeat.js) | `/api/cron/heartbeat` | `*/15 * * * *` | Stub |

Sub daily schedules need a Vercel plan that allows them. On Hobby, cron
frequency is limited to once a day, so `heartbeat` has to move to the VPS
or drop to daily.

## renew-leases is the one that matters

WebSub leases cap at ten days. Anything expiring within three days gets
resubscribed nightly. Miss this and the push tier stops after a week and a
half: no error is raised, no request fails, the feed simply goes quiet.
That is the worst failure mode in the system because it looks like nothing
being published.

It is still a stub. Until it is written, either resubscribe by hand through
`/api/sources/subscribe`, or treat the push tier as good for one lease
period only.

## cleanup

Deletes items with `fetched_at` older than 30 days, and `uwu_sessions` rows
that have already expired. Answers with the counts, or `207` with an
`errors` array if one pass failed and the other did not.

Deliveries are not deleted directly. They carry `on delete cascade` from
items, so they go with them.

Two things it deliberately does not do:

- **Retire sources.** The poller does that the moment a source hits the
  failure limit, because it is the thing that saw the failure and the thing
  that knows the subscriber count.
- **Expire sessions.** It removes rows that already fail
  `expires_at > now()`. Those sessions were dead already, so this logs
  nobody out, in this app or any other sharing the table.

## Authorisation

Vercel sends `Authorization: Bearer $CRON_SECRET` on scheduled
invocations. Every handler checks it and fails closed if `CRON_SECRET` is
unset, so a public URL is not a public trigger.

`authorized(req)` lives in `renew-leases.js` and the other three import it.
That is the one place in this codebase where a handler file exports
something other than its default, and it beats a `_lib` module for
thirty lines used only here.

## Testing one by hand

```sh
curl -H "authorization: Bearer $CRON_SECRET" \
  "$PUBLIC_BASE_URL/api/cron/renew-leases"
```
