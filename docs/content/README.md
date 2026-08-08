# docs/content

One Markdown file per documentation page. These are fetched at runtime and
rendered in the browser, so a page is live the moment the file is saved and
listed in `../js/nav.js`.

## Pages

| Section | Files |
| --- | --- |
| Getting started | `introduction.md`, `quick-start.md`, `how-it-works.md` |
| Web app | `web-overview.md`, `web-sources.md`, `web-opml.md`, `web-notifications.md`, `web-themes.md` |
| Telegram bot | `telegram-overview.md`, `telegram-commands.md`, `telegram-running.md` |
| Discord bot | `discord-overview.md`, `discord-commands.md`, `discord-running.md` |
| Workers | `workers-overview.md`, `workers-dispatcher.md`, `workers-poller.md`, `workers-streams.md` |
| Reference | `item-shape.md`, `accounts.md`, `self-hosting.md`, `faq.md` |

The roadmap is deliberately not published. It lives outside version control
as working notes, so nothing in the nav points at it. `nav.js` can load a
page from any path, including one above this directory, if that ever
changes.

## Structure of a page

One `#` heading at the top, which becomes the page title. `##` and `###`
headings build the on this page rail, so they are the outline a reader
skims rather than decoration.

## Linking

Between pages, use the hash route rather than the filename:

```markdown
[Quick start](#/quick-start)
```

The filename is an implementation detail of the loader, and the route is
what a reader can copy out of the address bar.

External links open in a new tab automatically.

## Callouts

```markdown
:::note An optional label
Body text.
:::
```

`note` for context, `warn` for something that will bite, `ok` for a
confirmation. Use `warn` sparingly. A page with four warnings has none.

## House style

- No em dashes. A comma, a semicolon or a full stop
- No emoji
- Mark what works today. Every page that describes unbuilt behaviour says
  so plainly
- Explain the trade off, not only the behaviour. Why the dispatcher would
  rather lose a notification than repeat one is more useful than the fact
  that it claims a row first
- Tables for comparisons, prose for reasoning, code blocks for anything
  meant to be pasted
