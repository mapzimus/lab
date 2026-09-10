// v111-interfaces.js — dependency-free shared contracts for Flipgame v111.
//
// This module defines seams only. It does not register event implementations,
// select a game mode, persist statistics, filter names, or alter gameplay.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV111Interfaces = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function () {
  'use strict';

  var CONTRACT_REVISION = 3;
  var RELEASE_VERSION = 'v1.11';
  var ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  var EVENT_CATALOG_SOURCE = [
    ['rainbow-corkscrew', 'Rainbow Corkscrew', 90],
    ['half-full', 'Half Full', 110],
    ['power-launch', 'Power Launch', 140],
    ['fizz-jet', 'Fizz Jet', 170],
    ['golden-flip', 'Golden Flip', 210],
    ['bouncy-bottle', 'Bouncy Bottle', 250],
    ['earthquake', 'Earthquake', 290],
    ['moon-gravity', 'Moon Gravity', 340],
    ['ice-slide', 'Ice Slide', 450],
    ['alien-invasion', 'Alien Invasion', 550],
    ['gravity-slam', 'Gravity Slam', 650],
    ['trampoline', 'Trampoline', 750],
    ['wind-tunnel', 'Wind Tunnel', 850],
    ['shrink-ray', 'Shrink Ray', 950],
    ['portal-pair', 'Portal Pair', 1100],
    ['tether-swing', 'Tether Swing', 1250],
    ['mitosis', 'Mitosis', 1400],
    ['double-flip', 'Double Flip', 1550],
    ['ceiling-flip', 'Ceiling Flip', 1750],
    ['meteor-shower', 'Meteor Shower', 1950],
    ['magnet', 'Magnet', 2200],
    ['heart-rush', 'Heart Rush', 2450],
    ['black-hole', 'Black Hole', 2700],
    ['boomerang', 'Boomerang', 3000],
    ['roulette-table', 'Roulette Table', 3400],
    ['rewind', 'Rewind', 3800],
    ['plinko', 'Plinko', 4500],
    ['mirror-match', 'Mirror Match', 5000],
    ['cap-toss', 'Cap Toss', 5500],
    ['life-drain', 'Life Drain', 6000],
  ];

  function clone(value, seen) {
    if (value === null || typeof value !== 'object') return value;
    var memo = seen || new Map();
    if (memo.has(value)) return memo.get(value);
    var copy = Array.isArray(value) ? [] : {};
    memo.set(value, copy);
    Object.keys(value).forEach(function (key) {
      copy[key] = clone(value[key], memo);
    });
    return copy;
  }

  function deepFreeze(value, seen) {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return value;
    var visited = seen || new Set();
    if (visited.has(value)) return value;
    visited.add(value);
    Object.keys(value).forEach(function (key) { deepFreeze(value[key], visited); });
    return Object.freeze(value);
  }

  function immutableCopy(value) { return deepFreeze(clone(value)); }

  function assertObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError(label + ' must be an object');
    }
  }

  function assertId(value, label) {
    if (!ID_RE.test(String(value || ''))) {
      throw new TypeError(label + ' must be a lowercase kebab-case id');
    }
  }

  var EVENT_CATALOG = immutableCopy(EVENT_CATALOG_SOURCE.map(function (entry, index) {
    return {
      id: entry[0],
      displayName: entry[1],
      normalDenominator: entry[2],
      registryOrder: index,
    };
  }));
  var EVENT_IDS = Object.freeze(EVENT_CATALOG.map(function (event) { return event.id; }));
  var EVENT_ID_SET = new Set(EVENT_IDS);

  var LANDING_PHASES = Object.freeze({
    AIRBORNE: 'airborne',
    CONTACT: 'contact',
    SETTLING: 'settling',
    RESOLVED: 'resolved',
  });
  var LANDING_RESULTS = Object.freeze({ MAKE: 'MAKE', MISS: 'MISS' });
  var LANDING_POSES = Object.freeze({
    UPRIGHT: 'upright',
    CAP: 'cap',
    OTHER: 'other',
    UNRESOLVED: 'unresolved',
  });

  var OUTCOME_EVENT_TYPES = Object.freeze({
    MATCH_STARTED: 'match.started.v1',
    FLIP_STARTED: 'flip.started.v1',
    FLIP_RESOLVED: 'flip.resolved.v1',
    MATCH_RESOLVED: 'match.resolved.v1',
    MATCH_ABANDONED: 'match.abandoned.v1',
  });
  var PROGRESSION_EVENT_TYPES = Object.freeze({
    QUALIFYING_WIN: 'progression.qualifying-win.v1',
    CONTENT_UNLOCKED: 'progression.content-unlocked.v1',
    ACHIEVEMENT_EARNED: 'progression.achievement-earned.v1',
  });
  var LIFECYCLE_EVENT_TYPES = Object.freeze({
    MENU_ENTERED: 'lifecycle.menu-entered.v1',
    MATCH_STARTED: OUTCOME_EVENT_TYPES.MATCH_STARTED,
    FLIP_STARTED: OUTCOME_EVENT_TYPES.FLIP_STARTED,
    LANDING_CONTACT: 'landing.contact.v1',
    LANDING_SETTLING: 'landing.settling.v1',
    FLIP_RESOLVED: OUTCOME_EVENT_TYPES.FLIP_RESOLVED,
    MATCH_RESOLVED: OUTCOME_EVENT_TYPES.MATCH_RESOLVED,
    MATCH_ABANDONED: OUTCOME_EVENT_TYPES.MATCH_ABANDONED,
  });

  var EVENT_HOOKS = Object.freeze([
    'prepare', 'applyPhysics', 'onContact', 'resolve', 'cleanup',
  ]);

  function EventDefinition(spec) {
    if (!(this instanceof EventDefinition)) return new EventDefinition(spec);
    assertObject(spec, 'EventDefinition');
    assertId(spec.id, 'EventDefinition.id');
    if (!EVENT_ID_SET.has(spec.id)) throw new RangeError('Unknown v111 event id: ' + spec.id);
    var catalogEntry = EVENT_CATALOG.find(function (event) { return event.id === spec.id; });
    if (spec.displayName != null && spec.displayName !== catalogEntry.displayName) {
      throw new Error('EventDefinition.displayName must match the v111 catalog');
    }
    EVENT_HOOKS.forEach(function (hook) {
      if (typeof spec[hook] !== 'function') {
        throw new TypeError('EventDefinition.' + hook + ' must be a function');
      }
    });
    this.id = spec.id;
    this.displayName = catalogEntry.displayName;
    this.normalDenominator = catalogEntry.normalDenominator;
    this.registryOrder = catalogEntry.registryOrder;
    this.insaneEligible = spec.id !== 'life-drain';
    this.insaneWeight = spec.id === 'plinko' ? 1.25 : 1;
    this.prepare = spec.prepare;
    this.applyPhysics = spec.applyPhysics;
    this.onContact = spec.onContact;
    this.resolve = spec.resolve;
    this.cleanup = spec.cleanup;
    this.render = typeof spec.render === 'function' ? spec.render : null;
    this.reducedMotion = typeof spec.reducedMotion === 'function' ? spec.reducedMotion : null;
    this.metadata = immutableCopy(spec.metadata || {});
    Object.freeze(this);
  }

  function EventRegistry(options) {
    if (!(this instanceof EventRegistry)) return new EventRegistry(options);
    var config = options || {};
    var definitions = new Map();
    var rollStrategy = typeof config.rollStrategy === 'function' ? config.rollStrategy : null;

    this.register = function (definition) {
      var value = definition instanceof EventDefinition ? definition : EventDefinition(definition);
      if (definitions.has(value.id)) throw new Error('Event already registered: ' + value.id);
      definitions.set(value.id, value);
      return value;
    };
    this.get = function (id) { return definitions.get(id) || null; };
    this.has = function (id) { return definitions.has(id); };
    this.list = function () { return Object.freeze(Array.from(definitions.values())); };
    this.setRollStrategy = function (strategy) {
      if (strategy !== null && typeof strategy !== 'function') {
        throw new TypeError('EventRegistry roll strategy must be a function or null');
      }
      rollStrategy = strategy;
    };
    this.roll = function (request) {
      assertObject(request, 'EventRegistry.roll request');
      if (!Number.isFinite(Number(request.seed))) throw new TypeError('EventRegistry.roll seed is required');
      if (!rollStrategy) return null;
      var selected = rollStrategy(immutableCopy({
        mode: request.mode || 'normal',
        oddsProfile: request.oddsProfile || 'normal',
        seed: Number(request.seed) >>> 0,
      }), this.list());
      if (selected == null) return null;
      var id = typeof selected === 'string' ? selected : selected.id;
      var match = definitions.get(id);
      if (!match) throw new RangeError('Roll strategy selected an unregistered event: ' + id);
      return match;
    };
  }

  function EventController(registry) {
    if (!(this instanceof EventController)) return new EventController(registry);
    if (!registry || typeof registry.get !== 'function') {
      throw new TypeError('EventController requires an EventRegistry');
    }
    var active = null;
    var eventState;

    function invoke(hook, context) {
      if (!active) return undefined;
      return active[hook](context, eventState);
    }

    this.prepare = function (eventOrId, context) {
      if (active) throw new Error('An event is already active');
      var definition = typeof eventOrId === 'string' ? registry.get(eventOrId) : eventOrId;
      if (!definition) return null;
      if (!(definition instanceof EventDefinition)) definition = EventDefinition(definition);
      active = definition;
      try { eventState = definition.prepare(context); }
      catch (error) { active = null; eventState = undefined; throw error; }
      return active;
    };
    this.applyPhysics = function (context) { return invoke('applyPhysics', context); };
    this.onContact = function (context) { return invoke('onContact', context); };
    this.resolve = function (context) { return invoke('resolve', context); };
    this.cleanup = function (context) {
      if (!active) return undefined;
      try { return invoke('cleanup', context); }
      finally { active = null; eventState = undefined; }
    };
    this.active = function () { return active; };
  }

  function LandingVerdict(input) {
    if (!(this instanceof LandingVerdict)) return new LandingVerdict(input);
    var value = input || {};
    var phases = Object.keys(LANDING_PHASES).map(function (key) { return LANDING_PHASES[key]; });
    var phase = value.phase || LANDING_PHASES.RESOLVED;
    if (phases.indexOf(phase) < 0) throw new RangeError('Unknown landing phase: ' + phase);
    var result = value.result == null ? null : String(value.result).toUpperCase();
    if (result !== null && result !== LANDING_RESULTS.MAKE && result !== LANDING_RESULTS.MISS) {
      throw new RangeError('Landing result must be MAKE, MISS, or null');
    }
    if (phase !== LANDING_PHASES.RESOLVED && result !== null) {
      throw new Error('Only a resolved landing may carry a result');
    }
    this.version = 1;
    this.phase = phase;
    this.result = result;
    this.pose = value.pose || (result === null ? LANDING_POSES.UNRESOLVED : LANDING_POSES.OTHER);
    this.reason = value.reason == null ? null : String(value.reason);
    this.firstContactMs = value.firstContactMs == null ? null : Number(value.firstContactMs);
    this.settleMs = value.settleMs == null ? null : Number(value.settleMs);
    this.tilt = value.tilt == null ? null : Number(value.tilt);
    this.perfect = !!value.perfect;
    this.onCap = !!value.onCap || this.pose === LANDING_POSES.CAP;
    this.rotations = value.rotations == null ? null : Number(value.rotations);
    this.contacts = value.contacts == null ? null : Number(value.contacts);
    this.bounces = value.bounces == null ? null : Number(value.bounces);
    this.banks = value.banks == null ? null : Number(value.banks);
    this.details = immutableCopy(value.details || {});
    Object.freeze(this);
  }

  LandingVerdict.fromLegacy = function (result, info) {
    var detail = info || {};
    var uprightReasons = ['upright', 'upright-timeout'];
    return LandingVerdict({
      phase: LANDING_PHASES.RESOLVED,
      result: result,
      pose: detail.onCap || detail.reason === 'cap' ? LANDING_POSES.CAP
        : (result === LANDING_RESULTS.MAKE && uprightReasons.indexOf(detail.reason) >= 0
          ? LANDING_POSES.UPRIGHT : LANDING_POSES.OTHER),
      reason: detail.reason || null,
      tilt: detail.tilt,
      perfect: detail.perfect,
      onCap: detail.onCap,
      rotations: detail.rotations,
      contacts: detail.contacts,
      bounces: detail.bounces,
      banks: detail.bankHits,
      details: detail,
    });
  };

  function versionedRecord(schema, version, value) {
    assertObject(value, schema);
    return immutableCopy(Object.assign({}, value, { schema: schema, version: version }));
  }

  function FlipRecordV1(value) { return versionedRecord('FlipRecordV1', 1, value); }
  function MatchRecordV1(value) { return versionedRecord('MatchRecordV1', 1, value); }
  function NetworkEnvelopeV2(value) { return versionedRecord('NetworkEnvelopeV2', 2, value); }

  function ProgressionStateV3(value) {
    var source = value || {};
    return immutableCopy({
      schema: 'ProgressionStateV3',
      version: 3,
      qualifyingWins: Math.max(0, Number(source.qualifyingWins) || 0),
      ownedObjectIds: Array.isArray(source.ownedObjectIds) ? source.ownedObjectIds.slice() : ['bottle'],
      ownedCosmeticIds: Array.isArray(source.ownedCosmeticIds) ? source.ownedCosmeticIds.slice() : [],
      achievementIds: Array.isArray(source.achievementIds) ? source.achievementIds.slice() : [],
      claimedRewardIds: Array.isArray(source.claimedRewardIds) ? source.claimedRewardIds.slice() : [],
    });
  }

  function StatsStore(candidate) {
    assertObject(candidate, 'StatsStore');
    ['recordFlip', 'recordMatch'].forEach(function (method) {
      if (typeof candidate[method] !== 'function') {
        throw new TypeError('StatsStore.' + method + ' must be a function');
      }
    });
    return candidate;
  }

  function assertRenderVariant(candidate) {
    assertObject(candidate, 'RenderVariant');
    assertId(candidate.objectId, 'RenderVariant.objectId');
    assertId(candidate.variantId, 'RenderVariant.variantId');
    if (candidate.id !== candidate.objectId + '.' + candidate.variantId) {
      throw new Error('RenderVariant.id must be <object-id>.<variant-id>');
    }
    if (typeof candidate.renderLocal !== 'function') {
      throw new TypeError('RenderVariant.renderLocal must be a function');
    }
    if (!candidate.metrics || !Object.isFrozen(candidate.metrics)) {
      throw new TypeError('RenderVariant.metrics must be immutable');
    }
    return candidate;
  }

  return deepFreeze({
    CONTRACT_REVISION: CONTRACT_REVISION,
    RELEASE_VERSION: RELEASE_VERSION,
    EVENT_CATALOG: EVENT_CATALOG,
    EVENT_IDS: EVENT_IDS,
    EVENT_HOOKS: EVENT_HOOKS,
    LANDING_PHASES: LANDING_PHASES,
    LANDING_RESULTS: LANDING_RESULTS,
    LANDING_POSES: LANDING_POSES,
    OUTCOME_EVENT_TYPES: OUTCOME_EVENT_TYPES,
    PROGRESSION_EVENT_TYPES: PROGRESSION_EVENT_TYPES,
    LIFECYCLE_EVENT_TYPES: LIFECYCLE_EVENT_TYPES,
    EventDefinition: EventDefinition,
    EventRegistry: EventRegistry,
    EventController: EventController,
    LandingVerdict: LandingVerdict,
    ProgressionStateV3: ProgressionStateV3,
    StatsStore: StatsStore,
    FlipRecordV1: FlipRecordV1,
    MatchRecordV1: MatchRecordV1,
    NetworkEnvelopeV2: NetworkEnvelopeV2,
    assertRenderVariant: assertRenderVariant,
    immutableCopy: immutableCopy,
  });
});
