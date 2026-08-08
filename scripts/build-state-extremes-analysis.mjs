#!/usr/bin/env node
/**
 * Derive rankings, national/world extremes, and curated facts.
 *
 * Usage:
 *   node scripts/build-state-extremes-analysis.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "src/lab/state-extremes/data");
const usExtremes = JSON.parse(fs.readFileSync(path.join(dataDir, "extremes.geojson"), "utf8"));
const worldExtremes = JSON.parse(
  fs.readFileSync(path.join(dataDir, "countries-extremes.geojson"), "utf8"),
);

const EARTH_KM = 6371;
const toR = Math.PI / 180;

function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * toR;
  const dLon = (lon2 - lon1) * toR;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
}

function unwrapLng(lng) {
  return lng < 0 ? lng + 360 : lng;
}

function fmtKm(km) {
  if (km >= 100) return Math.round(km);
  if (km >= 10) return Math.round(km * 10) / 10;
  return Math.round(km * 100) / 100;
}

function fmtDeg(d) {
  return Math.round(d * 100) / 100;
}

function pointRef(row, direction) {
  return {
    name: row.name,
    state: row.name,
    abbr: row.abbr,
    kind: row.kind,
    iso: row.iso,
    direction,
    lat: row[direction].lat,
    lng: row[direction].lng,
  };
}

function indexByName(fc) {
  const by = {};
  for (const f of fc.features) {
    const p = f.properties;
    const key = p.name || p.state;
    by[key] ??= {
      name: key,
      abbr: p.abbr,
      kind: p.kind,
      iso: p.iso ?? null,
      isUSA: Boolean(p.isUSA),
      scope: p.scope,
    };
    by[key][p.direction] = { lat: p.lat, lng: p.lng };
  }
  return by;
}

function toRows(by) {
  return Object.values(by).map((d) => {
    let e = unwrapLng(d.E.lng);
    let w = unwrapLng(d.W.lng);
    let ewDeg = e - w;
    if (ewDeg < 0) ewDeg += 360;
    const nsDeg = d.N.lat - d.S.lat;
    const nsKm = haversineKm(d.S.lat, d.S.lng, d.N.lat, d.N.lng);
    const ewKm = haversineKm(d.W.lat, d.W.lng, d.E.lat, d.E.lng);
    return { ...d, nsDeg, ewDeg, nsKm, ewKm };
  });
}

function rankList(list, key, n = 8) {
  return [...list]
    .sort((a, b) => b[key] - a[key])
    .slice(0, n)
    .map((r, i) => ({
      rank: i + 1,
      name: r.name,
      state: r.name,
      abbr: r.abbr,
      kind: r.kind,
      iso: r.iso,
      km: fmtKm(r[key]),
      deg: fmtDeg(key === "nsKm" ? r.nsDeg : r.ewDeg),
    }));
}

function rankShort(list, key, n = 5) {
  return [...list]
    .sort((a, b) => a[key] - b[key])
    .slice(0, n)
    .map((r, i) => ({
      rank: i + 1,
      name: r.name,
      state: r.name,
      abbr: r.abbr,
      kind: r.kind,
      iso: r.iso,
      km: fmtKm(r[key]),
      deg: fmtDeg(key === "nsKm" ? r.nsDeg : r.ewDeg),
    }));
}

function pickExtreme(list, dir, cmp) {
  return pointRef([...list].sort(cmp)[0], dir);
}

function westScore(lng) {
  return lng > 0 ? lng - 360 : lng;
}

const usBy = indexByName(usExtremes);
const worldBy = indexByName(worldExtremes);
const usRows = toRows(usBy);
const worldRows = toRows(worldBy).filter((r) => r.name !== "Antarctica");
const worldWithAntarctica = toRows(worldBy);

const states = usRows.filter((r) => r.kind === "state");
const conus = states.filter((r) => r.name !== "Alaska" && r.name !== "Hawaii");

const nationalAll = {
  N: pickExtreme(usRows, "N", (a, b) => b.N.lat - a.N.lat),
  S: pickExtreme(usRows, "S", (a, b) => a.S.lat - b.S.lat),
  E: pickExtreme(usRows, "E", (a, b) => b.E.lng - a.E.lng),
  W: pickExtreme(usRows, "W", (a, b) => westScore(a.W.lng) - westScore(b.W.lng)),
};

const nationalStates = {
  N: pickExtreme(states, "N", (a, b) => b.N.lat - a.N.lat),
  S: pickExtreme(states, "S", (a, b) => a.S.lat - b.S.lat),
  E: pickExtreme(states, "E", (a, b) => b.E.lng - a.E.lng),
  W: pickExtreme(states, "W", (a, b) => westScore(a.W.lng) - westScore(b.W.lng)),
};

const nationalConus = {
  N: pickExtreme(conus, "N", (a, b) => b.N.lat - a.N.lat),
  S: pickExtreme(conus, "S", (a, b) => a.S.lat - b.S.lat),
  E: pickExtreme(conus, "E", (a, b) => b.E.lng - a.E.lng),
  W: pickExtreme(conus, "W", (a, b) => a.W.lng - b.W.lng),
};

const worldCardinals = {
  N: pickExtreme(worldRows, "N", (a, b) => b.N.lat - a.N.lat),
  S: pickExtreme(worldWithAntarctica, "S", (a, b) => a.S.lat - b.S.lat),
  E: pickExtreme(worldRows, "E", (a, b) => b.E.lng - a.E.lng),
  W: pickExtreme(worldRows, "W", (a, b) => westScore(a.W.lng) - westScore(b.W.lng)),
};

const aspectTall = [...states]
  .map((r) => ({ ...r, ratio: r.nsKm / r.ewKm }))
  .sort((a, b) => b.ratio - a.ratio)
  .slice(0, 5)
  .map((r, i) => ({
    rank: i + 1,
    name: r.name,
    state: r.name,
    abbr: r.abbr,
    ratio: Math.round(r.ratio * 100) / 100,
    nsKm: fmtKm(r.nsKm),
    ewKm: fmtKm(r.ewKm),
  }));

const aspectWide = [...states]
  .map((r) => ({ ...r, ratio: r.ewKm / r.nsKm }))
  .sort((a, b) => b.ratio - a.ratio)
  .slice(0, 5)
  .map((r, i) => ({
    rank: i + 1,
    name: r.name,
    state: r.name,
    abbr: r.abbr,
    ratio: Math.round(r.ratio * 100) / 100,
    nsKm: fmtKm(r.nsKm),
    ewKm: fmtKm(r.ewKm),
  }));

const worldTall = rankList(worldRows, "nsKm", 8);
const worldWide = rankList(worldRows, "ewKm", 8);

const ak = usBy.Alaska;
const hi = usBy.Hawaii;
const as = usBy["American Samoa"];
const md = usBy.Maryland;
const de = usBy.Delaware;
const ne = usBy.Nebraska;
const mi = usBy.Michigan;
const fl = usBy.Florida;
const mn = usBy.Minnesota;
const tn = usBy.Tennessee;
const ri = usBy["Rhode Island"];
const usa = worldBy["United States of America"];
const russia = worldBy.Russia;
const chile = worldBy.Chile;
const kiribati = worldBy.Kiribati;
const greenland = worldBy.Greenland;
const france = worldBy.France;

const hiNwKm = haversineKm(hi.N.lat, hi.N.lng, hi.W.lat, hi.W.lng);
const akEwKm = haversineKm(ak.W.lat, ak.W.lng, ak.E.lat, ak.E.lng);
const miFlSpan = mi.N.lat - fl.S.lat;

const usFacts = [
  {
    id: "alaska-date-line",
    scope: "us",
    title: "Alaska straddles the date line",
    body: `Alaska’s western tip sits at ${Math.abs(ak.W.lng).toFixed(2)}°E while its eastern tip is at ${Math.abs(ak.E.lng).toFixed(2)}°W — an east–west span that wraps the antimeridian (~${fmtKm(akEwKm)} km).`,
    center: [ak.W.lng, ak.W.lat],
    zoom: 3.4,
    highlight: { state: "Alaska", directions: ["W", "E"] },
    tag: "anomaly",
  },
  {
    id: "hawaii-nwhi",
    scope: "us",
    title: "Hawaii’s north and west are not the Big Island",
    body: `Both Hawaii’s northernmost and westernmost vertices land in the Northwestern Hawaiian Islands (~${fmtKm(hiNwKm)} km apart).`,
    center: [hi.N.lng, hi.N.lat],
    zoom: 4.2,
    highlight: { state: "Hawaii", directions: ["N", "W"] },
    tag: "anomaly",
  },
  {
    id: "american-samoa-south",
    scope: "us",
    title: "The only U.S. land south of the equator",
    body: `American Samoa’s southern tip reaches ${Math.abs(as.S.lat).toFixed(2)}°S — the sole U.S. unit here in the Southern Hemisphere.`,
    center: [as.S.lng, as.S.lat],
    zoom: 5.2,
    highlight: { state: "American Samoa", directions: ["S", "N"] },
    tag: "anomaly",
  },
  {
    id: "conus-four-tips",
    scope: "us",
    title: "The Lower 48’s four tips",
    body: `Contiguous extremes: Minnesota north (${mn.N.lat.toFixed(2)}°N), Maine east, Florida south (${fl.S.lat.toFixed(2)}°N), Washington west.`,
    center: [-96.5, 38.5],
    zoom: 3.15,
    highlight: null,
    tag: "national",
  },
  {
    id: "md-de-east",
    scope: "us",
    title: "Maryland and Delaware share an eastern tip",
    body: `On this Census boundary, Maryland’s and Delaware’s easternmost vertices coincide near Fenwick Island.`,
    center: [md.E.lng, md.E.lat],
    zoom: 8.2,
    highlight: {
      points: [
        { state: "Maryland", direction: "E" },
        { state: "Delaware", direction: "E" },
      ],
    },
    tag: "anomaly",
  },
  {
    id: "nebraska-corner",
    scope: "us",
    title: "Nebraska’s southeast corner does double duty",
    body: `Nebraska is the only state where two cardinal extremes land on the exact same vertex (east = south).`,
    center: [ne.E.lng, ne.E.lat],
    zoom: 7.5,
    highlight: { state: "Nebraska", directions: ["E", "S"] },
    tag: "anomaly",
  },
  {
    id: "tennessee-wide",
    scope: "us",
    title: "Tennessee is the widest-shaped state",
    body: `Tennessee’s east–west distance is ~${aspectWide[0].ratio}× its north–south span. New Hampshire is the tallest-shaped (~${aspectTall[0].ratio}×).`,
    center: [tn.E.lng - 2, (tn.N.lat + tn.S.lat) / 2],
    zoom: 5.4,
    highlight: { state: "Tennessee", directions: ["E", "W", "N", "S"] },
    tag: "shape",
  },
  {
    id: "rhode-island-tiny",
    scope: "us",
    title: "Rhode Island: smallest envelope",
    body: `Rhode Island is both the shortest north–south (~${fmtKm(haversineKm(ri.S.lat, ri.S.lng, ri.N.lat, ri.N.lng))} km) and the narrowest east–west state here.`,
    center: [ri.E.lng, (ri.N.lat + ri.S.lat) / 2],
    zoom: 7.8,
    highlight: { state: "Rhode Island", directions: ["N", "E", "S", "W"] },
    tag: "ranking",
  },
  {
    id: "mi-to-fl",
    scope: "us",
    title: "Michigan to Florida covers most of CONUS latitude",
    body: `From Michigan’s northern tip (${mi.N.lat.toFixed(2)}°N) to Florida’s southern tip (${fl.S.lat.toFixed(2)}°N) is ${fmtDeg(miFlSpan)}° of latitude.`,
    center: [-84.5, 36.5],
    zoom: 3.6,
    highlight: {
      points: [
        { state: "Michigan", direction: "N" },
        { state: "Florida", direction: "S" },
      ],
    },
    tag: "span",
  },
  {
    id: "easternmost-surprise",
    scope: "us",
    title: "Easternmost isn’t Maine",
    body: `Among all U.S. units, the Northern Mariana Islands win east (~146.1°E). Among states, Maine holds the Atlantic tip.`,
    center: [146.06, 16.02],
    zoom: 5.5,
    highlight: {
      state: "Commonwealth of the Northern Mariana Islands",
      directions: ["E"],
    },
    tag: "national",
  },
  {
    id: "westernmost-guam",
    scope: "us",
    title: "Westernmost is Guam, past Alaska",
    body: `Heading west past Alaska’s Attu tip, Guam’s western shore is the farthest U.S. land in this dataset. Among states alone, Alaska wins.`,
    center: [144.62, 13.45],
    zoom: 6.2,
    highlight: { state: "Guam", directions: ["W"] },
    tag: "national",
  },
];

const worldFacts = [
  {
    id: "greenland-north",
    scope: "world",
    title: "Greenland owns the high Arctic tip",
    body: `Greenland’s northernmost vertex (~${greenland.N.lat.toFixed(1)}°N) outranks Canada and Russia on these Natural Earth boundaries.`,
    center: [greenland.N.lng, greenland.N.lat],
    zoom: 3.2,
    highlight: { state: "Greenland", directions: ["N"] },
    tag: "world",
  },
  {
    id: "russia-span",
    scope: "world",
    title: "Russia is the widest country",
    body: `Russia’s east–west tip-to-tip span is ~${fmtKm(haversineKm(russia.W.lat, russia.W.lng, russia.E.lat, russia.E.lng))} km — the largest among countries here (Antarctica excluded from width rankings).`,
    center: [90, 60],
    zoom: 1.8,
    highlight: { state: "Russia", directions: ["E", "W"] },
    tag: "world",
  },
  {
    id: "chile-tall",
    scope: "world",
    title: "Chile is a latitude needle",
    body: `Chile stretches from the Atacama to Cape Horn — among the tallest north–south country envelopes (~${fmtKm(haversineKm(chile.S.lat, chile.S.lng, chile.N.lat, chile.N.lng))} km tip-to-tip).`,
    center: [-70, -35],
    zoom: 2.8,
    highlight: { state: "Chile", directions: ["N", "S"] },
    tag: "world",
  },
  {
    id: "kiribati-date-line",
    scope: "world",
    title: "Kiribati straddles the date line",
    body: `Kiribati’s islands sit on both sides of 180° — so its eastern tip can land east of the antimeridian while western islets stay west.`,
    center: [kiribati ? (kiribati.E.lng + kiribati.W.lng) / 2 : -170, kiribati ? kiribati.N.lat : 0],
    zoom: 3.5,
    highlight: { state: "Kiribati", directions: ["E", "W"] },
    tag: "anomaly",
  },
  {
    id: "france-scattered",
    scope: "world",
    title: "France’s extremes are not all in Europe",
    body: `Natural Earth keeps many French overseas collectivities as separate units; metropolitan France’s envelope still stretches from the Channel to the Mediterranean${france ? ` (~${fmtKm(haversineKm(france.S.lat, france.S.lng, france.N.lat, france.N.lng))} km N–S)` : ""}.`,
    center: france ? [france.E.lng - 2, (france.N.lat + france.S.lat) / 2] : [2.5, 46.5],
    zoom: 4.8,
    highlight: { state: "France", directions: ["N", "E", "S", "W"] },
    tag: "world",
  },
  {
    id: "usa-among-nations",
    scope: "world",
    title: "Toggle the U.S.: one country or fifty states",
    body: usa
      ? `As one country, the U.S. runs from ~${usa.N.lat.toFixed(1)}°N (Alaska) to Hawaii’s south, and west across the date line. Flip to “U.S. as states” to nest the Census state tips among every other country.`
      : `Flip to “U.S. as states” to nest Census state tips among every other country.`,
    center: [-140, 30],
    zoom: 1.55,
    highlight: usa ? { state: "United States of America", directions: ["N", "E", "S", "W"] } : null,
    tag: "tip",
  },
];

const analysis = {
  generated: new Date().toISOString().slice(0, 10),
  meta: {
    usUnits: usRows.length,
    states: states.length,
    territories: usRows.filter((r) => r.kind === "territory").length,
    countries: worldRows.length,
    countriesIncludingAntarctica: worldWithAntarctica.length,
    usPoints: usExtremes.features.length,
    worldPoints: worldExtremes.features.length,
    note: "Spans use great-circle distance between opposite extreme vertices. U.S. units from Census TIGER 500k; countries from Natural Earth 50m. Some country envelopes include overseas departments (e.g. France, Netherlands). East/west unwraps longitudes for antimeridian-spanning units.",
  },
  national: {
    all: nationalAll,
    states: nationalStates,
    conus: nationalConus,
  },
  world: {
    cardinals: worldCardinals,
    tallestNs: worldTall,
    widestEw: worldWide,
  },
  rankings: {
    tallestNs: rankList(states, "nsKm", 8),
    widestEw: rankList(states, "ewKm", 8),
    shortestNs: rankShort(states, "nsKm", 5),
    narrowestEw: rankShort(states, "ewKm", 5),
    tallestAspect: aspectTall,
    widestAspect: aspectWide,
  },
  facts: [...usFacts, ...worldFacts],
};

const outPath = path.join(dataDir, "analysis.json");
fs.writeFileSync(outPath, `${JSON.stringify(analysis, null, 2)}\n`);
console.log(
  `Wrote ${outPath} (${usFacts.length} US facts, ${worldFacts.length} world facts, ${worldRows.length} countries)`,
);
