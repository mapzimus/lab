// v112-landing-verdict.js -- private physics-to-rules authority for ordinary flips.
// Browser status lives in the separate inert facade; this core is CommonJS-only.
(function (factory) {
  'use strict';
  var nodeModule = null;
  try {
    if (typeof process === 'object' && process !== null &&
        typeof process.getBuiltinModule === 'function') nodeModule = process.getBuiltinModule('module');
  } catch (_) { nodeModule = null; }
  var commonJs = typeof nodeModule === 'function' && nodeModule._cache &&
    typeof module === 'object' && module !== null &&
    module.constructor === nodeModule && Object.getPrototypeOf(module) === nodeModule.prototype &&
    nodeModule._cache[module.filename] === module &&
    Object.prototype.hasOwnProperty.call(module, 'exports') &&
    module.require === nodeModule.prototype.require && typeof module.filename === 'string' &&
    typeof process === 'object' && process !== null && process.release &&
    process.release.name === 'node' && process.versions &&
    typeof process.versions.node === 'string';
  if (!commonJs) {
    throw new Error('v112-landing-verdict.js is a private CommonJS core and cannot initialize as a classic script');
  }
  module.exports = factory(module.require('./v112-rules.js'));
})(function (Rules) {
  'use strict';

  var VERSION = 1;
  var SCHEMA = 'FlipgameV112LandingVerdictAuthorityV1';
  var VERDICT_SCHEMA = 'LandingVerdictV2';
  var ATTEMPT_SCHEMA = 'LandingAttemptV1';
  var ORDINARY_SETTLE_LIMIT_MS = 4000;
  var MIN_STABLE_MS = 80;
  var AIRBORNE_TIMEOUT_FRAME_LIMIT = 900;
  var MAX_ID_LENGTH = 128;
  var RESULT_FIELDS = Object.freeze([
    'result', 'pose', 'onCap', 'reason', 'atMs', 'stableForMs',
  ]);
  var ATTEMPTS = new WeakMap();
  var VERDICTS = new WeakMap();

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    var keys = Object.keys(value);
    for (var index = 0; index < keys.length; index += 1) freeze(value[keys[index]]);
    return Object.freeze(value);
  }

  // Snapshot own data descriptors into a null-prototype object. We never read
  // through caller-controlled objects after validation.
  function dataObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError(label + ' must be an exact plain data object');
    }
    var prototype;
    var names;
    var symbols;
    try {
      prototype = Object.getPrototypeOf(value);
      names = Object.getOwnPropertyNames(value);
      symbols = Object.getOwnPropertySymbols(value);
    } catch (_) { throw new TypeError(label + ' structure is unreadable'); }
    if (prototype !== null && prototype !== Object.prototype) {
      throw new TypeError(label + ' must not use a custom prototype');
    }
    if (symbols.length) throw new TypeError(label + ' cannot contain symbol fields');
    var clean = Object.create(null);
    for (var index = 0; index < names.length; index += 1) {
      var key = names[index];
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
        throw new TypeError(label + ' contains an unsafe field');
      }
      var descriptor;
      try { descriptor = Object.getOwnPropertyDescriptor(value, key); }
      catch (_) { throw new TypeError(label + '.' + key + ' is unreadable'); }
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        throw new TypeError(label + '.' + key + ' must be an own data field');
      }
      clean[key] = descriptor.value;
    }
    return clean;
  }

  function exactFields(value, allowed, label) {
    var source = dataObject(value, label);
    var names = Object.keys(source);
    for (var index = 0; index < names.length; index += 1) {
      var accepted = false;
      for (var offset = 0; offset < allowed.length; offset += 1) {
        if (names[index] === allowed[offset]) { accepted = true; break; }
      }
      if (!accepted) throw new TypeError(label + ' contains unsupported field: ' + names[index]);
    }
    return source;
  }

  function exactArray(value, label, minimum, maximum) {
    if (!Array.isArray(value)) throw new TypeError(label + ' must be an exact array');
    var prototype;
    var names;
    var symbols;
    try {
      prototype = Object.getPrototypeOf(value);
      names = Object.getOwnPropertyNames(value);
      symbols = Object.getOwnPropertySymbols(value);
    } catch (_) { throw new TypeError(label + ' structure is unreadable'); }
    if (prototype !== Array.prototype) throw new TypeError(label + ' has an altered array prototype');
    if (symbols.length) throw new TypeError(label + ' cannot contain symbol fields');
    var lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (!lengthDescriptor || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value') ||
        typeof lengthDescriptor.value !== 'number' || !Number.isSafeInteger(lengthDescriptor.value) ||
        lengthDescriptor.value < minimum || lengthDescriptor.value > maximum) {
      throw new RangeError(label + ' requires between ' + minimum + ' and ' + maximum + ' items');
    }
    var length = lengthDescriptor.value;
    if (names.length !== length + 1) throw new TypeError(label + ' must be dense and data-only');
    var clean = new Array(length);
    for (var index = 0; index < length; index += 1) {
      if (names[index] !== String(index)) {
        throw new TypeError(label + ' must not contain sparse or named fields');
      }
      var descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        throw new TypeError(label + ' items must be own data fields');
      }
      clean[index] = descriptor.value;
    }
    if (names[length] !== 'length') throw new TypeError(label + ' has invalid array fields');
    return clean;
  }

  function id(value, label) {
    if (typeof value !== 'string') throw new TypeError(label + ' must be a string primitive');
    var text = value.trim();
    if (!text) throw new TypeError(label + ' is required');
    if (text.length > MAX_ID_LENGTH) throw new RangeError(label + ' is too long');
    if (/[^\x20-\x7e]/.test(text)) throw new TypeError(label + ' contains unsupported characters');
    return text;
  }

  function time(value, label) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(label + ' must be a non-negative safe integer');
    }
    return value;
  }

  function settleLimit(value) {
    if (value == null || value === ORDINARY_SETTLE_LIMIT_MS) return ORDINARY_SETTLE_LIMIT_MS;
    throw new RangeError('ordinary event-free landings require exactly a 4000 ms settle limit');
  }

  function sameIdentity(left, right) {
    return !!left && !!right && left.schema === right.schema && left.id === right.id &&
      left.namespace === right.namespace && left.ordinal === right.ordinal &&
      left.token === right.token && left.callerId === right.callerId;
  }

  function currentRulesSnapshot(record) {
    var state = record.rulesBridge.inspect(record.claimantProof);
    if (!state || typeof state !== 'object' || state.matchId !== record.matchId) {
      throw new Error('Rules connector changed the immutable match identity');
    }
    if (state.phase !== 'active' && state.phase !== 'heat' && state.phase !== 'shootout') {
      throw new Error('Rules match is not accepting an ordinary landing');
    }
    return state;
  }

  function expectedPlayer(state) {
    if (!state.turn || typeof state.turn.current !== 'string' || !state.turn.current) {
      throw new Error('Rules state has no current player for an ordinary landing');
    }
    return state.turn.current;
  }

  function attemptRecord(handle, lane, label) {
    if (!handle || (typeof handle !== 'object' && typeof handle !== 'function')) {
      throw new TypeError(label + ' requires a physics-issued landing attempt');
    }
    var attempt = ATTEMPTS.get(handle);
    if (!attempt || attempt.lane !== lane) {
      throw new TypeError(label + ' requires this lane\'s exact physics-issued attempt');
    }
    return attempt;
  }

  function assertActive(attempt, label) {
    if (attempt.status === 'aborted') throw new Error(label + ' cannot use an aborted attempt');
    if (attempt.status !== 'active') throw new Error(label + ' cannot reuse an issued landing attempt');
  }

  function landingData(value, timedOut) {
    var source = exactFields(value, RESULT_FIELDS, 'settled landing');
    if (source.result != null && typeof source.result !== 'string') {
      throw new TypeError('Settled landing result must be a string primitive');
    }
    if (source.pose != null && typeof source.pose !== 'string') {
      throw new TypeError('Settled landing pose must be a string primitive');
    }
    if (source.reason != null && typeof source.reason !== 'string') {
      throw new TypeError('Settled landing reason must be a string primitive');
    }
    if (source.onCap != null && typeof source.onCap !== 'boolean') {
      throw new TypeError('Settled landing onCap must be a boolean primitive');
    }
    var rawResult = source.result == null ? '' : source.result.toUpperCase();
    var pose = source.pose == null ? '' : source.pose.toLowerCase();
    if (source.onCap === true) pose = 'cap';
    if (timedOut) {
      if (rawResult && rawResult !== 'MISS') throw new Error('A timed-out landing must be a miss');
      rawResult = 'MISS';
      pose = 'miss';
    } else {
      if (rawResult !== 'MAKE' && rawResult !== 'MISS') {
        throw new RangeError('Settled landing result must be MAKE or MISS');
      }
      if (rawResult === 'MISS') pose = 'miss';
      else pose = pose === 'cap' ? 'cap' : 'upright';
    }
    return freeze({ result: rawResult, pose: pose, onCap: pose === 'cap',
      reason: source.reason == null ? (timedOut ? 'settle-timeout' : null)
        : source.reason.trim().slice(0, 160) });
  }

  function makeVerdict(attempt, input, timedOut) {
    assertActive(attempt, 'Landing verdict issuance');
    if (attempt.phase !== 'settling') {
      throw new Error('Landing verdict requires the contact and settling state machine');
    }
    var source = exactFields(input, RESULT_FIELDS, 'settled landing');
    var atMs = time(source.atMs, 'settled landing atMs');
    if (atMs <= attempt.lastObservedAtMs) {
      throw new Error('Landing verdict cannot resolve on the first settling frame');
    }
    var stableForMs = source.stableForMs == null ? 0 : time(source.stableForMs, 'stableForMs');
    if (timedOut) {
      if (atMs - attempt.firstContactAtMs < ORDINARY_SETTLE_LIMIT_MS) {
        throw new Error('Landing timeout cannot resolve before the 4000 ms settle limit');
      }
    } else {
      var stableWindowStart = atMs - stableForMs;
      if (stableForMs < MIN_STABLE_MS || stableWindowStart < attempt.settlingAtMs ||
          stableWindowStart < attempt.lastContactAtMs) {
        throw new Error('Stable landing requires a final measured 80 ms window after recontact');
      }
      if (atMs - attempt.firstContactAtMs >= ORDINARY_SETTLE_LIMIT_MS) {
        throw new Error('Stable landing passed its settle limit and must use the timeout path');
      }
    }
    var landing = landingData(source, timedOut);
    var handle = freeze({
      schema: VERDICT_SCHEMA, version: VERSION, matchId: attempt.authority.matchId,
      laneId: attempt.lane.laneId, flipId: attempt.flipId, playerId: attempt.playerId,
      phase: 'resolved', result: landing.result, pose: landing.pose, onCap: landing.onCap,
      reason: landing.reason,
      firstContactMs: attempt.firstContactAtMs - attempt.launchedAtMs,
      settleMs: atMs - attempt.firstContactAtMs,
      finalSettleMs: atMs - attempt.lastContactAtMs,
      settleLimitMs: ORDINARY_SETTLE_LIMIT_MS, contacts: attempt.contactCount,
      timedOut: timedOut,
    });
    attempt.status = 'issued';
    attempt.phase = 'resolved';
    attempt.verdict = handle;
    VERDICTS.set(handle, { attempt: attempt, authority: attempt.authority, lane: attempt.lane,
      resolutionIdentity: attempt.resolutionIdentity, landing: landing, status: 'issued' });
    return handle;
  }

  // The real engine has an absolute first-contact deadline with a final
  // on-plane pose check. This is distinct from a true timeout/missing landing.
  // No tilt threshold or rotation tolerance is recomputed by this authority.
  function makeDeadlineVerdict(attempt, input) {
    assertActive(attempt, 'Landing deadline issuance');
    var source = exactFields(input, ['result', 'pose', 'reason', 'atMs', 'evidence'],
      'landing deadline');
    var atMs = time(source.atMs, 'landing deadline atMs');
    if (attempt.firstContactAtMs == null ||
        atMs - attempt.firstContactAtMs < ORDINARY_SETTLE_LIMIT_MS) {
      throw new Error('Landing deadline requires a real first contact and its full 4000 ms allowance');
    }
    if (atMs < attempt.lastObservedAtMs) throw new Error('Landing deadline observation is stale');
    var evidence = exactFields(source.evidence,
      ['schema', 'onLandingPlane', 'rotationComplete'], 'landing deadline evidence');
    if (evidence.schema !== 'LandingDeadlineEvidenceV1' ||
        typeof evidence.onLandingPlane !== 'boolean' ||
        typeof evidence.rotationComplete !== 'boolean') {
      throw new TypeError('Landing deadline requires exact measured plane and rotation evidence');
    }
    if (source.result !== 'MAKE' && source.result !== 'MISS') {
      throw new TypeError('Landing deadline requires an explicit MAKE or MISS');
    }
    if (source.result === 'MAKE' && (!evidence.onLandingPlane || !evidence.rotationComplete ||
        (source.pose !== 'upright' && source.pose !== 'cap'))) {
      throw new Error('Landing deadline MAKE requires on-plane completed rotation and explicit upright/cap pose');
    }
    if (source.result === 'MISS' && source.pose !== 'miss') {
      throw new Error('Landing deadline MISS requires an explicit miss pose');
    }
    var landing = landingData({ result: source.result, pose: source.pose,
      reason: source.reason, atMs: atMs }, false);
    var handle = freeze({
      schema: VERDICT_SCHEMA, version: VERSION, matchId: attempt.authority.matchId,
      laneId: attempt.lane.laneId, flipId: attempt.flipId, playerId: attempt.playerId,
      phase: 'resolved', result: landing.result, pose: landing.pose, onCap: landing.onCap,
      reason: landing.reason,
      firstContactMs: attempt.firstContactAtMs - attempt.launchedAtMs,
      settleMs: atMs - attempt.firstContactAtMs,
      finalSettleMs: atMs - attempt.lastContactAtMs,
      settleLimitMs: ORDINARY_SETTLE_LIMIT_MS, contacts: attempt.contactCount,
      timedOut: false, deadlineReached: true,
      deadlineEvidence: { schema: evidence.schema, onLandingPlane: evidence.onLandingPlane,
        rotationComplete: evidence.rotationComplete },
    });
    attempt.status = 'issued'; attempt.phase = 'resolved'; attempt.verdict = handle;
    VERDICTS.set(handle, { attempt: attempt, authority: attempt.authority, lane: attempt.lane,
      resolutionIdentity: attempt.resolutionIdentity, landing: landing, status: 'issued' });
    return handle;
  }

  function createPhysicsLane(record, lane) {
    return Object.freeze({
      schema: 'LandingPhysicsLaneAuthorityV1', matchId: record.matchId, laneId: lane.laneId,
      beginFlip: function (value) {
        var source = exactFields(value,
          ['flipId', 'playerId', 'launchedAtMs', 'settleLimitMs', 'eventId'],
          'ordinary landing attempt');
        if (source.eventId != null) {
          throw new Error('Event landings must use the separate branded event authority');
        }
        if (lane.active && lane.active.status !== 'consumed' && lane.active.status !== 'aborted') {
          throw new Error('Landing lane already has an unresolved attempt');
        }
        var state = currentRulesSnapshot(record);
        var playerId = id(source.playerId == null ? expectedPlayer(state) : source.playerId,
          'playerId');
        if (playerId !== expectedPlayer(state)) throw new Error('Landing attempt is for the wrong current player');
        var flipId = id(source.flipId, 'flipId');
        if (record.flipIds.has(flipId)) throw new Error('flipId was already used in this match');
        var resolutionIdentity = record.rulesBridge.nextResolutionIdentity(record.claimantProof, flipId);
        if (!resolutionIdentity || resolutionIdentity.callerId !== flipId) {
          throw new Error('Rules connector did not bind the exact flip identity');
        }
        var launchedAtMs = time(source.launchedAtMs, 'launchedAtMs');
        settleLimit(source.settleLimitMs);
        var handle = freeze({ schema: ATTEMPT_SCHEMA, version: VERSION,
          matchId: record.matchId, laneId: lane.laneId, flipId: flipId, playerId: playerId });
        var attempt = { authority: record, lane: lane, flipId: flipId, playerId: playerId,
          launchedAtMs: launchedAtMs, resolutionIdentity: resolutionIdentity,
          phase: 'airborne', status: 'active', lastObservedAtMs: launchedAtMs,
          firstContactAtMs: null, lastContactAtMs: null, settlingAtMs: null,
          contactCount: 0, verdict: null };
        record.flipIds.add(flipId);
        lane.active = attempt;
        ATTEMPTS.set(handle, attempt);
        return handle;
      },
      markContact: function (handle, atMs) {
        var attempt = attemptRecord(handle, lane, 'Landing contact');
        assertActive(attempt, 'Landing contact');
        if (attempt.phase !== 'airborne') throw new Error('Landing contact requires an airborne attempt');
        var timestamp = time(atMs, 'contact atMs');
        if (timestamp <= attempt.lastObservedAtMs) throw new Error('Landing contact must follow airborne motion');
        if (attempt.firstContactAtMs == null) attempt.firstContactAtMs = timestamp;
        attempt.lastContactAtMs = timestamp;
        attempt.settlingAtMs = null;
        attempt.contactCount += 1;
        attempt.phase = 'contact';
        attempt.lastObservedAtMs = timestamp;
        return freeze({ phase: 'contact', atMs: timestamp, contacts: attempt.contactCount });
      },
      markAirborne: function (handle, atMs) {
        var attempt = attemptRecord(handle, lane, 'Landing separation');
        assertActive(attempt, 'Landing separation');
        if (attempt.phase !== 'contact' && attempt.phase !== 'settling') {
          throw new Error('Landing separation requires contact or settling');
        }
        var timestamp = time(atMs, 'separation atMs');
        if (timestamp <= attempt.lastObservedAtMs) throw new Error('Landing separation time must advance');
        attempt.phase = 'airborne';
        attempt.settlingAtMs = null;
        attempt.lastObservedAtMs = timestamp;
        return freeze({ phase: 'airborne', atMs: timestamp });
      },
      markSettling: function (handle, atMs) {
        var attempt = attemptRecord(handle, lane, 'Landing settling');
        assertActive(attempt, 'Landing settling');
        if (attempt.phase !== 'contact') throw new Error('Landing settling requires the latest contact');
        var timestamp = time(atMs, 'settling atMs');
        if (timestamp <= attempt.lastObservedAtMs) {
          throw new Error('Landing settling cannot begin on the latest contact frame');
        }
        attempt.settlingAtMs = timestamp;
        attempt.phase = 'settling';
        attempt.lastObservedAtMs = timestamp;
        return freeze({ phase: 'settling', atMs: timestamp });
      },
      issueSettledVerdict: function (handle, input) {
        return makeVerdict(attemptRecord(handle, lane, 'Settled landing'), input, false);
      },
      issueTimeoutVerdict: function (handle, input) {
        return makeVerdict(attemptRecord(handle, lane, 'Landing timeout'), input, true);
      },
      issueDeadlineVerdict: function (handle, input) {
        return makeDeadlineVerdict(attemptRecord(handle, lane, 'Landing deadline'), input);
      },
      issueAirborneTerminalVerdict: function (handle, input) {
        return makeAirborneTerminalVerdict(attemptRecord(handle, lane, 'Airborne terminal'), input);
      },
      abort: function (handle, reason) {
        var attempt = attemptRecord(handle, lane, 'Landing abort');
        assertActive(attempt, 'Landing abort');
        if (reason != null && typeof reason !== 'string') {
          throw new TypeError('Landing abort reason must be a string primitive');
        }
        attempt.status = 'aborted';
        attempt.phase = 'aborted';
        return freeze({ schema: 'LandingAttemptAbortV1', matchId: record.matchId,
          laneId: lane.laneId, flipId: attempt.flipId,
          reason: reason == null ? 'aborted' : reason.trim().slice(0, 160) });
      },
    });
  }

  function makeAirborneTerminalVerdict(attempt, input) {
    assertActive(attempt, 'Airborne terminal issuance');
    if (attempt.phase !== 'airborne' || attempt.firstContactAtMs != null || attempt.contactCount !== 0) {
      throw new Error('Airborne terminal requires an attempt with no prior scoring contact');
    }
    var source = exactFields(input, ['result', 'pose', 'reason', 'atMs', 'evidence'],
      'airborne terminal');
    if (source.result !== 'MISS' || source.pose !== 'miss' || source.reason !== 'timeout') {
      throw new Error('Airborne terminal can only issue the engine flight-timeout MISS');
    }
    var evidence = exactFields(source.evidence,
      ['schema', 'kind', 'wasAirborne', 'flightFrames', 'limitFrames'], 'airborne terminal evidence');
    if (evidence.schema !== 'LandingAirborneTerminalEvidenceV1' ||
        evidence.kind !== 'absolute-flight-timeout' || evidence.wasAirborne !== true ||
        evidence.limitFrames !== AIRBORNE_TIMEOUT_FRAME_LIMIT ||
        !Number.isSafeInteger(evidence.flightFrames) ||
        evidence.flightFrames <= AIRBORNE_TIMEOUT_FRAME_LIMIT || evidence.flightFrames > 1000000) {
      throw new Error('Airborne terminal requires measured flight frames beyond the strict 900-frame engine boundary');
    }
    var atMs = time(source.atMs, 'airborne terminal atMs');
    // The engine accumulates 1/60 second fixed steps in floating point; the
    // bridge records integer milliseconds. Permit that one-ms quantization.
    if (atMs <= attempt.lastObservedAtMs ||
        atMs - attempt.launchedAtMs + 1 < Math.floor(evidence.flightFrames * (1000 / 60))) {
      throw new Error('Airborne terminal time contradicts its measured simulation frames');
    }
    var landing = landingData({ result: 'MISS', pose: 'miss', reason: 'timeout', atMs: atMs }, true);
    var handle = freeze({
      schema: VERDICT_SCHEMA, version: VERSION, matchId: attempt.authority.matchId,
      laneId: attempt.lane.laneId, flipId: attempt.flipId, playerId: attempt.playerId,
      phase: 'resolved', result: 'MISS', pose: 'miss', onCap: false, reason: 'timeout',
      firstContactMs: null, settleMs: null, finalSettleMs: null,
      settleLimitMs: ORDINARY_SETTLE_LIMIT_MS, contacts: 0,
      timedOut: true, airborneTerminal: true,
      terminalEvidence: { schema: evidence.schema, kind: evidence.kind,
        wasAirborne: true, flightFrames: evidence.flightFrames, limitFrames: evidence.limitFrames },
    });
    attempt.status = 'issued'; attempt.phase = 'resolved'; attempt.verdict = handle;
    VERDICTS.set(handle, { attempt: attempt, authority: attempt.authority, lane: attempt.lane,
      resolutionIdentity: attempt.resolutionIdentity, landing: landing, status: 'issued' });
    return handle;
  }

  function createRulesLane(record, lane) {
    return Object.freeze({
      schema: 'LandingRulesLaneAuthorityV1', matchId: record.matchId, laneId: lane.laneId,
      resolve: function (verdict) {
        if (!verdict || (typeof verdict !== 'object' && typeof verdict !== 'function')) {
          throw new TypeError('Rules resolution requires a physics-issued LandingVerdict');
        }
        var issued = VERDICTS.get(verdict);
        if (!issued) throw new TypeError('Rules resolution requires the exact physics-issued LandingVerdict');
        if (issued.authority !== record) throw new Error('LandingVerdict belongs to a different match');
        if (issued.lane !== lane) throw new Error('LandingVerdict belongs to a different lane');
        if (issued.status !== 'issued') throw new Error('LandingVerdict has already been consumed');
        var state = currentRulesSnapshot(record);
        if (expectedPlayer(state) !== issued.attempt.playerId) {
          throw new Error('LandingVerdict is stale for the current player');
        }
        var expected = record.rulesBridge.nextResolutionIdentity(record.claimantProof,
          issued.attempt.flipId);
        if (!sameIdentity(expected, issued.resolutionIdentity)) {
          throw new Error('LandingVerdict is stale or future relative to the rules high-water mark');
        }
        issued.status = 'consuming';
        issued.attempt.status = 'consuming';
        var transition;
        try {
          transition = record.rulesBridge.resolve(record.claimantProof, {
            resolutionIdentity: issued.resolutionIdentity, flipId: issued.attempt.flipId,
            playerId: issued.attempt.playerId, result: issued.landing.result,
            pose: issued.landing.pose, onCap: issued.landing.onCap,
            reason: issued.landing.reason,
          });
        } catch (error) {
          issued.status = 'spent-error';
          issued.attempt.status = 'spent-error';
          throw error;
        }
        if (!transition || !transition.state || !transition.outcome ||
            transition.state.matchId !== record.matchId ||
            transition.outcome.matchId !== record.matchId ||
            transition.outcome.playerId !== issued.attempt.playerId ||
            !sameIdentity(transition.outcome.resolutionIdentity, issued.resolutionIdentity)) {
          issued.status = 'spent-error';
          issued.attempt.status = 'spent-error';
          throw new Error('Rules transition did not preserve the LandingVerdict identity');
        }
        issued.status = 'consumed';
        issued.attempt.status = 'consumed';
        return transition;
      },
    });
  }

  function createAuthority(options) {
    var source = exactFields(options, ['matchId', 'rulesConnector', 'laneIds'],
      'landing verdict authority');
    var matchId = id(source.matchId, 'matchId');
    var laneIds = exactArray(source.laneIds, 'landing verdict authority laneIds', 1, 4);
    var claimantProof = Object.freeze({});
    var rulesBridge = Rules.claimLandingMatchConnector(source.rulesConnector, claimantProof);
    if (!rulesBridge || rulesBridge.schema !== 'RulesLandingBridgeV1' ||
        typeof rulesBridge.inspect !== 'function' ||
        typeof rulesBridge.nextResolutionIdentity !== 'function' ||
        typeof rulesBridge.resolve !== 'function' || !Object.isFrozen(rulesBridge)) {
      throw new Error('Rules did not issue the exact landing bridge');
    }
    var initial = rulesBridge.inspect(claimantProof);
    if (!initial || initial.matchId !== matchId) {
      throw new Error('Rules connector matchId does not match LandingVerdict authority');
    }
    var lanes = new Map();
    for (var index = 0; index < laneIds.length; index += 1) {
      var laneId = id(laneIds[index], 'laneId');
      if (lanes.has(laneId)) throw new Error('Duplicate landing laneId: ' + laneId);
      lanes.set(laneId, { laneId: laneId, physicsClaimed: false, rulesClaimed: false,
        active: null });
    }
    var record = { matchId: matchId, rulesBridge: rulesBridge,
      claimantProof: claimantProof, lanes: lanes, flipIds: new Set() };
    var laneIdSnapshot = new Array(laneIds.length);
    for (var copyIndex = 0; copyIndex < laneIds.length; copyIndex += 1) {
      laneIdSnapshot[copyIndex] = laneIds[copyIndex];
    }
    return Object.freeze({
      schema: SCHEMA, version: VERSION, matchId: matchId,
      laneIds: Object.freeze(laneIdSnapshot),
      claimPhysicsLane: function (value) {
        var lane = lanes.get(id(value, 'laneId'));
        if (!lane) throw new Error('Unknown landing lane');
        if (lane.physicsClaimed) throw new Error('Physics authority for this lane was already claimed');
        lane.physicsClaimed = true;
        return createPhysicsLane(record, lane);
      },
      claimRulesLane: function (value) {
        var lane = lanes.get(id(value, 'laneId'));
        if (!lane) throw new Error('Unknown landing lane');
        if (lane.rulesClaimed) throw new Error('Rules authority for this lane was already claimed');
        lane.rulesClaimed = true;
        return createRulesLane(record, lane);
      },
    });
  }

  return freeze({
    schema: SCHEMA, version: VERSION, VERDICT_SCHEMA: VERDICT_SCHEMA,
    ATTEMPT_SCHEMA: ATTEMPT_SCHEMA,
    ORDINARY_SETTLE_LIMIT_MS: ORDINARY_SETTLE_LIMIT_MS,
    MIN_STABLE_MS: MIN_STABLE_MS, createAuthority: createAuthority,
  });
});
