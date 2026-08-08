#!/usr/bin/env node
/**
 * Rebuild extreme points + simplified outlines for US states, DC, and territories.
 *
 * Default source (Census TIGER cartographic boundary 500k, 2019, via citysdk mirror):
 *   https://raw.githubusercontent.com/uscensusbureau/citysdk/master/v2/GeoJSON/500k/2019/state.json
 *
 * Usage:
 *   node scripts/build-state-extremes.mjs [path-to-states.geojson]
 *   node scripts/build-state-extremes.mjs --download
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "src/lab/state-extremes/data");
const SOURCE_URL =
  "https://raw.githubusercontent.com/uscensusbureau/citysdk/master/v2/GeoJSON/500k/2019/state.json";

const TERRITORY = new Set(["PR", "GU", "VI", "AS", "MP"]);

function walkCoords(geom, fn) {
  const t = geom.type;
  if (t === "Point") fn(geom.coordinates);
  else if (t === "MultiPoint" || t === "LineString") geom.coordinates.forEach(fn);
  else if (t === "MultiLineString" || t === "Polygon") geom.coordinates.forEach((r) => r.forEach(fn));
  else if (t === "MultiPolygon") geom.coordinates.forEach((p) => p.forEach((r) => r.forEach(fn)));
}

function unwrap(lng, ref) {
  let x = lng;
  while (x - ref > 180) x -= 360;
  while (x - ref < -180) x += 360;
  return x;
}

function wrap180(lng) {
  let x = lng;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

function extremesFor(geom) {
  const pts = [];
  walkCoords(geom, (c) => pts.push(c));
  if (!pts.length) return null;
  let sx = 0;
  let sy = 0;
  for (const [lng] of pts) {
    const r = (lng * Math.PI) / 180;
    sx += Math.cos(r);
    sy += Math.sin(r);
  }
  const ref = (Math.atan2(sy, sx) * 180) / Math.PI;
  let N = null;
  let S = null;
  let E = null;
  let W = null;
  for (const [lng, lat] of pts) {
    const u = unwrap(lng, ref);
    if (!N || lat > N.lat) N = { lng, lat, u };
    if (!S || lat < S.lat) S = { lng, lat, u };
    if (!E || u > E.u) E = { lng: wrap180(u), lat, u };
    if (!W || u < W.u) W = { lng: wrap180(u), lat, u };
  }
  return { N, S, E, W };
}

function simplifyRing(ring, tol) {
  if (ring.length <= 4) return ring;
  const sq = tol * tol;
  function d2(a, b, p) {
    let x = a[0];
    let y = a[1];
    const dx = b[0] - x;
    const dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = b[0];
        y = b[1];
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    const ex = p[0] - x;
    const ey = p[1] - y;
    return ex * ex + ey * ey;
  }
  function rdp(pts) {
    let maxD = 0;
    let idx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = d2(pts[0], pts[pts.length - 1], pts[i]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > sq) {
      const L = rdp(pts.slice(0, idx + 1));
      const R = rdp(pts.slice(idx));
      return L.slice(0, -1).concat(R);
    }
    return [pts[0], pts[pts.length - 1]];
  }
  const simplified = rdp(ring.slice(0, -1));
  if (simplified.length < 3) return ring;
  return simplified.concat([simplified[0]]);
}

function simplifyGeom(geom, tol) {
  if (geom.type === "Polygon") {
    return { type: "Polygon", coordinates: geom.coordinates.map((r) => simplifyRing(r, tol)) };
  }
  if (geom.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geom.coordinates.map((poly) => poly.map((r) => simplifyRing(r, tol))),
    };
  }
  return geom;
}

async function loadSource(argv) {
  if (argv.includes("--download")) {
    const res = await fetch(SOURCE_URL);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    return res.json();
  }
  const arg = argv.find((a) => !a.startsWith("-"));
  const file = arg || path.join("/tmp/state-extremes/census_state.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const g = await loadSource(process.argv.slice(2));
const extremeFeatures = [];
const outlineFeatures = [];

for (const f of g.features) {
  const name = f.properties.NAME || f.properties.name;
  const abbr = f.properties.STUSPS || f.properties.postal;
  if (!name || !abbr) {
    console.warn("skip unnamed", f.properties);
    continue;
  }
  const kind = TERRITORY.has(abbr) ? "territory" : abbr === "DC" ? "district" : "state";
  const ex = extremesFor(f.geometry);
  for (const [dir, label] of [
    ["N", "north"],
    ["E", "east"],
    ["S", "south"],
    ["W", "west"],
  ]) {
    const p = ex[dir];
    extremeFeatures.push({
      type: "Feature",
      properties: {
        state: name,
        abbr,
        kind,
        direction: dir,
        directionLabel: label,
        lat: +p.lat.toFixed(5),
        lng: +wrap180(p.lng).toFixed(5),
      },
      geometry: { type: "Point", coordinates: [wrap180(p.lng), p.lat] },
    });
  }
  outlineFeatures.push({
    type: "Feature",
    properties: { state: name, abbr, kind },
    geometry: simplifyGeom(f.geometry, 0.025),
  });
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "extremes.geojson"),
  JSON.stringify({ type: "FeatureCollection", features: extremeFeatures }),
);
fs.writeFileSync(
  path.join(outDir, "states.geojson"),
  JSON.stringify({ type: "FeatureCollection", features: outlineFeatures }),
);
const kinds = Object.fromEntries(
  ["state", "district", "territory"].map((k) => [
    k,
    outlineFeatures.filter((f) => f.properties.kind === k).length,
  ]),
);
console.log(
  `Wrote ${extremeFeatures.length} extreme points and ${outlineFeatures.length} outlines`,
  kinds,
  `→ ${outDir}`,
);
