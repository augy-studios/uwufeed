# main-site/api/hooks

Webhook receivers. This is the instant path, and no cron is involved in it
at any point. A push notification arriving here should reach Discord in
under ten seconds.

| File | Route | Status |
| --- | --- | --- |
| [`websub.js`](websub.js) | `/api/hooks/websub` | Working |
| [`eventsub.js`](eventsub.js) | `/api/hooks/eventsub` | Stub, Phase 5 |

## websub.js

One route, two jobs.

**GET, verification.** The hub calls this to confirm a subscription
request came from us. It must echo `hub.challenge` back as plain text and
nothing else. A redirect, a JSON wrapper or a trailing newline all fail the
verification, and the hub gives up quietly.

On `hub.mode=subscribe` it writes `lease_expires_at` from
`hub.lease_seconds`, sets the tier to push and clears `next_check_at`, so
the poller never touches the source again. On `denied` it clears the lease
and counts a failure.

**POST, notification.** The hub sends the feed document. The handler
verifies the signature, normalizes the entries and inserts them with the
conflict handled by Postgres.

## Why this endpoint is public

A hub has no credentials to present, so the route has to be reachable.
Three things protect it:

1. The callback URL carries `?source_id=N&t=<hmac>`, where the HMAC is
   derived from `WEBSUB_CALLBACK_SECRET`. A wrong or missing `t` gets a
   flat 404, so source ids cannot be probed.
2. Each source has its own `websub_secret`, sent to the hub at subscribe
   time. Notifications are signed with it, and the handler verifies with a
   constant time comparison. A bad signature gets a 403.
3. `unique (source_id, external_id)` means even a valid forged
   notification cannot duplicate an item.

An invalid signature answers 403 rather than a silent 2xx, deliberately.
The hub retries and then gives up, which is a visible failure, and a
mismatched secret is a configuration problem worth seeing.

## Duplicates are expected

A hub re-fires when a title or a description is edited, so the same video
arrives several times over its life. Dedup is never attempted in this
handler; the insert uses `resolution=ignore-duplicates` against
`unique (source_id, external_id)`. Anything else loses the race between two
notifications arriving at once.

## Testing

Verification, which should print the challenge back:

```sh
curl "$PUBLIC_BASE_URL/api/hooks/websub?source_id=1&t=$TOKEN\
&hub.mode=subscribe&hub.topic=$FEED_URL&hub.challenge=hello&hub.lease_seconds=864000"
```

Notification, signed the way the hub signs it:

```sh
SIG=$(openssl dgst -sha1 -hmac "$SOURCE_SECRET" -hex < feed.xml | awk '{print $2}')
curl -X POST "$PUBLIC_BASE_URL/api/hooks/websub?source_id=1&t=$TOKEN" \
  -H "content-type: application/atom+xml" \
  -H "x-hub-signature: sha1=$SIG" \
  --data-binary @feed.xml
```

`$TOKEN` comes from `callbackToken(sourceId)` in
[`../_lib/websub.js`](../_lib/websub.js), and the full callback URL is in
the `resolve` response.

## Leases

Nothing here renews anything. `/api/cron/renew-leases` does that, nightly.
It is still a stub, so the push tier currently works for one lease period
and then stops with no error. That is the first thing to finish after
Phase 1.
