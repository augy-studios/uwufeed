"""Adaptive poll intervals. Quiet feeds back off, a hit resets them.

A busy news feed settles near the floor. A blog that posts monthly settles
at the ceiling and costs one cheap conditional request an hour.
"""

import random

FLOOR_SECONDS = 60
CEILING_SECONDS = 3600
RETIRE_AFTER_FAILURES = 20

# Multipliers, applied to the source's current interval.
SHRINK = 0.5
GROW_IDLE = 1.5
GROW_FAILED = 2.0

JITTER = 0.1


def clamp(seconds: float) -> int:
    return int(max(FLOOR_SECONDS, min(CEILING_SECONDS, seconds)))


def with_jitter(seconds: int) -> int:
    """Spread sources out.

    Without this, every source added on the same day polls in lockstep
    forever, which turns a smooth trickle of requests into a spike every
    interval.
    """
    spread = seconds * JITTER
    return clamp(seconds + random.uniform(-spread, spread))


def next_interval(current: int, *, found: int, not_modified: bool) -> int:
    """The interval after a successful check.

    A 304 and a 200 with nothing new mean the same thing to the schedule:
    that check found nothing, so ask less often.
    """
    current = clamp(current or FLOOR_SECONDS)
    if found > 0:
        return with_jitter(clamp(current * SHRINK))
    if not_modified:
        return with_jitter(clamp(current * GROW_IDLE))
    return with_jitter(clamp(current * GROW_IDLE))


def failure_interval(current: int) -> int:
    """Back off harder on a failure than on a quiet feed."""
    return with_jitter(clamp(clamp(current or FLOOR_SECONDS) * GROW_FAILED))


def should_retire(fail_count: int) -> bool:
    return fail_count >= RETIRE_AFTER_FAILURES
