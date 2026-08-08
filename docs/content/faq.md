# Questions

## How fast is it really

Two to ten seconds for anything in the push tier, which covers YouTube,
Twitch and a surprising number of blogs. That is the publisher's hub
telling us, plus our own processing, plus the destination's delivery.

For polled sources it is between 60 seconds and an hour, depending on how
often that feed changes.

## Why is my source polled instead of pushed

Because the publisher does not advertise a hub. That is a fact about them,
not a setting on our side, and there is nothing to switch on.

Blogs on a platform that supports WebSub usually get it automatically. A
static site generator on plain hosting usually does not.

## Will I get duplicate notifications

No. Two separate mechanisms prevent it.

Items are unique on the source and a stable platform identifier, so a hub
re-firing when someone edits a title does not create a second item. And
every delivery is claimed in the database before it is sent, so a crashed
dispatcher restarting cannot repeat one.

## Will I ever miss something

It is possible, and the trade is deliberate. If the dispatcher dies between
claiming a delivery and sending it, that one notification is lost rather
than repeated.

A missed post is a nuisance. A duplicate at three in the morning is a
reason to uninstall.

Startup catch up covers the more common case, a process that was down for a
while.

## Why is there no offline mode for actions

The app precaches its shell and your most recent 50 items, so it opens and
shows something without a connection. It does not queue actions taken
offline.

An outbox that silently replays something a day later, against state that
has since changed, causes more confusion than it saves.

## Why light mode by default

Because an app that guesses from the system setting and gets it wrong is
more annoying than one that starts predictably. Choose dark once and it is
remembered forever, and never overridden.

## Is my data shared

Sources are shared, in the sense that one feed is fetched once no matter
how many people follow it. That is what makes this affordable.

Which sources **you** follow is yours. Subscriptions are per user, and no
part of the interface exposes another user's list.

## Why not Supabase Auth

Because `uwu_users` and `uwu_sessions` are shared across the other uwu
apps, and one identity across them is the point. Adding a second identity
system would mean maintaining both forever.

## Can I export my subscriptions

Yes, as OPML, from the Sources panel. It works in any other reader.

An aggregator that makes leaving difficult is telling you something about
how it expects to compete.

## What happens when a feed dies

After twenty consecutive failures the source is retired and its subscribers
are told.

The telling is the part that matters. A retired source that just goes quiet
is indistinguishable from a channel that stopped posting.

## Why does it say a phase number

It is being built in stages, and the docs mark what works today rather than
describing everything as though it already exists.

Both ingestion tiers work: push through WebSub, and polling with
conditional requests and adaptive backoff. Phases 3 through 7 cover the
bots, accounts, Twitch, breadth and hardening.

## Is it really free

Yes, and the design is what makes that sustainable rather than a promise
about someone's goodwill. Shared sources, a push tier that costs nothing
while idle, conditional requests, adaptive backoff and retirement of dead
feeds.

There is a donation link if you want to, and nothing behind it.
