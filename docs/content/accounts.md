# Accounts

uwuFeed owns its accounts. `uwufeed_users` and `uwufeed_sessions` are
created by this repository and belong to it.

They are deliberately **not** `uwu_users` and `uwu_sessions`, the suite
wide tables. uwuFeed creates accounts from bot chats, and that is not
something one app should do to a table the others read.

The consequence is accepted and worth stating plainly: **an account from
another uwu app does not sign in here.** Two accounts, two passwords. In
exchange uwuFeed picks its own constraints and can be deployed standalone,
with nothing in `db/migrations/` touching a shared table.

## Shape

```sql
create table uwufeed_users (
  id            uuid primary key default gen_random_uuid(),
  email         citext unique,
  username      citext unique,
  password_hash text,
  display_name  text,
  avatar_url    text,
  origin        text not null default 'web'
                check (origin in ('web', 'telegram', 'discord')),
  created_at    timestamptz not null default now(),
  constraint uwufeed_users_web_needs_credentials
    check (origin <> 'web' or (email is not null and password_hash is not null))
);

create table uwufeed_sessions (
  id         uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id    uuid not null references uwufeed_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
```

## Why each column is the way it is

**`email` is `citext`.** Uniqueness is case insensitive in the database
rather than by convention in every code path. The shared table this
replaces used plain `text`, which meant normalising in application code on
registration *and* login, and normalising only one of the two makes an
account unreachable by the address that created it. That whole class of bug
is now impossible.

**`email` and `username` are nullable.** An account created from a chat has
neither. Forcing a synthetic value into a column meant for something a
person chose produces rows nobody can interpret later.

**`password_hash` is nullable.** Null means this account cannot sign in on
the web. A bot account has no password, and a placeholder that means the
same thing is a placeholder somebody eventually mistakes for a real hash.
`verifyPassword` returns false for null without special casing.

**`origin` records how the account appeared.** `web` for a registration,
`telegram` or `discord` for one created by a bot on first use. It is what
the check constraint keys off, and it is the only way to tell later why an
account has no email.

**The check constraint** stops a web registration from creating an account
that can never be signed into.

## Three ways an account appears

1. **Registration** on the site. Email, password, optional username,
   `origin = 'web'`.
2. **First `/add` in a Telegram chat.** No email, no password,
   `origin = 'telegram'`. The chat can follow feeds immediately with no
   signup, which is the plan's argument for the bot arriving before the
   PWA.
3. **A merge.** `/link` moves a chat account's subscriptions and targets
   into a web account and deletes the chat account.

## Sessions

The raw token goes to the browser in an HttpOnly cookie. Only
`sha256(token)` is stored, so a database leak does not hand over live
sessions.

The expiry is checked in the query rather than in JavaScript, so a clock
difference on the server cannot extend a session.

`expires_at` is indexed, so the nightly prune is not a sequential scan. The
shared table it replaces had no such index.

## Changing a password

From the Account tab, with the current one. Every other signed in browser
is signed out and the one making the change is kept, so the tab doing it is
not signed out halfway through.

An account created by a bot has no password to prove and says so rather
than reporting the empty one as wrong.

## Forgetting a password

There is no email in this project, so a reset has to reach somebody through
something else they already have.

| What the account has | What a reset does |
| --- | --- |
| A connected Telegram chat | A code arrives there. Nothing changes until it is used |
| Only a connected Discord channel | The same code, into that channel |
| Otherwise, an email address | The same code, by email |
| None of those | The password is set to the account's username and shown on screen |

Telegram is preferred whenever both exist, because a Telegram target is a
private chat with the bot and a Discord target is a webhook into a channel
other people can read. When a code does go to Discord, the message says so.

The code lasts fifteen minutes and works once. It is signed rather than
stored, and part of what it is signed with is the password it is replacing,
so it stops working the moment that password changes.

Email is sent through the instance's own Google Workspace mailbox rather
than a sending service, so a self hosted copy needs no third party account
for it. Configure it and the last row stops applying to web accounts, since
registration requires an address.

:::note The last row is a real trade
Asking for a reset does not require being signed in, because somebody who
can sign in does not need one. So on that last row, anybody who knows an
email address can reset that account and read the new password.

It applies only when there is nowhere to send a code, which is why
configuring email or connecting a chat closes it. A self hosted instance
can set `RESET_WITHOUT_CHAT=off` to refuse instead, which makes such an
account unrecoverable.
:::

## Merging a chat account

Copy then delete, rather than repointing `user_id`:

1. Insert the chat account's subscriptions for the web user with
   `resolution=ignore-duplicates`.
2. Do the same for its targets.
3. Delete the chat account, which cascades away whatever is left.

Repointing would trip the unique constraints on any row the destination
already had, and an ignored duplicate is the right outcome there.

## What this leaves behind

Nothing in this project reads or writes `uwu_users` or `uwu_sessions` any
more. If suite wide sign in is ever wanted, it is a new piece of work:
matching accounts on email across two tables and deciding what happens when
they disagree. That was the price of this decision and it was made
knowingly.
