# tests

Verification for the parts of `main-site/api/` where being wrong is
expensive: tokens, encryption, signatures and the account recovery paths.

No dependency and no test framework. Each file is a plain ES module that
prints a line per check and exits non zero if any fail, which is the same
trade the rest of this project makes.

```sh
npm test
```

That is `tests/run.mjs`, which is the one piece of machinery here. It finds
every `*.test.mjs` in this directory, runs them one at a time because
several of them set `process.env` and replace `globalThis.fetch`, passes
their output through unchanged, and exits non zero if any check failed or
any suite died before it could report. A new file in this directory is
picked up with no wiring.

Any suite still runs perfectly well on its own, which is what to do when
only one of them is interesting:

```sh
node tests/resettoken.test.mjs
```

They are outside `main-site/` on purpose. Vercel's root directory is
`main-site`, so anything in there is deployed, and test files have no
business in a production bundle.

| File | Covers |
| --- | --- |
| `resettoken.test.mjs` | Reset codes: round trip, tampering, expiry, single use, and that a link token and a reset code cannot be swapped |
| `recovery-and-passkeys.test.mjs` | Recovery code encryption and matching, plus every WebAuthn check: challenges, client data, authenticator data, signatures against real ES256, Ed25519 and RS256 keys, and the clone counter |
| `auth-handlers.test.mjs` | `reset`, `reset-confirm` and `password` against a fake PostgREST, a fake Telegram and a fake Discord |
| `gmail.test.mjs` | The Gmail API path: the JWT assertion, token caching, header injection, and the reset email branch |

## How they fake things

`globalThis.fetch` is replaced with a function that routes on hostname. A
PostgREST request reads and writes plain arrays held in memory; Telegram,
Discord and Google record what they were sent. Handlers are invoked
directly with a `req` and a `res` shaped like the ones Vercel passes, which
is enough because these handlers only ever use `method`, `url`, `headers`,
`body`, `status`, `setHeader` and `send`.

The fake PostgREST understands only the filter forms these handlers
actually use: `eq`, `neq`, `is.true` and `in`. That is deliberate. A fuller
imitation would be a second implementation to keep correct, and the point
is to test the handlers rather than to write a database.

## What they do not cover

Anything that has to leave the machine. No real Telegram, Discord, Google
or Discord OAuth call has ever run. The signature and encryption work is
tested against real keys generated in the test, so the cryptography is
genuinely exercised; the network is not.

`docs/next-steps.md` keeps the running list of what that leaves untested.
