-- Composite primary key means a crashed dispatcher restarting never double sends.
-- The dispatcher claims a row before posting, then updates the status.

create table if not exists uwufeed_deliveries (
  item_id   bigint not null references uwufeed_items(id) on delete cascade,
  target_id bigint not null references uwufeed_targets(id) on delete cascade,
  sent_at   timestamptz not null default now(),
  status    text not null default 'pending'
            check (status in ('pending', 'sent', 'failed', 'skipped')),

  primary key (item_id, target_id)
);

create index if not exists uwufeed_deliveries_target_idx
  on uwufeed_deliveries (target_id, sent_at desc);

create index if not exists uwufeed_deliveries_stuck_idx
  on uwufeed_deliveries (sent_at)
  where status = 'pending';
