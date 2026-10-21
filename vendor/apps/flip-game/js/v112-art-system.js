// v112-art-system.js — vector calibration platform for Pressure Signal.
//
// The seven definitions here are the visual-quality gate for the remaining
// v1.12 roster. They render from one immutable scene graph to Canvas or SVG.
// Nothing in this module creates or mutates a gameplay physics body.
(function (root, factory) {
  'use strict';
  var globe = null;
  if (typeof module === 'object' && module.exports) globe = require('./v112-globe.js');
  else if (root) globe = root.FlipGlobeV112;
  var api = factory(globe);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipArtV112 = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Globe) {
  'use strict';

  if (!Globe) throw new Error('FlipArtV112 requires FlipGlobeV112');

  var TAU = Math.PI * 2;
  var INK = '#2a2430';
  var WHITE = '#fffaf1';
  var PAPER = '#f4e8d1';
  var SHADOW = 'rgba(35,29,39,0.18)';
  var PROTECTED_IDS = Object.freeze(['bottle', 'trex']);
  var CALIBRATION_IDS = Object.freeze([
    'coffee-mug',
    'penguin',
    'action-figures',
    'desk-globe',
    'desk-gyroscope',
    'mechanical-metronome',
    'potted-plants',
  ]);
  var VIEW_BOX = Object.freeze({ x: 0, y: 0, width: 300, height: 420 });
  var COMPETITIVE_MAPPING = Object.freeze({
    profileId: 'standard-competitive-v1',
    pivot: Object.freeze({ x: 150, y: 323.2972972973 }),
    baselineY: 376,
    artScale: 0.74,
    localContactOffset: 39,
    gameplayInvariant: true,
  });
  var SWATCHES = Object.freeze([
    Object.freeze({ id: 'blue-steel', color: '#267bc5', accent: '#83cdeb' }),
    Object.freeze({ id: 'red-letter', color: '#c94745', accent: '#f39a75' }),
    Object.freeze({ id: 'lime-line', color: '#79a845', accent: '#c8db72' }),
    Object.freeze({ id: 'orange-shift', color: '#d87834', accent: '#f4bb64' }),
    Object.freeze({ id: 'purple-reign', color: '#7750a4', accent: '#c5a3dd' }),
    Object.freeze({ id: 'arctic-blue', color: '#62afc2', accent: '#c8eef0' }),
    Object.freeze({ id: 'field-green', color: '#468b62', accent: '#9fca79' }),
    Object.freeze({ id: 'berry-signal', color: '#ba527c', accent: '#f0a2b9' }),
    Object.freeze({ id: 'indigo-hour', color: '#4d5ba7', accent: '#9baee1' }),
    Object.freeze({ id: 'yellow-card', color: '#d7a92f', accent: '#f4dc74' }),
    Object.freeze({ id: 'deep-cherry', color: '#9d3650', accent: '#df7982' }),
    Object.freeze({ id: 'pink-static', color: '#d781a8', accent: '#f2bdd2' }),
  ]);

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function freezePoint(point) {
    return Object.freeze({ x: finite(point.x, 0), y: finite(point.y, 0) });
  }

  function hashText(value) {
    var text = String(value == null ? '' : value);
    var hash = 2166136261;
    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededUnit(seed, lane) {
    var value = hashText('v112:art:' + String(seed) + ':' + lane);
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  }

  function normalizeAngle(value) {
    var angle = finite(value, 0) % TAU;
    if (angle <= -Math.PI) angle += TAU;
    if (angle > Math.PI) angle -= TAU;
    return angle;
  }

  function normalizeState(input) {
    var source = input && typeof input === 'object' ? input : {};
    var angle = normalizeAngle(source.angle);
    var velocity = source.velocity && typeof source.velocity === 'object' ? source.velocity : {};
    var acceleration = source.acceleration && typeof source.acceleration === 'object'
      ? source.acceleration : {};
    var result = source.result === 'make' || source.result === 'miss' ? source.result : null;
    var airborne = !!source.airborne || source.pose === 'airborne';
    var reducedMotion = !!source.reducedMotion;
    var emotion = airborne ? 'scared' : (result === 'make' ? 'smile'
      : (result === 'miss' ? 'frown' : 'neutral'));
    return Object.freeze({
      mode: source.mode === 'gameplay' ? 'gameplay' : 'preview',
      pose: String(source.pose || (airborne ? 'airborne' : 'upright')),
      time: Math.max(0, finite(source.time, finite(source.elapsed, 0))),
      angle: angle,
      angularVelocity: clamp(finite(source.angularVelocity, 0), -24, 24),
      velocity: Object.freeze({ x: clamp(finite(velocity.x, 0), -5000, 5000),
        y: clamp(finite(velocity.y, 0), -5000, 5000) }),
      acceleration: Object.freeze({ x: clamp(finite(acceleration.x, 0), -5000, 5000),
        y: clamp(finite(acceleration.y, 0), -5000, 5000) }),
      impact: clamp(finite(source.impact, 0), 0, 1),
      airborne: airborne,
      result: result,
      emotion: emotion,
      reducedMotion: reducedMotion,
      flipSeed: String(source.flipSeed == null ? 'preview' : source.flipSeed),
      selected: !!source.selected,
    });
  }

  function computeDynamics(objectId, input) {
    var state = normalizeState(input);
    var phase = state.reducedMotion ? 0 : state.time;
    var inertial = clamp(-state.angularVelocity * 0.035 + state.acceleration.x * 0.0008, -1, 1);
    var localGravity = Object.freeze({ x: -Math.sin(state.angle), y: Math.cos(state.angle) });
    var common = {
      schema: 'RenderDynamicsV1',
      objectId: objectId,
      visualOnly: true,
      affectsGameplay: false,
      localGravity: localGravity,
      settled: !state.airborne && Math.abs(state.angularVelocity) < 0.08 && state.impact < 0.05,
    };
    var dynamics;
    if (objectId === 'coffee-mug') {
      var inverted = Math.cos(state.angle) < -0.12;
      var spillActive = inverted && (state.airborne || Math.abs(state.angularVelocity) > 0.2 ||
        Math.abs(state.velocity.y) > 0.3);
      var droplets = [];
      for (var drop = 0; drop < 7; drop += 1) {
        var spread = (seededUnit(state.flipSeed, 'coffee-x-' + drop) - 0.5) * 17;
        var distance = 12 + drop * 11 + seededUnit(state.flipSeed, 'coffee-y-' + drop) * 9;
        droplets.push(Object.freeze({
          x: localGravity.x * distance + localGravity.y * spread,
          y: localGravity.y * distance - localGravity.x * spread,
          radius: 2.6 + seededUnit(state.flipSeed, 'coffee-r-' + drop) * 3.2,
        }));
      }
      dynamics = Object.assign(common, {
        kind: 'open-liquid',
        surfaceAngle: clamp(-state.angle + inertial * 0.18, -1.25, 1.25),
        surfaceShift: clamp(inertial * 8 + localGravity.x * 5, -13, 13),
        spillActive: spillActive,
        droplets: Object.freeze(droplets),
      });
    } else if (objectId === 'potted-plants') {
      dynamics = Object.assign(common, {
        kind: 'foliage-and-soil',
        foliageLean: state.reducedMotion ? 0 : clamp(inertial * 0.42 +
          Math.sin(phase * 3.1) * (state.airborne ? 0.08 : 0.025), -0.52, 0.52),
        leafFlutter: state.reducedMotion ? 0 : Math.sin(phase * 6.2 +
          seededUnit(state.flipSeed, 'leaves') * TAU) * (state.airborne ? 0.11 : 0.025),
        soilShift: clamp(localGravity.x * 8 + inertial * 5, -10, 10),
      });
    } else if (objectId === 'desk-gyroscope') {
      dynamics = Object.assign(common, {
        kind: 'inertial-gimbals',
        outerAngle: normalizeAngle(-state.angle * 0.88 + inertial * 0.25),
        middleAngle: normalizeAngle(state.angle * 0.43 - inertial * 0.55),
        rotorAngle: normalizeAngle(phase * 7.4 + state.angle * 0.16),
      });
    } else if (objectId === 'mechanical-metronome') {
      var swing = state.reducedMotion ? 0 : Math.sin(phase * 5.8 +
        seededUnit(state.flipSeed, 'metronome') * 0.18);
      dynamics = Object.assign(common, {
        kind: 'mechanical-pendulum',
        pendulumAngle: clamp(swing * 0.36 + inertial * 0.13, -0.48, 0.48),
        escapementPulse: state.reducedMotion ? 0 : (Math.cos(phase * 11.6) > 0.82 ? 1 : 0),
      });
    } else if (objectId === 'desk-globe') {
      dynamics = Object.assign(common, {
        kind: 'counter-rotating-sphere',
        longitude: state.reducedMotion ? 0 : Globe.rotationAt(phase, {
          initialLon: seededUnit(state.flipSeed, 'globe') * TAU - Math.PI,
        }),
        latitude: 12 * Math.PI / 180 + inertial * 0.04,
      });
    } else if (objectId === 'penguin') {
      dynamics = Object.assign(common, {
        kind: 'character-rig',
        flipperSpread: state.reducedMotion ? (state.airborne ? 0.38 : 0)
          : clamp((state.airborne ? 0.48 : 0.06) + Math.sin(phase * 7) * 0.09, 0, 0.62),
        bodySquash: state.impact * 0.08,
        emotion: state.emotion,
      });
    } else if (objectId === 'action-figures') {
      dynamics = Object.assign(common, {
        kind: 'articulated-character-rig',
        armLag: state.reducedMotion ? 0 : clamp(inertial * 0.38 +
          Math.sin(phase * 5.1) * (state.airborne ? 0.12 : 0.025), -0.44, 0.44),
        capeLag: state.reducedMotion ? 0 : clamp(inertial * 0.56 +
          localGravity.x * 0.18, -0.62, 0.62),
        bodySquash: state.impact * 0.055,
        emotion: state.emotion,
      });
    } else {
      throw new Error('Unknown v1.12 calibration Flipper: ' + objectId);
    }
    return Object.freeze(dynamics);
  }

  function colorChannels(hex) {
    var clean = String(hex || '#777777').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(clean)) clean = '777777';
    var value = parseInt(clean, 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }

  function mixColor(hex, target, amount) {
    var from = colorChannels(hex);
    var to = colorChannels(target);
    var ratio = clamp(amount, 0, 1);
    var value = from.map(function (channel, index) {
      return Math.round(channel + (to[index] - channel) * ratio);
    });
    return '#' + value.map(function (channel) { return channel.toString(16).padStart(2, '0'); }).join('');
  }

  function paletteFor(variant) {
    return Object.freeze({
      base: variant.color,
      light: mixColor(variant.color, '#ffffff', 0.46),
      highlight: mixColor(variant.accent, '#ffffff', 0.38),
      accent: variant.accent,
      dark: mixColor(variant.color, '#15101b', 0.42),
      deep: mixColor(variant.color, '#120d17', 0.64),
      ink: INK,
      white: WHITE,
      paper: PAPER,
    });
  }

  function createScene(objectId, variant, state) {
    return {
      schema: 'VectorSceneV1',
      objectId: objectId,
      variantId: variant.id,
      viewBox: VIEW_BOX,
      state: state,
      gradients: [],
      commands: [],
    };
  }

  function style(fill, stroke, lineWidth, opacity) {
    return Object.freeze({ fill: fill == null ? null : fill,
      stroke: stroke == null ? null : stroke,
      lineWidth: finite(lineWidth, 0), opacity: clamp(finite(opacity, 1), 0, 1) });
  }

  function addGradient(scene, id, x0, y0, x1, y1, stops, radial) {
    scene.gradients.push(Object.freeze({ id: id, x0: x0, y0: y0, x1: x1, y1: y1,
      stops: Object.freeze(stops.map(function (stop) {
        return Object.freeze({ offset: stop[0], color: stop[1] });
      })), radial: !!radial }));
    return 'gradient:' + id;
  }

  function addEllipse(scene, cx, cy, rx, ry, paint) {
    scene.commands.push(Object.freeze({ kind: 'ellipse', cx: cx, cy: cy, rx: rx, ry: ry, style: paint }));
  }

  function addCircle(scene, cx, cy, radius, paint) {
    scene.commands.push(Object.freeze({ kind: 'circle', cx: cx, cy: cy, radius: radius, style: paint }));
  }

  function addRect(scene, x, y, width, height, radius, paint) {
    scene.commands.push(Object.freeze({ kind: 'rect', x: x, y: y, width: width, height: height,
      radius: radius || 0, style: paint }));
  }

  function addLine(scene, points, paint) {
    scene.commands.push(Object.freeze({ kind: 'line',
      points: Object.freeze(points.map(freezePoint)), style: paint }));
  }

  function addPolygon(scene, points, paint) {
    scene.commands.push(Object.freeze({ kind: 'polygon',
      points: Object.freeze(points.map(freezePoint)), style: paint }));
  }

  function addPath(scene, segments, paint) {
    scene.commands.push(Object.freeze({ kind: 'path', segments: Object.freeze(segments.map(function (segment) {
      return Object.freeze(segment.slice());
    })), style: paint }));
  }

  function addText(scene, text, x, y, input) {
    var source = input && typeof input === 'object' ? input : {};
    scene.commands.push(Object.freeze({ kind: 'text', text: String(text), x: x, y: y,
      font: source.font || '700 14px system-ui, sans-serif', align: source.align || 'center',
      baseline: source.baseline || 'middle', style: source.style || style(INK, null, 0) }));
  }

  function addGlobe(scene, cx, cy, radius, input) {
    var source = input && typeof input === 'object' ? input : {};
    scene.commands.push(Object.freeze({ kind: 'globe', cx: cx, cy: cy, radius: radius,
      centerLon: source.centerLon, centerLat: source.centerLat,
      palette: source.palette || null }));
  }

  function shadow(scene, width, opacity) {
    addEllipse(scene, 150, 370, width, 8, style('rgba(35,29,39,' + (opacity || 0.18) + ')', null, 0));
  }

  function buildVariant(swatch, name, cast, index) {
    return Object.freeze({
      id: swatch.id,
      canonicalId: null,
      name: name,
      label: name,
      color: swatch.color,
      accent: swatch.accent,
      cast: cast,
      castIndex: index,
      availability: 'with-flipper',
    });
  }

  var VARIANT_COPY = Object.freeze({
    'coffee-mug': Object.freeze([
      ['Blue Plate Special', 'thick diner mug'],
      ['Red-Eye Regular', 'tall railway mug'],
      ['Matcha Made', 'low café cup'],
      ['Marmalade Shift', 'wide breakfast mug'],
      ['Grape Debate', 'faceted studio mug'],
      ['Cold Brew Crew', 'double-wall glass mug'],
      ['Groundskeeper Green', 'enamel camp mug'],
      ['Berry Important', 'stackable bistro mug'],
      ['Midnight Refill', 'straight press-room mug'],
      ['Mugshot Sunshine', 'sunburst pottery mug'],
      ['Cherry Overtime', 'ribbed newsroom mug'],
      ['Pinkies Up', 'footed tea-room mug'],
    ]),
    penguin: Object.freeze([
      ['Blue Tux Review', 'stadium official'],
      ['Red Carpet Waddle', 'broadcast guest'],
      ['Lime on Ice', 'rink technician'],
      ['Orange You Chilly', 'sideline photographer'],
      ['Purple Formal', 'evening commentator'],
      ['Arctic Department', 'field researcher'],
      ['Green Room Waddle', 'production runner'],
      ['Berry Bow Tie', 'arena announcer'],
      ['Midnight Marshal', 'lane marshal'],
      ['Golden Flipper', 'medal presenter'],
      ['Cherry Chaperone', 'team coordinator'],
      ['Pink Icebreaker', 'fan-club captain'],
    ]),
    'action-figures': Object.freeze([
      ['Blue Moon Astronaut', 'astronaut'],
      ['Red Alert Robot', 'robot'],
      ['Lime Knight Shift', 'knight'],
      ['Orange You a Wizard', 'wizard'],
      ['Grape Outdoors', 'explorer'],
      ['Ice Lab Specialist', 'scientist'],
      ['Green Flag Racer', 'racer'],
      ['Berry Deep Diver', 'diver'],
      ['Indigo Clue', 'detective'],
      ['Yellow-Eye Pilot', 'pilot'],
      ['Cherry-Rig Inventor', 'inventor'],
      ['Pink Nebula Ranger', 'space ranger'],
    ]),
    'desk-globe': Object.freeze([
      ['Blue Meridian', 'brass meridian stand'],
      ['Red Shift Atlas', 'tilted red-oak stand'],
      ['Lime Latitude', 'split-ring classroom stand'],
      ['Orange Atlas Hour', 'sunset enamel stand'],
      ['Purple Parallel', 'double-axis library stand'],
      ['Ice Cap Edition', 'frosted steel stand'],
      ['Greenwich With Envy', 'verdigris archive stand'],
      ['Berry Hemisphere', 'rosewood half-ring stand'],
      ['Midnight Maproom', 'navy observatory stand'],
      ['Yellow Equator', 'gold surveyor stand'],
      ['Cherry Longitude', 'lacquered tripod stand'],
      ['Pink Projection', 'opal gallery stand'],
    ]),
    'desk-gyroscope': Object.freeze([
      ['Blue Spin Doctor', 'classic twin gimbal'],
      ['Red Righting Rig', 'weighted laboratory gimbal'],
      ['Lime After Lime', 'open teaching gimbal'],
      ['Orange Axis Office', 'wide-base survey gimbal'],
      ['Purple Precession', 'triple ring instrument'],
      ['Ice-Stable', 'frosted precision gimbal'],
      ['Green Means Gyro', 'brass field gimbal'],
      ['Berry Balanced', 'rosewood desk gimbal'],
      ['Midnight Momentum', 'darkroom gyroscope'],
      ['Golden Rule of Spin', 'ornate demonstration gimbal'],
      ['Cherry Bearing', 'compact marine gimbal'],
      ['Pink Perpetual', 'gallery kinetic gimbal'],
    ]),
    'mechanical-metronome': Object.freeze([
      ['Blue Note Bureau', 'walnut pyramid metronome'],
      ['Red Tempo Notice', 'scarlet concert metronome'],
      ['Lime Signature', 'rounded teaching metronome'],
      ['Orange Beat Report', 'wide studio metronome'],
      ['Purple Measure', 'faceted chamber metronome'],
      ['Ice in Time', 'frosted acrylic metronome'],
      ['Green Room Count', 'brass-panel metronome'],
      ['Berry Upbeat', 'rosewood arched metronome'],
      ['Midnight Tick', 'black rehearsal metronome'],
      ['Gold Standard Time', 'championship metronome'],
      ['Cherry Sync', 'compact radio metronome'],
      ['Pink Cadence', 'gallery bell metronome'],
    ]),
    'potted-plants': Object.freeze([
      ['Blue-Sky Succulent', 'succulent'],
      ['Red Alert Cactus', 'cactus'],
      ['Lime and Order Fern', 'fern'],
      ['Orange Sunflower Shift', 'sunflower'],
      ['Purple Orchid Office', 'orchid'],
      ['Ice-Shelf Bonsai', 'bonsai'],
      ['Green Means Snake Plant', 'snake plant'],
      ['Berry Big Monstera', 'monstera'],
      ['Midnight Aloe-Bi', 'aloe'],
      ['Yellow Card Flytrap', 'flytrap'],
      ['Cherry Palm Reading', 'palm'],
      ['Pink Vine Hotline', 'flowering vine'],
    ]),
  });

  var METRICS = Object.freeze({
    'coffee-mug': Object.freeze({ x: 47, y: 86, width: 213, height: 290 }),
    penguin: Object.freeze({ x: 63, y: 63, width: 174, height: 313 }),
    'action-figures': Object.freeze({ x: 66, y: 43, width: 168, height: 333 }),
    'desk-globe': Object.freeze({ x: 49, y: 55, width: 202, height: 321 }),
    'desk-gyroscope': Object.freeze({ x: 46, y: 69, width: 208, height: 307 }),
    'mechanical-metronome': Object.freeze({ x: 67, y: 42, width: 166, height: 334 }),
    'potted-plants': Object.freeze({ x: 48, y: 61, width: 204, height: 315 }),
  });

  var REACTION_POLICY = Object.freeze({
    'coffee-mug': 'none-dynamics-led',
    penguin: 'authored-character-face',
    'action-figures': 'authored-character-face',
    'desk-globe': 'none-rigid-instrument',
    'desk-gyroscope': 'none-rigid-instrument',
    'mechanical-metronome': 'none-rigid-instrument',
    'potted-plants': 'none-dynamics-led',
  });

  function variantsFor(objectId) {
    return Object.freeze(VARIANT_COPY[objectId].map(function (copy, index) {
      var built = buildVariant(SWATCHES[index], copy[0], copy[1], index);
      return Object.freeze(Object.assign({}, built, { canonicalId: objectId + '.' + built.id }));
    }));
  }

  function createDefinition(objectId, displayName, dynamicsKind) {
    var bounds = METRICS[objectId];
    return Object.freeze({
      schema: 'FlipperArtDefinitionV2',
      objectId: objectId,
      displayName: displayName,
      viewBox: VIEW_BOX,
      bounds: bounds,
      mapping: COMPETITIVE_MAPPING,
      collisionProfile: COMPETITIVE_MAPPING.profileId,
      contactPlaneY: COMPETITIVE_MAPPING.baselineY,
      physicsNeutralArt: true,
      dynamicsKind: dynamicsKind,
      reactionPolicy: REACTION_POLICY[objectId],
      variants: variantsFor(objectId),
      previewStates: Object.freeze([
        Object.freeze({ id: 'upright', angle: 0, pose: 'upright' }),
        Object.freeze({ id: 'quarter-turn', angle: Math.PI / 2, pose: 'quarter-turn' }),
        Object.freeze({ id: 'airborne', angle: Math.PI * 0.82, pose: 'airborne', airborne: true }),
        Object.freeze({ id: 'inverted', angle: Math.PI, pose: 'inverted', airborne: true }),
        Object.freeze({ id: 'make', angle: 0, pose: 'resolved', result: 'make' }),
        Object.freeze({ id: 'miss', angle: Math.PI / 2, pose: 'resolved', result: 'miss' }),
      ]),
    });
  }

  var DEFINITIONS = Object.freeze([
    createDefinition('coffee-mug', 'Coffee Mug', 'open-liquid'),
    createDefinition('penguin', 'Penguin', 'character-rig'),
    createDefinition('action-figures', 'Action Figures', 'articulated-character-rig'),
    createDefinition('desk-globe', 'Desk Globe', 'counter-rotating-sphere'),
    createDefinition('desk-gyroscope', 'Desk Gyroscope', 'inertial-gimbals'),
    createDefinition('mechanical-metronome', 'Mechanical Metronome', 'mechanical-pendulum'),
    createDefinition('potted-plants', 'Potted Plants', 'foliage-and-soil'),
  ]);
  var DEFINITIONS_BY_ID = Object.freeze(DEFINITIONS.reduce(function (result, definition) {
    result[definition.objectId] = definition;
    return result;
  }, Object.create(null)));

  function getDefinition(objectId) {
    return DEFINITIONS_BY_ID[String(objectId || '')] || null;
  }

  function getVariant(objectId, variantId) {
    var definition = getDefinition(objectId);
    if (!definition) return null;
    var requested = String(variantId == null ? '' : variantId);
    var prefix = definition.objectId + '.';
    if (requested.indexOf(prefix) === 0) requested = requested.slice(prefix.length);
    for (var index = 0; index < definition.variants.length; index += 1) {
      if (definition.variants[index].id === requested) return definition.variants[index];
    }
    return null;
  }

  function rotatedRectPoints(cx, cy, width, height, angle) {
    var cosine = Math.cos(angle);
    var sine = Math.sin(angle);
    var halfWidth = width / 2;
    var halfHeight = height / 2;
    return [
      { x: -halfWidth, y: -halfHeight },
      { x: halfWidth, y: -halfHeight },
      { x: halfWidth, y: halfHeight },
      { x: -halfWidth, y: halfHeight },
    ].map(function (point) {
      return { x: cx + point.x * cosine - point.y * sine,
        y: cy + point.x * sine + point.y * cosine };
    });
  }

  function addShine(scene, x, y, height, opacity) {
    addPath(scene, [
      ['M', x, y], ['C', x - 8, y + height * 0.27, x - 9, y + height * 0.72, x, y + height],
    ], style(null, 'rgba(255,255,255,' + finite(opacity, 0.42) + ')', 5));
  }

  function drawCoffee(scene, variant, state, dynamics) {
    var p = paletteFor(variant);
    var index = variant.castIndex;
    var topY = [139, 122, 159, 145, 133, 128, 147, 151, 129, 142, 136, 149][index];
    var left = [81, 91, 78, 69, 82, 84, 73, 86, 89, 76, 83, 91][index];
    var right = 300 - left;
    var bottomLeft = left + [11, 3, 22, 15, 9, 6, 0, 10, 4, 16, 8, 22][index];
    var bottomRight = 300 - bottomLeft;
    var handleRight = index % 4 !== 1;
    var handleOuter = handleRight ? right + 25 : left - 25;
    var handleInner = handleRight ? right - 3 : left + 3;
    shadow(scene, 81, 0.20);

    // Cast-specific handle is behind the vessel and remains a real silhouette.
    addPath(scene, [
      ['M', handleInner, topY + 34],
      ['C', handleOuter + (handleRight ? 25 : -25), topY + 21,
        handleOuter + (handleRight ? 30 : -30), topY + 112, handleInner, topY + 120],
      ['C', handleInner + (handleRight ? -7 : 7), topY + 99,
        handleInner + (handleRight ? 8 : -8), topY + 66, handleInner, topY + 55], ['Z'],
    ], style(p.light, p.ink, 7));

    var bodyFill = addGradient(scene, 'coffee-body', left, topY, right, 354, [
      [0, p.highlight], [0.28, p.base], [0.75, p.dark], [1, p.deep],
    ]);
    addPath(scene, [
      ['M', left, topY],
      ['Q', left + 2, 248, bottomLeft, 347],
      ['Q', 150, 371, bottomRight, 347],
      ['Q', right - 2, 248, right, topY],
      ['Q', 150, topY - 19, left, topY], ['Z'],
    ], style(bodyFill, p.ink, 7));

    // Open coffee surface stays level in world space and visibly pours when inverted.
    var liquidSlope = Math.tan(dynamics.surfaceAngle) * 23;
    liquidSlope = clamp(liquidSlope, -20, 20);
    addEllipse(scene, 150, topY, (right - left) / 2 - 4, 20,
      style('#e9d8bc', p.ink, 5));
    addPath(scene, [
      ['M', left + 13, topY - liquidSlope],
      ['Q', 150 + dynamics.surfaceShift, topY + 11, right - 13, topY + liquidSlope],
      ['Q', 150, topY + 29, left + 13, topY - liquidSlope], ['Z'],
    ], style('#563421', '#3a251d', 2.2));
    addPath(scene, [
      ['M', left + 22, topY - 2 - liquidSlope * 0.55],
      ['Q', 147, topY + 5, right - 24, topY + 1 + liquidSlope * 0.55],
    ], style(null, 'rgba(255,240,210,0.46)', 3));

    if (dynamics.spillActive) {
      var side = dynamics.localGravity.x >= 0 ? 1 : -1;
      var mouthX = side > 0 ? right - 9 : left + 9;
      var firstDrop = dynamics.droplets[1];
      addPath(scene, [
        ['M', mouthX, topY + 2],
        ['C', mouthX + dynamics.localGravity.x * 18, topY + dynamics.localGravity.y * 20,
          mouthX + firstDrop.x * 0.74, topY + firstDrop.y * 0.74,
          mouthX + firstDrop.x, topY + firstDrop.y],
      ], style(null, '#664027', 8));
      dynamics.droplets.forEach(function (drop, dropIndex) {
        addCircle(scene, mouthX + drop.x, topY + drop.y, drop.radius,
          style(dropIndex % 2 ? '#6f4528' : '#4b2e20', null, 0, 0.90));
      });
    }

    // Twelve casts get authored construction details rather than hue-only swaps.
    if (index === 0) {
      addRect(scene, 104, 224, 92, 42, 8, style(PAPER, p.ink, 3));
      addText(scene, 'REFILL', 150, 245, { font: '800 13px system-ui, sans-serif',
        style: style(p.deep, null, 0) });
    } else if (index === 1) {
      addLine(scene, [{ x: 104, y: 174 }, { x: 196, y: 174 }], style(null, p.accent, 9));
      addLine(scene, [{ x: 105, y: 304 }, { x: 195, y: 304 }], style(null, p.accent, 7));
    } else if (index === 2) {
      addEllipse(scene, 150, 319, 51, 13, style(p.accent, p.ink, 3));
    } else if (index === 3) {
      for (var ray = 0; ray < 7; ray += 1) {
        addLine(scene, [{ x: 150, y: 240 },
          { x: 150 + Math.cos(ray * TAU / 7) * 49, y: 240 + Math.sin(ray * TAU / 7) * 49 }],
        style(null, 'rgba(255,255,255,0.32)', 5));
      }
    } else if (index === 4) {
      [176, 203, 230, 257, 284].forEach(function (y) {
        addLine(scene, [{ x: left + 14, y: y }, { x: right - 14, y: y + 9 }],
          style(null, p.accent, 4, 0.64));
      });
    } else if (index === 5) {
      addRect(scene, 98, 189, 104, 104, 17, style('rgba(226,248,250,0.22)', WHITE, 3));
      addLine(scene, [{ x: 109, y: 269 }, { x: 191, y: 207 }],
        style(null, 'rgba(255,255,255,0.35)', 7));
    } else if (index === 6) {
      addLine(scene, [{ x: left + 2, y: 196 }, { x: right - 2, y: 196 }], style(null, PAPER, 6));
      addLine(scene, [{ x: left + 5, y: 280 }, { x: right - 5, y: 280 }], style(null, PAPER, 6));
    } else if (index === 7) {
      addRect(scene, 99, 204, 102, 76, 12, style(p.highlight, p.ink, 3));
      addPath(scene, [['M', 120, 244], ['Q', 150, 218, 180, 244], ['Q', 150, 268, 120, 244], ['Z']],
        style(p.accent, p.ink, 2));
    } else if (index === 8) {
      addLine(scene, [{ x: 105, y: 186 }, { x: 195, y: 186 }], style(null, p.light, 5));
      addText(scene, 'WFC', 150, 247, { font: '900 26px system-ui, sans-serif',
        style: style(p.highlight, null, 0) });
    } else if (index === 9) {
      addCircle(scene, 150, 236, 43, style(p.accent, p.ink, 3));
      for (var sun = 0; sun < 8; sun += 1) {
        addLine(scene, [{ x: 150 + Math.cos(sun * Math.PI / 4) * 47,
          y: 236 + Math.sin(sun * Math.PI / 4) * 47 },
        { x: 150 + Math.cos(sun * Math.PI / 4) * 60,
          y: 236 + Math.sin(sun * Math.PI / 4) * 60 }], style(null, p.highlight, 5));
      }
    } else if (index === 10) {
      [111, 132, 153, 174, 195].forEach(function (x) {
        addLine(scene, [{ x: x, y: 178 }, { x: x + 8, y: 321 }], style(null, p.accent, 4, 0.62));
      });
    } else {
      addEllipse(scene, 150, 346, 49, 15, style(p.accent, p.ink, 4));
      addLine(scene, [{ x: 111, y: 212 }, { x: 189, y: 212 }], style(null, p.highlight, 7));
    }
    addShine(scene, left + 24, topY + 38, 135, 0.40);

    if (!state.reducedMotion && !state.airborne && Math.cos(state.angle) > 0.1) {
      for (var steam = 0; steam < 3; steam += 1) {
        var sx = 126 + steam * 23;
        var drift = Math.sin(state.time * 1.7 + steam * 1.9) * 7;
        addPath(scene, [['M', sx, topY - 24],
          ['C', sx - 10, topY - 46, sx + drift + 12, topY - 59,
            sx + drift, topY - 83]], style(null, 'rgba(242,244,239,0.68)', 5));
      }
    }
  }

  function drawCharacterExpression(scene, cx, cy, scale, emotion, p, visor) {
    var eyeY = cy - 7 * scale;
    var eyeRadius = (emotion === 'scared' ? 7.2 : 5.4) * scale;
    [-15, 15].forEach(function (offset) {
      addEllipse(scene, cx + offset * scale, eyeY, eyeRadius * 0.83, eyeRadius,
        style(visor ? '#e8f8ff' : WHITE, p.ink, 2.2 * scale));
      addCircle(scene, cx + offset * scale, eyeY + (emotion === 'scared' ? 0 : 1.1 * scale),
        2.4 * scale, style(p.ink, null, 0));
    });
    if (emotion === 'scared') {
      addEllipse(scene, cx, cy + 13 * scale, 6 * scale, 8 * scale,
        style(p.deep, p.ink, 1.8 * scale));
    } else if (emotion === 'smile') {
      addPath(scene, [['M', cx - 10 * scale, cy + 9 * scale],
        ['Q', cx, cy + 20 * scale, cx + 10 * scale, cy + 9 * scale]],
      style(null, p.ink, 2.6 * scale));
    } else if (emotion === 'frown') {
      addPath(scene, [['M', cx - 10 * scale, cy + 18 * scale],
        ['Q', cx, cy + 7 * scale, cx + 10 * scale, cy + 18 * scale]],
      style(null, p.ink, 2.6 * scale));
      addLine(scene, [{ x: cx - 22 * scale, y: cy - 20 * scale },
        { x: cx - 8 * scale, y: cy - 16 * scale }], style(null, p.ink, 2.4 * scale));
      addLine(scene, [{ x: cx + 8 * scale, y: cy - 16 * scale },
        { x: cx + 22 * scale, y: cy - 20 * scale }], style(null, p.ink, 2.4 * scale));
    } else {
      addLine(scene, [{ x: cx - 6 * scale, y: cy + 13 * scale },
        { x: cx + 6 * scale, y: cy + 13 * scale }], style(null, p.ink, 2.4 * scale));
    }
  }

  function drawPenguin(scene, variant, state, dynamics) {
    var p = paletteFor(variant);
    var index = variant.castIndex;
    var squash = dynamics.bodySquash;
    var bodyBottom = 349;
    var bodyTop = 143 + squash * 30;
    var bodyWidth = 72 + (index % 3) * 4;
    var spread = dynamics.flipperSpread;
    shadow(scene, 82, 0.21);

    // Feet and authored flippers sit behind the torso.
    addEllipse(scene, 118, 345, 38, 16, style('#d99032', p.ink, 5));
    addEllipse(scene, 182, 345, 38, 16, style('#d99032', p.ink, 5));
    addPath(scene, [['M', 93, 177], ['Q', 52 - spread * 25, 240, 79, 308],
      ['Q', 103, 287, 116, 221], ['Z']], style(p.deep, p.ink, 6));
    addPath(scene, [['M', 207, 177], ['Q', 248 + spread * 25, 240, 221, 308],
      ['Q', 197, 287, 184, 221], ['Z']], style(p.deep, p.ink, 6));

    var bodyFill = addGradient(scene, 'penguin-body', 91, bodyTop, 210, bodyBottom,
      [[0, '#4b4651'], [0.38, '#24212a'], [1, '#111017']]);
    addEllipse(scene, 150, (bodyTop + bodyBottom) / 2, bodyWidth, (bodyBottom - bodyTop) / 2,
      style(bodyFill, p.ink, 7));
    addEllipse(scene, 150, 259, 51, 83 - squash * 25, style('#f4efe4', p.ink, 4));
    addEllipse(scene, 150, 122, 72, 69, style(bodyFill, p.ink, 7));

    // The beak belongs to the head rig; the expression is drawn into it rather
    // than stamped over the completed character afterward.
    if (dynamics.emotion === 'scared') {
      addPolygon(scene, [{ x: 141, y: 129 }, { x: 150, y: 140 }, { x: 159, y: 129 }],
        style('#eaa03c', p.ink, 2));
    } else {
      addPolygon(scene, [{ x: 136, y: 126 }, { x: 150, y: 136 }, { x: 164, y: 126 },
        { x: 150, y: 145 }], style('#eaa03c', p.ink, 2));
    }
    drawCharacterExpression(scene, 150, 113, 0.86, dynamics.emotion, p, false);

    // Role-specific WFC accessories keep all twelve casts readable in roster tiles.
    if (index === 0) {
      addRect(scene, 121, 189, 58, 34, 5, style(p.base, p.ink, 3));
      addText(scene, 'LANE', 150, 206, { font: '800 10px system-ui, sans-serif',
        style: style(WHITE, null, 0) });
    } else if (index === 1) {
      addPath(scene, [['M', 102, 80], ['Q', 150, 47, 198, 80]], style(null, p.accent, 14));
      addLine(scene, [{ x: 107, y: 79 }, { x: 193, y: 79 }], style(null, p.ink, 4));
    } else if (index === 2) {
      addRect(scene, 105, 178, 90, 21, 7, style(p.accent, p.ink, 3));
      addCircle(scene, 150, 188, 6, style(WHITE, p.ink, 2));
    } else if (index === 3) {
      addCircle(scene, 201, 202, 24, style(p.accent, p.ink, 4));
      addCircle(scene, 201, 202, 13, style('#b7d7e8', p.ink, 2));
      addLine(scene, [{ x: 196, y: 225 }, { x: 185, y: 270 }], style(null, p.ink, 5));
    } else if (index === 4) {
      addPolygon(scene, [{ x: 132, y: 176 }, { x: 150, y: 192 }, { x: 168, y: 176 },
        { x: 168, y: 214 }, { x: 150, y: 197 }, { x: 132, y: 214 }],
      style(p.accent, p.ink, 3));
    } else if (index === 5) {
      addEllipse(scene, 150, 107, 79, 75, style('rgba(190,232,242,0.16)', p.accent, 5));
      addLine(scene, [{ x: 101, y: 160 }, { x: 85, y: 189 }], style(null, p.accent, 7));
    } else if (index === 6) {
      addRect(scene, 181, 213, 35, 54, 6, style(p.base, p.ink, 3));
      addLine(scene, [{ x: 189, y: 226 }, { x: 208, y: 226 }], style(null, WHITE, 3));
      addLine(scene, [{ x: 189, y: 238 }, { x: 205, y: 238 }], style(null, WHITE, 3));
    } else if (index === 7) {
      addCircle(scene, 134, 181, 17, style(p.base, p.ink, 3));
      addCircle(scene, 166, 181, 17, style(p.accent, p.ink, 3));
      addPolygon(scene, [{ x: 150, y: 191 }, { x: 134, y: 207 }, { x: 166, y: 207 }],
        style(p.light, p.ink, 3));
    } else if (index === 8) {
      addRect(scene, 111, 165, 78, 17, 4, style(p.accent, p.ink, 3));
      addText(scene, '09', 150, 174, { font: '900 11px system-ui, sans-serif',
        style: style(p.deep, null, 0) });
    } else if (index === 9) {
      addCircle(scene, 150, 202, 23, style('#d4ae48', p.ink, 4));
      addPolygon(scene, [{ x: 150, y: 185 }, { x: 155, y: 196 }, { x: 168, y: 197 },
        { x: 158, y: 205 }, { x: 161, y: 218 }, { x: 150, y: 211 },
        { x: 139, y: 218 }, { x: 142, y: 205 }, { x: 132, y: 197 },
        { x: 145, y: 196 }], style(p.highlight, p.ink, 2));
    } else if (index === 10) {
      addLine(scene, [{ x: 108, y: 180 }, { x: 192, y: 213 }], style(null, p.accent, 9));
      addCircle(scene, 111, 181, 8, style(WHITE, p.ink, 2));
    } else {
      addPath(scene, [['M', 100, 82], ['Q', 150, 53, 200, 82]], style(null, p.light, 11));
      addCircle(scene, 150, 59, 9, style(p.accent, p.ink, 3));
    }
    addEllipse(scene, 129, 90, 17, 7, style('rgba(255,255,255,0.17)', null, 0));
  }

  function drawActionFigure(scene, variant, state, dynamics) {
    var p = paletteFor(variant);
    var index = variant.castIndex;
    var arm = dynamics.armLag;
    var cape = dynamics.capeLag;
    var squash = dynamics.bodySquash;
    shadow(scene, 68, 0.20);

    // Role-specific rear silhouettes.
    if (index === 0 || index === 5 || index === 7) {
      addRect(scene, 103, 125, 94, 150, 21, style(p.dark, p.ink, 6));
    }
    if (index === 3 || index === 11) {
      addPath(scene, [['M', 105, 155], ['Q', 57 + cape * 35, 245, 88, 341],
        ['L', 148, 245], ['L', 192, 341], ['Q', 242 - cape * 35, 242, 195, 155], ['Z']],
      style(index === 3 ? p.deep : p.accent, p.ink, 5));
    }

    // Boots, articulated legs and broad stable competition stance.
    addLine(scene, [{ x: 127, y: 257 }, { x: 117 - arm * 8, y: 334 }], style(null, p.deep, 25));
    addLine(scene, [{ x: 173, y: 257 }, { x: 183 + arm * 8, y: 334 }], style(null, p.deep, 25));
    addRect(scene, 88 - arm * 8, 326, 52, 25, 10, style(p.dark, p.ink, 5));
    addRect(scene, 160 + arm * 8, 326, 52, 25, 10, style(p.dark, p.ink, 5));

    var torsoFill = addGradient(scene, 'figure-torso', 101, 143, 202, 278,
      [[0, p.highlight], [0.34, p.base], [1, p.dark]]);
    addPath(scene, [['M', 111, 145 + squash * 16], ['L', 189, 145 + squash * 16],
      ['L', 207, 245], ['Q', 150, 277 - squash * 18, 93, 245], ['Z']],
    style(torsoFill, p.ink, 6));
    addLine(scene, [{ x: 108, y: 170 }, { x: 69 - arm * 34, y: 242 + arm * 15 }],
      style(null, p.base, 24));
    addLine(scene, [{ x: 192, y: 170 }, { x: 231 + arm * 34, y: 242 - arm * 15 }],
      style(null, p.base, 24));
    addCircle(scene, 67 - arm * 34, 246 + arm * 15, 15, style(p.dark, p.ink, 4));
    addCircle(scene, 233 + arm * 34, 246 - arm * 15, 15, style(p.dark, p.ink, 4));

    if (index === 1) {
      addRect(scene, 103, 63, 94, 92, 14, style(p.light, p.ink, 7));
      addLine(scene, [{ x: 150, y: 63 }, { x: 150, y: 43 }], style(null, p.ink, 4));
      addCircle(scene, 150, 39, 7, style(p.accent, p.ink, 2));
      drawCharacterExpression(scene, 150, 108, 0.72, dynamics.emotion, p, true);
    } else {
      var headFill = addGradient(scene, 'figure-head', 101, 55, 199, 154,
        [[0, p.paper], [0.62, '#c89570'], [1, '#8f654f']]);
      addCircle(scene, 150, 105, 48, style(headFill, p.ink, 6));
      drawCharacterExpression(scene, 150, 108, 0.67, dynamics.emotion, p, false);
    }

    // Twelve original, brand-free role casts.
    if (index === 0) {
      addEllipse(scene, 150, 104, 59, 56, style('rgba(171,224,241,0.22)', '#d5eef4', 5));
      addRect(scene, 125, 188, 50, 36, 7, style(p.accent, p.ink, 3));
      addLine(scene, [{ x: 135, y: 206 }, { x: 165, y: 206 }], style(null, WHITE, 3));
    } else if (index === 1) {
      addCircle(scene, 150, 199, 18, style(p.accent, p.ink, 3));
      addLine(scene, [{ x: 126, y: 231 }, { x: 174, y: 231 }], style(null, p.deep, 5));
    } else if (index === 2) {
      addPath(scene, [['M', 102, 91], ['L', 113, 60], ['L', 150, 45], ['L', 187, 60],
        ['L', 198, 91]], style(p.light, p.ink, 6));
      addPolygon(scene, [{ x: 150, y: 179 }, { x: 178, y: 194 }, { x: 169, y: 228 },
        { x: 150, y: 243 }, { x: 131, y: 228 }, { x: 122, y: 194 }], style(p.accent, p.ink, 4));
    } else if (index === 3) {
      addPolygon(scene, [{ x: 99, y: 85 }, { x: 148, y: 40 }, { x: 202, y: 85 }],
        style(p.deep, p.ink, 6));
      addCircle(scene, 176, 62, 7, style(p.accent, p.ink, 2));
      addCircle(scene, 131, 58, 5, style(p.highlight, p.ink, 2));
    } else if (index === 4) {
      addEllipse(scene, 150, 91, 55, 19, style(p.dark, p.ink, 5));
      addCircle(scene, 132, 104, 16, style('rgba(210,240,245,0.28)', p.ink, 3));
      addCircle(scene, 168, 104, 16, style('rgba(210,240,245,0.28)', p.ink, 3));
      addPath(scene, [['M', 191, 148], ['C', 225, 159 + cape * 20, 235, 190, 253, 181]],
        style(null, p.accent, 9));
    } else if (index === 5) {
      addPath(scene, [['M', 109, 157], ['L', 92, 269], ['L', 132, 260], ['L', 150, 194],
        ['L', 168, 260], ['L', 208, 269], ['L', 191, 157]], style(WHITE, p.ink, 4));
      addCircle(scene, 180, 207, 9, style(p.accent, p.ink, 2));
    } else if (index === 6) {
      addLine(scene, [{ x: 113, y: 169 }, { x: 188, y: 237 }], style(null, WHITE, 10));
      addLine(scene, [{ x: 123, y: 165 }, { x: 198, y: 233 }], style(null, p.deep, 6));
      addRect(scene, 108, 70, 84, 30, 12, style(p.dark, p.ink, 4));
    } else if (index === 7) {
      addEllipse(scene, 150, 105, 62, 59, style('rgba(160,217,235,0.20)', p.accent, 6));
      [99, 201].forEach(function (x) {
        addCircle(scene, x, 171, 18, style(p.dark, p.ink, 3));
      });
    } else if (index === 8) {
      addPath(scene, [['M', 98, 82], ['Q', 150, 54, 202, 82]], style(null, p.deep, 15));
      addPath(scene, [['M', 111, 153], ['L', 88, 294], ['L', 135, 270],
        ['L', 150, 210], ['L', 165, 270], ['L', 212, 294], ['L', 189, 153]],
      style(p.dark, p.ink, 4));
      addCircle(scene, 205, 210, 19, style('rgba(210,240,245,0.23)', p.ink, 4));
      addLine(scene, [{ x: 217, y: 224 }, { x: 235, y: 244 }], style(null, p.ink, 6));
    } else if (index === 9) {
      addEllipse(scene, 150, 83, 56, 25, style(p.dark, p.ink, 5));
      addCircle(scene, 132, 100, 16, style('rgba(210,240,245,0.25)', p.ink, 3));
      addCircle(scene, 168, 100, 16, style('rgba(210,240,245,0.25)', p.ink, 3));
      addPath(scene, [['M', 192, 143], ['C', 221, 158 + cape * 19, 239, 149, 252, 177]],
        style(null, p.accent, 9));
    } else if (index === 10) {
      [132, 168].forEach(function (x, gearIndex) {
        addCircle(scene, x, 196 + gearIndex * 22, 16, style(p.accent, p.ink, 3));
        for (var tooth = 0; tooth < 6; tooth += 1) {
          addCircle(scene, x + Math.cos(tooth * TAU / 6) * 18,
            196 + gearIndex * 22 + Math.sin(tooth * TAU / 6) * 18, 3,
          style(p.highlight, p.ink, 1));
        }
      });
    } else {
      addPolygon(scene, [{ x: 150, y: 171 }, { x: 160, y: 192 }, { x: 183, y: 195 },
        { x: 166, y: 211 }, { x: 171, y: 235 }, { x: 150, y: 224 },
        { x: 129, y: 235 }, { x: 134, y: 211 }, { x: 117, y: 195 },
        { x: 140, y: 192 }], style(p.accent, p.ink, 3));
      addPath(scene, [['M', 105, 155], ['Q', 150, 129, 195, 155]], style(null, p.highlight, 7));
    }
    addShine(scene, 123, 164, 72, 0.26);
  }

  function drawDeskGlobe(scene, variant, state, dynamics) {
    var p = paletteFor(variant);
    var index = variant.castIndex;
    var standFill = addGradient(scene, 'globe-stand', 80, 66, 222, 364,
      [[0, p.highlight], [0.42, p.base], [1, p.deep]]);
    shadow(scene, 91, 0.22);
    addPath(scene, [['M', 88, 264], ['Q', 59, 144, 116, 74], ['Q', 155, 38, 206, 77]],
      style(null, p.ink, 14));
    addPath(scene, [['M', 89, 263], ['Q', 61, 145, 117, 77], ['Q', 156, 43, 204, 80]],
      style(null, standFill, 8));

    var globePalette = {
      oceanDeep: '#0a315a', ocean: '#176eaa', oceanLight: '#65bdd0',
      land: index % 3 === 0 ? '#7baa5c' : (index % 3 === 1 ? '#b6a66a' : '#739f6a'),
      landLight: '#c9d48a', coast: '#e8e0b8', atmosphere: 'rgba(119,220,245,0.55)',
    };
    addGlobe(scene, 150, 155, 86, { centerLon: dynamics.longitude,
      centerLat: dynamics.latitude, palette: globePalette });

    addPath(scene, [['M', 205, 79], ['Q', 242, 159, 205, 237], ['Q', 152, 283, 90, 263]],
      style(null, p.ink, 13));
    addPath(scene, [['M', 204, 81], ['Q', 238, 159, 202, 234], ['Q', 151, 277, 92, 260]],
      style(null, standFill, 7));
    addCircle(scene, 150, 258, 9, style(p.accent, p.ink, 3));
    addLine(scene, [{ x: 150, y: 257 }, { x: 150, y: 326 }], style(null, p.dark, 15));

    if (index === 1 || index === 10) {
      addPolygon(scene, [{ x: 95, y: 326 }, { x: 205, y: 326 }, { x: 230, y: 363 },
        { x: 70, y: 363 }], style(standFill, p.ink, 6));
    } else if (index === 2 || index === 4) {
      addEllipse(scene, 150, 350, 82, 23, style(standFill, p.ink, 6));
      addEllipse(scene, 150, 347, 48, 9, style(p.highlight, null, 0, 0.42));
    } else if (index === 9) {
      addPath(scene, [['M', 150, 318], ['L', 83, 363], ['L', 111, 363], ['L', 150, 339],
        ['L', 189, 363], ['L', 217, 363], ['Z']], style(standFill, p.ink, 6));
    } else {
      addPath(scene, [['M', 111, 327], ['Q', 150, 306, 189, 327], ['L', 211, 364],
        ['L', 89, 364], ['Z']], style(standFill, p.ink, 6));
    }
    if (index === 6) {
      addLine(scene, [{ x: 100, y: 341 }, { x: 200, y: 341 }], style(null, '#b7924b', 4));
      addText(scene, 'URTH', 150, 351, { font: '800 10px Georgia, serif',
        style: style(PAPER, null, 0) });
    } else if (index === 8) {
      addCircle(scene, 150, 347, 15, style(p.accent, p.ink, 3));
      addLine(scene, [{ x: 142, y: 347 }, { x: 158, y: 347 }], style(null, p.highlight, 3));
    } else if (index === 11) {
      addPath(scene, [['M', 102, 352], ['Q', 150, 324, 198, 352]], style(null, p.highlight, 8));
    }
    addShine(scene, 105, 103, 85, 0.18);
  }

  function drawGyroscope(scene, variant, state, dynamics) {
    var p = paletteFor(variant);
    var index = variant.castIndex;
    var ringFill = addGradient(scene, 'gyro-metal', 55, 75, 245, 340,
      [[0, p.highlight], [0.32, p.base], [0.69, p.dark], [1, p.deep]]);
    shadow(scene, 88, 0.21);
    addLine(scene, [{ x: 150, y: 278 }, { x: 150, y: 329 }], style(null, p.dark, 15));
    addPath(scene, [['M', 96, 329], ['Q', 150, 305, 204, 329], ['L', 225, 365],
      ['L', 75, 365], ['Z']], style(ringFill, p.ink, 6));

    // Three independent ring reads make the inertial counter-rotation visible.
    var outerDx = Math.sin(dynamics.outerAngle) * 17;
    addEllipse(scene, 150 + outerDx, 190, 94, 119,
      style('rgba(255,255,255,0.035)', p.ink, 11));
    addEllipse(scene, 150 + outerDx, 190, 89, 114,
      style(null, p.light, 5));
    var middleDy = Math.sin(dynamics.middleAngle) * 14;
    addEllipse(scene, 150, 190 + middleDy, 112, 62,
      style('rgba(255,255,255,0.025)', p.ink, 10));
    addEllipse(scene, 150, 190 + middleDy, 107, 57,
      style(null, p.accent, 4));
    if (index === 4 || index === 9 || index === 11) {
      addEllipse(scene, 150, 190, 73, 91, style(null, p.highlight, 7));
    }
    addCircle(scene, 150, 190, index === 9 ? 37 : 43, style(ringFill, p.ink, 6));
    var rotorX = Math.cos(dynamics.rotorAngle) * 38;
    var rotorY = Math.sin(dynamics.rotorAngle) * 38;
    addLine(scene, [{ x: 150 - rotorX, y: 190 - rotorY },
      { x: 150 + rotorX, y: 190 + rotorY }], style(null, p.highlight, 12));
    addCircle(scene, 150, 190, 13, style(p.accent, p.ink, 4));
    addCircle(scene, 150, 190, 4, style(WHITE, null, 0));

    if (index === 0) {
      addText(scene, 'AXIS', 150, 346, { font: '800 11px system-ui, sans-serif',
        style: style(p.highlight, null, 0) });
    } else if (index === 1) {
      [101, 199].forEach(function (x) { addCircle(scene, x, 345, 8, style(p.accent, p.ink, 2)); });
    } else if (index === 2) {
      addLine(scene, [{ x: 98, y: 340 }, { x: 202, y: 340 }], style(null, p.highlight, 5));
      addLine(scene, [{ x: 111, y: 352 }, { x: 189, y: 352 }], style(null, p.highlight, 3));
    } else if (index === 3) {
      addRect(scene, 105, 330, 90, 25, 7, style(p.accent, p.ink, 3));
      addText(scene, 'TRUE', 150, 343, { font: '900 11px system-ui, sans-serif',
        style: style(p.deep, null, 0) });
    } else if (index === 5) {
      addPath(scene, [['M', 91, 348], ['Q', 150, 320, 209, 348]], style(null, WHITE, 7, 0.55));
    } else if (index === 6) {
      [118, 150, 182].forEach(function (x) { addLine(scene, [{ x: x, y: 331 },
        { x: x, y: 359 }], style(null, '#b9934f', 4)); });
    } else if (index === 7) {
      addRect(scene, 99, 328, 102, 28, 4, style('#714832', p.ink, 4));
    } else if (index === 8) {
      addText(scene, '09', 150, 346, { font: '900 17px system-ui, sans-serif',
        style: style(p.accent, null, 0) });
    } else if (index === 10) {
      addLine(scene, [{ x: 89, y: 355 }, { x: 211, y: 335 }], style(null, p.accent, 5));
    }
  }

  function drawMetronome(scene, variant, state, dynamics) {
    var p = paletteFor(variant);
    var index = variant.castIndex;
    shadow(scene, 79, 0.22);
    var bodyFill = addGradient(scene, 'metro-body', 77, 74, 223, 365,
      [[0, p.highlight], [0.25, p.base], [0.72, p.dark], [1, p.deep]]);
    var shoulder = 111 - (index % 3) * 5;
    var bodyTop = index === 5 ? 67 : 77;
    if (index === 7) {
      addPath(scene, [['M', 115, bodyTop], ['Q', 150, 51, 185, bodyTop],
        ['Q', 219, 243, 222, 360], ['L', 78, 360], ['Q', 81, 243, 115, bodyTop], ['Z']],
      style(bodyFill, p.ink, 7));
    } else {
      addPolygon(scene, [{ x: shoulder, y: bodyTop }, { x: 300 - shoulder, y: bodyTop },
        { x: 222, y: 360 }, { x: 78, y: 360 }], style(bodyFill, p.ink, 7));
    }
    addPolygon(scene, [{ x: 124, y: 106 }, { x: 176, y: 106 }, { x: 195, y: 317 },
      { x: 105, y: 317 }], style('#eee7d8', p.ink, 4));
    for (var tick = 0; tick < 9; tick += 1) {
      var tickY = 132 + tick * 20;
      var tickWidth = tick % 4 === 0 ? 31 : 19;
      addLine(scene, [{ x: 150 - tickWidth, y: tickY }, { x: 150 + tickWidth, y: tickY }],
        style(null, tick % 4 === 0 ? p.deep : '#766f68', tick % 4 === 0 ? 3 : 1.6));
    }
    var pivot = { x: 150, y: 286 };
    var length = 212;
    var rodAngle = -Math.PI / 2 + dynamics.pendulumAngle;
    var tip = { x: pivot.x + Math.cos(rodAngle) * length,
      y: pivot.y + Math.sin(rodAngle) * length };
    addLine(scene, [pivot, tip], style(null, '#564f4a', 8));
    var weightCenter = { x: pivot.x + Math.cos(rodAngle) * 112,
      y: pivot.y + Math.sin(rodAngle) * 112 };
    addPolygon(scene, rotatedRectPoints(weightCenter.x, weightCenter.y, 40, 27, rodAngle + Math.PI / 2),
      style(p.accent, p.ink, 4));
    addCircle(scene, pivot.x, pivot.y, 12, style(p.accent, p.ink, 4));
    if (dynamics.escapementPulse) {
      addCircle(scene, pivot.x, pivot.y, 22, style(null, p.highlight, 3, 0.46));
    }

    if (index === 0 || index === 7) {
      [102, 116, 130, 144, 158, 172, 186, 200].forEach(function (x) {
        addLine(scene, [{ x: x, y: 324 }, { x: x + 5, y: 351 }],
          style(null, 'rgba(255,255,255,0.16)', 3));
      });
    } else if (index === 1) {
      addRect(scene, 98, 324, 104, 25, 5, style(p.accent, p.ink, 3));
      addText(scene, 'TEMPO', 150, 337, { font: '800 10px system-ui, sans-serif',
        style: style(p.deep, null, 0) });
    } else if (index === 2) {
      addPath(scene, [['M', 91, 336], ['Q', 150, 304, 209, 336]], style(null, p.highlight, 7));
    } else if (index === 3) {
      addEllipse(scene, 150, 342, 54, 13, style(p.accent, p.ink, 3));
    } else if (index === 4) {
      addPolygon(scene, [{ x: 101, y: 325 }, { x: 150, y: 310 }, { x: 199, y: 325 },
        { x: 186, y: 352 }, { x: 114, y: 352 }], style(p.accent, p.ink, 3));
    } else if (index === 5) {
      addRect(scene, 98, 322, 104, 30, 8, style('rgba(255,255,255,0.17)', WHITE, 3));
    } else if (index === 6 || index === 9) {
      addLine(scene, [{ x: 100, y: 327 }, { x: 200, y: 327 }], style(null, '#c3a257', 5));
      addLine(scene, [{ x: 108, y: 344 }, { x: 192, y: 344 }], style(null, '#c3a257', 3));
    } else if (index === 8) {
      addText(scene, 'TICK', 150, 338, { font: '900 15px Georgia, serif',
        style: style(p.accent, null, 0) });
    } else if (index === 10) {
      addCircle(scene, 124, 338, 7, style(p.accent, p.ink, 2));
      addCircle(scene, 176, 338, 7, style(p.accent, p.ink, 2));
    } else {
      addPath(scene, [['M', 98, 337], ['Q', 150, 314, 202, 337]], style(null, p.highlight, 8));
    }
    addShine(scene, 103, 102, 169, 0.22);
  }

  function addLeaf(scene, x, y, length, width, angle, fill, stroke) {
    var dx = Math.cos(angle);
    var dy = Math.sin(angle);
    var px = -dy;
    var py = dx;
    var tipX = x + dx * length;
    var tipY = y + dy * length;
    addPath(scene, [['M', x, y],
      ['C', x + dx * length * 0.34 + px * width, y + dy * length * 0.34 + py * width,
        x + dx * length * 0.76 + px * width * 0.55, y + dy * length * 0.76 + py * width * 0.55,
        tipX, tipY],
      ['C', x + dx * length * 0.76 - px * width * 0.55, y + dy * length * 0.76 - py * width * 0.55,
        x + dx * length * 0.34 - px * width, y + dy * length * 0.34 - py * width,
        x, y], ['Z']], style(fill, stroke || INK, 3));
    addLine(scene, [{ x: x, y: y }, { x: tipX, y: tipY }],
      style(null, mixColor(fill, '#18341f', 0.44), 1.5, 0.7));
  }

  function drawPlantFoliage(scene, variant, dynamics) {
    var p = paletteFor(variant);
    var index = variant.castIndex;
    var lean = dynamics.foliageLean + dynamics.leafFlutter;
    var baseX = 150 + dynamics.soilShift * 0.25;
    var green = index === 0 || index === 2 || index === 6 || index === 8
      ? mixColor(p.base, '#3c914c', 0.55) : '#4e8d52';
    var lightGreen = mixColor(green, '#d2e783', 0.42);
    if (index === 0) {
      // Layered succulent rosette.
      [0, 1, 2].forEach(function (row) {
        var count = 7 - row;
        for (var leaf = 0; leaf < count; leaf += 1) {
          var angle = -Math.PI + (leaf + 0.5) * Math.PI / count + lean * (0.7 + row * 0.15);
          addLeaf(scene, baseX, 276 - row * 15, 59 - row * 10, 14 - row * 2,
            angle, row % 2 ? lightGreen : green, p.ink);
        }
      });
    } else if (index === 1) {
      // Cactus with two clear arms.
      addPath(scene, [['M', 129, 293], ['L', 129 + lean * 25, 126],
        ['Q', 132 + lean * 27, 103, 150 + lean * 28, 103],
        ['Q', 169 + lean * 27, 104, 171 + lean * 25, 126], ['L', 171, 293], ['Z']],
      style(green, p.ink, 5));
      addPath(scene, [['M', 130, 217], ['C', 93, 227, 91, 197, 91, 173],
        ['L', 112, 173], ['C', 112, 192, 113, 198, 132, 192]], style(null, green, 20));
      addPath(scene, [['M', 170, 185], ['C', 205, 194, 209, 163, 209, 143],
        ['L', 190, 143], ['C', 190, 161, 188, 166, 169, 163]], style(null, green, 19));
      for (var spine = 0; spine < 8; spine += 1) {
        addLine(scene, [{ x: 140 + (spine % 2) * 20, y: 134 + spine * 18 },
          { x: 136 + (spine % 2) * 28, y: 130 + spine * 18 }], style(null, p.highlight, 2));
      }
    } else if (index === 2) {
      // Fern: a curved rachis with many paired leaflets.
      for (var frond = 0; frond < 7; frond += 1) {
        var fAngle = -2.72 + frond * 0.42 + lean;
        var length = 92 - Math.abs(frond - 3) * 5;
        var tipX = baseX + Math.cos(fAngle) * length;
        var tipY = 284 + Math.sin(fAngle) * length;
        addPath(scene, [['M', baseX, 284], ['Q', (baseX + tipX) / 2 + lean * 15,
          (284 + tipY) / 2 - 13, tipX, tipY]], style(null, green, 4));
        for (var leaflet = 1; leaflet < 6; leaflet += 1) {
          var ratio = leaflet / 7;
          var lx = baseX + (tipX - baseX) * ratio;
          var ly = 284 + (tipY - 284) * ratio;
          addLeaf(scene, lx, ly, 19 - leaflet, 5, fAngle - Math.PI / 2, lightGreen, p.ink);
          addLeaf(scene, lx, ly, 19 - leaflet, 5, fAngle + Math.PI / 2, green, p.ink);
        }
      }
    } else if (index === 3) {
      // Sunflower with a substantial head and two leaves.
      addPath(scene, [['M', baseX, 292], ['C', baseX - 9, 224, baseX + lean * 32, 161,
        baseX + lean * 45, 117]], style(null, green, 12));
      addLeaf(scene, baseX - 2, 232, 60, 17, -2.68 + lean, green, p.ink);
      addLeaf(scene, baseX + 4, 205, 58, 17, -0.45 + lean, lightGreen, p.ink);
      var flowerX = baseX + lean * 45;
      var flowerY = 105;
      for (var petal = 0; petal < 14; petal += 1) {
        var pa = petal * TAU / 14;
        addEllipse(scene, flowerX + Math.cos(pa) * 35, flowerY + Math.sin(pa) * 35,
          12, 22, style(p.accent, p.ink, 2));
      }
      addCircle(scene, flowerX, flowerY, 31, style('#754d2d', p.ink, 4));
      for (var seed = 0; seed < 9; seed += 1) {
        addCircle(scene, flowerX + Math.cos(seed * 2.4) * (seed * 2.2),
          flowerY + Math.sin(seed * 2.4) * (seed * 2.2), 2.4, style('#d2a13e', null, 0));
      }
    } else if (index === 4) {
      // Orchid: bowed stem and five-petal flowers.
      addPath(scene, [['M', baseX, 291], ['C', 118 + lean * 27, 219, 196 + lean * 32, 151,
        161 + lean * 41, 91]], style(null, green, 6));
      [0.20, 0.46, 0.72, 0.94].forEach(function (ratio, flowerIndex) {
        var fx = baseX + (11 + flowerIndex * 10) * Math.sin(ratio * Math.PI) + lean * 31 * ratio;
        var fy = 276 - ratio * 178;
        for (var orchidPetal = 0; orchidPetal < 5; orchidPetal += 1) {
          var oa = orchidPetal * TAU / 5;
          addEllipse(scene, fx + Math.cos(oa) * 12, fy + Math.sin(oa) * 10,
            8, 13, style(p.accent, p.ink, 2));
        }
        addCircle(scene, fx, fy, 6, style(p.highlight, p.ink, 1.5));
      });
      addLeaf(scene, baseX - 2, 276, 67, 20, -2.72 + lean, green, p.ink);
      addLeaf(scene, baseX + 2, 276, 67, 20, -0.42 + lean, lightGreen, p.ink);
    } else if (index === 5) {
      // Bonsai with visible trunk structure and clipped canopy clusters.
      addPath(scene, [['M', 139, 296], ['C', 127, 246, 176 + lean * 22, 224,
        149 + lean * 36, 172], ['C', 137 + lean * 40, 142, 164 + lean * 42, 117,
        153 + lean * 46, 93]], style(null, '#715036', 18));
      addPath(scene, [['M', 148, 211], ['Q', 102, 180, 83, 151]], style(null, '#715036', 9));
      addPath(scene, [['M', 154, 181], ['Q', 202, 153, 217, 124]], style(null, '#715036', 8));
      [[91,145,47,29],[205,120,43,28],[151,91,51,30],[137,168,59,31]].forEach(function (cluster) {
        addEllipse(scene, cluster[0] + lean * 28, cluster[1], cluster[2], cluster[3],
          style(cluster[1] % 2 ? lightGreen : green, p.ink, 4));
      });
    } else if (index === 6) {
      // Twelve tall snake-plant blades.
      for (var blade = 0; blade < 10; blade += 1) {
        var bx = 101 + blade * 11;
        var height = 102 + (blade % 4) * 29;
        var shift = lean * height * (0.55 + (blade % 3) * 0.1);
        addPath(scene, [['M', bx, 295], ['Q', bx - 10 + shift, 295 - height * 0.62,
          bx + shift, 295 - height], ['Q', bx + 13 + shift, 295 - height * 0.58,
          bx + 9, 295], ['Z']], style(blade % 2 ? green : lightGreen, p.ink, 3));
        addLine(scene, [{ x: bx + 4, y: 287 }, { x: bx + shift, y: 302 - height }],
          style(null, p.highlight, 2, 0.6));
      }
    } else if (index === 7) {
      // Monstera with large split leaves and perforations.
      var leafSpecs = [[-2.7,84,25],[-2.22,105,28],[-1.72,117,30],[-1.18,105,28],[-0.65,84,25]];
      leafSpecs.forEach(function (spec, leafIndex) {
        var la = spec[0] + lean;
        addLeaf(scene, baseX, 286, spec[1], spec[2], la,
          leafIndex % 2 ? lightGreen : green, p.ink);
        var cx = baseX + Math.cos(la) * spec[1] * 0.62;
        var cy = 286 + Math.sin(la) * spec[1] * 0.62;
        addCircle(scene, cx, cy, 5, style(p.highlight, p.ink, 1.5));
      });
    } else if (index === 8) {
      // Aloe spikes in a radial crown.
      for (var aloe = 0; aloe < 13; aloe += 1) {
        var aloeAngle = -2.98 + aloe * 0.25 + lean;
        var aloeLength = 65 + (aloe % 4) * 17;
        addLeaf(scene, baseX, 292, aloeLength, 10, aloeAngle,
          aloe % 2 ? green : lightGreen, p.ink);
        for (var notch = 1; notch < 4; notch += 1) {
          var ratioA = notch / 5;
          addCircle(scene, baseX + Math.cos(aloeAngle) * aloeLength * ratioA,
            292 + Math.sin(aloeAngle) * aloeLength * ratioA, 1.6, style(p.highlight, null, 0));
        }
      }
    } else if (index === 9) {
      // Flytrap mouths are friendly botanical mechanisms, not faces.
      for (var trap = 0; trap < 7; trap += 1) {
        var trapAngle = -2.74 + trap * 0.38 + lean;
        var stemLength = 72 + (trap % 3) * 18;
        var tx = baseX + Math.cos(trapAngle) * stemLength;
        var ty = 289 + Math.sin(trapAngle) * stemLength;
        addLine(scene, [{ x: baseX, y: 290 }, { x: tx, y: ty }], style(null, green, 5));
        addPath(scene, [['M', tx - 19, ty], ['Q', tx, ty - 24, tx + 19, ty],
          ['Q', tx, ty - 3, tx - 19, ty], ['Z']], style(p.accent, p.ink, 3));
        addPath(scene, [['M', tx - 19, ty + 2], ['Q', tx, ty + 25, tx + 19, ty + 2],
          ['Q', tx, ty + 5, tx - 19, ty + 2], ['Z']], style(lightGreen, p.ink, 3));
      }
    } else if (index === 10) {
      // Palm with segmented trunk and broad fronds.
      addPath(scene, [['M', 138, 295], ['C', 126, 233, 168 + lean * 27, 169,
        149 + lean * 48, 104]], style(null, '#82613a', 20));
      for (var bark = 0; bark < 6; bark += 1) {
        addLine(scene, [{ x: 134 + lean * bark * 5, y: 270 - bark * 27 },
          { x: 158 + lean * bark * 5, y: 264 - bark * 27 }], style(null, '#b38a51', 3));
      }
      for (var palm = 0; palm < 9; palm += 1) {
        addLeaf(scene, 149 + lean * 48, 105, 78 + palm % 2 * 14, 13,
          -Math.PI + palm * Math.PI / 8 + lean, palm % 2 ? lightGreen : green, p.ink);
      }
    } else {
      // Flowering vine climbs a small authored trellis.
      addLine(scene, [{ x: 102, y: 292 }, { x: 102, y: 102 }], style(null, '#705438', 7));
      addLine(scene, [{ x: 198, y: 292 }, { x: 198, y: 102 }], style(null, '#705438', 7));
      [130, 180, 230, 280].forEach(function (y) {
        addLine(scene, [{ x: 102, y: y }, { x: 198, y: y }], style(null, '#705438', 5));
      });
      addPath(scene, [['M', baseX, 294], ['C', 72 + lean * 30, 252, 217 + lean * 36, 205,
        112 + lean * 42, 161], ['C', 71 + lean * 45, 130, 176 + lean * 50, 100,
        158 + lean * 52, 73]], style(null, green, 8));
      [[109,239],[185,205],[111,158],[178,121],[158,78]].forEach(function (flower, flowerIndex) {
        for (var vinePetal = 0; vinePetal < 5; vinePetal += 1) {
          var va = vinePetal * TAU / 5;
          addCircle(scene, flower[0] + lean * flowerIndex * 6 + Math.cos(va) * 9,
            flower[1] + Math.sin(va) * 9, 6, style(p.accent, p.ink, 1.5));
        }
        addCircle(scene, flower[0] + lean * flowerIndex * 6, flower[1], 4,
          style(p.highlight, p.ink, 1));
      });
    }
  }

  function drawPottedPlant(scene, variant, state, dynamics) {
    var p = paletteFor(variant);
    var index = variant.castIndex;
    shadow(scene, 78, 0.20);
    drawPlantFoliage(scene, variant, dynamics);
    addEllipse(scene, 150 + dynamics.soilShift, 293, 66, 18,
      style('#5c4030', p.ink, 4));
    var potFill = addGradient(scene, 'plant-pot', 78, 286, 222, 365,
      [[0, p.highlight], [0.38, p.base], [1, p.dark]]);
    if (index === 5 || index === 7) {
      addPath(scene, [['M', 80, 294], ['L', 220, 294], ['L', 205, 357],
        ['Q', 150, 377, 95, 357], ['Z']], style(potFill, p.ink, 6));
    } else if (index === 10) {
      addPath(scene, [['M', 91, 286], ['L', 209, 286], ['L', 224, 350],
        ['Q', 150, 380, 76, 350], ['Z']], style(potFill, p.ink, 6));
    } else {
      addPath(scene, [['M', 83, 292], ['L', 217, 292], ['L', 200, 362],
        ['Q', 150, 376, 100, 362], ['Z']], style(potFill, p.ink, 6));
    }
    addRect(scene, 77, 283, 146, 28, 9, style(p.accent, p.ink, 5));
    if (index % 3 === 0) {
      addLine(scene, [{ x: 107, y: 324 }, { x: 193, y: 324 }], style(null, p.highlight, 5, 0.62));
    } else if (index % 3 === 1) {
      addPath(scene, [['M', 109, 337], ['Q', 150, 309, 191, 337]],
        style(null, p.highlight, 5, 0.58));
    } else {
      addPolygon(scene, [{ x: 150, y: 317 }, { x: 164, y: 336 }, { x: 150, y: 354 },
        { x: 136, y: 336 }], style(p.highlight, p.ink, 2, 0.72));
    }
    addShine(scene, 106, 312, 38, 0.30);
  }

  var PAINTERS = Object.freeze({
    'coffee-mug': drawCoffee,
    penguin: drawPenguin,
    'action-figures': drawActionFigure,
    'desk-globe': drawDeskGlobe,
    'desk-gyroscope': drawGyroscope,
    'mechanical-metronome': drawMetronome,
    'potted-plants': drawPottedPlant,
  });

  function buildScene(request) {
    var source = request && typeof request === 'object' ? request : {};
    var definition = getDefinition(source.objectId);
    if (!definition) {
      if (PROTECTED_IDS.indexOf(String(source.objectId || '')) >= 0) {
        throw new Error('Protected Flipper art is not owned by v1.12 calibration: ' + source.objectId);
      }
      throw new Error('Unknown v1.12 calibration Flipper: ' + source.objectId);
    }
    var variant = getVariant(definition.objectId, source.variantId || definition.variants[0].id);
    if (!variant) throw new Error('Unknown variant for ' + definition.objectId + ': ' + source.variantId);
    var state = normalizeState(source.state || source);
    var dynamics = computeDynamics(definition.objectId, state);
    var scene = createScene(definition.objectId, variant, state);
    PAINTERS[definition.objectId](scene, variant, state, dynamics);
    return Object.freeze({
      schema: scene.schema,
      objectId: scene.objectId,
      variantId: variant.canonicalId,
      viewBox: scene.viewBox,
      state: state,
      dynamics: dynamics,
      gradients: Object.freeze(scene.gradients.slice()),
      commands: Object.freeze(scene.commands.slice()),
    });
  }

  function roundedRectPath(ctx, x, y, width, height, radius) {
    var r = Math.min(Math.max(0, radius || 0), width / 2, height / 2);
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

  function traceSegments(ctx, segments) {
    ctx.beginPath();
    segments.forEach(function (segment) {
      if (segment[0] === 'M') ctx.moveTo(segment[1], segment[2]);
      else if (segment[0] === 'L') ctx.lineTo(segment[1], segment[2]);
      else if (segment[0] === 'Q') ctx.quadraticCurveTo(segment[1], segment[2], segment[3], segment[4]);
      else if (segment[0] === 'C') ctx.bezierCurveTo(segment[1], segment[2], segment[3], segment[4],
        segment[5], segment[6]);
      else if (segment[0] === 'Z') ctx.closePath();
    });
  }

  function traceCommand(ctx, command) {
    if (command.kind === 'ellipse') {
      ctx.beginPath(); ctx.ellipse(command.cx, command.cy, command.rx, command.ry, 0, 0, TAU);
    } else if (command.kind === 'circle') {
      ctx.beginPath(); ctx.arc(command.cx, command.cy, command.radius, 0, TAU);
    } else if (command.kind === 'rect') {
      roundedRectPath(ctx, command.x, command.y, command.width, command.height, command.radius);
    } else if (command.kind === 'line' || command.kind === 'polygon') {
      ctx.beginPath();
      command.points.forEach(function (point, index) {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      if (command.kind === 'polygon') ctx.closePath();
    } else if (command.kind === 'path') {
      traceSegments(ctx, command.segments);
    }
  }

  function buildCanvasGradients(ctx, scene) {
    var result = Object.create(null);
    scene.gradients.forEach(function (definition) {
      var gradient;
      if (definition.radial && typeof ctx.createRadialGradient === 'function') {
        gradient = ctx.createRadialGradient(definition.x0, definition.y0, 0,
          definition.x1, definition.y1, Math.max(1,
            Math.sqrt(Math.pow(definition.x1 - definition.x0, 2) + Math.pow(definition.y1 - definition.y0, 2))));
      } else if (typeof ctx.createLinearGradient === 'function') {
        gradient = ctx.createLinearGradient(definition.x0, definition.y0, definition.x1, definition.y1);
      }
      if (gradient && typeof gradient.addColorStop === 'function') {
        definition.stops.forEach(function (stop) { gradient.addColorStop(stop.offset, stop.color); });
        result[definition.id] = gradient;
      } else {
        result[definition.id] = definition.stops[0].color;
      }
    });
    return result;
  }

  function resolvePaint(value, gradients) {
    var raw = String(value == null ? '' : value);
    return raw.indexOf('gradient:') === 0 ? gradients[raw.slice(9)] : value;
  }

  function applyPaint(ctx, command, gradients) {
    var paint = command.style || style(null, null, 0);
    var previousAlpha = Number.isFinite(ctx.globalAlpha) ? ctx.globalAlpha : 1;
    ctx.globalAlpha = previousAlpha * paint.opacity;
    if (paint.fill != null) {
      ctx.fillStyle = resolvePaint(paint.fill, gradients);
      ctx.fill();
    }
    if (paint.stroke != null && paint.lineWidth > 0) {
      ctx.strokeStyle = resolvePaint(paint.stroke, gradients);
      ctx.lineWidth = paint.lineWidth;
      ctx.stroke();
    }
    ctx.globalAlpha = previousAlpha;
  }

  function injectedGlobeSurface(source) {
    if (source.globeSurface) return source.globeSurface;
    if (source.renderResources && source.renderResources.globeSurface) {
      return source.renderResources.globeSurface;
    }
    return null;
  }

  function paintGlobeCommand(ctx, command, source) {
    var surface = injectedGlobeSurface(source);
    var renderRequest = {
      centerLon: command.centerLon,
      centerLat: command.centerLat,
      palette: command.palette,
      geography: source.geography,
    };
    if (surface && surface.shared === true && typeof surface.render === 'function' &&
      typeof ctx.drawImage === 'function') {
      try {
        var rendered = surface.render(renderRequest);
        var surfaceCanvas = rendered && rendered.canvas ? rendered.canvas : surface.canvas;
        if (!surfaceCanvas || surfaceCanvas === ctx.canvas) {
          throw new Error('Shared globe surface did not provide a separate compositing canvas');
        }
        ctx.drawImage(surfaceCanvas, command.cx - command.radius, command.cy - command.radius,
          command.radius * 2, command.radius * 2);
        if (typeof source.onGlobeComposite === 'function') {
          source.onGlobeComposite(Object.freeze({ path: 'shared-surface',
            rendererKind: rendered && rendered.rendererKind
              ? rendered.rendererKind : surface.rendererKind || 'injected' }));
        }
        return 'shared-surface';
      } catch (error) {
        if (typeof source.onGlobeFallback === 'function') source.onGlobeFallback(error);
      }
    }
    // Deterministic vector projection is the safe path for absent, failed or
    // incompatible surfaces. Rendering never creates a replacement context.
    Globe.renderCanvasGlobe(ctx, {
      centerX: command.cx,
      centerY: command.cy,
      radius: command.radius,
      centerLon: command.centerLon,
      centerLat: command.centerLat,
      palette: command.palette,
      geography: source.geography,
    });
    if (typeof source.onGlobeComposite === 'function') {
      source.onGlobeComposite(Object.freeze({ path: 'canvas-fallback', rendererKind: 'canvas' }));
    }
    return 'canvas-fallback';
  }

  function paintScene(ctx, scene, input) {
    if (!ctx || typeof ctx.save !== 'function') throw new TypeError('A canvas 2D context is required');
    var source = input && typeof input === 'object' ? input : {};
    var gradients = buildCanvasGradients(ctx, scene);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    scene.commands.forEach(function (command) {
      if (command.kind === 'globe') {
        paintGlobeCommand(ctx, command, source);
        return;
      }
      if (command.kind === 'text') {
        var textPaint = command.style || style(INK, null, 0);
        var previousAlpha = Number.isFinite(ctx.globalAlpha) ? ctx.globalAlpha : 1;
        ctx.globalAlpha = previousAlpha * textPaint.opacity;
        ctx.font = command.font;
        ctx.textAlign = command.align;
        ctx.textBaseline = command.baseline;
        if (textPaint.fill != null && typeof ctx.fillText === 'function') {
          ctx.fillStyle = resolvePaint(textPaint.fill, gradients);
          ctx.fillText(command.text, command.x, command.y);
        }
        if (textPaint.stroke != null && textPaint.lineWidth > 0 && typeof ctx.strokeText === 'function') {
          ctx.strokeStyle = resolvePaint(textPaint.stroke, gradients);
          ctx.lineWidth = textPaint.lineWidth;
          ctx.strokeText(command.text, command.x, command.y);
        }
        ctx.globalAlpha = previousAlpha;
        return;
      }
      traceCommand(ctx, command);
      applyPaint(ctx, command, gradients);
    });
    ctx.restore();
    return scene;
  }

  function renderPreview(ctx, request) {
    var source = request && typeof request === 'object' ? request : {};
    var definition = getDefinition(source.objectId);
    if (!definition) throw new Error('Unknown v1.12 calibration Flipper: ' + source.objectId);
    var box = source.box && typeof source.box === 'object' ? source.box : {};
    var x = finite(box.x, 0);
    var y = finite(box.y, 0);
    var width = Math.max(1, finite(box.width, ctx.canvas && ctx.canvas.width ? ctx.canvas.width : 300));
    var height = Math.max(1, finite(box.height, ctx.canvas && ctx.canvas.height ? ctx.canvas.height : 420));
    var padding = clamp(finite(source.padding, 0.06), 0, 0.3);
    var bounds = definition.bounds;
    var scene = buildScene(Object.assign({}, source, { state: Object.assign({}, source.state || source,
      { mode: 'preview' }) }));
    var previewAngle = scene.state.angle;
    var cosine = Math.abs(Math.cos(previewAngle));
    var sine = Math.abs(Math.sin(previewAngle));
    var rotatedWidth = bounds.width * cosine + bounds.height * sine;
    var rotatedHeight = bounds.width * sine + bounds.height * cosine;
    var scale = Math.min(width * (1 - padding * 2) / rotatedWidth,
      height * (1 - padding * 2) / rotatedHeight);
    var centerX = bounds.x + bounds.width / 2;
    var centerY = bounds.y + bounds.height / 2;
    ctx.save();
    ctx.translate(x + width / 2, y + height / 2);
    ctx.rotate(previewAngle);
    ctx.scale(scale, scale);
    ctx.translate(-centerX, -centerY);
    paintScene(ctx, scene, source);
    ctx.restore();
    return scene;
  }

  function renderGameplay(ctx, request) {
    var source = request && typeof request === 'object' ? request : {};
    var definition = getDefinition(source.objectId);
    if (!definition) throw new Error('Unknown v1.12 calibration Flipper: ' + source.objectId);
    var nestedState = source.state && typeof source.state === 'object' ? source.state : source;
    var gameplayAngle = source.angle != null ? source.angle : nestedState.angle;
    var state = Object.assign({}, nestedState, { mode: 'gameplay', angle: gameplayAngle });
    var scene = buildScene(Object.assign({}, source, { state: state }));
    var mapping = definition.mapping;
    var scale = Math.max(0.01, finite(source.scale, mapping.artScale));
    ctx.save();
    ctx.translate(finite(source.x, 0), finite(source.y, 0));
    ctx.rotate(normalizeAngle(gameplayAngle));
    ctx.scale(scale, scale);
    ctx.translate(-mapping.pivot.x, -mapping.pivot.y);
    paintScene(ctx, scene, source);
    ctx.restore();
    return scene;
  }

  function xmlEscape(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  function svgNumber(value) {
    var rounded = Math.round(finite(value, 0) * 1000) / 1000;
    return String(rounded === 0 ? 0 : rounded);
  }

  function svgPaint(value) {
    var raw = String(value == null ? '' : value);
    return raw.indexOf('gradient:') === 0 ? 'url(#' + xmlEscape(raw.slice(9)) + ')' : xmlEscape(raw);
  }

  function svgStyle(paint) {
    var value = paint || style(null, null, 0);
    return ' fill="' + (value.fill == null ? 'none' : svgPaint(value.fill)) + '"' +
      ' stroke="' + (value.stroke == null ? 'none' : svgPaint(value.stroke)) + '"' +
      ' stroke-width="' + svgNumber(value.lineWidth) + '"' +
      ' opacity="' + svgNumber(value.opacity) + '" stroke-linecap="round" stroke-linejoin="round"';
  }

  function segmentsToSvg(segments) {
    return segments.map(function (segment) {
      if (segment[0] === 'Z') return 'Z';
      return segment[0] + segment.slice(1).map(svgNumber).join(' ');
    }).join(' ');
  }

  function globeSvg(command, geography, clipId) {
    var parts = [];
    var palette = command.palette || {};
    var ocean = palette.ocean || '#176eaa';
    var land = palette.land || '#73a957';
    var coast = palette.coast || '#e8e0b8';
    parts.push('<g clip-path="url(#' + clipId + ')">');
    parts.push('<circle cx="' + svgNumber(command.cx) + '" cy="' + svgNumber(command.cy) +
      '" r="' + svgNumber(command.radius) + '" fill="' + xmlEscape(ocean) + '"/>');
    var prepared = Globe.prepareGeography(geography || Globe.getBundledGeography());
    prepared.rings.forEach(function (ring) {
      var segments = [];
      var drawing = false;
      ring.points.forEach(function (point) {
        var projected = Globe.projectPoint(point.latitude, point.longitude, {
          centerX: command.cx, centerY: command.cy, radius: command.radius,
          centerLon: command.centerLon, centerLat: command.centerLat,
        });
        if (!projected.visible) { drawing = false; return; }
        segments.push([drawing ? 'L' : 'M', projected.x, projected.y]);
        drawing = true;
      });
      if (segments.length < 3) return;
      parts.push('<path d="' + segmentsToSvg(segments) + ' Z" fill="' +
        xmlEscape(ring.hole ? ocean : land) + '" stroke="' + xmlEscape(coast) +
        '" stroke-width="0.8"/>');
    });
    parts.push('<ellipse cx="' + svgNumber(command.cx - command.radius * 0.28) +
      '" cy="' + svgNumber(command.cy - command.radius * 0.31) + '" rx="' +
      svgNumber(command.radius * 0.15) + '" ry="' + svgNumber(command.radius * 0.10) +
      '" fill="rgba(255,255,255,0.26)"/>');
    parts.push('</g>');
    parts.push('<circle cx="' + svgNumber(command.cx) + '" cy="' + svgNumber(command.cy) +
      '" r="' + svgNumber(command.radius) + '" fill="none" stroke="' +
      xmlEscape(palette.atmosphere || 'rgba(119,220,245,0.55)') + '" stroke-width="4"/>');
    return parts.join('');
  }

  function sceneToSvg(scene, input) {
    var source = input && typeof input === 'object' ? input : {};
    var definition = getDefinition(scene.objectId);
    var parts = [];
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420" role="img" aria-label="' +
      xmlEscape(definition.displayName + ' — ' + getVariant(scene.objectId, scene.variantId).name) +
      '" data-object="' + xmlEscape(scene.objectId) + '" data-variant="' +
      xmlEscape(scene.variantId) + '">');
    parts.push('<defs>');
    scene.gradients.forEach(function (gradient) {
      parts.push('<linearGradient id="' + xmlEscape(gradient.id) + '" x1="' + svgNumber(gradient.x0) +
        '" y1="' + svgNumber(gradient.y0) + '" x2="' + svgNumber(gradient.x1) +
        '" y2="' + svgNumber(gradient.y1) + '" gradientUnits="userSpaceOnUse">');
      gradient.stops.forEach(function (stop) {
        parts.push('<stop offset="' + svgNumber(stop.offset * 100) + '%" stop-color="' +
          xmlEscape(stop.color) + '"/>');
      });
      parts.push('</linearGradient>');
    });
    scene.commands.forEach(function (command, index) {
      if (command.kind === 'globe') {
        parts.push('<clipPath id="globe-clip-' + index + '"><circle cx="' + svgNumber(command.cx) +
          '" cy="' + svgNumber(command.cy) + '" r="' + svgNumber(command.radius) + '"/></clipPath>');
      }
    });
    parts.push('</defs>');
    scene.commands.forEach(function (command, index) {
      if (command.kind === 'ellipse') {
        parts.push('<ellipse cx="' + svgNumber(command.cx) + '" cy="' + svgNumber(command.cy) +
          '" rx="' + svgNumber(command.rx) + '" ry="' + svgNumber(command.ry) + '"' +
          svgStyle(command.style) + '/>');
      } else if (command.kind === 'circle') {
        parts.push('<circle cx="' + svgNumber(command.cx) + '" cy="' + svgNumber(command.cy) +
          '" r="' + svgNumber(command.radius) + '"' + svgStyle(command.style) + '/>');
      } else if (command.kind === 'rect') {
        parts.push('<rect x="' + svgNumber(command.x) + '" y="' + svgNumber(command.y) +
          '" width="' + svgNumber(command.width) + '" height="' + svgNumber(command.height) +
          '" rx="' + svgNumber(command.radius) + '"' + svgStyle(command.style) + '/>');
      } else if (command.kind === 'line' || command.kind === 'polygon') {
        parts.push('<' + (command.kind === 'polygon' ? 'polygon' : 'polyline') + ' points="' +
          command.points.map(function (point) { return svgNumber(point.x) + ',' + svgNumber(point.y); }).join(' ') +
          '"' + svgStyle(command.style) + '/>');
      } else if (command.kind === 'path') {
        parts.push('<path d="' + segmentsToSvg(command.segments) + '"' + svgStyle(command.style) + '/>');
      } else if (command.kind === 'text') {
        parts.push('<text x="' + svgNumber(command.x) + '" y="' + svgNumber(command.y) +
          '" text-anchor="' + (command.align === 'center' ? 'middle' : xmlEscape(command.align)) +
          '" font="' + xmlEscape(command.font) + '"' + svgStyle(command.style) + '>' +
          xmlEscape(command.text) + '</text>');
      } else if (command.kind === 'globe') {
        parts.push(globeSvg(command, source.geography, 'globe-clip-' + index));
      }
    });
    parts.push('</svg>');
    return parts.join('');
  }

  function renderSvg(request) {
    var scene = buildScene(request);
    return Object.freeze({ scene: scene, svg: sceneToSvg(scene, request) });
  }

  var renderVariantCache = new Map();

  function getRenderVariant(objectId, variantId) {
    var definition = getDefinition(objectId);
    var variant = getVariant(objectId, variantId);
    if (!definition || !variant) throw new Error('Unknown v1.12 render variant: ' + objectId + '.' + variantId);
    if (renderVariantCache.has(variant.canonicalId)) return renderVariantCache.get(variant.canonicalId);
    var renderVariant = Object.freeze({
      schema: 'RenderVariantV2',
      id: variant.canonicalId,
      objectId: objectId,
      variantId: variant.id,
      label: variant.name,
      color: variant.color,
      metrics: Object.freeze({ viewBox: VIEW_BOX, bounds: definition.bounds,
        mapping: definition.mapping }),
      buildScene: function (state) { return buildScene({ objectId: objectId,
        variantId: variant.id, state: state }); },
      renderCanvasLocal: function (ctx, state, options) {
        return paintScene(ctx, buildScene({ objectId: objectId, variantId: variant.id,
          state: state }), options);
      },
      renderSvg: function (state, options) {
        var scene = buildScene({ objectId: objectId, variantId: variant.id, state: state });
        return sceneToSvg(scene, options);
      },
    });
    renderVariantCache.set(variant.canonicalId, renderVariant);
    return renderVariant;
  }

  function clearRenderCache() {
    renderVariantCache.clear();
  }

  function cacheInfo() {
    return Object.freeze({ size: renderVariantCache.size,
      keys: Object.freeze(Array.from(renderVariantCache.keys())) });
  }

  function validateCalibration() {
    var errors = [];
    DEFINITIONS.forEach(function (definition) {
      if (definition.variants.length !== 12) errors.push(definition.objectId + ' does not have 12 variants');
      if (definition.mapping !== COMPETITIVE_MAPPING) errors.push(definition.objectId + ' changed the competitive mapping');
      if (definition.bounds.y + definition.bounds.height !== COMPETITIVE_MAPPING.baselineY) {
        errors.push(definition.objectId + ' does not terminate on y=376');
      }
      if (definition.physicsNeutralArt !== true) errors.push(definition.objectId + ' art is not physics neutral');
      var names = definition.variants.map(function (variant) { return variant.name; });
      if (new Set(names).size !== 12) errors.push(definition.objectId + ' has duplicate variant names');
    });
    PROTECTED_IDS.forEach(function (protectedId) {
      if (getDefinition(protectedId)) errors.push(protectedId + ' must remain outside v1.12 calibration');
    });
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
  }

  return Object.freeze({
    schema: 'FlipgameArtCalibrationV2',
    schemaVersion: 2,
    releaseVersion: 'v1.12',
    visualOnly: true,
    VIEW_BOX: VIEW_BOX,
    COMPETITIVE_MAPPING: COMPETITIVE_MAPPING,
    PROTECTED_IDS: PROTECTED_IDS,
    CALIBRATION_IDS: CALIBRATION_IDS,
    SWATCHES: SWATCHES,
    definitions: DEFINITIONS,
    getDefinition: getDefinition,
    getVariant: getVariant,
    getRenderVariant: getRenderVariant,
    clearRenderCache: clearRenderCache,
    cacheInfo: cacheInfo,
    normalizeState: normalizeState,
    computeDynamics: computeDynamics,
    buildScene: buildScene,
    paintScene: paintScene,
    renderPreview: renderPreview,
    renderGameplay: renderGameplay,
    renderSvg: renderSvg,
    sceneToSvg: sceneToSvg,
    paintGlobeCommand: paintGlobeCommand,
    validateCalibration: validateCalibration,
  });
});
