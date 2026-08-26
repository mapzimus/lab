"""Kinshasa-Brazzaville context layers from OpenStreetMap via Overpass.

Source: OpenStreetMap (ODbL) — © OpenStreetMap contributors, attributed on
the page. Queried via https://overpass-api.de/api/interpreter.

Outputs:
- data/kinshasa-water.geojson — Congo River / Pool Malebo polygons (>0.5 km^2)
- data/kinshasa-roads.geojson — motorway/trunk/primary ways, merged per class
"""

import time

import requests
import osm2geojson
from shapely.geometry import shape, mapping
from shapely import unary_union

from common import DATA_DIR, write_geojson

BBOX = "-4.75,14.95,-3.95,15.80"  # south,west,north,east
APIS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]


def overpass(query):
    last = None
    for api in APIS:
        try:
            r = requests.post(api, data={"data": query}, timeout=180)
            r.raise_for_status()
            return osm2geojson.json2geojson(r.json())
        except requests.RequestException as e:
            last = e
    raise last


def water():
    q = f"""[out:json][timeout:120];
(
  nwr["natural"="water"]({BBOX});
  way["waterway"="riverbank"]({BBOX});
);
out geom;"""
    gj = overpass(q)
    polys = []
    for f in gj["features"]:
        g = shape(f["geometry"])
        if g.geom_type not in ("Polygon", "MultiPolygon"):
            continue
        if g.area * 111.32 * 111.32 < 0.5:  # km^2-ish at the equator
            continue
        polys.append(g.buffer(0))
    merged = unary_union(polys).simplify(0.0008, preserve_topology=True)
    write_geojson(DATA_DIR / "kinshasa-water.geojson",
                  [{"geometry": mapping(merged), "properties": {"kind": "water"}}], ndigits=4)


def roads():
    q = f"""[out:json][timeout:120];
way["highway"~"^(motorway|trunk|primary)$"]({BBOX});
out geom;"""
    gj = overpass(q)
    by_class = {}
    for f in gj["features"]:
        g = shape(f["geometry"])
        if g.geom_type not in ("LineString", "MultiLineString"):
            continue
        cls = f["properties"].get("tags", {}).get("highway", "primary")
        cls = "major" if cls in ("motorway", "trunk") else "primary"
        by_class.setdefault(cls, []).append(g)
    features = []
    for cls, geoms in by_class.items():
        merged = unary_union(geoms).simplify(0.0004, preserve_topology=True)
        features.append({"geometry": mapping(merged), "properties": {"kind": cls}})
    write_geojson(DATA_DIR / "kinshasa-roads.geojson", features, ndigits=4)


if __name__ == "__main__":
    water()
    time.sleep(3)  # be polite to the shared Overpass service
    roads()
