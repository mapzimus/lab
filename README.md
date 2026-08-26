# Mapzimus Lab

Source for [mapzimus.com](https://mapzimus.com), the creative lab for Maxwell Howe's browser tools, games, maps, and experiments.

Every catalog item that can run as static files is **hosted in this repo** and served as a first-party path on mapzimus.com. Snapshots live under `vendor/` (see `vendor/SOURCES.md`). The build copies them into `dist/` beside the front-door catalog.

- Tools: `mapzimus.com/{slug}/` (e.g. `/coordinate-converter/`)
- Games & maps: `/flip-game/`, `/boston-in-motion/`, `/where-the-games-go/`, `/whydah-voyage/`, `/bug-wars/`, `/transit/`, …
- Lab experiments already in `src/lab/` stay at `/lab/…`

Legacy `/max/*.html` URLs and older GitHub Pages paths redirect here. TappyMaps keeps its own domain (`tappymaps.com`); the MCAS item bank stays on `lehsmath.com`.

The design system ("Quadrangle") draws from USGS topographic map sheets: warm paper and night-chart dark themes, survey-legend category colors, a graticule hero, and self-hosted Archivo + IBM Plex Mono fonts in `src/fonts/` (SIL OFL). The build pre-renders every catalog card, filter row, link group, published field note, and radar card into the HTML, so the site is fully browsable without JavaScript — `app.js` adds search, filters, and favorites on top. Card markup lives in both `scripts/build.mjs` and `src/app.js`; keep the two `card()` functions in sync.

The production setup: one source in `src/`, a reproducible `dist/` build, Cloudflare Pages Git integration, and preview deployments for branches and pull requests.

## Site sections

Navigation keeps four primary doors — Tools, Maps, Games, Lab — with Radars, Skills, Links, and About under **More** (and repeated in the footer). `/play/` and `/experiments/` redirect to `/games/` and `/lab/`.

- **Tools** — all single-page utilities (GIS, data, design, math, classroom, soccer, utilities) at `/tools/` and `/tools/{category}/`
- **Maps** — map *destinations* only (live transit, globes, atlases, spatial stories)
- **Games** — everything playable
- **Lab** — bigger projects and experiments (including classroom apps and WIP)
- **Field Notes** — dormant until there are real posts (`src/data/field-notes.json`; `/field-notes/` redirects home)
- **Radars** — daily scrapers at `/radars/` (`src/data/radars.json`)
- **Skills** — downloadable Claude skills at `/skills/`
- **Links** — `src/data/links.json`

## Local build

```sh
npm run build       # validates the catalog, then builds dist/
npm run check       # build + static link check (no off-site github.io leftovers)
npm run preview     # npx wrangler pages dev dist
```

The build fails if the catalog data is invalid: missing required fields, duplicate slugs, unknown categories, non-https source URLs, a featured slug that isn't in the catalog, or a non-external project missing a hosted route. GitHub Actions runs the same build on every push and pull request.

## Cloudflare Pages

- Repository: `mapzimus/lab`
- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Custom domain: `mapzimus.com`

The committed `wrangler.jsonc` matches those settings. Preview branches use normal Pages preview deployments.

## Updating the catalog

`src/data/tools.json` and `src/data/projects.json` hold the shelf metadata. Source `url` fields are provenance (where the item originally lived); the build rewrites public URLs to first-party paths and writes them into `dist/data/`. Drop a tool HTML file into `vendor/tools/{slug}.html` (or an app tree into `vendor/apps/{name}/`) and update `vendor/SOURCES.md` when mirroring something new.

`src/data/featured.json` controls the "Featured" shelf on the homepage — an ordered list of catalog slugs. The tool count in the hero and the "last catalog refresh" date in the footer are derived from the catalog at build time.

Mark only true off-site homes with `"external": true` (today: TappyMaps and the MCAS bank). Everything else must have a `hostedProjectRoutes` / `appRoutes` entry in `scripts/build.mjs`.

## Daily radars (dev + geospatial)

`scripts/radar.mjs` scans GitHub (new fast-rising repos plus GIS, maps, cartography, data-viz, generative-art, WebGL, and Cloudflare Workers topics) and Hugging Face (trending models, datasets, and spaces), ranks everything against the lab's interest profile, and writes `radar/YYYY-MM-DD.md` plus `radar/latest.md`. The `Daily radar` GitHub Actions workflow runs it every day and commits the digest; run it locally with `node scripts/radar.mjs` (set `GITHUB_TOKEN` for a higher API rate limit). Tune the `INTERESTS` table in `scripts/radar-lib.mjs` to change what ranks highly.

Two dashboards show the data live, each backed by a Cloudflare Pages Function that runs the same sweep and caches it at the edge for an hour, falling back to the committed baseline JSON if the live sweep fails:

- [mapzimus.com/radar/](https://mapzimus.com/radar/) — **Dev Radar** (`/api/radar`, `src/data/radar.json`): GitHub, Hugging Face, Hacker News, HF Daily Papers, arXiv, Kaggle, itch.io.
- [mapzimus.com/geo-radar/](https://mapzimus.com/geo-radar/) — **Geospatial Radar** (`/api/geo-radar`, `src/data/geo-radar.json`): Maps Mania, Geography Realm, Geospatial World, new QGIS plugins, geospatial library releases, GIS Stack Exchange, NASA Earthdata, Data.gov, weeklyOSM.
- [mapzimus.com/soccer-radar/](https://mapzimus.com/soccer-radar/) — **Soccer Radar**: scores (ESPN public API for the Premier League, La Liga, MLS, Champions League), transfer talk, and news (BBC Sport, The Guardian, ESPN).
- [mapzimus.com/stocks-radar/](https://mapzimus.com/stocks-radar/) — **Stocks Radar**: trending tickers, movers, and social buzz (Yahoo Finance, Stocktwits). Signals, not financial advice.
- [mapzimus.com/politics-radar/](https://mapzimus.com/politics-radar/) — **Politics Radar**: the progressive press (Guardian US politics, Mother Jones, The Nation, ProPublica, The Intercept, Common Dreams).

All five endpoints are served by one dynamic Pages Function (`functions/api/[radar].js`); dashboards share `src/radar-common.js` and each defines its sections in `src/<slug>/<slug>.js`. New radars: add a sweep in `scripts/radar-lib.mjs`, register it in the function's `SWEEPS` map and `scripts/radar.mjs`, add a page + config, and list it in `src/data/radars.json`. Optionally set a `GITHUB_TOKEN` secret on the Pages project so edge GitHub searches avoid the unauthenticated per-IP rate limit.
