# Introduction

uwuFeed is a push first feed aggregator. Follow a YouTube channel, a blog,
a subreddit or anything with a feed, and the new post reaches you within
seconds rather than whenever something next decides to refresh.

It delivers to four places from one set of subscriptions: the web app,
Telegram, Discord, and ntfy or UnifiedPush.

## Why push first

Most aggregators poll. They ask every feed, every so often, whether
anything is new. That interval is the latency floor, and the common one is
around 13 minutes.

uwuFeed asks a different question at the moment you add a source: does this
publisher support push? YouTube does. Many blogs do. Twitch does. When the
answer is yes, the publisher tells us the moment something appears, and
nothing is ever polled.

| Source | How it arrives | Latency |
| --- | --- | --- |
| YouTube | WebSub | 2 to 10 seconds |
| Blogs advertising a hub | WebSub | 2 to 10 seconds |
| Twitch going live | EventSub | 2 to 10 seconds |
| Bluesky | Jetstream websocket | Live |
| Mastodon | RSS through the poll tier | 60 seconds to an hour |
| Reddit, plain RSS, everything else | Polling | 60 seconds to an hour |
| Long tail platforms | RSSHub, then polling | 60 seconds to an hour |

Polling is the fallback rather than the design.

## What it is not

It is not a read it later app, a recommendation engine or a social network.
It watches things you chose and tells you when they change.

## Free, and staying that way

The costs are kept low by design rather than by generosity:

- Sources are shared. One channel followed by 400 people is fetched once.
- The push tier costs nothing while idle, so growth in YouTube and Twitch
  sources is close to free.
- Polled feeds use conditional requests, and a 304 is nearly free.
- Quiet feeds back off to hourly and reset the moment something appears.
- Dead feeds are retired after 20 consecutive failures, and their
  subscribers are told.

Starting limits, which are easy to raise later and painful to introduce
afterwards: 50 sources per free account, 30 day item retention, and a 60
second floor on poll intervals.

## Where to go next

- [Quick start](#/quick-start) to get something arriving.
- [How it works](#/how-it-works) for the architecture.
- The web app, Telegram bot and Discord bot each have their own section.

:::note Current state
uwuFeed is still being built. Both ingestion tiers now work: a YouTube
upload reaches Discord in under ten seconds through the push tier, and
sources without a hub are polled on an adaptive interval. Accounts, the
timeline and the bot commands are still landing. Every page here marks what
works today and what does not.
:::
