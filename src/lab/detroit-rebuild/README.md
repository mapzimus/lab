# Torn Down / Built Back

Detroit's structure loss and replacement, block by block, on a half-mile hex grid
with a year slider. No backend, no build step — `index.html` is the whole front
end, and it reads two GeoJSON files out of `data/`.

## What it shows

Nine ways to colour the grid, all on fixed class breaks so every year is
comparable to every other year as the slider moves:

| Metric | Type | Reads as |
|---|---|---|
| Share of stock demolished (year) | sequential | demolitions that year ÷ buildings standing at its start |
| Net structures (year) | diverging | new builds − demolitions |
| Net structures (cumulative) | diverging | running total since 2014 |
| Demolitions (year) | sequential | raw count |
| Rehab & addition permits (year) | sequential | structural work putting building back |
| Alteration permits (year) | sequential | money spent on standing buildings |
| Stabilisations (year) | sequential | boarded up instead of demolished |
| Land Bank sales (year) | sequential | property returning to private hands |
| Built that year, still standing | sequential | construction from `year_built`, back to **1870** |
| Built since 2000, cumulative | sequential | running total of surviving construction |
| Share of stock lost (2014–2026) | sequential | the whole period at once |
| Share of stock built since 2000 | sequential | Detroit's newest ground |
| Median year built | sequential | age of what still stands, 1904–2009 |

Plus a trajectory filter (gutted / thinning / churning / holding / rebuilding /
no activity / little stock), a neighbourhood search over 181 names, a leaderboard
that flies to the cell, and a per-cell history chart of structures lost against
structures put back.

**Raw counts of demolitions mostly map where the houses used to be.** The share
of standing stock lost is the honest measure, so cells are normalised against the
buildings actually in them — 235,947 citywide, walked backwards year by year.
The median half-mile cell lost about a tenth of its buildings over the period;
the worst lost 55.7%.

## Data

| | Source | Coverage | Records |
|---|---|---|---|
| Demolitions | City of Detroit Completed Demolitions (ArcGIS successor to Socrata `rv44-e9di`) | 2014–2026 | 31,580 |
| New builds | BSEED Building Permits — `New`, `Foundation Only` | 2019–2026 | 942 |
| Rehabs | BSEED Building Permits — `Residential Rehab`, `Addition` | 2019–2026 | 1,387 |
| Alterations | BSEED Building Permits — `Alteration` | 2019–2026 | 38,512 |
| Stabilisations | City of Detroit Completed Property Stabilizations | 2021–2025 | 2,703 |
| Land Bank sales | DLBA auction / own-it-now / project / vacant-land sales | 2014–2026 | 54,292 |
| Building stock | Parcels (Current) — improved parcels, `num_buildings` | current | 235,947 buildings |
| Construction dates | Parcels (Current) — `year_built` on standing buildings | 1870–2026 | 241,085 dated; 4,181 since 2000 |
| City boundary | Census TIGERweb incorporated places | — | 1 |

**Coverage differs by source, and the map says so rather than drawing a gap as a
zero.** Construction dates run from 2000, demolitions from 2014, permits only from
2019, stabilisations 2021–2025 only. The most recent year is partial.

### Why `year_built` carries the long arc

Every one of BSEED's five permit services begins `2019-01-02` — a system
migration, not a gap that can be searched around. The parcel file's `year_built`
is the only construction record that reaches further, and it reaches to the
1850s. It is also a different kind of measurement, and the map labels it as one:
a permit is an intention filed, `year_built` is a building that exists now.

**It counts survivors, not starts**, and that matters more the further back you
go: a 1920s value is what is *left* of the 1920s, not what was built then. Every
label says "still standing" for that reason.

The window opens at **1870**. Dates run back to 1701 — Detroit's founding year,
on exactly one building, plainly a placeholder — and only 32 buildings in the
grid predate 1870, scattered across 14 years. Those are counted into the totals
and reported in the metadata (`built_before_window`) rather than silently
dropped.

What the long series shows: the streetcar core filling in through the 1910s and
1920s, then the postwar ring — **10,497 buildings still standing went up in 1950
alone**, against 4,181 across the whole quarter-century since 2000. Peak
surviving years are 1950, 1948, 1941 and 1925. In the modern era it is roughly
300–660 a year through 2007, a collapse to a few dozen from the crash through
the bankruptcy and into 2021, then a modest recovery from 2022.

### The slider follows the metric

The construction record runs 157 years and the demolition record 13. A single
slider spanning the union would leave most metrics a sliver of it, so the slider
spans whatever the selected metric actually covers, and holds the year across a
metric change when the new range contains it. Playback scales to a roughly
24-second pass regardless of span.

Permit categories are our split. `Alteration` is by far the largest class and the
best proxy for money spent on a standing building, but it spans a furnace swap to
a gut job — it is reported on its own and never folded into net. Revisions
(`New Revision`, `Alter Revision`) are excluded so nothing counts twice, and
new-build and rehab permits are deduplicated per parcel and year.

## Colour

Classed choropleths, six or seven classes, fixed breaks. Sequential ramps are one
hue running dim → bright, which reads correctly on a dark basemap and is
colourblind-safe by construction because the signal lives in lightness. Cells
holding fewer than 25 buildings are drawn in their own neutral and excluded from
rate shading — a rate over a handful of buildings swings wildly.

The diverging ramps needed measuring. Against the `#14161a` surface the red/green
poles separate by only **ΔE 5.9 under deuteranopia** — a fail. The red/blue
alternative measures **22.8**, so the page ships a colourblind-safe toggle that
swaps the positive pole and leaves the breaks and neutral midpoint alone.

Trajectory is deliberately a filter and not a fill scheme: no five-class palette
spanning red to green can pass an all-pairs CVD check, so selecting a class
highlights its cells instead — membership encoded by opacity, and swatches only
ever appearing beside their own text label.

## Rebuilding the data

```sh
python3 ../../../scripts/detroit_rebuild_grid.py            # use cached raw pulls
python3 ../../../scripts/detroit_rebuild_grid.py --refresh  # re-pull from the portal
```

A full refresh pulls ~360,000 records and takes about six minutes. Raw pulls are
cached to `data/raw/` at the repo root (gitignored, ~120 MB). The processed grid
lands here as `detroit-grid.geojson` (660 cells, ~2 MB) and
`detroit-boundary.geojson`.

The script is stdlib-only — no geopandas or shapely in this repo's toolchain — so
the hex grid, the point-in-polygon clip, and the spatial join are written out by
hand. Cells are pointy-top hexes 0.5 mi across the flats, kept when their centre
falls inside the city polygon; the polygon's interior ring drops the Hamtramck /
Highland Park enclave out of the grid for free. That clip is by centre, not by
intersection, so edge cells overhang slightly and a small share of records falls
outside the kept grid — the script reports the count for every source on each run.

Parcels are fetched as centroids (`returnCentroid=true`) rather than polygons,
which is about a tenth of the payload for 227,220 records and all the grid needs
to bin them.

## Running it locally

```sh
python3 -m http.server   # from this folder, then open http://localhost:8000
```

Opening `index.html` straight off disk does not work: browsers block `fetch()`
under `file://`, so the GeoJSON never loads. The page detects that and says so.
MapLibre is vendored in `vendor/`; the dark basemap comes from CARTO over the
network.
