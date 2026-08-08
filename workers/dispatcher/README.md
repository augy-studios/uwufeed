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

1. Find or create the system target: a `uwufeed_targets` row with
   `channel = 'discord'`, `target_ref = $DISCORD_WEBHOOK_URL` and a null
   `user_id`. Giving the Phase 1 webhook a real row rather than special
   casing it means deliveries are recorded the ordinary way.
2. Open the Realtime socket and subscribe to inserts on `uwufeed_items`.
3. Run `uwufeed_pending_deliveries()` once for anything inserted while the
   process was down, and queue it.
4. Drain the queue, one item at a time.

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

## Not here yet

- Fan out across `uwufeed_subscriptions` and `uwufeed_targets`. Phase 1 has
  one hardcoded webhook, so there is nothing to fan out to.
- User templates from `uwufeed_templates`.
- Retrying a failed delivery. A failure is recorded and left alone.
