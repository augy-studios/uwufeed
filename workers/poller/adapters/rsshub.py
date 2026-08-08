"""RSSHub, for the long tail.

RSSHub turns a site with no feed into RSS, so by the time the poller sees
one it is an ordinary feed and the RSS adapter handles it. The mapping from
a pasted URL to an RSSHub route happens once at resolve time, in
`main-site/api/_lib/platforms.js`.

This module exists for the one thing that differs: telling an RSSHub route
that broke apart from a source that genuinely died.
"""

from . import rss

# RSSHub answers 404 for a route it does not have, and routes disappear
# when the sites they scrape change. That looks identical to a dead feed,
# and without the distinction healthy sources get retired after 20 failures
# because somebody else's scraper changed.
ROUTE_ERROR_STATUSES = (404, 503)


def parse(body: bytes, source: dict) -> list[dict]:
    return rss.parse(body, source)


def is_route_failure(status: int) -> bool:
    """A problem with RSSHub rather than with the source.

    TODO: the poller counts every failure the same way. Wire this in so a
    broken route alerts instead of quietly retiring someone's subscription.
    """
    return status in ROUTE_ERROR_STATUSES
