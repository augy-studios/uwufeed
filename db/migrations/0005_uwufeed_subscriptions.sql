-- Sources are shared, subscriptions are per user. This is what makes free viable.

create table if not exists uwufeed_subscriptions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references uwufeed_users(id) on delete cascade,
  source_id  bigint not null references uwufeed_sources(id) on delete cascade,
  created_at timestamptz not null default now(),

  unique (user_id, source_id)
);

create index if not exists uwufeed_subscriptions_source_idx
  on uwufeed_subscriptions (source_id);
