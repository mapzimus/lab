#!/usr/bin/env python3
"""Build the Detroit structure loss / rebuild grid.

Pulls City of Detroit open data from the ArcGIS REST endpoints, caches the raw
GeoJSON, bins every record into a ~0.5 mile hex grid clipped to the city
boundary, and writes one GeoJSON where each cell carries per-year counts, the
standing building stock that normalises them, and a trajectory class.

    python3 scripts/detroit_rebuild_grid.py            # use cached raw pulls
    python3 scripts/detroit_rebuild_grid.py --refresh  # re-pull from the portal

Raw pulls  -> data/raw/            (gitignored, ~120 MB)
Processed  -> src/lab/detroit-rebuild/data/   (committed, served by the site)

Stdlib only: no geopandas/shapely in this repo's toolchain, so the hex grid,
the point-in-polygon clip, and the spatial join are all done by hand below.

Normalisation is the point of this script. A raw count of demolitions is
mostly a map of where the houses were; what matters is the share of a block's
building stock that came down. Every rate here divides by the buildings
actually standing in that cell, reconstructed year by year.
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
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(ROOT, "data", "raw")
OUT_DIR = os.path.join(ROOT, "src", "lab", "detroit-rebuild", "data")

ORG = "https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services"

# ---------------------------------------------------------------------------
# What gets counted
#
# Permit filters. BSEED has 17 permit_type values and no single "new
# construction" flag, so the split below is ours:
#
#   newbuilds    New (1,096) + Foundation Only (105). A foundation-only permit
#                is the opening move on a new structure. Deduplicated per
#                parcel and year so a foundation permit followed by the full
#                new-build permit counts once.
#   rehabs       Residential Rehab (1,014) + Addition (441). Structural work
#                that adds or restores habitable building.
#   alterations  Alteration (39,398). By far the largest category and the best
#                available proxy for "someone is spending money on this
#                building" — but it spans everything from a furnace swap to a
#                gut job, so it is reported on its own and never folded into
#                net. Read it as investment activity, not as structures gained.
#
# Left out entirely: New Revision / Alter Revision (bookkeeping on a permit
# already counted), Change of Use, Fire Repair, Correct Violation and friends
# (work on a building that already stands and keeps standing).
# ---------------------------------------------------------------------------

SOURCES = [
    {
        "key": "demolitions",
        "label": "Completed demolitions",
        "url": f"{ORG}/city_completed_demolitions/FeatureServer/0/query",
        "date_field": "demolition_date",
        "where": "demolition_date IS NOT NULL",
        "out_fields": "ObjectId,demolition_date,neighborhood,council_district",
    },
    {
        "key": "newbuilds",
        "label": "New construction permits",
        "url": f"{ORG}/bseed_building_permits/FeatureServer/0/query",
        "date_field": "issued_date",
        "where": "permit_type IN ('New', 'Foundation Only') AND issued_date IS NOT NULL",
        "out_fields": "ObjectId,issued_date,parcel_id,neighborhood,council_district",
        "dedupe": True,
    },
    {
        "key": "rehabs",
        "label": "Rehab and addition permits",
        "url": f"{ORG}/bseed_building_permits/FeatureServer/0/query",
        "date_field": "issued_date",
        "where": "permit_type IN ('Residential Rehab', 'Addition') AND issued_date IS NOT NULL",
        "out_fields": "ObjectId,issued_date,parcel_id,neighborhood,council_district",
        "dedupe": True,
    },
    {
        "key": "alterations",
        "label": "Alteration permits",
        "url": f"{ORG}/bseed_building_permits/FeatureServer/0/query",
        "date_field": "issued_date",
        "where": "permit_type = 'Alteration' AND issued_date IS NOT NULL",
        "out_fields": "ObjectId,issued_date,neighborhood,council_district",
    },
    {
        # A board-up is a demolition not taken: the city spent money holding a
        # building up instead of pulling it down.
        "key": "stabilizations",
        "label": "Completed property stabilizations",
        "url": f"{ORG}/city_completed_property_stabilizations/FeatureServer/0/query",
        "date_field": "board_up_work_completed_date",
        "where": "board_up_work_completed_date IS NOT NULL",
        "out_fields": "ObjectId,board_up_work_completed_date,neighborhood,council_district",
    },
]

# Detroit Land Bank disposals — the reinvestment pipeline. Four separate
# services, one metric: a property leaving the land bank into private hands.
DLBA_SERVICES = [
    "dlba_project_sales",
    "dlba_vacant_land_program_sales",
    "dlba_own_it_now_sales",
    "dlba_auction_sales",
]
for _svc in DLBA_SERVICES:
    SOURCES.append({
        "key": "landbank",
        "label": f"Land Bank sales ({_svc})",
        "cache": _svc,
        "url": f"{ORG}/{_svc}/FeatureServer/0/query",
        "date_field": "sale_closed_date",
        "where": "sale_closed_date IS NOT NULL",
        "out_fields": "ObjectId,sale_closed_date",
    })

# Improved parcels carry the denominator: num_buildings is the count of
# residential and commercial buildings standing on the parcel today.
PARCELS = {
    "url": f"{ORG}/parcel_file_current/FeatureServer/0/query",
    "where": "is_improved=1",
    "out_fields": "ObjectId,num_buildings,property_class",
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

# Rates computed on a handful of buildings swing wildly, so cells below this
# stock are shown but flagged, and kept out of the break calculations.
MIN_STOCK_FOR_RATE = 25

# Local equirectangular projection centred on Detroit. Across the city's ~31 km
# width the fixed cos(lat0) term is off by ~0.3%, far below the 800 m cell size.
LAT0 = 42.35
LON0 = -83.10
M_PER_DEG_LAT = 110574.0
M_PER_DEG_LON = 111320.0 * math.cos(math.radians(LAT0))

COUNT_KEYS = ["demolitions", "newbuilds", "rehabs", "alterations",
              "stabilizations", "landbank"]


# --------------------------------------------------------------------------
# fetching
# --------------------------------------------------------------------------

def get_json(url, params, retries=4):
    full = f"{url}?{urllib.parse.urlencode(params)}"
    delay = 2
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(full, headers={"User-Agent": "mapzimus-lab/1.0"})
            with urllib.request.urlopen(req, timeout=240) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            if attempt == retries:
                raise
            print(f"    retry {attempt + 1} after {exc}", file=sys.stderr)
            time.sleep(delay)
            delay *= 2
    raise RuntimeError("unreachable")


def page_through(url, base_params, name):
    """Page an ArcGIS query past its 1,000-record transfer limit."""
    features = []
    offset = 0
    while True:
        params = dict(base_params)
        params.update({
            "resultOffset": offset,
            "resultRecordCount": PAGE_SIZE,
            # Stable ordering, otherwise offset paging can skip or repeat rows.
            "orderByFields": "ObjectId ASC",
        })
        payload = get_json(url, params)
        if "error" in payload:
            raise RuntimeError(f"{name}: {payload['error']}")
        page = payload.get("features", [])
        features.extend(page)
        print(f"  {name}: {len(features)} features", end="\r", file=sys.stderr)
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return features


def cached(cache_path, refresh, build):
    if os.path.exists(cache_path) and not refresh:
        print(f"  cached  {os.path.relpath(cache_path, ROOT)}")
        with open(cache_path, encoding="utf-8") as fh:
            return json.load(fh)
    payload = build()
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    with open(cache_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh)
    return payload


def fetch_source(spec, refresh):
    name = spec.get("cache", spec["key"])
    path = os.path.join(RAW_DIR, f"{name}.geojson")

    def build():
        feats = page_through(spec["url"], {
            "where": spec["where"],
            "outFields": spec["out_fields"],
            "outSR": 4326,
            "f": "geojson",
        }, name)
        print(f"  {name}: {len(feats)} features -> data/raw/{name}.geojson")
        return {"type": "FeatureCollection", "features": feats}

    return cached(path, refresh, build)


def fetch_parcels(refresh):
    """Improved parcels as centroids — the polygons are ~10x the payload and
    the grid only ever needs a point to bin."""
    path = os.path.join(RAW_DIR, "parcels_improved.json")

    def build():
        feats = page_through(PARCELS["url"], {
            "where": PARCELS["where"],
            "outFields": PARCELS["out_fields"],
            "outSR": 4326,
            "f": "json",
            "returnGeometry": "false",
            "returnCentroid": "true",
        }, "parcels")
        print(f"  parcels: {len(feats)} improved parcels -> data/raw/parcels_improved.json")
        return {"features": feats}

    return cached(path, refresh, build)


def fetch_boundary(refresh):
    path = os.path.join(RAW_DIR, "detroit_boundary.geojson")

    def build():
        payload = get_json(BOUNDARY_URL, {
            "where": "STATE='26' AND BASENAME='Detroit'",
            "outFields": "GEOID,NAME",
            "outSR": 4326,
            "f": "geojson",
        })
        if not payload.get("features"):
            raise RuntimeError("boundary query returned no features")
        print("  boundary: 1 feature -> data/raw/detroit_boundary.geojson")
        return payload

    return cached(path, refresh, build)


# --------------------------------------------------------------------------
# geometry
# --------------------------------------------------------------------------

def to_xy(lon, lat):
    return (lon - LON0) * M_PER_DEG_LON, (lat - LAT0) * M_PER_DEG_LAT


def to_lonlat(x, y):
    return LON0 + x / M_PER_DEG_LON, LAT0 + y / M_PER_DEG_LAT


def rings_of(geometry):
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
                if x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
                    inside = not inside
    return inside


def axial_round(q, r):
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
    return axial_round((math.sqrt(3) / 3 * x - y / 3) / size, (2 / 3 * y) / size)


def axial_to_xy(q, r, size):
    return size * math.sqrt(3) * (q + r / 2), size * 1.5 * r


def hex_corners(cx, cy, size):
    ring = []
    for i in range(6):
        angle = math.radians(60 * i - 30)
        ring.append(to_lonlat(cx + size * math.cos(angle), cy + size * math.sin(angle)))
    ring.append(ring[0])
    return [[round(lon, 6), round(lat, 6)] for lon, lat in ring]


# --------------------------------------------------------------------------
# processing
# --------------------------------------------------------------------------

def year_of(raw_date):
    if isinstance(raw_date, str):
        return int(raw_date[:4]) if len(raw_date) >= 4 and raw_date[:4].isdigit() else None
    if isinstance(raw_date, (int, float)):
        return time.gmtime(raw_date / 1000).tm_year
    return None


def read_records(collection, spec):
    """(year, x, y, parcel_id, neighborhood, council_district) per usable record."""
    out, skipped, latest = [], 0, ""
    for feature in collection["features"]:
        geom = feature.get("geometry") or {}
        props = feature.get("properties") or {}
        coords = geom.get("coordinates") if geom.get("type") == "Point" else None
        raw_date = props.get(spec["date_field"])
        year = year_of(raw_date)
        if not coords or year is None:
            skipped += 1
            continue
        lon, lat = coords[0], coords[1]
        if lon is None or lat is None or (lon == 0 and lat == 0):
            skipped += 1
            continue
        if isinstance(raw_date, str) and raw_date > latest:
            latest = raw_date
        x, y = to_xy(lon, lat)
        out.append((year, x, y, props.get("parcel_id"),
                    props.get("neighborhood"), props.get("council_district")))
    return out, skipped, latest


def build_grid(rings, bbox, size):
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


def quantile_breaks(values, k):
    """k-1 interior quantile breaks, rounded to something a legend can print."""
    if not values:
        return []
    ordered = sorted(values)
    raw = [ordered[int(i / k * (len(ordered) - 1))] for i in range(1, k)]
    out = []
    for v in raw:
        if v >= 10:
            v = round(v)
        elif v >= 1:
            v = round(v * 2) / 2
        else:
            v = round(v, 1)
        if not out or v > out[-1]:
            out.append(v)
    return out


def classify(loss_rate, rebuild, demolitions, stock):
    """One label per cell for the whole window.

    rebuild counts structures added back (new builds + rehabs + stabilizations)
    against structures lost. The thresholds are deliberately coarse — this is a
    label to steer by, not a statistic.
    """
    if stock < MIN_STOCK_FOR_RATE and demolitions < 5:
        return "sparse"
    if demolitions == 0 and rebuild == 0:
        return "quiet"
    if demolitions == 0:
        return "rebuilding"
    ratio = rebuild / demolitions
    if loss_rate >= 25:
        return "gutted" if ratio < 0.25 else "churning"
    if loss_rate >= 10:
        return "thinning" if ratio < 0.5 else "churning"
    if ratio >= 1:
        return "rebuilding"
    return "holding"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true",
                        help="re-pull from the portal instead of using data/raw/")
    args = parser.parse_args()

    os.makedirs(RAW_DIR, exist_ok=True)
    os.makedirs(OUT_DIR, exist_ok=True)

    print("Fetching:")
    boundary = fetch_boundary(args.refresh)
    raw = [(spec, fetch_source(spec, args.refresh)) for spec in SOURCES]
    parcels = fetch_parcels(args.refresh)

    rings = rings_of(boundary["features"][0]["geometry"])
    xs = [p[0] for ring in rings for p in ring]
    ys = [p[1] for ring in rings for p in ring]
    bbox = (min(xs), min(ys), max(xs), max(ys))
    size = CELL_WIDTH_MILES * METERS_PER_MILE / math.sqrt(3)

    print(f"\nGrid: pointy-top hexes, {CELL_WIDTH_MILES} mi across flats "
          f"(circumradius {size:.0f} m)")

    grid = build_grid(rings, bbox, size)
    kept = set(grid)
    print(f"  {len(grid)} cells inside the city boundary")

    # ---- denominator: buildings standing today -----------------------------
    stock_now = defaultdict(int)
    parcel_count = defaultdict(int)
    parcels_outside = 0
    for feature in parcels["features"]:
        centroid = feature.get("centroid") or {}
        lon, lat = centroid.get("x"), centroid.get("y")
        if lon is None or lat is None:
            continue
        cell = xy_to_axial(*to_xy(lon, lat), size)
        if cell not in kept:
            parcels_outside += 1
            continue
        n = feature.get("attributes", {}).get("num_buildings")
        stock_now[cell] += int(n) if n else 1
        parcel_count[cell] += 1
    print(f"  building stock today: {sum(stock_now.values()):,} across "
          f"{sum(parcel_count.values()):,} improved parcels "
          f"({parcels_outside:,} parcels outside the clipped grid)")

    # ---- events ------------------------------------------------------------
    counts = defaultdict(lambda: defaultdict(int))   # cell -> "key_YYYY" -> n
    names = defaultdict(Counter)                     # cell -> neighborhood votes
    districts = defaultdict(Counter)
    coverage, outside, dropped = {}, Counter(), Counter()
    seen_dedupe = set()

    for spec, collection in raw:
        key = spec["key"]
        records, skipped, latest = read_records(collection, spec)
        dropped[key] += skipped
        if latest:
            coverage[key] = max(coverage.get(key, ""), latest)
        for year, x, y, parcel_id, hood, district in records:
            if spec.get("dedupe") and parcel_id:
                token = (key, parcel_id, year)
                if token in seen_dedupe:
                    continue
                seen_dedupe.add(token)
            cell = xy_to_axial(x, y, size)
            if cell not in kept:
                outside[key] += 1
                continue
            counts[cell][f"{key}_{year}"] += 1
            if hood:
                names[cell][hood] += 1
            if district:
                districts[cell][str(district)] += 1

    years_seen = defaultdict(set)
    for cell_counts in counts.values():
        for token in cell_counts:
            key, year = token.rsplit("_", 1)
            years_seen[key].add(int(year))
    # Land Bank sales reach back to 2012, but demolitions — the spine of this
    # map — start in 2014, and 2012/2013 carry 18 records between them. Anchor
    # the window to the demolition record so the slider has no dead stops.
    all_years = sorted(set().union(*years_seen.values()))
    first_year = min(years_seen["demolitions"]) if years_seen.get("demolitions") else all_years[0]
    years = [y for y in all_years if y >= first_year]
    trimmed = [y for y in all_years if y < first_year]

    if trimmed:
        print(f"\n  window starts {first_year} (demolition record); "
              f"dropped {', '.join(str(y) for y in trimmed)} from the slider")
    print("\nRecords by source:")
    for key in COUNT_KEYS:
        total = sum(n for c in counts.values() for k, n in c.items() if k.rsplit("_", 1)[0] == key)
        span = years_seen.get(key)
        span_txt = f"{min(span)}-{max(span)}" if span else "none"
        print(f"  {key:<15} {total:>7,}  {span_txt:<11} "
              f"({outside[key]:,} outside grid, {dropped[key]:,} unusable)")

    # ---- assemble ----------------------------------------------------------
    features = []
    totals = {y: Counter() for y in years}
    rate_pool = []
    trajectory_counts = Counter()

    for index, (q, r) in enumerate(sorted(grid)):
        cell = (q, r)
        cc = counts.get(cell, {})
        stock_today = stock_now.get(cell, 0)
        props = {
            "id": index,
            "neighborhood": names[cell].most_common(1)[0][0] if names[cell] else None,
            "district": districts[cell].most_common(1)[0][0] if districts[cell] else None,
            "parcels": parcel_count.get(cell, 0),
            "stock_now": stock_today,
        }

        per_year = {k: [cc.get(f"{k}_{y}", 0) for y in years] for k in COUNT_KEYS}

        # Walk the stock backwards from today: the buildings standing at the
        # start of year Y are today's, plus everything demolished since, minus
        # everything built since. Clamped at zero — the reconstruction is an
        # estimate, not an inventory.
        stock_at = [0] * len(years)
        running = stock_today
        for i in range(len(years) - 1, -1, -1):
            stock_at[i] = max(running + per_year["demolitions"][i] - per_year["newbuilds"][i], 0)
            running = stock_at[i]

        cum_demo = cum_new = cum_net = 0
        for i, year in enumerate(years):
            demolitions = per_year["demolitions"][i]
            newbuilds = per_year["newbuilds"][i]
            net = newbuilds - demolitions
            cum_demo += demolitions
            cum_new += newbuilds
            cum_net += net
            base = stock_at[i]
            props[f"demolitions_{year}"] = demolitions
            props[f"newbuilds_{year}"] = newbuilds
            props[f"rehabs_{year}"] = per_year["rehabs"][i]
            props[f"alterations_{year}"] = per_year["alterations"][i]
            props[f"stabilizations_{year}"] = per_year["stabilizations"][i]
            props[f"landbank_{year}"] = per_year["landbank"][i]
            props[f"net_{year}"] = net
            props[f"cumnet_{year}"] = cum_net
            props[f"cumdemo_{year}"] = cum_demo
            # Share of that year's standing stock demolished, in percent.
            props[f"lossrate_{year}"] = round(demolitions / base * 100, 2) if base else 0
            for key in COUNT_KEYS:
                totals[year][key] += per_year[key][i]

        stock_start = stock_at[0] if stock_at else stock_today
        loss_rate = round(cum_demo / stock_start * 100, 2) if stock_start else 0
        rebuild = cum_new + sum(per_year["rehabs"]) + sum(per_year["stabilizations"])
        props["total_demolitions"] = cum_demo
        props["total_newbuilds"] = cum_new
        props["total_rehabs"] = sum(per_year["rehabs"])
        props["total_alterations"] = sum(per_year["alterations"])
        props["total_stabilizations"] = sum(per_year["stabilizations"])
        props["total_landbank"] = sum(per_year["landbank"])
        props["stock_start"] = stock_start
        props["loss_rate"] = loss_rate
        props["rebuild_ratio"] = round(rebuild / cum_demo, 2) if cum_demo else None
        props["low_stock"] = stock_start < MIN_STOCK_FOR_RATE
        props["trajectory"] = classify(loss_rate, rebuild, cum_demo, stock_start)
        trajectory_counts[props["trajectory"]] += 1
        if not props["low_stock"]:
            rate_pool.append(loss_rate)

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
            "coverage": {k: {"first": min(years_seen[k]), "last": max(years_seen[k]),
                             "through": coverage.get(k)}
                         for k in COUNT_KEYS if years_seen.get(k)},
            "cell_width_miles": CELL_WIDTH_MILES,
            "min_stock_for_rate": MIN_STOCK_FOR_RATE,
            "citywide_totals": {str(y): dict(totals[y]) for y in years},
            "citywide_stock_now": sum(stock_now.values()),
            "loss_rate_breaks": quantile_breaks(rate_pool, 6),
            "trajectories": dict(trajectory_counts),
            "sources": {
                "demolitions": "City of Detroit Completed Demolitions (data.detroitmi.gov, rv44-e9di)",
                "newbuilds": "BSEED Building Permits — permit_type New, Foundation Only",
                "rehabs": "BSEED Building Permits — permit_type Residential Rehab, Addition",
                "alterations": "BSEED Building Permits — permit_type Alteration",
                "stabilizations": "City of Detroit Completed Property Stabilizations",
                "landbank": "Detroit Land Bank Authority sales (auction, own-it-now, project, vacant land)",
                "stock": "Parcels (Current) — improved parcels, num_buildings",
                "boundary": "US Census TIGERweb incorporated places",
            },
        },
        "features": features,
    }

    grid_path = os.path.join(OUT_DIR, "detroit-grid.geojson")
    with open(grid_path, "w", encoding="utf-8") as fh:
        json.dump(collection, fh, separators=(",", ":"))

    boundary_path = os.path.join(OUT_DIR, "detroit-boundary.geojson")
    with open(boundary_path, "w", encoding="utf-8") as fh:
        json.dump({"type": "FeatureCollection", "features": [{
            "type": "Feature",
            "properties": {"name": "Detroit"},
            "geometry": boundary["features"][0]["geometry"],
        }]}, fh, separators=(",", ":"))

    print(f"\nWrote {os.path.relpath(grid_path, ROOT)} "
          f"({len(features)} cells, {os.path.getsize(grid_path) / 1e6:.2f} MB)")
    print(f"Wrote {os.path.relpath(boundary_path, ROOT)}")
    print(f"\nloss-rate breaks (%% of stock): {collection['metadata']['loss_rate_breaks']}")
    print(f"trajectories: {dict(trajectory_counts)}")
    print("\nCitywide by year:")
    head = "  year " + "".join(f"{k[:7]:>9}" for k in COUNT_KEYS) + "      net"
    print(head)
    for year in years:
        t = totals[year]
        row = "".join(f"{t[k]:>9,}" for k in COUNT_KEYS)
        print(f"  {year} {row} {t['newbuilds'] - t['demolitions']:>8,}")


if __name__ == "__main__":
    main()
