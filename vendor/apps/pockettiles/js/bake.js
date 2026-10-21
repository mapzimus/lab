// Bake pipeline: GeoJSON FeatureCollection → array of gzipped MVT tiles.
// Uses geojson-vt (slicing) + vt-pbf (MVT encoding) loaded via esm.sh.

import geojsonvt from 'https://esm.sh/geojson-vt@4';
import vtpbf from 'https://esm.sh/vt-pbf@3';

// ── Coordinate helpers ────────────────────────────────────────────────────────

function lonToTileX(lon, zoom) {
    return Math.floor((lon + 180) / 360 * (1 << zoom));
}

function latToTileY(lat, zoom) {
    const latRad = lat * Math.PI / 180;
    return Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * (1 << zoom));
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function geojsonBbox(geojson) {
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;

    function visit(coords) {
        if (typeof coords[0] === 'number') {
            minLon = Math.min(minLon, coords[0]);
            maxLon = Math.max(maxLon, coords[0]);
            minLat = Math.min(minLat, coords[1]);
            maxLat = Math.max(maxLat, coords[1]);
        } else {
            coords.forEach(visit);
        }
    }

    const features = geojson.type === 'FeatureCollection'
        ? geojson.features
        : geojson.type === 'Feature' ? [geojson] : [];

    for (const f of features) {
        if (f.geometry) visit(f.geometry.coordinates ?? []);
    }

    // Expand slightly so edge features aren't clipped out
    const pad = 0.01;
    return [
        Math.max(-180, minLon - pad),
        Math.max(-85.051129, minLat - pad),
        Math.min(180, maxLon + pad),
        Math.min(85.051129, maxLat + pad),
    ];
}

// ── Gzip helper ───────────────────────────────────────────────────────────────

async function gzipBytes(data) {
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    const reader = cs.readable.getReader();
    const chunks = [];
    const reading = (async () => {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }
    })();
    await writer.write(data instanceof Uint8Array ? data : new Uint8Array(data));
    await writer.close();
    await reading;
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let p = 0;
    for (const c of chunks) { out.set(c, p); p += c.length; }
    return out;
}

// ── Main export ───────────────────────────────────────────────────────────────

// Returns: Array of { z, x, y, data: Uint8Array } where data is gzipped MVT.
// opts.onProgress(done, total) — called after each tile.

export async function bakeGeoJSON(geojson, opts = {}) {
    const {
        minZoom = 0,
        maxZoom = 14,
        layerName = 'features',
        onProgress = null,
    } = opts;

    const bbox = geojsonBbox(geojson);
    const [minLon, minLat, maxLon, maxLat] = bbox;

    // geojson-vt index
    const index = geojsonvt(geojson, {
        maxZoom,
        indexMaxZoom: maxZoom,
        indexMaxPoints: 200,
        tolerance: 3,
        buffer: 64,
    });

    // Count how many tiles we'll request (for progress reporting)
    let totalEstimate = 0;
    for (let z = minZoom; z <= maxZoom; z++) {
        const maxIdx = (1 << z) - 1;
        const x0 = clamp(lonToTileX(minLon, z), 0, maxIdx);
        const x1 = clamp(lonToTileX(maxLon, z), 0, maxIdx);
        const y0 = clamp(latToTileY(maxLat, z), 0, maxIdx); // note: lat→y is inverted
        const y1 = clamp(latToTileY(minLat, z), 0, maxIdx);
        totalEstimate += (x1 - x0 + 1) * (y1 - y0 + 1);
    }

    const results = [];
    let done = 0;

    for (let z = minZoom; z <= maxZoom; z++) {
        const maxIdx = (1 << z) - 1;
        const x0 = clamp(lonToTileX(minLon, z), 0, maxIdx);
        const x1 = clamp(lonToTileX(maxLon, z), 0, maxIdx);
        const y0 = clamp(latToTileY(maxLat, z), 0, maxIdx);
        const y1 = clamp(latToTileY(minLat, z), 0, maxIdx);

        for (let x = x0; x <= x1; x++) {
            for (let y = y0; y <= y1; y++) {
                const tile = index.getTile(z, x, y);

                if (tile && tile.features && tile.features.length > 0) {
                    // Encode as Mapbox Vector Tile protobuf
                    const pbfBuffer = vtpbf.fromGeojsonVt({ [layerName]: tile });
                    const pbfBytes = pbfBuffer instanceof Uint8Array
                        ? pbfBuffer
                        : new Uint8Array(pbfBuffer.buffer || pbfBuffer);

                    // Gzip the tile (standard for MVT in PMTiles)
                    const gzipped = await gzipBytes(pbfBytes);
                    results.push({ z, x, y, data: gzipped });
                }

                done++;
                if (onProgress) onProgress(done, totalEstimate);

                // Yield to keep the UI responsive
                if (done % 500 === 0) await new Promise(r => setTimeout(r, 0));
            }
        }
    }

    return results;
}

export { geojsonBbox };
