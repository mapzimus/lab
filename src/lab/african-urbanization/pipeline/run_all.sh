#!/usr/bin/env bash
# Rebuild every committed file in ../data from the raw sources.
#
#   python3 -m pip install -r requirements.txt
#   ./run_all.sh
#
# Set AFRICAN_URBANIZATION_RAW to keep the ~1.7 GB of downloads somewhere
# other than ./raw. Bump DATA_VERSION in ../app.js afterwards so browsers
# pick the new files up.
set -euo pipefail
cd "$(dirname "$0")"

python3 fetch_raw.py

# Explicit, because the order is not the numbering. 18_land_routes rewrites the
# corridor geometry that 15_corridor_coverage measures, so it has to run first
# or the coverage figures describe lines that are no longer drawn. A glob over
# the numbers ran it last and did exactly that.
SCRIPTS=(
  01_countries_population.py
  02_cities.py
  03_corridors.py
  18_land_routes.py
  15_corridor_coverage.py
  04_kinshasa.py
  05_kinshasa_context.py
  06_lights.py
  07_kinshasa_density.py
  08_services.py
  09_kinshasa_terrain.py
  10_kinshasa_streets.py
  11_kinshasa_communes.py
  12_kinshasa_expansion.py
  13_matadi_corridor.py
  14_validate.py
  16_city_streets.py
  17_class_breaks.py
)
for script in "${SCRIPTS[@]}"; do
  echo
  echo "=== $script ==="
  python3 "$script"
done
echo
echo "done. Remember to bump DATA_VERSION in ../app.js"
