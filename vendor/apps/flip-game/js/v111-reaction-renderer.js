// v111-reaction-renderer.js -- paint-only reaction state and camera helpers.
//
// This module is deliberately independent of physics and game rules. It only
// validates authored face metadata, maps an already-final verdict to artwork,
// and derives a short-lived camera hint. Unsupported objects remain untouched.
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipReactionRendererV111 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const EMOTIONS = Object.freeze(['idle', 'scared', 'smile', 'frown']);

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function freezeFace(anchor, scale, focusRadius, source) {
    return Object.freeze({
      anchor: Object.freeze({ x: anchor.x, y: anchor.y }),
      scale: scale,
      focusRadius: focusRadius,
      supportsEmotion: true,
      source: source,
    });
  }

  // Face anchors authored in the 300x420 art space are converted into the
  // local coordinates used by Skins.draw. Legacy anchors are already local.
  function normalizeFace(raw, metrics, source) {
    if (!raw || raw.supportsEmotion !== true || !raw.anchor) return null;
    const x = Number(raw.anchor.x);
    const y = Number(raw.anchor.y);
    const scale = Number(raw.scale == null ? 1 : raw.scale);
    const radius = Number(raw.focusRadius);
    if (![x, y, scale, radius].every(Number.isFinite) || scale <= 0 || radius <= 0) return null;

    const designSpace = source !== 'legacy' && metrics && metrics.pivot;
    if (designSpace) {
      const artScale = finite(metrics.artScale, 0.74);
      return freezeFace({
        x: (x - finite(metrics.pivot.x, 150)) * artScale,
        y: (y - finite(metrics.pivot.y, 376)) * artScale,
      }, scale, radius * artScale, source || 'render-variant');
    }
    return freezeFace({ x: x, y: y }, scale, radius, source || 'legacy');
  }

  function camelId(id) {
    return String(id || '').replace(/-([a-z])/g, function (_, letter) { return letter.toUpperCase(); });
  }

  function packFace(root, id, variantId) {
    for (const name of ['FlipArtV111PackA', 'FlipArtV111PackB', 'FlipArtV111PackC']) {
      const pack = root && root[name];
      if (!pack) continue;
      let face = null;
      if (typeof pack.faceFor === 'function') face = pack.faceFor(id, variantId);
      if (!face && pack.faces) face = pack.faces[id] || pack.faces[camelId(id)];
      if (!face && pack[id]) face = pack[id].face || pack[id];
      if (!face && pack[camelId(id)]) face = pack[camelId(id)].face || pack[camelId(id)];
      if (face) return face;
    }
    return null;
  }

  // Metadata is authoritative: there is intentionally no generic face anchor
  // and no inferred allowlist. Any absent, malformed, or false entry is safe.
  function faceFor(root, objectId, variantId) {
    const host = root || {};
    const art = host.FlipArtV111;
    if (art && typeof art.getRenderVariant === 'function') {
      try {
        const variant = art.getRenderVariant(objectId, variantId || 'blue-steel');
        const direct = normalizeFace(variant && variant.face, variant && variant.metrics, 'render-variant');
        if (direct) return direct;
      } catch (_) {}
    }

    const packed = packFace(host, objectId, variantId);
    if (packed) {
      let metrics = null;
      try {
        metrics = art && typeof art.getRenderVariant === 'function'
          ? art.getRenderVariant(objectId, variantId || 'blue-steel').metrics : null;
      } catch (_) {}
      const normalized = normalizeFace(packed.face || packed, metrics, 'art-pack');
      if (normalized) return normalized;
    }

    const legacy = host.FlipLegacyDynamicsV111;
    if (legacy && typeof legacy.faceFor === 'function') {
      return normalizeFace(legacy.faceFor(objectId), null, 'legacy');
    }
    return null;
  }

  function emotionFor(result, lifecycle) {
    if (result === 'MAKE') return 'smile';
    if (result === 'MISS') return 'frown';
    const phase = lifecycle && lifecycle.phase;
    return phase === 'airborne' || phase === 'contact' || phase === 'settling'
      ? 'scared' : 'idle';
  }

  function seed32(value) {
    const input = String(value == null ? '' : value);
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function motionSeed(flipSeed, objectId, variantId) {
    return seed32(String(flipSeed == null ? '' : flipSeed) + '|' +
      String(objectId || '') + '|' + String(variantId || ''));
  }

  function artState(input) {
    const state = input || {};
    const lifecycle = state.lifecycle || {};
    const velocity = state.velocity || {};
    const result = state.result === 'MAKE' || state.result === 'MISS' ? state.result : null;
    const flipSeed = state.flipSeed == null ? 0 : state.flipSeed;
    const objectId = String(state.objectId || 'bottle');
    const variantId = String(state.variantId || 'blue-steel');
    const reducedMotion = !!state.reducedMotion;
    return Object.freeze({
      mode: 'gameplay',
      time: Math.max(0, finite(state.time, 0)),
      elapsed: Math.max(0, finite(state.time, 0)),
      motionSeed: motionSeed(flipSeed, objectId, variantId),
      flipSeed: flipSeed,
      reducedMotion: reducedMotion,
      angle: finite(state.angle, 0),
      slosh: reducedMotion ? 0 : clamp(finite(state.slosh, 0), -1, 1),
      angularVelocity: reducedMotion ? 0 : clamp(finite(state.angularVelocity, 0), -80, 80),
      velocity: Object.freeze({
        x: reducedMotion ? 0 : clamp(finite(velocity.x, 0), -5000, 5000),
        y: reducedMotion ? 0 : clamp(finite(velocity.y, 0), -5000, 5000),
      }),
      airborne: lifecycle.phase === 'airborne',
      contact: lifecycle.phase === 'contact' || lifecycle.phase === 'settling',
      impact: reducedMotion ? 0 : clamp(finite(state.impact,
        lifecycle.phase === 'contact' ? Math.hypot(finite(velocity.x, 0), finite(velocity.y, 0)) / 900 : 0), 0, 1),
      emotion: emotionFor(result, lifecycle),
    });
  }

  function ease(value) {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  }

  function focusStrength(elapsed, reducedMotion) {
    if (reducedMotion) return 0.06;
    if (elapsed < 0.14) return ease(elapsed / 0.14);
    if (elapsed < 0.46) return 1;
    if (elapsed < 0.76) return 1 - ease((elapsed - 0.46) / 0.30);
    return 0;
  }

  function clampCameraToFace(view, point, radius, width, height, zoom) {
    const pad = Math.min(72, Math.max(22, Math.min(width, height) * 0.055)) + radius * zoom;
    const halfX = Math.max(1, width / 2 - pad) / zoom;
    const halfY = Math.max(1, height / 2 - pad) / zoom;
    return {
      x: clamp(view.x, point.x - halfX, point.x + halfX),
      y: clamp(view.y, point.y - halfY, point.y + halfY),
    };
  }

  function createFocusController() {
    let activeKey = null;
    let elapsed = 0;
    return Object.freeze({
      next: function (request) {
        const req = request || {};
        const base = req.view || {};
        const width = Math.max(1, finite(req.width, 1));
        const height = Math.max(1, finite(req.height, 1));
        const baseZoom = Math.max(0.05, finite(base.zoom, 1));
        const baseX = finite(base.camX, width / 2);
        const baseY = finite(base.camY, height / 2);
        const face = req.face;
        const point = req.point;
        const eligible = (req.result === 'MAKE' || req.result === 'MISS') && face &&
          face.supportsEmotion === true && point && Number.isFinite(point.x) && Number.isFinite(point.y);
        if (!eligible) {
          activeKey = null;
          elapsed = 0;
          return base;
        }

        const key = String(req.key == null ? '' : req.key) + '|' + req.result;
        if (key !== activeKey) {
          activeKey = key;
          elapsed = 0;
        } else {
          elapsed += clamp(finite(req.dt, 0), 0, 0.1);
        }
        const strength = focusStrength(elapsed, !!req.reducedMotion);
        if (strength <= 0) return base;

        const minDimension = Math.min(width, height);
        const extra = req.reducedMotion ? 0.025 : (minDimension < 500 ? 0.075 : (minDimension < 900 ? 0.105 : 0.14));
        const targetZoom = baseZoom * (1 + extra * strength);
        const centerBlend = (req.reducedMotion ? 0.07 : 0.24) * strength;
        const desired = {
          x: baseX + (point.x - baseX) * centerBlend,
          y: baseY + (point.y - baseY) * centerBlend,
        };
        const framed = clampCameraToFace(desired, point,
          Math.max(1, finite(req.radius, face.focusRadius || 1)), width, height, targetZoom);
        return Object.assign({}, base, {
          zoom: targetZoom,
          camX: framed.x,
          camY: framed.y,
          tracking: 'reaction',
          reactionFocus: true,
        });
      },
      reset: function () { activeKey = null; elapsed = 0; },
    });
  }

  return Object.freeze({
    emotions: EMOTIONS,
    normalizeFace: normalizeFace,
    faceFor: faceFor,
    emotionFor: emotionFor,
    motionSeed: motionSeed,
    artState: artState,
    focusStrength: focusStrength,
    createFocusController: createFocusController,
  });
});
