# Population Relief Globe

Where the world lives, 1975 to 2030, as 105,700 bars on a three.js globe: one
bar per quarter-degree cell (about 28 km at the equator) with at least one
person per km² in 2025.

## Layers

One picker sets both height and colour; each layer brings its own legend.

- **Density** — residents per km².
- **People** — residents per cell (density × cell area).
- **Growth** — colour is the change in density since 1975 (÷4 to ×8), height is
  density in the chosen year. The timeline plays 1975 → 2030; years between
  GHSL epochs are interpolated linearly.
- **City or country** — each cell's people split into cities, towns and
  suburbs, and rural (2025), mixed into one colour.
- **Lights per person** — NASA night light in the cell divided by its 2016
  residents, against the world's total light per person.
- **Country type** — countries split at the median country on total population
  and on average density, with a scatter of every country. Clicking a dot flies
  there and dims the rest.

## Controls

Mouse, touch and keyboard all drive the same things. Drag or one finger turns
the globe, scroll or pinch zooms, click or tap reads a cell. The globe canvas
is focusable: arrow keys turn it (Shift for bigger steps), `+`/`−` zoom,
PgUp/PgDn tilt, Home resets, and a reticle marks the cell being read. Space
plays the timeline and `/` jumps to search. Layer and scale pickers are ARIA
radio groups with arrow-key movement. Phones get a bottom drawer that starts
collapsed, a timeline above it, and 44 px buttons.

OrbitControls drive an invisible camera; the real camera is derived from it
with tilt applied, so tilt never fights the orbit. Hover picking intersects the
sphere analytically and looks up the grid cell, so it costs nothing per bar.

## Data

- `data/density.json` — `pipeline/prep_density.py`: GHS-POP R2023A 2025
  (`GHS_POP_E2025_GLOBE_R2023A_4326_30ss`, European Commission JRC) summed
  from 30″ to 0.25° and divided by cell area, stored as `uint16` of
  `log10(1 + density) × 13000`. Totals 8,191,988,517.
- `data/timeline.json` — `pipeline/prep_timeline.py`: the same for the 1975,
  1990, 2000, 2010, 2020 and 2030 epochs (2030 is GHSL's projection), for the
  globe's cells only (`idx`). World totals 4.07 bn (1975) to 8.55 bn (2030).
- `data/layers.json` — `pipeline/prep_layers.py`:
  - Urban classes follow the Degree of Urbanisation thresholds on a 1′ grid
    (~1.85 km, coarser than the official 1 km): **cities** are 4-connected
    clusters of ≥ 1,500 people/km² totalling ≥ 50,000; **towns and suburbs**
    are 8-connected clusters of ≥ 300/km² totalling ≥ 5,000. World split:
    44 % / 36 % / 20 %.
  - Night lights come from NASA's 2016 Black Marble 3 km greyscale map. Values
    under 6 (halo and background) count as dark; the rest are linearised with
    a 2.2 gamma and weighted by pixel area. The map is display-scaled, so the
    brightest cores saturate; treat lights per person as relative.
- `data/countries.json` — `pipeline/prep_countries.py`: population and area per
  Natural Earth 50m country (rasterised at 0.05°), plus a 0.25° `uint8` grid of
  country indexes (255 = none).
- `data/places.json` — `pipeline/prep_places.py`: Natural Earth 10m populated
  places over 250,000 (1,721 cities) and 50m borders and coastlines.

`pipeline/prep_layers_lib.py` holds the shared regridding helper. The
pipelines read the downloaded GeoTIFFs from a local `data/` folder that is not
committed.
