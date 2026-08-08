-- Phase 7. Everything the system needs to say when it is broken, plus the
-- preferences the dispatcher has to be able to read.

-- ---- delivery preferences ----
--
-- These lived in each bot's SQLite, where the dispatcher cannot see them,
-- which is why quiet hours and digests were stored and never honoured. Same
-- problem the pause flag had before it moved to active.

alter table uwufeed_targets
  add column if not exists quiet_from time,
  add column if not exists quiet_to   time,
  add column if not exists digest     boolean not null default false,
  -- An IANA name, not an offset. Quiet hours are meaningless without
  -- knowing whose night it is, and an offset is wrong twice a year.
  add column if not exists timezone   text not null default 'UTC';

-- Quiet hours are either both set or neither. One of the two is a
-- half configured window that behaves unpredictably at the boundary.
alter table uwufeed_targets
  drop constraint if exists uwufeed_targets_quiet_pair;
alter table uwufeed_targets
  add constraint uwufeed_targets_quiet_pair
  check ((quiet_from is null) = (quiet_to is null));

-- ---- a held delivery ----
--
-- An item that arrived inside a quiet window is deferred rather than
-- dropped. The delivery row is already the record of what happened to an
-- item, so it is the natural place to park one.

alter table uwufeed_deliveries
  drop constraint if exists uwufeed_deliveries_status_check;
alter table uwufeed_deliveries
  add constraint uwufeed_deliveries_status_check
  check (status in ('pending', 'sent', 'failed', 'skipped', 'deferred'));

create index if not exists uwufeed_deliveries_deferred_idx
  on uwufeed_deliveries (target_id)
  where status = 'deferred';

-- ---- when a source was last looked at ----
--
-- /status had to derive this from next_check_at minus the interval, which
-- works until the interval changes. Drift detection needs it outright.

alter table uwufeed_sources
  add column if not exists last_checked_at timestamptz;

create index if not exists uwufeed_sources_checked_idx
  on uwufeed_sources (last_checked_at)
  where retired_at is null;

-- ---- health ----
--
-- One row of counts, so the heartbeat is a single call rather than six.
-- Every number here means something is wrong, regardless of how busy the
-- sources are. Nothing counts "quiet", because a quiet account and a broken
-- one look identical from here and an alert that cries wolf gets muted.

create or replace function uwufeed_health()
returns table (
  lapsed_leases      bigint,
  stuck_deliveries   bigint,
  stalled_poll       bigint,
  retired_recently   bigint,
  drifting_sources   bigint,
  deferred_waiting   bigint,
  inactive_targets   bigint
)
language sql
stable
as $$
  select
    -- Push sources receiving nothing because their subscription lapsed.
    (select count(*) from uwufeed_sources
      where tier = 'push' and retired_at is null
        and (lease_expires_at is null or lease_expires_at < now())),

    -- A send that started and never finished.
    (select count(*) from uwufeed_deliveries
      where status = 'pending' and sent_at < now() - interval '1 hour'),

    -- The poller should never be an hour behind its own schedule.
    (select count(*) from uwufeed_sources
      where tier = 'poll' and retired_at is null
        and next_check_at < now() - interval '1 hour'),

    (select count(*) from uwufeed_sources
      where retired_at > now() - interval '24 hours'),

    -- Fetches keep succeeding and the newest item keeps getting older. The
    -- feed is answering 200 and lying, which nothing else catches.
    (select count(*) from uwufeed_sources s
      where s.retired_at is null
        and s.last_checked_at > now() - interval '2 hours'
        and coalesce(
              (select max(i.published_at) from uwufeed_items i where i.source_id = s.id),
              'epoch'::timestamptz
            ) < now() - interval '30 days'),

    (select count(*) from uwufeed_deliveries where status = 'deferred'),

    (select count(*) from uwufeed_targets where not active);
$$;

-- Fan out again, now carrying the delivery preferences. The dispatcher
-- needs them with the target it is already fetching, rather than a second
-- query per destination.
--
-- Dropped rather than replaced: create or replace cannot change the output
-- columns of an existing function, and this adds four.
drop function if exists uwufeed_targets_for_item(bigint);

create function uwufeed_targets_for_item(p_item_id bigint)
returns table (
  target_id   bigint,
  user_id     uuid,
  channel     text,
  target_ref  text,
  template_id bigint,
  quiet_from  time,
  quiet_to    time,
  timezone    text,
  digest      boolean
)
language sql
stable
as $$
  select distinct t.id, t.user_id, t.channel, t.target_ref, t.template_id,
         t.quiet_from, t.quiet_to, t.timezone, t.digest
  from uwufeed_items i
  join uwufeed_subscriptions s on s.source_id = i.source_id
  join uwufeed_targets t on t.user_id = s.user_id
  where i.id = p_item_id
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
    );
$$;

-- Whether it is currently quiet for a target. Split out because both the
-- release query and the dispatcher's own check need the same answer, and
-- two implementations of a window that wraps midnight would disagree.
--
-- stable rather than immutable: it reads now().
create or replace function uwufeed_in_quiet_hours(
  p_from time,
  p_to   time,
  p_tz   text default 'UTC'
)
returns boolean
language sql
stable
as $$
  select case
    when p_from is null or p_to is null then false
    -- A window that wraps midnight, 23:00 to 07:00, is two ranges.
    when p_from > p_to then
      (now() at time zone coalesce(p_tz, 'UTC'))::time >= p_from
      or (now() at time zone coalesce(p_tz, 'UTC'))::time < p_to
    else
      (now() at time zone coalesce(p_tz, 'UTC'))::time >= p_from
      and (now() at time zone coalesce(p_tz, 'UTC'))::time < p_to
  end;
$$;

-- Deferred deliveries whose target is no longer inside its quiet window.
-- The dispatcher releases these. Defined after the helper it calls, because
-- a SQL function body is validated when it is created.
create or replace function uwufeed_due_deferred(p_limit integer default 200)
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
  select d.item_id, t.id, t.channel, t.target_ref, t.template_id
  from uwufeed_deliveries d
  join uwufeed_targets t on t.id = d.target_id
  where d.status = 'deferred'
    and t.active
    and not uwufeed_in_quiet_hours(t.quiet_from, t.quiet_to, t.timezone)
  order by d.sent_at asc
  limit p_limit;
$$;
