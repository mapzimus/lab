# Vendored libraries

Self-hosted rather than pulled from a CDN, so the page depends on nothing at run
time but its own origin and one tile service. MapLibre spins its tile workers up
from `blob:` URLs, so any CSP covering this path needs
`worker-src 'self' blob:` / `child-src 'self' blob:` alongside `script-src 'self'`.

| File | Library | Version | Source | License |
|---|---|---|---|---|
| `maplibre-gl.js` | MapLibre GL JS | 5.6.1 | `https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js` | BSD-3-Clause © MapLibre contributors |
| `maplibre-gl.css` | MapLibre GL JS | 5.6.1 | `https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css` | BSD-3-Clause © MapLibre contributors |
