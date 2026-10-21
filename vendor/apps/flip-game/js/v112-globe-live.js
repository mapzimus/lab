// Lazy shared spherical rendering for the existing authored Desk Globe stand.
(function (root, factory) {
  'use strict';
  const Globe = typeof module === 'object' && module.exports ? require('./v112-globe.js') : root.FlipGlobeV112;
  const api = factory(root, Globe);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root) root.FlipgameV112GlobeLive = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, Globe) {
  'use strict';
  const DATA_URL = 'data/v112-globe/natural-earth-land-110m.geojson';
  const TAU = Math.PI * 2, SPEED = .34, SIZE = 384;
  const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
  const wrap = value => ((value + Math.PI) % TAU + TAU) % TAU - Math.PI;
  function orientationFor(input) {
    const o = input || {}, state = o.state || {}, dynamics = o.dynamics || state;
    const index = Math.max(0, Math.min(11, Math.floor(finite(o.variantIndex))));
    const seed = state.flipSeed == null ? state.motionSeed : state.flipSeed;
    const seedPhase = seed == null || !Globe ? (-25 + index * 29) * Math.PI / 180
      : Globe.hashText('desk-globe-orientation/v1:' + String(seed) + ':' + index) / 4294967296 * TAU;
    const phase = finite(state.globePhaseRad, seedPhase);
    const spin = state.reducedMotion ? 0 : Math.max(0, finite(state.time)) * SPEED;
    const counterspin = state.reducedMotion ? 0 :
      Math.max(-Math.PI, Math.min(Math.PI, finite(dynamics.angle, finite(state.angle)) * .32 + finite(dynamics.accessoryLag) * .16));
    return Object.freeze({ centerLon: wrap(phase + spin - counterspin), centerLat: 12 * Math.PI / 180 });
  }
  function create(options) {
    const deps = options || {}, globe = deps.globe || Globe;
    const doc = deps.document || root.document;
    const fetcher = deps.fetch || (typeof root.fetch === 'function' ? root.fetch.bind(root) : null);
    let geography = deps.geography || null, pending = null, surface = null, status = 'idle';
    let canvas = null, focusCanvas = null, degraded = false, lost = false, disposed = false, surfaceCreations = 0;
    let lastOrientation = null;
    function makeSurface(forceCanvas) {
      if (!doc || typeof doc.createElement !== 'function') throw new Error('Canvas unavailable');
      const next = doc.createElement('canvas'); next.width = next.height = SIZE;
      const created = globe.createSharedSurface(next, { document: doc, geography, forceCanvas });
      if (typeof next.addEventListener === 'function') next.addEventListener('webglcontextlost', event => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        lost = true;
      });
      canvas = next; surface = created; surfaceCreations++; status = forceCanvas ? 'canvas' : created.info().rendererKind;
      return created;
    }
    function fallback() {
      if (degraded || disposed) return false;
      degraded = true; lost = false;
      try { if (surface) surface.destroy(); } catch (_) {}
      surface = null;
      try { makeSurface(true); return true; } catch (_) { status = 'failed'; return false; }
    }
    function initialize() {
      if (disposed || !geography || !globe) return false;
      try { makeSurface(!!deps.forceCanvas); degraded = !!deps.forceCanvas; return true; }
      catch (_) { return fallback(); }
    }
    function prewarm() {
      if (disposed) return Promise.resolve(false);
      if (surface) return Promise.resolve(true);
      if (pending) return pending;
      status = 'loading';
      pending = Promise.resolve().then(async () => {
        if (!globe) throw new Error('Globe renderer unavailable');
        geography = geography || globe.getBundledGeography();
        if (!geography) {
          if (!fetcher) throw new Error('Local geography unavailable');
          // Fixed app-relative path, no redirects, no user-supplied URL and no
          // remote fallback. File-origin APK may seed setGeography at boot.
          const response = await fetcher(DATA_URL, { redirect: 'error', credentials: 'same-origin' });
          if (!response || response.ok === false || typeof response.json !== 'function') throw new Error('Local geography unavailable');
          geography = await response.json();
        }
        if (disposed) return false;
        globe.setBundledGeography(geography);
        const ready = initialize();
        if (ready && typeof deps.onReady === 'function') { try { deps.onReady(); } catch (_) {} }
        return ready;
      }).catch(() => { if (!disposed) status = 'failed'; return false; });
      return pending;
    }
    function setGeography(data) {
      if (disposed || surface || pending) return false;
      try { globe.setBundledGeography(data); geography = data; return true; } catch (_) { return false; }
    }
    function render(request) {
      if (disposed || !surface) return null;
      if (lost && !fallback()) return null;
      let output;
      try { output = surface.render(request); }
      catch (_) { if (!fallback()) return null; try { output = surface.render(request); } catch (_) { status = 'failed'; return null; } }
      const zoom = Math.max(1, Math.min(2.65, finite(request && request.zoom, 1)));
      if (zoom === 1 || !output || !output.canvas) return output;
      try {
        // One lazy 2D focus target, never another GPU context. Magnifies the
        // already-rendered real geography rather than inventing a map closeup.
        if (!focusCanvas) { focusCanvas = doc.createElement('canvas'); focusCanvas.width = focusCanvas.height = SIZE; }
        const focus = focusCanvas.getContext('2d');
        if (!focus) return output;
        focus.clearRect(0, 0, SIZE, SIZE);
        const crop = SIZE / zoom, inset = (SIZE - crop) / 2;
        focus.drawImage(output.canvas, inset, inset, crop, crop, 0, 0, SIZE, SIZE);
        return Object.freeze({ ...output, canvas: focusCanvas, zoom });
      } catch (_) { return output; }
    }
    // The shared proxy survives a WebGL-to-Canvas transition; callers never
    // hold a failed GPU surface or create a separate showcase context.
    const shared = Object.freeze({ render, info: () => Object.freeze({ status, size: SIZE, surfaceCreations }) });
    function drawSphere(ctx, input) {
      const o = input || {}, orientation = orientationFor(o);
      const missing = Object.freeze({ handled: false, orientation });
      if (!ctx || typeof ctx.drawImage !== 'function' || !Number.isFinite(o.radius) || o.radius <= 0 ||
          !Number.isFinite(o.centerX) || !Number.isFinite(o.centerY) || disposed) return missing;
      if (!surface) { prewarm(); return missing; }
      const output = render(orientation);
      if (!output || !output.canvas) return missing;
      ctx.save();
      try {
        // Globe renderer leaves an atmospheric margin of 4% around its sphere.
        // Map radius/0.46 to retain the existing authored sphere contact bounds.
        const diameter = o.radius / .46;
        ctx.drawImage(output.canvas, o.centerX - diameter / 2, o.centerY - diameter / 2, diameter, diameter);
      } catch (_) { return missing; } finally { ctx.restore(); }
      lastOrientation = orientation;
      return Object.freeze({ handled: true, orientation });
    }
    function focusView(input) {
      const o = input || {}, orientation = o.orientation || lastOrientation;
      if (disposed || !surface || !orientation || !Number.isFinite(orientation.centerLon) || !Number.isFinite(orientation.centerLat)) return null;
      // Root calls this only for an already-selected Easter egg. No chance roll,
      // rules or global camera lease lives in this paint helper.
      const point = globe.selectVisiblePoint(o.seed == null ? 'focus' : o.seed, { ...orientation, minimumFacing: Math.cos(55 * Math.PI / 180) });
      const duration = Math.max(1, Math.min(2000, finite(o.durationMs, 1300)));
      const progress = Math.max(0, Math.min(1, finite(o.elapsedMs) / duration));
      const amount = o.reducedMotion ? 1 : progress < .3 ? progress / .3 : progress < .72 ? 1 : (1 - progress) / .28;
      const eased = amount * amount * (3 - 2 * amount);
      const request = Object.freeze({ centerLon: wrap(orientation.centerLon + wrap(point.longitude - orientation.centerLon) * eased),
        centerLat: orientation.centerLat + (point.latitude - orientation.centerLat) * eased,
        zoom: 1 + 1.65 * eased });
      return Object.freeze({ globeSurface: shared, globeRequest: request, point, orientation });
    }
    function dispose() {
      disposed = true; status = 'disposed'; try { if (surface) surface.destroy(); } catch (_) {}
      surface = null; canvas = null; focusCanvas = null; geography = null; lastOrientation = null;
    }
    return Object.freeze({ prewarm, setGeography, drawSphere, focusView, orientationFor,
      currentOrientation: () => lastOrientation, sharedSurface: () => surface ? shared : null,
      info: () => Object.freeze({ status, surfaceCreations, size: SIZE, ready: !!surface, disposed }), dispose });
  }
  // Constructing the service allocates no canvas and starts no loading.
  const singleton = create();
  return Object.freeze({ schema: 'GlobeLiveV1', version: 1, visualOnly: true, DATA_URL,
    rotationPeriodSeconds: TAU / SPEED, create, ...singleton });
});
