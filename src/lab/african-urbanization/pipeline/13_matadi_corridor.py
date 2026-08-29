"""Kinshasa's one link to the sea.

The city is 350 km inland on a river that is not navigable to the ocean: the
Livingstone Falls sit between the Pool and the estuary, which is why the
colonial railway was cut in the first place. Everything imported for a city
heading toward tens of millions arrives at Matadi and travels one road and one
railway to get here.

This pulls both alignments from OSM so chapter 4 can end by widening out from
the city to the single thread feeding it.

It also pulls the water, which the step cannot work without. The frame is
called "one road to the sea" and the first version drew no sea at all: the
Atlantic was the same black as the land, so the road simply stopped in the
dark and the label "the Atlantic" floated over nothing. The ocean polygon and
the Congo below the Pool are what make the geography legible, and the river is
the argument too, because it is the thing right beside the road that cannot be
used.

Sources:
- OpenStreetMap (ODbL) -- (c) OpenStreetMap contributors, attributed on the
  page. Queried via Overpass.
- Natural Earth 1:10m ocean polygon (public domain).

Output:
- data/matadi-corridor.geojson — the road, the railway, the ocean and the
  river as separate features, plus the three anchor places as points.
"""

import json
import math
import time
import zipfile

import requests
import shapefile
import osm2geojson
from shapely.geometry import shape, mapping, LineString, box
from shapely.ops import linemerge
from shapely.validation import make_valid
from shapely import unary_union

from common import RAW_DIR, DATA_DIR, write_geojson

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
CACHE = RAW_DIR / "matadi-osm"
# The camera window for this step, a little wider than the spine so the coast
# and the estuary both have room.
WINDOW = box(12.05, -6.35, 15.95, -3.95)


def overpass(query, cache_key):
    """Cached, with backoff. The mirrors 504 on the water query under load, and
    one pass through them was enough to lose a whole run including the ocean,
    which needs no network at all."""
    CACHE.mkdir(parents=True, exist_ok=True)
    cached = CACHE / f"{cache_key}.json"
    if cached.exists() and cached.stat().st_size > 0:
        return osm2geojson.json2geojson(json.load(open(cached)))
    last = None
    for attempt in range(5):
        for api in APIS:
            try:
                r = requests.post(api, data={"data": query}, timeout=600)
                r.raise_for_status()
                payload = r.json()
                tmp = cached.with_suffix(".part")
                json.dump(payload, open(tmp, "w"))
                tmp.rename(cached)
                return osm2geojson.json2geojson(payload)
            except (requests.RequestException, ValueError) as e:
                last = e
        wait = 20 * 2 ** attempt
        print(f"      mirrors busy, waiting {wait}s before retry {attempt + 2}")
        time.sleep(wait)
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


def polygons_only(geom):
    """Drop stray lines and points from a clip.

    Intersecting a coastline with a box returns a GeometryCollection whenever
    the boundary grazes the window, and a collection has no `coordinates` key,
    so write_geojson dies on it.
    """
    parts = [g for g in getattr(geom, "geoms", [geom])
             if g.geom_type in ("Polygon", "MultiPolygon")]
    return unary_union(parts) if parts else geom


def ocean():
    """Natural Earth's ocean polygon, clipped to the step's window.

    Natural Earth ships the world ocean as one MultiPolygon that shapely reads
    as invalid, so a plain `if g.is_valid` filter throws the entire layer away
    and returns an empty sea. Take the parts that actually touch the window,
    repair those, and leave the rest of the planet alone.
    """
    with zipfile.ZipFile(RAW_DIR / "ne_10m_ocean.zip") as z:
        names = {p.rsplit(".", 1)[-1]: p for p in z.namelist()
                 if p.endswith((".shp", ".dbf", ".shx"))}
        r = shapefile.Reader(shp=z.open(names["shp"]), dbf=z.open(names["dbf"]),
                             shx=z.open(names["shx"]))
        geoms = [shape(s.__geo_interface__) for s in r.shapes()]
    parts = [part for g in geoms for part in getattr(g, "geoms", [g])]
    near = [p for p in parts
            if not any(math.isnan(v) for v in p.bounds) and p.intersects(WINDOW)]
    if not near:
        raise SystemExit("no ocean in the window; check ne_10m_ocean.zip")
    repaired = [p if p.is_valid else make_valid(p) for p in near]
    sea = polygons_only(unary_union(repaired).intersection(WINDOW))
    if sea.is_empty:
        raise SystemExit("ocean clip came back empty")
    # 10m coastline carries far more vertices than a 400 km view can show.
    return sea.simplify(0.002, preserve_topology=True)


def river(poly):
    """The Congo below the Pool, as surface water rather than a centreline.

    The estuary is kilometres wide and the stretch through the Falls is not,
    so drawing a single-width line would misrepresent both ends. Riverbank and
    water polygons give the real shape; the centreline fills the gaps where OSM
    has no polygon.
    """
    gj = overpass(f'[out:json][timeout:600];'
                  f'('
                  f'way["natural"="water"](poly:"{poly}");'
                  f'way["waterway"="riverbank"](poly:"{poly}");'
                  f'relation["natural"="water"](poly:"{poly}");'
                  f');out geom;', "water")
    polys = []
    for f in gj["features"]:
        try:
            g = shape(f["geometry"])
        except (ValueError, AttributeError):
            continue
        if g.geom_type in ("Polygon", "MultiPolygon") and g.is_valid:
            polys.append(g)
    if not polys:
        return None
    merged = polygons_only(unary_union(polys).intersection(WINDOW))
    # Anything smaller than a few square kilometres is a pond, not the Congo.
    parts = [g for g in getattr(merged, "geoms", [merged])
             if g.area * 111 * 111 > 3.0]
    if not parts:
        return None
    return unary_union(parts).simplify(0.002, preserve_topology=True)


def main():
    poly = corridor_poly()
    features = []

    print("  sea: the Atlantic and the estuary")
    sea = ocean()
    features.append({"geometry": mapping(sea),
                     "properties": {"kind": "ocean", "name": "Atlantic Ocean"}})
    print(f"    {sea.area * 111 * 111:.0f} km2 of ocean inside the window")

    print("  water: the Congo below the Pool")
    try:
        rv = river(poly)
    except Exception as e:
        print(f"    river query failed ({e.__class__.__name__}); "
              f"writing the corridor without it, rerun to add it")
        rv = None
    if rv:
        features.append({"geometry": mapping(rv),
                         "properties": {"kind": "river", "name": "Congo River"}})
        print(f"    {rv.area * 111 * 111:.0f} km2 of river surface")
    time.sleep(3)

    print("  road: the N1 between Kinshasa and the coast")
    road = overpass(f'[out:json][timeout:600];'
                    f'way["highway"~"^(motorway|trunk|primary)$"](poly:"{poly}");out geom;',
                    "road")
    geom, length = stitch(road)
    if geom:
        features.append({"geometry": mapping(geom),
                         "properties": {"kind": "road", "name": "Route Nationale 1",
                                        "km": round(length)}})
        print(f"    {length:.0f} km of trunk road stitched")

    time.sleep(3)
    print("  rail: the Matadi-Kinshasa railway")
    rail = overpass(f'[out:json][timeout:600];'
                    f'way["railway"="rail"](poly:"{poly}");out geom;', "rail")
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
