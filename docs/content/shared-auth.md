# The shared auth tables

`uwu_users` and `uwu_sessions` are shared across the uwu suite. They
already exist, they predate uwuFeed, and nothing in this project creates,
alters, indexes or changes grants on them. Another app uses them too.

The authoritative copy of this page lives in `db/shared-auth.md` in the
repository. This is the readable version.

## Why the migrations start at 0003

Because 0001 and 0002 would have been those two tables. The gap is
deliberate rather than a mistake, and renumbering would be worse, since the
files may already have been applied somewhere.

If you are deploying uwuFeed standalone rather than alongside the other uwu
apps, you have to create both tables yourself before `0005` runs. Three
uwuFeed tables hold a foreign key into `uwu_users(id)`.

## The shape

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
```

## Four things that are easy to get wrong

### Email is case sensitive

`email` is plain `text` with a unique constraint, not `citext`. Postgres
accepts `Augy@example.com` and `augy@example.com` as two separate accounts.

Normalize in the application layer, lowercased and trimmed, on
registration and on login both. Doing it on only one of the two is worse
than doing it on neither, because the account becomes unreachable by the
address that created it.

Converting the column to `citext` would fix this properly, and it is not
uwuFeed's to convert.

### username is required

`username` is `not null` and unique. The uwuFeed plan never mentions it, so
it is easy to write a registration form without one and discover the
problem at the insert.

The two unique constraints are separate, so a duplicate username and a
duplicate email are different errors and deserve different messages.

### Sessions key on id, not token

The primary key is `id`. `token` is a unique column with its own index, so
lookup by token is indexed and fine.

`user_id` is **nullable**, so a session row can exist with no user
attached. Treat a null as an invalid session rather than assuming the
foreign key guarantees one.

### Expiry is not indexed

There is an index on `token` and none on `expires_at`, so a cleanup pass
that deletes expired rows is a sequential scan.

Irrelevant at current volumes. If it stops being irrelevant, adding that
index is a conversation with whoever owns these tables rather than a
migration in this repository.

## Storing the token

`token` is unbounded text, so the raw token can go to the browser while a
hash of it goes in the column. A database leak then does not hand over live
sessions, and it costs nothing at the schema level.

Whatever else uses these tables may store raw tokens instead. Check before
assuming a session created by one app is readable by another.

## Session lifetime is already per app

`expires_at` is an absolute timestamp written at creation by whichever app
created the row. uwuFeed uses 30 days. Another app using 7 or 90 days sits
in the same table and needs no coordination with this one. Nothing shared
decides how long a session lives.

## Cleanup

`/api/cron/cleanup` deletes rows whose `expires_at` has already passed. It
does not expire anything. Those sessions are dead either way, because a
correct check reads `where token = ? and expires_at > now()`, so removing a
row that already fails it logs nobody out.

The one way that stops being true is an app that treats the presence of a
row as validity and never checks `expires_at`. That is a bug in that app
rather than a constraint on this one, but it is the only thing that turns
this into a surprise logout.
