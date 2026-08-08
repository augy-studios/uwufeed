// Service worker registration for pages that do not load app.js.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}
