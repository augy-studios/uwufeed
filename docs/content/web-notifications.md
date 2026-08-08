# Notifications

Four ways to be told, from one set of subscriptions. Pick any combination.

| Channel | Good for | Needs |
| --- | --- | --- |
| Web push | Desktop and Android, in the browser | Notification permission |
| Telegram | Phones, and sharing a feed with a group | A chat with the bot |
| Discord | Servers and communities | A webhook or the bot |
| ntfy | Android without Google services | A topic name |

## Web push

Account panel, then enable notifications. The browser asks for permission
once. Say no and the button stays available; say no twice and most browsers
stop asking, at which point it has to be re-enabled in site settings.

Notifications arrive whether or not the app is open, because the service
worker receives them rather than the page.

**iOS** only supports web push for apps added to the home screen, and only
on iOS 16.4 and later. In Safari as an ordinary tab, it does not work at
all. Add to Home Screen first.

A dead subscription, which is what a reinstalled browser or a cleared site
looks like, answers with `410 Gone`. That target is deactivated rather than
retried, so nothing accumulates.

## Telegram

Message the bot and follow sources from there, or link your web account so
both places share one set. See [the Telegram section](#/telegram-overview).

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

Delivery to a single Discord webhook, end to end, in under ten seconds.

Web push, Telegram and ntfy all need accounts and per user targets, so they
follow in Phases 3, 4 and 6.
