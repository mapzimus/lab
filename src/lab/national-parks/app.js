"use strict";

/* National Park Explorer — every NPS boundary, drawn client-side.
 *
 * Two GeoJSON layers do the work: the 63 national parks load with the page, the
 * other 374 units only when someone asks for them. Everything else — search,
 * filters, sorting, the three colour modes — is a filter expression on a source
 * already in the browser, so nothing round-trips to a server. */

const REGIONS = {
  AKR: { label: "Alaska", color: "#7fd4ff" },
  PWR: { label: "Pacific West", color: "#ffd166" },
  IMR: { label: "Intermountain", color: "#ff8c5a" },
  MWR: { label: "Midwest", color: "#9ae66e" },
  NER: { label: "Northeast", color: "#c9a0ff" },
  SER: { label: "Southeast", color: "#4fd8c4" },
};

// Round, readable breaks rather than quantiles: a reader can hold "under a
// quarter million" in their head, and the classes still come out 13/19/10/10/11.
const VISIT_BREAKS = [250_000, 750_000, 1_500_000, 3_000_000];
const VISIT_COLORS = ["#1f4b5f", "#2c8595", "#4fbb96", "#b4d75d", "#ffd23f"];
const VISIT_LABELS = ["< 250k", "250k–750k", "750k–1.5M", "1.5M–3M", "3M+"];

// Breaks with a reason: the Park Service was founded in 1916, and ANILCA in
// 1980 created or enlarged more national park acreage than any act before or since.
const ERA_BREAKS = [1916, 1940, 1980];
const ERA_COLORS = ["#f0ecdf", "#e0a86a", "#c96f5a", "#7b6bd6"];
const ERA_LABELS = ["before 1916", "1916–39", "1940–79", "1980–"];

// Each view is the set of parks it should frame, not a hand-tuned centre and
// zoom: fitBounds over the real boundaries stays correct at any window size and
// cannot drift out of date if a park moves between regions.
const VIEWS = {
  conus: (p) => !["AKR"].includes(p.region) && !["HI", "AS", "VI", "SAMOA"].includes(p.states[0]),
  alaska: (p) => p.region === "AKR",
  hawaii: (p) => p.states.includes("HI"),
  // Two buttons, not one "Territories": Samoa and the Virgin Islands are 106°
  // of longitude apart, so a view holding both is mostly empty Pacific with the
  // two parks it names too small to see.
  virgin: (p) => p.code === "VIIS",
  samoa: (p) => p.code === "NPSA",
};

const SQKM_PER_ACRE = 0.00404685642;

const state = {
  query: "",
  sort: "name",
  mode: "region",
  regions: new Set(Object.keys(REGIONS)),
  selected: null,
  hovered: null,
  unitsOn: false,
  unitsLoaded: false,
  ready: false,
  labels: true,
};

let index = null; // parks.json
let parksByCode = new Map();
let map = null;
let layered = false;
let unitPopup = null;

const el = {
  search: document.getElementById("search"),
  sort: document.getElementById("sort"),
  regionChips: document.getElementById("regionChips"),
  modeButtons: [...document.querySelectorAll(".mode")],
  viewButtons: [...document.querySelectorAll(".view")],
  readout: document.getElementById("readout"),
  legend: document.getElementById("legend"),
  list: document.getElementById("parkList"),
  detail: document.getElementById("detail"),
  unitsToggle: document.getElementById("unitsToggle"),
  status: document.getElementById("status"),
};

const setStatus = (message) => { el.status.textContent = message ?? ""; };

/* ------------------------------------------------------------------ format */

const nf = new Intl.NumberFormat("en-US");

const compact = (n) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  : n >= 1_000 ? `${Math.round(n / 1_000)}k`
  : nf.format(n);

/** Acres for anything small enough that square miles would read as zero. */
function areaLabel(acres) {
  if (acres < 640) return `${acres < 10 ? acres.toFixed(2) : nf.format(Math.round(acres))} acres`;
  return `${nf.format(Math.round(acres / 640))} sq mi`;
}

const dateLabel = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
  });
};

const classIndex = (value, breaks) => {
  const i = breaks.findIndex((b) => value < b);
  return i < 0 ? breaks.length : i;
};

/** The colour a park takes under the current mode — used by map and list alike. */
function colorFor(park) {
  if (state.mode === "visits") return VISIT_COLORS[classIndex(park.visitors, VISIT_BREAKS)];
  if (state.mode === "established") return ERA_COLORS[classIndex(Number(park.established.slice(0, 4)), ERA_BREAKS)];
  return REGIONS[park.region]?.color ?? "#8d8d8d";
}

/* -------------------------------------------------------------- filtering */

function visibleParks() {
  const q = state.query.trim().toLowerCase();
  const list = index.parks.filter((p) => {
    if (!state.regions.has(p.region)) return false;
    if (!q) return true;
    const codeHit = p.code.toLowerCase() === q || p.states.some((s) => s.toLowerCase() === q);
    // Two letters is a state or unit code, never a substring: matching "UT"
    // inside a location field hands you South Dakota and South Carolina.
    if (q.length <= 2) return codeHit;
    return codeHit || p.name.toLowerCase().includes(q) || p.location.toLowerCase().includes(q);
  });
  const by = {
    name: (a, b) => a.short.localeCompare(b.short),
    visitors: (a, b) => b.visitors - a.visitors,
    area: (a, b) => b.sqkm - a.sqkm,
    established: (a, b) => a.established.localeCompare(b.established),
    newest: (a, b) => b.established.localeCompare(a.established),
  }[state.sort];
  return list.sort(by);
}

/* ------------------------------------------------------------------ panel */

function renderReadout(parks) {
  const acres = parks.reduce((n, p) => n + p.acres, 0);
  const visits = parks.reduce((n, p) => n + p.visitors, 0);
  el.readout.innerHTML = `
    <div><dt>Parks</dt><dd>${parks.length}</dd></div>
    <div><dt>Federal acres</dt><dd>${compact(Math.round(acres))}</dd></div>
    <div><dt>Visits ${index.meta.visitorYear}</dt><dd>${compact(visits)}</dd></div>`;
}

function renderLegend() {
  // In region mode the filter chips carry the same six swatches, so a second
  // copy of them under the readout is noise.
  if (state.mode === "region") {
    el.legend.hidden = true;
    el.legend.innerHTML = "";
    return;
  }
  const keys =
    state.mode === "visits"
      ? VISIT_COLORS.map((c, i) => [c, VISIT_LABELS[i]])
      : ERA_COLORS.map((c, i) => [c, ERA_LABELS[i]]);
  el.legend.hidden = false;
  el.legend.innerHTML = keys
    .map(([color, label]) => `<span class="key"><i style="background:${color}"></i>${escapeHtml(label)}</span>`)
    .join("");
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function renderList(parks) {
  if (!parks.length) {
    el.list.innerHTML = `<li class="empty">No park matches that. Try a state code — <code>UT</code>, <code>AK</code> — or clear the search.</li>`;
    return;
  }
  el.list.innerHTML = parks
    .map((p) => {
      const meta =
        state.sort === "visitors" ? `${nf.format(p.visitors)} visits · ${index.meta.visitorYear}`
        : state.sort === "area" ? `${areaLabel(p.acres)} · ${p.states.join(", ")}`
        : state.sort === "established" || state.sort === "newest" ? `${p.established.slice(0, 4)} · ${p.states.join(", ")}`
        : `${p.states.join(", ")} · ${compact(p.visitors)} visits`;
      return `<li data-code="${p.code}"${state.selected === p.code ? ' class="selected"' : ""}>
        <button type="button" data-code="${p.code}">
          <span class="park-name"><i class="park-dot" style="background:${colorFor(p)}"></i>${escapeHtml(p.short)}</span>
          <span class="park-meta">${escapeHtml(meta)}</span>
        </button></li>`;
    })
    .join("");
}

function renderDetail(code) {
  const p = parksByCode.get(code);
  if (!p) return;
  const boundaryAcres = p.sqkm / SQKM_PER_ACRE;
  const rank = [...index.parks].sort((a, b) => b.visitors - a.visitors).findIndex((x) => x.code === code) + 1;
  el.detail.innerHTML = `
    <button type="button" class="back-to-list">← all parks</button>
    <h3>${escapeHtml(p.name)}</h3>
    <p class="where">${escapeHtml(p.location)} · ${escapeHtml(REGIONS[p.region]?.label ?? p.region)} region · <code>${escapeHtml(p.code)}</code></p>
    <dl class="facts">
      <div><dt>Established</dt><dd>${escapeHtml(dateLabel(p.established))}</dd></div>
      <div><dt>Visits ${index.meta.visitorYear}</dt><dd>${nf.format(p.visitors)}<small>${rank}${ordinal(rank)} of 63</small></dd></div>
      <div><dt>Federal acres ${index.meta.acreageYear}</dt><dd>${nf.format(Math.round(p.acres))}<small>NPS acreage report</small></dd></div>
      <div><dt>Boundary area</dt><dd>${nf.format(Math.round(boundaryAcres))}<small>acres, measured off this polygon</small></dd></div>
    </dl>
    ${p.note ? `<p class="note">${escapeHtml(p.note)}</p>` : ""}
    <p class="blurb">${escapeHtml(p.description)}</p>
    <div class="links">
      <a href="${escapeHtml(p.nps)}" target="_blank" rel="noopener">nps.gov ↗</a>
      <a href="${escapeHtml(p.wikipedia)}" target="_blank" rel="noopener">Wikipedia ↗</a>
    </div>`;
  el.detail.hidden = false;
  el.list.hidden = true;
  el.detail.scrollTop = 0;
}

const ordinal = (n) =>
  n % 100 >= 11 && n % 100 <= 13 ? "th" : { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";

function closeDetail() {
  el.detail.hidden = true;
  el.detail.innerHTML = "";
  el.list.hidden = false;
}

/* -------------------------------------------------------------------- map */

const codeFilter = (codes) => ["in", ["get", "code"], ["literal", codes]];

/** The basemap's lowest label layer — everything we draw goes under it. */
const firstSymbolLayer = () => map.getStyle().layers.find((l) => l.type === "symbol")?.id;

function fillColorExpression() {
  if (state.mode === "visits") {
    return ["step", ["get", "visitors"],
      VISIT_COLORS[0],
      ...VISIT_BREAKS.flatMap((b, i) => [b, VISIT_COLORS[i + 1]])];
  }
  if (state.mode === "established") {
    return ["step", ["get", "year"],
      ERA_COLORS[0],
      ...ERA_BREAKS.flatMap((b, i) => [b, ERA_COLORS[i + 1]])];
  }
  return [
    "match", ["get", "region"],
    ...Object.entries(REGIONS).flatMap(([key, r]) => [key, r.color]),
    "#8d8d8d",
  ];
}

function applyMapPaint() {
  if (!layered) return;
  const color = fillColorExpression();
  for (const [id, property] of [["parks-fill", "fill-color"], ["parks-line", "line-color"], ["parks-dot", "circle-color"]]) {
    if (map.getLayer(id)) map.setPaintProperty(id, property, color);
  }
}

function applyMapFilter(parks) {
  if (!layered) return;
  const filter = codeFilter(parks.map((p) => p.code));
  for (const id of ["parks-fill", "parks-line", "parks-dot", "parks-label"]) {
    if (map.getLayer(id)) map.setFilter(id, filter);
  }
}

// The polygon and its dot live in two sources, so a hover or a selection has
// to be written to both or the dot never reacts.
function setFeatureFlag(code, key, value) {
  if (!layered || !code) return;
  for (const source of ["parks", "park-points"]) {
    if (map.getSource(source)) map.setFeatureState({ source, id: code }, { [key]: value });
  }
}

/* The page's own ground. Drawn first so everything else sits on top of it.
 *
 * With the basemap up it is a faint reference frame — you can tell Utah from
 * Colorado without the fill fighting the tiles. With the basemap down it is the
 * whole map: a filled silhouette of the country, so 63 shapes in a void become
 * 63 parks in the United States. Either way it fades out past zoom 8, where the
 * question stops being "which state" and starts being "which valley". */
function addStateLayers(states, { asGround }) {
  map.addSource("states", { type: "geojson", data: states });
  const under = firstSymbolLayer();
  map.addLayer({
    id: "states-fill",
    type: "fill",
    source: "states",
    paint: {
      "fill-color": "#232833",
      "fill-opacity": asGround
        ? ["interpolate", ["linear"], ["zoom"], 3, 1, 11, 0.5]
        : 0,
    },
  }, under);
  map.addLayer({
    id: "states-line",
    type: "line",
    source: "states",
    paint: {
      "line-color": asGround ? "#4b5364" : "#6d6a5f",
      "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 7, 1],
      // With a basemap the outline is a hint that gets out of the way by zoom 8,
      // where the tiles carry the detail. Without one it is the only geography
      // on the page, so it stays to the end.
      "line-opacity": asGround
        ? ["interpolate", ["linear"], ["zoom"], 3, 0.9, 11, 0.45]
        : ["interpolate", ["linear"], ["zoom"], 3, 0.5, 8, 0],
    },
  }, under);
}

function addParkLayers(parks, { withLabels }) {
  const points = {
    type: "FeatureCollection",
    features: index.parks.map((p) => ({
      type: "Feature",
      properties: { code: p.code, short: p.short, region: p.region, visitors: p.visitors, year: Number(p.established.slice(0, 4)) },
      geometry: { type: "Point", coordinates: p.point },
    })),
  };

  map.addSource("parks", { type: "geojson", data: parks, promoteId: "code" });
  map.addSource("park-points", { type: "geojson", data: points, promoteId: "code" });

  // Slip the polygons under the basemap's own labels so place names stay
  // readable through a fill; the park dots and names go on top of everything.
  const firstSymbol = firstSymbolLayer();
  const color = fillColorExpression();

  map.addLayer({
    id: "parks-fill",
    type: "fill",
    source: "parks",
    paint: {
      "fill-color": color,
      // Heavier at national zoom, where a park is a few pixels and the fill is
      // all you see; lighter close in, where the fill would otherwise bury the
      // terrain and place names the boundary is meant to sit over.
      "fill-opacity": [
        "interpolate", ["linear"], ["zoom"],
        4, ["case",
            ["boolean", ["feature-state", "selected"], false], 0.75,
            ["boolean", ["feature-state", "hover"], false], 0.6,
            0.42],
        10, ["case",
            ["boolean", ["feature-state", "selected"], false], 0.34,
            ["boolean", ["feature-state", "hover"], false], 0.28,
            0.16],
      ],
    },
  }, firstSymbol);

  map.addLayer({
    id: "parks-line",
    type: "line",
    source: "parks",
    paint: {
      "line-color": color,
      // MapLibre only accepts a zoom expression at the top level of a paint
      // property, so the selected//not branch has to live inside each stop
      // rather than wrapping the interpolation.
      "line-width": [
        "interpolate", ["linear"], ["zoom"],
        3, ["case", ["boolean", ["feature-state", "selected"], false], 2.0, 0.6],
        8, ["case", ["boolean", ["feature-state", "selected"], false], 3.2, 1.4],
      ],
      "line-opacity": 0.95,
    },
  }, firstSymbol);

  // At national zoom most parks are a few pixels across, so the dot is what you
  // actually see and click; it fades out once the polygon can speak for itself.
  map.addLayer({
    id: "parks-dot",
    type: "circle",
    source: "park-points",
    paint: {
      "circle-color": color,
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        2, ["case", ["boolean", ["feature-state", "selected"], false], 6, 3],
        5, ["case", ["boolean", ["feature-state", "selected"], false], 8, 5],
        8, ["case", ["boolean", ["feature-state", "selected"], false], 9, 6],
      ],
      "circle-stroke-color": "#14161c",
      "circle-stroke-width": 1,
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 6.5, 1, 9, 0],
      "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 6.5, 1, 9, 0],
    },
  });

  if (withLabels) {
    map.addLayer({
      id: "parks-label",
      type: "symbol",
      source: "park-points",
      layout: {
        "text-field": ["get", "short"],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 10, 7, 14],
        "text-offset": [0, 1.1],
        "text-anchor": "top",
        "text-allow-overlap": false,
        "text-padding": 4,
      },
      paint: {
        "text-color": "#f0ecdf",
        "text-halo-color": "#14161c",
        "text-halo-width": 1.6,
      },
    });
  }
  state.labels = withLabels;

  for (const id of ["parks-fill", "parks-dot"]) {
    map.on("mousemove", id, (e) => {
      const code = e.features[0]?.properties.code;
      if (code === state.hovered) return;
      setFeatureFlag(state.hovered, "hover", false);
      state.hovered = code;
      setFeatureFlag(code, "hover", true);
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", id, () => {
      setFeatureFlag(state.hovered, "hover", false);
      state.hovered = null;
      map.getCanvas().style.cursor = "";
    });
    map.on("click", id, (e) => {
      const code = e.features[0]?.properties.code;
      if (code) select(code, { fly: true });
    });
  }
}

function addUnitLayers(data, points) {
  map.addSource("units", { type: "geojson", data });
  map.addSource("unit-points", { type: "geojson", data: points });
  // Explicitly under the parks. These layers arrive later than the others — only
  // when someone ticks the box — so leaving the stack to insertion order would
  // bury the 63 parks under 374 grey ones.
  const under = map.getLayer("parks-fill") ? "parks-fill" : firstSymbolLayer();
  map.addLayer({
    id: "units-fill",
    type: "fill",
    source: "units",
    paint: { "fill-color": "#7d7a70", "fill-opacity": 0.28 },
  }, under);
  map.addLayer({
    id: "units-line",
    type: "line",
    source: "units",
    paint: { "line-color": "#9a978c", "line-width": 0.5, "line-opacity": 0.7 },
  }, under);

  // The small units are a pixel or less wide at national zoom — several are
  // single buildings — so give them a dot to be found by, the same trick the
  // parks get, one step quieter.
  map.addLayer({
    id: "units-dot",
    type: "circle",
    source: "unit-points",
    paint: {
      "circle-color": "#9a978c",
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 1.5, 7, 2.6],
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0.6, 9.5, 0],
    },
  }, under);

  map.on("mouseenter", "units-fill", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "units-fill", () => { map.getCanvas().style.cursor = ""; });
  map.on("click", "units-fill", (e) => {
    const p = e.features[0]?.properties;
    if (!p) return;
    unitPopup?.remove();
    unitPopup = new maplibregl.Popup({ closeButton: true, maxWidth: "290px" })
      .setLngLat(e.lngLat)
      .setHTML(
        `<div class="unit-popup"><h4>${escapeHtml(p.name)}</h4>` +
        `<p>${escapeHtml(p.type)}${p.states ? ` · ${escapeHtml(p.states)}` : ""} · ${escapeHtml(areaLabel(Number(p.acres)))}</p></div>`,
      )
      .addTo(map);
  });
}

function setUnitVisibility(on) {
  for (const id of ["units-fill", "units-line", "units-dot"]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }
  if (!on) unitPopup?.remove();
}

async function loadUnits() {
  if (state.unitsLoaded) { setUnitVisibility(true); return; }
  setStatus("Loading the other 374 units…");
  try {
    const [shapes, points] = await Promise.all([
      fetch("/lab/national-parks/data/units.geojson"),
      fetch("/lab/national-parks/data/unit-points.geojson"),
    ]);
    if (!shapes.ok || !points.ok) throw new Error(`HTTP ${shapes.status}/${points.status}`);
    addUnitLayers(await shapes.json(), await points.json());
    state.unitsLoaded = true;
    setStatus("");
  } catch (err) {
    console.error(err);
    el.unitsToggle.checked = false;
    state.unitsOn = false;
    setStatus("Could not load the other units.");
  }
}

/* --------------------------------------------------------------- selection */

function select(code, { fly = false } = {}) {
  const park = parksByCode.get(code);
  if (!park) return;
  setFeatureFlag(state.selected, "selected", false);
  state.selected = code;
  setFeatureFlag(code, "selected", true);
  renderDetail(code);
  if (fly && map) {
    const [w, s, e, n] = park.bbox;
    map.fitBounds([[w, s], [e, n]], { padding: 60, maxZoom: 11.5, duration: 900 });
    el.viewButtons.forEach((b) => b.setAttribute("aria-pressed", "false"));
  }
  history.replaceState(null, "", `#${code.toLowerCase()}`);
}

function deselect() {
  setFeatureFlag(state.selected, "selected", false);
  state.selected = null;
  closeDetail();
  render();
  history.replaceState(null, "", location.pathname);
}

/* ------------------------------------------------------------------ render */

function render() {
  const parks = visibleParks();
  renderReadout(parks);
  renderLegend();
  if (el.detail.hidden) renderList(parks);
  applyMapFilter(parks);
  applyMapPaint();
}

/* ------------------------------------------------------------------ events */

el.search.addEventListener("input", () => {
  state.query = el.search.value;
  if (!el.detail.hidden) { setFeatureFlag(state.selected, "selected", false); state.selected = null; closeDetail(); }
  render();
});

el.sort.addEventListener("change", () => { state.sort = el.sort.value; render(); });

for (const button of el.modeButtons) {
  button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    el.modeButtons.forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    render();
  });
}

el.list.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-code]");
  if (button) select(button.dataset.code, { fly: true });
});

el.detail.addEventListener("click", (event) => {
  if (event.target.closest(".back-to-list")) deselect();
});

el.unitsToggle.addEventListener("change", () => {
  state.unitsOn = el.unitsToggle.checked;
  if (!layered) return;
  if (state.unitsOn) loadUnits();
  else setUnitVisibility(false);
});

/** The bounding box of every park a view names, or null if it names none. */
function viewBounds(name) {
  const test = VIEWS[name];
  const parks = index.parks.filter(test);
  if (!parks.length) return null;
  return parks.reduce(
    ([w, s, e, n], p) => [Math.min(w, p.bbox[0]), Math.min(s, p.bbox[1]), Math.max(e, p.bbox[2]), Math.max(n, p.bbox[3])],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
}

function goToView(name) {
  const box = viewBounds(name);
  if (!map || !box) return;
  map.fitBounds([[box[0], box[1]], [box[2], box[3]]], { padding: 60, duration: 800, maxZoom: 11 });
}

for (const button of el.viewButtons) {
  button.addEventListener("click", () => {
    el.viewButtons.forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    goToView(button.dataset.view);
  });
}

function buildRegionChips() {
  el.regionChips.innerHTML = Object.entries(REGIONS)
    .map(([key, r]) =>
      `<button type="button" data-region="${key}" aria-pressed="true" title="${escapeHtml(r.label)}">
        <span class="swatch" style="background:${r.color}"></span>${escapeHtml(r.label)}</button>`)
    .join("");
  el.regionChips.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-region]");
    if (!button) return;
    const key = button.dataset.region;
    // All-on is the resting state, so the first click on one chip means "only
    // this one" rather than "all but this one".
    if (state.regions.size === Object.keys(REGIONS).length) state.regions = new Set([key]);
    else if (state.regions.has(key)) state.regions.delete(key);
    else state.regions.add(key);
    if (!state.regions.size) state.regions = new Set(Object.keys(REGIONS));
    for (const chip of el.regionChips.querySelectorAll("button")) {
      chip.setAttribute("aria-pressed", String(state.regions.has(chip.dataset.region)));
    }
    if (!el.detail.hidden) deselect();
    else render();
  });
}

/* -------------------------------------------------------------------- boot */

(async function start() {
  buildRegionChips();
  setStatus("Loading boundaries…");

  let parksGeo;
  let statesGeo;
  try {
    const [indexRes, geoRes, statesRes] = await Promise.all([
      fetch("/lab/national-parks/data/parks.json"),
      fetch("/lab/national-parks/data/parks.geojson"),
      fetch("/lab/national-parks/data/states.geojson"),
    ]);
    if (!indexRes.ok || !geoRes.ok || !statesRes.ok) {
      throw new Error(`HTTP ${indexRes.status}/${geoRes.status}/${statesRes.status}`);
    }
    index = await indexRes.json();
    parksGeo = await geoRes.json();
    statesGeo = await statesRes.json();
  } catch (err) {
    console.error(err);
    setStatus("The park data failed to load.");
    return;
  }

  parksByCode = new Map(index.parks.map((p) => [p.code, p]));
  document.querySelector(".panel-head h2").textContent = `All ${index.meta.parkCount} national parks`;
  el.unitsToggle.parentElement.querySelector("strong").textContent = nf.format(index.meta.otherUnitCount);
  state.ready = true;
  setStatus("");
  render();

  try {
    const conus = viewBounds("conus");
    map = new maplibregl.Map({
      container: "map",
      bounds: [[conus[0], conus[1]], [conus[2], conus[3]]],
      fitBoundsOptions: { padding: 40 },
      minZoom: 1.2,
      maxZoom: 13,
      attributionControl: false,
      style: "https://tiles.openfreemap.org/styles/dark",
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
  } catch (err) {
    console.error(err);
    setStatus("No WebGL here — the list and the numbers still work.");
    return;
  }

  const startLayers = () => {
    if (layered) return;
    try {
      // Only the third-party basemap ships glyphs; the fallback style below has
      // none, and a text layer without them throws on every frame.
      const hasBasemap = Boolean(map.getStyle().glyphs);
      addStateLayers(statesGeo, { asGround: !hasBasemap });
      addParkLayers(parksGeo, { withLabels: hasBasemap });
      layered = true;
      render();
      if (state.unitsOn) loadUnits();
      const hash = location.hash.replace("#", "").toUpperCase();
      if (parksByCode.has(hash)) select(hash, { fly: true });
    } catch (err) {
      console.error(err);
      setStatus("The map layers failed to initialise.");
    }
  };
  // `on`, not `once`: the fallback swaps the style, and that second style.load
  // is the one that has to draw the parks.
  map.on("style.load", startLayers);
  if (map.isStyleLoaded()) startLayers();

  // The boundaries are ours and need nobody's basemap. If the free tile service
  // is unreachable — an outage, a filtered network — draw the parks on a plain
  // ground rather than leaving an empty rectangle.
  setTimeout(() => {
    if (layered) return;
    setStatus("Basemap unavailable — drawing the boundaries over our own state outlines.");
    try {
      map.setStyle({
        version: 8,
        sources: {},
        layers: [{ id: "backdrop", type: "background", paint: { "background-color": "#101318" } }],
      });
    } catch (err) {
      console.error(err);
      setStatus("The map layers failed to initialise.");
    }
  }, 8000);
})();

// Read-only surface for poking at the page from a console or a headless run.
window.__parks = {
  get state() {
    return { ...state, regions: [...state.regions], visible: visibleParks().map((p) => p.code) };
  },
  get index() { return index; },
  select,
  deselect,
};
