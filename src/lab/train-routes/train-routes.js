"use strict";

const COLORS = {
  "high-speed": "#ff6b4a",
  scenic: "#2f9e44",
  night: "#7455d9",
  classic: "#c47f17",
};

const map = new maplibregl.Map({
  container: "map",
  center: [30, 25],
  zoom: 1.4,
  style: {
    version: 8,
    projection: { type: "globe" },
    sky: {
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0],
    },
    light: { anchor: "map", intensity: 0.4 },
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  },
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }));

const routeList = document.getElementById("routeList");
const readout = document.getElementById("readout");
const filterButtons = [...document.querySelectorAll(".filters button")];

let activeCategory = "all";
let selectedSlug = null;
let hoveredSlug = null;
let features = [];
let popup = null;
const items = new Map(); // slug -> <li>

function fmt(n) {
  return n.toLocaleString("en-US");
}

// Insert intermediate vertices so long segments hug the globe instead of
// cutting visible chords across it.
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

function popupHtml(p) {
  return `<div class="popup">
    <h3>${p.name}</h3>
    <span class="cat" style="background:${COLORS[p.category]}">${p.category}</span>
    <p class="endpoints">${p.endpoints}</p>
    <dl class="specs">
      <div><dt>Distance</dt><dd>${fmt(p.km)} km</dd></div>
      <div><dt>Duration</dt><dd>${p.duration}</dd></div>
      <div><dt>Top speed</dt><dd>${p.topSpeed}</dd></div>
      <div><dt>Operator</dt><dd>${p.operator}</dd></div>
      <div><dt>Opened</dt><dd>${p.opened}</dd></div>
      <div><dt>Countries</dt><dd>${p.countries}</dd></div>
    </dl>
    <p class="blurb">${p.blurb}</p>
  </div>`;
}

function visible(feature) {
  return activeCategory === "all" || feature.properties.category === activeCategory;
}

function applyPaint() {
  const slugEq = (slug) => ["==", ["get", "slug"], slug ?? ""];
  map.setPaintProperty("routes", "line-width", [
    "case", slugEq(selectedSlug), 5, slugEq(hoveredSlug), 6, 3.5,
  ]);
  map.setPaintProperty("routes", "line-opacity",
    selectedSlug ? ["case", slugEq(selectedSlug), 0.95, 0.25] : 0.9);
  map.setPaintProperty("routes-casing", "line-opacity",
    selectedSlug ? ["case", slugEq(selectedSlug), 0.9, 0.3] : 0.9);
}

function applyState() {
  const filter = activeCategory === "all" ? null : ["==", ["get", "category"], activeCategory];
  map.setFilter("routes", filter);
  map.setFilter("routes-casing", filter);
  applyPaint();

  let shown = 0;
  let totalKm = 0;
  for (const feature of features) {
    const show = visible(feature);
    items.get(feature.properties.slug).hidden = !show;
    if (show) { shown += 1; totalKm += feature.properties.km; }
    items.get(feature.properties.slug).classList.toggle("selected", feature.properties.slug === selectedSlug);
  }
  readout.innerHTML = `<div><dt>Routes shown</dt><dd>${shown}</dd></div><div><dt>Combined length</dt><dd>${fmt(totalKm)} km</dd></div>`;
}

function closePopup() {
  if (!popup) return;
  const p = popup;
  popup = null;
  p.remove();
}

function select(slug, { fly = true, at = null } = {}) {
  selectedSlug = slug;
  applyState();
  const feature = features.find((f) => f.properties.slug === slug);
  if (!feature) return;
  const coords = feature.geometry.coordinates;
  const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
  if (fly) map.fitBounds(bounds, { padding: 60, maxZoom: 7 });

  closePopup();
  popup = new maplibregl.Popup({ maxWidth: "320px" })
    .setLngLat(at || coords[Math.floor(coords.length / 2)])
    .setHTML(popupHtml(feature.properties))
    .addTo(map);
  popup.on("close", () => { if (popup) deselect(); });

  items.get(slug).scrollIntoView({ block: "nearest" });
}

function deselect() {
  if (!selectedSlug) return;
  selectedSlug = null;
  closePopup();
  applyState();
}

// "load" waits for every tile; the atlas only needs the style, so build the
// UI as soon as the style is ready even if the tile host is slow.
map.once("style.load", async () => {
  let geojson;
  try {
    const res = await fetch("/lab/train-routes/routes.geojson");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    geojson = await res.json();
  } catch (err) {
    readout.innerHTML = `<div><dt>Error</dt><dd>routes failed to load</dd></div>`;
    console.error("Could not load routes.geojson:", err);
    return;
  }

  features = geojson.features;
  for (const feature of features) {
    feature.geometry.coordinates = densify(feature.geometry.coordinates);
  }

  map.addSource("routes", { type: "geojson", data: geojson });
  map.addLayer({
    id: "routes-casing", type: "line", source: "routes",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#fffdf8", "line-width": 7, "line-opacity": 0.9 },
  });
  map.addLayer({
    id: "routes", type: "line", source: "routes",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-width": 3.5,
      "line-opacity": 0.9,
      "line-color": ["match", ["get", "category"],
        "high-speed", COLORS["high-speed"],
        "scenic", COLORS.scenic,
        "night", COLORS.night,
        COLORS.classic],
    },
  });

  for (const feature of features) {
    const p = feature.properties;
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = `<span class="route-name"><span class="route-dot" style="background:${COLORS[p.category]}"></span>${p.name}</span>
      <span class="route-meta">${p.endpoints} · ${fmt(p.km)} km · ${p.duration}</span>`;
    button.addEventListener("click", () => select(p.slug));
    item.append(button);
    routeList.append(item);
    items.set(p.slug, item);
  }

  map.on("click", "routes", (e) => {
    e.preventDefault();
    select(e.features[0].properties.slug, { fly: false, at: e.lngLat });
  });
  map.on("click", (e) => { if (!e.defaultPrevented) deselect(); });
  map.on("mousemove", "routes", (e) => {
    map.getCanvas().style.cursor = "pointer";
    const slug = e.features[0].properties.slug;
    if (slug !== hoveredSlug) { hoveredSlug = slug; applyPaint(); }
  });
  map.on("mouseleave", "routes", () => {
    map.getCanvas().style.cursor = "";
    hoveredSlug = null;
    applyPaint();
  });

  applyState();
});

for (const button of filterButtons) {
  button.addEventListener("click", () => {
    activeCategory = button.dataset.cat;
    for (const b of filterButtons) b.setAttribute("aria-pressed", String(b === button));
    if (selectedSlug) {
      const feature = features.find((f) => f.properties.slug === selectedSlug);
      if (feature && !visible(feature)) { selectedSlug = null; closePopup(); }
    }
    applyState();
  });
}
