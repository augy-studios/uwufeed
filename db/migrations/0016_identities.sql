-- A uwuFeed account owns a list of linked services.
--
-- One row per service per account: the Discord identity, the Telegram
-- identity. Linked guilds and groups hang off these rows rather than off
-- the account, because they belong to a service and not to a person.
--
-- This is deliberately not uwufeed_targets. A target answers where feed
-- items are delivered and can be a shared space: a Telegram group, or a
-- Discord webhook pointing into a channel the whole server reads. An
-- identity answers who somebody is on a platform. Password reset needs the
-- second question answered, because a reset code sent to a shared space is
-- not a reset, it is a broadcast.

create table if not exists uwufeed_identities (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references uwufeed_users(id) on delete cascade,
  platform         text not null check (platform in ('telegram', 'discord')),
  platform_user_id text not null,
  display_name     text,
  -- How the identity was established. A bot link proves the person held a
  -- link token; oauth proves it against the platform itself.
  verified_via     text not null default 'bot' check (verified_via in ('bot', 'oauth')),
  created_at       timestamptz not null default now(),

  -- One identity per platform per account, so linking twice updates rather
  -- than accumulating rows nobody can choose between.
  unique (user_id, platform)
);

-- The same platform account must not be claimed by two uwuFeed accounts.
-- Without this, two people could both point at one Discord user and a reset
-- for either would DM the same person.
create unique index if not exists uwufeed_identities_platform_user_idx
  on uwufeed_identities (platform, platform_user_id);

alter table uwufeed_identities enable row level security;
revoke all on uwufeed_identities from anon, authenticated;

comment on table uwufeed_identities is
  'Linked services per account. Who somebody is on a platform, not where items are delivered.';
