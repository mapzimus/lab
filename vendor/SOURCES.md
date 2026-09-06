# Hosted source snapshots

The files in this directory are deployable snapshots of projects maintained in separate repositories. They are kept here so one Cloudflare Pages build can serve every catalog item from `mapzimus.com`.

| Hosted route | Upstream source | Snapshot commit / notes |
| --- | --- | --- |
| `/{tool-slug}/` (55 tools) | `mapzimus/max` via the public tool shelf | Full tool library mirrored under `vendor/tools/`. |
| `/geopuesto/` and `/geopuesto/playground/` | `mapzimus/geopuesto` | |
| `/bug-wars/` | `mapzimus/bug-wars` | |
| `/flipgame/` | `mapzimus/flipgame` | Approved releases are copied by `scripts/sync-flipgame.mjs`; exact deterministic provenance is published at `vendor/apps/flip-game/release-provenance.json`. Legacy `/flip-game/`, `/bottle-game/`, `/parrot-flip/`, and `/grog-flip/` paths redirect here. |
| `/whydah-voyage/` | `mapzimus/Whydah-Unit` (`navigator/`) | Whydah's Voyage / First Sail. |
| `/true-scale/` | `mapzimus/true-scale` | |
| `/concord-war/` | built from `mapzimus/concord-war` | |
| `/transit/` | `transit/` in `mapzimus/maxwellhowegis` | |
| `/interstate-challenge/` | `interstate-challenge/` in `mapzimus/maxwellhowegis` | `121f2af` — was on the portfolio site; now first-party. |
| `/mapzimus-board/` | `mapzimus/mapzimus-board` | `acdb429` — was `mapzimus.github.io/mapzimus-board/`. Deployable `index.html` + `app.js` + `data.js` only. |
| `/boston-in-motion/` | `mapzimus/Motion` | `4df1ff7` — was `mapzimus.github.io/Motion/`. Static client only (`css/`, `js/`, `index.html`). |
| `/where-the-games-go/` | `mapzimus/where-the-games-go` (`public/`) | `2cbec72` — was `mapzimus.github.io/where-the-games-go/`. |
| `/smartpicker/` | `mapzimus/smartpicker` | `5c6f298` — was `mapzimus.github.io/smartpicker/`. |

Documentation, source-only scripts, Android wrappers, and other non-deployable files are omitted from the snapshots.

**Still external by design:** [tappymaps.com](https://tappymaps.com) (own product domain) and the MCAS item bank at [lehsmath.com](https://lehsmath.com/tools/mcas/). The classroom curriculum site remains at [whydahstory.com](https://whydahstory.com); the games listed above are mirrored here.
