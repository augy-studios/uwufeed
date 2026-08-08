# workers/dispatcher/channels

One module per delivery transport. Each exposes the same function:

```python
async def send(client, target_ref, ctx: RenderContext) -> bool
```

`True` means delivered, `False` means it failed and the delivery row is
marked accordingly. Neither raises for an ordinary rejection, because a
dead target is not an exception, it is a fact to record.

| Module | Transport | Status |
| --- | --- | --- |
| [`discord.py`](discord.py) | Webhook POST | Working |
| [`telegram.py`](telegram.py) | Bot API `sendMessage` | Working |
| [`webpush.py`](webpush.py) | VAPID, aes128gcm | Working |
| [`ntfy.py`](ntfy.py) | HTTP POST to a topic | Stub, Phase 6 |

## Rate limits

The bottleneck at scale is the destination API, never local CPU. Each
channel drains through its own bucket in
[`../ratelimit.py`](../ratelimit.py), and a `429` that carries a
`retry_after` overrides the local bucket, because the server knows better
than the guess.

| Channel | Practical ceiling |
| --- | --- |
| Discord webhook | About 5 requests per 2 seconds per webhook |
| Telegram | Around 30 messages a second globally, far less per chat |
| Web push | Per push service, generally generous |
| ntfy | Whatever the instance sets, usually generous |

## Deactivating a dead target

Some failures are permanent and retrying them is wrong:

- Web push `410 Gone`: the browser subscription is dead. Set the target
  inactive.
- Telegram `403`: the user blocked the bot. Same.
- Discord `404` on a webhook: it was deleted. Same.

Everything else is a retry.

## Formatting

Never build a message from raw item fields. Take a `RenderContext` from
[`../templates.py`](../templates.py) and read from that, so all four
channels describe the same item the same way and a user template only has
to be written once per channel.
