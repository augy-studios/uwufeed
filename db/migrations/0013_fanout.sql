-- Fan out. Given an item, which targets should receive it.
--
-- Sources are shared and subscriptions are per user, so the path is
-- item -> source -> everyone subscribed -> their active targets. A target
-- with no owner cannot appear here, because a subscription needs a user.

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
    -- Never re-send. The delivery row is the record of what already went.
    and not exists (
      select 1 from uwufeed_deliveries d
       where d.item_id = i.id and d.target_id = t.id
    );
$$;

-- Startup catch up, across every target rather than one at a time.
-- Bounded and run once, not a sweep.
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
    and not exists (
      select 1 from uwufeed_deliveries d
       where d.item_id = i.id and d.target_id = t.id
    )
  order by i.fetched_at asc
  limit p_limit;
$$;

-- Superseded by uwufeed_pending_fanout, which does not need a target id.
drop function if exists uwufeed_pending_deliveries(bigint, timestamptz, integer);
