# Population Relief Globe

Where the world lives in 2025, as 105,700 bars on a three.js globe: one bar per
quarter-degree cell (about 28 km at the equator) with at least one person per
km². Bar height and colour show residents per km²; the height scale switches
between linear, square root and log.

The camera tilt slider leans the view toward the horizon so the bars rise like
a skyline. OrbitControls drive an invisible camera and the real one is derived
from it, so tilt never fights the orbit. City labels sit on top of their cell's
bar and are decluttered each frame by metro population, with more appearing as
you zoom in. Hover picking intersects the sphere analytically and looks up the
grid cell, so it costs nothing per bar.

## Data

- `data/density.json` — `pipeline/prep_density.py` sums the GHS-POP R2023A
  2025 grid (`GHS_POP_E2025_GLOBE_R2023A_4326_30ss_V1_0`, European Commission
  JRC) from 30″ to 0.25° and divides by cell area. Densities are stored as
  `uint16` of `log10(1 + density) × 13000`, base64. The grid totals
  8,191,988,517 people.
- `data/places.json` — `pipeline/prep_places.py` keeps Natural Earth 10m
  populated places over 250,000 (1,721 cities, `pop_max`), and the 50m land
  borders and coastlines with coordinates rounded to 0.01°.
