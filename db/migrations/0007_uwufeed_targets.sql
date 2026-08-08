-- A place a notification goes. user_id is null for system owned targets,
-- such as the single Discord webhook used in Phase 1.

create table if not exists uwufeed_targets (
  id          bigint generated always as identity primary key,
  user_id     uuid references uwufeed_users(id) on delete cascade,
  channel     text not null check (channel in ('telegram', 'discord', 'webpush', 'ntfy')),
  target_ref  text not null,
  template_id bigint references uwufeed_templates(id) on delete set null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),

  unique (user_id, channel, target_ref)
);

-- unique() treats null user_id as distinct, so system targets need their own guard.
create unique index if not exists uwufeed_targets_system_ref_idx
  on uwufeed_targets (channel, target_ref)
  where user_id is null;

create index if not exists uwufeed_targets_active_idx
  on uwufeed_targets (channel)
  where active;
