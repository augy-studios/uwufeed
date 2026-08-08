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
3. **A merge.** `/link` in a *private* chat moves that chat account's
   subscriptions and targets into a web account and deletes the chat
   account.

## An account owns a list of linked services

```text
uwuFeed account
└── linked service      uwufeed_identities, one row per platform
    └── linked spaces   guilds and groups, per service
```

`uwufeed_identities` records who somebody is on a platform: the account,
the platform, the platform user id, and how it was verified. One row per
platform per account, and a unique index on `(platform, platform_user_id)`
so two accounts cannot both claim one Discord user and have a reset for
either DM the same person.

**Linking binds the person who ran it, never the space it ran in.** A
Discord server and a Telegram group are shared. Merging one into whichever
member linked first would hand that member everybody else's feed, and would
make a reset code something the room can read. So a group or a server keeps
its own account and its own sources, and `/link` there only records the
identity.

A private Telegram chat is the exception, because it is not a shared space,
it is the person. Linking one still merges, since both sets belong to the
same person.

## Sessions

The raw token goes to the browser in an HttpOnly cookie. Only
`sha256(token)` is stored, so a database leak does not hand over live
sessions.

The expiry is checked in the query rather than in JavaScript, so a clock
difference on the server cannot extend a session.

`expires_at` is indexed, so the nightly prune is not a sequential scan. The
shared table it replaces had no such index.

## Passwords

`POST /api/auth/password` changes one, proving the current password first.
Every other session for the account is deleted and the calling one is kept.
A bot created account has a null `password_hash` and answers
`409 no_password_set`, because telling somebody their current password is
wrong is misleading when they have never had one.

## Resetting a forgotten password

There is no email in this project, so a reset reaches somebody through a
destination they already own.

| What the account has | What `POST /api/auth/reset` does |
| --- | --- |
| A `telegram` identity | Direct messages a code. Nothing changes yet |
| A `discord` identity | The same code, by direct message |
| An `email`, with mail configured | The same code, by email |
| None, `RESET_WITHOUT_CHAT` not `off` | Sets the password to `username` and returns it |
| None, `RESET_WITHOUT_CHAT=off` | `409 no_chat_connected` |

**Every path is private to one person, and that is the point.** Recovery
reads `uwufeed_identities`, never `uwufeed_targets`. A target answers where
feed items go and can be a shared space: a Telegram group, or a Discord
webhook pointing into a channel the whole server reads. A reset code sent
to a shared space is not a reset, it is a broadcast.

The list is tried in order and falls through on failure, because a DM can
be refused for reasons only the far end knows. Telegram will not let a bot
open a conversation with somebody who has never messaged it, and Discord
returns error 50007 when the person has direct messages from server members
switched off. Neither is detectable in advance.

The code is signed rather than stored, in `_lib/resettoken.js`. It uses
`LINK_TOKEN_SECRET` with a different HMAC label, so a link token and a
reset code are never interchangeable, and it signs the account's current
`password_hash` as part of the message, which makes it single use with no
table of spent codes: changing the password invalidates the signature.

`POST /api/auth/reset-confirm` takes the code and a new password, deletes
every session, and signs the account in.

Email goes through `_lib/gmail.js`, which uses the Google Workspace mailbox
the project already has rather than a sending service. The Gmail API is
HTTPS and needs no dependency; SMTP would need an SMTP client. Auth is a
service account with domain wide delegation, scoped to `gmail.send` and
impersonating `GMAIL_SENDER`.

**The last row is an accepted risk, not an oversight.** The endpoint is
unauthenticated by necessity, so anybody who knows an email address can
take that path and read the resulting password. Configuring email removes
it for every web account, since registration requires an address. A
username shorter than eight characters cannot be a password, so those
accounts get a generated one and the response says which happened.

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
