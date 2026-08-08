# docs

The uwuFeed documentation site. A progressive web app in its own right:
vanilla HTML, CSS and JavaScript, no framework, no bundler and no build
step, laid out in the same shape as GitBook.

It documents the web app, the Telegram bot, the Discord bot and the
workers.

## Layout

| Path | Contains |
| --- | --- |
| `index.html` | The shell. Topbar, sidebar, content column, on this page rail |
| `css/theme.css` | The shared theme system, copied from `uwuapps-theme.md` |
| `css/docs.css` | Documentation layout |
| `js/` | Router, Markdown renderer, search, theme |
| `content/` | Every page, as Markdown |
| `next-steps.md` | What Phase 2 needs. A deliverable, and also a page in the site |
| `UFD-*.png` | App icons, shared with the main site |
| `sw.js` | Shell precache plus every page, so the docs work offline |
| `vercel.json` | Headers and region |

The artwork is duplicated here rather than referenced across, because this
is a separate Vercel project with its own origin. When the icons change,
both copies change, and `sw.js` needs its cache version bumped or the old
icon stays cached.

## How it works

The shell is one HTML page. Pages are Markdown files fetched at runtime and
rendered by `js/markdown.js`, routed by hash, for example `#/quick-start`.

That keeps the whole thing static with no build step, which is the
constraint the rest of the project works under too. Writing documentation
is adding a Markdown file and one line in `js/nav.js`.

## Running it

```sh
cd docs
python3 -m http.server 8000
```

It has to be served over HTTP rather than opened as a file. Module scripts
and `fetch` both refuse to work from `file://`.

## Deploying

A **separate** Vercel project from the app, with the root directory set to
`docs`. No build command and no output directory.

It has no API, no environment variables and no secrets. It is static files
and nothing else.

| Site | Domain | Vercel root directory |
| --- | --- | --- |
| App | `feed.uwuapps.org` | `main-site` |
| Docs | `docs.feed.uwuapps.org` | `docs` |

Separate origins, so the two do not share a service worker, a cache or
localStorage. That is why the artwork is duplicated rather than referenced
across.

## Adding a page

1. Write `content/your-page.md`.
2. Add it to the right section in `js/nav.js`, with an id, a title and the
   file path.
3. Add the path to `CONTENT` in `sw.js` and bump the cache version.

The nav is the single source of truth: the sidebar, the router, the search
index, the previous and next links all read from it. A page missing from
`sw.js` still works online and is simply absent offline.

## Markdown supported

Headings, paragraphs, lists, tables, fenced code, inline code, blockquotes,
horizontal rules, links, images, bold and italic.

Plus callouts, which are the one non standard piece:

```markdown
:::note An optional label
Body text here.
:::
```

`note`, `warn` and `ok`. They render with an icon and a tinted background
using the status tokens.

Content is escaped before any markup is added, so a page can never inject
HTML.

## Search

Every page is fetched once on first use and searched in memory. The whole
corpus is a few dozen kilobytes, which is smaller than the index format
that would avoid loading it.

Press `/` anywhere to focus the search box.

## Offline

The shell and every page are precached, so once the site has been opened it
works with no connection. Markdown is served stale while revalidate, so an
edit appears on the next visit rather than the current one.

## House style

- No em dashes anywhere. A comma, a semicolon or a full stop instead
- No emoji. Icons are inline SVG from `js/icons.js`
- Mark what works today. A page describing an unbuilt feature as though it
  exists is worse than no page
- Say why, not just what. The interesting parts of this system are the
  trade offs, and a reference that only lists behaviour loses all of them
- Short paragraphs, tables where there is a comparison to make
