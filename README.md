# Mapzimus

Source for [mapzimus.com](https://mapzimus.com), Maxwell Howe's working shelf of browser tools, maps, games, and experiments.

The site is both the index and the host. The 65 single-file tools that previously opened at `mapzimus.github.io/max/*.html` now build to clean first-party routes such as `/coordinate-converter/`. The six larger projects in the catalog are copied into their own routes as part of the same build.

## Local build

```sh
npm run build
npm run check
npm run preview
```

The build validates the catalog, checks that every hosted source is present, generates the index pages and sitemap, rewrites links between the legacy standalone tools, and assembles the complete static site in `dist/`. `npm run check` rebuilds and then verifies every local `href`/`src` plus all 71 first-party catalog routes.

## Site organization

- `/` is an edited front page: six starting points, task-based shelves, and a shortened recent index.
- `/tools/` is the complete browser-tool index.
- `/maps/`, `/data/`, `/design/`, `/teaching/`, `/math/`, `/play/`, and `/experiments/` are focused sections.
- Each standalone tool lives at `/<tool-slug>/`.
- Larger apps keep memorable paths such as `/geopuesto/playground/`, `/transit/`, and `/concord-war/`.

Source catalog records retain their previous public URLs as provenance. `scripts/build.mjs` generates `/data/catalog.json` with the new same-domain routes used by the live site.

## Cloudflare Pages

- Repository: `mapzimus/lab`
- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Custom domain: `mapzimus.com`

The global Content Security Policy was intentionally removed when the tools moved on-site: several maps and utilities load third-party tiles, scripts, images, or public APIs. The remaining response headers preserve HTTPS, MIME sniffing, referrer, framing, and browser-permission protections without disabling tool functionality.

## Updating hosted sources

`vendor/` contains deployable snapshots rather than Git submodules so Cloudflare can build the private `mapzimus/max` tools and the public projects without additional repository credentials. Update a snapshot from its upstream repository, record the new commit in `vendor/SOURCES.md`, then run the local build and link checks.
