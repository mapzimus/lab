// A basemap the page owns.
//
//   node src/lab/national-parks/pipeline/04_states.mjs
//
// Output: data/states.geojson
//
// The park boundaries are drawn over a third-party tile service, and a free one
// can be slow, blocked or down. Without any ground of its own the map then shows
// 63 coloured shapes floating in a void, which is useless for the one question
// this map exists to answer — where is this park? So the states travel with the
// page: ~150 kB of Census cartographic boundaries, drawn under everything, as a
// silhouette when the tiles fail and a faint reference frame when they arrive.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MAPSHAPER = "mapshaper@0.7.56";
// The 500k file rather than the coarser 20m one: 20m stops at the 50 states,
// DC and Puerto Rico, and this map needs the Virgin Islands and American Samoa
// too — two of the 63 parks are there. It is simplified hard below anyway.
const SOURCE = "https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_state_500k.zip";

const here = path.dirname(fileURLToPath(import.meta.url));
const raw = path.join(here, "raw");
const data = path.join(here, "..", "data");
const zip = path.join(raw, "cb_2023_us_state_500k.zip");
const out = path.join(data, "states.geojson");

fs.mkdirSync(raw, { recursive: true });
if (!fs.existsSync(zip)) {
  const res = await fetch(SOURCE, { headers: { "User-Agent": "mapzimus-lab/1.0 (https://mapzimus.com)" } });
  if (!res.ok) throw new Error(`census HTTP ${res.status}`);
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
}
console.log(`source ${(fs.statSync(zip).size / 1e6).toFixed(1)} MB`);

execFileSync(
  "npx",
  [
    "--yes", MAPSHAPER, zip,
    "-filter-fields", "STUSPS,NAME",
    "-rename-fields", "abbr=STUSPS,name=NAME",
    // Drop the 1,138 specks under 8 km² — they cost most of the file and none
    // of them reads at any zoom this map uses. keep-shapes still guarantees
    // every state and territory survives, the Virgin Islands included.
    "-filter-islands", "min-area=8km2", "remove-empty",
    "-simplify", "interval=1500", "keep-shapes",
    "-o", out, "precision=0.001", "format=geojson",
  ],
  { stdio: "inherit" },
);

const fc = JSON.parse(fs.readFileSync(out, "utf8"));

// Alaska reaches past 180°, and Census stores the Aleutians beyond the line as
// positive longitudes. Left alone, the state renders as a band smeared right
// across the map. Shifting those rings to continue west of -180 — which is what
// a web map wants — puts them where they belong, off the end of the chain.
let shifted = 0;
for (const feature of fc.features) {
  const polygons =
    feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  const lons = polygons.flatMap((rings) => rings[0].map(([x]) => x));
  if (Math.max(...lons) - Math.min(...lons) < 180) continue;
  for (const rings of polygons) {
    const outer = rings[0].map(([x]) => x);
    if (outer.reduce((a, b) => a + b, 0) / outer.length <= 0) continue;
    for (const ring of rings) {
      for (const point of ring) point[0] -= 360;
    }
    shifted += 1;
  }
}
if (shifted) {
  fs.writeFileSync(out, JSON.stringify(fc));
  console.log(`shifted ${shifted} rings across the antimeridian`);
}
if (fc.features.length < 50) throw new Error(`only ${fc.features.length} states came through`);
const missing = ["CA", "AK", "HI", "VI", "AS"].filter(
  (a) => !fc.features.some((f) => f.properties.abbr === a),
);
if (missing.length) throw new Error(`missing from the states layer: ${missing.join(", ")}`);

const kb = fs.statSync(out).size / 1e3;
if (kb > 400) throw new Error(`states layer is ${kb.toFixed(0)} kB — too heavy for a background layer`);
console.log(`wrote ${out}: ${fc.features.length} features, ${kb.toFixed(0)} kB`);
