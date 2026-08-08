"""Everything this bot reads from the environment."""

import os

from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.environ.get("DISCORD_BOT_TOKEN", "")
SQLITE_PATH = os.environ.get("DISCORD_SQLITE_PATH", "bot.sqlite3")

# Optional. Set it while developing so slash commands appear straight away
# instead of waiting on the global command cache.
DEV_GUILD_ID = os.environ.get("DISCORD_DEV_GUILD_ID", "")

WEB_APP_URL = os.environ.get("WEB_APP_URL", "https://uwufeed.app")
DONATION_URL = os.environ.get("DONATION_URL", "https://donate.stripe.com/28o2akeAr3hv0DK6oo")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def check() -> None:
    if not BOT_TOKEN:
        raise SystemExit("missing environment variable: DISCORD_BOT_TOKEN")
