-- Typed render context per platform, so output is customisable without
-- new code per platform. A null user_id is a built in default.

create table if not exists uwufeed_templates (
  id         bigint generated always as identity primary key,
  user_id    uuid references uwufeed_users(id) on delete cascade,
  channel    text not null check (channel in ('telegram', 'discord', 'webpush', 'ntfy')),
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists uwufeed_templates_user_idx
  on uwufeed_templates (user_id, channel);
