// v111-mirror-match.js — deterministic per-opponent replay queue.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV111MirrorMatch = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function () {
  'use strict';

  var SCHEMA = 'MirrorMatchQueueV1';
  var CLAIM_SCHEMA = 'MirrorMatchClaimV1';
  var CONSUMED_SCHEMA = 'MirrorMatchConsumedV1';
  var VERSION = 1;
  var STATUSES = Object.freeze(['idle', 'armed', 'complete', 'cleaned']);
  var TARGET_STATUSES = Object.freeze(['pending', 'claimed', 'consumed', 'skipped']);
  var POLICY = deepFreeze({
    eventMode: 'disabled',
    eventPolicy: {
      eventsDisabled: true,
      excludedEventIds: [],
    },
    copiedEventId: null,
    copyRewards: false,
    copySideEffects: false,
    nestingDisabled: true,
    baseVerdictOnly: true,
  });

  function isPlainObject(value) {
    if (!value || Object.prototype.toString.call(value) !== '[object Object]') return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function assertJsonSafe(value, path, seen) {
    var here = path || 'value';
    var type = typeof value;
    if (value === null || type === 'string' || type === 'boolean') return;
    if (type === 'number') {
      if (!Number.isFinite(value)) throw new TypeError(here + ' must contain only finite numbers');
      return;
    }
    if (type !== 'object') throw new TypeError(here + ' must be JSON-safe');
    if (!Array.isArray(value) && !isPlainObject(value)) {
      throw new TypeError(here + ' must contain only plain objects and arrays');
    }
    if (seen.indexOf(value) >= 0) throw new TypeError(here + ' must not contain cycles');
    seen.push(value);
    if (Array.isArray(value)) {
      for (var index = 0; index < value.length; index++) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw new TypeError(here + ' must not contain sparse arrays');
        }
        assertJsonSafe(value[index], here + '[' + index + ']', seen);
      }
    } else {
      Object.keys(value).forEach(function (key) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          throw new TypeError(here + ' contains an unsafe key');
        }
        assertJsonSafe(value[key], here + '.' + key, seen);
      });
    }
    seen.pop();
  }

  function clone(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clone);
    var result = {};
    Object.keys(value).forEach(function (key) { result[key] = clone(value[key]); });
    return result;
  }

  function safeClone(value, path) {
    assertJsonSafe(value, path, []);
    return clone(value);
  }

  function deepFreeze(value) {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function frozenCopy(value) { return deepFreeze(clone(value)); }

  function normalizePlayerId(value, path) {
    var type = typeof value;
    if ((type !== 'string' && type !== 'number') || String(value).trim() === '') {
      throw new TypeError(path + '.playerId must be a non-empty stable ID');
    }
    return String(value);
  }

  function normalizePlayerIndex(value, path) {
    var index = Number(value);
    if (!Number.isInteger(index) || index < 0 || index > 7) {
      throw new RangeError(path + '.playerIndex must be an integer from 0 through 7');
    }
    return index;
  }

  function normalizePlayer(value, path) {
    if (!isPlainObject(value)) throw new TypeError(path + ' must be an object');
    return {
      playerId: normalizePlayerId(value.playerId, path),
      playerIndex: normalizePlayerIndex(value.playerIndex, path),
      active: value.active !== false && value.eliminated !== true,
    };
  }

  function normalizeRoster(value, path, allowEmpty) {
    var here = path || 'activeRoster';
    if (!Array.isArray(value)) throw new TypeError(here + ' must be an array');
    if ((!allowEmpty && value.length < 2) || value.length > 8) {
      throw new RangeError(here + ' must describe ' + (allowEmpty ? '0' : '2') + ' through 8 players');
    }
    var ids = Object.create(null);
    var indexes = Object.create(null);
    return value.map(function (entry, index) {
      var player = normalizePlayer(entry, here + '[' + index + ']');
      if (ids[player.playerId]) throw new RangeError(here + ' contains a duplicate playerId');
      if (indexes[player.playerIndex]) throw new RangeError(here + ' contains a duplicate playerIndex');
      ids[player.playerId] = true;
      indexes[player.playerIndex] = true;
      return player;
    });
  }

  function normalizeSource(value) {
    var source = normalizePlayer(value, 'source');
    return { playerId: source.playerId, playerIndex: source.playerIndex };
  }

  function normalizeLaunch(value) {
    if (!isPlainObject(value)) throw new TypeError('launch must be an object');
    if (!isPlainObject(value.vector)) throw new TypeError('launch.vector must be an object');
    var x = value.vector.x;
    var y = value.vector.y;
    var spin = value.spin;
    if (typeof x !== 'number' || typeof y !== 'number' ||
        !Number.isFinite(x) || !Number.isFinite(y)) {
      throw new TypeError('launch.vector must contain finite x and y values');
    }
    if (typeof spin !== 'number' || !Number.isFinite(spin)) {
      throw new TypeError('launch.spin must be finite');
    }
    var seedType = typeof value.seed;
    if ((seedType !== 'string' && seedType !== 'number') ||
        (seedType === 'number' && !Number.isFinite(value.seed)) || String(value.seed) === '') {
      throw new TypeError('launch.seed must be a non-empty string or finite number');
    }
    // Only physical replay inputs cross the queue boundary. In particular,
    // event IDs, event rewards, Plinko prizes, and side effects are never copied.
    return {
      vector: { x: x, y: y },
      spin: spin,
      seed: value.seed,
    };
  }

  function normalizeProfile(value) {
    if (!isPlainObject(value)) throw new TypeError('profile must be a JSON-safe object');
    return safeClone(value, 'profile');
  }

  function queueId(matchId, sequence) {
    return 'mirror-' + (matchId == null ? 'local' : String(matchId)) + '-' + sequence;
  }

  function blankState(matchId) {
    return {
      schema: SCHEMA,
      version: VERSION,
      matchId: matchId == null ? null : String(matchId),
      sequence: 0,
      queueId: null,
      status: 'idle',
      cleanupReason: null,
      source: null,
      launch: null,
      profile: null,
      policy: clone(POLICY),
      targets: [],
    };
  }

  function unresolvedCount(state) {
    return state.targets.reduce(function (count, target) {
      return count + (target.status === 'pending' || target.status === 'claimed' ? 1 : 0);
    }, 0);
  }

  function refreshStatus(state) {
    if (state.status === 'cleaned' || state.status === 'idle') return;
    state.status = unresolvedCount(state) > 0 ? 'armed' : 'complete';
  }

  function policyIsExact(value) {
    try { return JSON.stringify(value) === JSON.stringify(POLICY); } catch (_) { return false; }
  }

  function validateState(snapshot) {
    if (!isPlainObject(snapshot)) throw new TypeError('Mirror Match snapshot must be an object');
    var state = safeClone(snapshot, 'snapshot');
    if (state.schema !== SCHEMA || state.version !== VERSION) {
      throw new RangeError('Unsupported Mirror Match snapshot schema or version');
    }
    if (state.matchId !== null && typeof state.matchId !== 'string') {
      throw new TypeError('Mirror Match snapshot matchId must be a string or null');
    }
    if (!Number.isInteger(state.sequence) || state.sequence < 0) {
      throw new RangeError('Mirror Match snapshot sequence is invalid');
    }
    if (STATUSES.indexOf(state.status) < 0) throw new RangeError('Mirror Match snapshot status is invalid');
    if (!policyIsExact(state.policy)) throw new RangeError('Mirror Match snapshot replay policy was modified');
    if (!Array.isArray(state.targets) || state.targets.length > 7) {
      throw new RangeError('Mirror Match snapshot targets are invalid');
    }

    if (state.status === 'idle' || state.status === 'cleaned') {
      if (state.queueId !== null || state.source !== null || state.launch !== null ||
          state.profile !== null || state.targets.length !== 0) {
        throw new RangeError('Idle or cleaned Mirror Match snapshot contains an armed queue');
      }
      if (state.status === 'idle' && state.cleanupReason !== null) {
        throw new RangeError('Idle Mirror Match snapshot contains a cleanup reason');
      }
      if (state.status === 'cleaned' && state.cleanupReason !== null && typeof state.cleanupReason !== 'string') {
        throw new TypeError('Mirror Match cleanup reason must be a string or null');
      }
      return state;
    }

    state.source = normalizeSource(state.source);
    state.launch = normalizeLaunch(state.launch);
    state.profile = normalizeProfile(state.profile);
    if (state.queueId !== queueId(state.matchId, state.sequence)) {
      throw new RangeError('Mirror Match snapshot queueId does not match its sequence');
    }
    if (state.cleanupReason !== null) throw new RangeError('Armed Mirror Match snapshot has a cleanup reason');
    var ids = Object.create(null);
    var indexes = Object.create(null);
    state.targets = state.targets.map(function (value, index) {
      var path = 'snapshot.targets[' + index + ']';
      if (!isPlainObject(value)) throw new TypeError(path + ' must be an object');
      var target = {
        playerId: normalizePlayerId(value.playerId, path),
        playerIndex: normalizePlayerIndex(value.playerIndex, path),
        status: String(value.status || ''),
        verdict: value.verdict == null ? null : normalizeStoredVerdict(value.verdict, path + '.verdict'),
      };
      if (target.playerId === state.source.playerId || target.playerIndex === state.source.playerIndex) {
        throw new RangeError('Mirror Match snapshot includes its source as a target');
      }
      if (ids[target.playerId] || indexes[target.playerIndex]) {
        throw new RangeError('Mirror Match snapshot has duplicate target identity');
      }
      ids[target.playerId] = true;
      indexes[target.playerIndex] = true;
      if (TARGET_STATUSES.indexOf(target.status) < 0) throw new RangeError(path + '.status is invalid');
      if ((target.status === 'consumed') !== (target.verdict !== null)) {
        throw new RangeError(path + ' verdict does not match target status');
      }
      return target;
    });
    if (state.targets.length < 1) throw new RangeError('Mirror Match snapshot must contain an opponent');
    var expectedStatus = unresolvedCount(state) > 0 ? 'armed' : 'complete';
    if (state.status !== expectedStatus) throw new RangeError('Mirror Match snapshot status disagrees with its targets');
    return state;
  }

  function normalizeStoredVerdict(value, path) {
    if (!isPlainObject(value)) throw new TypeError(path + ' must be an object');
    var result = String(value.result || '').toUpperCase();
    if (result !== 'MAKE' && result !== 'MISS') throw new RangeError(path + '.result must be MAKE or MISS');
    var stored = { result: result };
    if (value.pose != null) stored.pose = String(value.pose);
    if (value.reason != null) stored.reason = String(value.reason);
    if (value.onCap != null) stored.onCap = !!value.onCap;
    return stored;
  }

  function normalizeFinalVerdict(value) {
    if (typeof value === 'string') return normalizeStoredVerdict({ result: value }, 'verdict');
    if (!isPlainObject(value)) throw new TypeError('verdict must be a final verdict object or MAKE/MISS');
    var phase = value.phase == null ? null : String(value.phase).toLowerCase();
    if (phase !== 'resolved' && phase !== 'final' && value.final !== true) {
      throw new RangeError('Mirror Match copy may be consumed only after a final verdict');
    }
    return normalizeStoredVerdict(value, 'verdict');
  }

  function currentIdentity(value) {
    if (!isPlainObject(value)) throw new TypeError('current player input must be an object');
    var current = {
      playerId: normalizePlayerId(value.playerId, 'current'),
      playerIndex: value.playerIndex == null ? null : normalizePlayerIndex(value.playerIndex, 'current'),
      eliminated: value.eliminated === true || value.active === false,
      activeRoster: value.activeRoster,
    };
    return current;
  }

  function targetFor(state, playerId) {
    for (var index = 0; index < state.targets.length; index++) {
      if (state.targets[index].playerId === playerId) return state.targets[index];
    }
    return null;
  }

  function claimView(state, target, currentIndex) {
    return frozenCopy({
      schema: CLAIM_SCHEMA,
      version: VERSION,
      queueId: state.queueId,
      source: state.source,
      target: {
        playerId: target.playerId,
        playerIndex: target.playerIndex,
        currentPlayerIndex: currentIndex == null ? target.playerIndex : currentIndex,
      },
      launch: state.launch,
      profile: state.profile,
      policy: state.policy,
    });
  }

  function MirrorMatchQueueV1(options) {
    if (!(this instanceof MirrorMatchQueueV1)) return new MirrorMatchQueueV1(options);
    var config = options || {};
    var state = config.snapshot == null ? blankState(config.matchId) : validateState(config.snapshot);
    if (config.matchId != null && state.matchId !== String(config.matchId)) {
      throw new RangeError('Mirror Match snapshot belongs to a different match');
    }

    this.arm = function (input) {
      var value = input || {};
      if (unresolvedCount(state) > 0) throw new Error('Mirror Match queue already has pending opponents');
      var source = normalizeSource(value.source);
      var roster = normalizeRoster(value.activeRoster, 'activeRoster', false);
      var sourceEntry = roster.find(function (player) { return player.playerId === source.playerId; });
      if (!sourceEntry || !sourceEntry.active || sourceEntry.playerIndex !== source.playerIndex) {
        throw new RangeError('Mirror Match source must be an active roster member with matching identity');
      }
      var targets = roster.filter(function (player) {
        return player.active && player.playerId !== source.playerId;
      }).map(function (player) {
        return { playerId: player.playerId, playerIndex: player.playerIndex, status: 'pending', verdict: null };
      });
      if (targets.length < 1) throw new RangeError('Mirror Match needs at least one active opponent');
      state.sequence++;
      state.queueId = queueId(state.matchId, state.sequence);
      state.status = 'armed';
      state.cleanupReason = null;
      state.source = source;
      state.launch = normalizeLaunch(value.launch);
      state.profile = normalizeProfile(value.profile);
      state.policy = clone(POLICY);
      state.targets = targets;
      return this.snapshot();
    };

    this.syncRoster = function (activeRoster) {
      if (state.status !== 'armed') return this.snapshot();
      var roster = normalizeRoster(activeRoster, 'activeRoster', true);
      var activeIds = Object.create(null);
      roster.forEach(function (player) {
        if (player.active) activeIds[player.playerId] = true;
      });
      state.targets.forEach(function (target) {
        if (target.status === 'pending' && !activeIds[target.playerId]) target.status = 'skipped';
      });
      refreshStatus(state);
      return this.snapshot();
    };

    this.peek = function (input) {
      var current = currentIdentity(input);
      if (current.activeRoster !== undefined) this.syncRoster(current.activeRoster);
      var target = targetFor(state, current.playerId);
      if (target && target.status === 'pending' && current.eliminated) {
        target.status = 'skipped';
        refreshStatus(state);
        return null;
      }
      if (!target || (target.status !== 'pending' && target.status !== 'claimed')) return null;
      return claimView(state, target, current.playerIndex);
    };

    this.claim = function (input) {
      var current = currentIdentity(input);
      if (current.activeRoster !== undefined) this.syncRoster(current.activeRoster);
      var target = targetFor(state, current.playerId);
      if (target && target.status === 'pending' && current.eliminated) {
        target.status = 'skipped';
        refreshStatus(state);
        return null;
      }
      if (!target || (target.status !== 'pending' && target.status !== 'claimed')) return null;
      target.status = 'claimed';
      return claimView(state, target, current.playerIndex);
    };

    this.consume = function (input) {
      var value = input || {};
      var current = currentIdentity(value);
      if (current.activeRoster !== undefined) this.syncRoster(current.activeRoster);
      var target = targetFor(state, current.playerId);
      if (!target || target.status !== 'claimed') {
        throw new Error('Mirror Match target must claim its copy before consumption');
      }
      var verdict = normalizeFinalVerdict(value.verdict);
      target.status = 'consumed';
      target.verdict = verdict;
      refreshStatus(state);
      return frozenCopy({
        schema: CONSUMED_SCHEMA,
        version: VERSION,
        queueId: state.queueId,
        source: state.source,
        target: { playerId: target.playerId, playerIndex: target.playerIndex },
        verdict: verdict,
        scoring: {
          eventId: null,
          rawPoints: verdict.result === 'MAKE' ? 1 : 0,
          reward: null,
          sideEffects: [],
          baseVerdictOnly: true,
        },
        queueComplete: state.status === 'complete',
      });
    };

    this.snapshot = function () { return frozenCopy(state); };

    this.cleanup = function (reason) {
      state.status = 'cleaned';
      state.queueId = null;
      state.cleanupReason = reason == null ? 'match-ended' : String(reason);
      state.source = null;
      state.launch = null;
      state.profile = null;
      state.policy = clone(POLICY);
      state.targets = [];
      return this.snapshot();
    };

    if (config.activeRoster !== undefined) this.syncRoster(config.activeRoster);
    Object.freeze(this);
  }

  function create(options) { return new MirrorMatchQueueV1(options); }

  function restore(snapshot, options) {
    var config = options ? clone(options) : {};
    config.snapshot = snapshot;
    return new MirrorMatchQueueV1(config);
  }

  return Object.freeze({
    SCHEMA: SCHEMA,
    CLAIM_SCHEMA: CLAIM_SCHEMA,
    VERSION: VERSION,
    POLICY: POLICY,
    MirrorMatchQueueV1: MirrorMatchQueueV1,
    create: create,
    restore: restore,
  });
});
