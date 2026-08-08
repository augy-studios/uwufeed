# Notifications

Four ways to be told, from one set of sources. Pick any combination, and
choose which sources go where.

| Channel | Good for | Needs |
| --- | --- | --- |
| Web push | Desktop and Android, in the browser | Notification permission |
| Telegram | Phones, and sharing a feed with a group | A chat with the bot |
| Discord | Servers and communities | A webhook |
| ntfy | Android without Google services | A topic name |

## Destinations

Each place you receive things is a **destination**. One account can own as
many as you like: three Discord channels, two Telegram groups and a browser
all at once.

By default a source goes to **every** destination. That is right for one
person with one phone, and wrong the moment you have a gaming server and a
dev channel, so each source can be narrowed to specific destinations. See
[routing](#/web-routing).

## Web push

Account tab, then enable notifications. The browser asks for permission
once. Say no and the button stays available; say no twice and most browsers
stop asking, at which point it has to be re-enabled in site settings.

Notifications arrive whether or not the app is open, because the service
worker receives them rather than the page.

Each browser is its own destination. Enabling it on a laptop and a phone
gives you two, and they can be routed differently.

**iOS** only supports web push for apps added to the home screen, and only
on iOS 16.4 and later. In Safari as an ordinary tab it does not work at
all. Add to Home Screen first.

A dead subscription, which is what a reinstalled browser or cleared site
data looks like, answers `410 Gone`. That destination is deactivated rather
than retried, so nothing accumulates. Enabling it again brings it back.

## Telegram

Message the bot and follow sources there, or connect your web account so
both share one set. Account tab, then Connect a chat, gives you a link that
opens the bot with the code already filled in.

An unconnected chat keeps its own separate list, which is a perfectly good
way to run one group with its own feeds.

See [the Telegram section](#/telegram-overview).

## Discord

A webhook posts into one channel. Webhooks are used rather than the bot
gateway because their rate limits are friendlier and the bottleneck at
scale is Discord's API rather than anything on our side.

See [the Discord section](#/discord-overview).

## ntfy and UnifiedPush

An HTTP POST to a topic. No accounts, no keys, no subscription lifecycle,
and it reaches Android devices with no Google services on them.

:::warn A topic name is a password
Anyone who knows or guesses your topic can read it. Use something long and
random, not `augy-feeds`.
:::

## Quiet hours and digests

Planned rather than built. Items arriving inside a quiet window are held
and sent afterwards rather than dropped, and a digest collapses a day into
one message.

## What works today

Web push, Telegram and Discord all deliver, and each source can be routed
to specific destinations.

ntfy is Phase 6.
