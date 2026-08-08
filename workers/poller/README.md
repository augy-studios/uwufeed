# workers/poller

The poll tier. Everything without a hub ends up here, on an adaptive
interval between 60 seconds and an hour.

**Status: working.**

| File | What it does |
| --- | --- |
| [`main.py`](main.py) | Claim a batch, fetch, normalize, insert, reschedule |
| [`db.py`](db.py) | Direct Postgres. The claim, the reschedule, the insert |
| [`normalize.py`](normalize.py) | The item shape, Python side |
| [`conditional.py`](conditional.py) | etag and last-modified handling |
| [`backoff.py`](backoff.py) | Adaptive intervals, jitter, retirement |
| [`adapters/`](adapters/) | Per platform parsing |

## Running

```sh
cd workers
python -m poller.main
```

Needs `SUPABASE_DB_URL_DIRECT`, and `USER_AGENT_CONTACT` so outbound
requests identify themselves.

## The claim

```sql
with due as (
  select id from uwufeed_sources
   where tier = 'poll' and retired_at is null
     and next_check_at is not null and next_check_at <= now()
   order by next_check_at
   limit 50
   for update skip locked
)
update uwufeed_sources s
   set next_check_at = now() + make_interval(secs => 300)
  from due
 where s.id = due.id
returning s.*
```

One statement. The select takes the lock, the update pushes the row out of
the queue, and the transaction commits before any network call happens.

`skip locked` is what lets two pollers run with no coordinator between them
and without either blocking on the other's rows. Scaling up is starting a
second process.

### Why the claim is not held across the fetch

The obvious version keeps the transaction open for the whole batch so the
locks release on disconnect. It also pins the vacuum horizon for as long as
the slowest feed in the batch takes to answer, which can be thirty seconds
of held locks per cycle for no benefit.

Pushing `next_check_at` forward is the claim instead. A worker that dies
mid fetch leaves the source scheduled five minutes out, so it is retried
rather than lost or stuck, and nothing holds a lock while the network is
involved. It also needs no extra column and no reaper.

The cost is that a crash delays one source by one lease. For a feed
poller that is not a real cost.

## Conditional requests

Every request carries the stored `ETag` and `Last-Modified`. A feed that has
not changed answers `304` with no body.

Most feeds honour it, and a 304 costs almost nothing on either side. It is
the single biggest reason polling thousands of feeds is affordable.

A validator is only carried forward if the server actually sent one on that
response. Reusing an old `ETag` against a new body is how a feed gets stuck
returning 304 forever.

## Adaptive intervals

| Outcome | Interval |
| --- | --- |
| New items | Halve, toward the 60 second floor |
| Nothing new, or a 304 | Grow by half, toward the one hour ceiling |
| Failure | Double, toward the ceiling |

Every result gets plus or minus ten percent of jitter. Without it, every
source added on the same day polls in lockstep forever, turning a smooth
trickle into a spike once an interval.

A success resets `fail_count` to zero. The limit counts consecutive
failures, not lifetime ones.

## Retirement

Twenty consecutive failures retires the source: `retired_at` is set,
`next_check_at` is cleared so it can never be claimed again, and the
subscriber count is logged.

The count is there so the retirement can be announced rather than silent. A
retired source that just stops is indistinguishable from a channel that
stopped posting, and only the system knows which it was. Actually
delivering that message needs per user targets.

## Push sources never appear here

The claim filters on `tier = 'poll'`, and a push source has
`next_check_at` null with a check constraint enforcing it, so it cannot
match even if the tier filter were removed.

Deliberate belt and braces: polling a push source wastes bandwidth for
nothing and is invisible when it happens.

## Failure isolation

A parse failure, an insert failure or an unexpected exception is that
source's problem. It is counted against that source and the rest of the
batch continues. One malformed feed cannot stall the queue.

## Tuning

| Variable | Default | What it does |
| --- | --- | --- |
| `POLLER_BATCH_SIZE` | 50 | Sources claimed per cycle |
| `POLLER_CONCURRENCY` | 10 | Feeds fetched at once |

Raising concurrency raises the outbound request rate against feed hosts,
which is the thing most likely to get the VPS blocked. Raise it carefully.
