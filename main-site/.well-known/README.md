# main-site/.well-known

Files served from `/.well-known/`, inherited from the Augy Studios PWA
template.

`assetlinks.json` is Android's Digital Asset Links file. It states which
app package is allowed to claim links on this domain, which is what makes a
Trusted Web Activity open in the app rather than the browser.

It still carries the template's package name and signing fingerprint. If
uwuFeed is ever packaged for Android, replace both. If it is not, the file
is harmless: it is only read when an Android app claims this domain.

Vercel serves this directory as static files with no configuration, and
`cleanUrls` does not strip the `.json` extension for it.
