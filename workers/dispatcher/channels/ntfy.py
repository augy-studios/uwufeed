"""ntfy and UnifiedPush delivery.

TODO Phase 6. Notes for whoever writes it:
  - An HTTP POST to NTFY_BASE_URL/<topic>. No key management and no
    subscription lifecycle, which is the whole appeal.
  - Reaches Android devices with no Google services on them.
  - Metadata goes in headers: Title, Click, Attach, Tags, Priority.
  - The body is plain text. Markdown needs the X-Markdown header.
  - There is no delivery receipt, so a 200 means accepted and nothing more.
"""

from ..templates import RenderContext


async def send(client, topic: str, ctx: RenderContext) -> bool:
    raise NotImplementedError("ntfy delivery arrives in Phase 6")
