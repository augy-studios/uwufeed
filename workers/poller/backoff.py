"""Adaptive poll intervals. Quiet feeds back off, a hit resets them.

TODO Phase 2.

Rules from the plan:
  - Floor 60 seconds, ceiling one hour.
  - New items found: reset toward the floor.
  - Nothing found: lengthen, roughly 1.5x, capped at the ceiling.
  - Transport failure: lengthen faster and count it. Retire the source at
    20 consecutive failures and tell the subscribers.
  - Add jitter, or every source added on the same day polls in lockstep
    forever.
"""

FLOOR_SECONDS = 60
CEILING_SECONDS = 3600
RETIRE_AFTER_FAILURES = 20
