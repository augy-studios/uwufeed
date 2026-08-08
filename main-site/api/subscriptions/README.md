# main-site/api/subscriptions

Who follows what, and where it goes. Session authenticated: every endpoint
here answers `401` without a signed in user.

| File | Route | What it does |
| --- | --- | --- |
| [`add.js`](add.js) | `POST /api/subscriptions/add` | Resolve a URL and follow the result |
| [`list.js`](list.js) | `GET /api/subscriptions/list` | Everything this account follows, with routing |
| [`remove.js`](remove.js) | `POST /api/subscriptions/remove` | Stop following one |
| [`route.js`](route.js) | `POST /api/subscriptions/route` | Choose which destinations a source goes to |

## Why this is not in `sources/`

`/api/sources/subscribe` already exists and means the **WebSub hub
handshake**, which is a different thing that happens to share the word.
Keeping the two apart means a URL says which one you are touching:
`sources/` is the shared feed rows and their hub lifecycle, `subscriptions/`
is a person following one.

## Resolution is shared

`add.js` does not re-implement hub detection. It calls the same
`_lib/sources.js` the admin endpoint does, so the check that decides push
against poll has exactly one implementation.

What `add.js` adds on top is the account, the 50 source cap, and the
subscription row.

## Routing

By default a source goes to **every** active destination the account owns.
That is right for one person with one phone and wrong for anyone with a
gaming server and a dev channel.

`route.js` narrows it:

```jsonc
POST /api/subscriptions/route
{ "source_id": 12, "target_ids": [3, 7] }   // only those two
{ "source_id": 12, "target_ids": [] }       // back to everywhere
```

An empty list and "all destinations" are the same stored state: no rows in
`uwufeed_subscription_targets`. The response says `routes_everywhere` so
the caller never has to infer which of the two an empty list meant.

Both ids are checked against the signed in account before anything is
written. Without that, a source id plus a target id would be enough to
reroute somebody else's feed into your channel.

## Getting the destination list

`GET /api/targets/list` returns the account's destinations with a short
hint for each. It never returns the raw `target_ref`: a Discord webhook URL
is a credential, and a chat id is no use to a browser.

## The cap

50 sources per account, enforced here and in the Telegram bot. It is a
starting number, easy to raise later and painful to introduce afterwards.
