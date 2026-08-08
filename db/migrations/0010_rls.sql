-- Auth is custom, so nothing is ever read with the anon key. RLS on with no
-- policies denies anon and authenticated outright. The service role bypasses
-- RLS, and every server component uses it.
--
-- uwu_users and uwu_sessions are deliberately absent. They predate this
-- project and are shared with the other uwu apps, so changing their grants
-- from here could break an app that is not in this repository.

alter table uwufeed_sources       enable row level security;
alter table uwufeed_items         enable row level security;
alter table uwufeed_subscriptions enable row level security;
alter table uwufeed_templates     enable row level security;
alter table uwufeed_targets       enable row level security;
alter table uwufeed_deliveries    enable row level security;

revoke all on uwufeed_sources, uwufeed_items, uwufeed_subscriptions,
  uwufeed_templates, uwufeed_targets, uwufeed_deliveries
  from anon, authenticated;
