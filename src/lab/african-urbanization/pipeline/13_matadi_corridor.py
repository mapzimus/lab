"""Kinshasa's one link to the sea.

The city is 350 km inland on a river that is not navigable to the ocean: the
Livingstone Falls sit between the Pool and the estuary, which is why the
colonial railway was cut in the first place. Everything imported for a city
heading toward tens of millions arrives at Matadi and travels one road and one
railway to get here.

This pulls both alignments from OSM so chapter 4 can end by widening out from
the city to the single thread feeding it.

Source: OpenStreetMap (ODbL) -- (c) OpenStreetMap contributors, attributed on
the page. Queried via Overpass.

Output:
- data/matadi-corridor.geojson — the road and the railway as separate
  features, plus the three anchor places as points.
"""

import time

import requests
import osm2geojson
from shapely.geometry import shape, mapping, LineString
from shapely.ops import linemerge
from shapely import unary_union

from common import DATA_DIR, write_geojson

APIS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
# Kinshasa -> Matadi -> the Atlantic at Muanda. The spine the corridor follows.
SPINE = [(15.31, -4.32), (14.60, -4.85), (13.45, -5.82), (12.35, -5.95)]
PLACES = [
    ("Kinshasa", 15.31, -4.32, "capital, 17 million people"),
    ("Matadi", 13.45, -5.82, "the port, 350 km inland from the city"),
    ("Muanda", 12.35, -5.95, "the Atlantic"),
]
MIN_PART_KM = 20


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


def corridor_poly(buffer_deg=0.28):
    poly = LineString(SPINE).buffer(buffer_deg).simplify(0.05)
    return " ".join(f"{lat:.3f} {lon:.3f}" for lon, lat in poly.exterior.coords)


def stitch(gj, min_km=MIN_PART_KM):
    lines = [shape(f["geometry"]) for f in gj["features"]
             if f["geometry"]["type"] in ("LineString", "MultiLineString")]
    if not lines:
        return None, 0.0
    merged = linemerge(unary_union(lines))
    parts = [merged] if merged.geom_type == "LineString" else list(merged.geoms)
    # Sidings, spurs and slip roads merge short; the through route is long.
    parts = [p for p in parts if p.length * 111 >= min_km]
    if not parts:
        return None, 0.0
    joined = unary_union(parts)
    return joined.simplify(0.004, preserve_topology=True), joined.length * 111


def main():
    poly = corridor_poly()
    features = []

    print("  road: the N1 between Kinshasa and the coast")
    road = overpass(f'[out:json][timeout:300];'
                    f'way["highway"~"^(motorway|trunk|primary)$"](poly:"{poly}");out geom;')
    geom, length = stitch(road)
    if geom:
        features.append({"geometry": mapping(geom),
                         "properties": {"kind": "road", "name": "Route Nationale 1",
                                        "km": round(length)}})
        print(f"    {length:.0f} km of trunk road stitched")

    time.sleep(3)
    print("  rail: the Matadi-Kinshasa railway")
    rail = overpass(f'[out:json][timeout:300];'
                    f'way["railway"="rail"](poly:"{poly}");out geom;')
    geom, length = stitch(rail)
    if geom:
        features.append({"geometry": mapping(geom),
                         "properties": {"kind": "rail", "name": "Matadi-Kinshasa railway",
                                        "km": round(length)}})
        print(f"    {length:.0f} km of railway stitched")

    for name, lon, lat, note in PLACES:
        features.append({"geometry": {"type": "Point", "coordinates": [lon, lat]},
                         "properties": {"kind": "place", "name": name, "note": note}})

    write_geojson(DATA_DIR / "matadi-corridor.geojson", features, ndigits=3)


if __name__ == "__main__":
    main()
