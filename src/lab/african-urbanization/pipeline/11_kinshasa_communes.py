"""The communes of Kinshasa and Brazzaville, so the city reads as a place.

Chapter 4 zooms into a footprint that most readers cannot name any part of.
These are the administrative units people actually use: Gombe is the colonial
core on the river, Masina and Kimbanseke are the vast self-built east, Ngaliema
climbs the western hills. Naming them turns the density surface from a blob
into a map of somewhere.

Source: OpenStreetMap (ODbL) — (c) OpenStreetMap contributors, attributed on
the page. Queried via Overpass, admin_level 7 (commune / arrondissement).

Output:
- data/kinshasa-communes.geojson — simplified boundaries with a name and a
  label point per unit, plus which side of the river it sits on.
"""

import time

import requests
import osm2geojson
from shapely.geometry import shape, mapping

from common import DATA_DIR, write_geojson

BBOX = "-4.75,14.95,-3.95,15.80"  # south,west,north,east — matching 05
APIS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
# Below this a unit is too small to carry a label at the chapter's zoom.
MIN_KM2 = 1.5
# Brazzaville sits north of the Pool; Kinshasa south. The river runs close to
# this latitude through the window, which is enough to tag the two sides.
RIVER_LAT = -4.28


def overpass(query):
    last = None
    for api in APIS:
        try:
            r = requests.post(api, data={"data": query}, timeout=240)
            r.raise_for_status()
            return osm2geojson.json2geojson(r.json())
        except (requests.RequestException, ValueError) as e:
            print(f"  {api} failed ({e.__class__.__name__}), trying the next mirror")
            last = e
            time.sleep(2)
    raise last


def main():
    q = f"""[out:json][timeout:240];
rel["boundary"="administrative"]["admin_level"="7"]({BBOX});
out geom;"""
    gj = overpass(q)

    features = []
    for f in gj["features"]:
        tags = f["properties"].get("tags", {})
        name = tags.get("name")
        if not name:
            continue
        g = shape(f["geometry"]).buffer(0)
        if g.geom_type not in ("Polygon", "MultiPolygon") or g.is_empty:
            continue
        km2 = g.area * 111.32 * 111.32
        if km2 < MIN_KM2:
            continue
        simple = g.simplify(0.0009, preserve_topology=True)
        if simple.is_empty:
            simple = g
        # Label the largest part's representative point, so the name lands
        # inside the commune rather than on a centroid out in the river.
        biggest = max(getattr(g, "geoms", [g]), key=lambda p: p.area)
        pt = biggest.representative_point()
        features.append({
            "geometry": mapping(simple),
            "properties": {
                "name": name,
                "km2": round(km2, 1),
                "side": "north" if pt.y > RIVER_LAT else "south",
                "lon": round(pt.x, 4),
                "lat": round(pt.y, 4),
            },
        })

    features.sort(key=lambda f: -f["properties"]["km2"])
    write_geojson(DATA_DIR / "kinshasa-communes.geojson", features, ndigits=4)
    south = [f for f in features if f["properties"]["side"] == "south"]
    print(f"  {len(features)} units ({len(south)} south of the Pool, "
          f"{len(features) - len(south)} north)")
    for f in features[:8]:
        p = f["properties"]
        print(f"    {p['name']:<22} {p['km2']:>7} km2  {p['side']}")


if __name__ == "__main__":
    main()
