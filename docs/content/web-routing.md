# Sending sources to specific places

One account can own many destinations: several Discord channels, several
Telegram groups, a browser or two. By default every source goes to all of
them.

That is usually wrong the moment you have more than one. A gaming server
does not want release notes from a database project, and a dev channel does
not want a streamer going live.

## Choosing where a source goes

Sources tab, open a source, and tick the destinations it should reach.

**Tick none and it goes everywhere.** That is the default rather than a
special case: no choices recorded means no restriction, which is why a
brand new source reaches everything without you configuring anything.

The summary line on each source says which it is, so "goes everywhere" and
"goes to 2 of 5" are never ambiguous.

## An example

Say you own four destinations:

| Destination | What it is for |
| --- | --- |
| Browser | Everything, because it is yours |
| Gaming server | Two YouTube channels and a Twitch streamer |
| Dev channel | Three project blogs |
| Family group | One YouTube channel |

Follow all seven sources on one account, then route each. The gaming
sources tick the gaming server and the browser. The blogs tick the dev
channel and the browser. Nothing needs a second account, and the timeline
still shows all seven together.

## The alternative, and when to prefer it

A Telegram chat that has never been connected to a web account gets **its
own account** the first time you use `/add` there. Its sources are entirely
separate, and nothing routes between them.

That is simpler when a group genuinely has nothing to do with the rest of
your feeds, and it means someone else can manage that group without seeing
your other sources. The cost is a separate list that never appears in your
timeline.

Connecting a chat merges it into your account, at which point routing takes
over.

## How it works underneath

Routing rows live in `uwufeed_subscription_targets`, one row per source and
destination pair. The fan out query reads:

- No rows for this subscription, so every active destination
- Some rows, so only those

Which is why the empty state and "everywhere" are the same thing, and why
adding a destination later automatically receives everything unrouted
without you revisiting each source.

## Pausing instead

Routing decides where something goes. **Pausing** stops a destination
receiving anything at all, without changing what you follow.

In a chat that is `/pause`, and it is per chat rather than per account, so
silencing a group leaves your browser notifications alone.
