-- Sources are shared. One channel followed by 400 people is fetched once.

create table if not exists uwufeed_sources (
  id                bigint generated always as identity primary key,
  platform          text not null,
  tier              text not null check (tier in ('push', 'poll')),
  feed_url          text not null unique,
  external_ref      text,
  title             text,

  -- push tier
  hub_url           text,
  lease_expires_at  timestamptz,
  websub_secret     text,

  -- poll tier
  next_check_at     timestamptz,
  poll_interval_s   integer not null default 900,
  etag              text,
  last_modified     text,

  fail_count        integer not null default 0,
  retired_at        timestamptz,
  created_at        timestamptz not null default now(),

  -- The poller must never look at a push source.
  constraint uwufeed_sources_push_never_polled
    check (tier <> 'push' or next_check_at is null),
  constraint uwufeed_sources_poll_floor
    check (poll_interval_s >= 60)
);

-- The poller's claim query: order by next_check_at, for update skip locked.
create index if not exists uwufeed_sources_due_idx
  on uwufeed_sources (next_check_at)
  where tier = 'poll' and retired_at is null;

-- The renewal cron's query: leases expiring within 3 days.
create index if not exists uwufeed_sources_lease_idx
  on uwufeed_sources (lease_expires_at)
  where tier = 'push' and retired_at is null;
