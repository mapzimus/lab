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

Bars can show residents per km² or total residents per cell (density × cell
area). The **Country type** colour mode splits countries at the median country
on total population and on average density, so big-but-sparse places (Russia,
Canada) and small-but-crowded ones (Singapore, Bahrain) separate. A scatter of
every country (log population against log density) sits in the panel; clicking
a dot flies there and dims every other country.

## Data

- `data/density.json` — `pipeline/prep_density.py` sums the GHS-POP R2023A
  2025 grid (`GHS_POP_E2025_GLOBE_R2023A_4326_30ss_V1_0`, European Commission
  JRC) from 30″ to 0.25° and divides by cell area. Densities are stored as
  `uint16` of `log10(1 + density) × 13000`, base64. The grid totals
  8,191,988,517 people.
- `data/places.json` — `pipeline/prep_places.py` keeps Natural Earth 10m
  populated places over 250,000 (1,721 cities, `pop_max`), and the 50m land
  borders and coastlines with coordinates rounded to 0.01°.
- `data/countries.json` — `pipeline/prep_countries.py` sums the same GHS-POP
  grid at 0.05° inside Natural Earth 50m admin-0 polygons (rasterised) for each
  country's population and area, keeping 215 countries over 300 km². It also
  stores a 0.25° `uint8` grid of country indexes (255 = none) aligned with the
  density grid, which colours each bar by its country.
