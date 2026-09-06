// v111-stats.js -- private, device-local statistics with durable rollups.
(function (root, factory) {
  'use strict';
  var Interfaces = root && root.FlipgameV111Interfaces;
  var Runtime = root && root.FlipgameV111Runtime;
  var NamePolicy = root && root.FlipgameV111NamePolicy;
  if (typeof module === 'object' && module.exports) {
    Interfaces = require('./v111-interfaces.js');
    Runtime = require('./v111-runtime.js');
    NamePolicy = require('./v111-name-policy.js');
  }
  var api = factory(Interfaces, Runtime, NamePolicy, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV111Stats = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Interfaces, Runtime, NamePolicy, root) {
  'use strict';

  var DB_NAME = 'flipgame-v111-stats';
  var DB_VERSION = 3;
  var EXPORT_SCHEMA = 'FlipStatsExportV1';
  var FALLBACK_KEY = 'flipgame.stats.aggregate.v1';
  var DEVICE_KEY = 'flipgame.stats.device-id.v1';
  var MAX_RAW_FLIPS = 100000;
  var FALLBACK_WARNING = Object.freeze({
    code: 'stats-storage-fallback',
    message: 'Detailed statistics storage is unavailable. Match and flip totals will still be preserved on this device.',
  });
  var AGGREGATE_CAPACITY_WARNING = Object.freeze({
    code: 'stats-aggregate-capacity',
    message: 'Statistics reached this device\'s safe aggregate limit. The last consistent data remains available.',
  });
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var SCOPE_VALUES = new Set(['all', 'device', 'session', 'import']);
  var ROLLUP_UNKNOWN = '__unknown__';
  var ROLLUP_MODES = new Set(['classic','cup','team-clash','team','practice','physics-lab','lab','alien','insane']);
  var ROLLUP_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
  var MAX_ROLLUP_CELLS_PER_DAY_LINEAGE = 64;
  var DETAILED_ROLLUP_CELLS_PER_DAY_LINEAGE = 60;
  var MAX_AGGREGATE_INDEX_ENTRIES = 100000;
  var MAX_AGGREGATE_COUNT = 1000000000;
  var OPEN_ID_LIMITS = Object.freeze({ sessionId: 32, deviceId: 4, playerId: 8, teamId: 8 });
  var OBJECT_IDS = [
    'bottle','coffee-mug','ketchup','milk-carton','maple','teapot','honeybear','salt-pepper-shaker',
    'babybottle','soup-can','extinguisher','smoothie','soap','gumball-machine','hourglass','microscope',
    'bowlingpin','desk-globe','cone','microphone-stand','flask','potted-plants','shell','penguin','pawn',
    'owl','buoy','giraffe','wineglass','red-panda','toucan','trophy-cup','trex','snow-globe',
    'whippedcream','eyeball-monster','potion','soda-can','tabasco','watering-can','coke','pinata',
    'stanley','huge-rubber-duck','lavalamp','action-figures','lawnchair','tall-buildings','octopus',
    'box-of-snacks','alien',
  ];
  var FLAVOR_IDS = ['blue-steel','sucker-punch','lime-light','orange-crush','grape-expectations',
    'ice-ice-baby','apple-solutely','berry-nice','making-waves','lemon-aid','very-cherry','pink-fluff'];
  var LEGACY_VARIANT_IDS = ['red','blue','green','orange','purple','cyan','lime','pink','indigo','yellow','cherry'];
  var EVENT_IDS = Interfaces && Array.isArray(Interfaces.EVENT_CATALOG)
    ? Interfaces.EVENT_CATALOG.map(function (entry) { return entry.id; }) : [
      'rainbow-corkscrew','half-full','power-launch','fizz-jet','golden-flip','bouncy-bottle','earthquake',
      'moon-gravity','ice-slide','alien-invasion','gravity-slam','trampoline','wind-tunnel','shrink-ray',
      'portal-pair','tether-swing','mitosis','double-flip','ceiling-flip','meteor-shower','magnet','heart-rush',
      'black-hole','boomerang','roulette-table','rewind','plinko','mirror-match','cap-toss','life-drain',
    ];
  var COSMETIC_IDS = [
    'chrome','sparkles','impact-rings','clean-flip','rooftop','matte','bubbles','splash','table-tamer','arcade',
    'porcelain','leaves','dust-cloud','spin-doctor','moon-deck','woodgrain','stars','petals','clutch','ice-cave',
    'frosted-glass','pixel','blocks','hot-hand','neon-grid','neon','confetti','comic-pop','chaos-pilot','garden',
    'galaxy','snow','music-notes','cap-collector','space-station','lava','smoke','feathers','orbit-breaker',
    'volcano','ice','lightning','gears','crowd-favorite','storm-table','holographic','prism','aurora',
    'flip-legend','aurora-stage','crown','cosmetic-blue',
  ];
  var ARENA_IDS = ['classic-table','moon-table','slick-table','crosswind','moon-gravity','gravity-slam',
    'spring-table','rooftop','arcade','moon-deck','ice-cave','neon-grid','garden','space-station','volcano',
    'storm-table','aurora-stage'];
  var VIEWPORT_BUCKETS = ['360x740','768x1024','1280x720','1280x800','1366x768','1920x1080',
    '3840x2160','tablet-portrait','phone-portrait','desktop','smartboard'];
  function catalogSet(values) { return new Set(values); }
  var STATIC_ROLLUP_IDS = Object.freeze({
    eventId: catalogSet(EVENT_IDS), objectId: catalogSet(OBJECT_IDS), cosmeticId: catalogSet(COSMETIC_IDS),
    arenaId: catalogSet(ARENA_IDS), viewportBucket: catalogSet(VIEWPORT_BUCKETS), variantId: catalogSet(FLAVOR_IDS),
  });
  OBJECT_IDS.forEach(function (objectId) {
    FLAVOR_IDS.concat(LEGACY_VARIANT_IDS).forEach(function (variantId) {
      STATIC_ROLLUP_IDS.variantId.add(objectId + '.' + variantId);
    });
  });
  COSMETIC_IDS.slice(0, 50).forEach(function (id, index) {
    STATIC_ROLLUP_IDS.cosmeticId.add(['finish','trail','burst','nameplate','arena'][index % 5] + '.' + id);
  });
  var FLIP_RECORD_FIELDS = Object.freeze([
    'schema','version','releaseVersion','uuid','timestamp','sessionId','deviceId','matchId','sequence','scope',
    'mode','heat','round','turn','playerCount','online','practice','forced','testData','playerId','displayName',
    'playerIndex','seat','isAI','teamId','result','made','pose','landingReason','perfect','cap','power','direction',
    'rotations','contacts','bounces','banks','flightMs','firstContactMs','settleMs','stakeBefore','stakeAfter','stake',
    'livesBefore','livesAfter','streakBefore','streakAfter','streak','onFireBefore','onFireAfter','suddenDeathBefore',
    'suddenDeathAfter','eventId','eventSuccess','oddsProfile','eventSeed','trajectorySeed','appliedReward',
    'appliedEffect','objectId','variantId','cosmeticId','arenaId','viewport','performance','cupHeat','teamScore',
  ]);
  var MATCH_RECORD_FIELDS = Object.freeze([
    'schema','version','releaseVersion','uuid','timestamp','startedAt','durationMs','sessionId','deviceId','matchId',
    'scope','mode','arenaId','viewport','online','practice','testData','playerCount','participants','players',
    'winnerIndex','winnerIds','winnerId','winnerTeamId','winner','teams','heatSummaries','roundSummaries',
    'totalFlips','eventCounts','startingSettings','completionReason','cup','team','stats','completed',
  ]);
  var FILTER_FIELDS = Object.freeze([
    'from','to','dateFrom','dateTo','modes','seats','playerIds','playerType','isAI','objectIds','variantIds',
    'cosmeticIds','arenaIds','eventIds','playerCounts','viewportBuckets','scope','scopes','sessionIds','deviceIds',
    'teamIds','results','online','includeTestData','includeTestEventNames',
  ]);
  var instanceSequence = 0;

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }
  function finite(value, fallback) {
    if (value == null || value === '') return fallback == null ? null : fallback;
    var n = Number(value);
    return Number.isFinite(n) ? n : (fallback == null ? null : fallback);
  }
  function integer(value, fallback) {
    var n = finite(value, fallback);
    return n == null ? null : Math.trunc(n);
  }
  function bool(value) { return value === true; }
  function text(value, fallback) {
    return value == null ? (fallback == null ? null : String(fallback)) : String(value);
  }
  function oneOf(value, values, fallback) {
    var candidate = text(value, fallback);
    return values.indexOf(candidate) >= 0 ? candidate : fallback;
  }
  function firstValue() {
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i] !== undefined && arguments[i] !== null) return arguments[i];
    }
    return null;
  }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function policy() {
    if (NamePolicy && typeof NamePolicy.validate === 'function') return NamePolicy;
    if (Runtime && Runtime.namePolicy && typeof Runtime.namePolicy.current === 'function') {
      var current = Runtime.namePolicy.current();
      if (current && typeof current.validate === 'function') return current;
    }
    return null;
  }
  function safeName(value, fallback) {
    var current = policy();
    if (current && typeof current.safeDisplay === 'function') return current.safeDisplay(value, fallback || 'Player');
    // Fail closed if a consumer loads the modules out of order.
    return value == null || !String(value).trim() ? (fallback || 'Player') : 'Player';
  }
  function sanitizeNamesDeep(value, fallback, contextKey) {
    if (Array.isArray(value)) return value.map(function (entry) { return sanitizeNamesDeep(entry, fallback, contextKey); });
    if (!value || typeof value !== 'object') return value;
    var output = {};
    var playerContext = /^(player|players|participants|winner|winners|roster|members|rows)$/i.test(contextKey || '') ||
      value.playerId != null || value.netId != null || value.seat != null || value.playerIndex != null || value.isAI != null;
    Object.keys(value).forEach(function (key) {
      output[key] = /^(displayName|playerName)$/i.test(key) || (key === 'name' && playerContext)
        ? safeName(value[key], fallback || 'Player') : sanitizeNamesDeep(value[key], fallback, key);
    });
    return output;
  }
  function optionalBool(value) { return value == null ? null : !!value; }
  function timestamp(value, fallback) {
    var parsed = value;
    if (typeof value === 'string' && value.trim() && !Number.isFinite(Number(value))) parsed = Date.parse(value);
    var n = finite(parsed, fallback == null ? Date.now() : fallback);
    return Math.min(8640000000000000, Math.max(0, Math.trunc(n)));
  }
  function fnv(textValue, seed) {
    var hash = seed >>> 0;
    var value = String(textValue);
    for (var i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
  function stableUuid(namespace, value) {
    var source = namespace + '|' + String(value);
    var a = fnv(source, 2166136261);
    var b = fnv(source, 2246822519);
    var c = fnv(source, 3266489917);
    var d = fnv(source, 668265263);
    // RFC-4122-shaped deterministic identifier (version 5 / variant 1 bits).
    var hex = [a, b, c, d].map(function (part) { return ('00000000' + part.toString(16)).slice(-8); }).join('');
    hex = hex.slice(0, 12) + '5' + hex.slice(13, 16) + ((parseInt(hex[16], 16) & 3) | 8).toString(16) + hex.slice(17);
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }
  function recordUuid(kind, source, context) {
    var supplied = source.uuid || source.id || (source.payload && (source.payload.uuid || source.payload.id));
    if (UUID_RE.test(String(supplied || ''))) return String(supplied).toLowerCase();
    if (supplied) return stableUuid(kind, supplied);
    var eventSequence = source.sequence;
    if (eventSequence != null) {
      return stableUuid(kind, [context.deviceId, context.sessionId, source.timestamp, eventSequence].join('|'));
    }
    // No random source is touched: statistics must never advance gameplay RNG.
    return stableUuid(kind, [context.deviceId, context.sessionId,
      source.timestamp, JSON.stringify(source), context.nextRecordId ? context.nextRecordId() : 0].join('|'));
  }
  function safePlayer(player, index) {
    var source = player && typeof player === 'object' ? player : {};
    return Object.assign({}, clone(source), {
      playerId: text(source.playerId != null ? source.playerId : source.id, 'seat-' + index),
      displayName: safeName(source.displayName != null ? source.displayName : source.name, 'Player'),
      playerIndex: integer(firstValue(source.playerIndex, source.seat, source.index), index),
      seat: integer(firstValue(source.seat, source.playerIndex, source.index), index),
      isAI: !!source.isAI,
      teamId: text(source.teamId, null),
      objectId: text(source.objectId != null ? source.objectId : source.skin, null),
      variantId: text(source.variantId, null),
      cosmeticId: text(source.cosmeticId, null),
      startingLives: finite(source.startingLives, null),
      lives: finite(firstValue(source.lives, source.endingLives), null),
      endingLives: finite(firstValue(source.endingLives, source.lives), null),
      flips: Math.max(0, integer(source.flips, 0)), makes: Math.max(0, integer(source.makes, 0)),
      streak: finite(source.streak, 0), bestStreak: Math.max(0, finite(source.bestStreak, 0)),
      winner: !!source.winner, isOnFire: optionalBool(source.isOnFire),
      eliminated: !!source.eliminated,
    });
  }
  function normalizeViewport(value, fallback) {
    var source = object(value);
    var other = object(fallback);
    var width = finite(firstValue(source.width, source.w, other.width, other.w), null);
    var height = finite(firstValue(source.height, source.h, other.height, other.h), null);
    var orientation = text(firstValue(source.orientation, other.orientation), null);
    if (!orientation && width != null && height != null) orientation = width >= height ? 'landscape' : 'portrait';
    var bucket = text(firstValue(source.bucket, source.viewportBucket, other.bucket, other.viewportBucket), null);
    if (!bucket && width != null && height != null) bucket = Math.round(width) + 'x' + Math.round(height);
    return freeze(Object.assign({}, clone(other), clone(source),
      { width: width, height: height, bucket: bucket, orientation: orientation }));
  }
  function normalizePerformance(value, fallback) {
    var source = object(value);
    var other = object(fallback);
    return freeze({
      fpsBucket: text(firstValue(source.fpsBucket, source.frameRateBucket, other.fpsBucket, other.frameRateBucket), null),
      frameTimeBucket: text(firstValue(source.frameTimeBucket, other.frameTimeBucket), null),
      slowFrameRateBucket: text(firstValue(source.slowFrameRateBucket, source.droppedFrameBucket,
        other.slowFrameRateBucket, other.droppedFrameBucket), null),
    });
  }
  function sourceParts(input) {
    var source = input && typeof input === 'object' ? input : {};
    var payload = source.payload && typeof source.payload === 'object' ? source.payload : source;
    var game = payload.game && typeof payload.game === 'object' ? payload.game : {};
    var players = Array.isArray(game.players) ? game.players : (Array.isArray(payload.players) ? payload.players : []);
    return { source: source, payload: payload, game: game, players: players };
  }
  function normalizeFlipRecord(input, options) {
    var opts = options || {};
    var parts = sourceParts(input);
    var source = parts.source;
    var payload = parts.payload;
    var game = parts.game;
    var recordBase = payload.schema === 'FlipRecordV1' ? clone(payload) : clone(payload.record || {});
    var landing = Object.assign({}, object(recordBase.landing), object(payload.landing));
    var flick = Object.assign({}, object(recordBase.flick), object(payload.flick));
    var before = Object.assign({}, object(recordBase.before), object(payload.before));
    var after = Object.assign({}, object(recordBase.after), object(payload.after));
    var modeState = Object.assign({}, object(recordBase.modeState), object(payload.modeState));
    var playerIndex = integer(firstValue(payload.playerIndex, payload.seat, recordBase.playerIndex,
      recordBase.seat), integer(game.currentPlayerIndex, 0));
    var player = safePlayer(payload.player || parts.players[playerIndex] ||
      (payload.schema === 'FlipRecordV1' ? payload : null), playerIndex);
    var result = text(firstValue(payload.result, recordBase.result, landing.result),
      text(game.lastResult, 'MISS')).toUpperCase() === 'MAKE' ? 'MAKE' : 'MISS';
    var direction = finite(firstValue(payload.direction, recordBase.direction, flick.direction, game.direction), null);
    if (direction == null && finite(flick.vx, null) != null) direction = Number(flick.vx) < 0 ? -1 : 1;
    if (direction != null) direction = direction < 0 ? -1 : 1;
    var power = finite(firstValue(payload.power, recordBase.power, flick.power), null);
    if (power == null && finite(flick.vx, null) != null && finite(flick.vy, null) != null) {
      power = Math.sqrt(Number(flick.vx) * Number(flick.vx) + Number(flick.vy) * Number(flick.vy));
    }
    var eventId = text(firstValue(payload.eventId, recordBase.eventId, flick.eventId, flick.rareEvent), null);
    var firstContactMs = finite(firstValue(payload.firstContactMs, recordBase.firstContactMs,
      landing.firstContactMs, landing.timeToFirstContactMs), null);
    var settleMs = finite(firstValue(payload.settleMs, recordBase.settleMs, landing.settleMs,
      landing.settleDurationMs), null);
    var flightMs = finite(firstValue(payload.flightMs, recordBase.flightMs, landing.flightMs,
      landing.flightDurationMs, landing.totalFlightMs), null);
    if (firstContactMs != null) firstContactMs = Math.max(0, firstContactMs);
    if (settleMs != null) settleMs = Math.max(0, settleMs);
    if (flightMs != null) flightMs = Math.max(0, flightMs);
    // flightMs is airborne-to-resolution. Older live adapters aliased it to
    // firstContactMs, so a supplied value can never shorten the known lifecycle.
    if (firstContactMs != null && settleMs != null) {
      flightMs = Math.max(flightMs == null ? 0 : flightMs, firstContactMs + settleMs);
    } else if (flightMs == null && firstContactMs != null) flightMs = firstContactMs;
    var oddsProfile = text(firstValue(payload.oddsProfile, recordBase.oddsProfile, flick.oddsProfile), null);
    if (!oddsProfile && finite(flick.rareMultiplier, null) === 10) oddsProfile = 'mr-howe';
    else if (!oddsProfile && game.insanity) oddsProfile = 'insane';
    else if (!oddsProfile && firstValue(flick.seed, flick.eventSeed, flick.trajectorySeed) != null) oddsProfile = 'normal';
    var stakeAfter = finite(firstValue(payload.stakeAfter, recordBase.stakeAfter, after.stake,
      payload.stake, recordBase.stake, game.pointCount), null);
    var streakAfter = finite(firstValue(payload.streakAfter, recordBase.streakAfter, after.streak,
      payload.streak, recordBase.streak, player.streak), null);
    var recordIdentity = Object.assign({}, source, {
      uuid: firstValue(source.uuid, payload.uuid, recordBase.uuid), id: firstValue(source.id, payload.id, recordBase.id),
    });
    var record = Object.assign({}, recordBase, {
      schema: 'FlipRecordV1', version: 1,
      releaseVersion: text(firstValue(payload.releaseVersion, recordBase.releaseVersion),
        Interfaces && Interfaces.RELEASE_VERSION || 'v1.11'),
      uuid: recordUuid('flip', recordIdentity, opts),
      timestamp: timestamp(firstValue(source.timestamp, payload.timestamp, recordBase.timestamp), opts.now ? opts.now() : Date.now()),
      sessionId: text(firstValue(payload.sessionId, recordBase.sessionId), opts.sessionId),
      deviceId: text(firstValue(payload.deviceId, recordBase.deviceId), opts.deviceId),
      matchId: text(firstValue(payload.matchId, recordBase.matchId), opts.matchId),
      sequence: integer(firstValue(source.sequence, payload.sequence, recordBase.sequence), null),
      scope: oneOf(firstValue(payload.scope, recordBase.scope), ['device', 'session'], 'device'),
      mode: text(firstValue(payload.mode, recordBase.mode, game.format, modeState.format), 'classic'),
      heat: integer(firstValue(payload.heat, recordBase.heat, payload.cupHeat, recordBase.cupHeat,
        modeState.heat, modeState.heatIndex), null),
      round: integer(firstValue(payload.round, recordBase.round, modeState.round, modeState.roundIndex), null),
      turn: integer(firstValue(payload.turn, recordBase.turn, game.turnCounter, modeState.turn), null),
      playerCount: Math.max(0, integer(firstValue(payload.playerCount, recordBase.playerCount,
        parts.players.length || null), 0)),
      online: !!firstValue(payload.online, recordBase.online, false),
      practice: !!firstValue(payload.practice, recordBase.practice, game.practice, false),
      forced: !!firstValue(payload.forced, recordBase.forced, false),
      testData: !!(payload.testData || recordBase.testData || payload.forced ||
        recordBase.forced || payload.test || payload.simulated),
      playerId: text(firstValue(payload.playerId, recordBase.playerId), player.playerId),
      displayName: safeName(firstValue(payload.displayName, recordBase.displayName, player.displayName), 'Player'),
      playerIndex: integer(firstValue(payload.playerIndex, recordBase.playerIndex), player.playerIndex),
      seat: integer(firstValue(payload.seat, recordBase.seat, payload.playerIndex, recordBase.playerIndex), player.seat),
      isAI: !!firstValue(payload.isAI, recordBase.isAI, player.isAI),
      teamId: text(firstValue(payload.teamId, recordBase.teamId), player.teamId),
      result: result, made: result === 'MAKE', pose: text(firstValue(payload.pose, recordBase.pose,
        landing.pose), landing.onCap ? 'cap' : null),
      landingReason: text(firstValue(payload.landingReason, recordBase.landingReason, landing.reason), null),
      perfect: !!firstValue(payload.perfect, recordBase.perfect, landing.perfect, false),
      cap: !!firstValue(payload.cap, recordBase.cap, landing.onCap, landing.pose === 'cap'),
      power: power, direction: direction,
      rotations: finite(firstValue(payload.rotations, recordBase.rotations, landing.rotations), null),
      contacts: Math.max(0, integer(firstValue(payload.contacts, recordBase.contacts, landing.contacts), 0)),
      bounces: Math.max(0, integer(firstValue(payload.bounces, recordBase.bounces, landing.bounces), 0)),
      banks: Math.max(0, integer(firstValue(payload.banks, recordBase.banks, landing.banks,
        landing.bankHits), 0)),
      flightMs: flightMs, firstContactMs: firstContactMs, settleMs: settleMs,
      stakeBefore: finite(firstValue(payload.stakeBefore, recordBase.stakeBefore, before.stake), null),
      stakeAfter: stakeAfter, stake: stakeAfter,
      livesBefore: finite(firstValue(payload.livesBefore, recordBase.livesBefore, before.lives), null),
      livesAfter: finite(firstValue(payload.livesAfter, recordBase.livesAfter, after.lives, player.lives), null),
      streakBefore: finite(firstValue(payload.streakBefore, recordBase.streakBefore, before.streak), null),
      streakAfter: streakAfter, streak: streakAfter,
      onFireBefore: optionalBool(firstValue(payload.onFireBefore, recordBase.onFireBefore, before.onFire)),
      onFireAfter: optionalBool(firstValue(payload.onFireAfter, recordBase.onFireAfter, after.onFire,
        player.isOnFire, game.isOnFire)),
      suddenDeathBefore: optionalBool(firstValue(payload.suddenDeathBefore, recordBase.suddenDeathBefore,
        before.suddenDeath)),
      suddenDeathAfter: optionalBool(firstValue(payload.suddenDeathAfter, recordBase.suddenDeathAfter,
        after.suddenDeath, modeState.suddenDeath, game.suddenDeath)),
      eventId: eventId,
      eventSuccess: firstValue(payload.eventSuccess, recordBase.eventSuccess) == null
        ? (eventId ? result === 'MAKE' : null) : !!firstValue(payload.eventSuccess, recordBase.eventSuccess),
      oddsProfile: oddsProfile,
      eventSeed: integer(firstValue(payload.eventSeed, recordBase.eventSeed, flick.eventSeed, flick.seed), null),
      trajectorySeed: integer(firstValue(payload.trajectorySeed, recordBase.trajectorySeed,
        flick.trajectorySeed, flick.seed), null),
      appliedReward: clone(firstValue(payload.appliedReward, recordBase.appliedReward,
        payload.eventReward, landing.appliedReward, landing.eventReward)),
      appliedEffect: clone(firstValue(payload.appliedEffect, recordBase.appliedEffect,
        payload.eventEffect, landing.appliedEffect, landing.eventEffect, landing.effect)),
      objectId: text(firstValue(payload.objectId, recordBase.objectId), player.objectId),
      variantId: text(firstValue(payload.variantId, recordBase.variantId), player.variantId),
      cosmeticId: text(firstValue(payload.cosmeticId, recordBase.cosmeticId), player.cosmeticId),
      arenaId: text(firstValue(payload.arenaId, recordBase.arenaId, modeState.arenaId,
        game.arenaId, game.feel), null),
      viewport: normalizeViewport(firstValue(payload.viewport, recordBase.viewport),
        { width: payload.viewportWidth, height: payload.viewportHeight,
          bucket: firstValue(payload.viewportBucket, recordBase.viewportBucket) }),
      performance: normalizePerformance(firstValue(payload.performance, recordBase.performance), payload),
      cupHeat: integer(firstValue(payload.cupHeat, recordBase.cupHeat, payload.heat,
        recordBase.heat, modeState.heatIndex), null),
      teamScore: finite(firstValue(payload.teamScore, recordBase.teamScore), null),
    });
    record = sanitizeNamesDeep(record);
    if (input && input._importId) record._importId = String(input._importId);
    return freeze(record);
  }
  function normalizeMatchRecord(input, options) {
    var opts = options || {};
    var parts = sourceParts(input);
    var source = parts.source;
    var payload = parts.payload;
    var game = parts.game;
    var nestedMatch = object(payload.match);
    var recordBase = payload.schema === 'MatchRecordV1' ? clone(payload)
      : clone(payload.record || nestedMatch.record || {});
    var modeState = Object.assign({}, object(recordBase.modeState), object(payload.modeState));
    var stats = firstValue(payload.stats, recordBase.stats, nestedMatch.stats);
    var perPlayer = object(stats).perPlayer;
    var playerInput = Array.isArray(payload.participants) ? payload.participants
      : (Array.isArray(recordBase.participants) ? recordBase.participants
      : (Array.isArray(payload.players) ? payload.players : parts.players));
    var winnerIndex = integer(firstValue(payload.winnerIndex, recordBase.winnerIndex,
      game.winnerIndex), null);
    var players = playerInput.map(function (player, index) {
      var detail = Array.isArray(perPlayer) && perPlayer[index] ? perPlayer[index] : {};
      return safePlayer(Object.assign({}, player, detail, {
        startingLives: firstValue(player.startingLives, game.startingLives),
        winner: firstValue(player.winner, index === winnerIndex),
      }), index);
    });
    var suppliedWinnerIds = firstValue(payload.winnerIds, recordBase.winnerIds,
      object(payload.winner).playerIds, object(recordBase.winner).playerIds);
    var winnerIds = Array.isArray(suppliedWinnerIds) ? suppliedWinnerIds.map(String) : [];
    var suppliedWinnerId = text(firstValue(payload.winnerId, recordBase.winnerId,
      object(payload.winner).playerId, object(recordBase.winner).playerId), null);
    if (!winnerIds.length && suppliedWinnerId) winnerIds.push(suppliedWinnerId);
    if (!winnerIds.length && winnerIndex != null && players[winnerIndex]) winnerIds.push(players[winnerIndex].playerId);
    var endedAt = timestamp(firstValue(source.timestamp, payload.timestamp, recordBase.timestamp),
      opts.now ? opts.now() : Date.now());
    var startedAtValue = firstValue(payload.startedAt, recordBase.startedAt, nestedMatch.startedAt);
    var startedAt = startedAtValue == null ? null : timestamp(startedAtValue);
    var durationMs = finite(firstValue(payload.durationMs, recordBase.durationMs, nestedMatch.durationMs),
      startedAt == null ? null : Math.max(0, endedAt - startedAt));
    if (durationMs != null) durationMs = Math.max(0, durationMs);
    var totalFlips = integer(firstValue(payload.totalFlips, recordBase.totalFlips, nestedMatch.totalFlips), null);
    if (totalFlips == null) totalFlips = players.reduce(function (sum, player) { return sum + player.flips; }, 0);
    var teams = firstValue(payload.teams, recordBase.teams, modeState.teams,
      object(payload.team).teams, object(recordBase.team).teams);
    if (!Array.isArray(teams)) teams = [];
    var winnerTeamId = text(firstValue(payload.winnerTeamId, recordBase.winnerTeamId,
      object(payload.winner).teamId, object(recordBase.winner).teamId, modeState.winnerTeamId), null);
    var winner = freeze(sanitizeNamesDeep(Object.assign({}, clone(object(recordBase.winner)), clone(object(payload.winner)),
      { playerIds: winnerIds.slice(), teamId: winnerTeamId })));
    var recordIdentity = Object.assign({}, source, {
      uuid: firstValue(source.uuid, payload.uuid, recordBase.uuid), id: firstValue(source.id, payload.id, recordBase.id),
    });
    var completed = firstValue(payload.completed, recordBase.completed, true) !== false;
    var startingSettings = sanitizeNamesDeep(clone(firstValue(payload.startingSettings, recordBase.startingSettings,
      nestedMatch.startingSettings, {
        mode: firstValue(payload.mode, recordBase.mode, game.format, modeState.format, 'classic'),
        startingLives: game.startingLives, maxLives: game.maxLives, feel: game.feel,
        insanity: game.insanity, arenaId: firstValue(payload.arenaId, recordBase.arenaId, modeState.arenaId),
      })));
    var record = Object.assign({}, recordBase, {
      schema: 'MatchRecordV1', version: 1,
      releaseVersion: text(firstValue(payload.releaseVersion, recordBase.releaseVersion),
        Interfaces && Interfaces.RELEASE_VERSION || 'v1.11'),
      uuid: recordUuid('match', recordIdentity, opts), timestamp: endedAt, startedAt: startedAt,
      durationMs: durationMs,
      sessionId: text(firstValue(payload.sessionId, recordBase.sessionId), opts.sessionId),
      deviceId: text(firstValue(payload.deviceId, recordBase.deviceId), opts.deviceId),
      matchId: text(firstValue(payload.matchId, recordBase.matchId), null),
      scope: oneOf(firstValue(payload.scope, recordBase.scope), ['device', 'session'], 'device'),
      mode: text(firstValue(payload.mode, recordBase.mode, game.format, modeState.format), 'classic'),
      arenaId: text(firstValue(payload.arenaId, recordBase.arenaId, startingSettings.arenaId), null),
      viewport: normalizeViewport(firstValue(payload.viewport, recordBase.viewport, startingSettings.viewport),
        { bucket: firstValue(payload.viewportBucket, recordBase.viewportBucket) }),
      online: !!firstValue(payload.online, recordBase.online, false),
      practice: !!firstValue(payload.practice, recordBase.practice, game.practice, false),
      testData: !!(payload.testData || recordBase.testData || payload.forced ||
        recordBase.forced || payload.test || payload.simulated),
      playerCount: Math.max(0, integer(firstValue(payload.playerCount, recordBase.playerCount,
        players.length), players.length)),
      participants: players, players: players,
      winnerIndex: winnerIndex, winnerIds: winnerIds,
      winnerId: text(firstValue(suppliedWinnerId, winnerIds[0]), null),
      winnerTeamId: winnerTeamId,
      winner: winner,
      teams: sanitizeNamesDeep(clone(teams)),
      heatSummaries: sanitizeNamesDeep(clone(firstValue(payload.heatSummaries, recordBase.heatSummaries,
        nestedMatch.heatSummaries, modeState.heatSummaries, modeState.heats, []))),
      roundSummaries: sanitizeNamesDeep(clone(firstValue(payload.roundSummaries, recordBase.roundSummaries,
        nestedMatch.roundSummaries, modeState.roundSummaries, modeState.rounds, []))),
      totalFlips: Math.max(0, totalFlips),
      eventCounts: clone(firstValue(payload.eventCounts, recordBase.eventCounts,
        nestedMatch.eventCounts, {})),
      startingSettings: startingSettings,
      completionReason: text(firstValue(payload.completionReason, recordBase.completionReason,
        nestedMatch.completionReason), completed ? 'completed' : 'abandoned'),
      cup: sanitizeNamesDeep(clone(firstValue(payload.cup, recordBase.cup, modeState.cup,
        String(firstValue(game.format, recordBase.mode)) === 'cup' ? modeState : null))),
      team: sanitizeNamesDeep(clone(firstValue(payload.team, recordBase.team, modeState.team,
        String(firstValue(game.format, recordBase.mode)) === 'team-clash' ? modeState : null))),
      stats: sanitizeNamesDeep(clone(stats)), completed: completed,
    });
    record = sanitizeNamesDeep(record);
    if (input && input._importId) record._importId = String(input._importId);
    return freeze(record);
  }

  function dayBucket(ms) { return new Date(timestamp(ms, 0)).toISOString().slice(0, 10); }
  function powerBucket(value) {
    var n = finite(value, null);
    if (n == null) return null;
    if (n < 1000) return '<1000';
    if (n < 2000) return '1000-1999';
    if (n < 3000) return '2000-2999';
    if (n < 4000) return '3000-3999';
    return '4000+';
  }
  function rotationBucket(value) {
    var n = finite(value, null);
    if (n == null) return null;
    return String(Math.max(0, Math.floor(n)));
  }
  function dimensionFor(record) {
    var dimensions = {
      day: dayBucket(record.timestamp), releaseVersion: record.releaseVersion,
      sessionId: record.sessionId, deviceId: record.deviceId,
      scope: record.scope, mode: record.mode, heat: record.heat, round: record.round, turn: record.turn,
      playerCount: record.playerCount, online: !!record.online, practice: !!record.practice,
      testData: !!record.testData, playerId: record.playerId, displayName: record.displayName,
      playerIndex: record.playerIndex, seat: record.seat, isAI: !!record.isAI,
      teamId: record.teamId, result: record.result, pose: record.pose,
      landingReason: record.landingReason, eventId: record.eventId, eventSuccess: record.eventSuccess,
      oddsProfile: record.oddsProfile, eventSeed: record.eventSeed, trajectorySeed: record.trajectorySeed,
      objectId: record.objectId, variantId: record.variantId, cosmeticId: record.cosmeticId,
      arenaId: record.arenaId, viewportBucket: record.viewport && record.viewport.bucket,
      viewportOrientation: record.viewport && record.viewport.orientation,
      powerBucket: powerBucket(record.power),
      direction: record.direction, rotationBucket: rotationBucket(record.rotations),
      contacts: record.contacts, bounces: record.bounces, banks: record.banks,
      flightMs: record.flightMs, firstContactMs: record.firstContactMs, settleMs: record.settleMs,
      livesBefore: record.livesBefore, livesAfter: record.livesAfter,
      stakeBefore: record.stakeBefore, stakeAfter: record.stakeAfter, stake: record.stakeAfter,
      streakBefore: record.streakBefore, streakAfter: record.streakAfter, streak: record.streakAfter,
      onFireBefore: record.onFireBefore, onFireAfter: record.onFireAfter,
      suddenDeathBefore: record.suddenDeathBefore, suddenDeathAfter: record.suddenDeathAfter,
      appliedReward: record.appliedReward, appliedEffect: record.appliedEffect,
      fpsBucket: record.performance && record.performance.fpsBucket,
      frameTimeBucket: record.performance && record.performance.frameTimeBucket,
      slowFrameRateBucket: record.performance && record.performance.slowFrameRateBucket,
      cupHeat: record.cupHeat,
    };
    if (record._importId) dimensions._importId = record._importId;
    return dimensions;
  }
  function dimensionKey(dimensions) {
    return Object.keys(dimensions).sort().map(function (key) {
      return key + '=' + JSON.stringify(dimensions[key]);
    }).join('|');
  }
  function emptyOpenDictionaries() {
    return { sessionId: new Set(), deviceId: new Set(), playerId: new Set(), teamId: new Set() };
  }
  function cloneOpenDictionaries(input) {
    var output = emptyOpenDictionaries();
    Object.keys(OPEN_ID_LIMITS).forEach(function (key) {
      var values = input && input[key];
      (values instanceof Set ? Array.from(values) : (Array.isArray(values) ? values : [])).forEach(function (value) {
        var normalized = String(value);
        if (output[key].size < OPEN_ID_LIMITS[key] && ROLLUP_ID_RE.test(normalized)) output[key].add(normalized);
      });
    });
    return output;
  }
  function dictionariesDocument(input) {
    var source = cloneOpenDictionaries(input);
    var output = {};
    Object.keys(OPEN_ID_LIMITS).forEach(function (key) { output[key] = Array.from(source[key]).sort(); });
    return output;
  }
  function trustOpenValue(dictionaries, key, value, allowExpansion) {
    if (value == null || value === ROLLUP_UNKNOWN) return value;
    var normalized = String(value);
    if (!ROLLUP_ID_RE.test(normalized)) return 'other';
    var dictionary = dictionaries && dictionaries[key];
    if (!(dictionary instanceof Set)) return 'other';
    if (dictionary.has(normalized)) return normalized;
    if (allowExpansion && dictionary.size < OPEN_ID_LIMITS[key]) {
      dictionary.add(normalized); return normalized;
    }
    return 'other';
  }
  function boundedRollupDimensions(record, dictionaries, allowOpenExpansion) {
    var source = record && typeof record === 'object' ? record : {};
    function has(key) { return Object.prototype.hasOwnProperty.call(source, key); }
    function value(key) { return has(key) ? source[key] : ROLLUP_UNKNOWN; }
    function stringValue(key) {
      var current = value(key);
      if (current === ROLLUP_UNKNOWN || current == null) return current;
      var normalized = String(current);
      if (Object.prototype.hasOwnProperty.call(OPEN_ID_LIMITS, key)) {
        return trustOpenValue(dictionaries, key, current, allowOpenExpansion);
      }
      if (key === 'scope') return normalized === 'device' || normalized === 'session' ? normalized : 'other';
      if (key === 'mode') return ROLLUP_MODES.has(normalized) ? normalized : 'other';
      if (key === 'result') return normalized === 'MAKE' || normalized === 'MISS' ? normalized : 'other';
      if (STATIC_ROLLUP_IDS[key]) return STATIC_ROLLUP_IDS[key].has(normalized) ? normalized : 'other';
      return ROLLUP_ID_RE.test(normalized) ? normalized : 'other';
    }
    function booleanValue(key) {
      var current = value(key);
      return typeof current === 'boolean' ? current : (current === ROLLUP_UNKNOWN ? current : ROLLUP_UNKNOWN);
    }
    function boundedInteger(key, minimum, maximum) {
      if (!has(key)) return ROLLUP_UNKNOWN;
      var current = Number(source[key]);
      return Number.isInteger(current) && current >= minimum && current <= maximum ? current : 'other';
    }
    var day = has('day') ? source.day : (has('timestamp') ? dayBucket(source.timestamp) : ROLLUP_UNKNOWN);
    if (day !== ROLLUP_UNKNOWN) {
      day = typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) &&
        dayBucket(Date.parse(day + 'T00:00:00.000Z')) === day ? day : 'other';
    }
    var viewportBucket = has('viewportBucket') ? source.viewportBucket
      : (has('viewport') && source.viewport && Object.prototype.hasOwnProperty.call(source.viewport, 'bucket')
        ? source.viewport.bucket : ROLLUP_UNKNOWN);
    return {
      day: day,
      scope: stringValue('scope'), sessionId: stringValue('sessionId'), deviceId: stringValue('deviceId'),
      mode: stringValue('mode'), playerId: stringValue('playerId'),
      seat: boundedInteger('seat', 0, 7),
      isAI: booleanValue('isAI'), teamId: stringValue('teamId'),
      objectId: stringValue('objectId'), variantId: stringValue('variantId'),
      cosmeticId: stringValue('cosmeticId'), arenaId: stringValue('arenaId'),
      eventId: stringValue('eventId'),
      playerCount: boundedInteger('playerCount', 1, 8),
      viewportBucket: viewportBucket == null || viewportBucket === ROLLUP_UNKNOWN
        ? viewportBucket : (STATIC_ROLLUP_IDS.viewportBucket.has(String(viewportBucket)) ? String(viewportBucket) : 'other'),
      result: stringValue('result'), online: booleanValue('online'),
      testData: booleanValue('testData'),
    };
  }

  function rollupDayRange(day) {
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { start: null, end: null };
    var start = Date.parse(day + 'T00:00:00.000Z');
    return Number.isFinite(start) ? { start: start, end: start + 86399999 } : { start: null, end: null };
  }
  function rangedBucket(value, cuts) {
    var number = finite(value, null);
    if (number == null) return null;
    for (var i = 0; i < cuts.length; i++) if (number <= cuts[i]) return String(cuts[i]);
    return String(cuts[cuts.length - 1]) + '+';
  }
  function boundedCounterKey(group, value) {
    if (value == null) return null;
    var key = String(value);
    if (group === 'results') return key === 'MAKE' || key === 'MISS' ? key : 'OTHER';
    if (group === 'poses') return ['upright','cap','side','inverted','other'].indexOf(key) >= 0 ? key : 'other';
    if (group === 'landingReasons') {
      return ['upright','cap','fallen','timeout','unstable','off-table','out-of-bounds','bank-missed',
        'tractor-ring','automatic-win','automatic-loss'].indexOf(key) >= 0 ? key : 'other';
    }
    if (group === 'rotations') {
      var rotations = Math.max(0, integer(value, 0)); return rotations >= 6 ? '6+' : String(rotations);
    }
    if (group === 'seats') {
      var seat = integer(value, -1); return seat >= 0 && seat <= 7 ? String(seat) : 'other';
    }
    if (group === 'playerTypes') return key === 'cpu' ? 'cpu' : 'human';
    if (group === 'powerDirection') {
      var pieces = key.split('|');
      var power = ['<1000','1000-1999','2000-2999','3000-3999','4000+','Unknown'].indexOf(pieces[0]) >= 0
        ? pieces[0] : 'Unknown';
      var direction = pieces[1] === '-1' || pieces[1] === '1' ? pieces[1] : 'Unknown';
      return power + '|' + direction;
    }
    if (group === 'playerCounts') {
      var players = integer(value, 0); return players >= 2 && players <= 8 ? String(players) : 'other';
    }
    if (group === 'lives') return rangedBucket(value, [0,1,2,3,5,10,25,50,100]);
    if (group === 'stakes') return rangedBucket(value, [0,1,2,3,5,10,20,50,100]);
    if (group === 'streaks') return rangedBucket(value, [0,1,2,3,5,10,20,50]);
    return key;
  }
  function counterIncrement(counters, group, value, amount) {
    var normalized = boundedCounterKey(group, value);
    if (normalized == null) return;
    if (!counters[group]) counters[group] = {};
    var key = normalized;
    counters[group][key] = (Number(counters[group][key]) || 0) + (Number(amount) || 0);
  }
  function newRollup(dimensions, prefix, partition) {
    var key = dimensionKey(dimensions);
    var range = rollupDayRange(dimensions.day);
    return {
      schema: 'FlipAggregateV1', version: 3,
      uuid: stableUuid('rollup', (prefix || 'retention') + '|' + (partition || 'device') + '|' + key),
      key: key, source: prefix || 'retention', timestampStart: range.start, timestampEnd: range.end,
      dimensions: clone(dimensions), flips: 0, makes: 0, caps: 0, perfect: 0,
      upright: 0, eventObserved: 0, eventSuccesses: 0, onFireRuns: 0,
      flightMsTotal: 0, flightMsCount: 0, settleMsTotal: 0, settleMsCount: 0,
      bestStreak: 0, counters: {}, makeCounters: {},
    };
  }
  function addRecordToRollup(cell, record) {
    var next = clone(cell);
    next.flips += 1;
    if (record.made || record.result === 'MAKE') next.makes += 1;
    if (record.cap) next.caps += 1;
    if (record.perfect) next.perfect += 1;
    if (record.pose === 'upright') next.upright += 1;
    if (record.eventId) {
      next.eventObserved += 1;
      if (record.eventSuccess === true) next.eventSuccesses += 1;
    }
    if (record.onFireBefore !== true && record.onFireAfter === true) next.onFireRuns += 1;
    if (finite(record.flightMs, null) != null) { next.flightMsTotal += Number(record.flightMs); next.flightMsCount += 1; }
    if (finite(record.settleMs, null) != null) { next.settleMsTotal += Number(record.settleMs); next.settleMsCount += 1; }
    next.bestStreak = Math.max(Number(next.bestStreak) || 0, Number(record.streakAfter) || 0);
    next.counters = next.counters || {};
    next.makeCounters = next.makeCounters || {};
    function category(group, value) {
      counterIncrement(next.counters, group, value, 1);
      if (record.made) counterIncrement(next.makeCounters, group, value, 1);
    }
    category('results', record.result);
    category('poses', record.pose);
    category('landingReasons', record.landingReason);
    category('powerDirection', (powerBucket(record.power) || 'Unknown') + '|' +
      (record.direction == null ? 'Unknown' : record.direction));
    category('rotations', rotationBucket(record.rotations));
    category('seats', firstValue(record.seat, record.playerIndex));
    category('playerTypes', record.isAI ? 'cpu' : 'human');
    category('playerCounts', record.playerCount);
    category('lives', record.livesAfter);
    category('stakes', record.stakeAfter);
    category('streaks', record.streakAfter);
    if (record._importId) next._importId = record._importId;
    return next;
  }
  function flipIndexEntry(cell) {
    var entry = { dimensions: clone(cell.dimensions || {}), timestampStart: cell.timestampStart,
      timestampEnd: cell.timestampEnd, flips: 0, makes: 0, caps: 0, perfect: 0, upright: 0,
      eventObserved: 0, eventSuccesses: 0, onFireRuns: 0, flightMsTotal: 0, flightMsCount: 0,
      settleMsTotal: 0, settleMsCount: 0, bestStreak: 0, counters: {}, makeCounters: {} };
    var plain = clone(cell); delete plain.overflow; delete plain.index;
    return addCellToRollup(entry, plain);
  }
  function aggregateCapacityError() {
    var error = new RangeError('Statistics aggregate index capacity exceeded');
    error.code = 'stats-aggregate-capacity';
    return error;
  }
  function mergeFlipIndex(current, additions) {
    var map = new Map();
    (current || []).forEach(function (entry) { map.set(dimensionKey(entry.dimensions || {}), clone(entry)); });
    if (map.size > MAX_AGGREGATE_INDEX_ENTRIES) throw aggregateCapacityError();
    (additions || []).forEach(function (entry) {
      var key = dimensionKey(entry.dimensions || {});
      var target = map.get(key) || { dimensions: clone(entry.dimensions || {}),
        timestampStart: entry.timestampStart, timestampEnd: entry.timestampEnd,
        flips: 0, makes: 0, caps: 0, perfect: 0, upright: 0, eventObserved: 0,
        eventSuccesses: 0, onFireRuns: 0, flightMsTotal: 0, flightMsCount: 0,
        settleMsTotal: 0, settleMsCount: 0, bestStreak: 0, counters: {}, makeCounters: {} };
      target = addCellToRollup(target, entry);
      target.timestampStart = target.timestampStart == null ? entry.timestampStart
        : Math.min(target.timestampStart, entry.timestampStart);
      target.timestampEnd = target.timestampEnd == null ? entry.timestampEnd
        : Math.max(target.timestampEnd, entry.timestampEnd);
      map.set(key, target);
      if (map.size > MAX_AGGREGATE_INDEX_ENTRIES) throw aggregateCapacityError();
    });
    return Array.from(map.values()).sort(function (a, b) {
      return dimensionKey(a.dimensions || {}).localeCompare(dimensionKey(b.dimensions || {}));
    });
  }
  function flipIndexEntries(cell) {
    return cell && cell.overflow && Array.isArray(cell.index) ? cell.index.map(clone) : [flipIndexEntry(cell)];
  }
  function addCellToRollup(cell, source) {
    var next = clone(cell);
    ['flips','makes','caps','perfect','upright','eventObserved','eventSuccesses','onFireRuns',
      'flightMsTotal','flightMsCount','settleMsTotal','settleMsCount'].forEach(function (key) {
      next[key] = (Number(next[key]) || 0) + (Number(source[key]) || 0);
    });
    next.bestStreak = Math.max(Number(next.bestStreak) || 0, Number(source.bestStreak) || 0);
    next.counters = next.counters || {};
    next.makeCounters = next.makeCounters || {};
    var counters = source.counters || {};
    Object.keys(counters).forEach(function (group) {
      Object.keys(counters[group] || {}).forEach(function (key) {
        counterIncrement(next.counters, group, key, counters[group][key]);
      });
    });
    var makeCounters = source.makeCounters || {};
    Object.keys(makeCounters).forEach(function (group) {
      Object.keys(makeCounters[group] || {}).forEach(function (key) {
        counterIncrement(next.makeCounters, group, key, makeCounters[group][key]);
      });
    });
    // Migrate revision-1 high-cardinality cells without retaining their keys.
    if (!source.counters) {
      var dim = source.dimensions || {};
      function oldCategory(group, value) {
        counterIncrement(next.counters, group, value, source.flips);
        counterIncrement(next.makeCounters, group, value, source.makes);
      }
      oldCategory('results', dim.result);
      oldCategory('poses', dim.pose);
      oldCategory('landingReasons', dim.landingReason);
      oldCategory('powerDirection', (dim.powerBucket || 'Unknown') + '|' +
        (dim.direction == null ? 'Unknown' : dim.direction));
      oldCategory('rotations', dim.rotationBucket);
      oldCategory('seats', firstValue(dim.seat, dim.playerIndex));
      oldCategory('playerTypes', dim.isAI ? 'cpu' : 'human');
      oldCategory('playerCounts', dim.playerCount);
      oldCategory('lives', dim.livesAfter);
      oldCategory('stakes', firstValue(dim.stakeAfter, dim.stake));
      oldCategory('streaks', firstValue(dim.streakAfter, dim.streak));
      next.upright += dim.pose === 'upright' ? Number(source.flips) || 0 : 0;
      next.onFireRuns += dim.onFireBefore !== true && dim.onFireAfter === true ? Number(source.flips) || 0 : 0;
      if (finite(dim.flightMs, null) != null) { next.flightMsTotal += Number(dim.flightMs) * (Number(source.flips) || 0); next.flightMsCount += Number(source.flips) || 0; }
      if (finite(dim.settleMs, null) != null) { next.settleMsTotal += Number(dim.settleMs) * (Number(source.flips) || 0); next.settleMsCount += Number(source.flips) || 0; }
      next.bestStreak = Math.max(next.bestStreak, Number(firstValue(dim.streakAfter, dim.streak)) || 0);
    }
    if (source._importId) next._importId = source._importId;
    if (source._sourceRollupId) next._sourceRollupId = source._sourceRollupId;
    if (source.overflow) next.overflow = true;
    if (next.overflow || source.overflow) {
      next.index = mergeFlipIndex(next.index || [], source.overflow && Array.isArray(source.index)
        ? source.index : [Object.assign(flipIndexEntry(source), { dimensions: clone(source.dimensions || {}) })]);
    }
    return next;
  }
  function rollupPartition(cell) { return cell && cell._importId ? cell._importId : 'device'; }
  function assertAggregateIndexBudget(cells) {
    var counts = new Map();
    (cells || []).forEach(function (cell) {
      if (!Array.isArray(cell.index)) return;
      var key = rollupPartition(cell) + '|' + String((cell.dimensions || {}).day);
      var count = (counts.get(key) || 0) + cell.index.length;
      if (count > MAX_AGGREGATE_INDEX_ENTRIES) throw aggregateCapacityError();
      counts.set(key, count);
    });
    return cells;
  }
  function overflowDimensions(source) {
    return clone(source.dimensions || {});
  }
  function mergeOverflowDimensions(target, source) {
    var output = clone(target || {});
    var incoming = source || {};
    Object.keys(output).forEach(function (key) {
      if (key === 'day' || key === 'scope' || key === 'testData') return;
      if (JSON.stringify(output[key]) !== JSON.stringify(incoming[key])) output[key] = ROLLUP_UNKNOWN;
    });
    return output;
  }
  function enforceRollupCellBudget(cells, prefix) {
    var groups = new Map();
    (cells || []).forEach(function (cell) {
      if (cell.schema !== 'FlipAggregateV1') return;
      var groupKey = rollupPartition(cell) + '|' + String((cell.dimensions || {}).day);
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push(cell);
    });
    var removed = new Set();
    var added = [];
    groups.forEach(function (group) {
      var existingOverflow = group.filter(function (cell) { return cell.overflow === true; });
      var detailed = group.filter(function (cell) { return cell.overflow !== true; })
        .sort(function (a, b) { return String(a.key).localeCompare(String(b.key)); });
      if (detailed.length <= DETAILED_ROLLUP_CELLS_PER_DAY_LINEAGE &&
          group.length <= MAX_ROLLUP_CELLS_PER_DAY_LINEAGE) return;
      var overflowMap = new Map();
      existingOverflow.forEach(function (cell) {
        var key = String((cell.dimensions || {}).testData);
        overflowMap.set(key, clone(cell));
      });
      detailed.slice(DETAILED_ROLLUP_CELLS_PER_DAY_LINEAGE).forEach(function (cell) {
        var dimensions = overflowDimensions(cell);
        var overflowKey = String(dimensions.testData);
        var target = overflowMap.get(overflowKey);
        if (!target) {
          target = newRollup(dimensions, prefix, rollupPartition(cell));
          target.overflow = true;
          if (cell._importId) target._importId = cell._importId;
        } else {
          target.dimensions = mergeOverflowDimensions(target.dimensions, cell.dimensions);
        }
        overflowMap.set(overflowKey, addCellToRollup(target, cell));
        removed.add(cell.uuid);
      });
      existingOverflow.forEach(function (cell) { removed.add(cell.uuid); });
      overflowMap.forEach(function (cell) {
        cell.key = dimensionKey(cell.dimensions);
        cell.uuid = stableUuid('rollup', prefix + '|' + rollupPartition(cell) + '|' + cell.key);
        added.push(freeze(cell));
      });
    });
    return assertAggregateIndexBudget(cells.filter(function (cell) { return !removed.has(cell.uuid); })
      .concat(added)).map(freeze);
  }
  function aggregateRecords(records, options) {
    var opts = options || {};
    var map = new Map();
    var passthrough = [];
    var dictionaries = new Map();
    function dictionaryFor(partition) {
      if (!dictionaries.has(partition)) dictionaries.set(partition, emptyOpenDictionaries());
      return dictionaries.get(partition);
    }
    (Array.isArray(opts.existing) ? opts.existing : []).forEach(function (cell) {
      // Pre-v3 retention cells do not contain the expanded categorical contract.
      // Keep them immutable: rewriting them would invent missing dimensions and turn
      // a single prune into an unbounded full-store migration.
      if (cell.schema === 'MatchAggregateV1' || cell.source !== (opts.prefix || 'retention') ||
          (cell.schema === 'FlipAggregateV1' && !(Number(cell.version) >= 3))) {
        passthrough.push(clone(cell)); return;
      }
      var partition = cell._importId || 'device';
      var dictionary = dictionaryFor(partition);
      [cell.dimensions || {}].concat((cell.index || []).map(function (entry) { return entry.dimensions || {}; }))
        .forEach(function (entry) {
          Object.keys(OPEN_ID_LIMITS).forEach(function (key) {
            var value = entry[key];
            if (value != null && value !== ROLLUP_UNKNOWN && value !== 'other' &&
                dictionary[key].size < OPEN_ID_LIMITS[key] && ROLLUP_ID_RE.test(String(value))) {
              dictionary[key].add(String(value));
            }
          });
        });
      var dimensions = boundedRollupDimensions(cell.dimensions || {}, dictionary, false);
      var mapKey = partition + '|' + dimensionKey(dimensions);
      var target = map.get(mapKey) || newRollup(dimensions, opts.prefix, partition);
      if (cell.overflow) target.overflow = true;
      map.set(mapKey, addCellToRollup(target, cell));
    });
    (Array.isArray(records) ? records : []).forEach(function (record) {
      var partition = record._importId || 'device';
      var supplied = record._rollupDictionaries ? cloneOpenDictionaries(record._rollupDictionaries) : null;
      var dictionary = supplied || dictionaryFor(partition);
      var dimensions = boundedRollupDimensions(record, dictionary, !record._importId);
      var key = partition + '|' + dimensionKey(dimensions);
      var cell = map.get(key) || newRollup(dimensions, opts.prefix, partition);
      map.set(key, addRecordToRollup(cell, record));
    });
    return enforceRollupCellBudget(passthrough.concat(Array.from(map.values())), opts.prefix || 'retention');
  }

  function matchIndexEntry(cell) {
    return { dimensions: clone(cell.dimensions || {}), timestampStart: cell.timestampStart,
      timestampEnd: cell.timestampEnd, matches: Number(cell.matches) || 0, cups: Number(cell.cups) || 0,
      teamMatches: Number(cell.teamMatches) || 0, teamWins: Number(cell.teamWins) || 0 };
  }
  function mergeMatchIndex(current, additions) {
    var map = new Map();
    (current || []).forEach(function (entry) { map.set(dimensionKey(entry.dimensions || {}), clone(entry)); });
    if (map.size > MAX_AGGREGATE_INDEX_ENTRIES) throw aggregateCapacityError();
    (additions || []).forEach(function (entry) {
      var key = dimensionKey(entry.dimensions || {});
      var target = map.get(key) || { dimensions: clone(entry.dimensions || {}),
        timestampStart: entry.timestampStart, timestampEnd: entry.timestampEnd,
        matches: 0, cups: 0, teamMatches: 0, teamWins: 0 };
      ['matches','cups','teamMatches','teamWins'].forEach(function (counter) {
        target[counter] = (Number(target[counter]) || 0) + (Number(entry[counter]) || 0);
      });
      target.timestampStart = target.timestampStart == null ? entry.timestampStart
        : Math.min(target.timestampStart, entry.timestampStart);
      target.timestampEnd = target.timestampEnd == null ? entry.timestampEnd
        : Math.max(target.timestampEnd, entry.timestampEnd);
      map.set(key, target);
      if (map.size > MAX_AGGREGATE_INDEX_ENTRIES) throw aggregateCapacityError();
    });
    return Array.from(map.values()).sort(function (a, b) {
      return dimensionKey(a.dimensions || {}).localeCompare(dimensionKey(b.dimensions || {}));
    });
  }
  function addMatchAggregate(cell, source) {
    var next = clone(cell);
    ['matches','cups','teamMatches','teamWins'].forEach(function (counter) {
      next[counter] = (Number(next[counter]) || 0) + (Number(source[counter]) || 0);
    });
    next.timestampStart = next.timestampStart == null ? source.timestampStart
      : Math.min(next.timestampStart, source.timestampStart);
    next.timestampEnd = next.timestampEnd == null ? source.timestampEnd
      : Math.max(next.timestampEnd, source.timestampEnd);
    if (source._importId) next._importId = source._importId;
    if (source._sourceRollupId) next._sourceRollupId = source._sourceRollupId;
    if (source.overflow) next.overflow = true;
    if (next.overflow || source.overflow) {
      next.index = mergeMatchIndex(next.index || [], source.overflow && Array.isArray(source.index)
        ? source.index : [matchIndexEntry(source)]);
    }
    return next;
  }

  function boundedMatchEventIds(record) {
    var ids = [];
    var counts = record && record.eventCounts;
    if (Array.isArray(counts)) {
      counts.forEach(function (row) {
        if (!row || Number(firstValue(row.count, row.observed, row.frequency, 0)) <= 0) return;
        var id = String(firstValue(row.eventId, row.id, ''));
        ids.push(STATIC_ROLLUP_IDS.eventId.has(id) ? id : 'other');
      });
    } else {
      Object.keys(object(counts)).forEach(function (id) {
        if (Number(counts[id]) > 0) ids.push(STATIC_ROLLUP_IDS.eventId.has(id) ? id : 'other');
      });
    }
    return ids.filter(function (id, index, values) { return values.indexOf(id) === index; }).sort();
  }

  function aggregateMatches(records, options) {
    var opts = options || {};
    var prefix = opts.prefix || 'fallback-matches';
    var map = new Map();
    var passthrough = [];
    var dictionaries = new Map();
    function dictionaryFor(partition) {
      if (!dictionaries.has(partition)) dictionaries.set(partition, emptyOpenDictionaries());
      return dictionaries.get(partition);
    }
    (Array.isArray(opts.existing) ? opts.existing : []).forEach(function (cell) {
      if (cell.schema !== 'MatchAggregateV1' || cell.source !== prefix) {
        passthrough.push(clone(cell)); return;
      }
      var partition = cell._importId || 'device';
      var dictionary = dictionaryFor(partition);
      var dim = cell.dimensions || {};
      [dim].concat(Array.isArray(dim.participants) ? dim.participants : [],
        (cell.index || []).reduce(function (entries, slice) {
          var sliceDim = slice.dimensions || {};
          return entries.concat([sliceDim], Array.isArray(sliceDim.participants) ? sliceDim.participants : []);
        }, [])).forEach(function (entry) {
        Object.keys(OPEN_ID_LIMITS).forEach(function (key) {
          var value = entry && entry[key];
          if (value != null && value !== ROLLUP_UNKNOWN && value !== 'other' &&
              dictionary[key].size < OPEN_ID_LIMITS[key] && ROLLUP_ID_RE.test(String(value))) dictionary[key].add(String(value));
        });
      });
      map.set(cell.key, clone(cell));
    });
    (Array.isArray(records) ? records : []).forEach(function (record) {
      var partition = record._importId || 'device';
      var dictionary = record._rollupDictionaries
        ? cloneOpenDictionaries(record._rollupDictionaries) : dictionaryFor(partition);
      var top = boundedRollupDimensions(record, dictionary, !record._importId);
      var players = Array.isArray(record.players) ? record.players.slice(0, 8) : [];
      var dimensions = {
        day: top.day, scope: top.scope, sessionId: top.sessionId, deviceId: top.deviceId,
        mode: top.mode, online: top.online, testData: top.testData,
        arenaId: top.arenaId, playerCount: top.playerCount, viewportBucket: top.viewportBucket,
        eventIds: boundedMatchEventIds(record),
        participants: players.map(function (player) {
          var bounded = boundedRollupDimensions(player, dictionary, !record._importId);
          return { playerId: bounded.playerId, seat: bounded.seat, isAI: bounded.isAI,
            teamId: bounded.teamId, objectId: bounded.objectId, variantId: bounded.variantId,
            cosmeticId: bounded.cosmeticId };
        }),
      };
      var key = partition + '|' + dimensionKey(dimensions);
      var cell = map.get(key) || {
        schema: 'MatchAggregateV1', version: 2,
        uuid: stableUuid('match-rollup', prefix + '|' + key), key: key, source: prefix,
        timestampStart: null, timestampEnd: null, dimensions: dimensions,
        matches: 0, cups: 0, teamMatches: 0, teamWins: 0,
      };
      cell.matches += 1;
      if (record.mode === 'cup' || record.cup) cell.cups += 1;
      if (record.mode === 'team-clash' || record.mode === 'team' || record.team) {
        cell.teamMatches += 1;
        if (record.winnerTeamId != null || (record.winner && record.winner.teamId != null)) cell.teamWins += 1;
      }
      cell.timestampStart = cell.timestampStart == null ? record.timestamp : Math.min(cell.timestampStart, record.timestamp);
      cell.timestampEnd = cell.timestampEnd == null ? record.timestamp : Math.max(cell.timestampEnd, record.timestamp);
      if (record._importId) cell._importId = record._importId;
      map.set(key, cell);
    });
    var cells = passthrough.concat(Array.from(map.values()));
    var groups = new Map();
    cells.forEach(function (cell) {
      if (cell.schema !== 'MatchAggregateV1' || cell.source !== prefix || Number(cell.version) < 2) return;
      var groupKey = rollupPartition(cell) + '|' + String((cell.dimensions || {}).day);
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push(cell);
    });
    var removed = new Set();
    var added = [];
    groups.forEach(function (group) {
      var overflow = new Map();
      var detailed = group.filter(function (cell) { return cell.overflow !== true; })
        .sort(function (a, b) { return String(a.key).localeCompare(String(b.key)); });
      group.filter(function (cell) { return cell.overflow === true; }).forEach(function (cell) {
        overflow.set(String(cell.dimensions.testData), clone(cell));
        removed.add(cell.uuid);
      });
      detailed.slice(DETAILED_ROLLUP_CELLS_PER_DAY_LINEAGE).forEach(function (cell) {
        var dimensions = overflowDimensions(cell);
        var overflowKey = String(dimensions.testData);
        var target = overflow.get(overflowKey);
        if (!target) {
          var key = rollupPartition(cell) + '|' + dimensionKey(dimensions);
          target = { schema: 'MatchAggregateV1', version: 2,
            uuid: stableUuid('match-rollup', prefix + '|' + key), key: key, source: prefix,
            timestampStart: null, timestampEnd: null, dimensions: dimensions, overflow: true,
            matches: 0, cups: 0, teamMatches: 0, teamWins: 0 };
          if (cell._importId) target._importId = cell._importId;
        } else {
          target.dimensions = mergeOverflowDimensions(target.dimensions, cell.dimensions);
        }
        target = addMatchAggregate(target, cell);
        overflow.set(overflowKey, target); removed.add(cell.uuid);
      });
      overflow.forEach(function (cell) {
        cell.key = rollupPartition(cell) + '|' + dimensionKey(cell.dimensions);
        cell.uuid = stableUuid('match-rollup', prefix + '|' + cell.key);
        added.push(freeze(cell));
      });
    });
    return assertAggregateIndexBudget(cells.filter(function (cell) { return !removed.has(cell.uuid); })
      .concat(added)).map(freeze);
  }

  function listFilter(value) {
    if (value == null) return null;
    return (Array.isArray(value) ? value : [value]).map(String);
  }
  function viewportFilter(value) {
    if (value == null) return null;
    return (Array.isArray(value) ? value : [value]).map(function (entry) {
      return typeof entry === 'object' ? normalizeViewport(entry).bucket : String(entry);
    });
  }
  function normalizeFilters(filters) {
    var source = filters || {};
    var scopes = listFilter(firstValue(source.scopes, source.scope, 'all')).filter(function (scope) {
      return SCOPE_VALUES.has(scope);
    });
    if (!scopes.length || scopes.indexOf('all') >= 0) scopes = ['all'];
    var playerType = oneOf(source.playerType, ['all', 'human', 'cpu'], 'all');
    if (source.human === true) playerType = 'human';
    if (source.cpu === true) playerType = 'cpu';
    var aiFilter = typeof source.isAI === 'boolean' ? source.isAI : null;
    if (playerType === 'human') aiFilter = false;
    if (playerType === 'cpu') aiFilter = true;
    return freeze({
      includeTestData: source.includeTestData === true,
      includeTestEventNames: source.includeTestEventNames === true,
      scope: scopes[0], scopes: scopes,
      from: firstValue(source.from, source.dateFrom) == null ? null : timestamp(firstValue(source.from, source.dateFrom)),
      to: firstValue(source.to, source.dateTo) == null ? null : timestamp(firstValue(source.to, source.dateTo)),
      sessionIds: listFilter(source.sessionIds != null ? source.sessionIds : source.sessionId),
      deviceIds: listFilter(source.deviceIds != null ? source.deviceIds : source.deviceId),
      playerIds: listFilter(source.playerIds != null ? source.playerIds : source.playerId),
      seats: listFilter(firstValue(source.seats, source.seat, source.playerIndexes, source.playerIndex)),
      modes: listFilter(source.modes != null ? source.modes : source.mode),
      eventIds: listFilter(source.eventIds != null ? source.eventIds : source.eventId),
      objectIds: listFilter(source.objectIds != null ? source.objectIds : source.objectId),
      variantIds: listFilter(firstValue(source.variantIds, source.variantId)),
      cosmeticIds: listFilter(firstValue(source.cosmeticIds, source.cosmeticId)),
      arenaIds: listFilter(firstValue(source.arenaIds, source.arenaId)),
      playerCounts: listFilter(firstValue(source.playerCounts, source.playerCount)),
      viewportBuckets: viewportFilter(firstValue(source.viewportBuckets, source.viewportBucket,
        source.viewports, source.viewport)),
      teamIds: listFilter(source.teamIds != null ? source.teamIds : source.teamId),
      results: listFilter(source.results != null ? source.results : source.result),
      online: typeof source.online === 'boolean' ? source.online : null,
      playerType: playerType, isAI: aiFilter,
      currentSessionId: text(source.currentSessionId, null), currentDeviceId: text(source.currentDeviceId, null),
    });
  }
  function contains(filter, value) { return !filter || filter.indexOf(String(value)) >= 0; }
  function inScope(record, filter) {
    if (filter.scopes.indexOf('all') >= 0) return true;
    return filter.scopes.some(function (scope) {
      if (scope === 'import') return !!record._importId;
      if (scope === 'session') return !record._importId && record.sessionId === filter.currentSessionId;
      if (scope === 'device') return !record._importId && (!filter.currentDeviceId || record.deviceId === filter.currentDeviceId);
      return false;
    });
  }
  function matchesDimensions(dim, cell, filter) {
    if (!filter.includeTestData && dim.testData !== false) return false;
    if (!inScope(Object.assign({}, dim, { _importId: cell ? cell._importId : dim._importId }), filter)) return false;
    if (!contains(filter.sessionIds, dim.sessionId) || !contains(filter.deviceIds, dim.deviceId) ||
        !contains(filter.playerIds, dim.playerId) || !contains(filter.seats, firstValue(dim.seat, dim.playerIndex)) ||
        !contains(filter.modes, dim.mode) ||
        !contains(filter.eventIds, dim.eventId) || !contains(filter.objectIds, dim.objectId) ||
        !contains(filter.variantIds, dim.variantId) || !contains(filter.cosmeticIds, dim.cosmeticId) ||
        !contains(filter.arenaIds, dim.arenaId) || !contains(filter.playerCounts, dim.playerCount) ||
        !contains(filter.viewportBuckets, dim.viewportBucket || (dim.viewport && dim.viewport.bucket)) ||
        !contains(filter.teamIds, dim.teamId) || !contains(filter.results, dim.result)) return false;
    if (filter.online != null && dim.online !== filter.online) return false;
    if (filter.isAI != null && dim.isAI !== filter.isAI) return false;
    var start = cell ? cell.timestampStart : dim.timestamp;
    var end = cell ? cell.timestampEnd : dim.timestamp;
    if (filter.from != null && end < filter.from) return false;
    if (filter.to != null && start > filter.to) return false;
    return true;
  }
  function matchesRecord(record, filter) {
    var effective = filter;
    if (record && record.schema === 'MatchRecordV1') {
      var players = Array.isArray(record.players) ? record.players : [];
      if (filter.playerIds) {
        if (!players.some(function (player) { return contains(filter.playerIds, player.playerId); })) return false;
        effective = Object.assign({}, effective, { playerIds: null });
      }
      if (filter.seats) {
        if (!players.some(function (player) { return contains(filter.seats, firstValue(player.seat, player.playerIndex)); })) return false;
        effective = Object.assign({}, effective, { seats: null });
      }
      if (filter.objectIds) {
        if (!players.some(function (player) { return contains(filter.objectIds, player.objectId); })) return false;
        effective = Object.assign({}, effective, { objectIds: null });
      }
      if (filter.variantIds) {
        if (!players.some(function (player) { return contains(filter.variantIds, player.variantId); })) return false;
        effective = Object.assign({}, effective, { variantIds: null });
      }
      if (filter.cosmeticIds) {
        if (!players.some(function (player) { return contains(filter.cosmeticIds, player.cosmeticId); })) return false;
        effective = Object.assign({}, effective, { cosmeticIds: null });
      }
      if (filter.teamIds) {
        if (!players.some(function (player) { return contains(filter.teamIds, player.teamId); })) return false;
        effective = Object.assign({}, effective, { teamIds: null });
      }
      if (filter.isAI != null) {
        if (!players.some(function (player) { return !!player.isAI === filter.isAI; })) return false;
        effective = Object.assign({}, effective, { isAI: null });
      }
      if (filter.eventIds) {
        var counts = object(record.eventCounts);
        var countRows = Array.isArray(record.eventCounts) ? record.eventCounts : null;
        if (!filter.eventIds.some(function (eventId) {
          if (Number(counts[eventId]) > 0) return true;
          return !!(countRows && countRows.some(function (row) {
            return row && String(firstValue(row.eventId, row.id)) === eventId &&
              Number(firstValue(row.count, row.observed, row.frequency, 0)) > 0;
          }));
        })) return false;
        effective = Object.assign({}, effective, { eventIds: null });
      }
    }
    return matchesDimensions(Object.assign({ timestamp: record.timestamp }, record), null, effective);
  }
  function matchesMatchDimensions(dim, cell, filter) {
    var participants = Array.isArray(dim.participants) ? dim.participants : [];
    var effective = filter;
    function participantFilter(filterKey, dimensionKeyName) {
      if (!effective[filterKey]) return true;
      if (!participants.some(function (player) { return contains(effective[filterKey], player[dimensionKeyName]); })) return false;
      effective = Object.assign({}, effective); effective[filterKey] = null;
      return true;
    }
    if (!participantFilter('playerIds', 'playerId') || !participantFilter('seats', 'seat') ||
        !participantFilter('objectIds', 'objectId') || !participantFilter('variantIds', 'variantId') ||
        !participantFilter('cosmeticIds', 'cosmeticId') || !participantFilter('teamIds', 'teamId')) return false;
    if (effective.eventIds) {
      var eventIds = Array.isArray(dim.eventIds) ? dim.eventIds : [];
      if (!effective.eventIds.some(function (eventId) { return eventIds.indexOf(eventId) >= 0; })) return false;
      effective = Object.assign({}, effective, { eventIds: null });
    }
    if (effective.isAI != null) {
      if (!participants.some(function (player) { return player.isAI === effective.isAI; })) return false;
      effective = Object.assign({}, effective, { isAI: null });
    }
    return matchesDimensions(dim, cell, effective);
  }
  function filteredRollupSlices(cell, filter) {
    var slices = cell && cell.overflow && Array.isArray(cell.index) ? cell.index : [cell];
    return slices.filter(function (slice) {
      var scoped = Object.assign({}, slice, { _importId: cell._importId,
        timestampStart: slice.timestampStart, timestampEnd: slice.timestampEnd });
      return cell.schema === 'MatchAggregateV1'
        ? matchesMatchDimensions(slice.dimensions || {}, scoped, filter)
        : matchesDimensions(slice.dimensions || {}, scoped, filter);
    });
  }
  function projectRollupCell(cell, filter) {
    var slices = filteredRollupSlices(cell, filter);
    if (!slices.length) return null;
    if (!(cell.overflow && Array.isArray(cell.index))) return clone(cell);
    var dimensions = clone(slices[0].dimensions || {});
    slices.slice(1).forEach(function (slice) {
      dimensions = mergeOverflowDimensions(dimensions, slice.dimensions || {});
    });
    var projected;
    if (cell.schema === 'MatchAggregateV1') {
      projected = { schema: 'MatchAggregateV1', version: 2, uuid: cell.uuid, key: cell.key,
        source: cell.source, timestampStart: null, timestampEnd: null, dimensions: dimensions,
        overflow: true, matches: 0, cups: 0, teamMatches: 0, teamWins: 0, index: [] };
      slices.forEach(function (slice) { projected = addMatchAggregate(projected, slice); });
    } else {
      projected = newRollup(dimensions, cell.source, rollupPartition(cell));
      projected.uuid = cell.uuid; projected.key = cell.key; projected.source = cell.source;
      projected.overflow = true; projected.index = [];
      slices.forEach(function (slice) { projected = addCellToRollup(projected, slice); });
    }
    if (cell._importId) projected._importId = cell._importId;
    if (cell._sourceRollupId) projected._sourceRollupId = cell._sourceRollupId;
    return projected;
  }
  function matchesRollup(cell, filter) {
    return filteredRollupSlices(cell, filter).length > 0;
  }

  function metricMap() { return new Map(); }
  function metricAdd(map, key, count, makes, extra) {
    var normalized = key == null ? 'Unknown' : String(key);
    var row = map.get(normalized) || Object.assign({ key: normalized, count: 0, makes: 0 }, extra || {});
    row.count += Number(count) || 0;
    row.makes += Number(makes) || 0;
    map.set(normalized, row);
  }
  function metricRows(map, label) {
    return Array.from(map.values()).sort(function (a, b) { return a.key.localeCompare(b.key); }).map(function (row) {
      var result = Object.assign({}, row);
      result[label || 'label'] = row.key;
      result.rate = row.count ? row.makes / row.count : 0;
      result.percentage = result.rate * 100;
      delete result.key;
      return freeze(result);
    });
  }
  function buildDatasets(input, filters) {
    var data = input || {};
    var filter = normalizeFilters(filters);
    var flips = (data.flips || []).filter(function (record) { return matchesRecord(record, filter); });
    var matches = (data.matches || []).filter(function (record) { return matchesRecord(record, filter); });
    var rollups = [];
    (data.rollups || data.aggregates || []).forEach(function (cell) {
      if (cell.schema === 'MatchAggregateV1') return;
      filteredRollupSlices(cell, filter).forEach(function (slice) { rollups.push(slice); });
    });
    var contributions = flips.map(function (record) {
      return { timestamp: record.timestamp, dimensions: dimensionFor(record), flips: 1,
        makes: record.made ? 1 : 0, eventObserved: record.eventId ? 1 : 0,
        eventSuccesses: record.eventId && record.eventSuccess ? 1 : 0, rolledUp: false,
        uuid: record.uuid, sequence: record.sequence };
    }).concat(rollups.map(function (cell) {
      return { timestamp: cell.timestampEnd, dimensions: cell.dimensions || {}, flips: cell.flips || 0,
        makes: cell.makes || 0, eventObserved: cell.eventObserved || 0,
        eventSuccesses: cell.eventSuccesses || 0, rolledUp: true, uuid: cell.uuid, sequence: null,
        counters: cell.counters || {}, makeCounters: cell.makeCounters || {} };
    }));
    contributions.sort(function (a, b) { return a.timestamp - b.timestamp; });
    var cumulativeFlips = 0;
    var cumulativeMakes = 0;
    var cumulative = contributions.map(function (entry) {
      cumulativeFlips += entry.flips;
      cumulativeMakes += entry.makes;
      return freeze({ timestamp: entry.timestamp, flips: cumulativeFlips, makes: cumulativeMakes,
        fraction: cumulativeMakes + '/' + cumulativeFlips,
        rate: cumulativeFlips ? cumulativeMakes / cumulativeFlips : 0,
        percentage: cumulativeFlips ? cumulativeMakes / cumulativeFlips * 100 : 0 });
    });
    var sequence = flips.slice().sort(function (a, b) {
      return a.timestamp - b.timestamp || (a.sequence || 0) - (b.sequence || 0);
    }).map(function (record) {
      return freeze({ uuid: record.uuid, timestamp: record.timestamp, sequence: record.sequence,
        heat: record.heat, round: record.round, turn: record.turn,
        playerId: record.playerId, seat: record.seat, playerCount: record.playerCount,
        result: record.result, made: record.made, pose: record.pose,
        eventId: record.testData && !filter.includeTestEventNames ? null : record.eventId,
        objectId: record.objectId, variantId: record.variantId });
    });
    var heat = metricMap();
    var rotations = metricMap();
    var reasons = metricMap();
    var lives = metricMap();
    var stakes = metricMap();
    var streaks = metricMap();
    var events = new Map();
    var objects = metricMap();
    var livesTimeline = [];
    var stakeTimeline = [];
    var streakTimeline = [];
    contributions.forEach(function (entry) {
      var dim = entry.dimensions;
      if (entry.rolledUp && entry.counters) {
        function addCounterRows(group, target, extraForKey) {
          Object.keys(entry.counters[group] || {}).forEach(function (key) {
            metricAdd(target, key, entry.counters[group][key],
              entry.makeCounters[group] && entry.makeCounters[group][key], extraForKey ? extraForKey(key) : null);
          });
        }
        addCounterRows('powerDirection', heat, function (key) {
          var parts = key.split('|'); return { powerBucket: parts[0], direction: parts[1] === 'Unknown' ? null : Number(parts[1]) };
        });
        addCounterRows('rotations', rotations);
        addCounterRows('landingReasons', reasons);
        addCounterRows('lives', lives);
        addCounterRows('stakes', stakes);
        addCounterRows('streaks', streaks);
      } else {
        metricAdd(heat, (dim.powerBucket || 'Unknown') + '|' + (dim.direction == null ? 'Unknown' : dim.direction), entry.flips, entry.makes,
          { powerBucket: dim.powerBucket, direction: dim.direction });
        metricAdd(rotations, dim.rotationBucket, entry.flips, entry.makes);
        metricAdd(reasons, dim.landingReason, entry.flips, entry.makes);
        metricAdd(lives, dim.livesAfter, entry.flips, entry.makes);
        metricAdd(stakes, dim.stake, entry.flips, entry.makes);
        metricAdd(streaks, dim.streak, entry.flips, entry.makes);
      }
      metricAdd(objects, dim.objectId, entry.flips, entry.makes);
      if (dim.livesBefore != null || dim.livesAfter != null) livesTimeline.push(freeze({
        uuid: entry.uuid, timestamp: entry.timestamp, before: dim.livesBefore, after: dim.livesAfter,
        count: entry.flips, playerId: dim.playerId, seat: dim.seat, rolledUp: entry.rolledUp,
      }));
      if (dim.stakeBefore != null || dim.stakeAfter != null || dim.stake != null) stakeTimeline.push(freeze({
        uuid: entry.uuid, timestamp: entry.timestamp, before: dim.stakeBefore,
        after: firstValue(dim.stakeAfter, dim.stake), count: entry.flips,
        playerId: dim.playerId, rolledUp: entry.rolledUp,
      }));
      if (dim.streakBefore != null || dim.streakAfter != null || dim.streak != null) streakTimeline.push(freeze({
        uuid: entry.uuid, timestamp: entry.timestamp, before: dim.streakBefore,
        after: firstValue(dim.streakAfter, dim.streak), onFireBefore: dim.onFireBefore,
        onFireAfter: dim.onFireAfter, count: entry.flips, playerId: dim.playerId,
        rolledUp: entry.rolledUp,
      }));
      if (dim.eventId && entry.eventObserved > 0 && (!dim.testData || filter.includeTestEventNames)) {
        var eventRow = events.get(dim.eventId) || { eventId: dim.eventId, observed: 0, successes: 0 };
        eventRow.observed += entry.eventObserved;
        eventRow.successes += entry.eventSuccesses;
        events.set(dim.eventId, eventRow);
      }
    });
    var eventRows = Array.from(events.values()).sort(function (a, b) { return a.eventId.localeCompare(b.eventId); }).map(function (row) {
      row.fraction = row.successes + '/' + row.observed;
      row.observedFraction = row.observed + '/' + cumulativeFlips;
      row.frequency = cumulativeFlips ? row.observed / cumulativeFlips : 0;
      row.successRate = row.observed ? row.successes / row.observed : 0;
      row.frequencyPercent = row.frequency * 100;
      row.successPercent = row.successRate * 100;
      return freeze(row);
    });
    var cup = [];
    var team = [];
    matches.forEach(function (match) {
      if (match.mode === 'cup' || match.cup) cup.push(freeze({
        uuid: match.uuid, startedAt: match.startedAt, timestamp: match.timestamp, durationMs: match.durationMs,
        winnerIds: (match.winnerIds || []).slice(), heatSummaries: clone(match.heatSummaries || []),
        roundSummaries: clone(match.roundSummaries || []), totalFlips: match.totalFlips,
        heats: match.cup && (match.cup.heats || match.cup.heatWins) || null,
        shootoutRounds: match.cup && match.cup.shootoutRounds || 0,
      }));
      if (match.mode === 'team-clash' || match.mode === 'team' || match.team) team.push(freeze({
        uuid: match.uuid, startedAt: match.startedAt, timestamp: match.timestamp, durationMs: match.durationMs,
        winnerIds: (match.winnerIds || []).slice(), winnerTeamId: match.winnerTeamId,
        roundSummaries: clone(match.roundSummaries || []), teams: clone(match.teams || []),
        totalFlips: match.totalFlips,
        scores: match.team && (match.team.scores || match.team.teamScores) || null,
      }));
    });
    cup.sort(function (a, b) { return a.timestamp - b.timestamp; });
    team.sort(function (a, b) { return a.timestamp - b.timestamp; });
    var rotationRows = metricRows(rotations, 'rotations');
    var landingRows = metricRows(reasons, 'reason');
    var objectRows = metricRows(objects, 'objectId');
    var output = {
      cumulativeMakeRate: cumulative, sequenceStrip: sequence,
      powerDirectionHeatmap: metricRows(heat, 'cell'), rotations: rotationRows,
      landingReasons: landingRows, rotationLanding: freeze({ rotations: rotationRows, landingReasons: landingRows }),
      livesStake: freeze({ lives: metricRows(lives, 'lives'), stake: metricRows(stakes, 'stake'),
        livesTimeline: livesTimeline, stakeTimeline: stakeTimeline }),
      streaks: metricRows(streaks, 'streak'), streakTimeline: streakTimeline,
      observedEventFrequencySuccess: eventRows, events: eventRows,
      objects: objectRows, objectComparison: objectRows,
      cupTeam: freeze({ cup: cup, team: team, cupTimeline: cup, teamTimeline: team }),
    };
    return freeze(output);
  }

  function aggregateSummary(data, filters) {
    var filter = normalizeFilters(filters);
    var flips = 0, makes = 0, caps = 0, perfect = 0, upright = 0, events = 0;
    var onFireRuns = 0, bestStreak = 0, flightMsTotal = 0, flightMsCount = 0;
    var settleMsTotal = 0, settleMsCount = 0;
    (data.flips || []).forEach(function (record) {
      if (!matchesRecord(record, filter)) return;
      flips++; if (record.made) makes++; if (record.cap) caps++; if (record.perfect) perfect++;
      if (record.pose === 'upright') upright++;
      if (record.eventId && (!record.testData || filter.includeTestEventNames)) events++;
      if (record.onFireBefore !== true && record.onFireAfter === true) onFireRuns++;
      bestStreak = Math.max(bestStreak, Number(record.streakAfter) || 0);
      if (finite(record.flightMs, null) != null) { flightMsTotal += Number(record.flightMs); flightMsCount++; }
      if (finite(record.settleMs, null) != null) { settleMsTotal += Number(record.settleMs); settleMsCount++; }
    });
    (data.rollups || []).forEach(function (sourceCell) {
      filteredRollupSlices(sourceCell, filter).forEach(function (cell) {
      if (cell.schema === 'MatchAggregateV1') return;
      flips += cell.flips || 0; makes += cell.makes || 0; caps += cell.caps || 0; perfect += cell.perfect || 0;
      upright += cell.upright || 0;
      if (!cell.dimensions || !cell.dimensions.testData || filter.includeTestEventNames) events += cell.eventObserved || 0;
      onFireRuns += cell.onFireRuns || 0;
      bestStreak = Math.max(bestStreak, Number(cell.bestStreak) || 0);
      flightMsTotal += Number(cell.flightMsTotal) || 0; flightMsCount += Number(cell.flightMsCount) || 0;
      settleMsTotal += Number(cell.settleMsTotal) || 0; settleMsCount += Number(cell.settleMsCount) || 0;
      });
    });
    var matchedMatches = (data.matches || []).filter(function (record) { return matchesRecord(record, filter); });
    var matches = matchedMatches.length;
    var cups = matchedMatches.filter(function (record) { return record.mode === 'cup' || record.cup; }).length;
    var teamWins = matchedMatches.filter(function (record) {
      return (record.mode === 'team-clash' || record.mode === 'team' || record.team) &&
        (record.winnerTeamId != null || (record.winner && record.winner.teamId != null));
    }).length;
    (data.rollups || []).forEach(function (cell) {
      if (cell.schema !== 'MatchAggregateV1') return;
      filteredRollupSlices(cell, filter).forEach(function (slice) {
        matches += Number(slice.matches) || 0;
        cups += Number(slice.cups) || 0;
        teamWins += Number(slice.teamWins) || 0;
      });
    });
    return freeze({ flips: flips, makes: makes, misses: Math.max(0, flips - makes), makeRate: flips ? makes / flips : 0,
      makePercentage: flips ? makes / flips * 100 : 0,
      fraction: makes + '/' + flips, sampleSize: flips,
      upright: upright, caps: caps, perfect: perfect,
      bestStreak: bestStreak, onFireRuns: onFireRuns, matches: matches,
      cups: cups, teamWins: teamWins, events: events,
      averageFlightMs: flightMsCount ? flightMsTotal / flightMsCount : 0,
      averageSettleMs: settleMsCount ? settleMsTotal / settleMsCount : 0 });
  }

  function requestPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('IndexedDB request failed')); };
    });
  }
  function transactionPromise(transaction) {
    return new Promise(function (resolve, reject) {
      transaction.oncomplete = function () { resolve(); };
      transaction.onabort = transaction.onerror = function () {
        reject(transaction.error || new Error('IndexedDB transaction failed'));
      };
    });
  }
  function createIndexedDBBackend(indexedDB, options) {
    var opts = options || {};
    var database = null;
    function open() {
      if (!indexedDB || typeof indexedDB.open !== 'function') return Promise.reject(new Error('IndexedDB unavailable'));
      if (database) return Promise.resolve(database);
      return new Promise(function (resolve, reject) {
        var request = indexedDB.open(opts.dbName || DB_NAME, opts.dbVersion || DB_VERSION);
        request.onupgradeneeded = function () {
          var db = request.result;
          if (!db.objectStoreNames.contains('flips')) db.createObjectStore('flips', { keyPath: 'uuid' });
          if (!db.objectStoreNames.contains('matches')) db.createObjectStore('matches', { keyPath: 'uuid' });
          if (!db.objectStoreNames.contains('rollups')) db.createObjectStore('rollups', { keyPath: 'uuid' });
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
          if (!db.objectStoreNames.contains('seen')) db.createObjectStore('seen', { keyPath: 'uuid' });
        };
        request.onsuccess = function () { database = request.result; resolve(database); };
        request.onerror = function () { reject(request.error || new Error('Unable to open statistics database')); };
        request.onblocked = function () { reject(new Error('Statistics database upgrade blocked')); };
      });
    }
    function load() {
      return open().then(function (db) {
        var tx = db.transaction(['flips', 'matches', 'rollups', 'meta', 'seen'], 'readonly');
        var requests = ['flips', 'matches', 'rollups', 'meta', 'seen'].map(function (name) {
          return requestPromise(tx.objectStore(name).getAll());
        });
        return Promise.all(requests).then(function (values) {
          return { flips: values[0], matches: values[1], rollups: values[2], meta: values[3], seen: values[4] };
        });
      });
    }
    function commit(operation) {
      return open().then(function (db) {
        var tx = db.transaction(['flips', 'matches', 'rollups', 'meta', 'seen'], 'readwrite');
        (operation.deleteFlipIds || []).forEach(function (uuid) { tx.objectStore('flips').delete(uuid); });
        (operation.deleteMatchIds || []).forEach(function (uuid) { tx.objectStore('matches').delete(uuid); });
        (operation.deleteRollupIds || []).forEach(function (uuid) { tx.objectStore('rollups').delete(uuid); });
        (operation.deleteMetaKeys || []).forEach(function (key) { tx.objectStore('meta').delete(key); });
        (operation.deleteSeenIds || []).forEach(function (uuid) { tx.objectStore('seen').delete(uuid); });
        (operation.putFlips || []).forEach(function (record) { tx.objectStore('flips').put(clone(record)); });
        (operation.putMatches || []).forEach(function (record) { tx.objectStore('matches').put(clone(record)); });
        (operation.putRollups || []).forEach(function (record) { tx.objectStore('rollups').put(clone(record)); });
        (operation.putMeta || []).forEach(function (record) { tx.objectStore('meta').put(clone(record)); });
        (operation.putSeen || []).forEach(function (record) { tx.objectStore('seen').put(clone(record)); });
        return transactionPromise(tx);
      });
    }
    function close() { if (database) database.close(); database = null; }
    return { kind: 'indexeddb', load: load, commit: commit, close: close };
  }
  function createMemoryBackend(seed, options) {
    var initial = seed || {};
    var opts = options || {};
    var data = {
      flips: new Map((initial.flips || []).map(function (row) { return [row.uuid, clone(row)]; })),
      matches: new Map((initial.matches || []).map(function (row) { return [row.uuid, clone(row)]; })),
      rollups: new Map((initial.rollups || []).map(function (row) { return [row.uuid, clone(row)]; })),
      meta: new Map((initial.meta || []).map(function (row) { return [row.key, clone(row)]; })),
      seen: new Map((initial.seen || []).map(function (row) { return [row.uuid, clone(row)]; })),
    };
    var commits = 0;
    function load() {
      return Promise.resolve({ flips: Array.from(data.flips.values()).map(clone),
        matches: Array.from(data.matches.values()).map(clone), rollups: Array.from(data.rollups.values()).map(clone),
        meta: Array.from(data.meta.values()).map(clone), seen: Array.from(data.seen.values()).map(clone) });
    }
    function commit(operation) {
      commits++;
      if (opts.failCommit === true || (typeof opts.failCommit === 'function' && opts.failCommit(commits, operation))) {
        return Promise.reject(new Error('Injected transaction failure'));
      }
      var next = { flips: new Map(data.flips), matches: new Map(data.matches),
        rollups: new Map(data.rollups), meta: new Map(data.meta), seen: new Map(data.seen) };
      (operation.deleteFlipIds || []).forEach(function (uuid) { next.flips.delete(uuid); });
      (operation.deleteMatchIds || []).forEach(function (uuid) { next.matches.delete(uuid); });
      (operation.deleteRollupIds || []).forEach(function (uuid) { next.rollups.delete(uuid); });
      (operation.deleteMetaKeys || []).forEach(function (key) { next.meta.delete(key); });
      (operation.deleteSeenIds || []).forEach(function (uuid) { next.seen.delete(uuid); });
      (operation.putFlips || []).forEach(function (row) { next.flips.set(row.uuid, clone(row)); });
      (operation.putMatches || []).forEach(function (row) { next.matches.set(row.uuid, clone(row)); });
      (operation.putRollups || []).forEach(function (row) { next.rollups.set(row.uuid, clone(row)); });
      (operation.putMeta || []).forEach(function (row) { next.meta.set(row.key, clone(row)); });
      (operation.putSeen || []).forEach(function (row) { next.seen.set(row.uuid, clone(row)); });
      data = next;
      return Promise.resolve();
    }
    return { kind: 'memory', load: load, commit: commit, close: function () {}, dump: load };
  }

  function readJson(storage, key) {
    if (!storage) return null;
    try { return JSON.parse(storage.getItem(key)); } catch (_) { return null; }
  }
  function legacyAggregate(legacy, deviceId) {
    var source = legacy && typeof legacy === 'object' ? legacy : {};
    var totalFlips = Math.max(0, integer(source.totalFlips, 0));
    var totalMakes = Math.min(totalFlips, Math.max(0, integer(source.totalMakes, 0)));
    if (!totalFlips && !totalMakes) return null;
    var dimensions = { day: null, sessionId: null, deviceId: deviceId, scope: 'device', mode: null,
      online: false, practice: false, testData: false, playerId: null, displayName: null, isAI: false,
      teamId: null, result: null, pose: null, landingReason: null, eventId: null, eventSuccess: null,
      objectId: null, variantId: null, powerBucket: null, direction: null, rotationBucket: null,
      livesBefore: null, livesAfter: null, stake: null, streak: null, cupHeat: null };
    return freeze({ schema: 'FlipAggregateV1', version: 1, uuid: stableUuid('legacy-rollup', deviceId),
      key: dimensionKey(dimensions), source: 'legacy-records', timestampStart: null, timestampEnd: null,
      dimensions: dimensions, flips: totalFlips, makes: totalMakes,
      caps: Math.max(0, integer(source.capLands, 0)), perfect: 0, eventObserved: 0, eventSuccesses: 0,
      bestStreak: Math.max(0, finite(source.bestStreak, 0)), highestStake: Math.max(0, finite(source.highestStake, 0)) });
  }

  function cleanInternal(value) {
    if (Array.isArray(value)) return value.map(cleanInternal);
    if (!value || typeof value !== 'object') return value;
    var output = {};
    Object.keys(value).forEach(function (key) {
      if (key.charAt(0) !== '_') output[key] = cleanInternal(value[key]);
    });
    return output;
  }
  function cleanRollupInternal(row, preserveSourceId) {
    var output = cleanInternal(row);
    if (preserveSourceId && row && row._sourceRollupId) output.uuid = row._sourceRollupId;
    return output;
  }
  function contributionCount(data) {
    var total = (data.flips || []).length + (data.matches || []).length;
    (data.rollups || []).forEach(function (row) {
      total += row.schema === 'MatchAggregateV1' ? Math.max(0, integer(row.matches, 0))
        : Math.max(0, integer(row.flips, 0));
    });
    return total;
  }
  function collectOpenDictionaries(data) {
    var dictionaries = emptyOpenDictionaries();
    function collect(entry) {
      if (!entry || typeof entry !== 'object') return;
      Object.keys(OPEN_ID_LIMITS).forEach(function (key) {
        var value = entry[key];
        if (value != null && value !== 'other' && value !== ROLLUP_UNKNOWN &&
            dictionaries[key].size < OPEN_ID_LIMITS[key] && ROLLUP_ID_RE.test(String(value))) {
          dictionaries[key].add(String(value));
        }
      });
    }
    (data.flips || []).forEach(collect);
    (data.matches || []).forEach(function (row) {
      collect(row); (row.players || row.participants || []).forEach(collect);
    });
    (data.rollups || []).forEach(function (row) {
      collect(row.dimensions || {});
      (Array.isArray((row.dimensions || {}).participants) ? row.dimensions.participants : []).forEach(collect);
      (row.index || []).forEach(function (slice) {
        collect(slice.dimensions || {});
        (Array.isArray((slice.dimensions || {}).participants) ? slice.dimensions.participants : []).forEach(collect);
      });
    });
    return dictionaries;
  }
  function exportDocument(data, options) {
    var opts = options || {};
    var filter = normalizeFilters(Object.assign({}, opts, opts.filters || {}));
    var flips = (data.flips || []).filter(function (row) { return matchesRecord(row, filter); })
      .map(function (row) { return sanitizeNamesDeep(cleanInternal(row)); });
    var matches = (data.matches || []).filter(function (row) { return matchesRecord(row, filter); })
      .map(function (row) { return sanitizeNamesDeep(cleanInternal(row)); });
    var rollups = (data.rollups || []).map(function (row) { return projectRollupCell(row, filter); })
      .filter(Boolean).map(function (row) {
        return sanitizeNamesDeep(cleanRollupInternal(row, opts.preserveSourceRollupIds === true));
      });
    var output = { schema: EXPORT_SCHEMA, version: 1 };
    if (opts.sourceArchiveId != null) {
      var archiveId = String(opts.sourceArchiveId);
      if (!ROLLUP_ID_RE.test(archiveId)) throw new TypeError('Invalid statistics source archive');
      var snapshotSequence = Math.max(0, integer(opts.snapshotSequence,
        contributionCount({ flips: flips, matches: matches, rollups: rollups })));
      var snapshotBody = JSON.stringify({ flips: flips, matches: matches, rollups: rollups });
      output.sourceArchiveId = archiveId;
      output.snapshotSequence = snapshotSequence;
      output.snapshotId = String(opts.snapshotId || stableUuid('stats-snapshot', archiveId + '|' +
        snapshotSequence + '|' + snapshotBody));
      output.dictionaries = dictionariesDocument(opts.dictionaries ||
        collectOpenDictionaries({ flips: flips, matches: matches, rollups: rollups }));
    }
    output.exportedAt = timestamp(opts.exportedAt, Date.now());
    output.flips = flips; output.matches = matches; output.rollups = rollups;
    return freeze(output);
  }
  function exportJSON(data, options) { return JSON.stringify(exportDocument(data, options)); }
  function assertSafeImportObject(value) {
    if (!value || typeof value !== 'object') return;
    Object.keys(value).forEach(function (key) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
        throw new TypeError('Unsafe .flipstats.json key');
      }
      assertSafeImportObject(value[key]);
    });
  }
  function plainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }
  function aggregateInteger(value, label, maximum) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > maximum) {
      throw new TypeError('Invalid aggregate ' + label);
    }
    return value;
  }
  function aggregateFinite(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 ||
        value > Number.MAX_SAFE_INTEGER) throw new TypeError('Invalid aggregate ' + label);
    return value;
  }
  function validateAggregateCounters(counters, parentCount, label) {
    if (counters == null) return;
    if (!plainObject(counters) || Object.keys(counters).length > 16) {
      throw new TypeError('Invalid aggregate ' + label);
    }
    Object.keys(counters).forEach(function (group) {
      var bucket = counters[group];
      if (!ROLLUP_ID_RE.test(group) || !plainObject(bucket) || Object.keys(bucket).length > 32) {
        throw new TypeError('Invalid aggregate ' + label);
      }
      var total = 0;
      Object.keys(bucket).forEach(function (key) {
        if (!key || key.length > 64) throw new TypeError('Invalid aggregate ' + label);
        total += aggregateInteger(bucket[key], label + '.' + group, parentCount);
      });
      if (total > parentCount) throw new TypeError('Invalid aggregate ' + label);
    });
  }
  function closeAggregateNumber(actual, expected) {
    return Math.abs(actual - expected) <= Math.max(0.000001, Math.abs(expected) * 1e-12);
  }
  function validateAggregateDimensions(dimensions) {
    if (!plainObject(dimensions) || JSON.stringify(dimensions).length > 65536) {
      throw new TypeError('Invalid aggregate dimensions');
    }
  }
  function validateFlipAggregateBody(row, indexed) {
    validateAggregateDimensions(row.dimensions);
    var flips = aggregateInteger(row.flips, 'flips', MAX_AGGREGATE_COUNT);
    ['makes','caps','perfect','upright','eventObserved','eventSuccesses','onFireRuns',
      'flightMsCount','settleMsCount'].forEach(function (key) {
      if (row[key] != null) aggregateInteger(row[key], key, flips);
    });
    if ((row.makes || 0) > flips || (row.caps || 0) > flips || (row.perfect || 0) > flips ||
        (row.eventSuccesses || 0) > (row.eventObserved || 0)) {
      throw new TypeError('Invalid aggregate flip counters');
    }
    ['flightMsTotal','settleMsTotal','bestStreak'].forEach(function (key) {
      if (row[key] != null) aggregateFinite(row[key], key);
    });
    validateAggregateCounters(row.counters, flips, 'counters');
    validateAggregateCounters(row.makeCounters, row.makes || 0, 'makeCounters');
    if (indexed && (row.index != null || row.overflow === true)) {
      if (row.index != null && !Array.isArray(row.index)) throw new TypeError('Invalid aggregate index');
    }
  }
  function validateMatchAggregateBody(row, indexed) {
    validateAggregateDimensions(row.dimensions);
    var matches = aggregateInteger(row.matches, 'matches', MAX_AGGREGATE_COUNT);
    ['cups','teamMatches','teamWins'].forEach(function (key) {
      if (row[key] != null) aggregateInteger(row[key], key, matches);
    });
    if ((row.cups || 0) > matches || (row.teamMatches || 0) > matches ||
        (row.teamWins || 0) > (row.teamMatches || 0)) {
      throw new TypeError('Invalid aggregate match counters');
    }
    if (indexed && row.index != null && !Array.isArray(row.index)) {
      throw new TypeError('Invalid aggregate index');
    }
  }
  function validateAggregateIndex(row, bodyValidator, numericKeys) {
    if (row.index == null) return;
    if (!Array.isArray(row.index) || row.index.length > MAX_AGGREGATE_INDEX_ENTRIES) {
      throw new TypeError('Invalid aggregate index');
    }
    var keys = new Set();
    var sums = {};
    numericKeys.forEach(function (key) { sums[key] = 0; });
    row.index.forEach(function (entry) {
      if (!plainObject(entry) || entry.index != null || entry.overflow === true) {
        throw new TypeError('Invalid aggregate index entry');
      }
      bodyValidator(entry, false);
      var key = dimensionKey(entry.dimensions);
      if (keys.has(key)) throw new TypeError('Duplicate aggregate index entry');
      keys.add(key);
      numericKeys.forEach(function (field) { sums[field] += Number(entry[field]) || 0; });
    });
    numericKeys.forEach(function (key) {
      if (!closeAggregateNumber(sums[key], Number(row[key]) || 0)) {
        throw new TypeError('Aggregate index total mismatch');
      }
    });
  }
  function validateImportedAggregates(document) {
    if (document.rollups.length > MAX_AGGREGATE_INDEX_ENTRIES) {
      throw new TypeError('Too many aggregate rows');
    }
    var indexesByDay = new Map();
    document.rollups.forEach(function (row) {
      if (!plainObject(row) || !UUID_RE.test(String(row.uuid || ''))) {
        throw new TypeError('Invalid aggregate record');
      }
      if (row.schema === 'FlipAggregateV1') {
        if (typeof row.version !== 'number' || [1, 2, 3].indexOf(row.version) < 0) {
          throw new TypeError('Unsupported FlipAggregateV1 version');
        }
        validateFlipAggregateBody(row, true);
        validateAggregateIndex(row, validateFlipAggregateBody, [
          'flips','makes','caps','perfect','upright','eventObserved','eventSuccesses','onFireRuns',
          'flightMsTotal','flightMsCount','settleMsTotal','settleMsCount',
        ]);
      } else if (row.schema === 'MatchAggregateV1') {
        if (typeof row.version !== 'number' || [1, 2].indexOf(row.version) < 0) {
          throw new TypeError('Unsupported MatchAggregateV1 version');
        }
        validateMatchAggregateBody(row, true);
        validateAggregateIndex(row, validateMatchAggregateBody,
          ['matches','cups','teamMatches','teamWins']);
      } else {
        throw new TypeError('Unsupported aggregate schema');
      }
      if (Array.isArray(row.index)) {
        var day = String((row.dimensions || {}).day);
        var indexCount = (indexesByDay.get(day) || 0) + row.index.length;
        if (indexCount > MAX_AGGREGATE_INDEX_ENTRIES) throw new TypeError('Aggregate index capacity exceeded');
        indexesByDay.set(day, indexCount);
      }
    });
  }
  function parseImportJSON(input) {
    var document = typeof input === 'string' ? JSON.parse(input) : clone(input);
    assertSafeImportObject(document);
    if (!document || document.schema !== EXPORT_SCHEMA || document.version !== 1 ||
        !Array.isArray(document.flips) || !Array.isArray(document.matches) || !Array.isArray(document.rollups)) {
      throw new TypeError('Invalid .flipstats.json document');
    }
    validateImportedAggregates(document);
    var hasLineage = document.sourceArchiveId != null || document.snapshotSequence != null || document.snapshotId != null;
    if (hasLineage) {
      if (!ROLLUP_ID_RE.test(String(document.sourceArchiveId || '')) ||
          !Number.isInteger(Number(document.snapshotSequence)) || Number(document.snapshotSequence) < 0 ||
          !ROLLUP_ID_RE.test(String(document.snapshotId || ''))) {
        throw new TypeError('Invalid .flipstats.json snapshot lineage');
      }
      document.sourceArchiveId = String(document.sourceArchiveId);
      document.snapshotSequence = Number(document.snapshotSequence);
      document.snapshotId = String(document.snapshotId);
      document.dictionaries = dictionariesDocument(document.dictionaries || {});
    }
    return sanitizeNamesDeep(document);
  }
  function csvCell(value) {
    var raw = value == null ? '' : (typeof value === 'object' ? JSON.stringify(value) : String(value));
    if (/^[=+\-@]/.test(raw)) raw = "'" + raw;
    return '"' + raw.replace(/"/g, '""').replace(/[\r\n]+/g, ' ') + '"';
  }
  function csv(rows, columns) {
    return [columns.map(csvCell).join(',')].concat(rows.map(function (row) {
      return columns.map(function (column) { return csvCell(row[column]); }).join(',');
    })).join('\r\n');
  }
  function playerAliases(data) {
    var ids = new Set();
    (data.flips || []).forEach(function (row) { if (row.playerId != null) ids.add(String(row.playerId)); });
    (data.matches || []).forEach(function (row) {
      (row.players || []).forEach(function (player) { if (player.playerId != null) ids.add(String(player.playerId)); });
    });
    var aliases = new Map();
    Array.from(ids).sort().forEach(function (id, index) { aliases.set(id, 'Player ' + (index + 1)); });
    return aliases;
  }
  function pseudonymizePlayers(value, aliases, keyHint) {
    if (Array.isArray(value)) {
      if (/^(playerIds|winnerIds|memberIds)$/.test(keyHint || '')) {
        return value.map(function (id) { return aliases.get(String(id)) || 'Player'; });
      }
      return value.map(function (item) { return pseudonymizePlayers(item, aliases, keyHint); });
    }
    if (!value || typeof value !== 'object') {
      if (/^(playerId|winnerId|targetPlayerId|sourcePlayerId)$/.test(keyHint || '')) {
        return aliases.get(String(value)) || 'Player';
      }
      if (/^(displayName|playerName|name)$/.test(keyHint || '')) return 'Player';
      return value;
    }
    var output = {};
    Object.keys(value).forEach(function (key) { output[key] = pseudonymizePlayers(value[key], aliases, key); });
    return output;
  }
  function exportCSV(data, type, options) {
    var opts = options || {};
    var filter = normalizeFilters(Object.assign({}, opts, opts.filters || {}));
    var source = {
      flips: (data.flips || []).filter(function (row) { return matchesRecord(row, filter); })
        .map(function (row) { return sanitizeNamesDeep(row); }),
      matches: (data.matches || []).filter(function (row) { return matchesRecord(row, filter); })
        .map(function (row) { return sanitizeNamesDeep(row); }),
      rollups: (data.rollups || []).map(function (row) { return projectRollupCell(row, filter); })
        .filter(Boolean).map(function (row) { return sanitizeNamesDeep(row); }),
    };
    var aliases = playerAliases(source);
    var showName = function (id, name) { return opts.includeNames === true ? safeName(name, 'Player') : (aliases.get(String(id)) || 'Player'); };
    if (type === 'flip') {
      var flipColumns = ['schema','version','releaseVersion','uuid','timestamp','sessionId','deviceId','matchId','sequence',
        'scope','mode','heat','round','turn','playerCount','playerId','player','playerIndex','seat','isAI','teamId',
        'result','pose','landingReason','perfect','cap','power','direction','rotations','contacts','bounces','banks',
        'flightMs','firstContactMs','settleMs','stakeBefore','stakeAfter','livesBefore','livesAfter','streakBefore',
        'streakAfter','onFireBefore','onFireAfter','suddenDeathBefore','suddenDeathAfter','eventId','eventSuccess',
        'oddsProfile','eventSeed','trajectorySeed','appliedReward','appliedEffect','objectId','variantId','cosmeticId',
        'arenaId','viewport','performance','online','practice','forced','testData'];
      return csv(source.flips.map(function (row) { return Object.assign({},
        opts.includeNames === true ? row : pseudonymizePlayers(row, aliases),
        { playerId: opts.includeNames === true ? row.playerId : (aliases.get(String(row.playerId)) || 'Player'),
          player: showName(row.playerId, row.displayName) }); }), flipColumns);
    }
    if (type === 'match') {
      var matchColumns = ['schema','version','releaseVersion','uuid','startedAt','timestamp','durationMs','sessionId','deviceId',
        'matchId','scope','mode','arenaId','viewport','online','practice','playerCount','completed','completionReason',
        'winnerId','winnerIds','winnerTeamId','participants','teams','heatSummaries','roundSummaries','totalFlips',
        'eventCounts','startingSettings','cup','team','stats','testData'];
      return csv(source.matches.map(function (row) { return Object.assign({},
        opts.includeNames === true ? row : pseudonymizePlayers(row, aliases), {
        participants: (row.participants || row.players || []).map(function (player) {
          return showName(player.playerId, player.displayName);
        }).join('|'),
        winnerId: opts.includeNames === true ? row.winnerId : (aliases.get(String(row.winnerId)) || (row.winnerId == null ? '' : 'Player')),
        winnerIds: (row.winnerIds || []).map(function (id) { return opts.includeNames === true ? id : (aliases.get(String(id)) || 'Player'); }).join('|'),
      }); }), matchColumns);
    }
    if (type === 'player') {
      var byPlayer = new Map();
      source.flips.forEach(function (row) {
        var key = String(row.playerId);
        var item = byPlayer.get(key) || { playerId: opts.includeNames === true ? key : aliases.get(key), player: showName(key, row.displayName), flips: 0, makes: 0, matches: 0 };
        item.flips++; if (row.made) item.makes++; byPlayer.set(key, item);
      });
      source.matches.forEach(function (match) {
        (match.players || []).forEach(function (player) {
          var key = String(player.playerId);
          var item = byPlayer.get(key) || { playerId: opts.includeNames === true ? key : aliases.get(key), player: showName(key, player.displayName), flips: 0, makes: 0, matches: 0 };
          item.matches++; byPlayer.set(key, item);
        });
      });
      var playerRows = Array.from(byPlayer.values()).map(function (row) { row.makeRate = row.flips ? row.makes / row.flips : 0; return row; });
      return csv(playerRows, ['playerId','player','flips','makes','makeRate','matches']);
    }
    if (type === 'event') {
      return csv(buildDatasets(source, { includeTestData: true }).events,
        ['eventId','observed','successes','fraction','observedFraction','frequency','frequencyPercent','successRate','successPercent']);
    }
    throw new RangeError('CSV type must be flip, match, player, or event');
  }

  function createStore(options) {
    var opts = options || {};
    var now = typeof opts.now === 'function' ? opts.now : Date.now;
    var localStorage = opts.localStorage || null;
    if (!localStorage && root) { try { localStorage = root.localStorage || null; } catch (_) {} }
    var storedDeviceId = null;
    if (localStorage) { try { storedDeviceId = localStorage.getItem(DEVICE_KEY); } catch (_) {} }
    var generatedDeviceId = stableUuid('device', [text(opts.deviceSeed, 'device'), now(), ++instanceSequence].join('|'));
    var deviceId = text(opts.deviceId, text(storedDeviceId, generatedDeviceId));
    if (!opts.deviceId && !storedDeviceId && localStorage) {
      try { localStorage.setItem(DEVICE_KEY, deviceId); } catch (_) {}
    }
    var sessionId = text(opts.sessionId, stableUuid('session', [deviceId, now(), ++instanceSequence].join('|')));
    var localArchiveId = stableUuid('stats-archive', deviceId);
    var recordSequence = 0;
    var maxRaw = Math.max(1, integer(opts.maxRawFlips, MAX_RAW_FLIPS));
    var indexedDB = opts.indexedDB !== undefined ? opts.indexedDB : (root && root.indexedDB);
    var lacksIndexedDB = !opts.backend && !indexedDB;
    var backend = opts.backend || (indexedDB ? createIndexedDBBackend(indexedDB, opts) : createMemoryBackend());
    var usingFallback = lacksIndexedDB;
    var closed = false;
    var state = { flips: [], matches: [], rollups: [], meta: [], seen: [] };
    var errors = [];
    var warningListeners = [];
    var warning = usingFallback ? FALLBACK_WARNING : null;

    function report(error) {
      errors.push(error);
      if (error && error.code === 'stats-aggregate-capacity') {
        warning = AGGREGATE_CAPACITY_WARNING;
        publishWarning();
      }
      if (typeof opts.onError === 'function') { try { opts.onError(error); } catch (_) {} }
    }
    function publishWarning() {
      if (!warning) return;
      var detail = freeze(clone(warning));
      warningListeners.slice().forEach(function (listener) {
        Promise.resolve().then(function () { try { listener(detail); } catch (_) {} });
      });
      if (root && typeof root.dispatchEvent === 'function' && typeof root.CustomEvent === 'function') {
        Promise.resolve().then(function () {
          try { root.dispatchEvent(new root.CustomEvent('flipgame:stats-warning', { detail: detail })); } catch (_) {}
        });
      }
    }
    function fallbackState() {
      var current = aggregateRecords(state.flips, { prefix: 'fallback-' + deviceId, existing: state.rollups });
      current = aggregateMatches(state.matches, { prefix: 'fallback-matches-' + deviceId, existing: current });
      return { schema: 'FlipStatsFallbackV1', version: 1, rollups: current.map(clone),
        seen: state.seen.map(clone), meta: state.meta.map(clone), savedAt: now() };
    }
    function persistFallback() {
      if (!localStorage) return;
      try { localStorage.setItem(FALLBACK_KEY, JSON.stringify(fallbackState())); } catch (error) { report(error); }
    }
    function activateFallback(error, deferPersist) {
      if (error) report(error);
      usingFallback = true;
      warning = FALLBACK_WARNING;
      backend = createMemoryBackend(state);
      if (!deferPersist) persistFallback();
      publishWarning();
    }
    function normalizeLoaded(loaded) {
      state.flips = (loaded.flips || []).map(function (row) { return normalizeFlipRecord(row, context()); });
      state.matches = (loaded.matches || []).map(function (row) { return normalizeMatchRecord(row, context()); });
      var loadedRollups = (loaded.rollups || []).map(function (row) { return freeze(clone(row)); });
      state.rollups = enforceRollupCellBudget(loadedRollups, 'retention');
      state.meta = (loaded.meta || []).map(function (row) { return freeze(clone(row)); });
      var seenMap = new Map((loaded.seen || []).map(function (row) { return [row.uuid, row]; }));
      state.flips.forEach(function (row) {
        if (!seenMap.has(row.uuid)) seenMap.set(row.uuid, { uuid: row.uuid, kind: 'flip' });
      });
      state.matches.forEach(function (row) {
        if (!seenMap.has(row.uuid)) seenMap.set(row.uuid, { uuid: row.uuid, kind: 'match' });
      });
      state.seen = Array.from(seenMap.values()).map(function (row) { return freeze(clone(row)); });
      var nextIds = new Set(state.rollups.map(function (row) { return row.uuid; }));
      var previous = new Map(loadedRollups.map(function (row) { return [row.uuid, JSON.stringify(row)]; }));
      return {
        putRollups: state.rollups.filter(function (row) { return previous.get(row.uuid) !== JSON.stringify(row); }),
        deleteRollupIds: loadedRollups.filter(function (row) { return !nextIds.has(row.uuid); })
          .map(function (row) { return row.uuid; }),
      };
    }
    function context() {
      return { now: now, deviceId: deviceId, sessionId: sessionId,
        nextRecordId: function () { return ++recordSequence; } };
    }
    function hydrateLocalFallback() {
      var saved = readJson(localStorage, FALLBACK_KEY);
      if (saved && saved.schema === 'FlipStatsFallbackV1' && Array.isArray(saved.rollups)) {
        state.rollups = enforceRollupCellBudget(saved.rollups.map(function (row) { return freeze(row); }), 'retention');
        state.seen = (saved.seen || []).map(function (row) { return freeze(row); });
        state.meta = (saved.meta || []).map(function (row) { return freeze(row); });
      }
    }
    function migrateLegacy() {
      if (state.meta.some(function (row) { return row.key === 'legacy-migrated'; })) return Promise.resolve();
      var legacy = opts.legacyRecords;
      if (!legacy && localStorage) legacy = readJson(localStorage, 'flipgame.records.v2') || readJson(localStorage, 'flipgame.records.v1');
      var rollup = legacyAggregate(legacy, deviceId);
      var marker = freeze({ key: 'legacy-migrated', value: true, timestamp: now() });
      var operation = { putRollups: rollup ? [rollup] : [], putMeta: [marker] };
      return backend.commit(operation).then(function () {
        if (rollup) state.rollups.push(rollup);
        state.meta.push(marker);
      }).catch(function (error) {
        if (rollup) state.rollups.push(rollup);
        state.meta.push(marker);
        activateFallback(error);
      });
    }
    var ready = backend.load().then(function (loaded) {
      var normalization = normalizeLoaded(loaded);
      if (lacksIndexedDB) hydrateLocalFallback();
      if (!lacksIndexedDB && (normalization.putRollups.length || normalization.deleteRollupIds.length)) {
        return backend.commit(normalization).catch(function (error) { activateFallback(error); });
      }
    }).catch(function (error) {
      activateFallback(error, true); hydrateLocalFallback();
    }).then(migrateLegacy).then(function () {
      if (usingFallback) { persistFallback(); publishWarning(); }
    });
    var queue = ready;
    function enqueue(work) {
      var result = queue.then(function () {
        if (closed) throw new Error('Statistics store is closed');
        return work();
      });
      queue = result.catch(function () {});
      return result.catch(function (error) { report(error); return { stored: false, error: 'storage-unavailable' }; });
    }
    function operationForFlip(record) {
      if (state.seen.some(function (row) { return row.uuid === record.uuid; })) return null;
      var nextFlips = state.flips.concat([record]).sort(function (a, b) { return a.timestamp - b.timestamp || a.uuid.localeCompare(b.uuid); });
      var remove = nextFlips.length > maxRaw ? nextFlips.slice(0, nextFlips.length - maxRaw) : [];
      var keep = remove.length ? nextFlips.slice(remove.length) : nextFlips;
      var rollups;
      try {
        rollups = remove.length ? aggregateRecords(remove, { prefix: 'retention', existing: state.rollups }) : state.rollups.slice();
      } catch (error) {
        if (!error || error.code !== 'stats-aggregate-capacity') throw error;
        // Keep the raw evidence and the last consistent aggregate snapshot. The
        // warning tells the UI storage needs attention; no count is coarsened.
        report(error); remove = []; keep = nextFlips; rollups = state.rollups.slice();
      }
      var previousRollups = new Map(state.rollups.map(function (row) { return [row.uuid, JSON.stringify(row)]; }));
      var changedRollups = remove.length ? rollups.filter(function (row) {
        return row.schema === 'FlipAggregateV1' && previousRollups.get(row.uuid) !== JSON.stringify(row);
      }) : [];
      var nextRollupIds = new Set(rollups.map(function (row) { return row.uuid; }));
      var deletedRollupIds = remove.length ? state.rollups.filter(function (row) {
        return row.schema === 'FlipAggregateV1' && !nextRollupIds.has(row.uuid);
      }).map(function (row) { return row.uuid; }) : [];
      var seen = freeze({ uuid: record.uuid, kind: 'flip' });
      return { state: { flips: keep, matches: state.matches.slice(), rollups: rollups, meta: state.meta.slice(), seen: state.seen.concat([seen]) },
        db: { putFlips: [record], deleteFlipIds: remove.map(function (row) { return row.uuid; }),
          putRollups: changedRollups, deleteRollupIds: deletedRollupIds, putSeen: [seen] } };
    }
    function operationForMatch(record) {
      if (state.seen.some(function (row) { return row.uuid === record.uuid; })) return null;
      var seen = freeze({ uuid: record.uuid, kind: 'match' });
      return { state: { flips: state.flips.slice(), matches: state.matches.concat([record]), rollups: state.rollups.slice(), meta: state.meta.slice(), seen: state.seen.concat([seen]) },
        db: { putMatches: [record], putSeen: [seen] } };
    }
    function commitMutation(operation, kind, uuid) {
      if (!operation) return Promise.resolve({ stored: false, duplicate: true, uuid: uuid });
      if (usingFallback) {
        state = operation.state; persistFallback();
        return backend.commit(operation.db).catch(report).then(function () { return { stored: true, fallback: true, uuid: uuid }; });
      }
      return backend.commit(operation.db).then(function () {
        state = operation.state;
        return { stored: true, fallback: false, uuid: uuid, kind: kind };
      }).catch(function (error) {
        state = operation.state; activateFallback(error);
        return { stored: true, fallback: true, uuid: uuid, kind: kind };
      });
    }
    function recordFlip(input) {
      var record = normalizeFlipRecord(input, context());
      return enqueue(function () { return commitMutation(operationForFlip(record), 'flip', record.uuid); });
    }
    function recordMatch(input) {
      var record = normalizeMatchRecord(input, context());
      return enqueue(function () { return commitMutation(operationForMatch(record), 'match', record.uuid); });
    }
    function filteredData(filters) {
      var source = Object.assign({}, filters || {}, { currentSessionId: sessionId, currentDeviceId: deviceId });
      var filter = normalizeFilters(source);
      return { flips: state.flips.filter(function (row) { return matchesRecord(row, filter); }).map(clone),
        matches: state.matches.filter(function (row) { return matchesRecord(row, filter); }).map(clone),
        rollups: state.rollups.map(function (row) { return projectRollupCell(row, filter); })
          .filter(Boolean).map(clone) };
    }
    function query(filters) { return queue.then(function () { return freeze(filteredData(filters)); }); }
    function datasets(filters) { return queue.then(function () { return buildDatasets(state, Object.assign({}, filters || {}, { currentSessionId: sessionId, currentDeviceId: deviceId })); }); }
    function summary(filters) { return queue.then(function () { return aggregateSummary(state, Object.assign({}, filters || {}, { currentSessionId: sessionId, currentDeviceId: deviceId })); }); }
    function storeExportJSON(options) {
      return queue.then(function () {
        var config = Object.assign({}, options || {});
        config.filters = Object.assign({}, config.filters || config, {
          currentSessionId: sessionId, currentDeviceId: deviceId,
        });
        var selected = filteredData(config.filters);
        var provenance = selected.flips.concat(selected.matches, selected.rollups)
          .map(function (row) { return row._importId || null; });
        var singleImportId = provenance.length && provenance.every(function (id) { return id && id === provenance[0]; })
          ? provenance[0] : null;
        var marker = singleImportId && state.meta.find(function (row) {
          return row.key === 'import-lineage:' + singleImportId;
        });
        if (marker && marker.value) {
          config.sourceArchiveId = marker.value.sourceArchiveId;
          config.snapshotSequence = marker.value.snapshotSequence;
          config.snapshotId = marker.value.snapshotId;
          config.dictionaries = marker.value.dictionaries;
          config.preserveSourceRollupIds = true;
        } else {
          config.sourceArchiveId = localArchiveId;
          config.snapshotSequence = contributionCount(selected);
          config.dictionaries = collectOpenDictionaries(selected);
        }
        return exportJSON(state, config);
      });
    }
    function storeExportCSV(type, options) {
      return queue.then(function () {
        var config = Object.assign({}, options || {});
        config.filters = Object.assign({}, config.filters || config, {
          currentSessionId: sessionId, currentDeviceId: deviceId,
        });
        return exportCSV(state, type, config);
      });
    }
    function importJSON(input) {
      var document;
      try { document = parseImportJSON(input); }
      catch (error) { return Promise.resolve({ imported: false, error: 'invalid-import' }); }
      var hasLineage = document.sourceArchiveId != null;
      var importId = hasLineage ? stableUuid('import-lineage', document.sourceArchiveId)
        : stableUuid('import', JSON.stringify(document));
      return enqueue(function () {
        var markerKey = 'import-lineage:' + importId;
        var priorMarker = hasLineage ? state.meta.find(function (row) { return row.key === markerKey; }) : null;
        if (priorMarker && Number(priorMarker.value && priorMarker.value.snapshotSequence) >= document.snapshotSequence) {
          return { stored: false, imported: true, duplicate: true, importId: importId,
            flips: 0, matches: 0, rollups: 0,
            duplicates: document.flips.length + document.matches.length + document.rollups.length };
        }
        var replacing = !!priorMarker;
        var oldFlips = replacing ? state.flips.filter(function (row) { return row._importId === importId; }) : [];
        var oldMatches = replacing ? state.matches.filter(function (row) { return row._importId === importId; }) : [];
        var oldRollups = replacing ? state.rollups.filter(function (row) { return row._importId === importId; }) : [];
        var oldSeen = replacing ? state.seen.filter(function (row) { return row._importId === importId; }) : [];
        var baseFlips = replacing ? state.flips.filter(function (row) { return row._importId !== importId; }) : state.flips.slice();
        var baseMatches = replacing ? state.matches.filter(function (row) { return row._importId !== importId; }) : state.matches.slice();
        var baseRollups = replacing ? state.rollups.filter(function (row) { return row._importId !== importId; }) : state.rollups.slice();
        var baseSeen = replacing ? state.seen.filter(function (row) { return row._importId !== importId; }) : state.seen.slice();
        var dictionaries = hasLineage
          ? cloneOpenDictionaries(priorMarker && priorMarker.value && priorMarker.value.dictionaries || document.dictionaries)
          : emptyOpenDictionaries();
        var flipIds = new Set(baseSeen.map(function (row) { return row.uuid; }));
        var matchIds = new Set(baseSeen.filter(function (row) { return row.kind === 'match'; })
          .map(function (row) { return row.uuid; }));
        var rollupIds = new Set(baseRollups.map(function (row) { return row.uuid; }));
        var addedFlips = document.flips.map(function (row) {
          var copy = clone(row); copy._importId = importId;
          if (hasLineage) copy._rollupDictionaries = dictionariesDocument(dictionaries);
          return normalizeFlipRecord(copy, context());
        }).filter(function (row) { if (flipIds.has(row.uuid)) return false; flipIds.add(row.uuid); return true; });
        var addedMatches = document.matches.map(function (row) {
          var copy = clone(row); copy._importId = importId;
          if (hasLineage) copy._rollupDictionaries = dictionariesDocument(dictionaries);
          return normalizeMatchRecord(copy, context());
        }).filter(function (row) { if (matchIds.has(row.uuid)) return false; matchIds.add(row.uuid); return true; });
        var addedRollups = document.rollups.map(function (row) {
          var copy = sanitizeNamesDeep(clone(row));
          var sourceRollupId = copy.uuid;
          if (copy.schema === 'FlipAggregateV1' && Number(copy.version) >= 3) {
            copy.dimensions = boundedRollupDimensions(copy.dimensions || {}, dictionaries, false);
            if (Array.isArray(copy.index)) copy.index = copy.index.map(function (entry) {
              var slice = clone(entry);
              slice.dimensions = boundedRollupDimensions(slice.dimensions || {}, dictionaries, false);
              return slice;
            });
            copy.key = dimensionKey(copy.dimensions);
          } else if (copy.schema === 'MatchAggregateV1' && Number(copy.version) >= 2) {
            var sourceDim = copy.dimensions || {};
            function boundedMatchDimensions(dimensions) {
              var matchBounded = boundedRollupDimensions(dimensions, dictionaries, false);
              return {
                day: matchBounded.day, scope: matchBounded.scope, sessionId: matchBounded.sessionId,
                deviceId: matchBounded.deviceId, mode: matchBounded.mode, online: matchBounded.online,
                testData: matchBounded.testData, arenaId: matchBounded.arenaId,
                playerCount: matchBounded.playerCount, viewportBucket: matchBounded.viewportBucket,
                eventIds: (Array.isArray(dimensions.eventIds) ? dimensions.eventIds : []).map(function (id) {
                  return STATIC_ROLLUP_IDS.eventId.has(String(id)) ? String(id) : 'other';
                }).filter(function (id, index, values) { return values.indexOf(id) === index; }).sort(),
                participants: (Array.isArray(dimensions.participants) ? dimensions.participants : []).slice(0, 8).map(function (player) {
                  var participant = boundedRollupDimensions(player, dictionaries, false);
                  return { playerId: participant.playerId, seat: participant.seat, isAI: participant.isAI,
                    teamId: participant.teamId, objectId: participant.objectId, variantId: participant.variantId,
                    cosmeticId: participant.cosmeticId };
                }),
              };
            }
            copy.dimensions = boundedMatchDimensions(sourceDim);
            if (Array.isArray(copy.index)) copy.index = copy.index.map(function (entry) {
              var slice = clone(entry); slice.dimensions = boundedMatchDimensions(slice.dimensions || {}); return slice;
            });
            copy.key = importId + '|' + dimensionKey(copy.dimensions);
          }
          // Aggregate UUIDs are only unique within their source archive. Namespace
          // them so two independent sources with identical categorical cells remain additive.
          copy._sourceRollupId = sourceRollupId;
          copy.uuid = stableUuid('import-rollup', importId + '|' + sourceRollupId);
          copy._importId = importId; return freeze(copy);
        }).filter(function (row) { if (!row.uuid || rollupIds.has(row.uuid)) return false; rollupIds.add(row.uuid); return true; });
        var combined = baseFlips.concat(addedFlips).sort(function (a, b) { return a.timestamp - b.timestamp || a.uuid.localeCompare(b.uuid); });
        var prune = combined.length > maxRaw ? combined.slice(0, combined.length - maxRaw) : [];
        var kept = prune.length ? combined.slice(prune.length) : combined;
        var combinedRollups = baseRollups.concat(addedRollups);
        if (prune.length) combinedRollups = aggregateRecords(prune, { prefix: 'retention', existing: combinedRollups });
        else combinedRollups = enforceRollupCellBudget(combinedRollups, 'retention');
        var seen = addedFlips.map(function (row) { return freeze({ uuid: row.uuid, kind: 'flip', _importId: importId }); })
          .concat(addedMatches.map(function (row) { return freeze({ uuid: row.uuid, kind: 'match', _importId: importId }); }));
        var nextMeta = state.meta.filter(function (row) { return !hasLineage || row.key !== markerKey; });
        var nextMarker = null;
        if (hasLineage) {
          nextMarker = freeze({ key: markerKey, value: {
            sourceArchiveId: document.sourceArchiveId, snapshotSequence: document.snapshotSequence,
            snapshotId: document.snapshotId, dictionaries: dictionariesDocument(dictionaries),
          }, timestamp: now() });
          nextMeta.push(nextMarker);
        }
        var next = { flips: kept, matches: baseMatches.concat(addedMatches), rollups: combinedRollups,
          meta: nextMeta, seen: baseSeen.concat(seen) };
        var previousRollups = new Map(baseRollups.map(function (row) { return [row.uuid, JSON.stringify(row)]; }));
        var changedRollups = combinedRollups.filter(function (row) {
          return previousRollups.get(row.uuid) !== JSON.stringify(row);
        });
        var nextRollupIds = new Set(combinedRollups.map(function (row) { return row.uuid; }));
        var keptFlipIds = new Set(kept.map(function (row) { return row.uuid; }));
        var operation = {
          putFlips: addedFlips.filter(function (row) { return keptFlipIds.has(row.uuid); }),
          deleteFlipIds: oldFlips.map(function (row) { return row.uuid; })
            .concat(prune.map(function (row) { return row.uuid; })),
          putMatches: addedMatches, deleteMatchIds: oldMatches.map(function (row) { return row.uuid; }),
          putRollups: changedRollups,
          deleteRollupIds: oldRollups.concat(baseRollups.filter(function (row) {
            return row.schema === 'FlipAggregateV1' && !nextRollupIds.has(row.uuid);
          })).map(function (row) { return row.uuid; }),
          putSeen: seen, deleteSeenIds: oldSeen.map(function (row) { return row.uuid; }),
          putMeta: nextMarker ? [nextMarker] : [],
        };
        function finish(result) {
          if (!result.stored) return Object.assign({}, result, { imported: false, importId: importId,
            flips: 0, matches: 0, rollups: 0, duplicates: 0 });
          return Object.assign({}, result, { imported: true, importId: importId,
            flips: addedFlips.length, matches: addedMatches.length, rollups: addedRollups.length,
            duplicates: document.flips.length + document.matches.length + document.rollups.length -
              addedFlips.length - addedMatches.length - addedRollups.length });
        }
        if (!hasLineage) return commitMutation({ state: next, db: operation }, 'import', importId).then(finish);
        // Snapshot replacement is all-or-nothing. Unlike ordinary live writes,
        // a failed reconciliation must not promote partial state into fallback.
        if (usingFallback) return commitMutation({ state: next, db: operation }, 'import', importId).then(finish);
        return backend.commit(operation).then(function () {
          state = next; return finish({ stored: true, fallback: false, uuid: importId, kind: 'import' });
        }).catch(function (error) {
          report(error); return finish({ stored: false, fallback: false, error: 'storage-unavailable' });
        });
      });
    }
    function onOutcome(event) {
      if (event && event.type === 'flip.resolved.v1') return recordFlip(event);
      if (event && event.type === 'match.resolved.v1') return recordMatch(event);
      return Promise.resolve({ stored: false, ignored: true });
    }
    function close() {
      return queue.then(function () { closed = true; if (backend && backend.close) backend.close(); });
    }
    return Object.freeze({
      schema: 'StatsStoreV1', version: 1, deviceId: deviceId, sessionId: sessionId,
      recordFlip: recordFlip, recordMatch: recordMatch, onOutcome: onOutcome,
      flush: function () { return queue; }, query: query, datasets: datasets, summary: summary,
      exportJSON: storeExportJSON, exportCSV: storeExportCSV, importJSON: importJSON, close: close,
      usingFallback: function () { return usingFallback; }, getErrors: function () { return errors.slice(); },
      getWarning: function () { return warning ? clone(warning) : null; },
      onWarning: function (listener) {
        if (typeof listener !== 'function') throw new TypeError('Warning listener must be a function');
        warningListeners.push(listener);
        if (warning) Promise.resolve().then(function () { if (warningListeners.indexOf(listener) >= 0) listener(freeze(clone(warning))); });
        return function () { warningListeners = warningListeners.filter(function (entry) { return entry !== listener; }); };
      },
    });
  }

  function install(runtime, options) {
    var target = runtime || Runtime;
    if (!target || !target.stats || typeof target.stats.install !== 'function') return null;
    var store = createStore(options);
    target.stats.install(store);
    return store;
  }
  var api = {
    schema: 'FlipgameStatsModuleV1', version: 1, DB_NAME: DB_NAME, DB_VERSION: DB_VERSION,
    EXPORT_SCHEMA: EXPORT_SCHEMA, FALLBACK_KEY: FALLBACK_KEY, DEVICE_KEY: DEVICE_KEY,
    FALLBACK_WARNING: FALLBACK_WARNING, AGGREGATE_CAPACITY_WARNING: AGGREGATE_CAPACITY_WARNING,
    FLIP_RECORD_FIELDS: FLIP_RECORD_FIELDS, MATCH_RECORD_FIELDS: MATCH_RECORD_FIELDS,
    FILTER_FIELDS: FILTER_FIELDS,
    MAX_RAW_FLIPS: MAX_RAW_FLIPS, MAX_AGGREGATE_INDEX_ENTRIES: MAX_AGGREGATE_INDEX_ENTRIES,
    stableUuid: stableUuid, normalizeFlipRecord: normalizeFlipRecord, normalizeMatchRecord: normalizeMatchRecord,
    normalizeFilters: normalizeFilters, aggregateRecords: aggregateRecords, aggregateMatches: aggregateMatches,
    buildDatasets: buildDatasets,
    aggregateSummary: aggregateSummary, createIndexedDBBackend: createIndexedDBBackend,
    createMemoryBackend: createMemoryBackend, createStore: createStore,
    exportDocument: exportDocument, exportJSON: exportJSON, parseImportJSON: parseImportJSON,
    exportCSV: exportCSV, install: install,
  };
  if (Runtime) api.defaultStore = install(Runtime);
  return freeze(api);
});
