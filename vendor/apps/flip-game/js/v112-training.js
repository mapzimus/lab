// v112-training.js -- pure Practice, Physics Lab, and First Flip Tour contracts.
// This module owns no DOM, renderer, physics body, profile mutation, rewards, or stats IO.
(function (root, factory) {
  'use strict';
  var activity = root && root.FlipgameV112Activity;
  var events = root && root.FlipgameV112Events;
  var tutorial = root && root.FlipgameV112Tutorial;
  if (typeof module === 'object' && module.exports) {
    activity = require('./v112-activity.js');
    events = require('./v112-events.js');
    tutorial = require('./v112-tutorial.js');
  }
  var api = factory(activity, events, tutorial);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112Training = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Activity, Events, Tutorial) {
  'use strict';

  if (!Activity) throw new Error('FlipgameV112Activity must load before v112-training.js');
  if (!Events) throw new Error('FlipgameV112Events must load before v112-training.js');
  if (!Tutorial) throw new Error('FlipgameV112Tutorial must load before v112-training.js');

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
  function finite(value, label) {
    var number = Number(value);
    if (!Number.isFinite(number)) throw new TypeError(label + ' must be finite');
    return number;
  }
  function integer(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? Math.floor(number) : fallback;
  }
  function uint32(value, label) {
    var number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0 || number > 0xffffffff) {
      throw new RangeError(label + ' must be a whole number from 0 to 4294967295');
    }
    return number >>> 0;
  }
  function seedOrDefault(value, fallback) {
    if (value == null || value === '') return fallback >>> 0;
    var number = Number(value);
    return Number.isFinite(number) ? Math.floor(number) >>> 0 : fallback >>> 0;
  }
  function hash(seed, salt) {
    var seedNumber = seed == null || !Number.isFinite(Number(seed)) ? 1 : Number(seed);
    var saltNumber = salt == null || !Number.isFinite(Number(salt)) ? 0 : Number(salt);
    var x = (seedNumber ^ saltNumber) >>> 0;
    x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b); x ^= x >>> 16;
    return x >>> 0;
  }
  function uniqueStrings(values) {
    return Array.from(new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean)));
  }
  function bounded(value, low, high, label) {
    var number = finite(value, label);
    if (number < low || number > high) throw new RangeError(label + ' must be between ' + low + ' and ' + high);
    return number;
  }

  var VIEWPORT_PRESETS = freeze([
    { id: 'phone-portrait', label: 'Phone · 360×740', width: 360, height: 740, bucket: 'phone' },
    { id: 'tablet-portrait', label: 'Tablet · 768×1024', width: 768, height: 1024, bucket: 'tablet' },
    { id: 'smartboard-hd', label: 'Smartboard · 1280×720', width: 1280, height: 720, bucket: 'desktop' },
    { id: 'laptop-wide', label: 'Laptop · 1366×768', width: 1366, height: 768, bucket: 'desktop' },
    { id: 'desktop-hd', label: 'Desktop · 1920×1080', width: 1920, height: 1080, bucket: 'desktop' },
    { id: 'smartboard-4k', label: 'Smartboard · 3840×2160', width: 3840, height: 2160, bucket: 'desktop-4k' },
  ]);
  var VIEWPORT_BY_ID = Object.create(null);
  VIEWPORT_PRESETS.forEach(function (preset) { VIEWPORT_BY_ID[preset.id] = preset; });
  var SLOW_MOTION_RATES = freeze([0.1, 0.25, 0.5, 1]);
  var MAX_RESOLVED_ATTEMPTS = 256;
  var MAX_TRAJECTORY_SAMPLES = 480;
  var MAX_SUCCESSFUL_GHOSTS = 24;
  // PhysicsLabAuthorizationV1 and PhysicsLabProfileProviderV1 are capabilities,
  // not serializable claims. Their WeakSet identity prevents look-alike objects
  // (including JSON-restored request metadata) from authorizing Lab access.
  var ISSUED_LAB_AUTHORIZATIONS = new WeakSet();
  var ISSUED_LAB_PROFILE_PROVIDERS = new WeakSet();
  var REGISTERED_LAB_PROFILE_PROVIDERS = new WeakMap();
  var DYNAMIC_PRACTICE_CLASSIFICATION = Object.freeze({});
  var FORCEABLE_EVENT_NAMES = freeze(Events.definitions.map(function (entry) { return entry.displayName; }));
  var LANDING_LABELS = freeze({
    upright: 'Stable upright landing', cap: 'Stable cap landing', 'cap-settled': 'Detachable top settled',
    fallen: 'Fell after contact', timeout: 'Did not settle in time', 'invalid-pose': 'Invalid settled pose',
    underrotated: 'Not enough rotation', 'invalid-cap': 'Cap landing is not valid here',
    'invalid-upright': 'Upright landing is not valid here', 'off-plane-settle-limit': 'Settled away from the landing plane',
    'off-field': 'Left the playable field', 'missing-body': 'Physics body unavailable',
    'tractor-ring': 'Banked into the tractor ring', 'no-bank': 'Tractor ring entered without a bank',
    plinko: 'Plinko slot resolved', 'mitosis-both': 'Both copies landed',
    'mitosis-one': 'One copy landed', 'mitosis-none': 'Neither copy landed',
    'cap-toss-both': 'Both targets landed', 'cap-toss-incomplete': 'One or both targets missed',
    unresolved: 'No landing verdict', unknown: 'Other resolved outcome',
  });

  function viewportPreset(id) {
    var value = VIEWPORT_BY_ID[String(id || '')];
    if (!value) throw new TypeError('Unknown viewport preset');
    return value;
  }

  function hasPhysicsLabEntitlement(profile) {
    var source = object(profile);
    var featureIds = uniqueStrings(source.featureIds)
      .concat(uniqueStrings(object(source.entitlements).featureIds));
    var claimed = uniqueStrings(source.claimedRewardIds);
    return integer(source.flipLevel, 1) >= 50 || featureIds.indexOf('physics-lab') >= 0 ||
      claimed.indexOf('feature.physics-lab') >= 0 ||
      claimed.indexOf('level.50.feature.physics-lab') >= 0;
  }

  function labLockedError() {
    var error = new Error('Physics Lab is locked until Flip Level 50');
    error.code = 'PHYSICS_LAB_LOCKED';
    return error;
  }

  function authorizePhysicsLab(profile) {
    var source = object(profile);
    if (!hasPhysicsLabEntitlement(source)) throw labLockedError();
    var featureIds = uniqueStrings(source.featureIds)
      .concat(uniqueStrings(object(source.entitlements).featureIds));
    var claimed = uniqueStrings(source.claimedRewardIds);
    var entitlementSource = integer(source.flipLevel, 1) >= 50 ? 'flip-level'
      : (featureIds.indexOf('physics-lab') >= 0 ? 'migrated-feature'
      : (claimed.indexOf('level.50.feature.physics-lab') >= 0 ? 'migrated-level-claim'
      : 'migrated-feature-claim'));
    var authorization = freeze({ schema: 'PhysicsLabAuthorizationV1', featureId: 'physics-lab',
      authorized: true, entitlementSource: entitlementSource });
    ISSUED_LAB_AUTHORIZATIONS.add(authorization);
    return authorization;
  }

  function validLabAuthorization(value) {
    return !!value && (typeof value === 'object' || typeof value === 'function') &&
      ISSUED_LAB_AUTHORIZATIONS.has(value);
  }

  function resolveLabAuthorization(source) {
    var value = object(source);
    var supplied = value.physicsLabAuthorization || value.authorization ||
      object(value.activityContext).physicsLabAuthorization;
    if (validLabAuthorization(supplied)) return supplied;
    if (value.profile != null) return authorizePhysicsLab(value.profile);
    throw labLockedError();
  }

  function createPhysicsLabProfileProvider(reader) {
    if (typeof reader !== 'function') throw new TypeError('Physics Lab profile reader is required');
    var provider = freeze({ schema: 'PhysicsLabProfileProviderV1', read: reader });
    ISSUED_LAB_PROFILE_PROVIDERS.add(provider);
    return provider;
  }

  function installLabProfileProvider(registry, value) {
    if (value == null) return;
    if (!value || (typeof value !== 'object' && typeof value !== 'function') ||
        !ISSUED_LAB_PROFILE_PROVIDERS.has(value)) {
      throw new TypeError('Invalid PhysicsLabProfileProviderV1');
    }
    var existing = REGISTERED_LAB_PROFILE_PROVIDERS.get(registry);
    if (existing && existing !== value) {
      throw new Error('Physics Lab profile provider is already registered');
    }
    REGISTERED_LAB_PROFILE_PROVIDERS.set(registry, value);
  }

  function requireCurrentLabEntitlement(registry, phase, payload) {
    var provider = REGISTERED_LAB_PROFILE_PROVIDERS.get(registry);
    if (!provider) throw labLockedError();
    var profile = provider.read(freeze({
      schema: 'PhysicsLabProfileReadV1', phase: String(phase),
      request: object(payload).request || null,
    }));
    if (!hasPhysicsLabEntitlement(profile)) throw labLockedError();
  }

  function rosterDisplayName(roster, activePlayerId) {
    var entries = Array.isArray(roster) ? roster : [];
    var id = activePlayerId == null ? null : String(activePlayerId);
    var entry = id == null ? entries[0] : entries.find(function (candidate, index) {
      return String(object(candidate).id || object(candidate).playerId || ('seat-' + (index + 1))) === id;
    });
    var source = object(entry);
    if (!entry) throw new TypeError('Active Training player is not in the roster');
    if (source.displayName != null) return String(source.displayName);
    if (source.name != null) return String(source.name);
    return '';
  }

  function forcedContext(value) {
    var source = object(value);
    return source.forced === true || source.testData === true ||
      source.forcedEvent === true || source.forcedEventId != null ||
      (source.forcedEventDisplayName != null && String(source.forcedEventDisplayName) !== '') ||
      (source.forceName != null && String(source.forceName) !== '');
  }

  function containsForcedMarker(value, depth) {
    if (depth == null) depth = 3;
    if (forcedContext(value)) return true;
    if (depth <= 0) return false;
    var source = object(value);
    var nestedKeys = ['isolation', 'testDataRecord', 'eventSelection', 'trainingResolution',
      'resolution', 'activityState', 'telemetry'];
    if (nestedKeys.some(function (key) {
      return source[key] && containsForcedMarker(source[key], depth - 1);
    })) return true;
    var listKeys = ['attempts', 'flips', 'records', 'resolutions', 'participantResults'];
    return listKeys.some(function (key) {
      return Array.isArray(source[key]) && source[key].some(function (entry) {
        return containsForcedMarker(entry, depth - 1);
      });
    });
  }

  function featureState(profile) {
    var source = object(profile);
    var level = Math.max(1, Math.min(100, integer(source.flipLevel, 1)));
    var lab = hasPhysicsLabEntitlement(source);
    return freeze({
      schema: 'TrainingFeatureStateV1',
      flipLevel: level,
      practice: { activityId: 'practice', available: true, locked: false, title: 'Practice' },
      physicsLab: {
        activityId: 'physics-lab', available: lab, locked: !lab, title: 'Physics Lab',
        requirement: lab ? null : 'Locked until Flip Level 50',
      },
    });
  }

  function isolation(activityId, detail) {
    var forced = forcedContext(detail);
    var testData = activityId === 'physics-lab' || activityId === 'tutorial' ||
      (activityId === 'practice' && forced);
    return freeze({
      schema: 'TrainingIsolationV1', activityId: activityId, testData: testData,
      progressionEligible: false, fcEligible: false, achievementsEligible: false,
      statisticsDefaultEligible: !testData, importedArchiveEligible: false,
    });
  }

  function createMatchRequest(input) {
    var source = object(input);
    var activityId = String(source.activityId || 'practice');
    if (['practice', 'physics-lab', 'tutorial'].indexOf(activityId) < 0) {
      throw new TypeError('Training activity must be Practice, Physics Lab, or Tutorial');
    }
    var matchId = required(source.matchId || source.sessionId, 'training matchId');
    var roster = Array.isArray(source.roster) && source.roster.length
      ? source.roster : [{ id: 'training-player', human: true }];
    var activePlayerId = source.activePlayerId == null
      ? String(object(roster[0]).id || object(roster[0]).playerId || 'seat-1')
      : String(source.activePlayerId);
    var playerName = rosterDisplayName(roster, activePlayerId);
    var namedForce = activityId === 'practice' && !!Events.forcedId(playerName, activityId);
    var requestedForceName = source.forceName == null ? '' : String(source.forceName);
    if (requestedForceName && !Events.forcedId(requestedForceName, activityId)) {
      throw new TypeError('Unknown forced event display name');
    }
    var dynamicPractice = activityId === 'practice' &&
      source.dynamicClassificationToken === DYNAMIC_PRACTICE_CLASSIFICATION;
    var sessionPolicy = isolation(activityId, {
      forced: !dynamicPractice &&
        (forcedContext(source) || forcedContext(source.activityContext) || namedForce),
    });
    var labAuthorization = activityId === 'physics-lab' ? resolveLabAuthorization(source) : null;
    return Activity.MatchRequestV2({
      matchId: matchId, activityId: activityId, formatId: 'classic', physicsModeId: 'normal',
      roster: roster, seed: seedOrDefault(source.seed, 1), createdAt: source.createdAt,
      rulesOptions: Object.assign({}, clone(object(source.rulesOptions)), {
        eventsEnabled: true, rewardsEnabled: false, progressionEnabled: false,
      }),
      activityContext: Object.assign({}, clone(object(source.activityContext)), sessionPolicy, {
        trainingSessionId: String(source.sessionId || matchId), activePlayerId: activePlayerId,
        physicsLabAuthorization: labAuthorization,
        dynamicActivityState: dynamicPractice,
      }),
    });
  }

  function trainingResolution(activityId, status, detail, policy) {
    var resolvedPolicy = policy || isolation(activityId, detail);
    return freeze({
      schema: 'TrainingActivityResolutionV1', activityId: activityId,
      status: String(status || 'completed'), testData: resolvedPolicy.testData,
      progressionEligible: false, fcEligible: false, achievementsEligible: false,
      statisticsDefaultEligible: resolvedPolicy.statisticsDefaultEligible,
      awards: [], progressionCommands: [],
      achievementCommands: [], ownershipCommands: [], detail: clone(object(detail)),
    });
  }

  function validateRegisteredRequest(registry, activityId, request, phase, payload) {
    var value = object(request);
    if (value.activityId !== activityId) throw new TypeError('Training activity request mismatch');
    // Serialized MatchRequestV2 metadata is intentionally insufficient here.
    // Every adapter entry re-reads the authoritative current profile.
    if (activityId === 'physics-lab') requireCurrentLabEntitlement(registry, phase, payload);
    return value;
  }

  function payloadPolicy(activityId, payload) {
    var value = object(payload);
    var request = object(value.request);
    var outcome = object(value.outcome);
    var forced = containsForcedMarker(request.activityContext) ||
      containsForcedMarker(outcome) || containsForcedMarker(value.activityState) ||
      containsForcedMarker(value.detail);
    return isolation(activityId, { forced: forced });
  }

  function registerActivities(registry, options) {
    if (!registry || typeof registry.register !== 'function' || typeof registry.has !== 'function') {
      throw new TypeError('Activity registry is required');
    }
    installLabProfileProvider(registry, object(options).physicsLabProfileProvider);
    ['practice', 'physics-lab', 'tutorial'].forEach(function (activityId) {
      if (registry.has(activityId)) return;
      registry.register({
        id: activityId,
        prepare: function (payload) {
          var request = validateRegisteredRequest(registry, activityId,
            object(payload).request, 'prepare', payload);
          var policy = payloadPolicy(activityId, payload);
          return freeze({ schema: 'TrainingActivityPreparationV1', activityId: activityId,
            matchId: request.matchId || null, isolation: policy });
        },
        resolve: function (payload) {
          var value = object(payload);
          validateRegisteredRequest(registry, activityId, value.request, 'resolve', value);
          var policy = payloadPolicy(activityId, value);
          return trainingResolution(activityId, value.outcome && value.outcome.status,
            { matchId: value.request && value.request.matchId || null,
              forced: policy.testData }, policy);
        },
        abandon: function (payload) {
          var value = object(payload);
          validateRegisteredRequest(registry, activityId, value.request, 'abandon', value);
          var policy = payloadPolicy(activityId, value);
          return trainingResolution(activityId, 'abandoned',
            { reason: value.reason || 'abandoned', forced: policy.testData }, policy);
        },
      });
    });
    return registry;
  }

  function launchSignal(value) {
    var source = object(value);
    if (source.qualifiedManual !== true) throw new TypeError('A qualified manual launch is required');
    var record = {
      schema: 'TrainingLaunchSignalV1', qualifiedManual: true,
      normalizedPower: bounded(source.normalizedPower, 0, 1, 'normalizedPower'),
      normalizedDirection: bounded(source.normalizedDirection, -1, 1, 'normalizedDirection'),
      pointerType: String(source.pointerType || 'unknown'),
      sampleCount: Math.max(2, integer(source.sampleCount, 2)),
      durationMs: Math.max(0, finite(source.durationMs == null ? 0 : source.durationMs, 'durationMs')),
      velocity: null, angularVelocity: null,
    };
    var velocity = object(source.velocity);
    if (source.velocityX != null || source.velocityY != null || velocity.x != null || velocity.y != null) {
      record.velocity = {
        x: finite(source.velocityX == null ? velocity.x : source.velocityX, 'velocity.x'),
        y: finite(source.velocityY == null ? velocity.y : source.velocityY, 'velocity.y'),
      };
    }
    if (source.angularVelocity != null || source.spin != null) {
      record.angularVelocity = finite(source.angularVelocity == null ? source.spin : source.angularVelocity,
        'angularVelocity');
    }
    return freeze(record);
  }

  function trajectory(value) {
    if (value == null) return freeze([]);
    if (!Array.isArray(value)) throw new TypeError('trajectory must be an array');
    var previousTime = -Infinity;
    value.forEach(function (sample) {
      var source = object(sample);
      var time = finite(source.t == null ? source.timeMs : source.t, 'trajectory time');
      if (time < previousTime) throw new RangeError('trajectory time must be monotonic');
      previousTime = time;
      finite(source.x, 'trajectory x'); finite(source.y, 'trajectory y');
      finite(source.angle, 'trajectory angle');
    });
    var count = Math.min(value.length, MAX_TRAJECTORY_SAMPLES);
    var indices = [];
    for (var index = 0; index < count; index += 1) {
      indices.push(value.length <= MAX_TRAJECTORY_SAMPLES ? index
        : Math.floor(index * (value.length - 1) / (MAX_TRAJECTORY_SAMPLES - 1)));
    }
    return freeze(indices.map(function (sourceIndex, outputIndex) {
      var source = object(value[sourceIndex]);
      var time = finite(source.t == null ? source.timeMs : source.t, 'trajectory time');
      return {
        t: time, x: finite(source.x, 'trajectory x'), y: finite(source.y, 'trajectory y'),
        angle: finite(source.angle, 'trajectory angle'),
        phase: source.phase == null ? null : String(source.phase), index: outputIndex,
        sourceIndex: sourceIndex,
      };
    }));
  }

  function outcome(value) {
    var source = object(value);
    if (source.phase !== 'resolved') throw new TypeError('Training outcome must be resolved');
    var result = String(source.result || '').toUpperCase();
    if (result !== 'MAKE' && result !== 'MISS') throw new TypeError('Training result must be MAKE or MISS');
    var normalizedTrajectory = trajectory(source.trajectory);
    var trajectorySourceSampleCount = Array.isArray(source.trajectory) ? source.trajectory.length : 0;
    return freeze({
      schema: 'TrainingOutcomeV1', phase: 'resolved', result: result,
      pose: String(source.pose || (result === 'MAKE' ? 'upright' : 'other')),
      landingReason: source.landingReason == null
        ? String(source.reason || (result === 'MAKE' ? 'upright' : 'fallen'))
        : String(source.landingReason),
      qualifiedManual: source.qualifiedManual !== false,
      physical: source.physical !== false,
      automatic: source.automatic === true,
      contacts: Math.max(0, integer(source.contacts, 0)),
      bounces: Math.max(0, integer(source.bounces, 0)),
      banks: Math.max(0, integer(source.banks == null ? source.bankHits : source.banks, 0)),
      flightMs: Math.max(0, Number(source.flightMs) || 0),
      settleMs: source.settleMs == null ? null : Math.max(0, Number(source.settleMs) || 0),
      trajectory: normalizedTrajectory,
      trajectorySourceSampleCount: trajectorySourceSampleCount,
      trajectoryTruncated: trajectorySourceSampleCount > normalizedTrajectory.length,
    });
  }

  function landingReason(value, result) {
    var raw = String(value == null ? 'unresolved' : value).trim().toLowerCase();
    var id = /^[a-z][a-z0-9-]{0,47}$/.test(raw) ? raw : 'unknown';
    var label = LANDING_LABELS[id] || id.split('-').map(function (word) {
      return word ? word.charAt(0).toUpperCase() + word.slice(1) : word;
    }).join(' ');
    return freeze({ schema: 'LandingReasonV1', id: id, label: label,
      verdict: result === 'MAKE' ? 'make' : 'miss' });
  }

  function createGhost(attempt, launch, resolved) {
    var eventDefinition = attempt.eventSelection
      ? Events.get(attempt.eventSelection.eventId) : null;
    if (attempt.activityId !== 'physics-lab' || resolved.result !== 'MAKE' ||
        !resolved.qualifiedManual || !resolved.physical || resolved.automatic ||
        (eventDefinition && eventDefinition.automatic) || resolved.trajectory.length < 2) return null;
    return freeze({
      schema: 'SuccessfulShotGhostV1', ghostId: 'ghost:' + attempt.attemptId,
      sourceAttemptId: attempt.attemptId, activityId: attempt.activityId,
      flipperId: attempt.flipperId, viewportPreset: attempt.viewportPreset,
      turnSeed: attempt.turnSeed, eventSeed: attempt.eventSelection
        ? attempt.eventSelection.eventSeed : null,
      eventId: attempt.eventSelection ? attempt.eventSelection.eventId : null,
      launchSignal: launch.launchSignal, trajectory: resolved.trajectory,
      pose: resolved.pose, landingReason: resolved.landingReason,
      testData: true, progressionEligible: false, fcEligible: false,
      achievementsEligible: false,
      statisticsDefaultEligible: false,
    });
  }

  function preparedView(internal) {
    var policy = internal.policy || isolation(internal.activityId);
    return freeze({
      schema: 'TrainingAttemptV1', attemptId: internal.attemptId,
      activityId: internal.activityId, phase: internal.phase,
      flipperId: internal.flipperId, temporaryFlipper: internal.temporaryFlipper === true,
      guidedAssist: internal.guidedAssist === true,
      guidedAssistProfile: clone(internal.guidedAssistProfile),
      viewportPreset: internal.viewportPreset,
      presentationRate: internal.presentationRate, simulationStepScale: 1,
      turnSeed: internal.turnSeed, seedSource: internal.seedSource,
      eventSelection: clone(internal.eventSelection),
      replayOfAttemptId: internal.replayOfAttemptId,
      recordedLaunchSignal: clone(internal.recordedLaunchSignal),
      ghost: clone(internal.ghost), isolation: policy,
      testData: policy.testData, progressionEligible: false, fcEligible: false,
      achievementsEligible: false,
      statisticsDefaultEligible: policy.statisticsDefaultEligible,
    });
  }

  function createRuntime(input) {
    var options = object(input);
    var activityId = String(options.activityId || 'practice');
    if (activityId !== 'practice' && activityId !== 'physics-lab') {
      throw new TypeError('Training runtime supports Practice or Physics Lab');
    }
    var labAuthorization = activityId === 'physics-lab' ? resolveLabAuthorization(options) : null;
    var sessionId = required(options.sessionId, 'training sessionId');
    var baseSeed = seedOrDefault(options.seed, 1);
    var availableFlippers = uniqueStrings(options.availableFlipperIds);
    if (!availableFlippers.length) availableFlippers.push('bottle');
    var selectedFlipper = String(options.flipperId || availableFlippers[0]);
    if (availableFlippers.indexOf(selectedFlipper) < 0) {
      throw new TypeError('Selected Flipper is not available');
    }
    var selectedViewport = viewportPreset(options.viewportPresetId || 'desktop-hd');
    var rate = options.slowMotionRate == null ? 1 : Number(options.slowMotionRate);
    if (SLOW_MOTION_RATES.indexOf(rate) < 0) throw new TypeError('Unsupported slow-motion rate');
    if (activityId === 'practice' && rate !== 1) throw new Error('Slow motion requires Physics Lab');
    var forceName = options.forceName == null || options.forceName === ''
      ? null : String(options.forceName);
    if (forceName && !Events.forcedId(forceName, activityId)) {
      throw new TypeError('Unknown forced event display name');
    }
    var attemptNumber = 0;
    var pending = null;
    var resolvedById = new Map();
    var resolvedOrder = [];
    var history = [];
    var ghosts = [];
    var totalResolved = 0;
    var evictedResolutions = 0;
    var request = null;
    var activeDisplayName = '';
    var rosterForceName = null;
    var sessionHasTestData = activityId === 'physics-lab';
    var disposed = false;

    function assertOpen() { if (disposed) throw new Error('Training session is closed'); }
    function assertIdle() { if (pending) throw new Error('Finish or cancel the active Training attempt first'); }
    function requireLab(feature) {
      if (activityId !== 'physics-lab') throw new Error(feature + ' requires Physics Lab');
    }
    function activityState() {
      var policy = isolation(activityId, { forced: sessionHasTestData });
      return freeze({ schema: 'TrainingActivityStateV1', activityId: activityId,
        resolvedAttemptCount: totalResolved, testData: policy.testData,
        statisticsDefaultEligible: policy.statisticsDefaultEligible,
        forcedAttemptSeen: activityId === 'practice' && sessionHasTestData });
    }
    function snapshot() {
      var nextAttemptPolicy = isolation(activityId,
        { forced: !!(forceName || rosterForceName) });
      return freeze({
        schema: 'TrainingSessionV1', sessionId: sessionId, activityId: activityId,
        selectedFlipperId: selectedFlipper, viewportPreset: selectedViewport,
        presentationRate: rate, simulationStepScale: 1,
        forcedEventDisplayName: forceName, activeAttempt: pending ? preparedView(pending) : null,
        activePlayerId: request && request.activityContext.activePlayerId,
        resolvedAttemptCount: totalResolved, retainedResolutionCount: history.length,
        ghosts: clone(ghosts),
        landingReasons: history.map(function (entry) { return entry.landingReason; }),
        retention: { maximum: MAX_RESOLVED_ATTEMPTS, evicted: evictedResolutions,
          oldestAttemptId: resolvedOrder[0] || null,
          newestAttemptId: resolvedOrder[resolvedOrder.length - 1] || null },
        isolation: isolation(activityId, { forced: sessionHasTestData }),
        activityState: activityState(),
        nextAttemptIsolation: nextAttemptPolicy, closed: disposed,
      });
    }
    function setFlipper(id) {
      assertOpen(); requireLab('Flipper switching'); assertIdle();
      var value = String(id || '');
      if (availableFlippers.indexOf(value) < 0) {
        // Do not echo or otherwise reveal a locked/unknown catalog entry.
        throw new TypeError('Flipper is not available');
      }
      selectedFlipper = value;
      return snapshot();
    }
    function setViewport(id) {
      assertOpen(); requireLab('Viewport presets'); assertIdle();
      selectedViewport = viewportPreset(id);
      return snapshot();
    }
    function setSlowMotion(value) {
      assertOpen(); requireLab('Slow motion'); assertIdle();
      var next = Number(value);
      if (SLOW_MOTION_RATES.indexOf(next) < 0) throw new TypeError('Unsupported slow-motion rate');
      rate = next;
      return snapshot();
    }
    function setForcedEvent(displayName) {
      assertOpen(); assertIdle();
      if (displayName == null || displayName === '') { forceName = null; return snapshot(); }
      var exact = String(displayName);
      if (!Events.forcedId(exact, activityId)) throw new TypeError('Unknown forced event display name');
      forceName = exact;
      return snapshot();
    }
    function makePending(config) {
      var controller = Events.createTurnController();
      var effectiveForceName = config.forceName || rosterForceName || null;
      var selection = controller.bind({
        activityId: activityId, physicsModeId: 'normal', seed: config.seed,
        forceName: effectiveForceName, playerName: activeDisplayName,
      });
      if (config.expectedEventId !== undefined) {
        var selectedId = selection ? selection.eventId : null;
        if (selectedId !== config.expectedEventId ||
            (selection ? selection.eventSeed : null) !== config.expectedEventSeed) {
          throw new Error('Replay event contract no longer matches its source attempt');
        }
      }
      var attemptPolicy = isolation(activityId, {
        forced: !!(selection && selection.forced),
      });
      attemptNumber += 1;
      pending = {
        attemptId: sessionId + '.attempt.' + attemptNumber,
        activityId: activityId, phase: 'prepared', controller: controller,
        flipperId: config.flipperId || selectedFlipper, temporaryFlipper: false,
        viewportPreset: config.viewportPreset || selectedViewport,
        presentationRate: config.presentationRate == null ? rate : config.presentationRate,
        turnSeed: config.seed >>> 0, seedSource: config.seedSource || 'sequence',
        eventSelection: selection,
        forceName: effectiveForceName, forceOrigin: config.forceName
          ? 'explicit-control' : (rosterForceName ? 'player-display-name' : null),
        playerName: activeDisplayName, policy: attemptPolicy,
        replayOfAttemptId: config.replayOfAttemptId || null,
        recordedLaunchSignal: config.recordedLaunchSignal || null,
        ghost: config.ghost || null, launch: null,
      };
      return preparedView(pending);
    }
    function prepareAttempt(value) {
      assertOpen();
      if (pending) {
        if (pending.phase !== 'prepared') throw new Error('The active attempt has already launched');
        return preparedView(pending);
      }
      var source = object(value);
      var explicitSeed = source.seed != null;
      if (explicitSeed) requireLab('Explicit seed replay');
      var seed = explicitSeed ? uint32(source.seed, 'Replay seed')
        : hash(baseSeed, attemptNumber + 1);
      return makePending({ seed: seed, seedSource: explicitSeed ? 'explicit' : 'sequence',
        forceName: forceName });
    }
    function eventPhase(attemptId, elapsedMs) {
      assertOpen();
      if (!pending || pending.attemptId !== String(attemptId)) throw new Error('Unknown active Training attempt');
      return freeze({ phase: pending.controller.phase(elapsedMs),
        canAcceptInput: pending.controller.canAcceptInput(elapsedMs) });
    }
    function cancelGesture(attemptId) {
      assertOpen();
      if (!pending || pending.attemptId !== String(attemptId) || pending.phase !== 'prepared') {
        throw new Error('Training attempt cannot be cancelled');
      }
      pending.controller.cancelGesture();
      return freeze({ cancelled: true, retained: true, attempt: preparedView(pending) });
    }
    function qualifyLaunch(attemptId, signal, elapsedMs) {
      assertOpen();
      if (!pending || pending.attemptId !== String(attemptId) || pending.phase !== 'prepared') {
        throw new Error('Training attempt is not ready to launch');
      }
      if (pending.eventSelection && !pending.controller.canAcceptInput(elapsedMs)) {
        throw new Error('Event telegraph must finish before launch input');
      }
      if (!signal || signal.qualifiedManual !== true) return cancelGesture(attemptId);
      var normalized = launchSignal(signal);
      var consumed = pending.controller.qualifyLaunch();
      var policy = pending.policy;
      if (policy.testData) sessionHasTestData = true;
      pending.phase = 'airborne';
      pending.eventSelection = consumed;
      pending.launch = freeze({
        schema: 'TrainingLaunchV1', attemptId: pending.attemptId, activityId: activityId,
        flipperId: pending.flipperId, viewportPreset: pending.viewportPreset,
        presentationRate: pending.presentationRate, simulationStepScale: 1,
        turnSeed: pending.turnSeed, seedSource: pending.seedSource,
        eventSelection: clone(consumed), launchSignal: normalized,
        replayOfAttemptId: pending.replayOfAttemptId, isolation: policy,
        testData: policy.testData, progressionEligible: false, fcEligible: false,
        achievementsEligible: false,
        statisticsDefaultEligible: policy.statisticsDefaultEligible,
      });
      return pending.launch;
    }
    function resolveAttempt(attemptId, value) {
      assertOpen();
      if (!pending || pending.attemptId !== String(attemptId) || pending.phase !== 'airborne' || !pending.launch) {
        throw new Error('Training attempt is not airborne');
      }
      var normalized = outcome(value);
      var reason = landingReason(normalized.landingReason, normalized.result);
      var ghost = createGhost(pending, pending.launch, normalized);
      var policy = pending.policy;
      var resolution = freeze({
        schema: 'TrainingResolutionV1', attemptId: pending.attemptId, activityId: activityId,
        result: normalized.result, pose: normalized.pose, landingReason: reason,
        outcome: normalized, launch: pending.launch, ghost: ghost,
        replayOfAttemptId: pending.replayOfAttemptId,
        testDataRecord: {
          schema: 'TrainingTestDataMarkerV1', testData: policy.testData,
          statisticsDefaultEligible: policy.statisticsDefaultEligible, activityId: activityId,
          attemptId: pending.attemptId,
        },
        awards: [], progressionCommands: [], achievementCommands: [], ownershipCommands: [],
        isolation: policy, testData: policy.testData, progressionEligible: false,
        fcEligible: false,
        achievementsEligible: false,
        statisticsDefaultEligible: policy.statisticsDefaultEligible,
      });
      var source = {
        attemptId: pending.attemptId, turnSeed: pending.turnSeed,
        flipperId: pending.flipperId, viewportPreset: pending.viewportPreset,
        presentationRate: pending.presentationRate, forceName: pending.forceName,
        seedSource: pending.seedSource,
        eventId: pending.eventSelection ? pending.eventSelection.eventId : null,
        eventSeed: pending.eventSelection ? pending.eventSelection.eventSeed : null,
        launchSignal: pending.launch.launchSignal, ghost: ghost,
        resolution: resolution,
      };
      resolvedById.set(source.attemptId, source);
      resolvedOrder.push(source.attemptId);
      history.push(resolution);
      totalResolved += 1;
      if (resolvedOrder.length > MAX_RESOLVED_ATTEMPTS) {
        var evictedId = resolvedOrder.shift();
        resolvedById.delete(evictedId);
        history.shift();
        evictedResolutions += 1;
      }
      if (ghost) {
        ghosts.push(ghost);
        if (ghosts.length > MAX_SUCCESSFUL_GHOSTS) ghosts.shift();
      }
      pending.controller.clear();
      pending = null;
      return resolution;
    }
    function replayAttempt(attemptId) {
      assertOpen(); requireLab('Seed replay'); assertIdle();
      var source = resolvedById.get(String(attemptId));
      if (!source) throw new Error('Resolved Training attempt was not found');
      return makePending({
        seed: source.turnSeed, seedSource: 'replay', forceName: source.forceName,
        flipperId: source.flipperId, viewportPreset: source.viewportPreset,
        presentationRate: source.presentationRate,
        replayOfAttemptId: source.attemptId, recordedLaunchSignal: source.launchSignal,
        ghost: source.ghost, expectedEventId: source.eventId, expectedEventSeed: source.eventSeed,
      });
    }
    function close() {
      if (pending && pending.controller) pending.controller.clear();
      pending = null; disposed = true;
      return snapshot();
    }

    request = createMatchRequest({
      matchId: sessionId, sessionId: sessionId, activityId: activityId,
      roster: options.roster, seed: baseSeed, activePlayerId: options.activePlayerId,
      forceName: forceName, physicsLabAuthorization: labAuthorization,
      dynamicClassificationToken: activityId === 'practice'
        ? DYNAMIC_PRACTICE_CLASSIFICATION : null,
      activityContext: { selectedFlipperId: selectedFlipper },
    });
    activeDisplayName = rosterDisplayName(request.roster, request.activityContext.activePlayerId);
    rosterForceName = activityId === 'practice' && Events.forcedId(activeDisplayName, activityId)
      ? activeDisplayName : null;
    sessionHasTestData = request.activityContext.testData;
    var activityStateProvider = Activity.createSessionActivityStateProvider(activityState);
    var sessionHooks = Activity.MatchSessionHooksV1({
      activityStateProvider: activityStateProvider,
    });
    function startSession(coordinator) {
      if (!coordinator || typeof coordinator.start !== 'function') {
        throw new TypeError('Match session coordinator is required');
      }
      return coordinator.start(request, sessionHooks);
    }
    return freeze({
      schema: 'TrainingRuntimeV1', request: request, snapshot: snapshot,
      activityState: activityState, activityStateProvider: activityStateProvider,
      sessionHooks: sessionHooks, startSession: startSession,
      prepareAttempt: prepareAttempt, eventPhase: eventPhase, cancelGesture: cancelGesture,
      qualifyLaunch: qualifyLaunch, resolveAttempt: resolveAttempt, replayAttempt: replayAttempt,
      setFlipper: setFlipper, setViewportPreset: setViewport, setSlowMotion: setSlowMotion,
      setForcedEvent: setForcedEvent, close: close,
    });
  }

  function tutorialStepView(state) {
    var step = Tutorial.current(state);
    return freeze({
      schema: 'TutorialStepViewV1', id: step.id, kind: step.kind,
      title: step.title || null, instruction: step.instruction || null,
      flipperId: step.objectId || null, temporaryFlipper: step.temporaryObject === true,
      complete: step.kind === 'complete',
    });
  }

  function createTutorialSession(input) {
    var options = object(input);
    var sessionId = required(options.sessionId, 'Tutorial sessionId');
    var baseSeed = seedOrDefault(options.seed, 1);
    var state = options.state ? Tutorial.normalize(options.state) : Tutorial.initial(baseSeed);
    var pending = null;
    var history = [];
    var totalResolved = 0;
    var evictedResolutions = 0;
    var skipped = state.skipped;

    function assertTourActive() {
      if (state.skipped || state.status === 'skipped') throw new Error('First Flip Tour was skipped');
      if (state.completed || state.status === 'complete') throw new Error('First Flip Tour is complete');
    }

    function snapshot() {
      return freeze({
        schema: 'FirstFlipTourSessionV1', sessionId: sessionId,
        state: state, step: tutorialStepView(state),
        targetDurationSeconds: Tutorial.targetDurationSeconds,
        activeAttempt: pending ? preparedView(pending) : null,
        history: clone(history), resolvedAttemptCount: totalResolved,
        retention: { maximum: MAX_RESOLVED_ATTEMPTS, evicted: evictedResolutions },
        isolation: isolation('tutorial'), skipped: skipped,
      });
    }
    function acknowledge() {
      assertTourActive();
      if (pending) throw new Error('Finish the active Tutorial attempt first');
      state = Tutorial.acknowledge(state);
      return snapshot();
    }
    function prepareAttempt() {
      assertTourActive();
      if (pending) {
        if (pending.phase !== 'prepared') throw new Error('The active Tutorial attempt has launched');
        return preparedView(pending);
      }
      var attempt = Tutorial.prepareAttempt(state);
      var controller = Events.createTurnController();
      var selected = controller.bind({
        activityId: 'tutorial', physicsModeId: 'normal', seed: attempt.seed,
        eventsEnabled: !!attempt.eventSelection,
        tutorialEventId: attempt.eventSelection ? attempt.eventSelection.eventId : null,
      });
      pending = {
        attemptId: attempt.attemptId, activityId: 'tutorial', phase: 'prepared',
        controller: controller, tutorialAttempt: attempt,
        flipperId: attempt.objectId, temporaryFlipper: attempt.temporaryObject === true,
        guidedAssist: attempt.guidedAssist === true,
        guidedAssistProfile: clone(attempt.guidedAssistProfile), policy: isolation('tutorial'),
        viewportPreset: viewportPreset(options.viewportPresetId || 'desktop-hd'),
        presentationRate: 1, turnSeed: attempt.seed, seedSource: 'tutorial',
        eventSelection: selected,
        forceName: null, replayOfAttemptId: null, recordedLaunchSignal: null,
        ghost: null, launch: null,
      };
      return preparedView(pending);
    }
    function eventPhase(attemptId, elapsedMs) {
      if (!pending || pending.attemptId !== String(attemptId)) throw new Error('Unknown Tutorial attempt');
      return freeze({ phase: pending.controller.phase(elapsedMs),
        canAcceptInput: pending.controller.canAcceptInput(elapsedMs) });
    }
    function cancelGesture(attemptId) {
      if (!pending || pending.attemptId !== String(attemptId) || pending.phase !== 'prepared') {
        throw new Error('Tutorial attempt cannot be cancelled');
      }
      pending.controller.cancelGesture();
      return freeze({ cancelled: true, retained: true, attempt: preparedView(pending) });
    }
    function qualifyLaunch(attemptId, signal, elapsedMs) {
      if (!pending || pending.attemptId !== String(attemptId) || pending.phase !== 'prepared') {
        throw new Error('Tutorial attempt is not ready to launch');
      }
      if (pending.eventSelection && !pending.controller.canAcceptInput(elapsedMs)) {
        throw new Error('Event telegraph must finish before launch input');
      }
      if (!signal || signal.qualifiedManual !== true) return cancelGesture(attemptId);
      var normalized = launchSignal(signal);
      var consumed = pending.controller.qualifyLaunch();
      pending.phase = 'airborne'; pending.eventSelection = consumed;
      pending.launch = freeze({
        schema: 'TrainingLaunchV1', attemptId: pending.attemptId, activityId: 'tutorial',
        flipperId: pending.flipperId,
        temporaryFlipper: pending.tutorialAttempt.temporaryObject === true,
        guidedAssist: pending.tutorialAttempt.guidedAssist === true,
        guidedAssistProfile: clone(pending.tutorialAttempt.guidedAssistProfile),
        viewportPreset: pending.viewportPreset, presentationRate: 1, simulationStepScale: 1,
        turnSeed: pending.turnSeed, seedSource: pending.seedSource,
        eventSelection: clone(consumed), launchSignal: normalized,
        replayOfAttemptId: null, isolation: isolation('tutorial'),
        testData: true, progressionEligible: false, fcEligible: false,
        achievementsEligible: false,
        statisticsDefaultEligible: false,
      });
      return pending.launch;
    }
    function resolveAttempt(attemptId, value) {
      if (!pending || pending.attemptId !== String(attemptId) || pending.phase !== 'airborne') {
        throw new Error('Tutorial attempt is not airborne');
      }
      var normalized = outcome(value);
      var tutorialOutcome = {
        phase: normalized.phase, result: normalized.result, pose: normalized.pose,
        qualifiedManual: pending.launch.launchSignal.qualifiedManual,
        normalizedPower: pending.launch.launchSignal.normalizedPower,
        normalizedDirection: pending.launch.launchSignal.normalizedDirection,
      };
      var result = Tutorial.resolveAttempt(state, pending.tutorialAttempt, tutorialOutcome);
      var resolution = freeze({
        schema: 'TutorialTrainingResolutionV1', attemptId: pending.attemptId,
        advanced: result.advanced, retry: result.retry, result: normalized.result,
        guidedAssist: pending.tutorialAttempt.guidedAssist === true,
        guidedCompletion: result.guidedCompletion === true,
        pose: normalized.pose, landingReason: landingReason(normalized.landingReason, normalized.result),
        eventId: pending.eventSelection ? pending.eventSelection.eventId : null,
        temporaryFlipper: pending.tutorialAttempt.temporaryObject === true,
        awards: [], progressionCommands: [], achievementCommands: [], ownershipCommands: [],
        testDataRecord: { schema: 'TrainingTestDataMarkerV1', activityId: 'tutorial',
          attemptId: pending.attemptId, testData: true, statisticsDefaultEligible: false },
        isolation: isolation('tutorial'), testData: true, progressionEligible: false,
        fcEligible: false,
        achievementsEligible: false, statisticsDefaultEligible: false,
      });
      state = result.state;
      history.push(resolution);
      totalResolved += 1;
      if (history.length > MAX_RESOLVED_ATTEMPTS) {
        history.shift(); evictedResolutions += 1;
      }
      pending.controller.clear(); pending = null;
      return freeze({ resolution: resolution, session: snapshot() });
    }
    function skip() {
      if (pending) { pending.controller.clear(); pending = null; }
      state = Tutorial.skip(state); skipped = true;
      return snapshot();
    }

    var request = createMatchRequest({
      matchId: sessionId, sessionId: sessionId, activityId: 'tutorial',
      roster: options.roster, seed: state.baseSeed,
    });
    return freeze({
      schema: 'FirstFlipTourRuntimeV1', request: request, snapshot: snapshot,
      acknowledge: acknowledge, prepareAttempt: prepareAttempt,
      eventPhase: eventPhase, cancelGesture: cancelGesture,
      qualifyLaunch: qualifyLaunch, resolveAttempt: resolveAttempt, skip: skip,
    });
  }

  return freeze({
    schema: 'FlipgameV112TrainingV1', VIEWPORT_PRESETS: VIEWPORT_PRESETS,
    SLOW_MOTION_RATES: SLOW_MOTION_RATES, FORCEABLE_EVENT_NAMES: FORCEABLE_EVENT_NAMES,
    MAX_RESOLVED_ATTEMPTS: MAX_RESOLVED_ATTEMPTS,
    MAX_TRAJECTORY_SAMPLES: MAX_TRAJECTORY_SAMPLES,
    MAX_SUCCESSFUL_GHOSTS: MAX_SUCCESSFUL_GHOSTS,
    featureState: featureState, hasPhysicsLabEntitlement: hasPhysicsLabEntitlement,
    authorizePhysicsLab: authorizePhysicsLab,
    createPhysicsLabProfileProvider: createPhysicsLabProfileProvider,
    isolation: isolation,
    createMatchRequest: createMatchRequest,
    registerActivities: registerActivities, launchSignal: launchSignal,
    outcome: outcome, landingReason: landingReason,
    createRuntime: createRuntime, createTutorialSession: createTutorialSession,
  });
});
