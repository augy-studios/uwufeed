"""Mastodon is deliberately not a stream listener.

Every Mastodon account publishes `instance/@user.rss`, so a Mastodon source
is an ordinary feed and goes through the poll tier like any other. Nothing
runs from this file.

The streaming API would give live delivery instead of poll interval
latency, and the price is steep: one connection **per instance**, each
needing a bot account with an access token on that instance, created by
hand. Following people across forty instances means forty of each.

It also carries a risk the RSS route does not. A bot account that reads
more than an instance's rules allow gets defederated, and in practice that
is not appealable. An ordinary polite feed fetch cannot be defederated,
because it is what every feed reader on the internet already does.

Bluesky went the other way for the opposite reason: one Jetstream
connection covers every account, so streaming there costs nothing per
source. See `bluesky.py`.

If a specific instance ever justifies live delivery, the shape is:

  - Server sent events at /api/v1/streaming/user with a bearer token.
  - Reconnect with backoff; instances drop connections routinely and do
    not treat it as an error.
  - external_id is the status URI, which stays stable across boosts.
  - Identify the bot clearly in its profile and give it a contact address.

Until then, adding a Mastodon profile URL resolves to its .rss feed
automatically, and nothing here needs to run.
"""
