---
name: choropleth
description: >-
  Make choropleth maps that are statistically honest and cartographically clean — projection choice, normalization, classification breaks, FIPS joins, color ramps, no-data handling — in geopandas/Python or QGIS. Use this whenever a task colors geographic areas by a value: "map X by state/county/tract/country", income/population/election/health maps, bivariate maps, or reviewing/debugging a choropleth that looks wrong. Trigger even if the user doesn't say "choropleth" — any "shade regions by data" request is this skill.
---

# Choropleths that don't lie

A choropleth's color stands for a value measured over an area, which makes
it easy to build something misleading while every individual step looks
fine. The failures are standard and so are the fixes — run this list in
order.

## 1. Projection first (before any code)

Coloring areas means **area distortion is distortion of the message**. In
Web Mercator, Alaska shouts and the tropics whisper.

| Map of | Use | EPSG |
|---|---|---|
| US (national, by state/county/tract) | NAD83 Conus Albers | 5070 |
| World | Equal Earth | 8857 |
| One US state | that state's State Plane zone | varies |
| Interactive web slippy map | Web Mercator (accepted trade-off) | 3857 |
| Storage / exchange | WGS 84 (project on the fly) | 4326 |

```python
counties = counties.to_crs(epsg=5070)   # geopandas: before plotting
```

In QGIS: set the *project* CRS (bottom-right) before composing. For US
national maps, handle Alaska/Hawaii with insets or an AlbersUSA-style
composite so they don't dominate or vanish.

## 2. Normalize — never map raw counts

A choropleth of totals is a population map wearing a costume. Divide by
population (rates per 100k), households, or land area before mapping.
Raw counts are only legitimate on symbol maps (sized circles), not on
filled polygons.

## 3. Joins: FIPS/GEOID as strings

The #1 broken-join cause: numeric FIPS drops leading zeros ("06075" → 6075).

```python
data["fips"] = data["fips"].astype(str).str.zfill(5)   # county = state(2)+county(3)
merged = counties.merge(data, left_on="GEOID", right_on="fips", how="left")
```

State = 2 digits, county = 5, tract = 11, block group = 12. After the join,
**count the unmatched rows** — a silent 3% join failure reads as a data
pattern on the map.

## 4. Classification

- **5–7 classes.** Fewer loses signal; more loses readability.
- **Quantiles** for evenly-populated legends; **Jenks/natural breaks** when
  the data clusters; **equal interval** almost never (one outlier empties
  the middle classes); **manual round-number breaks** for comparability
  across a map series.
- Diverging data (above/below a meaningful midpoint like 0 or the national
  average) gets a **diverging ramp centered on that midpoint** — quantiles
  centered on the median are not the same thing.

## 5. Color

- Sequential data → sequential ramp (viridis, YlOrRd); diverging →
  RdBu/RdYlBu; categorical → distinct hues, max ~7.
- One palette per map. Check colorblind-safety (viridis and ColorBrewer
  "colorblind safe" sets pass).
- **No-data is its own visual class** — light gray hatch or distinct
  neutral, labeled in the legend. Never blend it into the ramp's low end
  and never drop the polygons. Small-population areas get suppressed in
  Census/CDC data; showing suppression honestly is part of the map.

## 6. Statistical honesty

- **MAUP**: patterns at county level can vanish or invert at state level.
  Name the unit in the title/caption; be suspicious of conclusions that
  only appear at one aggregation.
- Small-denominator instability: rates from tiny populations swing wildly —
  consider pooling years or flagging low-population units.
- Bivariate choropleths: 3×3 grid max, with the two-axis legend; classify
  each variable independently (`ntile(3)` each).

## Workflow snippets

geopandas quick map:

```python
ax = merged.to_crs(5070).plot(
    column="rate", scheme="quantiles", k=5, cmap="viridis",
    edgecolor="white", linewidth=0.2,
    missing_kwds={"color": "#d9d9d9", "label": "No data"},
    legend=True)
ax.set_axis_off()
```

QGIS: Properties → Symbology → Graduated → column, classification mode,
classes; style no-data via a rule-based override. Export via Print Layout
(see the `map-poster` skill for finishing).

PostGIS classification helper: `ntile(5) OVER (ORDER BY value)`.
