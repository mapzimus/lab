# Torn Down / Built Back

Detroit's structure loss and replacement, block by block, on a half-mile hex grid
with a year slider. No backend, no build step — `index.html` is the whole front
end, and it reads two GeoJSON files out of `data/`.

## What it shows

Each hex is coloured by **net structures that year**: new-construction permits
minus completed demolitions. Red is loss, green is gain, dim grey means nothing
was recorded in that cell that year.

## Data

| | Source | Coverage |
|---|---|---|
| Demolitions | [City of Detroit Completed Demolitions](https://data.detroitmi.gov/) (`city_completed_demolitions`, the ArcGIS successor to Socrata `rv44-e9di`) | 2014-01-02 → 2026-08-13, 31,836 records |
| New builds | Building Permits — BSEED (`bseed_building_permits`), `permit_type` in `New`, `Foundation Only` | 2019-01-02 → 2026-08-20, 1,201 records |
| City boundary | Census TIGERweb incorporated places | — |

**The two datasets do not cover the same span.** Demolitions go back to 2014;
BSEED building permits are only published from 2019. For 2014–2018 the map shows
demolitions alone, and says so — new construction certainly happened in those
years, it is simply not in the published record. The most recent year is partial.

Detroit tears down far more than it puts up in every year on record: roughly
1,300–4,000 demolitions a year against 100–170 new-construction permits.

## Rebuilding the data

```sh
python3 ../../../scripts/detroit_rebuild_grid.py            # use cached raw pulls
python3 ../../../scripts/detroit_rebuild_grid.py --refresh  # re-pull from the portal
```

Raw pulls are cached to `data/raw/` at the repo root (gitignored, ~40 MB). The
processed grid lands in this folder as `detroit-grid.geojson` (660 cells, ~0.6 MB)
and `detroit-boundary.geojson`.

The script is stdlib-only — no geopandas or shapely in this repo's toolchain — so
the hex grid, the point-in-polygon clip, and the spatial join are written out by
hand. Cells are pointy-top hexes 0.5 mi across the flats, kept when their centre
falls inside the city polygon. That clip is by centre, not by intersection, so
edge cells overhang the boundary slightly and ~0.8% of demolitions and ~2% of new
builds fall outside the kept grid.

## Running it locally

```sh
python3 -m http.server   # from this folder, then open http://localhost:8000
```

Opening `index.html` straight off disk does not work: browsers block `fetch()`
under `file://`, so the GeoJSON never loads. The page detects that and says so.
MapLibre is vendored in `vendor/`; the dark basemap comes from CARTO over the
network.
