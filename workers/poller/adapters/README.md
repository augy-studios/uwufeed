# workers/poller/adapters

One module per platform in the poll tier. Each exposes:

```python
def fetch(source: dict) -> list[dict]
```

It returns rows already in the item shape from
[`../../../db/schema.md`](../../../db/schema.md), ready to insert. An
adapter does the fetching and the platform specific parsing; scheduling,
conditional requests and backoff belong to the caller.

| Module | Platform | Status |
| --- | --- | --- |
| [`rss.py`](rss.py) | Plain RSS and Atom, the default | Stub, Phase 2 |
| [`reddit.py`](reddit.py) | Reddit subreddits and users | Stub, Phase 2 |
| [`rsshub.py`](rsshub.py) | Long tail sites through RSSHub | Stub, Phase 6 |

## Adding one

1. Write `fetch(source)` returning item shaped dicts.
2. Route to it from `platform` on the source row, not from the URL. The URL
   is already parsed once at resolve time and stored.
3. Get `external_id` from something the platform guarantees is stable.
   Position in the feed is never acceptable.
4. Return an empty list for a feed that parsed fine and had nothing new.
   That is not a failure, and treating it as one retires healthy sources.
5. Raise for a transport failure, so `fail_count` and the backoff see it.

The full walkthrough is in [`../../../docs/`](../../../docs/), under
adding a platform.

## Etiquette

Every outbound request carries the descriptive user agent with a contact
address. Reddit in particular blocks generic agents, and a host that can
find a contact tends to write before it blocks.
