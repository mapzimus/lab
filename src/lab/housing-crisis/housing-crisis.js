"use strict";

/* Interactive explorer for the Predicting Tomorrow's Housing Crisis model.
   Six tract surfaces + transit/siting overlays + live client-side
   re-weighting of the suitability index via MapLibre feature-state.
   Data: exported by github.com/mapzimus/predicting-housing-crisis. */

const NO_DATA = "#3f434c";
const BASE = "/lab/housing-crisis/";
const DEFAULT_W = { need: 45, access: 35, vuln: 20 };

// Ramps run dark -> bright so "bright = high" reads on the night canvas.
const METRICS = {
  HSI: {
    prop: "HSI", breaks: [20, 40, 60, 80],
    ramp: ["#1b0c41", "#7d2482", "#c43c4e", "#f8850f", "#fcffa4"],
    legendTitle: "Housing Stress Index · percentile 0–100",
    labels: ["0 – 20", "20 – 40", "40 – 60", "60 – 80", "80 – 100"],
    note: "Cost burden (40%) + availability (25%) + decade trajectory (20%) + " +
      "economic precarity (15%), percentile-scored statewide from ACS 2019–2023 and 2009–2013.",
  },
  HPP: {
    prop: "HPP", breaks: [20, 40, 60, 80],
    ramp: ["#3c0f4c", "#93325f", "#cf5a68", "#e7a284", "#f5eddc"],
    legendTitle: "Homelessness Pressure · proxy percentile 0–100",
    labels: ["0 – 20", "20 – 40", "40 – 60", "60 – 80", "80 – 100"],
    note: "A proxy composite of literature-based correlates (severe rent burden, poverty, " +
      "overcrowding, rent growth, vulnerability, market tightness) — NOT observed " +
      "homelessness, which is counted only at Continuum-of-Care level.",
  },
  SUIT: {
    prop: "SUIT", breaks: [20, 40, 60, 80],
    ramp: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
    legendTitle: "Supportive-Housing Suitability · percentile 0–100",
    labels: ["0 – 20", "20 – 40", "40 – 60", "60 – 80", "80 – 100"],
    note: "Need + opportunity access + vulnerability, using the weights in the panel — " +
      "drag them and this surface rebuilds in your browser. The access block is the " +
      "anti-concentration safeguard: high scores mean connected locations, never remote ones.",
  },
  DPI: {
    prop: "DPI", breaks: [20, 40, 60, 80],
    ramp: ["#0d0887", "#7e03a8", "#cc4778", "#f89441", "#f0f921"],
    legendTitle: "Development Probability · percentile 0–100",
    labels: ["0 – 20", "20 – 40", "40 – 60", "60 – 80", "80 – 100"],
    note: "Where market growth is heading: LODES job growth 2013–2022 (30%), county permit " +
      "rate + momentum (30%, broadcast county→tract), population change (20%), real value " +
      "appreciation (10%), multifamily fabric (10%).",
  },
  TREND: {
    prop: "d_burden_pp", breaks: [-30, -10, 10, 30],
    ramp: ["#5aa7ff", "#3d5f8f", "#3c414c", "#a04a52", "#ff6b74"],
    legendTitle: "Δ renter cost burden, 2013 → 2023",
    labels: ["≤ −30 pp · easing", "−30 – −10 pp", "−10 – +10 pp · flat",
             "+10 – +30 pp", "≥ +30 pp · worsening"],
    note: "Change in the share of renter households paying ≥30% of income, 2013→2023, " +
      "on 2020 tract lines (area-weighted crosswalk). Bright red = worsening fastest.",
  },
  PROJ: {
    prop: "proj2030_burden_pct", breaks: [30, 40, 50, 60],
    ramp: ["#1b0c41", "#7d2482", "#c43c4e", "#f8850f", "#fcffa4"],
    legendTitle: "% renters ≥30% burdened · projected ~2030",
    labels: ["< 30%", "30 – 40%", "40 – 50%", "50 – 60%", "≥ 60%"],
    note: "Screening extrapolation only — 2023 level plus 0.7× the observed decade change, " +
      "assuming persistence and nothing else. Not a forecast.",
  },
};

let map;
let activeMetric = "HSI";
let pinned = null;
let features = [];               // cached geojson features
let customSuit = null;           // Map<GEOID, score> when custom weights active
let recomputeQueued = false;

/* ---------- expressions & legend ---------- */

function valueExpr(metric) {
  if (metric === "SUIT" && customSuit) return ["feature-state", "custom"];
  return ["get", METRICS[metric].prop];
}

function fillColor(metric) {
  const m = METRICS[metric];
  const v = valueExpr(metric);
  const step = ["step", v, m.ramp[0]];
  m.breaks.forEach((b, i) => step.push(b, m.ramp[i + 1]));
  return ["case",
    ["!=", ["typeof", v], "number"], NO_DATA,
    ["==", ["get", "no_data"], true], NO_DATA,
    step];
}

function renderLegend(metric) {
  const m = METRICS[metric];
  document.getElementById("legendTitle").textContent =
    m.legendTitle + (metric === "SUIT" && customSuit ? " · CUSTOM WEIGHTS" : "");
  document.getElementById("legend").innerHTML = m.ramp.map((c, i) =>
    `<div class="row"><span class="swatch" style="background:${c}"></span>${m.labels[i]}</div>`
  ).join("") +
    `<div class="row"><span class="swatch" style="background:${NO_DATA}"></span>no data / suppressed</div>`;
  document.getElementById("metricNote").textContent = m.note;
}

function repaint() {
  map.setPaintProperty("tracts-fill", "fill-color", fillColor(activeMetric));
  renderLegend(activeMetric);
}

function setMetric(metric) {
  activeMetric = metric;
  repaint();
  document.querySelectorAll(".filters button").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.metric === metric)));
}

/* ---------- weights: live SUIT re-weighting ---------- */

function currentWeights() {
  const raw = {
    need: +document.getElementById("wNeed").value,
    access: +document.getElementById("wAccess").value,
    vuln: +document.getElementById("wVuln").value,
  };
  const sum = raw.need + raw.access + raw.vuln;
  if (sum === 0) return { ...DEFAULT_W, sum: 100 };
  return { ...raw, sum };
}

function weightsAreDefault(w) {
  const eff = (k) => (w[k] / w.sum) * 100;
  return Math.abs(eff("need") - 45) < 0.5 &&
         Math.abs(eff("access") - 35) < 0.5 &&
         Math.abs(eff("vuln") - 20) < 0.5;
}

function updateWeightLabels(w) {
  const pct = (k) => `${Math.round((w[k] / w.sum) * 100)}%`;
  document.getElementById("wNeedVal").textContent = pct("need");
  document.getElementById("wAccessVal").textContent = pct("access");
  document.getElementById("wVulnVal").textContent = pct("vuln");
}

function recomputeSuit() {
  recomputeQueued = false;
  const w = currentWeights();
  updateWeightLabels(w);

  if (weightsAreDefault(w)) {
    customSuit = null;
    document.getElementById("customBadge").hidden = true;
    features.forEach((f) =>
      map.setFeatureState({ source: "tracts", id: f.properties.GEOID }, { custom: null }));
    if (activeMetric === "SUIT") repaint();
    refreshReadout();
    return;
  }

  const wn = w.need / w.sum, wa = w.access / w.sum, wv = w.vuln / w.sum;
  const raws = [];
  for (const f of features) {
    const p = f.properties;
    const ok = !p.no_data &&
      typeof p.suit_need === "number" &&
      typeof p.suit_access === "number" &&
      typeof p.suit_vulnerability === "number";
    raws.push(ok ? wn * p.suit_need + wa * p.suit_access + wv * p.suit_vulnerability : null);
  }
  const sorted = raws.filter((v) => v !== null).sort((a, b) => a - b);
  const n = sorted.length;
  const rankOf = (v) => {
    let lo = 0, hi = n;                      // upper-bound binary search
    while (lo < hi) { const mid = (lo + hi) >> 1; sorted[mid] <= v ? lo = mid + 1 : hi = mid; }
    return (lo / n) * 100;
  };
  customSuit = new Map();
  features.forEach((f, i) => {
    const score = raws[i] === null ? null : Math.round(rankOf(raws[i]) * 10) / 10;
    customSuit.set(f.properties.GEOID, score);
    map.setFeatureState({ source: "tracts", id: f.properties.GEOID }, { custom: score });
  });
  document.getElementById("customBadge").hidden = false;
  if (activeMetric === "SUIT") repaint();
  refreshReadout();
}

function queueRecompute() {
  if (!recomputeQueued) { recomputeQueued = true; requestAnimationFrame(recomputeSuit); }
}

/* ---------- readout & popup ---------- */

function fmt(v, suffix = "") {
  return typeof v === "number" ? `${Math.round(v)}${suffix}` : "–";
}

function suitOf(p) {
  if (customSuit) {
    const c = customSuit.get(p.GEOID);
    return typeof c === "number" ? c : null;
  }
  return typeof p.SUIT === "number" ? p.SUIT : null;
}

let lastProps = null;
function updateReadout(p) {
  lastProps = p;
  document.getElementById("roName").textContent = p ? p.NAMELSAD : "hover the map";
  document.getElementById("roHSI").textContent = p ? fmt(p.HSI) : "–";
  document.getElementById("roHPP").textContent = p ? fmt(p.HPP) : "–";
  document.getElementById("roSUIT").textContent = p
    ? fmt(suitOf(p)) + (customSuit ? " (custom)" : "") : "–";
  document.getElementById("roDPI").textContent = p ? fmt(p.DPI) : "–";
}
function refreshReadout() { updateReadout(lastProps); }

function bar(label, v) {
  const width = typeof v === "number" ? Math.max(0, Math.min(100, v)) : 0;
  return `<div class="bar-row"><span class="bar-label">${label}</span>` +
    `<span class="bar"><i style="width:${width}%"></i></span>` +
    `<span class="bar-val">${fmt(v)}</span></div>`;
}

function popupHTML(p) {
  const dPP = typeof p.d_burden_pp === "number"
    ? `${p.d_burden_pp > 0 ? "+" : ""}${Math.round(p.d_burden_pp)} pp` : "–";
  const proj = typeof p.proj2030_burden_pct === "number"
    ? `${Math.round(p.proj2030_burden_pct)}%` : "–";
  const ej = typeof p.ej_share === "number" ? `${Math.round(p.ej_share * 100)}%` : "–";
  return `<div class="popup"><h3>${p.NAMELSAD}</h3>` +
    `<span class="geoid">${p.GEOID}</span>` +
    bar("stress", p.HSI) +
    bar("pressure*", p.HPP) +
    bar(customSuit ? "suit (custom)" : "suitability", suitOf(p)) +
    bar("development", p.DPI) +
    `<div class="extra">burden Δ 13→23: <b>${dPP}</b> · projected 2030: <b>${proj}</b><br>` +
    `transit score: <b>${fmt(p.transit_score)}</b> · EJ area: <b>${ej}</b></div></div>`;
}

/* ---------- overlays ---------- */

const OVERLAYS = {
  ovTransit: ["transit-rapid", "transit-commuter", "stations"],
  ovSites: ["sites", "sites-halo"],
  ovTop: ["top-decile"],
};

function wireOverlay(checkboxId) {
  document.getElementById(checkboxId).addEventListener("change", (e) => {
    const vis = e.target.checked ? "visible" : "none";
    OVERLAYS[checkboxId].forEach((l) => map.setLayoutProperty(l, "visibility", vis));
  });
}

/* ---------- init ---------- */

function init() {
  map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors",
        },
      },
      layers: [{
        id: "osm", type: "raster", source: "osm",
        paint: { "raster-saturation": -0.9, "raster-opacity": 0.85, "raster-brightness-max": 0.4 },
      }],
    },
    bounds: [[-73.60, 41.15], [-69.85, 42.95]],
    fitBoundsOptions: { padding: 24 },
    attributionControl: { compact: false },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

  map.on("style.load", async () => {
    const [tracts, lines, stations, sites] = await Promise.all([
      fetch(BASE + "indices.geojson").then((r) => r.json()),
      fetch(BASE + "transit_lines.geojson").then((r) => r.json()),
      fetch(BASE + "transit_stations.geojson").then((r) => r.json()),
      fetch(BASE + "optimized_sites.geojson").then((r) => r.json()),
    ]);
    features = tracts.features;

    map.addSource("tracts", { type: "geojson", data: tracts, promoteId: "GEOID" });
    map.addSource("transit", { type: "geojson", data: lines });
    map.addSource("stations-src", { type: "geojson", data: stations });
    map.addSource("sites-src", { type: "geojson", data: sites });

    map.addLayer({
      id: "tracts-fill", type: "fill", source: "tracts",
      paint: { "fill-color": fillColor(activeMetric), "fill-opacity": 0.8 },
    });
    map.addLayer({
      id: "tracts-line", type: "line", source: "tracts",
      paint: { "line-color": "#10141c", "line-width": 0.4, "line-opacity": 0.6 },
    });
    map.addLayer({
      id: "top-decile", type: "line", source: "tracts",
      layout: { visibility: "none" },
      paint: { "line-color": "#d7ff4f", "line-width": 1.6 },
      filter: ["==", ["get", "top_decile"], true],
    });
    map.addLayer({
      id: "transit-commuter", type: "line", source: "transit",
      layout: { visibility: "none" },
      paint: { "line-color": "#a891e8", "line-width": 1.1, "line-dasharray": [3, 2] },
      filter: ["==", ["get", "kind"], "commuter"],
    });
    map.addLayer({
      id: "transit-rapid", type: "line", source: "transit",
      layout: { visibility: "none" },
      paint: { "line-color": "#6aa9dd", "line-width": 1.8 },
      filter: ["==", ["get", "kind"], "rapid"],
    });
    map.addLayer({
      id: "stations", type: "circle", source: "stations-src",
      layout: { visibility: "none" },
      paint: {
        "circle-radius": ["case", ["==", ["get", "kind"], "rapid"], 2.6, 2.1],
        "circle-color": ["case", ["==", ["get", "kind"], "rapid"], "#6aa9dd", "#a891e8"],
        "circle-stroke-color": "#10141c", "circle-stroke-width": 0.6,
      },
    });
    map.addLayer({
      id: "sites-halo", type: "circle", source: "sites-src",
      layout: { visibility: "none" },
      paint: { "circle-radius": 9, "circle-color": "#ff5a5f", "circle-opacity": 0.25 },
    });
    map.addLayer({
      id: "sites", type: "circle", source: "sites-src",
      layout: { visibility: "none" },
      paint: {
        "circle-radius": 4.5, "circle-color": "#ff5a5f",
        "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.1,
      },
    });
    map.addLayer({
      id: "tracts-highlight", type: "line", source: "tracts",
      paint: { "line-color": "#e9e4d6", "line-width": 2 },
      filter: ["==", ["get", "GEOID"], ""],
    });

    map.on("mousemove", "tracts-fill", (e) => {
      const f = e.features && e.features[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      map.setFilter("tracts-highlight", ["==", ["get", "GEOID"], f.properties.GEOID]);
      if (!pinned) updateReadout(f.properties);
    });
    map.on("mouseleave", "tracts-fill", () => {
      map.getCanvas().style.cursor = "";
      map.setFilter("tracts-highlight", ["==", ["get", "GEOID"], pinned || ""]);
      if (!pinned) updateReadout(null);
    });
    map.on("click", "tracts-fill", (e) => {
      const f = e.features && e.features[0];
      if (!f) return;
      pinned = f.properties.GEOID;
      updateReadout(f.properties);
      map.setFilter("tracts-highlight", ["==", ["get", "GEOID"], pinned]);
      const popup = new maplibregl.Popup({ closeOnClick: false, maxWidth: "300px" })
        .setLngLat(e.lngLat)
        .setHTML(popupHTML(f.properties));
      // MapLibre v5: .on() returns a Subscription, not the popup — don't chain.
      popup.on("close", () => {
        pinned = null;
        map.setFilter("tracts-highlight", ["==", ["get", "GEOID"], ""]);
        updateReadout(null);
      });
      popup.addTo(map);
    });
  });

  document.querySelectorAll(".filters button").forEach((b) =>
    b.addEventListener("click", () => setMetric(b.dataset.metric)));
  ["wNeed", "wAccess", "wVuln"].forEach((id) =>
    document.getElementById(id).addEventListener("input", queueRecompute));
  document.getElementById("wReset").addEventListener("click", () => {
    document.getElementById("wNeed").value = DEFAULT_W.need;
    document.getElementById("wAccess").value = DEFAULT_W.access;
    document.getElementById("wVuln").value = DEFAULT_W.vuln;
    queueRecompute();
  });
  Object.keys(OVERLAYS).forEach(wireOverlay);

  renderLegend(activeMetric);
  updateReadout(null);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
