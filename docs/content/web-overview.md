# The web app

A progressive web app: plain HTML, CSS and JavaScript, no framework and no
build step. It installs to a home screen, works offline for what you have
already read, and can send notifications through the browser.

## Layout

Three panels behind one row of tabs.

| Panel | What it holds |
| --- | --- |
| Feed | Your timeline, newest first |
| Sources | Adding sources, and OPML import and export |
| Account | Sign in, notifications, per source settings |

## Installing it

Open the site and use the browser's install option. On Android it appears
as a prompt or under the browser menu. On iOS it is Share, then Add to Home
Screen. On desktop Chrome and Edge show an install icon in the address bar.

Once installed it opens in its own window with no browser chrome, and the
service worker means the shell loads instantly whether or not you have a
connection.

## Offline

Deliberately limited:

- The app shell is precached, so it always opens
- The most recent 50 items are kept, so the timeline is not empty
- Opening an item still needs a connection, since the article lives on the
  publisher's site

There is no offline outbox and no background sync. Actions you take offline
are not queued for later. That is a choice rather than an omission: an
outbox that silently replays a stale action a day later causes more
confusion than it saves.

## Accessibility

- Every text pair meets WCAG AA, 4.5:1 for body text and 3:1 for large
  text and interface boundaries, across all 14 theme combinations
- Every icon is inline SVG with an accessible label on its control, never
  an emoji standing in for one
- Anything that opens, closes or switches state animates in 150 to 220
  milliseconds, and respects a reduced motion preference
- The whole interface works from the keyboard

## What works today

All of it: accounts, the timeline with paging, following and unfollowing
sources, per source routing, OPML import and export, and web push.


