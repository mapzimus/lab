---
name: map-csp
description: Run web map libraries (Leaflet, MapLibre GL, Turf, Globe.gl) under a strict Content-Security-Policy — vendoring libraries for script-src 'self', the exact CSP directives each library needs for tiles/workers/fonts, and the Cloudflare Pages _headers patterns. Use this whenever a map is blank or a library silently fails on a site with a CSP, when adding a map page to a locked-down static site, when writing or editing a _headers/CSP config that involves maps, or when deciding between CDN and self-hosted map libraries.
---

# Maps under a strict Content-Security-Policy

A locked-down static site (`default-src 'self'; script-src 'self'`) breaks
map pages in ways that look like library bugs: blank tiles, dead workers,
missing fonts. Every failure is a missing CSP directive, and each library
has a known set. Fix the policy, not the library.

## Baseline policy for a static site

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self';
  img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'self';
  frame-ancestors 'self'; form-action 'self'
```

## What each library needs on top

| Library | Directives to add | Why |
|---|---|---|
| Leaflet + raster tiles | `img-src` += tile host(s) | tiles load via `<img>` |
| MapLibre GL | `worker-src 'self' blob:`, `child-src 'self' blob:`, `connect-src` += tile/style/glyph hosts, `img-src` += `blob:` | spawns tile workers from blob: URLs; fetches tiles/styles/glyphs with `fetch()` — putting the tile host in img-src looks right and **silently fails** |
| Turf.js | nothing | pure computation |
| Globe.gl / three.js | `img-src` += texture hosts (or inline textures as `data:`) | textures load as images |
| Google Fonts (any page) | `style-src` += fonts.googleapis.com, `font-src` += fonts.gstatic.com | or self-host the woff2 |

Notes:
- Leaflet's default OSM URL without subdomains is `https://tile.openstreetmap.org/...`
  — allow exactly that host; the `a./b./c.` subdomain variants each need
  their own entry if used.
- No map library here needs `unsafe-inline` or `unsafe-eval`. If a policy
  seems to demand them, the actual problem is an inline `<script>`/handler —
  move the code to a same-origin file instead.

## Vendoring (the `script-src 'self'` answer)

CDN `<script>` tags are blocked, so self-host each library beside the page:

```
page/
├── index.html          → <script src="/page/vendor/maplibre-gl.js" defer>
└── vendor/
    ├── maplibre-gl.js
    ├── maplibre-gl.css
    └── README.md       ← version, source URL, license per file — always
```

The vendor README convention matters: record exact version, the URL it was
downloaded from, and the license, so updates are a re-download + version
bump, and licensing stays auditable. Skip files the page never requests
(e.g. Leaflet's `images/` when only vector layers are used).

## Cloudflare Pages `_headers` patterns

Per-path override — **both blocks detach first** so exactly one CSP header
ships whether or not the splat matches the bare path:

```
/lab/my-map/
  ! Content-Security-Policy
  Content-Security-Policy: <site policy + map additions>

/lab/my-map/*
  ! Content-Security-Policy
  Content-Security-Policy: <same>
```

Force-download for packaged artifacts:

```
/files/*
  Content-Type: application/zip
  Content-Disposition: attachment
```

## Debugging checklist

1. Open DevTools console — CSP violations name the blocked URL and the
   directive that blocked it. Trust that report over intuition.
2. Blank MapLibre map + silent console: check `worker-src`. Worker failures
   often don't surface as CSP errors.
3. Tiles 200 in the network tab but map blank: the *worker* is blocked, not
   the tiles.
4. Verify the deployed header, not the source file:
   `curl -sI https://site/page/ | grep -i content-security` — header files
   have their own syntax pitfalls and silently ignore malformed blocks.
5. Headless test trick: block the tile host in the test harness and assert
   the page still builds its UI — pages should hang their setup on
   `style.load`/DOM events, never on tile completion.
