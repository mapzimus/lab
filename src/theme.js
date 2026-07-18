/* Loaded without defer so the theme lands before first paint.
   The CSP blocks inline scripts, so this must stay an external file. */
(function () {
  "use strict";
  var stored = null;
  try { stored = localStorage.getItem("mapzimus-theme"); } catch (e) { /* blocked storage */ }
  var dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  apply(dark);

  function apply(isDark) {
    if (isDark) document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = isDark ? "#121721" : "#f5f1e6";
  }

  document.addEventListener("DOMContentLoaded", function () {
    var toggle = document.getElementById("themeToggle");
    if (!toggle) return;
    toggle.addEventListener("click", function () {
      var isDark = document.documentElement.dataset.theme !== "dark";
      apply(isDark);
      try { localStorage.setItem("mapzimus-theme", isDark ? "dark" : "light"); } catch (e) { /* fine */ }
    });
  });
})();
