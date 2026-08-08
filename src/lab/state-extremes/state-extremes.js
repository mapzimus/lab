"use strict";

const COLORS = { N: "#ff5a3c", E: "#f0c23a", S: "#2ec4a2", W: "#4aa3ff" };
const DIR_WORDS = { N: "Northernmost", E: "Easternmost", S: "Southernmost", W: "Westernmost" };

const VIEWS = {
  conus: { center: [-96.5, 38.5], zoom: 3.15, pitch: 0 },
  alaska: { center: [-153, 64], zoom: 2.85, pitch: 0 },
  hawaii: { center: [-166.2, 23.4], zoom: 3.5, pitch: 0 },
  territories: { center: [-66.5, 17.8], zoom: 4.4, pitch: 0 }, // PR + VI
  pacific: { center: [145.5, 8], zoom: 3.35, pitch: 0 }, // GU + MP + AS
  all: { center: [-140, 30], zoom: 1.55, pitch: 0 },
};

const activeDirs = new Set(["N", "E", "S", "W"]);
let activeView = "conus";
let ready = false;
let popup = null;

const map = new maplibregl.Map({
  container: "map",
  center: VIEWS.conus.center,
  zoom: VIEWS.conus.zoom,
  minZoom: 1.1,
  maxZoom: 9,
  attributionControl: false,
  style: "https://tiles.openfreemap.org/styles/dark",
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

const readout = document.getElementById("readout");
const dirButtons = [...document.querySelectorAll(".dir")];
const viewButtons = [...document.querySelectorAll(".view")];

/** Densify rings so outlines hug the sphere (globe-maps gotcha #1). */
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

function densifyGeom(geom) {
  if (geom.type === "Polygon") {
    return { type: "Polygon", coordinates: geom.coordinates.map((r) => densify(r)) };
  }
  if (geom.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geom.coordinates.map((poly) => poly.map((r) => densify(r))),
    };
  }
  return geom;
}

function densifyCollection(fc) {
  return {
    type: "FeatureCollection",
    features: fc.features.map((f) => ({
      ...f,
      geometry: densifyGeom(f.geometry),
    })),
  };
}

function fmtCoord(lat, lng) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(3)}°${ns} · ${Math.abs(lng).toFixed(3)}°${ew}`;
}

function popupHtml(p) {
  const kind =
    p.kind === "territory" ? "Territory" : p.kind === "district" ? "District" : "State";
  return `<div class="popup">
    <h3>${p.state}</h3>
    <span class="dir-label" style="color:${COLORS[p.direction]}">${DIR_WORDS[p.direction]} · ${kind}</span>
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
  for (const btn of viewButtons) {
    btn.setAttribute("aria-pressed", String(btn.dataset.view === name));
  }
  map.easeTo({
    center: v.center,
    zoom: v.zoom,
    pitch: v.pitch,
    bearing: 0,
    duration: animate ? 900 : 0,
  });
}

async function boot() {
  // Globe projection + atmosphere on the OpenFreeMap dark basemap.
  if (typeof map.setProjection === "function") {
    map.setProjection({ type: "globe" });
  }
  map.setSky({
    "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0],
  });
  map.setLight({ anchor: "map", intensity: 0.4 });

  const [statesRaw, extremes] = await Promise.all([
    fetch("/lab/state-extremes/data/states.geojson").then((r) => {
      if (!r.ok) throw new Error("states.geojson");
      return r.json();
    }),
    fetch("/lab/state-extremes/data/extremes.geojson").then((r) => {
      if (!r.ok) throw new Error("extremes.geojson");
      return r.json();
    }),
  ]);

  const states = densifyCollection(statesRaw);

  map.addSource("states", { type: "geojson", data: states });
  map.addSource("extremes", { type: "geojson", data: extremes });

  // Crisp outlines only — no translucent fill wash.
  map.addLayer({
    id: "states-line",
    type: "line",
    source: "states",
    paint: {
      "line-color": [
        "match", ["get", "kind"],
        "territory", "#8fd3ff",
        "#c8d0d8",
      ],
      "line-width": [
        "match", ["get", "kind"],
        "territory", 1.35,
        0.85,
      ],
      "line-opacity": 1,
    },
  });

  map.addLayer({
    id: "extremes-halo",
    type: "circle",
    source: "extremes",
    paint: {
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        1.5, 5,
        4, 7.5,
        7, 10,
      ],
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
        "interpolate", ["linear"], ["zoom"],
        1.5, 3.2,
        4, 5,
        7, 7,
      ],
      "circle-color": [
        "match", ["get", "direction"],
        "N", COLORS.N,
        "E", COLORS.E,
        "S", COLORS.S,
        "W", COLORS.W,
        "#fff",
      ],
      "circle-stroke-width": 1.15,
      "circle-stroke-color": "#f0ecdf",
      "circle-opacity": 1,
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
    const kind = p.kind === "territory" ? "territory" : p.kind === "district" ? "DC" : "state";
    setReadout(`${p.state} · ${DIR_WORDS[p.direction]} · ${kind} · ${fmtCoord(p.lat, p.lng)}`);
  });
  map.on("mouseleave", "extremes", () => {
    map.getCanvas().style.cursor = "";
    setReadout("");
  });

  map.on("click", "extremes", (e) => {
    e.preventDefault();
    const f = e.features?.[0];
    if (!f) return;
    const p = f.properties;
    if (popup) popup.remove();
    popup = new maplibregl.Popup({ offset: 10, maxWidth: "240px", closeButton: true })
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

// Gotcha 3: style.load, not load — don't wait on every tile.
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
