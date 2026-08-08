# Telegram commands

| Command | What it does | Status |
| --- | --- | --- |
| `/start` | What this is, every command, and two links | Works |
| `/add` | Follow a channel, a blog or a feed | Phase 3 |
| `/list` | Everything this chat follows | Phase 3 |
| `/remove` | Stop following one of them | Phase 3 |
| `/pause` | Hold delivery here, run it again to resume | Works |
| `/latest` | The most recent items, on demand | Phase 3 |
| `/status` | Health of the sources this chat follows | Phase 3 |
| `/settings` | Quiet hours, format, digest instead of instant | Phase 3 |
| `/link` | Connect this chat to a web account | Phase 3 |

## start

The introduction and the command list, with buttons to the web app and the
donation page. Sent once when you first message the bot, and available any
time after.

There is no help command by design.

## add

```text
/add https://www.youtube.com/@SomeChannel
```

Takes a link to a channel, a blog, a subreddit or a feed. The hub check
runs, the source lands in the right tier, and the reply says whether it
arrives in seconds or on a poll.

## list

Everything this chat follows, numbered, with the tier shown. The numbers
are what `/remove` takes.

## remove

```text
/remove 3
```

Takes the number from `/list` rather than a URL. Numbers are easier on a
phone and cannot be mistyped into a different valid source. It asks for
confirmation rather than removing on the first tap.

Removing drops your subscription, not the shared source row.

## pause

Toggles delivery for this chat. Run it once to go quiet, again to come
back. Subscriptions are untouched.

## latest

The newest items across this chat's subscriptions, capped at ten, without
waiting for the next push.

## status

The interesting failures in a feed aggregator are the silent ones, so this
shows what would otherwise be invisible:

- Which tier each source is in
- For push sources, when the lease expires. A lapsed lease means a source
  went quiet without erroring
- For polled sources, when it was last checked and the current interval
- Anything retired after repeated failures
- Drift, where a source keeps answering normally while its newest item gets
  steadily older

## settings

Quiet hours, message format, thumbnails, and digest instead of instant.
Chat local, stored beside the bot rather than in the shared database.

## link

Issues a short lived one time code. Enter it on the web app while signed in
and the chat and the account share one set of subscriptions. Codes expire
in ten minutes and work once.
