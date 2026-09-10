// Pull every National Park Service unit boundary from the authoritative
// Land Resources Division service and write one raw FeatureCollection.
//
//   node src/lab/national-parks/pipeline/01_fetch_boundaries.mjs
//
// Output: pipeline/raw/nps-boundaries.geojson (git-ignored; ~100 MB)
//
// The service caps a response by transfer size, not just record count, and a
// few units (Wrangell-St. Elias, Yukon-Charley, the Alaska preserves) are big
// enough on their own to trip it. So: ask for the object IDs first, then walk
// them in small batches and concatenate. Every batch is checked for the
// exceededTransferLimit flag; if one ever trips, the batch is split and retried
// rather than silently losing rings.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SERVICE =
  "https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services" +
  "/NPS_Land_Resources_Division_Boundary_and_Tract_Data_Service/FeatureServer/2/query";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "raw");
const outFile = path.join(outDir, "nps-boundaries.geojson");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ask(params, { tries = 4 } = {}) {
  const url = `${SERVICE}?${new URLSearchParams(params)}`;
  let lastErr;
  for (let attempt = 0; attempt < tries; attempt++) {
    if (attempt) await sleep(2000 * 2 ** (attempt - 1));
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "mapzimus-lab/1.0 (https://mapzimus.com)" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (body.error) throw new Error(`service error: ${JSON.stringify(body.error)}`);
      return body;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`query failed after ${tries} tries: ${lastErr.message}`);
}

async function fetchBatch(ids) {
  const body = await ask({
    objectIds: ids.join(","),
    outFields: "OBJECTID,UNIT_CODE,UNIT_NAME,PARKNAME,STATE,REGION,UNIT_TYPE,Status,DATE_EDIT",
    outSR: "4326",
    geometryPrecision: "6",
    returnGeometry: "true",
    f: "geojson",
  });
  // A geojson response carries the flag as a sibling of `features`.
  if (body.exceededTransferLimit || body.properties?.exceededTransferLimit) {
    if (ids.length === 1) {
      throw new Error(`single feature ${ids[0]} exceeds the transfer limit`);
    }
    const mid = Math.ceil(ids.length / 2);
    const [a, b] = [ids.slice(0, mid), ids.slice(mid)];
    return [...(await fetchBatch(a)), ...(await fetchBatch(b))];
  }
  return body.features ?? [];
}

const idResponse = await ask({ where: "1=1", returnIdsOnly: "true", f: "json" });
const ids = idResponse.objectIds ?? [];
if (!ids.length) throw new Error("the service returned no object IDs");
console.log(`object IDs: ${ids.length}`);

const features = [];
const BATCH = 12;
for (let i = 0; i < ids.length; i += BATCH) {
  const batch = ids.slice(i, i + BATCH);
  features.push(...(await fetchBatch(batch)));
  process.stdout.write(`\r  features: ${features.length}/${ids.length}`);
}
process.stdout.write("\n");

if (features.length !== ids.length) {
  throw new Error(`expected ${ids.length} features, got ${features.length}`);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  outFile,
  JSON.stringify({ type: "FeatureCollection", features }),
);
const mb = (fs.statSync(outFile).size / 1e6).toFixed(1);
console.log(`wrote ${outFile} (${features.length} units, ${mb} MB)`);
