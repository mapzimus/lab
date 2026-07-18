# Vendored libraries

Self-hosted so the playground satisfies the site-wide `script-src 'self'`
Content-Security-Policy (see `src/_headers`). Update by re-downloading the
files below and bumping the versions here.

| File | Library | Version | Source | License |
|---|---|---|---|---|
| `turf.min.js` | Turf.js | 7.3.5 | `https://cdn.jsdelivr.net/npm/@turf/turf@7.3.5/turf.min.js` | MIT © Turf Authors |
| `leaflet.js` | Leaflet | 1.9.4 | `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js` | BSD-2-Clause © 2010–2023 Vladimir Agafonkin, CloudMade |
| `leaflet.css` | Leaflet | 1.9.4 | `https://unpkg.com/leaflet@1.9.4/dist/leaflet.css` | BSD-2-Clause © 2010–2023 Vladimir Agafonkin, CloudMade |

Leaflet's `images/` directory is deliberately not vendored: the playground
uses only `circleMarker` and vector layers, so the default marker icons and
layer-control sprites referenced by `leaflet.css` are never requested.
