---
name: overpass-osm
description: >-
  Extract features from OpenStreetMap — Overpass API queries that don't time out, route-relation geometry stitching, bulk downloads (Geofabrik/planet), and ODbL license compliance. Use this whenever a task needs OSM data: "all the cafés/hospitals/rail lines in X", named route geometry (train/bus/hiking routes), building footprints, road networks, POI extraction, anything mentioning Overpass/overpass-turbo/OSM tags, or choosing between querying OSM live vs downloading extracts. Trigger for any "get real-world features from a map" request where OSM is the plausible source.
---

# Getting features out of OpenStreetMap

OSM has almost everything; the craft is asking for it without timing out,
reassembling geometry correctly, and staying licensed. Prototype queries at
https://overpass-turbo.eu (it renders results live), then automate.

## Overpass QL anatomy

```
[out:json][timeout:60];
area["ISO3166-2"="US-OR"]->.a;      // 1. bound the search FIRST
(
  nwr["amenity"="hospital"](area.a); // 2. filter by tags
);
out center;                          // 3. choose output detail
```

- `nwr` = nodes + ways + relations in one clause (usually what you want —
  a hospital may be mapped as any of the three).
- Bounding: `area[...]` for named regions (match on `ISO3166-1`/`-2`,
  `name`, `admin_level`), or a bbox `(south,west,north,east)` appended to
  the filter. **Never query planet-wide by tag.**
- Output: `out center;` → one representative point per feature (POI maps);
  `out geom;` → full coordinate geometry (lines/polygons);
  `out body; >; out skel qt;` → members recursed for manual assembly.
- Endpoint: POST to `https://overpass-api.de/api/interpreter` with
  `data=<query>`. It's a shared free service — sleep between requests, and
  use a mirror (e.g. `overpass.kumi.systems`) for batch work.

Common tag filters: `["railway"="station"]`, `["amenity"="cafe"]`,
`["building"]` (any value), `["highway"~"^(primary|secondary)$"]` (regex),
`["name",i]` (case-insensitive). Tag reference: https://wiki.openstreetmap.org/wiki/Map_features

## Named routes (the relation pattern)

Train/bus/hiking routes are relations of type `route`:

```
[out:json][timeout:90];
rel["route"="train"]["name"="Glacier Express"];
out geom;
```

The result is many member ways, unordered and possibly reversed — do not
concatenate them naively. Convert with **osmtogeojson** (JS) or
**osm2geojson** (Python), which stitch members into LineStrings /
MultiLineStrings:

```python
import requests, osm2geojson, geopandas as gpd
r = requests.post("https://overpass-api.de/api/interpreter", data={"data": query}, timeout=90)
gj = osm2geojson.json2geojson(r.json())
gdf = gpd.GeoDataFrame.from_features(gj["features"], crs="EPSG:4326")
```

Then `simplify` before shipping to the web (track-accurate geometry is
megabytes per long route; ~0.01° tolerance keeps world-zoom shapes
identical at a fraction of the size).

## When the query times out anyway

In order: raise `[timeout:]`; shrink the area; split the tag list into
several queries; add `[maxsize:1073741824]`; or admit it's a bulk job —

## Bulk extracts (the right tool past ~100k features)

- **Geofabrik** (`download.geofabrik.de`) — daily-updated `.osm.pbf` per
  continent/country/state. The default for "everything in region X".
- Filter/convert locally with **osmium** (`osmium tags-filter`,
  `osmium export`) or load to PostGIS with **osm2pgsql** for query-heavy
  work; `ogr2ogr` reads .pbf directly for quick shapefile/GeoJSON pulls.
- **planet.osm** only for global analyses (~80 GB).

Rule of thumb: exploratory/POI-scale → Overpass; regional bulk, repeated
runs, or heavy geometry → Geofabrik extract.

## License (not optional)

OSM data is **ODbL**: attribute "© OpenStreetMap contributors" visibly on
any map or dataset using it; derived *databases* must be shared under ODbL
(share-alike); produced *works* (rendered maps, analyses) may be licensed
freely. You cannot re-license extracted OSM data as CC-BY/proprietary.
Details: https://www.openstreetmap.org/copyright
