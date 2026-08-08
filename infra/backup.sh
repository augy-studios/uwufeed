#!/usr/bin/env bash
# Back up the bot SQLite files.
#
# Supabase covers Postgres. Nothing covers these, and they hold button
# state, per chat preferences and the chat to account mapping. Losing one
# means every button in that bot's history stops working and every linked
# chat forgets which account it belongs to.
#
# Uses sqlite3 .backup rather than cp: copying a database while the bot has
# it open can capture a torn write.
#
# Suggested crontab, daily at 05:00:
#   0 5 * * * /home/uwufeed/uwufeed/infra/backup.sh
set -euo pipefail

ROOT="${UWUFEED_ROOT:-$HOME/uwufeed}"
DEST="${UWUFEED_BACKUP_DIR:-$HOME/backups}"
KEEP_DAYS="${UWUFEED_BACKUP_KEEP_DAYS:-30}"

if ! command -v sqlite3 >/dev/null; then
  echo "sqlite3 is not installed. apt install sqlite3" >&2
  exit 1
fi

mkdir -p "$DEST"
stamp="$(date -u +%Y%m%d)"
backed_up=0

for bot in telegram-bot discord-bot; do
  src="$ROOT/$bot/bot.sqlite3"
  [ -f "$src" ] || continue

  out="$DEST/${bot}-${stamp}.sqlite3"
  sqlite3 "$src" ".backup '$out'"
  gzip -f "$out"
  echo "backed up $bot to ${out}.gz"
  backed_up=$((backed_up + 1))
done

if [ "$backed_up" -eq 0 ]; then
  echo "no databases found under $ROOT, nothing to do" >&2
  exit 1
fi

# Old copies are the point of a backup, but not forever.
find "$DEST" -name '*-*.sqlite3.gz' -mtime "+$KEEP_DAYS" -delete
echo "kept the last $KEEP_DAYS days in $DEST"
