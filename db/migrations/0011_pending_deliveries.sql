-- Startup catch up for the dispatcher: items inserted while it was down.
-- This is a bounded one off query, not the sweep the plan rules out.

create or replace function uwufeed_pending_deliveries(
  p_target_id bigint,
  p_since     timestamptz default now() - interval '24 hours',
  p_limit     integer default 50
)
returns setof uwufeed_items
language sql
stable
as $$
  select i.*
  from uwufeed_items i
  left join uwufeed_deliveries d
    on d.item_id = i.id and d.target_id = p_target_id
  where i.fetched_at >= p_since
    and d.item_id is null
  order by i.fetched_at asc
  limit p_limit;
$$;
