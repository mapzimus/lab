# Orbit to Street

One three.js scene, drawn to scale, from 40,000 km out down to Boston and Lynn
rooftops. It joins the [Population Relief Globe](../population-globe/) and the
[Boston Massing Model](../boston-massing/) into a single camera that never cuts.

- **Globe.** 105,700 population cells (GHS-POP, 1975–2030) stand as bars. Below
  about 7,000 km they shrink, and below 200 km they fade into a density tint on
  the land.
- **Cities.** Under 50 km, Boston's 15,116 buildings and tower parts and Lynn's
  14,141 buildings rise to their heights. Lynn covers Lynn English High School,
  downtown and Lynn Harbor.
- **Sun.** A sun clock sets the subsolar point from the date and time (standard
  low-precision solar formulas). The same light draws the day/night line,
  ocean glint, night lights, sky color, building shadows and lit windows.
- **Altitude ladder.** A log-scale rail from 100 m to 40,000 km, with GPS, the
  Space Station, the edge of space, airliner height and the tallest tower marked.

## How the scale works

World space is metres in Boston's local frame: x east, y up, z south, origin on
the ground. The Earth is a group whose centre sits one Earth radius below that
origin, rotated so Boston is at its top. Each city is modelled in its own flat
local frame and placed on the sphere at its centre point, tilted to that spot's
horizon (Lynn sits 15 km away and 18 m "lower" than Boston's tangent plane).
Because the street-level geometry never involves numbers near 6.4 million, it
stays steady on the GPU; a logarithmic depth buffer covers the 0.5 m to
4 billion m range.

## Data

| File | What | Source |
|---|---|---|
| `/lab/population-globe/data/density.json` | 2025 density grid | shared with the Population Relief Globe |
| `/lab/population-globe/data/places.json` | cities, coastlines, borders | shared, Natural Earth |
| `data/timeline.json` | 1975–2020 and 2030 epochs for cells that changed | GHS-POP R2023A, same 0.25° grid |
| `data/lights.json` | night light per cell (2016) and urban shares | NASA Black Marble 2016, GHSL Degree of Urbanisation |
| `data/boston.json` | Boston buildings, roads, parks, water, bridges, Zakim towers | OpenStreetMap; newer cut than `boston-massing` |
| `data/lynn.json` | Lynn buildings, roads, parks, water | OpenStreetMap via `pipeline/prep_lynn.py` |

`pipeline/prep_lynn.py` downloads three Overpass queries into `pipeline/raw/`
(ignored by git) and writes `data/lynn.json`. Lynn has almost no height tags:
26 buildings have a floor count and the rest use a typical height for their type
(houses 9 m, schools 12 m). The building tooltip says which.

Footprints and heights © OpenStreetMap contributors, ODbL.
