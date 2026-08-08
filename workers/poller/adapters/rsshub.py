"""RSSHub, for the long tail.

TODO Phase 6. Notes:
  - Runs as a container on the VPS, see infra/rsshub/.
  - Turns a site with no feed into an RSS feed, which then goes through the
    normal RSS adapter, so this module is mostly route mapping.
  - Point at the local instance, never the public one. The public instance
    is rate limited and frequently blocked upstream.
  - An RSSHub route breaking looks exactly like a dead feed, so surface the
    difference or sources get retired for the wrong reason.
"""


def fetch(source: dict) -> list[dict]:
    raise NotImplementedError("RSSHub arrives in Phase 6")
