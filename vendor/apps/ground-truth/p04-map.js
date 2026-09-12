(function () {
  const frame = document.getElementById("p04-swipe");
  const mapRoot = document.getElementById("p04-map");
  if (!frame || !mapRoot || typeof L === "undefined") return;

  const HILLSHADE = "https://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/LiDAR_ShadedRelief_18Nant_21EC/MapServer/tile/{z}/{y}/{x}";
  const IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
  const PASS = { color: "#8fca7a", fillColor: "#5aa05c", weight: 1.6, fillOpacity: 0.22 };
  const FAIL = { color: "#c4a07a", fillColor: "#8a5a32", weight: 1.4, fillOpacity: 0.28 };
  const ACTIVE = { color: "#ffb400", fillColor: "#ffb400", weight: 3, fillOpacity: 0.32 };

  const status = document.getElementById("p04-status");
  const bar = frame.querySelector(".bar");
  const fallback = frame.querySelector(".map-fallback");
  const fullScreenButton = frame.querySelector(".fsbtn");
  const filterButtons = [...document.querySelectorAll("[data-p04-filter]")];
  const jump = document.getElementById("p04-fail-jump");
  const outlinesButton = document.getElementById("p04-outlines");
  const highwayButton = document.getElementById("p04-highway");
  const siteButtons = [...document.querySelectorAll("[data-p04-id]")];
  let outlinesOn = true;
  let highwayOn = true;
  let highwayLayer;
  let fraction = 0.5;
  let featuresById = new Map();
  let passedLayer;
  let failedLayer;
  let activeId = null;
  let filter = "all";
  let map;

  const clip = () => {
    const pane = map.getPane("lidarPane");
    if (!pane) return;
    const percent = Math.round(fraction * 100);
    // The pane is a zero-size box that Leaflet translates as you pan/zoom, so a
    // percentage clip-path collapses. Clip with pixel insets in pane coordinates.
    const size = map.getSize();
    const pos = L.DomUtil.getPosition(map.getPane("mapPane"));
    const splitX = fraction * size.x;
    pane.style.clipPath = `inset(${-pos.y}px ${pos.x - size.x}px ${pos.y - size.y}px ${splitX - pos.x}px)`;
    if (bar) bar.style.left = `${percent}%`;
    frame.setAttribute("aria-valuenow", String(percent));
    frame.setAttribute("aria-valuetext", `${percent}% aerial imagery, ${100 - percent}% LiDAR hillshade`);
  };

  const styleFor = feature => {
    if (feature.properties.id === activeId) return ACTIVE;
    return feature.properties.passed ? PASS : FAIL;
  };

  const restyle = () => {
    [passedLayer, failedLayer].forEach(group => {
      if (!group) return;
      group.eachLayer(layer => layer.setStyle(styleFor(layer.feature)));
    });
    siteButtons.forEach(node => node.classList.toggle("on", node.dataset.p04Id === activeId));
  };

  const setFilter = (next, fit = true) => {
    filter = next;
    filterButtons.forEach(button => button.classList.toggle("on", button.dataset.p04Filter === next));
    if (passedLayer) {
      if (next === "failed" || !outlinesOn) map.removeLayer(passedLayer);
      else if (!map.hasLayer(passedLayer)) passedLayer.addTo(map);
    }
    if (failedLayer) {
      if (next === "passed" || !outlinesOn) map.removeLayer(failedLayer);
      else if (!map.hasLayer(failedLayer)) failedLayer.addTo(map);
    }
    const visible = next === "passed" ? passedLayer : next === "failed" ? failedLayer : L.featureGroup([passedLayer, failedLayer].filter(Boolean));
    if (fit && visible && visible.getLayers().length) {
      map.fitBounds(visible.getBounds(), { padding: [28, 28], maxZoom: next === "all" ? 13 : 14 });
    }
    if (!activeId && status) {
      status.textContent = next === "passed"
        ? "Fourteen parcels that fit a conceptual pad, on the 2021 lidar hillshade used for the ranking."
        : next === "failed"
          ? "Forty parcels that did not fit a 7.4- or 16.3-acre pad under the stated screens. Click one to see the ground."
          : "All 54 screened parcels on 2021 lidar hillshade. Green passed; brown did not.";
    }
  };

  const describe = feature => {
    const p = feature.properties;
    if (p.passed) {
      return `${String(p.rank).padStart(2, "0")} · ${p.label}, ${p.town} · $${Number(p.psf).toFixed(2)}/pad SF · ${p.yd3.toLocaleString("en-US")} yd³ modeled`;
    }
    return `${p.label}, ${p.town} · ${p.acres} ac · ${p.constrained}% mapped constraints · no contiguous pad fit`;
  };

  const setOutlines = on => {
    outlinesOn = on;
    if (outlinesButton) {
      outlinesButton.classList.toggle("on", on);
      outlinesButton.setAttribute("aria-pressed", String(on));
      outlinesButton.textContent = on ? "Outlines on" : "Outlines off";
    }
    setFilter(filter, false);
  };

  const showSite = id => {
    const feature = featuresById.get(id);
    if (!feature) return;
    activeId = id;
    if (!outlinesOn) setOutlines(true);
    if (feature.properties.passed && filter === "failed") setFilter("all");
    if (!feature.properties.passed && filter === "passed") setFilter("all");
    const layer = L.geoJSON(feature);
    map.fitBounds(layer.getBounds(), { padding: [36, 36], maxZoom: 17 });
    restyle();
    if (status) status.textContent = describe(feature);
    if (jump && !feature.properties.passed) jump.value = id;
  };

  map = L.map(mapRoot, {
    zoomControl: true,
    attributionControl: true,
    minZoom: 10,
    maxZoom: 19,
    scrollWheelZoom: true
  });

  map.createPane("imageryPane");
  map.getPane("imageryPane").style.zIndex = 200;
  map.createPane("lidarPane");
  map.getPane("lidarPane").style.zIndex = 350;
  map.createPane("highwayPane");
  map.getPane("highwayPane").style.zIndex = 400;
  map.createPane("parcelPane");
  map.getPane("parcelPane").style.zIndex = 450;

  L.tileLayer(IMAGERY, {
    pane: "imageryPane",
    maxZoom: 19,
    attribution: "Imagery © Esri"
  }).addTo(map);

  L.tileLayer(HILLSHADE, {
    pane: "lidarPane",
    maxZoom: 19,
    attribution: "Hillshade © MassGIS (2021 bare-earth lidar) · Parcels © MassGIS L3"
  }).addTo(map);

  frame.tabIndex = 0;
  frame.setAttribute("role", "slider");
  frame.setAttribute("aria-label", "Compare aerial imagery with LiDAR bare-earth hillshade");
  frame.setAttribute("aria-valuemin", "2");
  frame.setAttribute("aria-valuemax", "98");

  if (bar) {
    let dragging = false;
    const setFromPointer = event => {
      const bounds = frame.getBoundingClientRect();
      fraction = Math.max(0.02, Math.min(0.98, (event.clientX - bounds.left) / bounds.width));
      clip();
    };
    bar.addEventListener("pointerdown", event => {
      dragging = true;
      bar.setPointerCapture(event.pointerId);
      setFromPointer(event);
      event.stopPropagation();
    });
    bar.addEventListener("pointermove", event => {
      if (dragging) setFromPointer(event);
    });
    ["pointerup", "pointercancel"].forEach(name => {
      bar.addEventListener(name, () => { dragging = false; });
    });
  }

  frame.addEventListener("keydown", event => {
    const old = fraction;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") fraction -= 0.02;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") fraction += 0.02;
    if (event.key === "Home") fraction = 0.02;
    if (event.key === "End") fraction = 0.98;
    fraction = Math.max(0.02, Math.min(0.98, fraction));
    if (fraction !== old) {
      event.preventDefault();
      clip();
    }
  });

  const setFullScreen = on => {
    frame.classList.toggle("fs", on);
    document.body.style.overflow = on ? "hidden" : "";
    if (fullScreenButton) {
      fullScreenButton.textContent = on ? "✕" : "⛶";
      fullScreenButton.setAttribute("aria-label", on ? "Close fullscreen map" : "Open fullscreen map");
      fullScreenButton.setAttribute("aria-pressed", String(on));
    }
    map.invalidateSize();
    clip();
    frame.focus();
  };

  if (fullScreenButton) {
    fullScreenButton.addEventListener("click", () => setFullScreen(!frame.classList.contains("fs")));
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && frame.classList.contains("fs")) setFullScreen(false);
    });
  }

  const goTo = id => {
    frame.scrollIntoView({ behavior: "smooth", block: "center" });
    showSite(id);
  };

  filterButtons.forEach(button => {
    button.addEventListener("click", () => {
      activeId = null;
      restyle();
      setFilter(button.dataset.p04Filter);
    });
  });

  siteButtons.forEach(node => {
    const activate = () => goTo(node.dataset.p04Id);
    node.addEventListener("click", activate);
    node.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    });
  });

  if (jump) {
    jump.addEventListener("change", () => {
      if (jump.value) goTo(jump.value);
    });
  }

  if (outlinesButton) {
    outlinesButton.addEventListener("click", () => setOutlines(!outlinesOn));
  }

  const setHighway = on => {
    highwayOn = on;
    if (highwayButton) {
      highwayButton.classList.toggle("on", on);
      highwayButton.setAttribute("aria-pressed", String(on));
      highwayButton.textContent = on ? "I-495 on" : "I-495 off";
    }
    if (!highwayLayer) return;
    if (on) highwayLayer.addTo(map);
    else map.removeLayer(highwayLayer);
  };

  if (highwayButton) {
    highwayButton.addEventListener("click", () => setHighway(!highwayOn));
  }

  fetch("data/p04-i495.geojson")
    .then(response => (response.ok ? response.json() : Promise.reject(new Error("highway missing"))))
    .then(collection => {
      highwayLayer = L.geoJSON(collection, {
        pane: "highwayPane",
        interactive: false,
        style: { color: "#ffb400", weight: 2.4, opacity: 0.9 }
      });
      if (highwayOn) highwayLayer.addTo(map);
      map.attributionControl.addAttribution("I-495 © OpenStreetMap contributors");
    })
    .catch(() => {
      if (highwayButton) highwayButton.hidden = true;
    });

  const bindLayer = feature => {
    featuresById.set(feature.properties.id, feature);
    return {
      pane: "parcelPane",
      style: styleFor(feature),
      onEachFeature: (item, layer) => {
        const p = item.properties;
        const tip = p.passed
          ? `${String(p.rank).padStart(2, "0")} · ${p.label}`
          : `${p.label} · no pad fit`;
        layer.bindTooltip(tip, { sticky: true });
        layer.on("click", () => showSite(p.id));
      }
    };
  };

  fetch("data/p04-parcels.geojson")
    .then(response => {
      if (!response.ok) throw new Error("parcels missing");
      return response.json();
    })
    .then(collection => {
      const passed = collection.features.filter(feature => feature.properties.passed);
      const failed = collection.features.filter(feature => !feature.properties.passed);
      passedLayer = L.geoJSON({ type: "FeatureCollection", features: passed }, bindLayer(passed[0]));
      failedLayer = L.geoJSON({ type: "FeatureCollection", features: failed }, bindLayer(failed[0]));
      passed.forEach(feature => featuresById.set(feature.properties.id, feature));
      failed.forEach(feature => featuresById.set(feature.properties.id, feature));
      passedLayer.addTo(map);
      failedLayer.addTo(map);
      if (jump) {
        const byTown = new Map();
        failed.forEach(feature => {
          const town = feature.properties.town;
          if (!byTown.has(town)) byTown.set(town, []);
          byTown.get(town).push(feature);
        });
        [...byTown.keys()].sort().forEach(town => {
          const group = document.createElement("optgroup");
          group.label = town;
          byTown.get(town).sort((a, b) => a.properties.label.localeCompare(b.properties.label)).forEach(feature => {
            const option = document.createElement("option");
            option.value = feature.properties.id;
            option.textContent = `${feature.properties.label} · ${feature.properties.constrained}% constrained`;
            group.append(option);
          });
          jump.append(group);
        });
      }
      if (fallback) fallback.hidden = true;
      mapRoot.classList.add("ready");
      setFilter("all");
      requestAnimationFrame(() => {
        map.invalidateSize();
        clip();
      });
    })
    .catch(() => {
      if (status) status.textContent = "Map tiles are available; parcel outlines did not load.";
      map.setView([42.12, -71.47], 12);
      clip();
    });

  map.on("resize move zoom", clip);
})();
