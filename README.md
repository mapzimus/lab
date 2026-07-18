# Mapzimus Lab

Source for [mapzimus.com](https://mapzimus.com), the creative lab for Maxwell Howe's browser tools, games, unusual maps, and experiments.

The initial release is a front door, not a forced migration. The 65 existing tools remain live at `mapzimus.github.io/max/`; this site provides the curated catalog, search, filters, favorites, and stable category routes. Individual tools can move to `mapzimus.com/tools/{slug}/` later without breaking their original URLs.

The first staging scaffold used a `public/` directory and a directly deployed static-assets Worker. The production implementation now follows the ecosystem plan: one source in `src/`, a reproducible `dist/` build, Cloudflare Pages Git integration, and preview deployments for branches and pull requests.

## Local build

```sh
npm run build       # validates the catalog, then builds dist/
npm run preview     # npx wrangler pages dev dist
```

The build fails if the catalog data is invalid: missing required fields,
duplicate slugs, unknown categories, non-https URLs, or a featured slug that
isn't in the catalog. GitHub Actions runs the same build on every push and
pull request.

## Cloudflare Pages

- Repository: `mapzimus/lab`
- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Custom domain: `mapzimus.com`

The committed `wrangler.jsonc` matches those settings. Preview branches use normal Pages preview deployments.

## Updating the legacy catalog

`src/data/tools.json` is a normalized snapshot of the cards in `mapzimus/max`. Existing tool URLs are deliberately external during the first migration phase. Update the JSON when a legacy title, description, or tool URL changes.

`src/data/featured.json` controls the "Featured from the lab" shelf on the
homepage — an ordered list of catalog slugs. The tool count in the hero and the
"last catalog refresh" date in the footer are derived from the catalog at build
time, so they stay accurate as the data changes.

## Daily radars (dev + geospatial)

`scripts/radar.mjs` scans GitHub (new fast-rising repos plus GIS, maps,
cartography, data-viz, generative-art, WebGL, and Cloudflare Workers topics)
and Hugging Face (trending models, datasets, and spaces), ranks everything
against the lab's interest profile, and writes `radar/YYYY-MM-DD.md` plus
`radar/latest.md`. The `Daily radar` GitHub Actions workflow runs it every
day and commits the digest; run it locally with `node scripts/radar.mjs`
(set `GITHUB_TOKEN` for a higher API rate limit). Tune the `INTERESTS`
table in `scripts/radar-lib.mjs` to change what ranks highly.

Two dashboards show the data live, each backed by a Cloudflare Pages
Function that runs the same sweep and caches it at the edge for an hour,
falling back to the committed baseline JSON if the live sweep fails:

- [mapzimus.com/radar/](https://mapzimus.com/radar/) — **Dev Radar**
  (`/api/radar`, `src/data/radar.json`): GitHub, Hugging Face, Hacker News,
  HF Daily Papers, arXiv, Kaggle, itch.io.
- [mapzimus.com/geo-radar/](https://mapzimus.com/geo-radar/) — **Geospatial
  Radar** (`/api/geo-radar`, `src/data/geo-radar.json`): Maps Mania,
  Geography Realm, Geospatial World, new QGIS plugins, geospatial library
  releases, GIS Stack Exchange, NASA Earthdata, Data.gov, weeklyOSM. Optionally
set a `GITHUB_TOKEN` secret on the Pages project so edge GitHub searches
avoid the unauthenticated per-IP rate limit.
