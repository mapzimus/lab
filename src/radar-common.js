// Shared renderer for radar dashboards. A page defines window.RADAR_CONFIG
// = { api, fallback, buildSections } before this script runs (both files
// loaded with defer, in order). buildSections(data, helpers) returns
// [source, title, subtitle, cardElements[]] tuples.
(function () {
  const config = window.RADAR_CONFIG;
  const sectionsEl = document.getElementById("radarSections");
  const emptyEl = document.getElementById("radarEmpty");
  const dateEl = document.getElementById("radarDate");
  const countsEl = document.getElementById("radarCounts");

  const fmt = new Intl.NumberFormat("en-US");
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  function card(title, url, copy, metaBits, isNew) {
    const cardEl = el("article", "radar-card");
    if (isNew) cardEl.append(el("span", "radar-new", "NEW"));
    const link = el("a", "card-link");
    link.href = url;
    link.rel = "noopener";
    link.target = "_blank";
    const h = el("h4");
    h.textContent = title;
    link.append(h);
    if (copy) link.append(el("p", "card-copy", copy));
    link.append(el("div", "card-footer", (metaBits || []).filter(Boolean).join(" · ")));
    cardEl.append(link);
    return cardEl;
  }

  async function load() {
    let data;
    for (const url of [config.api, config.fallback]) {
      if (!url) continue;
      try {
        const res = await fetch(url, { cache: "no-cache" });
        if (!res.ok) continue;
        const body = await res.json();
        if (!body.error) { data = body; break; }
      } catch { /* try the next source */ }
    }
    if (!data) {
      emptyEl.textContent = "The radar data could not be loaded. Try again in a moment.";
      dateEl.textContent = "Unavailable";
      return;
    }

    const sections = config.buildSections(data, { card, el, fmt });
    sectionsEl.textContent = "";
    let total = 0;
    for (const [source, title, subtitle, cards] of sections) {
      if (!cards.length) continue;
      total += cards.length;
      const section = el("section", "radar-section");
      section.dataset.source = source;
      section.append(el("h3", null, title), el("p", "radar-subtitle", subtitle));
      const grid = el("div", "radar-grid");
      grid.append(...cards);
      section.append(grid);
      sectionsEl.append(section);
    }
    if (!total) {
      sectionsEl.append(el("p", "empty", "Nothing on the radar yet — the first sweep hasn't landed."));
    }

    dateEl.textContent = `Swept ${data.generatedAt || "recently"}`;
    countsEl.textContent = `${total} items`;
    countsEl.hidden = false;
  }

  document.getElementById("radarFilters").addEventListener("click", (event) => {
    const button = event.target.closest(".filter");
    if (!button) return;
    for (const b of document.querySelectorAll("#radarFilters .filter")) {
      b.setAttribute("aria-pressed", String(b === button));
    }
    const source = button.dataset.source;
    for (const section of sectionsEl.querySelectorAll(".radar-section")) {
      section.hidden = source !== "all" && section.dataset.source !== source;
    }
  });

  load();
})();
