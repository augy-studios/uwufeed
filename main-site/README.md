# main-site

The uwuFeed progressive web app and its serverless functions. Vanilla HTML,
CSS and JavaScript with no framework, no bundler and no build step.

**Vercel's root directory is set to `main-site`.** Everything in
`vercel.json` is relative to this directory, and `api/hooks/websub.js` is
served at `/api/hooks/websub` in production.

## Layout

| Path | Contains |
| --- | --- |
| `index.html` | The whole app shell. One page, three panels |
| `404.html`, `404.css` | The not found page, inherited from the template |
| `css/` | [`theme.css`](css/) then [`app.css`](css/) |
| `js/` | ES modules, one concern each |
| `UFD-*.png` | App icons, at the site root so the manifest paths stay flat |
| `images/` | Store listing screenshots |
| `api/` | Vercel serverless functions, see [`api/README.md`](api/README.md) |
| `sw.js` | Service worker: shell precache, last 50 items, web push |
| `manifest.json` | PWA manifest |
| `vercel.json` | Crons, headers, region |

## Running it

Static files need no tooling:

```sh
cd main-site
python3 -m http.server 8000
```

For the functions as well:

```sh
npm i -g vercel
cd main-site
vercel dev
```

`vercel dev` reads a `.env` file in this directory. Copy the variables you
need out of [`../.env.example`](../.env.example).

## Deploying

Vercel project settings, root directory `main-site`, framework preset
Other. No build command and no output directory: the files are served as
they are. Environment variables go in the project settings, never in the
repository.

## Rules this code follows

- Markup, styles and behaviour stay in separate files. No inline
  `<style>` and no inline `<script>` block anywhere, which is why the
  pre-paint theme script is [`js/theme-preload.js`](js/) rather than an
  inline snippet.
- Jua everywhere, set once on `*` in `theme.css`.
- Light mode is the default and `prefers-color-scheme` is never read on
  first load. Users opt into dark explicitly.
- Every icon is inline SVG from `js/icons.js`. No emoji and no icon font.
- No gradients, orbs or blobs. The page background is one flat tint from
  the active theme.
- Colours only ever come from tokens, so all 14 brand and mode
  combinations stay readable at WCAG AA.

The full specification is [`../uwuapps-theme.md`](../uwuapps-theme.md).

## What works today

Phase 1 is the push slice, so the working parts are server side:
`/api/hooks/websub`, `/api/sources/resolve`, `/api/sources/subscribe` and
`/api/sources/unsubscribe`.

The front end is a real shell rather than a mock, but the timeline, adding
sources from the browser, OPML import and notifications all depend on
accounts, which is Phase 4. Those controls are present and say what they
are waiting for rather than failing silently.

## Analytics

The template this was built from carried Google Analytics, AdSense and
Font Awesome in the head. All three are deliberately gone: the first two by
choice, and Font Awesome because an icon font is against the theme spec.
