"""Pull the drawn corridors back onto land.

Chapter 3 draws two schematic networks: a gravity model over the largest
African cities of 2050, and the curated Trans-African Highway plan. Both were
drawn as straight lines between endpoints, and around the Gulf of Guinea a
straight line is the sea. Twelve of the thirty-six modelled links crossed
water, Luanda to Lagos for 98.5% of its length, and the coverage test in
15_corridor_coverage.py was then dutifully measuring how many roads sit in the
Atlantic.

So this step reroutes any line that crosses open water along a land-constrained
shortest path: a 0.2 degree grid over Africa, cells kept where the land
polygons reach, eight-way Dijkstra with great-circle edge costs. The result is
still schematic. It is not an engineering alignment and it does not know about
terrain, borders or existing pavement. It only promises that a reader tracing
it with a finger stays on the continent.

The gravity scores are deliberately left on straight-line distance, which is
the textbook formulation of the model. What the routing adds is `routeKm` and
`detour`, the ratio of the land route to the straight line, and for the links
around the Gulf that ratio is the finding.

Inputs:  data/corridors-model.geojson, data/corridors-planned.geojson
Outputs: the same two files, with water-crossing geometry replaced, plus
         data/land-routes.json, the summary the page and the harness quote
Source:  Natural Earth 1:10m ocean (public domain), inverted to land
"""

import heapq
import io
import json
import math
import zipfile

import shapefile
import shapely
from shapely.geometry import shape, mapping, box, LineString, MultiLineString
from shapely import make_valid, unary_union

from common import RAW_DIR, DATA_DIR, write_geojson, write_json

# Wider than any corridor so a route is never squeezed by the edge of the grid.
WINDOW = box(-20.0, -36.5, 53.0, 38.0)
STEP = 0.2            # grid resolution in degrees, about 22 km
WATER_TOL = 0.02      # rewrite a line once more than 2% of it is over water
R = 6371.0


def ocean_geom():
    zf = zipfile.ZipFile(RAW_DIR / "ne_10m_ocean.zip")
    r = shapefile.Reader(shp=io.BytesIO(zf.read("ne_10m_ocean.shp")),
                         dbf=io.BytesIO(zf.read("ne_10m_ocean.dbf")),
                         shx=io.BytesIO(zf.read("ne_10m_ocean.shx")))
    # The world ocean is one enormous MultiPolygon that shapely reads as
    # invalid, so repair the parts that matter rather than dropping the lot.
    parts = []
    for sh in r.shapes():
        g = shape(sh.__geo_interface__)
        for p in (g.geoms if g.geom_type.startswith("Multi") else [g]):
            if p.intersects(WINDOW):
                parts.append(make_valid(p))
    return unary_union(parts).intersection(WINDOW)


def haversine_km(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(h))


class LandGrid:
    """Eight-way grid over the land cells of Africa."""

    def __init__(self, ocean):
        x0, y0, x1, y1 = WINDOW.bounds
        self.nx = int(round((x1 - x0) / STEP))
        self.ny = int(round((y1 - y0) / STEP))
        self.x0, self.y0 = x0, y0
        xs, ys = [], []
        for j in range(self.ny):
            for i in range(self.nx):
                xs.append(x0 + (i + 0.5) * STEP)
                ys.append(y0 + (j + 0.5) * STEP)
        wet = shapely.contains_xy(ocean, xs, ys)
        self.land = [not w for w in wet]
        self.xs, self.ys = xs, ys
        n = sum(self.land)
        print(f"  grid {self.nx}x{self.ny}, {n} land cells of {len(self.land)}")

    def idx(self, i, j):
        return j * self.nx + i

    def nearest_land(self, lon, lat):
        i0 = min(self.nx - 1, max(0, int((lon - self.x0) / STEP)))
        j0 = min(self.ny - 1, max(0, int((lat - self.y0) / STEP)))
        # Cities sit on the coast, so their own cell is often water; walk out.
        for ring in range(0, 12):
            best, bestd = None, 1e9
            for dj in range(-ring, ring + 1):
                for di in range(-ring, ring + 1):
                    if ring and max(abs(di), abs(dj)) != ring:
                        continue
                    i, j = i0 + di, j0 + dj
                    if not (0 <= i < self.nx and 0 <= j < self.ny):
                        continue
                    k = self.idx(i, j)
                    if not self.land[k]:
                        continue
                    d = haversine_km((lon, lat), (self.xs[k], self.ys[k]))
                    if d < bestd:
                        best, bestd = k, d
            if best is not None:
                return best
        raise SystemExit(f"no land cell within {12 * STEP} deg of {lon},{lat}")

    def route(self, start, goal):
        """Dijkstra with a great-circle heuristic, so in practice A*."""
        gx, gy = self.xs[goal], self.ys[goal]
        dist = {start: 0.0}
        prev = {}
        seen = set()
        pq = [(haversine_km((self.xs[start], self.ys[start]), (gx, gy)), start)]
        while pq:
            _, k = heapq.heappop(pq)
            if k in seen:
                continue
            seen.add(k)
            if k == goal:
                break
            i, j = k % self.nx, k // self.nx
            for dj in (-1, 0, 1):
                for di in (-1, 0, 1):
                    if not di and not dj:
                        continue
                    ni, nj = i + di, j + dj
                    if not (0 <= ni < self.nx and 0 <= nj < self.ny):
                        continue
                    nk = self.idx(ni, nj)
                    if not self.land[nk] or nk in seen:
                        continue
                    d = dist[k] + haversine_km((self.xs[k], self.ys[k]),
                                               (self.xs[nk], self.ys[nk]))
                    if d < dist.get(nk, 1e18):
                        dist[nk] = d
                        prev[nk] = k
                        heapq.heappush(
                            pq, (d + haversine_km((self.xs[nk], self.ys[nk]), (gx, gy)), nk))
        if goal not in dist:
            return None, None
        path, k = [], goal
        while k != start:
            path.append(k)
            k = prev[k]
        path.append(start)
        path.reverse()
        return [(self.xs[k], self.ys[k]) for k in path], dist[goal]


def water_fraction(geom, ocean):
    return geom.intersection(ocean).length / geom.length if geom.length else 0.0


def land_line(grid, a, b):
    """A land path between two lon/lat points, with the true ends kept."""
    pts, km = grid.route(grid.nearest_land(*a), grid.nearest_land(*b))
    if pts is None:
        return None, None
    line = LineString([tuple(a)] + pts + [tuple(b)])
    # The grid is a staircase and wants smoothing, but every degree of
    # tolerance is a corner cut across a bay: 0.08 keeps the residual over
    # water under 2% on every corridor while still dropping most of the steps.
    return line.simplify(0.08, preserve_topology=True), km


def reroute_model(grid, ocean):
    path = DATA_DIR / "corridors-model.geojson"
    gj = json.load(open(path))
    out, moved, rows = [], 0, []
    for f in gj["features"]:
        geom = shape(f["geometry"])
        props = dict(f["properties"])
        coords = list(geom.coords)
        a, b = coords[0], coords[-1]
        frac = water_fraction(geom, ocean)
        straight = haversine_km(a, b)
        if frac > WATER_TOL:
            line, km = land_line(grid, a, b)
            if line is None:
                raise SystemExit(f"no land route for {props['a']} to {props['b']}")
            geom = line
            props["routeKm"] = round(km)
            props["detour"] = round(km / straight, 2)
            moved += 1
            print(f"  rerouted {props['a']} - {props['b']}: {frac*100:.0f}% water, "
                  f"{straight:.0f} km direct becomes {km:.0f} km by land "
                  f"(x{km / straight:.2f})")
        else:
            props["routeKm"] = round(straight)
            props["detour"] = 1.0
        left = water_fraction(geom, ocean)
        if left > 0.06:
            raise SystemExit(f"{props['a']} to {props['b']} still {left*100:.0f}% over water")
        rows.append({"a": props["a"], "b": props["b"], "km": props["km"],
                     "routeKm": props["routeKm"], "detour": props["detour"],
                     "waterBefore": round(frac * 100, 1), "waterAfter": round(left * 100, 1)})
        out.append({"geometry": mapping(geom), "properties": props})
    write_geojson(path, out, ndigits=3)
    print(f"  {moved} of {len(out)} modelled links rerouted over land")
    return rows


def reroute_planned(grid, ocean):
    path = DATA_DIR / "corridors-planned.geojson"
    gj = json.load(open(path))
    out, moved = [], 0
    for f in gj["features"]:
        props = dict(f["properties"])
        geom = shape(f["geometry"])
        # Corridors carrying a real OSM alignment are already on the ground.
        if props.get("real") or geom.geom_type != "LineString":
            out.append({"geometry": mapping(geom), "properties": props})
            continue
        if water_fraction(geom, ocean) <= WATER_TOL:
            out.append({"geometry": mapping(geom), "properties": props})
            continue
        # Route waypoint to waypoint so the curated stops are still visited.
        pts = list(geom.coords)
        chain = [pts[0]]
        for a, b in zip(pts, pts[1:]):
            seg = LineString([a, b])
            if water_fraction(seg, ocean) <= WATER_TOL:
                chain.append(b)
                continue
            line, _ = land_line(grid, a, b)
            if line is None:
                raise SystemExit(f"no land route for {props['name']}")
            chain.extend(list(line.coords)[1:])
        geom = LineString(chain)
        moved += 1
        left = water_fraction(geom, ocean)
        print(f"  rerouted {props['name']}, {left*100:.1f}% water left")
        out.append({"geometry": mapping(geom), "properties": props})
    write_geojson(path, out, ndigits=3)
    print(f"  {moved} planned corridors pulled onto land")
    return moved


if __name__ == "__main__":
    print("  reading Natural Earth ocean")
    ocean = ocean_geom()
    grid = LandGrid(ocean)
    rows = reroute_model(grid, ocean)
    planned = reroute_planned(grid, ocean)
    before = max(rows, key=lambda r: r["waterBefore"])
    after = max(rows, key=lambda r: r["waterAfter"])
    write_json(DATA_DIR / "land-routes.json", {
        "source": "Natural Earth 1:10m ocean (public domain), inverted to land",
        "method": f"{STEP} degree grid over Africa, cells kept where land reaches, "
                  "eight-way shortest path with great-circle edge costs. Schematic: "
                  "it knows nothing of terrain, borders or existing pavement, only "
                  "that the line stays on the continent.",
        "modelLinks": len(rows),
        "rerouted": sum(1 for r in rows if r["detour"] > 1.0),
        "plannedRerouted": planned,
        "worstBefore": {"a": before["a"], "b": before["b"], "pct": before["waterBefore"]},
        "worstAfter": {"a": after["a"], "b": after["b"], "pct": after["waterAfter"]},
        "longestDetour": max(rows, key=lambda r: r["detour"]),
        "rows": rows,
    })
    print(f"  worst crossing was {before['a']} to {before['b']} at "
          f"{before['waterBefore']}% water, now {after['waterAfter']}% at worst")
