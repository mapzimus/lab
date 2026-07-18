"use strict";

const HOME = [40.7484, -73.9857]; // Leaflet order: [lat, lng]
const map = L.map("map", { zoomControl: true }).setView(HOME, 13);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

const colors = { ink: "#171a20", acid: "#d7ff4f", cyan: "#50d7d3", coral: "#ff6b4a", purple: "#7455d9" };
const pointLayer = L.layerGroup().addTo(map);
const resultLayer = L.layerGroup().addTo(map);

let mode = "buffer";
let points = null;          // FeatureCollection of random points
let measureStart = null;    // first click of a measure pair
let lastClick = null;       // remembered so slider changes can re-run buffer

const readout = document.getElementById("readout");
const callLog = document.getElementById("callLog");
const modeHint = document.getElementById("modeHint");
const hints = {
  buffer: "Click the map to drop a buffer and count the points inside it.",
  voronoi: "Each cell is the region closest to one point. Re-scatter to redraw.",
  hex: "Points are binned into hexagons; darker purple = more points.",
  measure: "Click two spots anywhere on Earth — zoom out and try continents apart.",
};

function setReadout(pairs) {
  readout.innerHTML = pairs.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
}
function setCalls(lines) {
  callLog.innerHTML = lines.map((l) => `<code>${l}</code>`).join("");
}
function fmt(n, digits = 1) {
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: digits });
}
function viewBbox() {
  const b = map.getBounds();
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]; // GeoJSON order
}
function dot(latlng, color, radius = 5) {
  return L.circleMarker(latlng, { radius, color: colors.ink, weight: 1.5, fillColor: color, fillOpacity: 0.9 });
}

function scatter() {
  // Shrink the bbox a touch so points are not on the very edge of the view.
  const [w, s, e, n] = viewBbox();
  const padX = (e - w) * 0.08, padY = (n - s) * 0.08;
  points = turf.randomPoint(120, { bbox: [w + padX, s + padY, e - padX, n - padY] });
  points.features.forEach((f, i) => { f.properties.id = i; }); // ids for turf.collect
  drawPoints();
  rerun();
}

function drawPoints(highlighted) {
  pointLayer.clearLayers();
  const hot = new Set();
  if (highlighted) highlighted.features.forEach((f) => hot.add(f.geometry.coordinates.join()));
  points.features.forEach((f) => {
    const [lng, lat] = f.geometry.coordinates;
    const isHot = hot.has(f.geometry.coordinates.join());
    dot([lat, lng], isHot ? colors.coral : colors.cyan, isHot ? 6 : 4).addTo(pointLayer);
  });
}

function runBuffer(latlng) {
  const km = Number(document.getElementById("radius").value);
  const here = turf.point([latlng.lng, latlng.lat]);
  const zone = turf.buffer(here, km, { units: "kilometers" });
  const inside = turf.pointsWithinPolygon(points, zone);

  resultLayer.clearLayers();
  L.geoJSON(zone, { style: { color: colors.ink, weight: 2, fillColor: colors.acid, fillOpacity: 0.25 } }).addTo(resultLayer);
  dot(latlng, colors.purple, 7).addTo(resultLayer);
  drawPoints(inside);

  setReadout([
    ["Points inside", `${inside.features.length} of ${points.features.length}`],
    ["Buffer area", `${fmt(turf.area(zone) / 1e6, 2)} km²`],
  ]);
  setCalls([
    `turf.point([${latlng.lng.toFixed(4)}, ${latlng.lat.toFixed(4)}])`,
    `turf.buffer(pt, ${km}, {units:'kilometers'})`,
    `turf.pointsWithinPolygon(points, zone)`,
    `turf.area(zone)`,
  ]);
}

function runVoronoi() {
  const bbox = viewBbox();
  const cells = turf.voronoi(points, { bbox });
  resultLayer.clearLayers();
  const palette = [colors.acid, colors.cyan, colors.coral, colors.purple];
  L.geoJSON(cells, {
    style: (f) => ({
      color: colors.ink, weight: 1,
      fillColor: palette[Math.abs(JSON.stringify(f.geometry.coordinates[0][0]).length) % palette.length],
      fillOpacity: 0.28,
    }),
  }).addTo(resultLayer);
  drawPoints();
  setReadout([["Cells", `${cells.features.filter(Boolean).length}`], ["Seed points", `${points.features.length}`]]);
  setCalls([`turf.voronoi(points, {bbox: mapBounds})`]);
}

function runHex() {
  const km = Number(document.getElementById("cell").value);
  const bbox = viewBbox();
  const grid = turf.hexGrid(bbox, km, { units: "kilometers" });
  const counted = turf.collect(grid, points, "id", "hits");
  let max = 0;
  counted.features.forEach((f) => { max = Math.max(max, f.properties.hits.length); });

  resultLayer.clearLayers();
  L.geoJSON(counted, {
    filter: (f) => f.properties.hits.length > 0,
    style: (f) => ({
      color: colors.ink, weight: 1,
      fillColor: colors.purple,
      fillOpacity: 0.12 + 0.68 * (f.properties.hits.length / max),
    }),
  }).addTo(resultLayer);
  drawPoints();
  setReadout([
    ["Hex cells", `${counted.features.length}`],
    ["Occupied", `${counted.features.filter((f) => f.properties.hits.length > 0).length}`],
    ["Busiest cell", `${max} points`],
  ]);
  setCalls([
    `turf.hexGrid(bbox, ${km}, {units:'kilometers'})`,
    `turf.collect(grid, points, 'id', 'hits')`,
  ]);
}

function runMeasure(latlng) {
  const clicked = turf.point([latlng.lng, latlng.lat]);
  if (!measureStart) {
    measureStart = clicked;
    resultLayer.clearLayers();
    dot(latlng, colors.coral, 7).addTo(resultLayer);
    setReadout([["Status", "Now click a second spot"]]);
    setCalls([`turf.point([${latlng.lng.toFixed(4)}, ${latlng.lat.toFixed(4)}])`]);
    return;
  }
  const a = measureStart, b = clicked;
  measureStart = null;
  const km = turf.distance(a, b, { units: "kilometers" });
  const bearing = turf.bearing(a, b);
  const mid = turf.midpoint(a, b);
  const arc = turf.greatCircle(a, b);

  dot(latlng, colors.coral, 7).addTo(resultLayer);
  L.geoJSON(arc, { style: { color: colors.purple, weight: 3, dashArray: "6 6" } }).addTo(resultLayer);
  const [mLng, mLat] = mid.geometry.coordinates;
  dot([mLat, mLng], colors.acid, 6).addTo(resultLayer);

  setReadout([
    ["Distance", `${fmt(km, km < 10 ? 2 : 0)} km`],
    ["Bearing", `${fmt(bearing, 1)}°`],
    ["Midpoint", `${mLat.toFixed(3)}, ${mLng.toFixed(3)}`],
  ]);
  setCalls([
    `turf.distance(a, b, {units:'kilometers'})`,
    `turf.bearing(a, b)`,
    `turf.midpoint(a, b)`,
    `turf.greatCircle(a, b)`,
  ]);
}

function rerun() {
  resultLayer.clearLayers();
  measureStart = null;
  if (mode === "voronoi") runVoronoi();
  else if (mode === "hex") runHex();
  else if (mode === "buffer" && lastClick) runBuffer(lastClick);
  else {
    drawPoints();
    setReadout([["Status", mode === "measure" ? "Click two spots" : "Click the map"]]);
    setCalls([`turf.randomPoint(120, {bbox: mapBounds})`]);
  }
}

map.on("click", (e) => {
  if (mode === "buffer") { lastClick = e.latlng; runBuffer(e.latlng); }
  else if (mode === "measure") runMeasure(e.latlng);
});

document.querySelectorAll(".modes button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".modes button").forEach((b) => b.setAttribute("aria-pressed", "false"));
    btn.setAttribute("aria-pressed", "true");
    mode = btn.dataset.mode;
    modeHint.textContent = hints[mode];
    document.getElementById("bufferControls").hidden = mode !== "buffer";
    document.getElementById("hexControls").hidden = mode !== "hex";
    lastClick = null;
    rerun();
  });
});

document.getElementById("radius").addEventListener("input", (e) => {
  document.getElementById("radiusLabel").textContent = Number(e.target.value).toFixed(1);
  if (mode === "buffer" && lastClick) runBuffer(lastClick);
});
document.getElementById("cell").addEventListener("input", (e) => {
  document.getElementById("cellLabel").textContent = Number(e.target.value).toFixed(1);
  if (mode === "hex") runHex();
});
document.getElementById("rescatter").addEventListener("click", () => { lastClick = null; scatter(); });

scatter();
