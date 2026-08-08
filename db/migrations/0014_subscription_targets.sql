-- Per source routing.
--
-- Without this, every destination an account owns receives everything it
-- follows. That is right for one person with one phone and wrong for
-- anyone with a gaming server and a dev channel.
--
-- A subscription with no rows here goes everywhere, so existing behaviour
-- is the default and simple accounts pay nothing.

create table if not exists uwufeed_subscription_targets (
  subscription_id bigint not null
    references uwufeed_subscriptions(id) on delete cascade,
  target_id       bigint not null
    references uwufeed_targets(id) on delete cascade,
  created_at      timestamptz not null default now(),

  primary key (subscription_id, target_id)
);

create index if not exists uwufeed_subscription_targets_target_idx
  on uwufeed_subscription_targets (target_id);

alter table uwufeed_subscription_targets enable row level security;
revoke all on uwufeed_subscription_targets from anon, authenticated;

-- Fan out, now routing aware.
create or replace function uwufeed_targets_for_item(p_item_id bigint)
returns table (
  target_id   bigint,
  user_id     uuid,
  channel     text,
  target_ref  text,
  template_id bigint
)
language sql
stable
as $$
  select distinct t.id, t.user_id, t.channel, t.target_ref, t.template_id
  from uwufeed_items i
  join uwufeed_subscriptions s on s.source_id = i.source_id
  join uwufeed_targets t on t.user_id = s.user_id
  where i.id = p_item_id
    and t.active
    -- No routing rows means every destination. Some rows means only those.
    and (
      not exists (
        select 1 from uwufeed_subscription_targets r where r.subscription_id = s.id
      )
      or exists (
        select 1 from uwufeed_subscription_targets r
         where r.subscription_id = s.id and r.target_id = t.id
      )
    )
    and not exists (
      select 1 from uwufeed_deliveries d
       where d.item_id = i.id and d.target_id = t.id
    );
$$;

create or replace function uwufeed_pending_fanout(
  p_since timestamptz default now() - interval '24 hours',
  p_limit integer default 200
)
returns table (
  item_id     bigint,
  target_id   bigint,
  channel     text,
  target_ref  text,
  template_id bigint
)
language sql
stable
as $$
  select i.id, t.id, t.channel, t.target_ref, t.template_id
  from uwufeed_items i
  join uwufeed_subscriptions s on s.source_id = i.source_id
  join uwufeed_targets t on t.user_id = s.user_id
  where i.fetched_at >= p_since
    and t.active
    and (
      not exists (
        select 1 from uwufeed_subscription_targets r where r.subscription_id = s.id
      )
      or exists (
        select 1 from uwufeed_subscription_targets r
         where r.subscription_id = s.id and r.target_id = t.id
      )
    )
    and not exists (
      select 1 from uwufeed_deliveries d
       where d.item_id = i.id and d.target_id = t.id
    )
  order by i.fetched_at asc
  limit p_limit;
$$;
