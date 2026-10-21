# Hosted source snapshots

The files in this directory are deployable snapshots of projects maintained in separate repositories. They are kept here so one Cloudflare Pages build can serve every catalog item from `mapzimus.com`.

| Hosted route | Upstream source | Snapshot commit / notes |
| --- | --- | --- |
| `/{tool-slug}/` (38 tools) | `mapzimus/max` via the public tool shelf | Full tool library mirrored under `vendor/tools/`. Math and leftover classroom tools moved to lehsmath.com and redirect there. Vacation Selector is cataloged as a Lab experiment and still served from this snapshot. |
| `/geopuesto/` and `/geopuesto/playground/` | `mapzimus/geopuesto` | `3b7cad6` (MapLibre 3D globes on keyless Esri Dark Gray tiles). Runtime files only, plus the four `playground/docs/*.md` files the playground links to. On copy, the Google key literal is replaced with `__GOOGLE_MAPS_EMBED_KEY__`, which `scripts/build.mjs` fills from `GOOGLE_MAPS_EMBED_KEY`. The globe's auto-spin is also skipped under `prefers-reduced-motion`; upstream it recursed until the stack overflowed there. |
| `/bug-wars/` | `mapzimus/bug-wars` | `799f4f8` (v6, turn-based mobile strategy). Runtime files only; `CLAUDE.md` and `tools/` are left out. |
| `/flipgame/` | `mapzimus/flipgame` | Approved releases are copied by `scripts/sync-flipgame.mjs`; exact deterministic provenance is published at `vendor/apps/flip-game/release-provenance.json`. Legacy `/flip-game/`, `/bottle-game/`, `/parrot-flip/`, and `/grog-flip/` paths redirect here. |
| `/whydah-voyage/` | `mapzimus/Whydah-Unit` (`navigator/`) | `dd4d52e`, Whydah's Voyage / First Sail. On copy: the canonical-host redirect and the classroom gate (`/games-gate.js`) are removed, and the icon links point at the copies kept beside the game (`pics/`, `favicon.ico`, `apple-touch-icon.png`, `site.webmanifest`). |
| `/true-scale/` | `mapzimus/true-scale` | |
| `/concord-war/` | built from `mapzimus/concord-war` | |
| `/transit/` | `transit/` in `mapzimus/maxwellhowegis` | |
| `/interstate-challenge/` | `interstate-challenge/` in `mapzimus/maxwellhowegis` | `121f2af` — was on the portfolio site; now first-party. |
| `/mapzimus-board/` | `mapzimus/mapzimus-board` | `acdb429` — was `mapzimus.github.io/mapzimus-board/`. Deployable `index.html` + `app.js` + `data.js` only. |
| `/boston-in-motion/` | `mapzimus/Motion` | `4df1ff7` — was `mapzimus.github.io/Motion/`. Static client only (`css/`, `js/`, `index.html`). |
| `/where-the-games-go/` | `mapzimus/where-the-games-go` (`public/`) | `128a261` (sales through 2026-08-20) — was `mapzimus.github.io/where-the-games-go/`. A `<link rel="canonical">` to mapzimus.com is added on copy. |
| `/citynario/` | `mapzimus/Citynario` | Static Next export. |
| `/ground-truth/` | `mapzimus/ground-truth` | Lidar / wooded-land site studies. |
| `/c5/` | `mapzimus/c5` | `7251bb2` (the `deep-links` branch, mapzimus/c5#47) — Category Five, 32 party games; each catalog card opens `/c5/?game=<id>`. Built with `npm run build` (Vite `base` is already `/c5/`) and the whole `dist/` copied here. Was `mapzimus.github.io/c5/`. |

Documentation, source-only scripts, Android wrappers, and other non-deployable files are omitted from the snapshots.

**Basemaps (October 2026):** Carto's raster and GL basemaps began serving "API KEY REQUIRED" watermarks to unregistered sites, so these snapshots were patched here to use keyless [OpenFreeMap](https://openfreemap.org) vector styles: `/transit/`, `/true-scale/`, `/interstate-challenge/`, and `/boston-in-motion/`. (Geopuesto fixed this upstream by moving to Esri's keyless tiles.) Leaflet pages draw them through the shared `/lib/maplibre/` bundle (`src/lib/maplibre/basemap.js`). The tools in `vendor/tools/` keep OpenStreetMap raster tiles but use the single `tile.openstreetmap.org` host. The upstream repositories still point at Carto, so re-apply these changes (or fix them upstream) before refreshing any of those snapshots.

**Still external by design:** [tappymaps.com](https://tappymaps.com) (own product domain) and the MCAS item bank at [lehsmath.com](https://lehsmath.com/tools/mcas/). The classroom curriculum site remains at [whydahstory.com](https://whydahstory.com); the games listed above are mirrored here.
