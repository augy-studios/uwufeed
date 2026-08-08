"""Mastodon through the streaming API.

TODO Phase 6. Notes:
  - Needs a bot account with an access token on each instance being
    followed, so this is one connection per instance rather than one
    overall.
  - Streams as server sent events. Reconnect with backoff, since instances
    drop connections routinely.
  - external_id is the status URI, which stays stable across boosts.
  - Respect the instance's rules. A bot account that reads more than it
    should gets defederated, and that is not recoverable.
"""


def main() -> None:
    raise NotImplementedError("the Mastodon listener arrives in Phase 6")


if __name__ == "__main__":
    main()
