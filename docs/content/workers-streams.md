# Stream listeners

Long lived connections to platforms that push over a socket rather than
calling a webhook. These are part of the push tier, and their latency is
live rather than measured in seconds.

**Status: Bluesky works. Mastodon deliberately does not run here.**

| Platform | Transport |
| --- | --- |
| Bluesky | Jetstream websocket |
| Mastodon | Not used. Goes through the poll tier as RSS |

## Why not webhooks

Neither platform will call a URL when something happens. They hold a
connection open and write to it. That cannot run on Vercel at any price,
which is why these live on the VPS while the WebSub and EventSub receivers
do not.

## Bluesky is cheap

Jetstream is one filtered firehose. One connection covers every Bluesky
source no matter how many accounts are followed, filtered server side by
collection and by the accounts of interest.

Adding the thousandth Bluesky account costs nothing beyond a row in the
database.

## Mastodon is expensive

One connection per instance, and each needs a bot account with an access
token on that instance.

Following accounts across 40 instances means 40 connections and 40
accounts, each created by hand and each subject to that instance's rules.
This is why Mastodon support is genuinely hard to do well and Bluesky is
nearly free, despite the two looking similar from the outside.

:::warn Defederation is not appealable
A bot account that reads more than an instance's rules allow gets
defederated, and in practice that is permanent. Identify the bot clearly in
its profile, give it a contact address, and stay well inside the limits.
:::

## Reconnecting

Both drop connections routinely and neither treats it as an error.

Reconnect with backoff and jitter, and resume from the cursor where the
protocol offers one. A listener that reconnects but never resumes looks
completely healthy while silently losing everything published during the
gap, which is the worst kind of bug: no error, no alert, just less.
