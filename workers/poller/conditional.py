"""Conditional requests. A 304 is cheap and most feeds honour them.

TODO Phase 2.

Send If-None-Match from uwufeed_sources.etag and If-Modified-Since from
last_modified. On a 304, update next_check_at and nothing else. On a 200,
store the new etag and last-modified headers alongside the items.

Send a descriptive user agent with a contact address, so a feed host can
get in touch before deciding to block.
"""

USER_AGENT_TEMPLATE = "uwuFeed/0.1 (+{base_url}; {contact})"
