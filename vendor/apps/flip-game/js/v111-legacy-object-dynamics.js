// v111-legacy-object-dynamics.js -- paint-only motion metadata for the
// original Bottle plus the existing 25-object ladder.
//
// This module never owns Matter bodies, result timing, RNG outcomes, scoring,
// colliders or landing rules. Every rendered offset is derived from the input
// state so seed replay/screenshot capture is deterministic. T-Rex is an
// explicit protected exception: its face anchor is documented for camera
// framing, but this module never paints over or animates its original art.
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipLegacyDynamicsV111 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const INK = '#2a2430';
  const IDS = Object.freeze([
    'bottle', 'ketchup', 'maple', 'honeybear', 'babybottle', 'extinguisher',
    'soap', 'hourglass', 'bowlingpin', 'cone', 'flask', 'shell', 'pawn',
    'buoy', 'wineglass', 'toucan', 'trex', 'whippedcream', 'potion',
    'tabasco', 'coke', 'stanley', 'lavalamp', 'lawnchair', 'octopus', 'alien',
  ]);

  function freezeDeep(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freezeDeep(value[key]); });
    return Object.freeze(value);
  }

  function face(x, y, scale, radius, supportsEmotion) {
    return freezeDeep({
      anchor: { x: x, y: y },
      scale: scale == null ? 1 : scale,
      focusRadius: radius == null ? 52 : radius,
      supportsEmotion: supportsEmotion !== false,
    });
  }

  function profile(kind, visible, canSpill, faceMeta, extra) {
    return freezeDeep(Object.assign({
      kind: kind,
      visible: visible !== false,
      canSpill: !!canSpill,
      paintOnly: true,
      face: faceMeta,
    }, extra || {}));
  }

  const PROFILES = freezeDeep({
    bottle:       profile('sealed-liquid', true, false, face(0, -31, 0.82, 48, false)),
    ketchup:      profile('sealed-liquid', true, false, face(0, -22, 0.78, 46, false), { viscosity: 0.78 }),
    maple:        profile('sealed-liquid', true, false, face(0, -25, 0.82, 48, false), { viscosity: 0.68 }),
    honeybear:    profile('sealed-liquid', true, false, face(0, -84, 0.82, 50, false), { viscosity: 0.84 }),
    babybottle:   profile('sealed-liquid', true, false, face(0, -35, 0.78, 46, false)),
    extinguisher: profile('flexible-hose', true, false, face(0, -33, 0.78, 48, false)),
    soap:         profile('sealed-liquid-bubbles', true, false, face(0, -27, 0.78, 48, false)),
    hourglass:    profile('granular', true, false, face(0, -22, 0.75, 46, false)),
    bowlingpin:   profile('rigid', false, false, face(0, -55, 0.82, 48)),
    cone:         profile('rigid', false, false, face(0, -18, 0.82, 50)),
    flask:        profile('open-liquid', true, true, face(0, -31, 0.82, 50, false)),
    shell:        profile('rigid', false, false, face(0, -26, 0.76, 46, false)),
    pawn:         profile('rigid', false, false, face(0, -46, 0.84, 50)),
    buoy:         profile('rigid', false, false, face(0, -47, 0.78, 46, false)),
    wineglass:    profile('open-liquid', true, true, face(0, -91, 0.76, 48, false)),
    toucan:       profile('flexible-wing', true, false, face(21, -128, 0.62, 46, false)),
    // Protected invariant: camera may frame the existing eye, but no emotion
    // or dynamics layer may alter the original dinosaur rendering.
    trex:         profile('protected-rigid', false, false, face(89, -180, 0.68, 54, false), { protected: true }),
    whippedcream: profile('sealed-opaque', false, false, face(0, -27, 0.76, 46)),
    potion:       profile('sealed-liquid-suspension', true, false, face(0, -29, 0.78, 48, false)),
    tabasco:      profile('sealed-liquid', true, false, face(0, -28, 0.72, 44, false), { viscosity: 0.42 }),
    coke:         profile('sealed-carbonated', true, false, face(0, -34, 0.72, 44, false)),
    stanley:      profile('sealed-opaque', false, false, face(0, -25, 0.8, 48, false)),
    lavalamp:     profile('sealed-globules', true, false, face(0, -31, 0.76, 48, false)),
    lawnchair:    profile('rigid', false, false, face(0, -37, 0.82, 50)),
    octopus:      profile('flexible-tentacles', true, false, face(0, -80, 0.82, 54, false)),
    alien:        profile('flexible-species', true, false, face(0, -137, 0.76, 58)),
  });

  function finite(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }

  function normalizeAngle(value) {
    let angle = finite(value, 0) % (Math.PI * 2);
    if (angle > Math.PI) angle -= Math.PI * 2;
    if (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  function normalizeState(options) {
    const opts = options && typeof options === 'object' ? options : {};
    const reducedMotion = !!opts.reducedMotion;
    const angle = normalizeAngle(opts.angle);
    const rawVelocity = opts.velocity && typeof opts.velocity === 'object' ? opts.velocity : {};
    const velocity = {
      x: reducedMotion ? 0 : clamp(finite(rawVelocity.x, 0), -5000, 5000),
      y: reducedMotion ? 0 : clamp(finite(rawVelocity.y, 0), -5000, 5000),
    };
    const slosh = reducedMotion ? 0 : clamp(finite(opts.slosh, 0), -1, 1);
    const angularVelocity = reducedMotion ? 0 : clamp(finite(opts.angularVelocity, 0), -80, 80);
    const emotion = ['idle', 'scared', 'smile', 'frown'].includes(opts.emotion) ? opts.emotion : 'idle';
    const state = {
      mode: String(opts.mode || 'gameplay'),
      time: reducedMotion ? 0 : Math.max(0, finite(opts.time, 0)),
      motionSeed: Math.trunc(finite(opts.motionSeed, 0)) >>> 0,
      reducedMotion: reducedMotion,
      selected: !!opts.selected,
      angle: angle,
      slosh: slosh,
      angularVelocity: angularVelocity,
      velocity: freezeDeep(velocity),
      airborne: !!opts.airborne,
      contact: !!opts.contact,
      impact: reducedMotion ? 0 : clamp(finite(opts.impact, 0), 0, 1),
      emotion: emotion,
      gravityLocal: freezeDeep({ x: Math.sin(angle), y: Math.cos(angle) }),
      surfaceAngle: normalizeAngle(-angle + slosh * 0.24),
      contentShift: freezeDeep({
        x: reducedMotion ? 0 : clamp(-slosh * 10 + velocity.x * 0.012, -16, 16),
        y: reducedMotion ? 0 : clamp(velocity.y * 0.004, -9, 9),
      }),
      accessoryLag: reducedMotion ? 0 : clamp(-angularVelocity * 0.035 - slosh * 0.14, -0.38, 0.38),
      inverted: Math.cos(angle) < 0,
      outwardMotion: reducedMotion ? 0 : clamp(Math.hypot(velocity.x, velocity.y) / 950 + Math.abs(angularVelocity) / 24, 0, 1),
    };
    return freezeDeep(state);
  }

  function profileFor(id) { return PROFILES[String(id || '')] || null; }
  function faceFor(id) {
    const entry = profileFor(id);
    return entry ? entry.face : null;
  }

  function physicalDynamicsSnapshot(id, options) {
    const entry = profileFor(id);
    if (!entry) return null;
    const state = normalizeState(options);
    return freezeDeep({
      objectId: String(id),
      kind: entry.kind,
      paintOnly: true,
      visible: entry.visible,
      canSpill: entry.canSpill,
      protected: !!entry.protected,
      reducedMotion: state.reducedMotion,
      surfaceAngle: state.surfaceAngle,
      contentShift: state.contentShift,
      accessoryLag: state.accessoryLag,
      inverted: state.inverted,
      outwardMotion: state.outwardMotion,
      emotion: entry.face.supportsEmotion ? state.emotion : 'idle',
    });
  }

  function safeSave(ctx) { if (ctx && typeof ctx.save === 'function') ctx.save(); }
  function safeRestore(ctx) { if (ctx && typeof ctx.restore === 'function') ctx.restore(); }

  // Underlays peek around already-authored silhouettes. They are intentionally
  // small and never move the sprite/contact plane itself.
  function paintUnderlay(ctx, id, options) {
    const entry = profileFor(id);
    if (!entry || entry.protected || !ctx) return false;
    const state = normalizeState(options);
    safeSave(ctx);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (id === 'octopus') {
      const lag = state.accessoryLag * 34;
      ctx.strokeStyle = options && options.color || '#ff5b86';
      ctx.lineWidth = 12;
      for (let i = -1; i <= 1; i++) {
        const x = i * 23;
        ctx.beginPath();
        ctx.moveTo(x, -31);
        ctx.bezierCurveTo(x + lag * 0.25, -5, x - lag * 0.55, 18, x + lag, 36);
        ctx.stroke();
      }
      safeRestore(ctx);
      return true;
    }
    if (id === 'toucan') {
      const lag = state.accessoryLag * 22;
      ctx.fillStyle = options && options.color || '#e3263c';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-20, -78);
      ctx.quadraticCurveTo(-47 - lag, -45, -28 + lag, -12);
      ctx.quadraticCurveTo(-9, -38, -4, -70);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      safeRestore(ctx);
      return true;
    }
    safeRestore(ctx);
    return false;
  }

  function paintFace(ctx, metadata, emotion) {
    if (!metadata || !metadata.supportsEmotion || emotion === 'idle') return false;
    const x = metadata.anchor.x;
    const y = metadata.anchor.y;
    const scale = metadata.scale;
    safeSave(ctx);
    if (typeof ctx.translate === 'function') ctx.translate(x, y);
    if (typeof ctx.scale === 'function') ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.6;
    const eyeY = emotion === 'scared' ? -7 : -5;
    for (const eyeX of [-10, 10]) {
      ctx.beginPath();
      ctx.ellipse(eyeX, eyeY, emotion === 'scared' ? 6.4 : 5.4,
        emotion === 'scared' ? 7.8 : 6.1, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(eyeX, eyeY + (emotion === 'frown' ? 1 : 0), 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    if (emotion === 'scared') {
      ctx.fillStyle = INK;
      ctx.ellipse(0, 11, 6.2, 8.6, 0, 0, Math.PI * 2); ctx.fill();
    } else if (emotion === 'smile') {
      ctx.arc(0, 5, 11, 0.2, Math.PI - 0.2); ctx.stroke();
    } else {
      ctx.arc(0, 17, 10, Math.PI + 0.25, Math.PI * 2 - 0.25); ctx.stroke();
    }
    safeRestore(ctx);
    return true;
  }

  function paintOverlay(ctx, id, options) {
    const entry = profileFor(id);
    if (!entry || entry.protected || !ctx) return false;
    const state = normalizeState(options);
    let painted = false;
    if (id === 'extinguisher') {
      const lag = state.accessoryLag * 35;
      safeSave(ctx);
      ctx.strokeStyle = '#171b20';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(18, -114); ctx.bezierCurveTo(48 + lag, -94, 46 - lag, -45, 28 + lag, -27); ctx.stroke();
      ctx.fillStyle = '#333940';
      ctx.beginPath(); ctx.roundRect(22 + lag, -34, 13, 25, 4); ctx.fill();
      safeRestore(ctx);
      painted = true;
    }
    if (id === 'octopus') {
      safeSave(ctx);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < 5; i++) {
        const lag = state.accessoryLag * (8 + i);
        ctx.beginPath(); ctx.arc(-29 + i * 14 + lag, 12 + (i % 2) * 10, 2.2, 0, Math.PI * 2); ctx.fill();
      }
      safeRestore(ctx);
      painted = true;
    }
    return paintFace(ctx, entry.face, state.emotion) || painted;
  }

  return freezeDeep({
    ids: IDS,
    profileFor: profileFor,
    faceFor: faceFor,
    normalizeState: normalizeState,
    physicalDynamicsSnapshot: physicalDynamicsSnapshot,
    paintUnderlay: paintUnderlay,
    paintOverlay: paintOverlay,
  });
});
