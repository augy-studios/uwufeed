"""Bluesky through the Jetstream websocket.

TODO Phase 6. Notes:
  - Jetstream is a filtered firehose over one websocket, so one connection
    covers every Bluesky source rather than one per account.
  - Subscribe with wantedCollections=app.bsky.feed.post and the DIDs being
    followed. Reconnect with the cursor to fill the gap after a drop.
  - external_id is the AT URI of the post.
  - Filter reposts and replies unless the source asked for them, or a busy
    account floods every subscriber.
  - This is a long lived connection, which is why it lives on the VPS and
    not on Vercel.
"""


def main() -> None:
    raise NotImplementedError("the Bluesky listener arrives in Phase 6")


if __name__ == "__main__":
    main()
