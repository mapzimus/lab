// v112-battle.js -- deterministic Battle rules and power-card state.
// Lane physics/input/rendering are injected by the runtime integration layer.
(function (root, factory) {
  'use strict';
  var commonJs = typeof module === 'object' && !!module && !!module.exports &&
    typeof require === 'function' && typeof process === 'object' && !!process &&
    !!process.versions && typeof process.versions.node === 'string';
  if (!commonJs && root && Object.prototype.hasOwnProperty.call(
    root, 'FlipgameV112Battle')) {
    throw new Error('FlipgameV112Battle is already defined; refusing an ambiguous browser authority');
  }
  var api = factory();
  if (commonJs) {
    module.exports = api;
  } else if (root) {
    Object.defineProperty(root, 'FlipgameV112Battle', {
      value: api, enumerable: true, writable: false, configurable: false,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function () {
  'use strict';

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
  function boundedText(value, label, maximum) {
    var text = required(value, label);
    if (text.length > maximum) throw new RangeError(label + ' exceeds ' + maximum + ' characters');
    for (var index = 0; index < text.length; index++) {
      var code = text.charCodeAt(index);
      if (code < 32 || code === 127) throw new TypeError(label + ' contains control characters');
    }
    if (text === '__proto__') throw new TypeError(label + ' uses an unsafe identity');
    return text;
  }
  function nullableText(value, label, maximum) {
    return value == null ? null : boundedText(value, label, maximum);
  }
  function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
  function sameCanonicalValue(left, right) {
    if (left === right) return true;
    if (left == null || right == null || typeof left !== 'object' || typeof right !== 'object') {
      return false;
    }
    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
      for (var index = 0; index < left.length; index++) {
        if (own(left, index) !== own(right, index) ||
            (own(left, index) && !sameCanonicalValue(left[index], right[index]))) return false;
      }
      return true;
    }
    var leftKeys = Object.keys(left).sort();
    var rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length && leftKeys.every(function (key, index) {
      return key === rightKeys[index] && sameCanonicalValue(left[key], right[key]);
    });
  }
  function canonicalJson(value) {
    if (value == null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
      return '[' + value.map(function (entry) { return canonicalJson(entry); }).join(',') + ']';
    }
    return '{' + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ':' + canonicalJson(value[key]);
    }).join(',') + '}';
  }
  function exactKeys(value, keys, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError(label + ' must be an object');
    }
    var actual = Object.keys(value).sort();
    var expected = keys.slice().sort();
    if (!sameCanonicalValue(actual, expected)) throw new TypeError(label + ' has unknown or missing fields');
  }
  function whole(value, label, minimum, maximum) {
    if (!Number.isSafeInteger(value) || value < minimum || (maximum != null && value > maximum)) {
      throw new RangeError(label + ' is outside its allowed bounds');
    }
    return value;
  }
  function finite(value, label, minimum, maximum) {
    if (!Number.isFinite(value) || value < minimum || (maximum != null && value > maximum)) {
      throw new RangeError(label + ' is outside its allowed bounds');
    }
    return value;
  }
  function denseArray(value, label, maximumLength) {
    if (!Array.isArray(value) || (maximumLength != null && value.length > maximumLength)) {
      throw new TypeError(label + ' must be a bounded array');
    }
    for (var index = 0; index < value.length; index++) {
      if (!own(value, index)) throw new TypeError(label + ' cannot contain empty slots');
      var descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !own(descriptor, 'value')) {
        throw new TypeError(label + ' cannot contain accessor entries');
      }
    }
    if (Object.getOwnPropertyNames(value).some(function (key) {
      return key !== 'length' &&
        (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length);
    }) || (typeof Object.getOwnPropertySymbols === 'function' &&
      Object.getOwnPropertySymbols(value).length)) {
      throw new TypeError(label + ' has unexpected properties');
    }
    return value;
  }
  function unique(values) { return Array.from(new Set((Array.isArray(values) ? values : []).map(String))); }
  function hash(seed, salt) {
    var seedNumber = Number(seed);
    var saltNumber = Number(salt);
    if (!Number.isFinite(seedNumber)) seedNumber = 1;
    if (!Number.isFinite(saltNumber)) saltNumber = 0;
    var x = (seedNumber ^ saltNumber) >>> 0;
    x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b); x ^= x >>> 16;
    return x >>> 0;
  }
  function hashText(value) {
    var text = String(value);
    var result = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) {
      result ^= text.charCodeAt(i);
      result = Math.imul(result, 0x01000193);
    }
    return result >>> 0;
  }

  var MAX_MATCH_ID_LENGTH = 128;
  var MAX_PLAYER_ID_LENGTH = 64;
  var MAX_TEAM_ID_LENGTH = 64;
  var MAX_ATTEMPT_ID_LENGTH = 192;
  var MAX_RESOLVED_ATTEMPTS = 10000;
  var MAX_ROTATION_INDEX = 1000000;
  var MAX_VIEWPORT_WIDTH = 32768;
  var CONFIG_KEYS = freeze(['schema', 'matchId', 'activityFormatId', 'formatId',
    'paceId', 'physicsModeId', 'powerProfileId', 'players', 'hardware', 'heatTarget',
    'volleyCount', 'rushDurationMs', 'rotationIntervalMs', 'seed',
    'normalEventsEnabled', 'crossLaneCollisions']);
  var PLAYER_KEYS = freeze(['id', 'seat', 'teamId', 'cpu', 'human', 'displayName',
    'flipperId', 'variantId', 'cosmeticId']);
  var HARDWARE_KEYS = freeze(['width', 'verifiedContacts', 'activeLaneLimit',
    'simultaneous', 'fallback']);
  var STATE_KEYS = freeze(['schema', 'matchId', 'formatId', 'config', 'phase',
    'heatNumber', 'heatWins', 'scores', 'charges', 'powerOffers',
    'deferredPowerOffers', 'storedPowers', 'storedPowerSequences',
    'powerOfferSequences', 'activePlayerIds',
    'rotationIndex', 'heatStarterIndex', 'volleyIndex', 'suddenDeath',
    'suddenDeathCompetitorIds', 'elapsedMs', 'clockExpired', 'resolvedAttemptIds',
    'resolvedAttempts', 'heatResults', 'volleyPlayerIds', 'volleyParticipantIds',
    'winnerId', 'completionReason', 'pendingLaunchIds', 'pendingLaunchOwners',
    'pendingLaunchLeases']);
  var ATTEMPT_KEYS = freeze(['attemptId', 'playerId', 'competitorId', 'heatNumber',
    'volleyIndex', 'suddenDeath', 'pose', 'score', 'qualifiedManual', 'launchLease']);
  var LAUNCH_LEASE_KEYS = freeze(['schema', 'paceId', 'playerId', 'heatNumber',
    'elapsedMs', 'bucketIndex', 'rotationIndex', 'volleyIndex', 'suddenDeath']);
  var HEAT_RESULT_KEYS = freeze(['schema', 'heatNumber', 'winnerId', 'scores',
    'attemptStartIndex', 'attemptEndIndex', 'starterIndex', 'endingRotationIndex',
    'completionReason', 'suddenDeath', 'elapsedMs', 'clockExpired']);
  var CARD_KEYS = freeze(['id', 'scope', 'eventAdapterId']);
  var TARGET_CARD_KEYS = freeze(['id', 'scope', 'eventAdapterId', 'targetId']);

  var SPORT_CARDS = freeze([
    { id: 'magnet-pulse', scope: 'self', eventAdapterId: 'magnet' },
    { id: 'heartbeat-brace', scope: 'self', eventAdapterId: 'heart-rush' },
    { id: 'power-launch', scope: 'self', eventAdapterId: 'power-launch' },
    { id: 'moon-round', scope: 'symmetric', eventAdapterId: 'moon-gravity' },
    { id: 'bouncy-round', scope: 'symmetric', eventAdapterId: 'bouncy-bottle' },
    { id: 'wind-round', scope: 'symmetric', eventAdapterId: 'wind-tunnel' },
    { id: 'trampoline-round', scope: 'symmetric', eventAdapterId: 'trampoline' },
  ]);
  var MAYHEM_CARDS = freeze([
    { id: 'ice-patch', scope: 'target', eventAdapterId: 'ice-slide' },
    { id: 'crosswind', scope: 'target', eventAdapterId: 'wind-tunnel' },
    { id: 'earthquake', scope: 'target', eventAdapterId: 'earthquake' },
    { id: 'gravity-slam', scope: 'target', eventAdapterId: 'gravity-slam' },
    { id: 'fizz-jet', scope: 'target', eventAdapterId: 'fizz-jet' },
  ]);

  function hardwareProfile(input) {
    var source = object(input);
    var width = Number(source.width);
    if (!Number.isFinite(width)) width = 0;
    width = Math.max(0, Math.min(MAX_VIEWPORT_WIDTH, width));
    var contacts = Number(source.verifiedContacts);
    if (!Number.isFinite(contacts)) contacts = 1;
    contacts = Math.max(1, Math.min(16, Math.floor(contacts)));
    var activeLaneLimit = width >= 1100 && contacts >= 4 ? 4
      : (width >= 768 && contacts >= 2 ? 2 : 1);
    return freeze({ width: width, verifiedContacts: contacts,
      activeLaneLimit: activeLaneLimit,
      simultaneous: activeLaneLimit > 1,
      fallback: activeLaneLimit === 1 ? 'alternating-relay' : null });
  }

  function normalizePlayers(value) {
    if (!Array.isArray(value)) throw new TypeError('players are required');
    var ids = new Set();
    return Array.from(value).map(function (entry, seat) {
      var source = object(entry);
      var id = boundedText(source.id || source.playerId, 'player id', MAX_PLAYER_ID_LENGTH);
      if (ids.has(id)) throw new TypeError('Duplicate player id: ' + id);
      ids.add(id);
      var normalizedType = String(source.type || '').toLowerCase();
      var cpu = source.cpu === true || source.isCpu === true || source.ai === true ||
        source.isAI === true || source.human === false ||
        normalizedType === 'cpu' || normalizedType === 'ai';
      var displayName = source.displayName != null ? String(source.displayName)
        : (source.name != null ? String(source.name) : null);
      if (displayName != null && displayName.length > 128) {
        throw new RangeError('player displayName exceeds 128 characters');
      }
      return freeze({ id: id, seat: seat,
        teamId: nullableText(source.teamId, 'team id', MAX_TEAM_ID_LENGTH),
        cpu: cpu, human: !cpu, displayName: displayName,
        flipperId: nullableText(source.flipperId || source.objectId || source.skin,
          'flipper id', 96),
        variantId: nullableText(source.variantId, 'variant id', 96),
        cosmeticId: nullableText(source.cosmeticId, 'cosmetic id', 96) });
    });
  }

  function normalizeRequest(input) {
    var source = object(input);
    if (source.schema !== 'MatchRequestV2') return source;
    var options = clone(object(source.rulesOptions));
    return Object.assign({}, options, {
      matchId: source.matchId,
      activityFormatId: source.formatId,
      physicsModeId: source.physicsModeId,
      players: clone(source.roster),
      seed: source.seed,
      formatId: options.battleFormatId || options.formatId || 'duel',
    });
  }

  function normalizeConfig(input) {
    var source = normalizeRequest(input);
    var seedNumber = Number(source.seed);
    if (!Number.isFinite(seedNumber)) seedNumber = 1;
    var formatId = String(source.battleFormatId || source.formatId || 'duel');
    if (['duel', 'doubles', 'four-way', 'team'].indexOf(formatId) < 0) {
      throw new TypeError('Unsupported Battle format: ' + formatId);
    }
    var paceId = String(source.paceId || 'volley');
    if (['volley', 'rush'].indexOf(paceId) < 0) throw new TypeError('Unsupported Battle pace: ' + paceId);
    var powerProfileId = String(source.powerProfileId || 'sport');
    if (['sport', 'mayhem'].indexOf(powerProfileId) < 0) throw new TypeError('Unsupported power profile');
    var activityFormatId = String(source.activityFormatId || 'battle');
    if (activityFormatId !== 'battle') throw new TypeError('Battle activity format must be battle');
    var physicsModeId = String(source.physicsModeId || 'normal');
    if (physicsModeId !== 'normal' && physicsModeId !== 'insane') {
      throw new TypeError('Battle supports normal or insane match identity only');
    }
    var players = normalizePlayers(source.players);
    if (formatId === 'duel' && players.length !== 2) throw new TypeError('Duel requires two players');
    if ((formatId === 'doubles' || formatId === 'four-way') && players.length !== 4) {
      throw new TypeError(formatId + ' requires four players');
    }
    if (formatId === 'team' && (players.length < 6 || players.length > 16 || players.length % 2)) {
      throw new TypeError('Team Battle requires an even 6–16 players');
    }
    if (formatId === 'doubles' || formatId === 'team') {
      var teams = new Map();
      players.forEach(function (player) {
        if (!player.teamId) throw new TypeError('Team player requires teamId');
        teams.set(player.teamId, (teams.get(player.teamId) || 0) + 1);
      });
      if (teams.size !== 2 || new Set(teams.values()).size !== 1) throw new TypeError('Battle teams must be two equal groups');
    }
    if ((formatId === 'duel' || formatId === 'four-way') &&
        players.some(function (player) { return player.teamId != null; })) {
      throw new TypeError('Individual Battle players cannot have teams');
    }
    return freeze({ schema: 'BattleConfigV1',
      matchId: boundedText(source.matchId, 'matchId', MAX_MATCH_ID_LENGTH),
      activityFormatId: activityFormatId, formatId: formatId, paceId: paceId,
      physicsModeId: physicsModeId, powerProfileId: powerProfileId,
      players: players, hardware: hardwareProfile(source.hardware),
      heatTarget: 2, volleyCount: 5, rushDurationMs: 60000,
      rotationIntervalMs: 15000, seed: seedNumber >>> 0,
      normalEventsEnabled: false, crossLaneCollisions: false });
  }

  function validateBattleConfig(value) {
    exactKeys(value, CONFIG_KEYS, 'BattleConfigV1');
    if (value.schema !== 'BattleConfigV1') throw new TypeError('BattleConfigV1 is required');
    denseArray(value.players, 'Battle players', 16);
    var canonical = normalizeConfig(value);
    if (!sameCanonicalValue(value, canonical)) throw new Error('Battle config is not canonical');
    boundedText(value.matchId, 'matchId', MAX_MATCH_ID_LENGTH);
    exactKeys(value.hardware, HARDWARE_KEYS, 'Battle hardware');
    finite(value.hardware.width, 'Battle viewport width', 0, MAX_VIEWPORT_WIDTH);
    whole(value.hardware.verifiedContacts, 'verified contacts', 1, 16);
    value.players.forEach(function (player, index) {
      exactKeys(player, PLAYER_KEYS, 'Battle player');
      if (player.seat !== index || player.cpu !== !player.human) {
        throw new Error('Battle player seat or human/CPU identity is not canonical');
      }
    });
    return true;
  }

  function competitors(config) {
    if (config.formatId === 'doubles' || config.formatId === 'team') {
      return unique(config.players.map(function (player) { return player.teamId; }));
    }
    return config.players.map(function (player) { return player.id; });
  }

  function members(config, competitorId) {
    return config.players.filter(function (player) {
      return (config.formatId === 'doubles' || config.formatId === 'team')
        ? player.teamId === competitorId : player.id === competitorId;
    });
  }

  function selectRushActive(config, rotationIndex) {
    var limit = config.hardware.activeLaneLimit;
    if (config.formatId === 'duel') {
      return limit === 1 ? [config.players[rotationIndex % config.players.length].id]
        : config.players.map(function (player) { return player.id; });
    }
    if (config.formatId === 'four-way') {
      var count = Math.min(limit, config.players.length);
      var list = [];
      for (var i = 0; i < count; i++) list.push(config.players[(rotationIndex + i) % config.players.length].id);
      return list;
    }
    if (limit === 1) {
      // Unsupported/small displays alternate teams, then advance each team's
      // own roster cursor. A single global player list would give one team all
      // four Rush windows in an entire heat.
      var relayTeams = competitors(config);
      var relayTeamIndex = rotationIndex % relayTeams.length;
      var relayRound = Math.floor(rotationIndex / relayTeams.length);
      var relayMembers = members(config, relayTeams[relayTeamIndex]);
      return [relayMembers[relayRound % relayMembers.length].id];
    }
    var ids = [];
    var perTeam = limit >= 4 ? 2 : 1;
    competitors(config).forEach(function (teamId) {
      var team = members(config, teamId);
      for (var i = 0; i < perTeam; i++) ids.push(team[(rotationIndex + i) % team.length].id);
    });
    return ids.slice(0, limit);
  }

  function selectVolleyParticipants(config, rotationIndex, eligibleCompetitorIds) {
    var eligible = unique(eligibleCompetitorIds && eligibleCompetitorIds.length
      ? eligibleCompetitorIds : competitors(config));
    if (config.formatId === 'duel') {
      var duelPlayers = config.players;
      if (config.hardware.activeLaneLimit === 1) {
        duelPlayers = config.players.map(function (_, index) {
          return config.players[(rotationIndex + index) % config.players.length];
        });
      }
      return duelPlayers.filter(function (player) {
        return eligible.indexOf(player.id) >= 0;
      }).map(function (player) { return player.id; });
    }
    if (config.formatId === 'four-way') {
      return config.players.map(function (_, index) {
        return config.players[(rotationIndex + index) % config.players.length].id;
      }).filter(function (id) { return eligible.indexOf(id) >= 0; });
    }
    var allTeamIds = competitors(config);
    if (config.hardware.activeLaneLimit === 1 && allTeamIds.length > 1) {
      allTeamIds = allTeamIds.map(function (_, index) {
        return allTeamIds[(rotationIndex + index) % allTeamIds.length];
      });
    }
    var teamIds = allTeamIds.filter(function (id) { return eligible.indexOf(id) >= 0; });
    var perTeam = config.hardware.activeLaneLimit >= 4 ? 2 : 1;
    var selected = teamIds.map(function (teamId) {
      var team = members(config, teamId);
      var entries = [];
      for (var i = 0; i < perTeam; i++) {
        entries.push(team[(rotationIndex + i) % team.length].id);
      }
      return entries;
    });
    var interleaved = [];
    for (var seat = 0; seat < perTeam; seat++) {
      selected.forEach(function (team) { interleaved.push(team[seat]); });
    }
    return interleaved;
  }

  function rotationStep(config) {
    if (config.paceId === 'volley') {
      if (config.formatId === 'doubles' || config.formatId === 'team') {
        return config.hardware.activeLaneLimit >= 4 ? 2 : 1;
      }
      return 1;
    }
    if (config.formatId === 'four-way') {
      return Math.min(config.hardware.activeLaneLimit, config.players.length);
    }
    if (config.formatId === 'doubles' || config.formatId === 'team') {
      return config.hardware.activeLaneLimit === 1 ? 1
        : (config.hardware.activeLaneLimit >= 4 ? 2 : 1);
    }
    return 1;
  }

  function rushRotationInterval(config) {
    // On a one-lane relay, alternating competitors every 7.5s gives each team
    // a new representative every advertised 15s. This is the only way an 8v8
    // 2-0 match can expose all sixteen players while retaining 60-second heats.
    return config.hardware.activeLaneLimit === 1 &&
      (config.formatId === 'duel' || config.formatId === 'doubles' || config.formatId === 'team')
      ? config.rotationIntervalMs / 2 : config.rotationIntervalMs;
  }

  function advanceRotation(next) { next.rotationIndex += rotationStep(next.config); }

  function powerRoundPlayerIds(state) {
    if (state.config.paceId === 'volley' || state.suddenDeath) {
      return freeze(state.volleyParticipantIds.slice());
    }
    var wanted = competitors(state.config);
    var perCompetitor = (state.config.formatId === 'doubles' || state.config.formatId === 'team') &&
      state.config.hardware.activeLaneLimit >= 4 ? 2 : 1;
    var result = [];
    var counts = blankMap(wanted, 0);
    var cursor = state.rotationIndex;
    var safety = state.config.players.length * 2 + 2;
    while (safety-- > 0 && wanted.some(function (id) { return counts[id] < perCompetitor; })) {
      selectRushActive(state.config, cursor).forEach(function (playerId) {
        var key = (state.config.formatId === 'doubles' || state.config.formatId === 'team')
          ? state.config.players.find(function (entry) { return entry.id === playerId; }).teamId
          : playerId;
        if (counts[key] < perCompetitor && result.indexOf(playerId) < 0) {
          result.push(playerId);
          counts[key] += 1;
        }
      });
      cursor += rotationStep(state.config);
    }
    return freeze(result);
  }

  function volleyBatchLimit(next) {
    return next.suddenDeath
      ? Math.min(2, next.config.hardware.activeLaneLimit)
      : next.config.hardware.activeLaneLimit;
  }

  function prepareVolley(next) {
    next.volleyPlayerIds = [];
    next.volleyParticipantIds = selectVolleyParticipants(next.config, next.rotationIndex,
      next.suddenDeath ? next.suddenDeathCompetitorIds : null);
    next.activePlayerIds = next.volleyParticipantIds.slice(0, volleyBatchLimit(next));
  }

  function advanceVolleyBatch(next) {
    var remaining = next.volleyParticipantIds.filter(function (id) {
      return next.volleyPlayerIds.indexOf(id) < 0;
    });
    if (!remaining.length) return false;
    next.activePlayerIds = remaining.slice(0, volleyBatchLimit(next));
    return true;
  }

  function scoreForPose(pose) {
    return pose === 'cap' ? 2 : (pose === 'upright' ? 1 : 0);
  }

  function blankMap(ids, value) {
    var result = {};
    ids.forEach(function (id) { result[id] = typeof value === 'function' ? value() : value; });
    return result;
  }

  function createState(input) {
    if (input && input.schema === 'BattleConfigV1') validateBattleConfig(input);
    var config = normalizeConfig(input);
    validateBattleConfig(config);
    var ids = competitors(config);
    var initialParticipants = selectVolleyParticipants(config, 0);
    var initialActive = config.paceId === 'volley'
      ? initialParticipants.slice(0, config.hardware.activeLaneLimit)
      : selectRushActive(config, 0);
    var state = { schema: 'BattleStateV1', matchId: config.matchId,
      formatId: 'battle', config: config, phase: 'ready',
      heatNumber: 1, heatWins: blankMap(ids, 0), scores: blankMap(ids, 0),
      charges: blankMap(ids, 0), powerOffers: blankMap(ids, null),
      deferredPowerOffers: blankMap(ids, null), storedPowers: blankMap(ids, null),
      storedPowerSequences: blankMap(ids, 0),
      powerOfferSequences: blankMap(ids, 0),
      activePlayerIds: initialActive, rotationIndex: 0, heatStarterIndex: 0, volleyIndex: 0,
      suddenDeath: false, suddenDeathCompetitorIds: [], elapsedMs: 0, clockExpired: false,
      resolvedAttemptIds: [], resolvedAttempts: [], heatResults: [],
      volleyPlayerIds: [],
      volleyParticipantIds: config.paceId === 'volley' ? initialParticipants : [],
      winnerId: null, completionReason: null,
      pendingLaunchIds: [], pendingLaunchOwners: {}, pendingLaunchLeases: {} };
    validateBattleState(state);
    return freeze(state);
  }

  function ownerKey(state, playerId) {
    var player = state.config.players.find(function (candidate) { return candidate.id === playerId; });
    if (!player) throw new TypeError('Unknown Battle player: ' + playerId);
    return (state.config.formatId === 'doubles' || state.config.formatId === 'team') ? player.teamId : player.id;
  }

  function powerPool(config) {
    return config.powerProfileId === 'mayhem' ? SPORT_CARDS.concat(MAYHEM_CARDS) : SPORT_CARDS.slice();
  }

  function offerCards(state, key, sequence) {
    var pool = powerPool(state.config);
    var salt = hash(hashText(key), Number(sequence) || 0);
    var firstIndex = hash(state.config.seed, salt) % pool.length;
    var secondIndex = hash(state.config.seed, salt ^ 0x9e3779b9) % (pool.length - 1);
    if (secondIndex >= firstIndex) secondIndex += 1;
    return [clone(pool[firstIndex]), clone(pool[secondIndex])];
  }

  function rankedLeaders(scores, eligibleIds) {
    var ids = eligibleIds && eligibleIds.length ? eligibleIds : Object.keys(scores);
    var entries = unique(ids).filter(function (id) {
      return Object.prototype.hasOwnProperty.call(scores, id);
    }).map(function (id) { return [id, scores[id]]; });
    if (!entries.length) throw new Error('Sudden death requires at least one eligible competitor');
    var top = Math.max.apply(Math, entries.map(function (entry) { return entry[1]; }));
    return entries.filter(function (entry) { return entry[1] === top; }).map(function (entry) { return entry[0]; });
  }

  function sameIdSet(left, right) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      new Set(left).size === left.length && left.every(function (id) { return right.indexOf(id) >= 0; });
  }

  function validateIdList(value, allowed, label, maximumLength) {
    denseArray(value, label, maximumLength);
    if (new Set(value).size !== value.length) {
      throw new TypeError(label + ' must be a bounded unique list');
    }
    value.forEach(function (id) {
      if (typeof id !== 'string') throw new TypeError(label + ' identities must be strings');
      if (id !== boundedText(id, label + ' id', MAX_ATTEMPT_ID_LENGTH)) {
        throw new TypeError(label + ' identities must already be canonical');
      }
      if (allowed && allowed.indexOf(id) < 0) throw new RangeError(label + ' contains an unknown id');
    });
  }

  function validateCompetitorMap(value, ids, label, validator) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        !sameIdSet(Object.keys(value), ids)) {
      throw new TypeError(label + ' keys do not match Battle competitors');
    }
    ids.forEach(function (id) { validator(value[id], id); });
  }

  function cardDefinition(config, id) {
    return powerPool(config).find(function (entry) { return entry.id === id; }) || null;
  }

  function validateCard(config, card, ownerId, offerOnly) {
    if (!card || typeof card !== 'object' || Array.isArray(card)) {
      throw new TypeError('Battle power card must be an object');
    }
    exactKeys(card, own(card, 'targetId') ? TARGET_CARD_KEYS : CARD_KEYS, 'Battle power card');
    var definition = cardDefinition(config, card.id);
    if (!definition || card.scope !== definition.scope ||
        card.eventAdapterId !== definition.eventAdapterId) {
      throw new Error('Battle power card is not in its configured allowlist');
    }
    if (offerOnly && own(card, 'targetId')) throw new Error('Power offers cannot be pre-targeted');
    if (definition.scope === 'target' && !offerOnly) {
      var ids = competitors(config);
      if (ids.indexOf(card.targetId) < 0 || card.targetId === ownerId) {
        throw new Error('Stored targeted power does not name an opponent');
      }
    } else if (own(card, 'targetId')) {
      throw new Error('Only targeted powers may retain targetId');
    }
    return true;
  }

  function scoreMapForAttempts(ids, attempts) {
    var result = blankMap(ids, 0);
    attempts.forEach(function (attempt) { result[attempt.competitorId] += attempt.score; });
    return result;
  }

  function nextStarterFromResult(config, result) {
    var nextCursor = result.endingRotationIndex + rotationStep(config);
    if (config.paceId === 'rush') {
      var isTeam = config.formatId === 'doubles' || config.formatId === 'team';
      var cycle = isTeam && config.hardware.activeLaneLimit === 1 ? 1
        : (isTeam ? members(config, competitors(config)[0]).length : config.players.length);
      if (cycle > 1 && (nextCursor - result.starterIndex) % cycle === 0) nextCursor += 1;
    }
    return nextCursor;
  }

  function currentVolleyBatch(state) {
    var batchSize = volleyBatchLimit(state);
    var participants = state.volleyParticipantIds;
    var resolved = state.volleyPlayerIds;
    var start = 0;
    while (start < participants.length) {
      var batch = participants.slice(start, start + batchSize);
      if (!batch.every(function (id) { return resolved.indexOf(id) >= 0; })) break;
      start += batch.length;
    }
    if (start >= participants.length) throw new Error('Resolved Battle volley was not closed');
    var current = participants.slice(start, start + batchSize);
    if (resolved.some(function (id) {
      return participants.indexOf(id) >= start + current.length;
    })) throw new Error('Battle volley resolved a later relay batch early');
    return current;
  }

  function rushLeaseBucket(config, elapsedMs, volleyIndex, suddenDeath) {
    if (suddenDeath) {
      return Math.floor((config.rushDurationMs - 1) / rushRotationInterval(config)) +
        1 + volleyIndex;
    }
    return Math.floor(elapsedMs / rushRotationInterval(config));
  }

  function createLaunchLease(state, playerId) {
    if (state.config.paceId !== 'rush') return null;
    if (!state.suddenDeath && (state.clockExpired ||
        state.elapsedMs >= state.config.rushDurationMs)) {
      throw new Error('Post-horn Timed Rush launch has no valid clock lease');
    }
    var bucketIndex = rushLeaseBucket(state.config, state.elapsedMs,
      state.volleyIndex, state.suddenDeath);
    return freeze({ schema: 'BattleLaunchLeaseV1', paceId: 'rush',
      playerId: playerId, heatNumber: state.heatNumber,
      elapsedMs: state.elapsedMs, bucketIndex: bucketIndex,
      rotationIndex: state.rotationIndex, volleyIndex: state.volleyIndex,
      suddenDeath: state.suddenDeath === true });
  }

  function validateLaunchLease(lease, config, expected, starterIndex, eligibleIds) {
    var context = object(expected);
    if (config.paceId !== 'rush') {
      if (lease !== null) throw new Error('Equal Volley attempt cannot carry a Rush launch lease');
      return true;
    }
    exactKeys(lease, LAUNCH_LEASE_KEYS, 'BattleLaunchLeaseV1');
    if (lease.schema !== 'BattleLaunchLeaseV1' || lease.paceId !== 'rush') {
      throw new TypeError('BattleLaunchLeaseV1 is required for every Timed Rush attempt');
    }
    boundedText(lease.playerId, 'launch-lease player id', MAX_PLAYER_ID_LENGTH);
    whole(lease.heatNumber, 'launch-lease heat', 1, 3);
    finite(lease.elapsedMs, 'launch-lease elapsed time', 0, config.rushDurationMs);
    whole(lease.bucketIndex, 'launch-lease bucket', 0, MAX_ROTATION_INDEX);
    whole(lease.rotationIndex, 'launch-lease rotation', 0, MAX_ROTATION_INDEX);
    whole(lease.volleyIndex, 'launch-lease volley', 0, MAX_ROTATION_INDEX);
    if (typeof lease.suddenDeath !== 'boolean') {
      throw new TypeError('launch-lease sudden-death flag must be boolean');
    }
    if (lease.playerId !== context.playerId || lease.heatNumber !== context.heatNumber ||
        lease.volleyIndex !== context.volleyIndex ||
        lease.suddenDeath !== context.suddenDeath) {
      throw new Error('Battle launch lease contradicts its attempt identity');
    }
    if (lease.suddenDeath) {
      if (lease.elapsedMs !== config.rushDurationMs) {
        throw new Error('Timed Rush sudden-death lease must occur after the horn');
      }
    } else if (lease.elapsedMs >= config.rushDurationMs || lease.volleyIndex !== 0) {
      throw new Error('Timed Rush regulation lease must be bound before the horn');
    }
    var expectedBucket = rushLeaseBucket(config, lease.elapsedMs,
      lease.volleyIndex, lease.suddenDeath);
    var expectedRotation = starterIndex + expectedBucket * rotationStep(config);
    if (lease.bucketIndex !== expectedBucket || lease.rotationIndex !== expectedRotation) {
      throw new Error('Timed Rush launch clock and rotation lease are incoherent');
    }
    var assigned = lease.suddenDeath
      ? selectVolleyParticipants(config, lease.rotationIndex, eligibleIds)
      : selectRushActive(config, lease.rotationIndex);
    if (assigned.indexOf(lease.playerId) < 0) {
      throw new Error('Timed Rush attempt owner was not assigned in its launch bucket');
    }
    return true;
  }

  function validateCompletedHeatSchedule(config, result, attempts, competitorIds) {
    var regulation = attempts.filter(function (attempt) { return !attempt.suddenDeath; });
    var overtime = attempts.filter(function (attempt) { return attempt.suddenDeath; });
    var runningScores = blankMap(competitorIds, 0);
    var canonicalSchedule = [];
    regulation.forEach(function (attempt) {
      validateLaunchLease(attempt.launchLease, config, attempt, result.starterIndex, null);
    });
    if (config.paceId === 'volley') {
      for (var volley = 0; volley < config.volleyCount; volley++) {
        var entries = regulation.filter(function (attempt) { return attempt.volleyIndex === volley; });
        var rotation = result.starterIndex + volley * rotationStep(config);
        var expected = selectVolleyParticipants(config, rotation);
        if (!sameCanonicalValue(entries.map(function (attempt) { return attempt.playerId; }), expected)) {
          throw new Error('Completed Equal Volley heat lacks a full canonical volley');
        }
        expected.forEach(function (playerId) {
          canonicalSchedule.push({ playerId: playerId, volleyIndex: volley,
            suddenDeath: false });
        });
        entries.forEach(function (attempt) { runningScores[attempt.competitorId] += attempt.score; });
      }
      if (regulation.some(function (attempt) {
        return attempt.volleyIndex < 0 || attempt.volleyIndex >= config.volleyCount;
      })) throw new Error('Equal Volley regulation ledger has an invalid index');
    } else {
      if (regulation.some(function (attempt) { return attempt.volleyIndex !== 0; })) {
        throw new Error('Timed Rush regulation attempt carries a volley index');
      }
      regulation.forEach(function (attempt) { runningScores[attempt.competitorId] += attempt.score; });
    }

    var eligible = rankedLeaders(runningScores);
    if (!result.suddenDeath) {
      if (overtime.length || eligible.length !== 1 || eligible[0] !== result.winnerId) {
        throw new Error('Battle regulation heat did not finish with one reachable leader');
      }
      var expectedEnd;
      if (config.paceId === 'volley') {
        expectedEnd = result.starterIndex + (config.volleyCount - 1) * rotationStep(config);
      } else {
        var rushRegulationInterval = rushRotationInterval(config);
        var rushRegulationBucket = Math.floor((config.rushDurationMs - 1) /
          rushRegulationInterval);
        expectedEnd = result.starterIndex + rushRegulationBucket * rotationStep(config);
      }
      if (result.endingRotationIndex !== expectedEnd) {
        throw new Error('Battle regulation heat ended at a forged rotation');
      }
      if (config.paceId === 'volley' &&
          (attempts.length !== canonicalSchedule.length || attempts.some(function (attempt, index) {
            var expectedAttempt = canonicalSchedule[index];
            return !expectedAttempt || attempt.playerId !== expectedAttempt.playerId ||
              attempt.volleyIndex !== expectedAttempt.volleyIndex ||
              attempt.suddenDeath !== expectedAttempt.suddenDeath;
          }))) throw new Error('Battle attempt ledger is not in canonical volley order');
      return;
    }
    if (eligible.length < 2 || !overtime.length) {
      throw new Error('Battle sudden death requires a tied regulation score and an overtime volley');
    }
    var firstIndex = config.paceId === 'volley' ? config.volleyCount : 0;
    var lastIndex = Math.max.apply(Math, overtime.map(function (attempt) {
      return attempt.volleyIndex;
    }));
    for (var overtimeIndex = firstIndex; overtimeIndex <= lastIndex; overtimeIndex++) {
      var round = overtime.filter(function (attempt) {
        return attempt.volleyIndex === overtimeIndex;
      });
      var baseRotation;
      if (config.paceId === 'volley') {
        baseRotation = result.starterIndex + overtimeIndex * rotationStep(config);
      } else {
        var interval = rushRotationInterval(config);
        var finalBucket = Math.floor((config.rushDurationMs - 1) / interval);
        baseRotation = result.starterIndex +
          (finalBucket + 1 + overtimeIndex) * rotationStep(config);
      }
      var expectedRound = selectVolleyParticipants(config, baseRotation, eligible);
      round.forEach(function (attempt) {
        validateLaunchLease(attempt.launchLease, config, attempt,
          result.starterIndex, eligible);
      });
      if (!sameCanonicalValue(round.map(function (attempt) { return attempt.playerId; }), expectedRound)) {
        throw new Error('Battle sudden-death ledger lacks a full canonical paired volley');
      }
      expectedRound.forEach(function (playerId) {
        canonicalSchedule.push({ playerId: playerId, volleyIndex: overtimeIndex,
          suddenDeath: true });
      });
      round.forEach(function (attempt) { runningScores[attempt.competitorId] += attempt.score; });
      var leaders = rankedLeaders(runningScores, eligible);
      if (overtimeIndex < lastIndex && leaders.length < 2) {
        throw new Error('Battle sudden-death ledger continues after a unique leader');
      }
      eligible = leaders;
    }
    if (overtime.some(function (attempt) {
      return attempt.volleyIndex < firstIndex || attempt.volleyIndex > lastIndex;
    }) || eligible.length !== 1 || eligible[0] !== result.winnerId) {
      throw new Error('Battle sudden-death winner is not reachable');
    }
    if (config.paceId === 'volley') {
      if (attempts.length !== canonicalSchedule.length || attempts.some(function (attempt, index) {
        var expectedAttempt = canonicalSchedule[index];
        return !expectedAttempt || attempt.playerId !== expectedAttempt.playerId ||
          attempt.volleyIndex !== expectedAttempt.volleyIndex ||
          attempt.suddenDeath !== expectedAttempt.suddenDeath;
      })) throw new Error('Battle attempt ledger is not in canonical volley order');
    } else {
      var firstOvertime = attempts.findIndex(function (attempt) { return attempt.suddenDeath; });
      if (firstOvertime < 0 || attempts.slice(firstOvertime).some(function (attempt) {
        return !attempt.suddenDeath;
      }) || !sameCanonicalValue(overtime.map(function (attempt) {
        return { playerId: attempt.playerId, volleyIndex: attempt.volleyIndex,
          suddenDeath: attempt.suddenDeath };
      }), canonicalSchedule)) {
        throw new Error('Timed Rush sudden-death ledger is not canonically ordered');
      }
    }
    var expectedFinalRotation;
    if (config.paceId === 'volley') {
      expectedFinalRotation = result.starterIndex + lastIndex * rotationStep(config);
    } else {
      var rushInterval = rushRotationInterval(config);
      var rushFinalBucket = Math.floor((config.rushDurationMs - 1) / rushInterval);
      expectedFinalRotation = result.starterIndex +
        (rushFinalBucket + 1 + lastIndex) * rotationStep(config);
    }
    if (result.endingRotationIndex !== expectedFinalRotation) {
      throw new Error('Battle sudden death ended at a forged rotation');
    }
  }

  function attemptScheduleShape(attempt) {
    return { playerId: attempt.playerId, volleyIndex: attempt.volleyIndex,
      suddenDeath: attempt.suddenDeath };
  }

  function validateActiveHeatSchedule(state, attempts, competitorIds) {
    var config = state.config;
    var regulation = attempts.filter(function (attempt) { return !attempt.suddenDeath; });
    var overtime = attempts.filter(function (attempt) { return attempt.suddenDeath; });
    attempts.forEach(function (attempt) {
      if (attempt.launchLease && attempt.launchLease.elapsedMs > state.elapsedMs) {
        throw new Error('Resolved Battle launch lease is ahead of the match clock');
      }
    });
    if (!state.suddenDeath && overtime.length) {
      throw new Error('Regulation Battle state contains premature sudden-death attempts');
    }
    regulation.forEach(function (attempt) {
      validateLaunchLease(attempt.launchLease, config, attempt,
        state.heatStarterIndex, null);
    });

    var expectedRegulation = [];
    if (config.paceId === 'volley') {
      var completedRegulationVolleys = state.suddenDeath
        ? config.volleyCount : state.volleyIndex;
      for (var volley = 0; volley < completedRegulationVolleys; volley++) {
        selectVolleyParticipants(config,
          state.heatStarterIndex + volley * rotationStep(config)).forEach(function (playerId) {
          expectedRegulation.push({ playerId: playerId, volleyIndex: volley,
            suddenDeath: false });
        });
      }
      if (!state.suddenDeath) {
        var currentPlayers = regulation.filter(function (attempt) {
          return attempt.volleyIndex === state.volleyIndex;
        }).map(function (attempt) { return attempt.playerId; });
        selectVolleyParticipants(config, state.rotationIndex).filter(function (playerId) {
          return currentPlayers.indexOf(playerId) >= 0;
        }).forEach(function (playerId) {
          expectedRegulation.push({ playerId: playerId, volleyIndex: state.volleyIndex,
            suddenDeath: false });
        });
      }
      if (!sameCanonicalValue(regulation.map(attemptScheduleShape), expectedRegulation)) {
        throw new Error('Active Equal Volley ledger is not canonically ordered');
      }
    } else {
      if (regulation.some(function (attempt) { return attempt.volleyIndex !== 0; })) {
        throw new Error('Active Timed Rush regulation attempt carries a volley index');
      }
      var firstOvertimeIndex = attempts.findIndex(function (attempt) {
        return attempt.suddenDeath;
      });
      if (firstOvertimeIndex >= 0 && attempts.slice(firstOvertimeIndex).some(function (attempt) {
        return !attempt.suddenDeath;
      })) throw new Error('Timed Rush regulation attempts continue after sudden death');
    }

    if (!state.suddenDeath) return;
    var runningScores = scoreMapForAttempts(competitorIds, regulation);
    var eligible = rankedLeaders(runningScores);
    if (eligible.length < 2) {
      throw new Error('Battle entered sudden death without a tied regulation score');
    }
    var firstIndex = config.paceId === 'volley' ? config.volleyCount : 0;
    var expectedOvertime = [];
    for (var overtimeIndex = firstIndex; overtimeIndex <= state.volleyIndex; overtimeIndex++) {
      var baseRotation;
      if (config.paceId === 'volley') {
        baseRotation = state.heatStarterIndex + overtimeIndex * rotationStep(config);
      } else {
        var interval = rushRotationInterval(config);
        var finalBucket = Math.floor((config.rushDurationMs - 1) / interval);
        baseRotation = state.heatStarterIndex +
          (finalBucket + 1 + overtimeIndex) * rotationStep(config);
      }
      var expectedPlayers = selectVolleyParticipants(config, baseRotation, eligible);
      var round = overtime.filter(function (attempt) {
        return attempt.volleyIndex === overtimeIndex;
      });
      round.forEach(function (attempt) {
        validateLaunchLease(attempt.launchLease, config, attempt,
          state.heatStarterIndex, eligible);
      });
      var wantedPlayers = overtimeIndex === state.volleyIndex
        ? expectedPlayers.filter(function (playerId) {
          return round.some(function (attempt) { return attempt.playerId === playerId; });
        }) : expectedPlayers;
      wantedPlayers.forEach(function (playerId) {
        expectedOvertime.push({ playerId: playerId, volleyIndex: overtimeIndex,
          suddenDeath: true });
      });
      if (!sameCanonicalValue(round.map(attemptScheduleShape), wantedPlayers.map(function (playerId) {
        return { playerId: playerId, volleyIndex: overtimeIndex, suddenDeath: true };
      }))) throw new Error('Active Battle sudden-death volley is not canonical');
      if (overtimeIndex < state.volleyIndex) {
        round.forEach(function (attempt) { runningScores[attempt.competitorId] += attempt.score; });
        eligible = rankedLeaders(runningScores, eligible);
        if (eligible.length < 2) {
          throw new Error('Battle sudden death continued after a unique leader');
        }
      }
    }
    if (!sameCanonicalValue(overtime.map(attemptScheduleShape), expectedOvertime) ||
        !sameCanonicalValue(state.suddenDeathCompetitorIds, eligible)) {
      throw new Error('Battle sudden-death roster or ledger is not reachable');
    }
  }

  function validateBattleState(state) {
    exactKeys(state, STATE_KEYS, 'BattleStateV1');
    if (state.schema !== 'BattleStateV1') throw new TypeError('BattleStateV1 is required');
    validateBattleConfig(state.config);
    if (state.matchId !== state.config.matchId || state.formatId !== 'battle') {
      throw new Error('Battle state identity does not match its config');
    }
    if (['ready', 'active', 'between-heats', 'complete'].indexOf(state.phase) < 0) {
      throw new TypeError('Invalid Battle phase');
    }
    whole(state.heatNumber, 'Battle heat number', 1, 3);
    whole(state.rotationIndex, 'Battle rotation index', 0, MAX_ROTATION_INDEX);
    whole(state.heatStarterIndex, 'Battle heat starter', 0, MAX_ROTATION_INDEX);
    whole(state.volleyIndex, 'Battle volley index', 0, MAX_ROTATION_INDEX);
    finite(state.elapsedMs, 'Battle elapsed time', 0, state.config.rushDurationMs);
    if (typeof state.clockExpired !== 'boolean' || typeof state.suddenDeath !== 'boolean') {
      throw new TypeError('Battle clock and sudden-death flags must be boolean');
    }

    var config = state.config;
    var competitorIds = competitors(config);
    var playerIds = config.players.map(function (player) { return player.id; });
    if (config.paceId === 'volley' && (state.elapsedMs !== 0 || state.clockExpired)) {
      throw new Error('Equal Volley cannot carry a Timed Rush clock');
    }
    validateCompetitorMap(state.heatWins, competitorIds, 'Battle heat wins', function (value) {
      whole(value, 'Battle heat wins', 0, config.heatTarget);
    });
    validateCompetitorMap(state.scores, competitorIds, 'Battle scores', function (value) {
      whole(value, 'Battle score', 0, MAX_RESOLVED_ATTEMPTS * 2);
    });
    validateCompetitorMap(state.charges, competitorIds, 'Battle charges', function (value) {
      whole(value, 'Battle charge', 0, 3);
    });
    validateCompetitorMap(state.powerOfferSequences, competitorIds,
      'Battle power offer sequences', function (value) {
        whole(value, 'Battle power offer sequence', 0, MAX_RESOLVED_ATTEMPTS);
      });
    validateCompetitorMap(state.storedPowerSequences, competitorIds,
      'Battle stored-power sequences', function (value) {
        whole(value, 'Battle stored-power sequence', 0, MAX_RESOLVED_ATTEMPTS);
      });
    ['powerOffers', 'deferredPowerOffers', 'storedPowers'].forEach(function (mapName) {
      validateCompetitorMap(state[mapName], competitorIds, 'Battle ' + mapName,
        function (value, id) {
          if (value == null) return;
          if (mapName === 'storedPowers') validateCard(config, value, id, false);
          else {
            denseArray(value, 'Battle power offer', 2);
            if (value.length !== 2) {
              throw new TypeError('Battle power offer must contain exactly two cards');
            }
            value.forEach(function (card) { validateCard(config, card, id, true); });
            if (!sameCanonicalValue(value, offerCards(state, id,
              state.powerOfferSequences[id]))) {
              throw new Error('Battle power offer does not match its deterministic sequence');
            }
          }
        });
    });
    competitorIds.forEach(function (id) {
      if (state.powerOffers[id] && state.deferredPowerOffers[id]) {
        throw new Error('Battle power offer cannot be both visible and deferred');
      }
      if (state.deferredPowerOffers[id] &&
          (config.paceId !== 'volley' || config.hardware.activeLaneLimit !== 1 ||
            state.phase !== 'active' || state.volleyPlayerIds.length === 0)) {
        throw new Error('Deferred Battle power offer is outside its relay-volley boundary');
      }
      if ((state.powerOffers[id] || state.deferredPowerOffers[id]) &&
          state.powerOfferSequences[id] < 1) {
        throw new Error('Battle power offer has no generating sequence');
      }
      if (state.storedPowers[id] && state.powerOfferSequences[id] < 1) {
        throw new Error('Stored Battle power has no generating sequence');
      }
      if (state.storedPowers[id]) {
        var storedSequence = state.storedPowerSequences[id];
        var latestSequence = state.powerOfferSequences[id];
        var hasLatestOffer = !!(state.powerOffers[id] || state.deferredPowerOffers[id]);
        var storedCard = clone(state.storedPowers[id]);
        delete storedCard.targetId;
        if (storedSequence < 1 || storedSequence > latestSequence ||
            !offerCards(state, id, storedSequence).some(function (offered) {
              return sameCanonicalValue(offered, storedCard);
            })) {
          throw new Error('Stored Battle power does not match its deterministic offer');
        }
        if ((latestSequence === storedSequence && hasLatestOffer) ||
            (latestSequence === storedSequence + 1 && !hasLatestOffer) ||
            latestSequence > storedSequence + 1) {
          throw new Error('Stored Battle power and latest offer sequence are incoherent');
        }
      } else if (state.storedPowerSequences[id] !== 0) {
        throw new Error('Empty Battle power slot retained a generating sequence');
      }
    });

    validateIdList(state.activePlayerIds, playerIds, 'active players', 4);
    validateIdList(state.volleyPlayerIds, playerIds, 'volley players', playerIds.length);
    validateIdList(state.volleyParticipantIds, playerIds, 'volley participants', playerIds.length);
    validateIdList(state.suddenDeathCompetitorIds, competitorIds,
      'sudden-death competitors', competitorIds.length);
    validateIdList(state.resolvedAttemptIds, null, 'resolved attempts', MAX_RESOLVED_ATTEMPTS);
    validateIdList(state.pendingLaunchIds, null, 'pending launches', 4);
    if (!state.pendingLaunchOwners || typeof state.pendingLaunchOwners !== 'object' ||
        Array.isArray(state.pendingLaunchOwners) ||
        !sameIdSet(Object.keys(state.pendingLaunchOwners), state.pendingLaunchIds) ||
        state.pendingLaunchIds.some(function (id) {
          return playerIds.indexOf(state.pendingLaunchOwners[id]) < 0;
        })) throw new Error('Battle pending-launch ownership is invalid');
    var pendingOwnerIds = state.pendingLaunchIds.map(function (id) {
      return state.pendingLaunchOwners[id];
    });
    if (new Set(pendingOwnerIds).size !== pendingOwnerIds.length) {
      throw new Error('A Battle player cannot own multiple pending launches');
    }
    if (!state.pendingLaunchLeases || typeof state.pendingLaunchLeases !== 'object' ||
        Array.isArray(state.pendingLaunchLeases) ||
        !sameIdSet(Object.keys(state.pendingLaunchLeases), state.pendingLaunchIds)) {
      throw new Error('Battle pending-launch lease map is invalid');
    }
    state.pendingLaunchIds.forEach(function (id) {
      var ownerId = state.pendingLaunchOwners[id];
      var lease = state.pendingLaunchLeases[id];
      validateLaunchLease(lease, state.config, { playerId: ownerId,
        heatNumber: state.heatNumber, volleyIndex: state.volleyIndex,
        suddenDeath: state.suddenDeath }, state.heatStarterIndex,
      state.suddenDeath ? state.suddenDeathCompetitorIds : null);
      if (lease && lease.elapsedMs > state.elapsedMs) {
        throw new Error('Pending Battle launch lease is ahead of the match clock');
      }
    });
    if (state.pendingLaunchIds.some(function (id) { return state.resolvedAttemptIds.indexOf(id) >= 0; })) {
      throw new Error('A Battle attempt cannot be pending and resolved');
    }
    denseArray(state.resolvedAttempts, 'Battle resolved-attempt ledger', MAX_RESOLVED_ATTEMPTS);
    if (
        state.resolvedAttempts.length !== state.resolvedAttemptIds.length ||
        state.resolvedAttempts.length > MAX_RESOLVED_ATTEMPTS) {
      throw new TypeError('Battle resolved-attempt ledger is invalid');
    }

    var previousHeat = 1;
    var perHeatAttempts = {};
    state.resolvedAttempts.forEach(function (attempt, index) {
      exactKeys(attempt, ATTEMPT_KEYS, 'Battle resolved attempt');
      if (typeof attempt.attemptId !== 'string') {
        throw new TypeError('Battle attempt identity must be a string');
      }
      var attemptId = boundedText(attempt.attemptId, 'attemptId', MAX_ATTEMPT_ID_LENGTH);
      if (attempt.attemptId !== attemptId || attemptId !== state.resolvedAttemptIds[index]) {
        throw new Error('Battle resolved-attempt identities are out of sync');
      }
      if (playerIds.indexOf(attempt.playerId) < 0) throw new Error('Battle attempt has an unknown player');
      var expectedOwner = ownerKey(state, attempt.playerId);
      if (attempt.competitorId !== expectedOwner) throw new Error('Battle attempt has a forged competitor');
      whole(attempt.heatNumber, 'Battle attempt heat', 1, state.heatNumber);
      whole(attempt.volleyIndex, 'Battle attempt volley', 0, MAX_ROTATION_INDEX);
      if (attempt.heatNumber < previousHeat || attempt.heatNumber > previousHeat + 1) {
        throw new Error('Battle attempt heat sequence is not reachable');
      }
      previousHeat = attempt.heatNumber;
      if (attempt.pose !== 'upright' && attempt.pose !== 'cap' && attempt.pose !== 'miss') {
        throw new TypeError('Battle attempt pose is invalid');
      }
      if (attempt.score !== scoreForPose(attempt.pose) ||
          typeof attempt.qualifiedManual !== 'boolean' || typeof attempt.suddenDeath !== 'boolean') {
        throw new Error('Battle attempt result metadata is incoherent');
      }
      if (attempt.qualifiedManual && !config.players.find(function (player) {
        return player.id === attempt.playerId;
      }).human) throw new Error('CPU Battle attempts cannot qualify as manual launches');
      if (config.paceId === 'volley' && !attempt.suddenDeath &&
          attempt.volleyIndex >= config.volleyCount) {
        throw new Error('Regulation Volley attempt exceeds the configured volley count');
      }
      var heatList = perHeatAttempts[attempt.heatNumber] || [];
      if ((config.paceId === 'volley' || attempt.suddenDeath) && heatList.some(function (prior) {
        return prior.volleyIndex === attempt.volleyIndex && prior.suddenDeath === attempt.suddenDeath &&
          prior.playerId === attempt.playerId;
      })) throw new Error('A Battle player resolved twice in one synchronized volley');
      heatList.push(attempt);
      perHeatAttempts[attempt.heatNumber] = heatList;
    });
    competitorIds.forEach(function (id) {
      var manualAttempts = state.resolvedAttempts.filter(function (attempt) {
        return attempt.competitorId === id && attempt.qualifiedManual;
      }).length;
      if (state.charges[id] > Math.min(3, manualAttempts) ||
          state.powerOfferSequences[id] > Math.floor(manualAttempts / 3)) {
        throw new Error('Battle power economy exceeds its qualified manual attempts');
      }
    });

    denseArray(state.heatResults, 'Battle heat history', 3);
    if (state.heatResults.length > 3) {
      throw new TypeError('Battle heat history is invalid');
    }
    var derivedHeatWins = blankMap(competitorIds, 0);
    var ledgerCursor = 0;
    var expectedStarter = 0;
    var finalPostHeatVolleyIndex = 0;
    state.heatResults.forEach(function (result, index) {
      exactKeys(result, HEAT_RESULT_KEYS, 'Battle heat result');
      if (result.schema !== 'BattleHeatResultV1' || result.heatNumber !== index + 1 ||
          competitorIds.indexOf(result.winnerId) < 0) {
        throw new Error('Battle heat history identity is invalid');
      }
      exactKeys(result.scores, competitorIds, 'Battle heat-result scores');
      whole(result.attemptStartIndex, 'Battle heat attempt start', 0, MAX_RESOLVED_ATTEMPTS);
      whole(result.attemptEndIndex, 'Battle heat attempt end', 1, MAX_RESOLVED_ATTEMPTS);
      whole(result.starterIndex, 'Battle heat-result starter', 0, MAX_ROTATION_INDEX);
      whole(result.endingRotationIndex, 'Battle heat-result rotation', 0, MAX_ROTATION_INDEX);
      finite(result.elapsedMs, 'Battle heat-result elapsed time', 0, config.rushDurationMs);
      if (typeof result.clockExpired !== 'boolean') {
        throw new TypeError('Battle heat-result clock flag must be boolean');
      }
      if (result.attemptStartIndex !== ledgerCursor ||
          result.attemptEndIndex <= result.attemptStartIndex ||
          result.attemptEndIndex > state.resolvedAttempts.length ||
          result.starterIndex !== expectedStarter) {
        throw new Error('Battle heat history boundaries are not reachable');
      }
      var attempts = state.resolvedAttempts.slice(result.attemptStartIndex, result.attemptEndIndex);
      if (attempts.some(function (attempt) { return attempt.heatNumber !== result.heatNumber; })) {
        throw new Error('Battle heat history spans a foreign attempt');
      }
      var derivedScores = scoreMapForAttempts(competitorIds, attempts);
      if (!sameCanonicalValue(result.scores, derivedScores)) {
        throw new Error('Battle heat score does not match resolved attempts');
      }
      var leaders = rankedLeaders(derivedScores);
      if (leaders.length !== 1 || leaders[0] !== result.winnerId) {
        throw new Error('Battle heat winner is not the unique score leader');
      }
      var expectedReason = result.suddenDeath ? 'paired-sudden-death'
        : (config.paceId === 'volley' ? 'volley-score' : 'rush-score');
      if (typeof result.suddenDeath !== 'boolean' || result.completionReason !== expectedReason) {
        throw new Error('Battle heat completion reason is incoherent');
      }
      if (config.paceId === 'rush') {
        if (result.elapsedMs !== config.rushDurationMs || result.clockExpired !== true) {
          throw new Error('Timed Rush heat cannot finish before its horn');
        }
      } else if (result.elapsedMs !== 0 || result.clockExpired !== false) {
        throw new Error('Equal Volley cannot carry a Timed Rush clock');
      }
      validateCompletedHeatSchedule(config, result, attempts, competitorIds);
      finalPostHeatVolleyIndex = result.suddenDeath
        ? Math.max.apply(Math, attempts.filter(function (attempt) {
          return attempt.suddenDeath;
        }).map(function (attempt) { return attempt.volleyIndex; })) + 1
        : (config.paceId === 'volley' ? config.volleyCount : 0);
      derivedHeatWins[result.winnerId] += 1;
      if (derivedHeatWins[result.winnerId] >= config.heatTarget &&
          index !== state.heatResults.length - 1) {
        throw new Error('Battle heat history continues after the series was clinched');
      }
      ledgerCursor = result.attemptEndIndex;
      expectedStarter = nextStarterFromResult(config, result);
    });
    if (!sameCanonicalValue(state.heatWins, derivedHeatWins)) {
      throw new Error('Battle heat wins do not match heat history');
    }
    var completedHeats = state.heatResults.length;
    var expectedHistoryLength = state.phase === 'complete' ? state.heatNumber
      : (state.phase === 'ready' || state.phase === 'active' ? state.heatNumber - 1
        : state.heatNumber - 1);
    if (completedHeats !== expectedHistoryLength) {
      throw new Error('Battle heat number, phase, and history are inconsistent');
    }
    var scoreHeatNumber = state.phase === 'between-heats' ? state.heatNumber - 1 : state.heatNumber;
    var currentHeatAttempts = (perHeatAttempts[scoreHeatNumber] || []);
    competitorIds.forEach(function (id) {
      if (!state.deferredPowerOffers[id]) return;
      var latestOwnerAttempt = null;
      for (var attemptIndex = state.resolvedAttempts.length - 1;
        attemptIndex >= 0; attemptIndex--) {
        if (state.resolvedAttempts[attemptIndex].competitorId === id) {
          latestOwnerAttempt = state.resolvedAttempts[attemptIndex];
          break;
        }
      }
      if (state.charges[id] !== 0 || !latestOwnerAttempt ||
          latestOwnerAttempt.heatNumber !== state.heatNumber ||
          latestOwnerAttempt.volleyIndex !== state.volleyIndex ||
          latestOwnerAttempt.suddenDeath !== state.suddenDeath ||
          latestOwnerAttempt.qualifiedManual !== true) {
        throw new Error('Deferred Battle power offer lacks its threshold-crossing volley attempt');
      }
    });
    if (state.phase === 'active') {
      validateActiveHeatSchedule(state, currentHeatAttempts, competitorIds);
    }
    if (!sameCanonicalValue(state.scores,
      scoreMapForAttempts(competitorIds, currentHeatAttempts))) {
      throw new Error('Battle live score does not match resolved attempts');
    }
    if (state.resolvedAttempts.slice(ledgerCursor).some(function (attempt) {
      return attempt.heatNumber !== state.heatNumber;
    })) throw new Error('Battle unresolved heat ledger is not contiguous');

    var expectedCurrentStarter = state.phase === 'complete'
      ? state.heatResults[state.heatResults.length - 1].starterIndex : expectedStarter;
    if (state.heatStarterIndex !== expectedCurrentStarter) {
      throw new Error('Battle heat starter is not derived from prior heats');
    }
    if (state.phase === 'complete') {
      var finalHeat = state.heatResults[state.heatResults.length - 1];
      var targetWinners = competitorIds.filter(function (id) {
        return state.heatWins[id] >= config.heatTarget;
      });
      var pressureHeat = state.heatNumber === 3 && targetWinners.length === 0;
      var expectedSeriesReason = pressureHeat
        ? 'battle-pressure-heat' : 'battle-heat-target';
      if (state.winnerId == null || competitorIds.indexOf(state.winnerId) < 0 ||
          !finalHeat || state.winnerId !== finalHeat.winnerId ||
          (pressureHeat ? state.heatWins[state.winnerId] !== 1
            : (targetWinners.length !== 1 || targetWinners[0] !== state.winnerId ||
              state.heatWins[state.winnerId] !== config.heatTarget)) ||
          state.completionReason !== expectedSeriesReason) {
        throw new Error('Completed Battle winner is not reachable');
      }
    } else if (state.winnerId != null || state.completionReason != null ||
        competitorIds.some(function (id) { return state.heatWins[id] >= config.heatTarget; })) {
      throw new Error('Nonterminal Battle state carries a terminal winner');
    }

    if (state.phase === 'ready') {
      if (state.heatNumber !== 1 || state.resolvedAttempts.length || state.heatResults.length ||
          state.rotationIndex !== 0 || state.heatStarterIndex !== 0 || state.volleyIndex !== 0 ||
          state.suddenDeath || state.elapsedMs !== 0 || state.clockExpired ||
          competitorIds.some(function (id) {
            return state.heatWins[id] || state.scores[id] || state.charges[id] ||
              state.powerOfferSequences[id] || state.powerOffers[id] ||
              state.deferredPowerOffers[id] || state.storedPowers[id] ||
              state.storedPowerSequences[id];
          })) throw new Error('Ready Battle state is not pristine');
      var readyParticipants = config.paceId === 'volley'
        ? selectVolleyParticipants(config, 0) : [];
      var readyActive = config.paceId === 'volley'
        ? readyParticipants.slice(0, config.hardware.activeLaneLimit)
        : selectRushActive(config, 0);
      if (!sameCanonicalValue(state.volleyParticipantIds, readyParticipants) ||
          !sameCanonicalValue(state.activePlayerIds, readyActive) ||
          state.volleyPlayerIds.length || state.pendingLaunchIds.length ||
          state.suddenDeathCompetitorIds.length) {
        throw new Error('Ready Battle assignments are not canonical');
      }
      return true;
    }

    if (state.phase !== 'active') {
      if (state.activePlayerIds.length || state.volleyPlayerIds.length ||
          state.volleyParticipantIds.length || state.pendingLaunchIds.length ||
          state.suddenDeath || state.suddenDeathCompetitorIds.length) {
        throw new Error('Inactive Battle state retained active-lane data');
      }
      if (state.phase === 'between-heats' &&
          (state.heatNumber < 2 || state.rotationIndex !== state.heatStarterIndex)) {
        throw new Error('Between-heats Battle state is not ready for its next starter');
      }
      if (state.phase === 'between-heats' || state.phase === 'complete') {
        var lastResult = state.heatResults[state.heatResults.length - 1];
        if (!lastResult || state.volleyIndex !== finalPostHeatVolleyIndex ||
            state.elapsedMs !== lastResult.elapsedMs ||
            state.clockExpired !== lastResult.clockExpired) {
          throw new Error('Inactive Battle metadata does not match its most recent heat');
        }
        if (state.phase === 'complete' &&
            state.rotationIndex !== lastResult.endingRotationIndex) {
          throw new Error('Completed Battle rotation does not match its clinching heat');
        }
      }
      return true;
    }

    if (state.pendingLaunchIds.length > state.activePlayerIds.length) {
      throw new Error('Battle has more pending launches than active lanes');
    }
    if ((config.paceId === 'volley' || state.suddenDeath) &&
        state.pendingLaunchIds.some(function (attemptId) {
          var ownerId = state.pendingLaunchOwners[attemptId];
          return state.activePlayerIds.indexOf(ownerId) < 0 ||
            state.volleyPlayerIds.indexOf(ownerId) >= 0;
        })) throw new Error('Synchronized Battle pending launch has an inactive owner');

    if (state.suddenDeath) {
      if (state.suddenDeathCompetitorIds.length < 2 ||
          (config.paceId === 'rush' && (!state.clockExpired ||
            state.elapsedMs !== config.rushDurationMs))) {
        throw new Error('Battle sudden death is not reachable');
      }
    } else if (state.suddenDeathCompetitorIds.length) {
      throw new Error('Battle sudden-death roster exists outside sudden death');
    }
    if (config.paceId === 'volley' || state.suddenDeath) {
      if (config.paceId === 'volley' && !state.suddenDeath &&
          state.volleyIndex >= config.volleyCount) {
        throw new Error('Active regulation Volley exceeded its configured count');
      }
      var expectedParticipants = selectVolleyParticipants(config, state.rotationIndex,
        state.suddenDeath ? state.suddenDeathCompetitorIds : null);
      if (!sameCanonicalValue(state.volleyParticipantIds, expectedParticipants)) {
        throw new Error('Battle volley participants are not derived from rotation');
      }
      var currentResolvedPlayers = currentHeatAttempts.filter(function (attempt) {
        return attempt.volleyIndex === state.volleyIndex &&
          attempt.suddenDeath === state.suddenDeath;
      }).map(function (attempt) { return attempt.playerId; });
      var canonicalResolvedPlayers = state.volleyParticipantIds.filter(function (id) {
        return currentResolvedPlayers.indexOf(id) >= 0;
      });
      if (!sameCanonicalValue(currentResolvedPlayers, canonicalResolvedPlayers) ||
          !sameCanonicalValue(state.volleyPlayerIds, canonicalResolvedPlayers) ||
          !sameCanonicalValue(state.activePlayerIds, currentVolleyBatch(state))) {
        throw new Error('Battle active volley batch is stale or forged');
      }
      var expectedRotation = state.heatStarterIndex + state.volleyIndex * rotationStep(config);
      if (config.paceId === 'rush') {
        var interval = rushRotationInterval(config);
        var finalBucket = Math.floor((config.rushDurationMs - 1) / interval);
        expectedRotation = state.heatStarterIndex +
          (finalBucket + 1 + state.volleyIndex) * rotationStep(config);
      }
      if (state.rotationIndex !== expectedRotation) {
        throw new Error('Battle volley rotation is not reachable');
      }
    } else {
      if (state.volleyIndex !== 0 || state.volleyPlayerIds.length ||
          state.volleyParticipantIds.length || state.elapsedMs > config.rushDurationMs ||
          state.clockExpired !== (state.elapsedMs >= config.rushDurationMs)) {
        throw new Error('Timed Rush state carries invalid volley or clock data');
      }
      var intervalMs = rushRotationInterval(config);
      var bucket = Math.floor(Math.min(state.elapsedMs, config.rushDurationMs - 1) / intervalMs);
      var expectedRushRotation = state.heatStarterIndex + bucket * rotationStep(config);
      if (state.rotationIndex !== expectedRushRotation ||
          !sameCanonicalValue(state.activePlayerIds,
            selectRushActive(config, state.rotationIndex))) {
        throw new Error('Timed Rush active assignment is not derived from its clock');
      }
      if (state.clockExpired && !state.pendingLaunchIds.length) {
        throw new Error('Expired Timed Rush without pending launches was not resolved');
      }
    }
    return true;
  }

  function startHeat(state) {
    validateBattleState(state);
    var next = clone(state);
    if (next.phase !== 'ready' && next.phase !== 'between-heats') throw new Error('Heat cannot start from ' + next.phase);
    next.phase = 'active';
    next.scores = blankMap(competitors(next.config), 0);
    next.volleyIndex = 0;
    next.suddenDeath = false;
    next.suddenDeathCompetitorIds = [];
    next.elapsedMs = 0;
    next.clockExpired = false;
    next.volleyPlayerIds = [];
    next.volleyParticipantIds = [];
    next.pendingLaunchIds = [];
    next.pendingLaunchOwners = {};
    next.pendingLaunchLeases = {};
    next.rotationIndex = next.heatStarterIndex;
    if (next.config.paceId === 'volley') prepareVolley(next);
    else next.activePlayerIds = selectRushActive(next.config, next.rotationIndex);
    validateBattleState(next);
    return freeze(next);
  }

  function nextHeatStarter(next) {
    var nextCursor = next.rotationIndex + rotationStep(next.config);
    if (next.config.paceId === 'rush') {
      var isTeam = next.config.formatId === 'doubles' || next.config.formatId === 'team';
      var cycle = isTeam && next.config.hardware.activeLaneLimit === 1 ? 1
        : (isTeam ? members(next.config, competitors(next.config)[0]).length
          : next.config.players.length);
      if (cycle > 1 && (nextCursor - next.heatStarterIndex) % cycle === 0) nextCursor += 1;
    }
    return nextCursor;
  }

  function finishHeat(next, winnerId) {
    var heatStart = next.heatResults.length
      ? next.heatResults[next.heatResults.length - 1].attemptEndIndex : 0;
    next.heatResults.push({ schema: 'BattleHeatResultV1', heatNumber: next.heatNumber,
      winnerId: winnerId, scores: clone(next.scores), attemptStartIndex: heatStart,
      attemptEndIndex: next.resolvedAttempts.length, starterIndex: next.heatStarterIndex,
      endingRotationIndex: next.rotationIndex,
      completionReason: next.suddenDeath ? 'paired-sudden-death'
        : (next.config.paceId === 'volley' ? 'volley-score' : 'rush-score'),
      suddenDeath: next.suddenDeath === true,
      elapsedMs: next.elapsedMs, clockExpired: next.clockExpired === true });
    next.heatWins[winnerId] += 1;
    var wonByHeatTarget = next.heatWins[winnerId] >= next.config.heatTarget;
    var wonPressureHeat = next.heatNumber === 3 && !wonByHeatTarget;
    if (wonByHeatTarget || wonPressureHeat) {
      next.phase = 'complete';
      next.winnerId = winnerId;
      // Four independent competitors can split the first three heat wins. The
      // advertised best-of-three series still ends after Heat 3: that final
      // Pressure Heat becomes the deterministic series decider.
      next.completionReason = wonByHeatTarget
        ? 'battle-heat-target' : 'battle-pressure-heat';
      next.activePlayerIds = [];
      next.pendingLaunchIds = [];
      next.pendingLaunchOwners = {};
      next.pendingLaunchLeases = {};
      next.volleyPlayerIds = [];
      next.volleyParticipantIds = [];
      next.suddenDeath = false;
      next.suddenDeathCompetitorIds = [];
      return;
    }
    next.phase = 'between-heats';
    next.heatNumber += 1;
    next.heatStarterIndex = nextHeatStarter(next);
    next.rotationIndex = next.heatStarterIndex;
    next.activePlayerIds = [];
    next.pendingLaunchIds = [];
    next.pendingLaunchOwners = {};
    next.pendingLaunchLeases = {};
    next.volleyPlayerIds = [];
    next.volleyParticipantIds = [];
    next.suddenDeath = false;
    next.suddenDeathCompetitorIds = [];
  }

  function enterSuddenDeath(next, leaders) {
    next.suddenDeath = true;
    next.suddenDeathCompetitorIds = unique(leaders);
    advanceRotation(next);
    prepareVolley(next);
  }

  function closeVolley(next) {
    next.deferredPowerOffers = next.deferredPowerOffers ||
      blankMap(competitors(next.config), null);
    Object.keys(next.deferredPowerOffers).forEach(function (key) {
      if (!next.powerOffers[key] && next.deferredPowerOffers[key]) {
        next.powerOffers[key] = next.deferredPowerOffers[key];
      }
      next.deferredPowerOffers[key] = null;
    });
    next.volleyIndex += 1;
    next.volleyPlayerIds = [];
    if (next.volleyIndex < next.config.volleyCount && !next.suddenDeath) {
      advanceRotation(next);
      prepareVolley(next);
      return;
    }
    var leaders = rankedLeaders(next.scores,
      next.suddenDeath ? next.suddenDeathCompetitorIds : null);
    if (leaders.length === 1) finishHeat(next, leaders[0]);
    else enterSuddenDeath(next, leaders);
  }

  function canonicalizeCurrentSynchronizedAttempts(next) {
    if (next.config.paceId !== 'volley' && !next.suddenDeath) return;
    var heatNumber = next.heatNumber;
    var volleyIndex = next.volleyIndex;
    var suddenDeath = next.suddenDeath === true;
    var start = next.resolvedAttempts.length - 1;
    while (start > 0) {
      var prior = next.resolvedAttempts[start - 1];
      if (prior.heatNumber !== heatNumber || prior.volleyIndex !== volleyIndex ||
          prior.suddenDeath !== suddenDeath) break;
      start -= 1;
    }
    var order = next.volleyParticipantIds;
    var entries = next.resolvedAttempts.slice(start).sort(function (left, right) {
      return order.indexOf(left.playerId) - order.indexOf(right.playerId);
    });
    entries.forEach(function (entry, offset) {
      next.resolvedAttempts[start + offset] = entry;
      next.resolvedAttemptIds[start + offset] = entry.attemptId;
    });
    var resolvedIds = new Set(entries.map(function (entry) { return entry.playerId; }));
    next.volleyPlayerIds = order.filter(function (id) { return resolvedIds.has(id); });
  }

  function recordAttempt(state, input) {
    validateBattleState(state);
    var next = clone(state);
    if (next.phase !== 'active') throw new Error('Battle is not active');
    var source = object(input);
    var attemptId = required(source.attemptId, 'attemptId');
    attemptId = boundedText(attemptId, 'attemptId', MAX_ATTEMPT_ID_LENGTH);
    var existingAttemptIndex = next.resolvedAttemptIds.indexOf(attemptId);
    if (existingAttemptIndex >= 0) {
      var existingAttempt = next.resolvedAttempts[existingAttemptIndex];
      var duplicatePlayerId = boundedText(required(source.playerId, 'playerId'),
        'playerId', MAX_PLAYER_ID_LENGTH);
      var duplicatePose = String(source.pose || 'miss');
      if (duplicatePose !== 'upright' && duplicatePose !== 'cap') duplicatePose = 'miss';
      var duplicatePlayer = next.config.players.find(function (player) {
        return player.id === duplicatePlayerId;
      });
      var duplicateQualifiedManual = !!duplicatePlayer && duplicatePlayer.human &&
        source.qualifiedManual !== false;
      if (existingAttempt.playerId !== duplicatePlayerId ||
          existingAttempt.pose !== duplicatePose ||
          existingAttempt.qualifiedManual !== duplicateQualifiedManual) {
        throw new Error('Conflicting Battle attempt reused a resolved identity');
      }
      return freeze(next);
    }
    if (next.resolvedAttemptIds.length >= MAX_RESOLVED_ATTEMPTS) {
      throw new RangeError('Battle resolved-attempt ledger is full');
    }
    var playerId = required(source.playerId, 'playerId');
    var wasPending = next.pendingLaunchIds.indexOf(attemptId) >= 0;
    if (next.config.paceId === 'rush' && !wasPending) {
      throw new Error('Timed Rush result requires a launch lease created by markLaunch');
    }
    if (wasPending && next.pendingLaunchOwners[attemptId] !== playerId) {
      throw new Error('Pending Battle attempt belongs to another player');
    }
    var leasedRushLaunch = next.config.paceId === 'rush' && !next.suddenDeath &&
      wasPending &&
      next.pendingLaunchOwners[attemptId] === playerId;
    if (next.activePlayerIds.indexOf(playerId) < 0 && !leasedRushLaunch) {
      throw new Error('Player is not active: ' + playerId);
    }
    if ((next.config.paceId === 'volley' || next.suddenDeath) &&
        next.volleyPlayerIds.indexOf(playerId) >= 0) {
      throw new Error('Player already resolved this synchronized volley: ' + playerId);
    }
    if (next.config.paceId === 'rush' && !next.suddenDeath &&
        next.clockExpired && !leasedRushLaunch) {
      throw new Error('Post-horn Timed Rush result requires a pre-horn launch lease');
    }
    var launchLease = wasPending ? clone(next.pendingLaunchLeases[attemptId]) : null;
    next.resolvedAttemptIds.push(attemptId);
    next.pendingLaunchIds = next.pendingLaunchIds.filter(function (id) { return id !== attemptId; });
    delete next.pendingLaunchOwners[attemptId];
    delete next.pendingLaunchLeases[attemptId];
    var key = ownerKey(next, playerId);
    var pose = String(source.pose || 'miss');
    if (pose !== 'upright' && pose !== 'cap') pose = 'miss';
    var score = scoreForPose(pose);
    var attemptPlayer = next.config.players.find(function (player) {
      return player.id === playerId;
    });
    var qualifiedManual = attemptPlayer.human && source.qualifiedManual !== false;
    next.resolvedAttempts.push({ attemptId: attemptId, playerId: playerId,
      competitorId: key, heatNumber: next.heatNumber, volleyIndex: next.volleyIndex,
      suddenDeath: next.suddenDeath === true, pose: pose, score: score,
      qualifiedManual: qualifiedManual, launchLease: launchLease });
    canonicalizeCurrentSynchronizedAttempts(next);
    next.scores[key] += score;
    if (qualifiedManual) {
      next.charges[key] = Math.min(3, next.charges[key] + 1);
      next.deferredPowerOffers = next.deferredPowerOffers ||
        blankMap(competitors(next.config), null);
      if (next.charges[key] === 3 && !next.powerOffers[key] &&
          !next.deferredPowerOffers[key]) {
        next.powerOfferSequences = next.powerOfferSequences || blankMap(competitors(next.config), 0);
        next.powerOfferSequences[key] = (next.powerOfferSequences[key] || 0) + 1;
        var cards = offerCards(next, key, next.powerOfferSequences[key]);
        if (next.config.paceId === 'volley' &&
            next.config.hardware.activeLaneLimit === 1) {
          next.deferredPowerOffers[key] = cards;
        } else {
          next.powerOffers[key] = cards;
        }
        next.charges[key] = 0;
      }
    }
    if (next.config.paceId === 'volley' || next.suddenDeath) {
      if (next.activePlayerIds.every(function (id) { return next.volleyPlayerIds.indexOf(id) >= 0; })) {
        if (!advanceVolleyBatch(next)) closeVolley(next);
      }
    } else if (next.clockExpired && next.pendingLaunchIds.length === 0) {
      var leaders = rankedLeaders(next.scores);
      if (leaders.length === 1) finishHeat(next, leaders[0]);
      else enterSuddenDeath(next, leaders);
    }
    validateBattleState(next);
    return freeze(next);
  }

  function markLaunch(state, attemptInput, playerIdInput) {
    validateBattleState(state);
    var next = clone(state);
    var source = attemptInput && typeof attemptInput === 'object'
      ? attemptInput : { attemptId: attemptInput, playerId: playerIdInput };
    var id = boundedText(source.attemptId, 'attemptId', MAX_ATTEMPT_ID_LENGTH);
    var playerId = boundedText(source.playerId, 'playerId', MAX_PLAYER_ID_LENGTH);
    if (next.phase !== 'active' || (next.clockExpired && !next.suddenDeath)) {
      throw new Error('Launch is not allowed');
    }
    if (next.activePlayerIds.indexOf(playerId) < 0) {
      throw new Error('Player is not active: ' + playerId);
    }
    if ((next.config.paceId === 'volley' || next.suddenDeath) &&
        next.volleyPlayerIds.indexOf(playerId) >= 0) {
      throw new Error('Resolved synchronized player cannot launch again');
    }
    if (next.resolvedAttemptIds.indexOf(id) >= 0) throw new Error('Resolved attempt cannot launch again');
    if (next.pendingLaunchIds.indexOf(id) < 0) {
      if (next.pendingLaunchIds.length >= Math.min(4, next.activePlayerIds.length)) {
        throw new RangeError('Too many pending Battle launches');
      }
      if (next.pendingLaunchIds.some(function (pendingId) {
        return next.pendingLaunchOwners[pendingId] === playerId;
      })) throw new Error('Battle player already owns a pending launch');
      next.pendingLaunchIds.push(id);
      next.pendingLaunchOwners[id] = playerId;
      next.pendingLaunchLeases[id] = createLaunchLease(next, playerId);
    } else if (next.pendingLaunchOwners[id] !== playerId) {
      throw new Error('Pending Battle attempt belongs to another player');
    }
    validateBattleState(next);
    return freeze(next);
  }

  function advanceClock(state, deltaMs) {
    validateBattleState(state);
    var next = clone(state);
    if (next.phase !== 'active' || next.config.paceId !== 'rush' || next.suddenDeath) return freeze(next);
    var interval = rushRotationInterval(next.config);
    var beforeBucket = Math.floor(next.elapsedMs / interval);
    next.elapsedMs = Math.min(next.config.rushDurationMs,
      next.elapsedMs + Math.max(0, Number(deltaMs) || 0));
    var afterBucket = Math.floor(Math.min(next.elapsedMs, next.config.rushDurationMs - 1) /
      interval);
    if (afterBucket > beforeBucket) {
      next.rotationIndex += (afterBucket - beforeBucket) * rotationStep(next.config);
      next.activePlayerIds = selectRushActive(next.config, next.rotationIndex);
    }
    if (next.elapsedMs >= next.config.rushDurationMs) {
      next.clockExpired = true;
      if (next.pendingLaunchIds.length === 0) {
        var leaders = rankedLeaders(next.scores);
        if (leaders.length === 1) finishHeat(next, leaders[0]);
        else enterSuddenDeath(next, leaders);
      }
    }
    validateBattleState(next);
    return freeze(next);
  }

  function choosePower(state, input) {
    validateBattleState(state);
    var next = clone(state);
    var source = object(input);
    var playerId = required(source.playerId, 'playerId');
    var key = ownerKey(next, playerId);
    if (next.phase === 'complete') throw new Error('Completed Battle cannot store a power');
    var offer = next.powerOffers[key];
    if (!offer) throw new Error('No power offer for ' + key);
    if (next.storedPowers[key]) throw new Error('Only one Battle power may be stored');
    var index = Math.floor(Number(source.index));
    if (index !== 0 && index !== 1) throw new RangeError('Power index must be 0 or 1');
    var card = offer[index];
    if (card.scope === 'target') {
      var targetId = required(source.targetId, 'targetId');
      if (targetId === key || competitors(next.config).indexOf(targetId) < 0) {
        throw new Error('Target must be an opponent');
      }
      card.targetId = targetId;
    }
    next.storedPowers[key] = card;
    next.storedPowerSequences[key] = next.powerOfferSequences[key];
    next.powerOffers[key] = null;
    validateBattleState(next);
    return freeze(next);
  }

  function consumePower(state, playerId) {
    validateBattleState(state);
    var next = clone(state);
    var key = ownerKey(next, playerId);
    if (next.phase !== 'active') throw new Error('Battle powers deploy only during an active heat');
    var card = clone(next.storedPowers[key]);
    if (!card) throw new Error('No stored power for ' + key);
    next.storedPowers[key] = null;
    next.storedPowerSequences[key] = 0;
    validateBattleState(next);
    return freeze({ state: next, card: card });
  }

  function battleWinnerPlayerIds(state) {
    if (state.winnerId == null) return [];
    return members(state.config, state.winnerId).map(function (player) { return player.id; });
  }

  function battleParticipantResults(state) {
    return state.config.players.map(function (player) {
      var key = ownerKey(state, player.id);
      var attempts = state.resolvedAttempts.filter(function (entry) {
        return entry.playerId === player.id;
      });
      return { playerId: player.id, teamId: player.teamId,
        heatWins: state.heatWins[key], score: state.scores[key],
        attempts: attempts.length,
        qualifiedManualAttempts: attempts.filter(function (entry) {
          return entry.qualifiedManual;
        }).length,
        points: attempts.reduce(function (sum, entry) { return sum + entry.score; }, 0) };
    });
  }

  function hex32(value) { return (value >>> 0).toString(16).padStart(8, '0'); }

  function battleResolutionIdentity(state) {
    var namespace = 'v112.battle.' + encodeURIComponent(state.matchId);
    var evidence = canonicalJson({ matchId: state.matchId,
      config: state.config, attempts: state.resolvedAttempts, heats: state.heatResults,
      winnerId: state.winnerId, completionReason: state.completionReason });
    var token = hex32(hashText('a|' + evidence)) + hex32(hashText('b|' + evidence));
    var ordinal = state.resolvedAttempts.length;
    return freeze({ schema: 'BattleResolutionIdentityV1', namespace: namespace,
      ordinal: ordinal, token: token,
      id: 'bri1|' + namespace + '|' + ordinal + '|' + token });
  }

  function toMatchOutcomeV2(state, options) {
    validateBattleState(state);
    var source = object(options);
    var rulesComplete = state.phase === 'complete';
    var status = String(source.status || (rulesComplete ? 'completed' : 'abandoned'));
    if (status !== 'completed' && status !== 'abandoned' && status !== 'cancelled') {
      throw new TypeError('Unsupported outcome status: ' + status);
    }
    if ((status === 'completed') !== rulesComplete) {
      throw new Error('Match outcome status contradicts the Battle phase');
    }
    return freeze({ schema: 'MatchOutcomeV2', matchId: state.matchId,
      status: status, completed: status === 'completed',
      winnerIds: status === 'completed' ? battleWinnerPlayerIds(state) : [],
      participantResults: battleParticipantResults(state), rulesState: clone(state),
      resolutionIdentity: battleResolutionIdentity(state),
      activityState: clone(object(source.activityState)), telemetry: clone(object(source.telemetry)),
      completionReason: status === 'completed' ? state.completionReason : status,
      endedAt: source.endedAt == null ? null : String(source.endedAt) });
  }

  return freeze({ schema: 'BattleRulesV1', SPORT_CARDS: SPORT_CARDS,
    MAYHEM_CARDS: MAYHEM_CARDS, hardwareProfile: hardwareProfile,
    MAX_MATCH_ID_LENGTH: MAX_MATCH_ID_LENGTH,
    MAX_PLAYER_ID_LENGTH: MAX_PLAYER_ID_LENGTH,
    MAX_ATTEMPT_ID_LENGTH: MAX_ATTEMPT_ID_LENGTH,
    MAX_RESOLVED_ATTEMPTS: MAX_RESOLVED_ATTEMPTS,
    normalizeConfig: normalizeConfig, validateBattleConfig: validateBattleConfig,
    createState: createState, validateBattleState: validateBattleState,
    startHeat: startHeat, markLaunch: markLaunch, recordAttempt: recordAttempt,
    advanceClock: advanceClock, choosePower: choosePower,
    consumePower: consumePower, scoreForPose: scoreForPose,
    powerRoundPlayerIds: powerRoundPlayerIds,
    rushRotationIntervalMs: rushRotationInterval,
    toMatchOutcomeV2: toMatchOutcomeV2 });
});
