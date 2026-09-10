# Vendored libraries

Self-hosted so the page has no CDN dependency and works under a strict
`script-src 'self'` Content-Security-Policy. Note MapLibre spins up its
tile workers from blob: URLs, so any CSP also needs
`worker-src 'self' blob:` / `child-src 'self' blob:`.

| File | Library | Version | Source | License |
|---|---|---|---|---|
| `maplibre-gl.js` | MapLibre GL JS | 5.6.1 | `https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js` | BSD-3-Clause © MapLibre contributors |
| `maplibre-gl.css` | MapLibre GL JS | 5.6.1 | `https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css` | BSD-3-Clause © MapLibre contributors |
