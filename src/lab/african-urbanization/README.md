# The Century of Africa

A scroll-driven map story in four chapters: Africa's population century (UN
projections to 2100), the megacities rising past every Western city, the
transportation corridors they will need, and Kinshasa's growth on the ground
from satellite epochs. No backend, no tiles — `index.html` + `app.js` drive a
MapLibre globe over ~2 MB of GeoJSON committed in `data/`.

## Chapters

1. **The population century** — country choropleth stepping 2025 → 2100 →
   growth multiple, an SVG regional-totals chart, and computed "overtaking
   years" (the single year an African country's population passes a Western
   one, medium variant, lead held through 2100).
2. **Where the megacities rise** — every African agglomeration ≥1M by 2050 as
   a proportional circle, animating 1975 → 2050 on UN annual series, with New
   York / Tokyo / Paris / London drawn on the same scale. 2100 outlooks are
   hollow rings, flagged as academic projections.
3. **Connecting a continent** — existing rail/roads (Natural Earth), the
   financed lines (China's SGR/BRI railways vs. the Lobito Corridor, plus the
   AU's Trans-African Highway network), and a gravity model
   (pop·pop/distance² over top-30 2050 cities) sketching demanded corridors.
4. **Kinshasa, ground truth** — GHSL built-up epochs 1975–2030 stacked as
   growth-vintage rings over the Malebo Pool, with OSM river and roads.

## Pipeline

`pipeline/` holds the five Python scripts that produced `data/` (run in
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

Python deps: `pyshp shapely numpy rasterio requests osm2geojson`.

## Honesty notes

- All country/regional figures are the UN's **medium variant** — a central
  path, not a prediction; the crossover years move with the variant.
- 2100 city figures are Hoornweg & Pope (2017), an academic projection well
  above UN city horizons — always labeled and drawn hollow.
- Corridor geometry is schematic (city-to-city), and the "modeled" network is
  a demand sketch, not an engineering or policy proposal.
- GHSL built-up epochs are model output from satellite archives; the 2030
  epoch is the JRC's own projection. The ≥20% built threshold trades detail
  for legible footprints.

## Licenses

Natural Earth (public domain) · UN WPP/WUP (CC BY 3.0 IGO) · JRC GHSL
(CC BY 4.0) · OpenStreetMap (ODbL, © OpenStreetMap contributors) · MapLibre
GL JS (BSD-3-Clause, vendored in `vendor/`).
