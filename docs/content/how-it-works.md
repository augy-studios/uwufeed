# How it works

One ingestion pipeline, one database, four delivery channels.

## The shape of it

```text
publisher            ingest              store            deliver
---------            ------              -----            -------
YouTube hub  ---->  /api/hooks/websub
blog hub     ---->  /api/hooks/websub  -->  uwufeed_items  -->  dispatcher  -->  Discord
Twitch       ---->  /api/hooks/eventsub          |                              Telegram
Bluesky      ---->  stream listener              | realtime                     web push
Mastodon     ---->  stream listener              | insert event                 ntfy
RSS, Reddit  ---->  poller
```

Everything converges on one table. Nothing downstream knows or cares which
route an item took to get there.

## Two tiers

At the moment a source is added, uwuFeed fetches it once and looks for
`<link rel="hub">`.

**Push tier.** A hub exists. We subscribe to it, the publisher calls us
when something changes, and the source is never polled. `next_check_at` is
null and a database constraint enforces it.

**Poll tier.** No hub. The source joins a queue ordered by `next_check_at`,
with conditional requests and an interval that adapts between 60 seconds
and an hour.

That single check is the difference between two second and thirteen minute
latency, and it costs one HTTP request at signup.

## Dedup is the database's job

WebSub hubs re-fire when a title or a description is edited, so the same
video arrives several times over its life. Every item carries an
`external_id` that is stable and platform native, and the table has
`unique (source_id, external_id)`.

Writers insert with the conflict handled by Postgres, never by checking
first:

```sql
insert into uwufeed_items (...) values (...)
on conflict (source_id, external_id) do nothing
```

Two workers racing on the same feed is normal, and read then write loses
that race.

## Delivery cannot double send

The dispatcher listens for insert events rather than sweeping the table.
For each item and each target it claims a row in `uwufeed_deliveries`
before sending. That table's primary key is `(item_id, target_id)`, so a
claim that conflicts means someone already has it.

A dispatcher that crashes mid send loses that one notification instead of
repeating it. That is the right way round: a missed post is a nuisance, a
duplicate at three in the morning is a reason to uninstall.

## Where each piece runs

| Vercel | VPS |
| --- | --- |
| The web app | Poller loop |
| API and auth | Dispatcher and fan out |
| WebSub receiver | RSSHub container |
| EventSub receiver | Bluesky and Mastodon listeners |
| Lease renewal cron | Telegram bot |
| Digest, cleanup, heartbeat crons | Discord bot |

The rule is not push against poll, it is request shaped against continuous.
A webhook receiver is request shaped, so it sits on Vercel even though it
is the fastest part of the instant path. A websocket listener is not, so it
does not.

## Sources are shared, subscriptions are not

`uwufeed_sources` has one row per feed no matter how many people follow it.
`uwufeed_subscriptions` maps users to sources. One channel followed by 400
people is fetched once, which is what makes free viable rather than
generous.

## The failure modes worth knowing

- **A lapsed WebSub lease.** Leases last at most ten days. Miss the renewal
  and the push tier goes quiet with nothing erroring anywhere. This is the
  worst one, because it looks exactly like nobody publishing.
- **Dedup outside the database.** Any scheme other than the unique
  constraint loses a race eventually and sends twice.
- **A stream flapping.** A Twitch stream dropping and reconnecting fires
  repeated live alerts without a grace window.
- **A source returning 200 with stale content.** Nothing errors, the feed
  simply stops advancing. Tracking `published_at` against `fetched_at` per
  source is what catches it.
- **Connection exhaustion.** Serverless functions opening direct database
  connections. The functions use PostgREST for exactly this reason.
