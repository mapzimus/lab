# Hurricane Globe

Every tropical cyclone on record, in every ocean basin, drawn on a three.js
globe: about 10,300 storms and 232,000 fixes. The North Atlantic (1851–) and
Eastern & Central Pacific (1949–) come from NOAA's HURDAT2. The West Pacific,
North Indian, South Indian, South Pacific and South Atlantic come from NOAA
NCEI's IBTrACS v04r01.

Tracks are coloured by Saffir-Simpson category. With "Track height = wind speed"
on, each track rises off the surface in proportion to its wind, and a selected
storm gets a translucent curtain down to the ground so you can read its
intensity along the path. Hover picks the nearest fix on screen within 10 px.

- **Wind fields (2001–04 on, by basin).** A selected storm shows its lifetime 34/50/64 kt
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
- A URL hash such as `#AL122005` or `#WP312013` opens straight to that storm.
- The info panel names each storm the way its own basin does (super typhoon,
  very severe cyclonic storm, severe tropical cyclone). South of the equator,
  playback eyes are mirrored and spin clockwise.
- Hover picking bins fixes by 5° of ground position and only projects the bins
  within 10° of the point under the cursor. Filter changes are coalesced to one
  rebuild per frame.

## Data

- `data/storms-<BASIN>.json` (AL, EP, WP, NI, SI, SP, SA) are built by
  `pipeline/build_data.py`, which downloads its sources into the repo's
  `.cache/` when they are missing:
  - HURDAT2 `hurdat2-1851-2025-092326.txt` and
    `hurdat2-nepac-1949-2025-092926.txt` (<https://www.nhc.noaa.gov/data/hurdat/>)
    for AL and EP.
  - IBTrACS v04r01 per-basin CSVs (`ibtracs.{WP,NI,SI,SP,SA}.list.v04r01.csv`)
    for the rest. Storms are deduplicated across the basin files and filed
    under the basin they formed in. Storms that formed in the Atlantic or East
    Pacific are left to HURDAT2. Only main-track, non-interpolated fixes are
    kept, plus the moment a storm first comes ashore (`DIST2LAND` reaching 0),
    which becomes a landfall.
- Winds are 1-minute sustained everywhere so the Saffir-Simpson colours compare
  across basins. IBTrACS fixes use the US agency wind (JTWC outside the
  Americas) when present. Otherwise they use the WMO agency's wind divided by
  0.88 (10-minute: Tokyo, Réunion, BoM, Nadi, Wellington) or 0.93 (3-minute:
  New Delhi). Wind radii come from the US agency columns and start in
  2001–2004, depending on the basin.
- Each fix is `[lat, lon, wind_kt, pressure_mb, hours_since_first_fix, status, landfall]`.
  Storms with wind radii carry a parallel `r` array of the 12 radii (nm).
  `year` is the season, so a Southern Hemisphere storm in January 2019 belongs
  to the 2019 season, which runs July 2018 to June 2019.
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
