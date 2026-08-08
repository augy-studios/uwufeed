# main-site/api/_lib

Shared modules for the functions. Vercel does not route paths beginning
with an underscore, so nothing here is reachable over HTTP.

| File | What it does |
| --- | --- |
| [`db.js`](db.js) | PostgREST client over `fetch`. `select`, `insert`, `insertIgnoreDuplicates`, `upsert`, `update`, `rpc` |
| [`http.js`](http.js) | Response helpers, raw body reading, the admin guard, the user agent string |
| [`normalize.js`](normalize.js) | Feed XML in, the item shape from `db/schema.md` out |
| [`discover.js`](discover.js) | URL in, feed URL and hub out. Autodiscovery, Link headers, the YouTube special case |
| [`websub.js`](websub.js) | Callback URLs, signature verification, hub subscription requests |
| [`alert.js`](alert.js) | Operational alerts to the Discord webhook. Swallows its own failures |
| [`session.js`](session.js) | Stub, Phase 4. Custom sessions against `uwu_sessions` |

## normalize.js

A tolerant scanner rather than a real XML parser. That is deliberate: no
dependencies, and feed XML in the wild is frequently not well formed, so a
strict parser fails on documents a scanner handles fine.

It knows Atom `<entry>` and RSS `<item>`, unwraps CDATA, decodes the common
entities, resolves relative links against the feed URL, and strips markup
out of summaries. The output matches [`../../../db/schema.md`](../../../db/schema.md)
field for field, and the Python side in `workers/poller/normalize.py`
produces the same object from the same input.

Known limits, all acceptable for feed XML and worth knowing before reusing
it for anything else:

- Namespace prefixes are matched literally, so `yt:videoId` works and an
  unusual prefix for the same namespace does not.
- A tag name appearing inside a comment or a CDATA block can be picked up.
- JSON Feed is not handled. It is autodiscovered but not parsed yet.

## discover.js

`resolveFeed(url)` fetches the URL once. If what comes back is a feed, that
is the answer and the hub is read from it. If it is HTML, one more fetch
follows the autodiscovery link, because a hub is advertised inside the feed
rather than on the page for most platforms. Two fetches at most, and the
count comes back in the response so it is visible.

The hub is looked for in four places: `<link rel="hub">` in the feed, the
feed's HTTP `Link` header, `<link rel="hub">` in the page, and the page's
`Link` header.

## websub.js

The callback URL carries `source_id` plus `t`, an HMAC of the source id
under `WEBSUB_CALLBACK_SECRET`. Without it the receiver would accept any
source id anyone cared to guess.

Signature verification accepts `sha1`, `sha256`, `sha384` and `sha512`.
YouTube's hub still signs with sha1, which is why sha1 is in the list.
Comparison is constant time.
