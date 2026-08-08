"""Reddit.

Reddit serves Atom at .rss for subreddits and users, so the parsing is the
RSS adapter's. What differs is etiquette and the identifier.

external_id comes out as the fullname, for example t3_abc123, because
Reddit puts it in the Atom id element and normalize picks that up before
it ever reaches the permalink. That matters: a permalink changes if a post
is crossposted or the subreddit is renamed, and the fullname does not.

Rate limits apply per user agent as well as per IP, so this runs through
the same shared poller and the same descriptive agent as everything else.
A generic agent gets blocked here faster than anywhere else.
"""

from . import rss


def parse(body: bytes, source: dict) -> list[dict]:
    return rss.parse(body, source, platform="reddit")
