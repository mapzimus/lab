"use strict";

const DATA_URL = "/lab/world-xi/data/clubs.geojson";
const CREST_SIZE = 128; // px, matches the thumbnails baked into clubs.geojson

let map;
try {
  map = new maplibregl.Map({
    container: "map",
    center: [10, 30],
    zoom: 1.5,
    minZoom: 1.05,
    maxZoom: 15,
    attributionControl: false,
    style: "https://tiles.openfreemap.org/styles/dark",
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
  map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
} catch (err) {
  console.error(err);
  document.body.classList.add("map-failed");
}

const readout = document.getElementById("readout");
const setReadout = (text) => { readout.textContent = text; };

let popup = null;
const activeLeagues = new Set();
let leagues = [];

function circleImage(color) {
  const c = document.createElement("canvas");
  c.width = c.height = 48;
  const g = c.getContext("2d");
  g.beginPath();
  g.arc(24, 24, 20, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = "#f0ecdf";
  g.stroke();
  return g.getImageData(0, 0, 48, 48);
}

// symbol tiles cache their resolved icons; re-setting the (identical) layout
// expression makes freshly added crest images take effect
function refreshIcons() {
  if (map.getLayer("clubs")) {
    map.setLayoutProperty("clubs", "icon-image", map.getLayoutProperty("clubs", "icon-image"));
  }
}

async function loadCrests(features) {
  // a handful at a time; each crest replaces the club's fallback dot when ready
  const queue = [...features];
  let loaded = 0;
  const workers = Array.from({ length: 6 }, async () => {
    for (;;) {
      const f = queue.shift();
      if (!f) return;
      const { qid, crest } = f.properties;
      if (!crest || map.hasImage(`club-${qid}`)) continue;
      try {
        const img = await map.loadImage(crest);
        if (!map.hasImage(`club-${qid}`)) map.addImage(`club-${qid}`, img.data);
        if (++loaded % 25 === 0) refreshIcons();
      } catch {
        /* keep the colored-dot fallback */
      }
    }
  });
  await Promise.allSettled(workers);
  refreshIcons();
}

function leagueFilter() {
  return ["in", ["get", "leagueKey"], ["literal", [...activeLeagues]]];
}

function applyFilter() {
  if (!map.getLayer("clubs")) return;
  map.setFilter("clubs-ring", leagueFilter());
  map.setFilter("clubs", leagueFilter());
}

function buildLegend(meta) {
  for (const lg of meta.leagues) {
    activeLeagues.add(lg.key);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "league";
    btn.setAttribute("aria-pressed", "true");
    btn.innerHTML = `<span class="swatch" style="background:${lg.color}"></span>` +
      `<span class="league-name">${lg.label}<small>${lg.country}</small></span>` +
      `<span class="count">${lg.count}</span>`;
    btn.addEventListener("click", () => {
      const on = !activeLeagues.has(lg.key);
      if (on) activeLeagues.add(lg.key);
      else activeLeagues.delete(lg.key);
      btn.setAttribute("aria-pressed", String(on));
      applyFilter();
      const total = meta.leagues.filter((l) => activeLeagues.has(l.key)).reduce((n, l) => n + l.count, 0);
      setReadout(`${total} clubs shown`);
    });
    document.getElementById(lg.gender === "men" ? "legend-men" : "legend-women").appendChild(btn);
  }
}

function leagueColor(key) {
  return leagues.find((l) => l.key === key)?.color ?? "#ffffff";
}

function popupHtml(feats) {
  return feats.map((f) => {
    const p = f.properties;
    const cap = p.capacity ? Number(p.capacity).toLocaleString("en-US") : "—";
    return `<article class="club-card">
      ${p.crest ? `<img class="club-crest" src="${p.crest}" alt="" width="56">` : ""}
      <div>
        <h3>${p.name}</h3>
        <p><span class="chip" style="background:${leagueColor(p.leagueKey)}"></span>${p.league}</p>
        <p>${p.venue ?? "Stadium unknown"} · ${cap} seats</p>
        <p><a href="${p.wikidata}" target="_blank" rel="noopener">Wikidata ↗</a></p>
      </div>
    </article>`;
  }).join("<hr>");
}

async function boot() {
  if (typeof map.setProjection === "function") {
    map.setProjection({ type: "globe" });
  }
  map.setSky({
    "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.85, 5, 0.85, 7, 0],
  });
  map.setLight({ anchor: "viewport", color: "#ffffff", intensity: 0.55, position: [1.15, 210, 30] });

  const data = await fetch(DATA_URL).then((r) => {
    if (!r.ok) throw new Error("clubs.geojson failed to load");
    return r.json();
  });
  leagues = data.metadata.leagues;
  buildLegend(data.metadata);

  for (const lg of leagues) {
    map.addImage(`dot-${lg.key}`, circleImage(lg.color));
  }

  map.addSource("clubs", { type: "geojson", data });

  // league-colored ring behind each crest; also the visible mark at world zoom
  map.addLayer({
    id: "clubs-ring",
    type: "circle",
    source: "clubs",
    filter: leagueFilter(),
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 1.5, 3.5, 4, 9, 7, 17, 11, 26],
      "circle-color": ["match", ["get", "leagueKey"],
        ...leagues.flatMap((lg) => [lg.key, lg.color]), "#ffffff"],
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.95, 5, 0.7],
      "circle-stroke-width": 1,
      "circle-stroke-color": "#0b1016",
    },
  });

  // crest icons resolve once you're close enough for them to be readable
  map.addLayer({
    id: "clubs",
    type: "symbol",
    source: "clubs",
    filter: leagueFilter(),
    layout: {
      "icon-image": ["coalesce", ["image", ["concat", "club-", ["get", "qid"]]],
        ["image", ["concat", "dot-", ["get", "leagueKey"]]]],
      "icon-size": ["interpolate", ["linear"], ["zoom"],
        3, 8 / CREST_SIZE, 5, 22 / CREST_SIZE, 7, 30 / CREST_SIZE, 11, 46 / CREST_SIZE],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
    paint: {
      "icon-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0, 4, 1],
    },
  });

  for (const layer of ["clubs", "clubs-ring"]) {
    map.on("click", layer, (e) => {
      e.preventDefault();
      const pad = 6;
      const box = [[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]];
      const feats = map.queryRenderedFeatures(box, { layers: ["clubs", "clubs-ring"] });
      const seen = new Set();
      const unique = feats.filter((f) => !seen.has(f.properties.qid) && seen.add(f.properties.qid));
      if (!unique.length) return;
      if (popup) popup.remove();
      popup = new maplibregl.Popup({ maxWidth: "320px" })
        .setLngLat(unique[0].geometry.coordinates)
        .setHTML(popupHtml(unique))
        .addTo(map);
    });
  }
  map.on("click", (e) => {
    if (!e.defaultPrevented && popup) { popup.remove(); popup = null; }
  });
  map.on("mousemove", "clubs-ring", (e) => {
    map.getCanvas().style.cursor = "pointer";
    const p = e.features[0].properties;
    setReadout(`${p.name} · ${p.venue ?? "?"} · ${p.league}`);
  });
  map.on("mouseleave", "clubs-ring", () => {
    map.getCanvas().style.cursor = "";
  });

  setReadout(`${data.features.length} clubs · ${data.metadata.seasons}`);
  map.easeTo({ center: [0, 40], zoom: 2.6, duration: 2500 });

  loadCrests(data.features);
}

if (map) map.once("style.load", boot);
