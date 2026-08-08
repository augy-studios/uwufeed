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

Helpers are in [`../_lib/session.js`](../_lib/), `../_lib/password.js` and
`../_lib/linktoken.js`.

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
