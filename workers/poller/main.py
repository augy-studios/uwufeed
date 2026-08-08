"""The poll tier. Everything without a hub ends up here.

TODO Phase 2. Shape of the work:

  1. Claim a batch:
       select * from uwufeed_sources
        where tier = 'poll' and retired_at is null and next_check_at <= now()
        order by next_check_at
        limit 50
        for update skip locked
     `skip locked` is what lets two pollers run without a coordinator and
     without either of them blocking.

  2. Fetch each with conditional.py, sending etag and last-modified. A 304
     is nearly free and most feeds honour it.

  3. Normalize through normalize.py, insert with
     on conflict (source_id, external_id) do nothing.

  4. Set the next interval with backoff.py: shorten on a hit, lengthen on a
     miss, floor at 60 seconds and ceiling at an hour.

  5. Count failures. Retire at 20 consecutive failures and tell the
     subscribers rather than going quiet.

A push source must never reach this loop. The tier column plus a check
constraint on next_check_at is what guarantees it.
"""


def main() -> None:
    raise NotImplementedError("the poll tier arrives in Phase 2")


if __name__ == "__main__":
    main()
