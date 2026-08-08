"""Reddit.

TODO Phase 2. Notes:
  - Reddit serves .rss for subreddits and users, so this is mostly the RSS
    adapter with different etiquette.
  - The user agent must be descriptive with a contact address. Reddit
    blocks generic ones aggressively.
  - Rate limits are per user agent as well as per IP, so one poller shared
    across all subreddits, not one per source.
  - external_id is the fullname, for example t3_abc123, taken from the guid
    rather than the permalink.
"""


def fetch(source: dict) -> list[dict]:
    raise NotImplementedError("the Reddit adapter arrives in Phase 2")
