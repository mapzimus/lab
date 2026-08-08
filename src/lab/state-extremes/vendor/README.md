# Vendored libraries

Self-hosted so the page satisfies `script-src 'self'`.

| File | Library | Version | Source | License |
|---|---|---|---|---|
| `d3.min.js` | D3 | 7.9.0 | `https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js` | ISC © Mike Bostock |

The map uses D3’s `geoEquirectangular` (plate carrée) so meridians and
parallels are straight — not Web Mercator.
