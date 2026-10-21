// v112-battle-runtime.js -- executable simultaneous-lane Battle coordinator.
//
// Lane adapter contract:
//   laneAdapterFactory({ laneId, resources, contract }) must return
//   { resources, launch(context), ...optional hooks } and must use only the
//   supplied lane-local body/camera/audio/event state. Returning any other
//   resources object is rejected. Cross-lane bodies, cameras, audio buses,
//   event controllers, collisions, and ordinary/terminal events are forbidden.
(function (root, factory) {
  'use strict';
  var Activity = root && root.FlipgameV112Activity;
  var Battle = root && root.FlipgameV112Battle;
  var MultiPointer = root && root.FlipgameV112MultiPointer;
  if (typeof module === 'object' && module.exports) {
    Activity = require('./v112-activity.js');
    Battle = require('./v112-battle.js');
    MultiPointer = require('./v112-multipointer.js');
  }
  var api = factory(Activity, Battle, MultiPointer);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112BattleRuntime = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Activity, Battle, MultiPointer) {
  'use strict';

  if (!Activity || typeof Activity.createLaneRuntime !== 'function') {
    throw new Error('FlipgameV112Activity must load before v112-battle-runtime.js');
  }
  if (!Battle || typeof Battle.createState !== 'function') {
    throw new Error('FlipgameV112Battle must load before v112-battle-runtime.js');
  }
  if (!MultiPointer || typeof MultiPointer.createMultiPointerRouter !== 'function') {
    throw new Error('FlipgameV112MultiPointer must load before v112-battle-runtime.js');
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
  function boundedRuntimeId(value, label, maximum) {
    if (typeof value !== 'string') throw new TypeError(label + ' must be a string');
    var text = required(value, label);
    if (text !== value) throw new TypeError(label + ' must already be canonical');
    if (text.length > maximum) throw new RangeError(label + ' exceeds ' + maximum + ' characters');
    for (var index = 0; index < text.length; index++) {
      var code = text.charCodeAt(index);
      if (code < 32 || code === 127) throw new TypeError(label + ' contains control characters');
    }
    return text;
  }
  function finite(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }
  function unique(values) { return Array.from(new Set(values)); }

  var POWER_EVENT_IDS = freeze([
    'magnet', 'heart-rush', 'power-launch', 'moon-gravity', 'bouncy-bottle',
    'wind-tunnel', 'trampoline', 'ice-slide', 'earthquake', 'gravity-slam', 'fizz-jet',
  ]);
  var TERMINAL_EVENT_IDS = freeze([
    'plinko', 'roulette-table', 'life-drain', 'mirror-match', 'cap-toss',
    'double-flip', 'rewind', 'mitosis', 'ceiling-flip', 'alien-invasion',
  ]);
  var ADAPTER_CONTRACT = freeze({
    schema: 'BattleLaneAdapterContractV1',
    ordinaryEventsEnabled: false,
    terminalEventsAllowed: false,
    crossLaneCollisions: false,
    requiredResourceKeys: ['bodyState', 'cameraState', 'audioState', 'eventState'],
    powerEventIds: POWER_EVENT_IDS,
  });

  var REFERENCE_WIDTH = 1280;
  var REFERENCE_HEIGHT = 720;
  var MIN_CANONICAL_DRAG = 22;

  function normalizeRects(values) {
    var entries = Array.isArray(values) ? values.map(function (entry) {
      var source = object(entry);
      return [source.laneId != null ? source.laneId : source.id, source.rect || source];
    }) : Object.keys(object(values)).map(function (laneId) { return [laneId, values[laneId]]; });
    if (!entries.length) throw new TypeError('Battle runtime requires lane rectangles');
    var laneIds = new Set();
    return entries.map(function (entry) {
      var laneId = boundedRuntimeId(entry[0], 'laneId', 128);
      if (laneIds.has(laneId)) throw new TypeError('Duplicate Battle laneId: ' + laneId);
      laneIds.add(laneId);
      var rect = object(entry[1]);
      var left = finite(rect.left, 0);
      var top = finite(rect.top, 0);
      var width = finite(rect.width, finite(rect.right, 0) - left);
      var height = finite(rect.height, finite(rect.bottom, 0) - top);
      if (!(width > 0) || !(height > 0)) throw new TypeError('Invalid rectangle for ' + laneId);
      return freeze({ laneId: laneId, left: left, top: top, width: width, height: height,
        right: left + width, bottom: top + height });
    });
  }

  function defaultQualifier(gesture) {
    var samples = gesture.samples || [];
    if (samples.length < 2) return freeze({ qualified: false, reason: 'not-enough-samples' });
    var geometry = object(gesture.geometry);
    var width = Math.max(1, finite(geometry.width, REFERENCE_WIDTH));
    var height = Math.max(1, finite(geometry.height, REFERENCE_HEIGHT));
    var first = samples[0];
    var lastX = finite(first.x, 0);
    var lastY = finite(first.y, 0);
    var currentX = lastX;
    var currentY = lastY;
    var firstTime = Math.max(0, finite(first.timeStamp, 0));
    var lastTime = firstTime;
    var peakSpeed = 0;
    var peakVx = 0;
    var peakVy = 0;
    for (var index = 1; index < samples.length; index++) {
      var sample = samples[index];
      var nextX = finite(sample.x, NaN);
      var nextY = finite(sample.y, NaN);
      var nextTime = finite(sample.timeStamp, lastTime);
      if (!Number.isFinite(nextX) || !Number.isFinite(nextY) || nextTime < lastTime) continue;
      if (nextTime === lastTime) {
        // Quantized timestamps preserve the path endpoint but cannot provide a
        // trustworthy instantaneous velocity. Core Input uses the same rule.
        currentX = nextX;
        currentY = nextY;
        lastX = nextX;
        lastY = nextY;
        continue;
      }
      var dt = Math.max((nextTime - lastTime) / 1000, 0.001);
      var canonicalStepX = (nextX - lastX) * REFERENCE_WIDTH / width;
      var canonicalStepY = (nextY - lastY) * REFERENCE_HEIGHT / height;
      var instantVx = canonicalStepX / dt;
      var instantVy = canonicalStepY / dt;
      var speed = Math.hypot(instantVx, instantVy);
      if (speed > peakSpeed) {
        peakSpeed = speed;
        peakVx = instantVx;
        peakVy = instantVy;
      }
      currentX = nextX;
      currentY = nextY;
      lastX = nextX;
      lastY = nextY;
      lastTime = Math.max(lastTime, nextTime);
    }
    var canonicalDx = (currentX - finite(first.x, 0)) * REFERENCE_WIDTH / width;
    var canonicalDy = (currentY - finite(first.y, 0)) * REFERENCE_HEIGHT / height;
    var canonicalDistance = Math.hypot(canonicalDx, canonicalDy);
    var usePeak = peakSpeed >= 80;
    var signalVx = usePeak ? peakVx : canonicalDx * 10;
    var signalVy = usePeak ? peakVy : canonicalDy * 10;
    var qualified = canonicalDistance + 1e-6 >= MIN_CANONICAL_DRAG;
    return freeze({ qualified: qualified, reason: qualified ? null : 'gesture-too-small',
      launchSignal: { dx: canonicalDx, dy: canonicalDy,
        rawDx: currentX - finite(first.x, 0), rawDy: currentY - finite(first.y, 0),
        canonicalDistance: canonicalDistance, elapsedMs: Math.max(0, lastTime - firstTime),
        vx: signalVx, vy: signalVy, peakSpeed: peakSpeed,
        usedDistanceFallback: !usePeak,
        normalizedDx: canonicalDx / REFERENCE_WIDTH,
        normalizedDy: canonicalDy / REFERENCE_HEIGHT } });
  }

  function createBattleRuntime(options) {
    var opts = object(options);
    var matchId = required(opts.matchId, 'matchId');
    var suppliedConfig = clone(object(opts.config));
    if (suppliedConfig.matchId != null && String(suppliedConfig.matchId).trim() !== matchId) {
      throw new RangeError('Battle runtime matchId contradicts its supplied config');
    }
    if (suppliedConfig.schema === 'BattleConfigV1') {
      Battle.validateBattleConfig(suppliedConfig);
      if (suppliedConfig.matchId !== matchId) {
        throw new RangeError('Battle runtime matchId contradicts its BattleConfigV1');
      }
    }
    suppliedConfig.matchId = matchId;
    var config = Battle.normalizeConfig(suppliedConfig);
    if (config.normalEventsEnabled !== false || config.crossLaneCollisions !== false) {
      throw new Error('Battle config must disable ordinary events and cross-lane collisions');
    }
    var rects = normalizeRects(opts.laneRects || opts.lanes);
    var maximumUsefulLanes = config.formatId === 'duel' ? 2 : 4;
    var physicalLaneCount = Math.min(config.hardware.activeLaneLimit, maximumUsefulLanes);
    if (rects.length < physicalLaneCount) {
      throw new TypeError('Not enough physical lanes for the verified hardware profile');
    }
    rects = rects.slice(0, physicalLaneCount);
    var rectByLane = new Map(rects.map(function (rect) { return [rect.laneId, rect]; }));
    var now = typeof opts.now === 'function' ? opts.now
      : (typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? function () { return performance.now(); } : function () { return Date.now(); });
    // inputNow must share the DOM PointerEvent.timeStamp clock domain. Keeping
    // it distinct from render/telemetry time makes the horn classification
    // independent of a delayed animation tick.
    var inputNow = typeof opts.inputNow === 'function' ? opts.inputNow : now;
    var qualifier = typeof opts.qualifyGesture === 'function' ? opts.qualifyGesture : defaultQualifier;
    var adapterFactory = opts.laneAdapterFactory;
    if (typeof adapterFactory !== 'function') throw new TypeError('laneAdapterFactory is required');
    var onAssignment = typeof opts.onAssignment === 'function' ? opts.onAssignment : function () {};
    var onPowerOffer = typeof opts.onPowerOffer === 'function' ? opts.onPowerOffer : function () {};
    var onRelay = typeof opts.onRelay === 'function' ? opts.onRelay : function () {};
    var onError = typeof opts.onError === 'function' ? opts.onError : function () {};
    var inputDeliveryGraceMs = Math.max(16, Math.min(250,
      finite(opts.inputDeliveryGraceMs, 120)));

    var battleState = Battle.createState(config);
    var lanes = [];
    var gates = new Map();
    var pendingPowers = new Map();
    var adapterResources = new WeakSet();
    var gateSequence = 0;
    var assignmentEpoch = 0;
    var wallElapsedMs = 0;
    var hornExpired = false;
    var heatStartedAt = null;
    var heatDeadlineAt = null;
    var hornGraceDeadlineAt = null;
    var clockCursorAt = null;
    var lastInputNowAt = null;
    var runtimeErrors = [];
    var destroyed = false;

    function errorRecord(error, context) {
      var source = object(context);
      return freeze({ phase: String(source.phase || 'runtime'),
        laneId: source.laneId == null ? null : String(source.laneId),
        attemptId: source.attemptId == null ? null : String(source.attemptId),
        message: String(error && error.message || error || 'Unknown Battle runtime error') });
    }

    function reportError(error, context) {
      var record = errorRecord(error, context);
      runtimeErrors.push(record);
      try { onError(error, record); } catch (callbackError) {
        runtimeErrors.push(errorRecord(callbackError, { phase: 'onError-callback',
          laneId: record.laneId, attemptId: record.attemptId }));
      }
      return record;
    }

    function flushErrors(values) {
      (values || []).forEach(function (entry) { reportError(entry.error, entry.context); });
    }

    function createResources(laneId) {
      var resources = Object.freeze({
        laneId: laneId,
        bodyState: {},
        cameraState: {},
        audioState: {},
        eventState: {},
      });
      ADAPTER_CONTRACT.requiredResourceKeys.forEach(function (key) {
        if (adapterResources.has(resources[key])) {
          throw new Error('Lane adapters cannot share ' + key);
        }
        adapterResources.add(resources[key]);
      });
      return resources;
    }

    rects.forEach(function (rect, index) {
      var resources = createResources(rect.laneId);
      var adapter = adapterFactory(Object.freeze({ laneId: rect.laneId,
        laneIndex: index, resources: resources, contract: ADAPTER_CONTRACT }));
      if (!adapter || typeof adapter !== 'object' || typeof adapter.launch !== 'function') {
        throw new TypeError('Lane adapter ' + rect.laneId + ' must provide launch()');
      }
      if (adapter.resources !== resources) {
        throw new Error('Lane adapter ' + rect.laneId + ' must expose its supplied isolated resources');
      }
      lanes.push({ id: rect.laneId, index: index, resources: resources, adapter: adapter,
        playerId: null, control: Activity.createLaneRuntime({ laneId: rect.laneId, state: 'disabled' }),
        prepared: null, inflight: null, lockedPowers: [], lastResult: null,
        aimAssignmentEpoch: null, attemptSequence: 0 });
    });

    function player(playerId) {
      return config.players.find(function (entry) { return entry.id === playerId; }) || null;
    }

    function competitorKey(playerId) {
      var entry = player(playerId);
      if (!entry) throw new TypeError('Unknown Battle player: ' + playerId);
      return (config.formatId === 'doubles' || config.formatId === 'team')
        ? entry.teamId : entry.id;
    }

    function isCpu(playerId) {
      var entry = player(playerId);
      return !!(entry && (entry.cpu === true || entry.isCpu === true || entry.ai === true ||
        entry.isAI === true || ['cpu', 'ai'].indexOf(
          String(entry.type || '').toLowerCase()) >= 0));
    }

    function findLane(laneId) {
      return lanes.find(function (entry) { return entry.id === String(laneId); }) || null;
    }

    function laneForId(laneId) {
      var lane = findLane(laneId);
      if (!lane) throw new TypeError('Unknown lane: ' + laneId);
      return lane;
    }

    function laneForPlayer(playerId) {
      return lanes.find(function (lane) { return lane.playerId === String(playerId); }) || null;
    }

    function laneBusy(lane) {
      var state = lane.control.snapshot().state;
      return state === 'aiming' || !!lane.prepared || !!lane.inflight;
    }

    function phaseIsVolley() {
      return config.paceId === 'volley' || battleState.suddenDeath === true;
    }

    function announceAssignment(lane, previousId) {
      var payload = freeze({ laneId: lane.id, previousPlayerId: previousId,
        playerId: lane.playerId, cpu: lane.playerId ? isCpu(lane.playerId) : false,
        relay: config.hardware.fallback === 'alternating-relay' });
      try { if (lane.adapter.onAssignment) lane.adapter.onAssignment(payload); }
      catch (error) { reportError(error, { phase: 'adapter-onAssignment', laneId: lane.id }); }
      try { onAssignment(payload); }
      catch (error) { reportError(error, { phase: 'onAssignment', laneId: lane.id }); }
      if (payload.relay && payload.playerId && previousId !== payload.playerId) {
        try { onRelay(payload); }
        catch (error) { reportError(error, { phase: 'onRelay', laneId: lane.id }); }
      }
    }

    function resetControl(lane, playerId) {
      var previousId = lane.playerId;
      lane.playerId = playerId || null;
      lane.control = Activity.createLaneRuntime({ laneId: lane.id,
        ownerId: lane.playerId, teamId: lane.playerId ? player(lane.playerId).teamId : null,
        state: lane.playerId ? 'ready' : 'disabled' });
      lane.prepared = null;
      lane.inflight = null;
      lane.lockedPowers = [];
      lane.aimAssignmentEpoch = null;
      try {
        if (lane.adapter.reset) lane.adapter.reset(freeze({ laneId: lane.id, playerId: lane.playerId }));
      } catch (error) { reportError(error, { phase: 'adapter-reset', laneId: lane.id }); }
      if (previousId !== lane.playerId) announceAssignment(lane, previousId);
    }

    function configureAssignments() {
      var desired = battleState.phase === 'active' ? battleState.activePlayerIds : [];
      lanes.forEach(function (lane, index) {
        var desiredPlayer = desired[index] || null;
        if (laneBusy(lane)) return;
        if (lane.playerId !== desiredPlayer ||
            (desiredPlayer && lane.control.snapshot().state !== 'ready') ||
            (!desiredPlayer && lane.control.snapshot().state !== 'disabled')) {
          resetControl(lane, desiredPlayer);
        }
      });
      var enabled = lanes.filter(function (lane) {
        return battleState.phase === 'active' && (!hornExpired || battleState.suddenDeath) && lane.playerId &&
          !isCpu(lane.playerId) && lane.control.snapshot().state === 'ready';
      }).map(function (lane) { return lane.id; });
      pointerRouter.setEnabledLaneIds(enabled);
    }

    function pendingFor(playerId) {
      var id = String(playerId);
      if (!pendingPowers.has(id)) pendingPowers.set(id, []);
      return pendingPowers.get(id);
    }

    function takePowers(playerId) {
      var values = pendingFor(playerId).splice(0);
      return values;
    }

    function restorePowers(playerId, values) {
      if (!values || !values.length) return;
      var pending = pendingFor(playerId);
      Array.prototype.unshift.apply(pending, values);
    }

    function startAim(payload) {
      if (destroyed) return false;
      var lane = findLane(payload.laneId);
      if (!lane) return false;
      var assignedBeforeClock = lane.playerId;
      var timedEntry = battleState.phase === 'active' && config.paceId === 'rush' &&
        !battleState.suddenDeath;
      reconcileRushClock(0, payload.startedAt);
      lane = findLane(payload.laneId);
      if ((timedEntry && hornExpired) || !lane || assignedBeforeClock !== lane.playerId ||
          battleState.phase !== 'active' ||
          (hornExpired && !battleState.suddenDeath)) return false;
      if (!lane.playerId || isCpu(lane.playerId) || lane.control.snapshot().state !== 'ready') return false;
      if (!lane.control.claimPointer(payload.pointerId)) return false;
      lane.aimAssignmentEpoch = assignmentEpoch;
      lane.lockedPowers = takePowers(lane.playerId);
      try {
        if (lane.adapter.beginAim) lane.adapter.beginAim(freeze({ laneId: lane.id,
          playerId: lane.playerId, pointerId: payload.pointerId, geometry: payload.geometry,
          powerEffects: clone(lane.lockedPowers) }));
      } catch (error) {
        lane.control.releasePointer(payload.pointerId);
        if (lane.control.snapshot().state === 'aiming') lane.control.transition('ready');
        restorePowers(lane.playerId, lane.lockedPowers);
        lane.lockedPowers = [];
        lane.aimAssignmentEpoch = null;
        reportError(error, { phase: 'adapter-beginAim', laneId: lane.id });
        return false;
      }
      return true;
    }

    function sampleAim(payload) {
      var lane = laneForId(payload.laneId);
      try { if (lane.adapter.sampleAim) lane.adapter.sampleAim(payload); }
      catch (error) { reportError(error, { phase: 'adapter-sampleAim', laneId: lane.id }); }
    }

    function cancelAim(lane, gesture, reason) {
      var pointerId = gesture && gesture.pointerId;
      if (pointerId != null) lane.control.releasePointer(pointerId);
      if (lane.control.snapshot().state === 'aiming') lane.control.transition('ready');
      restorePowers(lane.playerId, lane.lockedPowers);
      lane.lockedPowers = [];
      lane.aimAssignmentEpoch = null;
      try {
        if (lane.adapter.cancelAim) lane.adapter.cancelAim(freeze({ laneId: lane.id,
          playerId: lane.playerId, reason: reason || 'cancelled' }));
      } catch (error) { reportError(error, { phase: 'adapter-cancelAim', laneId: lane.id }); }
      configureAssignments();
      finalizeHornIfReady();
    }

    function cancelGesture(gesture) {
      var lane = laneForId(gesture.laneId);
      cancelAim(lane, gesture, gesture.reason);
    }

    function nextAttemptId(lane) {
      lane.attemptSequence += 1;
      // Attempt identity is bounded independently of caller-authored lane
      // labels. The immutable match ID plus physical lane index and monotonic
      // sequence are sufficient to make it unique inside one Battle match.
      return matchId + ':lane-' + lane.index + ':attempt-' + lane.attemptSequence;
    }

    function immutableGesture(gesture, qualified, lane) {
      return freeze({ schema: 'BattleGestureV1', laneId: lane.id, playerId: lane.playerId,
        pointerId: gesture.pointerId == null ? null : gesture.pointerId,
        pointerType: gesture.pointerType || 'unknown', geometry: clone(gesture.geometry),
        samples: clone(gesture.samples || []), launchSignal: clone(qualified.launchSignal || {}),
        powerEffects: clone(lane.lockedPowers), qualifiedManual: qualified.qualifiedManual !== false });
    }

    function prepareLane(lane, gesture, qualified) {
      var attemptId = nextAttemptId(lane);
      lane.control.releasePointer(gesture.pointerId);
      lane.prepared = { attemptId: attemptId, playerId: lane.playerId,
        gesture: immutableGesture(gesture, qualified, lane), gateId: null };
      lane.lockedPowers = [];
      lane.aimAssignmentEpoch = null;
      if (phaseIsVolley()) tryOpenVolleyGate();
      else launchPrepared([lane], null);
    }

    function activeGestureCount() {
      if (!pointerRouter) return 0;
      return pointerRouter.snapshot().activeGestures.length;
    }

    function peekInputClock(extraAt) {
      var fallback = clockCursorAt == null ? 0 : clockCursorAt;
      return Math.max(fallback, finite(inputNow(), fallback), finite(extraAt, fallback));
    }

    function observeClock(deltaHint, extraAt) {
      if (clockCursorAt == null) return 0;
      var raw = Math.max(lastInputNowAt == null ? clockCursorAt : lastInputNowAt,
        finite(inputNow(), lastInputNowAt == null ? clockCursorAt : lastInputNowAt));
      var absolute = Math.max(raw, finite(extraAt, raw));
      var nextCursor = absolute > (lastInputNowAt == null ? clockCursorAt : lastInputNowAt)
        ? Math.max(clockCursorAt, absolute)
        : clockCursorAt + Math.max(0, finite(deltaHint, 0));
      lastInputNowAt = raw;
      var delta = Math.max(0, nextCursor - clockCursorAt);
      clockCursorAt = nextCursor;
      wallElapsedMs = Math.max(0, clockCursorAt - heatStartedAt);
      return delta;
    }

    function extendHornDeadline(amount) {
      var extension = Math.max(0, finite(amount, 0));
      if (!extension || heatDeadlineAt == null) return;
      heatDeadlineAt += extension;
      hornGraceDeadlineAt = heatDeadlineAt + inputDeliveryGraceMs;
    }

    function oneLaneOpportunityIsControllable() {
      if (physicalLaneCount !== 1) return true;
      var lane = lanes[0];
      var state = lane.control.snapshot().state;
      return !!(lane.playerId && battleState.activePlayerIds.indexOf(lane.playerId) >= 0 &&
        !lane.prepared && !lane.inflight && (state === 'ready' || state === 'aiming'));
    }

    function timeToRushHandoff() {
      var interval = typeof Battle.rushRotationIntervalMs === 'function'
        ? Battle.rushRotationIntervalMs(config) : config.rotationIntervalMs;
      var remainder = battleState.elapsedMs % interval;
      return remainder > 1e-7 ? interval - remainder : interval;
    }

    function reconcileRushClock(deltaHint, extraAt, preserveAimAtHorn) {
      if (battleState.phase !== 'active' || config.paceId !== 'rush' ||
          battleState.suddenDeath || battleState.clockExpired) return 0;
      var wallDelta = observeClock(deltaHint, extraAt);
      if (!(wallDelta > 0)) return 0;
      var oneLane = physicalLaneCount === 1;
      if (oneLane && !oneLaneOpportunityIsControllable()) {
        // An airborne/settling relay attempt belongs to the outgoing player.
        // It may finish, but none of that wall time consumes the incoming
        // player's ready-and-assigned opportunity.
        extendHornDeadline(wallDelta);
        return 0;
      }
      var wallRemaining = wallDelta;
      var totalAdvanced = 0;
      while (wallRemaining > 1e-7 && battleState.phase === 'active' &&
          !battleState.suddenDeath && !battleState.clockExpired) {
        var remaining = Math.max(0, config.rushDurationMs - battleState.elapsedMs);
        var handoff = timeToRushHandoff();
        var intermediateHandoff = handoff < remaining - 1e-7;
        var advance = Math.min(wallRemaining, remaining, handoff);
        var reachesHorn = advance >= remaining - 1e-7;
        if (reachesHorn && (activeGestureCount() > 0 || preserveAimAtHorn === true)) {
          advance = Math.max(0, remaining - 0.001);
        }
        var before = battleState.elapsedMs;
        if (advance > 0) battleState = Battle.advanceClock(battleState, advance);
        var advanced = Math.max(0, battleState.elapsedMs - before);
        totalAdvanced += advanced;
        wallRemaining = Math.max(0, wallRemaining - advanced);
        var crossedHandoff = intermediateHandoff && advanced >= handoff - 1e-7;
        if (crossedHandoff) {
          // Ownership is lost at the boundary itself. Cancel against that
          // intermediate state rather than comparing only the final owner,
          // which may cycle back after a delayed multi-boundary timer tick.
          assignmentEpoch += 1;
          cancelAimsAtAssignmentBoundary();
          configureAssignments();
          if (oneLane) {
            // A one-lane relay must expose the incoming side for a real frame;
            // discard catch-up time beyond this first handoff.
            extendHornDeadline(wallRemaining);
            wallRemaining = 0;
          }
          continue;
        }
        // A partial opportunity, the horn hold epsilon, or completed heat has
        // no further assignment boundary to process in this observation.
        break;
      }
      hornExpired = heatDeadlineAt != null && clockCursorAt >= heatDeadlineAt - 1e-7;
      cancelRotatedAims();
      configureAssignments();
      return totalAdvanced;
    }

    function advanceBattleToHorn(deferForGestures) {
      if (battleState.phase !== 'active' || config.paceId !== 'rush' || battleState.suddenDeath ||
          battleState.clockExpired) return;
      var target = deferForGestures ? Math.max(0, config.rushDurationMs - 0.001)
        : config.rushDurationMs;
      var remaining = Math.max(0, target - battleState.elapsedMs);
      if (remaining > 0) battleState = Battle.advanceClock(battleState, remaining);
    }

    function finalizeHornIfReady() {
      if (!hornExpired || activeGestureCount() > 0 || battleState.clockExpired) return;
      advanceBattleToHorn(false);
      configureAssignments();
    }

    function releaseGesture(gesture) {
      if (destroyed) return;
      var lane = findLane(gesture.laneId);
      if (!lane || lane.control.snapshot().state !== 'aiming') return;
      var timedRush = config.paceId === 'rush' && !battleState.suddenDeath;
      var endedAt = finite(gesture.endedAt, Number.POSITIVE_INFINITY);
      var deadlineAtRelease = heatDeadlineAt;
      var deliveryAt = peekInputClock(endedAt);
      if (timedRush) {
        reconcileRushClock(0, endedAt, true);
        lane = findLane(gesture.laneId);
        if (!lane || lane.aimAssignmentEpoch !== assignmentEpoch ||
            battleState.activePlayerIds.indexOf(lane.playerId) < 0) {
          if (lane) cancelAim(lane, gesture, 'rotation');
          return;
        }
      }
      var deliveryGraceExpired = timedRush && deadlineAtRelease != null &&
        deliveryAt > deadlineAtRelease + inputDeliveryGraceMs;
      if (deliveryGraceExpired && endedAt <= deadlineAtRelease) {
        reconcileRushClock(0, deliveryAt);
        cancelAim(lane, gesture, 'horn-delivery-timeout');
        return;
      }
      if (timedRush && deadlineAtRelease != null && endedAt > deadlineAtRelease) {
        // PointerEvent.timeStamp is authoritative. A delayed rAF/tick cannot
        // turn a post-horn release into a qualified pre-horn launch.
        reconcileRushClock(0, deliveryAt);
        cancelAim(lane, gesture, 'horn');
        return;
      }
      if (timedRush && battleState.clockExpired) {
        cancelAim(lane, gesture, 'horn');
        return;
      }
      var qualified;
      try {
        qualified = object(qualifier(gesture, freeze({ laneId: lane.id,
          playerId: lane.playerId, paceId: config.paceId, geometry: gesture.geometry })));
      } catch (error) {
        cancelAim(lane, gesture, 'qualifier-error');
        reportError(error, { phase: 'qualifier', laneId: lane.id });
        return;
      }
      if (qualified.qualified !== true) {
        cancelAim(lane, gesture, qualified.reason || 'unqualified');
        return;
      }
      prepareLane(lane, gesture, qualified);
      if (timedRush) reconcileRushClock(0, deliveryAt);
      // A release timestamped before the deadline is admitted even if the
      // visual horn tick ran first. Only after it is marked pending may the
      // rules clock close the heat.
      finalizeHornIfReady();
    }

    var pointerRouter = MultiPointer.createMultiPointerRouter({
      laneRects: rects,
      enabledLaneIds: [],
      captureTarget: opts.captureTarget,
      onStart: startAim,
      onSample: sampleAim,
      onRelease: releaseGesture,
      onCancel: cancelGesture,
    });

    function currentVolleyLanes() {
      return battleState.activePlayerIds.map(function (playerId) {
        return laneForPlayer(playerId);
      }).filter(Boolean);
    }

    function tryOpenVolleyGate() {
      var requiredLanes = currentVolleyLanes();
      if (!requiredLanes.length || requiredLanes.some(function (lane) { return !lane.prepared; })) return false;
      gateSequence += 1;
      var gateId = matchId + ':gate-' + gateSequence;
      var gate = { id: gateId, laneIds: requiredLanes.map(function (lane) { return lane.id; }),
        attempts: [], outcomes: new Map(), launchedAt: now() };
      gates.set(gateId, gate);
      launchPrepared(requiredLanes, gate);
      return true;
    }

    function launchPrepared(targetLanes, gate) {
      var immediate = [];
      targetLanes.slice().sort(function (a, b) { return a.index - b.index; }).forEach(function (lane) {
        var prepared = lane.prepared;
        if (!prepared) throw new Error('Lane is not prepared: ' + lane.id);
        if (gate) prepared.gateId = gate.id;
        lane.control.armAttempt(prepared.attemptId);
        battleState = Battle.markLaunch(battleState, {
          attemptId: prepared.attemptId, playerId: prepared.playerId,
        });
        lane.inflight = prepared;
        lane.prepared = null;
        if (gate) gate.attempts.push({ laneId: lane.id, attemptId: prepared.attemptId,
          playerId: prepared.playerId });
        var immutableContext = freeze({ schema: 'BattleLaneLaunchV1', matchId: matchId,
          attemptId: prepared.attemptId, gateId: gate ? gate.id : null,
          launchedAt: gate ? gate.launchedAt : now(), laneId: lane.id,
          playerId: prepared.playerId, gesture: prepared.gesture,
          powerEffects: clone(prepared.gesture.powerEffects), ordinaryEvent: null,
          randomEventsEnabled: false, terminalEventsAllowed: false,
          crossLaneCollisions: false });
        // Physics state is intentionally mutable, but only inside this lane.
        var context = Object.freeze(Object.assign({}, immutableContext,
          { resources: lane.resources }));
        var returned;
        try { returned = lane.adapter.launch(context); }
        catch (error) {
          immediate.push({ laneId: lane.id, attemptId: prepared.attemptId, error: error,
            phase: 'adapter-launch' });
          return;
        }
        var thenMethod = null;
        try { thenMethod = returned && returned.then; }
        catch (error) {
          immediate.push({ laneId: lane.id, attemptId: prepared.attemptId, error: error,
            phase: 'adapter-launch-promise' });
          return;
        }
        if (typeof thenMethod === 'function') {
          // Assimilate through a native Promise. The wrapper has a safe `then`
          // property, while invocation of an adversarial captured method runs
          // inside Promise resolution and becomes a rejection rather than an
          // exception escaping after the lane was marked airborne.
          Promise.resolve({ then: function (resolve, reject) {
            return thenMethod.call(returned, resolve, reject);
          } }).then(function (outcome) {
            if (destroyed || !lane.inflight ||
                lane.inflight.attemptId !== prepared.attemptId) return;
            if (!outcome) return;
            try { resolveAttempt(lane.id, prepared.attemptId, outcome); }
            catch (error) {
              recoverLaunchFailure(lane.id, prepared.attemptId, error, 'adapter-outcome');
            }
          }, function (error) {
            if (destroyed || !lane.inflight ||
                lane.inflight.attemptId !== prepared.attemptId) return;
            recoverLaunchFailure(lane.id, prepared.attemptId, error, 'adapter-launch-promise');
          });
        } else if (returned && typeof returned === 'object' && returned.pose) {
          immediate.push({ laneId: lane.id, attemptId: prepared.attemptId, outcome: returned });
        }
      });
      configureAssignments();
      immediate.forEach(function (entry) {
        if (entry.error) {
          recoverLaunchFailure(entry.laneId, entry.attemptId, entry.error, entry.phase);
          return;
        }
        try { resolveAttempt(entry.laneId, entry.attemptId, entry.outcome); }
        catch (error) { recoverLaunchFailure(entry.laneId, entry.attemptId, error, 'adapter-outcome'); }
      });
    }

    function recoverLaunchFailure(laneId, attemptId, error, phase) {
      if (destroyed) return;
      var lane = laneForId(laneId);
      if (!lane.inflight || lane.inflight.attemptId !== String(attemptId)) return;
      try {
        resolveAttempt(lane.id, attemptId, { pose: 'miss', reason: phase || 'adapter-error',
          runtimeFailure: true });
      } catch (recoveryError) {
        reportError(recoveryError, { phase: 'attempt-recovery', laneId: lane.id,
          attemptId: attemptId });
      }
      // Recovery is attempted before notification, so a consumer throwing from
      // onError cannot strand the lane or synchronized gate.
      reportError(error, { phase: phase || 'adapter-error', laneId: lane.id,
        attemptId: attemptId });
    }

    function leasedRecord(state, input) {
      // Battle.recordAttempt recognizes only a pending Timed Rush identity as
      // a valid pre-rotation ownership lease. The canonical active lineup is
      // never widened, even transiently, so terminal validation cannot inherit
      // a forged or stale assignment.
      return Battle.recordAttempt(state, input);
    }

    function applyOutcome(lane, outcome, notifications, errors) {
      var offersBefore = clone(battleState.powerOffers);
      var input = { attemptId: lane.inflight.attemptId, playerId: lane.inflight.playerId,
        pose: String(outcome.pose || 'miss'), qualifiedManual:
          lane.inflight.gesture.qualifiedManual !== false };
      battleState = leasedRecord(battleState, input);
      Object.keys(battleState.powerOffers).forEach(function (key) {
        if (!offersBefore[key] && battleState.powerOffers[key]) notifications.push(freeze({
          competitorId: key, cards: clone(battleState.powerOffers[key]) }));
      });
      lane.lastResult = clone(outcome);
      lane.inflight = null;
      lane.control.transition('ready');
      try {
        if (lane.adapter.reset) lane.adapter.reset(freeze({ laneId: lane.id,
          playerId: lane.playerId, reason: 'resolved' }));
      } catch (error) { errors.push({ error: error, context: { phase: 'adapter-reset',
        laneId: lane.id, attemptId: input.attemptId } }); }
    }

    function dispatchRecovered(notifications, errors) {
      (notifications || []).forEach(function (payload) {
        try { onPowerOffer(payload); }
        catch (error) { reportError(error, { phase: 'onPowerOffer' }); }
      });
      flushErrors(errors);
    }

    function finishVolleyGate(gate, priorErrors) {
      var notifications = [];
      var errors = (priorErrors || []).slice();
      gate.attempts.slice().sort(function (a, b) {
        return laneForId(a.laneId).index - laneForId(b.laneId).index;
      }).forEach(function (attempt) {
        var lane = laneForId(attempt.laneId);
        applyOutcome(lane, gate.outcomes.get(attempt.attemptId), notifications, errors);
      });
      gates.delete(gate.id);
      configureAssignments();
      dispatchRecovered(notifications, errors);
    }

    function resolveAttempt(laneId, attemptId, value) {
      if (destroyed) return snapshot();
      reconcileRushClock(0);
      var lane = findLane(laneId);
      var id = String(attemptId == null ? '' : attemptId).trim();
      if (!lane || !id || !lane.inflight || lane.inflight.attemptId !== id) return snapshot();
      var gateId = lane.inflight.gateId;
      var gate = gateId ? gates.get(gateId) : null;
      if ((gateId && (!gate || gate.outcomes.has(id))) ||
          lane.control.snapshot().state === 'resolved') return snapshot();
      var outcome = freeze(Object.assign({}, clone(object(value)), {
        pose: ['upright', 'cap', 'miss'].indexOf(String(value && value.pose)) >= 0
          ? String(value.pose) : 'miss',
      }));
      lane.control.resolveAttempt(outcome);
      var errors = [];
      try {
        if (lane.adapter.onResolve) lane.adapter.onResolve(freeze({ laneId: lane.id,
          playerId: lane.playerId, attemptId: id, outcome: outcome }));
      } catch (error) { errors.push({ error: error, context: { phase: 'adapter-onResolve',
        laneId: lane.id, attemptId: id } }); }
      if (gateId) {
        gate.outcomes.set(id, outcome);
        if (gate.outcomes.size === gate.attempts.length) finishVolleyGate(gate, errors);
        else flushErrors(errors);
      } else {
        var notifications = [];
        applyOutcome(lane, outcome, notifications, errors);
        configureAssignments();
        dispatchRecovered(notifications, errors);
      }
      return snapshot();
    }

    function reportContact(laneId, attemptId) {
      if (destroyed) return false;
      var lane = findLane(laneId);
      if (!lane) return false;
      if (!lane.inflight || lane.inflight.attemptId !== String(attemptId)) return false;
      var state = lane.control.snapshot().state;
      if (state === 'airborne') lane.control.transition('contact');
      else if (state === 'settling') lane.control.transition('contact');
      else return false;
      try {
        if (lane.adapter.onContact) lane.adapter.onContact(freeze({ laneId: lane.id,
          playerId: lane.playerId, attemptId: String(attemptId) }));
      } catch (error) { reportError(error, { phase: 'adapter-onContact', laneId: lane.id,
        attemptId: String(attemptId) }); }
      return true;
    }

    function reportAirborne(laneId, attemptId) {
      if (destroyed) return false;
      var lane = findLane(laneId);
      if (!lane) return false;
      if (!lane.inflight || lane.inflight.attemptId !== String(attemptId)) return false;
      var state = lane.control.snapshot().state;
      if (state === 'contact' || state === 'settling') lane.control.transition('airborne');
      else return false;
      return true;
    }

    function reportSettling(laneId, attemptId) {
      if (destroyed) return false;
      var lane = findLane(laneId);
      if (!lane) return false;
      if (!lane.inflight || lane.inflight.attemptId !== String(attemptId)) return false;
      var state = lane.control.snapshot().state;
      if (state === 'airborne' || state === 'contact') lane.control.transition('settling');
      else return false;
      return true;
    }

    function prepareCpuLaunch(playerId, input) {
      if (destroyed) return null;
      var id = String(playerId == null ? '' : playerId).trim();
      if (!id) return null;
      var source = object(input);
      var timedEntry = battleState.phase === 'active' && config.paceId === 'rush' &&
        !battleState.suddenDeath;
      reconcileRushClock(0, source.startedAt == null ? source.timeStamp : source.startedAt);
      if (timedEntry && hornExpired) return null;
      var lane = laneForPlayer(id);
      if (!lane || !isCpu(id)) return null;
      if (battleState.phase !== 'active' || (hornExpired && !battleState.suddenDeath) ||
          lane.control.snapshot().state !== 'ready') {
        return null;
      }
      lane.lockedPowers = takePowers(id);
      var rect = rectByLane.get(lane.id);
      var gesture = freeze({ laneId: lane.id, playerId: id, pointerId: null,
        pointerType: 'cpu', geometry: clone(rect), samples: clone(source.samples || []),
        launchSignal: clone(source.launchSignal || {}), powerEffects: clone(lane.lockedPowers),
        qualifiedManual: false });
      var attemptId = nextAttemptId(lane);
      lane.prepared = { attemptId: attemptId, playerId: id, gesture: gesture, gateId: null };
      lane.lockedPowers = [];
      // Activity's lane contract requires aiming before launch even for CPU input.
      lane.control.claimPointer(-1);
      lane.control.releasePointer(-1);
      if (phaseIsVolley()) tryOpenVolleyGate();
      else launchPrepared([lane], null);
      return attemptId;
    }

    function ownerLocked(key) {
      return lanes.some(function (lane) {
        return lane.playerId && competitorKey(lane.playerId) === key && laneBusy(lane);
      });
    }

    function choosePower(input) {
      var source = object(input);
      var playerId = required(source.playerId, 'playerId');
      var key = competitorKey(playerId);
      var offer = battleState.powerOffers[key];
      if (!offer) throw new Error('No power offer for ' + key);
      if (battleState.storedPowers[key]) throw new Error('Only one power may be stored');
      var index = Math.floor(Number(source.index));
      var card = offer[index];
      if (!card) throw new RangeError('Power index must be 0 or 1');
      // Choosing/storing does not affect physics and may happen while a target
      // aims. Deployment is the atomic cutoff that must precede pointerdown.
      battleState = Battle.choosePower(battleState, source);
      return snapshot();
    }

    function roundPlayerIds() {
      if (!phaseIsVolley() && typeof Battle.powerRoundPlayerIds === 'function') {
        return Battle.powerRoundPlayerIds(battleState).slice();
      }
      return (phaseIsVolley() ? battleState.volleyParticipantIds : battleState.activePlayerIds).slice();
    }

    function playersForDestination(destination) {
      return roundPlayerIds().filter(function (playerId) {
        return competitorKey(playerId) === destination;
      });
    }

    function deployPower(playerId) {
      var id = required(playerId, 'playerId');
      var key = competitorKey(id);
      var stored = battleState.storedPowers[key];
      if (!stored) throw new Error('No stored power for ' + key);
      if (TERMINAL_EVENT_IDS.indexOf(stored.eventAdapterId) >= 0 ||
          POWER_EVENT_IDS.indexOf(stored.eventAdapterId) < 0) {
        throw new Error('Power is incompatible with Battle: ' + stored.eventAdapterId);
      }
      var destinations;
      if (stored.scope === 'target') destinations = [required(stored.targetId, 'targetId')];
      else if (stored.scope === 'symmetric') destinations = Object.keys(battleState.scores);
      else destinations = [key];
      destinations = unique(destinations);
      if (destinations.some(ownerLocked)) {
        throw new Error('Power must be deployed before the affected pointerdown');
      }
      var recipients = [];
      if (stored.scope === 'symmetric') {
        // A Round card is one physical modifier for every representative in
        // this synchronized round, including teammates assigned to later
        // relay batches. Each player consumes only their own delivery.
        destinations.forEach(function (destination) {
          recipients = recipients.concat(playersForDestination(destination));
        });
      } else {
        var destination = destinations[0];
        var candidates = playersForDestination(destination);
        if (stored.scope === 'self' && candidates.indexOf(id) >= 0) recipients = [id];
        else if (candidates.length) recipients = [candidates[0]];
      }
      recipients = unique(recipients);
      if (!recipients.length) throw new Error('Power has no eligible not-yet-armed recipient');
      var oneLaneVolleyInProgress = physicalLaneCount === 1 && phaseIsVolley() &&
        (battleState.volleyPlayerIds.length > 0 || lanes.some(laneBusy));
      if (oneLaneVolleyInProgress) {
        throw new Error('Power deployment waits for the paired Volley to resolve');
      }
      if (recipients.some(function (recipientId) {
        var pending = pendingPowers.get(recipientId);
        return !!(pending && pending.length);
      })) {
        throw new Error('Recipient already has a pending Battle modifier');
      }
      var consumed = Battle.consumePower(battleState, id);
      battleState = consumed.state;
      recipients.forEach(function (recipientId) {
        var targetKey = competitorKey(recipientId);
        pendingFor(recipientId).push(freeze({ cardId: consumed.card.id,
          eventAdapterId: consumed.card.eventAdapterId, scope: consumed.card.scope,
          sourceId: key, targetId: targetKey, recipientPlayerId: recipientId }));
      });
      return freeze({ card: clone(consumed.card), destinations: destinations.slice(),
        recipientPlayerIds: recipients.slice() });
    }

    function startHeat() {
      if (destroyed) throw new Error('Battle runtime is destroyed');
      battleState = Battle.startHeat(battleState);
      assignmentEpoch += 1;
      wallElapsedMs = 0;
      hornExpired = false;
      heatStartedAt = finite(inputNow(), 0);
      clockCursorAt = heatStartedAt;
      lastInputNowAt = heatStartedAt;
      heatDeadlineAt = config.paceId === 'rush'
        ? heatStartedAt + config.rushDurationMs : null;
      hornGraceDeadlineAt = heatDeadlineAt == null ? null
        : heatDeadlineAt + inputDeliveryGraceMs;
      configureAssignments();
      return snapshot();
    }

    function cancelRotatedAims() {
      var desired = battleState.phase === 'active' ? battleState.activePlayerIds : [];
      var pointerIds = [];
      lanes.forEach(function (lane, index) {
        var control = lane.control.snapshot();
        if (control.state === 'aiming' && control.pointerId != null &&
            lane.playerId !== (desired[index] || null)) pointerIds.push(control.pointerId);
      });
      pointerIds.forEach(function (pointerId) {
        pointerRouter.cancelPointer(pointerId, 'rotation');
      });
    }

    function cancelAimsAtAssignmentBoundary() {
      pointerRouter.snapshot().activeGestures.slice().forEach(function (gesture) {
        pointerRouter.cancelPointer(gesture.pointerId, 'rotation');
      });
    }

    function cancelExpiredHornAims() {
      if (!hornExpired || hornGraceDeadlineAt == null ||
          peekInputClock() <= hornGraceDeadlineAt) return;
      pointerRouter.snapshot().activeGestures.slice().forEach(function (gesture) {
        pointerRouter.cancelPointer(gesture.pointerId, 'horn-delivery-timeout');
      });
    }

    function tick(deltaMs) {
      if (destroyed) return snapshot();
      var delta = Math.max(0, finite(deltaMs, 0));
      if (battleState.phase !== 'active' || config.paceId !== 'rush' || battleState.suddenDeath) {
        return snapshot();
      }
      reconcileRushClock(delta);
      cancelExpiredHornAims();
      configureAssignments();
      finalizeHornIfReady();
      return snapshot();
    }

    function updateLaneRects(values) {
      var next = normalizeRects(values).slice(0, lanes.length);
      if (next.length !== lanes.length) throw new TypeError('All physical lanes require rectangles');
      next.forEach(function (rect, index) {
        if (rect.laneId !== lanes[index].id) throw new Error('Lane order/IDs cannot change mid-match');
      });
      rectByLane = new Map(next.map(function (rect) { return [rect.laneId, rect]; }));
      pointerRouter.setLaneRects(next);
      configureAssignments();
      return snapshot();
    }

    function attach(target) { return pointerRouter.attach(target); }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      pointerRouter.detach();
      lanes.forEach(function (lane) {
        try { if (lane.adapter.destroy) lane.adapter.destroy(freeze({ laneId: lane.id })); }
        catch (error) { reportError(error, { phase: 'adapter-destroy', laneId: lane.id }); }
      });
    }

    function drainErrors() {
      var values = runtimeErrors.splice(0);
      return freeze(values);
    }

    function snapshot() {
      var pending = {};
      pendingPowers.forEach(function (values, key) { pending[key] = clone(values); });
      return freeze({ schema: 'BattleRuntimeV1', matchId: matchId,
        battle: battleState, wallElapsedMs: wallElapsedMs, hornExpired: hornExpired,
        heatStartedAt: heatStartedAt, heatDeadlineAt: heatDeadlineAt,
        hornGraceDeadlineAt: hornGraceDeadlineAt,
        adapterContract: ADAPTER_CONTRACT, pendingPowers: pending,
        errors: clone(runtimeErrors),
        lanes: lanes.map(function (lane) {
          var control = lane.control.snapshot();
          return { laneId: lane.id, laneIndex: lane.index, playerId: lane.playerId,
            cpu: lane.playerId ? isCpu(lane.playerId) : false,
            state: lane.prepared ? 'armed' : control.state,
            pointerId: control.pointerId,
            attemptId: lane.inflight ? lane.inflight.attemptId
              : (lane.prepared ? lane.prepared.attemptId : null),
            gateId: lane.inflight ? lane.inflight.gateId : null,
            lastResult: clone(lane.lastResult) };
        }) });
    }

    configureAssignments();

    return freeze({ startHeat: startHeat, tick: tick, updateLaneRects: updateLaneRects,
      attach: attach, destroy: destroy, snapshot: snapshot, choosePower: choosePower,
      deployPower: deployPower, prepareCpuLaunch: prepareCpuLaunch, drainErrors: drainErrors,
      resolveAttempt: resolveAttempt, reportContact: reportContact,
      reportAirborne: reportAirborne, reportSettling: reportSettling,
      handlePointerDown: pointerRouter.handlePointerDown,
      handlePointerMove: pointerRouter.handlePointerMove,
      handlePointerUp: pointerRouter.handlePointerUp,
      handlePointerCancel: pointerRouter.handlePointerCancel,
      handleLostPointerCapture: pointerRouter.handleLostPointerCapture });
  }

  return freeze({ schema: 'FlipgameBattleRuntimeV1',
    ADAPTER_CONTRACT: ADAPTER_CONTRACT, POWER_EVENT_IDS: POWER_EVENT_IDS,
    TERMINAL_EVENT_IDS: TERMINAL_EVENT_IDS, defaultQualifier: defaultQualifier,
    createBattleRuntime: createBattleRuntime });
});
