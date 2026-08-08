-- Sessions for uwufeed_users. The raw token goes to the browser, a hash of
-- it goes in this table, so a database leak does not hand over live
-- sessions.

create table if not exists uwufeed_sessions (
  id         uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id    uuid not null references uwufeed_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists uwufeed_sessions_user_idx on uwufeed_sessions (user_id);

-- Cleanup deletes by expiry, so index it. The shared table this replaces
-- had no such index and made every prune a sequential scan.
create index if not exists uwufeed_sessions_expires_idx on uwufeed_sessions (expires_at);

alter table uwufeed_sessions enable row level security;
revoke all on uwufeed_sessions from anon, authenticated;
