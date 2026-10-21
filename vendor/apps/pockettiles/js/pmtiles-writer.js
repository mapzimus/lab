// PMTiles v3 writer — assembles a valid .pmtiles archive from pre-encoded tiles.
// Spec: https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md
//
// Usage:
//   import { writePMTiles } from './pmtiles-writer.js';
//   const blob = await writePMTiles(tiles, { name, minZoom, maxZoom, bounds, center });
//
// tiles: Array of { z, x, y, data: Uint8Array } (data = gzipped MVT protobuf)
// Returns: Blob of type 'application/octet-stream'

// ── Hilbert curve ────────────────────────────────────────────────────────────

function hilbertXY2D(n, x, y) {
    let d = 0;
    for (let s = Math.floor(n / 2); s > 0; s = Math.floor(s / 2)) {
        const rx = (x & s) > 0 ? 1 : 0;
        const ry = (y & s) > 0 ? 1 : 0;
        d += s * s * ((3 * rx) ^ ry);
        if (ry === 0) {
            if (rx === 1) { x = s - 1 - x; y = s - 1 - y; }
            const t = x; x = y; y = t;
        }
    }
    return d;
}

export function zxyToTileId(z, x, y) {
    if (z === 0) return 0;
    const n = 1 << z;
    let acc = 0;
    for (let i = 0; i < z; i++) acc += (1 << (2 * i));
    return acc + hilbertXY2D(n, x, y);
}

// ── Varint encoding ──────────────────────────────────────────────────────────

function writeVarint(out, val) {
    // val must be a non-negative integer (Number, fits in 53-bit safe integer)
    while (val > 0x7f) {
        out.push((val & 0x7f) | 0x80);
        val = Math.floor(val / 128);
    }
    out.push(val & 0x7f);
}

function concatBytes(arrays) {
    const total = arrays.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const a of arrays) { out.set(a, offset); offset += a.length; }
    return out;
}

// ── Directory serialization ───────────────────────────────────────────────────
// Column-oriented layout:
// [num_entries varint]
// [N tile_id deltas, varints]
// [N run_lengths, varints]
// [N lengths, varints]
// [N offsets, varints — 0 means "immediately follows previous tile"]

function serializeDirectory(entries) {
    const out = [];
    writeVarint(out, entries.length);

    // tile_id deltas (delta from previous; first entry delta = tileId itself)
    let lastId = 0;
    for (const e of entries) {
        writeVarint(out, e.tileId - lastId);
        lastId = e.tileId;
    }

    // run_lengths (1 for all individual tiles in MVP)
    for (const e of entries) writeVarint(out, e.runLength);

    // lengths
    for (const e of entries) writeVarint(out, e.length);

    // offsets with consecutive-compression:
    //   0 means "this tile starts immediately after the previous one ends"
    //   otherwise store (offset - (prevOffset + prevLength) + 1)
    //   first entry: store (offset + 1)  [so 0 is unambiguously "consecutive"]
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (i === 0) {
            writeVarint(out, e.offset + 1);
        } else {
            const prevEnd = entries[i - 1].offset + entries[i - 1].length;
            if (e.offset === prevEnd) {
                writeVarint(out, 0);
            } else {
                writeVarint(out, e.offset - prevEnd + 1);
            }
        }
    }

    return new Uint8Array(out);
}

// ── Gzip helper (browser CompressionStream) ──────────────────────────────────

async function gzip(data) {
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
    return concatBytes(chunks);
}

// ── Header assembly ──────────────────────────────────────────────────────────
// 127-byte header per PMTiles v3 spec.

function buildHeader({
    rootDirOffset, rootDirLength,
    metadataOffset, metadataLength,
    leafDirsOffset, leafDirsLength,
    tileDataOffset, tileDataLength,
    addressedTiles, tileEntries, tileContents,
    clustered,
    minZoom, maxZoom,
    minLon, minLat, maxLon, maxLat,
    centerZoom, centerLon, centerLat,
}) {
    const buf = new ArrayBuffer(127);
    const view = new DataView(buf);
    const bytes = new Uint8Array(buf);

    // Magic + version
    const magic = [80, 77, 84, 105, 108, 101, 115]; // "PMTiles"
    magic.forEach((b, i) => bytes[i] = b);
    view.setUint8(7, 3); // version 3

    // Section offsets and lengths (uint64 LE — values fit in 53-bit safe int)
    const setU64 = (offset, val) => view.setBigUint64(offset, BigInt(val), true);
    setU64(8,  rootDirOffset);
    setU64(16, rootDirLength);
    setU64(24, metadataOffset);
    setU64(32, metadataLength);
    setU64(40, leafDirsOffset);
    setU64(48, leafDirsLength);
    setU64(56, tileDataOffset);
    setU64(64, tileDataLength);
    setU64(72, addressedTiles);
    setU64(80, tileEntries);
    setU64(88, tileContents);

    view.setUint8(96, clustered ? 1 : 0);
    view.setUint8(97, 2); // internal_compression: gzip
    view.setUint8(98, 2); // tile_compression: gzip
    view.setUint8(99, 1); // tile_type: MVT

    view.setUint8(100, minZoom);
    view.setUint8(101, maxZoom);

    // Bounds (int32 LE, degrees × 10^7)
    const e7 = v => Math.round(v * 1e7);
    view.setInt32(102, e7(minLon), true);
    view.setInt32(106, e7(minLat), true);
    view.setInt32(110, e7(maxLon), true);
    view.setInt32(114, e7(maxLat), true);

    view.setUint8(118, centerZoom);
    view.setInt32(119, e7(centerLon), true);
    view.setInt32(123, e7(centerLat), true);

    return bytes;
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function writePMTiles(tiles, opts = {}) {
    const {
        name = 'pockettiles-map',
        minZoom = 0,
        maxZoom = 14,
        bounds = [-180, -85, 180, 85],
        center = [0, 0, 2],
    } = opts;

    // 1. Compute tileId for each tile, sort by tileId (Hilbert order = clustered)
    const withIds = tiles.map(t => ({
        ...t,
        tileId: zxyToTileId(t.z, t.x, t.y),
    })).sort((a, b) => a.tileId - b.tileId);

    // 2. Build tile data section by concatenating all gzipped MVT blobs
    let tileDataLength = 0;
    const entries = [];
    for (const t of withIds) {
        entries.push({
            tileId: t.tileId,
            runLength: 1,
            length: t.data.length,
            offset: tileDataLength,
        });
        tileDataLength += t.data.length;
    }

    const tileDataParts = withIds.map(t => t.data);
    const tileData = concatBytes(tileDataParts);

    // 3. Serialize and gzip the root directory
    const dirBytes = serializeDirectory(entries);
    const dirGzipped = await gzip(dirBytes);

    // 4. Build and gzip metadata JSON
    const metadata = JSON.stringify({
        name,
        description: 'Created with PocketTiles Studio',
        format: 'pbf',
        minzoom: String(minZoom),
        maxzoom: String(maxZoom),
        bounds: bounds.join(','),
        center: center.join(','),
        type: 'overlay',
        vector_layers: [{ id: 'features', fields: { name: 'String' } }],
    });
    const metaGzipped = await gzip(new TextEncoder().encode(metadata));

    // 5. Compute section offsets
    const ROOT_DIR_OFFSET = 127;
    const METADATA_OFFSET = ROOT_DIR_OFFSET + dirGzipped.length;
    const LEAF_DIRS_OFFSET = METADATA_OFFSET + metaGzipped.length;
    const TILE_DATA_OFFSET = LEAF_DIRS_OFFSET; // no leaf dirs in MVP

    // 6. Build 127-byte header
    const [minLon, minLat, maxLon, maxLat] = bounds;
    const header = buildHeader({
        rootDirOffset: ROOT_DIR_OFFSET,
        rootDirLength: dirGzipped.length,
        metadataOffset: METADATA_OFFSET,
        metadataLength: metaGzipped.length,
        leafDirsOffset: LEAF_DIRS_OFFSET,
        leafDirsLength: 0,
        tileDataOffset: TILE_DATA_OFFSET,
        tileDataLength,
        addressedTiles: entries.length,
        tileEntries: entries.length,
        tileContents: entries.length,
        clustered: true,
        minZoom, maxZoom,
        minLon, minLat, maxLon, maxLat,
        centerZoom: center[2] ?? Math.round((minZoom + maxZoom) / 2),
        centerLon: center[0],
        centerLat: center[1],
    });

    // 7. Assemble final file
    const archive = concatBytes([header, dirGzipped, metaGzipped, tileData]);
    return new Blob([archive], { type: 'application/octet-stream' });
}
