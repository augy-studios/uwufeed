# The shared auth tables

`uwu_users` and `uwu_sessions` are shared across the uwu suite. They
already exist, they predate this project, and **nothing in this repository
creates, alters, indexes or changes grants on them.** Another app is using
them, and that app is not in this repository.

This file records their shape so Phase 4 builds against what is actually
there rather than against an assumption. It is reference, not a migration.

## As they exist today

```sql
create table public.uwu_users (
  id            uuid not null default gen_random_uuid(),
  username      text not null,
  email         text not null,
  password_hash text not null,
  created_at    timestamptz null default now(),
  display_name  text null,
  avatar_url    text null,
  constraint uwu_users_pkey primary key (id),
  constraint uwu_users_email_key unique (email),
  constraint uwu_users_username_key unique (username)
);

create table public.uwu_sessions (
  id         uuid not null default gen_random_uuid(),
  token      text not null,
  user_id    uuid null,
  expires_at timestamptz not null,
  created_at timestamptz null default now(),
  constraint uwu_sessions_pkey primary key (id),
  constraint uwu_sessions_token_key unique (token),
  constraint uwu_sessions_user_id_fkey
    foreign key (user_id) references uwu_users (id) on delete cascade
);

create index if not exists uwu_sessions_token_idx on public.uwu_sessions (token);
```

## What this means for uwuFeed

### Foreign keys

`id` is `uuid`, which is what `uwufeed_subscriptions.user_id`,
`uwufeed_targets.user_id` and `uwufeed_templates.user_id` declare. Nothing
to change.

### Email is case sensitive

`email` is plain `text` with a unique constraint, not `citext`. Postgres
will happily accept `Augy@example.com` and `augy@example.com` as two
separate accounts.

**Normalize in the application layer.** Lowercase and trim the address
before inserting it and before looking it up, on registration and on login
both. Doing it on only one of the two is worse than doing it on neither,
because the account becomes unreachable by the address that created it.

Changing the column to `citext` would fix this properly and is not ours to
do. It is a shared table.

### username is required

`username` is `not null` and unique, and uwuFeed's own plan never mentions
it. Registration has to collect one, or the insert fails.

Both unique constraints are separate, so a duplicate username and a
duplicate email are two different errors and should produce two different
messages.

### display_name and avatar_url exist

Both nullable, both unused by uwuFeed so far. They are there if the
timeline ever wants to show who a shared subscription belongs to. Do not
repurpose them for anything uwuFeed specific: another app owns them too.

### Sessions key on id, not token

The primary key is `id`. `token` is a unique column with its own index, so
looking a session up by token is indexed and fine.

`user_id` is **nullable**, so a session row can exist with no user
attached. Treat a null `user_id` as an invalid session rather than assuming
the foreign key guarantees one.

### Store a hash, not the token

`token` is `text` with no length constraint, so the raw token can go to the
browser while a hash of it goes in the column. A database leak then does
not hand over live sessions. This is a choice uwuFeed makes in code and
costs nothing at the schema level.

Note that whatever else uses these tables may store raw tokens. Check
before assuming a shared session works across apps.

### Expiry is not indexed

There is an index on `token` but none on `expires_at`. A cleanup pass that
deletes expired rows does a sequential scan.

At current volumes that is irrelevant. If it stops being irrelevant, adding
that index is a conversation with whoever owns these tables, not a
migration in this repository.

## Session lifetime is already per app

`expires_at` is an absolute timestamp written at creation by whichever app
created the row. uwuFeed uses 30 days, from `SESSION_TTL_DAYS` in
`_lib/session.js`. Another app using 7 or 90 days sits in the same table
and needs no coordination with this one.

Nothing shared decides how long a session lives, so there is nothing to
negotiate here.

## Cleanup

`main-site/api/cron/cleanup.js` deletes rows whose `expires_at` has already
passed. It does not expire anything: those sessions are dead either way,
because a correct check reads
`where token = ? and expires_at > now()`. Removing a row that already fails
that check logs nobody out. It is garbage collection.

The one way that stops being true is an app that treats the presence of a
row as validity and never checks `expires_at`. That would be a bug in that
app rather than a constraint on this one, but it is the only thing that
would turn this into a surprise logout, so it is worth one look at whatever
else reads the table.

Running the same delete from several apps is redundant rather than harmful,
since it is idempotent. One owner is tidier.
