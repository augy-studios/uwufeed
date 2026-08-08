# main-site/api/sources

Turning a URL someone pasted into a row in `uwufeed_sources`, and managing
the hub subscription that follows from it.

| File | Route | Status |
| --- | --- | --- |
| [`resolve.js`](resolve.js) | `POST /api/sources/resolve` | Working |
| [`subscribe.js`](subscribe.js) | `POST /api/sources/subscribe` | Working |
| [`unsubscribe.js`](unsubscribe.js) | `POST /api/sources/unsubscribe` | Working |

All three require `Authorization: Bearer $ADMIN_TOKEN` until Phase 4 adds
real sessions. They fail closed if `ADMIN_TOKEN` is unset.

## resolve

```sh
curl -X POST "$PUBLIC_BASE_URL/api/sources/resolve" \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"url":"https://www.youtube.com/@SomeChannel"}'
```

What it does, in order:

1. Fetches the URL once. A feed is used as is. HTML gets one further fetch
   of its autodiscovery link, since the hub is advertised in the feed and
   not on the page.
2. Looks for a hub in the feed body, the feed's `Link` header, the page
   body and the page's `Link` header.
3. **Decides the tier.** A hub means push, no hub means poll. This is the
   line the whole latency argument rests on: a push source is never polled,
   and a poll source never waits on a hub that does not exist.
4. Upserts on `feed_url`, so two people adding the same channel get one
   shared row.
5. Seeds the items already in the feed, so a new source is not empty.
6. For a push source, sends `hub.mode=subscribe` unless the request body
   says `{"subscribe": false}`.

The response carries the source, whether it was created, how many network
fetches it took, how many items were seeded, and what the hub said.

Seeding happens before the subscription exists, on purpose. The dispatcher
delivers what it sees inserted, and nobody wants twenty old videos on the
day they add a channel. Phase 3 should mark seeded items as already
delivered rather than relying on the ordering here.

## subscribe and unsubscribe

`subscribe` re-sends `hub.mode=subscribe` for a source that already exists.
It is for retries and for the renewal cron, and it generates a
`websub_secret` if the source somehow has none.

A hub answers 202 and then verifies out of band by calling
`/api/hooks/websub`, so `lease_expires_at` is written by that GET handler
and never here. A 202 from this endpoint means the request was accepted,
not that the subscription is live.

`unsubscribe` sends the opposite mode and clears the lease. It does not
retire the source row, because other users may still be subscribed to it.

## YouTube

A channel URL is not a feed. `discover.js` maps `/channel/UC...` and
`@handle` pages onto
`https://www.youtube.com/feeds/videos.xml?channel_id=UC...`, and that feed
advertises `https://pubsubhubbub.appspot.com/` as its hub, which is how
YouTube lands in the push tier with a two to ten second latency.

The channel id is also stored in `external_ref`, so a later platform
adapter does not have to parse the feed URL to get it back.

## Not here yet

Per user subscribing, which is `uwufeed_subscriptions` rather than
`uwufeed_sources`, arrives with auth in Phase 4 and with the bots in Phase
3. These three endpoints only manage the shared source rows.
