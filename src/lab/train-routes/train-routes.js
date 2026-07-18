"use strict";

const COLORS = {
  "high-speed": "#ff6b4a",
  scenic: "#2f9e44",
  night: "#7455d9",
  classic: "#c47f17",
};

const map = L.map("map", { worldCopyJump: true }).setView([30, 20], 2);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const routeList = document.getElementById("routeList");
const readout = document.getElementById("readout");
const filterButtons = [...document.querySelectorAll(".filters button")];

let activeCategory = "all";
let selectedSlug = null;
const routes = []; // { feature, layer, casing, item }

function baseStyle(feature) {
  return { color: COLORS[feature.properties.category], weight: 3.5, opacity: 0.9 };
}

function fmt(n) {
  return n.toLocaleString("en-US");
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

function applyState() {
  let shown = 0;
  let totalKm = 0;
  for (const r of routes) {
    const show = visible(r.feature);
    r.item.hidden = !show;
    if (show) {
      shown += 1;
      totalKm += r.feature.properties.km;
      if (!map.hasLayer(r.layer)) { r.casing.addTo(map); r.layer.addTo(map); }
      const dim = selectedSlug && r.feature.properties.slug !== selectedSlug;
      r.layer.setStyle({ ...baseStyle(r.feature), opacity: dim ? 0.25 : 0.9, weight: dim ? 3 : r.feature.properties.slug === selectedSlug ? 5 : 3.5 });
      r.casing.setStyle({ opacity: dim ? 0.3 : 0.9 });
    } else {
      map.removeLayer(r.layer);
      map.removeLayer(r.casing);
    }
    r.item.classList.toggle("selected", r.feature.properties.slug === selectedSlug);
  }
  readout.innerHTML = `<div><dt>Routes shown</dt><dd>${shown}</dd></div><div><dt>Combined length</dt><dd>${fmt(totalKm)} km</dd></div>`;
}

function select(slug, { fly = true } = {}) {
  selectedSlug = slug;
  applyState();
  const r = routes.find((x) => x.feature.properties.slug === slug);
  if (!r) return;
  if (fly) map.fitBounds(r.layer.getBounds(), { padding: [40, 40] });
  r.layer.openPopup();
  r.item.scrollIntoView({ block: "nearest" });
}

function deselect() {
  if (!selectedSlug) return;
  selectedSlug = null;
  map.closePopup();
  applyState();
}

fetch("/lab/train-routes/routes.geojson")
  .then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  })
  .then((geojson) => {
    for (const feature of geojson.features) {
      const p = feature.properties;
      const latlngs = feature.geometry.coordinates.map(([lon, lat]) => [lat, lon]);

      const casing = L.polyline(latlngs, { color: "#fffdf8", weight: 7, opacity: 0.9, interactive: false });
      const layer = L.polyline(latlngs, baseStyle(feature));
      layer.bindPopup(popupHtml(p), { maxWidth: 320 });
      layer.on("click", (e) => { L.DomEvent.stopPropagation(e); select(p.slug, { fly: false }); });
      layer.on("popupclose", () => { if (selectedSlug === p.slug) deselect(); });
      layer.on("mouseover", () => { if (selectedSlug !== p.slug) layer.setStyle({ weight: 6 }); });
      layer.on("mouseout", () => { if (selectedSlug !== p.slug) applyState(); });

      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.innerHTML = `<span class="route-name"><span class="route-dot" style="background:${COLORS[p.category]}"></span>${p.name}</span>
        <span class="route-meta">${p.endpoints} · ${fmt(p.km)} km · ${p.duration}</span>`;
      button.addEventListener("click", () => select(p.slug));
      item.append(button);
      routeList.append(item);

      routes.push({ feature, layer, casing, item });
    }
    applyState();
  })
  .catch((err) => {
    readout.innerHTML = `<div><dt>Error</dt><dd>routes failed to load</dd></div>`;
    console.error("Could not load routes.geojson:", err);
  });

map.on("click", deselect);

for (const button of filterButtons) {
  button.addEventListener("click", () => {
    activeCategory = button.dataset.cat;
    for (const b of filterButtons) b.setAttribute("aria-pressed", String(b === button));
    if (selectedSlug) {
      const r = routes.find((x) => x.feature.properties.slug === selectedSlug);
      if (r && !visible(r.feature)) { selectedSlug = null; map.closePopup(); }
    }
    applyState();
  });
}
