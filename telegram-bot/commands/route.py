"""route: send one source only to some destinations.

Without this, every destination an account owns receives everything it
follows. That is right for one chat and wrong once a web account has
several places attached.
"""

import re

from telethon import Button, events

import accounts
import buttons
import feed_store
import permissions
import text

USAGE = "Send the number from /list, like <code>/route 3</code>."

CHANNEL_LABEL = {"discord": "Discord", "telegram": "Telegram", "webpush": "Browser", "ntfy": "ntfy"}


def describe(target: dict) -> str:
    label = CHANNEL_LABEL.get(target["channel"], target["channel"])
    ref = str(target.get("target_ref") or "")
    if target["channel"] == "discord":
        tail = ref.rsplit("/", 2)[-2][-6:] if "/webhooks/" in ref else ref[-6:]
        return f"{label} webhook {tail}"
    return f"{label} {ref[-6:]}"


def register(client) -> None:
    @client.on(events.NewMessage(pattern=r"^/route(?:@\w+)?(?:\s|$)"))
    async def handler(event) -> None:
        if not await permissions.require_manage(event):
            raise events.StopPropagation

        match = re.search(r"\d+", event.raw_text or "")
        if not match:
            await event.respond(USAGE, parse_mode="html")
            raise events.StopPropagation

        user_id = accounts.linked_user(event.chat_id)
        sources = await feed_store.subscriptions(user_id) if user_id else []
        index = int(match.group(0))
        if index < 1 or index > len(sources):
            await event.respond(f"There is no {index}. /list shows {len(sources)}.")
            raise events.StopPropagation

        targets = [t for t in await feed_store.targets(user_id) if t.get("active")]
        if len(targets) < 2:
            await event.respond(
                "There is only one place to send things, so there is nothing to choose. "
                "Connect a web account with /link to add more."
            )
            raise events.StopPropagation

        source = sources[index - 1]
        await show_picker(event, source, targets)
        raise events.StopPropagation


async def show_picker(event, source: dict, targets: list[dict], edit=None) -> None:
    chosen = set(source.get("target_ids") or [])
    title = text.esc(text.truncate(source.get("title") or source["feed_url"], 60))

    rows = []
    for target in targets:
        mark = "on" if target["id"] in chosen else "off"
        data = buttons.register(
            event.chat_id,
            "route",
            {
                "subscription_id": source["subscription_id"],
                "source_id": source["id"],
                "target_id": target["id"],
            },
        )
        rows.append([Button.inline(f"{describe(target)}: {mark}", data)])

    summary = "everywhere" if not chosen else f"{len(chosen)} of {len(targets)}"
    body = (
        f"<b>{title}</b>\nCurrently goes to {summary}.\n\n"
        "Tap to toggle. Turn them all off to send it everywhere."
    )

    if edit:
        await edit(body, parse_mode="html", buttons=rows)
    else:
        await event.respond(body, parse_mode="html", buttons=rows)


async def on_toggle(event, entry: dict) -> None:
    """Called from the callback router in main.py."""
    if not await permissions.can_manage(event):
        await event.answer(permissions.DENIED, alert=True)
        return

    user_id = accounts.linked_user(event.chat_id)
    if not user_id:
        await event.answer("Nothing to route.", alert=True)
        return

    payload = entry["payload"]
    sources = await feed_store.subscriptions(user_id)
    source = next((s for s in sources if s["id"] == payload["source_id"]), None)
    if source is None:
        await event.answer("That source is no longer followed.", alert=True)
        return

    chosen = set(source.get("target_ids") or [])
    target_id = payload["target_id"]
    chosen.symmetric_difference_update({target_id})

    await feed_store.set_routing(payload["subscription_id"], sorted(chosen))
    source["target_ids"] = sorted(chosen)

    targets = [t for t in await feed_store.targets(user_id) if t.get("active")]
    await show_picker(event, source, targets, edit=event.edit)
    await event.answer()
