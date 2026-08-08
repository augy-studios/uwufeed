#!/usr/bin/env bash
# Bring up every VPS process in one tmux session, one window each.
# systemd is what should run these in production. This is for watching
# them while working.
set -euo pipefail

ROOT="${UWUFEED_ROOT:-$HOME/uwufeed}"
SESSION="${UWUFEED_TMUX_SESSION:-uwufeed}"

if [ ! -d "$ROOT" ]; then
  echo "repository not found at $ROOT, set UWUFEED_ROOT" >&2
  exit 1
fi

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "session $SESSION already exists, attaching"
  exec tmux attach -t "$SESSION"
fi

tmux new-session -d -s "$SESSION" -n dispatcher -c "$ROOT/workers"
tmux send-keys -t "$SESSION:dispatcher" \
  ". .venv/bin/activate && python -m dispatcher.main" C-m

tmux new-window -t "$SESSION" -n telegram -c "$ROOT/telegram-bot"
tmux send-keys -t "$SESSION:telegram" \
  ". .venv/bin/activate && python main.py" C-m

tmux new-window -t "$SESSION" -n discord -c "$ROOT/discord-bot"
tmux send-keys -t "$SESSION:discord" \
  ". .venv/bin/activate && python main.py" C-m

tmux new-window -t "$SESSION" -n poller -c "$ROOT/workers"
tmux send-keys -t "$SESSION:poller" \
  ". .venv/bin/activate && python -m poller.main" C-m

tmux new-window -t "$SESSION" -n shell -c "$ROOT"

tmux select-window -t "$SESSION:dispatcher"
echo "started session $SESSION"
echo "attach with: tmux attach -t $SESSION"
