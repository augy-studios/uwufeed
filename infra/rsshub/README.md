# infra/rsshub

RSSHub as a container, for sites that publish nothing machine readable.

**Status: working.** Set `RSSHUB_BASE_URL` and a curated set of platform
URLs resolve through it automatically. The map lives in
`main-site/api/_lib/platforms.js`.

## What it is for

RSSHub scrapes a site and serves the result as RSS. That feed then goes
through the ordinary poll tier, so the rest of the system does not need to
know RSSHub exists. It is the fallback for the long tail, after push and
after plain RSS.

## Running it

```sh
cd infra/rsshub
docker compose up -d
curl http://127.0.0.1:1200/healthz
```

Set the poller's base URL to `http://127.0.0.1:1200`.

## Bound to localhost, deliberately

The port is published as `127.0.0.1:1200:1200` rather than `1200:1200`. An
RSSHub instance reachable from the internet gets found and used by
strangers within days, and then the upstream sites block your VPS rather
than theirs. Only the poller on the same host should reach it.

## Failure mode worth knowing

An RSSHub route breaking looks exactly like a dead feed: a valid response
with nothing in it, or a 404. Without telling the two apart, healthy
sources get retired after 20 failures because a scraper changed.

Treat an RSSHub 404 as a route problem to alert on, not as source failure
to count.

## Upkeep

RSSHub routes break often, because the sites they scrape change. Pin a
version rather than tracking `latest` once anything depends on this, and
update deliberately.
