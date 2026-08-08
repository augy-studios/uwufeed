# workers/poller

The poll tier. Everything without a hub ends up here, on an adaptive
interval between 60 seconds and an hour.

**Status: Phase 2, not started.** `normalize.py` is the exception and is
written, because it is half of a frozen contract.

| File | What it does | Status |
| --- | --- | --- |
| [`main.py`](main.py) | Claim a batch, fetch, normalize, insert, reschedule | Stub |
| [`normalize.py`](normalize.py) | The item shape, Python side | Working |
| [`conditional.py`](conditional.py) | etag and last-modified handling | Stub |
| [`backoff.py`](backoff.py) | Adaptive intervals and retirement | Stub |
| [`adapters/`](adapters/) | Per platform fetching | Stubs |

## The loop, when it is written

```sql
select * from uwufeed_sources
 where tier = 'poll' and retired_at is null and next_check_at <= now()
 order by next_check_at
 limit 50
 for update skip locked
```

`skip locked` is what lets two pollers run without a coordinator between
them and without either blocking on the other's rows. It needs a direct
connection, not the transaction pooler.

Then per source: conditional fetch, normalize, insert with the conflict
handled by the database, update the interval, update `etag` and
`last_modified`, and either reset or increment `fail_count`.

## A push source must never appear here

`tier = 'push'` sources have `next_check_at` null and a check constraint
enforcing it, so they cannot match the claim query even if the tier filter
were dropped. That is deliberate belt and braces: polling a push source
costs bandwidth for nothing and is invisible when it happens.

## Keeping it free

- Conditional requests. A 304 is cheap and most feeds honour them.
- Adaptive intervals. Quiet feeds back off to hourly and reset on a hit.
- Jitter, or every source added on the same day polls in lockstep forever.
- Retire after 20 consecutive failures, and tell the subscribers rather
  than going quiet.
- A descriptive user agent with a contact address, so a feed host can get
  in touch before deciding to block.

## Floors

60 second minimum interval, 30 day item retention, 50 sources per free
user. All three are easy to raise later and painful to introduce
afterwards.
