// v112-events.js -- immutable v1.12 event contract and prelaunch binding.
// Physics adapters consume this module; it never awards lives or changes bodies.
(function (root, factory) {
  'use strict';
  var legacy = root && root.FlipgameV111PhysicsEvents;
  var alienAdapters = root && root.FlipgameV112AlienEventAdapters;
  if (typeof module === 'object' && module.exports) {
    legacy = require('./v111-physics-events.js');
    alienAdapters = require('./v112-alien-event-adapters.js');
  }
  var api = factory(legacy, alienAdapters);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112Events = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Legacy, AlienAdapters) {
  'use strict';

  if (!Legacy || typeof Legacy.rollId !== 'function') {
    throw new Error('FlipgameV111PhysicsEvents must load before v112-events.js');
  }
  if (!AlienAdapters || AlienAdapters.schema !== 'AlienEventAdapterRegistryV1') {
    throw new Error('FlipgameV112AlienEventAdapters must load before v112-events.js');
  }

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function required(value, label) {
    var text = String(value == null ? '' : value).trim();
    if (!text) throw new TypeError(label + ' is required');
    return text;
  }

  var CLASS_BY_ID = freeze({
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

  var CUE_BY_ID = freeze({
    'rainbow-corkscrew': ['spiral', 'Ride the corkscrew, then settle it.'],
    'half-full': ['liquid', 'The shifting fill changes the rotation.'],
    'power-launch': ['shock-ring', 'Expect a much longer launch.'],
    'fizz-jet': ['spray', 'The jet thrust follows the object axis.'],
    'golden-flip': ['weight', 'Heavier and steadier, but still fallible.'],
    'bouncy-bottle': ['bounce', 'It must finish bouncing before it counts.'],
    earthquake: ['seismic', 'The landing surface will move.'],
    'moon-gravity': ['moon', 'Low gravity means a long trajectory.'],
    'ice-slide': ['ice', 'Low friction makes the landing slide.'],
    'alien-invasion': ['ufo-bank', 'Bank once, then enter the tractor ring.'],
    'gravity-slam': ['down-arrow', 'High gravity pulls the return down fast.'],
    trampoline: ['spring-deck', 'One big rebound — land the return.'],
    'wind-tunnel': ['wind-arrow', 'The visible gust keeps pushing.'],
    'shrink-ray': ['shrink', 'A smaller body rotates faster.'],
    'portal-pair': ['portal', 'The exit preserves speed and spin.'],
    'tether-swing': ['tether', 'Swing on the cable, then land the release.'],
    mitosis: ['two-flippers', 'Two complete copies — land either.'],
    'double-flip': ['double-rotation', 'Complete two rotations, then land.'],
    'ceiling-flip': ['ceiling', 'The ceiling is the landing plane.'],
    'meteor-shower': ['meteor', 'Real debris can deflect the flight.'],
    magnet: ['magnet', 'Attraction bends the path but cannot guarantee it.'],
    'heart-rush': ['heartbeat', 'Three physical pulses assist the flight.'],
    'black-hole': ['singularity', 'The pull curves the trajectory.'],
    boomerang: ['return', 'Return to the marked point behind launch.'],
    'roulette-table': ['wheel', 'Your landing sector sets the multiplier.'],
    rewind: ['rewind', 'A first miss gets one fallible replay.'],
    plinko: ['nine-slots', 'Aim the entry and watch the full drop.'],
    'mirror-match': ['mirror', 'Opponents inherit this launch profile.'],
    'cap-toss': ['two-targets', 'Land both authored pieces correctly.'],
    'life-drain': ['drain', 'Land the altered flight to trigger the drain.'],
  });

  var DEFINITIONS = freeze(Legacy.list().map(function (legacy, index) {
    var cue = CUE_BY_ID[legacy.id];
    var alienAdapter = AlienAdapters.get(legacy.id);
    if (!cue || !CLASS_BY_ID[legacy.id] || !alienAdapter) {
      throw new Error('Missing v1.12 event contract: ' + legacy.id);
    }
    return {
      schema: 'EventDefinitionV2', id: legacy.id, displayName: legacy.displayName,
      registryOrder: index, normalDenominator: legacy.normalDenominator,
      eventClass: CLASS_BY_ID[legacy.id], glyph: cue[0], instruction: cue[1],
      telegraphMs: 900, inputUnlockMs: 900,
      settleLimitMs: legacy.metadata.physics.settleLimitMs,
      insaneEligible: legacy.id !== 'life-drain',
      insaneWeight: legacy.id === 'plinko' ? 1.25 : 1,
      automatic: legacy.id === 'plinko', fallible: legacy.id !== 'plinko',
      reducedMotionKeepsMechanics: true,
      alienAdapter: alienAdapter,
    };
  }));
  AlienAdapters.assertComplete(DEFINITIONS.map(function (definition) { return definition.id; }));
  var BY_ID = Object.create(null);
  var BY_DISPLAY_NAME = Object.create(null);
  DEFINITIONS.forEach(function (definition) {
    BY_ID[definition.id] = definition;
    BY_DISPLAY_NAME[definition.displayName] = definition.id;
  });

  function get(id) { return BY_ID[String(id)] || null; }
  function forcedId(displayName, activityId) {
    if (activityId !== 'practice' && activityId !== 'physics-lab') return null;
    return BY_DISPLAY_NAME[String(displayName)] || null;
  }
  function eventSeed(seed, definition) {
    return Legacy.mixSeed(Number(seed) >>> 0, Legacy.eventSalt(definition.registryOrder));
  }

  function select(input) {
    var source = object(input);
    var activityId = String(source.activityId || 'free-play');
    var physicsModeId = String(source.physicsModeId || 'normal');
    if (source.eventsEnabled === false || source.copiedFlip === true ||
        source.arenaDraft === true || source.formatId === 'battle' ||
        (physicsModeId === 'alien' && activityId === 'story')) return null;
    if (!Number.isFinite(Number(source.seed))) throw new TypeError('event selection seed is required');
    var tutorialForced = activityId === 'tutorial' && source.tutorialEventId != null
      ? get(source.tutorialEventId) : null;
    if (activityId === 'tutorial' && source.tutorialEventId != null && !tutorialForced) {
      throw new TypeError('Unknown tutorial event ID');
    }
    var forced = tutorialForced ? tutorialForced.id : forcedId(source.forceName, activityId);
    if ((activityId === 'practice' || activityId === 'physics-lab') &&
        source.forceName != null && String(source.forceName) && !forced) {
      throw new TypeError('Unknown forced event display name');
    }
    var id = forced || Legacy.rollId({
      mode: physicsModeId === 'insane' ? 'insane' : 'normal',
      oddsProfile: source.playerName === 'Mr. Howe' && physicsModeId !== 'insane'
        ? 'mr-howe' : 'normal',
      seed: Number(source.seed) >>> 0,
      excludedEventIds: source.excludedEventIds,
    });
    if (!id) return null;
    var definition = get(id);
    if (physicsModeId === 'alien' && !AlienAdapters.has(id)) {
      throw new Error('Selected event has no compatible AlienEventAdapterV1');
    }
    var cue = physicsModeId === 'alien' ? definition.alienAdapter.telegraph : {
      glyph: definition.glyph, title: definition.displayName,
      instruction: definition.instruction,
    };
    return freeze({
      schema: 'EventSelectionV2', eventId: id, displayName: definition.displayName,
      eventClass: definition.eventClass, turnSeed: Number(source.seed) >>> 0,
      eventSeed: eventSeed(source.seed, definition), oddsProfile:
        tutorialForced ? 'tutorial-test' : (forced ? 'forced-test' : (physicsModeId === 'insane' ? 'insane'
          : (source.playerName === 'Mr. Howe' ? 'mr-howe' : 'normal'))),
      forced: !!forced, testData: !!forced, consumed: false,
      telegraph: { glyph: cue.glyph, title: definition.displayName,
        instruction: cue.instruction, durationMs: definition.telegraphMs },
    });
  }

  function createTurnController() {
    var binding = null;
    var bound = false;
    var qualified = false;
    function bind(input) {
      if (bound) throw new Error('A turn event is already bound');
      binding = select(input);
      bound = true;
      qualified = false;
      return binding;
    }
    function phase(elapsedMs) {
      if (!binding) return 'ready';
      var elapsed = Math.max(0, Number(elapsedMs) || 0);
      if (elapsed < 150) return 'named';
      if (elapsed < 300) return 'mechanic-visible';
      if (elapsed < 900) return 'instruction';
      return 'ready';
    }
    function canAcceptInput(elapsedMs) { return !binding || Number(elapsedMs) >= 900; }
    function cancelGesture() { return binding; }
    function qualifyLaunch() {
      if (qualified) throw new Error('Turn event was already consumed');
      qualified = true;
      if (binding) binding = freeze(Object.assign({}, clone(binding), { consumed: true }));
      return binding;
    }
    function clear() {
      var previous = binding;
      binding = null;
      bound = false;
      qualified = false;
      return previous;
    }
    function snapshot() { return freeze({ bound: bound, binding: clone(binding), qualified: qualified }); }
    return freeze({ bind: bind, phase: phase, canAcceptInput: canAcceptInput,
      cancelGesture: cancelGesture, qualifyLaunch: qualifyLaunch, clear: clear,
      snapshot: snapshot });
  }

  return freeze({ schema: 'FlipgameEventsV2', definitions: DEFINITIONS,
    plinkoSlots: Legacy.PLINKO_SLOTS, get: get, forcedId: forcedId,
    alienAdapters: AlienAdapters.adapters,
    getAlienAdapter: AlienAdapters.get,
    createAlienPlan: AlienAdapters.derivePlan,
    captureAlienRestoreState: AlienAdapters.captureRestoreState,
    restoreAlienState: AlienAdapters.restoreState,
    select: select, createTurnController: createTurnController });
});
