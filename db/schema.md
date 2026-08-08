# The item shape

This file is the contract between the JavaScript half of the project
(Vercel functions in `main-site/api/`) and the Python half (`workers/`,
`telegram-bot/`, `discord-bot/`). Both sides produce and consume exactly
this object. Change it here first, in the same commit as the code.

Frozen. Adding an optional field is a minor change, renaming or removing
one is not.

## Shape

```jsonc
{
  "source_id":     123,          // bigint, FK to uwufeed_sources.id
  "external_id":   "dQw4w9WgXcQ", // text, stable, platform native
  "title":         "Video title",
  "url":           "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "author":        "Channel name",
  "summary":       "Plain text, no markup, trimmed",
  "thumbnail_url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  "published_at":  "2026-08-08T12:34:56Z",
  "kind":          "video"
}
```

`id` and `fetched_at` are assigned by Postgres. Producers never send them.

## Field rules

| Field | Type | Null | Rule |
| --- | --- | --- | --- |
| `source_id` | integer | no | Always set by the caller, never inferred from the payload |
| `external_id` | string | no | See below. Trimmed, max 512 chars |
| `title` | string | yes | Entities decoded, whitespace collapsed, max 500 chars |
| `url` | string | yes | Absolute `http` or `https`. Relative links are resolved against the feed URL before insert |
| `author` | string | yes | Display name, not a handle or an ID. Max 200 chars |
| `summary` | string | yes | Markup stripped to plain text, entities decoded, max 500 chars, no trailing ellipsis added |
| `thumbnail_url` | string | yes | Absolute URL. Omit rather than guess |
| `published_at` | string | yes | ISO 8601 UTC with a `Z` suffix, second precision. Null if the feed gives nothing usable, never `now()` |
| `kind` | string | no | One of the four below |

## `external_id`

This is the dedup key. `unique (source_id, external_id)` plus `on conflict
do nothing` is what stops a WebSub edit re-fire from sending twice, so it
has to be stable for the life of the item and identical whichever half of
the codebase produced it.

Resolution order, first hit wins:

1. `yt:videoId` for YouTube
2. Atom `<id>`
3. RSS `<guid>`
4. The canonical entry link, absolute

Never derive it from position in the feed. A video published late can sit
below newer entries, and a feed that reorders would re-insert everything.

## `kind`

| Value | Used for |
| --- | --- |
| `video` | YouTube uploads, PeerTube, anything with a watch page |
| `article` | Blog posts, news, plain RSS and Atom entries |
| `post` | Short form social: Bluesky, Mastodon, Reddit |
| `stream` | A live broadcast going online, Twitch EventSub |

The plan names four typed render contexts: channel, video, stream and
post. Channel is source level metadata rather than an item kind, so it is
not in this list. `article` is the item kind that fills the gap for blogs.
This is the one part of the shape the plan did not spell out.

## Writing items

Both halves insert the same way, with the conflict handled by Postgres.

JavaScript, via PostgREST:

```http
POST /rest/v1/uwufeed_items?on_conflict=source_id,external_id
Prefer: resolution=ignore-duplicates
```

Python, via the same REST endpoint or via `insert ... on conflict
(source_id, external_id) do nothing` over a direct connection.

Never check for existence first and then insert. Two workers racing on the
same feed is normal, and the read then write pattern loses that race.

## Timestamps

`published_at` comes from the feed. `fetched_at` is set by the database.
Tracking one against the other per source is the drift alarm: a source
returning 200 with content that never advances shows up as a growing gap.

## Truncation

Truncation happens at the producer, not at the database. Postgres columns
are unbounded `text` on purpose, so a long field is a formatting problem
rather than a failed insert. The limits above are what the renderers
assume.
