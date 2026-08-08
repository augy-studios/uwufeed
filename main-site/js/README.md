# main-site/js

ES modules, loaded as `<script type="module" src="/js/app.js">`. No
bundler, so every import is a real file the browser fetches and every path
carries its `.js` extension.

| File | Responsibility | Status |
| --- | --- | --- |
| `theme-preload.js` | Applies the saved theme before first paint | Working |
| `theme.js` | Brand swatches and mode, persisted per app key | Working |
| `icons.js` | Every icon in the app, as inline SVG | Working |
| `ui.js` | `hydrateIcons`, modal open and close, escaping, relative times | Working |
| `app.js` | Boot and wiring. The only module with side effects at import | Working |
| `api.js` | Every call to `/api`, in one place | Working |
| `feed.js` | The timeline, with cursor paging | Working |
| `sources.js` | Following, unfollowing and per source routing | Working |
| `destinations.js` | Quiet hours and digest, per destination | Working |
| `opml.js` | Parsing and building OPML | Working |
| `push.js` | Web push enrolment | Working |
| `auth.js` | Sign in, sign up, sign out, and the session hint | Working |
| `register-sw.js` | Service worker registration for pages without `app.js` | Working |

## Two script types, on purpose

`theme-preload.js` is a classic script loaded synchronously at the top of
`<head>`. Module scripts are always deferred, so a module cannot set the
theme before first paint, and the app would flash light before switching to
dark. Everything else is a module.

Both files carry the same `APP_KEY`, `uwufeed`. If one changes, the other
has to change with it, or the saved theme is read from one key and written
to another.

## localStorage keys

- `uwufeed.mode`, `light` or `dark`
- `uwufeed.colorTheme`, one of the seven swatch ids
- `uwufeed.session`, a username and display name so the shell renders
  signed in chrome on first paint

Namespaced per app so the uwu apps do not overwrite each other's choices on
a shared domain.

`uwufeed.session` never holds the session token, which is in an HttpOnly
cookie precisely so no script can read it. It is a rendering hint and
nothing else: the server decides what the user may do, on every request,
and a 401 clears it.

## Boot order

```js
initTheme();
hydrateIcons();
updateThemeButtonIcon();
buildThemeModal();
wireModals();
wireTabs();
wireSources();
wireOpml();
registerServiceWorker();
loadFeed(...);
```

Theme first, so nothing renders in the wrong colours. Icons before anything
reads them.

## Conventions

- Icons are never written inline in HTML. Markup carries
  `<span data-icon="name">` and `hydrateIcons()` fills it in.
- Anything user supplied goes through `escapeHtml` before reaching
  `innerHTML`.
- Show and hide is a single `.hidden` class flip. Timing lives in CSS, so
  reduced motion is handled in one place.
- A 501 from the API means the endpoint is not built yet, and reads
  differently in the UI from a real failure.
