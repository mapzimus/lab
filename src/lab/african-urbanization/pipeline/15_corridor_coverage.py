"""Does the road network already serve the corridors the model demands?

Chapter 3 draws a gravity model over the top African cities of 2050. On its
own that is a formula drawing lines, and the chapter could only label it a
sketch. This tests it: for every modelled link, how much of the route already
has a mapped primary road within about 25 km?

Two things fall out. The model's own top link by a wide margin is Cairo to
Alexandria, which is fully served, so a model whose highest-demand output is a
corridor Egypt actually built is not producing noise. And the links that score
low are the chapter's real claim: demand the network does not meet.

Natural Earth's 1:10m network was tried first and rejected. It is generalised,
so it reported Lagos to Onitsha as 22 percent served where OSM says 75. A
coarse basemap layer produces confidently wrong coverage numbers.

Source: OpenStreetMap (ODbL), (c) OpenStreetMap contributors, via Overpass.
Responses are cached under RAW_DIR so a rerun costs nothing.

Outputs:
- data/corridors-model.geojson  — each link gains a `served` percentage
- data/corridor-coverage.json   — the summary the page and method page quote
"""

import hashlib
import json
import time

import requests
import osm2geojson
from shapely.geometry import shape
from shapely import unary_union

from common import RAW_DIR, DATA_DIR, write_geojson, write_json

APIS = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
BUFFER_DEG = 0.22     # ~24 km either side: the query window around a link
# The threshold has to be the window, not wider than it. At 0.25 a road sitting
# 0.24 degrees off the route counted as serving but was never fetched, so the
# measurement quietly undercounted in a band it could not see.
NEAR_DEG = BUFFER_DEG
SAMPLES = 40          # points along each link
WELL_SERVED = 80      # percent, the threshold the copy quotes
CACHE = RAW_DIR / "corridor-osm"


def overpass(query, cache_key):
    CACHE.mkdir(parents=True, exist_ok=True)
    cached = CACHE / f"{cache_key}.json"
    if cached.exists() and cached.stat().st_size > 0:
        return json.load(open(cached))
    # The public mirrors rate-limit and throw 502s under load. Rotating once
    # is not enough for 36 sequential queries; back off and come back.
    last = None
    for attempt in range(5):
        for api in APIS:
            try:
                r = requests.post(api, data={"data": query}, timeout=240)
                r.raise_for_status()
                payload = r.json()
                tmp = cached.with_suffix(".part")
                json.dump(payload, open(tmp, "w"))
                tmp.rename(cached)
                return payload
            except (requests.RequestException, ValueError) as e:
                last = e
        wait = 15 * 2 ** attempt
        print(f"      all mirrors busy, waiting {wait}s before retry {attempt + 2}")
        time.sleep(wait)
    raise last


def main():
    path = DATA_DIR / "corridors-model.geojson"
    gj = json.load(open(path))
    links = [(f["properties"], shape(f["geometry"])) for f in gj["features"]]
    links.sort(key=lambda x: -x[0]["score"])

    rows = []
    for i, (props, geom) in enumerate(links, 1):
        poly = geom.buffer(BUFFER_DEG).simplify(0.05)
        ring = " ".join(f"{lat:.3f} {lon:.3f}" for lon, lat in poly.exterior.coords)
        query = (f'[out:json][timeout:180];'
                 f'way["highway"~"^(motorway|trunk|primary)$"](poly:"{ring}");out geom;')
        # The cache key carries the query, not just the city pair. 18_land_routes
        # moves a corridor's geometry, and a pair-keyed cache would then answer
        # with the roads around the line the corridor used to follow.
        pair = f"{props['a']}__{props['b']}".replace("/", "-").replace(" ", "_")
        key = f"{pair}__{hashlib.sha256(query.encode()).hexdigest()[:10]}"
        raw = overpass(query, key)
        feats = osm2geojson.json2geojson(raw)["features"]
        lines = [shape(f["geometry"]) for f in feats
                 if f["geometry"]["type"].endswith("LineString")]
        if lines:
            net = unary_union(lines)
            pts = [geom.interpolate(j / (SAMPLES - 1), normalized=True) for j in range(SAMPLES)]
            served = round(sum(1 for p in pts if net.distance(p) <= NEAR_DEG) / SAMPLES * 100)
        else:
            served = 0
        props["served"] = served
        rows.append({"a": props["a"], "b": props["b"], "km": props["km"],
                     "score": props["score"], "served": served})
        print(f"  {i:>2}/{len(links)}  {props['a']} - {props['b']:<22} "
              f"{props['km']:>5} km  score {props['score']:>8}  served {served:>3}%")
        time.sleep(1)

    write_geojson(path, [{"geometry": g.__geo_interface__, "properties": p}
                         for p, g in links], ndigits=3)

    well = [r for r in rows if r["served"] >= WELL_SERVED]
    top = rows[0]
    out = {
        "source": "OpenStreetMap (ODbL) motorway, trunk and primary ways within "
                  f"about {round(NEAR_DEG * 111)} km of each modelled corridor",
        "method": f"{SAMPLES} points sampled along each link; a point counts as served "
                  "when a mapped primary route passes within that distance. This "
                  "measures whether a route exists, not its condition or capacity.",
        "links": len(rows),
        "wellServedThreshold": WELL_SERVED,
        "wellServed": len(well),
        "medianServed": sorted(r["served"] for r in rows)[len(rows) // 2],
        "topLink": {"a": top["a"], "b": top["b"], "score": top["score"],
                    "served": top["served"]},
        "rows": rows,
    }
    write_json(DATA_DIR / "corridor-coverage.json", out)

    print(f"\n  {len(well)} of {len(rows)} modelled corridors are at least "
          f"{WELL_SERVED}% served by a mapped primary road")
    print(f"  median coverage {out['medianServed']}%")
    print(f"  highest-demand link {top['a']} to {top['b']} "
          f"(score {top['score']}): {top['served']}% served")


if __name__ == "__main__":
    main()
