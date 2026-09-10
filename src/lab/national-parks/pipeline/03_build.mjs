// Turn the raw NPS boundary dump and the scraped park facts into the three
// files the page actually loads.
//
//   node src/lab/national-parks/pipeline/03_build.mjs
//
// Outputs (committed):
//   data/parks.geojson  the 63 national parks
//   data/units.geojson  the other NPS units, loaded only when a layer is toggled
//   data/parks.json     the sidebar index: facts, areas, bboxes, descriptions
//
// Needs mapshaper for simplification; it is fetched on demand with npx so the
// repo itself stays dependency-free.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MAPSHAPER = "mapshaper@0.7.56";
const here = path.dirname(fileURLToPath(import.meta.url));
const raw = path.join(here, "raw");
const data = path.join(here, "..", "data");

// New River Gorge became the 63rd national park in December 2020, but the
// boundary service still files the whole unit under "National Preserves". Every
// other park-and-preserve unit is split into two records, one of each type; this
// one is not, so it needs naming by hand rather than a rule.
const PARK_OVERRIDES = { NERI: "New River Gorge National Park and Preserve" };

// Where the boundary service's unit name and Wikipedia's article title diverge
// beyond what normalisation reconciles. Used only to find the right row and the
// right article link — never as the name shown on the map.
const ARTICLE_OVERRIDES = {
  GLAC: "Glacier National Park (U.S.)",
  REDW: "Redwood National and State Parks",
  NERI: "New River Gorge National Park and Preserve",
};

// NPS stores its unit names in a plain-ASCII field. Two Hawaiian parks lose
// their diacritics to it; the service's own website spells them properly.
const DISPLAY_OVERRIDES = {
  HALE: "Haleakalā National Park",
  HAVO: "Hawai\u02bbi Volcanoes National Park",
};

// Caveats worth printing next to a number rather than leaving a reader to
// wonder why the two areas disagree by an order of magnitude.
const NOTES = {
  NERI:
    "NPS draws New River Gorge as one polygon covering both the national park " +
    "and its preserve, so the boundary here is about ten times the 7,021 acres " +
    "the acreage report credits to the park portion alone.",
  ACAD:
    "Acadia's federal acreage counts roughly 12,000 acres of conservation " +
    "easements that sit outside the boundary drawn here.",
};

const R = 6371008.8; // authalic radius, metres
const SQKM_PER_ACRE = 0.00404685642;
const rad = (deg) => (deg * Math.PI) / 180;

/** Signed spherical area of one ring, in square metres. */
function ringArea(ring) {
  if (ring.length < 3) return 0;
  let total = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[i + 1];
    // Normalise the longitude step so a ring that straddles the antimeridian
    // contributes its real width instead of a 360° jump.
    let dLon = rad(lon2 - lon1);
    if (dLon > Math.PI) dLon -= 2 * Math.PI;
    if (dLon < -Math.PI) dLon += 2 * Math.PI;
    total += dLon * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return (total * R * R) / 2;
}

/** Geodesic area of a Polygon/MultiPolygon, holes subtracted. */
function geodesicArea(geometry) {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let total = 0;
  for (const rings of polygons) {
    total += Math.abs(ringArea(rings[0]));
    for (let i = 1; i < rings.length; i++) total -= Math.abs(ringArea(rings[i]));
  }
  return total;
}

function bboxOf(geometry) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const rings of polygons) {
    for (const [x, y] of rings[0]) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY].map((n) => Number(n.toFixed(5)));
}

/** "Great Smoky Mountains National Park" → "Great Smoky Mountains". */
const shortName = (name) =>
  name
    .replace(/ National Park(s)?( and Preserve)?$/, "")
    .replace(/^National Park of /, "");

const normalise = (s) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯʻʼ‘’']/g, "")
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/\band preserve\b/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// ---------------------------------------------------------------- read inputs

const boundaries = JSON.parse(fs.readFileSync(path.join(raw, "nps-boundaries.geojson"), "utf8"));
const facts = JSON.parse(fs.readFileSync(path.join(raw, "park-facts.json"), "utf8"));

// A handful of units (Boston NHP most of all) arrive as several disjoint
// records. Merge each unit into one multipolygon so the map has one feature,
// one row and one click target per unit.
const merged = new Map();
for (const feature of boundaries.features) {
  const p = feature.properties;
  if (!feature.geometry) throw new Error(`${p.UNIT_CODE} has no geometry`);
  const key = `${p.UNIT_CODE}|${p.UNIT_NAME}`;
  const polygons =
    feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
  const existing = merged.get(key);
  if (existing) existing.polygons.push(...polygons);
  else merged.set(key, { props: p, polygons: [...polygons] });
}

const units = [...merged.values()].map(({ props, polygons }) => {
  const geometry =
    polygons.length === 1
      ? { type: "Polygon", coordinates: polygons[0] }
      : { type: "MultiPolygon", coordinates: polygons };
  const isPark =
    props.UNIT_TYPE === "National Parks" || Object.hasOwn(PARK_OVERRIDES, props.UNIT_CODE);
  return {
    code: props.UNIT_CODE,
    name:
      DISPLAY_OVERRIDES[props.UNIT_CODE] ??
      PARK_OVERRIDES[props.UNIT_CODE] ??
      props.UNIT_NAME,
    type: isPark ? "National Park" : props.UNIT_TYPE,
    states: (props.STATE ?? "").replace(/[^A-Z-]/g, "").split("-").filter(Boolean),
    region: props.REGION ?? null,
    tier: isPark ? "park" : "other",
    // Six decimals of a square kilometre is one square metre: enough that the
    // single-building units survive the round trip into acres.
    areaSqKm: Number((geodesicArea(geometry) / 1e6).toFixed(6)),
    bbox: bboxOf(geometry),
    geometry,
  };
});

const parks = units.filter((u) => u.tier === "park");
const others = units.filter((u) => u.tier === "other");
if (parks.length !== 63) throw new Error(`expected 63 national parks, classified ${parks.length}`);

// ------------------------------------------------------------- join the facts

const factsByName = new Map(facts.parks.map((p) => [normalise(p.article), p]));
for (const park of parks) {
  const key = normalise(ARTICLE_OVERRIDES[park.code] ?? park.name);
  const match = factsByName.get(key);
  if (!match) throw new Error(`no Wikipedia row matched ${park.code} "${park.name}" (${key})`);
  if (match.claimed) throw new Error(`two parks matched "${match.article}"`);
  match.claimed = true;
  park.facts = match;
}
const unmatched = facts.parks.filter((p) => !p.claimed);
if (unmatched.length) throw new Error(`unmatched park rows: ${unmatched.map((p) => p.article).join(", ")}`);

// -------------------------------------------------------------- simplify pass

function simplify(features, { interval, precision, name, clean }) {
  const inFile = path.join(raw, `${name}-full.geojson`);
  const outFile = path.join(raw, `${name}-simple.geojson`);
  fs.writeFileSync(
    inFile,
    JSON.stringify({
      type: "FeatureCollection",
      features: features.map((u) => ({
        type: "Feature",
        properties: { code: u.code, name: u.name },
        geometry: u.geometry,
      })),
    }),
  );
  // An interval (metres of ground resolution) rather than a percentage: a
  // percentage is a budget spread over every vertex in the layer, so the Alaska
  // giants eat it and the small units collapse. keep-shapes stops anything —
  // Dry Tortugas, the one-acre memorials — being simplified out of existence.
  //
  // -clean tidies the topology but drops six degenerate units from the mixed
  // layer, so it runs only where it keeps the feature count whole.
  execFileSync(
    "npx",
    [
      "--yes", MAPSHAPER, inFile,
      "-simplify", `interval=${interval}`, "keep-shapes",
      ...(clean ? ["-clean"] : []),
      "-o", outFile, `precision=${precision}`, "format=geojson",
    ],
    { stdio: "inherit" },
  );
  const out = JSON.parse(fs.readFileSync(outFile, "utf8"));
  if (out.features.length !== features.length) {
    throw new Error(`${name}: simplify returned ${out.features.length} of ${features.length}`);
  }
  return new Map(out.features.map((f) => [`${f.properties.code}|${f.properties.name}`, f.geometry]));
}

const parkGeoms = simplify(parks, { interval: 40, precision: 0.00001, name: "parks", clean: true });
const otherGeoms = simplify(others, { interval: 80, precision: 0.0001, name: "units", clean: false });

// Anchor each park's dot and label on a point guaranteed to be inside the
// boundary. A centroid is not: Redwood is three long coastal strips and
// Channel Islands is open water between five of them, so the average of the
// coordinates lands outside the park in both cases.
function innerPoints(sourceName) {
  const outFile = path.join(raw, `${sourceName}-points.geojson`);
  execFileSync(
    "npx",
    [
      "--yes", MAPSHAPER, path.join(raw, `${sourceName}-simple.geojson`),
      "-points", "inner",
      "-o", outFile, "precision=0.00001", "format=geojson",
    ],
    { stdio: "inherit" },
  );
  const out = JSON.parse(fs.readFileSync(outFile, "utf8"));
  return new Map(out.features.map((f) => [`${f.properties.code}|${f.properties.name}`, f.geometry.coordinates]));
}
const parkPoints = innerPoints("parks");
const unitPoints = innerPoints("units");

const countVertices = (list) =>
  list.reduce((sum, u) => {
    const polys = u.geometry.type === "Polygon" ? [u.geometry.coordinates] : u.geometry.coordinates;
    return sum + polys.flat().reduce((n, ring) => n + ring.length, 0);
  }, 0);

// --------------------------------------------------------------- write output

fs.mkdirSync(data, { recursive: true });

function writeLayer(file, features) {
  fs.writeFileSync(file, JSON.stringify({ type: "FeatureCollection", features }));
  return (fs.statSync(file).size / 1e6).toFixed(2);
}

const parkFeatures = parks.map((u) => {
  const geometry = parkGeoms.get(`${u.code}|${u.name}`);
  if (!geometry) throw new Error(`lost geometry for ${u.code}`);
  return {
    type: "Feature",
    id: parks.indexOf(u) + 1,
    properties: {
      code: u.code,
      name: u.name,
      short: shortName(u.name),
      region: u.region,
      visitors: u.facts.visitors,
      acres: u.facts.acres,
      established: u.facts.established,
      // The year on its own, so the map can class by era without asking
      // MapLibre to slice a date string inside a paint expression.
      year: Number(u.facts.established.slice(0, 4)),
    },
    geometry,
  };
});

const otherFeatures = others.map((u, i) => {
  const geometry = otherGeoms.get(`${u.code}|${u.name}`);
  if (!geometry) throw new Error(`lost geometry for ${u.code}`);
  return {
    type: "Feature",
    id: i + 1,
    // Acres to three decimals, not square kilometres: the smallest units here
    // are single buildings — the Kennedy birthplace is 0.087 acres, Ford's
    // Theatre 0.3 — and anything coarser rounds them to a flat zero.
    properties: {
      code: u.code,
      name: u.name,
      type: u.type,
      states: u.states.join(", "),
      acres: Number((u.areaSqKm / SQKM_PER_ACRE).toFixed(3)),
    },
    geometry,
  };
});

// A circle layer drawn straight off a polygon source puts a dot on every
// vertex, so the small units get their own point layer to be findable by.
const unitPointFeatures = others.map((u) => ({
  type: "Feature",
  properties: { code: u.code, name: u.name, type: u.type },
  geometry: {
    type: "Point",
    coordinates: unitPoints.get(`${u.code}|${u.name}`) ?? [
      (u.bbox[0] + u.bbox[2]) / 2,
      (u.bbox[1] + u.bbox[3]) / 2,
    ],
  },
}));

const parksSize = writeLayer(path.join(data, "parks.geojson"), parkFeatures);
const unitsSize = writeLayer(path.join(data, "units.geojson"), otherFeatures);
const unitPointsSize = writeLayer(path.join(data, "unit-points.geojson"), unitPointFeatures);

const index = {
  meta: {
    generated: new Date().toISOString().slice(0, 10),
    boundaries: {
      source: "NPS Land Resources Division — boundary and tract data service",
      url: "https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/NPS_Land_Resources_Division_Boundary_and_Tract_Data_Service/FeatureServer/2",
    },
    facts: {
      source: `Wikipedia, "${facts.source.page}" (rev ${facts.source.revision}), transcribing NPS acreage and visitation reports`,
      url: "https://en.wikipedia.org/wiki/List_of_national_parks_of_the_United_States",
      retrieved: facts.source.retrieved,
      license: "CC BY-SA 4.0",
    },
    acreageYear: facts.acreageYear,
    visitorYear: facts.visitorYear,
    parkCount: parks.length,
    otherUnitCount: others.length,
    unitTypes: [...new Set(others.map((u) => u.type))].sort(),
  },
  parks: parkFeatures.map((f, i) => {
    const u = parks[i];
    return {
      code: u.code,
      name: u.name,
      short: f.properties.short,
      location: u.facts.location,
      states: u.states,
      region: u.region,
      established: u.facts.established,
      acres: u.facts.acres,
      sqkm: u.areaSqKm,
      visitors: u.facts.visitors,
      bbox: u.bbox,
      point: parkPoints.get(`${u.code}|${u.name}`) ?? u.facts.labelPoint,
      note: NOTES[u.code] ?? null,
      description: u.facts.description,
      wikipedia: u.facts.wikipedia,
      nps: `https://www.nps.gov/${u.code.toLowerCase()}/`,
    };
  }),
};
fs.writeFileSync(path.join(data, "parks.json"), JSON.stringify(index));

console.log(`parks.geojson  ${parkFeatures.length} features  ${parksSize} MB  (${countVertices(parks).toLocaleString()} source vertices)`);
console.log(`units.geojson  ${otherFeatures.length} features  ${unitsSize} MB  (${countVertices(others).toLocaleString()} source vertices)`);
console.log(`unit-points    ${unitPointFeatures.length} features  ${unitPointsSize} MB`);
console.log(`parks.json     ${(fs.statSync(path.join(data, "parks.json")).size / 1e3).toFixed(0)} kB`);
