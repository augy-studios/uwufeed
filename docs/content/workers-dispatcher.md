# Dispatcher

Listens for new items and delivers them. It is the only piece between an
item existing and somebody being told about it.

**Status: works, delivering to a single Discord webhook.** Fan out across
users and channels arrives with accounts.

## It listens rather than sweeps

The dispatcher subscribes to Supabase Realtime for inserts on
`uwufeed_items`. An insert arrives as an event within milliseconds, so
there is no interval to tune and no query running every few seconds against
a table that only grows.

The one exception is startup. A process that was down missed the events
that happened while it was gone, so it runs a single bounded query for
anything undelivered from the last day and queues it. That runs once and
never again.

## Startup, in order

1. Find or create the system target: a row in `uwufeed_targets` for the
   configured Discord webhook, with no owning user.
2. Open the Realtime socket and subscribe to inserts.
3. Run the catch up query for anything missed.
4. Drain the queue.

Giving the webhook a real target row rather than special casing it means
deliveries are recorded the ordinary way, which is what makes the next part
work.

## It cannot double send

Every delivery is claimed before it is sent:

```sql
insert into uwufeed_deliveries (item_id, target_id, status)
values (..., 'pending')
on conflict do nothing
```

The primary key is `(item_id, target_id)`. If that insert returns no row,
someone already has this one and it is dropped rather than sent again.

A dispatcher that crashes between claiming and sending loses that one
notification instead of repeating it. That is the right trade: a missed
post is a nuisance, a duplicate at three in the morning is a reason to
uninstall.

A row left at `pending` is a crashed send, and it is exactly what the
heartbeat check is meant to surface.

## Formatting

Items are never formatted from raw database fields. Each one becomes a
typed render context first, carrying the kind, the title, the source name
and a normalised timestamp, and every channel reads from that.

The result is that all four channels describe the same item the same way,
and a custom template only has to be written once per channel rather than
once per platform.

## Rate limits

Each channel drains through its own token bucket, because the bottleneck at
scale is the destination API rather than anything local.

| Channel | Practical ceiling |
| --- | --- |
| Discord webhook | About 5 requests per 2 seconds per webhook |
| Telegram | Around 30 messages a second globally, far less per chat |
| Web push | Per push service, generally generous |
| ntfy | Whatever the instance sets |

A `429` that carries a retry delay overrides the local bucket, because the
server knows better than the guess.

## Dead targets

Some failures are permanent and retrying them is wrong:

- Web push `410 Gone`: the browser subscription is dead
- Telegram `403`: the user blocked the bot
- Discord `404` on a webhook: it was deleted

All three deactivate the target. Everything else is a retry.

## If items stop arriving

Check in this order:

1. Is the dispatcher connected? The log says so on startup.
2. Are items being written at all? If `uwufeed_items` is not growing, the
   problem is upstream and this is not the place to look.
3. Are deliveries stuck at `pending`? That is a crashed send.
4. Has the Realtime client changed shape? The payload nesting has moved
   between releases, and a mismatch means the socket looks perfectly
   healthy while delivering nothing.

That fourth one is the nastiest, because everything reports success.
