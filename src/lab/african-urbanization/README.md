# The Century of Africa

A scroll-driven map story arguing one thing at four scales: **the arithmetic
is locked, the systems are not.** Africa's population roughly triples this
century and demographic momentum makes that number very hard to move; whether
the power, water, streets and corridors arrive at the same rate is entirely
open, and the piece measures the gap rather than asserting it.

Four chapters: the population century (UN projections to 2100), the megacities
where the load lands, the corridors that have to join them, and Kinshasa on the
ground from satellite epochs. No backend, no tiles — `index.html` + `app.js`
drive a MapLibre globe over ~4 MB of GeoJSON committed in `data/`, split into a
critical wave and a deferred one.

Note on framing: the piece deliberately does **not** argue that African birth
rates are unsustainable. Chapter 1 shows why that framing fails on this data.
Fertility is already falling across the continent and the UN expects it to keep
falling; the growth arrives anyway because the mothers of 2050 are already
born. Births are not the near-term lever. The building rate is.

## Chapters

1. **The population century** (the locked half) — country choropleth stepping 2025 → 2100 →
   growth multiple, then a median-age map explaining the mechanism (momentum:
   the mothers of 2050 are already born). An SVG regional-totals chart carries
   the UN's own low-to-high band around the Africa line, and computed
   "overtaking years" give the single year an African country's population
   passes a Western one (medium variant, lead held through 2100).
2. **Where the megacities rise** (where the load lands) — every African agglomeration ≥1M by 2050 as
   a proportional circle, animating 1975 → 2050 on UN annual series. Western
   comparisons live in the copy as numbers rather than as circles: drawn on a
   continental frame they landed at the edge, too small and too far out to
   compare anything against. 2100 outlooks are hollow rings, flagged as
   academic projections.
3. **Connecting a continent** (the first measured gap) — existing rail/roads (Natural Earth), the
   financed lines (China's SGR/BRI railways vs. the Lobito Corridor, plus the
   AU's Trans-African Highway network), and a gravity model
   (pop·pop/distance² over top-30 2050 cities) sketching demanded corridors.
   Closes on the constraint: nighttime lights, then electricity and water
   access from the World Bank, because a map of light is also a map of who has
   power.
4. **Kinshasa, ground truth** (the gap, measured in metres) — GHSL built-up epochs 1975 to 2030 stacked as
   growth-vintage rings over the Malebo Pool, with OSM river and roads, and a
   GHS-POP density surface showing that the ground built by 1975 went from 2.3
   to 14 million people. Then four measurements of what that meant: expansion
   by distance ring (83% of the people added since 1975 stand on ground that
   was already built), the slope the city ran out of (the 1975 city sits at a
   median 2°, every later decade built steeper), street length per resident
   (nine metres down to one), and the single road and railway connecting the
   city to the sea.

Throughout: a floating map key that changes with every step, country names
across the continental chapters, place labels at city zoom, and a chapter rail.
The story closes in an **explore mode**: click any country, city or corridor
for its numbers, shade the map by population, growth, median age, fertility or
service access, and run the cities through time on a slider.

The page degrades honestly. With JavaScript off, or on a browser without
WebGL, the prose, the region chart and the crossover ticker still render; only
the maps go missing, and a banner says so.

## Pipeline

`pipeline/` holds the Python scripts that produce `data/` (run in
order; raw downloads land in `pipeline/raw/`, which is gitignored — set
`AFRICAN_URBANIZATION_RAW` to reuse a shared download dir):

| Script | Source | Output |
|---|---|---|
| `01_countries_population.py` | Natural Earth 50m admin-0; UN WPP 2024 | `countries.geojson`, `population.json` |
| `02_cities.py` | UN WUP 2025 DEGURBA cities; Hoornweg & Pope 2017 | `cities.geojson` |
| `03_corridors.py` | Natural Earth 10m rail/roads; curated projects; gravity model | `corridors-*.geojson` |
| `04_kinshasa.py` | JRC GHS-BUILT-S R2023A, 3ss, tile R10_C20 | `kinshasa-builtup.geojson` |
| `05_kinshasa_context.py` | OpenStreetMap via Overpass | `kinshasa-water.geojson`, `kinshasa-roads.geojson` |
| `06_lights.py` | Harmonized DMSP/VIIRS nighttime lights 2020 (Li et al., figshare) | `lights.geojson` |
| `07_kinshasa_density.py` | JRC GHS-POP R2023A, 1975 + 2025 | `kinshasa-density.geojson` (+ densification stats) |
| `08_services.py` | World Bank Open Data (electricity and water access, snapshot + 2000-2022 series) | `services-trend.json`; merged into `countries.geojson` as `elec` / `water` / `elecGain` |
| `09_kinshasa_terrain.py` | Copernicus DEM GLO-30 + GHS-BUILT-S | `kinshasa-slope.geojson` (+ built-on-slope by epoch) |
| `10_kinshasa_streets.py` | OpenStreetMap street network + GHS-BUILT-S | `kinshasa-streets.geojson`, `kinshasa-streets.json` |
| `11_kinshasa_communes.py` | OpenStreetMap admin_level 7 | `kinshasa-communes.geojson` |
| `12_kinshasa_expansion.py` | GHS-BUILT-S + GHS-POP | `kinshasa-expansion.json` (distance-ring analysis) |
| `13_matadi_corridor.py` | OpenStreetMap road and rail | `matadi-corridor.geojson` |
| `14_validate.py` | GHS-POP vs. UN WUP inside OSM commune boundaries | `validation.json` |
| `15_corridor_coverage.py` | OpenStreetMap motorway/trunk/primary vs. the modeled corridors | `corridor-coverage.json` (+ `served` on `corridors-model.geojson`) |
| `16_city_streets.py` | OSM streets inside GHS-BUILT-S footprints for 9 cities; UN WUP | `city-streets.json` |
| `17_class_breaks.py` | Fisher-Jenks over `countries.geojson` (reports only, writes nothing) | choropleth class breaks used in `app.js` |

### Rerunning it

```sh
python3 -m pip install -r pipeline/requirements.txt
cd pipeline && ./run_all.sh
```

`fetch_raw.py` downloads all twenty raw inputs (about 1.7 GB, mostly GHSL
tiles and Copernicus DEM) under the exact filenames the scripts expect,
skipping anything already present, so an interrupted run resumes. Set `AFRICAN_URBANIZATION_RAW` to keep
them outside the repo; `pipeline/raw/` is gitignored either way. After a rerun,
bump `DATA_VERSION` in `app.js` so browsers fetch the new files rather than
their cached copies. That constant is the only manual step: `app.js` and the
vendored library are fingerprinted automatically at build time, since the data
files are fetched from JavaScript and so cannot be stamped from the HTML.

## Explore mode

The story ends in a free-explore mode over the same map. Everything the
chapters draw is reachable there: nine layer toggles (cities, corridors, night
lights, Kinshasa growth and density, the corridor to the sea, and the street,
commune and slope layers), country shading by any of eight measures, a year
slider, and jump chips including the coast.

Two details worth knowing if you touch it:

- The three city-scale layers fold away below zoom 9, where they are noise, and
  are replaced by a hint line so the panel never silently changes shape.
- The popup is constructed with `closeOnClick: false`. It defaults to true,
  which registers a close listener *after* the handler that opens the popup, so
  clicking a second feature re-added and then immediately closed it. The
  inspector worked on alternate clicks only until this was set.

## Honesty notes

- All country/regional figures are the UN's **medium variant** — a central
  path, not a prediction; the crossover years move with the variant.
- 2100 city figures are Hoornweg & Pope (2017), an academic projection well
  above UN city horizons — always labeled and drawn hollow.
- Corridor geometry is schematic (city-to-city), and the "modeled" network is
  a demand sketch, not an engineering or policy proposal.
- The gravity model is **tested, not assumed**: 20 of its 36 links already
  have a mapped OSM primary road along at least 80% of the route, the median
  link is 82% covered, and its highest-scoring link (Cairo–Alexandria) is
  served end to end. Coverage measures whether a route exists, not its
  condition or capacity.
- GHS-POP summed inside Kinshasa's OSM commune boundaries runs ~1.2× the UN
  WUP figure in **both** 1975 (1.17M vs 0.98M) and 2025 (13.24M vs 10.90M).
  The offset is stable across fifty years, so the growth is not an artifact
  of the grid drifting; the page says the totals carry that much slack.
  Brazzaville was intended as a second case and has no admin_level 7
  boundaries in OSM, so it is skipped rather than fudged.
- Electricity and water access come from the World Bank's most recent
  reported year per country, so the map mixes 2022 and 2023 observations. The
  "people without" totals multiply that share by the UN's 2025 population.
- The **rate** is the story's actual claim, so the same indicators are also
  built as 2000-2022 series. Electricity access went 37.7% → 58.5% while the
  number without power rose 510M → 600M; water went 52.8% → 70.1% while the
  number without rose 386M → 429M. Two independently collected indicators
  showing the same shape: real progress, losing to the population it chases.
  The series counts only the countries reporting in each year, against UN
  population for that same year, so a late reporter cannot put a step in the
  curve.
- GHSL built-up epochs are model output from satellite archives; the 2030
  epoch is the JRC's own projection. The ≥20% built threshold trades detail
  for legible footprints. The 2030 increment is small, so slope statistics
  computed on it move around more than the earlier epochs.
- Street length is measured from OpenStreetMap as it stands today, inside each
  epoch's built footprint. OSM has no history here, so the early years count
  streets that may not have existed yet: the real fall in street per person is
  steeper than the chart shows, not shallower.
- The street figure is **not a Kinshasa anecdote**. The identical measurement
  over nine African cities puts Kinshasa last at 1.18 m per resident against a
  median of 1.82, and every one of the eight with a UN 1975 baseline has less
  street per person now than then. Cairo fell least (2.50 → 1.82). Kinshasa's
  cross-city figure is derived from a different window than
  `kinshasa-streets.json` and lands on the same 1.18, which is a useful check
  on both.
- **GHSL tile edges are a trap.** A window that runs off a tile still gets a
  transform describing the window you asked for, so array and transform
  disassociate and the footprint silently shifts by the missing margin. Addis
  Ababa first came back at 0.12 m per resident for this reason.
  `16_city_streets.py` mosaics every tile a window touches and refuses to run
  on partial coverage.
- Slope comes from the Copernicus 30 m DEM block-averaged to roughly the 92 m
  built-up grid. Finer classes would be false precision against a layer that
  coarse, so only two are drawn.
- Choropleths are **classed, not interpolated**. Linear ramps across a global
  range made chapter 1 a flat orange continent: half of Africa's median ages
  sit between 15 and 22, one segment of the old ramp. Breaks are Fisher-Jenks
  on the African values (`17_class_breaks.py`), extended upward so Japan at
  49.8 still separates from Tunisia at 32.9. Growth keeps a hard boundary at
  ×1; one population scale serves all three years so countries visibly climb.

## Method writeup

`method/index.html` (live at `/lab/african-urbanization/method/`, linked from
the story footer) documents the sources, the judgment calls and their
reasoning, what was tried and rejected, the validation results above, and the
known limits. It is static prose: no MapLibre, no data fetches.

## Licenses

Natural Earth (public domain) · UN WPP/WUP (CC BY 3.0 IGO) · JRC GHSL
(CC BY 4.0) · Copernicus DEM (ESA, free and open) · World Bank Open Data
(CC BY 4.0) · OpenStreetMap (ODbL, © OpenStreetMap contributors) · MapLibre
GL JS (BSD-3-Clause, vendored in `vendor/`).

## Analytics

The site carries no tracker. Cloudflare Web Analytics can be switched on for
the whole Pages project from the Cloudflare dashboard (Web Analytics, then
enable for `mapzimus-lab`), which injects the beacon at the edge and needs no
code here, no cookies and no consent banner.
