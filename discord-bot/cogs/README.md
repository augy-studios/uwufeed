# discord-bot/cogs

One module per group of related slash commands. Each ends with
`async def setup(bot)` so `bot.load_extension` can find it, and each is
listed in `EXTENSIONS` in `__init__.py`.

| Module | Commands | Status |
| --- | --- | --- |
| `help.py` | `/help` | Working |
| `sources.py` | `/add`, `/list`, `/remove` | Working |
| `prefs.py` | `/pause`, `/settings`, `/link` | Working |
| `items.py` | `/latest`, `/status` | Working |

Anything not built answers with a short sentence saying so. Silence reads
like a broken bot.

## Adding a command

```python
class Thing(commands.Cog):
    def __init__(self, bot): self.bot = bot

    @app_commands.command(name="thing", description="Does the thing")
    async def thing(self, interaction: discord.Interaction) -> None:
        await interaction.response.send_message("...", ephemeral=True)

async def setup(bot): await bot.add_cog(Thing(bot))
```

Then add it to `EXTENSIONS` if it is a new module, and add it to `COMMANDS`
in `help.py`. Both, or the command exists but nobody finds it.

## help.py is the contract

`/help` lists every command. There is no start command, so when this file
falls out of date the bot has no accurate documentation anywhere a user can
reach.

## Interaction timing

Discord gives three seconds to acknowledge an interaction. Anything that
touches the network, which is most of them, has to
`await interaction.response.defer()` first and then use
`interaction.followup.send()`. Resolving a feed URL involves one or two
outbound fetches and will exceed three seconds regularly.

## Guild only

Commands that read or write per guild preferences carry
`@app_commands.guild_only()`. Without it they are callable in a DM, where
`interaction.guild_id` is `None` and the preference write fails with an
unhelpful error.

## Writing the copy

- Embeds where there is anything to lay out, plain text otherwise.
- No em dashes. Use a comma, a semicolon or a full stop.
- Never name the bot inside command text.
- No emoji.
- Ephemeral by default. A source list is for the person who asked, not for
  the channel.
