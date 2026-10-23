"""Glacier Express track geometry from OpenStreetMap, stitched end to end, with the bridge and
tunnel tags each way carries. Writes video/cache/route.json (not committed).

    python3 video/fetch_route.py

Relation 14616806 is "Glacier Express: St. Moritz => Zermatt"; the video runs it backwards,
Zermatt to St. Moritz, the way the train is usually described. Data © OpenStreetMap contributors, ODbL.
The main Overpass server drops connections from the cloud runner, so this uses the mail.ru mirror.
"""

from __future__ import annotations

import json
import math
import os
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
CACHE = HERE / "cache"
REL = 14616806
OVERPASS = "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
os.environ.setdefault("SSL_CERT_FILE", "/root/.ccr/ca-bundle.crt")


def fetch() -> dict:
    p = CACHE / "gx_geom.json"
    if not p.exists():
        q = f"[out:json][timeout:90];rel({REL});(._;>;);out body;"
        body = urllib.parse.urlencode({"data": q}).encode()
        p.write_bytes(urllib.request.urlopen(OVERPASS, body, timeout=120).read())
    return json.loads(p.read_text())


def hav(a, b):
    R = 6371008.8
    la1, la2 = math.radians(a[1]), math.radians(b[1])
    dla, dlo = la2 - la1, math.radians(b[0] - a[0])
    h = math.sin(dla / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlo / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def main():
    CACHE.mkdir(exist_ok=True)
    d = fetch()
    nodes = {e["id"]: (e["lon"], e["lat"]) for e in d["elements"] if e["type"] == "node"}
    names = {e["id"]: e.get("tags", {}).get("name") for e in d["elements"] if e["type"] == "node"}
    ways = {e["id"]: e for e in d["elements"] if e["type"] == "way"}
    rel = next(e for e in d["elements"] if e["type"] == "relation")

    # stitch the track ways in member order, flipping each so it starts where the last one ended
    seq = []
    for m in rel["members"]:
        if m["type"] == "way" and not m["role"] and m["ref"] in ways:
            w = ways[m["ref"]]
            t = w.get("tags", {})
            k = "tunnel" if t.get("tunnel") not in (None, "no") else "bridge" if t.get("bridge") not in (None, "no") else "track"
            seq.append((list(w["nodes"]), k))
    if seq[0][0][0] in (seq[1][0][0], seq[1][0][-1]):
        seq[0][0].reverse()
    pts, kind, gaps = list(seq[0][0]), [seq[0][1]] * (len(seq[0][0]) - 1), 0
    d2 = lambda a, b: (nodes[a][0] - nodes[b][0]) ** 2 + (nodes[a][1] - nodes[b][1]) ** 2
    for ids, k in seq[1:]:
        if ids[0] != pts[-1] and (ids[-1] == pts[-1] or d2(ids[-1], pts[-1]) < d2(ids[0], pts[-1])):
            ids = ids[::-1]
        if ids[0] == pts[-1]:
            ids = ids[1:]
        else:
            gaps += 1
            kind.append("track")
            pts.append(ids[0]); ids = ids[1:]
        for n in ids:
            kind.append(k); pts.append(n)

    coords = [nodes[n] for n in pts]
    coords.reverse(); kind.reverse()  # Zermatt -> St. Moritz
    km = [0.0]
    for a, b in zip(coords, coords[1:]):
        km.append(km[-1] + hav(a, b) / 1000)

    # runs of consecutive bridge / tunnel segments, each counted once
    runs = {"bridge": [], "tunnel": []}
    for i, k in enumerate(kind):
        if k in runs and (i == 0 or kind[i - 1] != k):
            runs[k].append([km[i], km[i]])
        if k in runs:
            runs[k][-1][1] = km[i + 1]

    # named viaducts and tunnels, located by their nodes' positions along the line
    idx = {n: i for i, n in enumerate(reversed(pts))}
    named = {}
    for w in ways.values():
        t = w.get("tags", {})
        k = "tunnel" if t.get("tunnel") not in (None, "no") else "bridge" if t.get("bridge") not in (None, "no") else None
        nm = t.get("tunnel:name") or t.get("bridge:name") or t.get("name")
        on = [idx[n] for n in w["nodes"] if n in idx]
        if k and nm and on:
            a, b = km[min(on)], km[max(on)]
            if nm in named:
                a, b = min(a, named[nm]["km0"]), max(b, named[nm]["km1"])
            named[nm] = {"name": nm, "kind": k, "km0": round(a, 2), "km1": round(b, 2)}

    stops = []
    for m in rel["members"]:
        if m["type"] == "node" and m["role"] == "stop":
            p = nodes.get(m["ref"])
            if p:
                i = min(range(len(coords)), key=lambda j: (coords[j][0] - p[0]) ** 2 + (coords[j][1] - p[1]) ** 2)
                stops.append({"name": names.get(m["ref"]), "km": round(km[i], 2), "lon": p[0], "lat": p[1]})
    stops.sort(key=lambda s: s["km"])

    out = {"coords": [[round(x, 6), round(y, 6)] for x, y in coords], "km": [round(k, 4) for k in km],
           "kind": kind, "bridges": runs["bridge"], "tunnels": runs["tunnel"], "stops": stops,
           "named": sorted(named.values(), key=lambda n: n["km0"])}
    (CACHE / "route.json").write_text(json.dumps(out))
    tl = sum(b - a for a, b in runs["tunnel"])
    print(f"{len(coords)} points, {km[-1]:.1f} km, {gaps} stitch gaps")
    print(f"{len(runs['bridge'])} bridges, {len(runs['tunnel'])} tunnels ({tl:.1f} km in tunnel)")
    for s in stops:
        print(f"  {s['km']:7.1f}  {s['name']}")
    for n in out["named"]:
        if n["km1"] - n["km0"] > 0.25:
            print(f"  {n['km0']:7.1f}-{n['km1']:.1f}  {n['kind']:6}  {n['name']}")


if __name__ == "__main__":
    main()
