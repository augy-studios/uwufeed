# The item shape

One object, produced identically by the JavaScript and the Python halves of
the project. It is the contract between them, frozen in Phase 0.

The authoritative copy lives in `db/schema.md` in the repository. This page
is the readable version.

## The object

```json
{
  "source_id": 123,
  "external_id": "dQw4w9WgXcQ",
  "title": "Video title",
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "author": "Channel name",
  "summary": "Plain text, no markup, trimmed",
  "thumbnail_url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  "published_at": "2026-08-08T12:34:56Z",
  "kind": "video"
}
```

`id` and `fetched_at` are assigned by the database. Producers never send
them.

## Field rules

| Field | Null | Rule |
| --- | --- | --- |
| `source_id` | no | Set by the caller, never inferred from the payload |
| `external_id` | no | Stable and platform native, max 512 characters |
| `title` | yes | Entities decoded, whitespace collapsed, max 500 |
| `url` | yes | Absolute. Relative links are resolved against the feed URL |
| `author` | yes | Display name, not a handle, max 200 |
| `summary` | yes | Markup stripped, entities decoded, max 500 |
| `thumbnail_url` | yes | Absolute. Omitted rather than guessed |
| `published_at` | yes | ISO 8601 UTC with a Z suffix. Null rather than now |
| `kind` | no | One of the four below |

## external_id is the dedup key

`unique (source_id, external_id)` with the conflict handled by the database
is what stops a hub re-firing on an edit from sending the same video twice.
So it has to be stable for the life of the item and identical whichever
half of the codebase produced it.

Resolution order, first hit wins:

1. `yt:videoId` for YouTube
2. Atom `<id>`
3. RSS `<guid>`
4. The canonical entry link, absolute

:::warn Never use position in the feed
A video published late sits below newer entries, and a feed that reorders
would re-insert everything in it. Position is not identity.
:::

## kind

| Value | Used for |
| --- | --- |
| `video` | YouTube uploads, PeerTube, anything with a watch page |
| `article` | Blog posts, news, plain RSS and Atom entries |
| `post` | Short form social: Bluesky, Mastodon, Reddit |
| `stream` | A live broadcast going online |

The plan names four typed render contexts: channel, video, stream and post.
Channel is source level metadata rather than an item kind, so it is not in
this list, and `article` fills the gap for blogs.

## Timestamps

`published_at` comes from the feed, and is null when the feed gives nothing
usable. It is never quietly set to the current time, because that destroys
the one signal that catches a stale source.

`fetched_at` is set by the database. Tracking one against the other per
source is the drift alarm: a feed that answers normally while its newest
item keeps getting older shows up as a growing gap, and nothing else
catches that.

## Writing items

Both halves insert the same way, with the conflict handled by Postgres.

```http
POST /rest/v1/uwufeed_items?on_conflict=source_id,external_id
Prefer: resolution=ignore-duplicates
```

Never check for existence and then insert. Two workers racing on the same
feed is normal, and read then write loses that race.

## Truncation

Truncation happens at the producer, not in the database. The columns are
unbounded text on purpose, so an over long field is a formatting problem
rather than a failed insert. The limits above are what the renderers
assume.
