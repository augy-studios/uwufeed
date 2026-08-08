# OPML import and export

OPML is the interchange format every feed reader agrees on. It is how you
bring subscriptions in from something else, and how you take them out
again.

## Exporting

Sources panel, then Export. A file downloads named
`uwufeed-YYYY-MM-DD.opml` containing every source you follow.

That file works in any reader that accepts OPML, which is effectively all
of them. Nothing here is locked in, by design: an aggregator that makes
leaving difficult is telling you something about how it expects to compete.

## Importing

Sources panel, then Import, then pick an `.opml` or `.xml` file exported
from another reader.

Each feed in the file is resolved the same way a pasted link is, which
means the hub check runs on all of them. A large import from a polling
reader frequently ends up mostly in the push tier, because the reader that
exported it never asked.

## What is read from the file

Every `outline` element carrying an `xmlUrl` attribute. The title comes
from `title`, falling back to `text`, falling back to the URL.

Folders are read as a flat list. uwuFeed has no folders, so the structure
in the file is not preserved.

## Importing is paced

A 200 feed import is not 200 simultaneous outbound requests. They are
resolved one at a time with a short gap, which is slower for you and
considerably more polite to 200 unsuspecting web servers.

## Duplicates

Importing a feed you already follow does nothing. Sources are keyed on the
feed URL and subscriptions are unique per user, so a re-import is safe.

:::note Current state
Parsing and export both work today. Feeding imported URLs through
resolution needs accounts, which is Phase 4. Importing a file now reports
how many feeds it found and stops there.
:::
