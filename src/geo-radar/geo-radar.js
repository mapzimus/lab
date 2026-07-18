(async function () {
  const sectionsEl = document.getElementById("radarSections");
  const emptyEl = document.getElementById("radarEmpty");
  const dateEl = document.getElementById("radarDate");
  const countsEl = document.getElementById("radarCounts");

  // Live sweep first (edge-cached hourly); fall back to the committed daily baseline.
  let data;
  for (const url of ["/api/geo-radar", "/data/geo-radar.json"]) {
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
    link.append(el("div", "card-footer", metaBits.filter(Boolean).join(" · ")));
    cardEl.append(link);
    return cardEl;
  }

  const titledCard = (label) => (i) => card(i.title, i.url, i.desc || "", [label, i.org].filter(Boolean), false);
  const releaseCard = (r) => card(r.title, r.url, r.desc || "", [r.repo, r.publishedAt], r.isFresh);
  const questionCard = (q) => card(q.title, q.url, "", [`▲ ${fmt.format(q.score)}`, `${fmt.format(q.answers)} answers`], false);

  const news = data.news || { mapsmania: [], georealm: [], geoworld: [] };
  const sections = [
    ["news", "Maps Mania", "Interactive and unusual web maps, daily.", news.mapsmania.map(titledCard("Maps Mania"))],
    ["news", "Geography Realm", "GIS techniques, tooling, and geography writing.", news.georealm.map(titledCard("Geography Realm"))],
    ["news", "Geospatial World", "Industry news and analysis.", news.geoworld.map(titledCard("Geospatial World"))],
    ["tools", "QGIS — new & updated plugins", "Fresh GIS tooling from the QGIS plugin repository.", (data.qgis || []).map(titledCard("QGIS plugin"))],
    ["releases", "Library releases", "Latest releases of the geospatial stack that matters.", (data.releases || []).map(releaseCard)],
    ["data", "NASA Earthdata — recently updated", "Earth-observation collections fresh off the press.", (data.nasa || []).map(titledCard(null))],
    ["data", "Data.gov — new geodata", "Newly published datasets in the geo themes.", (data.datagov || []).map(titledCard(null))],
    ["community", "GIS Stack Exchange — hot questions", "What practitioners are wrestling with today.", (data.gisse || []).map(questionCard)],
    ["community", "OSM pulse", "Latest issues of weeklyOSM.", (data.osm || []).map((o) => card(o.title, o.url, "", ["weeklyOSM"], false))],
  ];

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
    sectionsEl.append(el("p", "empty", "Nothing on the radar yet — the first daily sweep hasn't landed."));
  }

  dateEl.textContent = `Swept ${data.generatedAt || "recently"}`;
  countsEl.textContent = `${total} items today`;
  countsEl.hidden = false;

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
})();
