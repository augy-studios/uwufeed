# main-site/images

Screenshots referenced by `manifest.json`. They are what an install prompt
and a store listing show, and nothing in the app loads them at runtime.

| File | Size | `form_factor` |
| --- | --- | --- |
| `screenshot_1.png` | 1080x2340 | `narrow` |
| `screenshot_2.png` | 1920x988 | `wide` |

The app icons are not here. They sit at the site root as `UFD-*.png`, so
the manifest paths stay flat.

Both screenshots are placeholders from the Augy Studios PWA template and
still show the template rather than uwuFeed. Replace them once there is a
real interface to photograph.

The declared sizes have to match the files exactly. A mismatch makes
Chrome drop the screenshot from the install prompt without a warning, so
measure the file rather than assuming the size you exported at. The
template shipped `screenshot_2.png` declared as 1920x1080 when the file has
always been 1920x988, which is exactly this failure.
