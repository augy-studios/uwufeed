# Setting the bot up with the Discord Developer Portal

End to end, from nothing to a running bot in a server. Ten minutes.

## 1. Create the application

1. Open <https://discord.com/developers/applications>.
2. **New Application**, name it `uwuFeed`.

## 2. Get the bot token

1. **Bot** tab.
2. **Reset Token**, then copy it.

It is shown once. Put it straight in `.env` and never in the repository.

```text
DISCORD_BOT_TOKEN=your_token
```

## 3. Leave every privileged intent off

Still on the **Bot** tab, leave Presence, Server Members and Message
Content **off**.

Slash commands do not need message content. Asking for an intent that goes
unused means submitting for a review you did not need.

## 4. Build the invite URL

**OAuth2**, then **URL Generator**.

Scopes:

- `bot`
- `applications.commands`

Bot permissions:

- Send Messages
- Embed Links
- Use Slash Commands
- **Manage Webhooks**

Manage Webhooks is the one worth understanding rather than just ticking. It
is what lets `/settings channel:#feeds` create the webhook itself, so
nobody has to copy a webhook URL through a chat box. Without it that
command fails with a clear message rather than silently.

## 5. Add it to a server

Open the generated URL and pick a server. You need Manage Server there.

## 6. Set the development guild

```text
DISCORD_DEV_GUILD_ID=your_server_id
```

Commands sync to that one guild instantly. A global sync can take up to an
hour to appear, which is a slow way to discover a typo.

Right click the server, Copy Server ID. If you do not see it, turn on
Developer Mode under Settings, Advanced.

## 7. Install and run

Python 3.11 or newer.

```sh
cd discord-bot
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env   # then fill it in
python main.py
```

## 8. Run it on the VPS

Inside tmux, so it survives an SSH session ending:

```sh
tmux new -s uwufeed-discord
cd ~/uwufeed/discord-bot && . .venv/bin/activate && python main.py
# ctrl-b then d to detach
```

`tmux attach -t uwufeed-discord` to come back.

For something that survives a reboot, use the systemd unit in
[`../infra/systemd/`](../infra/systemd/) instead. The whole box is set up
in [`../infra/SETUP.md`](../infra/SETUP.md).

## What else needs this bot's token

`DISCORD_BOT_TOKEN` goes on **Vercel as well as the VPS**. The site sends
password reset codes as a direct message from this bot, so without it on
Vercel an account that linked Discord falls through to a weaker recovery
path. Same value, both places.

Note this is separate from `DISCORD_WEBHOOK_URL`, which is the operational
alert channel and is a different thing entirely.

## Checklist

- [ ] Application created
- [ ] Token copied into `.env`, and into Vercel
- [ ] Every privileged intent off
- [ ] Invite URL includes Manage Webhooks
- [ ] Bot is in a server you have Manage Server in
- [ ] `DISCORD_DEV_GUILD_ID` set while developing
- [ ] `/help` answers in that server
