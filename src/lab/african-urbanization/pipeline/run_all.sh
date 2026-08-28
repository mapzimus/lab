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
for script in [01][0-9]_*.py; do
  echo
  echo "=== $script ==="
  python3 "$script"
done
echo
echo "done. Remember to bump DATA_VERSION in ../app.js"
