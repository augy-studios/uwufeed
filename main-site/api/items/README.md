# main-site/api/items

Reading the timeline.

| File | Route | Status |
| --- | --- | --- |
| [`list.js`](list.js) | `GET /api/items/list` | Stub, Phase 4 |

## The shape it will take

Items from the sources the signed in user subscribes to, newest first.

- Join `uwufeed_subscriptions` to `uwufeed_items` on `source_id`.
- Order by `published_at desc`, with `id` as a tiebreak, because a feed can
  publish two entries with the same timestamp.
- Paginate with a keyset cursor rather than an offset. An offset over a
  table that grows at the head re-reads rows the user already has.
- Cap a page at 50, which is what the service worker precaches.
- Return the item shape from [`../../../db/schema.md`](../../../db/schema.md)
  unchanged, plus the source title, so the client does not need a second
  request to render a card.

## Why it is a stub

There is no session to scope the query to until Phase 4, and an endpoint
returning everything to everybody is not a smaller version of this one, it
is a different endpoint. Phase 1 has no UI by design.
