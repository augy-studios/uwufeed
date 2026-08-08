# main-site/api/targets

A target is a place a notification goes. One row in `uwufeed_targets` per
destination, with `channel` naming the transport and `target_ref` holding
whatever that transport needs to reach it.

| File | Route | Status |
| --- | --- | --- |
| [`webpush.js`](webpush.js) | `GET, POST, DELETE /api/targets/webpush` | Working |
| [`list.js`](list.js) | `GET /api/targets/list` | Working |
| [`ntfy.js`](ntfy.js) | `POST, DELETE /api/targets/ntfy` | Stub, Phase 6 |

The other two channels do not enrol over HTTP. A Telegram target is created
by the bot when a chat subscribes, and a Discord target is created by the
bot or by pasting a webhook URL.

## What target_ref holds

| Channel | `target_ref` |
| --- | --- |
| `webpush` | The `PushSubscription` JSON, endpoint and keys |
| `ntfy` | The topic name |
| `telegram` | The chat id |
| `discord` | The webhook URL, or the channel id |

## Registration is only half of it

These endpoints enrol a target. Retiring one is mostly not their job:

- Web push targets are deactivated by the dispatcher on a `410 Gone` from
  the push service, which is the only reliable signal that a browser
  subscription is dead.
- ntfy has no subscription lifecycle at all, which is the appeal. A topic
  either receives or it does not.

## ntfy and privacy

An ntfy topic is a shared secret in the shape of a URL. A guessable topic
name is readable by anyone who guesses it, so the enrolment endpoint should
say so plainly and suggest a long random topic rather than a friendly one.
