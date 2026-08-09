#!/usr/bin/env node
/**
 * Rebuild extreme points + simplified outlines for:
 *   - U.S. states, DC, and territories (Census TIGER 500k)
 *   - World countries / dependencies (Natural Earth 50m)
 *
 * Usage:
 *   node scripts/build-state-extremes.mjs
 *   node scripts/build-state-extremes.mjs --download
 *   node scripts/build-state-extremes.mjs --us-only
 *   node scripts/build-state-extremes.mjs --world-only
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "src/lab/state-extremes/data");
const cacheDir = path.join(root, ".cache/state-extremes");

const US_SOURCE_URL =
  "https://raw.githubusercontent.com/uscensusbureau/citysdk/master/v2/GeoJSON/500k/2019/state.json";
const WORLD_SOURCE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson";

const TERRITORY = new Set(["PR", "GU", "VI", "AS", "MP"]);
const US_DEP_ISO = new Set(["PRI", "GUM", "VIR", "ASM", "MNP"]);

const DIR_LABEL = { N: "north", E: "east", S: "south", W: "west" };

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

function extremeFeaturesFor(props, geom) {
  const ex = extremesFor(geom);
  if (!ex) return [];
  const out = [];
  for (const dir of ["N", "E", "S", "W"]) {
    const p = ex[dir];
    const lng = +wrap180(p.lng).toFixed(5);
    const lat = +p.lat.toFixed(5);
    out.push({
      type: "Feature",
      properties: {
        ...props,
        // Keep legacy `state` key for existing UI code paths.
        state: props.name,
        direction: dir,
        directionLabel: DIR_LABEL[dir],
        lat,
        lng,
      },
      geometry: { type: "Point", coordinates: [lng, lat] },
    });
  }
  return out;
}

async function fetchJson(url, cacheFile) {
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  if (fs.existsSync(cacheFile) && !process.argv.includes("--download")) {
    return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  }
  console.log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}: ${url}`);
  const json = await res.json();
  fs.writeFileSync(cacheFile, JSON.stringify(json));
  return json;
}

function buildUs(usFc) {
  const extremeFeatures = [];
  const outlineFeatures = [];
  for (const f of usFc.features) {
    const name = f.properties.NAME || f.properties.name;
    const abbr = f.properties.STUSPS || f.properties.postal;
    if (!name || !abbr) {
      console.warn("skip unnamed US feature", f.properties);
      continue;
    }
    const kind = TERRITORY.has(abbr) ? "territory" : abbr === "DC" ? "district" : "state";
    const props = {
      name,
      abbr,
      iso: null,
      kind,
      scope: "us",
      isUSA: false,
    };
    extremeFeatures.push(...extremeFeaturesFor(props, f.geometry));
    outlineFeatures.push({
      type: "Feature",
      properties: { name, state: name, abbr, iso: null, kind, scope: "us", isUSA: false },
      geometry: simplifyGeom(f.geometry, 0.025),
    });
  }
  return { extremeFeatures, outlineFeatures };
}

function buildWorld(worldFc) {
  const extremeFeatures = [];
  const outlineFeatures = [];
  for (const f of worldFc.features) {
    const p = f.properties;
    const iso = (p.ISO_A3_EH && p.ISO_A3_EH !== "-99" ? p.ISO_A3_EH : null)
      || (p.ISO_A3 && p.ISO_A3 !== "-99" ? p.ISO_A3 : null)
      || p.ADM0_A3
      || null;
    const name = p.NAME_EN || p.ADMIN || p.NAME;
    if (!name) {
      console.warn("skip unnamed world feature", p);
      continue;
    }
    // Prefer Census geometries for U.S. dependencies when both exist.
    if (US_DEP_ISO.has(iso)) continue;

    const isUSA = iso === "USA";
    const kind = "country";
    const abbr = (p.ISO_A2_EH && p.ISO_A2_EH !== "-99" ? p.ISO_A2_EH : null)
      || (p.ISO_A2 && p.ISO_A2 !== "-99" ? p.ISO_A2 : null)
      || iso
      || name.slice(0, 3).toUpperCase();

    const props = {
      name,
      abbr,
      iso,
      kind,
      scope: "world",
      isUSA,
      neType: p.TYPE || "",
      continent: p.CONTINENT || "",
    };
    extremeFeatures.push(...extremeFeaturesFor(props, f.geometry));
    outlineFeatures.push({
      type: "Feature",
      properties: {
        name,
        state: name,
        abbr,
        iso,
        kind,
        scope: "world",
        isUSA,
        continent: p.CONTINENT || "",
      },
      geometry: simplifyGeom(f.geometry, 0.1),
    });
  }
  return { extremeFeatures, outlineFeatures };
}

function writeFc(file, features) {
  fs.writeFileSync(file, `${JSON.stringify({ type: "FeatureCollection", features })}\n`);
}

const argv = process.argv.slice(2);
const usOnly = argv.includes("--us-only");
const worldOnly = argv.includes("--world-only");

fs.mkdirSync(outDir, { recursive: true });

let usExtremes = [];
let usOutlines = [];
let worldExtremes = [];
let worldOutlines = [];

if (!worldOnly) {
  const usFc = await fetchJson(US_SOURCE_URL, path.join(cacheDir, "census_state.json"));
  const us = buildUs(usFc);
  usExtremes = us.extremeFeatures;
  usOutlines = us.outlineFeatures;
  writeFc(path.join(outDir, "extremes.geojson"), usExtremes);
  writeFc(path.join(outDir, "states.geojson"), usOutlines);
  console.log(`US: ${usExtremes.length} points, ${usOutlines.length} outlines`);
}

if (!usOnly) {
  const worldFc = await fetchJson(WORLD_SOURCE_URL, path.join(cacheDir, "ne_50m_admin_0_countries.geojson"));
  const world = buildWorld(worldFc);
  worldExtremes = world.extremeFeatures;
  worldOutlines = world.outlineFeatures;
  writeFc(path.join(outDir, "countries-extremes.geojson"), worldExtremes);
  writeFc(path.join(outDir, "countries-outlines.geojson"), worldOutlines);
  console.log(`World: ${worldExtremes.length} points, ${worldOutlines.length} outlines`);
}

// Combined catalog for the client (points only — outlines stay split for densify cost).
if (!usOnly && !worldOnly) {
  writeFc(path.join(outDir, "all-extremes.geojson"), [...usExtremes, ...worldExtremes]);
  console.log(`Combined extremes: ${usExtremes.length + worldExtremes.length} points → ${outDir}`);
}
