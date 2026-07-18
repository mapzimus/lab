# Turf.js — field guide for the lab

*Written July 2026 · Turf v7.3.x · [turfjs.org](https://turfjs.org/) · [github.com/Turfjs/turf](https://github.com/Turfjs/turf) · MIT*

Turf is a geospatial analysis toolkit that runs entirely in the browser (or
Node). It covers the operations you would otherwise reach for PostGIS, QGIS,
or `shapely` to do — buffers, intersections, distance, area, spatial joins,
clustering, interpolation — with no server and no backend call. For a static
Cloudflare Pages site full of browser tools, that is the ideal shape: zero
infrastructure, all the GIS.

A live demo of the patterns below lives at
[`/lab/turf-playground/`](https://mapzimus.com/lab/turf-playground/)
(source: `src/lab/turf-playground/index.html`).

## The one mental model

> Almost every Turf function takes GeoJSON in and returns GeoJSON out.

They are pure functions: `turf.buffer(poly, 5, {units:'kilometers'})` returns
a *new* Feature and mutates nothing. So the whole API is a pipeline — make
GeoJSON, transform it, measure it, hand it to a renderer. Leaflet, MapLibre,
OpenLayers, and Mapbox GL all consume GeoJSON natively, which makes Turf the
math half of a two-library pattern: **Turf computes, the map library draws.**

Helpers keep you from hand-writing GeoJSON:

```js
turf.point([-73.98, 40.75]);                          // [lng, lat]!
turf.lineString([[-73.98, 40.75], [-73.95, 40.77]]);
turf.polygon([[[0,0],[10,0],[10,10],[0,10],[0,0]]]);  // ring must close
turf.featureCollection([a, b, c]);
```

## Function families

| Family | Ask | Reach for |
|---|---|---|
| Measurement | how big / how far / where's the middle | `distance`, `area`, `length`, `bearing`, `bbox`, `center`, `centroid`, `destination`, `along`, `midpoint` |
| Transformation | reshape geometry | `buffer`, `simplify`, `union`, `intersect`, `difference`, `dissolve`, `convex`, `concave`, `circle`, `bboxClip`, `transformRotate/Scale/Translate` |
| Booleans | yes/no spatial questions | `booleanPointInPolygon`, `booleanIntersects`, `booleanContains`, `booleanWithin`, `booleanOverlap` |
| Joins | attach attributes by location | `pointsWithinPolygon`, `tag`, `collect` |
| Nearest / lines | closest thing, snap, slice | `nearestPoint`, `nearestPointOnLine`, `lineSlice`, `shortestPath`, `greatCircle` |
| Grids & clusters | bin or group points | `hexGrid`, `squareGrid`, `triangleGrid`, `pointGrid`, `clustersDbscan`, `clustersKmeans` |
| Interpolation | points → surfaces | `interpolate` (IDW), `isolines`, `isobands`, `tin`, `voronoi` |
| Conversion | switch geometry types | `explode`, `flatten`, `combine`, `polygonize`, `polygonToLine`, `lineToPolygon` |
| Random | generative / test data | `randomPoint`, `randomPolygon`, `randomLineString` |
| Meta | functional iteration | `coordEach`, `featureEach`, `propEach`, `geomEach` |

Full index: <https://turfjs.org/docs/>

## Two ways to load it

**CDN global — fits the lab's vanilla-JS pages.** One tag, one `turf` global:

```html
<script src="https://cdn.jsdelivr.net/npm/@turf/turf@7/turf.min.js"></script>
```

**npm, modular — for anything bundled.** The meta-package is tree-shakeable,
or install only the modules a tool uses:

```js
import { point, buffer, area } from '@turf/turf';   // npm i @turf/turf
import buffer from '@turf/buffer';                  // or npm i @turf/buffer
```

TypeScript definitions ship with every module.

## Canonical example (Turf + Leaflet)

Click the map, drop a 1 km catchment, highlight every point inside:

```js
map.on('click', (e) => {
  const here = turf.point([e.latlng.lng, e.latlng.lat]);   // flip to [lng, lat]
  const zone = turf.buffer(here, 1, { units: 'kilometers' });
  const inside = turf.pointsWithinPolygon(stores, zone);   // spatial join
  L.geoJSON(zone).addTo(map);
  console.log(`${inside.features.length} within 1 km`);
});
```

Swap `buffer` + `pointsWithinPolygon` for `voronoi`, `hexGrid` + `collect`,
`tin`, or `clustersDbscan` and the same 15 lines become four different tools.

## Gotchas

1. **`[longitude, latitude]` order.** GeoJSON/Turf are lng-first; Leaflet is
   lat-first. Convert at the boundary — a flipped pair puts your point in the
   ocean off West Africa.
2. **Planar-ish math.** `buffer`, `area`, `intersect` use planar algorithms
   with spherical-earth constants — fine at city/regional scale, distorted at
   continental scale and near the poles. Use `greatCircle` / `rhumb*` when
   geodesic behavior matters.
3. **Units are explicit.** Most functions take
   `{units: 'kilometers'|'miles'|'meters'|'degrees'|'radians'}`; `distance`
   defaults to kilometers; `area` always returns square meters.
4. **Rings must close.** A polygon's first and last coordinates must match.
5. **Do heavy ops once.** Turf is single-threaded JS; cache the output of
   expensive calls (`voronoi`, big `union`s) instead of recomputing per
   interaction, and `simplify` first when inputs are dense.

## Lab fit

- A Turf tool is a **pure static page** — no Pages Function, unlike the radar
  APIs. Cheapest possible kind of tool to add.
- Natural homes: **Tools → maps** (measurers, buffer/geofence checkers,
  GeoJSON utilities), **Maps** (Voronoi/TIN/hex aesthetics from real data),
  and the generative side of **Lab** via `random*` + `transform*`.
- Pairs with any renderer already in use; it replaces server-side GIS, not
  the map library.
