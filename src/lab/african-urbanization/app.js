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

const AFRICA_BOUNDS = [[-19.5, -36.5], [53.5, 38.5]];
const WEST_AFRICA_BOUNDS = [[-18, 3], [16, 15]];
const KINSHASA_BOUNDS = [[14.97, -4.72], [15.78, -3.98]];
const POOL_BOUNDS = [[15.12, -4.48], [15.55, -4.05]];

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

Promise.all([
  "countries.geojson", "population.json", "cities.geojson",
  "corridors-existing.geojson", "corridors-planned.geojson", "corridors-model.geojson",
  "kinshasa-builtup.geojson", "kinshasa-water.geojson", "kinshasa-roads.geojson",
  "lights.geojson", "kinshasa-density.geojson",
].map((f) => fetch(DATA + f).then((r) => {
  if (!r.ok) throw new Error(f + ": " + r.status);
  return r.json();
}))).then(boot).catch((err) => {
  console.error(err);
  document.getElementById("error").style.display = "grid";
});

function boot([countries, population, cities, corExisting, corPlanned, corModel,
               kinBuilt, kinWater, kinRoads, lights, kinDensity]) {
  window.__densityStats = kinDensity.stats || {};

  buildRamps();
  buildRegionChart(population.regions);
  buildCrossoverTicker(population.crossovers);
  buildEpochLegend();

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
    map.addSource("kin-built", { type: "geojson", data: kinBuilt });
    map.addSource("kin-water", { type: "geojson", data: kinWater });
    map.addSource("kin-roads", { type: "geojson", data: kinRoads });
    map.addSource("lights", { type: "geojson", data: lights });
    map.addSource("kin-density", { type: "geojson", data: kinDensity });

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

    // Observed nighttime lights (chapter 3's reality check).
    map.addLayer({
      id: "lights-lit", type: "fill", source: "lights",
      filter: ["==", ["get", "class"], "lit"],
      paint: { "fill-color": "#8a6a35", "fill-opacity": 0, "fill-opacity-transition": { duration: 700 } },
    });
    map.addLayer({
      id: "lights-bright", type: "fill", source: "lights",
      filter: ["==", ["get", "class"], "bright"],
      paint: { "fill-color": "#ffd166", "fill-opacity": 0, "fill-opacity-transition": { duration: 700 } },
    });

    // Kinshasa deep-dive stack (invisible until chapter 4).
    map.addLayer({
      id: "kin-water", type: "fill", source: "kin-water",
      paint: { "fill-color": "#1d3242", "fill-opacity": 0, "fill-opacity-transition": { duration: 600 } },
    });
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
      });
    });
    // Density bands paint over the growth rings when chapter 4 asks how many
    // people share the ground; lowest band first so hotter bands sit on top.
    for (const [band, color] of [[5000, "#5a3a7a"], [15000, "#95457f"], [30000, "#d5566a"], [60000, "#ff9d5c"]]) {
      map.addLayer({
        id: "density-" + band, type: "fill", source: "kin-density",
        filter: ["==", ["get", "min"], band],
        paint: { "fill-color": color, "fill-opacity": 0, "fill-opacity-transition": { duration: 600 } },
      });
    }
    map.addLayer({
      id: "kin-roads", type: "line", source: "kin-roads",
      paint: {
        "line-color": ["case", ["==", ["get", "kind"], "major"], "#aeb6c2", "#7d8590"],
        "line-width": ["case", ["==", ["get", "kind"], "major"], 1.4, 0.6],
        "line-opacity": 0, "line-opacity-transition": { duration: 600 },
      },
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
        "circle-color": ["case", ["==", ["get", "african"], 1], "#f4a93a", "#5b6c85"],
        "circle-opacity": 0,
        "circle-opacity-transition": { duration: 600 },
        "circle-stroke-color": "#101319",
        "circle-stroke-width": 0.8,
        "circle-stroke-opacity": 0,
        "circle-stroke-opacity-transition": { duration: 600 },
      },
    });

    initMarkers(map, cities);
    initSteps(map);
  });
}

/* -------------------------------------------------------- HTML city labels */

const LABEL_CITIES = ["Lagos", "Kinshasa", "Al-Qahirah (Cairo)", "Dar es Salaam",
                      "Luanda", "Nairobi", "Abidjan", "New York City", "Tōkyō (Tokyo)"];
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
    .city-label small { display: block; font-weight: 400; color: #99a0ab; font-size: 9px; }
    @media (max-width: 640px) { .city-label.bench { display: none; } }`;
  document.head.appendChild(style);
  for (const f of cities.features) {
    const name = f.properties.name;
    if (!LABEL_CITIES.includes(name)) continue;
    const el = document.createElement("div");
    // Benchmark labels sit at the map edges on phones and clip; CSS hides them
    // below the phone breakpoint via the "bench" class.
    el.className = "city-label" + (f.properties.african ? "" : " bench");
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
  let spinFrame = null;
  const spinStop = () => { if (spinFrame) { cancelAnimationFrame(spinFrame); spinFrame = null; } };
  const spinStart = () => {
    if (prefersStill || spinFrame) return;
    let last = performance.now();
    const tick = (now) => {
      const c = map.getCenter();
      c.lng += ((now - last) / 1000) * 1.1; // degrees per second
      last = now;
      map.jumpTo({ center: c });
      spinFrame = requestAnimationFrame(tick);
    };
    // Wait out the fly-in so the drift doesn't fight the camera animation.
    setTimeout(() => { if (active === "intro" && !exploring) spinFrame = requestAnimationFrame(tick); }, 2400);
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
  const lineOpacity = (id, v) => {
    const prop = map.getLayer(id).type === "fill" ? "fill-opacity" : "line-opacity";
    map.setPaintProperty(id, prop, v);
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
    map.setPaintProperty("lights-lit", "fill-opacity", v * 0.45);
    map.setPaintProperty("lights-bright", "fill-opacity", v * 0.85);
  };
  const densityOn = (v) => {
    for (const band of [5000, 15000, 30000, 60000]) {
      map.setPaintProperty("density-" + band, "fill-opacity", v * 0.92);
    }
  };
  const hudSet = (big, sub) => {
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
    },
    c2: () => {
      countriesOpacity(0.2, 0.08); hollow2100(0);
      corridors(0, 0, 0, 0, 0); kinshasa(0, 0, null); lightsOn(0);
    },
    c3: () => {
      countriesOpacity(0.14, 0.06); hollow2100(0); setLabels(null);
      lightsOn(0); kinshasa(0, 0, null);
    },
    c4: () => {
      // The 1:50m country polygons are far too coarse at city zoom — their
      // border mismatch draws phantom stripes across the Pool, so they go.
      countriesOpacity(0, 0);
      setCityEpoch(null, 0); hollow2100(0); setLabels(null);
      corridors(0, 0, 0, 0, 0); lightsOn(0); densityOn(0);
    },
  };

  const steps = {
    "intro": () => {
      map.flyTo({ center: [12, 4], zoom: 1.6, duration: prefersStill ? 0 : 2200, essential: true });
      setChoropleth("pop2025", POP_RAMP); countriesOpacity(0.7, 0.25);
      setCityEpoch(null, 0); hollow2100(0); setLabels(null);
      corridors(0, 0, 0, 0, 0); kinshasa(0, 0, null);
      lightsOn(0); densityOn(0);
      spinStart();
    },
    "ch1": () => { fly(AFRICA_BOUNDS, 5); base.c1(); setChoropleth("pop2025", POP_RAMP); },
    "c1-2025": () => { fly(AFRICA_BOUNDS, 5); base.c1(); setChoropleth("pop2025", POP_RAMP); },
    "c1-2100": () => { fly(AFRICA_BOUNDS, 5); base.c1(); setChoropleth("pop2100", POP_RAMP); },
    "c1-multiple": () => { fly(AFRICA_BOUNDS, 5); base.c1(); setChoropleth("multiple", MULT_RAMP); countriesOpacity(0.88, 0.35); },
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
    "ch4": () => {
      fly(WEST_AFRICA_BOUNDS, 6);
      countriesOpacity(0.14, 0.06);
      setCityEpoch(2025, 0.5); setLabels(null); hollow2100(0);
      corridors(0, 0, 0, 0, 0); kinshasa(0, 0, null); lightsOn(0); densityOn(0);
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
      document.querySelectorAll(".step.is-active").forEach((el) => el.classList.remove("is-active"));
      entry.target.classList.add("is-active");
      setRail(id);
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
  };
  const applyMetric = () => {
    const m = metricSel.value;
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
        + (p.medAge25 ? row("median age 2025", p.medAge25 + " yrs") : "");
    }
    if (f.layer.id === "cor-model") {
      return `<div class="pop-h">${p.a} — ${p.b}</div><div class="pop-sub">modeled corridor</div>`
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

  document.getElementById("explore-btn")?.addEventListener("click", () => {
    exploring = true;
    spinStop();
    document.body.classList.add("exploring");
    handlers.forEach((h) => map[h].enable());
    map.addControl(nav, "top-right");
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
    if (active && steps[active]) steps[active]();
  });

  steps.intro();
  active = "intro";
  setRail("intro");
}

/* ---------------------------------------------------------- static widgets */

function buildRamps() {
  // Swatches AND labels come from the same stop arrays the map style uses,
  // so the legend can't drift from the actual classification.
  const build = (el, stops, fmt) => {
    for (let i = 1; i < stops.length; i += 2) {
      const b = document.createElement("i");
      b.style.background = stops[i];
      el.appendChild(b);
    }
    const labels = el.nextElementSibling;
    if (!labels || !labels.classList.contains("ramp-labels")) return;
    const values = [];
    for (let i = 0; i < stops.length; i += 2) values.push(stops[i]);
    const picks = [0, Math.floor((values.length - 1) / 2), values.length - 1];
    labels.innerHTML = picks.map((i, k) =>
      `<span>${fmt(values[i])}${k === 2 ? "+" : ""}</span>`).join("");
  };
  document.querySelectorAll('[data-ramp="pop"]').forEach((el) =>
    build(el, POP_RAMP, (v) => (v ? `${v}M` : "0")));
  document.querySelectorAll('[data-ramp="mult"]').forEach((el) =>
    build(el, MULT_RAMP, (v) => `×${v}`));
}

function buildRegionChart(regions) {
  const el = document.getElementById("chart-regions");
  if (!el) return;
  const W = 390, H = 190, L = 34, R = 74, T = 12, B = 22;
  const series = [
    ["Africa", "#f4a93a"],
    ["Asia", "#5b6c85"],
    ["Europe", "#4a6fa5"],
    ["Latin America and the Caribbean", "#6d747e"],
    ["Northern America", "#8a7f8f"],
  ];
  const x = (yr) => L + ((yr - 1950) / 150) * (W - L - R);
  const y = (v) => T + (1 - v / 5000) * (H - T - B);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Population by region, 1950 to 2100">`;
  for (const v of [1000, 2000, 3000, 4000]) {
    svg += `<line class="axis" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>`;
    svg += `<text x="${L - 4}" y="${y(v) + 3}" text-anchor="end">${v / 1000}B</text>`;
  }
  for (const yr of [1950, 2000, 2050, 2100]) {
    svg += `<text x="${x(yr)}" y="${H - 8}" text-anchor="middle">${yr}</text>`;
  }
  for (const [name, color] of series) {
    const pts = (regions[name] || []).map(([yr, v]) => `${x(yr).toFixed(1)},${y(v).toFixed(1)}`);
    if (!pts.length) continue;
    svg += `<polyline fill="none" stroke="${color}" stroke-width="${name === "Africa" ? 2.4 : 1.4}" points="${pts.join(" ")}"/>`;
    const last = regions[name][regions[name].length - 1];
    const short = { "Latin America and the Caribbean": "Lat. America", "Northern America": "N. America" }[name] || name;
    svg += `<text class="lbl" x="${W - R + 5}" y="${y(last[1]) + 3}" fill="${color}" style="fill:${color}">${short}</text>`;
  }
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

function buildEpochLegend() {
  const el = document.getElementById("epoch-legend");
  if (!el) return;
  el.innerHTML = EPOCHS.map((e) =>
    `<div class="row"><i class="box" style="background:${EPOCH_COLORS[e]}"></i> built by ${e}${e === 2030 ? " (projected)" : ""}</div>`
  ).join("");
}
