# Workers

Python processes that run continuously on a VPS. Everything here holds a
connection open, keeps a loop running, or both, which is exactly what a
serverless function cannot do.

| Worker | What it does | Status |
| --- | --- | --- |
| [Dispatcher](#/workers-dispatcher) | Listens for new items and delivers them | Works, Discord only |
| [Poller](#/workers-poller) | The poll tier, for sources with no hub | Phase 2 |
| [Stream listeners](#/workers-streams) | Bluesky and Mastodon | Phase 6 |

## Why these are not serverless

The split is not push against poll, it is request shaped against
continuous.

A webhook receiver is request shaped. Something calls it, it does its work,
it returns. That runs beautifully on Vercel, which is why the WebSub and
EventSub receivers live there even though they are the fastest part of the
whole system.

A websocket listener is not request shaped. It connects and then waits,
sometimes for hours. There is no request to bill, no request to time out,
and nothing to wake it up. That has to be a process on a machine.

## Setup

```sh
cd workers
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env
```

Python 3.11 or newer. Debian 13 ships 3.13, which is fine.

## Running

```sh
cd workers
python -m dispatcher.main
```

From the `workers` directory, as a module. The channel modules import their
siblings with relative imports, so running the file directly as a script
fails on the first import.

## Database connections

Workers are long lived, so they use the direct database connection rather
than the pooler.

That matters for the poller specifically: claiming a batch uses
`for update skip locked`, which holds row locks across statements, and
transaction mode pooling breaks that in ways that are subtle and horrible
to debug. Vercel functions are the exact opposite case and never open a
direct connection.

## Two implementations of one contract

The item shape has a Python implementation in `workers/poller/normalize.py`
and a JavaScript one in `main-site/api/_lib/normalize.js`. Both produce the
same object from the same feed, and [the item shape](#/item-shape) is the
specification both follow.

Change one without the other and the two halves of the project start
writing different rows for the same feed, which shows up much later as
duplicate items with slightly different identifiers.
