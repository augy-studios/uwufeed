"""Web push delivery over VAPID.

Sending lives here rather than in a Vercel function on purpose. The
encryption needs a library, and keeping it on the VPS means the serverless
side stays dependency free. The site only enrols subscriptions.
"""

import asyncio
import json
import os

from ..errors import PermanentFailure
from ..templates import RenderContext, summary_for

try:
    from pywebpush import WebPushException, webpush
except ImportError:  # the dependency is optional until this channel is used
    webpush = None
    WebPushException = Exception


def vapid_claims() -> dict:
    return {"sub": os.environ.get("VAPID_SUBJECT", "mailto:augy@augystudios.com")}


def build_payload(ctx: RenderContext) -> str:
    """Shaped exactly as the service worker's push handler reads it."""
    return json.dumps(
        {
            "title": ctx.source_name,
            "body": ctx.title,
            "url": ctx.url or "/",
            "thumbnail_url": ctx.thumbnail_url,
            # Collapses repeats of the same item into one notification.
            "external_id": ctx.url or ctx.title,
            "summary": summary_for(ctx, limit=200),
        }
    )


async def send(client, subscription: str | dict, ctx: RenderContext) -> bool:
    if webpush is None:
        print("web push skipped: pywebpush is not installed")
        return False

    private_key = os.environ.get("VAPID_PRIVATE_KEY", "")
    if not private_key:
        print("web push skipped: VAPID_PRIVATE_KEY is unset")
        return False

    info = json.loads(subscription) if isinstance(subscription, str) else subscription

    def _send():
        webpush(
            subscription_info=info,
            data=build_payload(ctx),
            vapid_private_key=private_key,
            vapid_claims=vapid_claims(),
            timeout=15,
        )

    try:
        # pywebpush is synchronous, so keep it off the event loop.
        await asyncio.to_thread(_send)
        return True
    except WebPushException as err:
        status = getattr(getattr(err, "response", None), "status_code", None)
        if status in (404, 410):
            # The browser subscription is dead. This is the only reliable
            # signal for that, and it is permanent: deactivate rather than
            # retry forever.
            raise PermanentFailure(f"push endpoint gone ({status})") from err
        print(f"web push failed: {err}")
        return False
    except Exception as err:
        print(f"web push error: {type(err).__name__}: {err}")
        return False
