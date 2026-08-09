"use strict";

const COLORS = { N: "#ff5a3c", E: "#f0c23a", S: "#2ec4a2", W: "#4aa3ff" };
const DIR_WORDS = { N: "Northernmost", E: "Easternmost", S: "Southernmost", W: "Westernmost" };

const VIEWS = {
  conus: { center: [-96.5, 38.5], zoom: 3.15, pitch: 0 },
  alaska: { center: [-153, 64], zoom: 2.85, pitch: 0 },
  hawaii: { center: [-166.2, 23.4], zoom: 3.5, pitch: 0 },
  territories: { center: [-66.5, 17.8], zoom: 4.4, pitch: 0 },
  pacific: { center: [145.5, 8], zoom: 3.35, pitch: 0 },
  world: { center: [10, 18], zoom: 1.35, pitch: 0 },
  all: { center: [-140, 30], zoom: 1.55, pitch: 0 },
};

const coverage = {
  world: false,
  states: true,
  dc: true,
  territories: true,
  usMode: "states", // "states" | "country" — only meaningful when world is on
};

const activeDirs = new Set(["N", "E", "S", "W"]);
let activeView = "conus";
let ready = false;
let popup = null;
let analysis = null;
let extremesFc = null;
let unitsIndex = [];
let activeFactId = null;
let highlightSpec = null;

let map;
try {
  map = new maplibregl.Map({
    container: "map",
    center: VIEWS.conus.center,
    zoom: VIEWS.conus.zoom,
    minZoom: 1.05,
    maxZoom: 9,
    attributionControl: false,
    style: "https://tiles.openfreemap.org/styles/dark",
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
  map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
} catch (err) {
  console.error(err);
  document.body.classList.add("map-failed");
  setTimeout(() => setReadout("Map failed to initialize (WebGL). Controls still work."), 0);
}

const readout = document.getElementById("readout");
const dirButtons = [...document.querySelectorAll(".dir")];
const viewButtons = [...document.querySelectorAll(".view")];
const statsToggle = document.getElementById("stats-toggle");
const analysisEl = document.getElementById("analysis");
const analysisClose = document.getElementById("analysis-close");
const analysisNote = document.getElementById("analysis-note");
const panelFacts = document.getElementById("panel-facts");
const panelRankings = document.getElementById("panel-rankings");
const panelNational = document.getElementById("panel-national");
const tabs = [...document.querySelectorAll(".analysis-tabs [role='tab']")];
const togWorld = document.getElementById("tog-world");
const togStates = document.getElementById("tog-states");
const togDc = document.getElementById("tog-dc");
const togTerritories = document.getElementById("tog-territories");
const usModeEl = document.getElementById("us-mode");
const usModeButtons = [...document.querySelectorAll("[data-us-mode]")];
const presetButtons = [...document.querySelectorAll("[data-preset]")];
const findInput = document.getElementById("find-input");
const findResults = document.getElementById("find-results");

function densify(coords, stepDeg = 1) {
  const out = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const [x0, y0] = coords[i - 1];
    const [x1, y1] = coords[i];
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / stepDeg));
    for (let k = 1; k <= n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  return out;
}

function densifyGeom(geom, stepDeg) {
  if (geom.type === "Polygon") {
    return { type: "Polygon", coordinates: geom.coordinates.map((r) => densify(r, stepDeg)) };
  }
  if (geom.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geom.coordinates.map((poly) => poly.map((r) => densify(r, stepDeg))),
    };
  }
  return geom;
}

function densifyCollection(fc, stepDeg = 1) {
  return {
    type: "FeatureCollection",
    features: fc.features.map((f) => ({
      ...f,
      geometry: densifyGeom(f.geometry, stepDeg),
    })),
  };
}

function fmtCoord(lat, lng) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(3)}°${ns} · ${Math.abs(lng).toFixed(3)}°${ew}`;
}

function shortName(name) {
  return String(name)
    .replace(/^Commonwealth of the /, "")
    .replace(/^United States of America$/, "United States")
    .replace(/^United States /, "U.S. ");
}

function kindLabel(kind) {
  if (kind === "territory") return "Territory";
  if (kind === "district") return "District";
  if (kind === "country") return "Country";
  return "State";
}

function popupHtml(p) {
  return `<div class="popup">
    <h3>${p.state || p.name}</h3>
    <span class="dir-label" style="color:${COLORS[p.direction]}">${DIR_WORDS[p.direction]} · ${kindLabel(p.kind)}</span>
    <p class="coords">${fmtCoord(p.lat, p.lng)}</p>
  </div>`;
}

function setReadout(text) {
  if (!text) {
    readout.classList.remove("on");
    readout.textContent = "";
    return;
  }
  readout.textContent = text;
  readout.classList.add("on");
}

/** MapLibre filter expression for currently enabled units. */
function coverageFilter() {
  const clauses = [];

  if (coverage.world) {
    if (coverage.usMode === "country") {
      clauses.push(["==", ["get", "scope"], "world"]);
    } else {
      // World countries except the USA country feature
      clauses.push([
        "all",
        ["==", ["get", "scope"], "world"],
        ["!=", ["get", "isUSA"], true],
      ]);
    }
  }

  const showUsParts =
    (!coverage.world && (coverage.states || coverage.dc || coverage.territories)) ||
    (coverage.world && coverage.usMode === "states");

  if (showUsParts) {
    const kinds = [];
    if (coverage.states) kinds.push("state");
    if (coverage.dc) kinds.push("district");
    // Territories stay available even in "US as one country" world mode
    if (coverage.territories && coverage.usMode === "states") kinds.push("territory");
    if (kinds.length) {
      clauses.push([
        "all",
        ["==", ["get", "scope"], "us"],
        ["in", ["get", "kind"], ["literal", kinds]],
      ]);
    }
  }

  // Territories alongside USA-as-country
  if (coverage.world && coverage.usMode === "country" && coverage.territories) {
    clauses.push([
      "all",
      ["==", ["get", "scope"], "us"],
      ["==", ["get", "kind"], "territory"],
    ]);
  }

  if (!clauses.length) return ["==", ["get", "name"], "__none__"];
  if (clauses.length === 1) return clauses[0];
  return ["any", ...clauses];
}

function directionFilter() {
  const dirs = [...activeDirs];
  if (dirs.length === 4) return null;
  if (dirs.length === 0) return ["==", ["get", "direction"], "__none__"];
  return ["in", ["get", "direction"], ["literal", dirs]];
}

function combineFilters(...parts) {
  const active = parts.filter(Boolean);
  if (!active.length) return null;
  if (active.length === 1) return active[0];
  return ["all", ...active];
}

function applyFilter() {
  if (!ready || !map) return;
  const filter = combineFilters(coverageFilter(), directionFilter());
  map.setFilter("us-line", coverageFilter());
  map.setFilter("world-line", coverageFilter());
  map.setFilter("extremes-halo", filter);
  map.setFilter("extremes", filter);
  applyHighlight();
}

function highlightFilter(spec) {
  if (!spec) return ["==", ["get", "state"], "__none__"];
  if (Array.isArray(spec.points) && spec.points.length) {
    return [
      "any",
      ...spec.points.map((p) => [
        "all",
        ["==", ["get", "state"], p.state],
        ["==", ["get", "direction"], p.direction],
      ]),
    ];
  }
  const states = spec.states || (spec.state ? [spec.state] : []);
  const dirs = spec.directions || ["N", "E", "S", "W"];
  const parts = [];
  if (states.length) parts.push(["in", ["get", "state"], ["literal", states]]);
  if (dirs.length && dirs.length < 4) {
    parts.push(["in", ["get", "direction"], ["literal", dirs]]);
  }
  if (!parts.length) return ["==", ["get", "state"], "__none__"];
  return parts.length === 1 ? parts[0] : ["all", ...parts];
}

function applyHighlight() {
  if (!ready || !map) return;
  const on = Boolean(highlightSpec);
  const filter = combineFilters(coverageFilter(), directionFilter(), highlightFilter(highlightSpec));
  map.setFilter("extremes-focus", on ? filter : ["==", ["get", "state"], "__none__"]);
  map.setPaintProperty("extremes", "circle-opacity", on ? 0.18 : 1);
  map.setPaintProperty("extremes-halo", "circle-opacity", on ? 0.12 : 1);
  map.setPaintProperty("extremes-focus", "circle-opacity", on ? 1 : 0);
  map.setLayoutProperty("extremes-focus", "visibility", on ? "visible" : "none");
}

function clearHighlight() {
  highlightSpec = null;
  activeFactId = null;
  applyHighlight();
  for (const el of analysisEl.querySelectorAll("[aria-pressed='true']")) {
    el.setAttribute("aria-pressed", "false");
  }
}

function flyTo(center, zoom) {
  if (!map) return;
  map.easeTo({
    center,
    zoom,
    pitch: 0,
    bearing: 0,
    duration: 1100,
  });
}

function focusPoint(pt, zoom = 5.5) {
  const name = pt.state || pt.name;
  highlightSpec = { state: name, directions: [pt.direction] };
  applyHighlight();
  flyTo([pt.lng, pt.lat], zoom);
  setReadout(`${shortName(name)} · ${DIR_WORDS[pt.direction]} · ${fmtCoord(pt.lat, pt.lng)}`);
  if (popup) {
    popup.remove();
    popup = null;
  }
}

function focusUnit(unitName, directions = ["N", "E", "S", "W"], zoom = 4.8) {
  if (!extremesFc) return;
  const feats = extremesFc.features.filter(
    (f) =>
      (f.properties.state === unitName || f.properties.name === unitName) &&
      directions.includes(f.properties.direction),
  );
  if (!feats.length) return;
  highlightSpec = { state: unitName, directions };
  applyHighlight();
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  let shift = false;
  for (const f of feats) {
    let [lng, lat] = f.geometry.coordinates;
    if (lng > 0 && (unitName === "Alaska" || unitName === "Russia" || unitName === "United States of America")) {
      lng -= 360;
      shift = true;
    }
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  let centerLng = (minLng + maxLng) / 2;
  if (shift && centerLng < -180) centerLng += 360;
  const span = Math.max(maxLng - minLng, maxLat - minLat);
  const z = zoom ?? Math.max(1.4, Math.min(6.5, 7.5 - Math.log2(span + 1)));
  flyTo([centerLng, (minLat + maxLat) / 2], z);
  setReadout(`${shortName(unitName)} · ${directions.map((d) => DIR_WORDS[d]).join(" · ")}`);
}

function fitView(name, animate = true) {
  activeView = name;
  const v = VIEWS[name];
  for (const btn of viewButtons) {
    btn.setAttribute("aria-pressed", String(btn.dataset.view === name));
  }
  clearHighlight();
  if (!map) return;
  map.easeTo({
    center: v.center,
    zoom: v.zoom,
    pitch: v.pitch,
    bearing: 0,
    duration: animate ? 900 : 0,
  });
}

function syncCoverageUi() {
  togWorld.setAttribute("aria-pressed", String(coverage.world));
  togStates.setAttribute("aria-pressed", String(coverage.states));
  togDc.setAttribute("aria-pressed", String(coverage.dc));
  togTerritories.setAttribute("aria-pressed", String(coverage.territories));
  usModeEl.hidden = !coverage.world;
  for (const btn of usModeButtons) {
    btn.setAttribute("aria-checked", String(btn.dataset.usMode === coverage.usMode));
  }
  // When world + US as country, 50 states / DC are hidden conceptually
  const statesMatter = !coverage.world || coverage.usMode === "states";
  togStates.disabled = !statesMatter;
  togDc.disabled = !statesMatter;
  togStates.style.opacity = statesMatter ? "1" : "0.4";
  togDc.style.opacity = statesMatter ? "1" : "0.4";
}

function setCoverage(patch, { fly } = {}) {
  Object.assign(coverage, patch);
  // Keep at least something visible
  if (
    !coverage.world &&
    !coverage.states &&
    !coverage.dc &&
    !coverage.territories
  ) {
    coverage.states = true;
  }
  syncCoverageUi();
  applyFilter();
  renderAnalysis();
  if (fly === "world") fitView("world", true);
  else if (fly === "conus") fitView("conus", true);
}

function applyPreset(name) {
  if (name === "us-full") {
    setCoverage(
      { world: false, states: true, dc: true, territories: true, usMode: "states" },
      { fly: "conus" },
    );
  } else if (name === "us-50") {
    setCoverage(
      { world: false, states: true, dc: false, territories: false, usMode: "states" },
      { fly: "conus" },
    );
  } else if (name === "world-country") {
    setCoverage(
      { world: true, states: false, dc: false, territories: false, usMode: "country" },
      { fly: "world" },
    );
  } else if (name === "world-states") {
    setCoverage(
      { world: true, states: true, dc: true, territories: true, usMode: "states" },
      { fly: "world" },
    );
  }
}

function setAnalysisOpen(open) {
  analysisEl.hidden = !open;
  statsToggle.setAttribute("aria-expanded", String(open));
  document.body.classList.toggle("analysis-open", open);
  if (!open) clearHighlight();
}

function selectTab(tabId) {
  for (const tab of tabs) {
    const selected = tab.id === tabId;
    tab.setAttribute("aria-selected", String(selected));
    const panel = document.getElementById(tab.getAttribute("aria-controls"));
    if (panel) panel.hidden = !selected;
  }
}

function visibleFact(fact) {
  if (fact.scope === "world") return coverage.world;
  return coverage.states || coverage.dc || coverage.territories || (coverage.world && coverage.usMode === "country");
}

function renderFacts() {
  panelFacts.innerHTML = "";
  const facts = analysis.facts.filter(visibleFact);
  if (!facts.length) {
    panelFacts.innerHTML = `<p class="fact"><span class="fact-tag">empty</span><h3>Nothing in view</h3><p>Turn on world countries or U.S. units to see facts.</p></p>`;
    return;
  }
  for (const fact of facts) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fact";
    btn.dataset.factId = fact.id;
    btn.setAttribute("aria-pressed", String(activeFactId === fact.id));
    btn.innerHTML = `
      <span class="fact-tag">${fact.tag}</span>
      <h3>${fact.title}</h3>
      <p>${fact.body}</p>`;
    btn.addEventListener("click", () => {
      const same = activeFactId === fact.id;
      for (const el of panelFacts.querySelectorAll(".fact")) {
        el.setAttribute("aria-pressed", "false");
      }
      if (same) {
        clearHighlight();
        setReadout("");
        return;
      }
      activeFactId = fact.id;
      btn.setAttribute("aria-pressed", "true");
      highlightSpec = fact.highlight;
      applyHighlight();
      flyTo(fact.center, fact.zoom);
      setReadout(fact.title);
    });
    panelFacts.appendChild(btn);
  }
}

function rankBlock(title, rows, valueFn, onPick) {
  const block = document.createElement("div");
  block.className = "rank-block";
  block.innerHTML = `<h3>${title}</h3>`;
  const ul = document.createElement("ul");
  ul.className = "rank-list";
  for (const row of rows) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-pressed", "false");
    const label = row.state || row.name;
    btn.innerHTML = `
      <span class="n">${row.rank}</span>
      <span>${shortName(label)}</span>
      <span class="v">${valueFn(row)}</span>`;
    btn.addEventListener("click", () => {
      const pressed = btn.getAttribute("aria-pressed") === "true";
      for (const el of panelRankings.querySelectorAll("[aria-pressed='true']")) {
        el.setAttribute("aria-pressed", "false");
      }
      if (pressed) {
        clearHighlight();
        setReadout("");
        return;
      }
      btn.setAttribute("aria-pressed", "true");
      onPick(row);
    });
    li.appendChild(btn);
    ul.appendChild(li);
  }
  block.appendChild(ul);
  return block;
}

function renderRankings() {
  panelRankings.innerHTML = "";
  if (coverage.world) {
    panelRankings.appendChild(
      rankBlock(
        "World tallest N→S (incl. overseas parts)",
        analysis.world.tallestNs,
        (row) => `${row.km} km`,
        (row) => focusUnit(row.state || row.name, ["N", "S"], 2.8),
      ),
    );
    panelRankings.appendChild(
      rankBlock(
        "World widest E→W (incl. overseas parts)",
        analysis.world.widestEw,
        (row) => `${row.km} km`,
        (row) => focusUnit(row.state || row.name, ["E", "W"], 2.4),
      ),
    );
  }
  if (coverage.states || (!coverage.world && coverage.states)) {
    const r = analysis.rankings;
    panelRankings.appendChild(
      rankBlock("U.S. tallest N→S", r.tallestNs, (row) => `${row.km} km`, (row) => focusUnit(row.state, ["N", "S"], 4.2)),
    );
    panelRankings.appendChild(
      rankBlock("U.S. widest E→W", r.widestEw, (row) => `${row.km} km`, (row) => focusUnit(row.state, ["E", "W"], 4.2)),
    );
    panelRankings.appendChild(
      rankBlock("U.S. shortest N→S", r.shortestNs, (row) => `${row.km} km`, (row) => focusUnit(row.state, ["N", "S"], 6.5)),
    );
    panelRankings.appendChild(
      rankBlock("U.S. narrowest E→W", r.narrowestEw, (row) => `${row.km} km`, (row) => focusUnit(row.state, ["E", "W"], 6.5)),
    );
    panelRankings.appendChild(
      rankBlock("Tallest shape", r.tallestAspect, (row) => `${row.ratio}×`, (row) => focusUnit(row.state)),
    );
    panelRankings.appendChild(
      rankBlock("Widest shape", r.widestAspect, (row) => `${row.ratio}×`, (row) => focusUnit(row.state)),
    );
  }
  if (!panelRankings.children.length) {
    panelRankings.innerHTML = `<div class="rank-block"><h3>Rankings</h3><p style="color:var(--muted);font-size:.86rem;margin:0;padding:0 8px">Enable world countries or U.S. states to see rankings.</p></div>`;
  }
}

function natBlock(title, group, zoom) {
  const block = document.createElement("div");
  block.className = "nat-block";
  block.innerHTML = `<h3>${title}</h3>`;
  for (const dir of ["N", "E", "S", "W"]) {
    const pt = group[dir];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nat-row";
    btn.setAttribute("aria-pressed", "false");
    btn.innerHTML = `
      <span class="nat-dir ${dir.toLowerCase()}">${dir}</span>
      <span>
        <strong>${shortName(pt.state || pt.name)}</strong>
        <span>${fmtCoord(pt.lat, pt.lng)}</span>
      </span>`;
    btn.addEventListener("click", () => {
      const pressed = btn.getAttribute("aria-pressed") === "true";
      for (const el of panelNational.querySelectorAll("[aria-pressed='true']")) {
        el.setAttribute("aria-pressed", "false");
      }
      if (pressed) {
        clearHighlight();
        setReadout("");
        return;
      }
      btn.setAttribute("aria-pressed", "true");
      focusPoint(pt, zoom);
    });
    block.appendChild(btn);
  }
  return block;
}

function renderNational() {
  panelNational.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "nat-grid";
  if (coverage.world) {
    grid.appendChild(natBlock("World tips", analysis.world.cardinals, 3.2));
  }
  if (coverage.states || coverage.dc || coverage.territories) {
    grid.appendChild(natBlock("U.S. units (states + territories)", analysis.national.all, 4.8));
  }
  if (coverage.states) {
    grid.appendChild(natBlock("50 states only", analysis.national.states, 4.2));
    grid.appendChild(natBlock("Contiguous 48", analysis.national.conus, 4.6));
  }
  if (!grid.children.length) {
    grid.innerHTML = `<p style="color:var(--muted);font-size:.86rem;margin:0;padding:8px">Enable coverage to see tips.</p>`;
  }
  panelNational.appendChild(grid);
}

function renderAnalysis() {
  if (!analysis) return;
  analysisNote.textContent = analysis.meta.note;
  renderFacts();
  renderRankings();
  renderNational();
}

function buildUnitsIndex(fc) {
  const by = new Map();
  for (const f of fc.features) {
    const p = f.properties;
    const key = p.name || p.state;
    if (!by.has(key)) {
      by.set(key, {
        name: key,
        abbr: p.abbr,
        kind: p.kind,
        scope: p.scope,
        isUSA: Boolean(p.isUSA),
        points: {},
      });
    }
    by.get(key).points[p.direction] = { lat: p.lat, lng: p.lng };
  }
  unitsIndex = [...by.values()];
}

function unitVisible(u) {
  if (u.scope === "world") {
    if (!coverage.world) return false;
    if (u.isUSA) return coverage.usMode === "country";
    return true;
  }
  if (u.kind === "state") return coverage.states && (!coverage.world || coverage.usMode === "states");
  if (u.kind === "district") return coverage.dc && (!coverage.world || coverage.usMode === "states");
  if (u.kind === "territory") {
    if (!coverage.territories) return false;
    if (!coverage.world) return true;
    return true; // territories available in both US modes when toggled
  }
  return false;
}

function renderFind(q) {
  const query = q.trim().toLowerCase();
  if (!query) {
    findResults.hidden = true;
    findResults.innerHTML = "";
    return;
  }
  const hits = unitsIndex
    .filter(unitVisible)
    .filter(
      (u) =>
        u.name.toLowerCase().includes(query) ||
        String(u.abbr || "").toLowerCase().includes(query),
    )
    .slice(0, 8);
  findResults.innerHTML = "";
  if (!hits.length) {
    findResults.hidden = false;
    findResults.innerHTML = `<li><button type="button" disabled>No matches</button></li>`;
    return;
  }
  for (const u of hits) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = `${shortName(u.name)}<span class="meta">${kindLabel(u.kind)}${u.abbr ? ` · ${u.abbr}` : ""}</span>`;
    btn.addEventListener("click", () => {
      findInput.value = u.name;
      findResults.hidden = true;
      focusUnit(u.name);
    });
    li.appendChild(btn);
    findResults.appendChild(li);
  }
  findResults.hidden = false;
}

async function boot() {
  if (typeof map.setProjection === "function") {
    map.setProjection({ type: "globe" });
  }
  map.setSky({
    "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.85, 5, 0.85, 7, 0],
  });
  map.setLight({
    anchor: "viewport",
    color: "#ffffff",
    intensity: 0.55,
    position: [1.15, 210, 30],
  });

  const [usOutlinesRaw, worldOutlinesRaw, extremes, analysisData] = await Promise.all([
    fetch("/lab/state-extremes/data/states.geojson").then((r) => {
      if (!r.ok) throw new Error("states.geojson");
      return r.json();
    }),
    fetch("/lab/state-extremes/data/countries-outlines.geojson").then((r) => {
      if (!r.ok) throw new Error("countries-outlines.geojson");
      return r.json();
    }),
    fetch("/lab/state-extremes/data/all-extremes.geojson").then((r) => {
      if (!r.ok) throw new Error("all-extremes.geojson");
      return r.json();
    }),
    fetch("/lab/state-extremes/data/analysis.json").then((r) => {
      if (!r.ok) throw new Error("analysis.json");
      return r.json();
    }),
  ]);

  extremesFc = extremes;
  analysis = analysisData;
  buildUnitsIndex(extremes);
  syncCoverageUi();
  renderAnalysis();

  // Densify US tightly; world outlines more sparsely (cost).
  const usOutlines = densifyCollection(usOutlinesRaw, 1);
  // Light densify — world outlines are already simplified; keep boot snappy.
  const worldOutlines = densifyCollection(worldOutlinesRaw, 4);

  map.addSource("us-outlines", { type: "geojson", data: usOutlines });
  map.addSource("world-outlines", { type: "geojson", data: worldOutlines });
  map.addSource("extremes", { type: "geojson", data: extremes });

  map.addLayer({
    id: "world-line",
    type: "line",
    source: "world-outlines",
    paint: {
      "line-color": "#6f7b88",
      "line-width": 0.55,
      "line-opacity": 0.85,
    },
  });

  map.addLayer({
    id: "us-line",
    type: "line",
    source: "us-outlines",
    paint: {
      "line-color": [
        "match",
        ["get", "kind"],
        "territory",
        "#8fd3ff",
        "#c8d0d8",
      ],
      "line-width": ["match", ["get", "kind"], "territory", 1.35, 0.85],
      "line-opacity": 1,
    },
  });

  map.addLayer({
    id: "extremes-halo",
    type: "circle",
    source: "extremes",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 1.2, 4.2, 4, 7.5, 7, 10],
      "circle-color": "#0b1016",
      "circle-opacity": 1,
    },
  });

  map.addLayer({
    id: "extremes",
    type: "circle",
    source: "extremes",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        1.2,
        ["match", ["get", "kind"], "country", 2.4, 3.2],
        4,
        ["match", ["get", "kind"], "country", 4.2, 5],
        7,
        ["match", ["get", "kind"], "country", 6, 7],
      ],
      "circle-color": [
        "match",
        ["get", "direction"],
        "N",
        COLORS.N,
        "E",
        COLORS.E,
        "S",
        COLORS.S,
        "W",
        COLORS.W,
        "#fff",
      ],
      "circle-stroke-width": 1.05,
      "circle-stroke-color": "#f0ecdf",
      "circle-opacity": 1,
      "circle-stroke-opacity": 1,
    },
  });

  map.addLayer({
    id: "extremes-focus",
    type: "circle",
    source: "extremes",
    filter: ["==", ["get", "state"], "__none__"],
    layout: { visibility: "none" },
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 1.2, 5.2, 4, 8, 7, 11],
      "circle-color": [
        "match",
        ["get", "direction"],
        "N",
        COLORS.N,
        "E",
        COLORS.E,
        "S",
        COLORS.S,
        "W",
        COLORS.W,
        "#fff",
      ],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#f0ecdf",
      "circle-opacity": 0,
      "circle-stroke-opacity": 1,
    },
  });

  ready = true;
  applyFilter();
  fitView("conus", false);

  map.on("mousemove", "extremes", (e) => {
    map.getCanvas().style.cursor = "pointer";
    const f = e.features?.[0];
    if (!f) return;
    const p = f.properties;
    setReadout(
      `${p.state || p.name} · ${DIR_WORDS[p.direction]} · ${kindLabel(p.kind)} · ${fmtCoord(p.lat, p.lng)}`,
    );
  });
  map.on("mouseleave", "extremes", () => {
    map.getCanvas().style.cursor = "";
    if (!highlightSpec) setReadout("");
  });

  map.on("click", "extremes", (e) => {
    e.preventDefault();
    const f = e.features?.[0];
    if (!f) return;
    const p = f.properties;
    if (popup) popup.remove();
    popup = new maplibregl.Popup({ offset: 10, maxWidth: "260px", closeButton: true })
      .setLngLat(f.geometry.coordinates)
      .setHTML(popupHtml(p))
      .addTo(map);
  });

  map.on("click", (e) => {
    if (e.defaultPrevented) return;
    if (popup) {
      popup.remove();
      popup = null;
    }
  });
}

if (map) {
  map.once("style.load", () => {
    boot().catch((err) => {
      console.error(err);
      setReadout("Could not load extremes data.");
    });
  });
} else {
  // Still load analysis/search data when the map cannot start.
  Promise.all([
    fetch("/lab/state-extremes/data/all-extremes.geojson").then((r) => r.json()),
    fetch("/lab/state-extremes/data/analysis.json").then((r) => r.json()),
  ])
    .then(([extremes, analysisData]) => {
      extremesFc = extremes;
      analysis = analysisData;
      buildUnitsIndex(extremes);
      syncCoverageUi();
      renderAnalysis();
    })
    .catch((err) => {
      console.error(err);
      setReadout("Could not load extremes data.");
    });
}

for (const btn of dirButtons) {
  btn.addEventListener("click", () => {
    const dir = btn.dataset.dir;
    if (activeDirs.has(dir)) activeDirs.delete(dir);
    else activeDirs.add(dir);
    btn.setAttribute("aria-pressed", String(activeDirs.has(dir)));
    applyFilter();
  });
}

for (const btn of viewButtons) {
  btn.addEventListener("click", () => fitView(btn.dataset.view, true));
}

togWorld.addEventListener("click", () => {
  const next = !coverage.world;
  setCoverage({ world: next }, { fly: next ? "world" : "conus" });
});
togStates.addEventListener("click", () => {
  if (togStates.disabled) return;
  setCoverage({ states: !coverage.states });
});
togDc.addEventListener("click", () => {
  if (togDc.disabled) return;
  setCoverage({ dc: !coverage.dc });
});
togTerritories.addEventListener("click", () => {
  setCoverage({ territories: !coverage.territories });
});

for (const btn of usModeButtons) {
  btn.addEventListener("click", () => {
    setCoverage({ usMode: btn.dataset.usMode });
  });
}

for (const btn of presetButtons) {
  btn.addEventListener("click", () => applyPreset(btn.dataset.preset));
}

findInput.addEventListener("input", () => renderFind(findInput.value));
findInput.addEventListener("focus", () => renderFind(findInput.value));
findInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    findResults.hidden = true;
    findInput.blur();
  }
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".find-block")) findResults.hidden = true;
});

statsToggle.addEventListener("click", () => {
  setAnalysisOpen(analysisEl.hidden);
});
analysisClose.addEventListener("click", () => setAnalysisOpen(false));

for (const tab of tabs) {
  tab.addEventListener("click", () => selectTab(tab.id));
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !analysisEl.hidden) setAnalysisOpen(false);
});
