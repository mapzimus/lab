"""Street supply per resident in Kinshasa, measured rather than asserted.

Chapter 4 says the road network carrying ten million people is largely the one
drawn for a city of one million. That was an impression from looking at the
map. This measures it: total street length inside each epoch's built footprint,
against the UN's population for that year, giving metres of street per person
over time.

The full network is 51,000 ways in this window, far too much geometry to ship
on a page with a 3 MB budget, so it is measured and thrown away. Only the
secondary and tertiary classes are kept as geometry, one level below the
primary roads 05_kinshasa_context.py already draws, which is enough to show
the grid without the file size.

Sources:
- OpenStreetMap (ODbL) -- (c) OpenStreetMap contributors, attributed on the
  page. Queried via Overpass.
- JRC GHS-BUILT-S R2023A for the per-epoch footprints (CC BY 4.0).
- UN World Urbanization Prospects 2025 for Kinshasa's population by year,
  read back out of the cities.geojson this pipeline already produced.

Outputs:
- data/kinshasa-streets.geojson — secondary and tertiary streets, simplified.
- data/kinshasa-streets.json — street km inside each epoch footprint, the
  matching population, and metres per person.
"""

import json
import time

import numpy as np
import rasterio
import requests
import osm2geojson
from rasterio.windows import from_bounds
from shapely.geometry import shape, mapping, box
from shapely.prepared import prep
from shapely import unary_union

from common import RAW_DIR, DATA_DIR, write_geojson, write_json

BBOX_STR = "-4.75,14.95,-3.95,15.80"   # south,west,north,east
BBOX = (14.95, -4.75, 15.80, -3.95)    # w,s,e,n — matching 04
EPOCHS = [1975, 1990, 2000, 2010, 2020, 2030]
BUILT_FRACTION = 0.20
DRAWN = ("secondary", "tertiary")
APIS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
# Everything a person could drive or walk a vehicle down. Excludes footpaths
# and tracks, which would flatter the network.
CLASSES = ("motorway", "trunk", "primary", "secondary", "tertiary",
           "residential", "unclassified", "living_street")


def overpass(query):
    last = None
    for api in APIS:
        try:
            r = requests.post(api, data={"data": query}, timeout=300)
            r.raise_for_status()
            return osm2geojson.json2geojson(r.json())
        except (requests.RequestException, ValueError) as e:
            print(f"  {api} failed ({e.__class__.__name__}), trying the next mirror")
            last = e
            time.sleep(3)
    raise last


def built_footprint(epoch):
    name = f"GHS_BUILT_S_E{epoch}_GLOBE_R2023A_4326_3ss_V1_0_R10_C20"
    with rasterio.open(f"zip://{RAW_DIR}/{name}.zip!/{name}.tif") as src:
        win = from_bounds(*BBOX, transform=src.transform)
        arr = src.read(1, window=win)
        t = src.window_transform(win)
    lat_mid = (BBOX[1] + BBOX[3]) / 2
    cell_km2 = (abs(t.a) * 111.32) * (abs(t.e) * 111.32 * np.cos(np.radians(lat_mid)))
    mask = arr >= BUILT_FRACTION * cell_km2 * 1e6
    rows, cols = np.nonzero(mask)
    # One box per built cell, unioned into the footprint polygon.
    cells = [box(t.c + c * t.a, t.f + (r + 1) * t.e, t.c + (c + 1) * t.a, t.f + r * t.e)
             for r, c in zip(rows, cols)]
    return unary_union(cells)


def km(geom):
    """Length of a lon/lat geometry in kilometres, locally planar."""
    lat_mid = (BBOX[1] + BBOX[3]) / 2
    kx = 111.32 * np.cos(np.radians(lat_mid))
    total = 0.0
    parts = getattr(geom, "geoms", [geom])
    for part in parts:
        c = np.asarray(part.coords)
        if len(c) < 2:
            continue
        dx = np.diff(c[:, 0]) * kx
        dy = np.diff(c[:, 1]) * 111.32
        total += float(np.sqrt(dx ** 2 + dy ** 2).sum())
    return total


def kinshasa_population():
    """Kinshasa's UN series, from the cities file this pipeline already wrote."""
    gj = json.load(open(DATA_DIR / "cities.geojson"))
    for f in gj["features"]:
        if (f["properties"].get("name") or "").startswith("Kinshasa"):
            return f["properties"]
    raise SystemExit("Kinshasa not found in cities.geojson; run 02_cities.py first")


def main():
    q = f"""[out:json][timeout:300];
way["highway"~"^({"|".join(CLASSES)})$"]({BBOX_STR});
out geom;"""
    print("  fetching the street network (this is the slow one)")
    gj = overpass(q)

    lines, drawn = [], {}
    for f in gj["features"]:
        g = shape(f["geometry"])
        if g.geom_type not in ("LineString", "MultiLineString"):
            continue
        cls = f["properties"].get("tags", {}).get("highway", "")
        lines.append(g)
        if cls in DRAWN:
            drawn.setdefault(cls, []).append(g)
    print(f"  {len(lines)} ways, {km(unary_union(lines)):.0f} km of street in the window")

    pop = kinshasa_population()
    rows = []
    for epoch in EPOCHS:
        fp = prep(built_footprint(epoch))
        inside = [g for g in lines if fp.intersects(g)]
        length = km(unary_union(inside)) if inside else 0.0
        key = f"p{epoch}"
        people_m = pop.get(key)
        row = {"epoch": epoch, "streetKm": round(length, 1)}
        if people_m:
            row["popM"] = people_m
            row["metresPerPerson"] = round(length * 1000 / (people_m * 1e6), 2)
        rows.append(row)
        note = f", {row['metresPerPerson']} m per person" if "metresPerPerson" in row else ""
        print(f"  {epoch}: {length:>7.0f} km inside the built footprint{note}")

    out = {
        "source": "OpenStreetMap (ODbL) street network measured inside JRC GHS-BUILT-S "
                  "footprints; population from UN World Urbanization Prospects 2025",
        "note": "OSM is a present-day snapshot. Street length is what exists today "
                "inside each epoch's built area, so the early years are an "
                "upper bound on what was there at the time.",
        "rows": rows,
    }
    write_json(DATA_DIR / "kinshasa-streets.json", out)

    features = []
    for cls in DRAWN:
        if cls not in drawn:
            continue
        merged = unary_union(drawn[cls]).simplify(0.00035, preserve_topology=True)
        features.append({"geometry": mapping(merged), "properties": {"kind": cls}})
    write_geojson(DATA_DIR / "kinshasa-streets.geojson", features, ndigits=4)


if __name__ == "__main__":
    main()
