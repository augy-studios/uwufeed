# main-site/api/auth

Custom authentication against `uwufeed_users` and `uwufeed_sessions`.
Supabase Auth is not used anywhere in this project.

Those tables belong to uwuFeed and are created by `db/migrations/`. They
are deliberately not the suite wide `uwu_users` and `uwu_sessions`, because
uwuFeed creates accounts from bot chats and that is not something one app
should do to a table the others read. The full reasoning is in
[`../../../db/accounts.md`](../../../db/accounts.md).

| File | Route | Status |
| --- | --- | --- |
| [`register.js`](register.js) | `POST /api/auth/register` | Working |
| [`login.js`](login.js) | `POST /api/auth/login` | Working |
| [`logout.js`](logout.js) | `POST /api/auth/logout` | Working |
| [`link.js`](link.js) | `POST /api/auth/link` | Working |
| [`password.js`](password.js) | `POST /api/auth/password` | Working |
| [`reset.js`](reset.js) | `POST /api/auth/reset` | Working |
| [`reset-confirm.js`](reset-confirm.js) | `POST /api/auth/reset-confirm` | Working |

Helpers are in [`../_lib/session.js`](../_lib/), `../_lib/password.js`,
`../_lib/linktoken.js`, `../_lib/resettoken.js` and `../_lib/notify.js`.

## Passwords

`scrypt` from `node:crypto`, so no dependency and no build step. The cost
parameters live inside the stored string:

```text
scrypt$16384$8$1$<salt base64>$<hash base64>
```

They can be raised later without a migration, because every hash carries
the parameters it was made with and old hashes keep verifying.

`verifyPassword` returns false for a null hash without special casing,
which is what a bot created account has.

## Sessions

The raw token goes to the browser in an `HttpOnly`, `Secure`,
`SameSite=Lax` cookie, valid 30 days. Only `sha256(token)` is stored, so a
database leak does not hand over live sessions.

Expiry is checked in the query rather than in JavaScript, so a clock
difference cannot extend a session.

## Why the token is in a cookie and not localStorage

The choice is between two risks rather than between safe and unsafe.

A token in `localStorage` is immune to CSRF by construction and works
across origins. The cost is that any script on the page can read it, so one
XSS is a full account takeover with a 30 day window.

A token in an `HttpOnly` cookie cannot be read by JavaScript at all, so an
XSS cannot exfiltrate it. The cost is CSRF exposure, which `SameSite=Lax`
covers.

uwuFeed's API is same origin with its front end, so the cross origin
argument does not apply and the trade is simply the smaller risk against
the larger one. `js/api.js` already sends `credentials: "same-origin"`.

`localStorage` holds one auth related thing, under `uwufeed.session`: a
username and display name so the shell renders signed in chrome on first
paint. It never contains the token, and a 401 clears it.

## Registration

Email and password are required, username is optional. All three
constraints are enforced by the database rather than by a select first,
because checking first loses the race between two simultaneous
registrations. A duplicate comes back as `409` with `email_taken` or
`username_taken`, which are distinguishable because the constraints are
separate.

`email` and `username` are `citext`, so uniqueness is case insensitive
without any normalising in application code.

## Login does not leak which accounts exist

An unknown email and a wrong password both answer `401 invalid_credentials`.
The password is verified even when no user was found, against a null hash
that never matches, so the two paths take the same work and the endpoint is
not a user enumeration oracle.

## Linking a chat

`POST /api/auth/link` issues a short lived signed token for the signed in
user, plus a `t.me` deep link that hands it to the Telegram bot in one tap.

The token is **signed, not stored**: version, user id, expiry and a
truncated HMAC, base64url encoded to 42 characters, which fits inside
Telegram's 64 character deep link payload. So there is no table to keep, no
expiry sweep, and no round trip from the bot back to the site.

The bot verifies it locally with the same `LINK_TOKEN_SECRET`. Both
implementations are tested against each other, because a change to one
without the other silently rejects every link attempt as forged.

## Changing a password

`POST /api/auth/password` takes `current_password` and `new_password`,
proves the first and writes the second. Every other session for that
account is deleted and the calling one is kept, so the tab doing it is not
signed out halfway through its own request.

An account created by a bot has a null `password_hash` and answers `409
no_password_set` rather than `403`, because "that is not your current
password" is a misleading thing to say to somebody who has never had one.

## Resetting a forgotten password

`POST /api/auth/reset` takes an email and picks a path in this order.

| Condition | What happens |
| --- | --- |
| An active Telegram target | A code goes to that chat. Nothing changes yet |
| Otherwise, an active Discord target | The same code, into that channel |
| Otherwise, an address and email configured | The same code, by email |
| None of those, and `RESET_WITHOUT_CHAT` is not `off` | The password becomes the account's username and is returned in the response |
| None of those, and `RESET_WITHOUT_CHAT=off` | `409 no_chat_connected` |

Telegram wins over Discord whenever both exist, because a Telegram target
is one person's private chat with the bot and a Discord target is a webhook
into a channel other people can read. When the code does go to Discord the
message says so.

Discord sitting above email is the ordering the product asked for, and it
is the one choice here worth revisiting. An inbox is private and a Discord
channel is not, so moving email to second would be the safer arrangement.

Registration requires an address, so configuring email closes the last two
rows for every web account. They stay reachable for accounts created by a
bot, which have no email by design.

`POST /api/auth/reset-confirm` takes the code and a new password, and signs
the account in on success. Every existing session is deleted first, since a
reset is what somebody does when they think they have lost control of the
account.

### The reset code

Signed, not stored, like the link token, and deliberately not the same
token. Two differences:

- **A different HMAC label.** A link token can never be replayed as a reset
  code, or the reverse, even though both are signed with
  `LINK_TOKEN_SECRET`. They share a secret because a second one is a second
  thing to leave unset, and an unset one takes reset down silently.
- **The current password hash is signed material.** That makes a code
  single use for nothing: the moment the password changes, the signature
  stops verifying. No table of spent codes, no sweep.

Fifteen minutes, 42 characters, `unverifiedUserId` reads the id out to know
which hash to check the signature against and is trusted for nothing else.

### Email without a sending service

`_lib/gmail.js` sends through the Google Workspace mailbox this project
already has, over the Gmail API. No Resend, no Brevo, no fourth party.

The Gmail API is the route that fits: HTTPS and JSON, the same shape as
everything else in `_lib/`. SMTP does not fit, because an SMTP client is a
dependency and these functions have none.

Auth is a service account with domain wide delegation, authorised for
exactly `https://www.googleapis.com/auth/gmail.send`. A service account has
no mailbox of its own, so it impersonates `GMAIL_SENDER` and that address
is what recipients see. The access token comes from signing a JWT with
`crypto.createSign("RSA-SHA256")` and exchanging it, and it is cached in
module scope for the container's lifetime, so a warm invocation costs one
request rather than two.

Two things the mail layer refuses rather than mangles. A recipient address
containing CR or LF is not sent at all, because folding it would leave a
plausible looking `To:` line built out of an injection attempt, and
registration only checks for an `@`. A subject folds newlines to spaces
instead, since a subject is free text and the only requirement is that it
cannot start a header line.

**Sending domain.** Prefer a dedicated alias on a subdomain to a human
mailbox. Reset mail that lands in spam costs the sending domain
reputation, and that is the same domain real correspondence comes from.

### What the no chat path costs

This is worth stating plainly rather than discovering later.

`/api/auth/reset` is unauthenticated, because a person who cannot sign in
is the entire audience for it. So on the last path, **anybody who knows an
email address can reset that account's password to its username and read it
in the response.**

Configuring email removes that path for every web account, which is the
main reason to configure it. It remains reachable for an account created by
a bot that later gained a password and lost its chat, which is a narrow
case but not an impossible one.

`RESET_WITHOUT_CHAT=off` closes it entirely, at the cost of making such an
account unrecoverable. Either way this endpoint is a user enumeration
oracle, which login carefully is not; there is no point pretending
otherwise when the successful case prints a password.

A username shorter than 8 characters cannot be a password, since
`hashPassword` refuses one. Those accounts get a generated password
instead, and the response says which of the two it was with `from_username`.
