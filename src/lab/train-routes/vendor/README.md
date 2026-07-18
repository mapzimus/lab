# Vendored libraries

Self-hosted so the atlas satisfies the site-wide `script-src 'self'`
Content-Security-Policy (see `src/_headers`). Copied from
`src/lab/turf-playground/vendor/`; update both together.

| File | Library | Version | Source | License |
|---|---|---|---|---|
| `leaflet.js` | Leaflet | 1.9.4 | `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js` | BSD-2-Clause © 2010–2023 Vladimir Agafonkin, CloudMade |
| `leaflet.css` | Leaflet | 1.9.4 | `https://unpkg.com/leaflet@1.9.4/dist/leaflet.css` | BSD-2-Clause © 2010–2023 Vladimir Agafonkin, CloudMade |

Leaflet's `images/` directory is deliberately not vendored: the atlas uses
only vector layers, so the default marker icons and layer-control sprites
referenced by `leaflet.css` are never requested.
