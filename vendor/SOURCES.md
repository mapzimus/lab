# Hosted source snapshots

The files in this directory are deployable snapshots of projects maintained in separate repositories. They are kept here so one Cloudflare Pages build can serve every catalog item from `mapzimus.com`.

| Hosted route | Upstream source | Notes |
| --- | --- | --- |
| `/{tool-slug}/` (65 tools) | `mapzimus/max` via `mapzimus.github.io/max/` | Snapshot from the public GitHub Pages shelf. Eleven newer catalog entries await the private `max` PR and ship as placeholders until then. |
| `/geopuesto/` and `/geopuesto/playground/` | `mapzimus/geopuesto` | |
| `/bug-wars/` | `mapzimus/bug-wars` | |
| `/flip-game/` | `mapzimus/flipgame` | Bottle Game — bottle-flip party game (PWA). |
| `/parrot-flip/` | `mapzimus/flipgame` (`parrot-flip/`) | Parrot Flip — pirate-parrot flip game, hand-drawn SVG macaws. Replaces the retired Grog Flip. |
| `/whydah-voyage/` | `mapzimus/Whydah-Unit` (`navigator/`) | Whydah's Voyage / First Sail. Host-bounce redirect to whydahstory.com removed so the game stays on mapzimus.com. |
| `/black-sam/` | `mapzimus/Whydah-Unit` (`black-sam/`) | |
| `/true-scale/` | `mapzimus/true-scale` | |
| `/concord-war/` | built from `mapzimus/concord-war` | |
| `/transit/` | `transit/` in `mapzimus/maxwellhowegis` | |
| `/interstate-challenge/` | `interstate-challenge/` in `mapzimus/maxwellhowegis` | |
| `/mapzimus-board/` | `mapzimus/mapzimus-board` | Deployable `index.html` + `app.js` + `data.js` only. |

Documentation, source-only scripts, Android wrappers, and other non-deployable files are omitted from the snapshots.

**Still external by design:** [tappymaps.com](https://tappymaps.com) (own product domain). The classroom curriculum site remains at [whydahstory.com](https://whydahstory.com); the games listed above are mirrored here.
