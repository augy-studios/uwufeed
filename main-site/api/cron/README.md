# main-site/api/cron

Scheduled work. Crons are never on the delivery path: an item reaching a
user goes webhook to database to dispatcher, and nothing here is involved.
These handle upkeep that would otherwise rot.

Schedules are declared in [`../../vercel.json`](../../vercel.json).

| File | Route | Schedule | Status |
| --- | --- | --- | --- |
| [`renew-leases.js`](renew-leases.js) | `/api/cron/renew-leases` | `0 3 * * *` | Working |
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

### How it runs

Sources are taken soonest expiry first, capped at 100 a run, spaced 150ms
apart. The three day window means a source gets three consecutive nightly
attempts before its lease actually lapses, so the cap only ever delays the
least urgent.

### It cannot confirm its own work

The hub answers `202` and then verifies out of band by calling
`/api/hooks/websub`, which is what actually writes `lease_expires_at`. So a
run never learns whether its requests worked.

That is handled by being self healing rather than by tracking state.
Anything whose lease did not move is still inside the window tomorrow and
gets requested again. A source that is *still* lapsed when renewal reaches
it was asked before and never verified, which is the only evidence
available without a per attempt column, and it increments `fail_count`.

A brand new source with no lease at all gets 24 hours of grace first, since
`resolve` subscribes the moment a source is created and verification
normally takes seconds.

### A dead hub falls back to polling

Five consecutive failures and the source is moved to the poll tier with a
fresh `fail_count`, rather than retired.

A blog that dropped WebSub or a hub that moved still has a perfectly good
feed behind it. The subscriber gets items in minutes instead of seconds,
which is much better than never. The counter is reset on the way across
because the poll tier retires at 20 of its own failures and hub problems
should not count toward that.

### It alerts

Silence is the failure mode, so the job speaks up through
`DISCORD_WEBHOOK_URL` whenever a night does not look healthy: sources
already past their lease, a batch where nothing was accepted, any
demotions, or errors.

**This means `DISCORD_WEBHOOK_URL` has to be set in Vercel too**, not only
on the VPS where the dispatcher reads it.

## cleanup

Deletes items with `fetched_at` older than 30 days, and `uwufeed_sessions` rows
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
  nobody out. `uwufeed_sessions` has an index on `expires_at`, so the
  delete is not a sequential scan.

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
