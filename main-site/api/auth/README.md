# main-site/api/auth

Custom authentication against `uwu_users` and `uwu_sessions`. Supabase
Auth is not used anywhere in this project, and adding it later would split
identity across two systems.

Both tables already exist and are shared across the uwu suite. This
repository never creates or alters them. Their exact shape, and the three
things about it that are easy to get wrong, are in
[`../../../db/shared-auth.md`](../../../db/shared-auth.md). Read that
before writing any of this.

| File | Route | Status |
| --- | --- | --- |
| [`register.js`](register.js) | `POST /api/auth/register` | Stub, Phase 4 |
| [`login.js`](login.js) | `POST /api/auth/login` | Stub, Phase 4 |
| [`logout.js`](logout.js) | `POST /api/auth/logout` | Stub, Phase 4 |

Session helpers live in [`../_lib/session.js`](../_lib/session.js), also a
stub.

## The shape it will take

- Passwords hashed with `scrypt` from `node:crypto`, so no dependency and
  no build step. Parameters and salt stored inside the `password_hash`
  string, so they can be raised later without a migration.
- The session token is random, sent to the browser, and stored as a hash in
  `uwu_sessions.token`. A database leak then does not hand over live
  sessions.
- Cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, 30 days, name
  `uwufeed_session`. Decided rather than assumed, see below.
- Register and login return the same generic error for an unknown email and
  a wrong password, so neither becomes a user enumeration oracle.
- Registration collects a **username** as well as an email. `username` is
  `not null` and unique on the existing table, so an insert without one
  fails. The plan never mentions it.
- `email` is plain `text`, not `citext`, so uniqueness is case sensitive.
  Lowercase and trim on both registration and login, or the same person
  gets two accounts and the second one is unreachable by the address that
  created it. `normalizeEmail` in `_lib/session.js` is the one place that
  should happen.
- A duplicate is a database error to catch rather than a select to run
  first. Username and email have separate unique constraints, so the two
  cases are distinguishable and deserve different messages.
- `uwu_sessions.user_id` is nullable. Treat a null as an invalid session
  rather than trusting the foreign key to guarantee a user.

## Why the token is in a cookie and not localStorage

The choice is between two risks rather than between safe and unsafe.

A token in `localStorage` is immune to CSRF by construction and works
across origins. The cost is that any script on the page can read it, so one
XSS is a full account takeover with a 30 day window.

A token in an `HttpOnly` cookie cannot be read by JavaScript at all, so an
XSS cannot exfiltrate it. The cost is CSRF exposure, which `SameSite=Lax`
covers.

uwuFeed's API is same origin with its front end, so the cross-origin
argument for localStorage does not apply, and the trade is simply the
smaller risk against the larger one. Cookie wins.

`js/api.js` already sends `credentials: "same-origin"`, so the browser
attaches it with no client code.

## Session lifetime lives in the database

`uwu_sessions.expires_at` is an absolute timestamp written when the row is
created, so uwuFeed's 30 days is uwuFeed's alone and does not constrain any
other app sharing the table.

Expiry is never managed on the client. A value in `localStorage` is
editable in devtools, and the server has to read `expires_at` to validate
the token anyway, so a client side copy is either redundant or
contradicting the authority.

`localStorage` does hold one auth related thing, under `uwufeed.session`: a
username and display name so the shell can render signed in chrome on first
paint without waiting for a round trip. It is a hint. It never contains the
token, and a 401 clears it. See `js/auth.js`.

## Why not Supabase Auth

`uwu_users` and `uwu_sessions` are shared across the uwu suite. One
identity across the apps is the point, and RLS is off the table anyway
because every server component uses the service role and no request
carries a Supabase JWT.
