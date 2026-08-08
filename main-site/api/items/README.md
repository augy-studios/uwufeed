# main-site/api/items

Reading the timeline.

| File | Route | Status |
| --- | --- | --- |
| [`list.js`](list.js) | `GET /api/items/list` | Working |

## What it returns

Items from the sources the signed in user follows, newest first.

- Join `uwufeed_subscriptions` to `uwufeed_items` on `source_id`.
- Order by `published_at desc`, with `id` as a tiebreak, because a feed can
  publish two entries with the same timestamp.
- Paginate with a keyset cursor rather than an offset. An offset over a
  table that grows at the head re-reads rows the user already has.
- Cap a page at 50, which is what the service worker precaches.
- Return the item shape from [`../../../db/schema.md`](../../../db/schema.md)
  unchanged, plus the source title, so the client does not need a second
  request to render a card.

## The cursor

Opaque, base64url of `published_at|id`. Both halves are needed: two entries
can share a timestamp, and without the id as a tiebreak paging either skips
or repeats them.

A malformed cursor is ignored rather than rejected, so a stale bookmark
returns the first page instead of an error.
