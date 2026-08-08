# workers/poller/adapters

One module per platform in the poll tier. Each exposes:

```python
def parse(body: bytes, source: dict) -> list[dict]
```

It returns rows already in the item shape from
[`../../../db/schema.md`](../../../db/schema.md), ready to insert.

An adapter parses and nothing else. Fetching, conditional requests,
scheduling and backoff all belong to the caller, which is why `parse` takes
a body rather than going and getting one. That also makes an adapter
testable with a string and no network.

`for_platform(platform)` routes on the source's stored `platform` column
rather than re-parsing the URL. The URL was already resolved once at
subscribe time, and re-deriving it here would let the two disagree.

| Module | Platform | Status |
| --- | --- | --- |
| [`rss.py`](rss.py) | Plain RSS and Atom, the default | Working |
| [`reddit.py`](reddit.py) | Reddit subreddits and users | Working |
| [`rsshub.py`](rsshub.py) | Long tail sites through RSSHub | Working |
| [`jsonfeed.py`](jsonfeed.py) | JSON Feed 1.1 | Working |

## Adding one

1. Write `parse(body, source)` returning item shaped dicts.
2. Register it in `ADAPTERS` in `__init__.py`, keyed on the platform value
   that `sources/resolve.js` stores.
3. Get `external_id` from something the platform guarantees is stable.
   Position in the feed is never acceptable.
4. Return an empty list for a feed that parsed fine and had nothing in it.
   That is not a failure, and treating it as one retires healthy sources.
5. Resolve relative links against the feed URL before returning. feedparser
   does not do it without the request URL, and a stored path is useless to
   every consumer downstream.

The full walkthrough is in [`../../../docs/`](../../../docs/), under
adding a platform.

## Etiquette

Every outbound request carries the descriptive user agent with a contact
address. Reddit in particular blocks generic agents, and a host that can
find a contact tends to write before it blocks.
