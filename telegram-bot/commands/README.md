# telegram-bot/commands

One module per command. Each exposes `register(client)` and attaches its
own Telethon handler, so adding a command is adding a file and one line in
`__init__.py`.

| Module | Command | Status |
| --- | --- | --- |
| `start.py` | `/start` | Working |
| `add.py` | `/add` | Stub, Phase 3 |
| `list.py` | `/list` | Stub, Phase 3 |
| `remove.py` | `/remove` | Stub, Phase 3 |
| `pause.py` | `/pause` | Working, the flag is stored |
| `latest.py` | `/latest` | Stub, Phase 3 |
| `status.py` | `/status` | Stub, Phase 3 |
| `settings.py` | `/settings` | Stub, Phase 3 |
| `link.py` | `/link` | Stub, Phase 3 |

Stubs answer with a short sentence saying the feature is coming. Silence
reads like a broken bot.

## Adding a command

```python
from telethon import events

def register(client) -> None:
    @client.on(events.NewMessage(pattern=r"^/thing(?:@\w+)?(?:\s|$)"))
    async def handler(event) -> None:
        await event.respond("...")
        raise events.StopPropagation
```

Then import it in `__init__.py`, add it to `MODULES`, add it to `COMMANDS`
in `start.py`, and add it to the BotFather command list in
[`../setup.md`](../setup.md). All four, or the command exists but nobody
finds it.

## The patterns

`^/thing(?:@\w+)?(?:\s|$)` matches `/thing`, `/thing arg`, and the
`/thing@botname` form Telegram sends in groups. Without the `@\w+` part the
command silently stops working in any group with more than one bot in it.

`raise events.StopPropagation` at the end of a handler stops later handlers
seeing the same message.

## start.py is the contract

`/start` lists every command. There is no help command, so when this file
falls out of date the bot has no accurate documentation anywhere a user can
reach. `COMMANDS` in `start.py` and the BotFather list should always agree.

## Writing the copy

- Rich formatting over plain text, HTML parse mode.
- No em dashes. Use a comma, a semicolon or a full stop.
- Never name the bot inside command text.
- No emoji.
- Say what is happening, not what the code is doing. A user does not need
  to know which tier a source landed in, only whether it arrives in seconds
  or in an hour.
