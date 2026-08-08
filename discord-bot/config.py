"""Everything this bot reads from the environment."""

import os

from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.environ.get("DISCORD_BOT_TOKEN", "")
SQLITE_PATH = os.environ.get("DISCORD_SQLITE_PATH", "bot.sqlite3")

# Optional. Set it while developing so slash commands appear straight away
# instead of waiting on the global command cache.
DEV_GUILD_ID = os.environ.get("DISCORD_DEV_GUILD_ID", "")

WEB_APP_URL = os.environ.get("WEB_APP_URL", "https://feed.uwuapps.org")
DONATION_URL = os.environ.get("DONATION_URL", "https://donate.stripe.com/28o2akeAr3hv0DK6oo")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# The bot hands URLs to the site rather than resolving them itself, so hub
# detection has one implementation.
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")

# Shared with the site, which signs the link tokens this bot verifies.
LINK_TOKEN_SECRET = os.environ.get("LINK_TOKEN_SECRET", "")

MAX_SOURCES_PER_USER = int(os.environ.get("MAX_SOURCES_PER_USER", "50"))

# The webhook the bot creates in a chosen channel.
WEBHOOK_NAME = "uwuFeed"


def check() -> None:
    missing = [
        name
        for name, value in (
            ("DISCORD_BOT_TOKEN", BOT_TOKEN),
            ("SUPABASE_URL", SUPABASE_URL),
            ("SUPABASE_SERVICE_KEY", SUPABASE_SERVICE_KEY),
        )
        if not value
    ]
    if missing:
        raise SystemExit(f"missing environment variables: {', '.join(missing)}")

    # Not fatal. The bot still starts, and the affected commands say why
    # they cannot do their job rather than failing obscurely.
    for name, value in (("PUBLIC_BASE_URL", PUBLIC_BASE_URL), ("ADMIN_TOKEN", ADMIN_TOKEN)):
        if not value:
            print(f"warning: {name} is unset, so adding sources will not work")
    if not LINK_TOKEN_SECRET:
        print("warning: LINK_TOKEN_SECRET is unset, so linking a web account will not work")
