// Standalone PMTiles viewer.
// Reads the archive URL from the URL hash: #pmtiles://https://...
// Falls back to a demo notice if no hash is present.

const protocol = new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

function getArchiveUrl() {
    const hash = location.hash.slice(1);
    if (hash.startsWith('pmtiles://')) return hash;
    // Support plain https:// URL in hash — auto-prefix protocol
    if (hash.startsWith('https://') || hash.startsWith('http://')) {
        return 'pmtiles://' + hash;
    }
    return null;
}

const archiveUrl = getArchiveUrl();

const map = new maplibregl.Map({
    container: 'map',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [0, 20],
    zoom: 2,
    hash: false,
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.FullscreenControl(), 'top-right');

// Update info overlay
const infoEl = document.getElementById('archiveInfo');
if (archiveUrl && infoEl) {
    const display = archiveUrl.replace('pmtiles://', '');
    infoEl.textContent = display.length > 60 ? '…' + display.slice(-57) : display;
}

if (!archiveUrl) {
    document.getElementById('noUrlNotice')?.removeAttribute('hidden');
} else {
    map.on('load', async () => {
        // Inspect the archive to get bounds + zoom
        try {
            const p = new pmtiles.PMTiles(archiveUrl);
            const header = await p.getHeader();

            const minZoom = header.minZoom ?? 0;
            const maxZoom = header.maxZoom ?? 14;
            const minLon = header.minLon;
            const minLat = header.minLat;
            const maxLon = header.maxLon;
            const maxLat = header.maxLat;

            // Add the PMTiles source
            map.addSource('pockettiles', {
                type: 'vector',
                url: archiveUrl,
                minzoom: minZoom,
                maxzoom: maxZoom,
            });

            // Polygon fill
            map.addLayer({
                id: 'pt-fill',
                type: 'fill',
                source: 'pockettiles',
                'source-layer': 'features',
                filter: ['==', '$type', 'Polygon'],
                paint: {
                    'fill-color': '#87c3ff',
                    'fill-opacity': 0.25,
                },
            });

            // Polygon outline
            map.addLayer({
                id: 'pt-outline',
                type: 'line',
                source: 'pockettiles',
                'source-layer': 'features',
                filter: ['==', '$type', 'Polygon'],
                paint: {
                    'line-color': '#87c3ff',
                    'line-width': 2,
                },
            });

            // Line layer
            map.addLayer({
                id: 'pt-line',
                type: 'line',
                source: 'pockettiles',
                'source-layer': 'features',
                filter: ['==', '$type', 'LineString'],
                paint: {
                    'line-color': '#5eead4',
                    'line-width': 3,
                },
            });

            // Point layer
            map.addLayer({
                id: 'pt-point',
                type: 'circle',
                source: 'pockettiles',
                'source-layer': 'features',
                filter: ['==', '$type', 'Point'],
                paint: {
                    'circle-radius': 6,
                    'circle-color': '#fbbf24',
                    'circle-stroke-color': '#0a0e17',
                    'circle-stroke-width': 2,
                },
            });

            // Fly to bounds
            if (isFinite(minLon) && isFinite(maxLon)) {
                map.fitBounds([[minLon, minLat], [maxLon, maxLat]], {
                    padding: 60,
                    maxZoom: maxZoom,
                });
            }

            // Feature popup on click
            for (const layer of ['pt-fill', 'pt-line', 'pt-point']) {
                map.on('click', layer, e => {
                    const props = e.features[0]?.properties ?? {};
                    const rows = Object.entries(props)
                        .filter(([k]) => !k.startsWith('_'))
                        .map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`)
                        .join('');
                    if (!rows) return;
                    new maplibregl.Popup()
                        .setLngLat(e.lngLat)
                        .setHTML(`<table class="popup-table">${rows}</table>`)
                        .addTo(map);
                });

                map.on('mouseenter', layer, () => map.getCanvas().style.cursor = 'pointer');
                map.on('mouseleave', layer, () => map.getCanvas().style.cursor = '');
            }

            document.getElementById('loadingNotice')?.setAttribute('hidden', '');
        } catch (err) {
            console.error('Failed to load PMTiles archive:', err);
            const el = document.getElementById('loadingNotice');
            if (el) el.textContent = `Failed to load archive: ${err.message}`;
        }
    });
}
