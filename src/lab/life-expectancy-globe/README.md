# Life Expectancy Globe

Life expectancy at birth in 2026 for 237 countries and territories on a three.js
globe, with a toggle to the years each has gained since 1950.

Countries are painted onto one equirectangular canvas that wraps the sphere, so
switching metric is a repaint. Places under about 0.35 square degrees, and the
nine with no polygon of their own in the border file (Réunion, Martinique,
Guadeloupe, Mayotte, French Guiana, Gibraltar, Bonaire, Tokelau, Tuvalu), get a
constant-size dot. Hover picking turns the ray hit into lat/lon and runs
point-in-polygon.

## Data

- `data/life.json` — `pipeline/build_life.py`. The table is transcribed from
  Visual Capitalist's "The Life Expectancy of Every Country" (United Nations,
  World Population Prospects 2024; 2026 medium projection, 1950 estimate). The
  gains for Chad and Nigeria were partly covered in the source image and should
  be checked against WPP.
- `data/countries-50m.json` — world-atlas 50m countries (Natural Earth), the
  same file the Hurricane Globe uses. Somaliland is merged into Somalia.
- `vendor/` — three.js 0.147.0 and its OrbitControls, as in State Puzzle.
