# US Fantasy Transit Network

A fantasy "unlimited funds" transit network for North America, built as a **four-tier
hierarchy** and generated end-to-end from Census data. This folder holds the **network viewer** —
a read-only interactive map of the generated network — plus the data it renders, all plain GeoJSON.

Open [`/transit/`](https://maxwellhowegis.com/transit/) (or `transit/index.html` locally) to explore.

## The four tiers

| Tier | Role | What it connects | Color |
|---|---|---|---|
| **1 — HSR Hub** | Major-city high-speed-rail hubs | Tier-1 ↔ tier-1, the intercity spine | `#fbbf24` amber |
| **2 — Regional Hub** | Smaller regional connectors | Bridge tier-1 hubs down to local networks | `#a5b4fc` indigo |
| **2b — Promoted city** | Important cities the spacing rules miss (Salem MA, Concord NH, Nashua NH, Portsmouth NH…) | Full tier-2 members, tagged `sub:"2b"` and drawn lighter/smaller | `#cdd6fe` pale indigo |
| **3 — Metro / Subway** | Hyper-local neighborhood transit | Hangs off a tier-2 hub | `#34d399` green |
| **4 — Commuter Rail** | Normal-speed rail to *every* town | Reaches the towns off tier-2 hubs | `#38bdf8` sky |

A link's tier is the **less-major** of its two endpoints (`max(fromTier, toTier)`): a tier-1↔tier-1
line is HSR; a tier-1↔tier-2 line is regional; a tier-2↔tier-3 line is metro, and so on.

## Data flow

The network is **generated, not hand-drawn**: `scripts/build_towns.py` derives the towns layer
from Census files, `scripts/build_network.py` derives the four-tier network from the towns, and
the viewer renders the committed results on every visit.

```
  Census/NE sources ─▶ scripts/build_towns.py ─▶ data/towns.geojson
                                                       │
                       scripts/build_network.py ◀──────┘
                          │
                          ├─▶ data/network.json        (tiers 1-3 + edges)
                          └─▶ data/tier4_links.geojson (the commuter web)
                                        │
                                transit/index.html (viewer — tier-4 town
                                nodes render straight from towns.geojson)
```

To change the network, tweak the constants at the top of `scripts/build_network.py` and re-run it
(~20 s), or hand the GeoJSON to Claude Code — the files in `data/` are the interface.

## Using the viewer

- **T1–T4 buttons** (top) toggle each tier's nodes and lines — a functional legend. Hide metro and
  commuter to see the HSR spine; the sidebar list filters with the map, while the count badges and
  mileage always describe the full network.
- **Nodes only** button (top) hides *every* line across all tiers, leaving just the node dots — for
  judging node placement without line clutter. The preference persists across visits.
- **Tier-4 towns + lines layers**: all ~33k town nodes (sized by population) and the ~43k-link
  commuter web connecting them, canvas-rendered and lazy-loaded; each layer's on/off preference
  is remembered (the T4 button drives both together).
- **Search** flies to any of the ~33k towns (`Enter` = top hit, ranked by population). Clicking a
  sidebar row or a map marker flies there too.
- **Fit view** reframes the lower 48. On phones the panel is a collapsible bottom sheet — tap the
  handle to expand; tapping a row flies the map and tucks the sheet away.

## The auto-generated network

`scripts/build_network.py` generates the entire four-tier network from the towns layer in ~20 s
(pure stdlib, deterministic — tweak the constants at the top and re-run):

| Tier | Rule | Result |
|---|---|---|
| **1 — HSR** | pop ≥ 125k @ 60 mi spacing (HSR goes the speed of sound — the spine reaches mid-size metros), connected by a **Gabriel graph** (an edge survives if no third hub sits in the circle with the edge as its diameter), then **each hub gains 2 more nearest dry links and any leaf is patched** — crossing-free where possible. This is what finally links **Ottawa→Toronto**, which the raw Gabriel test blocked via Rochester across Lake Ontario (the two cross-lake hops then died in the water test, stranding both as degree-1 leaves). Edges are densely water-sampled with a ~12-mi coastal tolerance — nothing crosses a Great Lake or an open strait. **International**: 16 Canadian metros, 8 Mexican metros — border twins (Tijuana/San Diego, Juárez/El Paso, Matamoros/Brownsville) space only against each other, so each is a distinct paired hub with its own cross-border HSR link — and island links — Honolulu→Los Angeles, San Juan→Miami, Anchorage→Vancouver. Hub coordinates are the Census internal point, **snapped to the Natural Earth city-center** when a consolidated/large boundary drifts it 5-40 mi off (Anchorage's municipality spans ~1,700 sq mi, landing its raw point ~21 mi from downtown) | **135 hubs · 323 edges**, 63,492 mi |
| **2 — Regional** | pop ≥ 25k @ 30 mi spacing, **plus** any 100k+ city outside a metro, **plus** 38 Canadian regionals, **plus coverage fill**: promote the biggest uncovered town until *every* town is within 60 mi of a hub. Connected by an **RNG mesh over all tier-1/2 hubs**, dead-ends patched to ≥ 2 links, island clusters bridged by a single sea link — then a **crossing-tested short-link pass** restores the obvious near-neighbor links the RNG lens suppresses (Manchester↔Nashua 16 mi, Grand Rapids↔Kentwood 6 mi, Roanoke↔Salem 5 mi) wherever the added link is dry and crosses no existing edge, so the map gains connectivity without tangling | **2,266 hubs · 4,085 links**, 120,099 mi |
| **2b — Promoted** | important cities the spacing rules miss: **40k+ anywhere**, or **20k+ when ≥ 40 mi from an HSR hub** (a 3.5 mi mutual spacing keeps inner-core satellites like Somerville and Beverly inside their parent metro). Full tier-2 members — they join the RNG mesh, anchor their own metros when ≥ 35k, and terminate commuter lines — tagged `sub:"2b"` and drawn lighter | **987 hubs** |
| **Corridor** | sparse regions leave hubs stranded on long one-directional tentacles (Berlin NH pointed only east into Maine). Gap-fill promotes a **mid-size town far from any hub (≥ 10k & ≥ 20 mi), or a smaller very-isolated town (≥ 3.5k & ≥ 30 mi)** — greedy biggest-first with a 15-mi mutual spacing — so places like Laconia, Lebanon, and Conway become hubs and Berlin/Rutland chain into the network toward Concord (`sub:"gap"`, rendered as normal regional hubs) | **493 hubs** |
| **3 — Metro** | **gap-driven organic systems** (US, anchors = hubs ≥ 35k; stranded 35k+ towns anchor standalone local systems and stay in the tier-4 web): satellite towns ≥ 10k join the nearest system whose **pop-scaled capture radius** reaches them over a **dry path** (`dry_sat` — 7 bay-locked towns stay tier 4). A **density-scaled, jittered, land-aware hex grid** of infill stations covers each seed city (the anchor plus its 35k+ satellites) — a station only goes where **no real town, hub, or earlier station** is (the gap test), so Manhattan packs ~0.75 mi tight while sprawl spreads to 2.6 mi. Stations chain into lines: a **principal-axis through-line** for small systems ("one line down main street"), **balanced bearing sectors** for big ones, an **orbital ring** at ≥ 8 lines. Build is **points-then-lines**: every node of every tier exists before any line is drawn, then lines fill in tier by tier 1→4. **Big-city district split**: some cities are one Census place but really several distinct districts, so **nine cities — NYC, Boston, LA, Chicago, Philadelphia, San Francisco, Washington DC, Seattle, and Houston** — each become a node per borough/neighborhood: NYC = Manhattan (T1) + Brooklyn / Queens / The Bronx / Staten Island; the rest = a downtown core (T1) + 8–10 districts — and each district ≥ 35k anchors **its own metro system** (85 district nodes across the nine cities, ~610 infill stations among them — Brooklyn 109, Philadelphia's Northeast 12, Houston's Sharpstown…) | **1,195 systems** — 1,905 town nodes + ~5,470 stations, ~1,750 lines |
| **4 — Commuter web** | every remaining town joins a **relative neighborhood graph** over towns + US hubs + metro satellites (promoted suburbs stay in the web — commuter rail passes through them): an edge survives only if no third point is closer to both endpoints — RNG ⊇ MST and ⊆ Delaunay, so the web reads as planar corridors with interior degree 2–4 and no crossings. Hops cap at 60 mi, longer edges are densely water-sampled (every ~6 mi, with river forgiveness), isolated clusters bridge back over dry hops ≤ 90 mi, and dead-ends take a second link only where one heads in a genuinely different direction (≥ 45°) — peninsula towns like Little Compton end cleanly instead of growing slivers. **99.7 % of towns connect to ≥ 2 neighbors**; the exceptions are true islands/edges (Catalina, Block Island, Culebra, Provincetown, Alaska bush) | **29,114 towns · 43,372 links** |

The result is one fully connected graph (9,781 nodes / 11,957 edges) written to
`data/network.json`, plus the 43,372-link commuter web in `data/tier4_links.geojson` — the
viewer loads both directly on every visit. The tier-4 town nodes render as their own toggleable
canvas layer straight from `data/towns.geojson`, with the commuter web on a second canvas
layer beneath them.

Notable data fixes made for this: consolidated cities (Washington DC, Indianapolis,
Nashville-Davidson, Louisville/Jefferson, Baton Rouge, Athens, Augusta…) enter via their Census
"(balance)"/nonfunctioning records, and three water-skewed internal points (San Francisco 34 mi
offshore near the Farallons, New Orleans, Corpus Christi) are overridden to downtown coordinates.

## Tier 4 — the "every town" base layer

Tier 4 (normal-speed commuter rail reaching every town) is too large to hand-place, so it's
**auto-seeded** from the US Census, not drawn node by node. `scripts/build_towns.py` pulls the
Census **Gazetteer Places (national)** file and writes every **incorporated place** — city, town,
village, borough — in the 50 states + DC to `transit/data/towns.geojson` as tier-4 GeoJSON points.

- **33,288 towns** (2024 gazetteer): 10,219 cities · 5,277 towns · 3,728 villages · 1,215 boroughs
  · 12,820 CDPs (unincorporated communities, included by default; `--no-cdp` to exclude) · 29 consolidated
  governments and other types · Guam's
  19 villages seeded from the 2020 Census. New England towns come from the **county-subdivisions
  gazetteer** (they're minor civil divisions, not places — New Hampshire alone has 221 MCD towns
  vs. 13 incorporated cities), deduped against same-name places nearby. CDP populations come from
  the 2020 Census (TIGERweb), with a one-to-one Natural Earth backfill as a residual fallback.
- Every **incorporated place** is joined to Census population (SUB-EST 2024 place-level
  estimates, 100% by GEOID) and every **CDP** to its 2020 Census count (TIGERweb `POP100`) —
  **98.5% of towns carry a population**; the remaining nulls are places defined after the 2020
  Census. This is what lets 100k+ unincorporated suburbs (The Woodlands TX, Arlington VA) join
  the network's tier cuts instead of hiding as tiny dots. The `pop` property drives dot
  size/opacity in the viewer and search ranking.
- Rendered in the viewer as a canvas-drawn dot layer (**sized by population**) with a
  **"Tier-4 towns" toggle** in the sidebar — these are the tier-4 nodes themselves; the
  search box flies to any of them. Their connecting lines (the commuter web) render on a
  separate canvas layer with its own **"Tier-4 lines" toggle**.
- Rebuild / re-vintage:

  ```bash
  python3 scripts/build_towns.py                 # places + CDPs + NE MCD towns (default)
  python3 scripts/build_towns.py --no-cdp         # incorporated places only
  python3 scripts/build_towns.py --year 2023      # pin a gazetteer vintage
  ```

  The raw gazetteer + estimates files are cached under `scripts/.cache/` (gitignored); only
  `towns.geojson` is committed. Each town carries `name`, `type`, `st`, `geoid`, `pop`, `tier:4` —
  enough to auto-route commuter lines from towns to their nearest regional hub later.
  (`--no-pop` skips the population join.)

## Data schema (`fantasy-transit-v1`)

A single GeoJSON `FeatureCollection`. **Nodes** are `Point` features, **links** are `LineString`
features, distinguished by `properties.kind`:

```jsonc
// node
{ "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [lng, lat] },
  "properties": { "kind": "node", "id": "n1", "name": "New York",
                  "tier": 1, "tierName": "HSR Hub", "parent": null } }

// link
{ "type": "Feature",
  "geometry": { "type": "LineString", "coordinates": [[lng,lat],[lng,lat]] },
  "properties": { "kind": "edge", "id": "e1", "from": "n1", "to": "n3",
                  "tier": 1, "tierName": "HSR Hub" } }
```

`parent` (optional) lets a lower-tier node record which hub it hangs off, if you want the hierarchy
made explicit beyond the drawn links. `sub` (optional, nodes and edges) marks generator sub-waves —
currently `"2b"` for promoted cities and their connecting links, which the viewer styles lighter.

## Stack

Single self-contained `index.html` — Leaflet 1.9 + keyless CARTO dark basemap, no build step, no
API keys. The 33k-point tier-4 town layer is canvas-rendered in its own pane for smooth pan/zoom.
`scripts/build_towns.py` (Python stdlib only) regenerates the town data. Matches the rest of the
site (plain HTML/CSS/JS).

## Status / next steps

- [x] Click-to-place node editor, link/delete modes, GeoJSON import/export, autosave
- [x] Tier-4 "every town" base layer — 33,288 Census towns (`data/towns.geojson`)
- [x] Census population joined to 98.5% of towns (SUB-EST 2024 for incorporated places,
      2020 Census POP100 for CDPs); pop-scaled dots
- [x] Town search → fly-to / promote-to-node; undo (Ctrl+Z); auto-parent on cross-tier links;
      live per-tier mileage
- [x] **Auto-generated full network** (`scripts/build_network.py`): 133 HSR (incl. 8 Mexican,
      border twins paired to their US hub) + 2,195 regional (incl. 990 tier-2b + 493 corridor
      gap-fill hubs) + 7,611 metro nodes in 1,129 gap-driven organic systems; 29,105 tier-4 towns
- [x] Connect the tier-4 town nodes — relative-neighborhood-graph commuter web, 43,269 links,
      99.7 % of towns with ≥ 2 connections (dead-ends only at true islands/edges/peninsulas)
- [x] Re-mesh tiers 1–2: Gabriel-graph HSR spine (California triangulates), RNG regional mesh
      replacing the old parent chains
- [x] **Tier 2b**: important cities the spacing rules missed (Salem MA, Concord NH, Nashua NH,
      Portsmouth NH…) promoted into tier 2, styled lighter
- [x] **Gap-driven metros**: density-scaled land-aware infill (Manhattan-tight to sprawl-wide),
      through-lines / bearing-sector lines / orbital rings; points-then-lines build order
- [x] **Logical-connectivity pass**: richer HSR spine (pop ≥ 125k + kNN augment + leaf patch —
      fixes Ottawa↔Toronto); corridor gap-fill hubs so sparse regions chain in (Berlin/Rutland);
      crossing-tested tier-2 short links restore obvious near-neighbors (Manchester↔Nashua,
      Grand Rapids↔Kentwood) without tangling the map
- [ ] Auto-route HSR edges along real corridors instead of straight lines
- [ ] Network stats (reach, coverage: % of population within N mi of each tier)
- [x] Promote to a styled read-only "network map" viewer (editing retired)
- [x] Add it to the portfolio gallery (map-wall brick + tools card; thumb via
      `scripts/capture_thumbs.py transit`)
