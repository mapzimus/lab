# Hurricane Globe

Every tropical cyclone on record, in every ocean basin, drawn on a three.js
globe: about 12,700 storms and 386,000 fixes. The North Atlantic (1851–) and
Eastern & Central Pacific (1949–) come from NOAA's HURDAT2. The West Pacific,
North Indian, South Indian, South Pacific and South Atlantic come from NOAA
NCEI's IBTrACS v04r01.

Tracks are coloured by Saffir-Simpson category. With "Track height = wind speed"
on, each track rises off the surface in proportion to its wind, and a selected
storm gets a translucent curtain down to the ground so you can read its
intensity along the path. Hover picks the nearest fix on screen within 10 px.

- **South Atlantic.** IBTrACS holds only Catarina (2004), Anita (2010) and
  Arani (2011). Later storms named by the Brazilian Navy, such as Iba (2019)
  and Akará (2024), are not in any international best-track archive, so they
  are not drawn.
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
- **Rain and radar.** Season and single-storm playback, and any selected storm,
  can show the storm's rain:
  - **Satellite rain** is NASA GPM IMERG half-hourly precipitation (1998–) from
    GIBS. Its EPSG:4326 WMTS tiles at zoom 2 (5×3 tiles of 72°, about IMERG's
    native 0.1°) are painted into an equirectangular canvas on a sphere just
    above the globe. The canvas is masked to a soft 12° disc around each active
    storm.
  - **US radar** is the NEXRAD N0R base-reflectivity composite (1995–) from the
    Iowa Environmental Mesonet. When a storm centre is within reach of the US
    network, a 4×4 block of zoom-6 Web Mercator tiles is drawn on a patch of the
    sphere whose grid is spaced evenly in Mercator y. That makes the texture
    coordinates linear, so no reprojection shader is needed.
  - Playback steps the imagery every speed/4 hours of storm time (3 h at
    12 h/s), and every half hour when paused or scrubbing, fetching the next
    step ahead. A selected storm gets a time slider plus Peak and Landfall
    buttons, with a ring marking where the storm was at that moment.
  - Both services allow cross-origin image loads. They are the page's only
    run-time dependencies, and if either is down, its layer simply stays empty.
- **Annual chart.** Storms per year with hurricanes and majors overlaid. Hover
  for counts and ACE, click to narrow the filters to that year.
- **Season playback.** Replays a year with running named, hurricane, major and
  ACE counts. ACE sums 10⁻⁴·v² over synoptic (00/06/12/18 UTC) fixes at
  34 kt or more with tropical or subtropical status.
- A URL hash such as `#AL122005` or `#WP312013` opens straight to that storm.
- The info panel names each storm the way its own basin does (super typhoon,
  very severe cyclonic storm, severe tropical cyclone). South of the equator,
  playback eyes are mirrored and spin clockwise.
- Each storm caches its vertex positions (per height setting) and colours, so a
  filter change only copies typed arrays. Hover picking counting-sorts fixes
  into 5° bins of ground position and only projects the bins within 10° of the
  point under the cursor. Filter changes are coalesced to one rebuild per frame
  (about 150–200 ms for the whole world).

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
    Pacific are left to HURDAT2. Main-track fixes are kept at the 6-hourly
    synoptic times, plus any off-hour fix an agency reported (an `O` anywhere in
    `IFLAG`, which has one flag per agency) and the moment a storm first comes
    ashore (`DIST2LAND` reaching 0), which becomes a landfall. IBTrACS's own
    3-hourly interpolations are dropped.
- Winds are 1-minute sustained everywhere so the Saffir-Simpson colours compare
  across basins. Each IBTrACS fix takes the first wind it has: the US agency
  (JTWC outside the Americas), then the WMO agency, then any other regional
  agency (Tokyo, CMA, HKO, KMA, New Delhi, Réunion, BoM, Nadi, Wellington), then
  the historical compilations (Neumann, DS824, TD9636, TD9635, MLC). 10-minute
  agencies are divided by 0.88 and 2- or 3-minute ones (CMA, New Delhi) by 0.93.
  The historical sets are used as reported and are often coarse class values
  (25/30/45/64 kt). Wind radii come from the US agency columns and start in
  2001–2004, depending on the basin.
- A fix with no wind from any source is stored as `-1`. About 2,700 storms,
  mostly West Pacific before 1940 and South Indian before 1950, have a track
  but no wind at all. The page draws them in their own colour, and a checkbox
  shows or hides them independently of the intensity filter.
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
