"use strict";

const COLORS = { N: "#c23b22", E: "#c9a227", S: "#1f7a6b", W: "#2a5f8f" };
const DIR_WORDS = { N: "Northernmost", E: "Easternmost", S: "Southernmost", W: "Westernmost" };

/**
 * View framing: rotate recenters the plate-carrée so Alaska’s Attu (172°E)
 * sits west of the mainland without needing longitudes outside [−180, 180]
 * (d3.geoEquirectangular wraps those back).
 */
const VIEWS = {
  conus: {
    rotate: 96.5,
    pad: 48,
    filter: (f) => f.properties.abbr !== "AK" && f.properties.abbr !== "HI",
  },
  alaska: {
    rotate: 155,
    pad: 40,
    filter: (f) => f.properties.abbr === "AK",
  },
  hawaii: {
    rotate: 166,
    pad: 40,
    filter: (f) => f.properties.abbr === "HI",
  },
  all: {
    rotate: 140,
    pad: 36,
    filter: () => true,
  },
};

const activeDirs = new Set(["N", "E", "S", "W"]);
let activeView = "conus";
let states = null;
let extremes = null;
let width = 0;
let height = 0;

const readout = document.getElementById("readout");
const popupEl = document.getElementById("popup");
const dirButtons = [...document.querySelectorAll(".dir")];
const viewButtons = [...document.querySelectorAll(".view")];
const mapEl = document.getElementById("map");

const projection = d3.geoEquirectangular();
const path = d3.geoPath(projection);
const graticule = d3.geoGraticule().step([5, 5]);
const graticuleMajor = d3.geoGraticule().step([15, 15]);

const svg = d3.select(mapEl).append("svg").attr("aria-hidden", "true");
const ocean = svg.append("rect").attr("class", "ocean");
const gRoot = svg.append("g").attr("class", "root");
const gGrat = gRoot.append("g").attr("class", "grat-layer");
const gStates = gRoot.append("g").attr("class", "states-layer");
const gDots = gRoot.append("g").attr("class", "dots-layer");
const gLabels = gRoot.append("g").attr("class", "label-layer");

const zoom = d3.zoom()
  .scaleExtent([0.5, 12])
  .on("zoom", (event) => {
    gRoot.attr("transform", event.transform);
    const k = event.transform.k;
    gDots.selectAll(".dot-halo").attr("r", 7 / k);
    gDots.selectAll(".dot").attr("r", 4.2 / k);
    gStates.selectAll(".state").attr("stroke-width", 0.7 / k);
    gGrat.selectAll(".graticule").attr("stroke-width", 1 / k);
    gGrat.selectAll(".graticule-major").attr("stroke-width", 1.15 / k);
    hidePopup();
  });

svg.call(zoom).on("click", (event) => {
  if (event.target.closest?.(".dot")) return;
  hidePopup();
});

function fmtCoord(lat, lng) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(3)}°${ns} · ${Math.abs(lng).toFixed(3)}°${ew}`;
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

function hidePopup() {
  popupEl.hidden = true;
}

function showPopup(feature, pageX, pageY) {
  const p = feature.properties;
  popupEl.innerHTML = `<h3>${p.state}</h3>
    <span class="dir-label" style="color:${COLORS[p.direction]}">${DIR_WORDS[p.direction]} point</span>
    <p class="coords">${fmtCoord(p.lat, p.lng)}</p>`;
  popupEl.hidden = false;
  popupEl.style.left = `${pageX}px`;
  popupEl.style.top = `${pageY}px`;
}

function fitProjection(name) {
  const v = VIEWS[name];
  const p = v.pad ?? 40;
  projection.rotate([v.rotate, 0]);
  const fitFc = {
    type: "FeatureCollection",
    features: extremes.features.filter(v.filter),
  };
  projection.fitExtent([[p, p], [width - p, height - p]], fitFc);
}

function gratLabels() {
  const labels = [];
  for (let lon = -180; lon < 180; lon += 15) {
    labels.push({ kind: "lon", value: lon, coordinates: [lon, 0] });
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    if (lat === 0) continue;
    labels.push({ kind: "lat", value: lat, coordinates: [-VIEWS[activeView].rotate, lat] });
  }
  return labels;
}

function formatGrat(d) {
  if (d.kind === "lon") {
    if (d.value === 0) return "0°";
    if (d.value === 180 || d.value === -180) return "180°";
    return d.value > 0 ? `${d.value}°E` : `${Math.abs(d.value)}°W`;
  }
  return d.value > 0 ? `${d.value}°N` : `${Math.abs(d.value)}°S`;
}

function redrawGeometry() {
  gGrat.selectAll(".graticule").data([graticule()]).join("path")
    .attr("class", "graticule")
    .attr("d", path)
    .attr("stroke-width", 1);
  gGrat.selectAll(".graticule-major").data([graticuleMajor()]).join("path")
    .attr("class", "graticule-major")
    .attr("d", path)
    .attr("stroke-width", 1.15);

  gLabels.selectAll("text")
    .data(gratLabels().filter((d) => {
      const p = projection(d.coordinates);
      if (!p) return false;
      return p[0] > -40 && p[0] < width + 40 && p[1] > -20 && p[1] < height + 20;
    }))
    .join("text")
    .attr("class", "grat-label")
    .attr("x", (d) => projection(d.coordinates)[0] + (d.kind === "lat" ? 4 : 0))
    .attr("y", (d) => projection(d.coordinates)[1] + (d.kind === "lon" ? -4 : 3))
    .text(formatGrat);

  gStates.selectAll("path")
    .data(states.features, (d) => d.properties.abbr)
    .join("path")
    .attr("class", "state")
    .attr("d", path)
    .attr("stroke-width", 0.7);

  const dots = gDots.selectAll("g.dot-g")
    .data(extremes.features, (d) => `${d.properties.abbr}-${d.properties.direction}`)
    .join((enter) => {
      const g = enter.append("g").attr("class", "dot-g");
      g.append("circle").attr("class", "dot-halo");
      g.append("circle").attr("class", "dot");
      return g;
    });

  dots.attr("transform", (d) => {
    const p = projection(d.geometry.coordinates);
    return p ? `translate(${p[0]},${p[1]})` : "translate(-9999,-9999)";
  });

  dots.select(".dot-halo").attr("r", 7);
  dots.select(".dot")
    .attr("r", 4.2)
    .attr("fill", (d) => COLORS[d.properties.direction])
    .on("pointerenter", (event, d) => {
      const p = d.properties;
      setReadout(`${p.state} · ${DIR_WORDS[p.direction]} · ${fmtCoord(p.lat, p.lng)}`);
    })
    .on("pointerleave", () => setReadout(""))
    .on("click", (event, d) => {
      event.stopPropagation();
      showPopup(d, event.clientX, event.clientY);
    });

  applyFilter();
}

function applyFilter() {
  gDots.selectAll("g.dot-g")
    .attr("display", (d) => (activeDirs.has(d.properties.direction) ? null : "none"));
}

function fitView(name, animate = true) {
  activeView = name;
  for (const btn of viewButtons) {
    btn.setAttribute("aria-pressed", String(btn.dataset.view === name));
  }
  hidePopup();
  fitProjection(name);
  redrawGeometry();

  const reset = () => svg.call(zoom.transform, d3.zoomIdentity);
  if (animate) {
    gRoot.attr("opacity", 0.35);
    reset();
    gRoot.transition().duration(450).attr("opacity", 1);
  } else {
    reset();
  }
}

function resize() {
  width = mapEl.clientWidth;
  height = mapEl.clientHeight;
  svg.attr("viewBox", `0 0 ${width} ${height}`);
  ocean.attr("width", width).attr("height", height);
  if (!states) return;
  fitView(activeView, false);
}

async function boot() {
  const [rawStates, rawExtremes] = await Promise.all([
    fetch("/lab/state-extremes/data/states.geojson").then((r) => {
      if (!r.ok) throw new Error("states.geojson");
      return r.json();
    }),
    fetch("/lab/state-extremes/data/extremes.geojson").then((r) => {
      if (!r.ok) throw new Error("extremes.geojson");
      return r.json();
    }),
  ]);

  states = rawStates;
  extremes = rawExtremes;

  resize();
  gDots.attr("opacity", 0)
    .transition()
    .delay(100)
    .duration(650)
    .attr("opacity", 1);
}

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

document.getElementById("zoomIn").addEventListener("click", () => {
  svg.transition().duration(280).call(zoom.scaleBy, 1.35);
});
document.getElementById("zoomOut").addEventListener("click", () => {
  svg.transition().duration(280).call(zoom.scaleBy, 1 / 1.35);
});

window.addEventListener("resize", () => {
  clearTimeout(resize._t);
  resize._t = setTimeout(resize, 120);
});

boot().catch((err) => {
  console.error(err);
  setReadout("Could not load state extremes data.");
});
