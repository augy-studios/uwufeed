# Poller

The poll tier. Everything without a hub ends up here, checked on an
interval that adapts to how often the feed actually changes.

**Status: Phase 2, not started.** The item shape half is written, because
that is a contract rather than a feature.

## The loop

```sql
select * from uwufeed_sources
 where tier = 'poll' and retired_at is null and next_check_at <= now()
 order by next_check_at
 limit 50
 for update skip locked
```

`skip locked` is the important part. Two pollers can run at once with no
coordinator between them and without either blocking on the other's rows,
so scaling up is starting a second process rather than designing a leader
election.

Then per source: fetch conditionally, normalize, insert with the conflict
handled by the database, reschedule, and record either a success or a
failure.

## Conditional requests

Every request carries the `ETag` and `Last-Modified` values from the last
one. A feed that has not changed answers `304 Not Modified` with no body.

Most feeds honour this, and a 304 costs almost nothing on either side. It
is the single biggest reason polling thousands of feeds is affordable.

## Adaptive intervals

- Floor of 60 seconds, ceiling of one hour
- Something new: shorten, back toward the floor
- Nothing new: lengthen, roughly half as often again
- A transport failure: lengthen faster and count it
- Jitter on everything, or every source added on the same day polls in
  lockstep forever

A busy news feed settles near the floor. A blog that posts monthly settles
at the ceiling and costs one cheap request an hour.

## Retirement

Twenty consecutive failures retires a source, and its subscribers are told.

The telling matters. A retired source that goes quiet looks exactly like a
channel that stopped posting, and the difference between those two is
something only the system knows.

## Push sources never appear here

A source in the push tier has `next_check_at` set to null, and a database
constraint enforces it, so it cannot match the claim query even if the tier
filter were removed.

That is deliberate belt and braces. Polling a push source wastes bandwidth
for nothing and is invisible when it happens.

## Etiquette

Every request carries a descriptive user agent with a contact address, so a
feed host can write to us before deciding to block us. Reddit in particular
blocks generic agents aggressively.

That contact address is not decoration. It is the difference between a
polite email and a silent block that takes weeks to notice.
