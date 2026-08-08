# infra/systemd

Unit files for the long running processes. tmux is fine for watching a
process and poking at it; systemd is what brings it back after a reboot or
a crash at four in the morning. Use both: systemd for the ones that matter,
tmux while working on them.

| Unit | Runs | Status |
| --- | --- | --- |
| `uwufeed-dispatcher.service` | `python -m dispatcher.main` | Ready |
| `uwufeed-telegram.service` | `telegram-bot/main.py` | Ready |
| `uwufeed-discord.service` | `discord-bot/main.py` | Ready |
| `uwufeed-poller.service` | `python -m poller.main` | Waits on Phase 2 |

## Assumptions

Every unit assumes a `uwufeed` user, the repository at
`/home/uwufeed/uwufeed`, and a virtualenv inside each component directory.
Change the paths if your layout differs; they appear in `WorkingDirectory`,
`EnvironmentFile`, `ExecStart` and `ReadWritePaths`.

```sh
sudo adduser --system --group --home /home/uwufeed uwufeed
sudo -u uwufeed git clone <repo> /home/uwufeed/uwufeed
```

## Installing

```sh
sudo cp infra/systemd/uwufeed-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now uwufeed-dispatcher uwufeed-telegram uwufeed-discord
```

Leave `uwufeed-poller` disabled until Phase 2 exists. It starts, raises
`NotImplementedError` and gets restarted forever otherwise.

## Watching them

```sh
systemctl status uwufeed-dispatcher
journalctl -u uwufeed-dispatcher -f
journalctl -u uwufeed-dispatcher --since "1 hour ago"
```

## The environment file

All four read `/home/uwufeed/uwufeed/.env`. systemd's `EnvironmentFile`
parser is not a shell:

- `KEY=value`, no `export`.
- No command substitution and no variable expansion.
- Quotes are taken literally in older versions, so leave them off.

Lock it down, since it holds the service role key:

```sh
sudo chown uwufeed:uwufeed /home/uwufeed/uwufeed/.env
sudo chmod 600 /home/uwufeed/uwufeed/.env
```

## Hardening

`ProtectSystem=strict` and `ProtectHome=read-only` make the whole
filesystem read only apart from the paths listed in `ReadWritePaths`. The
bots need theirs, because the Telethon session file and the SQLite database
are written next to the code.

If a bot starts failing on a read only filesystem after a change, it is
writing somewhere new and `ReadWritePaths` needs to say so.

## Restart behaviour

`Restart=always` with a short delay. A dispatcher that dies because
Supabase is briefly unreachable should come straight back. A crash loop
shows up in `journalctl` as a burst of restarts, so watch for that rather
than assuming it is healthy because it is running.
