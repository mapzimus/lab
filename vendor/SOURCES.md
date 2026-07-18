# Hosted source snapshots

The files in this directory are deployable snapshots of projects maintained in separate repositories. They are kept here so one Cloudflare Pages build can serve every catalog item from `mapzimus.com`.

| Hosted route | Upstream source | Snapshot commit |
| --- | --- | --- |
| 65 root-level tool routes | `mapzimus/max` | `a48b6f708cf980185555440a751a7e95bd129952` |
| `/geopuesto/` and `/geopuesto/playground/` | `mapzimus/geopuesto` | `d9edbc3510af3832699e68af2bb96ff0fb850485` |
| `/bug-wars/` | `mapzimus/bug-wars` | `3c434aed3a877f75c4538164abba8854b6ee141b` |
| `/flip-game/` | `mapzimus/flipgame` | `c8f0f76e0ce2039da8263c46edcfb570ad537f81` |
| `/true-scale/` | `mapzimus/true-scale` | `14fed32d23d7ca4a303627e2ad42814f7d27963e` |
| `/concord-war/` | built from `mapzimus/concord-war` | `ddaa852bbde7cba3dc797e80c8873a35aaecc968` |
| `/transit/` | `transit/` in `mapzimus/maxwellhowegis` | `b520e5c9daacb1216a44cc60ec7aeb85c56cd5b0` |
| `/interstate-challenge/` | `interstate-challenge/` in `mapzimus/maxwellhowegis` | `a2e826de083811000c552a1d92e15d5e3b7f243e` |

Documentation, source-only scripts, Android wrappers, and other non-deployable files are omitted from the snapshots.
