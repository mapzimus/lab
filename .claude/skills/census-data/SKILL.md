---
name: census-data
description: Get US Census Bureau data and geometries the reliable way — ACS/Decennial API queries, variable-code decoding, geography hierarchy, TIGER/Line vs cartographic boundary shapefiles, and the joins that connect them. Use this whenever a task needs American demographic, income, housing, or population data by state/county/tract/place ("median income by county", "population of every tract in X"), mentions ACS, the Census API, TIGER, GEOIDs, or needs polygons for US administrative geographies. Trigger for any US data-by-geography request even if "Census" is never said.
---

# US Census data, without the guesswork

Census data work is two supply chains — **numbers** (the data API) and
**shapes** (TIGER files) — joined on GEOID. Each has conventions that are
obvious once known and maddening to reverse-engineer.

## Numbers: the data API

Base: `https://api.census.gov/data/{year}/{dataset}`

| Dataset | Path | What |
|---|---|---|
| ACS 5-year | `acs/acs5` | the workhorse: every geography down to block group, 5-yr pooled estimates |
| ACS 1-year | `acs/acs1` | fresher, only geographies ≥65k population |
| Decennial | `dec/pl` (2020) | actual counts, redistricting variables |
| Population estimates | `pep/population` | annual inter-census estimates |

Query shape:

```
https://api.census.gov/data/2023/acs/acs5?get=NAME,B19013_001E&for=county:*&in=state:25
```

- `get=` comma-separated variables, `for=` target geography, `in=` parent.
- A key (`&key=`) is free and only required past ~500 calls/day.
- Find variables at `https://api.census.gov/data/2023/acs/acs5/variables.html`
  or by browsing tables at data.census.gov — **search by concept, not table
  ID**.

**Decoding variable codes** — `B19013_001E`:
`B19013` = table (B=base/detail, C=collapsed, S=subject, DP=profile) ·
`_001` = row within table · suffix `E` = estimate, `M` = margin of error.
Common tables: `B01003` total population, `B19013` median household income,
`B25077` median home value, `B15003` educational attainment, `B03002`
race/ethnicity.

**Gotchas**: the API returns everything as strings (cast numerics);
sentinel values like `-666666666` mean suppressed/NA (null them); MOEs
matter for small geographies — an estimate of 8,000 ± 6,000 is not a fact.

## Geography hierarchy

`for`/`in` use summary-level nesting. The ones that matter:

| Level | Code | GEOID digits |
|---|---|---|
| state | 040 | 2 |
| county | 050 | 5 = state+county |
| tract | 140 | 11 = state+county+tract |
| block group | 150 | 12 |
| place (city/town) | 160 | 7 |
| metro/CBSA | 310 | 5 |
| ZCTA (ZIP-ish) | 860 | 5 |

Tracts/block groups require the full parent chain:
`for=tract:*&in=state:25+county:017`. ZCTAs are not ZIP codes — they're
polygon approximations; never promise ZIP precision.

## Shapes: TIGER/Line vs cartographic boundary

- **TIGER/Line** (`https://www2.census.gov/geo/tiger/TIGER{year}/`) — legal
  boundaries, includes water, heavy. Use for geoprocessing/geocoding.
- **Cartographic boundary** (`.../geo/tiger/GENZ{year}/shp/`, e.g.
  `cb_2023_us_county_500k.zip`) — generalized (1:500k/5m/20m), clipped to
  shoreline. **Use for maps** — coastal counties look right and files are
  10× smaller.

```python
counties = gpd.read_file("https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_county_500k.zip")
```

Python shortcuts: `census` (API wrapper) + `us` (state FIPS lookup);
R: `tidycensus` (numbers+shapes in one call).

## The join

```python
data["GEOID"] = (data["state"] + data["county"]).str.zfill(5)  # API returns parts
merged = counties.merge(data, on="GEOID", how="left")
assert merged["value"].isna().mean() < 0.01, "join is leaking"
```

- **GEOID as string, always** — leading zeros (Alabama "01") die in numeric
  columns. This is the #1 Census bug.
- Match vintage: 2023 ACS ↔ 2023 boundaries. Tract lines were redrawn in
  2020 — never join 2019 ACS tracts to 2020+ geometry.
- CT replaced counties with planning regions in 2022 — old county FIPS
  don't match new data.

## After the join

Reproject before mapping (EPSG:5070 for US choropleths) and normalize
counts to rates — the `choropleth` skill covers that discipline.
