/* The Century of Africa — scroll-driven MapLibre story.
   No tiles, no backend: every layer is GeoJSON committed next to this file. */
"use strict";

const DATA = "data/";
const EPOCHS = [1975, 1990, 2000, 2010, 2020, 2030];
const EPOCH_COLORS = {
  1975: "#6e5f46", 1990: "#8a713f", 2000: "#a98738",
  2010: "#c99e33", 2020: "#e8b52e", 2030: "#ffd84d",
};
const CITY_EPOCHS = [1975, 1990, 2000, 2010, 2020, 2025, 2030, 2040, 2050];

const POP_RAMP = [0, "#242b39", 10, "#3d3a52", 25, "#5c4368", 50, "#8a4f6d",
                  100, "#c05f60", 250, "#f0924c", 450, "#ffd166"];
const MULT_RAMP = [0.5, "#4a6fa5", 0.85, "#39415a", 1.0, "#2c3140", 1.6, "#8a4457",
                   2.4, "#d06a4e", 3.4, "#f4a93a"];
// Median age: young countries hot (the story's accent), old countries blue.
const AGE_RAMP = [15, "#f4a93a", 22, "#c47a4e", 30, "#8a6a70", 40, "#5a5f88", 50, "#4a6fa5"];
// Service access runs the other way: the shortfall is the subject, so the
// countries where most people go without are the ones that burn.
const ACCESS_RAMP = [0, "#f4a93a", 25, "#d8734a", 50, "#9c5a6b", 75, "#5f5a86", 100, "#3a4560"];

const AFRICA_BOUNDS = [[-19.5, -36.5], [53.5, 38.5]];
const WEST_AFRICA_BOUNDS = [[-18, 3], [16, 15]];
const KINSHASA_BOUNDS = [[14.97, -4.72], [15.78, -3.98]];
const POOL_BOUNDS = [[15.12, -4.48], [15.55, -4.05]];
// Kinshasa out to the Atlantic, so the last step can show the whole thread.
const MATADI_BOUNDS = [[12.15, -6.30], [15.85, -4.02]];

const prefersStill = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------------------------------------------------------- helpers */

function ramp(prop, stops) {
  const e = ["interpolate", ["linear"], ["coalesce", ["get", prop], -1]];
  for (let i = 0; i < stops.length; i += 2) e.push(stops[i], stops[i + 1]);
  return ["case", ["has", prop], e, "#1a1e26"];
}

function cityRadius(prop, k) {
  return ["*", k, ["sqrt", ["coalesce", ["get", prop], 0]]];
}

function padding() {
  const w = innerWidth, h = innerHeight;
  if (w <= 640) return { top: 70, bottom: Math.round(h * 0.40), left: 16, right: 16 };
  return { top: 48, bottom: 48, left: 480, right: 56 };
}

function shortName(n) {
  return n
    .replace("Democratic Republic of the Congo", "DR Congo")
    .replace("United Republic of Tanzania", "Tanzania")
    .replace("United States of America", "the United States")
    .replace("Russian Federation", "Russia")
    .replace("United Kingdom", "the United Kingdom");
}

/* ------------------------------------------------------------------ data */

// Bumped whenever the pipeline rewrites data/. The query string lets the
// files be cached hard while a deploy still delivers fresh ones.
const DATA_VERSION = "2026-08-28";

// The story reads perfectly as text, so the map layers it cannot show without
// help are loaded in two waves: what chapters 1 to 3 need, then the rest.
const CORE_FILES = [
  "countries.geojson", "population.json", "cities.geojson",
  "corridors-existing.geojson", "corridors-planned.geojson", "corridors-model.geojson",
];
const DEFERRED_FILES = [
  "lights.geojson", "kinshasa-builtup.geojson", "kinshasa-water.geojson",
  "kinshasa-roads.geojson", "kinshasa-density.geojson", "kinshasa-slope.geojson",
  "kinshasa-streets.geojson", "kinshasa-communes.geojson", "matadi-corridor.geojson",
  "kinshasa-streets.json", "kinshasa-expansion.json",
];

function grab(file) {
  return fetch(`${DATA}${file}?v=${DATA_VERSION}`).then((r) => {
    if (!r.ok) throw new Error(file + ": " + r.status);
    return r.json();
  });
}

function notice(html) {
  const el = document.getElementById("error");
  el.innerHTML = html;
  el.classList.add("on");
}

// MapLibre throws on construction without WebGL, and a thrown map should never
// take the writing down with it.
function webglOK() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

if (!webglOK()) {
  notice("This browser cannot draw maps, so the maps are missing. <b>The story below still reads on its own.</b>");
  // The chart and the ticker are plain SVG and owe nothing to WebGL.
  grab("population.json").then((p) => {
    buildRegionChart(p.regions, p.africaBand);
    buildCrossoverTicker(p.crossovers);
  }).catch((err) => console.error(err));
} else {
  Promise.all(CORE_FILES.map(grab)).then(boot).catch((err) => {
    console.error(err);
    notice("The map data did not load. <b>The story below still reads on its own.</b>");
  });
}


/* ------------------------------------------- deferred chapter 3 and 4 layers */
// Added under the corridor layers with beforeId so the late arrivals land in
// exactly the stacking order they would have had if they had loaded up front.
function addDeferredLayers(map, d) {
  const BELOW = map.getLayer("cor-rail") ? "cor-rail" : undefined;
  map.addSource("lights", { type: "geojson", data: d.lights });
  map.addSource("kin-built", { type: "geojson", data: d.kinBuilt });
  map.addSource("kin-water", { type: "geojson", data: d.kinWater });
  map.addSource("kin-roads", { type: "geojson", data: d.kinRoads });
  map.addSource("kin-density", { type: "geojson", data: d.kinDensity });
  map.addSource("kin-slope", { type: "geojson", data: d.kinSlope });
  map.addSource("kin-streets", { type: "geojson", data: d.kinStreets });
  map.addSource("kin-communes", { type: "geojson", data: d.kinCommunes });
  map.addSource("matadi", { type: "geojson", data: d.matadi });

  // Observed nighttime lights (chapter 3's reality check).
  map.addLayer({
    id: "lights-lit", type: "fill", source: "lights",
    filter: ["==", ["get", "class"], "lit"],
    paint: { "fill-color": "#8a6a35", "fill-opacity": 0, "fill-opacity-transition": { duration: 700 } },
  }, BELOW);
  map.addLayer({
    id: "lights-bright", type: "fill", source: "lights",
    filter: ["==", ["get", "class"], "bright"],
    paint: { "fill-color": "#ffd166", "fill-opacity": 0, "fill-opacity-transition": { duration: 700 } },
  }, BELOW);

  // Kinshasa deep-dive stack (invisible until chapter 4). Slope sits at the
  // bottom: it is the ground the city had to build on, so everything else
  // paints over it.
  for (const [cls, color] of [["steep", "#3f3529"], ["steepest", "#7d5133"]]) {
    map.addLayer({
      id: "slope-" + cls, type: "fill", source: "kin-slope",
      filter: ["==", ["get", "class"], cls],
      paint: { "fill-color": color, "fill-opacity": 0, "fill-opacity-transition": { duration: 600 } },
    }, BELOW);
  }
  map.addLayer({
    id: "kin-water", type: "fill", source: "kin-water",
    paint: { "fill-color": "#1d3242", "fill-opacity": 0, "fill-opacity-transition": { duration: 600 } },
  }, BELOW);
  // Painter order: newest epoch first so 1975 ends up on top and each
  // later epoch shows only as its growth ring around the older fabric.
  [...EPOCHS].reverse().forEach((epoch) => {
    map.addLayer({
      id: "built-" + epoch, type: "fill", source: "kin-built",
      filter: ["==", ["get", "epoch"], epoch],
      paint: {
        "fill-color": EPOCH_COLORS[epoch],
        "fill-opacity": 0,
        "fill-opacity-transition": { duration: 600 },
      },
    }, BELOW);
  });
  // Density bands paint over the growth rings when chapter 4 asks how many
  // people share the ground; lowest band first so hotter bands sit on top.
  for (const [band, color] of [[5000, "#5a3a7a"], [15000, "#95457f"], [30000, "#d5566a"], [60000, "#ff9d5c"]]) {
    map.addLayer({
      id: "density-" + band, type: "fill", source: "kin-density",
      filter: ["==", ["get", "min"], band],
      paint: { "fill-color": color, "fill-opacity": 0, "fill-opacity-transition": { duration: 600 } },
    }, BELOW);
  }
  // Commune outlines: orientation for a footprint most readers cannot name
  // any part of. Hairline, because they are context and not the subject.
  map.addLayer({
    id: "kin-communes", type: "line", source: "kin-communes",
    paint: {
      "line-color": "#6f7a89", "line-width": 0.7, "line-dasharray": [2, 2],
      "line-opacity": 0, "line-opacity-transition": { duration: 600 },
    },
  }, BELOW);
  // The rest of the street grid, one class below the primary roads.
  map.addLayer({
    id: "kin-streets", type: "line", source: "kin-streets",
    paint: {
      "line-color": "#9aa6b4",
      "line-width": ["case", ["==", ["get", "kind"], "secondary"], 1.0, 0.6],
      "line-opacity": 0, "line-opacity-transition": { duration: 600 },
    },
  }, BELOW);
  map.addLayer({
    id: "matadi-rail", type: "line", source: "matadi",
    filter: ["==", ["get", "kind"], "rail"],
    paint: {
      "line-color": "#f4a93a", "line-width": 1.6, "line-dasharray": [3, 2],
      "line-opacity": 0, "line-opacity-transition": { duration: 600 },
    },
  }, BELOW);
  map.addLayer({
    id: "matadi-road", type: "line", source: "matadi",
    filter: ["==", ["get", "kind"], "road"],
    paint: {
      "line-color": "#d8734a", "line-width": 1.8,
      "line-opacity": 0, "line-opacity-transition": { duration: 600 },
    },
  }, BELOW);
  map.addLayer({
    id: "kin-roads", type: "line", source: "kin-roads",
    paint: {
      "line-color": ["case", ["==", ["get", "kind"], "major"], "#aeb6c2", "#7d8590"],
      "line-width": ["case", ["==", ["get", "kind"], "major"], 1.4, 0.6],
      "line-opacity": 0, "line-opacity-transition": { duration: 600 },
    },
  }, BELOW);
}

function boot([countries, population, cities, corExisting, corPlanned, corModel]) {
  buildRegionChart(population.regions, population.africaBand);
  buildCrossoverTicker(population.crossovers);

  const map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      projection: { type: "globe" },
      sources: {},
      layers: [{ id: "space", type: "background", paint: { "background-color": "#0a0c11" } }],
    },
    center: [12, 4],
    zoom: 1.6,
    attributionControl: { compact: true },
    interactive: false,
  });
  map.getContainer().querySelector("canvas").setAttribute("aria-hidden", "true");

  map.on("style.load", () => {
    map.addSource("countries", { type: "geojson", data: countries, attribution:
      "Natural Earth · UN WPP 2024 & WUP 2025 · JRC GHSL (CC BY 4.0) · © OpenStreetMap contributors · Hoornweg & Pope 2017" });
    map.addSource("cities", { type: "geojson", data: cities });
    map.addSource("cor-existing", { type: "geojson", data: corExisting });
    map.addSource("cor-planned", { type: "geojson", data: corPlanned });
    map.addSource("cor-model", { type: "geojson", data: corModel });

    map.addLayer({
      id: "countries-fill", type: "fill", source: "countries",
      paint: {
        "fill-color": ramp("pop2025", POP_RAMP),
        "fill-opacity": ["case", ["==", ["coalesce", ["get", "africa"], 0], 1], 0.88, 0.3],
        "fill-opacity-transition": { duration: 700 },
        "fill-color-transition": { duration: 700 },
      },
    });
    map.addLayer({
      id: "countries-line", type: "line", source: "countries",
      paint: { "line-color": "#0e1015", "line-width": 0.6, "line-opacity": 0.9 },
    });

    // Corridors (chapter 3).
    map.addLayer({
      id: "cor-rail", type: "line", source: "cor-existing",
      filter: ["==", ["get", "kind"], "rail"],
      paint: { "line-color": "#8b93a0", "line-width": 1.1, "line-opacity": 0, "line-opacity-transition": { duration: 600 } },
    });
    map.addLayer({
      id: "cor-road", type: "line", source: "cor-existing",
      filter: ["==", ["get", "kind"], "road"],
      paint: { "line-color": "#4a5261", "line-width": 0.7, "line-opacity": 0, "line-opacity-transition": { duration: 600 } },
    });
    map.addLayer({
      id: "cor-tah", type: "line", source: "cor-planned",
      filter: ["==", ["get", "status"], "planned"],
      layout: { "line-cap": "round" },
      paint: {
        "line-color": "#c9a53f", "line-width": 1.6, "line-dasharray": [1.6, 2.2],
        "line-opacity": 0, "line-opacity-transition": { duration: 600 },
      },
    });
    map.addLayer({
      id: "cor-built", type: "line", source: "cor-planned",
      filter: ["!=", ["get", "status"], "planned"],
      layout: { "line-cap": "round" },
      paint: {
        "line-color": ["case", ["==", ["get", "china"], 1], "#e0645a", "#8fb8e8"],
        "line-width": 2.4,
        "line-opacity": 0, "line-opacity-transition": { duration: 600 },
      },
    });
    map.addLayer({
      id: "cor-model", type: "line", source: "cor-model",
      layout: { "line-cap": "round" },
      paint: {
        "line-color": "#f4a93a",
        "line-width": ["interpolate", ["linear"], ["get", "score"], 20, 1.2, 400, 3.2, 9500, 5.5],
        "line-opacity": 0, "line-opacity-transition": { duration: 600 },
      },
    });

    // Cities (chapter 2).
    map.addLayer({
      id: "cities-2100", type: "circle", source: "cities",
      filter: ["has", "p2100"],
      paint: {
        "circle-radius": cityRadius("p2100", 3.2),
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": "#ffd166",
        "circle-stroke-width": 1.4,
        "circle-stroke-opacity": 0,
        "circle-stroke-opacity-transition": { duration: 700 },
      },
    });
    map.addLayer({
      id: "cities", type: "circle", source: "cities",
      paint: {
        "circle-radius": cityRadius("p1975", 3.2),
        "circle-radius-transition": { duration: 900 },
        "circle-color": "#f4a93a",
        "circle-opacity": 0,
        "circle-opacity-transition": { duration: 600 },
        "circle-stroke-color": "#101319",
        "circle-stroke-width": 0.8,
        "circle-stroke-opacity": 0,
        "circle-stroke-opacity-transition": { duration: 600 },
      },
    });

    initMarkers(map, cities);
    initCountryLabels(map, population.labels || []);
    initPlaceLabels(map);
    const refreshStep = initSteps(map);

    Promise.all(DEFERRED_FILES.map(grab)).then(([lights, kinBuilt, kinWater, kinRoads,
      kinDensity, kinSlope, kinStreets, kinCommunes, matadi, streetStats, expansion]) => {
      addDeferredLayers(map, { lights, kinBuilt, kinWater, kinRoads, kinDensity,
        kinSlope, kinStreets, kinCommunes, matadi });
      initCommuneLabels(map, kinCommunes);
      initMatadiLabels(map, matadi);
      buildExpansionChart(expansion);
      buildStreetChart(streetStats);
      refreshStep();
    }).catch((err) => {
      console.error(err);
      notice("The night lights and Kinshasa layers did not load. <b>The rest of the story is unaffected.</b>");
    });
  });
}

/* ------------------------------------------------- country name labels */
// Most readers can't identify African countries by outline alone, so the
// choropleth chapters carry name labels. HTML markers again (no glyph
// server), with the animation on an inner element MapLibre never touches.
let countryMarkers = [];

function initCountryLabels(map, labels) {
  const style = document.createElement("style");
  style.textContent = `
    .country-label { pointer-events: none; }
    .country-label .inner { display: block; font-family: "IBM Plex Mono", monospace;
      font-size: 9.5px; font-weight: 400; letter-spacing: 0.08em; text-transform: uppercase;
      color: #9aa1ad; white-space: nowrap; text-shadow: 0 1px 4px #000, 0 0 8px rgba(0,0,0,0.85);
      opacity: 0; transition: opacity 0.5s ease; }
    .country-label.on .inner { opacity: 0.85; }
    /* Chapters 2 and 3 keep the names for orientation but drop them back so
       the cities and corridors stay the subject. */
    .country-label.on.dim .inner { opacity: 0.42; }
    .place-label { pointer-events: none; }
    .place-label .inner { display: block; font-family: "IBM Plex Mono", monospace;
      white-space: nowrap; opacity: 0; transition: opacity 0.5s ease;
      text-shadow: 0 1px 4px #000, 0 0 9px rgba(0,0,0,0.9); }
    .place-label.on .inner { opacity: 1; }
    .place-label.city .inner { font-size: 12px; font-weight: 600; color: #e7e9ec; letter-spacing: 0.04em; }
    .place-label.spot .inner { font-size: 9.5px; color: #9aa1ad; letter-spacing: 0.08em; text-transform: uppercase; }
    .place-label.water .inner { font-size: 10px; color: #7f9ec2; letter-spacing: 0.16em; text-transform: uppercase; font-style: italic; }
    /* The sea-corridor labels carry a note under the name; without display
       block it runs on and reads as one mangled word. */
    .place-label small { display: block; margin-top: 2px; font-size: 9px;
      font-weight: 400; letter-spacing: 0.02em; color: #99a0ab; }
    @media (max-width: 640px) { .country-label .inner { font-size: 8px; letter-spacing: 0.04em; } }`;
  document.head.appendChild(style);
  for (const [iso3, name, lon, lat] of labels) {
    const el = document.createElement("div");
    el.className = "country-label";
    el.dataset.iso3 = iso3;
    el.innerHTML = `<span class="inner">${name}</span>`;
    new maplibregl.Marker({ element: el, anchor: "center" })
      .setLngLat([lon, lat]).addTo(map);
    countryMarkers.push(el);
  }
}

// Countries whose largest city is already labelled on the map. Naming both
// stacks two words on one spot, so the country name steps aside in the
// chapters where the city labels are the point.
const CITY_NAMED = new Set(["NGA", "COD", "EGY", "TZA", "KEN", "CIV", "AGO"]);

function setCountryLabels(mode) {
  for (const el of countryMarkers) {
    const hide = mode === "dim" && CITY_NAMED.has(el.dataset.iso3);
    el.classList.toggle("on", !!mode && !hide);
    el.classList.toggle("dim", mode === "dim");
  }
}

/* --------------------------------------------------- Kinshasa place labels */
// At city zoom the country names are gone and the reader has no anchors, so
// the last chapter names the two capitals, the water, and the two landmarks
// the narrative points at.
const KIN_PLACES = [
  ["Kinshasa", 15.28, -4.43, "city"],
  ["Brazzaville", 15.23, -4.20, "city"],
  ["Malebo Pool", 15.46, -4.26, "water"],
  ["Congo River", 15.06, -4.57, "water"],
  ["N'Djili airport", 15.46, -4.40, "spot"],
  ["N'sele", 15.67, -4.33, "spot"],
];
let placeMarkers = [];

function initPlaceLabels(map) {
  for (const [name, lon, lat, kind] of KIN_PLACES) {
    const el = document.createElement("div");
    el.className = `place-label ${kind}`;
    el.innerHTML = `<span class="inner">${name}</span>`;
    new maplibregl.Marker({ element: el, anchor: "center" })
      .setLngLat([lon, lat]).addTo(map);
    placeMarkers.push(el);
  }
}

function setPlaceLabels(on) {
  for (const el of placeMarkers) el.classList.toggle("on", !!on);
}

/* ------------------------------------------------------- commune labels */
// The 24 communes are how Kinshasa talks about itself. Naming a few turns the
// footprint into somewhere: Gombe is the colonial core, Masina and Kimbanseke
// are the self-built east, Ngaliema climbs the western hills.
// Only the ones the reader can actually see at the chapter's zoom, and only
// where they do not collide with a place label already naming that spot.
// Deliberately short. The inner communes are a few square kilometres each and
// their labels piled into an unreadable stack at this zoom, so this keeps the
// ones a reader can actually pick out: the core, the big self-built east, the
// western hills, and the industrial spine. "Kinshasa" the commune is dropped
// because the city label already sits there.
const COMMUNE_LABELS = new Set([
  "Gombe", "Ngaliema", "Limete", "Masina", "Kimbanseke",
  "Lemba", "Kisenso", "Selembao", "Ndjili",
]);
let communeMarkers = [];

function initCommuneLabels(map, communes) {
  for (const f of communes.features || []) {
    const p = f.properties;
    if (!COMMUNE_LABELS.has(p.name) || p.lon == null) continue;
    const el = document.createElement("div");
    el.className = "commune-label";
    el.innerHTML = `<span class="inner">${p.name}</span>`;
    new maplibregl.Marker({ element: el, anchor: "center" })
      .setLngLat([p.lon, p.lat]).addTo(map);
    communeMarkers.push(el);
  }
}

function setCommuneLabels(on) {
  for (const el of communeMarkers) el.classList.toggle("on", !!on);
}

/* --------------------------------------------- labels for the sea corridor */
let matadiMarkers = [];

function initMatadiLabels(map, corridor) {
  for (const f of corridor.features || []) {
    if (f.properties.kind !== "place") continue;
    const [lon, lat] = f.geometry.coordinates;
    const el = document.createElement("div");
    el.className = "place-label city";
    el.innerHTML = `<span class="inner">${f.properties.name}<small>${f.properties.note}</small></span>`;
    new maplibregl.Marker({ element: el, anchor: "center" })
      .setLngLat([lon, lat]).addTo(map);
    matadiMarkers.push(el);
  }
}

function setMatadiLabels(on) {
  for (const el of matadiMarkers) el.classList.toggle("on", !!on);
}

/* -------------------------------------------------------- HTML city labels */

const LABEL_CITIES = ["Lagos", "Kinshasa", "Al-Qahirah (Cairo)", "Dar es Salaam",
                      "Luanda", "Nairobi", "Abidjan"];
let markers = [];

function initMarkers(map, cities) {
  const style = document.createElement("style");
  style.textContent = `
    .city-label { pointer-events: none; }
    /* MapLibre positions and fades the marker root with inline styles, so the
       show/hide animation lives on an inner element it never touches. */
    .city-label .inner { display: block; font-family: "IBM Plex Mono", monospace;
      font-size: 10.5px; font-weight: 600; color: #e7e9ec; white-space: nowrap;
      text-shadow: 0 1px 4px #000, 0 0 10px rgba(0,0,0,0.9);
      transform: translateY(-11px); opacity: 0; transition: opacity 0.5s ease; }
    .city-label.on .inner { opacity: 1; }
    .city-label small { display: block; font-weight: 400; color: #99a0ab; font-size: 9px; }`;
  document.head.appendChild(style);
  for (const f of cities.features) {
    const name = f.properties.name;
    if (!LABEL_CITIES.includes(name)) continue;
    const el = document.createElement("div");
    el.className = "city-label";
    el.dataset.name = name;
    const display = name.includes("(") ? name.match(/\(([^)]+)\)/)[1] : name;
    el.innerHTML = `<span class="inner">${display}<small></small></span>`;
    const m = new maplibregl.Marker({ element: el, anchor: "bottom" })
      .setLngLat(f.geometry.coordinates).addTo(map);
    markers.push({ el, props: f.properties });
  }
}

function setLabels(epoch) {
  for (const { el, props } of markers) {
    const pop = props["p" + epoch];
    if (epoch && pop) {
      el.classList.add("on");
      el.querySelector("small").textContent = pop >= 10 ? Math.round(pop) + "M" : pop.toFixed(1) + "M";
    } else {
      el.classList.remove("on");
    }
  }
}

/* ------------------------------------------------------------- step engine */

function initSteps(map) {
  const hud = document.getElementById("epoch-hud");
  const hudYr = hud.querySelector(".yr");

  const fly = (bounds, maxZoom) => {
    map.fitBounds(bounds, {
      padding: padding(), maxZoom: maxZoom || 12,
      duration: prefersStill ? 0 : 2200, essential: true,
    });
  };

  // Ambient globe rotation while the hero is on screen. A slow drift sells
  // the globe projection; any camera move or step change cancels it.
  // The delay before the drift starts has to be cancellable too. Without that,
  // two calls to the intro step queue two timers, spinStop can only cancel the
  // frame of one, and the survivor pins the camera for the rest of the story.
  let spinFrame = null, spinTimer = null;
  const spinStop = () => {
    if (spinFrame) { cancelAnimationFrame(spinFrame); spinFrame = null; }
    if (spinTimer) { clearTimeout(spinTimer); spinTimer = null; }
  };
  const spinStart = () => {
    if (prefersStill || spinFrame || spinTimer) return;
    let last = performance.now();
    const tick = (now) => {
      const c = map.getCenter();
      c.lng += ((now - last) / 1000) * 1.1; // degrees per second
      last = now;
      map.jumpTo({ center: c });
      spinFrame = requestAnimationFrame(tick);
    };
    // Wait out the fly-in so the drift doesn't fight the camera animation.
    spinTimer = setTimeout(() => {
      spinTimer = null;
      if (active === "intro" && !exploring) spinFrame = requestAnimationFrame(tick);
    }, 2400);
  };

  const setChoropleth = (prop, stops) =>
    map.setPaintProperty("countries-fill", "fill-color", ramp(prop, stops));
  const countriesOpacity = (afr, other) =>
    map.setPaintProperty("countries-fill", "fill-opacity",
      ["case", ["==", ["coalesce", ["get", "africa"], 0], 1], afr, other]);

  const setCityEpoch = (epoch, opacity) => {
    if (epoch) map.setPaintProperty("cities", "circle-radius", cityRadius("p" + epoch, 3.2));
    map.setPaintProperty("cities", "circle-opacity", opacity);
    map.setPaintProperty("cities", "circle-stroke-opacity", opacity ? 0.6 : 0);
  };
  // Deferred layers may not exist yet when an early step runs, and a step
  // that touches a missing layer should simply do nothing.
  const lineOpacity = (id, v) => {
    const layer = map.getLayer(id);
    if (!layer) return;
    map.setPaintProperty(id, layer.type === "fill" ? "fill-opacity" : "line-opacity", v);
  };
  const corridors = (rail, road, tah, built, model) => {
    lineOpacity("cor-rail", rail); lineOpacity("cor-road", road);
    lineOpacity("cor-tah", tah); lineOpacity("cor-built", built);
    lineOpacity("cor-model", model);
  };
  const kinshasa = (water, roads, upTo) => {
    lineOpacity("kin-water", water);
    lineOpacity("kin-roads", roads);
    for (const e of EPOCHS) lineOpacity("built-" + e, upTo && e <= upTo ? 0.92 : 0);
    if (upTo) hudSet(upTo, "built-up footprint");
    else hud.classList.remove("on");
  };
  const hollow2100 = (v) => map.setPaintProperty("cities-2100", "circle-stroke-opacity", v);
  const lightsOn = (v) => {
    lineOpacity("lights-lit", v * 0.45);
    lineOpacity("lights-bright", v * 0.85);
  };
  const densityOn = (v) => {
    for (const band of [5000, 15000, 30000, 60000]) lineOpacity("density-" + band, v * 0.92);
  };
  const slopeOn = (v) => {
    lineOpacity("slope-steep", v * 0.85);
    lineOpacity("slope-steepest", v * 0.95);
  };
  const streetsOn = (v) => lineOpacity("kin-streets", v * 0.95);
  const communesOn = (v) => lineOpacity("kin-communes", v * 0.75);
  const matadiOn = (v) => {
    lineOpacity("matadi-road", v * 0.95);
    lineOpacity("matadi-rail", v * 0.9);
  };
  // The HUD chip annotates a step the story is making. In explore mode the
  // reader drives, and the panel's own year output says which epoch is drawn,
  // so the chip would just be a leftover assertion sitting on the map.
  const hudOff = () => hud.classList.remove("on");
  const hudSet = (big, sub) => {
    if (exploring) { hud.classList.remove("on"); return; }
    hud.classList.add("on");
    hudYr.textContent = big;
    hud.querySelector(".sub").textContent = sub;
  };

  // Every step applies its chapter's full baseline plus its own delta, and
  // every step sets the camera. Re-flying to the current bounds is a visual
  // no-op, and full baselines make the story correct whichever direction —
  // and however fast — the reader arrives from (scroll up, find-in-page,
  // keyboard jumps). Partial-state steps are how phantom layers happen.
  const base = {
    c1: () => {
      countriesOpacity(0.88, 0.3);
      setCityEpoch(null, 0); hollow2100(0); setLabels(null);
      corridors(0, 0, 0, 0, 0); kinshasa(0, 0, null); lightsOn(0);
      setCountryLabels(true); setPlaceLabels(false);
    },
    c2: () => {
      countriesOpacity(0.2, 0.08); hollow2100(0);
      corridors(0, 0, 0, 0, 0); kinshasa(0, 0, null); lightsOn(0);
      setCountryLabels("dim"); setPlaceLabels(false);
    },
    c3: () => {
      countriesOpacity(0.14, 0.06); hollow2100(0); setLabels(null);
      lightsOn(0); kinshasa(0, 0, null);
      setCountryLabels("dim"); setPlaceLabels(false);
    },
    c4: () => {
      // The 1:50m country polygons are far too coarse at city zoom — their
      // border mismatch draws phantom stripes across the Pool, so they go.
      countriesOpacity(0, 0);
      setCityEpoch(null, 0); hollow2100(0); setLabels(null);
      corridors(0, 0, 0, 0, 0); lightsOn(0); densityOn(0);
      setCountryLabels(false); setPlaceLabels(true);
      slopeOn(0); streetsOn(0); communesOn(0); matadiOn(0);
      setCommuneLabels(false); setMatadiLabels(false);
    },
  };

  const steps = {
    "intro": () => {
      map.flyTo({ center: [12, 4], zoom: 1.6, duration: prefersStill ? 0 : 2200, essential: true });
      setChoropleth("pop2025", POP_RAMP); countriesOpacity(0.7, 0.25);
      setCityEpoch(null, 0); hollow2100(0); setLabels(null);
      corridors(0, 0, 0, 0, 0); kinshasa(0, 0, null);
      lightsOn(0); densityOn(0);
      setCountryLabels(false); setPlaceLabels(false);
      spinStart();
    },
    "ch1": () => { fly(AFRICA_BOUNDS, 5); base.c1(); setChoropleth("pop2025", POP_RAMP); },
    "c1-2025": () => { fly(AFRICA_BOUNDS, 5); base.c1(); setChoropleth("pop2025", POP_RAMP); },
    "c1-2100": () => { fly(AFRICA_BOUNDS, 5); base.c1(); setChoropleth("pop2100", POP_RAMP); },
    "c1-multiple": () => { fly(AFRICA_BOUNDS, 5); base.c1(); setChoropleth("multiple", MULT_RAMP); countriesOpacity(0.88, 0.35); },
    "c1-momentum": () => { fly(AFRICA_BOUNDS, 5); base.c1(); setChoropleth("medAge25", AGE_RAMP); },
    "c1-crossovers": () => { fly(AFRICA_BOUNDS, 5); base.c1(); setChoropleth("multiple", MULT_RAMP); countriesOpacity(0.88, 0.35); },
    "ch2": () => { fly(AFRICA_BOUNDS, 5); base.c2(); setCityEpoch(1975, 0.85); setLabels(1975); },
    "c2-1975": () => { fly(AFRICA_BOUNDS, 5); base.c2(); setCityEpoch(1975, 0.85); setLabels(1975); },
    "c2-2025": () => { fly(AFRICA_BOUNDS, 5); base.c2(); setCityEpoch(2025, 0.85); setLabels(2025); },
    "c2-2050": () => { fly(AFRICA_BOUNDS, 5); base.c2(); setCityEpoch(2050, 0.85); setLabels(2050); },
    "c2-2100": () => { fly(AFRICA_BOUNDS, 5); base.c2(); setCityEpoch(2050, 0.85); setLabels(2050); hollow2100(0.9); },
    "ch3": () => { fly(AFRICA_BOUNDS, 5); base.c3(); corridors(0.9, 0.55, 0, 0, 0); setCityEpoch(2050, 0.3); },
    "c3-existing": () => { fly(AFRICA_BOUNDS, 5); base.c3(); corridors(0.9, 0.55, 0, 0, 0); setCityEpoch(2050, 0.3); },
    "c3-planned": () => { fly(AFRICA_BOUNDS, 5); base.c3(); corridors(0.55, 0.3, 0.75, 0.95, 0); setCityEpoch(2050, 0.3); },
    "c3-model": () => { fly(AFRICA_BOUNDS, 5); base.c3(); corridors(0.25, 0.15, 0.3, 0.35, 0.9); setCityEpoch(2050, 0.45); },
    "c3-lights": () => {
      fly(AFRICA_BOUNDS, 5); base.c3();
      lightsOn(1); corridors(0, 0, 0, 0.4, 0.55); setCityEpoch(2050, 0);
    },
    "c3-services": () => {
      fly(AFRICA_BOUNDS, 5); base.c3();
      // The corridor lines have made their point by now, and they sit right on
      // top of the countries this step is asking the reader to compare.
      lightsOn(0); corridors(0, 0, 0, 0, 0);
      setChoropleth("elec", ACCESS_RAMP); countriesOpacity(0.9, 0.25);
      setCountryLabels("dim"); setCityEpoch(2050, 0.25);
    },
    "ch4": () => {
      fly(WEST_AFRICA_BOUNDS, 6);
      countriesOpacity(0.14, 0.06);
      setCityEpoch(2025, 0.5); setLabels(null); hollow2100(0);
      corridors(0, 0, 0, 0, 0); kinshasa(0, 0, null); lightsOn(0); densityOn(0);
      setCountryLabels("dim"); setPlaceLabels(false);
    },
    "c4-arrive": () => { fly(KINSHASA_BOUNDS, 11); base.c4(); kinshasa(0.95, 0.35, null); },
    "c4-1975": () => { fly(POOL_BOUNDS, 12); base.c4(); kinshasa(0.95, 0.25, 1975); },
    "c4-2000": () => { fly(KINSHASA_BOUNDS, 12); base.c4(); kinshasa(0.95, 0.25, 2000); },
    "c4-2020": () => { fly(KINSHASA_BOUNDS, 12); base.c4(); kinshasa(0.95, 0.45, 2020); },
    "c4-2030": () => { fly(KINSHASA_BOUNDS, 12); base.c4(); kinshasa(0.95, 0.5, 2030); },
    "c4-density": () => {
      fly(KINSHASA_BOUNDS, 12); base.c4();
      kinshasa(0.95, 0.35, 1975); densityOn(1);
      hudSet("×6.3", "people on the 1975 ground");
    },
    "c4-rings": () => {
      fly(KINSHASA_BOUNDS, 12); base.c4();
      kinshasa(0.95, 0.35, 2030); densityOn(0.85);
      hudSet("83%", "of new people on old ground");
    },
    "c4-slope": () => {
      fly(KINSHASA_BOUNDS, 12); base.c4();
      slopeOn(1); kinshasa(0.9, 0.3, 2030);
      hudSet("2.0°", "median slope of the 1975 city");
    },
    "c4-streets": () => {
      fly(POOL_BOUNDS, 13); base.c4();
      kinshasa(0.9, 0.85, 2030); streetsOn(1); communesOn(1);
      setCommuneLabels(true);
      hudSet("1.0 m", "of street per resident");
    },
    "c4-matadi": () => {
      fly(MATADI_BOUNDS, 8); base.c4();
      kinshasa(0.9, 0, 2030); matadiOn(1);
      setPlaceLabels(false); setMatadiLabels(true);
      hudOff();
    },
    "explore": () => { fly(KINSHASA_BOUNDS, 11); base.c4(); kinshasa(0.95, 0.5, 2030); },
  };

  const els = document.querySelectorAll("[data-step]");
  let active = null;
  let exploring = false;
  const io = new IntersectionObserver((entries) => {
    if (exploring) return; // free-explore owns the map until "back to story"
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const id = entry.target.dataset.step;
      if (id === active || !steps[id]) continue;
      active = id;
      if (id !== "intro") spinStop();
      // Clear by [data-step], not .step: chapter heads carry data-step but the
      // class .chapter-head, so a .step-scoped clear never released them and
      // every head kept is-active for the rest of the session.
      document.querySelectorAll("[data-step].is-active").forEach((el) => el.classList.remove("is-active"));
      entry.target.classList.add("is-active");
      setRail(id);
      renderLegend(LEGENDS[id]);
      steps[id]();
    }
  }, { rootMargin: "-42% 0px -42% 0px" });
  els.forEach((el) => io.observe(el));

  // Chapter rail: highlight follows the active step; clicking jumps chapters.
  const rail = document.getElementById("chapter-rail");
  const railKey = (id) =>
    id === "intro" ? "intro"
    : id === "explore" ? "explore"
    : "ch" + (id.match(/^c(?:h)?(\d)/) || [])[1];
  function setRail(id) {
    const key = railKey(id);
    rail?.querySelectorAll("button").forEach((b) =>
      b.classList.toggle("on", b.dataset.target === key));
  }
  rail?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-target]");
    if (!btn) return;
    document.querySelector(`[data-step="${btn.dataset.target}"]`)
      ?.scrollIntoView({ behavior: prefersStill ? "instant" : "smooth", block: "start" });
  });

  // ---- free-explore mode ----
  const handlers = ["scrollZoom", "dragPan", "dragRotate", "doubleClickZoom", "touchZoomRotate", "keyboard"];
  const panel = document.getElementById("explore-panel");
  const yearSlider = document.getElementById("explore-year");
  const yearOut = document.getElementById("explore-year-out");
  const metricSel = document.getElementById("explore-metric");
  const nav = new maplibregl.NavigationControl({ showCompass: false });
  const popup = new maplibregl.Popup({ maxWidth: "260px" });

  const currentEpoch = () => CITY_EPOCHS[+yearSlider.value];
  const exploreToggles = {
    cities: (on) => {
      const epoch = currentEpoch();
      setCityEpoch(epoch, on ? 0.85 : 0);
      setLabels(on ? epoch : null);
    },
    corridors: (on) => (on ? corridors(0.7, 0.4, 0.75, 0.95, 0.9) : corridors(0, 0, 0, 0, 0)),
    lights: (on) => lightsOn(on ? 1 : 0),
    kinshasa: (on) => kinshasa(on ? 0.95 : 0, on ? 0.5 : 0, on ? 2030 : null),
    density: (on) => densityOn(on ? 1 : 0),
  };
  const METRIC_RAMPS = {
    pop2025: POP_RAMP, pop2050: POP_RAMP, pop2100: POP_RAMP,
    multiple: MULT_RAMP, medAge25: AGE_RAMP,
    elec: ACCESS_RAMP, water: ACCESS_RAMP,
  };
  const METRIC_LEGENDS = {
    pop2025: rampLegend("People per country, 2025", POP_RAMP, fmtM),
    pop2050: rampLegend("People per country, 2050", POP_RAMP, fmtM),
    pop2100: rampLegend("People per country, 2100", POP_RAMP, fmtM),
    multiple: rampLegend("Growth, 2025 → 2100", MULT_RAMP, fmtX),
    medAge25: rampLegend("Median age, 2025", AGE_RAMP, fmtY),
    elec: rampLegend("Electricity at home, share of people", ACCESS_RAMP, fmtPct, false),
    water: rampLegend("Basic drinking water, share of people", ACCESS_RAMP, fmtPct, false),
  };
  const applyMetric = () => {
    const m = metricSel.value;
    setCountryLabels(m === "off" ? "dim" : true);
    renderLegend(m === "off" ? null : METRIC_LEGENDS[m]);
    if (m === "off") { countriesOpacity(0, 0); return; }
    setChoropleth(m, METRIC_RAMPS[m]);
    countriesOpacity(0.88, 0.3);
  };
  const applyPanel = () => {
    applyMetric();
    panel.querySelectorAll("input[data-layer]").forEach((box) => {
      exploreToggles[box.dataset.layer](box.checked);
    });
  };

  const GOTO = {
    continent: [AFRICA_BOUNDS, 5],
    gulf: [[[-9.5, 3.5], [7.0, 9.5]], 7],
    nile: [[[26.0, 13.0], [36.5, 32.0]], 7],
    kinshasa: [KINSHASA_BOUNDS, 12],
  };

  const M = (v) => (v >= 10 ? Math.round(v) + "M" : v.toFixed(1) + "M");
  const row = (label, value, proj) =>
    `<div class="pop-row${proj ? " proj" : ""}"><span>${label}</span><span>${value}</span></div>`;

  function describe(f) {
    const p = f.properties;
    if (f.layer.id === "cities") {
      const rows = [[1975, p.p1975], [2000, p.p2000], [2025, p.p2025], [2050, p.p2050]]
        .filter(([, v]) => v != null)
        .map(([y, v]) => row(y, M(v))).join("");
      const proj = p.p2100 ? row("2100 (projection)", M(p.p2100), true) : "";
      return `<div class="pop-h">${p.name}</div><div class="pop-sub">people in the urban area</div>${rows}${proj}`;
    }
    if (f.layer.id === "countries-fill") {
      if (p.pop2025 == null) return `<div class="pop-h">${p.name}</div><div class="pop-sub">no UN series joined</div>`;
      return `<div class="pop-h">${p.name}</div><div class="pop-sub">UN WPP 2024, medium variant</div>`
        + row("2025", M(p.pop2025)) + row("2050", M(p.pop2050)) + row("2100", M(p.pop2100))
        + row("growth to 2100", "×" + p.multiple)
        + (p.medAge25 ? row("median age 2025", p.medAge25 + " yrs") : "")
        + (p.tfr ? row("children per woman", p.tfr) : "")
        + (p.elec != null ? row("has electricity", p.elec + "%") : "")
        + (p.water != null ? row("has basic water", p.water + "%") : "");
    }
    if (f.layer.id === "cor-model") {
      return `<div class="pop-h">${p.a} to ${p.b}</div><div class="pop-sub">modeled corridor</div>`
        + row("distance", p.km + " km") + row("gravity score", p.score);
    }
    // built / planned corridor lines
    return `<div class="pop-h">${p.name}</div><div class="pop-sub">${p.status}</div>` + row("backer", p.backer);
  }

  const CLICKABLE = ["cities", "cor-built", "cor-tah", "cor-model", "countries-fill"];
  map.on("click", (e) => {
    if (!exploring) return;
    const hits = map.queryRenderedFeatures(e.point, { layers: CLICKABLE.filter((l) => map.getLayer(l)) });
    hits.sort((a, b) => CLICKABLE.indexOf(a.layer.id) - CLICKABLE.indexOf(b.layer.id));
    const f = hits.find((h) => {
      const op = map.getPaintProperty(h.layer.id,
        h.layer.type === "fill" ? "fill-opacity" : h.layer.type === "line" ? "line-opacity" : "circle-opacity");
      return typeof op === "number" ? op > 0 : true; // expression opacities are per-feature; let them through
    });
    if (!f) { popup.remove(); return; }
    popup.setLngLat(e.lngLat).setHTML(describe(f)).addTo(map);
  });
  map.on("mousemove", (e) => {
    if (!exploring) return;
    const hits = map.queryRenderedFeatures(e.point, { layers: CLICKABLE.filter((l) => map.getLayer(l)) });
    map.getCanvas().style.cursor = hits.length ? "pointer" : "";
  });

  // Opening state, and what Reset returns to.
  const PANEL_DEFAULTS = { metric: "off", year: 8, layers: { kinshasa: true } };
  const resetPanel = () => {
    if (!panel) return;
    metricSel.value = PANEL_DEFAULTS.metric;
    yearSlider.value = PANEL_DEFAULTS.year;
    yearOut.textContent = currentEpoch();
    panel.querySelectorAll("input[data-layer]").forEach((box) => {
      box.checked = Boolean(PANEL_DEFAULTS.layers[box.dataset.layer]);
    });
    applyPanel();
  };
  const collapseBtn = document.getElementById("explore-collapse");
  const setCollapsed = (mini) => {
    panel?.classList.toggle("mini", mini);
    collapseBtn?.setAttribute("aria-expanded", String(!mini));
  };
  collapseBtn?.addEventListener("click", () => setCollapsed(!panel.classList.contains("mini")));
  document.getElementById("explore-reset")?.addEventListener("click", () => {
    if (exploring) resetPanel();
  });

  document.getElementById("explore-btn")?.addEventListener("click", () => {
    exploring = true;
    spinStop();
    document.body.classList.add("exploring");
    handlers.forEach((h) => map[h].enable());
    map.addControl(nav, "top-right");
    // The story's last epoch chip is not about anything the reader is doing now.
    hud.classList.remove("on");
    // A phone panel opens over half the map. Start it out of the way there.
    setCollapsed(window.matchMedia("(max-width: 640px)").matches);
    applyPanel();
  });
  panel?.addEventListener("change", (e) => {
    if (!exploring) return;
    const box = e.target.closest("input[data-layer]");
    if (box) exploreToggles[box.dataset.layer](box.checked);
    if (e.target === metricSel) applyMetric();
  });
  yearSlider?.addEventListener("input", () => {
    yearOut.textContent = currentEpoch();
    if (!exploring) return;
    const citiesBox = panel.querySelector('input[data-layer="cities"]');
    if (!citiesBox.checked) citiesBox.checked = true;
    exploreToggles.cities(true);
  });
  panel?.addEventListener("click", (e) => {
    const chip = e.target.closest("button[data-go]");
    if (!chip || !exploring) return;
    const [bounds, maxZoom] = GOTO[chip.dataset.go];
    map.fitBounds(bounds, { padding: 60, maxZoom, duration: prefersStill ? 0 : 1800, essential: true });
  });
  document.getElementById("explore-exit")?.addEventListener("click", () => {
    exploring = false;
    document.body.classList.remove("exploring");
    handlers.forEach((h) => map[h].disable());
    map.removeControl(nav);
    popup.remove();
    map.getCanvas().style.cursor = "";
    if (active && steps[active]) {
      renderLegend(LEGENDS[active]);
      steps[active]();
    }
  });

  steps.intro();
  active = "intro";
  setRail("intro");
  document.documentElement.classList.add("steps-live");

  // Lets the deferred loader re-apply the step the reader is actually on.
  return () => { if (active && steps[active]) steps[active](); };
}

/* ------------------------------------------------------ floating legend */
// A persistent key for whatever the map is currently showing. Card legends
// scroll away with their step; this one travels with the reader.
const fmtM = (v) => (v ? `${v}M` : "0");
const fmtX = (v) => `×${v}`;
const fmtY = (v) => `${v} yrs`;
const fmtPct = (v) => `${v}%`;

function rampLegend(title, stops, fmt, plus = true) {
  return { title, ramp: { stops, fmt, plus } };
}
const ROW = (color, label, shape) => ({ color, label, shape: shape || "line" });
const CITY_ROWS = [
  ROW("#f4a93a", "African city, sized by people", "dot"),
];
const EPOCH_ROWS = (upTo) =>
  EPOCHS.filter((e) => e <= upTo).map((e) =>
    ROW(EPOCH_COLORS[e], `built by ${e}${e === 2030 ? " (projected)" : ""}`, "box"));

const LEGENDS = {
  "ch1": rampLegend("People per country, 2025", POP_RAMP, fmtM),
  "c1-2025": rampLegend("People per country, 2025", POP_RAMP, fmtM),
  "c1-2100": rampLegend("People per country, 2100", POP_RAMP, fmtM),
  "c1-multiple": rampLegend("Growth, 2025 → 2100", MULT_RAMP, fmtX),
  "c1-momentum": rampLegend("Median age, 2025", AGE_RAMP, fmtY),
  "c1-crossovers": rampLegend("Growth, 2025 → 2100", MULT_RAMP, fmtX),
  "ch2": { title: "Cities in 1975", rows: CITY_ROWS },
  "c2-1975": { title: "Cities in 1975", rows: CITY_ROWS },
  "c2-2025": { title: "Cities in 2025", rows: CITY_ROWS },
  "c2-2050": { title: "Cities in 2050", rows: CITY_ROWS },
  "c2-2100": { title: "Cities in 2050 + 2100 outlook", rows: [
    ...CITY_ROWS, ROW("#ffd166", "2100 projection (hollow ring)", "ring")] },
  "ch3": { title: "What exists today", rows: [
    ROW("#8b93a0", "existing railway"), ROW("#4a5261", "major highway")] },
  "c3-existing": { title: "What exists today", rows: [
    ROW("#8b93a0", "existing railway"), ROW("#4a5261", "major highway")] },
  "c3-planned": { title: "Who is building", rows: [
    ROW("#e0645a", "China-financed, built/building"),
    ROW("#8fb8e8", "other backers, built/building"),
    ROW("#c9a53f", "Trans-African Highway plan")] },
  "c3-model": { title: "Predicted demand", rows: [
    ROW("#f4a93a", "modeled corridor, thicker pulls harder"),
    ROW("#8b93a0", "existing rail (dim)")] },
  "c3-services": rampLegend("Electricity at home, share of people", ACCESS_RAMP, fmtPct, false),
  "c3-lights": { title: "Africa at night, 2020", rows: [
    ROW("#ffd166", "brightly lit (city cores)", "box"),
    ROW("#8a6a35", "lit (towns and sprawl)", "box")] },
  "ch4": { title: "Cities in 2025", rows: CITY_ROWS },
  "c4-arrive": { title: "Kinshasa and Brazzaville", rows: [
    ROW("#1d3242", "Congo River / Malebo Pool", "box"),
    ROW("#aeb6c2", "major road")] },
  "c4-1975": { title: "Built-up ground", rows: [...EPOCH_ROWS(1975), ROW("#1d3242", "river", "box")] },
  "c4-2000": { title: "Built-up ground", rows: [...EPOCH_ROWS(2000), ROW("#1d3242", "river", "box")] },
  "c4-2020": { title: "Built-up ground", rows: [...EPOCH_ROWS(2020), ROW("#1d3242", "river", "box")] },
  "c4-2030": { title: "Built-up ground", rows: [...EPOCH_ROWS(2030), ROW("#1d3242", "river", "box")] },
  "c4-density": { title: "People per km², 2025", rows: [
    ROW("#5a3a7a", "5,000+", "box"), ROW("#95457f", "15,000+", "box"),
    ROW("#d5566a", "30,000+", "box"), ROW("#ff9d5c", "60,000+", "box")] },
  "c4-rings": { title: "People per km², 2025", rows: [
    ROW("#5a3a7a", "5,000+", "box"), ROW("#95457f", "15,000+", "box"),
    ROW("#d5566a", "30,000+", "box"), ROW("#ff9d5c", "60,000+", "box")] },
  "c4-slope": { title: "Ground under the city", rows: [
    ROW("#3f3529", "slope over 10°", "box"),
    ROW("#7d5133", "slope over 15°", "box"),
    ROW("#ffd84d", "built by 2030", "box")] },
  "c4-streets": { title: "The street grid", rows: [
    ROW("#aeb6c2", "main road"), ROW("#9aa6b4", "other streets"),
    ROW("#6f7a89", "commune boundary")] },
  "c4-matadi": { title: "Kinshasa to the sea", rows: [
    ROW("#d8734a", "Route Nationale 1"),
    ROW("#f4a93a", "Matadi-Kinshasa railway")] },
  "explore": null,
};

function renderLegend(spec) {
  const el = document.getElementById("map-legend");
  if (!el) return;
  if (!spec) { el.classList.remove("on"); return; }
  let html = `<div class="lg-title">${spec.title}</div>`;
  if (spec.ramp) {
    const { stops, fmt, plus } = spec.ramp;
    const sw = [];
    for (let i = 1; i < stops.length; i += 2) sw.push(`<i style="background:${stops[i]}"></i>`);
    const values = [];
    for (let i = 0; i < stops.length; i += 2) values.push(stops[i]);
    const picks = [0, Math.floor((values.length - 1) / 2), values.length - 1];
    html += `<div class="lg-ramp">${sw.join("")}</div><div class="lg-labels">`
      + picks.map((i, k) => `<span>${fmt(values[i])}${k === 2 && plus !== false ? "+" : ""}</span>`).join("") + "</div>";
  }
  if (spec.rows) {
    html += spec.rows.map((r) =>
      `<div class="lg-row"><i class="${r.shape}" style="${r.shape === "ring"
        ? `border-color:${r.color}` : `background:${r.color}`}"></i><span>${r.label}</span></div>`).join("");
  }
  el.innerHTML = html;
  el.classList.add("on");
}

/* ---------------------------------------------------------- static widgets */

function buildRegionChart(regions, band) {
  const el = document.getElementById("chart-regions");
  if (!el) return;
  const W = 390, H = 190, L = 34, R = 82, T = 12, B = 22;
  const series = [
    ["Africa", "#f4a93a"],
    ["Asia", "#5b6c85"],
    ["Europe", "#4a6fa5"],
    ["Latin America and the Caribbean", "#6d747e"],
    ["Northern America", "#8a7f8f"],
  ];
  const x = (yr) => L + ((yr - 1950) / 150) * (W - L - R);
  // Ceiling clears Asia's mid-century peak (5.29B) and the UN high variant
  // for Africa in 2100 (5.25B), so neither is drawn outside the plot.
  const y = (v) => T + (1 - v / 5500) * (H - T - B);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Population by region, 1950 to 2100">`;
  for (const v of [1000, 2000, 3000, 4000, 5000]) {
    svg += `<line class="axis" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>`;
    svg += `<text x="${L - 4}" y="${y(v) + 3}" text-anchor="end">${v / 1000}B</text>`;
  }
  for (const yr of [1950, 2000, 2050, 2100]) {
    svg += `<text x="${x(yr)}" y="${H - 8}" text-anchor="middle">${yr}</text>`;
  }
  // The UN publishes a range around every projection. Drawing it stops the
  // single Africa line from reading as a fact rather than a central estimate.
  if (band && band.low && band.high) {
    const top = band.high.map(([yr, v]) => `${x(yr).toFixed(1)},${y(v).toFixed(1)}`);
    const bottom = band.low.map(([yr, v]) => `${x(yr).toFixed(1)},${y(v).toFixed(1)}`).reverse();
    svg += `<polygon fill="#f4a93a" fill-opacity="0.14" points="${top.concat(bottom).join(" ")}"/>`;
  }
  // Europe, Latin America and Northern America all finish within a few
  // hundred million of each other, so their end labels would sit on top of one
  // another. Push each one down until it clears the label above it.
  const tags = [];
  for (const [name, color] of series) {
    const pts = (regions[name] || []).map(([yr, v]) => `${x(yr).toFixed(1)},${y(v).toFixed(1)}`);
    if (!pts.length) continue;
    svg += `<polyline fill="none" stroke="${color}" stroke-width="${name === "Africa" ? 2.4 : 1.4}" points="${pts.join(" ")}"/>`;
    const last = regions[name][regions[name].length - 1];
    const short = { "Latin America and the Caribbean": "Lat. America", "Northern America": "N. America" }[name] || name;
    tags.push({ short, color, at: y(last[1]) });
  }
  tags.sort((a, b) => a.at - b.at);
  let floor = -Infinity;
  for (const t of tags) {
    t.at = Math.max(t.at, floor + 10);
    floor = t.at;
    svg += `<text class="lbl" x="${W - R + 5}" y="${(t.at + 3).toFixed(1)}" fill="${t.color}" style="fill:${t.color}">${t.short}</text>`;
  }
  svg += "</svg>";
  el.innerHTML = svg;
}

// Built ground and people, by distance from the old core. Two paired bars per
// ring: what the ring held in 1975 against what it holds now. The shape is the
// argument, so the two measures share a row and not a scale.
function buildExpansionChart(data) {
  const el = document.getElementById("chart-expansion");
  if (!el || !data) return;
  const W = 390, H = 210, L = 46, R = 8, T = 16, B = 26;
  const bands = data.bands;
  const rowH = (H - T - B) / bands.length;
  const maxPop = Math.max(...bands.map((b) => b.pop2025));
  const maxBuilt = Math.max(...bands.map((b) => b.built["2030"]));
  const half = (W - L - R) / 2 - 12;

  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Built ground and population by distance from the old core, 1975 and today">`;
  svg += `<text x="${L}" y="10">built km²</text>`;
  svg += `<text x="${L + half + 24}" y="10">people</text>`;
  bands.forEach((b, i) => {
    const y = T + i * rowH;
    const h = Math.max(3, rowH - 7);
    svg += `<text x="${L - 6}" y="${y + h / 2 + 3}" text-anchor="end">${b.from}-${b.to}km</text>`;
    // Left: built ground then and now. Right: people then and now.
    // Two thin bars per ring rather than one overlaid on the other: a
    // translucent amber over a dark bar just reads as a third muddy colour,
    // and the legend then describes something the eye is not seeing.
    const bar = (h / 2) - 1;
    const pairs = [
      [L, b.built["1975"] / maxBuilt * half, b.built["2030"] / maxBuilt * half],
      [L + half + 24, b.pop1975 / maxPop * half, b.pop2025 / maxPop * half],
    ];
    for (const [x0, thenW, nowW] of pairs) {
      svg += `<rect x="${x0}" y="${y}" width="${Math.max(1, thenW).toFixed(1)}" height="${bar}" fill="#6e5f46"/>`;
      svg += `<rect x="${x0}" y="${(y + bar + 2).toFixed(1)}" width="${Math.max(1, nowW).toFixed(1)}" height="${bar}" fill="#f4a93a"/>`;
    }
  });
  svg += `<text x="${L}" y="${H - 8}" fill="#6e5f46">1975</text>`;
  svg += `<text x="${L + 34}" y="${H - 8}" fill="#f4a93a" style="fill:#f4a93a">today</text>`;
  svg += "</svg>";
  el.innerHTML = svg;
}

// Metres of street per resident, epoch by epoch. One line, falling off a cliff.
function buildStreetChart(data) {
  const el = document.getElementById("chart-streets");
  if (!el || !data) return;
  const rows = data.rows.filter((r) => r.metresPerPerson != null);
  if (!rows.length) return;
  const W = 390, H = 150, L = 34, R = 16, T = 14, B = 24;
  const max = Math.ceil(Math.max(...rows.map((r) => r.metresPerPerson)));
  const x = (i) => L + (i / (rows.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - v / max) * (H - T - B);

  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Metres of street per resident in Kinshasa, 1975 to 2030">`;
  for (const v of [2, 4, 6, 8]) {
    if (v > max) continue;
    svg += `<line class="axis" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>`;
    svg += `<text x="${L - 4}" y="${y(v) + 3}" text-anchor="end">${v}m</text>`;
  }
  const pts = rows.map((r, i) => `${x(i).toFixed(1)},${y(r.metresPerPerson).toFixed(1)}`);
  svg += `<polyline fill="none" stroke="#f4a93a" stroke-width="2.2" points="${pts.join(" ")}"/>`;
  rows.forEach((r, i) => {
    svg += `<circle cx="${x(i).toFixed(1)}" cy="${y(r.metresPerPerson).toFixed(1)}" r="2.6" fill="#f4a93a"/>`;
    svg += `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${r.epoch}</text>`;
  });
  const first = rows[0], last = rows[rows.length - 1];
  svg += `<text class="lbl" x="${x(0) + 6}" y="${y(first.metresPerPerson) - 6}" fill="#f4a93a" style="fill:#f4a93a">${first.metresPerPerson} m</text>`;
  svg += `<text class="lbl" x="${x(rows.length - 1) - 6}" y="${y(last.metresPerPerson) - 8}" text-anchor="end" fill="#f4a93a" style="fill:#f4a93a">${last.metresPerPerson} m</text>`;
  svg += "</svg>";
  el.innerHTML = svg;
}

function buildCrossoverTicker(crossovers) {
  const el = document.getElementById("crossover-ticker");
  if (!el) return;
  const rows = crossovers.filter((c) => c.year >= 2026).slice(0, 9);
  el.innerHTML = rows.map((c) =>
    `<div class="row"><span class="yr">${c.year}</span><span class="what"><b>${shortName(c.aName)}</b> passes ${shortName(c.bName)}</span></div>`
  ).join("");
}
