# National Park Explorer

Every boundary the National Park Service draws, on one map: the 63 national
parks plus the other 374 units, from Wrangell-St. Elias at 10.5 million acres
down to the Kennedy birthplace in Brookline at 0.087.

`index.html` is the whole front end. It reads four static files out of `data/`
and does every filter, sort and recolour in the browser — no backend, no build
step for the page itself.

## What it shows

The 63 parks load with the page; the other 374 units load only if you ask for
them. Three ways to colour the parks:

| Mode | Type | Breaks |
|---|---|---|
| Region | categorical | the six NPS regions |
| Annual visits | sequential, classed | 250k / 750k / 1.5M / 3M |
| Established | sequential, classed | 1916 (the Park Service), 1940, 1980 (ANILCA) |

Search takes a park name, a state name, or — for a two-letter query — a state or
unit code, so `UT` returns the five Utah parks rather than every park in a state
whose name happens to contain those letters. Sort by name, visits, area or date.
Selecting a park flies to its bounding box and opens a card with its
establishment date, federal acreage, measured boundary area, visit count and
rank, description, and links to nps.gov and Wikipedia. `#acad` in the URL opens
Acadia directly.

## The two areas are not the same number, and that is the point

Every park card shows **federal acres** and **boundary area** side by side, and
for most parks they agree to within a percent. Where they diverge, the gap is
the interesting part:

| Park | Federal acres | Boundary | Why |
|---|---|---|---|
| New River Gorge | 7,021 | 71,727 | NPS draws park and preserve as one polygon; the acreage report counts only the park |
| Wrangell-St. Elias | 8,323,146 | 10,475,788 | state and Native corporation land inside the legislated line |
| Great Smoky Mountains | 522,427 | 600,933 | authorised boundary reaches past what the government owns |
| Acadia | 49,071 | 36,960 | ~12,000 acres of conservation easement sit *outside* the boundary |

A boundary is the line Congress drew. The acreage report counts the federal land
inside it. Inholdings mean the two rarely match exactly, and the map is honest
about which number came from where.

## The map owns its own ground

The basemap is a free third-party tile service, and free services go down, get
blocked, or are simply slow. So `data/states.geojson` travels with the page:
260 kB of Census state outlines, drawn underneath everything. When the tiles
arrive it is a faint reference frame; when they do not it becomes a filled
silhouette of the country, and the page still answers the question it exists to
answer — *where is this park?* — instead of showing 63 shapes floating in a void.

## Data

| File | What | Size |
|---|---|---|
| `data/parks.geojson` | the 63 national parks, simplified to 40 m | 1.3 MB |
| `data/units.geojson` | the other 374 NPS units, simplified to 80 m | 1.6 MB |
| `data/unit-points.geojson` | an interior point per unit, so single-building sites are findable | 70 kB |
| `data/states.geojson` | Census state and territory outlines | 260 kB |
| `data/parks.json` | the sidebar index: facts, areas, bboxes, descriptions | 51 kB |

### Sources

- **Boundaries** — NPS [Land Resources Division boundary and tract service](https://public-nps.opendata.arcgis.com/),
  the authoritative one, fetched whole (442 records, merged to 437 units).
- **Establishment dates, acreage, visits, descriptions** — Wikipedia's
  [List of national parks of the United States](https://en.wikipedia.org/wiki/List_of_national_parks_of_the_United_States),
  whose table columns are cited to the NPS acreage report (2023) and Visitor Use
  Statistics (2025). Descriptions are reused under CC BY-SA 4.0.
- **State outlines** — Census [cartographic boundary files](https://www2.census.gov/geo/tiger/GENZ2023/shp/),
  `cb_2023_us_state_500k`.

## Rebuilding the data

```sh
node pipeline/01_fetch_boundaries.mjs   # ~60 MB of raw NPS polygons → pipeline/raw/
node pipeline/02_fetch_facts.mjs        # the parks table → pipeline/raw/
node pipeline/03_build.mjs              # merge, measure, simplify → data/
node pipeline/04_states.mjs             # Census outlines → data/states.geojson
```

`pipeline/raw/` is git-ignored. Simplification uses mapshaper, fetched on demand
with `npx`, so the repo stays dependency-free.

Every step asserts on shape rather than trusting the source: 442 object IDs in
and 442 features out, exactly 63 parks classified, exactly 63 Wikipedia rows
matched with none left over, no feature lost to simplification, no state or
territory missing. If NPS restructures a field or Wikipedia restructures the
table, the build fails loudly instead of quietly shipping blanks.

### Two quirks the pipeline handles by hand

- **New River Gorge** is the 63rd national park, but the boundary service still
  files it under `National Preserves`. Every other park-and-preserve unit is
  split into two records, one of each type; this one is not, so it is
  reclassified by unit code.
- **Haleakalā** and **Hawai&#699;i Volcanoes** lose their diacritics to the NPS
  plain-ASCII name field. The service's own website spells them properly, so the
  map does too.
