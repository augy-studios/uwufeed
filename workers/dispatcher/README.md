# workers/dispatcher

Listens for inserts on `uwufeed_items` over Supabase Realtime and delivers
them. It never sweeps the items table: an insert arrives as an event, and
the only query against history is one bounded catch up at startup.

| File | What it does |
| --- | --- |
| [`main.py`](main.py) | The listener, the queue, the catch up and the loop |
| [`store.py`](store.py) | PostgREST access: targets, deliveries, the pending RPC |
| [`templates.py`](templates.py) | The typed render context per item kind |
| [`ratelimit.py`](ratelimit.py) | Async token bucket per channel |
| [`channels/`](channels/) | One module per transport |

## Running

```sh
cd workers
python -m dispatcher.main
```

As a module, from `workers/`, because the channels import their siblings
relatively.

## What happens on startup

1. Open the Realtime socket and subscribe to inserts on `uwufeed_items`.
2. Run `uwufeed_pending_fanout()` once for anything that arrived while the
   process was down, and queue it.
3. Drain the queue, fanning each item out to every destination that should
   receive it.

## Why it cannot double send

Every delivery is claimed before it is sent:

```sql
insert into uwufeed_deliveries (item_id, target_id, status)
values (..., 'pending')
on conflict do nothing
```

If the insert returns no row, someone already has this one and it is
dropped. The composite primary key is what makes that work, so a crash
between the claim and the send loses that item rather than repeating it.
That is the right way round: a missed notification is a nuisance, a
duplicate one at three in the morning is a reason to uninstall.

A `pending` row that never became `sent` is a crashed send. The heartbeat
cron is meant to surface those.

## Realtime payload shapes

`extract_record` checks four shapes for the new row, because the nesting
has moved between releases of the Realtime client. If a version arrives
that nests it somewhere else, the listener stops delivering silently, so
that function is the first place to look when items stop arriving but the
socket is connected.

## Adding a channel

1. Write `channels/<name>.py` with
   `async def send(client, target_ref, ctx) -> bool`.
2. Give it a bucket in `ratelimit.py`.
3. Add its headline to `HEADLINES` in `templates.py` if the wording differs.
4. Fan out in `main.py` once per active target, rather than once overall.

## Who receives an item

`uwufeed_targets_for_item()` answers it: the item's source, everyone
subscribed to that source, and each of their active destinations, minus
anything already delivered.

Routing narrows it. A subscription with no rows in
`uwufeed_subscription_targets` goes everywhere, which is the default. With
rows, it goes only to those. That is why an empty routing list and "all
destinations" are the same stored state.

## Channels

| Channel | Transport | Permanent failure |
| --- | --- | --- |
| Discord | Webhook POST | 401, 403, 404 |
| Telegram | Bot API `sendMessage` | 400, 403 |
| Web push | VAPID through pywebpush | 404, 410 |
| ntfy | HTTP POST to a topic | 401, 403, 404 |

A permanent failure raises `PermanentFailure` from `errors.py`, and the
dispatcher deactivates that destination rather than retrying it forever. A
blocked bot, a deleted webhook and a dead browser subscription are all the
same shape of problem.

## Not here yet

- User templates from `uwufeed_templates`.
- Retrying a failed delivery. A failure is recorded and left alone.
- Quiet hours and digests. The preference columns exist and nothing reads
  them.
