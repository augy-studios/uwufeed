-- uwuFeed owns its own accounts. Deliberately not uwu_users: that table is
-- shared across the uwu suite, and uwuFeed creates accounts from bot chats,
-- which is not something an app should do to a table other apps read.
--
-- The tradeoff is accepted and worth stating: a uwuFlights account does not
-- sign in here. Two accounts, two passwords.

create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists uwufeed_users (
  id            uuid primary key default gen_random_uuid(),

  -- citext, so uniqueness is case insensitive in the database rather than
  -- by convention in every code path that touches it. Normalising on
  -- registration but not on login is how an account becomes unreachable by
  -- the address that created it.
  email         citext unique,

  -- Null for accounts created from a chat, which have no username to
  -- collect. Unique when present.
  username      citext unique,

  -- Null means this account cannot sign in on the web yet. A bot created
  -- account has no password, and a placeholder that means the same thing is
  -- a placeholder someone eventually mistakes for a real hash.
  password_hash text,

  display_name  text,
  avatar_url    text,

  -- How the account came into existence. 'web' registered, 'telegram' and
  -- 'discord' created by a bot on first use.
  origin        text not null default 'web'
                check (origin in ('web', 'telegram', 'discord')),

  created_at    timestamptz not null default now(),

  -- A bot account has no email and no password. A web account must have
  -- both, or it can never be signed into.
  constraint uwufeed_users_web_needs_credentials
    check (origin <> 'web' or (email is not null and password_hash is not null))
);

alter table uwufeed_users enable row level security;
revoke all on uwufeed_users from anon, authenticated;
