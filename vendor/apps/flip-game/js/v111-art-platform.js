// v111-art-platform.js — paint-only vector art registry for v111 objects.
//
// This file deliberately has no dependency on Matter.js or the game state. It
// turns immutable object/variant descriptions into lazy RenderVariant painters
// that can be used by setup previews and the gameplay renderer.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipArtV111 = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function () {
  'use strict';

  var ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  var PHYSICS_KEYS = ['physics', 'body', 'hitbox', 'mass', 'collision', 'collisionEnvelope'];
  var MAPPING_TOLERANCE = 1e-9;
  var CANONICAL_MAPPING = Object.freeze({
    pivot: Object.freeze({ x: 150, y: 323.2972972973 }),
    baselineY: 376,
    artScale: 0.74,
    localContactOffset: 39,
  });
  var objects = new Map();
  var renderVariantCache = new Map();

  // Physical-looking art is deliberately kept separate from competitive
  // physics. These immutable profiles describe only what can move *inside* an
  // authored sprite (liquid, granules, gel, packets) and which loose visual
  // part can lag behind the object's rotation. They never alter Matter bodies,
  // collision envelopes, mass, landing tolerance, or scoring.
  var DYNAMICS_PROFILES = Object.freeze({
    'coffee-mug': Object.freeze({ internal: 'liquid', accessory: 'steam', open: true,
      region: Object.freeze({ x: 82, y: 126, width: 118, height: 24 }) }),
    'milk-carton': Object.freeze({ internal: 'liquid', accessory: 'flex',
      region: Object.freeze({ x: 187, y: 244, width: 25, height: 88 }) }),
    'teapot': Object.freeze({ internal: 'liquid', accessory: 'lid',
      region: Object.freeze({ x: 108, y: 282, width: 84, height: 54 }) }),
    'salt-pepper-shaker': Object.freeze({ internal: 'granular', accessory: 'cap',
      region: Object.freeze({ x: 101, y: 254, width: 98, height: 82 }) }),
    'soup-can': Object.freeze({ internal: 'liquid', accessory: 'tab', viscosity: 0.34,
      region: Object.freeze({ x: 188, y: 239, width: 24, height: 88 }) }),
    'smoothie': Object.freeze({ internal: 'liquid', accessory: 'straw', viscosity: 0.28,
      region: Object.freeze({ x: 101, y: 226, width: 98, height: 102 }) }),
    'gumball-machine': Object.freeze({ internal: 'balls', accessory: 'handle',
      region: Object.freeze({ x: 84, y: 104, width: 132, height: 126 }) }),
    'microscope': Object.freeze({ internal: 'none', accessory: 'knob',
      region: Object.freeze({ x: 199, y: 206, width: 36, height: 36 }) }),
    'desk-globe': Object.freeze({ internal: 'none', accessory: 'counterspin',
      region: Object.freeze({ x: 78, y: 74, width: 144, height: 144 }) }),
    'microphone-stand': Object.freeze({ internal: 'none', accessory: 'pendulum',
      region: Object.freeze({ x: 95, y: 95, width: 110, height: 168 }) }),
    'potted-plants': Object.freeze({ internal: 'granular', accessory: 'leaves',
      region: Object.freeze({ x: 104, y: 298, width: 92, height: 42 }) }),
    'penguin': Object.freeze({ internal: 'none', accessory: 'flippers',
      region: Object.freeze({ x: 69, y: 220, width: 162, height: 92 }) }),
    'owl': Object.freeze({ internal: 'none', accessory: 'eyes',
      region: Object.freeze({ x: 94, y: 145, width: 112, height: 64 }) }),
    'giraffe': Object.freeze({ internal: 'none', accessory: 'ears',
      region: Object.freeze({ x: 109, y: 55, width: 82, height: 70 }) }),
    'red-panda': Object.freeze({ internal: 'none', accessory: 'tail',
      region: Object.freeze({ x: 57, y: 215, width: 186, height: 103 }) }),
    'trophy-cup': Object.freeze({ internal: 'none', accessory: 'ribbons',
      region: Object.freeze({ x: 72, y: 159, width: 156, height: 126 }) }),
    'snow-globe': Object.freeze({ internal: 'particles', accessory: 'globe', viscosity: 0.18,
      region: Object.freeze({ x: 76, y: 91, width: 148, height: 153 }) }),
    'eyeball-monster': Object.freeze({ internal: 'gel', accessory: 'iris', viscosity: 0.22,
      region: Object.freeze({ x: 91, y: 116, width: 118, height: 102 }) }),
    'soda-can': Object.freeze({ internal: 'liquid', accessory: 'tab',
      region: Object.freeze({ x: 188, y: 217, width: 24, height: 94 }) }),
    'watering-can': Object.freeze({ internal: 'liquid', accessory: 'droplet', open: true,
      region: Object.freeze({ x: 109, y: 260, width: 82, height: 65 }) }),
    'pinata': Object.freeze({ internal: 'granular', accessory: 'ribbons', viscosity: 0.14,
      region: Object.freeze({ x: 111, y: 231, width: 78, height: 76 }) }),
    'huge-rubber-duck': Object.freeze({ internal: 'none', accessory: 'flippers',
      region: Object.freeze({ x: 74, y: 232, width: 152, height: 88 }) }),
    'action-figures': Object.freeze({ internal: 'none', accessory: 'joints',
      region: Object.freeze({ x: 76, y: 172, width: 148, height: 139 }) }),
    'tall-buildings': Object.freeze({ internal: 'none', accessory: 'antenna',
      region: Object.freeze({ x: 126, y: 39, width: 48, height: 61 }) }),
    'box-of-snacks': Object.freeze({ internal: 'packets', accessory: 'flap',
      region: Object.freeze({ x: 101, y: 176, width: 98, height: 119 }) }),
  });
  var FACE_PROFILES = Object.freeze({
    'coffee-mug': Object.freeze({ anchor: Object.freeze({ x: 141, y: 252 }), scale: 0.82, focusRadius: 73, supportsEmotion: true }),
    'milk-carton': Object.freeze({ anchor: Object.freeze({ x: 150, y: 321 }), scale: 0.72, focusRadius: 74, supportsEmotion: true }),
    'teapot': Object.freeze({ anchor: Object.freeze({ x: 151, y: 290 }), scale: 0.78, focusRadius: 76, supportsEmotion: true }),
    'salt-pepper-shaker': Object.freeze({ anchor: Object.freeze({ x: 150, y: 223 }), scale: 0.75, focusRadius: 68, supportsEmotion: true }),
    'soup-can': Object.freeze({ anchor: Object.freeze({ x: 150, y: 309 }), scale: 0.72, focusRadius: 68, supportsEmotion: true }),
    'smoothie': Object.freeze({ anchor: Object.freeze({ x: 150, y: 304 }), scale: 0.76, focusRadius: 72, supportsEmotion: true }),
    'gumball-machine': Object.freeze({ anchor: Object.freeze({ x: 150, y: 312 }), scale: 0.62, focusRadius: 74, supportsEmotion: true }),
    'microscope': Object.freeze({ anchor: Object.freeze({ x: 150, y: 300 }), scale: 0.62, focusRadius: 70, supportsEmotion: true }),
    'desk-globe': Object.freeze({ anchor: Object.freeze({ x: 150, y: 184 }), scale: 0.82, focusRadius: 58, supportsEmotion: true }),
    'microphone-stand': Object.freeze({ anchor: Object.freeze({ x: 150, y: 105 }), scale: 0.68, focusRadius: 66, supportsEmotion: true }),
    'potted-plants': Object.freeze({ anchor: Object.freeze({ x: 150, y: 337 }), scale: 0.64, focusRadius: 70, supportsEmotion: true }),
    'penguin': Object.freeze({ anchor: Object.freeze({ x: 150, y: 136 }), scale: 0.82, focusRadius: 71, supportsEmotion: true }),
    'owl': Object.freeze({ anchor: Object.freeze({ x: 150, y: 139 }), scale: 0.82, focusRadius: 72, supportsEmotion: true }),
    'giraffe': Object.freeze({ anchor: Object.freeze({ x: 151, y: 67 }), scale: 0.66, focusRadius: 62, supportsEmotion: true }),
    'red-panda': Object.freeze({ anchor: Object.freeze({ x: 150, y: 150 }), scale: 0.76, focusRadius: 71, supportsEmotion: true }),
    'trophy-cup': Object.freeze({ anchor: Object.freeze({ x: 150, y: 174 }), scale: 0.72, focusRadius: 74, supportsEmotion: true }),
    'snow-globe': Object.freeze({ anchor: Object.freeze({ x: 150, y: 190 }), scale: 0.66, focusRadius: 68, supportsEmotion: true }),
    'eyeball-monster': Object.freeze({ anchor: Object.freeze({ x: 150, y: 171 }), scale: 0.86, focusRadius: 79, supportsEmotion: true }),
    'soda-can': Object.freeze({ anchor: Object.freeze({ x: 150, y: 254 }), scale: 0.72, focusRadius: 66, supportsEmotion: true }),
    'watering-can': Object.freeze({ anchor: Object.freeze({ x: 150, y: 285 }), scale: 0.68, focusRadius: 74, supportsEmotion: true }),
    'pinata': Object.freeze({ anchor: Object.freeze({ x: 150, y: 216 }), scale: 0.72, focusRadius: 76, supportsEmotion: true }),
    'huge-rubber-duck': Object.freeze({ anchor: Object.freeze({ x: 194, y: 184 }), scale: 0.72, focusRadius: 72, supportsEmotion: true }),
    'action-figures': Object.freeze({ anchor: Object.freeze({ x: 150, y: 97 }), scale: 0.62, focusRadius: 61, supportsEmotion: true }),
    'tall-buildings': Object.freeze({ anchor: Object.freeze({ x: 150, y: 190 }), scale: 0.68, focusRadius: 66, supportsEmotion: true }),
    'box-of-snacks': Object.freeze({ anchor: Object.freeze({ x: 150, y: 218 }), scale: 0.72, focusRadius: 72, supportsEmotion: true }),
  });
  var EMOTION_ALLOWLIST = Object.freeze({
    penguin: true,
    owl: true,
    giraffe: true,
    'red-panda': true,
    'eyeball-monster': true,
    'huge-rubber-duck': true,
    'action-figures': true,
  });

  function own(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function positive(value, label) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new TypeError(label + ' must be a positive finite number');
    }
    return value;
  }

  function stableId(value, label) {
    var id = String(value == null ? '' : value);
    if (!ID_RE.test(id)) {
      throw new TypeError(label + ' must use lowercase kebab-case');
    }
    return id;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizedAngle(value) {
    var angle = finite(value, 0);
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  function normalizedVelocity(value) {
    var source = value && typeof value === 'object' ? value : {};
    return Object.freeze({
      x: clamp(finite(source.x, 0), -10000, 10000),
      y: clamp(finite(source.y, 0), -10000, 10000),
    });
  }

  function normalizeRenderState(input) {
    var source = input && typeof input === 'object' ? input : {};
    var angle = normalizedAngle(source.angle);
    var slosh = clamp(finite(source.slosh, 0), -1, 1);
    var angularVelocity = clamp(finite(source.angularVelocity, 0), -20, 20);
    var velocity = normalizedVelocity(source.velocity);
    var reducedMotion = !!source.reducedMotion;
    var impact = clamp(finite(source.impact, source.contact ? 0.35 : 0), 0, 1);
    var time = Math.max(0, finite(source.time, finite(source.elapsed, 0)));
    var phase = reducedMotion ? 0 : time;
    var inertia = reducedMotion ? slosh * 0.18
      : clamp(slosh * 0.68 - angularVelocity * 0.045, -1, 1);
    var speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
    var emotion = ['idle', 'scared', 'smile', 'frown'].indexOf(source.emotion) >= 0
      ? source.emotion : 'idle';
    var motionSeed = source.motionSeed == null ? '0' : String(source.motionSeed);
    var flipSeed = source.flipSeed == null ? '0' : String(source.flipSeed);
    return Object.freeze({
      mode: source.mode === 'preview' ? 'preview' : 'gameplay',
      time: time,
      phase: phase,
      reducedMotion: reducedMotion,
      selected: !!source.selected,
      angle: angle,
      slosh: slosh,
      angularVelocity: angularVelocity,
      velocity: velocity,
      speed: speed,
      airborne: !!source.airborne,
      contact: !!source.contact,
      impact: impact,
      emotion: emotion,
      flipSeed: flipSeed,
      motionSeed: motionSeed,
      // World-down expressed in the object's local coordinate frame. After the
      // renderer rotates the sprite, surfaces drawn with -angle remain level.
      gravityLocal: Object.freeze({ x: -Math.sin(angle), y: Math.cos(angle) }),
      surfaceAngle: clamp(-angle + inertia * 0.18, -Math.PI, Math.PI),
      contentShift: Object.freeze({
        x: clamp(-Math.sin(angle) * 18 + inertia * 13, -30, 30),
        y: clamp((1 - Math.cos(angle)) * -10 + impact * 4, -20, 8),
      }),
      accessoryLag: clamp(inertia * 0.32 - Math.sin(angle) * 0.16, -0.48, 0.48),
      inverted: Math.cos(angle) < -0.20,
      outwardMotion: speed > 0.30 || Math.abs(slosh) > 0.24 || !!source.airborne,
    });
  }

  function physicalDynamicsSnapshot(objectId, input) {
    var id = String(objectId || '');
    var profile = DYNAMICS_PROFILES[id];
    if (!profile) throw new Error('Unknown physical-art profile: ' + id);
    var state = normalizeRenderState(input);
    var hasContents = profile.internal !== 'none';
    var canSpill = !!profile.open;
    return Object.freeze({
      objectId: id,
      internal: profile.internal,
      accessory: profile.accessory,
      hasContents: hasContents,
      canSpill: canSpill,
      spilling: canSpill && state.inverted && state.outwardMotion,
      contentShift: hasContents ? state.contentShift : null,
      surfaceAngle: hasContents ? state.surfaceAngle : null,
      accessoryLag: state.accessoryLag,
      gravityLocal: state.gravityLocal,
      impact: state.impact,
      emotion: state.emotion,
      reducedMotion: state.reducedMotion,
    });
  }

  function dynamicProfile(objectId) {
    return DYNAMICS_PROFILES[String(objectId || '')] || null;
  }

  function listDynamicProfiles() {
    return Object.keys(DYNAMICS_PROFILES).map(function (id) {
      return Object.freeze({ id: id, profile: DYNAMICS_PROFILES[id] });
    });
  }

  function pathRoundedRect(ctx, x, y, width, height, radius) {
    var r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function colorWithAlpha(hex, alpha) {
    var raw = String(hex || '#1f9bff').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(raw)) raw = '1f9bff';
    var value = parseInt(raw, 16);
    return 'rgba(' + ((value >> 16) & 255) + ',' + ((value >> 8) & 255) + ',' +
      (value & 255) + ',' + alpha + ')';
  }

  function hashText(text) {
    var hash = 2166136261;
    var value = String(text || '');
    for (var i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function smoothieLiquidColor(state, fallback) {
    var colors = ['#7357ff', '#ff4f78', '#65cb43', '#ff9f2e', '#804be6', '#55cfe8',
      '#2fa45d', '#f06bb1', '#3f70d8', '#ffd24c', '#c92f47', '#f99bd1'];
    var seed = state && state.flipSeed != null && String(state.flipSeed) !== '0'
      ? state.flipSeed : (state && state.motionSeed != null ? state.motionSeed : '0');
    var index = hashText('smoothie:' + seed) % colors.length;
    return colors[index] || fallback;
  }

  function paintLiquidWindow(ctx, profile, state, color) {
    var r = profile.region;
    var snapshot = physicalDynamicsSnapshot(profile.id, state);
    var left = r.x;
    var right = r.x + r.width;
    var mid = r.y + r.height * 0.43 + snapshot.contentShift.y;
    var slope = Math.tan(clamp(snapshot.surfaceAngle, -1.18, 1.18)) * r.width * 0.22;
    var yLeft = clamp(mid - slope, r.y + 8, r.y + r.height - 8);
    var yRight = clamp(mid + slope, r.y + 8, r.y + r.height - 8);

    ctx.save();
    pathRoundedRect(ctx, r.x, r.y, r.width, r.height, Math.min(12, r.width * 0.18));
    ctx.fillStyle = 'rgba(223,247,255,0.78)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(23,32,42,0.82)';
    ctx.lineWidth = 4;
    ctx.stroke();
    if (typeof ctx.clip === 'function' && typeof ctx.fillRect === 'function') {
      ctx.save();
      pathRoundedRect(ctx, r.x + 4, r.y + 4, r.width - 8, r.height - 8,
        Math.min(8, r.width * 0.15));
      ctx.clip();
      ctx.translate(r.x + r.width / 2 + snapshot.contentShift.x * 0.32,
        r.y + r.height * 0.44 + snapshot.contentShift.y);
      ctx.rotate(snapshot.surfaceAngle);
      ctx.fillStyle = colorWithAlpha(color, 0.72);
      ctx.fillRect(-r.width * 1.6, 0, r.width * 3.2, r.height * 2.2);
      ctx.beginPath();
      ctx.moveTo(-r.width * 1.6, 0); ctx.lineTo(r.width * 1.6, 0);
      ctx.strokeStyle = 'rgba(255,255,255,0.88)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
      ctx.restore();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(left + 5, yLeft);
    ctx.lineTo(right - 5, yRight);
    ctx.lineTo(right - 5, r.y + r.height - 5);
    ctx.lineTo(left + 5, r.y + r.height - 5);
    ctx.closePath();
    ctx.fillStyle = colorWithAlpha(color, 0.72);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(left + 5, yLeft);
    ctx.quadraticCurveTo((left + right) / 2 + snapshot.contentShift.x * 0.28,
      (yLeft + yRight) / 2 - state.slosh * 4, right - 5, yRight);
    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  function paintGranules(ctx, profile, state, color, balls) {
    var r = profile.region;
    var snapshot = physicalDynamicsSnapshot(profile.id, state);
    var seed = hashText(profile.id);
    var radius = balls ? 10 : 4;
    var count = balls ? 11 : 15;
    ctx.save();
    ctx.globalAlpha = 0.88;
    for (var i = 0; i < count; i++) {
      var lane = (seed + i * 17) % 7;
      var row = Math.floor(i / 7);
      var x = r.x + 12 + lane * Math.max(5, (r.width - 24) / 6) + snapshot.contentShift.x * (0.28 + row * 0.06);
      var y = r.y + r.height - 12 - row * (balls ? 20 : 12) + snapshot.contentShift.y;
      x = clamp(x, r.x + radius, r.x + r.width - radius);
      y = clamp(y, r.y + radius, r.y + r.height - radius);
      ctx.beginPath();
      ctx.arc(x, y, radius + (balls ? i % 3 : i % 2), 0, Math.PI * 2);
      ctx.fillStyle = balls && i % 3 === 1 ? '#ffd84e'
        : (balls && i % 3 === 2 ? '#ff759e' : colorWithAlpha(color, 0.90));
      ctx.fill();
      ctx.strokeStyle = 'rgba(23,32,42,0.72)';
      ctx.lineWidth = balls ? 2.5 : 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  function paintParticles(ctx, profile, state, color) {
    var r = profile.region;
    var snapshot = physicalDynamicsSnapshot(profile.id, state);
    var phase = state.reducedMotion ? 0 : state.phase;
    ctx.save();
    for (var i = 0; i < 13; i++) {
      var orbit = phase * (0.7 + (i % 4) * 0.09) + i * 2.17;
      var x = r.x + r.width / 2 + Math.cos(orbit) * (r.width * (0.18 + (i % 3) * 0.08)) + snapshot.contentShift.x * 0.62;
      var y = r.y + r.height / 2 + Math.sin(orbit) * (r.height * (0.18 + (i % 4) * 0.055)) + snapshot.contentShift.y;
      x = clamp(x, r.x + 8, r.x + r.width - 8);
      y = clamp(y, r.y + 8, r.y + r.height - 8);
      ctx.beginPath();
      ctx.arc(x, y, 2.5 + i % 2, 0, Math.PI * 2);
      ctx.fillStyle = i % 4 === 0 ? colorWithAlpha(color, 0.88) : 'rgba(255,255,255,0.94)';
      ctx.fill();
    }
    ctx.restore();
  }

  function paintPackets(ctx, profile, state, color) {
    var r = profile.region;
    var snapshot = physicalDynamicsSnapshot(profile.id, state);
    ctx.save();
    for (var i = 0; i < 4; i++) {
      var x = r.x + 10 + (i % 2) * (r.width * 0.46) + snapshot.contentShift.x * (0.22 + i * 0.05);
      var y = r.y + 13 + Math.floor(i / 2) * (r.height * 0.43) + snapshot.contentShift.y;
      ctx.save();
      ctx.translate(x + 18, y + 19);
      ctx.rotate(snapshot.accessoryLag * (i % 2 ? -1 : 1));
      pathRoundedRect(ctx, -18, -19, 36, 38, 6);
      ctx.fillStyle = i % 2 ? '#ffd45c' : colorWithAlpha(color, 0.92);
      ctx.fill();
      ctx.strokeStyle = '#17202a';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(11, 0);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function paintAccessoryMotion(ctx, profile, state, color) {
    var r = profile.region;
    var snapshot = physicalDynamicsSnapshot(profile.id, state);
    var lag = snapshot.accessoryLag;
    if (Math.abs(lag) < 0.012 && snapshot.impact < 0.05) return;
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = colorWithAlpha(color, 0.88);
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    if (profile.accessory === 'counterspin') {
      ctx.beginPath();
      ctx.arc(r.x + r.width / 2, r.y + r.height / 2, r.width * 0.40,
        -1.1 - state.angle, 1.0 - state.angle);
      ctx.stroke();
    } else if (profile.accessory === 'eyes' || profile.accessory === 'iris') {
      ctx.fillStyle = '#17202a';
      ctx.beginPath();
      ctx.arc(r.x + r.width / 2 + state.gravityLocal.x * 9,
        r.y + r.height / 2 + state.gravityLocal.y * 5, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (profile.accessory === 'pendulum' || profile.accessory === 'ribbons' ||
        profile.accessory === 'tail' || profile.accessory === 'cord') {
      ctx.beginPath();
      ctx.moveTo(r.x + r.width / 2, r.y + 4);
      ctx.bezierCurveTo(r.x + r.width * 0.30 + lag * 62, r.y + r.height * 0.42,
        r.x + r.width * 0.70 - lag * 44, r.y + r.height * 0.73,
        r.x + r.width / 2 + lag * 85, r.y + r.height - 4);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(r.x + r.width / 2, r.y + r.height / 2,
        Math.max(10, Math.min(r.width, r.height) * 0.25),
        -0.7 + lag, 0.7 + lag);
      ctx.stroke();
    }
    ctx.restore();
  }

  function paintSpill(ctx, profile, state, color) {
    var snapshot = physicalDynamicsSnapshot(profile.id, state);
    if (!snapshot.spilling) return;
    var r = profile.region;
    var direction = state.gravityLocal.x >= 0 ? 1 : -1;
    var startX = direction > 0 ? r.x + r.width : r.x;
    var startY = r.y + r.height * 0.42;
    ctx.save();
    ctx.globalAlpha = 0.84;
    ctx.strokeStyle = colorWithAlpha(color, 0.90);
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.bezierCurveTo(startX + direction * 18, startY + 8,
      startX + direction * 29, startY + 30,
      startX + direction * 34, startY + 52);
    ctx.stroke();
    for (var i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(startX + direction * (31 + i * 9), startY + 60 + i * 13,
        4 - i * 0.65, 0, Math.PI * 2);
      ctx.fillStyle = colorWithAlpha(color, 0.84 - i * 0.12);
      ctx.fill();
    }
    ctx.restore();
  }

  // Paints the physically responsive layer after the authored base sprite.
  // This is vector-only and a pure function of render state, so seed replays are
  // deterministic and no frame history or unbounded per-object cache exists.
  function paintPhysicalDynamics(ctx, objectId, input, color) {
    var id = String(objectId || '');
    var source = DYNAMICS_PROFILES[id];
    if (!source) return null;
    var profile = {};
    Object.keys(source).forEach(function (key) { profile[key] = source[key]; });
    profile.id = id;
    var state = normalizeRenderState(input);
    if (id === 'smoothie') color = smoothieLiquidColor(state, color);
    if (profile.internal === 'liquid') paintLiquidWindow(ctx, profile, state, color);
    else if (profile.internal === 'granular') paintGranules(ctx, profile, state, color, false);
    else if (profile.internal === 'balls') paintGranules(ctx, profile, state, color, true);
    else if (profile.internal === 'particles') paintParticles(ctx, profile, state, color);
    else if (profile.internal === 'gel') {
      var shift = physicalDynamicsSnapshot(id, state).contentShift;
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.ellipse(profile.region.x + profile.region.width / 2 + shift.x * 0.55,
        profile.region.y + profile.region.height / 2 + shift.y,
        profile.region.width * 0.31, profile.region.height * 0.25,
        state.surfaceAngle * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = colorWithAlpha(color, 0.72);
      ctx.fill();
      ctx.restore();
    } else if (profile.internal === 'packets') paintPackets(ctx, profile, state, color);
    paintAccessoryMotion(ctx, profile, state, color);
    paintSpill(ctx, profile, state, color);
    return physicalDynamicsSnapshot(id, state);
  }

  function cloneAndFreeze(value) {
    if (!value || typeof value !== 'object') return value;
    var copy;
    if (Array.isArray(value)) {
      copy = value.map(cloneAndFreeze);
    } else {
      copy = {};
      Object.keys(value).forEach(function (key) {
        copy[key] = cloneAndFreeze(value[key]);
      });
    }
    return Object.freeze(copy);
  }

  function getLocalContactOffset(mapping) {
    var source = mapping || CANONICAL_MAPPING;
    if (!source.pivot || !Number.isFinite(source.pivot.y) ||
        !Number.isFinite(source.baselineY) || !Number.isFinite(source.artScale)) {
      throw new TypeError('Contact mapping requires pivot.y, baselineY, and artScale');
    }
    return (source.baselineY - source.pivot.y) * source.artScale;
  }

  function normalizedMetrics(input) {
    var src = input || {};
    var vb = src.viewBox || {};
    var viewBox = {
      x: finite(vb.x, 0),
      y: finite(vb.y, 0),
      width: positive(vb.width, 'metrics.viewBox.width'),
      height: positive(vb.height, 'metrics.viewBox.height'),
    };
    var boundsSrc = src.bounds || {};
    var bounds = {
      x: finite(boundsSrc.x, viewBox.x),
      y: finite(boundsSrc.y, viewBox.y),
      width: positive(boundsSrc.width, 'metrics.bounds.width'),
      height: positive(boundsSrc.height, 'metrics.bounds.height'),
    };
    var pivotSrc = src.pivot || {};
    var pivot = {
      x: finite(pivotSrc.x, viewBox.x + viewBox.width / 2),
      y: finite(pivotSrc.y, viewBox.y + viewBox.height / 2),
    };
    var baselineY = finite(src.baselineY, NaN);
    var artScale = positive(src.artScale == null
      ? CANONICAL_MAPPING.artScale : src.artScale, 'metrics.artScale');

    if (!Number.isFinite(baselineY)) {
      throw new TypeError('metrics.baselineY must be a finite number');
    }
    if (bounds.x < viewBox.x || bounds.y < viewBox.y ||
        bounds.x + bounds.width > viewBox.x + viewBox.width ||
        bounds.y + bounds.height > viewBox.y + viewBox.height) {
      throw new RangeError('metrics.bounds must stay inside metrics.viewBox');
    }
    if (baselineY < bounds.y || baselineY > bounds.y + bounds.height) {
      throw new RangeError('metrics.baselineY must cross metrics.bounds');
    }
    if (pivot.x < viewBox.x || pivot.x > viewBox.x + viewBox.width ||
        pivot.y < viewBox.y || pivot.y > viewBox.y + viewBox.height) {
      throw new RangeError('metrics.pivot must stay inside metrics.viewBox');
    }
    var computedContactOffset = getLocalContactOffset({
      pivot: pivot,
      baselineY: baselineY,
      artScale: artScale,
    });
    var localContactOffset = finite(src.localContactOffset, computedContactOffset);
    if (Math.abs(computedContactOffset - localContactOffset) > MAPPING_TOLERANCE) {
      throw new RangeError('metrics.localContactOffset must match the baseline mapping');
    }

    return cloneAndFreeze({
      viewBox: viewBox,
      bounds: bounds,
      pivot: pivot,
      baselineY: baselineY,
      artScale: artScale,
      localContactOffset: localContactOffset,
    });
  }

  function normalizedFace(input, objectId) {
    var fallback = FACE_PROFILES[objectId];
    var source = input && typeof input === 'object' ? input : (fallback || {
      anchor: { x: 150, y: 210 }, scale: 1, focusRadius: 64,
    });
    if (!source || !source.anchor || !Number.isFinite(source.anchor.x) ||
        !Number.isFinite(source.anchor.y)) {
      throw new TypeError('Art object ' + objectId + ' requires a finite face anchor');
    }
    return cloneAndFreeze({
      anchor: { x: source.anchor.x, y: source.anchor.y },
      scale: positive(source.scale == null ? 1 : source.scale, 'face.scale'),
      focusRadius: positive(source.focusRadius == null ? 64 : source.focusRadius,
        'face.focusRadius'),
      supportsEmotion: !!EMOTION_ALLOWLIST[objectId] && source.supportsEmotion !== false,
    });
  }

  function rejectPhysicsFields(definition) {
    PHYSICS_KEYS.forEach(function (key) {
      if (own(definition, key)) {
        throw new TypeError('Vector art definitions cannot declare physics field "' + key + '"');
      }
    });
  }

  // ObjectDefinition:
  //   { id, label, metrics, variants[], buildVariant(variant, object) }
  // buildVariant is intentionally lazy and returns either a paint function or
  // { paint(ctx, state) }. The function is first called when that variant is
  // requested for rendering, never when its object is registered.
  function registerObject(definition) {
    if (!definition || typeof definition !== 'object') {
      throw new TypeError('registerObject requires an object definition');
    }
    rejectPhysicsFields(definition);
    var id = stableId(definition.id, 'object id');
    if (objects.has(id)) throw new Error('Art object already registered: ' + id);
    if (typeof definition.buildVariant !== 'function') {
      throw new TypeError('Art object ' + id + ' requires buildVariant()');
    }
    if (!Array.isArray(definition.variants) || definition.variants.length < 1) {
      throw new TypeError('Art object ' + id + ' requires at least one variant');
    }

    var seen = new Set();
    var variants = definition.variants.map(function (raw, index) {
      if (!raw || typeof raw !== 'object') {
        throw new TypeError('Variant ' + index + ' for ' + id + ' must be an object');
      }
      rejectPhysicsFields(raw);
      var localId = stableId(raw.id, 'variant id');
      if (seen.has(localId)) throw new Error('Duplicate variant id for ' + id + ': ' + localId);
      seen.add(localId);
      return cloneAndFreeze({
        id: localId,
        canonicalId: id + '.' + localId,
        label: String(raw.label || localId),
        color: String(raw.color || ''),
        tokens: raw.tokens || {},
        face: normalizedFace(raw.face || definition.face, id),
        order: index,
      });
    });

    var publicDefinition = Object.freeze({
      id: id,
      label: String(definition.label || id),
      metrics: normalizedMetrics(definition.metrics),
      face: normalizedFace(definition.face, id),
      variants: Object.freeze(variants),
    });
    objects.set(id, {
      publicDefinition: publicDefinition,
      buildVariant: definition.buildVariant,
    });
    return publicDefinition;
  }

  function getObject(objectId) {
    var entry = objects.get(String(objectId || ''));
    return entry ? entry.publicDefinition : null;
  }

  function listObjects() {
    return Array.from(objects.values()).map(function (entry) {
      return entry.publicDefinition;
    });
  }

  function variantFor(entry, objectId, requestedId) {
    var raw = String(requestedId || '');
    var prefix = objectId + '.';
    var localId = raw.indexOf(prefix) === 0 ? raw.slice(prefix.length) : raw;
    for (var i = 0; i < entry.publicDefinition.variants.length; i++) {
      if (entry.publicDefinition.variants[i].id === localId) {
        return entry.publicDefinition.variants[i];
      }
    }
    return null;
  }

  // RenderVariant is the stable runtime art interface consumed by renderers:
  //   { id, objectId, variantId, label, color, metrics, renderLocal(ctx, state) }
  function getRenderVariant(objectId, variantId) {
    var id = String(objectId || '');
    var entry = objects.get(id);
    if (!entry) throw new Error('Unknown art object: ' + id);
    var variant = variantFor(entry, id, variantId);
    if (!variant) throw new Error('Unknown variant for ' + id + ': ' + variantId);
    var key = variant.canonicalId;
    if (renderVariantCache.has(key)) return renderVariantCache.get(key);

    var built = entry.buildVariant(variant, entry.publicDefinition);
    var paint = typeof built === 'function' ? built : built && built.paint;
    if (typeof paint !== 'function') {
      throw new TypeError('buildVariant() for ' + key + ' must return a paint function');
    }
    var renderVariant = Object.freeze({
      id: key,
      objectId: id,
      variantId: variant.id,
      label: variant.label,
      color: variant.color,
      metrics: entry.publicDefinition.metrics,
      face: variant.face,
      renderLocal: function (ctx, state) { return paint(ctx, normalizeRenderState(state)); },
    });
    renderVariantCache.set(key, renderVariant);
    return renderVariant;
  }

  function assertContext(ctx) {
    if (!ctx || typeof ctx.save !== 'function' || typeof ctx.restore !== 'function' ||
        typeof ctx.translate !== 'function' || typeof ctx.scale !== 'function') {
      throw new TypeError('A CanvasRenderingContext2D-compatible context is required');
    }
  }

  function render(ctx, request) {
    assertContext(ctx);
    var req = request || {};
    var mode = req.mode === 'preview' ? 'preview' : (req.mode === 'gameplay' ? 'gameplay' : null);
    if (!mode) throw new TypeError('render mode must be "preview" or "gameplay"');
    var variant = getRenderVariant(req.objectId, req.variantId);
    var metrics = variant.metrics;
    var state = normalizeRenderState({
      mode: mode,
      time: Math.max(0, finite(req.time, 0)),
      reducedMotion: !!req.reducedMotion,
      selected: !!req.selected,
      angle: req.angle,
      slosh: req.slosh,
      angularVelocity: req.angularVelocity,
      velocity: req.velocity,
      airborne: req.airborne,
      contact: req.contact,
      impact: req.impact,
      emotion: req.emotion,
      flipSeed: req.flipSeed,
      motionSeed: req.motionSeed,
    });

    ctx.save();
    try {
      if (mode === 'gameplay') {
        var gameScale = positive(req.scale == null ? metrics.artScale : req.scale,
          'gameplay scale');
        ctx.translate(finite(req.x, 0), finite(req.y, 0));
        if (typeof ctx.rotate === 'function') ctx.rotate(finite(req.angle, 0));
        ctx.scale(gameScale, gameScale);
        ctx.translate(-metrics.pivot.x, -metrics.pivot.y);
      } else {
        var box = req.box || {};
        var x = finite(box.x, 0);
        var y = finite(box.y, 0);
        var width = positive(box.width == null
          ? (ctx.canvas && ctx.canvas.width) || metrics.viewBox.width
          : box.width, 'preview box width');
        var height = positive(box.height == null
          ? (ctx.canvas && ctx.canvas.height) || metrics.viewBox.height
          : box.height, 'preview box height');
        var padding = Math.max(0, Math.min(0.45, finite(req.padding, 0.08)));
        var innerWidth = width * (1 - padding * 2);
        var innerHeight = height * (1 - padding * 2);
        var previewScale = Math.min(innerWidth / metrics.bounds.width,
          innerHeight / metrics.bounds.height);
        var drawWidth = metrics.bounds.width * previewScale;
        var drawHeight = metrics.bounds.height * previewScale;
        ctx.translate(
          x + (width - drawWidth) / 2 - metrics.bounds.x * previewScale,
          y + (height - drawHeight) / 2 - metrics.bounds.y * previewScale
        );
        ctx.scale(previewScale, previewScale);
      }
      variant.renderLocal(ctx, state);
    } finally {
      ctx.restore();
    }
    return variant;
  }

  function renderPreview(ctx, request) {
    var req = {};
    Object.keys(request || {}).forEach(function (key) { req[key] = request[key]; });
    req.mode = 'preview';
    return render(ctx, req);
  }

  function renderGameplay(ctx, request) {
    var req = {};
    Object.keys(request || {}).forEach(function (key) { req[key] = request[key]; });
    req.mode = 'gameplay';
    return render(ctx, req);
  }

  function clearRenderCache(objectId) {
    if (objectId == null) {
      renderVariantCache.clear();
      return;
    }
    var prefix = String(objectId) + '.';
    Array.from(renderVariantCache.keys()).forEach(function (key) {
      if (key.indexOf(prefix) === 0) renderVariantCache.delete(key);
    });
  }

  function cacheInfo() {
    return Object.freeze({
      objectsRegistered: objects.size,
      variantsBuilt: renderVariantCache.size,
      keys: Object.freeze(Array.from(renderVariantCache.keys())),
    });
  }

  function paintReactionFace(ctx, face, input) {
    var state = normalizeRenderState(input);
    var profile = face && face.anchor ? face : null;
    if (!profile || !profile.supportsEmotion || state.emotion === 'idle') return false;
    var x = profile.anchor.x;
    var y = profile.anchor.y;
    var scale = profile.scale || 1;
    var eyeY = y - 5 * scale;
    var gap = 14 * scale;
    var eyeRadius = 6.5 * scale;
    ctx.save();
    ctx.fillStyle = 'rgba(255,252,241,0.96)';
    ctx.strokeStyle = '#17202a';
    ctx.lineWidth = Math.max(2.5, 3.6 * scale);
    [-1, 1].forEach(function (side) {
      ctx.beginPath();
      ctx.ellipse(x + side * gap, eyeY, eyeRadius, eyeRadius * 1.18, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    });
    ctx.fillStyle = '#17202a';
    var pupilY = eyeY + (state.emotion === 'scared' ? 0 : 1.5 * scale);
    [-1, 1].forEach(function (side) {
      ctx.beginPath();
      ctx.arc(x + side * gap + state.gravityLocal.x * 2.2 * scale,
        pupilY, (state.emotion === 'scared' ? 2.4 : 3.1) * scale, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.beginPath();
    if (state.emotion === 'scared') {
      ctx.ellipse(x, y + 15 * scale, 7.5 * scale, 10 * scale, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (state.emotion === 'smile') {
      ctx.arc(x, y + 8 * scale, 15 * scale, 0.18, Math.PI - 0.18);
      ctx.stroke();
    } else {
      ctx.arc(x, y + 25 * scale, 15 * scale, Math.PI + 0.18, Math.PI * 2 - 0.18);
      ctx.stroke();
    }
    ctx.restore();
    return true;
  }

  return Object.freeze({
    contractVersion: 2,
    CANONICAL_MAPPING: CANONICAL_MAPPING,
    getLocalContactOffset: getLocalContactOffset,
    registerObject: registerObject,
    getObject: getObject,
    listObjects: listObjects,
    getRenderVariant: getRenderVariant,
    render: render,
    renderPreview: renderPreview,
    renderGameplay: renderGameplay,
    clearRenderCache: clearRenderCache,
    cacheInfo: cacheInfo,
    normalizeRenderState: normalizeRenderState,
    dynamicProfile: dynamicProfile,
    listDynamicProfiles: listDynamicProfiles,
    physicalDynamicsSnapshot: physicalDynamicsSnapshot,
    paintPhysicalDynamics: paintPhysicalDynamics,
    paintReactionFace: paintReactionFace,
    smoothieLiquidColor: smoothieLiquidColor,
  });
});
