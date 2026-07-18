---
name: spherical-geometry
description: Exact spherical geometry for maps — great circles, loxodromes (rhumb lines), small circles, isoazimuthals, antipodes, equidistant loci, cross-track distance — computed as 3D vectors on the unit sphere and rendered without antimeridian or polar artifacts. Use this whenever a task involves geodesics, bearings, "shortest path on Earth", antipodal points, circles of constant distance, curves that wrap the planet, or when a drawn line crosses ±180° and smears across the map. Stronger than Turf for planet-scale correctness; comes with a battle-tested geometry kernel.
---

# Spherical geometry that renders correctly

Planet-scale curves computed in lat/lon go wrong two ways: the math wobbles
near poles and antipodes, and the rendering smears when a curve crosses the
antimeridian. Both problems disappear with one discipline: **do the math as
3D unit vectors on the sphere, convert to lat/lon only at the edge, and
split for the renderer at ±180°.**

A complete kernel implementing everything below ships in
`references/geometry.js` (plain browser JS, no dependencies, exposes
`window.Geometry`). Prefer copying it into the project over re-deriving —
it exists because re-derivations kept getting the edge cases wrong.

## The vector toolbox

```js
latLonToXYZ(lat, lon)      // → [x,y,z] on the unit sphere
xyzToLatLon(v)             // → { lat, lon }
normalize / dot / cross / negate / add / sub
angularKm(a, b)            // great-circle distance via atan2 (stable at 0° and 180°)
```

Every construction is a one-liner in vector form:

| Want | Compute |
|---|---|
| Great circle through A and B | plane normal `n = normalize(cross(a, b))` |
| Midpoint of A→B arc | `normalize(add(a, b))` |
| Antipode | `negate(p)` |
| Equidistant locus from A and B | great circle with normal `normalize(sub(a, b))` |
| Poles of the A–B great circle | `±n` |
| Distance | `atan2(norm(cross(a,b)), dot(a,b)) * R` — never `acos(dot)` (blows up at 0°/180°) |
| Cross-track distance of P from A→B | `asin(dot(P, n)) * R` (signed: + is left of travel) |

## Sampling curves (kernel functions)

- `sampleGreatCircle(normal, n)` — full 360° circle from its plane normal:
  build an orthonormal basis `u, v` in the plane, walk `u·cosθ + v·sinθ`.
- `sampleSmallCircle(P, angRad, n)` — constant-distance ring around P
  (past `π/2` it's beyond P's horizon great circle; at `π` it degenerates
  to the antipode).
- `sampleLoxodrome(P, bearingDeg, distKm, n)` — constant-compass-bearing
  path; spirals infinitely into a pole, so truncate at |lat| ≈ 89.5°.
- `sampleIsoazimuthal(P, thetaDeg, n)` — locus where the great-circle
  back-bearing toward P is constant. No closed form — azimuth search per
  longitude; skip near the antipode where bearing is undefined.

## Rendering pipeline (the part everyone gets wrong)

```js
const segs = Geometry.antimeridianSplit(samples);        // 1. split at ±180°
for (const seg of segs)
  for (const clipped of Geometry.clipPolylineToLat(seg, 85))  // 2. clip poles
    drawPolyline(clipped);                                // 3. draw each piece
```

1. **`antimeridianSplit`** — a curve sampled around the sphere jumps from
   +179.9° to −179.9°; drawn naively that's a horizontal slash across the
   whole map. Split into segments wherever consecutive longitudes differ by
   more than 180°.
2. **`clipPolylineToLat(seg, 85)`** — Web Mercator cannot represent
   |lat| > 85.05°, so polar-bound curves otherwise smear as stripes along
   the top/bottom edge. This applies to MapLibre's globe too (it's built on
   Mercator tiles — the poles are holes), so the clip stays correct even on
   a 3D globe.
3. Sample densely (240–360 points per full curve) so segments hug the
   sphere on globe projections instead of cutting chords.

## Numerical gotchas

- **Normalize after every construction** — accumulated drift off the unit
  sphere corrupts later `asin`/`atan2` calls. `clamp(x, -1, 1)` before any
  `asin`/`acos`.
- **Degenerate cases are real inputs**: A = B (no unique great circle),
  A = −B (infinitely many), small circle at the antipode (a point),
  near-polar reference vectors (pick an alternate basis vector when
  `|dot(P, Z)| > 0.9999`). Detect and message, don't NaN.
- **Bearing at a pole is undefined** — guard before computing.
- Earth radius: 6371.0 km (mean). Don't mix with WGS84 semi-major
  6378.137 km in the same calculation.
