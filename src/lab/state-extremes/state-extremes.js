"use strict";

const COLORS = { N: "#c23b22", E: "#c9a227", S: "#1f7a6b", W: "#2a5f8f" };
const DIR_WORDS = { N: "Northernmost", E: "Easternmost", S: "Southernmost", W: "Westernmost" };

const VIEWS = {
  conus: { center: [-96.5, 38.5], zoom: 3.55, bounds: [[-125.5, 24.2], [-66.5, 49.6]] },
  alaska: { center: [-153, 64], zoom: 3.1, bounds: [[172.2, 51], [-129.5, 71.6]] },
  hawaii: { center: [-157.5, 20.5], zoom: 5.4, bounds: [[-178.6, 18.7], [-154.6, 28.6]] },
  all: { center: [-155, 40], zoom: 2.15, bounds: [[172.2, 18.7], [-66.5, 71.6]] },
};

const activeDirs = new Set(["N", "E", "S", "W"]);
let activeView = "conus";
let popup = null;
let ready = false;

const map = new maplibregl.Map({
  container: "map",
  center: VIEWS.conus.center,
  zoom: VIEWS.conus.zoom,
  minZoom: 1.5,
  maxZoom: 10,
  attributionControl: false,
  style: {
    version: 8,
    sources: {},
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#d7e2dc" },
      },
    ],
  },
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

const readout = document.getElementById("readout");
const dirButtons = [...document.querySelectorAll(".dir")];
const viewButtons = [...document.querySelectorAll(".view")];

function fmtCoord(lat, lng) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(3)}°${ns} · ${Math.abs(lng).toFixed(3)}°${ew}`;
}

function popupHtml(p) {
  return `<div class="popup">
    <h3>${p.state}</h3>
    <span class="dir-label" style="color:${COLORS[p.direction]}">${DIR_WORDS[p.direction]} point</span>
    <p class="coords">${fmtCoord(p.lat, p.lng)}</p>
  </div>`;
}

function applyFilter() {
  if (!ready) return;
  const dirs = [...activeDirs];
  const filter = dirs.length === 4
    ? null
    : dirs.length === 0
      ? ["==", ["get", "direction"], "__none__"]
      : ["in", ["get", "direction"], ["literal", dirs]];
  map.setFilter("extremes-halo", filter);
  map.setFilter("extremes", filter);
}

function fitView(name, animate = true) {
  activeView = name;
  const v = VIEWS[name];
  // Alaska spans the antimeridian — center/zoom is more reliable than fitBounds.
  if (name === "alaska" || name === "all" || name === "hawaii") {
    map.easeTo({ center: v.center, zoom: v.zoom, duration: animate ? 900 : 0 });
  } else {
    map.fitBounds(v.bounds, { padding: 48, duration: animate ? 900 : 0, maxZoom: 5.5 });
  }
  for (const btn of viewButtons) {
    btn.setAttribute("aria-pressed", String(btn.dataset.view === name));
  }
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

async function boot() {
  const [states, extremes] = await Promise.all([
    fetch("/lab/state-extremes/data/states.geojson").then((r) => {
      if (!r.ok) throw new Error("states.geojson");
      return r.json();
    }),
    fetch("/lab/state-extremes/data/extremes.geojson").then((r) => {
      if (!r.ok) throw new Error("extremes.geojson");
      return r.json();
    }),
  ]);

  map.addSource("states", { type: "geojson", data: states });
  map.addSource("extremes", { type: "geojson", data: extremes });

  map.addLayer({
    id: "states-fill",
    type: "fill",
    source: "states",
    paint: {
      "fill-color": "#c5d2c9",
      "fill-opacity": 0.85,
    },
  });
  map.addLayer({
    id: "states-line",
    type: "line",
    source: "states",
    paint: {
      "line-color": "#7f9188",
      "line-width": 0.7,
      "line-opacity": 0.9,
    },
  });

  map.addLayer({
    id: "extremes-halo",
    type: "circle",
    source: "extremes",
    paint: {
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        2, 4.5,
        5, 7,
        8, 10,
      ],
      "circle-color": "#f7faf7",
      "circle-opacity": 0,
      "circle-opacity-transition": { duration: 700 },
    },
  });

  map.addLayer({
    id: "extremes",
    type: "circle",
    source: "extremes",
    paint: {
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        2, 2.8,
        5, 4.5,
        8, 6.5,
      ],
      "circle-color": [
        "match", ["get", "direction"],
        "N", COLORS.N,
        "E", COLORS.E,
        "S", COLORS.S,
        "W", COLORS.W,
        "#333",
      ],
      "circle-stroke-width": 1.1,
      "circle-stroke-color": "#1a2430",
      "circle-opacity": 0,
      "circle-opacity-transition": { duration: 700 },
      "circle-stroke-opacity": 0,
      "circle-stroke-opacity-transition": { duration: 700 },
    },
  });

  ready = true;
  applyFilter();
  fitView("conus", false);

  // Staggered fade-in so the dots arrive after the land settles.
  requestAnimationFrame(() => {
    map.setPaintProperty("extremes-halo", "circle-opacity", 0.95);
    map.setPaintProperty("extremes", "circle-opacity", 1);
    map.setPaintProperty("extremes", "circle-stroke-opacity", 1);
  });

  map.on("mousemove", "extremes", (e) => {
    map.getCanvas().style.cursor = "pointer";
    const f = e.features?.[0];
    if (!f) return;
    const p = f.properties;
    setReadout(`${p.state} · ${DIR_WORDS[p.direction]} · ${fmtCoord(p.lat, p.lng)}`);
  });
  map.on("mouseleave", "extremes", () => {
    map.getCanvas().style.cursor = "";
    setReadout("");
  });

  map.on("click", "extremes", (e) => {
    const f = e.features?.[0];
    if (!f) return;
    const p = f.properties;
    if (popup) popup.remove();
    popup = new maplibregl.Popup({ offset: 10, maxWidth: "240px" })
      .setLngLat(f.geometry.coordinates)
      .setHTML(popupHtml(p))
      .addTo(map);
  });

  map.on("click", (e) => {
    if (e.defaultPrevented) return;
    const hits = map.queryRenderedFeatures(e.point, { layers: ["extremes"] });
    if (!hits.length && popup) {
      popup.remove();
      popup = null;
    }
  });
}

map.once("style.load", () => {
  boot().catch((err) => {
    console.error(err);
    setReadout("Could not load state extremes data.");
  });
});

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
