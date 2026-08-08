"""Per platform parsing. Routed on the source's platform column.

Routing on the stored platform rather than re-parsing the URL matters: the
URL was already resolved once at subscribe time, and re-deriving it here
would let the two disagree.
"""

from . import reddit, rss

ADAPTERS = {
    "reddit": reddit.parse,
    "web": rss.parse,
    "youtube": rss.parse,
}


def for_platform(platform: str | None):
    """Fall back to RSS. Almost everything is RSS or Atom underneath."""
    return ADAPTERS.get(platform or "web", rss.parse)
