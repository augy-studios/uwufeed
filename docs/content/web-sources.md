# Adding sources

A source is one feed. Paste a link and uwuFeed works out the rest.

## What you can paste

| You paste | What happens |
| --- | --- |
| `youtube.com/@channel` | The channel id is found, and the feed built from it |
| `youtube.com/channel/UC...` | The feed is built directly |
| A blog home page | The feed is found through autodiscovery |
| A direct feed URL | Used as is |
| A subreddit | Reddit's own `.rss` feed is used |

You do not need to find the feed link yourself. If a page advertises one,
uwuFeed follows it.

## What happens behind the scenes

1. The URL is fetched once.
2. If that turns out to be a web page rather than a feed, the autodiscovery
   link is followed. Two requests at most.
3. The feed is checked for a hub, in four places: the feed body, the feed's
   HTTP `Link` header, the page body and the page's `Link` header.
4. A hub means the push tier. No hub means the poll tier.
5. The source is stored, shared with everyone else following the same feed.
6. Items already in the feed are seeded, so a new source is not empty.

## Push or poll

The result is shown when a source is added.

**Push** means the publisher will tell us the moment something changes, in
about two to ten seconds, and nothing is ever polled.

**Poll** means uwuFeed checks periodically, between once a minute and once
an hour depending on how often that feed actually changes. A quiet feed
backs off, and the moment something appears it resets.

You cannot move a source between tiers by hand. The tier is a fact about
the publisher, not a preference.

## Seeded items are not delivered

Adding a channel does not fire twenty notifications for videos from last
year. The existing items are stored so the timeline has something in it,
and delivery starts from the next thing published.

## Limits

50 sources per free account. It is a starting number, chosen because it is
easy to raise later and painful to introduce afterwards.

## Removing a source

Removing deletes your subscription, not the source. The feed row stays,
because other people are probably following it. When the last subscriber
leaves, cleanup retires it.

## When a source dies

A feed that fails 20 times in a row is retired, and its subscribers are
told. That matters more than it sounds: the alternative is a source that
quietly stops producing and looks exactly like a channel that stopped
posting.

:::warn Not wired up yet
Adding a source from the browser needs an account, which is Phase 4. The
resolution described here already works and is reachable through the API
with an admin token. See [Self hosting](#/self-hosting).
:::
