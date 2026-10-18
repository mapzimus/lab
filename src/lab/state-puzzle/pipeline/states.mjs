// Trim the Census state outlines already shipped with State Extremes down to
// the 50 states, in the compact shape the puzzle wants.
//
//   node src/lab/state-puzzle/pipeline/states.mjs
//
// Output: data/states.json — [{ abbr, name, lon0, lat0, polys: [[ring...]] }]
// where a ring is a flat [lon, lat, lon, lat, ...] array and lon0/lat0 is the
// bounding-box centre each state is projected around.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, "..", "..", "state-extremes", "data", "states.geojson");
const out = path.join(here, "..", "data", "states.json");

const SKIP = new Set(["DC", "PR", "GU", "VI", "AS", "MP"]);
const fc = JSON.parse(fs.readFileSync(src, "utf8"));
const states = [];
for (const f of fc.features) {
  const { abbr, name } = f.properties;
  if (SKIP.has(abbr)) continue;
  const g = f.geometry;
  const polygons = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  const polys = polygons.map((rings) => rings.map((ring) => {
    const flat = [];
    for (const [lon, lat] of ring) {
      // Alaska's Aleutians cross the antimeridian; keep them on the west side
      // so the bounding box and the projection centre make sense.
      const L = abbr === "AK" && lon > 0 ? lon - 360 : lon;
      flat.push(Math.round(L * 1000) / 1000, Math.round(lat * 1000) / 1000);
      if (L < minLon) minLon = L; if (L > maxLon) maxLon = L;
      if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
    }
    return flat;
  }));
  states.push({ abbr, name, lon0: +((minLon + maxLon) / 2).toFixed(3), lat0: +((minLat + maxLat) / 2).toFixed(3), polys });
}
if (states.length !== 50) throw new Error(`expected 50 states, got ${states.length}`);
states.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(out, JSON.stringify(states));
console.log(`${states.length} states → ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} kB)`);
