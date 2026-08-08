# Running the workers

Three long running processes on the VPS. Nothing here needs an external
portal, but nothing here runs on Vercel either: this is the half of the
system that has to stay up.

If you are setting up the box itself for the first time, start at
[`../infra/SETUP.md`](../infra/SETUP.md) instead. This page assumes the
repository is already cloned and `.env` is filled in.

## 1. Install

Python 3.11 or newer.

```sh
cd workers
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env   # then fill it in
```

3.10 is the hard floor, because a few annotations use `str | None` at
runtime. Debian 13 ships 3.13, which is comfortably above it.

## 2. Run the three processes

```sh
cd workers
python -m dispatcher.main
python -m poller.main
python -m streams.bluesky
```

**Run them from this directory, as modules.** The submodules import their
siblings relatively, so running a file as a script fails on the first
import. `python dispatcher/main.py` will not work and the error will not
obviously say why.

| Process | What it does | Needed when |
| --- | --- | --- |
| `dispatcher.main` | Turns items into notifications and sends them | Always |
| `poller.main` | Fetches feeds with no hub, on an adaptive interval | Always |
| `streams.bluesky` | Holds the Jetstream websocket open | Only if anyone follows Bluesky |

The Bluesky listener idles harmlessly when nobody follows a Bluesky
account, so there is no harm in running it either way.

## 3. Keep them running

**tmux**, while working on things:

```sh
../infra/tmux-bootstrap.sh
tmux attach -t uwufeed
```

**systemd**, for anything that should survive a reboot. The units are in
[`../infra/systemd/`](../infra/systemd/).

Use systemd for the real thing and tmux while iterating. Running both at
once means two dispatchers. That is survivable, because the delivery claim
in the database stops a double send, but it is confusing to debug.

## What the dispatcher needs beyond the database

`DISCORD_WEBHOOK_URL` for operational alerts, and it wants setting **on
Vercel too**, because the nightly lease renewal cron alerts through the
same channel. A renewal that fails silently is the worst failure mode in
the system, since the push tier goes quiet with no error anywhere.

## Checklist

- [ ] Virtualenv created and requirements installed
- [ ] `.env` filled in and `chmod 600`
- [ ] All three started as modules from `workers/`
- [ ] Dispatcher and poller under systemd, not only tmux
- [ ] `DISCORD_WEBHOOK_URL` set on the VPS and on Vercel
