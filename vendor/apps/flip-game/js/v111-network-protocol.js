// v111-network-protocol.js — dependency-free NetworkEnvelopeV2 validation.
//
// This module deliberately contains no transport code.  It is shared by the
// browser client and the adversarial protocol tests so every transport has the
// same replay, ordering, authority, and result-binding rules.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameNetworkProtocolV2 = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function () {
  'use strict';

  var SCHEMA = 'NetworkEnvelopeV2';
  var VERSION = 2;
  var PROTOCOL = 'flipgame-net/2';
  var GAME_TYPES = Object.freeze(['flick', 'result']);
  var EVENT_RESULT_SCHEMA = 'FlipgameEventResultV1';
  var EVENT_RESULT_VERSION = 1;
  var EVENT_IDS = Object.freeze([
    'rainbow-corkscrew', 'half-full', 'power-launch', 'fizz-jet', 'golden-flip',
    'bouncy-bottle', 'earthquake', 'moon-gravity', 'ice-slide', 'alien-invasion',
    'gravity-slam', 'trampoline', 'wind-tunnel', 'shrink-ray', 'portal-pair',
    'tether-swing', 'mitosis', 'double-flip', 'ceiling-flip', 'meteor-shower',
    'magnet', 'heart-rush', 'black-hole', 'boomerang', 'roulette-table',
    'rewind', 'plinko', 'mirror-match', 'cap-toss', 'life-drain',
  ]);
  var EVENT_ID_SET = new Set(EVENT_IDS);
  var PLINKO_PRIZES = Object.freeze(['double', 'halve', 'magnet', 'lose', 'win']);
  var PLINKO_SLOTS = Object.freeze([
    'double', 'halve', 'magnet', 'lose', 'win', 'lose', 'magnet', 'halve', 'double',
  ]);
  var PLINKO_CANONICAL = Object.freeze({
    double: 'lives-doubled', halve: 'everyone-else-halved', magnet: 'always-magnet',
    lose: 'automatic-loss', win: 'automatic-win',
  });
  var CONTROL_TYPES = Object.freeze([
    'hello', 'welcome', 'join', 'leave', 'roster', 'start', 'ping', 'pong',
    'resume', 'resume-state', 'rename-required',
  ]);
  var TYPE_SET = new Set(CONTROL_TYPES.concat(GAME_TYPES));

  function copy(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(copy);
    var result = {};
    Object.keys(value).forEach(function (key) { result[key] = copy(value[key]); });
    return result;
  }

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }

  function immutable(value) { return freeze(copy(value)); }

  function integer(value, minimum) {
    return Number.isSafeInteger(value) && value >= (minimum == null ? 0 : minimum);
  }

  function finite(value) { return Number.isFinite(Number(value)); }

  function safeData(value, depth, budget) {
    var level = depth || 0;
    var remaining = budget || { nodes: 0 };
    if (++remaining.nodes > 20000 || level > 24) return false;
    if (value == null || typeof value === 'undefined' || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'string') return value.length <= 65536;
    if (Array.isArray(value)) {
      if (value.length > 5000) return false;
      return value.every(function (item) { return safeData(item, level + 1, remaining); });
    }
    if (typeof value !== 'object') return false;
    var keys = Object.keys(value);
    if (keys.length > 1000) return false;
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] === '__proto__' || keys[i] === 'prototype' || keys[i] === 'constructor' ||
          !safeData(value[keys[i]], level + 1, remaining)) return false;
    }
    return true;
  }

  function record(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function exactKeys(value, allowed) {
    return Object.keys(value).every(function (key) { return allowed.indexOf(key) >= 0; });
  }

  function boundedString(value, maximum, nullable) {
    if (value == null) return nullable ? null : undefined;
    if (typeof value !== 'string' || value.length > maximum) return undefined;
    return value;
  }

  function normalizeReward(value) {
    if (!record(value)) return null;
    var allowed = [
      'additiveLives', 'capped', 'stakeMultiplier', 'landedCount', 'multiplier',
      'slotIndex', 'bypassAdditiveCap', 'plinkoPrize', 'legacyPrize',
      'flipperLivesMultiplier', 'opponentsLivesMultiplier', 'opponentRounding',
      'activeOpponentsOnly', 'grantAlwaysMagnet', 'automaticOutcome', 'opponentsSetLives',
    ];
    if (!exactKeys(value, allowed)) return null;
    var output = {};
    for (var i = 0; i < allowed.length; i++) {
      var key = allowed[i];
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      var item = value[key];
      if (key === 'capped' || key === 'bypassAdditiveCap' || key === 'activeOpponentsOnly' ||
          key === 'grantAlwaysMagnet') {
        if (typeof item !== 'boolean') return null;
      } else if (key === 'opponentRounding') {
        if (item !== 'max(1,ceil)') return null;
      } else if (key === 'plinkoPrize') {
        if (Object.values(PLINKO_CANONICAL).indexOf(item) < 0) return null;
      } else if (key === 'legacyPrize') {
        if (PLINKO_PRIZES.indexOf(item) < 0) return null;
      } else if (key === 'automaticOutcome') {
        if (item !== 'MAKE' && item !== 'MISS') return null;
      } else {
        if (!Number.isFinite(item)) return null;
        if (key === 'landedCount' && (!integer(item, 0) || item > 2)) return null;
        if (key === 'slotIndex' && (!integer(item, 0) || item > 8)) return null;
      }
      output[key] = item;
    }
    return output;
  }

  function normalizeCopyOutcome(value) {
    if (!record(value) || !exactKeys(value, ['copy', 'made', 'onCap', 'tilt', 'reason']) ||
        !integer(value.copy, 1) || value.copy > 2 || typeof value.made !== 'boolean' ||
        typeof value.onCap !== 'boolean' || (value.tilt != null && !finite(value.tilt))) return null;
    var reason = boundedString(value.reason, 128, true);
    if (reason === undefined) return null;
    return {
      copy: value.copy, made: value.made, onCap: value.onCap,
      tilt: value.tilt == null ? null : Number(value.tilt), reason: reason,
    };
  }

  function normalizePhysicsMetadata(value) {
    if (!record(value)) return null;
    var allowed = [
      'onCap', 'pose', 'contacts', 'bounces', 'banks', 'rewind', 'copies',
      'massConservationError', 'angularMomentumError', 'capToss', 'roulette', 'meteorHits',
    ];
    if (!exactKeys(value, allowed)) return null;
    if (typeof value.onCap !== 'boolean' || ['upright', 'cap', 'other'].indexOf(value.pose) < 0 ||
        !integer(value.contacts, 0) || !integer(value.bounces, 0) || !integer(value.banks, 0)) return null;
    var output = {
      onCap: value.onCap, pose: value.pose, contacts: value.contacts,
      bounces: value.bounces, banks: value.banks,
    };
    if (Object.prototype.hasOwnProperty.call(value, 'rewind')) {
      var rewind = value.rewind;
      if (!record(rewind) || !exactKeys(rewind, ['replayed', 'firstFailureReason', 'replaySucceeded']) ||
          typeof rewind.replayed !== 'boolean' || typeof rewind.replaySucceeded !== 'boolean') return null;
      var failure = boundedString(rewind.firstFailureReason, 128, true);
      if (failure === undefined) return null;
      output.rewind = { replayed: rewind.replayed, firstFailureReason: failure,
        replaySucceeded: rewind.replaySucceeded };
    }
    if (Object.prototype.hasOwnProperty.call(value, 'copies')) {
      if (!Array.isArray(value.copies) || value.copies.length !== 2) return null;
      output.copies = value.copies.map(normalizeCopyOutcome);
      if (output.copies.some(function (item) { return !item; })) return null;
    }
    for (var n = 0; n < 2; n++) {
      var numberKey = n === 0 ? 'massConservationError' : 'angularMomentumError';
      if (Object.prototype.hasOwnProperty.call(value, numberKey)) {
        if (!finite(value[numberKey])) return null;
        output[numberKey] = Number(value[numberKey]);
      }
    }
    if (Object.prototype.hasOwnProperty.call(value, 'capToss')) {
      var capToss = value.capToss;
      if (!record(capToss) || !exactKeys(capToss, ['bodyLanded', 'capLanded', 'bothRequired']) ||
          typeof capToss.bodyLanded !== 'boolean' || typeof capToss.capLanded !== 'boolean' ||
          capToss.bothRequired !== true) return null;
      output.capToss = { bodyLanded: capToss.bodyLanded, capLanded: capToss.capLanded, bothRequired: true };
    }
    if (Object.prototype.hasOwnProperty.call(value, 'roulette')) {
      var roulette = value.roulette;
      if (!record(roulette) || !exactKeys(roulette, ['wheelAngle', 'slotIndex']) ||
          !finite(roulette.wheelAngle) || !integer(roulette.slotIndex, 0) || roulette.slotIndex > 7) return null;
      output.roulette = { wheelAngle: Number(roulette.wheelAngle), slotIndex: roulette.slotIndex };
    }
    if (Object.prototype.hasOwnProperty.call(value, 'meteorHits')) {
      if (!integer(value.meteorHits, 0)) return null;
      output.meteorHits = value.meteorHits;
    }
    return output;
  }

  function normalizeEventMetadata(value) {
    if (!record(value) || !exactKeys(value,
      ['perfect', 'onCap', 'golden', 'plinko', 'automaticOutcome', 'reward', 'physics'])) return null;
    if (typeof value.perfect !== 'boolean' || typeof value.onCap !== 'boolean' ||
        typeof value.golden !== 'boolean') return null;
    if (value.plinko !== null && PLINKO_PRIZES.indexOf(value.plinko) < 0) return null;
    if (value.automaticOutcome !== null && value.automaticOutcome !== 'MAKE' &&
        value.automaticOutcome !== 'MISS') return null;
    var reward = normalizeReward(value.reward);
    var physics = normalizePhysicsMetadata(value.physics);
    if (!reward || !physics) return null;
    return {
      perfect: value.perfect, onCap: value.onCap, golden: value.golden,
      plinko: value.plinko, automaticOutcome: value.automaticOutcome,
      reward: reward, physics: physics,
    };
  }

  function validateEventSemantics(eventResult, resultValue) {
    var id = eventResult.eventId;
    var metadata = eventResult.metadata;
    var reward = metadata.reward;
    var physics = metadata.physics;
    var attempt = eventResult.attempt;
    if (attempt.final !== true || attempt.index !== (attempt.replayed ? 2 : 1)) return 'invalid-event-attempt';
    if (id === 'rewind') {
      if (!physics.rewind || physics.rewind.replayed !== attempt.replayed ||
          physics.rewind.replaySucceeded !== (resultValue === 'MAKE')) return 'invalid-rewind-result';
      if (resultValue === 'MISS' && !attempt.replayed) return 'nonfinal-rewind-result';
    }
    if (id === 'mitosis') {
      if (!integer(reward.landedCount, 0) || reward.landedCount > 2 || !physics.copies ||
          physics.copies.filter(function (item) { return item.made; }).length !== reward.landedCount ||
          (resultValue === 'MAKE') !== (reward.landedCount > 0)) return 'invalid-mitosis-result';
    }
    if (id === 'cap-toss') {
      var cap = physics.capToss;
      if (!cap || (resultValue === 'MAKE') !== (cap.bodyLanded && cap.capLanded)) return 'invalid-cap-toss-result';
    }
    if (id === 'roulette-table') {
      var multipliers = [1, 2, 3, 4, 4, 3, 2, 1];
      if (!integer(reward.slotIndex, 0) || reward.slotIndex > 7 ||
          reward.multiplier !== multipliers[reward.slotIndex] || !physics.roulette ||
          physics.roulette.slotIndex !== reward.slotIndex) return 'invalid-roulette-result';
    }
    if (id === 'plinko') {
      var slot = reward.slotIndex;
      var prize = metadata.plinko;
      if (!integer(slot, 0) || slot > 8 || prize !== PLINKO_SLOTS[slot] ||
          reward.legacyPrize !== prize || reward.plinkoPrize !== PLINKO_CANONICAL[prize] ||
          metadata.automaticOutcome !== resultValue ||
          resultValue !== (prize === 'lose' ? 'MISS' : 'MAKE')) return 'invalid-plinko-result';
    } else if (metadata.plinko !== null || metadata.automaticOutcome !== null) {
      return 'unexpected-automatic-result';
    }
    return null;
  }

  function parseEventResult(value, resultValue) {
    if (!record(value) || !exactKeys(value, ['schema', 'version', 'eventId', 'attempt', 'metadata']) ||
        value.schema !== EVENT_RESULT_SCHEMA || value.version !== EVENT_RESULT_VERSION ||
        !EVENT_ID_SET.has(value.eventId) || !record(value.attempt) ||
        !exactKeys(value.attempt, ['index', 'replayed', 'final']) ||
        !integer(value.attempt.index, 1) || value.attempt.index > 2 ||
        typeof value.attempt.replayed !== 'boolean' || value.attempt.final !== true) {
      return { ok: false, code: 'invalid-event-result' };
    }
    var metadata = normalizeEventMetadata(value.metadata);
    if (!metadata) return { ok: false, code: 'invalid-event-metadata' };
    var normalized = {
      schema: EVENT_RESULT_SCHEMA, version: EVENT_RESULT_VERSION, eventId: value.eventId,
      attempt: { index: value.attempt.index, replayed: value.attempt.replayed, final: true },
      metadata: metadata,
    };
    var semanticError = validateEventSemantics(normalized, resultValue);
    return semanticError ? { ok: false, code: semanticError } : { ok: true, value: immutable(normalized) };
  }

  function createEventResult(input) {
    var source = input || {};
    if ((source.result !== 'MAKE' && source.result !== 'MISS') || !EVENT_ID_SET.has(source.eventId)) {
      throw new TypeError('A valid event id and final MAKE/MISS are required');
    }
    var meta = source.meta || {};
    var eventContainer = record(meta.eventResult) ? meta.eventResult :
      (record(meta.eventReward) && record(meta.eventReward.eventReward) ? meta.eventReward : null);
    var rewardSource = eventContainer ? eventContainer.eventReward : meta.eventReward;
    var physicsSource = eventContainer ? eventContainer.meta : meta.meta;
    var replayed = !!(physicsSource && physicsSource.rewind && physicsSource.rewind.replayed);
    var candidate = {
      schema: EVENT_RESULT_SCHEMA,
      version: EVENT_RESULT_VERSION,
      eventId: source.eventId,
      attempt: { index: replayed ? 2 : 1, replayed: replayed, final: true },
      metadata: {
        perfect: !!meta.perfect,
        onCap: !!meta.onCap,
        golden: !!meta.golden,
        plinko: meta.plinko == null ? null : meta.plinko,
        automaticOutcome: meta.automaticOutcome == null ? null : meta.automaticOutcome,
        reward: rewardSource || {},
        physics: physicsSource || { onCap: !!meta.onCap, pose: meta.onCap ? 'cap' :
          (source.result === 'MAKE' ? 'upright' : 'other'), contacts: 0, bounces: 0, banks: 0 },
      },
    };
    var parsed = parseEventResult(candidate, source.result);
    if (!parsed.ok) throw new TypeError('Invalid authoritative event result: ' + parsed.code);
    return parsed.value;
  }

  function eventResultToGameMeta(eventResult) {
    var metadata = eventResult.metadata;
    var reward = metadata.reward;
    return immutable({
      perfect: metadata.perfect,
      onCap: metadata.onCap,
      golden: metadata.golden,
      plinko: metadata.plinko,
      rareEvent: eventResult.eventId,
      eventId: eventResult.eventId,
      landedCount: reward.landedCount,
      rouletteMultiplier: reward.multiplier,
      rouletteSlot: reward.slotIndex,
      automaticOutcome: metadata.automaticOutcome,
      eventReward: reward,
      meta: metadata.physics,
    });
  }

  function resolveAuthoritativeResult(payload, expectedEventId) {
    var source = payload || {};
    if (source.result !== 'MAKE' && source.result !== 'MISS') return { ok: false, code: 'invalid-result' };
    var packetEventId = source.eventId == null ? null : source.eventId;
    if (packetEventId !== null && !EVENT_ID_SET.has(packetEventId)) return { ok: false, code: 'invalid-event-id' };
    var expected = expectedEventId == null ? null : expectedEventId;
    if (expected !== null && !EVENT_ID_SET.has(expected)) return { ok: false, code: 'invalid-expected-event' };
    if (source.eventResult == null) {
      if (packetEventId !== null || expected !== null) return { ok: false, code: 'missing-event-result' };
      return { ok: true, value: immutable({ result: source.result, eventId: null,
        eventResult: null, meta: null, landingInfo: record(source.info) ? source.info : {} }) };
    }
    var parsed = parseEventResult(source.eventResult, source.result);
    if (!parsed.ok) return parsed;
    if (packetEventId !== parsed.value.eventId || (expected !== null && expected !== parsed.value.eventId) ||
        (expected === null && parsed.value.eventId !== null)) return { ok: false, code: 'event-result-mismatch' };
    var gameMeta = eventResultToGameMeta(parsed.value);
    var landing = Object.assign({}, record(source.info) ? source.info : {}, {
      eventId: parsed.value.eventId,
      meta: parsed.value.metadata.physics,
      eventReward: parsed.value.metadata.reward,
      automaticOutcome: parsed.value.metadata.automaticOutcome,
    });
    return { ok: true, value: immutable({ result: source.result, eventId: parsed.value.eventId,
      eventResult: parsed.value, meta: gameMeta, landingInfo: landing }) };
  }

  function normalizeNumber(value) {
    var number = Number(value);
    if (Object.is(number, -0)) number = 0;
    return String(number);
  }

  // A checksum is not authentication.  Its purpose is to make the authoritative
  // result unambiguously refer to the exact launch tuple all peers accepted.
  function flickBinding(seed, vx, vy) {
    var source = String(Number(seed) >>> 0) + '|' + normalizeNumber(vx) + '|' + normalizeNumber(vy);
    var hash = 0x811c9dc5;
    for (var i = 0; i < source.length; i++) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return ('00000000' + hash.toString(16)).slice(-8);
  }

  function randomId(prefix, randomValues) {
    var bytes = new Uint32Array(4);
    if (typeof randomValues === 'function') randomValues(bytes);
    else {
      for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 0x100000000) >>> 0;
    }
    return prefix + Array.from(bytes).map(function (part) {
      return ('00000000' + part.toString(16)).slice(-8);
    }).join('');
  }

  function result(ok, code, envelope) {
    return Object.freeze({
      ok: !!ok,
      code: code || null,
      envelope: ok && envelope ? envelope : null,
    });
  }

  function ProtocolSession(options) {
    if (!(this instanceof ProtocolSession)) return new ProtocolSession(options);
    var config = options || {};
    var selfId = String(config.selfId || '');
    var room = String(config.room || '').toUpperCase();
    var hostId = config.hostId == null ? null : String(config.hostId);
    var randomValues = typeof config.randomValues === 'function' ? config.randomValues : null;
    var requireAuthenticatedSender = config.requireAuthenticatedSender !== false;
    var outboundSequence = 0;
    var inboundSequences = new Map();
    var matchId = null;
    var currentPlayerId = null;
    var turnId = 0;
    var lastFlipId = 0;
    var activeFlick = null;

    function reject(code, envelope) {
      if (typeof config.onReject === 'function') {
        try { config.onReject(code, envelope || null); } catch (_) {}
      }
      return result(false, code);
    }

    function baseEnvelope(type, payload, fields) {
      if (!selfId || !room) throw new Error('Protocol session is not initialized');
      if (!TYPE_SET.has(type)) throw new RangeError('Unknown network message type: ' + type);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !safeData(payload)) {
        throw new TypeError('Network payload must be bounded JSON-safe data');
      }
      var extra = fields || {};
      return immutable({
        schema: SCHEMA,
        version: VERSION,
        protocol: PROTOCOL,
        room: room,
        matchId: extra.matchId !== undefined ? extra.matchId : matchId,
        type: type,
        senderId: selfId,
        sequence: ++outboundSequence,
        turnId: extra.turnId !== undefined ? extra.turnId : null,
        flipId: extra.flipId !== undefined ? extra.flipId : null,
        payload: payload || {},
      });
    }

    function activate(id, playerId, firstTurnId) {
      matchId = String(id || '');
      if (!/^m_[a-f0-9]{32}$/.test(matchId)) throw new TypeError('Invalid host-issued match id');
      currentPlayerId = String(playerId || '');
      if (!currentPlayerId) throw new TypeError('A current player is required');
      turnId = firstTurnId == null ? 1 : Number(firstTurnId);
      if (!integer(turnId, 1)) throw new TypeError('turnId must be a positive integer');
      lastFlipId = 0;
      activeFlick = null;
    }

    function validateBase(envelope) {
      if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return 'legacy-protocol';
      if (envelope.schema !== SCHEMA || envelope.version !== VERSION || envelope.protocol !== PROTOCOL) {
        return 'legacy-protocol';
      }
      if (!/^[A-HJ-NP-Z2-9]{3,6}$/.test(String(envelope.room || '')) ||
          String(envelope.room).toUpperCase() !== room) return 'wrong-room';
      if (!TYPE_SET.has(envelope.type)) return 'unknown-type';
      if (typeof envelope.senderId !== 'string' || !/^p_[a-f0-9]{16}$/.test(envelope.senderId)) {
        return 'invalid-sender';
      }
      if (!integer(envelope.sequence, 1)) return 'invalid-sequence';
      if (!envelope.payload || typeof envelope.payload !== 'object' || Array.isArray(envelope.payload)) {
        return 'invalid-payload';
      }
      if (!safeData(envelope.payload)) return 'unsafe-payload';
      return null;
    }

    function validateOrder(envelope) {
      var previous = inboundSequences.get(envelope.senderId);
      if (previous == null) return null; // A late join pins the first observed sequence.
      if (envelope.sequence <= previous) return 'duplicate-or-stale';
      if (envelope.sequence !== previous + 1 && envelope.type !== 'resume-state') return 'out-of-order';
      return null;
    }

    function validateMatch(envelope) {
      if (!matchId || envelope.matchId !== matchId) return 'wrong-match';
      if (!integer(envelope.turnId, 1) || envelope.turnId !== turnId) return 'wrong-turn';
      if (!integer(envelope.flipId, 1)) return 'invalid-flip-id';
      return null;
    }

    function validateFlick(envelope) {
      var error = validateMatch(envelope);
      if (error) return error;
      var payload = envelope.payload;
      if (!currentPlayerId || envelope.senderId !== currentPlayerId || payload.playerId !== currentPlayerId) {
        return 'not-current-player';
      }
      if (activeFlick) return 'flip-already-active';
      if (envelope.flipId !== lastFlipId + 1) return 'non-monotonic-flip';
      if (!finite(payload.vx) || !finite(payload.vy) || !integer(payload.seed, 0) || payload.seed > 0xffffffff) {
        return 'invalid-flick';
      }
      if (payload.flickBinding !== flickBinding(payload.seed, payload.vx, payload.vy)) return 'invalid-flick-binding';
      return null;
    }

    function validateResult(envelope) {
      var error = validateMatch(envelope);
      if (error) return error;
      var payload = envelope.payload;
      if (!activeFlick) return 'result-without-flick';
      if (envelope.senderId !== activeFlick.senderId || payload.playerId !== activeFlick.senderId) {
        return 'wrong-result-sender';
      }
      if (envelope.flipId !== activeFlick.flipId || payload.flickSeed !== activeFlick.seed ||
          payload.flickBinding !== activeFlick.binding) return 'result-binding-mismatch';
      if (payload.result !== 'MAKE' && payload.result !== 'MISS') return 'invalid-result';
      var authoritative = resolveAuthoritativeResult(payload, payload.eventId == null ? null : payload.eventId);
      if (!authoritative.ok) return authoritative.code;
      return null;
    }

    function commit(envelope) {
      inboundSequences.set(envelope.senderId, envelope.sequence);
      if (envelope.type === 'start') {
        var players = envelope.payload.defs;
        var index = integer(envelope.payload.startIndex, 0) ? envelope.payload.startIndex : 0;
        if (!Array.isArray(players) || !players[index] || !players[index].netId) return 'invalid-start';
        activate(envelope.matchId, players[index].netId, 1);
      } else if (envelope.type === 'flick') {
        lastFlipId = envelope.flipId;
        activeFlick = Object.freeze({
          senderId: envelope.senderId,
          turnId: envelope.turnId,
          flipId: envelope.flipId,
          seed: envelope.payload.seed,
          binding: envelope.payload.flickBinding,
        });
      } else if (envelope.type === 'result') {
        activeFlick = null;
      }
      return null;
    }

    this.issueMatchId = function () {
      if (!hostId || selfId !== hostId) throw new Error('Only the host may issue a match id');
      return randomId('m_', randomValues);
    };

    this.start = function (payload) {
      if (!hostId || selfId !== hostId) throw new Error('Only the host may start a match');
      var players = payload && payload.defs;
      var index = payload && integer(payload.startIndex, 0) ? payload.startIndex : 0;
      if (!Array.isArray(players) || !players[index] || !players[index].netId) {
        throw new TypeError('Start payload requires an ordered player list');
      }
      var id = this.issueMatchId();
      activate(id, players[index].netId, 1);
      return baseEnvelope('start', payload, { matchId: id, turnId: 1, flipId: 0 });
    };

    this.control = function (type, payload) {
      if (GAME_TYPES.indexOf(type) >= 0 || type === 'start') {
        throw new RangeError('Use the typed gameplay/start method');
      }
      return baseEnvelope(type, payload || {}, {
        matchId: matchId,
        turnId: matchId ? turnId : null,
        flipId: activeFlick ? activeFlick.flipId : null,
      });
    };

    this.flick = function (payload) {
      var source = payload || {};
      if (!matchId) throw new Error('No active v2 match');
      if (String(source.playerId || '') !== selfId || selfId !== currentPlayerId) {
        throw new Error('Only the current player may flick');
      }
      if (activeFlick) throw new Error('A flip is already active');
      if (!finite(source.vx) || !finite(source.vy) || !integer(source.seed, 0) || source.seed > 0xffffffff) {
        throw new TypeError('Invalid flick payload');
      }
      var flipId = lastFlipId + 1;
      var payloadCopy = Object.assign({}, source, {
        playerId: selfId,
        seed: Number(source.seed) >>> 0,
        flickBinding: flickBinding(source.seed, source.vx, source.vy),
      });
      var envelope = baseEnvelope('flick', payloadCopy, { turnId: turnId, flipId: flipId });
      lastFlipId = flipId;
      activeFlick = Object.freeze({
        senderId: selfId, turnId: turnId, flipId: flipId,
        seed: payloadCopy.seed, binding: payloadCopy.flickBinding,
      });
      return envelope;
    };

    this.result = function (payload) {
      var source = payload || {};
      if (!activeFlick) throw new Error('A result requires an active flick');
      if (selfId !== currentPlayerId || activeFlick.senderId !== selfId || source.playerId !== selfId) {
        throw new Error('Only the flicking player may report its result');
      }
      if (source.result !== 'MAKE' && source.result !== 'MISS') throw new TypeError('Invalid result');
      var authoritative = resolveAuthoritativeResult(source, source.eventId == null ? null : source.eventId);
      if (!authoritative.ok) throw new TypeError('Invalid result payload: ' + authoritative.code);
      var payloadCopy = Object.assign({}, source, {
        playerId: selfId,
        flickSeed: activeFlick.seed,
        flickBinding: activeFlick.binding,
      });
      var envelope = baseEnvelope('result', payloadCopy, {
        turnId: activeFlick.turnId,
        flipId: activeFlick.flipId,
      });
      activeFlick = null;
      return envelope;
    };

    this.receive = function (candidate, verifiedSenderId) {
      var envelope = candidate;
      var error = validateBase(envelope);
      if (error) return reject(error, envelope);
      if (requireAuthenticatedSender && String(verifiedSenderId || '') !== envelope.senderId) {
        return reject('unauthenticated-sender', envelope);
      }
      if (envelope.senderId === selfId) return reject('self-message', envelope);
      error = validateOrder(envelope);
      if (error) return reject(error, envelope);
      if (envelope.type === 'start') {
        if (!hostId || envelope.senderId !== hostId) return reject('start-not-from-host', envelope);
        if (!/^m_[a-f0-9]{32}$/.test(String(envelope.matchId || ''))) return reject('invalid-match-id', envelope);
      } else if (envelope.type === 'flick') {
        error = validateFlick(envelope);
        if (error) return reject(error, envelope);
      } else if (envelope.type === 'result') {
        error = validateResult(envelope);
        if (error) return reject(error, envelope);
      } else if (envelope.type !== 'resume' && envelope.type !== 'resume-state' &&
          matchId && envelope.matchId != null && envelope.matchId !== matchId) {
        return reject('wrong-match', envelope);
      }
      error = commit(envelope);
      if (error) return reject(error, envelope);
      return result(true, null, immutable(envelope));
    };

    this.setTurn = function (value) {
      var next = value || {};
      var nextPlayer = String(next.playerId || '');
      var nextTurn = Number(next.turnId);
      if (!matchId) throw new Error('No active match');
      if (!nextPlayer || !integer(nextTurn, 1)) throw new TypeError('playerId and turnId are required');
      if (nextTurn < turnId || nextTurn > turnId + 1) throw new Error('turnId must advance monotonically');
      if (nextTurn === turnId && nextPlayer !== currentPlayerId) throw new Error('Current turn is already bound');
      if (activeFlick && nextTurn !== turnId) throw new Error('Cannot advance with an active flip');
      currentPlayerId = nextPlayer;
      turnId = nextTurn;
      return this.snapshot();
    };

    this.setHost = function (value) {
      var id = String(value || '');
      if (!id) throw new TypeError('hostId is required');
      if (hostId && hostId !== id) throw new Error('Host identity is already pinned');
      hostId = id;
      return hostId;
    };

    this.snapshot = function () {
      var sequences = {};
      inboundSequences.forEach(function (value, key) { sequences[key] = value; });
      return immutable({
        protocol: PROTOCOL,
        room: room,
        hostId: hostId,
        matchId: matchId,
        currentPlayerId: currentPlayerId,
        turnId: turnId,
        lastFlipId: lastFlipId,
        activeFlick: activeFlick,
        outboundSequence: outboundSequence,
        inboundSequences: sequences,
      });
    };

    this.restore = function (snapshot, authorityId) {
      var source = snapshot || {};
      if (!hostId || String(authorityId || '') !== hostId) throw new Error('Resume state must come from the pinned host');
      if (source.protocol !== PROTOCOL || String(source.room || '').toUpperCase() !== room) {
        throw new Error('Incompatible resume state');
      }
      if (source.matchId == null) {
        matchId = null; currentPlayerId = null; turnId = 0; lastFlipId = 0; activeFlick = null;
      } else {
        if (source.hostId !== hostId || !/^m_[a-f0-9]{32}$/.test(String(source.matchId)) ||
            !/^p_[a-f0-9]{16}$/.test(String(source.currentPlayerId || '')) ||
            !integer(source.turnId, 1) || !integer(source.lastFlipId, 0)) {
          throw new Error('Invalid resume state');
        }
        matchId = source.matchId;
        currentPlayerId = String(source.currentPlayerId);
        turnId = source.turnId;
        lastFlipId = source.lastFlipId;
        if (source.activeFlick &&
            (source.activeFlick.senderId !== currentPlayerId || source.activeFlick.turnId !== turnId ||
             source.activeFlick.flipId !== lastFlipId || !integer(source.activeFlick.seed, 0) ||
             source.activeFlick.seed > 0xffffffff || !/^[a-f0-9]{8}$/.test(String(source.activeFlick.binding || '')))) {
          throw new Error('Invalid active flick in resume state');
        }
        activeFlick = source.activeFlick ? immutable(source.activeFlick) : null;
      }
      var received = source.inboundSequences || {};
      Object.keys(received).forEach(function (sender) {
        if (integer(received[sender], 1)) {
          inboundSequences.set(sender, Math.max(inboundSequences.get(sender) || 0, received[sender]));
        }
      });
      return this.snapshot();
    };

    this.identity = function () { return Object.freeze({ selfId: selfId, room: room, hostId: hostId }); };
  }

  return Object.freeze({
    SCHEMA: SCHEMA,
    VERSION: VERSION,
    PROTOCOL: PROTOCOL,
    EVENT_RESULT_SCHEMA: EVENT_RESULT_SCHEMA,
    EVENT_RESULT_VERSION: EVENT_RESULT_VERSION,
    EVENT_IDS: EVENT_IDS,
    CONTROL_TYPES: CONTROL_TYPES,
    GAME_TYPES: GAME_TYPES,
    ProtocolSession: ProtocolSession,
    flickBinding: flickBinding,
    createEventResult: createEventResult,
    resolveAuthoritativeResult: resolveAuthoritativeResult,
  });
});
