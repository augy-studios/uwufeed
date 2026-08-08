"""Async token bucket.

The bottleneck at scale is the destination API rather than local CPU, so
each channel drains at its own controlled rate. Telegram's global ceiling
is around 30 messages a second, and Discord webhooks are stricter still.
"""

import asyncio
import time


class TokenBucket:
    def __init__(self, rate_per_second: float, burst: int = 1) -> None:
        self.rate = rate_per_second
        self.capacity = max(1, burst)
        self._tokens = float(self.capacity)
        self._updated = time.monotonic()
        self._lock = asyncio.Lock()

    async def take(self, tokens: float = 1.0) -> None:
        async with self._lock:
            while True:
                now = time.monotonic()
                self._tokens = min(
                    self.capacity, self._tokens + (now - self._updated) * self.rate
                )
                self._updated = now

                if self._tokens >= tokens:
                    self._tokens -= tokens
                    return

                await asyncio.sleep((tokens - self._tokens) / self.rate)


# Conservative defaults. A 429 carries a retry_after that overrides these,
# and the channel is expected to honour it.
DISCORD_WEBHOOK = TokenBucket(rate_per_second=2.0, burst=5)
TELEGRAM_GLOBAL = TokenBucket(rate_per_second=25.0, burst=25)
