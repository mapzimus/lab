---
name: turf-analysis
description: Client-side GIS analysis in the browser with Turf.js — buffers, spatial joins, Voronoi, hex binning, clustering, interpolation, geodesic measurement — with no server or backend. Use this whenever a task involves analyzing GeoJSON in JavaScript, spatial questions in a web page ("points within", "how far", "coverage area", "bin these points"), pairing analysis with a Leaflet/MapLibre map, or when someone reaches for PostGIS/shapely for something the browser could do. Also use it to pick the right Turf function or debug one that returns wrong-looking geometry.
---

# Turf.js — browser-side GIS analysis

Turf covers the operations you'd otherwise need PostGIS, QGIS, or shapely
for — entirely client-side. For static sites and browser tools that's the
ideal shape: zero infrastructure, all the GIS.

## The one mental model

> Almost every Turf function takes GeoJSON in and returns GeoJSON out.

Pure functions, no mutation: the whole API is a pipeline. Make GeoJSON,
transform it, measure it, hand it to a renderer (Leaflet, MapLibre,
OpenLayers all consume GeoJSON natively). **Turf computes, the map library
draws** — keep those roles separate and every tool is the same ~15 lines
with a different middle.

Helpers so you never hand-write GeoJSON:

```js
turf.point([-73.98, 40.75]);                          // [lng, lat]!
turf.lineString([[-73.98, 40.75], [-73.95, 40.77]]);
turf.polygon([[[0,0],[10,0],[10,10],[0,10],[0,0]]]);  // ring must close
turf.featureCollection([a, b, c]);
```

## Picking the function

| Ask | Reach for |
|---|---|
| how big / how far / where's the middle | `distance`, `area`, `length`, `bearing`, `bbox`, `centroid`, `destination`, `along`, `midpoint` |
| reshape geometry | `buffer`, `simplify`, `union`, `intersect`, `difference`, `dissolve`, `convex`, `concave`, `circle`, `bboxClip` |
| yes/no spatial questions | `booleanPointInPolygon`, `booleanIntersects`, `booleanContains`, `booleanWithin` |
| attach attributes by location | `pointsWithinPolygon`, `tag`, `collect` |
| closest thing / snap / slice | `nearestPoint`, `nearestPointOnLine`, `lineSlice`, `greatCircle` |
| bin or group points | `hexGrid`, `squareGrid`, `pointGrid`, `clustersDbscan`, `clustersKmeans` |
| points → surfaces | `interpolate` (IDW), `isolines`, `isobands`, `tin`, `voronoi` |
| switch geometry types | `explode`, `flatten`, `combine`, `polygonize`, `polygonToLine` |
| test / generative data | `randomPoint`, `randomPolygon` |
| iterate GeoJSON | `coordEach`, `featureEach`, `propEach` |

Full index: https://turfjs.org/docs/

## Loading

- **Quick start / CDN**: `<script src="https://cdn.jsdelivr.net/npm/@turf/turf@7/turf.min.js"></script>` → one `turf` global.
- **Bundled**: `import { buffer, area } from '@turf/turf'` (tree-shakeable), or per-module `npm i @turf/buffer`. TS types ship with every module.
- **CSP-locked sites** (`script-src 'self'`): CDN tags are blocked — vendor
  `turf.min.js` next to the page and load it same-origin. (See the
  `map-csp` skill for the full pattern.)

## Canonical patterns

Buffer + spatial join (click → catchment → count):

```js
map.on('click', (e) => {
  const here = turf.point([e.latlng.lng, e.latlng.lat]);   // flip to [lng, lat]
  const zone = turf.buffer(here, 1, { units: 'kilometers' });
  const inside = turf.pointsWithinPolygon(stores, zone);
  L.geoJSON(zone).addTo(map);
  report(`${inside.features.length} within 1 km`);
});
```

Hex binning with counts (`hexGrid` + `collect`):

```js
const grid = turf.hexGrid(turf.bbox(points), 0.6, { units: 'kilometers' });
turf.collect(grid, points, 'id', 'ids');       // per-cell membership
grid.features.forEach((c) => { c.properties.n = c.properties.ids.length; });
```

Voronoi needs an explicit bbox: `turf.voronoi(points, { bbox: turf.bbox(extent) })` —
cells at the edge are clipped to it, and collinear/duplicate points produce
null cells (filter them).

Geodesic measurement: `turf.distance(a, b)` is great-circle;
`turf.greatCircle(a, b)` returns a densified line that renders correctly on
both flat maps and globes, splitting at the antimeridian.

## Gotchas

1. **`[longitude, latitude]` order.** GeoJSON/Turf are lng-first; Leaflet is
   lat-first. Convert at the boundary — a silently flipped pair puts your
   point in the ocean off West Africa.
2. **Planar-ish math.** `buffer`, `area`, `intersect` use planar algorithms
   with spherical-earth constants — fine at city/regional scale, distorted
   at continental scale and near the poles. Use `greatCircle` / `rhumb*`
   variants when geodesic behavior matters, or the `spherical-geometry`
   skill's exact-sphere approach.
3. **Units are explicit.** Most functions take `{units: ...}`; `distance`
   defaults to kilometers; `area` always returns square meters.
4. **Rings must close** — a polygon's first and last coordinates must match,
   or functions throw/misbehave.
5. **Do heavy ops once.** Turf is single-threaded JS: cache expensive
   results (`voronoi`, big `union`s) instead of recomputing per interaction,
   and `simplify` dense inputs first.
6. **Old boolean quirks.** v6-era `union`/`intersect` took Features, v7
   takes a FeatureCollection — check the installed major version before
   copying old snippets.
