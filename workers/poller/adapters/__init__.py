"""Per platform parsing. Routed on the source's platform column.

Routing on the stored platform rather than re-parsing the URL matters: the
URL was already resolved once at subscribe time, and re-deriving it here
would let the two disagree.
"""

from . import jsonfeed, reddit, rss

ADAPTERS = {
    "reddit": reddit.parse,
    "web": rss.parse,
    "youtube": rss.parse,
}


def for_platform(platform: str | None):
    """Fall back to RSS. Almost everything is RSS or Atom underneath."""
    return ADAPTERS.get(platform or "web", rss.parse)


def parse_body(body: bytes, source: dict) -> list[dict]:
    """Pick the parser from the document itself, then the platform.

    A JSON Feed and an Atom feed can both sit behind a URL that looks like
    any other, and the platform column cannot tell them apart, so the body
    gets the first say.
    """
    if jsonfeed.looks_like_json_feed(body):
        return jsonfeed.parse(body, source)
    return for_platform(source.get("platform"))(body, source)
