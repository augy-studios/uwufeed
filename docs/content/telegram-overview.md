# Telegram bot

Follow feeds and get them in a chat. It works in a private chat, a group or
a channel, and it shares one database with the web app and the Discord bot,
so a source followed in any of the three is the same source everywhere.

## Getting started

Message the bot and send `/start`. You get an introduction, the full
command list, and buttons to the web app and the donation page.

There is no help command. Everything lives in `/start`, because two
commands printing the same thing is one more thing to keep in sync.

## In groups

Add it to a group and it posts there. Telegram sends commands as
`/add@thebotname` in groups, which every command already handles.

By default the bot only sees messages that start with a command. It cannot
read ordinary conversation, and it is not asking to.

## Linking a web account

Without a link, a chat and a web account are two unrelated identities, and
a channel followed in both places is followed twice.

`/link` issues a short lived code that you enter on the web app while
signed in. After that both places share one set of subscriptions.

## Pausing

`/pause` holds delivery in that chat. Run it again to resume. Nothing is
unfollowed and nothing is lost, the chat just goes quiet.

This is per chat, so pausing a group does not silence your private chat.

## What is stored where

Sources, items and subscriptions live in the shared Postgres database.

Button state, per chat preferences and scheduling live in a small SQLite
file next to the bot. Nothing about feeds is copied there. The only shared
identifier stored locally is the chat to account mapping, which is a
pointer rather than a copy.

## Buttons keep working

Telegram buttons live on a message forever, and a chat you scrolled past
last month still has its buttons. They keep working across restarts and
redeploys, because a button carries a short token and the real state sits
in SQLite rather than in the button itself.

If a button ever says it has expired, that means the stored row was pruned
after 90 days. Run the command again.

## What works today

Every command. Following sources, listing them, removing them, on demand
items, source health, per chat settings, and connecting the chat to a web
account.

Quiet hours and digests are the exception: both are set from the web app
rather than from here.
