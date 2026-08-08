# docs/css

Two files, loaded in this order. `docs.css` uses tokens that `theme.css`
defines.

| File | Contains |
| --- | --- |
| `theme.css` | The shared theme system, copied from `uwuapps-theme.md` |
| `docs.css` | Documentation layout only |

## theme.css

A byte for byte copy of the same file in `main-site/css/`. Seven brand
colours by two modes, fourteen combinations, all meeting WCAG AA.

Do not edit it here. A change that belongs to every uwu app goes in
`uwuapps-theme.md` first and is copied into both sites. A change that
belongs to the docs goes in `docs.css`.

## docs.css

The GitBook shaped layout: a sticky topbar with search, a left sidebar of
sections, a content column and a right rail of headings for the current
page.

Three breakpoints rather than the usual one, because a three column layout
has more to say than an app shell:

| Width | Layout |
| --- | --- |
| Above 1100px | Sidebar, content, on this page |
| 860 to 1100px | Sidebar and content, rail hidden |
| Below 860px | Content only, sidebar slides in over a scrim |

## Colours

Every colour is a token. The one hardcoded value is `#34c759` on the footer
heart, which the theme spec allows as a fixed meaning accent: a heart has
to read as a heart whichever swatch is active.

Callouts use the status tokens with the standard treatment, a 14 percent
tint of the colour behind the colour itself, which is tuned to hold 4.5:1.

## Prose is selectable

The base theme sets `user-select: none` on everything, which is right for
an app and wrong for documentation. Code blocks re-enable selection so a
command can be copied.
