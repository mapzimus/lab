"""Population density per 0.25 deg cell for each GHS-POP epoch, for the cells drawn on the globe."""
import base64, json, math, os, zipfile
import numpy as np
from prep_layers_lib import cell_list, regrid_fine

R = 6371.0088
STEP = 0.25
YEARS = [1975, 1990, 2000, 2010, 2020, 2030]
idx = cell_list()
lats = 90 - (np.arange(720) + 0.5) * STEP
area = ((R * math.radians(STEP)) ** 2 * np.cos(np.radians(lats)))
out = {}
done = []
for y in YEARS:
    z = f"data/epochs/ghs_{y}.zip"
    with zipfile.ZipFile(z) as zf:
        name = next(n for n in zf.namelist() if n.lower().endswith(".tif"))
        zf.extract(name, "data/epochs")
    tif = os.path.join("data/epochs", name)
    g = regrid_fine(tif, STEP).astype(np.float64)
    done.append(tif)
    d = (g / area[:, None]).ravel()[idx]
    out[str(y)] = base64.b64encode(np.round(np.log10(1 + d) * 13000).clip(0, 65535).astype("<u2").tobytes()).decode()
    print(y, f"{g.sum():,.0f}", flush=True)
json.dump({"idx": base64.b64encode(idx.astype("<u4").tobytes()).decode(), "k": 13000, "years": YEARS, "ep": out},
          open("data/timeline_min.json", "w"), separators=(",", ":"))
print("wrote timeline")
import gc; gc.collect()
for t in done:
    try: os.remove(t)
    except OSError as e: print('left', t, e)
