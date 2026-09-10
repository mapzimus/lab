// v111-physics-events.js — canonical event catalog, deterministic selection,
// hook implementations, and rules/render metadata for Flipgame v111.
(function (root, factory) {
  'use strict';
  var interfaces = root && root.FlipgameV111Interfaces;
  if (typeof module === 'object' && module.exports) {
    interfaces = require('./v111-interfaces.js');
  }
  var api = factory(interfaces);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV111PhysicsEvents = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Interfaces) {
  'use strict';

  if (!Interfaces) throw new Error('FlipgameV111Interfaces must load before v111-physics-events.js');

  var PLINKO_SLOTS = Object.freeze([
    'lives-doubled', 'everyone-else-halved', 'always-magnet', 'automatic-loss',
    'automatic-win', 'automatic-loss', 'always-magnet',
    'everyone-else-halved', 'lives-doubled',
  ]);

  // Arena Draft consumes these symmetric, reward-free physical profiles. They
  // intentionally contain no event odds, progression, or scoring operation.
  var ARENA_PROFILES = Interfaces.immutableCopy({
    crosswind: { id: 'crosswind', physicsKind: 'wind', force: 1, symmetric: true, reward: null },
    'moon-gravity': { id: 'moon-gravity', gravityScale: 0.28, symmetric: true, reward: null },
    'gravity-slam': { id: 'gravity-slam', gravityScale: 2.55, symmetric: true, reward: null },
    'spring-table': { id: 'spring-table', restitution: 0.88, symmetric: true, reward: null },
    'slick-table': { id: 'slick-table', friction: 0.001, symmetric: true, reward: null },
  });

  var SALTS = Object.freeze({
    // Retains the frozen v111 Golden/no-event QA fixtures (457/77) while the
    // categorical selector below removes independent-roll suppression.
    occurrence: 0x00000069,
    insaneOccurrence: 0x6c8e9cf5,
    insanePick: 0x3d20adea,
    eventBase: 0x9e3779b9,
  });

  function mixSeed(seed, salt) {
    var x = ((Number(seed) >>> 0) ^ (Number(salt) >>> 0)) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function eventSalt(index) {
    return mixSeed(SALTS.eventBase, Math.imul(index + 1, 0x45d9f3b));
  }

  function callEffect(context, phase, config, state) {
    if (context && typeof context.applyEventEffect === 'function') {
      return context.applyEventEffect(phase, config, state);
    }
    return undefined;
  }

  function makeHook(phase, config) {
    return function (context, state) {
      return callEffect(context, phase, config, state);
    };
  }

  var CONFIG = Interfaces.immutableCopy({
    'rainbow-corkscrew': {
      physicsKind: 'corkscrew', launchY: 1.18, spin: 0.94, settleMs: 4000,
      visual: { theme: 'rainbow', trail: 'six-band-corkscrew' },
      reward: { onSuccess: { additiveLives: 1, capped: true } },
    },
    'half-full': {
      physicsKind: 'liquid-shift', spin: 0.90, angularDrive: 0.012, settleMs: 4000,
      dynamicCenterOfMass: true, baseContactStabilization: true,
      visual: { theme: 'water', overlay: 'half-full' }, reward: {},
    },
    'power-launch': {
      physicsKind: 'power-launch', launchY: 1.72, spin: 1.34, settleMs: 4000,
      visual: { theme: 'power', trail: 'shockwave' }, reward: {},
    },
    'fizz-jet': {
      physicsKind: 'fizz-jet', launchY: 1.12, spin: 1.08, settleMs: 4000,
      rotatingAxisThrust: true, independentCap: true,
      visual: { theme: 'fizz', particles: 'bubbles' }, reward: {},
    },
    'golden-flip': {
      physicsKind: 'golden-balance', spin: 1.02, settleMs: 4000,
      visual: { theme: 'gold', trail: 'sparkle' },
      reward: { onSuccess: { stakeMultiplier: 2 } },
    },
    'bouncy-bottle': {
      physicsKind: 'bouncy', restitution: 0.88, settleMs: 6000,
      maxBounces: 3,
      visual: { theme: 'rubber', surface: 'bounce' }, reward: {},
    },
    earthquake: {
      physicsKind: 'earthquake', settleMs: 4000,
      visual: { theme: 'quake', arena: 'shaking-table' }, reward: {},
    },
    'moon-gravity': {
      physicsKind: 'moon', gravity: 0.28, spin: 0.76, settleMs: 5000,
      visual: { theme: 'moon', arena: 'stars' }, reward: {},
    },
    'ice-slide': {
      physicsKind: 'ice', settleMs: 6000,
      frictionReturnMs: 2000, softBumpers: true,
      visual: { theme: 'ice', surface: 'slick' }, reward: {},
    },
    'alien-invasion': {
      physicsKind: 'alien', gravity: 0.08, settleMs: 4000, bankRequired: true,
      visual: { theme: 'alien', target: 'tractor-ring' }, reward: {},
    },
    'gravity-slam': {
      physicsKind: 'gravity-slam', gravity: 2.55, spin: 1.72, settleMs: 4000,
      visual: { theme: 'gravity', trail: 'slam-lines' }, reward: {},
    },
    trampoline: {
      physicsKind: 'trampoline', settleMs: 4000,
      visual: { theme: 'trampoline', surface: 'spring' }, reward: {},
    },
    'wind-tunnel': {
      physicsKind: 'wind', spin: 1.42, settleMs: 5000,
      visual: { theme: 'wind', arena: 'wind-tunnel' }, reward: {},
    },
    'shrink-ray': {
      physicsKind: 'shrink', bodyScale: 0.62, settleMs: 4000,
      visual: { theme: 'shrink', objectScale: 0.62 },
      reward: { onSuccessByPose: { upright: 2, cap: 3 }, capped: true },
    },
    'portal-pair': {
      physicsKind: 'portals', settleMs: 4000,
      conserveSpeed: true, conserveSpin: true,
      visual: { theme: 'portal', arena: 'paired-portals' }, reward: {},
    },
    'tether-swing': {
      physicsKind: 'tether', spin: 1.18, settleMs: 4000,
      tautCable: true, releaseAtLowPoint: true,
      visual: { theme: 'tether', arena: 'anchor-line' }, reward: {},
    },
    mitosis: {
      physicsKind: 'mitosis', settleMs: 4000,
      splitMassFraction: 0.5, conserveAngularMomentum: true,
      visual: { theme: 'mitosis', objectCopies: 2 },
      reward: { onSuccessByLandedCopies: { one: 1, both: 3 }, capped: true },
    },
    'double-flip': {
      physicsKind: 'double-flip', requiredRotations: 2, settleMs: 4000,
      visual: { theme: 'double', trail: 'double-helix' },
      reward: {
        onSuccess: { flipperLivesMultiplier: 2, opponentsLivesMultiplier: 0.5,
          opponentRounding: 'max(1,ceil)', activeOpponentsOnly: true,
          bypassAdditiveCap: true },
      },
    },
    'ceiling-flip': {
      physicsKind: 'ceiling', ceiling: true, launchY: 0.65, spin: 1.32, settleMs: 4000,
      landingPlane: 'ceiling', invertedGravity: true,
      visual: { theme: 'ceiling', target: 'ceiling' }, reward: {},
    },
    'meteor-shower': {
      physicsKind: 'meteors', settleMs: 4000,
      visual: { theme: 'meteor', arena: 'falling-meteors' }, reward: {},
    },
    magnet: {
      physicsKind: 'magnet', magnet: 0.085, settleMs: 4000,
      visual: { theme: 'magnet', target: 'landing-field' }, reward: {},
    },
    'heart-rush': {
      physicsKind: 'heart', settleMs: 4000,
      visual: { theme: 'heart', trail: 'pulse' },
      reward: { onSuccess: { additiveLives: 3, capped: true } },
    },
    'black-hole': {
      physicsKind: 'black-hole', settleMs: 4000,
      visual: { theme: 'black-hole', arena: 'singularity' }, reward: {},
    },
    boomerang: {
      physicsKind: 'boomerang', settleMs: 4000,
      visual: { theme: 'boomerang', trail: 'return-arc' }, reward: {},
    },
    'roulette-table': {
      physicsKind: 'roulette', settleMs: 4000,
      physicalWheel: true, sectors: 8,
      visual: { theme: 'roulette', surface: 'eight-segment-wheel' },
      reward: { multipliers: Object.freeze([1, 2, 3, 4, 4, 3, 2, 1]), bypassAdditiveCap: true },
    },
    rewind: {
      physicsKind: 'rewind', settleMs: 4000,
      trigger: 'first-failure', replayCount: 1, resolveFinalOnly: true,
      visual: { theme: 'rewind', trail: 'reverse' }, reward: {},
    },
    plinko: {
      physicsKind: 'plinko', settleMs: 4000, automatic: true,
      visual: { theme: 'plinko', camera: 'long-board-follow' },
      reward: {
        slots: PLINKO_SLOTS,
        slotEffects: {
          'lives-doubled': { flipperLivesMultiplier: 2, bypassAdditiveCap: true },
          'everyone-else-halved': {
            opponentsLivesMultiplier: 0.5, opponentRounding: 'max(1,ceil)',
            activeOpponentsOnly: true, bypassAdditiveCap: true,
          },
          'always-magnet': { grantAlwaysMagnet: true },
          'automatic-loss': { automaticOutcome: 'MISS' },
          'automatic-win': { automaticOutcome: 'MAKE' },
        },
      },
    },
    'mirror-match': {
      physicsKind: 'mirror', settleMs: 4000,
      visual: { theme: 'mirror', objectCopies: 2 }, reward: {},
    },
    'cap-toss': {
      physicsKind: 'cap-toss', spin: 1.52, settleMs: 4000,
      landing: { uprightValid: true, capValid: true, bothBodiesRequired: true },
      visual: { theme: 'cap', target: 'cap-balance' },
      reward: { onSuccess: { additiveLives: 5, capped: true } },
    },
    'life-drain': {
      physicsKind: 'life-drain', spin: 1.12, magnet: 0.125, settleMs: 4000,
      visual: { theme: 'drain', magnetDisclosure: 'hidden' },
      reward: { onSuccess: { opponentsSetLives: 1, activeOpponentsOnly: true } },
    },
  });

  function defaultLanding(config) {
    if (config.automatic) return { uprightValid: false, capValid: false, automatic: true };
    return Object.assign({ uprightValid: true, capValid: true, automatic: false }, config.landing || {});
  }

  function metadataFor(entry, config) {
    return {
      schema: 'FlipgameEventMetadataV1',
      version: 1,
      eventId: entry.id,
      displayName: entry.displayName,
      normalDenominator: entry.normalDenominator,
      registryOrder: entry.registryOrder,
      physics: {
        kind: config.physicsKind,
        settleLimitMs: config.settleMs,
        requiredRotations: config.requiredRotations || 1,
        bankRequired: !!config.bankRequired,
      },
      landing: defaultLanding(config),
      reward: config.reward || {},
      visual: config.visual || {},
      reducedMotion: {
        suppressParticles: true,
        suppressCameraShake: true,
        retainPhysicalGeometry: true,
        retainOutcome: true,
        staticCue: (config.visual && config.visual.theme) || entry.id,
      },
    };
  }

  function definitionFor(entry) {
    var config = CONFIG[entry.id];
    if (!config) throw new Error('Missing physics event config for ' + entry.id);
    return Interfaces.EventDefinition({
      id: entry.id,
      displayName: entry.displayName,
      prepare: function (context) {
        var state = {
          id: entry.id,
          seed: context && Number(context.seed) >>> 0,
          elapsedMs: 0,
          contacts: 0,
          resolved: false,
          cleaned: false,
          flags: {},
        };
        callEffect(context, 'prepare', config, state);
        return state;
      },
      applyPhysics: makeHook('physics', config),
      onContact: function (context, state) {
        if (state) state.contacts += 1;
        return callEffect(context, 'contact', config, state);
      },
      resolve: function (context, state) {
        if (state) state.resolved = true;
        return callEffect(context, 'resolve', config, state);
      },
      cleanup: function (context, state) {
        try { return callEffect(context, 'cleanup', config, state); }
        finally { if (state) state.cleaned = true; }
      },
      render: function (context) {
        if (context && typeof context.renderEvent === 'function') {
          return context.renderEvent(config.visual, metadataFor(entry, config));
        }
        return Interfaces.immutableCopy(config.visual || {});
      },
      reducedMotion: function (context) {
        var fallback = metadataFor(entry, config).reducedMotion;
        if (context && typeof context.renderReducedMotion === 'function') {
          return context.renderReducedMotion(fallback);
        }
        return fallback;
      },
      metadata: metadataFor(entry, config),
    });
  }

  var registry = Interfaces.EventRegistry();
  Interfaces.EVENT_CATALOG.forEach(function (entry) { registry.register(definitionFor(entry)); });
  var DEFINITIONS = registry.list();
  var INSANE_DEFINITIONS = Object.freeze(DEFINITIONS.filter(function (definition) {
    return definition.insaneEligible;
  }));
  var INSANE_UNITS = INSANE_DEFINITIONS.reduce(function (sum, definition) {
    return sum + (definition.id === 'plinko' ? 5 : 4);
  }, 0);

  function normalizeMode(value) {
    var mode = String(value || 'normal').toLowerCase();
    return mode === 'insanity' ? 'insane' : mode;
  }

  function normalBoost(oddsProfile) {
    if (typeof oddsProfile === 'number') return Number(oddsProfile) === 10 ? 10 : 1;
    var value = String(oddsProfile || 'normal').toLowerCase();
    return value === 'mr-howe' || value === 'mr. howe' || value === 'mr howe' ? 10 : 1;
  }

  function rollNormal(request, definitions) {
    definitions = definitions || DEFINITIONS;
    var boost = normalBoost(request.oddsProfile);
    // Treat the rarity table as one categorical distribution. Independent
    // first-match checks suppressed later entries and made Mr. Howe's nominal
    // tenfold weights progressively smaller down the registry. One uniform
    // variate gives every event its exact table weight, preserves the
    // one-event maximum, and leaves the remaining interval as "no event".
    var pick = mixSeed(request.seed, SALTS.occurrence) / 0x100000000;
    var cursor = 0;
    for (var i = 0; i < definitions.length; i += 1) {
      var definition = definitions[i];
      cursor += boost / definition.normalDenominator;
      if (pick < cursor) return definition;
    }
    return null;
  }

  function rollInsane(request, definitions) {
    definitions = definitions || DEFINITIONS;
    if (mixSeed(request.seed, SALTS.insaneOccurrence) % 3 !== 0) return null;
    var eligible = definitions === DEFINITIONS ? INSANE_DEFINITIONS
      : definitions.filter(function (definition) { return definition.insaneEligible; });
    var units = definitions === DEFINITIONS ? INSANE_UNITS
      : eligible.reduce(function (sum, definition) {
        return sum + (definition.id === 'plinko' ? 5 : 4);
      }, 0);
    var pick = mixSeed(request.seed, SALTS.insanePick) % units;
    for (var i = 0; i < eligible.length; i += 1) {
      var size = eligible[i].id === 'plinko' ? 5 : 4;
      if (pick < size) return eligible[i];
      pick -= size;
    }
    return eligible[eligible.length - 1] || null;
  }

  registry.setRollStrategy(function (request, definitions) {
    return normalizeMode(request.mode) === 'insane'
      ? rollInsane(request, definitions)
      : rollNormal(request, definitions);
  });

  function foldName(value) {
    return String(value == null ? '' : value)
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  var FORCED_NAMES = Object.create(null);
  registry.list().forEach(function (definition) {
    FORCED_NAMES[foldName(definition.id)] = definition.id;
    FORCED_NAMES[foldName(definition.displayName)] = definition.id;
  });
  Object.assign(FORCED_NAMES, {
    rainbow: 'rainbow-corkscrew',
    rainbowtrail: 'rainbow-corkscrew',
    rainbowcomet: 'rainbow-corkscrew',
    alien: 'alien-invasion',
    trampoline: 'trampoline',
    trampolinetable: 'trampoline',
    trampolinetab: 'trampoline',
    magnetlanding: 'magnet',
    plinkodrop: 'plinko',
    cap: 'cap-toss',
  });

  function forcedEventId(value) {
    return FORCED_NAMES[foldName(value)] || null;
  }

  function oddsProfileForName(value) {
    return value === 'Mr. Howe' ? 'mr-howe' : 'normal';
  }

  function normalizeRequest(request) {
    if (!request || typeof request !== 'object') throw new TypeError('Event roll request is required');
    if (!Number.isFinite(Number(request.seed))) throw new TypeError('Event roll seed is required');
    return {
      mode: request.mode || 'normal',
      oddsProfile: request.oddsProfile || 'normal',
      seed: Number(request.seed) >>> 0,
      excludedEventIds: Array.isArray(request.excludedEventIds)
        ? request.excludedEventIds.map(function (id) { return String(id); })
        : [],
    };
  }
  function roll(request) {
    var normalized = normalizeRequest(request);
    var excluded = new Set(normalized.excludedEventIds);
    var definitions = excluded.size
      ? DEFINITIONS.filter(function (definition) { return !excluded.has(definition.id); })
      : DEFINITIONS;
    return normalizeMode(normalized.mode) === 'insane'
      ? rollInsane(normalized, definitions)
      : rollNormal(normalized, definitions);
  }
  function rollId(request) {
    var definition = roll(request);
    return definition ? definition.id : null;
  }
  function createController() { return Interfaces.EventController(registry); }
  function getMetadata(id) {
    var definition = registry.get(id);
    return definition ? definition.metadata : null;
  }

  return Object.freeze({
    CONTRACT_REVISION: 3,
    SCHEMA: 'FlipgamePhysicsEventsV1',
    PLINKO_SLOTS: PLINKO_SLOTS,
    ARENA_PROFILES: ARENA_PROFILES,
    CONFIG: CONFIG,
    registry: registry,
    list: function () { return registry.list(); },
    get: function (id) { return registry.get(id); },
    getMetadata: getMetadata,
    roll: roll,
    rollId: rollId,
    rollNormal: rollNormal,
    rollInsane: rollInsane,
    createController: createController,
    forcedEventId: forcedEventId,
    oddsProfileForName: oddsProfileForName,
    isForcedEventName: function (value) { return forcedEventId(value) !== null; },
    mixSeed: mixSeed,
    eventSalt: eventSalt,
  });
});
