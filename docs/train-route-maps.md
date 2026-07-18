# How to make maps like trainrouter.com

TrainRouter is an interactive world atlas of ~760 train routes: colored lines
on a fullscreen slippy map, filterable by category (high-speed / scenic /
night / classic), each line clickable for specs — distance, duration, top
speed, operator, rolling stock, opening year. Nothing about it requires a
server-side GIS stack; it is fundamentally **a GeoJSON dataset plus a
JavaScript map library**. This guide is the recipe, from the twelve-route demo
at `/lab/train-routes/` up to a full atlas.

## The anatomy

Every map in this family has the same four parts:

1. **A basemap** — raster tiles (OSM) or vector tiles (MapLibre style) that
   provide geographic context but stay visually quiet.
2. **Route geometry** — one `LineString` (or `MultiLineString`) per route,
   stored as GeoJSON in EPSG:4326 (`[longitude, latitude]`).
3. **Properties on each feature** — the specs. The map *is* the database:
   category drives color, everything else fills the popup and the sidebar.
4. **Interaction glue** — filter buttons toggle layers, click opens a popup,
   hover thickens the line, selecting a route dims the rest.

The lab demo implements all four in ~150 lines of vanilla JS with Leaflet.

## Getting route geometry

This is the only genuinely hard part, in rough order of effort:

- **Hand-drawn waypoints** (what the demo does). A polyline through the major
  stops. At world zoom it reads perfectly well; it only looks wrong when you
  zoom into a valley. Fastest way to get a v1 shipped, and how you should
  prototype any atlas.
- **Draw over a basemap** with [geojson.io](https://geojson.io) or QGIS —
  same idea, more fidelity, still manual.
- **OpenStreetMap route relations** — the real answer. OSM maps nearly every
  named rail service as a `type=route, route=train` relation (the Glacier
  Express is relation-tagged end to end). Pull one with Overpass:

  ```
  [out:json][timeout:60];
  rel["route"="train"]["name"="Glacier Express"];
  out geom;
  ```

  Overpass returns the member ways with coordinates; stitch them into a
  LineString (osmtogeojson does this for you). License note: OSM data is
  ODbL — attribute it and share derived *data* alike. TrainRouter's
  CC-BY exports suggest a curated mix of sources.
- **GTFS `shapes.txt`** — if the operator publishes a GTFS feed, the shapes
  file is exact track-following geometry, one point every few dozen meters.
- **National open-data rail networks** — e.g. US: BTS/FRA North American
  Rail Network; EU: RINF. Good for drawing the *network*, less good for
  named services.

Whatever the source, **simplify before shipping**: track-accurate geometry is
megabytes per long route. `turf.simplify` / `shapely.simplify` /
`mapshaper -simplify 10%` with a tolerance around 0.01° keeps world-zoom
shapes identical at a fraction of the size.

## Projection

Store and exchange in EPSG:4326; the browser map renders in Web Mercator
(EPSG:3857), which is fine for routes — lines don't suffer the area
distortion that makes Mercator wrong for choropleths. Only if you compute
distances (route length, average speed) do you need care: use geodesic math
(`turf.length`, PostGIS `geography`), never planar math on degrees.

## Rendering: Leaflet now, MapLibre at scale

- **Leaflet + raster OSM tiles** (the demo): trivial to set up, renders
  GeoJSON as SVG. Comfortable to roughly 50–100 routes / a few thousand
  vertices; beyond that the SVG DOM gets heavy.
- **MapLibre GL JS**: WebGL rendering, smooth with hundreds of routes, and
  data-driven styling replaces per-layer style code:

  ```js
  map.addSource("routes", { type: "geojson", data: "/routes.geojson" });
  map.addLayer({
    id: "routes", type: "line", source: "routes",
    paint: {
      "line-width": ["interpolate", ["linear"], ["zoom"], 2, 1.5, 8, 4],
      "line-color": ["match", ["get", "category"],
        "high-speed", "#ff6b4a", "scenic", "#2f9e44",
        "night", "#7455d9", "#c47f17"],
    },
  });
  map.setFilter("routes", ["==", ["get", "category"], "night"]);
  ```

- **At TrainRouter scale (762 routes, full geometry)**: don't ship one giant
  GeoJSON. Cut vector tiles with `tippecanoe`, output a single
  [PMTiles](https://protomaps.com/docs/pmtiles) file, and serve it as a
  static asset — Cloudflare Pages handles the HTTP range requests, no tile
  server needed. This pairs naturally with a Protomaps basemap, which would
  also remove the demo's one external dependency (OSM raster tiles) and its
  CSP carve-out.

## The product layer

What makes TrainRouter feel like a site rather than a map file:

- **Category + country indexes** — plain generated pages listing routes,
  each linking to the map with a route preselected (`/lab/train-routes/?route=slug`
  would be the natural extension of the demo).
- **Static fallback pages per route** — server-rendered HTML with the specs,
  for SEO and no-JS users. With this repo's build script, that's a loop over
  `routes.geojson` emitting pages from a template — the same trick
  `scripts/build.mjs` already does for tool categories.
- **Data exports** — the GeoJSON is already the export; add CSV/JSON dumps
  and a license line and you match TrainRouter's offer.

## Where the demo cuts corners

- Geometry is stop-to-stop straight lines, not track-following.
- Twelve routes, hand-curated; an atlas needs a data pipeline (Overpass →
  simplify → validate → GeoJSON) rather than a hand-edited file.
- Popups hold one fact set per route; real journey planning (city pairs,
  connections) is a graph problem on top of the same data.
