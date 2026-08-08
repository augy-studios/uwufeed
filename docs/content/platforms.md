# What you can follow

Paste a link and uwuFeed works out the rest. This is what it recognises and
how fast each one arrives.

| You paste | How it arrives | Latency |
| --- | --- | --- |
| A YouTube channel | WebSub | 2 to 10 seconds |
| A blog advertising a hub | WebSub | 2 to 10 seconds |
| A Twitch channel | EventSub, when they go live | 2 to 10 seconds |
| A Bluesky profile | Jetstream | Live |
| A Mastodon profile | Its RSS feed, polled | 60 seconds to an hour |
| A subreddit | Reddit's own RSS, polled | 60 seconds to an hour |
| Any feed URL | Polled, unless it advertises a hub | 60 seconds to an hour |
| Some platforms with no feed | RSSHub, then polled | 60 seconds to an hour |

You never choose which of these applies. It is decided by what the
publisher supports, checked once when the source is added.

## YouTube

Any channel URL works: `/@handle`, `/channel/UC...`, or the feed URL
directly. The channel id is found and the feed built from it, and that feed
advertises a hub, so uploads arrive in seconds.

## Twitch

A channel URL, for example `twitch.tv/somebody`. You get one item when they
go live, not when they go offline.

A stream that drops and reconnects does not announce twice: a second live
item within ten minutes of the first is treated as a flicker and ignored.

## Bluesky

A profile URL, for example `bsky.app/profile/someone.bsky.social`.

Replies are skipped. One followed account having a conversation would
otherwise flood everyone subscribed to it. Original posts only.

Bluesky is cheap in a way the others are not: **one connection covers every
Bluesky account anyone follows**, so the thousandth account costs nothing.

## Mastodon

A profile URL, for example `mastodon.social/@someone`.

Mastodon accounts publish an RSS feed, so this goes through the poll tier
like a blog. Posts arrive within the poll interval rather than live.

That is a deliberate trade. Live delivery would need a bot account with an
access token on **every instance** you follow anyone on, created by hand,
and an account that reads more than an instance's rules allow gets
defederated with no appeal. Polite feed polling cannot be defederated,
because it is what every feed reader already does.

## Reddit

A subreddit or user URL. Reddit serves RSS at `.rss`, so it is an ordinary
polled feed.

Reddit blocks generic user agents aggressively, which is why every outbound
request carries a descriptive one with a contact address.

## RSSHub, for the long tail

Some platforms publish nothing machine readable. RSSHub scrapes them and
serves RSS, and a curated set of URLs route through it automatically:

| Platform | Paste |
| --- | --- |
| Twitter or X | `twitter.com/user` or `x.com/user` |
| Instagram | `instagram.com/user` |
| Weibo | `weibo.com/u/123` |
| Bilibili | `space.bilibili.com/123` |
| Pixiv | `pixiv.net/users/123` |

This only works on a deployment running its own RSSHub. Where it is not
configured, those URLs report no feed found like anything else.

:::warn RSSHub routes break
They scrape sites that change. When a route breaks the symptom is a URL
that used to work reporting no feed found, which looks identical to the
account being deleted.
:::

## Anything else

Paste a blog, a news site, or a feed URL directly. If the page advertises a
feed, it is found by autodiscovery. If that feed advertises a hub, it joins
the push tier and is never polled.

Most sites do not advertise a hub, which is fine: the poll tier uses
conditional requests and an adaptive interval, so a quiet blog costs one
cheap request an hour.

## What is not supported

Anything requiring a login to read. There is no way to follow a private
account, a members only feed, or a paywalled site, and adding one reports
no feed found.
