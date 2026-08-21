#!/usr/bin/env python3
"""Build the Detroit structure loss / rebuild grid.

Pulls two City of Detroit open datasets from their ArcGIS REST endpoints,
caches the raw GeoJSON, bins every record into a ~0.5 mile hex grid clipped to
the Detroit city boundary, and writes one GeoJSON where each cell carries
per-year demolition, new-build, and net counts.

    python3 scripts/detroit_rebuild_grid.py            # use cached raw pulls
    python3 scripts/detroit_rebuild_grid.py --refresh  # re-pull from the portal

Raw pulls  -> data/raw/            (gitignored, ~40 MB)
Processed  -> src/lab/detroit-rebuild/data/   (committed, served by the site)

Stdlib only: no geopandas/shapely in this repo's toolchain, so the hex grid,
the point-in-polygon clip, and the spatial join are all done by hand below.
"""

import argparse
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(ROOT, "data", "raw")
OUT_DIR = os.path.join(ROOT, "src", "lab", "detroit-rebuild", "data")

DETROIT_ORG = "https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services"

# City of Detroit Completed Demolitions — the ArcGIS Hub successor to the
# Socrata dataset published as rv44-e9di. One row per completed demolition.
DEMOLITIONS = {
    "name": "demolitions",
    "url": f"{DETROIT_ORG}/city_completed_demolitions/FeatureServer/0/query",
    "date_field": "demolition_date",
    "where": "demolition_date IS NOT NULL",
    "out_fields": "ObjectId,demolition_date,address,is_commercial_demolition",
}

# Building Permits (BSEED).
#
# Permit type filter: the dataset has 17 permit_type values and no single
# "new construction" flag. The broadest reasonable read of new construction is
# 'New' (1,096 records) plus 'Foundation Only' (105) — a foundation-only permit
# is the opening move on a new structure. Everything else describes work on a
# building that already stands ('Alteration', 'Residential Rehab', 'Addition',
# 'Change of Use', 'Fire Repair', ...) or is bookkeeping on a permit already
# counted ('New Revision', 'Alter Revision'), so those stay out. Because a
# parcel can draw a Foundation Only permit and then a New permit, permits are
# deduplicated per (parcel, year) — see aggregate() below.
#
# This covers new residential and new commercial alike; BSEED does not split
# the two on permit_type, and use_group/construction_type are too sparsely
# populated to filter on without dropping real new builds.
NEW_BUILDS = {
    "name": "newbuilds",
    "url": f"{DETROIT_ORG}/bseed_building_permits/FeatureServer/0/query",
    "date_field": "issued_date",
    "where": "permit_type IN ('New', 'Foundation Only') AND issued_date IS NOT NULL",
    "out_fields": "ObjectId,issued_date,permit_type,address,parcel_id",
}

# Census TIGERweb incorporated places. Detroit's own portal publishes council
# districts but no single city outline; this one polygon already carries the
# Hamtramck / Highland Park enclave as an interior ring, which is exactly the
# hole the grid should have.
BOUNDARY_URL = (
    "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/"
    "Places_CouSub_ConCity_SubMCD/MapServer/4/query"
)

PAGE_SIZE = 1000
CELL_WIDTH_MILES = 0.5
METERS_PER_MILE = 1609.344

# Local equirectangular projection centred on Detroit. Across the city's ~31 km
# width the fixed cos(lat0) term is off by ~0.3%, far below the 800 m cell size.
LAT0 = 42.35
LON0 = -83.10
M_PER_DEG_LAT = 110574.0
M_PER_DEG_LON = 111320.0 * math.cos(math.radians(LAT0))


# --------------------------------------------------------------------------
# fetching
# --------------------------------------------------------------------------

def get_json(url, params, retries=4):
    query = urllib.parse.urlencode(params)
    full = f"{url}?{query}"
    delay = 2
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(full, headers={"User-Agent": "mapzimus-lab/1.0"})
            with urllib.request.urlopen(req, timeout=180) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            if attempt == retries:
                raise
            print(f"    retry {attempt + 1} after {exc}", file=sys.stderr)
            time.sleep(delay)
            delay *= 2
    raise RuntimeError("unreachable")


def fetch_layer(spec, cache_path, refresh=False):
    """Page an ArcGIS feature layer out as one GeoJSON FeatureCollection."""
    if os.path.exists(cache_path) and not refresh:
        print(f"  {spec['name']}: using cached {os.path.relpath(cache_path, ROOT)}")
        with open(cache_path, encoding="utf-8") as fh:
            return json.load(fh)

    features = []
    offset = 0
    while True:
        payload = get_json(spec["url"], {
            "where": spec["where"],
            "outFields": spec["out_fields"],
            "outSR": 4326,
            "f": "geojson",
            "resultOffset": offset,
            "resultRecordCount": PAGE_SIZE,
            # Stable ordering, otherwise offset paging can skip or repeat rows.
            "orderByFields": "ObjectId ASC",
        })
        if "error" in payload:
            raise RuntimeError(f"{spec['name']}: {payload['error']}")
        page = payload.get("features", [])
        features.extend(page)
        print(f"  {spec['name']}: {len(features)} features", end="\r", file=sys.stderr)
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    collection = {"type": "FeatureCollection", "features": features}
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    with open(cache_path, "w", encoding="utf-8") as fh:
        json.dump(collection, fh)
    print(f"  {spec['name']}: {len(features)} features -> {os.path.relpath(cache_path, ROOT)}")
    return collection


def fetch_boundary(cache_path, refresh=False):
    if os.path.exists(cache_path) and not refresh:
        print(f"  boundary: using cached {os.path.relpath(cache_path, ROOT)}")
        with open(cache_path, encoding="utf-8") as fh:
            return json.load(fh)

    payload = get_json(BOUNDARY_URL, {
        "where": "STATE='26' AND BASENAME='Detroit'",
        "outFields": "GEOID,NAME",
        "outSR": 4326,
        "f": "geojson",
    })
    if not payload.get("features"):
        raise RuntimeError("boundary query returned no features")
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    with open(cache_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh)
    print(f"  boundary: 1 feature -> {os.path.relpath(cache_path, ROOT)}")
    return payload


# --------------------------------------------------------------------------
# geometry
# --------------------------------------------------------------------------

def to_xy(lon, lat):
    return (lon - LON0) * M_PER_DEG_LON, (lat - LAT0) * M_PER_DEG_LAT


def to_lonlat(x, y):
    return LON0 + x / M_PER_DEG_LON, LAT0 + y / M_PER_DEG_LAT


def rings_of(geometry):
    """Every linear ring of a (Multi)Polygon, projected to local metres."""
    polys = geometry["coordinates"]
    if geometry["type"] == "Polygon":
        polys = [polys]
    return [[to_xy(c[0], c[1]) for c in ring] for poly in polys for ring in poly]


def point_in_rings(x, y, rings, bbox):
    """Even-odd ray cast. Counting crossings across every ring at once means
    interior rings (the Hamtramck / Highland Park enclave) punch holes for free."""
    minx, miny, maxx, maxy = bbox
    if x < minx or x > maxx or y < miny or y > maxy:
        return False
    inside = False
    for ring in rings:
        for i in range(len(ring) - 1):
            x1, y1 = ring[i]
            x2, y2 = ring[i + 1]
            if (y1 > y) != (y2 > y):
                xin = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
                if x < xin:
                    inside = not inside
    return inside


def axial_round(q, r):
    """Round fractional axial coords to the nearest hex (cube rounding)."""
    cx, cz = q, r
    cy = -cx - cz
    rx, ry, rz = round(cx), round(cy), round(cz)
    dx, dy, dz = abs(rx - cx), abs(ry - cy), abs(rz - cz)
    if dx > dy and dx > dz:
        rx = -ry - rz
    elif dy > dz:
        ry = -rx - rz
    else:
        rz = -rx - ry
    return int(rx), int(rz)


def xy_to_axial(x, y, size):
    q = (math.sqrt(3) / 3 * x - y / 3) / size
    r = (2 / 3 * y) / size
    return axial_round(q, r)


def axial_to_xy(q, r, size):
    return size * math.sqrt(3) * (q + r / 2), size * 1.5 * r


def hex_corners(cx, cy, size):
    """Pointy-top hexagon, closed ring, in lon/lat."""
    ring = []
    for i in range(6):
        angle = math.radians(60 * i - 30)
        ring.append(to_lonlat(cx + size * math.cos(angle), cy + size * math.sin(angle)))
    ring.append(ring[0])
    return [[round(lon, 6), round(lat, 6)] for lon, lat in ring]


# --------------------------------------------------------------------------
# processing
# --------------------------------------------------------------------------

def record_points(collection, date_field):
    """(year, x, y, parcel_id) for every record with usable coords and a date."""
    out = []
    skipped = 0
    latest = ""
    for feature in collection["features"]:
        geom = feature.get("geometry") or {}
        props = feature.get("properties") or {}
        raw_date = props.get(date_field)
        coords = geom.get("coordinates") if geom.get("type") == "Point" else None
        if not coords or raw_date in (None, ""):
            skipped += 1
            continue
        lon, lat = coords[0], coords[1]
        if lon is None or lat is None or (lon == 0 and lat == 0):
            skipped += 1
            continue
        # esriFieldTypeDateOnly comes back as 'YYYY-MM-DD'; epoch millis is the
        # fallback for layers that hand back a plain esriFieldTypeDate.
        if isinstance(raw_date, str):
            year = int(raw_date[:4])
        else:
            year = time.gmtime(raw_date / 1000).tm_year
        if isinstance(raw_date, str) and raw_date > latest:
            latest = raw_date
        x, y = to_xy(lon, lat)
        out.append((year, x, y, props.get("parcel_id")))
    return out, skipped, latest


def aggregate(demos, builds, rings, bbox, size):
    """Spatial join both record sets onto the clipped hex grid."""
    counts = defaultdict(lambda: defaultdict(int))  # cell -> "demolitions_YYYY" -> n
    cells_with_data = set()
    outside = {"demolitions": 0, "newbuilds": 0}

    # A parcel that pulls a Foundation Only permit and then a New permit in the
    # same year is one new building, not two.
    seen_builds = set()

    for label, records in (("demolitions", demos), ("newbuilds", builds)):
        for year, x, y, parcel_id in records:
            if label == "newbuilds" and parcel_id:
                key = (parcel_id, year)
                if key in seen_builds:
                    continue
                seen_builds.add(key)
            cell = xy_to_axial(x, y, size)
            cx, cy = axial_to_xy(cell[0], cell[1], size)
            if not point_in_rings(cx, cy, rings, bbox):
                outside[label] += 1
                continue
            counts[cell][f"{label}_{year}"] += 1
            cells_with_data.add(cell)
    return counts, cells_with_data, outside


def build_grid(rings, bbox, size):
    """Every hex whose centre falls inside the city polygon."""
    minx, miny, maxx, maxy = bbox
    cells = []
    r_lo = int(math.floor(miny / (1.5 * size))) - 1
    r_hi = int(math.ceil(maxy / (1.5 * size))) + 1
    for r in range(r_lo, r_hi + 1):
        q_lo = int(math.floor(minx / (size * math.sqrt(3)) - r / 2)) - 1
        q_hi = int(math.ceil(maxx / (size * math.sqrt(3)) - r / 2)) + 1
        for q in range(q_lo, q_hi + 1):
            cx, cy = axial_to_xy(q, r, size)
            if point_in_rings(cx, cy, rings, bbox):
                cells.append((q, r))
    return cells


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true",
                        help="re-pull from the portal instead of using data/raw/")
    args = parser.parse_args()

    os.makedirs(RAW_DIR, exist_ok=True)
    os.makedirs(OUT_DIR, exist_ok=True)

    print("Fetching:")
    boundary = fetch_boundary(os.path.join(RAW_DIR, "detroit_boundary.geojson"), args.refresh)
    demo_raw = fetch_layer(DEMOLITIONS, os.path.join(RAW_DIR, "detroit_demolitions.geojson"), args.refresh)
    build_raw = fetch_layer(NEW_BUILDS, os.path.join(RAW_DIR, "detroit_new_permits.geojson"), args.refresh)

    rings = rings_of(boundary["features"][0]["geometry"])
    xs = [p[0] for ring in rings for p in ring]
    ys = [p[1] for ring in rings for p in ring]
    bbox = (min(xs), min(ys), max(xs), max(ys))

    size = CELL_WIDTH_MILES * METERS_PER_MILE / math.sqrt(3)  # circumradius
    print(f"\nGrid: pointy-top hexes, {CELL_WIDTH_MILES} mi across flats "
          f"(circumradius {size:.0f} m)")

    demos, demo_skipped, demo_through = record_points(demo_raw, DEMOLITIONS["date_field"])
    builds, build_skipped, build_through = record_points(build_raw, NEW_BUILDS["date_field"])
    print(f"  demolitions: {len(demos)} usable ({demo_skipped} without date/coords)")
    print(f"  new builds:  {len(builds)} usable ({build_skipped} without date/coords)")

    counts, cells_with_data, outside = aggregate(demos, builds, rings, bbox, size)
    grid = build_grid(rings, bbox, size)
    print(f"  grid cells inside the city boundary: {len(grid)}")
    print(f"  records outside the clipped grid: "
          f"{outside['demolitions']} demolitions, {outside['newbuilds']} new builds")

    years = set()
    for cell_counts in counts.values():
        for key in cell_counts:
            years.add(int(key.rsplit("_", 1)[1]))
    years = sorted(years)

    demo_years = sorted({y for y, *_ in demos})
    build_years = sorted({y for y, *_ in builds})
    print(f"  demolition years: {demo_years[0]}-{demo_years[-1]}")
    print(f"  new build years:  {build_years[0]}-{build_years[-1]}")

    features = []
    totals = defaultdict(lambda: {"demolitions": 0, "newbuilds": 0})
    for index, (q, r) in enumerate(sorted(grid)):
        cell_counts = counts.get((q, r), {})
        props = {"id": index, "q": q, "r": r}
        for year in years:
            demolitions = cell_counts.get(f"demolitions_{year}", 0)
            newbuilds = cell_counts.get(f"newbuilds_{year}", 0)
            props[f"demolitions_{year}"] = demolitions
            props[f"newbuilds_{year}"] = newbuilds
            props[f"net_{year}"] = newbuilds - demolitions
            totals[year]["demolitions"] += demolitions
            totals[year]["newbuilds"] += newbuilds
        cx, cy = axial_to_xy(q, r, size)
        features.append({
            "type": "Feature",
            "properties": props,
            "geometry": {"type": "Polygon", "coordinates": [hex_corners(cx, cy, size)]},
        })

    collection = {
        "type": "FeatureCollection",
        "metadata": {
            "title": "Detroit structure loss and rebuild, by ~0.5 mile hex",
            "years": years,
            # New-build permits only start in 2019 in the published BSEED
            # dataset; demolitions run further back. The front end needs this to
            # keep from drawing "no permits published" as "no permits issued".
            "demolition_years": [demo_years[0], demo_years[-1]],
            "newbuild_years": [build_years[0], build_years[-1]],
            "demolitions_through": demo_through,
            "newbuilds_through": build_through,
            "cell_width_miles": CELL_WIDTH_MILES,
            "citywide_totals": {str(y): totals[y] for y in years},
            "sources": {
                "demolitions": "City of Detroit Completed Demolitions (data.detroitmi.gov, rv44-e9di)",
                "newbuilds": "Building Permits — BSEED (data.detroitmi.gov), permit_type in (New, Foundation Only)",
                "boundary": "US Census TIGERweb incorporated places",
            },
        },
        "features": features,
    }

    grid_path = os.path.join(OUT_DIR, "detroit-grid.geojson")
    with open(grid_path, "w", encoding="utf-8") as fh:
        json.dump(collection, fh, separators=(",", ":"))

    boundary_out = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {"name": "Detroit"},
            "geometry": boundary["features"][0]["geometry"],
        }],
    }
    boundary_path = os.path.join(OUT_DIR, "detroit-boundary.geojson")
    with open(boundary_path, "w", encoding="utf-8") as fh:
        json.dump(boundary_out, fh, separators=(",", ":"))

    print(f"\nWrote {os.path.relpath(grid_path, ROOT)} "
          f"({len(features)} cells, {os.path.getsize(grid_path) / 1e6:.2f} MB)")
    print(f"Wrote {os.path.relpath(boundary_path, ROOT)} "
          f"({os.path.getsize(boundary_path) / 1e6:.2f} MB)")
    print(f"\nCitywide by year:")
    for year in years:
        t = totals[year]
        print(f"  {year}  demolitions {t['demolitions']:>6}   "
              f"new builds {t['newbuilds']:>5}   net {t['newbuilds'] - t['demolitions']:>7}")


if __name__ == "__main__":
    main()
