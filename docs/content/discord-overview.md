# Discord bot

Slash commands for following feeds in a server. It shares one database with
the web app and the Telegram bot, so a source followed in any of the three
is the same source everywhere.

## Getting started

Add the bot to a server, then run `/help`. You get an introduction, the
full command list, and buttons to the web app and the donation page.

There is no start command. Everything lives in `/help`.

## Permissions

It asks for very little: Send Messages, Embed Links and Use Slash Commands.

No privileged intents. Slash commands do not need to read message content
and the bot does not ask to, which also means no intent review to sit
through when a server grows past a hundred members.

## Where posts land

Per server, set with `/settings`. One channel receives everything the
server follows, with an optional role to mention.

Command replies are ephemeral by default, visible only to whoever ran them.
A source list is for the person who asked, not for the channel.

## Linking a web account

`/link` issues a short lived code that you enter on the web app while
signed in, after which both places share one set of subscriptions.

## Pausing

`/pause` holds delivery in that server. Run it again to resume.
Subscriptions are untouched and nothing is lost, the channel just goes
quiet.

## Two different Discord paths

Worth knowing if you are self hosting, because it is not obvious.

**The bot** handles commands, buttons and everything a person types.

**Delivery** does not go through the bot at all. The dispatcher posts to a
webhook directly, because webhook rate limits are friendlier than the bot
gateway and the bottleneck at scale is Discord's API rather than anything
local.

So a server can receive posts with no bot in it, and the bot can be
restarted without interrupting delivery.

## Buttons keep working

Buttons live on a message forever, and a message from last month still has
its buttons. They survive restarts because every button carries a stable
identifier and the state behind it sits in SQLite, with the views
re-registered when the bot starts.

Skip that step and every button in the server's history answers with an
interaction failure.

## What is stored where

Sources, items and subscriptions live in the shared Postgres database.

View state, per server preferences and scheduling live in a small SQLite
file next to the bot. Nothing about feeds is copied there.

## What works today

`/help` and `/pause`.

The rest are scaffolded and answer with a short note rather than silence.
Following sources arrives later, and `/link` additionally needs accounts
on the site.
