"""Web push delivery over VAPID.

TODO Phase 4. Notes for whoever writes it:
  - target_ref holds the PushSubscription JSON, endpoint plus keys.
  - Sign with VAPID_PRIVATE_KEY and VAPID_SUBJECT, encrypt the payload with
    aes128gcm.
  - A 410 Gone means the browser subscription is dead. Set the target
    inactive; do not retry it.
  - A 413 means the payload was too large. Push payloads are small, so send
    an id and let the service worker fetch the detail if it grows.
  - Keep the payload shaped like the service worker expects: title, body,
    url, thumbnail_url, external_id.
"""

from ..templates import RenderContext


async def send(client, subscription: dict, ctx: RenderContext) -> bool:
    raise NotImplementedError("web push delivery arrives in Phase 4")
