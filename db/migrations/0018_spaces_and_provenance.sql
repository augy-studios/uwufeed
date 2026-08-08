-- The third level of the account model, and where a subscription came from.
--
--   uwuFeed account          the thing a person owns
--   └── linked service       uwufeed_identities
--       └── linked spaces    this file
--
-- A space is a guild or a group. It is shared, and it is never owned by
-- whoever linked it: it keeps its own uwufeed_users row and its own
-- sources, and a person is granted management over it rather than
-- possession of it.

create table if not exists uwufeed_spaces (
  id          bigint generated always as identity primary key,
  -- The space's own account. A guild or group is a standalone actor and
  -- keeps its sources, so it has a uwufeed_users row like anybody else.
  user_id     uuid not null references uwufeed_users(id) on delete cascade,
  platform    text not null check (platform in ('telegram', 'discord')),
  platform_id text not null,
  label       text,
  created_at  timestamptz not null default now(),

  unique (platform, platform_id)
);

create index if not exists uwufeed_spaces_user_idx on uwufeed_spaces (user_id);

-- Who may manage a space. A row here is access, never ownership: several
-- people can manage one guild, and deleting a row moves no data because
-- nothing was ever moved.
--
-- For Discord these rows are advisory. The live MANAGE_GUILD check against
-- Discord is the authority, so losing the permission removes the dashboard
-- on the next load rather than whenever somebody remembers. Telegram has no
-- equivalent live check, so there these rows are the authority and access
-- really is granted once.
create table if not exists uwufeed_space_managers (
  space_id    bigint not null references uwufeed_spaces(id) on delete cascade,
  identity_id bigint not null references uwufeed_identities(id) on delete cascade,
  created_at  timestamptz not null default now(),

  primary key (space_id, identity_id)
);

create index if not exists uwufeed_space_managers_identity_idx
  on uwufeed_space_managers (identity_id);

alter table uwufeed_spaces enable row level security;
alter table uwufeed_space_managers enable row level security;
revoke all on uwufeed_spaces from anon, authenticated;
revoke all on uwufeed_space_managers from anon, authenticated;

-- ---- provenance ----
--
-- Which surface added a row, so a merged set can still say where each part
-- came from.
--
-- origin_label is denormalised on purpose. A foreign key to the origin
-- account would be null exactly when it matters, because a merge deletes
-- that account and surviving the deletion is the entire point. The cost is
-- a label that goes stale if a group is renamed, which is cosmetic.
--
-- Both nullable, and deliberately not backfilled. An existing row genuinely
-- has unknown provenance, and writing a plausible guess in makes the
-- interface confidently wrong rather than honestly blank.

alter table uwufeed_subscriptions
  add column if not exists added_via text
    check (added_via in ('web', 'telegram', 'discord')),
  add column if not exists origin_label text;

alter table uwufeed_targets
  add column if not exists added_via text
    check (added_via in ('web', 'telegram', 'discord')),
  add column if not exists origin_label text;

-- ---- a note for whoever changes fan out next ----
--
-- Reading is scoped, delivering is not shared at all.
--
-- The timeline widens across accounts a person owns, so a private Telegram
-- chat kept separate still shows up there. Fan out must never widen the
-- same way. uwufeed_targets_for_item joins t.user_id = s.user_id, and that
-- is correct: somebody who manages a server did not ask for their phone to
-- start buzzing with it. The symmetry is tempting and wrong.

comment on table uwufeed_spaces is
  'Guilds and groups. Each keeps its own account and sources; managers get access, never ownership.';
comment on table uwufeed_space_managers is
  'Access to a space. Advisory for Discord, where live MANAGE_GUILD is the authority; authoritative for Telegram.';
