# workers/streams

Long lived connections to platforms that push over a socket rather than a
webhook. These are part of the push tier, and their latency is live rather
than measured in seconds.

**Status: Bluesky works. Mastodon deliberately does not run here.**

| File | Platform | Transport |
| --- | --- | --- |
| [`bluesky.py`](bluesky.py) | Bluesky | Jetstream websocket |
| [`mastodon.py`](mastodon.py) | Mastodon | Not used. Mastodon goes through the poll tier as RSS |

## Why these are not webhooks

Neither platform will call a URL when something happens. They hold a
connection open and write to it. That cannot run on Vercel at any price,
which is why these live on the VPS while the WebSub and EventSub receivers
do not.

## Connection counts

Bluesky's Jetstream is one filtered firehose, so one connection covers
every Bluesky source no matter how many are followed.

Mastodon is one connection per instance, and each needs a bot account with
an access token there. Following accounts across 40 instances means 40
connections and 40 accounts, which is why Mastodon is expensive to support
well and Bluesky is nearly free.

## Reconnecting

Both drop connections routinely and neither treats it as an error.
Reconnect with backoff and jitter, and resume from the cursor where the
protocol offers one, otherwise the gap during a reconnect is silently lost
items. A stream listener that reconnects but never resumes looks perfectly
healthy while missing posts.

## Etiquette

A Mastodon bot account that reads more than it should gets defederated, and
that is not appealable in practice. Respect each instance's rules, identify
the bot clearly in its profile, and give it a contact address.
