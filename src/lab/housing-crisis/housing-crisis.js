"use strict";

/* Tract explorer for the Predicting Tomorrow's Housing Crisis model.
   Data: indices.geojson — 1,613 MA tracts with HSI / HPP / SUIT percentile
   scores (0-100, statewide) computed by github.com/mapzimus/predicting-housing-crisis. */

const METRICS = {
  // Ramps run dark -> bright so "bright = high" reads correctly on the dark map.
  HSI: {
    label: "Housing Stress Index",
    ramp: ["#1b0c41", "#7d2482", "#c43c4e", "#f8850f", "#fcffa4"],
    note: "Cost burden (40%) + availability (25%) + decade trajectory (20%) + " +
      "economic precarity (15%), percentile-scored statewide from ACS 2019–2023 " +
      "and 2009–2013.",
  },
  HPP: {
    label: "Homelessness Pressure — proxy",
    ramp: ["#3c0f4c", "#93325f", "#cf5a68", "#e7a284", "#f5eddc"],
    note: "A proxy composite of literature-based correlates (severe rent burden, " +
      "poverty, overcrowding, rent growth, vulnerability, market tightness) — NOT " +
      "observed homelessness, which is counted only at Continuum-of-Care level.",
  },
  SUIT: {
    label: "Supportive-Housing Suitability",
    ramp: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
    note: "Need (45%) + opportunity access (35%: transit, jobs, multifamily fabric) " +
      "+ vulnerability (20%). The access block is the anti-concentration safeguard: " +
      "high scores mean connected locations, never remote ones.",
  },
};

const NO_DATA = "#3f434c";
const BREAKS = [20, 40, 60, 80];
const MA_BOUNDS = [[-73.60, 41.15], [-69.85, 42.95]];

let map, activeMetric = "HSI", pinned = null;

function fillColor(metric) {
  const r = METRICS[metric].ramp;
  return [
    "case",
    ["!=", ["typeof", ["get", metric]], "number"],
    NO_DATA,
    ["step", ["get", metric], r[0], BREAKS[0], r[1], BREAKS[1], r[2], BREAKS[2], r[3], BREAKS[3], r[4]],
  ];
}

function renderLegend(metric) {
  const el = document.getElementById("legend");
  const r = METRICS[metric].ramp;
  const labels = ["0 – 20", "20 – 40", "40 – 60", "60 – 80", "80 – 100"];
  el.innerHTML = r.map((c, i) =>
    `<div class="row"><span class="swatch" style="background:${c}"></span>${labels[i]}</div>`
  ).join("") +
    `<div class="row"><span class="swatch" style="background:${NO_DATA}"></span>no data / suppressed</div>`;
  document.getElementById("metricNote").textContent = METRICS[metric].note;
}

function fmt(v) {
  return typeof v === "number" ? v.toFixed(0) : "–";
}

function updateReadout(p) {
  document.getElementById("roName").textContent = p ? p.NAMELSAD : "hover the map";
  document.getElementById("roHSI").textContent = p ? fmt(p.HSI) : "–";
  document.getElementById("roHPP").textContent = p ? fmt(p.HPP) : "–";
  document.getElementById("roSUIT").textContent = p ? fmt(p.SUIT) : "–";
}

function setMetric(metric) {
  activeMetric = metric;
  map.setPaintProperty("tracts-fill", "fill-color", fillColor(metric));
  renderLegend(metric);
  document.querySelectorAll(".filters button").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.metric === metric))
  );
}

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
        id: "osm",
        type: "raster",
        source: "osm",
        paint: {
          "raster-saturation": -0.9,
          "raster-opacity": 0.85,
          "raster-brightness-max": 0.4,
        },
      }],
    },
    bounds: MA_BOUNDS,
    fitBoundsOptions: { padding: 24 },
    attributionControl: { compact: false },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

  map.on("style.load", async () => {
    const res = await fetch("/lab/housing-crisis/indices.geojson");
    const data = await res.json();

    map.addSource("tracts", { type: "geojson", data, promoteId: "GEOID" });

    map.addLayer({
      id: "tracts-fill",
      type: "fill",
      source: "tracts",
      paint: { "fill-color": fillColor(activeMetric), "fill-opacity": 0.78 },
    });
    map.addLayer({
      id: "tracts-line",
      type: "line",
      source: "tracts",
      paint: { "line-color": "#14161c", "line-width": 0.4, "line-opacity": 0.6 },
    });
    map.addLayer({
      id: "tracts-highlight",
      type: "line",
      source: "tracts",
      paint: { "line-color": "#f0ecdf", "line-width": 2 },
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
      const p = f.properties;
      pinned = p.GEOID;
      updateReadout(p);
      map.setFilter("tracts-highlight", ["==", ["get", "GEOID"], pinned]);
      new maplibregl.Popup({ closeOnClick: true, maxWidth: "290px" })
        .setLngLat(e.lngLat)
        .setHTML(
          `<h3>${p.NAMELSAD}</h3><table>` +
          `<tr><td>GEOID</td><td>${p.GEOID}</td></tr>` +
          `<tr><td>Housing stress</td><td>${fmt(p.HSI)}</td></tr>` +
          `<tr><td>Pressure proxy</td><td>${fmt(p.HPP)}</td></tr>` +
          `<tr><td>Suitability</td><td>${fmt(p.SUIT)}</td></tr>` +
          `<tr><td>Transit score</td><td>${fmt(p.transit_score)}</td></tr>` +
          `<tr><td>EJ area share</td><td>${typeof p.ej_share === "number" ? (p.ej_share * 100).toFixed(0) + "%" : "–"}</td></tr>` +
          `</table>`
        )
        .on("close", () => {
          pinned = null;
          map.setFilter("tracts-highlight", ["==", ["get", "GEOID"], ""]);
          updateReadout(null);
        })
        .addTo(map);
    });
  });

  document.querySelectorAll(".filters button").forEach((b) =>
    b.addEventListener("click", () => setMetric(b.dataset.metric))
  );
  renderLegend(activeMetric);
  updateReadout(null);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
