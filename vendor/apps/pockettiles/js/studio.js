import { bakeGeoJSON, geojsonBbox } from './bake.js';
import { writePMTiles } from './pmtiles-writer.js';
import { SUPABASE_URL, SUPABASE_ANON, STORAGE_BUCKET, supabaseConfigured } from '../config.js';
import {
    TerraDraw,
    TerraDrawPolygonMode,
    TerraDrawLineStringMode,
    TerraDrawPointMode,
    TerraDrawSelectMode,
    TerraDrawFreehandMode,
} from 'https://esm.sh/terra-draw@1';
import { TerraDrawMapLibreGLAdapter } from 'https://esm.sh/terra-draw-maplibre-gl-adapter@1';

// ── MapLibre + PMTiles setup ──────────────────────────────────────────────────

const pmtilesProtocol = new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile);

const map = new maplibregl.Map({
    container: 'map',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [0, 20],
    zoom: 2,
    hash: false,
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: false,
}), 'top-right');

// ── Terra Draw ────────────────────────────────────────────────────────────────

let draw;

map.on('load', () => {
    draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        modes: [
            new TerraDrawSelectMode({
                flags: {
                    polygon: { feature: { draggable: true, rotateable: false, scaleable: false, coordinates: { midpoints: true, draggable: true, deletable: true } } },
                    linestring: { feature: { draggable: true, coordinates: { midpoints: true, draggable: true, deletable: true } } },
                    point: { feature: { draggable: true } },
                    freehand: { feature: { draggable: true } },
                },
            }),
            new TerraDrawPolygonMode({ snapping: false }),
            new TerraDrawLineStringMode(),
            new TerraDrawPointMode(),
            new TerraDrawFreehandMode(),
        ],
    });
    draw.start();

    // Wire up tool buttons
    document.querySelectorAll('[data-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            draw.setMode(mode);
            document.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Start in select mode
    draw.setMode('select');
    document.querySelector('[data-mode="select"]')?.classList.add('active');
});

// ── Feature management ────────────────────────────────────────────────────────

function getFeatureCollection() {
    if (!draw) return { type: 'FeatureCollection', features: [] };
    // Terra Draw getSnapshot() returns Feature[] (not a FeatureCollection)
    const features = draw.getSnapshot();
    return { type: 'FeatureCollection', features: Array.isArray(features) ? features : [] };
}

function featureCount() {
    return getFeatureCollection().features.length;
}

function updateFeatureCount() {
    const n = featureCount();
    const el = document.getElementById('featureCount');
    if (el) el.textContent = n === 0 ? 'No features drawn' : `${n} feature${n === 1 ? '' : 's'}`;
    const bakeBtn = document.getElementById('bakeBtn');
    if (bakeBtn) bakeBtn.disabled = n === 0;
}

// Poll for feature count changes (Terra Draw events vary by version)
setInterval(updateFeatureCount, 500);

// ── GeoJSON Import ────────────────────────────────────────────────────────────

document.getElementById('importBtn')?.addEventListener('click', () => {
    document.getElementById('fileInput')?.click();
});

document.getElementById('fileInput')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        try {
            const geojson = JSON.parse(ev.target.result);
            if (!draw) return;

            const features = geojson.type === 'FeatureCollection'
                ? geojson.features
                : geojson.type === 'Feature' ? [geojson] : [];

            // Add each feature to Terra Draw
            for (const f of features) {
                if (f.geometry?.type) draw.addFeatures([f]);
            }

            // Fly to the data
            const bbox = geojsonBbox(geojson);
            if (isFinite(bbox[0])) {
                map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 40 });
            }
            setStatus(`Imported ${features.length} feature${features.length !== 1 ? 's' : ''}.`);
        } catch {
            setStatus('Could not parse GeoJSON file.', true);
        }
    };
    reader.readAsText(file);
    e.target.value = '';
});

// ── Clear ─────────────────────────────────────────────────────────────────────

document.getElementById('clearBtn')?.addEventListener('click', () => {
    if (!draw) return;
    if (featureCount() > 0 && !confirm('Clear all features?')) return;
    draw.clear();
    setStatus('Canvas cleared.');
    hideBakeResult();
});

// ── Bake ──────────────────────────────────────────────────────────────────────

let lastBlob = null;
let lastBounds = null;

document.getElementById('bakeBtn')?.addEventListener('click', async () => {
    const geojson = getFeatureCollection();
    if (!geojson.features.length) return;

    const minZoom = parseInt(document.getElementById('minZoom')?.value ?? '0');
    const maxZoom = parseInt(document.getElementById('maxZoom')?.value ?? '12');

    setStatus('Slicing tiles…');
    showProgress(0, 1);
    document.getElementById('bakeBtn').disabled = true;

    try {
        lastBounds = geojsonBbox(geojson);
        const [minLon, minLat, maxLon, maxLat] = lastBounds;
        const centerLon = (minLon + maxLon) / 2;
        const centerLat = (minLat + maxLat) / 2;

        const tiles = await bakeGeoJSON(geojson, {
            minZoom,
            maxZoom,
            layerName: 'features',
            onProgress: (done, total) => showProgress(done, total),
        });

        setStatus(`Encoded ${tiles.length} tiles. Assembling archive…`);

        const name = document.getElementById('mapName')?.value.trim() || 'my-map';
        const blob = await writePMTiles(tiles, {
            name,
            minZoom,
            maxZoom,
            bounds: lastBounds,
            center: [centerLon, centerLat, Math.min(maxZoom, 10)],
        });

        lastBlob = blob;
        const kb = (blob.size / 1024).toFixed(1);
        setStatus(`Archive ready — ${tiles.length} tiles, ${kb} KB.`);
        showBakeResult(blob, name, tiles.length, kb);
    } catch (err) {
        setStatus(`Bake failed: ${err.message}`, true);
        console.error(err);
    } finally {
        document.getElementById('bakeBtn').disabled = false;
        hideProgress();
    }
});

// ── Download ──────────────────────────────────────────────────────────────────

document.getElementById('downloadBtn')?.addEventListener('click', () => {
    if (!lastBlob) return;
    const name = document.getElementById('mapName')?.value.trim() || 'my-map';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(lastBlob);
    a.download = `${name}.pmtiles`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
});

// ── Upload to Supabase ────────────────────────────────────────────────────────

document.getElementById('uploadBtn')?.addEventListener('click', async () => {
    if (!lastBlob) return;
    if (!supabaseConfigured()) {
        setStatus('Supabase not configured — see config.js to enable cloud publishing.', true);
        return;
    }

    const name = (document.getElementById('mapName')?.value.trim() || 'my-map')
        .replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
    const path = `${name}-${Date.now()}.pmtiles`;

    setStatus('Uploading to cloud…');
    document.getElementById('uploadBtn').disabled = true;

    try {
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
        const client = createClient(SUPABASE_URL, SUPABASE_ANON);

        const { error } = await client.storage
            .from(STORAGE_BUCKET)
            .upload(path, lastBlob, {
                contentType: 'application/octet-stream',
                upsert: false,
            });

        if (error) throw error;

        const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
        const viewerUrl = `${location.origin}${location.pathname.replace('index.html', '')}viewer.html#pmtiles://${publicUrl}`;

        setStatus('Uploaded! Share link ready.');
        showShareLink(viewerUrl, publicUrl);
    } catch (err) {
        setStatus(`Upload failed: ${err.message}`, true);
    } finally {
        document.getElementById('uploadBtn').disabled = false;
    }
});

// ── UI helpers ────────────────────────────────────────────────────────────────

function setStatus(msg, isError = false) {
    const el = document.getElementById('statusMsg');
    if (!el) return;
    el.textContent = msg;
    el.className = 'status-msg' + (isError ? ' error' : '');
}

function showProgress(done, total) {
    const bar = document.getElementById('progressBar');
    const pct = document.getElementById('progressPct');
    const wrap = document.getElementById('progressWrap');
    if (!bar) return;
    if (wrap) wrap.style.display = 'flex';
    const p = total > 0 ? Math.round(done / total * 100) : 0;
    bar.style.width = `${p}%`;
    if (pct) pct.textContent = `${p}%`;
}

function hideProgress() {
    const wrap = document.getElementById('progressWrap');
    if (wrap) wrap.style.display = 'none';
}

function showBakeResult(blob, name, tileCount, kb) {
    const el = document.getElementById('bakeResult');
    if (!el) return;
    el.style.display = 'block';
    document.getElementById('resultTiles').textContent = tileCount;
    document.getElementById('resultSize').textContent = `${kb} KB`;
    document.getElementById('uploadBtn').disabled = !supabaseConfigured();
    if (!supabaseConfigured()) {
        document.getElementById('uploadBtn').title = 'Configure Supabase in config.js to enable';
    }
    hideSharLink();
}

function hideBakeResult() {
    const el = document.getElementById('bakeResult');
    if (el) el.style.display = 'none';
    hideSharLink();
}

function showShareLink(viewerUrl, rawUrl) {
    const el = document.getElementById('sharePanel');
    if (!el) return;
    el.style.display = 'block';
    document.getElementById('shareLink').value = viewerUrl;
    document.getElementById('rawLink').value = rawUrl;
    generateQR(viewerUrl);
}

function hideSharLink() {
    const el = document.getElementById('sharePanel');
    if (el) el.style.display = 'none';
}

document.getElementById('copyShareBtn')?.addEventListener('click', () => {
    const val = document.getElementById('shareLink')?.value;
    if (val) navigator.clipboard.writeText(val).then(() => setStatus('Link copied!'));
});

function generateQR(url) {
    const el = document.getElementById('qrCode');
    if (!el || !window.QRCode) return;
    el.innerHTML = '';
    new QRCode(el, { text: url, width: 120, height: 120, colorLight: '#0a0e17', colorDark: '#87c3ff' });
}
