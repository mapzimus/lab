// v112-easter-eggs.js -- deterministic, presentation-only Urth secrets.
//
// This module deliberately has no rules, physics, event, progression, economy,
// achievement, persistence, or statistics dependency. It consumes a narrow
// snapshot created *after* an authoritative flip outcome is committed and can
// return only an optional presentation request plus immutable reducer state.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112EasterEggs = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function () {
  'use strict';

  var UINT32_RANGE = 4294967296;
  var CONTEXT_KEYS = Object.freeze([
    'schema', 'matchId', 'flipId', 'sequence', 'presentationSeed', 'objectId',
    'variantId', 'arenaId', 'playerName', 'physicsModeId', 'eventId',
    'outcomePhase', 'verdict', 'physical', 'automatic', 'landingClass',
    'rotationCount', 'bounceCount', 'bankCount', 'settleMs', 'clean',
    'recovery', 'pressureShot', 'matchTerminal', 'testData', 'reducedMotion',
    'audioMuted', 'laneId', 'storyChapterId'
  ]);
  var CONTEXT_KEY_SET = Object.freeze(CONTEXT_KEYS.reduce(function (result, key) {
    result[key] = true;
    return result;
  }, Object.create(null)));

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Reflect.ownKeys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }

  function hashText(value) {
    var text = String(value == null ? '' : value);
    var hash = 2166136261;
    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 2246822507);
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 3266489909);
    hash ^= hash >>> 16;
    return hash >>> 0;
  }

  function ownDataRecord(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError(label + ' must be a plain data record');
    }
    var prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(label + ' must have a plain prototype');
    }
    Reflect.ownKeys(value).forEach(function (key) {
      if (typeof key !== 'string') throw new TypeError(label + ' cannot contain symbol keys');
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        throw new TypeError(label + ' cannot contain accessors');
      }
    });
    return value;
  }

  function denseArray(value, label) {
    if (!Array.isArray(value)) throw new TypeError(label + ' must be an array');
    var keys = Reflect.ownKeys(value);
    for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
      var key = keys[keyIndex];
      if (key === 'length') continue;
      if (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key)) {
        throw new TypeError(label + ' must be a dense data-only array');
      }
    }
    var output = [];
    for (var index = 0; index < value.length; index += 1) {
      var descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        throw new TypeError(label + ' cannot be sparse or contain accessors');
      }
      output.push(descriptor.value);
    }
    return output;
  }

  function requiredText(value, label, maximum) {
    if (typeof value !== 'string' || value.length < 1 || value.length > maximum ||
        /[\u0000-\u001f\u007f]/.test(value)) {
      throw new TypeError(label + ' must be non-empty safe text');
    }
    return value;
  }

  function optionalText(value, label, maximum) {
    if (value == null || value === '') return null;
    return requiredText(value, label, maximum);
  }

  function nonnegativeNumber(value, label) {
    if (!Number.isFinite(value) || value < 0) throw new TypeError(label + ' must be finite and nonnegative');
    return value;
  }

  function nonnegativeInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(label + ' must be a nonnegative integer');
    return value;
  }

  function positiveInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(label + ' must be a positive integer');
    return value;
  }

  function definition(input) {
    return input;
  }

  // Definitions contain data only. A renderer may map cue IDs to authored
  // Canvas/SVG/audio assets, but no definition contains executable behavior.
  var DEFINITIONS = [
    definition({
      id: 'desk-globe-visible-wurld', revision: 1, priority: 100,
      visibility: 'hidden-until-triggered', rngNamespace: 'v112:globe:focus-roll',
      chance: { algorithm: 'globe-v1-compatible', denominator: 100,
        exactName: 'Mr. Howe', exactNameDenominator: 10 },
      criteria: { objectIds: ['desk-globe'], verdicts: ['MAKE'] },
      limits: { maxPerMatch: 1, cooldownResolvedOutcomes: 8 },
      presentation: {
        cueId: 'globe.visible-hemisphere-focus', sceneTarget: 'selected-flipper',
        headline: 'The Wurld comes into focus.',
        detail: 'The broadcast lens locks onto the visible hemisphere.',
        accessibilityText: 'Desk Globe close-up.',
        fullMotionCueId: 'globe.focus-pan-zoom',
        reducedMotionCueId: 'globe.focus-static-inset',
        durationMs: 1800, reducedDurationMs: 1300,
        audioCueId: 'broadcast.globe-focus', audioCaption: 'Soft broadcast focus tone.',
        mutedFallbackCueId: 'globe.focus-ring',
        camera: { kind: 'object-focus', target: 'visible-globe-hemisphere',
          maxDurationMs: 1800 },
        objectPolicy: 'read-only-surface-focus'
      }
    }),
    definition({
      id: 'baseline-return-signal', revision: 1, priority: 76,
      visibility: 'hidden-until-triggered', rngNamespace: 'v112:easter:baseline-return',
      chance: { algorithm: 'unbiased-hash-denominator-v1', denominator: 64 },
      criteria: { objectIds: ['bottle'], arenaIds: ['baseline-table'],
        verdicts: ['MAKE'], landingClasses: ['cap'], minRotationCount: 2, clean: true },
      limits: { maxPerMatch: 1, cooldownResolvedOutcomes: 10 },
      presentation: {
        cueId: 'baseline.return-signal', sceneTarget: 'replay-monitor',
        headline: 'SIGNAL RECEIVED',
        detail: 'A field monitor catches one impossible return.',
        accessibilityText: 'The baseline replay monitor briefly reports Signal Received.',
        fullMotionCueId: 'baseline.monitor-scan',
        reducedMotionCueId: 'baseline.monitor-still',
        durationMs: 1450, reducedDurationMs: 1100,
        audioCueId: 'broadcast.return-chirp', audioCaption: 'A short two-note monitor chirp.',
        mutedFallbackCueId: 'baseline.monitor-pulse',
        camera: { kind: 'lane-inset', target: 'replay-monitor', maxDurationMs: 1350 },
        objectPolicy: 'do-not-modify-flipper'
      }
    }),
    definition({
      id: 'cafeteria-clean-hold-inspection', revision: 1, priority: 62,
      visibility: 'hidden-until-triggered', rngNamespace: 'v112:easter:cafeteria-inspection',
      chance: { algorithm: 'unbiased-hash-denominator-v1', denominator: 48 },
      criteria: { objectIds: ['milk-carton'], arenaIds: ['school-cafeteria'],
        verdicts: ['MAKE'], landingClasses: ['upright'], minRotationCount: 1,
        maxBounceCount: 0, clean: true },
      limits: { maxPerMatch: 1, cooldownResolvedOutcomes: 8 },
      presentation: {
        cueId: 'cafeteria.lunch-judge', sceneTarget: 'arena-cameo',
        headline: 'LUNCH-LINE CERTIFIED',
        detail: 'A triceratops table judge raises the clean-hold paddle.',
        accessibilityText: 'A dinosaur cafeteria official raises a clean-hold sign.',
        fullMotionCueId: 'cafeteria.judge-paddle',
        reducedMotionCueId: 'cafeteria.judge-paddle-still',
        durationMs: 1500, reducedDurationMs: 1100,
        audioCueId: 'arena.cafeteria-bell', audioCaption: 'One cafeteria bell rings.',
        mutedFallbackCueId: 'cafeteria.paddle-glint',
        camera: { kind: 'arena-cutaway', target: 'cafeteria-judge', maxDurationMs: 1400 },
        objectPolicy: 'do-not-modify-flipper'
      }
    }),
    definition({
      id: 'library-quiet-table', revision: 1, priority: 58,
      visibility: 'hidden-until-triggered', rngNamespace: 'v112:easter:library-shush',
      chance: { algorithm: 'unbiased-hash-denominator-v1', denominator: 40 },
      criteria: { objectIds: ['owl'], arenaIds: ['grand-library'],
        verdicts: ['MISS'], minRotationCount: 2, minBounceCount: 1 },
      limits: { maxPerMatch: 1, cooldownResolvedOutcomes: 7 },
      presentation: {
        cueId: 'library.quiet-table', sceneTarget: 'arena-cameo',
        headline: 'QUIET TABLE',
        detail: 'The dinosaur archivist shushes the replay desk.',
        accessibilityText: 'A library archivist quietly acknowledges the replay.',
        fullMotionCueId: 'library.archivist-shush',
        reducedMotionCueId: 'library.quiet-sign',
        durationMs: 1250, reducedDurationMs: 950,
        audioCueId: 'arena.library-shush', audioCaption: 'A gentle shushing sound.',
        mutedFallbackCueId: 'library.quiet-sign',
        camera: { kind: 'arena-cutaway', target: 'library-archivist', maxDurationMs: 1150 },
        objectPolicy: 'do-not-modify-flipper'
      }
    }),
    definition({
      id: 'pirate-buoy-crown-bell', revision: 1, priority: 66,
      visibility: 'hidden-until-triggered', rngNamespace: 'v112:easter:buoy-bell',
      chance: { algorithm: 'unbiased-hash-denominator-v1', denominator: 55 },
      criteria: { objectIds: ['buoy'], arenaIds: ['pirate-ship-deck'],
        verdicts: ['MAKE'], landingClasses: ['cap'], minBounceCount: 1, recovery: true },
      limits: { maxPerMatch: 1, cooldownResolvedOutcomes: 9 },
      presentation: {
        cueId: 'pirate.crown-bell', sceneTarget: 'arena-prop',
        headline: 'BELL ON THE CROWN',
        detail: 'The ship bell answers the recovery hold.',
        accessibilityText: 'The pirate ship bell marks the recovered cap landing.',
        fullMotionCueId: 'pirate.ship-bell-swing',
        reducedMotionCueId: 'pirate.rigging-crown-flag',
        durationMs: 1450, reducedDurationMs: 1000,
        audioCueId: 'arena.ship-bell', audioCaption: 'The ship bell rings once.',
        mutedFallbackCueId: 'pirate.rigging-crown-flag',
        camera: { kind: 'arena-cutaway', target: 'ship-bell', maxDurationMs: 1250 },
        objectPolicy: 'do-not-modify-flipper'
      }
    }),
    definition({
      id: 'volcano-molten-echo', revision: 1, priority: 60,
      visibility: 'hidden-until-triggered', rngNamespace: 'v112:easter:molten-echo',
      chance: { algorithm: 'unbiased-hash-denominator-v1', denominator: 52 },
      criteria: { objectIds: ['lavalamp'], arenaIds: ['volcano'],
        verdicts: ['MAKE'], landingClasses: ['upright'], minBounceCount: 1,
        minSettleMs: 700, recovery: true },
      limits: { maxPerMatch: 1, cooldownResolvedOutcomes: 8 },
      presentation: {
        cueId: 'volcano.molten-echo', sceneTarget: 'flipper-and-arena',
        headline: 'MOLTEN ECHO',
        detail: 'The lamp and distant crater pulse on the same beat.',
        accessibilityText: 'The Lava Lamp and volcano briefly glow in sync.',
        fullMotionCueId: 'volcano.lava-resonance',
        reducedMotionCueId: 'volcano.lava-resonance-still',
        durationMs: 1500, reducedDurationMs: 1000,
        audioCueId: 'arena.molten-pulse', audioCaption: 'A low two-beat rumble.',
        mutedFallbackCueId: 'volcano.rim-light-pulse',
        camera: { kind: 'lane-inset', target: 'lamp-and-crater', maxDurationMs: 1350 },
        objectPolicy: 'secondary-motion-only'
      }
    }),
    definition({
      id: 'space-station-fine-point', revision: 1, priority: 70,
      visibility: 'hidden-until-triggered', rngNamespace: 'v112:easter:fine-point',
      chance: { algorithm: 'unbiased-hash-denominator-v1', denominator: 75 },
      criteria: { objectIds: ['microscope'], arenaIds: ['space-station'],
        verdicts: ['MAKE'], landingClasses: ['upright'], minRotationCount: 2,
        maxBounceCount: 0, clean: true },
      limits: { maxPerMatch: 1, cooldownResolvedOutcomes: 12 },
      presentation: {
        cueId: 'station.fine-point', sceneTarget: 'instrument-inset',
        headline: 'FINE POINT FOUND',
        detail: 'The lens resolves a miniature replay of the same flight.',
        accessibilityText: 'A microscope inset shows a tiny replay of the completed flight.',
        fullMotionCueId: 'station.microscope-replay',
        reducedMotionCueId: 'station.microscope-replay-still',
        durationMs: 1750, reducedDurationMs: 1200,
        audioCueId: 'broadcast.instrument-lock', audioCaption: 'A quiet instrument lock tone.',
        mutedFallbackCueId: 'station.reticle-lock',
        camera: { kind: 'object-focus', target: 'microscope-lens', maxDurationMs: 1600 },
        objectPolicy: 'read-only-lens-focus'
      }
    }),
    definition({
      id: 'stadium-deep-time-salute', revision: 1, priority: 88,
      visibility: 'hidden-until-triggered', rngNamespace: 'v112:easter:deep-time-salute',
      chance: { algorithm: 'unbiased-hash-denominator-v1', denominator: 91 },
      criteria: { objectIds: ['trex'], arenaIds: ['stadium-night'],
        verdicts: ['MAKE'], landingClasses: ['cap'], minRotationCount: 2 },
      limits: { maxPerMatch: 1, cooldownResolvedOutcomes: 14 },
      presentation: {
        cueId: 'stadium.deep-time-salute', sceneTarget: 'arena-crowd',
        headline: 'DEEP TIME SALUTE',
        detail: 'Living dinosaur spectators salute the vintage competition figure.',
        accessibilityText: 'Dinosaur spectators in the stadium salute the T-Rex figure.',
        fullMotionCueId: 'stadium.dinosaur-salute',
        reducedMotionCueId: 'stadium.dinosaur-salute-still',
        durationMs: 1700, reducedDurationMs: 1200,
        audioCueId: 'arena.deep-time-crowd', audioCaption: 'The crowd gives a brief respectful cheer.',
        mutedFallbackCueId: 'stadium.deep-time-lights',
        camera: { kind: 'arena-cutaway', target: 'dinosaur-supporters', maxDurationMs: 1500 },
        objectPolicy: 'protected-trex-arena-only'
      }
    }),
    definition({
      id: 'aquarium-high-water-review', revision: 1, priority: 55,
      visibility: 'hidden-until-triggered', rngNamespace: 'v112:easter:high-water-review',
      chance: { algorithm: 'unbiased-hash-denominator-v1', denominator: 60 },
      criteria: { objectIds: ['huge-rubber-duck'], arenaIds: ['aquarium-tunnel'],
        verdicts: ['MISS'], minBounceCount: 2 },
      limits: { maxPerMatch: 1, cooldownResolvedOutcomes: 8 },
      presentation: {
        cueId: 'aquarium.high-water-review', sceneTarget: 'arena-cameo',
        headline: 'HIGH WATER REVIEW',
        detail: 'A hadrosaur aquarium attendant checks the splash gauge twice.',
        accessibilityText: 'An aquarium attendant double-checks the playful splash gauge.',
        fullMotionCueId: 'aquarium.splash-gauge-review',
        reducedMotionCueId: 'aquarium.splash-gauge-still',
        durationMs: 1350, reducedDurationMs: 950,
        audioCueId: 'arena.aquarium-bloop', audioCaption: 'Two soft underwater bubbles.',
        mutedFallbackCueId: 'aquarium.gauge-bubbles',
        camera: { kind: 'arena-cutaway', target: 'aquarium-attendant', maxDurationMs: 1200 },
        objectPolicy: 'do-not-modify-flipper'
      }
    }),
    definition({
      id: 'arcade-scatterline-trace', revision: 1, priority: 64,
      visibility: 'hidden-until-triggered', rngNamespace: 'v112:easter:scatterline-trace',
      chance: { algorithm: 'unbiased-hash-denominator-v1', denominator: 50 },
      criteria: { objectIds: ['gumball-machine'], arenaIds: ['arcade'],
        verdicts: ['MAKE'], landingClasses: ['cap'], minRotationCount: 3 },
      limits: { maxPerMatch: 1, cooldownResolvedOutcomes: 9 },
      presentation: {
        cueId: 'arcade.scatterline-trace', sceneTarget: 'arena-cabinets',
        headline: 'ARCADE TRACE COMPLETE',
        detail: 'Eight cabinet lights replay the rotation pattern.',
        accessibilityText: 'The arcade lights replay the three-rotation cap landing.',
        fullMotionCueId: 'arcade.eight-light-trace',
        reducedMotionCueId: 'arcade.eight-light-still',
        durationMs: 1400, reducedDurationMs: 1000,
        audioCueId: 'arena.arcade-trace', audioCaption: 'Eight quick arcade notes rise and resolve.',
        mutedFallbackCueId: 'arcade.eight-light-trace',
        camera: { kind: 'lane-inset', target: 'arcade-trace-bank', maxDurationMs: 1250 },
        objectPolicy: 'do-not-modify-flipper'
      }
    }),
    definition({
      id: 'haunted-thirteenth-tick', revision: 1, priority: 57,
      visibility: 'hidden-until-triggered', rngNamespace: 'v112:easter:thirteenth-tick',
      chance: { algorithm: 'unbiased-hash-denominator-v1', denominator: 66 },
      criteria: { objectIds: ['mechanical-metronome'], arenaIds: ['haunted-hall'],
        verdicts: ['MAKE'], landingClasses: ['upright'], minSettleMs: 1050,
        maxSettleMs: 1450, clean: true },
      limits: { maxPerMatch: 1, cooldownResolvedOutcomes: 11 },
      presentation: {
        cueId: 'haunted.thirteenth-tick', sceneTarget: 'arena-clock',
        headline: 'THIRTEENTH TICK',
        detail: 'The hall clock counts one beat beyond the hold.',
        accessibilityText: 'The haunted hall clock adds one quiet extra tick.',
        fullMotionCueId: 'haunted.clock-extra-tick',
        reducedMotionCueId: 'haunted.clock-thirteen-still',
        durationMs: 1350, reducedDurationMs: 950,
        audioCueId: 'arena.clock-thirteen', audioCaption: 'One extra metronome tick.',
        mutedFallbackCueId: 'haunted.clock-thirteen-glint',
        camera: { kind: 'arena-cutaway', target: 'hall-clock', maxDurationMs: 1150 },
        objectPolicy: 'secondary-motion-only'
      }
    }),
    definition({
      id: 'mars-ninth-return', revision: 1, priority: 84,
      visibility: 'hidden-until-triggered', rngNamespace: 'v112:easter:ninth-return',
      chance: { algorithm: 'unbiased-hash-denominator-v1', denominator: 80 },
      criteria: { objectIds: ['alien'], arenaIds: ['mars-outpost'],
        physicsModeIds: ['alien'], verdicts: ['MAKE'], landingClasses: ['alien-ring'],
        minBankCount: 2 },
      limits: { maxPerMatch: 1, cooldownResolvedOutcomes: 12 },
      presentation: {
        cueId: 'mars.ninth-return', sceneTarget: 'ufo-field',
        headline: 'NINTH RETURN',
        detail: 'Outpost UFOs form an eight-entry ring and leave one light open.',
        accessibilityText: 'The Mars Outpost UFOs briefly form a ring with one open position.',
        fullMotionCueId: 'mars.ufo-nine-return-formation',
        reducedMotionCueId: 'mars.ufo-nine-return-still',
        durationMs: 1650, reducedDurationMs: 1150,
        audioCueId: 'signal.ninth-return', audioCaption: 'A restrained three-note signal response.',
        mutedFallbackCueId: 'mars.ninth-return-lights',
        camera: { kind: 'lane-inset', target: 'ufo-formation', maxDurationMs: 1450 },
        objectPolicy: 'do-not-modify-flipper'
      }
    })
  ];

  function validateDefinitions(definitions) {
    var ids = Object.create(null);
    var cueIds = Object.create(null);
    definitions.forEach(function (entry, index) {
      ownDataRecord(entry, 'definition[' + index + ']');
      requiredText(entry.id, 'definition id', 80);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id) || ids[entry.id]) {
        throw new Error('Easter-egg IDs must be unique lowercase kebab-case');
      }
      ids[entry.id] = true;
      positiveInteger(entry.revision, entry.id + '.revision');
      nonnegativeInteger(entry.priority, entry.id + '.priority');
      if (entry.visibility !== 'hidden-until-triggered') throw new Error(entry.id + ' must remain hidden');
      requiredText(entry.rngNamespace, entry.id + '.rngNamespace', 100);
      ownDataRecord(entry.chance, entry.id + '.chance');
      if (entry.chance.algorithm !== 'globe-v1-compatible' &&
          entry.chance.algorithm !== 'unbiased-hash-denominator-v1') {
        throw new Error(entry.id + ' has an unknown chance algorithm');
      }
      positiveInteger(entry.chance.denominator, entry.id + '.chance.denominator');
      if (entry.chance.exactName != null) {
        requiredText(entry.chance.exactName, entry.id + '.chance.exactName', 40);
        positiveInteger(entry.chance.exactNameDenominator,
          entry.id + '.chance.exactNameDenominator');
      }
      ownDataRecord(entry.criteria, entry.id + '.criteria');
      ownDataRecord(entry.limits, entry.id + '.limits');
      if (entry.limits.maxPerMatch !== 1) throw new Error(entry.id + ' must be one-shot per match');
      positiveInteger(entry.limits.cooldownResolvedOutcomes,
        entry.id + '.limits.cooldownResolvedOutcomes');
      ownDataRecord(entry.presentation, entry.id + '.presentation');
      var presentation = entry.presentation;
      requiredText(presentation.cueId, entry.id + '.presentation.cueId', 100);
      if (cueIds[presentation.cueId]) throw new Error('Presentation cue IDs must be unique');
      cueIds[presentation.cueId] = true;
      [
        'sceneTarget', 'headline', 'detail', 'accessibilityText', 'fullMotionCueId',
        'reducedMotionCueId', 'audioCueId', 'audioCaption', 'mutedFallbackCueId',
        'objectPolicy'
      ].forEach(function (key) { requiredText(presentation[key], entry.id + '.' + key, 180); });
      positiveInteger(presentation.durationMs, entry.id + '.durationMs');
      positiveInteger(presentation.reducedDurationMs, entry.id + '.reducedDurationMs');
      if (presentation.durationMs > 2000 || presentation.reducedDurationMs > 1300) {
        throw new Error(entry.id + ' exceeds the presentation pacing budget');
      }
      ownDataRecord(presentation.camera, entry.id + '.camera');
      requiredText(presentation.camera.kind, entry.id + '.camera.kind', 40);
      requiredText(presentation.camera.target, entry.id + '.camera.target', 80);
      positiveInteger(presentation.camera.maxDurationMs, entry.id + '.camera.maxDurationMs');
      if (presentation.camera.maxDurationMs > presentation.durationMs) {
        throw new Error(entry.id + ' camera outlives its presentation');
      }
    });
    return definitions;
  }

  validateDefinitions(DEFINITIONS);
  freeze(DEFINITIONS);
  var BY_ID = Object.create(null);
  DEFINITIONS.forEach(function (entry) { BY_ID[entry.id] = entry; });
  freeze(BY_ID);

  function validateContext(input) {
    var source = ownDataRecord(input, 'EasterEggOutcomeContextV1');
    Reflect.ownKeys(source).forEach(function (key) {
      if (!CONTEXT_KEY_SET[key]) throw new TypeError('Unknown EasterEggOutcomeContextV1 field: ' + key);
    });
    if (source.schema !== 'EasterEggOutcomeContextV1') {
      throw new TypeError('Expected EasterEggOutcomeContextV1');
    }
    var verdict = requiredText(source.verdict, 'verdict', 8);
    if (verdict !== 'MAKE' && verdict !== 'MISS') throw new TypeError('verdict must be MAKE or MISS');
    if (source.outcomePhase !== 'committed') throw new TypeError('Outcome must already be committed');
    if (source.physical !== true) throw new TypeError('Only physical outcomes are eligible');
    if (typeof source.automatic !== 'boolean') throw new TypeError('automatic must be boolean');
    if (typeof source.testData !== 'boolean' || typeof source.reducedMotion !== 'boolean' ||
        typeof source.audioMuted !== 'boolean') {
      throw new TypeError('testData, reducedMotion and audioMuted must be boolean');
    }
    var seedType = typeof source.presentationSeed;
    if (seedType !== 'string' && seedType !== 'number') {
      throw new TypeError('presentationSeed must be text or a finite number');
    }
    if (seedType === 'number' && !Number.isFinite(source.presentationSeed)) {
      throw new TypeError('presentationSeed must be finite');
    }
    var seed = requiredText(String(source.presentationSeed), 'presentationSeed', 128);
    var landingClass = requiredText(source.landingClass, 'landingClass', 40);
    var physicsModeId = requiredText(source.physicsModeId, 'physicsModeId', 40);
    return freeze({
      schema: 'EasterEggOutcomeContextV1',
      matchId: requiredText(source.matchId, 'matchId', 128),
      flipId: requiredText(source.flipId, 'flipId', 128),
      sequence: positiveInteger(source.sequence, 'sequence'),
      presentationSeed: seed,
      objectId: requiredText(source.objectId, 'objectId', 80),
      variantId: optionalText(source.variantId, 'variantId', 100),
      arenaId: requiredText(source.arenaId, 'arenaId', 80),
      playerName: typeof source.playerName === 'string' ? source.playerName : '',
      physicsModeId: physicsModeId,
      eventId: optionalText(source.eventId, 'eventId', 80),
      outcomePhase: 'committed', verdict: verdict,
      physical: true, automatic: source.automatic,
      landingClass: landingClass,
      rotationCount: nonnegativeInteger(source.rotationCount, 'rotationCount'),
      bounceCount: nonnegativeInteger(source.bounceCount, 'bounceCount'),
      bankCount: nonnegativeInteger(source.bankCount, 'bankCount'),
      settleMs: nonnegativeNumber(source.settleMs, 'settleMs'),
      clean: source.clean === true,
      recovery: source.recovery === true,
      pressureShot: source.pressureShot === true,
      matchTerminal: source.matchTerminal === true,
      testData: source.testData,
      reducedMotion: source.reducedMotion,
      audioMuted: source.audioMuted,
      laneId: optionalText(source.laneId, 'laneId', 80) || 'main',
      storyChapterId: optionalText(source.storyChapterId, 'storyChapterId', 80)
    });
  }

  function createMatchState(matchId) {
    return freeze({
      schema: 'EasterEggMatchStateV1', version: 1,
      matchId: requiredText(matchId, 'matchId', 128),
      lastSequence: 0, processedFlipIds: [], triggerHistory: []
    });
  }

  function normalizeState(input) {
    var source = ownDataRecord(input, 'EasterEggMatchStateV1');
    var allowedStateKeys = {
      schema: true, version: true, matchId: true, lastSequence: true,
      processedFlipIds: true, triggerHistory: true
    };
    Reflect.ownKeys(source).forEach(function (key) {
      if (!allowedStateKeys[key]) throw new TypeError('Unknown EasterEggMatchStateV1 field: ' + key);
    });
    if (source.schema !== 'EasterEggMatchStateV1' || source.version !== 1) {
      throw new TypeError('Expected EasterEggMatchStateV1');
    }
    var matchId = requiredText(source.matchId, 'state.matchId', 128);
    var stateLastSequence = nonnegativeInteger(source.lastSequence, 'state.lastSequence');
    var processed = denseArray(source.processedFlipIds, 'state.processedFlipIds').map(function (id) {
      return requiredText(id, 'processed flip ID', 128);
    });
    if (new Set(processed).size !== processed.length) throw new TypeError('Processed flip IDs must be unique');
    var historyIds = Object.create(null);
    var history = denseArray(source.triggerHistory, 'state.triggerHistory').map(function (value, index) {
      var item = ownDataRecord(value, 'state.triggerHistory[' + index + ']');
      Reflect.ownKeys(item).forEach(function (key) {
        if (key !== 'id' && key !== 'count' && key !== 'lastSequence') {
          throw new TypeError('Unknown trigger-history field: ' + key);
        }
      });
      var id = requiredText(item.id, 'history ID', 80);
      if (!BY_ID[id] || historyIds[id]) throw new TypeError('Trigger history contains an unknown or duplicate ID');
      historyIds[id] = true;
      var count = positiveInteger(item.count, id + '.count');
      var lastSequence = nonnegativeInteger(item.lastSequence, id + '.lastSequence');
      if (count !== 1) throw new TypeError('Easter eggs are one-shot per match');
      if (lastSequence < 1 || lastSequence > stateLastSequence) {
        throw new TypeError('Trigger history sequence is outside the consumed outcome range');
      }
      return { id: id, count: count, lastSequence: lastSequence };
    });
    return freeze({
      schema: 'EasterEggMatchStateV1', version: 1, matchId: matchId,
      lastSequence: stateLastSequence,
      processedFlipIds: processed, triggerHistory: history
    });
  }

  function includes(values, value) {
    if (!values) return true;
    for (var index = 0; index < values.length; index += 1) {
      if (values[index] === value) return true;
    }
    return false;
  }

  function matchesCriteria(criteria, context) {
    if (!includes(criteria.objectIds, context.objectId) ||
        !includes(criteria.arenaIds, context.arenaId) ||
        !includes(criteria.physicsModeIds, context.physicsModeId) ||
        !includes(criteria.verdicts, context.verdict) ||
        !includes(criteria.landingClasses, context.landingClass)) return false;
    if (criteria.clean != null && criteria.clean !== context.clean) return false;
    if (criteria.recovery != null && criteria.recovery !== context.recovery) return false;
    if (criteria.pressureShot != null && criteria.pressureShot !== context.pressureShot) return false;
    if (criteria.matchTerminal != null && criteria.matchTerminal !== context.matchTerminal) return false;
    if (criteria.minRotationCount != null && context.rotationCount < criteria.minRotationCount) return false;
    if (criteria.maxRotationCount != null && context.rotationCount > criteria.maxRotationCount) return false;
    if (criteria.minBounceCount != null && context.bounceCount < criteria.minBounceCount) return false;
    if (criteria.maxBounceCount != null && context.bounceCount > criteria.maxBounceCount) return false;
    if (criteria.minBankCount != null && context.bankCount < criteria.minBankCount) return false;
    if (criteria.maxBankCount != null && context.bankCount > criteria.maxBankCount) return false;
    if (criteria.minSettleMs != null && context.settleMs < criteria.minSettleMs) return false;
    if (criteria.maxSettleMs != null && context.settleMs > criteria.maxSettleMs) return false;
    return true;
  }

  function unbiasedBucket(seed, namespace, denominator) {
    var limit = Math.floor(UINT32_RANGE / denominator) * denominator;
    for (var counter = 0; counter < 32; counter += 1) {
      var value = hashText(namespace + ':' + seed + ':' + counter);
      if (value < limit) return value % denominator;
    }
    throw new Error('Unable to draw an unbiased presentation bucket');
  }

  function rollPasses(entry, context) {
    var chance = entry.chance;
    var denominator = chance.exactName != null && context.playerName === chance.exactName
      ? chance.exactNameDenominator : chance.denominator;
    if (chance.algorithm === 'globe-v1-compatible') {
      // Byte-for-byte compatible with FlipGlobeV112.focusDecision().
      return hashText(entry.rngNamespace + ':' + context.presentationSeed) % denominator === 0;
    }
    return unbiasedBucket(context.presentationSeed, entry.rngNamespace, denominator) === 0;
  }

  function historyFor(state, id) {
    for (var index = 0; index < state.triggerHistory.length; index += 1) {
      if (state.triggerHistory[index].id === id) return state.triggerHistory[index];
    }
    return null;
  }

  function underLimit(entry, state, sequence) {
    var history = historyFor(state, entry.id);
    if (!history) return true;
    if (history.count >= entry.limits.maxPerMatch) return false;
    return sequence - history.lastSequence > entry.limits.cooldownResolvedOutcomes;
  }

  function selectCandidate(candidates, context) {
    if (!candidates.length) return null;
    candidates.sort(function (left, right) {
      if (left.priority !== right.priority) return right.priority - left.priority;
      var leftTie = hashText('v112:easter:arbitration:' + context.presentationSeed + ':' + left.id);
      var rightTie = hashText('v112:easter:arbitration:' + context.presentationSeed + ':' + right.id);
      if (leftTie !== rightTie) return leftTie - rightTie;
      return left.id < right.id ? -1 : (left.id > right.id ? 1 : 0);
    });
    return candidates[0];
  }

  function presentationFor(entry, context) {
    var source = entry.presentation;
    var reduced = context.reducedMotion;
    var muted = context.audioMuted;
    var token = hashText('v112:easter:presentation:' + context.matchId + ':' +
      context.flipId + ':' + entry.id).toString(16).padStart(8, '0');
    var cameraRequested = !reduced;
    return freeze({
      schema: 'EasterEggPresentationV1', version: 1,
      id: entry.id,
      presentationId: 'egg-' + token,
      presentationOnly: true,
      afterCommittedOutcome: true,
      testData: context.testData,
      cue: {
        id: source.cueId,
        headline: source.headline,
        detail: source.detail,
        accessibilityText: source.accessibilityText
      },
      visual: {
        cueId: reduced ? source.reducedMotionCueId : source.fullMotionCueId,
        sceneTarget: source.sceneTarget,
        scope: 'lane', laneId: context.laneId,
        durationMs: reduced ? source.reducedDurationMs : source.durationMs,
        reducedMotion: reduced,
        objectPolicy: source.objectPolicy,
        deterministicSeed: context.presentationSeed
      },
      audio: {
        play: !muted,
        cueId: muted ? null : source.audioCueId,
        channel: 'presentation-lane', laneId: context.laneId,
        caption: source.audioCaption,
        mutedFallbackCueId: source.mutedFallbackCueId
      },
      camera: {
        requested: cameraRequested,
        leaseId: cameraRequested ? 'egg-camera-' + token : null,
        scope: 'lane', laneId: context.laneId,
        kind: cameraRequested ? source.camera.kind : 'none',
        target: cameraRequested ? source.camera.target : null,
        maxDurationMs: cameraRequested ? source.camera.maxDurationMs : 0,
        interruptsExisting: false,
        deferIfBusy: true,
        expiresWithPresentation: true,
        restoresGameplayCamera: true
      },
      recordingPolicy: 'presentation-diagnostic-only',
      defaultStatisticsPolicy: 'excluded'
    });
  }

  function nextState(state, context, selected) {
    var history = state.triggerHistory.map(function (entry) {
      return { id: entry.id, count: entry.count, lastSequence: entry.lastSequence };
    });
    if (selected) {
      var existing = null;
      for (var index = 0; index < history.length; index += 1) {
        if (history[index].id === selected.id) { existing = history[index]; break; }
      }
      if (existing) {
        existing.count += 1;
        existing.lastSequence = context.sequence;
      } else {
        history.push({ id: selected.id, count: 1, lastSequence: context.sequence });
      }
      history.sort(function (left, right) { return left.id < right.id ? -1 : (left.id > right.id ? 1 : 0); });
    }
    return freeze({
      schema: 'EasterEggMatchStateV1', version: 1, matchId: state.matchId,
      lastSequence: context.sequence,
      processedFlipIds: state.processedFlipIds.concat([context.flipId]),
      triggerHistory: history
    });
  }

  function resolution(state, context, status, selected, next) {
    return freeze({
      schema: 'EasterEggResolutionV1', version: 1,
      accepted: status !== 'stale-or-duplicate',
      status: status,
      matchId: context.matchId, flipId: context.flipId, sequence: context.sequence,
      selectedId: selected ? selected.id : null,
      presentation: selected ? presentationFor(selected, context) : null,
      state: next
    });
  }

  function evaluate(stateInput, contextInput, optionsInput) {
    var state = normalizeState(stateInput);
    var context = validateContext(contextInput);
    if (state.matchId !== context.matchId) throw new TypeError('Outcome belongs to another match');
    if (context.sequence <= state.lastSequence || state.processedFlipIds.indexOf(context.flipId) >= 0) {
      return resolution(state, context, 'stale-or-duplicate', null, state);
    }
    var options = optionsInput == null ? {} : ownDataRecord(optionsInput, 'EasterEggEvaluationOptionsV1');
    Reflect.ownKeys(options).forEach(function (key) {
      if (key !== 'forceId') throw new TypeError('Unknown EasterEggEvaluationOptionsV1 field: ' + key);
    });
    var forceId = options.forceId == null ? null : requiredText(options.forceId, 'forceId', 80);
    if (forceId && !BY_ID[forceId]) throw new TypeError('Unknown Easter egg force ID');
    if (forceId && !context.testData) throw new TypeError('Easter eggs can be forced only in Test Data');

    var selected = null;
    var status = 'not-triggered';
    if (context.automatic) {
      status = 'automatic-outcome-suppressed';
    } else if (context.testData && !forceId) {
      status = 'test-data-suppressed';
    } else {
      var candidates = [];
      DEFINITIONS.forEach(function (entry) {
        if (forceId && entry.id !== forceId) return;
        if (!matchesCriteria(entry.criteria, context)) return;
        if (!underLimit(entry, state, context.sequence)) return;
        if (forceId || rollPasses(entry, context)) candidates.push(entry);
      });
      selected = selectCandidate(candidates, context);
      status = selected ? (forceId ? 'forced-test-presentation' : 'presentation-requested')
        : (forceId ? 'forced-test-ineligible' : 'not-triggered');
    }
    var next = nextState(state, context, selected);
    return resolution(state, context, status, selected, next);
  }

  return freeze({
    schema: 'EasterEggRegistryV1', version: 1,
    presentationOnly: true,
    definitions: DEFINITIONS,
    hashText: hashText,
    createMatchState: createMatchState,
    normalizeState: normalizeState,
    validateContext: validateContext,
    evaluate: evaluate
  });
});
