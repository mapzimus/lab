# Hurricane Globe

Every Atlantic (1851–2025) and Eastern Pacific (1949–2025) tropical cyclone in
NOAA's HURDAT2 best-track database, drawn on a three.js globe: 3,250 storms and
87,584 six-hourly fixes.

Tracks are coloured by Saffir-Simpson category. With "Track height = wind speed"
on, each track rises off the surface in proportion to its wind, and a selected
storm gets a translucent curtain down to the ground so you can read its
intensity along the path. Hover picking projects every visible fix to screen
space and takes the nearest one within 10 px.

- **Wind fields (2004+).** A selected storm shows its lifetime 34/50/64 kt
  swath, built from NHC quadrant radii: each fix becomes four quarter circles,
  consecutive fixes are joined by their convex hull, and the hulls are drawn
  innermost band first through the stencil buffer, so each pixel shows one band
  and overlaps never stack. Season and single-storm playback draw each storm's
  live wind field (radii interpolated between fixes) under its spinning eye.
- **Density.** Instanced columns count the distinct storms whose tropical track
  crossed each 2° cell (segments sampled every half degree) under the current
  filters. Click a column to list the storms near it.
- **Storms near a place.** Choose a preset or pick any point, set a radius, and
  get every storm that passed within it, with its strongest wind inside the
  circle and its closest approach. The tracks and the annual chart narrow to
  those storms too.
- **Annual chart.** Storms per year with hurricanes and majors overlaid. Hover
  for counts and ACE, click to narrow the filters to that year.
- **Season playback.** Replays a year with running named, hurricane, major and
  ACE counts. ACE sums 10⁻⁴·v² over synoptic (00/06/12/18 UTC) fixes at
  34 kt or more with tropical or subtropical status.
- A URL hash such as `#AL122005` opens straight to that storm.

## Data

- `data/storms.json` is built by `pipeline/build_data.py` from the NHC HURDAT2
  releases `hurdat2-1851-2025-092326.txt` and
  `hurdat2-nepac-1949-2025-092926.txt`
  (<https://www.nhc.noaa.gov/data/hurdat/>). The script downloads them into
  `.cache/hurdat2/` when they are missing. Each fix is
  `[lat, lon, wind_kt, pressure_mb, hours_since_first_fix, status, landfall]`,
  and storms with wind radii carry a parallel `r` array of the 12 radii (nm).
- `data/countries-50m.json` is world-atlas 2.0.2 (Natural Earth 1:50m). Land is
  painted into an equirectangular canvas texture with d3-geo, so the
  antimeridian and poles are cut correctly. Coastlines and borders are 3D lines.

## Vendored libraries

`vendor/libs-three-0.160.0.js` is one esbuild ESM bundle
(`--bundle --format=esm --minify --legal-comments=eof`) of the entry below, so
the page loads nothing from a CDN. Licence notices are kept at the end of the
file. The version is in the file name because app.js imports it directly and
the build only fingerprints references in HTML and data URLs, so rename the
file whenever you rebuild it.

```js
export * as THREE from 'three';                                                    // three 0.160.0, MIT
export { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
export { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
export { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
export { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
export { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
export { feature, mesh } from 'topojson-client';                                   // 3.1.0, ISC
export { geoEquirectangular, geoPath } from 'd3-geo';                              // 3.1.1, ISC
```
