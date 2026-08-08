// Applies the saved theme before first paint, so there is no flash.
// Loaded synchronously in <head>, ahead of the stylesheet. Keep APP_KEY in
// sync with theme.js.
(function () {
  var k = "uwufeed";
  var m = localStorage.getItem(k + ".mode") || "light";
  var c = localStorage.getItem(k + ".colorTheme") || "classic";
  document.documentElement.setAttribute("data-mode", m);
  document.documentElement.setAttribute("data-color-theme", c);
})();
