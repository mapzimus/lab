// Hover and keyboard-focus tooltips for the drive-time chart. The values are also
// in the direct labels, the table, and each bar's aria-label, so the tooltip only
// adds convenience. Text goes in with textContent, never innerHTML.
(function () {
  "use strict";
  var figure = document.getElementById("drive-time");
  if (!figure) return;
  var tip = figure.querySelector(".chart-tip");
  var bars = figure.querySelectorAll(".chart-svg .bar");

  function show(bar, clientX, clientY) {
    var box = figure.getBoundingClientRect();
    var strong = document.createElement("strong");
    strong.textContent = bar.getAttribute("data-tip");
    var label = document.createElement("span");
    label.textContent = bar.getAttribute("data-label");
    tip.replaceChildren(strong, label);
    tip.hidden = false;
    var x = clientX - box.left + 14;
    var y = clientY - box.top + 14;
    var maxX = figure.clientWidth - tip.offsetWidth - 8;
    tip.style.left = Math.max(8, Math.min(x, maxX)) + "px";
    tip.style.top = y + "px";
  }

  function hide() { tip.hidden = true; }

  bars.forEach(function (bar) {
    bar.addEventListener("pointermove", function (event) { show(bar, event.clientX, event.clientY); });
    bar.addEventListener("pointerleave", hide);
    bar.addEventListener("focus", function () {
      var r = bar.getBoundingClientRect();
      show(bar, r.left + r.width * 0.35, r.top + r.height * 0.6);
    });
    bar.addEventListener("blur", hide);
  });
})();
