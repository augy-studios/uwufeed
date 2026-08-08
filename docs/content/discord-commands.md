# Discord commands

| Command | What it does | Status |
| --- | --- | --- |
| `/help` | What this is, every command, and two links | Works |
| `/add` | Follow a channel, a blog or a feed | Planned |
| `/list` | Everything this server follows | Planned |
| `/remove` | Stop following one of them | Planned |
| `/pause` | Hold delivery here, run it again to resume | Works |
| `/latest` | The most recent items, on demand | Planned |
| `/status` | Health of the sources this server follows | Planned |
| `/settings` | Which channel receives posts, quiet hours, digest | Planned |
| `/link` | Connect this server to a web account | Planned |

## help

The introduction and the command list, with buttons to the web app and the
donation page. Ephemeral, so running it does not fill a channel.

There is no start command by design.

## add

```text
/add url: https://www.youtube.com/@SomeChannel
```

Takes a link to a channel, a blog, a subreddit or a feed. The hub check
runs, the source lands in the right tier, and the reply says whether it
arrives in seconds or on a poll.

Resolving a URL involves an outbound fetch or two, so this one defers its
reply. Discord shows it thinking rather than timing out.

## list

Everything this server follows, numbered, with the tier shown. Paged with
buttons once it passes about twenty. The numbers are what `/remove` takes.

## remove

```text
/remove number: 3
```

Takes the number from `/list`. It asks for confirmation through a button
rather than removing on the first click.

Removing drops the server's subscription, not the shared source row.

## pause

Toggles delivery for this server. Run it once to go quiet, again to come
back.

## latest

The newest items across this server's subscriptions, capped at ten, without
waiting for the next push.

## status

The failures worth seeing are the silent ones:

- Which tier each source is in
- For push sources, when the lease expires
- For polled sources, when it was last checked and the current interval
- Anything retired after repeated failures
- Recent delivery failures for this server

## settings

Which channel receives posts, an optional mention role, quiet hours, and
digest instead of instant. Server local, stored beside the bot rather than
in the shared database.

## link

Issues a short lived one time code. Enter it on the web app while signed in
and the server and the account share one set of subscriptions. Codes expire
in ten minutes and work once.
