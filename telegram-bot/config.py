"""Everything this bot reads from the environment.

Secrets only ever come from the environment. Nothing here has a default
that would work in production by accident.
"""

import os

from dotenv import load_dotenv

load_dotenv()

API_ID = int(os.environ.get("TELEGRAM_API_ID", "0"))
API_HASH = os.environ.get("TELEGRAM_API_HASH", "")
BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")

SQLITE_PATH = os.environ.get("TELEGRAM_SQLITE_PATH", "bot.sqlite3")
SESSION_NAME = os.environ.get("TELEGRAM_SESSION_NAME", "uwufeed-telegram")

WEB_APP_URL = os.environ.get("WEB_APP_URL", "https://uwufeed.app")
DONATION_URL = os.environ.get("DONATION_URL", "https://donate.stripe.com/28o2akeAr3hv0DK6oo")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def check() -> None:
    missing = [
        name
        for name, value in (
            ("TELEGRAM_API_ID", API_ID),
            ("TELEGRAM_API_HASH", API_HASH),
            ("TELEGRAM_BOT_TOKEN", BOT_TOKEN),
        )
        if not value
    ]
    if missing:
        raise SystemExit(f"missing environment variables: {', '.join(missing)}")
