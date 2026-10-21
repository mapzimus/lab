/* Shared Mapzimus basemap: OpenFreeMap vector styles, free and keyless.
   Carto's raster tiles started serving "API KEY REQUIRED" watermarks to
   unregistered sites, so every map on the site draws from here instead.

   Leaflet pages load, in order:
     /lib/maplibre/maplibre-gl.css
     /lib/maplibre/maplibre-gl.js
     /lib/maplibre/leaflet-maplibre-gl.js
     /lib/maplibre/basemap.js
   then call MapzimusBasemap.leaflet({ style: "dark" }).addTo(map).
   MapLibre pages only need MapzimusBasemap.styleUrl("dark") for their style. */
(function () {
  "use strict";

  var ATTRIBUTION =
    '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
    '&copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> ' +
    'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

  // dark: night chart. positron: pale grey. liberty / bright: full-colour street map.
  var STYLES = ["dark", "positron", "liberty", "bright", "fiord"];

  function styleUrl(name) {
    var style = STYLES.indexOf(name) === -1 ? "dark" : name;
    return "https://tiles.openfreemap.org/styles/" + style;
  }

  function leaflet(options) {
    options = options || {};
    return L.maplibreGL({
      style: styleUrl(options.style),
      pane: options.pane || "tilePane",
      attributionControl: options.attribution === false ? false : { customAttribution: ATTRIBUTION },
    });
  }

  window.MapzimusBasemap = { ATTRIBUTION: ATTRIBUTION, styleUrl: styleUrl, leaflet: leaflet };
})();
