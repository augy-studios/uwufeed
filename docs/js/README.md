# docs/js

ES modules, loaded as `<script type="module" src="/js/app.js">`. No
bundler, so every import is a real file with its `.js` extension.

| File | Responsibility |
| --- | --- |
| `nav.js` | The table of contents. The single source of truth for pages |
| `markdown.js` | Markdown to HTML, plus a plain text form for search |
| `search.js` | Fetches every page once, searches it in memory |
| `app.js` | Router, sidebar, on this page rail, theme wiring |
| `theme.js` | Brand swatches and mode, shared with the main site |
| `theme-preload.js` | Applies the saved theme before first paint |
| `icons.js` | Every icon, as inline SVG |
| `ui.js` | `hydrateIcons`, modal open and close, escaping |

## nav.js is the source of truth

The sidebar, the router, the search index, the previous and next links and
the page titles all read from `SECTIONS`. Adding a page means adding one
entry there and one path in `sw.js`.

## markdown.js

Small on purpose. No build step means no bundler, and no bundler means no
Markdown library, so it covers what the docs use rather than the whole
CommonMark specification.

Everything is escaped before any markup is added, so content can never
inject HTML. Inline code is lifted out first and put back last, so nothing
inside a span of code is treated as markup.

Supported: headings, paragraphs, lists including wrapped continuation
lines, tables, fenced code, inline code, blockquotes, horizontal rules,
links, images, bold, italic, and `:::note`, `:::warn` and `:::ok` callouts.

Not supported: nested lists, reference style links, footnotes, HTML
passthrough. If a page needs one of those, the page is probably better
rewritten than the renderer extended.

## Routing

Hash based, `#/page-id`. An in page anchor is left to the browser: the
router ignores any hash that does not begin with `#/`, so clicking a
heading link scrolls rather than reloading.

Hash routing rather than the History API because this is static hosting
with no rewrite rules, and a hash never reaches the server.

## Search

The whole corpus is fetched on first focus of the search box and kept in
memory. It is a few dozen kilobytes, which is smaller than a prebuilt index
would be, and it needs no build step to produce.

Scoring is deliberately crude: a title match is worth ten, a section match
four, and each body occurrence one up to five.

## Two script types

`theme-preload.js` is a classic script loaded synchronously in `<head>`.
Module scripts are always deferred, and deferred is too late to set the
theme before first paint. Everything else is a module.

Both carry the same `APP_KEY`, `uwufeed`. If one changes, so does the
other, or the theme is read from one key and written to another.
