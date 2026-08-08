"""Plain RSS and Atom. The default adapter for the poll tier.

TODO Phase 2. Parse with feedparser, hand each entry to
normalize.normalize_entry, and resolve relative links against the feed URL
before returning. Handle a feed that is valid XML but has zero entries as a
success with nothing found, not as a failure.
"""


def fetch(source: dict) -> list[dict]:
    raise NotImplementedError("the RSS adapter arrives in Phase 2")
