# Boston Massing Model

Downtown Boston, Back Bay to Charlestown, as a 3D massing model. Every
OpenStreetMap building is extruded to its recorded height; towers that mappers
split into `building:part`s (Prudential Center, Millennium Tower, the Hancock)
are built from those parts instead of the plain outline. Streets, parks, the
Charles River Basin and the harbor are drawn on the ground plane. Mapped
bridge decks (`man_made=bridge`) are raised to `layer` × 7 m and roads tagged
as bridges ride at that height.

The Zakim Bridge's deck is mapped but its towers and cables are not, so they
are added from published dimensions: two inverted-Y towers (north 90 m, south
82 m) 227 m apart on the deck's long axis, with cable fans to both deck edges.
It is a stylised model, not survey data.

All rendering is three.js (`app.js`): the buildings are one merged mesh with
per-vertex colours, so hovering and colour-mode switches only rewrite a colour
range. Picking tests each building's bounding box and then its exact prism, so
there is no GPU picking pass. The sun's shadow frustum follows the camera
target and tightens as you zoom, so shadows sharpen up close.

Colour modes:

- **Materials** — `building:colour` / `roof:colour` / `building:material` where
  tagged; otherwise a typical Boston material for the type (brick rowhouses,
  limestone and granite offices, glass above 70 m).
- **Height** — 0 to 200 m ramp.
- **Source** — where the height came from: a measured `height` tag (1,451), floors
  × 3.3 m (3,085), or a typical height for the building type (the rest).

## Data

`pipeline/prep_boston.py` writes `data/boston.json` from four Overpass API
downloads over the box 42.3405,-71.0905 to 42.3860,-71.0455 (`out geom`):
building ways, building/part/water/park/bridge relations, `building:part` ways
plus water, parks, bridges and highways, and `natural=coastline` ways (the harbor polygon is
built by clipping the coastline to the box). Coordinates are stored as local
decimetres around 42.353 N, 71.068 W.

Footprints and heights © OpenStreetMap contributors, ODbL.
