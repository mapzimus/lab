// v112-alien-event-adapters.js -- authored zero-gravity variants for every
// Signal Event. This module is immutable planning data; it owns no rules,
// outcome, renderer, physics-body, or progression authority.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112AlienEventAdapters = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function () {
  'use strict';

  var VERSION = 1;
  var CLASSIFICATIONS = Object.freeze([
    'adapted', 'self-contained', 'excluded-with-authored-replacement',
  ]);
  var CLASSIFICATION_SET = Object.create(null);
  CLASSIFICATIONS.forEach(function (value) { CLASSIFICATION_SET[value] = true; });
  var DANGEROUS_KEYS = Object.freeze({
    '__proto__': true, prototype: true, constructor: true,
  });
  var EVENT_CLASS_BY_ID = Object.freeze({
    'rainbow-corkscrew': 'assist', 'half-full': 'assist', 'power-launch': 'assist',
    'fizz-jet': 'hazard', 'golden-flip': 'assist', 'bouncy-bottle': 'hazard',
    earthquake: 'hazard', 'moon-gravity': 'wildcard', 'ice-slide': 'hazard',
    'alien-invasion': 'wildcard', 'gravity-slam': 'hazard', trampoline: 'assist',
    'wind-tunnel': 'hazard', 'shrink-ray': 'wildcard', 'portal-pair': 'wildcard',
    'tether-swing': 'wildcard', mitosis: 'assist', 'double-flip': 'wildcard',
    'ceiling-flip': 'hazard', 'meteor-shower': 'hazard', magnet: 'assist',
    'heart-rush': 'assist', 'black-hole': 'hazard', boomerang: 'wildcard',
    'roulette-table': 'wildcard', rewind: 'assist', plinko: 'wildcard',
    'mirror-match': 'wildcard', 'cap-toss': 'hazard', 'life-drain': 'assist',
  });

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }

  function plain(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    try {
      var proto = Object.getPrototypeOf(value);
      return proto === Object.prototype || proto === null;
    } catch (_) { return false; }
  }

  function text(value, label, maximum) {
    if (typeof value !== 'string') throw new TypeError(label + ' must be a string primitive');
    var result = value.trim();
    if (!result) throw new TypeError(label + ' is required');
    if (result.length > maximum) throw new RangeError(label + ' is too long');
    return result;
  }

  function finite(value, label, minimum, maximum) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(label + ' must be a finite number primitive');
    }
    if (minimum != null && value < minimum) throw new RangeError(label + ' is too small');
    if (maximum != null && value > maximum) throw new RangeError(label + ' is too large');
    return value;
  }

  function whole(value, label, minimum, maximum) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
      throw new TypeError(label + ' must be a safe integer primitive');
    }
    if (value < minimum || value > maximum) throw new RangeError(label + ' is out of range');
    return value;
  }

  function exactKeys(value, keys, label) {
    if (!plain(value)) throw new TypeError(label + ' must be a plain object');
    var expected = Object.create(null);
    keys.forEach(function (key) { expected[key] = true; });
    Reflect.ownKeys(value).forEach(function (key) {
      if (typeof key !== 'string' || !expected[key]) {
        throw new TypeError(label + ' has an unexpected field');
      }
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        throw new TypeError(label + ' cannot contain accessors');
      }
    });
    keys.forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        throw new TypeError(label + ' is missing ' + key);
      }
    });
  }

  function boundedCopy(value, label) {
    var seen = new WeakSet();
    var nodes = 0;
    function visit(current, depth) {
      nodes += 1;
      if (nodes > 4096 || depth > 12) throw new RangeError(label + ' is too large');
      if (current == null || typeof current === 'boolean' || typeof current === 'string') {
        if (typeof current === 'string' && current.length > 4096) {
          throw new RangeError(label + ' contains an oversized string');
        }
        return current;
      }
      if (typeof current === 'number') {
        if (!Number.isFinite(current)) throw new TypeError(label + ' contains a non-finite number');
        return current;
      }
      if (typeof current !== 'object' || seen.has(current)) {
        throw new TypeError(label + ' must be finite acyclic data');
      }
      seen.add(current);
      var proto = Object.getPrototypeOf(current);
      if (Array.isArray(current)) {
        if (proto !== Array.prototype || current.length > 512 || Reflect.ownKeys(current).some(function (key) {
          if (key === 'length') return false;
          if (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key)) return true;
          var index = Number(key);
          return index >= current.length;
        })) throw new TypeError(label + ' contains a non-canonical array');
        var output = [];
        for (var index = 0; index < current.length; index += 1) {
          if (!Object.prototype.hasOwnProperty.call(current, String(index))) {
            throw new TypeError(label + ' contains a sparse array');
          }
          var item = Object.getOwnPropertyDescriptor(current, String(index));
          if (!item || !Object.prototype.hasOwnProperty.call(item, 'value')) {
            throw new TypeError(label + ' contains an accessor');
          }
          output.push(visit(item.value, depth + 1));
        }
        seen.delete(current);
        return output;
      }
      if (proto !== Object.prototype && proto !== null) {
        throw new TypeError(label + ' contains a non-plain object');
      }
      var result = {};
      var keys = Reflect.ownKeys(current);
      if (keys.length > 128) throw new RangeError(label + ' contains too many fields');
      keys.forEach(function (key) {
        if (typeof key !== 'string' || DANGEROUS_KEYS[key]) {
          throw new TypeError(label + ' contains an unsafe field');
        }
        var descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
          throw new TypeError(label + ' contains an accessor');
        }
        result[key] = visit(descriptor.value, depth + 1);
      });
      seen.delete(current);
      return result;
    }
    return freeze(visit(value, 0));
  }

  function adapter(eventId, classification, variantId, mechanicsKind, instruction, config) {
    if (!CLASSIFICATION_SET[classification]) throw new Error('Invalid Alien adapter class');
    var source = config || {};
    var selfContained = classification === 'self-contained';
    var eventClass = EVENT_CLASS_BY_ID[eventId];
    if (!eventClass) throw new Error('Alien adapter has no canonical event class: ' + eventId);
    var difficulty = eventClass === 'hazard'
      ? { relationship: 'harder', minimumRatio: 0.45, maximumRatio: 0.75,
        minimumMakeRate: 0.10, maximumMakeRate: null, minimumMissRate: null }
      : (eventClass === 'assist'
        ? { relationship: 'easier', minimumRatio: 1.20, maximumRatio: 1.65,
          minimumMakeRate: null, maximumMakeRate: 0.85, minimumMissRate: 0.05 }
        : { relationship: 'different-technique', minimumRatio: 0.80,
          maximumRatio: 1.20, minimumMakeRate: null, maximumMakeRate: null,
          minimumMissRate: null });
    return freeze({
      schema: 'AlienEventAdapterV1', version: VERSION,
      eventId: eventId, classification: classification,
      adapterId: 'alien-v1:' + eventId,
      variantId: variantId, mechanicsKind: mechanicsKind, eventClass: eventClass,
      goalMode: selfContained ? 'event-owned' : 'bank-then-tractor-ring',
      preservesUfoField: !selfContained,
      requiresBankThenTractorRing: !selfContained,
      physical: true, visible: true, skillBased: true, missable: true,
      viewportScaled: true, restoresExactAlienState: true,
      automaticWinPossible: eventId === 'plinko',
      difficultyContract: difficulty,
      replacementForEarthImplementation:
        classification === 'excluded-with-authored-replacement' ? eventId : null,
      telegraph: {
        glyph: source.glyph || mechanicsKind,
        title: source.title || eventId,
        instruction: instruction,
        ariaCue: source.ariaCue || instruction,
      },
      authoredGeometry: (source.geometry || []).slice(),
      seededChannels: (source.channels || []).slice(),
      missPaths: (source.missPaths || [
        'misses-required-bank', 'misses-tractor-ring', 'exits-arena',
      ]).slice(),
      cleanupFields: [
        'physicsProfile', 'ufoState', 'selectedFlipperDynamics',
        'selectedFlipperAppearance', 'cameraState', 'scoringState',
      ],
      reducedMotion: {
        keepsPhysics: true, keepsGeometry: true, keepsOutcome: true,
        staticTelegraph: source.staticTelegraph || mechanicsKind,
      },
    });
  }

  // Six Earth implementations are deliberately excluded in Alien and replaced
  // under the same public event ID. The replacements alter actual colliders or
  // forces; none is a cosmetic rename or a common force multiplier.
  var ADAPTERS = freeze([
    adapter('rainbow-corkscrew', 'adapted', 'ion-corkscrew', 'helical-ion-force',
      'Ride the rainbow ion corkscrew, bank, then enter the tractor ring.', {
        glyph: 'rainbow-helix', geometry: ['rainbow-force-axis', 'ufo-bank', 'tractor-ring'],
        channels: ['helix-handedness', 'helix-phase'],
      }),
    adapter('half-full', 'adapted', 'inertial-slosh', 'zero-g-fluid-center-of-mass',
      'The visible liquid mass drifts with every impulse; use the bank to settle it.', {
        glyph: 'floating-liquid', geometry: ['internal-fluid-mass', 'ufo-bank', 'tractor-ring'],
        channels: ['fluid-phase', 'fluid-bias'],
      }),
    adapter('power-launch', 'adapted', 'afterburner-lane', 'extended-impulse-flight',
      'The launch crosses an extended UFO lane; control the bank before the ring.', {
        glyph: 'afterburner', geometry: ['extended-boundary', 'shock-ring', 'ufo-bank'],
        channels: ['lane-extension', 'contrail-phase'],
      }),
    adapter('fizz-jet', 'adapted', 'vacuum-fizz', 'rotating-axis-thrust',
      'The visible jet follows the Flipper axis and can thrust past the ring.', {
        glyph: 'spray-vector', geometry: ['authored-detachable-top', 'spray-jet', 'ufo-bank'],
        channels: ['jet-delay', 'jet-pressure'],
      }),
    adapter('golden-flip', 'adapted', 'golden-inertia', 'high-inertia-drift',
      'Extra inertia steadies rotation but makes a bad line harder to correct.', {
        glyph: 'gold-mass', geometry: ['mass-aura', 'ufo-bank', 'tractor-ring'],
        channels: ['aura-phase'],
      }),
    adapter('bouncy-bottle', 'adapted', 'rubber-ricochet', 'three-bank-restitution',
      'Up to three rubber ricochets can help or throw the Flipper out of the arena.', {
        glyph: 'ricochet', geometry: ['elastic-ufo-banks', 'arena-walls', 'tractor-ring'],
        channels: ['restitution-variation'],
      }),
    adapter('earthquake', 'excluded-with-authored-replacement', 'seismic-cage',
      'oscillating-alien-cage',
      'The enclosing walls and UFO banks oscillate while you line up the ring.', {
        glyph: 'moving-cage', geometry: ['oscillating-walls', 'oscillating-ufo-banks', 'debris'],
        channels: ['wall-phase-x', 'wall-phase-y', 'ufo-phase'],
      }),
    adapter('moon-gravity', 'excluded-with-authored-replacement', 'gravity-tide',
      'rotating-gravity-tide',
      'A visible gravity tide rotates through the zero-gravity field during flight.', {
        glyph: 'gravity-compass', geometry: ['gravity-compass', 'tide-streamlines', 'ufo-bank'],
        channels: ['tide-heading', 'tide-direction', 'tide-phase'],
      }),
    adapter('ice-slide', 'excluded-with-authored-replacement', 'ice-rail',
      'low-friction-rail-deflector',
      'Glide along the physical ice rail for the bank, then exit toward the ring.', {
        glyph: 'ice-rail', geometry: ['ice-rail-collider', 'soft-end-bumpers', 'tractor-ring'],
        channels: ['rail-side', 'rail-angle'],
      }),
    adapter('alien-invasion', 'excluded-with-authored-replacement', 'ufo-bank-swarm',
      'moving-ufo-bank-swarm',
      'Choose a moving UFO in the swarm for your bank, then reach the ring.', {
        glyph: 'ufo-swarm', geometry: ['five-to-seven-ufo-banks', 'swarm-orbits', 'tractor-ring'],
        channels: ['swarm-count', 'swarm-direction', 'swarm-phase', 'swarm-speed'],
      }),
    adapter('gravity-slam', 'adapted', 'vector-slam', 'seeded-direction-gravity-pulse',
      'A visible gravity pulse slams toward a seeded wall; recover into the ring.', {
        glyph: 'slam-vector', geometry: ['gravity-vector', 'impact-wall', 'tractor-ring'],
        channels: ['slam-heading', 'slam-delay', 'slam-strength'],
      }),
    adapter('trampoline', 'excluded-with-authored-replacement', 'spring-wall',
      'deforming-spring-wall',
      'Bank on the deforming spring wall and steer its real rebound into the ring.', {
        glyph: 'spring-wall', geometry: ['spring-wall-collider', 'compression-mesh', 'tractor-ring'],
        channels: ['spring-side', 'spring-strength'],
      }),
    adapter('wind-tunnel', 'excluded-with-authored-replacement', 'plasma-jet-lane',
      'directional-plasma-jets',
      'Visible plasma jets push and torque the Flipper across the UFO field.', {
        glyph: 'plasma-arrows', geometry: ['three-jet-nozzles', 'force-streamlines', 'ufo-bank'],
        channels: ['jet-heading', 'jet-phase', 'jet-pulse'],
      }),
    adapter('shrink-ray', 'adapted', 'micro-orbit', 'scaled-body-inertia-cut',
      'The smaller Flipper rotates faster and has a narrower bank target.', {
        glyph: 'shrink-ring', geometry: ['scale-beam', 'narrow-ufo-bank', 'tractor-ring'],
        channels: ['shrink-trigger'],
      }),
    adapter('portal-pair', 'adapted', 'orbital-portals', 'momentum-conserving-portals',
      'The portals rotate your direction but preserve speed and spin; a bank is still required.', {
        glyph: 'portal-vector', geometry: ['entry-portal', 'exit-portal', 'ufo-bank'],
        channels: ['portal-side', 'exit-rotation', 'portal-offset'],
      }),
    adapter('tether-swing', 'adapted', 'orbital-tether', 'zero-g-pendulum-release',
      'Swing around the visible anchor, release, bank, and enter the ring.', {
        glyph: 'orbit-tether', geometry: ['anchor', 'taut-cable', 'ufo-bank'],
        channels: ['anchor-side', 'cable-length', 'release-phase'],
      }),
    adapter('mitosis', 'adapted', 'twin-probes', 'two-full-flipper-trajectories',
      'Two complete Flippers separate; each must earn its own bank and ring entry.', {
        glyph: 'twin-flippers', geometry: ['full-copy-a', 'full-copy-b', 'ufo-banks'],
        channels: ['split-side', 'separation-speed'],
      }),
    adapter('double-flip', 'adapted', 'double-orbit', 'two-rotation-angular-assist',
      'Complete two rotations in the field, then bank and enter the tractor ring.', {
        glyph: 'double-orbit', geometry: ['rotation-rings', 'ufo-bank', 'tractor-ring'],
        channels: ['spin-assist-sign', 'spin-assist-delay'],
      }),
    adapter('ceiling-flip', 'adapted', 'polarity-ceiling', 'overhead-polarity-bank',
      'The polarity field pulls toward the overhead plate; bank there before the ring.', {
        glyph: 'polarity-plate', geometry: ['overhead-collider', 'polarity-lines', 'tractor-ring'],
        channels: ['plate-offset', 'polarity-ramp'],
      }),
    adapter('meteor-shower', 'adapted', 'orbital-debris', 'collidable-meteor-field',
      'Physical meteors can deflect the line without deciding the result.', {
        glyph: 'meteor-vectors', geometry: ['collidable-meteors', 'spawn-boundary', 'ufo-bank'],
        channels: ['meteor-count', 'meteor-stream', 'meteor-speed'],
      }),
    adapter('magnet', 'adapted', 'tractor-magnet', 'fallible-ring-attraction',
      'A visible magnetic field bends toward the ring but cannot replace the bank.', {
        glyph: 'field-lines', geometry: ['magnetic-field-lines', 'ufo-bank', 'tractor-ring'],
        channels: ['magnet-polarity', 'magnet-pulse'],
      }),
    adapter('heart-rush', 'adapted', 'three-pulse-brace', 'three-vector-stabilizers',
      'Three visible pulses reduce tumble without correcting a missed bank or ring.', {
        glyph: 'three-pulses', geometry: ['pulse-one', 'pulse-two', 'pulse-three'],
        channels: ['pulse-timing', 'pulse-strength'],
      }),
    adapter('black-hole', 'adapted', 'singularity-bank', 'inverse-square-orbit',
      'Curve through the singularity field, survive the bank, and reach the ring.', {
        glyph: 'singularity', geometry: ['singularity', 'accretion-ring', 'ufo-bank'],
        channels: ['singularity-position', 'singularity-strength', 'orbit-sign'],
      }),
    adapter('boomerang', 'adapted', 'return-vector', 'curved-out-and-back-force',
      'Ride the visible return arc through a far bank and back into the ring.', {
        glyph: 'return-arc', geometry: ['return-arc', 'far-ufo-bank', 'tractor-ring'],
        channels: ['return-side', 'curve-strength', 'return-delay'],
      }),
    adapter('roulette-table', 'self-contained', 'orbital-roulette', 'physical-eight-sector-wheel',
      'Land on the tracked eight-sector wheel; the physical sector sets the result.', {
        glyph: 'eight-sector-wheel', geometry: ['wheel-collider', 'eight-sector-sensors'],
        channels: ['wheel-direction', 'wheel-speed', 'wheel-phase'],
        missPaths: ['misses-wheel', 'fails-to-settle', 'exits-arena'],
      }),
    adapter('rewind', 'adapted', 'trajectory-recall', 'physical-apex-replay',
      'A failed ring attempt rewinds once to the recorded apex with a fallible correction.', {
        glyph: 'reverse-arc', geometry: ['recorded-arc', 'rewind-ghost', 'ufo-bank'],
        channels: ['correction-heading', 'correction-strength'],
      }),
    adapter('plinko', 'self-contained', 'alien-plinko', 'trampoline-plinko-board',
      'The spring launches your Flipper into the 24-row, nine-slot physical board.', {
        glyph: 'spring-nine-slots', geometry: ['opening-trampoline', '24-peg-rows', 'nine-slot-sensors'],
        channels: ['entry-spin', 'anti-wedge-direction'],
        missPaths: ['automatic-loss-left', 'automatic-loss-right', 'recovery-timeout'],
      }),
    adapter('mirror-match', 'adapted', 'reflected-flight', 'normalized-alien-launch-copy',
      'Opponents copy the normalized Alien launch, UFO field, seed, and bank challenge.', {
        glyph: 'mirror-ufo', geometry: ['reflective-field-panels', 'ufo-bank', 'tractor-ring'],
        channels: ['reflection-phase'],
      }),
    adapter('cap-toss', 'adapted', 'dual-tractor-target', 'authored-top-dual-bank-ring',
      'The Flipper and its authored top must each bank and enter their marked tractor target.', {
        glyph: 'two-tractor-targets', geometry: ['full-flipper', 'authored-top-or-wfc-headgear', 'paired-rings'],
        channels: ['separation-side', 'separation-strength', 'ring-offset'],
      }),
    adapter('life-drain', 'adapted', 'green-signal-field', 'hidden-fallible-ring-magnet',
      'The arena turns green; earn the bank and ring entry to trigger the drain.', {
        glyph: 'green-field', geometry: ['green-field-overlay', 'ufo-bank', 'tractor-ring'],
        channels: ['hidden-magnet-pulse', 'hidden-magnet-strength'],
      }),
  ]);

  var BY_ID = Object.create(null);
  ADAPTERS.forEach(function (entry) {
    if (BY_ID[entry.eventId]) throw new Error('Duplicate Alien event adapter: ' + entry.eventId);
    BY_ID[entry.eventId] = entry;
  });

  function get(eventId) { return BY_ID[String(eventId)] || null; }
  function has(eventId) { return !!get(eventId); }

  function mix(seed, channel) {
    var x = seed >>> 0;
    for (var index = 0; index < channel.length; index += 1) {
      x = Math.imul((x ^ channel.charCodeAt(index)) >>> 0, 0x45d9f3b) >>> 0;
      x = (x ^ (x >>> 16)) >>> 0;
    }
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
    return (x ^ (x >>> 16)) >>> 0;
  }

  function unit(seed, channel) { return mix(seed, channel) / 0x100000000; }
  function range(seed, channel, minimum, maximum) {
    return minimum + (maximum - minimum) * unit(seed, channel);
  }
  function sign(seed, channel) { return (mix(seed, channel) & 1) ? 1 : -1; }
  function integer(seed, channel, minimum, maximum) {
    return minimum + (mix(seed, channel) % (maximum - minimum + 1));
  }

  function arenaScale(layout) {
    exactKeys(layout, ['width', 'height'], 'Alien event layout');
    var width = finite(layout.width, 'Alien event layout.width', 240, 7680);
    var height = finite(layout.height, 'Alien event layout.height', 240, 4320);
    var shortSide = Math.min(width, height);
    var scale = Math.max(0.5, Math.min(4, shortSide / 720));
    return freeze({ schema: 'AlienArenaScaleV1', width: width, height: height,
      shortSide: shortSide, scale: scale, centerX: width / 2, centerY: height / 2 });
  }

  function mechanics(eventId, seed, arena) {
    var s = arena.scale;
    var side = sign(seed, 'side');
    var angle = range(seed, 'heading', -Math.PI, Math.PI);
    switch (eventId) {
      case 'rainbow-corkscrew': return { kind: 'helical-ion-force', turns: 2.25,
        radius: 72 * s, handedness: sign(seed, 'helix-handedness'),
        phase: range(seed, 'helix-phase', 0, Math.PI * 2), force: 0.00145 };
      case 'half-full': return { kind: 'zero-g-fluid-center-of-mass', fill: 0.5,
        maxComShift: 18 * s, viscosity: 0.72, contactDamping: 0.18,
        fluidPhase: range(seed, 'fluid-phase', 0, Math.PI * 2),
        bias: sign(seed, 'fluid-bias') };
      case 'power-launch': return { kind: 'extended-impulse-flight', impulseScale: 1.62,
        laneExtension: range(seed, 'lane-extension', 0.38, 0.46) * arena.width,
        shockRadius: 110 * s, contrailPhase: range(seed, 'contrail-phase', 0, Math.PI * 2) };
      case 'fizz-jet': return { kind: 'rotating-axis-thrust', delayMs: integer(seed, 'jet-delay', 180, 360),
        durationMs: 900, force: range(seed, 'jet-pressure', 0.0016, 0.0022) };
      case 'golden-flip': return { kind: 'high-inertia-drift', massScale: 1.35,
        inertiaScale: 1.65, restitution: 0.16,
        auraPhase: range(seed, 'aura-phase', 0, Math.PI * 2) };
      case 'bouncy-bottle': return { kind: 'three-bank-restitution',
        restitution: range(seed, 'restitution-variation', 0.84, 0.92),
        maximumRicochets: 3, squashDurationMs: 110 };
      case 'earthquake': return { kind: 'oscillating-alien-cage', wallAmplitudeX: 54 * s,
        wallAmplitudeY: 28 * s, wallHz: 2.2, ufoAmplitude: 36 * s,
        phase: range(seed, 'ufo-phase', 0, Math.PI * 2) };
      case 'moon-gravity': return { kind: 'rotating-gravity-tide', heading: angle,
        angularRate: side * 0.72, acceleration: 0.00082, streamlineCount: 9 };
      case 'ice-slide': return { kind: 'low-friction-rail-deflector', side: side,
        railAngle: side * range(seed, 'rail-angle', 0.22, 0.52), railLength: 0.62 * arena.height,
        friction: 0.001, bumperRestitution: 0.32, recoveryMs: 1800 };
      case 'alien-invasion': return { kind: 'moving-ufo-bank-swarm', ufoCount: integer(seed, 'swarm-count', 5, 7),
        orbitDirection: side, orbitRadius: 0.24 * arena.shortSide,
        angularRate: range(seed, 'swarm-speed', 0.42, 0.68), phase: range(seed, 'swarm-phase', 0, Math.PI * 2) };
      case 'gravity-slam': return { kind: 'seeded-direction-gravity-pulse', heading: angle,
        delayMs: integer(seed, 'slam-delay', 520, 840), durationMs: 520,
        acceleration: range(seed, 'slam-strength', 0.0024, 0.0034) };
      case 'trampoline': return { kind: 'deforming-spring-wall', side: side,
        springImpulse: range(seed, 'spring-strength', 25, 34) * s,
        compressionMs: 90, releaseMs: 160, maximumRelaunches: 1 };
      case 'wind-tunnel': return { kind: 'directional-plasma-jets', heading: angle,
        nozzleCount: 3, force: 0.0019, pulseHz: range(seed, 'jet-pulse', 0.72, 1.08),
        phase: range(seed, 'jet-phase', 0, Math.PI * 2) };
      case 'shrink-ray': return { kind: 'scaled-body-inertia-cut',
        triggerMs: integer(seed, 'shrink-trigger', 210, 290),
        scale: 0.62, inertiaScale: 0.3844, bankWidthScale: 0.72 };
      case 'portal-pair': return { kind: 'momentum-conserving-portals', side: side,
        exitRotation: side * range(seed, 'exit-rotation', 0.7, 1.25), speedRatio: 1,
        spinRatio: 1, offset: range(seed, 'portal-offset', 0.18, 0.31) * arena.shortSide };
      case 'tether-swing': return { kind: 'zero-g-pendulum-release', anchorSide: side,
        cableLength: range(seed, 'cable-length', 0.28, 0.42) * arena.shortSide,
        releaseRadians: range(seed, 'release-phase', 1.25, 1.72) };
      case 'mitosis': return { kind: 'two-full-flipper-trajectories', splitMs: 240,
        copyMassScale: 0.5, separationSpeed: range(seed, 'separation-speed', 2.2, 3.4) * s,
        independentBankAndRing: true };
      case 'double-flip': return { kind: 'two-rotation-angular-assist', minimumRotations: 2,
        impulseSign: side, angularImpulse: range(seed, 'spin-assist-delay', 0.22, 0.34),
        impulseMs: 260 };
      case 'ceiling-flip': return { kind: 'overhead-polarity-bank', plateY: 0.09 * arena.height,
        plateOffsetX: side * range(seed, 'plate-offset', 0.08, 0.2) * arena.width,
        acceleration: 0.0021, rampMs: integer(seed, 'polarity-ramp', 260, 480) };
      case 'meteor-shower': return { kind: 'collidable-meteor-field', count: integer(seed, 'meteor-count', 7, 12),
        heading: angle, speed: range(seed, 'meteor-speed', 5.5, 8.5) * s,
        bodyRadius: 12 * s };
      case 'magnet': return { kind: 'fallible-ring-attraction', polarity: side,
        maximumForce: 0.00115, softeningRadius: 76 * s, bankStillRequired: true };
      case 'heart-rush': return { kind: 'three-vector-stabilizers', pulseTimesMs: [520, 940, 1360],
        angularDampingPerPulse: 0.16,
        linearImpulse: range(seed, 'pulse-strength', 0.32, 0.40) * s,
        timingOffsetMs: integer(seed, 'pulse-timing', -35, 35) };
      case 'black-hole': return { kind: 'inverse-square-orbit', x: arena.centerX + side * 0.17 * arena.width,
        y: arena.centerY - 0.12 * arena.height, strength: range(seed, 'singularity-strength', 0.0032, 0.0044),
        softeningRadius: 48 * s, orbitSign: sign(seed, 'orbit-sign') };
      case 'boomerang': return { kind: 'curved-out-and-back-force', side: side,
        curveForce: range(seed, 'curve-strength', 0.0014, 0.002), returnDelayMs: integer(seed, 'return-delay', 720, 1100),
        farBankX: arena.centerX + side * 0.38 * arena.width };
      case 'roulette-table': return { kind: 'physical-eight-sector-wheel', sectors: [1, 2, 3, 4, 4, 3, 2, 1],
        angularVelocity: side * range(seed, 'wheel-speed', 0.65, 1.05),
        phase: range(seed, 'wheel-phase', 0, Math.PI * 2), trackedCamera: true };
      case 'rewind': return { kind: 'physical-apex-replay', maximumReplays: 1,
        correctionHeading: angle, correctionImpulse: range(seed, 'correction-strength', 0.65, 1.05) * s,
        finalVerdictOnly: true };
      case 'plinko': return { kind: 'trampoline-plinko-board', trampolineImpulse: 28 * s,
        pegRows: 24, slots: 9, dropMinMs: 10000, dropMedianMs: 12000,
        dropMaxMs: 15000, antiWedgeTimeoutMs: 30000, trackedCamera: true,
        antiWedgeDirection: sign(seed, 'anti-wedge-direction'),
        entrySpinBias: range(seed, 'entry-spin', -0.12, 0.12) };
      case 'mirror-match': return { kind: 'normalized-alien-launch-copy', nestedEvents: false,
        copiesLaunch: true, copiesSpin: true, copiesSeed: true, copiesAlienProfile: true,
        reflectionPhase: range(seed, 'reflection-phase', 0, Math.PI * 2) };
      case 'cap-toss': return { kind: 'authored-top-dual-bank-ring', separationSide: side,
        separationImpulse: range(seed, 'separation-strength', 1.8, 2.8) * s,
        ringSeparation: range(seed, 'ring-offset', 0.12, 0.2) * arena.width,
        livingFlipperPart: 'wfc-headgear', bothTargetsRequired: true };
      case 'life-drain': return { kind: 'hidden-fallible-ring-magnet', arenaTint: '#5f8f3b',
        maximumForce: range(seed, 'hidden-magnet-strength', 0.00072, 0.00098),
        pulseHz: range(seed, 'hidden-magnet-pulse', 0.55, 0.9), bankStillRequired: true };
      default: throw new TypeError('Unknown Alien event adapter: ' + eventId);
    }
  }

  function derivePlan(input) {
    exactKeys(input, ['eventId', 'eventSeed', 'layout'], 'Alien event plan input');
    var eventId = text(input.eventId, 'Alien event ID', 96);
    var entry = get(eventId);
    if (!entry) throw new TypeError('No compatible Alien adapter for ' + eventId);
    var eventSeed = whole(input.eventSeed, 'Alien event seed', 0, 0xffffffff) >>> 0;
    var arena = arenaScale(input.layout);
    return freeze({ schema: 'AlienEventPlanV1', version: VERSION,
      adapterId: entry.adapterId, eventId: eventId, eventSeed: eventSeed,
      classification: entry.classification, variantId: entry.variantId,
      mechanicsKind: entry.mechanicsKind,
      goal: { mode: entry.goalMode, preservesUfoField: entry.preservesUfoField,
        bankRequired: entry.requiresBankThenTractorRing,
        tractorRingRequired: entry.requiresBankThenTractorRing },
      arena: arena, mechanics: mechanics(eventId, eventSeed, arena),
      telegraph: entry.telegraph, missPaths: entry.missPaths,
      reducedMotion: entry.reducedMotion,
      cleanup: { exactRestoreRequired: true, fields: entry.cleanupFields },
    });
  }

  function captureRestoreState(eventIdValue, stateValue) {
    var eventId = text(eventIdValue, 'Alien restore event ID', 96);
    if (!has(eventId)) throw new TypeError('No compatible Alien adapter for ' + eventId);
    exactKeys(stateValue, ['schema', 'physicsProfile', 'ufoState',
      'selectedFlipperDynamics', 'selectedFlipperAppearance', 'cameraState',
      'scoringState'], 'Alien base state');
    if (stateValue.schema !== 'AlienBaseStateV1') throw new TypeError('AlienBaseStateV1 is required');
    var state = boundedCopy(stateValue, 'Alien base state');
    return freeze({ schema: 'AlienEventRestoreV1', version: VERSION,
      eventId: eventId, exact: true, state: state });
  }

  function restoreState(restoreValue) {
    exactKeys(restoreValue, ['schema', 'version', 'eventId', 'exact', 'state'],
      'Alien restore contract');
    if (restoreValue.schema !== 'AlienEventRestoreV1' || restoreValue.version !== VERSION ||
        restoreValue.exact !== true || !has(restoreValue.eventId)) {
      throw new TypeError('Invalid AlienEventRestoreV1');
    }
    return boundedCopy(restoreValue.state, 'Alien restore state');
  }

  function assertComplete(eventIds) {
    if (!Array.isArray(eventIds) || Object.getPrototypeOf(eventIds) !== Array.prototype) {
      throw new TypeError('Canonical event IDs must be an array');
    }
    var expected = eventIds.map(function (value) { return text(value, 'canonical event ID', 96); });
    if (expected.length !== ADAPTERS.length || new Set(expected).size !== expected.length ||
        expected.some(function (eventId) { return !has(eventId); }) ||
        ADAPTERS.some(function (entry) { return expected.indexOf(entry.eventId) < 0; })) {
      throw new Error('AlienEventAdapterV1 registry does not exactly cover the canonical event catalog');
    }
    return true;
  }

  return freeze({ schema: 'AlienEventAdapterRegistryV1', version: VERSION,
    classifications: CLASSIFICATIONS, adapters: ADAPTERS,
    get: get, has: has, assertComplete: assertComplete,
    derivePlan: derivePlan, captureRestoreState: captureRestoreState,
    restoreState: restoreState });
});
