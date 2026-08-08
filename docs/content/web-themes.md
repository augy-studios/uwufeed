# Themes

Two independent choices that combine freely: a brand colour and a mode.
Seven colours by two modes is fourteen combinations, and all fourteen are
checked for contrast.

## Changing it

The button at the top right of any page opens the theme panel. Pick a mode,
pick a colour. The choice applies immediately and the panel stays open, so
you can try a few without reopening it each time.

## The colours

| Name | Colour |
| --- | --- |
| Classic | `#ccffcc` |
| Not green 1 | `#ffcccc` |
| Not green 2 | `#ccccff` |
| Not green 3 | `#ffffcc` |
| Not green 4 | `#ffccff` |
| Not green 5 | `#ccffff` |
| Really really light green | `#ffffff` |

The last one is white. The name is a joke and the colour is not.

## Light is the default

Always, on a fresh install, whatever the operating system is set to. A
system wide dark preference is not read on first load.

That is deliberate. An app that guesses dark mode from the system and gets
it wrong is more annoying than one that starts predictably and lets you
choose. Once you choose, the choice is remembered and never overridden.

## It follows you around

The choice is stored in the browser under `uwufeed.mode` and
`uwufeed.colorTheme`, applies to every page, and survives a reload. It is
per browser rather than per account, so it is not synced across devices.

The browser's own interface tint, the address bar colour on Android, tracks
the brand colour too.

## No flash of the wrong theme

A small script runs before the stylesheet loads and sets the saved theme,
so a dark mode user never sees a white page for a frame. It is the reason
one script in this app is not a module: module scripts are always deferred,
and deferred is too late to matter.

## Design rules

For anyone working on the interface:

- No gradients, orbs or blobs. The page background is one flat tint of the
  brand colour over the mode's base
- Card surfaces use the glass primitive, and nested controls sit one level
  above the card
- No colour is ever hardcoded in component styles. Everything references a
  token, so all fourteen combinations stay correct
- Jua everywhere, set once
- Every icon is inline SVG. No emoji and no icon font
- Text on a brand tint uses the dark ink token in both modes, because the
  brand colours are pale pastels whichever mode is active
