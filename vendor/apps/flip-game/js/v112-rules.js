// v112-rules.js -- deterministic, renderer-free rules for Classic, Cup and
// Team Clash. Physics reports a settled verdict; this module alone mutates the
// match economy and emits versioned outcomes.
(function (factory) {
  'use strict';
  var nodeModule = null;
  try {
    if (typeof process === 'object' && process !== null &&
        typeof process.getBuiltinModule === 'function') {
      nodeModule = process.getBuiltinModule('module');
    }
  } catch (_) { nodeModule = null; }
  var commonJs = typeof nodeModule === 'function' && nodeModule._cache &&
    typeof module === 'object' && module !== null &&
    module.constructor === nodeModule && Object.getPrototypeOf(module) === nodeModule.prototype &&
    nodeModule._cache[module.filename] === module &&
    Object.prototype.hasOwnProperty.call(module, 'exports') &&
    module.require === nodeModule.prototype.require &&
    typeof module.filename === 'string' &&
    typeof process === 'object' && process !== null &&
    process.release && process.release.name === 'node' &&
    process.versions && typeof process.versions.node === 'string';
  if (!commonJs) {
    throw new Error('v112-rules.js is a private CommonJS core and cannot initialize as a classic script');
  }
  module.exports = factory(function () {
    return module.require('./v112-event-kernel.js');
  });
})(function (loadEventKernel) {
  'use strict';

  var VERSION = 1;
  var OUTCOME_SCHEMA = 'RulesOutcomeV1';
  var STARTING_LIFE_PRESETS = Object.freeze([3, 5, 10, 20, 100]);
  var CUP_FORMATS = Object.freeze({
    short: Object.freeze({ id: 'short', maxPlayers: 12, startingLives: 3,
      suddenDeathRotations: 3, bestOf: 3, winsNeeded: 2 }),
    full: Object.freeze({ id: 'full', maxPlayers: 8, startingLives: 10,
      suddenDeathRotations: 5, bestOf: 3, winsNeeded: 2 }),
  });
  var REMATCH_STRATEGIES = Object.freeze([
    'same-setup', 'rotate-first-player', 'shuffle-order', 'swap-teams',
  ]);
  var DEFAULT_CLASSIC_SUDDEN_DEATH_TURNS = 70;
  var DEFAULT_SUDDEN_DEATH_STEP_TURNS = 20;
  var RESOLUTION_IDENTITY_SCHEMA = 'ResolutionIdentityV1';
  var MAX_CALLER_FLIP_ID_LENGTH = 96;
  // Capabilities are intentionally identity-bearing objects.  Schema tags and
  // public identity hashes are corruption checks, never authority.
  var EVENT_MATCH_CAPABILITIES = new WeakMap();
  var LANDING_MATCH_CONNECTORS = new WeakMap();
  var CACHED_EVENT_KERNEL = null;

  function clone(value) {
    if (value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clone);
    var result = {};
    Object.keys(value).forEach(function (key) { result[key] = clone(value[key]); });
    return result;
  }

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }

  function snapshot(value) { return freeze(clone(value)); }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function modulo(value, length) { return ((value % length) + length) % length; }
  function otherTeam(index) { return index === 0 ? 1 : 0; }

  function required(value, label) {
    var text = String(value == null ? '' : value).trim();
    if (!text) throw new TypeError(label + ' is required');
    return text;
  }

  function integer(value, fallback, minimum) {
    var number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    number = Math.floor(number);
    if (!Number.isSafeInteger(number)) return fallback;
    if (minimum != null && number < minimum) return fallback;
    return number;
  }

  function finite(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function stableHash(value) {
    var text = String(value);
    var hash = 2166136261;
    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function hex32(value) {
    return (value >>> 0).toString(16).padStart(8, '0');
  }

  function resolutionNamespace(formatId, matchId) {
    return 'v112.' + encodeURIComponent(required(formatId, 'rules format')) + '.' +
      encodeURIComponent(required(matchId, 'matchId'));
  }

  function resolutionToken(namespace, ordinal, boundCallerId) {
    var caller = boundCallerId == null ? '' : callerFlipId(boundCallerId);
    var material = namespace + '|' + ordinal + '|' + encodeURIComponent(caller) +
      '|pressure-signal';
    return hex32(stableHash('a|' + material)) + hex32(stableHash('b|' + material));
  }

  function callerFlipId(value) {
    if (value == null) return null;
    var id = required(value, 'caller flip id');
    if (id.length > MAX_CALLER_FLIP_ID_LENGTH) {
      throw new RangeError('caller flip id exceeds ' + MAX_CALLER_FLIP_ID_LENGTH + ' characters');
    }
    return id;
  }

  function resolutionId(namespace, ordinal, token, callerId) {
    return 'ri1|' + namespace + '|' + ordinal + '|' + token + '|' +
      (callerId == null ? '' : encodeURIComponent(callerId));
  }

  function makeResolutionIdentity(namespace, ordinal, callerId) {
    var safeOrdinal = integer(ordinal, NaN, 1);
    if (!Number.isSafeInteger(safeOrdinal)) throw new TypeError('resolution ordinal must be a safe integer');
    var safeCallerId = callerFlipId(callerId);
    var token = resolutionToken(namespace, safeOrdinal, safeCallerId);
    return freeze({
      schema: RESOLUTION_IDENTITY_SCHEMA,
      namespace: namespace,
      ordinal: safeOrdinal,
      token: token,
      callerId: safeCallerId,
      id: resolutionId(namespace, safeOrdinal, token, safeCallerId),
    });
  }

  function parseResolutionId(value) {
    var text = required(value, 'resolution identity id');
    var parts = text.split('|');
    if (parts.length !== 5 || parts[0] !== 'ri1') {
      throw new TypeError('Explicit flipId must be a ResolutionIdentityV1 id');
    }
    var ordinal = integer(parts[2], NaN, 1);
    if (!Number.isSafeInteger(ordinal) || String(ordinal) !== parts[2]) {
      throw new TypeError('Invalid resolution identity ordinal');
    }
    var decodedCaller = null;
    if (parts[4]) {
      try { decodedCaller = decodeURIComponent(parts[4]); }
      catch (error) { throw new TypeError('Invalid encoded caller flip id'); }
    }
    var identity = makeResolutionIdentity(parts[1], ordinal, decodedCaller);
    if (identity.token !== parts[3] || identity.id !== text) {
      throw new Error('Resolution identity token is invalid');
    }
    return identity;
  }

  function createResolutionHighWater(formatId, matchId) {
    var namespace = resolutionNamespace(formatId, matchId);
    return freeze({
      schema: RESOLUTION_IDENTITY_SCHEMA,
      namespace: namespace,
      resolvedThrough: 0,
      nextOrdinal: 1,
      expectedToken: resolutionToken(namespace, 1, null),
    });
  }

  function alignToRotation(turns, playerCount) {
    var count = Math.max(1, integer(playerCount, 1, 1));
    var requested = Math.max(0, integer(turns, 0, 0));
    return requested === 0 ? 0 : Math.ceil(requested / count) * count;
  }

  function additiveLifeCap(startingLives) {
    var cap = Math.ceil(Math.max(1, integer(startingLives, 1, 1)) * 1.5);
    if (!Number.isSafeInteger(cap)) throw new RangeError('Starting lives exceed safe integer range');
    return cap;
  }

  function addLivesCapped(lives, amount, startingLives) {
    var before = Math.max(0, integer(lives, 0, 0));
    var requested = Math.max(0, integer(amount, 0, 0));
    var cap = additiveLifeCap(startingLives);
    var after = before >= cap ? before : Math.min(cap, before + requested);
    return freeze({ lives: after, gained: after - before, cap: cap,
      requested: requested });
  }

  function multiplyLives(lives, multiplier) {
    var before = Math.max(0, integer(lives, 0, 0));
    var factor = finite(multiplier, NaN);
    if (!Number.isFinite(factor) || factor < 0) {
      throw new RangeError('Life multiplier must be a non-negative number');
    }
    var result = Math.max(0, Math.ceil(before * factor));
    if (!Number.isSafeInteger(result)) throw new RangeError('Life multiplication exceeds safe integer range');
    return result;
  }

  function halveLives(lives) {
    return Math.max(1, Math.ceil(Math.max(0, integer(lives, 0, 0)) / 2));
  }

  function normalizeRequest(input) {
    var source = object(input);
    if (source.schema !== 'MatchRequestV2') return source;
    return Object.assign({}, clone(object(source.rulesOptions)), {
      matchId: source.matchId,
      formatId: source.formatId,
      physicsModeId: source.physicsModeId,
      players: clone(source.roster),
      seed: source.seed,
    });
  }

  function normalizePlayers(value, limits) {
    var options = object(limits);
    var list = Array.isArray(value) ? value : [];
    var minimum = integer(options.minimum, 2, 1);
    var maximum = integer(options.maximum, 16, minimum);
    if (list.length < minimum || list.length > maximum) {
      throw new RangeError('Player count must be between ' + minimum + ' and ' + maximum);
    }
    var ids = new Set();
    return list.map(function (entry, seat) {
      var source = object(entry);
      var id = required(source.id != null ? source.id : source.playerId, 'player id');
      if (ids.has(id)) throw new TypeError('Duplicate player id: ' + id);
      ids.add(id);
      var sourceKind = String(source.kind || source.type || '').toLowerCase();
      var isAI = source.isAI === true || source.ai === true || source.cpu === true ||
        source.isCpu === true || source.human === false || sourceKind === 'cpu' || sourceKind === 'ai';
      var cpuTier = source.cpuTier == null ? null : integer(source.cpuTier, NaN, 0);
      if (source.cpuTier != null && !Number.isFinite(cpuTier)) {
        throw new TypeError('cpuTier must be a non-negative integer');
      }
      var displayName = source.displayName != null ? String(source.displayName)
        : (source.name != null ? String(source.name) : null);
      return {
        id: id,
        seat: seat,
        name: displayName,
        displayName: displayName,
        kind: isAI ? 'cpu' : 'human',
        human: !isAI,
        isAI: isAI,
        cpuTier: isAI ? cpuTier : null,
        teamId: source.teamId == null ? null : String(source.teamId),
        flipperId: source.flipperId || source.objectId || source.skin || null,
        variantId: source.variantId || null,
        cosmeticId: source.cosmeticId || null,
        lives: 0,
        streak: 0,
        bestStreak: 0,
        onFire: false,
        heatingUp: false,
        eliminated: false,
        alwaysMagnet: source.alwaysMagnet === true,
      };
    });
  }

  function rosterFromSource(source) {
    if (Array.isArray(source.players)) return source.players;
    if (Array.isArray(source.roster)) return source.roster;
    if (Array.isArray(source.defs)) return source.defs;
    if (Array.isArray(source.playerIds)) {
      return source.playerIds.map(function (id) { return { id: id }; });
    }
    var count = integer(source.playerCount, 0, 0);
    return Array.from({ length: count }, function (_, index) {
      return { id: 'seat-' + (index + 1) };
    });
  }

  function normalizeOpponentTargeting(source, players) {
    var targeting = object(source.opponentTargeting);
    var allied = Array.isArray(targeting.alliedHumanIds) ? targeting.alliedHumanIds
      : (Array.isArray(source.alliedHumanIds) ? source.alliedHumanIds : []);
    allied = Array.from(new Set(allied.map(String)));
    var known = new Map(players.map(function (player) { return [player.id, player]; }));
    allied.forEach(function (id) {
      if (!known.has(id)) throw new TypeError('Unknown allied human id: ' + id);
      if (known.get(id).isAI) throw new TypeError('Allied human id refers to a CPU: ' + id);
    });
    return freeze({
      excludeAlliedHumans: targeting.excludeAlliedHumans === true,
      alliedHumanIds: allied,
    });
  }

  function normalizeClearCondition(source, players) {
    var condition = object(source.clearCondition);
    var winners = Array.from(new Set(Array.isArray(condition.anyWinnerId)
      ? condition.anyWinnerId.map(String) : []));
    var known = new Set(players.map(function (player) { return player.id; }));
    winners.forEach(function (id) {
      if (!known.has(id)) throw new TypeError('Unknown clear-condition winner id: ' + id);
    });
    return freeze({ anyWinnerId: winners });
  }

  function validateResolutionHighWater(state) {
    var highWater = object(state.resolutionIdentity);
    var namespace = resolutionNamespace(state.formatId, state.matchId);
    if (Object.prototype.hasOwnProperty.call(state, 'resolvedFlipIds')) {
      throw new Error('Unbounded resolved flip histories are not valid rules state');
    }
    var expectedHighWater = {
      schema: RESOLUTION_IDENTITY_SCHEMA,
      namespace: namespace,
      resolvedThrough: state.sequence,
      nextOrdinal: state.sequence + 1,
      expectedToken: resolutionToken(namespace, state.sequence + 1, null),
    };
    if (!sameCanonicalValue(highWater, expectedHighWater)) {
      throw new Error('Resolution identity high-water mark or namespace is invalid');
    }
    if (!Number.isSafeInteger(state.sequence) || state.sequence < 0 ||
        highWater.resolvedThrough !== state.sequence ||
        highWater.nextOrdinal !== state.sequence + 1 ||
        highWater.expectedToken !== resolutionToken(namespace, state.sequence + 1, null)) {
      throw new Error('Resolution identity high-water mark is invalid');
    }
    if (state.sequence === 0) {
      if (state.lastOutcomeId != null) throw new Error('Unresolved state cannot have a last outcome ID');
    } else {
      var last = parseResolutionId(state.lastOutcomeId);
      if (last.namespace !== namespace || last.ordinal !== state.sequence) {
        throw new Error('Last outcome does not match the resolution high-water mark');
      }
    }
    return true;
  }

  function nextResolutionIdentity(state, callerId) {
    validateResolutionHighWater(state);
    var highWater = state.resolutionIdentity;
    return makeResolutionIdentity(highWater.namespace, highWater.nextOrdinal, callerId);
  }

  function requestedResolutionIdentity(state, source) {
    var supplied = source.resolutionIdentity;
    var identity;
    if (supplied != null) {
      var candidate = object(supplied);
      identity = makeResolutionIdentity(required(candidate.namespace, 'resolution namespace'),
        candidate.ordinal, candidate.callerId);
      if (candidate.schema !== RESOLUTION_IDENTITY_SCHEMA || candidate.token !== identity.token ||
          candidate.id !== identity.id) {
        throw new Error('ResolutionIdentityV1 payload is invalid');
      }
      if (source.flipId != null && String(source.flipId) !== identity.id &&
          String(source.flipId) !== identity.callerId) {
        throw new Error('flipId does not match its ResolutionIdentityV1 payload');
      }
    } else if (source.flipId != null) {
      identity = parseResolutionId(source.flipId);
    } else {
      identity = nextResolutionIdentity(state, null);
    }
    var highWater = state.resolutionIdentity;
    if (identity.namespace !== highWater.namespace || identity.ordinal !== highWater.nextOrdinal ||
        highWater.expectedToken !== resolutionToken(highWater.namespace, highWater.nextOrdinal, null)) {
      throw new Error('Duplicate, stale, future, or foreign resolution identity');
    }
    return identity;
  }

  function claimResolutionIdentity(state, identity) {
    state.sequence = identity.ordinal;
    state.lastOutcomeId = identity.id;
    state.resolutionIdentity = {
      schema: RESOLUTION_IDENTITY_SCHEMA,
      namespace: identity.namespace,
      resolvedThrough: identity.ordinal,
      nextOrdinal: identity.ordinal + 1,
      expectedToken: resolutionToken(identity.namespace, identity.ordinal + 1, null),
    };
  }

  function eventCapabilityRecord(value) {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
      throw new TypeError('A Rules-issued event match capability is required');
    }
    var record = EVENT_MATCH_CAPABILITIES.get(value);
    if (!record) throw new TypeError('A Rules-issued event match capability is required');
    return record;
  }

  function inspectEventMatchCapability(value) {
    var record = eventCapabilityRecord(value);
    var state = record.getState();
    validateResolutionHighWater(state);
    return freeze({ schema: 'EventMatchAuthoritySnapshotV1', matchId: state.matchId,
      formatId: state.formatId, namespace: state.resolutionIdentity.namespace,
      resolvedThrough: state.resolutionIdentity.resolvedThrough,
      nextOrdinal: state.resolutionIdentity.nextOrdinal, phase: state.phase });
  }

  function landingConnectorRecord(value) {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
      throw new TypeError('A Rules-issued landing connector is required');
    }
    var record = LANDING_MATCH_CONNECTORS.get(value);
    if (!record) throw new TypeError('A Rules-issued landing connector is required');
    return record;
  }

  // This is a trusted-core handshake, not a browser API. The caller proof is
  // created inside v112-landing-verdict.js and never appears in a verdict or
  // facade. A schema-shaped copy therefore cannot acquire mutation authority.
  function claimLandingMatchConnector(value, claimantProof) {
    var record = landingConnectorRecord(value);
    if (!claimantProof || (typeof claimantProof !== 'object' &&
        typeof claimantProof !== 'function')) {
      throw new TypeError('Landing connector claimant proof is required');
    }
    if (record.claimed) throw new Error('Rules landing connector was already claimed');
    record.claimed = true;
    record.claimantProof = claimantProof;
    function assertProof(proof) {
      if (proof !== record.claimantProof) {
        throw new TypeError('Landing connector claimant proof is invalid');
      }
    }
    return Object.freeze({
      schema: 'RulesLandingBridgeV1',
      inspect: function (proof) {
        assertProof(proof);
        var state = record.getState();
        validateResolutionHighWater(state);
        return freeze({ matchId: state.matchId, formatId: state.formatId,
          phase: state.phase, turn: clone(state.turn),
          resolutionIdentity: clone(state.resolutionIdentity) });
      },
      nextResolutionIdentity: function (proof, callerId) {
        assertProof(proof);
        return nextResolutionIdentity(record.getState(), callerId);
      },
      resolve: function (proof, input) {
        assertProof(proof);
        return record.resolve(input);
      },
    });
  }

  function eventKernelModule() {
    if (CACHED_EVENT_KERNEL) return CACHED_EVENT_KERNEL;
    var kernel = null;
    // Lazy loading avoids the Rules <-> EventKernel CommonJS cycle during
    // module initialization. By the time a live match claims its authority,
    // both modules have finished evaluating.
    kernel = loadEventKernel();
    if (!kernel || kernel.schema !== 'FlipgameEventKernelV2' ||
        typeof kernel.createAuthority !== 'function' || !Object.isFrozen(kernel)) {
      throw new Error('FlipgameV112EventKernel V2 must load before event authority is claimed');
    }
    CACHED_EVENT_KERNEL = kernel;
    return CACHED_EVENT_KERNEL;
  }

  function normalizeLanding(input) {
    var source = object(input);
    var rawResult = source.result == null ? null : String(source.result).toUpperCase();
    var pose = String(source.pose || (source.onCap ? 'cap' : '')).toLowerCase();
    if (!rawResult) rawResult = pose === 'upright' || pose === 'cap' ? 'MAKE' : 'MISS';
    if (rawResult !== 'MAKE' && rawResult !== 'MISS') {
      throw new RangeError('Flip result must be MAKE or MISS');
    }
    if (rawResult === 'MISS') pose = 'miss';
    else if (pose !== 'cap') pose = 'upright';
    var golden = source.golden === true;
    return freeze({ result: rawResult, pose: pose, made: rawResult === 'MAKE',
      onCap: pose === 'cap', golden: golden,
      worth: rawResult === 'MAKE' && (pose === 'cap' || golden) ? 2 : (rawResult === 'MAKE' ? 1 : 0),
      reason: source.reason == null ? null : String(source.reason) });
  }

  function normalizeEffects(input) {
    var source = object(input);
    var multiplier = source.lifeMultiplier == null ? null : finite(source.lifeMultiplier, NaN);
    if (multiplier != null && (!Number.isFinite(multiplier) || multiplier < 0)) {
      throw new RangeError('lifeMultiplier must be a non-negative number');
    }
    var setOpponentsTo = source.setOpponentsTo == null ? null
      : Math.max(0, integer(source.setOpponentsTo, 0, 0));
    return freeze({
      additiveLives: Math.max(0, integer(source.additiveLives, 0, 0)),
      lifeMultiplier: multiplier,
      halveOpponents: source.halveOpponents === true,
      setOpponentsTo: setOpponentsTo,
      excludedTargetIds: Array.from(new Set(Array.isArray(source.excludedTargetIds)
        ? source.excludedTargetIds.map(String) : [])),
      forceEliminateActor: source.forceEliminateActor === true,
      forceEliminateIds: Array.from(new Set(Array.isArray(source.forceEliminateIds)
        ? source.forceEliminateIds.map(String) : [])),
      grantAlwaysMagnet: source.grantAlwaysMagnet === true,
      metadata: clone(object(source.metadata)),
    });
  }

  function playerById(state, playerId) {
    return state.players.find(function (player) { return player.id === playerId; }) || null;
  }

  function activePlayers(state) {
    return state.players.filter(function (player) { return !player.eliminated; });
  }

  function activeOrder(state, startIndex) {
    var result = [];
    if (!state.players.length) return result;
    for (var offset = 0; offset < state.players.length; offset += 1) {
      var index = modulo(startIndex + offset * state.config.direction, state.players.length);
      if (!state.players[index].eliminated) result.push(state.players[index]);
    }
    return result;
  }

  function nextActiveIndex(state, fromIndex) {
    for (var offset = 1; offset <= state.players.length; offset += 1) {
      var index = modulo(fromIndex + offset * state.config.direction, state.players.length);
      if (!state.players[index].eliminated) return index;
    }
    return fromIndex;
  }

  function eliminatePlayer(state, playerId) {
    var player = playerById(state, playerId);
    if (!player || player.eliminated) return false;
    player.lives = 0;
    player.eliminated = true;
    player.onFire = false;
    player.heatingUp = false;
    player.streak = 0;
    if (state.onFirePlayerId === player.id) {
      state.lastFireRun = { playerId: player.id, earned: state.onFireEarned,
        peakStreak: player.bestStreak, reason: 'eliminated' };
      state.onFirePlayerId = null;
      state.onFireEarned = 0;
    }
    return true;
  }

  function makeSuddenDeathBand(state, level, startIndex) {
    var ordered = activeOrder(state, startIndex == null ? state.currentPlayerIndex : startIndex);
    var targetPerPlayer = ordered.length
      ? Math.max(1, Math.ceil(state.config.suddenDeathStepTurns / ordered.length)) : 0;
    var counts = {};
    ordered.forEach(function (player) { counts[player.id] = 0; });
    return {
      id: 'sd-' + level + '-' + state.rulesTurnCounter,
      level: level,
      rosterIds: ordered.map(function (player) { return player.id; }),
      targetTurnsPerPlayer: targetPerPlayer,
      targetTurns: targetPerPlayer * ordered.length,
      countedTurns: 0,
      turnsByPlayer: counts,
    };
  }

  function suddenDeathBandComplete(state) {
    var band = state.suddenDeath.band;
    if (!band) return false;
    return band.rosterIds.every(function (id) {
      var player = playerById(state, id);
      return !player || player.eliminated || band.turnsByPlayer[id] >= band.targetTurnsPerPlayer;
    });
  }

  function advanceCompletedSuddenDeathBand(state, startIndex) {
    if (!state.suddenDeath || state.suddenDeath.phase !== 'sudden-death' ||
        activePlayers(state).length <= 1 || !suddenDeathBandComplete(state)) return false;
    state.suddenDeath.level += 1;
    state.suddenDeath.band = makeSuddenDeathBand(state, state.suddenDeath.level,
      startIndex == null ? state.currentPlayerIndex : startIndex);
    return true;
  }

  function recordCompetitiveTurn(state, playerId) {
    var sudden = state.suddenDeath;
    state.rulesTurnCounter += 1;
    sudden.countedTurns += 1;
    if (!sudden.enabled) return;
    if (sudden.phase === 'regulation') {
      if (sudden.countedTurns >= sudden.activationTurn) {
        sudden.phase = 'sudden-death';
        sudden.level = 1;
        sudden.band = makeSuddenDeathBand(state, sudden.level,
          nextActiveIndex(state, state.currentPlayerIndex));
      }
      return;
    }
    var band = sudden.band;
    if (band && Object.prototype.hasOwnProperty.call(band.turnsByPlayer, playerId)) {
      band.turnsByPlayer[playerId] += 1;
      band.countedTurns += 1;
    }
    advanceCompletedSuddenDeathBand(state, nextActiveIndex(state, state.currentPlayerIndex));
  }

  function currentSuddenDeathPenalty(state, player) {
    if (!state.suddenDeath.enabled || state.suddenDeath.phase !== 'sudden-death') return 0;
    if (player && player.onFire) return 0;
    return state.suddenDeath.level;
  }

  function classicTurnMetadata(state) {
    if (state.phase === 'complete') {
      return freeze({ current: null, onDeck: null, afterThat: null, signals: [] });
    }
    var order = activeOrder(state, state.currentPlayerIndex);
    if (!order.length) return freeze({ current: null, onDeck: null, afterThat: null, signals: [] });
    var current = order[0];
    var onDeck = order.length > 1 ? order[1] : order[0];
    var afterThat = order.length > 2 ? order[2] : order[0];
    var penalty = current.onFire ? 0 : state.stake + currentSuddenDeathPenalty(state, current);
    var signals = [];
    if (current.onFire) signals.push('on-fire');
    if (state.suddenDeath.phase === 'sudden-death') signals.push('sudden-death-' + state.suddenDeath.level);
    if (!current.onFire && penalty > 0 && current.lives - penalty <= 0 && order.length === 2) {
      signals.push('heat-point');
    }
    return freeze({ current: current.id, onDeck: onDeck.id, afterThat: afterThat.id,
      missPenalty: penalty, missWouldEliminate: penalty > 0 && current.lives - penalty <= 0,
      signals: signals });
  }

  function normalizeClassicConfig(input) {
    var source = normalizeRequest(input);
    var players = normalizePlayers(rosterFromSource(source), { minimum: 2, maximum: 16 });
    var startingLives = source.startingLives == null ? 10 : Number(source.startingLives);
    if (!Number.isSafeInteger(startingLives) || startingLives < 1) {
      throw new RangeError('startingLives must be a positive safe integer');
    }
    var direction = source.direction === -1 ? -1 : 1;
    var startIndex = modulo(integer(source.startIndex != null ? source.startIndex : source.openingIndex, 0), players.length);
    var requestedThreshold;
    if (source.suddenDeathAfterRotations != null) {
      requestedThreshold = Math.max(0, integer(source.suddenDeathAfterRotations, 0, 0)) * players.length;
    } else {
      requestedThreshold = Math.max(0, integer(source.suddenDeathAfterTurns != null
        ? source.suddenDeathAfterTurns : (source.suddenDeathFlipThreshold != null
          ? source.suddenDeathFlipThreshold : source.requestedSuddenDeathTurns),
      DEFAULT_CLASSIC_SUDDEN_DEATH_TURNS, 0));
    }
    var opponentTargeting = normalizeOpponentTargeting(source, players);
    var clearCondition = normalizeClearCondition(source, players);
    return freeze({
      schema: 'ClassicRulesConfigV1',
      matchId: required(source.matchId || 'local-classic', 'matchId'),
      formatId: 'classic',
      physicsModeId: String(source.physicsModeId || 'normal'),
      players: players,
      startingLives: startingLives,
      additiveLifeCap: additiveLifeCap(startingLives),
      direction: direction,
      startIndex: startIndex,
      suddenDeathEnabled: source.suddenDeathEnabled !== false,
      requestedSuddenDeathTurns: requestedThreshold,
      suddenDeathActivationTurn: alignToRotation(requestedThreshold, players.length),
      suddenDeathStepTurns: Math.max(1, integer(source.suddenDeathStepTurns,
        DEFAULT_SUDDEN_DEATH_STEP_TURNS, 1)),
      opponentTargeting: opponentTargeting,
      alliedHumanIds: opponentTargeting.alliedHumanIds,
      clearCondition: clearCondition,
      seed: integer(source.seed, 1) >>> 0,
      rematchNumber: Math.max(0, integer(source.rematchNumber, 0, 0)),
    });
  }

  function createClassicState(input) {
    // A schema tag is descriptive, never authority. Re-normalizing also
    // recomputes caps and padded boundaries instead of trusting saved values.
    var config = normalizeClassicConfig(input);
    var players = config.players.map(function (definition) {
      var player = clone(definition);
      player.lives = config.startingLives;
      player.streak = 0;
      player.bestStreak = 0;
      player.onFire = false;
      player.heatingUp = false;
      player.eliminated = false;
      return player;
    });
    var state = {
      schema: 'ClassicRulesStateV1',
      version: VERSION,
      config: clone(config),
      matchId: config.matchId,
      formatId: 'classic',
      phase: 'active',
      players: players,
      currentPlayerIndex: config.startIndex,
      attemptCounter: 0,
      rulesTurnCounter: 0,
      sequence: 0,
      resolutionIdentity: createResolutionHighWater('classic', config.matchId),
      stake: 0,
      onFirePlayerId: null,
      onFireEarned: 0,
      lastFireRun: null,
      winnerIds: [],
      completionReason: null,
      suddenDeath: {
        enabled: config.suddenDeathEnabled,
        phase: config.suddenDeathEnabled && config.suddenDeathActivationTurn === 0
          ? 'sudden-death' : 'regulation',
        configuredTurn: config.requestedSuddenDeathTurns,
        activationTurn: config.suddenDeathActivationTurn,
        countedTurns: 0,
        level: config.suddenDeathEnabled && config.suddenDeathActivationTurn === 0 ? 1 : 0,
        band: null,
      },
      turn: null,
      lastOutcomeId: null,
    };
    if (state.suddenDeath.phase === 'sudden-death') {
      state.suddenDeath.band = makeSuddenDeathBand(state, 1);
    }
    state.turn = classicTurnMetadata(state);
    return freeze(state);
  }

  function applyAdditive(player, requested, startingLives) {
    var applied = addLivesCapped(player.lives, requested, startingLives);
    player.lives = applied.lives;
    return applied.gained;
  }

  function applySuccessfulEffects(state, actor, effects, onFireReward) {
    var targeting = object(state.config.opponentTargeting);
    var allied = new Set(Array.isArray(targeting.alliedHumanIds)
      ? targeting.alliedHumanIds.map(String) : []);
    var alliancePolicy = allied.size > 0;
    // In Story/co-op, rules-owned alliance membership is authoritative. A
    // caller cannot smuggle target-only exclusions into a CPU action.
    var protectedIds = new Set(alliancePolicy ? [] : effects.excludedTargetIds);
    if (targeting.excludeAlliedHumans === true && allied.has(actor.id)) {
      (Array.isArray(targeting.alliedHumanIds) ? targeting.alliedHumanIds : [])
        .forEach(function (id) { if (String(id) !== actor.id) protectedIds.add(String(id)); });
    }
    var summary = {
      onFireRequested: Math.max(0, integer(onFireReward, 0, 0)),
      onFireApplied: 0,
      additiveRequested: effects.additiveLives,
      additiveApplied: 0,
      multiplier: effects.lifeMultiplier,
      multipliedDelta: 0,
      halvedOpponentIds: [],
      setOpponentIds: [],
      forcedEliminatedIds: [],
      protectedTargetIds: Array.from(protectedIds),
      alwaysMagnetGranted: false,
      metadata: clone(effects.metadata),
    };
    if (summary.onFireRequested) {
      summary.onFireApplied = applyAdditive(actor, summary.onFireRequested, state.config.startingLives);
    }
    if (effects.additiveLives) {
      summary.additiveApplied = applyAdditive(actor, effects.additiveLives, state.config.startingLives);
    }
    if (effects.lifeMultiplier != null) {
      var beforeMultiply = actor.lives;
      actor.lives = multiplyLives(actor.lives, effects.lifeMultiplier);
      summary.multipliedDelta = actor.lives - beforeMultiply;
    }
    if (effects.grantAlwaysMagnet) {
      actor.alwaysMagnet = true;
      summary.alwaysMagnetGranted = true;
    }
    state.players.forEach(function (opponent) {
      if (opponent.id === actor.id || opponent.eliminated || protectedIds.has(opponent.id)) return;
      if (effects.halveOpponents) {
        opponent.lives = halveLives(opponent.lives);
        summary.halvedOpponentIds.push(opponent.id);
      }
      if (effects.setOpponentsTo != null) {
        opponent.lives = Math.max(1, effects.setOpponentsTo);
        summary.setOpponentIds.push(opponent.id);
      }
    });
    var forced = effects.forceEliminateIds.slice();
    if (effects.forceEliminateActor) forced.push(actor.id);
    Array.from(new Set(forced)).forEach(function (id) {
      if (id !== actor.id && protectedIds.has(id)) return;
      if (eliminatePlayer(state, id)) summary.forcedEliminatedIds.push(id);
    });
    if (actor.lives <= 0 && eliminatePlayer(state, actor.id)) {
      summary.forcedEliminatedIds.push(actor.id);
    }
    return summary;
  }

  function alliedClearWinners(state, survivors) {
    var condition = object(state.config.clearCondition);
    var eligible = Array.isArray(condition.anyWinnerId) ? condition.anyWinnerId : [];
    if (!eligible.length || !survivors.length) return [];
    var eligibleSet = new Set(eligible);
    return survivors.every(function (player) { return eligibleSet.has(player.id); })
      ? survivors.map(function (player) { return player.id; }) : [];
  }

  function positiveClassicCues(landing, facts) {
    var cues = [];
    if (landing.made) cues.push('make');
    if (landing.onCap) cues.push('cap-landing');
    if (facts.justIgnited) cues.push('on-fire');
    if (facts.onFireApplied > 0) cues.push('life-earned');
    if (facts.fireCapped) cues.push('on-fire-cap');
    if (facts.streakAfter >= 5) cues.push('hot-streak');
    if (facts.completed && facts.winnerIds.length) cues.push('match-win');
    return cues;
  }

  function resolveClassicFlip(state, input) {
    validateClassicState(state);
    if (state.phase !== 'active') throw new Error('Classic match is complete');
    var source = object(input);
    var resolutionIdentity = requestedResolutionIdentity(state, source);
    var sequence = resolutionIdentity.ordinal;
    var outcomeId = resolutionIdentity.id;
    var next = clone(state);
    var actor = next.players[next.currentPlayerIndex];
    var requestedActorId = source.playerId == null ? actor.id : String(source.playerId);
    if (requestedActorId !== actor.id) throw new Error('Flip is out of turn: ' + requestedActorId);
    var landing = normalizeLanding(source);
    var effects = normalizeEffects(source.effects);
    var livesBefore = actor.lives;
    var stakeBefore = next.stake;
    var streakBefore = actor.streak;
    var fireBefore = actor.onFire && next.onFirePlayerId === actor.id;
    var suddenLevelBefore = next.suddenDeath.level;
    var penalty = 0;
    var countedForSuddenDeath = false;
    var justIgnited = false;
    var fireEnded = false;
    var fireCapped = false;
    var protectedFireMiss = false;
    var retainTurn = false;
    var effectSummary = applySuccessfulEffects(next, actor, normalizeEffects({}), 0);

    next.sequence = sequence;
    next.attemptCounter += 1;

    if (fireBefore) {
      if (landing.made) {
        actor.streak += 1;
        actor.bestStreak = Math.max(actor.bestStreak, actor.streak);
        effectSummary = applySuccessfulEffects(next, actor, effects, landing.worth);
        next.onFireEarned += effectSummary.onFireApplied;
        if (actor.eliminated || actor.lives >= next.config.additiveLifeCap) {
          fireCapped = !actor.eliminated;
          fireEnded = true;
          actor.onFire = false;
          actor.heatingUp = false;
          next.lastFireRun = { playerId: actor.id, earned: next.onFireEarned,
            peakStreak: actor.streak, reason: actor.eliminated ? 'eliminated' : 'life-cap' };
          actor.streak = 0;
          next.onFirePlayerId = null;
          next.onFireEarned = 0;
        } else {
          retainTurn = true;
        }
      } else {
        protectedFireMiss = true;
        fireEnded = true;
        actor.onFire = false;
        actor.heatingUp = false;
        next.lastFireRun = { playerId: actor.id, earned: next.onFireEarned,
          peakStreak: actor.streak, reason: 'miss' };
        actor.streak = 0;
        next.onFirePlayerId = null;
        next.onFireEarned = 0;
      }
    } else {
      countedForSuddenDeath = true;
      if (landing.made) {
        actor.streak += 1;
        actor.bestStreak = Math.max(actor.bestStreak, actor.streak);
        actor.heatingUp = actor.streak === 2;
        next.stake += landing.worth;
        effectSummary = applySuccessfulEffects(next, actor, effects, 0);
        if (!actor.eliminated && actor.streak >= 3 && actor.lives < next.config.additiveLifeCap) {
          actor.onFire = true;
          actor.heatingUp = false;
          next.onFirePlayerId = actor.id;
          next.onFireEarned = 0;
          justIgnited = true;
          retainTurn = true;
        }
      } else {
        penalty = next.stake + currentSuddenDeathPenalty(next, actor);
        actor.lives = Math.max(0, actor.lives - penalty);
        actor.streak = 0;
        actor.heatingUp = false;
        actor.onFire = false;
        next.stake = 0;
        if (actor.lives <= 0) eliminatePlayer(next, actor.id);
      }
      recordCompetitiveTurn(next, actor.id);
    }

    var eliminatedIds = state.players.filter(function (beforePlayer) {
      var afterPlayer = playerById(next, beforePlayer.id);
      return !beforePlayer.eliminated && afterPlayer && afterPlayer.eliminated;
    }).map(function (player) { return player.id; });
    var survivors = activePlayers(next);
    var clearWinners = alliedClearWinners(next, survivors);
    if (clearWinners.length) {
      next.phase = 'complete';
      next.winnerIds = clearWinners;
      next.completionReason = 'allied-survivors';
      retainTurn = false;
    } else if (survivors.length <= 1) {
      next.phase = 'complete';
      next.winnerIds = survivors.map(function (player) { return player.id; });
      next.completionReason = survivors.length ? 'last-player-standing' : 'no-survivors';
      retainTurn = false;
    } else if (!retainTurn) {
      next.currentPlayerIndex = nextActiveIndex(next, state.currentPlayerIndex);
    }
    claimResolutionIdentity(next, resolutionIdentity);
    next.turn = classicTurnMetadata(next);

    var facts = {
      justIgnited: justIgnited,
      fireEnded: fireEnded,
      fireCapped: fireCapped,
      protectedFireMiss: protectedFireMiss,
      onFireApplied: effectSummary.onFireApplied,
      streakAfter: actor.streak,
      completed: next.phase === 'complete',
      winnerIds: next.winnerIds,
    };
    var outcome = freeze({
      schema: OUTCOME_SCHEMA,
      version: VERSION,
      type: 'rules.classic-flip-resolved.v1',
      outcomeId: outcomeId,
      resolutionIdentity: resolutionIdentity,
      matchId: next.matchId,
      sequence: sequence,
      formatId: 'classic',
      playerId: actor.id,
      landing: landing,
      lives: { before: livesBefore, after: actor.lives, delta: actor.lives - livesBefore,
        additiveCap: next.config.additiveLifeCap },
      stake: { before: stakeBefore, after: next.stake },
      streak: { before: streakBefore, after: actor.streak, best: actor.bestStreak },
      onFire: { before: fireBefore, after: actor.onFire, justIgnited: justIgnited,
        ended: fireEnded, capped: fireCapped, protectedMiss: protectedFireMiss,
        rewardApplied: effectSummary.onFireApplied },
      suddenDeath: { levelBefore: suddenLevelBefore, levelAfter: next.suddenDeath.level,
        counted: countedForSuddenDeath, penalty: fireBefore ? 0 : Math.max(0, penalty),
        configuredActivationTurn: state.suddenDeath.configuredTurn,
        paddedActivationTurn: state.suddenDeath.activationTurn,
        minimumBandTurns: state.config.suddenDeathStepTurns,
        paddedBandTurnsBefore: state.suddenDeath.band ? state.suddenDeath.band.targetTurns : 0,
        paddedBandTurnsAfter: next.suddenDeath.band ? next.suddenDeath.band.targetTurns : 0,
        turnsPerActiveSeatBefore: state.suddenDeath.band
          ? state.suddenDeath.band.targetTurnsPerPlayer : 0,
        turnsPerActiveSeatAfter: next.suddenDeath.band
          ? next.suddenDeath.band.targetTurnsPerPlayer : 0,
        bandProgressBefore: state.suddenDeath.band ? state.suddenDeath.band.countedTurns : 0,
        bandProgressAfter: next.suddenDeath.band ? next.suddenDeath.band.countedTurns : 0 },
      effects: freeze(effectSummary),
      eliminatedIds: eliminatedIds,
      completed: next.phase === 'complete',
      winnerIds: next.winnerIds.slice(),
      completionReason: next.completionReason,
      turn: next.turn,
      presentation: { positiveOnly: true, cues: positiveClassicCues(landing, facts) },
    });
    return freeze({ schema: 'RulesTransitionV1', state: freeze(next), outcome: outcome });
  }

  function classicMissWouldEliminate(state) {
    validateClassicState(state);
    if (state.phase !== 'active') return false;
    var player = state.players[state.currentPlayerIndex];
    if (!player || player.eliminated || player.onFire) return false;
    var penalty = state.stake + currentSuddenDeathPenalty(state, player);
    return penalty > 0 && player.lives - penalty <= 0;
  }

  function forceEliminate(state, playerIds, reason) {
    validateClassicState(state);
    var next = clone(state);
    var ids = Array.isArray(playerIds) ? playerIds.map(String) : [String(playerIds)];
    var removed = [];
    ids.forEach(function (id) { if (eliminatePlayer(next, id)) removed.push(id); });
    var survivors = activePlayers(next);
    var clearWinners = alliedClearWinners(next, survivors);
    if (clearWinners.length) {
      next.phase = 'complete';
      next.winnerIds = clearWinners;
      next.completionReason = reason || 'allied-survivors';
    } else if (survivors.length <= 1) {
      next.phase = 'complete';
      next.winnerIds = survivors.map(function (player) { return player.id; });
      next.completionReason = reason || 'forced-elimination';
    } else if (next.players[next.currentPlayerIndex].eliminated) {
      next.currentPlayerIndex = nextActiveIndex(next, next.currentPlayerIndex);
    }
    // An eliminated seat waives only its own unplayed allocation. If every
    // survivor had already completed the band, advance before advertising the
    // next turn; otherwise the owed survivor counts remain untouched.
    advanceCompletedSuddenDeathBand(next, next.currentPlayerIndex);
    next.turn = classicTurnMetadata(next);
    return freeze({ state: freeze(next), eliminatedIds: freeze(removed) });
  }

  function cupFormat(value) {
    var id = String(value || 'short').toLowerCase().replace('-cup', '');
    var format = CUP_FORMATS[id];
    if (!format) throw new RangeError('Cup length must be short or full');
    return format;
  }

  function normalizeCupConfig(input) {
    var source = normalizeRequest(input);
    var definition = cupFormat(source.cupLength || source.length || source.cupFormat);
    var players = normalizePlayers(rosterFromSource(source),
      { minimum: 2, maximum: definition.maxPlayers });
    return freeze({
      schema: 'CupRulesConfigV1',
      matchId: required(source.matchId || 'local-cup', 'matchId'),
      formatId: 'cup',
      cupLength: definition.id,
      players: players,
      startingLives: definition.startingLives,
      suddenDeathRotations: definition.suddenDeathRotations,
      bestOf: definition.bestOf,
      winsNeeded: definition.winsNeeded,
      direction: source.direction === -1 ? -1 : 1,
      startIndex: modulo(integer(source.startIndex != null ? source.startIndex : source.openingIndex, 0), players.length),
      seed: integer(source.seed, 1) >>> 0,
      rematchNumber: Math.max(0, integer(source.rematchNumber, 0, 0)),
    });
  }

  function cupHeatState(config, heatNumber, persistentMagnetIds) {
    var starter = modulo(config.startIndex + (heatNumber - 1) * config.direction, config.players.length);
    var players = config.players.map(function (player) {
      var next = clone(player);
      next.alwaysMagnet = persistentMagnetIds.indexOf(player.id) >= 0 || player.alwaysMagnet;
      return next;
    });
    return createClassicState({
      matchId: config.matchId + ':heat:' + heatNumber,
      players: players,
      startingLives: config.startingLives,
      direction: config.direction,
      startIndex: starter,
      suddenDeathAfterRotations: config.suddenDeathRotations,
      seed: config.seed ^ heatNumber,
    });
  }

  function cupWinsMap(players) {
    var result = {};
    players.forEach(function (player) { result[player.id] = 0; });
    return result;
  }

  function createCupState(input) {
    var config = normalizeCupConfig(input);
    var persistent = config.players.filter(function (player) { return player.alwaysMagnet; })
      .map(function (player) { return player.id; });
    var state = {
      schema: 'CupRulesStateV1', version: VERSION, config: clone(config),
      matchId: config.matchId, formatId: 'cup', cupLength: config.cupLength,
      phase: 'heat', sequence: 0, heatNumber: 1,
      resolutionIdentity: createResolutionHighWater('cup', config.matchId),
      heatWins: cupWinsMap(config.players), heatResults: [],
      persistentMagnetIds: persistent, currentHeat: cupHeatState(config, 1, persistent),
      shootout: null, winnerIds: [], completionReason: null,
      turn: null, lastOutcomeId: null,
    };
    state.turn = cupTurnMetadata(state);
    return freeze(state);
  }

  function orderedIdsFromSeat(players, startIndex, direction, allowedIds) {
    var allowed = allowedIds ? new Set(allowedIds) : null;
    var result = [];
    for (var offset = 0; offset < players.length; offset += 1) {
      var index = modulo(startIndex + offset * direction, players.length);
      if (!allowed || allowed.has(players[index].id)) result.push(players[index].id);
    }
    return result;
  }

  function buildCupShootout(state, participants, round, openerSeat, purpose) {
    var config = state.config;
    var order = orderedIdsFromSeat(config.players, openerSeat, config.direction, participants);
    return {
      round: round,
      purpose: purpose === 'heat' ? 'heat' : 'series',
      participantIds: participants.slice(),
      openerSeat: openerSeat,
      queue: order,
      queuePosition: 0,
      results: [],
      eventsDisabled: true,
    };
  }

  function cupTurnMetadata(state) {
    if (state.phase === 'complete' || state.phase === 'between-heats') {
      return freeze({ current: null, onDeck: null, afterThat: null, signals: [] });
    }
    if (state.phase === 'shootout') {
      var shootout = state.shootout;
      var remaining = shootout.queue.slice(shootout.queuePosition);
      return freeze({ current: remaining[0] || null, onDeck: remaining[1] || null,
        afterThat: remaining[2] || null, signals: ['shootout'], eventsDisabled: true });
    }
    var base = clone(state.currentHeat.turn);
    var signals = base.signals ? base.signals.slice() : [];
    if (signals.indexOf('heat-point') >= 0) {
      var threatened = base.current;
      var likelyWinner = state.currentHeat.players.find(function (player) {
        return !player.eliminated && player.id !== threatened;
      });
      if (likelyWinner && state.heatWins[likelyWinner.id] === state.config.winsNeeded - 1) {
        signals.push('match-point');
      }
    }
    base.signals = signals;
    base.heatNumber = state.heatNumber;
    return freeze(base);
  }

  function beginNextCupHeat(state) {
    validateCupState(state);
    if (state.phase !== 'between-heats') throw new Error('Cup is not between heats');
    var next = clone(state);
    next.phase = 'heat';
    next.currentHeat = cupHeatState(next.config, next.heatNumber, next.persistentMagnetIds);
    next.turn = cupTurnMetadata(next);
    return freeze(next);
  }

  function closeCupHeat(next, heatWinnerId, innerOutcome) {
    next.heatWins[heatWinnerId] += 1;
    next.heatResults.push({
      heatNumber: next.heatNumber,
      winnerId: heatWinnerId,
      starterId: next.config.players[next.currentHeat.config.startIndex].id,
      rulesTurns: next.currentHeat.rulesTurnCounter,
      attempts: next.currentHeat.attemptCounter,
      completionReason: next.currentHeat.completionReason,
      outcomeId: innerOutcome.outcomeId,
    });
    if (next.heatWins[heatWinnerId] >= next.config.winsNeeded) {
      next.phase = 'complete';
      next.winnerIds = [heatWinnerId];
      next.completionReason = 'cup-won';
      next.currentHeat = null;
      return { heatResolved: true, matchResolved: true, shootoutStarted: false };
    }
    if (next.heatNumber < next.config.bestOf) {
      next.phase = 'between-heats';
      next.heatNumber += 1;
      next.currentHeat = null;
      return { heatResolved: true, matchResolved: false, shootoutStarted: false };
    }
    var high = Math.max.apply(Math, Object.keys(next.heatWins).map(function (id) { return next.heatWins[id]; }));
    var leaders = next.config.players.filter(function (player) { return next.heatWins[player.id] === high; })
      .map(function (player) { return player.id; });
    if (leaders.length === 1) {
      next.phase = 'complete';
      next.winnerIds = [leaders[0]];
      next.completionReason = 'cup-won';
      next.currentHeat = null;
      return { heatResolved: true, matchResolved: true, shootoutStarted: false };
    }
    next.phase = 'shootout';
    next.currentHeat = null;
    var nextSeat = modulo(next.config.startIndex + next.heatNumber * next.config.direction,
      next.config.players.length);
    next.shootout = buildCupShootout(next, leaders, 1, nextSeat, 'series');
    return { heatResolved: true, matchResolved: false, shootoutStarted: true };
  }

  function resolveCupShootoutFlip(state, input) {
    var source = object(input);
    validateCupState(state);
    var resolutionIdentity = requestedResolutionIdentity(state, source);
    var sequence = resolutionIdentity.ordinal;
    var outcomeId = resolutionIdentity.id;
    var resolvedHeatNumber = state.heatNumber;
    var next = clone(state);
    var shootout = next.shootout;
    var expected = shootout.queue[shootout.queuePosition];
    var playerId = source.playerId == null ? expected : String(source.playerId);
    if (!expected || playerId !== expected) throw new Error('Cup shootout flip is out of turn');
    var landing = normalizeLanding(source);
    next.sequence = sequence;
    shootout.results.push({ playerId: playerId, result: landing.result, pose: landing.pose });
    shootout.queuePosition += 1;
    var roundResolved = false;
    var repeated = false;
    var heatResolved = false;
    var heatWinnerId = null;
    var matchResolved = false;
    var nextShootoutStarted = false;
    if (shootout.queuePosition >= shootout.queue.length) {
      roundResolved = true;
      var makers = shootout.results.filter(function (entry) { return entry.result === 'MAKE'; });
      if (makers.length === 1) {
        if (shootout.purpose === 'heat') {
          heatWinnerId = makers[0].playerId;
          next.shootout = null;
          var close = closeCupHeat(next, heatWinnerId, { outcomeId: outcomeId });
          heatResolved = close.heatResolved;
          matchResolved = close.matchResolved;
          nextShootoutStarted = close.shootoutStarted;
        } else {
          next.phase = 'complete';
          next.winnerIds = [makers[0].playerId];
          next.completionReason = 'cup-shootout';
          next.shootout = null;
          matchResolved = true;
        }
      } else {
        repeated = true;
        var currentOpenerIndex = next.config.players.findIndex(function (player) {
          return player.id === shootout.queue[0];
        });
        var nextOpener = currentOpenerIndex;
        do {
          nextOpener = modulo(nextOpener + next.config.direction, next.config.players.length);
        } while (shootout.participantIds.indexOf(next.config.players[nextOpener].id) < 0);
        next.shootout = buildCupShootout(next, shootout.participantIds,
          shootout.round + 1, nextOpener, shootout.purpose);
      }
    }
    claimResolutionIdentity(next, resolutionIdentity);
    next.turn = cupTurnMetadata(next);
    var cues = landing.made ? ['make'] : [];
    if (landing.onCap) cues.push('cap-landing');
    if (heatResolved) cues.push('heat-win');
    if (matchResolved) cues.push('match-win');
    if (nextShootoutStarted) cues.push('shootout');
    return freeze({ schema: 'RulesTransitionV1', state: freeze(next), outcome: freeze({
      schema: OUTCOME_SCHEMA, version: VERSION,
      type: 'rules.cup-shootout-flip-resolved.v1', outcomeId: outcomeId,
      resolutionIdentity: resolutionIdentity,
      matchId: next.matchId, sequence: next.sequence, formatId: 'cup',
      playerId: playerId, landing: landing, heatNumber: resolvedHeatNumber,
      shootoutPurpose: shootout.purpose, shootoutRound: shootout.round,
      roundResolved: roundResolved, repeated: repeated,
      heatResolved: heatResolved, heatWinnerId: heatWinnerId,
      matchResolved: matchResolved, shootoutStarted: nextShootoutStarted,
      completed: next.phase === 'complete', winnerIds: next.winnerIds.slice(),
      completionReason: next.completionReason, turn: next.turn,
      presentation: { positiveOnly: true, cues: cues },
    }) });
  }

  function resolveCupFlip(state, input) {
    validateCupState(state);
    if (state.phase === 'shootout') return resolveCupShootoutFlip(state, input);
    if (state.phase !== 'heat') throw new Error('Cup is not accepting a flip');
    var source = object(input);
    var resolutionIdentity = requestedResolutionIdentity(state, source);
    var sequence = resolutionIdentity.ordinal;
    var outcomeId = resolutionIdentity.id;
    var next = clone(state);
    var innerInput = clone(source);
    delete innerInput.flipId;
    delete innerInput.resolutionIdentity;
    var inner = resolveClassicFlip(next.currentHeat, innerInput);
    next.currentHeat = clone(inner.state);
    claimResolutionIdentity(next, resolutionIdentity);
    next.currentHeat.players.forEach(function (player) {
      if (player.alwaysMagnet && next.persistentMagnetIds.indexOf(player.id) < 0) {
        next.persistentMagnetIds.push(player.id);
      }
      if (player.alwaysMagnet) {
        var definition = next.currentHeat.config.players.find(function (entry) {
          return entry.id === player.id;
        });
        if (definition) definition.alwaysMagnet = true;
      }
    });
    var close = { heatResolved: false, matchResolved: false, shootoutStarted: false };
    var heatWinnerId = null;
    if (next.currentHeat.phase === 'complete' && next.currentHeat.winnerIds.length === 1) {
      heatWinnerId = next.currentHeat.winnerIds[0];
      close = closeCupHeat(next, heatWinnerId, inner.outcome);
    } else if (next.currentHeat.phase === 'complete' && next.currentHeat.winnerIds.length === 0) {
      // Simultaneous/terminal effects can leave no survivor. That cannot choose
      // a heat winner and must never strand a completed inner state. Re-enter
      // every eligible heat entrant in a fresh, event-free pressure shootout.
      next.phase = 'shootout';
      var entrants = next.config.players.map(function (player) { return player.id; });
      var fairOpener = modulo(next.currentHeat.config.startIndex + next.config.direction,
        next.config.players.length);
      next.shootout = buildCupShootout(next, entrants, 1, fairOpener, 'heat');
      close = { heatResolved: false, matchResolved: false,
        shootoutStarted: true, zeroSurvivorTie: true };
    }
    next.turn = cupTurnMetadata(next);
    var innerForCup = clone(inner.outcome);
    if (!close.matchResolved) {
      innerForCup.presentation.cues = innerForCup.presentation.cues.filter(function (cue) {
        return cue !== 'match-win';
      });
    }
    var cues = innerForCup.presentation.cues.filter(function (cue) { return cue !== 'match-win'; });
    if (close.heatResolved) cues.push('heat-win');
    if (close.matchResolved) cues.push('match-win');
    if (close.shootoutStarted) cues.push('shootout');
    var outcome = freeze({
      schema: OUTCOME_SCHEMA, version: VERSION,
      type: 'rules.cup-flip-resolved.v1', outcomeId: outcomeId,
      resolutionIdentity: resolutionIdentity,
      matchId: next.matchId, sequence: next.sequence, formatId: 'cup',
      playerId: inner.outcome.playerId, landing: inner.outcome.landing,
      heatNumber: state.heatNumber, heatResolved: close.heatResolved,
      heatWinnerId: heatWinnerId, matchResolved: close.matchResolved,
      shootoutStarted: close.shootoutStarted, innerOutcome: freeze(innerForCup),
      zeroSurvivorTie: close.zeroSurvivorTie === true,
      completed: next.phase === 'complete', winnerIds: next.winnerIds.slice(),
      completionReason: next.completionReason, turn: next.turn,
      presentation: { positiveOnly: true, cues: Array.from(new Set(cues)) },
    });
    return freeze({ schema: 'RulesTransitionV1', state: freeze(next), outcome: outcome });
  }

  function seededOrder(ids, seed, salt) {
    return ids.slice().map(function (id, index) {
      return { id: id, index: index, score: stableHash(seed + '|' + salt + '|' + id) };
    }).sort(function (left, right) {
      return left.score - right.score || left.index - right.index;
    }).map(function (entry) { return entry.id; });
  }

  function cupRematchOptions(state, seed) {
    validateCupState(state);
    var ids = state.config.players.map(function (player) { return player.id; });
    var fairStarter = modulo(state.config.startIndex + state.config.direction, ids.length);
    var base = {
      matchId: state.matchId + ':rematch:' + (state.config.rematchNumber + 1),
      cupLength: state.cupLength,
      players: clone(state.config.players),
      direction: state.config.direction,
      startIndex: fairStarter,
      seed: state.config.seed,
      rematchNumber: state.config.rematchNumber + 1,
    };
    var rotatedPlayers = ids.slice(fairStarter).concat(ids.slice(0, fairStarter)).map(function (id) {
      return clone(state.config.players.find(function (player) { return player.id === id; }));
    });
    var shuffleIds = seededOrder(ids, seed == null ? state.config.seed : seed,
      'cup-rematch-' + (state.config.rematchNumber + 1));
    var shuffledPlayers = shuffleIds.map(function (id) {
      return clone(state.config.players.find(function (player) { return player.id === id; }));
    });
    return freeze({
      sameSetup: clone(base),
      rotateFirstPlayer: Object.assign({}, clone(base), { players: rotatedPlayers, startIndex: 0 }),
      shuffleOrder: Object.assign({}, clone(base), { players: shuffledPlayers,
        startIndex: Math.max(0, shuffleIds.indexOf(ids[fairStarter])) }),
    });
  }

  function defaultTeams(players) {
    var result = [[], []];
    players.forEach(function (player, index) { result[index % 2].push(player.id); });
    return result;
  }

  function normalizeTeams(value, players) {
    var ids = new Set(players.map(function (player) { return player.id; }));
    var teams = Array.isArray(value) ? clone(value) : defaultTeams(players);
    if (teams.length !== 2 || !Array.isArray(teams[0]) || !Array.isArray(teams[1])) {
      throw new TypeError('Team Clash requires two teams');
    }
    teams = teams.map(function (team) {
      return team.map(function (entry) {
        if (Number.isInteger(entry)) {
          if (!players[entry]) throw new RangeError('Unknown Team Clash seat: ' + entry);
          return players[entry].id;
        }
        return String(entry);
      });
    });
    var flat = teams[0].concat(teams[1]);
    if (teams[0].length !== teams[1].length || flat.length !== players.length ||
        new Set(flat).size !== players.length || flat.some(function (id) { return !ids.has(id); })) {
      throw new TypeError('Team Clash teams must be equal and contain every player exactly once');
    }
    return teams;
  }

  function normalizeTeamConfig(input) {
    var source = normalizeRequest(input);
    var players = normalizePlayers(rosterFromSource(source), { minimum: 2, maximum: 16 });
    if (players.length % 2) throw new RangeError('Team Clash requires an even 2–16 players');
    var rosterTeamIds = Array.from(new Set(players.filter(function (player) {
      return player.teamId != null;
    }).map(function (player) { return player.teamId; })));
    var derivedTeams = null;
    if (!source.teams && rosterTeamIds.length) {
      if (rosterTeamIds.length !== 2 || players.some(function (player) { return player.teamId == null; })) {
        throw new TypeError('Team Clash roster teamId values must define exactly two complete teams');
      }
      derivedTeams = rosterTeamIds.map(function (teamId) {
        return players.filter(function (player) { return player.teamId === teamId; })
          .map(function (player) { return player.id; });
      });
    }
    var teams = normalizeTeams(source.teams || derivedTeams, players);
    var teamIds = Array.isArray(source.teamIds) && source.teamIds.length === 2
      ? source.teamIds.map(String) : (derivedTeams ? rosterTeamIds : ['team-a', 'team-b']);
    if (teamIds[0] === teamIds[1]) throw new TypeError('Team Clash team IDs must be unique');
    return freeze({
      schema: 'TeamClashRulesConfigV1',
      matchId: required(source.matchId || 'local-team-clash', 'matchId'),
      formatId: 'team-clash', players: players, teams: teams,
      teamIds: teamIds,
      teamNames: Array.isArray(source.teamNames) && source.teamNames.length === 2
        ? source.teamNames.map(String) : ['A', 'B'],
      targetScore: 11, flipsPerTeam: 3,
      startingTeamIndex: source.startingTeamIndex === 1 || source.startingTeam === 1 ? 1 : 0,
      teammateOffsets: [0, 1].map(function (index) {
        var values = Array.isArray(source.teammateOffsets) ? source.teammateOffsets : [];
        return modulo(integer(values[index], 0), teams[index].length);
      }),
      seed: integer(source.seed, 1) >>> 0,
      rematchNumber: Math.max(0, integer(source.rematchNumber, 0, 0)),
    });
  }

  function blankPlayerTeamStats(players) {
    var stats = {};
    players.forEach(function (player) {
      stats[player.id] = { flips: 0, makes: 0, caps: 0, streak: 0, bestStreak: 0 };
    });
    return stats;
  }

  function buildTeamQueue(state) {
    var queue = [];
    for (var flip = 0; flip < state.config.flipsPerTeam; flip += 1) {
      for (var side = 0; side < 2; side += 1) {
        var teamIndex = side === 0 ? state.roundStartingTeamIndex : otherTeam(state.roundStartingTeamIndex);
        var roster = state.config.teams[teamIndex];
        var playerId = roster[modulo(state.teammateOffsets[teamIndex] + flip, roster.length)];
        queue.push({ position: queue.length, round: state.roundNumber,
          teamIndex: teamIndex, teamId: state.config.teamIds[teamIndex],
          teamFlip: flip + 1, playerId: playerId });
      }
    }
    return queue;
  }

  function teamTurnMetadata(state) {
    if (state.phase === 'complete') {
      return freeze({ current: null, onDeck: null, afterThat: null, signals: [] });
    }
    var queue = state.queue;
    var position = state.queuePosition;
    var current = queue[position] || null;
    var onDeck = queue[position + 1] || null;
    var afterThat = queue[position + 2] || null;
    var signals = [];
    if (current && position === queue.length - 1) {
      var opponent = otherTeam(current.teamIndex);
      var projected = state.scores[current.teamIndex] +
        Math.max(0, state.roundRaw[current.teamIndex] + 1 - state.roundRaw[opponent]);
      if (projected >= state.config.targetScore) signals.push('match-point');
    }
    return freeze({ current: current ? current.playerId : null,
      onDeck: onDeck ? onDeck.playerId : null,
      afterThat: afterThat ? afterThat.playerId : null,
      currentEntry: current, onDeckEntry: onDeck, afterThatEntry: afterThat,
      signals: signals });
  }

  function createTeamClashState(input) {
    var config = normalizeTeamConfig(input);
    var state = {
      schema: 'TeamClashRulesStateV1', version: VERSION,
      config: clone(config), matchId: config.matchId, formatId: 'team-clash',
      phase: 'active', sequence: 0, noContestCount: 0,
      scores: [0, 0], roundNumber: 1,
      resolutionIdentity: createResolutionHighWater('team-clash', config.matchId),
      roundStartScores: [0, 0],
      roundStartingTeamIndex: config.startingTeamIndex,
      matchStartingTeamIndex: config.startingTeamIndex,
      teammateOffsets: config.teammateOffsets.slice(),
      matchOpeningOffsets: config.teammateOffsets.slice(),
      roundRaw: [0, 0], flipsTaken: [0, 0], queue: [], queuePosition: 0,
      playerStats: blankPlayerTeamStats(config.players),
      persistentMagnetIds: config.players.filter(function (player) { return player.alwaysMagnet; })
        .map(function (player) { return player.id; }),
      roundHistory: [], winnerTeamIndex: null, winnerIds: [], completionReason: null,
      lastOutcomeId: null, turn: null,
    };
    state.queue = buildTeamQueue(state);
    state.turn = teamTurnMetadata(state);
    return freeze(state);
  }

  function normalizeTeamScoring(input, landing) {
    var source = object(input);
    var effects = object(source.effects);
    if (source.disallowed === true || effects.disallowed === true) {
      throw new Error('This result is not eligible in Team Clash');
    }
    var raw = source.rawPoints == null
      ? (landing.made ? (landing.golden ? 2 : 1) : 0)
      : Math.max(0, integer(source.rawPoints, 0, 0));
    var multiplier = effects.scoreMultiplier == null ? 1
      : Math.max(0, finite(effects.scoreMultiplier, 1));
    raw = landing.made ? Math.max(0, Math.round(raw * multiplier)) : 0;
    if (landing.made) raw += Math.max(0, integer(effects.additivePoints, 0, 0));
    if (!Number.isSafeInteger(raw)) throw new RangeError('Team score effect exceeds safe integer range');
    var automaticWinner = effects.automaticWinner == null ? null : String(effects.automaticWinner);
    if (automaticWinner != null && automaticWinner !== 'current' && automaticWinner !== 'opponent') {
      throw new RangeError('automaticWinner must be current or opponent');
    }
    return freeze({ rawPoints: raw,
      halveOpponentRound: landing.made && effects.halveOpponentRound === true,
      halveOpponentScore: landing.made && effects.halveOpponentScore === true,
      grantAlwaysMagnet: landing.made && effects.grantAlwaysMagnet === true,
      automaticWinner: automaticWinner,
      metadata: clone(object(effects.metadata)) });
  }

  function positiveTeamCues(landing, stats, roundSummary, completed) {
    var cues = [];
    if (landing.made) cues.push('make');
    if (landing.onCap) cues.push('cap-landing');
    if (stats.streak >= 3) cues.push('hot-streak');
    if (roundSummary) {
      if (roundSummary.cancelled > 0) cues.push('cancellation');
      if (roundSummary.comeback) cues.push('comeback-shot');
      if (completed && roundSummary.cancelled > 0) cues.push('cancel-for-win');
      if (completed) cues.push('match-win');
    }
    return cues;
  }

  var POSITIVE_CUE_PRIORITY = Object.freeze({
    'match-win': 100,
    'cancel-for-win': 95,
    'comeback-shot': 90,
    'heat-win': 85,
    'on-fire-cap': 80,
    'on-fire': 75,
    'hot-streak': 70,
    'cap-landing': 60,
    'life-earned': 55,
    'cancellation': 50,
    'make': 10,
    'shootout': 5,
  });

  function collectPositiveHighlights(outcomes, limit) {
    var maximum = Math.max(0, integer(limit, 5, 0));
    var rows = [];
    (Array.isArray(outcomes) ? outcomes : []).forEach(function (outcome, outcomeIndex) {
      if (!outcome || outcome.schema !== OUTCOME_SCHEMA || !outcome.presentation ||
          outcome.presentation.positiveOnly !== true) return;
      (Array.isArray(outcome.presentation.cues) ? outcome.presentation.cues : [])
        .forEach(function (cue, cueIndex) {
          if (!Object.prototype.hasOwnProperty.call(POSITIVE_CUE_PRIORITY, cue)) return;
          rows.push({ kind: cue, playerId: outcome.playerId || null,
            teamId: outcome.teamId || null, outcomeId: outcome.outcomeId,
            sequence: integer(outcome.sequence, outcomeIndex, 0),
            priority: POSITIVE_CUE_PRIORITY[cue], cueIndex: cueIndex,
            outcomeIndex: outcomeIndex });
        });
    });
    rows.sort(function (left, right) {
      return right.priority - left.priority || left.sequence - right.sequence ||
        left.outcomeIndex - right.outcomeIndex || left.cueIndex - right.cueIndex;
    });
    return freeze(rows.slice(0, maximum).map(function (row) {
      return { kind: row.kind, playerId: row.playerId, teamId: row.teamId,
        outcomeId: row.outcomeId, sequence: row.sequence };
    }));
  }

  function resolveTeamFlip(state, input) {
    validateTeamState(state);
    if (state.phase !== 'active') throw new Error('Team Clash match is complete');
    var source = object(input);
    var resolutionIdentity = requestedResolutionIdentity(state, source);
    var sequence = resolutionIdentity.ordinal;
    var outcomeId = resolutionIdentity.id;
    var next = clone(state);
    var expected = next.queue[next.queuePosition];
    var playerId = source.playerId == null ? expected.playerId : String(source.playerId);
    if (!expected || expected.playerId !== playerId) throw new Error('Team Clash flip is out of turn');
    var landing = normalizeLanding(source);
    var scoring = normalizeTeamScoring(source, landing);
    var teamIndex = expected.teamIndex;
    var opponentIndex = otherTeam(teamIndex);
    var roundStartScores = next.roundStartScores.slice();
    var stats = next.playerStats[playerId];
    stats.flips += 1;
    if (landing.made) {
      stats.makes += 1;
      stats.streak += 1;
      if (landing.onCap) stats.caps += 1;
      stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
    } else stats.streak = 0;

    if (scoring.halveOpponentRound) next.roundRaw[opponentIndex] = Math.ceil(next.roundRaw[opponentIndex] / 2);
    if (scoring.halveOpponentScore) next.scores[opponentIndex] = Math.ceil(next.scores[opponentIndex] / 2);
    if (scoring.grantAlwaysMagnet && next.persistentMagnetIds.indexOf(playerId) < 0) {
      next.persistentMagnetIds.push(playerId);
    }
    next.roundRaw[teamIndex] += scoring.rawPoints;
    if (!Number.isSafeInteger(next.roundRaw[teamIndex])) {
      throw new RangeError('Team round score exceeds safe integer range');
    }
    next.flipsTaken[teamIndex] += 1;
    next.queuePosition += 1;
    next.sequence = sequence;
    var roundSummary = null;

    if (scoring.automaticWinner) {
      var winningIndex = scoring.automaticWinner === 'opponent' ? opponentIndex : teamIndex;
      next.phase = 'complete';
      next.winnerTeamIndex = winningIndex;
      next.winnerIds = next.config.teams[winningIndex].slice();
      next.completionReason = 'automatic-team-result';
    } else if (next.queuePosition >= next.queue.length) {
      var raw = next.roundRaw.slice();
      var difference = raw[0] - raw[1];
      var awardedTeamIndex = difference === 0 ? null : (difference > 0 ? 0 : 1);
      var awardedPoints = Math.abs(difference);
      var cancelled = Math.min(raw[0], raw[1]);
      if (awardedTeamIndex != null) next.scores[awardedTeamIndex] += awardedPoints;
      if (next.scores.some(function (score) { return !Number.isSafeInteger(score); })) {
        throw new RangeError('Team score exceeds safe integer range');
      }
      var comeback = awardedTeamIndex != null &&
        roundStartScores[awardedTeamIndex] < roundStartScores[otherTeam(awardedTeamIndex)] &&
        next.scores[awardedTeamIndex] >= next.scores[otherTeam(awardedTeamIndex)];
      roundSummary = {
        round: next.roundNumber, raw: raw, cancelled: cancelled,
        awardedTeamIndex: awardedTeamIndex, awardedPoints: awardedPoints,
        scoresBefore: roundStartScores, scoresAfter: next.scores.slice(), comeback: comeback,
      };
      next.roundHistory.push(clone(roundSummary));
      if (next.scores[0] >= next.config.targetScore || next.scores[1] >= next.config.targetScore) {
        next.winnerTeamIndex = next.scores[0] >= next.config.targetScore ? 0 : 1;
        next.winnerIds = next.config.teams[next.winnerTeamIndex].slice();
        next.phase = 'complete';
        next.completionReason = 'target-score';
      } else {
        next.roundNumber += 1;
        next.roundStartingTeamIndex = otherTeam(next.roundStartingTeamIndex);
        next.teammateOffsets = next.teammateOffsets.map(function (offset, index) {
          return modulo(offset + next.config.flipsPerTeam, next.config.teams[index].length);
        });
        next.roundRaw = [0, 0];
        next.flipsTaken = [0, 0];
        next.roundStartScores = next.scores.slice();
        next.queuePosition = 0;
        next.queue = buildTeamQueue(next);
      }
    }
    claimResolutionIdentity(next, resolutionIdentity);
    next.turn = teamTurnMetadata(next);
    var cues = positiveTeamCues(landing, stats, roundSummary, next.phase === 'complete');
    return freeze({ schema: 'RulesTransitionV1', state: freeze(next), outcome: freeze({
      schema: OUTCOME_SCHEMA, version: VERSION,
      type: 'rules.team-flip-resolved.v1', outcomeId: outcomeId,
      resolutionIdentity: resolutionIdentity,
      matchId: next.matchId, sequence: next.sequence, formatId: 'team-clash',
      playerId: playerId, teamId: next.config.teamIds[teamIndex], teamIndex: teamIndex,
      landing: landing, rawPoints: scoring.rawPoints, effects: scoring,
      roundNumber: state.roundNumber, roundResolved: !!roundSummary,
      round: roundSummary, scores: next.scores.slice(),
      completed: next.phase === 'complete', winnerIds: next.winnerIds.slice(),
      winnerTeamId: next.winnerTeamIndex == null ? null : next.config.teamIds[next.winnerTeamIndex],
      completionReason: next.completionReason, turn: next.turn,
      presentation: { positiveOnly: true, cues: cues },
    }) });
  }

  function teamRematchOptions(state, seed) {
    validateTeamState(state);
    var nextStartingTeam = otherTeam(state.matchStartingTeamIndex);
    var nextOffsets = state.matchOpeningOffsets.map(function (offset, index) {
      return modulo(offset + 1, state.config.teams[index].length);
    });
    var base = {
      matchId: state.matchId + ':rematch:' + (state.config.rematchNumber + 1),
      players: clone(state.config.players), teams: clone(state.config.teams),
      teamIds: state.config.teamIds.slice(), teamNames: state.config.teamNames.slice(),
      startingTeamIndex: nextStartingTeam, teammateOffsets: nextOffsets,
      seed: state.config.seed, rematchNumber: state.config.rematchNumber + 1,
    };
    var rotatedTeams = state.config.teams.map(function (team, index) {
      var offset = nextOffsets[index];
      return team.slice(offset).concat(team.slice(0, offset));
    });
    var shuffledTeams = state.config.teams.map(function (team, index) {
      return seededOrder(team, seed == null ? state.config.seed : seed,
        'team-' + index + '-rematch-' + (state.config.rematchNumber + 1));
    });
    return freeze({
      sameSetup: clone(base),
      rotateFirstPlayer: Object.assign({}, clone(base), { teams: rotatedTeams,
        teammateOffsets: [0, 0] }),
      shuffleOrder: Object.assign({}, clone(base), { teams: shuffledTeams,
        teammateOffsets: [0, 0] }),
      swapTeams: Object.assign({}, clone(base), {
        teams: [clone(state.config.teams[1]), clone(state.config.teams[0])],
        teamIds: [state.config.teamIds[1], state.config.teamIds[0]],
        teamNames: [state.config.teamNames[1], state.config.teamNames[0]],
        // Team identities change sides, so invert the index again to preserve
        // the same fair next starter as the other rematch paths.
        startingTeamIndex: otherTeam(nextStartingTeam),
        teammateOffsets: [nextOffsets[1], nextOffsets[0]],
      }),
    });
  }

  function assertWhole(value, label, minimum) {
    if (!Number.isSafeInteger(value) || value < (minimum == null ? 0 : minimum)) {
      throw new TypeError(label + ' must be a safe whole number');
    }
  }

  function sameIds(left, right) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every(function (value, index) { return String(value) === String(right[index]); });
  }

  function sameIdSet(left, right) {
    return Array.isArray(left) && Array.isArray(right) &&
      sameIds(left.map(String).slice().sort(), right.map(String).slice().sort());
  }

  function sameCanonicalValue(left, right) {
    if (left === right) return true;
    if (left == null || right == null || typeof left !== 'object' || typeof right !== 'object') {
      return false;
    }
    if (Array.isArray(left) || Array.isArray(right)) {
      return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
        left.every(function (value, index) { return sameCanonicalValue(value, right[index]); });
    }
    var leftKeys = Object.keys(left).sort();
    var rightKeys = Object.keys(right).sort();
    return sameIds(leftKeys, rightKeys) && leftKeys.every(function (key) {
      return sameCanonicalValue(left[key], right[key]);
    });
  }

  function validateClassicState(state) {
    if (!state || state.schema !== 'ClassicRulesStateV1') throw new TypeError('ClassicRulesStateV1 is required');
    var config = normalizeClassicConfig(state.config);
    if (!sameCanonicalValue(state.config, config)) {
      throw new Error('Classic state config is not canonical');
    }
    if (state.matchId !== config.matchId || state.formatId !== 'classic') {
      throw new Error('Classic state identity does not match its config');
    }
    if (!Array.isArray(state.players) || state.players.length !== config.players.length) {
      throw new TypeError('Classic state roster does not match its config');
    }
    var expectedIds = config.players.map(function (player) { return player.id; });
    var actualIds = state.players.map(function (player) { return required(player && player.id, 'state player id'); });
    if (!sameIds(actualIds, expectedIds)) throw new Error('Classic state player identities changed');
    state.players.forEach(function (player, index) {
      var definition = config.players[index];
      ['id', 'seat', 'name', 'displayName', 'kind', 'human', 'isAI', 'cpuTier', 'teamId',
        'flipperId', 'variantId', 'cosmeticId'].forEach(function (key) {
        if (!sameCanonicalValue(player[key], definition[key])) {
          throw new Error('Classic state player metadata changed: ' + player.id + '.' + key);
        }
      });
      assertWhole(player.lives, 'player lives', 0);
      assertWhole(player.streak, 'player streak', 0);
      assertWhole(player.bestStreak, 'player best streak', 0);
      if (player.bestStreak < player.streak) throw new Error('Best streak cannot trail current streak');
      if (typeof player.eliminated !== 'boolean' || typeof player.onFire !== 'boolean' ||
          typeof player.heatingUp !== 'boolean' || typeof player.alwaysMagnet !== 'boolean') {
        throw new TypeError('Classic player flags must be boolean');
      }
      if (player.eliminated === true && player.lives !== 0) throw new Error('Eliminated player must have zero lives');
      if (player.eliminated !== true && player.lives === 0) throw new Error('Active player must have at least one life');
      if (player.eliminated && (player.onFire || player.heatingUp || player.streak !== 0)) {
        throw new Error('Eliminated player cannot retain streak state');
      }
      if (player.heatingUp !== (!player.onFire && !player.eliminated && player.streak === 2)) {
        throw new Error('Heating-up state does not match the player streak');
      }
      if (player.onFire && (player.streak < 3 || player.lives >= config.additiveLifeCap)) {
        throw new Error('ON FIRE player state is incoherent');
      }
      if (definition.alwaysMagnet && !player.alwaysMagnet) {
        throw new Error('Permanent magnet cannot be removed during a match');
      }
    });
    if (state.phase !== 'active' && state.phase !== 'complete') throw new TypeError('Invalid Classic phase');
    assertWhole(state.currentPlayerIndex, 'currentPlayerIndex', 0);
    if (state.currentPlayerIndex >= state.players.length) throw new RangeError('currentPlayerIndex is outside roster');
    assertWhole(state.attemptCounter, 'attemptCounter', 0);
    assertWhole(state.rulesTurnCounter, 'rulesTurnCounter', 0);
    assertWhole(state.stake, 'stake', 0);
    assertWhole(state.onFireEarned, 'ON FIRE earned lives', 0);
    validateResolutionHighWater(state);
    if (state.attemptCounter !== state.sequence || state.rulesTurnCounter > state.attemptCounter) {
      throw new Error('Classic counters do not match resolved transitions');
    }
    var firePlayers = state.players.filter(function (player) { return player.onFire === true; });
    if (firePlayers.length > 1) throw new Error('Only one player can be ON FIRE');
    var fireOwner = firePlayers.length ? firePlayers[0].id : null;
    if ((state.onFirePlayerId == null ? null : String(state.onFirePlayerId)) !== fireOwner) {
      throw new Error('ON FIRE owner does not match player state');
    }
    if (fireOwner != null && (state.players[state.currentPlayerIndex].id !== fireOwner ||
        state.phase !== 'active')) throw new Error('ON FIRE owner must hold the active turn');
    if (fireOwner == null && state.onFireEarned !== 0) {
      throw new Error('ON FIRE earnings require an active owner');
    }
    var sudden = object(state.suddenDeath);
    if (sudden.enabled !== config.suddenDeathEnabled ||
        sudden.activationTurn !== config.suddenDeathActivationTurn ||
        sudden.configuredTurn !== config.requestedSuddenDeathTurns) {
      throw new Error('Sudden-death boundary does not match normalized config');
    }
    assertWhole(sudden.countedTurns, 'sudden-death counted turns', 0);
    assertWhole(sudden.level, 'sudden-death level', 0);
    if (sudden.countedTurns !== state.rulesTurnCounter) {
      throw new Error('Sudden-death counter does not match competitive turns');
    }
    if (sudden.phase !== 'regulation' && sudden.phase !== 'sudden-death') {
      throw new TypeError('Invalid sudden-death phase');
    }
    if (!sudden.enabled && (sudden.phase !== 'regulation' || sudden.level !== 0 ||
        sudden.band != null)) {
      throw new Error('Disabled sudden death must remain in regulation');
    }
    if (sudden.enabled &&
        (sudden.phase === 'sudden-death') !==
          (state.rulesTurnCounter >= sudden.activationTurn)) {
      throw new Error('Sudden-death phase is not reachable from its activation boundary');
    }
    if (sudden.phase === 'regulation' && sudden.level !== 0) {
      throw new Error('Regulation cannot carry a sudden-death level');
    }
    if (sudden.phase === 'regulation' && sudden.band != null) {
      throw new Error('Regulation cannot carry a sudden-death band');
    }
    if (sudden.phase === 'sudden-death') {
      if (sudden.level < 1 || !sudden.band) throw new Error('Sudden death requires an active band');
      var band = sudden.band;
      if (!Array.isArray(band.rosterIds) || !band.rosterIds.length ||
          new Set(band.rosterIds).size !== band.rosterIds.length ||
          band.rosterIds.some(function (id) { return expectedIds.indexOf(id) < 0; })) {
        throw new Error('Invalid sudden-death band roster');
      }
      var bandSet = new Set(band.rosterIds);
      var bandStartSeat = expectedIds.indexOf(band.rosterIds[0]);
      var expectedBandOrder = [];
      for (var bandOffset = 0; bandOffset < expectedIds.length; bandOffset += 1) {
        var bandPlayerId = expectedIds[modulo(bandStartSeat +
          bandOffset * config.direction, expectedIds.length)];
        if (bandSet.has(bandPlayerId)) expectedBandOrder.push(bandPlayerId);
      }
      if (!sameIds(band.rosterIds, expectedBandOrder) ||
          activePlayers(state).some(function (player) { return !bandSet.has(player.id); })) {
        throw new Error('Sudden-death band order is not reachable');
      }
      assertWhole(band.targetTurnsPerPlayer, 'band turns per player', 1);
      assertWhole(band.targetTurns, 'band target turns', 1);
      assertWhole(band.countedTurns, 'band counted turns', 0);
      if (band.level !== sudden.level) throw new Error('Sudden-death band level is stale');
      var expectedTurnsPerPlayer = Math.max(1,
        Math.ceil(config.suddenDeathStepTurns / band.rosterIds.length));
      if (band.targetTurnsPerPlayer !== expectedTurnsPerPlayer ||
          band.targetTurns !== expectedTurnsPerPlayer * band.rosterIds.length) {
        throw new Error('Sudden-death band target is not a complete seat rotation');
      }
      var bandId = /^sd-(\d+)-(\d+)$/.exec(String(band.id || ''));
      var bandStartTurn = bandId ? integer(bandId[2], NaN, 0) : NaN;
      if (!bandId || String(sudden.level) !== bandId[1] ||
          !Number.isSafeInteger(bandStartTurn) || bandStartTurn > state.rulesTurnCounter ||
          (sudden.level === 1 && bandStartTurn !== sudden.activationTurn) ||
          (sudden.level > 1 && bandStartTurn <= sudden.activationTurn) ||
          band.countedTurns !== state.rulesTurnCounter - bandStartTurn) {
        throw new Error('Sudden-death band identity or age is not reachable');
      }
      if (!band.turnsByPlayer || !sameIdSet(Object.keys(band.turnsByPlayer), band.rosterIds)) {
        throw new Error('Sudden-death turn map does not match its roster');
      }
      var countedInBand = 0;
      band.rosterIds.forEach(function (id) {
        assertWhole(band.turnsByPlayer && band.turnsByPlayer[id], 'band player turns', 0);
        if (band.turnsByPlayer[id] > band.targetTurnsPerPlayer) {
          throw new Error('Sudden-death player exceeded the band allocation');
        }
        countedInBand += band.turnsByPlayer[id];
      });
      if (countedInBand !== band.countedTurns) {
        throw new Error('Sudden-death band counter does not match its seats');
      }
      if (state.phase === 'active' && activePlayers(state).length > 1 &&
          suddenDeathBandComplete(state)) {
        throw new Error('Completed sudden-death band was not advanced');
      }
    }
    if (!Array.isArray(state.winnerIds) || new Set(state.winnerIds).size !== state.winnerIds.length ||
        state.winnerIds.some(function (id) { return expectedIds.indexOf(id) < 0; })) {
      throw new Error('Classic winner set is invalid');
    }
    var survivors = activePlayers(state);
    var allianceWinners = alliedClearWinners(state, survivors);
    if (state.phase === 'active') {
      if (survivors.length < 2 || allianceWinners.length || state.winnerIds.length ||
          state.completionReason != null || state.players[state.currentPlayerIndex].eliminated) {
        throw new Error('Active Classic state already satisfies a terminal condition');
      }
    } else {
      var expectedWinners = allianceWinners.length ? allianceWinners
        : (survivors.length <= 1 ? survivors.map(function (player) { return player.id; }) : []);
      if (!expectedWinners.length && survivors.length > 1) {
        throw new Error('Completed Classic state has no reachable terminal condition');
      }
      if (!sameIdSet(state.winnerIds, expectedWinners) || state.completionReason == null) {
        throw new Error('Completed Classic winner state is incoherent');
      }
    }
    if (!sameCanonicalValue(state.turn, classicTurnMetadata(state))) {
      throw new Error('Classic turn metadata is stale or forged');
    }
    return true;
  }

  function validateCupState(state) {
    if (!state || state.schema !== 'CupRulesStateV1') throw new TypeError('CupRulesStateV1 is required');
    var config = normalizeCupConfig(state.config);
    if (!sameCanonicalValue(state.config, config)) {
      throw new Error('Cup state config is not canonical');
    }
    if (state.matchId !== config.matchId || state.formatId !== 'cup' || state.cupLength !== config.cupLength) {
      throw new Error('Cup state identity does not match its config');
    }
    validateResolutionHighWater(state);
    if (['heat', 'between-heats', 'shootout', 'complete'].indexOf(state.phase) < 0) {
      throw new TypeError('Invalid Cup phase');
    }
    assertWhole(state.heatNumber, 'Cup heat number', 1);
    if (state.heatNumber > config.bestOf) throw new RangeError('Cup heat number exceeds best of three');
    var ids = config.players.map(function (player) { return player.id; });
    if (!state.heatWins || !sameIdSet(Object.keys(state.heatWins), ids) || ids.some(function (id) {
      return !Number.isSafeInteger(state.heatWins[id]) || state.heatWins[id] < 0 ||
        state.heatWins[id] > config.winsNeeded;
    })) throw new TypeError('Invalid Cup heat wins');
    if (!Array.isArray(state.heatResults) || state.heatResults.length > config.bestOf ||
        !Array.isArray(state.persistentMagnetIds) ||
        new Set(state.persistentMagnetIds).size !== state.persistentMagnetIds.length ||
        state.persistentMagnetIds.some(function (id) { return ids.indexOf(id) < 0; })) {
      throw new TypeError('Invalid Cup result or persistent-effect state');
    }
    config.players.forEach(function (player) {
      if (player.alwaysMagnet && state.persistentMagnetIds.indexOf(player.id) < 0) {
        throw new Error('Cup lost an initial permanent magnet');
      }
    });
    var derivedWins = cupWinsMap(config.players);
    var historyOutcomeIds = new Set();
    var prefixClincher = null;
    state.heatResults.forEach(function (result, index) {
      var heat = index + 1;
      var expectedStarter = config.players[modulo(config.startIndex + index * config.direction,
        config.players.length)].id;
      if (!result || result.heatNumber !== heat || ids.indexOf(result.winnerId) < 0 ||
          result.starterId !== expectedStarter || result.outcomeId == null ||
          (result.completionReason !== 'last-player-standing' &&
            result.completionReason !== 'no-survivors' &&
            result.completionReason !== 'plinko-automatic-win' &&
            result.completionReason !== 'plinko-automatic-loss')) {
        throw new Error('Cup heat history is not reachable');
      }
      if (historyOutcomeIds.has(result.outcomeId)) {
        throw new Error('Cup heat history reuses a resolution identity');
      }
      historyOutcomeIds.add(result.outcomeId);
      var resultIdentity = parseResolutionId(result.outcomeId);
      var innerNamespace = resolutionNamespace('classic', config.matchId + ':heat:' + heat);
      var outerNamespace = state.resolutionIdentity.namespace;
      if ((result.completionReason === 'last-player-standing' &&
          (resultIdentity.namespace !== innerNamespace || resultIdentity.ordinal !== result.attempts)) ||
          ((result.completionReason === 'no-survivors' ||
            result.completionReason === 'plinko-automatic-win' ||
            result.completionReason === 'plinko-automatic-loss') &&
          (resultIdentity.namespace !== outerNamespace || resultIdentity.ordinal > state.sequence))) {
        throw new Error('Cup heat outcome belongs to a foreign namespace');
      }
      assertWhole(result.rulesTurns, 'Cup heat rules turns', 1);
      assertWhole(result.attempts, 'Cup heat attempts', 1);
      if (result.rulesTurns > result.attempts) {
        throw new Error('Cup heat competitive turns exceed attempts');
      }
      derivedWins[result.winnerId] += 1;
      if (derivedWins[result.winnerId] >= config.winsNeeded) {
        if (index !== state.heatResults.length - 1) {
          throw new Error('Cup heat history continues after a clinching win');
        }
        prefixClincher = result.winnerId;
      }
    });
    if (ids.some(function (id) { return state.heatWins[id] !== derivedWins[id]; })) {
      throw new Error('Cup heat wins do not match heat history');
    }
    var openHeatExpected = state.phase === 'heat' ||
      (state.phase === 'shootout' && state.shootout && state.shootout.purpose === 'heat');
    var expectedCompletedHeats = openHeatExpected ? state.heatNumber - 1
      : (state.phase === 'between-heats' ? state.heatNumber - 1 : state.heatNumber);
    if (state.heatResults.length !== expectedCompletedHeats) {
      throw new Error('Cup heat number, history, and phase are inconsistent');
    }
    if (state.currentHeat != null) {
      validateClassicState(state.currentHeat);
      var expectedHeat = cupHeatState(config, state.heatNumber, state.persistentMagnetIds);
      if (!sameCanonicalValue(state.currentHeat.config, expectedHeat.config) ||
          state.currentHeat.matchId !== expectedHeat.matchId) {
        throw new Error('Cup inner heat does not match its parent-derived contract');
      }
      if (state.currentHeat.players.some(function (player) {
        return player.alwaysMagnet !== (state.persistentMagnetIds.indexOf(player.id) >= 0);
      })) {
        throw new Error('Cup inner heat permanent magnets do not match parent state');
      }
    }
    if (state.phase === 'heat' && (!state.currentHeat || state.currentHeat.phase !== 'active' ||
        state.shootout != null)) {
      throw new Error('Active Cup heat requires an active Classic state');
    }
    if (state.phase === 'between-heats' && (state.currentHeat != null || state.shootout != null)) {
      throw new Error('Between-heats Cup state cannot retain an inner heat');
    }
    if (state.phase === 'shootout') {
      var shootout = object(state.shootout);
      if ((shootout.purpose !== 'heat' && shootout.purpose !== 'series') ||
          shootout.eventsDisabled !== true || !Array.isArray(shootout.participantIds) ||
          shootout.participantIds.length < 2 || !Array.isArray(shootout.queue) ||
          !sameIds(shootout.queue.slice().sort(), shootout.participantIds.slice().sort()) ||
          shootout.participantIds.some(function (id) { return ids.indexOf(id) < 0; })) {
        throw new Error('Invalid Cup shootout state');
      }
      assertWhole(shootout.round, 'shootout round', 1);
      assertWhole(shootout.openerSeat, 'shootout opener seat', 0);
      if (shootout.openerSeat >= config.players.length ||
          !sameIds(shootout.queue, orderedIdsFromSeat(config.players, shootout.openerSeat,
            config.direction, shootout.participantIds))) {
        throw new Error('Cup shootout queue is not parent-derived');
      }
      assertWhole(shootout.queuePosition, 'shootout queue position', 0);
      if (shootout.queuePosition >= shootout.queue.length) throw new RangeError('Shootout queue is exhausted');
      if (!Array.isArray(shootout.results) || shootout.results.length !== shootout.queuePosition ||
          shootout.results.some(function (result, index) {
            return !result || result.playerId !== shootout.queue[index] ||
              (result.result !== 'MAKE' && result.result !== 'MISS') ||
              (result.pose !== 'upright' && result.pose !== 'cap' && result.pose !== 'miss');
          })) throw new Error('Cup shootout results do not match its resolved queue prefix');
      if (shootout.purpose === 'heat' && (!state.currentHeat ||
          state.currentHeat.phase !== 'complete' || state.currentHeat.winnerIds.length !== 0 ||
          !sameIdSet(shootout.participantIds, ids))) {
        throw new Error('Heat shootout requires a zero-survivor inner heat');
      }
      if (shootout.purpose === 'series' && state.currentHeat != null) {
        throw new Error('Series shootout cannot retain an inner heat');
      }
      if (shootout.purpose === 'series') {
        var high = Math.max.apply(Math, ids.map(function (id) { return state.heatWins[id]; }));
        var leaders = ids.filter(function (id) { return state.heatWins[id] === high; });
        if (state.heatResults.length !== config.bestOf || !sameIdSet(shootout.participantIds, leaders)) {
          throw new Error('Series shootout participants are not tied Cup leaders');
        }
      }
    } else if (state.shootout != null) {
      throw new Error('Cup shootout data exists outside shootout phase');
    }
    if (!Array.isArray(state.winnerIds) || new Set(state.winnerIds).size !== state.winnerIds.length ||
        state.winnerIds.some(function (id) { return ids.indexOf(id) < 0; })) {
      throw new Error('Cup winner set is invalid');
    }
    if (state.phase === 'complete') {
      if (state.currentHeat != null || state.shootout != null || state.winnerIds.length !== 1 ||
          (state.completionReason !== 'cup-won' && state.completionReason !== 'cup-shootout')) {
        throw new Error('Completed Cup requires one valid winner');
      }
      if (state.completionReason === 'cup-won' &&
          (state.heatWins[state.winnerIds[0]] < config.winsNeeded ||
            prefixClincher !== state.winnerIds[0])) {
        throw new Error('Cup winner has not won enough heats');
      }
      if (state.completionReason === 'cup-shootout') {
        var top = Math.max.apply(Math, ids.map(function (id) { return state.heatWins[id]; }));
        var tiedLeaders = ids.filter(function (id) { return state.heatWins[id] === top; });
        if (state.heatResults.length !== config.bestOf ||
            top >= config.winsNeeded || tiedLeaders.length < 2 ||
            tiedLeaders.indexOf(state.winnerIds[0]) < 0) {
          throw new Error('Cup shootout winner was not a tied series leader');
        }
      }
    } else if (state.winnerIds.length || state.completionReason != null ||
        ids.some(function (id) { return state.heatWins[id] >= config.winsNeeded; })) {
      throw new Error('Active Cup state already satisfies a terminal condition');
    }
    if (!sameCanonicalValue(state.turn, cupTurnMetadata(state))) {
      throw new Error('Cup turn metadata is stale or forged');
    }
    return true;
  }

  function validateTeamState(state) {
    if (!state || state.schema !== 'TeamClashRulesStateV1') {
      throw new TypeError('TeamClashRulesStateV1 is required');
    }
    var config = normalizeTeamConfig(state.config);
    if (!sameCanonicalValue(state.config, config)) {
      throw new Error('Team Clash state config is not canonical');
    }
    if (state.matchId !== config.matchId || state.formatId !== 'team-clash' ||
        JSON.stringify(state.config.teams) !== JSON.stringify(config.teams)) {
      throw new Error('Team Clash state identity does not match its config');
    }
    validateResolutionHighWater(state);
    if (state.phase !== 'active' && state.phase !== 'complete') throw new TypeError('Invalid Team Clash phase');
    if (!Array.isArray(state.scores) || state.scores.length !== 2 ||
        state.scores.some(function (score) { return !Number.isSafeInteger(score) || score < 0; })) {
      throw new TypeError('Invalid Team Clash scores');
    }
    if (!Array.isArray(state.roundRaw) || state.roundRaw.length !== 2 ||
        state.roundRaw.some(function (score) { return !Number.isSafeInteger(score) || score < 0; })) {
      throw new TypeError('Invalid Team Clash round score');
    }
    assertWhole(state.roundNumber, 'Team Clash round number', 1);
    assertWhole(state.noContestCount, 'Team Clash no-contest count', 0);
    if (state.noContestCount > state.sequence) {
      throw new Error('Team Clash no-contest count exceeds resolved transitions');
    }
    if ((state.roundStartingTeamIndex !== 0 && state.roundStartingTeamIndex !== 1) ||
        state.matchStartingTeamIndex !== config.startingTeamIndex ||
        state.roundStartingTeamIndex !== (state.roundNumber % 2 === 1
          ? config.startingTeamIndex : otherTeam(config.startingTeamIndex))) {
      throw new Error('Team Clash round starter is not reachable');
    }
    if (!Array.isArray(state.matchOpeningOffsets) ||
        !sameCanonicalValue(state.matchOpeningOffsets, config.teammateOffsets) ||
        !Array.isArray(state.teammateOffsets) || state.teammateOffsets.length !== 2) {
      throw new Error('Team Clash teammate offsets are invalid');
    }
    state.teammateOffsets.forEach(function (offset, index) {
      var expected = modulo(config.teammateOffsets[index] +
        (state.roundNumber - 1) * config.flipsPerTeam, config.teams[index].length);
      if (!Number.isSafeInteger(offset) || offset !== expected) {
        throw new Error('Team Clash teammate rotation is not reachable');
      }
    });
    if (!Array.isArray(state.queue) || state.queue.length !== config.flipsPerTeam * 2) {
      throw new TypeError('Team Clash queue must contain three flips per team');
    }
    if (!sameCanonicalValue(state.queue, buildTeamQueue(state))) {
      throw new Error('Team Clash queue is not canonically derived');
    }
    assertWhole(state.queuePosition, 'Team Clash queue position', 0);
    if (state.queuePosition > state.queue.length ||
        (state.phase === 'active' && state.queuePosition >= state.queue.length)) {
      throw new RangeError('Team Clash queue is exhausted');
    }
    var completedRoundFlips = (state.roundNumber - 1) * state.queue.length;
    var expectedSequence = completedRoundFlips + state.queuePosition;
    if (!Number.isSafeInteger(completedRoundFlips) || !Number.isSafeInteger(expectedSequence) ||
        state.sequence - state.noContestCount !== expectedSequence) {
      throw new Error('Team Clash sequence is not reachable from its round and queue position');
    }
    var ids = config.players.map(function (player) { return player.id; });
    if (state.queue.some(function (entry) { return !entry || ids.indexOf(entry.playerId) < 0; })) {
      throw new Error('Team Clash queue contains an unknown player');
    }
    if (!Array.isArray(state.flipsTaken) || state.flipsTaken.length !== 2) {
      throw new TypeError('Invalid Team Clash flip counts');
    }
    var expectedFlips = [0, 0];
    state.queue.slice(0, state.queuePosition).forEach(function (entry) {
      expectedFlips[entry.teamIndex] += 1;
    });
    if (!sameCanonicalValue(state.flipsTaken, expectedFlips)) {
      throw new Error('Team Clash flip counts do not match the queue prefix');
    }
    if (!Array.isArray(state.roundStartScores) || state.roundStartScores.length !== 2 ||
        state.roundStartScores.some(function (score) { return !Number.isSafeInteger(score) || score < 0; }) ||
        !Array.isArray(state.roundHistory)) {
      throw new TypeError('Invalid Team Clash round history');
    }
    var expectedHistoryLength = state.phase === 'complete' &&
      state.completionReason === 'target-score' ? state.roundNumber : state.roundNumber - 1;
    if (state.roundHistory.length !== expectedHistoryLength) {
      throw new Error('Team Clash round history is not reachable');
    }
    if (!state.playerStats || !sameIdSet(Object.keys(state.playerStats), ids)) {
      throw new TypeError('Invalid Team Clash player statistics');
    }
    var expectedActorFlips = {};
    ids.forEach(function (id) { expectedActorFlips[id] = 0; });
    var completedRounds = state.roundNumber - 1;
    config.teams.forEach(function (roster, teamIndex) {
      var completedTeamFlips = completedRounds * config.flipsPerTeam;
      var fullCycles = Math.floor(completedTeamFlips / roster.length);
      var remainder = completedTeamFlips % roster.length;
      roster.forEach(function (id) { expectedActorFlips[id] += fullCycles; });
      for (var actorOffset = 0; actorOffset < remainder; actorOffset += 1) {
        expectedActorFlips[roster[modulo(config.teammateOffsets[teamIndex] +
          actorOffset, roster.length)]] += 1;
      }
    });
    state.queue.slice(0, state.queuePosition).forEach(function (entry) {
      expectedActorFlips[entry.playerId] += 1;
    });
    var totalFlips = 0;
    ids.forEach(function (id) {
      var stats = object(state.playerStats[id]);
      ['flips', 'makes', 'caps', 'streak', 'bestStreak'].forEach(function (key) {
        assertWhole(stats[key], 'Team Clash player ' + key, 0);
      });
      if (stats.caps > stats.makes || stats.makes > stats.flips ||
          stats.streak > stats.bestStreak || stats.bestStreak > stats.makes) {
        throw new Error('Team Clash player statistics are incoherent');
      }
      if (stats.flips !== expectedActorFlips[id]) {
        throw new Error('Team Clash player flip totals do not match canonical actors');
      }
      totalFlips += stats.flips;
    });
    if (totalFlips !== state.sequence - state.noContestCount) {
      throw new Error('Team Clash statistics do not match competitive sequence');
    }
    if (!Array.isArray(state.persistentMagnetIds) ||
        new Set(state.persistentMagnetIds).size !== state.persistentMagnetIds.length ||
        state.persistentMagnetIds.some(function (id) { return ids.indexOf(id) < 0; }) ||
        config.players.some(function (player) {
          return player.alwaysMagnet && state.persistentMagnetIds.indexOf(player.id) < 0;
        })) throw new Error('Invalid Team Clash permanent magnets');
    if (!Array.isArray(state.winnerIds) || new Set(state.winnerIds).size !== state.winnerIds.length) {
      throw new Error('Invalid Team Clash winner set');
    }
    if (state.phase === 'complete') {
      if ((state.winnerTeamIndex !== 0 && state.winnerTeamIndex !== 1) ||
          !sameIdSet(state.winnerIds, config.teams[state.winnerTeamIndex]) ||
          (state.completionReason !== 'target-score' &&
            state.completionReason !== 'automatic-team-result')) {
        throw new Error('Completed Team Clash requires a winning team');
      }
      if (state.completionReason === 'automatic-team-result' && state.sequence < 1) {
        throw new Error('Automatic Team Clash result requires a resolved flip');
      }
      if (state.completionReason === 'target-score' &&
          state.scores[state.winnerTeamIndex] < config.targetScore) {
        throw new Error('Team Clash winner has not reached the target score');
      }
    } else if (state.winnerTeamIndex != null || state.winnerIds.length ||
        state.completionReason != null || state.scores.some(function (score) {
          return score >= config.targetScore;
        })) {
      throw new Error('Active Team Clash state already satisfies a terminal condition');
    }
    if (!sameCanonicalValue(state.turn, teamTurnMetadata(state))) {
      throw new Error('Team Clash turn metadata is stale or forged');
    }
    return true;
  }

  function resolveClassicNoContest(state, identity, eventId) {
    validateClassicState(state);
    if (state.phase !== 'active') throw new Error('Classic match is complete');
    var next = clone(state);
    next.attemptCounter += 1;
    claimResolutionIdentity(next, identity);
    next.turn = classicTurnMetadata(next);
    return freeze({ schema: 'RulesTransitionV1', state: freeze(next), outcome: freeze({
      schema: OUTCOME_SCHEMA, version: VERSION, type: 'rules.event-no-contest.v1',
      outcomeId: identity.id, resolutionIdentity: identity, matchId: next.matchId,
      sequence: next.sequence, formatId: 'classic', eventId: eventId,
      completed: false, winnerIds: [], completionReason: 'event-no-contest',
      turn: next.turn, presentation: { positiveOnly: true, cues: [] },
    }) });
  }

  function resolveClassicPlinkoTerminal(state, identity, terminalOutcome) {
    validateClassicState(state);
    if (state.phase !== 'active') throw new Error('Classic match is complete');
    var next = clone(state);
    var actorIndex = next.currentPlayerIndex;
    var actor = next.players[actorIndex];
    next.attemptCounter += 1;
    // A terminal Plinko launch is a completed competitive turn even when the
    // actor was ON FIRE; its special path bypasses ordinary stake/life loss but
    // advances sudden-death accounting exactly once.
    recordCompetitiveTurn(next, actor.id);
    if (terminalOutcome === 'current-win') {
      next.players.forEach(function (player) {
        if (player.id !== actor.id) eliminatePlayer(next, player.id);
      });
      if (actor.onFire || next.onFirePlayerId === actor.id) {
        next.lastFireRun = { playerId: actor.id, earned: next.onFireEarned,
          peakStreak: actor.bestStreak, reason: 'terminal-event' };
      }
      actor.onFire = false;
      actor.heatingUp = false;
      actor.streak = 0;
      next.onFirePlayerId = null;
      next.onFireEarned = 0;
      next.phase = 'complete';
      next.winnerIds = [actor.id];
      next.completionReason = 'plinko-automatic-win';
    } else if (terminalOutcome === 'current-loss') {
      eliminatePlayer(next, actor.id);
      var survivors = activePlayers(next);
      if (survivors.length <= 1) {
        next.phase = 'complete';
        next.winnerIds = survivors.map(function (player) { return player.id; });
        next.completionReason = 'plinko-automatic-loss';
      } else {
        next.currentPlayerIndex = nextActiveIndex(next, actorIndex);
        advanceCompletedSuddenDeathBand(next, next.currentPlayerIndex);
      }
    } else throw new RangeError('Unsupported Plinko terminal outcome');
    claimResolutionIdentity(next, identity);
    next.turn = classicTurnMetadata(next);
    return freeze({ schema: 'RulesTransitionV1', state: freeze(next), outcome: freeze({
      schema: OUTCOME_SCHEMA, version: VERSION, type: 'rules.plinko-terminal.v1',
      outcomeId: identity.id, resolutionIdentity: identity, matchId: next.matchId,
      sequence: next.sequence, formatId: 'classic', eventId: 'plinko',
      playerId: actor.id, terminalOutcome: terminalOutcome,
      completed: next.phase === 'complete', winnerIds: next.winnerIds.slice(),
      completionReason: next.completionReason, turn: next.turn,
      presentation: { positiveOnly: true,
        cues: terminalOutcome === 'current-win' ? ['match-win'] : [] },
    }) });
  }

  function resolveCupNoContest(state, identity, eventId) {
    validateCupState(state);
    if (state.phase !== 'heat') throw new Error('Cup is not accepting an event result');
    var next = clone(state);
    claimResolutionIdentity(next, identity);
    next.turn = cupTurnMetadata(next);
    return freeze({ schema: 'RulesTransitionV1', state: freeze(next), outcome: freeze({
      schema: OUTCOME_SCHEMA, version: VERSION, type: 'rules.event-no-contest.v1',
      outcomeId: identity.id, resolutionIdentity: identity, matchId: next.matchId,
      sequence: next.sequence, formatId: 'cup', eventId: eventId,
      heatNumber: next.heatNumber, completed: false, winnerIds: [],
      completionReason: 'event-no-contest', turn: next.turn,
      presentation: { positiveOnly: true, cues: [] },
    }) });
  }

  function resolveCupPlinkoTerminal(state, identity, terminalOutcome) {
    validateCupState(state);
    if (state.phase !== 'heat') throw new Error('Cup is not accepting an event result');
    var next = clone(state);
    var heat = next.currentHeat;
    var actor = heat.players[heat.currentPlayerIndex];
    var winnerId = actor.id;
    if (terminalOutcome === 'current-loss') {
      // WFC Cup precedent awards an automatic-loss heat to the next surviving
      // seat in the configured rotation.  This is deterministic for 2–8
      // entrants and rotates with the heat opener/direction.
      var winnerIndex = nextActiveIndex(heat, heat.currentPlayerIndex);
      winnerId = heat.players[winnerIndex].id;
    } else if (terminalOutcome !== 'current-win') {
      throw new RangeError('Unsupported Plinko terminal outcome');
    }
    // The WFC Cup contract resolves the heat immediately.  The outer rules
    // identity is authoritative; the inner heat is discarded after its bounded
    // summary is recorded.
    heat.attemptCounter += 1;
    heat.rulesTurnCounter += 1;
    heat.completionReason = terminalOutcome === 'current-win'
      ? 'plinko-automatic-win' : 'plinko-automatic-loss';
    claimResolutionIdentity(next, identity);
    var close = closeCupHeat(next, winnerId, { outcomeId: identity.id });
    next.turn = cupTurnMetadata(next);
    var cues = ['heat-win'];
    if (close.matchResolved) cues.push('match-win');
    return freeze({ schema: 'RulesTransitionV1', state: freeze(next), outcome: freeze({
      schema: OUTCOME_SCHEMA, version: VERSION, type: 'rules.plinko-terminal.v1',
      outcomeId: identity.id, resolutionIdentity: identity, matchId: next.matchId,
      sequence: next.sequence, formatId: 'cup', eventId: 'plinko',
      playerId: actor.id, terminalOutcome: terminalOutcome,
      heatNumber: state.heatNumber, heatResolved: true, heatWinnerId: winnerId,
      matchResolved: close.matchResolved, completed: next.phase === 'complete',
      winnerIds: next.winnerIds.slice(), completionReason: next.completionReason,
      turn: next.turn, presentation: { positiveOnly: true, cues: cues },
    }) });
  }

  function resolveTeamNoContest(state, identity, eventId) {
    validateTeamState(state);
    if (state.phase !== 'active') throw new Error('Team Clash match is complete');
    var next = clone(state);
    next.noContestCount += 1;
    claimResolutionIdentity(next, identity);
    next.turn = teamTurnMetadata(next);
    return freeze({ schema: 'RulesTransitionV1', state: freeze(next), outcome: freeze({
      schema: OUTCOME_SCHEMA, version: VERSION, type: 'rules.event-no-contest.v1',
      outcomeId: identity.id, resolutionIdentity: identity, matchId: next.matchId,
      sequence: next.sequence, formatId: 'team-clash', eventId: eventId,
      completed: false, winnerIds: [], completionReason: 'event-no-contest',
      turn: next.turn, presentation: { positiveOnly: true, cues: [] },
    }) });
  }

  function resolveEventAgainstState(state, request) {
    var source = object(request);
    var identity = requestedResolutionIdentity(state, {
      resolutionIdentity: source.resolutionIdentity,
      flipId: source.resolutionIdentity && source.resolutionIdentity.id,
    });
    if (identity.callerId == null || identity.callerId !== String(source.launchClaimId || '')) {
      throw new Error('ResolutionIdentityV1 is not bound to the event launch claim');
    }
    var eventId = required(source.eventId, 'eventId');
    if (source.noContest === true) {
      if (eventId !== 'plinko' || source.terminalOutcome != null || source.rulesInput != null) {
        throw new Error('Only a Plinko timeout may resolve as no-contest');
      }
      if (state.schema === 'ClassicRulesStateV1') return resolveClassicNoContest(state, identity, eventId);
      if (state.schema === 'CupRulesStateV1') return resolveCupNoContest(state, identity, eventId);
      return resolveTeamNoContest(state, identity, eventId);
    }
    if (source.terminalOutcome != null) {
      if (eventId !== 'plinko' || (source.terminalOutcome !== 'current-win' &&
          source.terminalOutcome !== 'current-loss')) {
        throw new Error('Only Plinko can submit a terminal automatic result');
      }
      if (state.schema === 'ClassicRulesStateV1') {
        return resolveClassicPlinkoTerminal(state, identity, source.terminalOutcome);
      }
      if (state.schema === 'CupRulesStateV1') {
        return resolveCupPlinkoTerminal(state, identity, source.terminalOutcome);
      }
      return resolveTeamFlip(state, { resolutionIdentity: identity,
        result: source.terminalOutcome === 'current-win' ? 'MAKE' : 'MISS',
        pose: source.terminalOutcome === 'current-win' ? 'upright' : 'miss',
        effects: { automaticWinner: source.terminalOutcome === 'current-win'
          ? 'current' : 'opponent', metadata: clone(object(source.metadata)) } });
    }
    if (!source.rulesInput || typeof source.rulesInput !== 'object') {
      throw new TypeError('A non-terminal event requires rules input');
    }
    return resolveMatchFlip(state, Object.assign({ resolutionIdentity: identity }, clone(source.rulesInput)));
  }

  function consumeEventMatchCapability(capability, request) {
    var record = eventCapabilityRecord(capability);
    var source = object(request);
    var state = record.getState();
    validateResolutionHighWater(state);
    var identityId = source.resolutionIdentity && source.resolutionIdentity.id;
    var signature = String(identityId || '') + '|' + String(source.launchClaimId || '') + '|' +
      String(source.eventId || '') + '|' + String(source.terminalOutcome || '') + '|' +
      String(source.noContest === true);
    if (record.last && record.last.signature === signature) {
      return freeze({ schema: 'RulesEventConsumeV1', duplicate: true,
        formatId: state.formatId, transition: record.last.transition });
    }
    var transition = resolveEventAgainstState(state, source);
    record.setState(transition.state);
    record.last = { signature: signature, transition: transition };
    return freeze({ schema: 'RulesEventConsumeV1', duplicate: false,
      formatId: transition.state.formatId, transition: transition });
  }

  function createMatchState(input) {
    var source = normalizeRequest(input);
    var formatId = String(source.formatId || 'classic');
    if (formatId === 'classic') return createClassicState(source);
    if (formatId === 'cup') return createCupState(source);
    if (formatId === 'team-clash' || formatId === 'team') return createTeamClashState(source);
    throw new RangeError('Unsupported rules format: ' + formatId);
  }

  function resolveMatchFlip(state, input) {
    if (!state || typeof state !== 'object') throw new TypeError('Rules state is required');
    if (state.schema === 'ClassicRulesStateV1') return resolveClassicFlip(state, input);
    if (state.schema === 'CupRulesStateV1') return resolveCupFlip(state, input);
    if (state.schema === 'TeamClashRulesStateV1') return resolveTeamFlip(state, input);
    throw new TypeError('Unsupported rules state: ' + state.schema);
  }

  function participantResults(state) {
    if (state.schema === 'ClassicRulesStateV1') {
      return state.players.map(function (player) {
        return { playerId: player.id, lives: player.lives, eliminated: player.eliminated,
          streak: player.streak, bestStreak: player.bestStreak };
      });
    }
    if (state.schema === 'CupRulesStateV1') {
      return state.config.players.map(function (player) {
        return { playerId: player.id, heatWins: state.heatWins[player.id] || 0 };
      });
    }
    return state.config.players.map(function (player) {
      var teamIndex = state.config.teams[0].indexOf(player.id) >= 0 ? 0 : 1;
      return { playerId: player.id, teamId: state.config.teamIds[teamIndex],
        teamScore: state.scores[teamIndex], stats: clone(state.playerStats[player.id]) };
    });
  }

  function toMatchOutcomeV2(state, options) {
    if (state && state.schema === 'ClassicRulesStateV1') validateClassicState(state);
    else if (state && state.schema === 'CupRulesStateV1') validateCupState(state);
    else if (state && state.schema === 'TeamClashRulesStateV1') validateTeamState(state);
    else throw new TypeError('Supported rules state is required');
    var source = object(options);
    var rulesComplete = state.phase === 'complete';
    var status = String(source.status || (rulesComplete ? 'completed' : 'abandoned'));
    if (['completed', 'abandoned', 'cancelled'].indexOf(status) < 0) {
      throw new TypeError('Unsupported outcome status: ' + status);
    }
    if ((status === 'completed') !== rulesComplete) {
      throw new Error('Match outcome status contradicts the rules phase');
    }
    return freeze({
      schema: 'MatchOutcomeV2', matchId: state.matchId, status: status,
      completed: status === 'completed', winnerIds: status === 'completed' ? state.winnerIds.slice() : [],
      participantResults: participantResults(state), rulesState: clone(state),
      resolutionIdentity: clone(state.resolutionIdentity),
      activityState: clone(object(source.activityState)), telemetry: clone(object(source.telemetry)),
      completionReason: status === 'completed' ? (state.completionReason || 'completed') : status,
      endedAt: source.endedAt == null ? null : String(source.endedAt),
    });
  }

  function normalizeOrdinaryAdapterInput(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError('Ordinary rules resolution requires a plain input object');
    }
    var prototype = Object.getPrototypeOf(value);
    var crossRealmPlain = prototype && Object.getPrototypeOf(prototype) === null;
    if (prototype !== null && prototype !== Object.prototype && !crossRealmPlain) {
      throw new TypeError('Ordinary rules resolution requires a plain input object');
    }
    if (typeof Object.getOwnPropertySymbols === 'function' &&
        Object.getOwnPropertySymbols(value).length) {
      throw new TypeError('Ordinary rules resolution does not accept symbol fields');
    }
    var allowed = new Set([
      'resolutionIdentity', 'flipId', 'playerId', 'result', 'pose', 'onCap', 'reason',
    ]);
    var clean = Object.create(null);
    Object.getOwnPropertyNames(value).forEach(function (key) {
      if (!allowed.has(key) || key === '__proto__' || key === 'prototype' || key === 'constructor') {
        throw new TypeError('Ordinary rules resolution cannot apply event field: ' + key);
      }
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        throw new TypeError('Ordinary rules resolution fields must be plain values');
      }
      clean[key] = descriptor.value;
    });
    return clean;
  }

  function legacyClassicOptions(input) {
    if (input && input.schema === 'ClassicRulesStateV1') validateClassicState(input);
    var config = normalizeClassicConfig(input && input.schema === 'ClassicRulesStateV1'
      ? input.config : input);
    return freeze({
      format: 'classic', startingLives: config.startingLives,
      startIndex: config.startIndex,
      suddenDeathFlipThreshold: config.suddenDeathActivationTurn,
    });
  }

  function legacyClassicSnapshot(state) {
    validateClassicState(state);
    return freeze({
      format: 'classic', state: state.phase === 'complete' ? 'GAME_OVER' : 'TURN_START',
      players: state.players.map(function (player) {
        return { name: player.name, lives: player.lives, streak: player.streak,
          isHeatingUp: player.heatingUp, isOnFire: player.onFire,
          alwaysMagnet: player.alwaysMagnet, eliminated: player.eliminated };
      }),
      currentPlayerIndex: state.currentPlayerIndex,
      pointCount: state.stake,
      turnCounter: state.attemptCounter,
      suddenDeathFlipThreshold: state.suddenDeath.activationTurn,
      onFirePlayerIndex: state.onFirePlayerId == null ? null
        : state.players.findIndex(function (player) { return player.id === state.onFirePlayerId; }),
      onFireBonus: state.onFireEarned,
      winnerIndex: state.winnerIds.length
        ? state.players.findIndex(function (player) { return player.id === state.winnerIds[0]; }) : 0,
    });
  }

  function createRulesAdapter(input) {
    var state = createMatchState(input);
    var eventCapability = Object.freeze({ schema: 'RulesEventMatchCapabilityV1' });
    var landingConnector = Object.freeze({ schema: 'RulesLandingConnectorV1' });
    var eventAuthorityClaimed = false;
    var landingConnectorIssued = false;
    function update(transition) {
      if (!transition || !transition.state || transition.state.matchId !== state.matchId ||
          transition.state.formatId !== state.formatId) {
        throw new Error('Rules transition attempted to replace the immutable match identity');
      }
      state = transition.state;
      return transition;
    }
    var apiMethods = {
      snapshot: function () { return snapshot(state); },
      nextResolutionIdentity: function (callerId) {
        return nextResolutionIdentity(state, callerId);
      },
      beginNextHeat: function () {
        if (state.schema !== 'CupRulesStateV1') throw new Error('Only Cup has heats');
        state = beginNextCupHeat(state);
        return snapshot(state);
      },
      rematchOptions: function (seed) {
        if (state.schema === 'CupRulesStateV1') return cupRematchOptions(state, seed);
        if (state.schema === 'TeamClashRulesStateV1') return teamRematchOptions(state, seed);
        throw new Error('This format has no structured rematch options');
      },
      toMatchOutcome: function (options) { return toMatchOutcomeV2(state, options); },
      claimEventAuthority: function () {
        if (eventAuthorityClaimed) {
          throw new Error('This rules match already issued its event authority');
        }
        var authority = eventKernelModule().createAuthority({ matchCapability: eventCapability });
        eventAuthorityClaimed = true;
        return authority;
      },
      claimLandingConnector: function () {
        if (landingConnectorIssued) {
          throw new Error('This rules match already issued its landing connector');
        }
        landingConnectorIssued = true;
        return landingConnector;
      },
    };
    // This entire module is private CommonJS. The future generated lexical
    // browser composition must keep this raw mutation entry point private and
    // cross the physics-issued LandingVerdict authority instead; event outcomes
    // retain their separate branded EventKernel path.
    apiMethods.resolveFlip = function (value) {
      return update(resolveMatchFlip(state, normalizeOrdinaryAdapterInput(value)));
    };
    var api = Object.freeze(apiMethods);
    EVENT_MATCH_CAPABILITIES.set(eventCapability, {
      getState: function () { return state; },
      setState: function (nextState) { update({ state: nextState }); },
      last: null,
    });
    LANDING_MATCH_CONNECTORS.set(landingConnector, {
      getState: function () { return state; },
      resolve: function (value) {
        return update(resolveMatchFlip(state, normalizeOrdinaryAdapterInput(value)));
      },
      claimed: false,
      claimantProof: null,
    });
    return api;
  }

  return freeze({
    schema: 'FlipgameV112RulesV1', version: VERSION,
    OUTCOME_SCHEMA: OUTCOME_SCHEMA,
    RESOLUTION_IDENTITY_SCHEMA: RESOLUTION_IDENTITY_SCHEMA,
    MAX_CALLER_FLIP_ID_LENGTH: MAX_CALLER_FLIP_ID_LENGTH,
    STARTING_LIFE_PRESETS: STARTING_LIFE_PRESETS,
    CUP_FORMATS: CUP_FORMATS,
    REMATCH_STRATEGIES: REMATCH_STRATEGIES,
    DEFAULT_CLASSIC_SUDDEN_DEATH_TURNS: DEFAULT_CLASSIC_SUDDEN_DEATH_TURNS,
    DEFAULT_SUDDEN_DEATH_STEP_TURNS: DEFAULT_SUDDEN_DEATH_STEP_TURNS,
    alignToRotation: alignToRotation,
    additiveLifeCap: additiveLifeCap,
    addLivesCapped: addLivesCapped,
    multiplyLives: multiplyLives,
    halveLives: halveLives,
    nextResolutionIdentity: nextResolutionIdentity,
    inspectEventMatchCapability: inspectEventMatchCapability,
    consumeEventMatchCapability: consumeEventMatchCapability,
    claimLandingMatchConnector: claimLandingMatchConnector,
    normalizeLanding: normalizeLanding,
    normalizeEffects: normalizeEffects,
    normalizeClassicConfig: normalizeClassicConfig,
    createClassicState: createClassicState,
    resolveClassicFlip: resolveClassicFlip,
    classicMissWouldEliminate: classicMissWouldEliminate,
    forceEliminate: forceEliminate,
    normalizeCupConfig: normalizeCupConfig,
    createCupState: createCupState,
    beginNextCupHeat: beginNextCupHeat,
    resolveCupFlip: resolveCupFlip,
    cupRematchOptions: cupRematchOptions,
    normalizeTeamConfig: normalizeTeamConfig,
    createTeamClashState: createTeamClashState,
    resolveTeamFlip: resolveTeamFlip,
    teamRematchOptions: teamRematchOptions,
    collectPositiveHighlights: collectPositiveHighlights,
    createMatchState: createMatchState,
    resolveMatchFlip: resolveMatchFlip,
    toMatchOutcomeV2: toMatchOutcomeV2,
    legacyClassicOptions: legacyClassicOptions,
    legacyClassicSnapshot: legacyClassicSnapshot,
    createRulesAdapter: createRulesAdapter,
  });
});
