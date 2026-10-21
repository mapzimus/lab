// v112-profile.js -- canonical transactional local profile and v1.11 migration.
(function (root, factory) {
  'use strict';
  var nodeModule = null;
  try {
    if (typeof process === 'object' && process !== null &&
        Object.prototype.toString.call(process) === '[object process]' &&
        process.release && process.release.name === 'node' &&
        typeof process.getBuiltinModule === 'function') {
      nodeModule = process.getBuiltinModule('module');
    }
  } catch (_) { nodeModule = null; }
  var commonJs = typeof nodeModule === 'function' && nodeModule._cache &&
    typeof module === 'object' && module !== null && module instanceof nodeModule &&
    typeof module.filename === 'string' && nodeModule._cache[module.filename] === module &&
    Object.getPrototypeOf(module) === nodeModule.prototype &&
    module.require === nodeModule.prototype.require &&
    typeof require === 'function' && require.cache === nodeModule._cache &&
    typeof __filename === 'string' && __filename === module.filename &&
    typeof __dirname === 'string' &&
    Object.prototype.hasOwnProperty.call(module, 'exports') &&
    typeof module.require === 'function';
  if (!commonJs && root &&
      Object.prototype.hasOwnProperty.call(root, 'FlipgameV112Profile')) {
    throw new Error('FlipgameV112Profile is already defined; refusing an ambiguous browser profile');
  }
  var Catalog = root && root.FlipgameV112ProgressionCatalog;
  var Economy = root && root.FlipgameV112Economy;
  var LegacyProgression = root && root.FlipgameV111Progression;
  var Achievements = root && root.FlipgameV112Achievements;
  if (commonJs) {
    Catalog = module.require('./v112-progression-catalog.js');
    Economy = module.require('./v112-economy.js');
    LegacyProgression = module.require('./v111-progression.js');
    Achievements = module.require('./v112-achievements.js');
  }
  var api = factory(Catalog, Economy, LegacyProgression, Achievements, root, commonJs);
  if (commonJs) {
    module.exports = api;
  } else if (root) {
    Object.defineProperty(root, 'FlipgameV112Profile', {
      value: api, enumerable: true, writable: false, configurable: false,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Catalog, Economy, LegacyProgression,
    Achievements, root, commonJs) {
  'use strict';
  if (!Catalog || !Economy || !LegacyProgression) {
    throw new Error('v1.12 catalog, economy, and frozen v1.11 progression must load before profile');
  }
  var achievementsReady = false;
  try {
    var achievementProbe = Achievements &&
      typeof Achievements.lookupForMigration === 'function'
      ? Achievements.lookupForMigration('first_flip') : null;
    var achievementSummary = Achievements && typeof Achievements.catalogSummary === 'function'
      ? Achievements.catalogSummary() : null;
    achievementsReady = !!Achievements && Object.isFrozen(Achievements) &&
      Achievements.schema === 'AchievementCatalogV1' && Achievements.version === 1 &&
      !!achievementProbe && Object.isFrozen(achievementProbe) && achievementProbe.id === 'first_flip' &&
      ['common', 'notable', 'rare', 'legendary'].indexOf(achievementProbe.rarity) >= 0 &&
      !!achievementSummary && achievementSummary.total === 120;
  } catch (_) { achievementsReady = false; }
  if (!achievementsReady) {
    throw new Error('v1.12 achievement catalog must load before profile');
  }
  var achievementRewardAuthorityReady = !!Achievements.rewardAuthority &&
    Object.isFrozen(Achievements.rewardAuthority) &&
    Achievements.rewardAuthority.schema === 'AchievementRewardAuthorityV1' &&
    Achievements.rewardAuthority.version === 1 &&
    typeof Achievements.rewardAuthority.verify === 'function';
  if (commonJs && !achievementRewardAuthorityReady) {
    throw new Error('v1.12 achievement reward authority must load before the CommonJS profile');
  }

  var KEY = 'flipgame.profile.v4';
  var JOURNAL_KEY = KEY + '.journal';
  var LEGACY_KEYS = Object.freeze({
    progression: 'flipgame.progression.v3', recordsV2: 'flipgame.records.v2',
    recordsV1: 'flipgame.records.v1', achievementsV3: 'flipgame.achievements.v3',
    achievementsV1: 'flipgame.achievements.v1', setupV2: 'flipgame.setup.v2',
  });
  var FC_KINDS = new Set(['earn', 'spend', 'migration']);
  var FC_SOURCES = new Set(['match', 'achievement', 'level', 'cosmetic-purchase', 'migration', 'rival', 'story-act']);
  var STORY_ACT_IDS = Object.freeze(['1', '2', '3', '4']);
  var ACHIEVEMENT_RARITIES = new Set(['common', 'notable', 'rare', 'legendary']);
  var DEFAULT_ACHIEVEMENT_IMPORT_AUTHORITY = Achievements &&
    typeof Achievements.lookupForMigration === 'function'
    ? Object.freeze({ schema: 'AchievementImportAuthorityV1', version: 1,
      verify: function (achievementId) {
        var definition = Achievements.lookupForMigration(achievementId);
        if (!definition) throw new RangeError('Unknown canonical achievement');
        return Object.freeze({ id: definition.id, rarity: definition.rarity });
      } }) : null;
  function canonicalAchievementId(value) {
    var id = String(value || '');
    if (!id || !Achievements || typeof Achievements.lookupForMigration !== 'function') return null;
    try {
      var definition = Achievements.lookupForMigration(id);
      return definition && typeof definition.id === 'string' ? definition.id : null;
    } catch (_) { return null; }
  }
  function canonicalAchievementIds(values) {
    return uniqueStrings(uniqueStrings(values).map(canonicalAchievementId));
  }
  var MATCH_ACTIVITY_IDS = new Set(['free-play', 'story']);
  var MATCH_REWARD_KEYS = new Set([
    'completed', 'status', 'resolved', 'abandoned', 'imported', 'aiOnly',
    'testData', 'test', 'testMode', 'forced', 'isForced', 'ownerTest',
    'ownerTestMode', 'practice', 'isPractice', 'physicsLab', 'tutorial',
    'debug', 'simulated', 'activityId', 'activity', 'mode', 'format',
    'formatId', 'physicsModeId', 'physicsMode', 'gameMode', 'rewardMode',
    'modeKey', 'cupLength', 'rulesOptions', 'qualifiedManualHumanFlips',
    'attempts', 'humanPlayers', 'humanCount', 'startingLives',
    'performanceMultiplier', 'performance', 'humanWon',
    'winningSideHasHuman', 'result', 'draw', 'outcome', 'setupBonus',
    'setupComponents', 'setupBonusParts', 'opposingCpuTurnOccurred',
    'cpuDifficulty', 'difficulty', 'winningTeam', 'winningTeamHasHuman',
    'humansOnWinningTeam', 'everyHumanTeammateOrdinaryMake',
    'battleFormatId', 'battleFormat', 'battleType', 'laneCount', 'feel',
    'eligibleShots', 'adjustedMake', 'makeRate', 'landingQuality',
    'ordinaryStreak', 'clutch', 'teamContribution',
  ]);
  var MATCH_REWARD_INTEGER_KEYS = new Set([
    'qualifiedManualHumanFlips', 'attempts', 'humanPlayers', 'humanCount',
    'startingLives', 'setupBonus', 'humansOnWinningTeam', 'laneCount',
    'eligibleShots',
  ]);
  var MATCH_REWARD_NUMBER_KEYS = new Set([
    'performanceMultiplier', 'adjustedMake', 'makeRate', 'landingQuality',
    'ordinaryStreak', 'clutch', 'teamContribution',
  ]);
  var MATCH_REWARD_BOOLEAN_KEYS = new Set([
    'completed', 'resolved', 'abandoned', 'imported', 'aiOnly', 'testData',
    'test', 'testMode', 'forced', 'isForced', 'ownerTest', 'ownerTestMode',
    'practice', 'isPractice', 'physicsLab', 'tutorial', 'debug', 'simulated',
    'humanWon', 'winningSideHasHuman', 'draw', 'opposingCpuTurnOccurred',
    'winningTeam', 'winningTeamHasHuman', 'everyHumanTeammateOrdinaryMake',
  ]);
  var MATCH_REWARD_STRING_KEYS = new Set([
    'status', 'activityId', 'activity', 'mode', 'format', 'formatId',
    'physicsModeId', 'physicsMode', 'gameMode', 'rewardMode', 'modeKey',
    'cupLength', 'result', 'outcome', 'cpuDifficulty', 'difficulty',
    'battleFormatId', 'battleFormat', 'battleType', 'feel',
  ]);
  var RETENTION = Object.freeze({
    legacyClaimIds: 4096,
    fcTransactions: 4096,
    pendingReveals: 512,
    consumedRevealIds: 512,
    externalLineages: 128,
    matchReceipts: 4096,
    maxDistinctRevealIds: 271,
    canonicalEntitlementClaimIds: 177,
    idempotencePolicy: 'exact finite entitlements plus bounded durable immutable-match receipts; capacity exhaustion fails closed and no probabilistic identity structures are used',
    legacyClaimMigration: 'retain canonical finite entitlement identities; quarantine obsolete opaque match/import/reveal identities',
  });
  var STATE_CARDINALITY = Object.freeze({
    ownedObjectIds: 51,
    ownedArenaIds: 23,
    ownedCosmeticIds: 40,
    featureIds: 2,
    achievementIds: 120,
    rewardedAchievementIds: 120,
    defeatedRivalIds: 12,
    rewardedRivalIds: 12,
    completedActIds: 4,
    rewardedActIds: 4,
    fieldNoteIds: 4,
    claimedRewardIds: 512,
  });
  var UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
  var SAFE_CLONE_MAX_DEPTH = 64;
  // The valid 4,096-entry FC ledger alone occupies over 40k scalar nodes.
  var SAFE_CLONE_MAX_NODES = 100000;
  var STATE_FIELDS = new Set([
    'schema', 'version', 'lineageId', 'revision', 'matchClaimCursor',
    'consumedMatchOrdinal', 'activeMatchReservation', 'fxp', 'flipLevel',
    'fcBalance', 'ownedObjectIds', 'ownedArenaIds', 'ownedCosmeticIds',
    'featureIds', 'achievementIds', 'rewardedAchievementIds',
    'defeatedRivalIds', 'rewardedRivalIds', 'completedActIds',
    'rewardedActIds', 'fieldNoteIds', 'claimedRewardIds', 'processedClaimIds',
    'externalClaimEvidence', 'pendingRevealIds', 'consumedRevealIds',
    'fcTransactions', 'fcTransactionRollup', 'matchReceipts', 'legacy',
  ]);
  var IMPORT_COLLECTION_BOUNDS = Object.freeze({
    ownedObjectIds: STATE_CARDINALITY.ownedObjectIds,
    ownedArenaIds: STATE_CARDINALITY.ownedArenaIds,
    ownedCosmeticIds: STATE_CARDINALITY.ownedCosmeticIds,
    featureIds: STATE_CARDINALITY.featureIds,
    achievementIds: STATE_CARDINALITY.achievementIds,
    rewardedAchievementIds: STATE_CARDINALITY.rewardedAchievementIds,
    defeatedRivalIds: STATE_CARDINALITY.defeatedRivalIds,
    rewardedRivalIds: STATE_CARDINALITY.rewardedRivalIds,
    completedActIds: STATE_CARDINALITY.completedActIds,
    rewardedActIds: STATE_CARDINALITY.rewardedActIds,
    fieldNoteIds: STATE_CARDINALITY.fieldNoteIds,
    claimedRewardIds: STATE_CARDINALITY.claimedRewardIds,
    processedClaimIds: RETENTION.legacyClaimIds,
    externalClaimEvidence: RETENTION.externalLineages,
    pendingRevealIds: RETENTION.pendingReveals,
    consumedRevealIds: RETENTION.consumedRevealIds,
    fcTransactions: RETENTION.fcTransactions,
    matchReceipts: RETENTION.matchReceipts,
  });
  var OPTIONAL_IMPORT_COLLECTIONS = new Set([
    'rewardedAchievementIds', 'rewardedRivalIds', 'rewardedActIds',
    'externalClaimEvidence', 'consumedRevealIds', 'matchReceipts',
  ]);
  var lineageSequence = 0;
  var IN_REALM_STORAGE_WRITERS = new WeakMap();

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function safeClone(value, context, depth) {
    var tracker = context && context.active instanceof Set ? context : {
      active: new Set(), nodes: 0,
    };
    var level = depth == null ? 0 : depth;
    if (level > SAFE_CLONE_MAX_DEPTH) throw new RangeError('Safe value nesting limit exceeded');
    tracker.nodes++;
    if (tracker.nodes > SAFE_CLONE_MAX_NODES) throw new RangeError('Safe value node limit exceeded');
    if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError('Unsafe non-finite number');
      return value;
    }
    if (typeof value !== 'object') throw new TypeError('Unsafe value type');
    var prototype = Object.getPrototypeOf(value);
    var crossRealmPlain = !Array.isArray(value) && prototype &&
      Object.getPrototypeOf(prototype) === null;
    if (prototype !== null && prototype !== Object.prototype &&
        !crossRealmPlain && !Array.isArray(value)) {
      throw new TypeError('Unsafe object prototype');
    }
    if (typeof Object.getOwnPropertySymbols === 'function' &&
        Object.getOwnPropertySymbols(value).length) {
      throw new TypeError('Unsafe symbol key');
    }
    if (tracker.active.has(value)) throw new TypeError('Cyclic values are not supported');
    tracker.active.add(value);
    var output;
    if (Array.isArray(value)) {
      if (value.length > SAFE_CLONE_MAX_NODES) throw new RangeError('Safe array limit exceeded');
      Object.getOwnPropertyNames(value).forEach(function (key) {
        if (key === 'length') return;
        if (!/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
          throw new TypeError('Named or out-of-range array properties are not supported');
        }
      });
      output = [];
      for (var index = 0; index < value.length; index++) {
        var arrayDescriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!arrayDescriptor || !Object.prototype.hasOwnProperty.call(arrayDescriptor, 'value')) {
          throw new TypeError('Sparse or accessor arrays are not supported');
        }
        output.push(safeClone(arrayDescriptor.value, tracker, level + 1));
      }
    } else {
      output = Object.create(null);
      Object.getOwnPropertyNames(value).forEach(function (key) {
        if (UNSAFE_KEYS.has(key)) throw new TypeError('Unsafe object key: ' + key);
        var descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
          throw new TypeError('Accessor properties are not supported');
        }
        output[key] = safeClone(descriptor.value, tracker, level + 1);
      });
    }
    tracker.active.delete(value);
    return output;
  }
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }
  function parse(value, fallback) {
    if (value == null || value === '') return fallback;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }
  function finiteInteger(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(number)));
  }
  function signedInteger(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(-Number.MAX_SAFE_INTEGER, Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(number)));
  }
  function uniqueStrings(values, mapper) {
    var output = [];
    var seen = new Set();
    (Array.isArray(values) ? values : []).forEach(function (entry) {
      var value = mapper ? mapper(entry) : String(entry || '');
      value = String(value || '');
      if (!value || seen.has(value)) return;
      seen.add(value); output.push(value);
    });
    return output;
  }
  function addUnique(array, value) {
    var id = String(value || '');
    if (id && array.indexOf(id) < 0) array.push(id);
  }
  function validId(value, label) {
    var id = String(value || '');
    if (!id || id.length > 180 || /[\u0000-\u001f\u007f]/.test(id)) {
      throw new TypeError((label || 'id') + ' must be a non-empty safe identifier');
    }
    return id;
  }
  function exactUnsignedInteger(value, label) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
      throw new TypeError((label || 'value') + ' must be an exact non-negative integer');
    }
    return value;
  }
  function exactSignedInteger(value, label) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
      throw new TypeError((label || 'value') + ' must be an exact integer');
    }
    return value;
  }
  function exactId(value, label) {
    if (typeof value !== 'string' || value !== value.trim()) {
      throw new TypeError((label || 'id') + ' must be an exact string identifier');
    }
    return validId(value, label);
  }
  function exactOwnRecord(value, allowedKeys, requiredKeys, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError((label || 'record') + ' must be an object');
    }
    var prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null &&
        !(prototype && Object.getPrototypeOf(prototype) === null)) {
      throw new TypeError((label || 'record') + ' must use a plain object prototype');
    }
    var names = Object.getOwnPropertyNames(value);
    if (typeof Object.getOwnPropertySymbols === 'function' &&
        Object.getOwnPropertySymbols(value).length) {
      throw new TypeError((label || 'record') + ' contains unsupported symbol keys');
    }
    names.forEach(function (key) {
      if (UNSAFE_KEYS.has(key) || !allowedKeys.has(key)) {
        throw new TypeError((label || 'record') + ' contains an unsupported field: ' + key);
      }
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        throw new TypeError((label || 'record') + ' fields must be plain own values');
      }
    });
    (requiredKeys || []).forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        throw new TypeError((label || 'record') + ' is missing required field: ' + key);
      }
    });
    return value;
  }
  function preflightImportedState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError('Imported profile must use ProgressionStateV4');
    }
    var prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null &&
        !(prototype && Object.getPrototypeOf(prototype) === null)) {
      throw new TypeError('Imported profile must use a plain object prototype');
    }
    if (typeof Object.getOwnPropertySymbols === 'function' &&
        Object.getOwnPropertySymbols(value).length) {
      throw new TypeError('Imported profile contains unsupported symbol fields');
    }
    var descriptors = Object.create(null);
    var descriptorFailure = null;
    Object.getOwnPropertyNames(value).forEach(function (key) {
      if (UNSAFE_KEYS.has(key) || !STATE_FIELDS.has(key)) {
        throw new TypeError('Imported profile contains an unsupported field: ' + key);
      }
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      descriptors[key] = descriptor;
      if ((!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) &&
          !descriptorFailure) {
        descriptorFailure = new TypeError('Imported profile fields must be plain own values');
      }
    });
    if (!descriptors.schema ||
        !Object.prototype.hasOwnProperty.call(descriptors.schema, 'value') ||
        descriptors.schema.value !== 'ProgressionStateV4' || !descriptors.version ||
        !Object.prototype.hasOwnProperty.call(descriptors.version, 'value') ||
        descriptors.version.value !== 4) {
      throw new TypeError('Imported profile must use ProgressionStateV4');
    }
    // Inspect every declared collection bound before cloning or walking any
    // entry.  Accessor fields are remembered but never invoked; a later huge
    // array is still rejected in constant work rather than being hidden behind
    // an earlier hostile getter.
    Object.keys(IMPORT_COLLECTION_BOUNDS).forEach(function (field) {
      var descriptor = descriptors[field];
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        if (!descriptor && !OPTIONAL_IMPORT_COLLECTIONS.has(field)) {
          throw new TypeError('Imported profile is missing required collection: ' + field);
        }
        return;
      }
      var collection = descriptor.value;
      if (collection == null && OPTIONAL_IMPORT_COLLECTIONS.has(field)) return;
      if (!Array.isArray(collection)) {
        throw new TypeError('Imported profile has an invalid ' + field);
      }
      var lengthDescriptor = Object.getOwnPropertyDescriptor(collection, 'length');
      if (!lengthDescriptor || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value') ||
          !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0 ||
          lengthDescriptor.value > IMPORT_COLLECTION_BOUNDS[field]) {
        throw new TypeError('Imported profile has an oversized or invalid ' + field);
      }
      Object.getOwnPropertyNames(collection).forEach(function (key) {
        if (key === 'length') return;
        if (!/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= lengthDescriptor.value) {
          throw new TypeError('Imported profile collections must be exact dense arrays');
        }
        var entryDescriptor = Object.getOwnPropertyDescriptor(collection, key);
        if (!entryDescriptor || !Object.prototype.hasOwnProperty.call(entryDescriptor, 'value')) {
          throw new TypeError('Imported profile collections must contain plain own values');
        }
      });
      for (var index = 0; index < lengthDescriptor.value; index++) {
        if (!Object.prototype.hasOwnProperty.call(collection, String(index))) {
          throw new TypeError('Imported profile collections must be exact dense arrays');
        }
      }
    });
    if (descriptorFailure) throw descriptorFailure;
    STATE_FIELDS.forEach(function (field) {
      if (!descriptors[field] ||
          !Object.prototype.hasOwnProperty.call(descriptors[field], 'value')) {
        throw new TypeError('Imported profile is missing required field: ' + field);
      }
    });
    return value;
  }
  function exactFiniteNumber(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError((label || 'value') + ' must be an exact finite number');
    }
    return value;
  }
  function validateMatchRewardInput(value) {
    var input = value == null ? Object.create(null) : value;
    var source = exactOwnRecord(input, MATCH_REWARD_KEYS, [], 'Match reward input');
    var clean = safeClone(source);
    Object.keys(clean).forEach(function (key) {
      if (MATCH_REWARD_INTEGER_KEYS.has(key)) {
        exactUnsignedInteger(clean[key], 'Match reward ' + key);
      } else if (MATCH_REWARD_NUMBER_KEYS.has(key)) {
        exactFiniteNumber(clean[key], 'Match reward ' + key);
      } else if (MATCH_REWARD_BOOLEAN_KEYS.has(key) && typeof clean[key] !== 'boolean') {
        throw new TypeError('Match reward ' + key + ' must be boolean');
      } else if (MATCH_REWARD_STRING_KEYS.has(key) && typeof clean[key] !== 'string') {
        throw new TypeError('Match reward ' + key + ' must be a string');
      }
    });
    ['setupComponents', 'setupBonusParts'].forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(clean, key)) return;
      var parts = exactOwnRecord(clean[key], new Set([
        'mode', 'humanRoster', 'lives', 'cpuChallenge', 'teamwork',
      ]), [], 'Match reward ' + key);
      Object.keys(parts).forEach(function (part) {
        exactUnsignedInteger(parts[part], 'Match reward ' + key + '.' + part);
      });
    });
    if (Object.prototype.hasOwnProperty.call(clean, 'performance')) {
      var performance = exactOwnRecord(clean.performance, new Set([
        'eligibleShots', 'feel', 'laneCount', 'adjustedMake', 'makeRate',
        'landingQuality', 'ordinaryStreak', 'clutch', 'teamContribution',
      ]), [], 'Match reward performance');
      Object.keys(performance).forEach(function (key) {
        if (key === 'feel') {
          if (typeof performance[key] !== 'string') {
            throw new TypeError('Match reward performance.feel must be a string');
          }
        } else if (key === 'eligibleShots' || key === 'laneCount') {
          exactUnsignedInteger(performance[key], 'Match reward performance.' + key);
        } else exactFiniteNumber(performance[key], 'Match reward performance.' + key);
      });
    }
    if (Object.prototype.hasOwnProperty.call(clean, 'rulesOptions')) {
      var rules = exactOwnRecord(clean.rulesOptions, new Set([
        'startingLives', 'cupLength', 'battleFormatId', 'battleFormat',
      ]), [], 'Match reward rulesOptions');
      if (Object.prototype.hasOwnProperty.call(rules, 'startingLives')) {
        exactUnsignedInteger(rules.startingLives, 'Match reward rulesOptions.startingLives');
      }
      ['cupLength', 'battleFormatId', 'battleFormat'].forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(rules, key) && typeof rules[key] !== 'string') {
          throw new TypeError('Match reward rulesOptions.' + key + ' must be a string');
        }
      });
    }
    return clean;
  }
  function achievementDefinitionFromAuthority(authority, evidence) {
    if (!authority || !Object.isFrozen(authority) ||
        authority.schema !== 'AchievementRewardAuthorityV1' || authority.version !== 1 ||
        typeof authority.verify !== 'function') {
      throw new Error('Canonical achievement reward authority is unavailable');
    }
    var definition = authority.verify(evidence);
    if (!Object.isFrozen(definition)) {
      throw new TypeError('Achievement reward authority must return a frozen definition');
    }
    var source = exactOwnRecord(definition, new Set(['id', 'rarity']),
      ['id', 'rarity'], 'Achievement reward definition');
    var id = exactId(source.id, 'Achievement reward ID');
    var rarity = exactId(source.rarity, 'Achievement reward rarity');
    if (!ACHIEVEMENT_RARITIES.has(rarity)) {
      throw new RangeError('Unknown canonical achievement rarity: ' + rarity);
    }
    return freeze({ id: id, rarity: rarity });
  }
  function storyActId(value) {
    var id = exactId(value, 'Story actId');
    if (STORY_ACT_IDS.indexOf(id) < 0) throw new RangeError('Unknown Story act: ' + id);
    return id;
  }
  function timestamp(value) {
    var number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
  }
  function opaqueIdentity(prefix, timeValue) {
    var cryptoApi = root && root.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
      return prefix + '-' + cryptoApi.randomUUID();
    }
    if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
      var bytes = new Uint8Array(16);
      cryptoApi.getRandomValues(bytes);
      return prefix + '-' + Array.prototype.map.call(bytes, function (byte) {
        return byte.toString(16).padStart(2, '0');
      }).join('');
    }
    // Legacy WebViews without Web Crypto still receive a non-gameplay opaque
    // identity.  The monotonic cursor remains the authoritative idempotence
    // boundary; this fallback only prevents independent-profile collisions.
    return prefix + '-' + finiteInteger(timeValue).toString(36) + '-' +
      (++lineageSequence).toString(36) + '-' + Math.floor(Math.random() * 0x100000000).toString(36);
  }

  function FcTransactionV1(value) {
    var allowed = new Set(['schema', 'version', 'txId', 'idempotencyKey', 'kind',
      'sourceType', 'sourceId', 'signedAmount', 'balanceAfter', 'timestamp']);
    var source = exactOwnRecord(value, allowed,
      ['txId', 'kind', 'sourceType', 'sourceId', 'signedAmount', 'balanceAfter', 'timestamp'],
      'FcTransactionV1');
    if (Object.prototype.hasOwnProperty.call(source, 'schema') && source.schema !== 'FcTransactionV1') {
      throw new TypeError('FC transaction schema must be FcTransactionV1');
    }
    if (Object.prototype.hasOwnProperty.call(source, 'version') && source.version !== 1) {
      throw new TypeError('FC transaction version must be exactly 1');
    }
    var kind = exactId(source.kind, 'FcTransactionV1.kind');
    var sourceType = exactId(source.sourceType, 'FcTransactionV1.sourceType');
    var amount = exactSignedInteger(source.signedAmount, 'FcTransactionV1.signedAmount');
    var balance = exactUnsignedInteger(source.balanceAfter, 'FcTransactionV1.balanceAfter');
    if (!FC_KINDS.has(kind)) throw new RangeError('Unknown FC transaction kind');
    if (!FC_SOURCES.has(sourceType)) throw new RangeError('Unknown FC transaction source');
    if (!amount) throw new RangeError('FC transaction amount cannot be zero');
    if (kind === 'earn' && amount < 0) throw new RangeError('FC earn transaction must be positive');
    if (kind === 'spend' && amount > 0) throw new RangeError('FC spend transaction must be negative');
    return freeze({
      schema: 'FcTransactionV1', version: 1,
      txId: exactId(source.txId, 'FcTransactionV1.txId'),
      idempotencyKey: exactId(source.idempotencyKey == null ? source.txId : source.idempotencyKey,
        'FcTransactionV1.idempotencyKey'),
      kind: kind, sourceType: sourceType,
      sourceId: exactId(source.sourceId, 'FcTransactionV1.sourceId'),
      signedAmount: amount, balanceAfter: balance,
      timestamp: exactUnsignedInteger(source.timestamp, 'FcTransactionV1.timestamp'),
    });
  }

  function MatchClaimTokenV1(value) {
    var fields = new Set([
      'schema', 'version', 'lineageId', 'ordinal', 'nonce', 'matchId',
      'activityId', 'reservedAt',
    ]);
    var source = exactOwnRecord(value, fields, Array.from(fields), 'MatchClaimTokenV1');
    if (source.schema !== 'MatchClaimTokenV1' || source.version !== 1) {
      throw new TypeError('Match claim token must use MatchClaimTokenV1');
    }
    return freeze({ schema: 'MatchClaimTokenV1', version: 1,
      lineageId: exactId(source.lineageId, 'MatchClaimTokenV1.lineageId'),
      ordinal: exactUnsignedInteger(source.ordinal, 'MatchClaimTokenV1.ordinal'),
      nonce: exactId(source.nonce, 'MatchClaimTokenV1.nonce'),
      matchId: exactId(source.matchId, 'MatchClaimTokenV1.matchId'),
      activityId: exactId(source.activityId, 'MatchClaimTokenV1.activityId'),
      reservedAt: exactUnsignedInteger(source.reservedAt, 'MatchClaimTokenV1.reservedAt'),
    });
  }

  function MatchReceiptV1(value) {
    var fields = new Set([
      'schema', 'version', 'matchId', 'activityId', 'ordinal', 'resolution',
      'bearerNonce', 'reservedAt',
    ]);
    var source = exactOwnRecord(value, fields, [
      'schema', 'version', 'matchId', 'activityId', 'ordinal', 'resolution',
    ], 'MatchReceiptV1');
    if (source.schema !== 'MatchReceiptV1' || source.version !== 1) {
      throw new TypeError('Match receipt must use MatchReceiptV1');
    }
    var resolution = exactId(source.resolution, 'MatchReceiptV1.resolution');
    if (resolution !== 'consumed' && resolution !== 'abandoned') {
      throw new RangeError('Match receipt resolution must be consumed or abandoned');
    }
    var activityId = exactId(source.activityId, 'MatchReceiptV1.activityId');
    if (!MATCH_ACTIVITY_IDS.has(activityId)) {
      throw new RangeError('Match receipt activity is not reward-bearing');
    }
    var receipt = { schema: 'MatchReceiptV1', version: 1,
      matchId: exactId(source.matchId, 'MatchReceiptV1.matchId'),
      activityId: activityId,
      ordinal: exactUnsignedInteger(source.ordinal, 'MatchReceiptV1.ordinal'),
      resolution: resolution };
    var hasBearerNonce = Object.prototype.hasOwnProperty.call(source, 'bearerNonce');
    var hasReservedAt = Object.prototype.hasOwnProperty.call(source, 'reservedAt');
    if (hasBearerNonce || hasReservedAt) {
      if (!hasBearerNonce || !hasReservedAt) {
        throw new TypeError('Match receipt bearer identity must be complete');
      }
      receipt.bearerNonce = exactId(source.bearerNonce,
        'MatchReceiptV1.bearerNonce');
      receipt.reservedAt = exactUnsignedInteger(source.reservedAt,
        'MatchReceiptV1.reservedAt');
    }
    return freeze(receipt);
  }

  function normalizeMatchReceipts(values, consumedOrdinal) {
    if (!Array.isArray(values)) return [];
    if (values.length > RETENTION.matchReceipts) {
      throw new RangeError('Match receipt capacity exceeds the bounded v1.12 ledger');
    }
    var matchIds = new Set();
    var ordinals = new Set();
    var previousOrdinal = 0;
    var receipts = values.map(function (entry, index) {
      var receipt = MatchReceiptV1(entry);
      if (!receipt.ordinal || receipt.ordinal > consumedOrdinal) {
        throw new TypeError('Match receipt ordinal is outside the consumed frontier');
      }
      if (receipt.ordinal !== index + 1) {
        throw new TypeError('Match receipts must form one contiguous consumed ordinal ledger');
      }
      if (receipt.ordinal <= previousOrdinal) {
        throw new TypeError('Match receipts must be stored in strictly increasing ordinal order');
      }
      if (matchIds.has(receipt.matchId) || ordinals.has(receipt.ordinal)) {
        throw new TypeError('Match receipt identity is duplicated');
      }
      previousOrdinal = receipt.ordinal;
      matchIds.add(receipt.matchId);
      ordinals.add(receipt.ordinal);
      return receipt;
    });
    if (receipts.length !== consumedOrdinal) {
      throw new TypeError('Every consumed match ordinal requires one durable receipt');
    }
    return receipts;
  }

  function normalizeTransactions(values, declaredBalance, rollupValue) {
    var output = [];
    var txIds = new Set();
    var keys = new Set();
    var rollup = normalizeLedgerRollup(rollupValue);
    var balance = rollup.netAmount;
    if (balance < 0) throw new TypeError('FC ledger rollup cannot begin below zero');
    (Array.isArray(values) ? values : []).forEach(function (entry) {
      try {
        var raw = Object.assign({}, entry, { balanceAfter: balance + signedInteger(entry.signedAmount) });
        if (raw.balanceAfter < 0) return;
        var tx = FcTransactionV1(raw);
        if (txIds.has(tx.txId) || keys.has(tx.idempotencyKey)) return;
        txIds.add(tx.txId); keys.add(tx.idempotencyKey);
        balance = tx.balanceAfter; output.push(tx);
      } catch (_) {}
    });
    var requested = finiteInteger(declaredBalance);
    if (!output.length && rollup.transactionCount === 0 && requested > 0) {
      output.push(FcTransactionV1({
        txId: 'migration:unledgered-fc', idempotencyKey: 'migration:unledgered-fc',
        kind: 'migration', sourceType: 'migration', sourceId: 'profile-v4-balance',
        signedAmount: requested, balanceAfter: requested, timestamp: 0,
      }));
      balance = requested;
    }
    return { transactions: output, balance: balance, rollup: rollup };
  }
  function normalizeExternalLineages(values) {
    var byId = new Map();
    (Array.isArray(values) ? values : []).forEach(function (entry) {
      exactOwnRecord(entry, new Set(['lineageId', 'throughRevision', 'fcHighWater']),
        ['lineageId', 'throughRevision'], 'external lineage evidence');
      var lineageId = exactId(entry.lineageId, 'external lineageId');
      var revision = exactUnsignedInteger(entry.throughRevision, 'external throughRevision');
      // Old pre-release evidence had no currency watermark.  Treat it as
      // permanently saturated: safety is preferable to letting a replayed
      // backup refill FC that the player has already spent.
      var highWater = Object.prototype.hasOwnProperty.call(entry, 'fcHighWater')
        ? exactUnsignedInteger(entry.fcHighWater, 'external FC high-water')
        : Number.MAX_SAFE_INTEGER;
      var existing = byId.get(lineageId);
      byId.set(lineageId, {
        throughRevision: Math.max(revision, existing ? existing.throughRevision : 0),
        fcHighWater: Math.max(highWater, existing ? existing.fcHighWater : 0),
      });
    });
    if (byId.size > RETENTION.externalLineages) {
      throw new RangeError('External lineage evidence capacity is exhausted');
    }
    return Array.from(byId, function (entry) {
      return freeze({ lineageId: entry[0], throughRevision: entry[1].throughRevision,
        fcHighWater: entry[1].fcHighWater });
    }).sort(function (a, b) { return a.lineageId.localeCompare(b.lineageId); })
      ;
  }

  function boundedStateIds(values, field, mapper) {
    var output = uniqueStrings(values, mapper);
    if (output.length > STATE_CARDINALITY[field]) {
      throw new RangeError(field + ' exceeds the canonical v1.12 cardinality');
    }
    return output;
  }

  function canonicalRevealId(value) {
    if (typeof value !== 'string') return value;
    if (value.indexOf('cosmetic.') !== 0) return value;
    return 'store.' + value.slice(9);
  }

  function reconcileLegacyRevealNamespaces(source) {
    ['pendingRevealIds', 'consumedRevealIds'].forEach(function (field) {
      if (!Array.isArray(source[field])) return;
      var seen = new Set();
      source[field] = source[field].map(canonicalRevealId).filter(function (id) {
        if (typeof id !== 'string' || !seen.has(id)) {
          if (typeof id === 'string') seen.add(id);
          return true;
        }
        return false;
      });
    });
    if (Array.isArray(source.pendingRevealIds) && Array.isArray(source.consumedRevealIds)) {
      var consumed = new Set(source.consumedRevealIds.filter(function (id) {
        return typeof id === 'string';
      }));
      source.pendingRevealIds = source.pendingRevealIds.filter(function (id) {
        return typeof id !== 'string' || !consumed.has(id);
      });
    }
    return source;
  }

  function validateStateInput(value) {
    if (value == null) return Object.create(null);
    var source = exactOwnRecord(value, STATE_FIELDS, [], 'ProgressionStateV4');
    if (Object.prototype.hasOwnProperty.call(source, 'schema') &&
        source.schema !== 'ProgressionStateV4') {
      throw new TypeError('ProgressionStateV4 schema must be exact');
    }
    if (Object.prototype.hasOwnProperty.call(source, 'version') && source.version !== 4) {
      throw new TypeError('ProgressionStateV4 version must be exactly 4');
    }
    ['revision', 'matchClaimCursor', 'consumedMatchOrdinal', 'fxp', 'flipLevel',
      'fcBalance'].forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        exactUnsignedInteger(source[key], 'ProgressionStateV4.' + key);
      }
    });
    if (Object.prototype.hasOwnProperty.call(source, 'lineageId')) {
      exactId(source.lineageId, 'ProgressionStateV4.lineageId');
    }
    if (Object.prototype.hasOwnProperty.call(source, 'activeMatchReservation') &&
        source.activeMatchReservation != null) {
      MatchClaimTokenV1(source.activeMatchReservation);
    }
    var arrayLimits = {
      ownedObjectIds: STATE_CARDINALITY.ownedObjectIds,
      ownedArenaIds: STATE_CARDINALITY.ownedArenaIds,
      ownedCosmeticIds: STATE_CARDINALITY.ownedCosmeticIds,
      featureIds: STATE_CARDINALITY.featureIds,
      achievementIds: STATE_CARDINALITY.achievementIds,
      rewardedAchievementIds: STATE_CARDINALITY.achievementIds,
      defeatedRivalIds: STATE_CARDINALITY.defeatedRivalIds,
      rewardedRivalIds: STATE_CARDINALITY.defeatedRivalIds,
      completedActIds: STATE_CARDINALITY.completedActIds,
      rewardedActIds: STATE_CARDINALITY.completedActIds,
      fieldNoteIds: STATE_CARDINALITY.fieldNoteIds,
      claimedRewardIds: STATE_CARDINALITY.claimedRewardIds,
      processedClaimIds: RETENTION.legacyClaimIds,
      externalClaimEvidence: RETENTION.externalLineages,
      pendingRevealIds: RETENTION.pendingReveals,
      consumedRevealIds: RETENTION.consumedRevealIds,
      fcTransactions: RETENTION.fcTransactions,
      matchReceipts: RETENTION.matchReceipts,
    };
    Object.keys(arrayLimits).forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) return;
      if (!Array.isArray(source[key]) || source[key].length > arrayLimits[key]) {
        throw new TypeError('ProgressionStateV4.' + key + ' must be a bounded array');
      }
    });
    ['ownedObjectIds', 'ownedArenaIds', 'ownedCosmeticIds', 'featureIds',
      'achievementIds', 'rewardedAchievementIds', 'defeatedRivalIds',
      'rewardedRivalIds', 'completedActIds', 'rewardedActIds', 'fieldNoteIds',
      'claimedRewardIds', 'processedClaimIds', 'pendingRevealIds',
      'consumedRevealIds'].forEach(function (key) {
      (source[key] || []).forEach(function (id) {
        exactId(id, 'ProgressionStateV4.' + key + ' entry');
      });
    });
    (source.externalClaimEvidence || []).forEach(function (entry) {
      exactOwnRecord(entry, new Set(['lineageId', 'throughRevision', 'fcHighWater']),
        ['lineageId', 'throughRevision'], 'ProgressionStateV4 external claim evidence');
      exactId(entry.lineageId, 'ProgressionStateV4 external lineageId');
      exactUnsignedInteger(entry.throughRevision, 'ProgressionStateV4 external throughRevision');
      if (Object.prototype.hasOwnProperty.call(entry, 'fcHighWater')) {
        exactUnsignedInteger(entry.fcHighWater, 'ProgressionStateV4 external FC high-water');
      }
    });
    (source.fcTransactions || []).forEach(FcTransactionV1);
    (source.matchReceipts || []).forEach(MatchReceiptV1);
    if (Object.prototype.hasOwnProperty.call(source, 'fcTransactionRollup') &&
        source.fcTransactionRollup != null) {
      var summary = exactOwnRecord(source.fcTransactionRollup,
        new Set(['schema', 'version', 'netAmount', 'transactionCount']),
        ['schema', 'version', 'netAmount', 'transactionCount'], 'FcLedgerSummaryV1');
      if (summary.schema !== 'FcLedgerSummaryV1' || summary.version !== 1) {
        throw new TypeError('ProgressionStateV4 ledger rollup schema/version is invalid');
      }
      exactSignedInteger(summary.netAmount, 'ProgressionStateV4 ledger netAmount');
      exactUnsignedInteger(summary.transactionCount,
        'ProgressionStateV4 ledger transactionCount');
    }
    if (Object.prototype.hasOwnProperty.call(source, 'legacy') && source.legacy != null) {
      var legacy = exactOwnRecord(source.legacy, new Set([
        'reconciledV111', 'qualifyingWins', 'sourceRelease', 'grandfatheredAlien',
        'grandfatheredInsane', 'quarantinedMatchReservations', 'compactedLegacyClaims',
      ]), [], 'ProgressionStateV4 legacy');
      ['qualifyingWins', 'quarantinedMatchReservations', 'compactedLegacyClaims']
        .forEach(function (key) {
          if (Object.prototype.hasOwnProperty.call(legacy, key)) {
            exactUnsignedInteger(legacy[key], 'ProgressionStateV4 legacy.' + key);
          }
        });
      ['reconciledV111', 'grandfatheredAlien', 'grandfatheredInsane']
        .forEach(function (key) {
          if (Object.prototype.hasOwnProperty.call(legacy, key) &&
              typeof legacy[key] !== 'boolean') {
            throw new TypeError('ProgressionStateV4 legacy.' + key + ' must be boolean');
          }
        });
      if (Object.prototype.hasOwnProperty.call(legacy, 'sourceRelease') &&
          typeof legacy.sourceRelease !== 'string') {
        throw new TypeError('ProgressionStateV4 legacy.sourceRelease must be a string');
      }
    }
    return source;
  }

  function ProgressionStateV4(value) {
    var source = validateStateInput(value);
    var ledger = normalizeTransactions(source.fcTransactions, source.fcBalance, source.fcTransactionRollup);
    while (ledger.transactions.length > RETENTION.fcTransactions) {
      ledger.rollup = ledgerRollupAdd(ledger.rollup, ledger.transactions.shift());
    }
    var objects = boundedStateIds(['bottle'].concat(source.ownedObjectIds || []),
      'ownedObjectIds', Catalog.canonicalObjectId);
    if (objects.indexOf('bottle') < 0) objects.unshift('bottle');
    var arenas = boundedStateIds(['baseline-table'].concat(source.ownedArenaIds || []),
      'ownedArenaIds', Catalog.canonicalArenaId);
    if (arenas.indexOf('baseline-table') < 0) arenas.unshift('baseline-table');
    var defeated = boundedStateIds(source.defeatedRivalIds, 'defeatedRivalIds');
    var fxp = finiteInteger(source.fxp);
    var legacySource = source.legacy && typeof source.legacy === 'object' ? source.legacy : {};
    var reconciledV111 = !!legacySource.reconciledV111;
    var grandfatheredAlien = Object.prototype.hasOwnProperty.call(legacySource, 'grandfatheredAlien')
      ? !!legacySource.grandfatheredAlien
      : reconciledV111 && objects.indexOf('alien') >= 0;
    var featureIds = boundedStateIds(source.featureIds, 'featureIds');
    var matchClaimCursor = finiteInteger(source.matchClaimCursor);
    var consumedMatchOrdinal = finiteInteger(source.consumedMatchOrdinal);
    if (consumedMatchOrdinal > matchClaimCursor) {
      throw new TypeError('Consumed match ordinal exceeds its claim cursor');
    }
    var matchReceipts = normalizeMatchReceipts(source.matchReceipts || [], consumedMatchOrdinal);
    var activeMatchReservation = source.activeMatchReservation == null
      ? null : MatchClaimTokenV1(source.activeMatchReservation);
    if (activeMatchReservation && (activeMatchReservation.lineageId !==
        (source.lineageId == null ? 'unassigned-v4' : source.lineageId) ||
        activeMatchReservation.ordinal !== matchClaimCursor ||
        activeMatchReservation.ordinal <= consumedMatchOrdinal)) {
      throw new TypeError('Active match reservation is inconsistent with profile lineage/ordinal');
    }
    if (activeMatchReservation
        ? matchClaimCursor !== consumedMatchOrdinal + 1
        : matchClaimCursor !== consumedMatchOrdinal) {
      throw new TypeError('Match claim cursor is not reachable from its durable receipt ledger');
    }
    if (activeMatchReservation && matchReceipts.some(function (receipt) {
      return receipt.matchId === activeMatchReservation.matchId ||
        receipt.ordinal === activeMatchReservation.ordinal;
    })) throw new TypeError('Active match reservation conflicts with a durable receipt');
    var grandfatheredInsane = Object.prototype.hasOwnProperty.call(legacySource, 'grandfatheredInsane')
      ? !!legacySource.grandfatheredInsane
      : reconciledV111 && featureIds.indexOf('insane-mode') >= 0;
    if (grandfatheredAlien) addUnique(objects, 'alien');
    if (grandfatheredInsane) addUnique(featureIds, 'insane-mode');
    var processedClaimIds = uniqueStrings(source.processedClaimIds);
    if (processedClaimIds.length > RETENTION.legacyClaimIds) {
      throw new RangeError('Legacy claim capacity exhausted');
    }
    var consumedRevealIds = uniqueStrings(source.consumedRevealIds, canonicalRevealId);
    if (consumedRevealIds.length > RETENTION.consumedRevealIds) throw new RangeError('Consumed reveal capacity exhausted');
    var pendingRevealIds = uniqueStrings(source.pendingRevealIds, canonicalRevealId).filter(function (id) {
      return consumedRevealIds.indexOf(id) < 0;
    });
    if (pendingRevealIds.length > RETENTION.pendingReveals) throw new RangeError('Pending reveal capacity exhausted');
    return freeze({
      schema: 'ProgressionStateV4', version: 4,
      lineageId: source.lineageId == null ? 'unassigned-v4' : exactId(source.lineageId, 'lineageId'),
      revision: finiteInteger(source.revision),
      matchClaimCursor: matchClaimCursor,
      consumedMatchOrdinal: consumedMatchOrdinal,
      activeMatchReservation: activeMatchReservation,
      matchReceipts: matchReceipts,
      fxp: fxp, flipLevel: Economy.flipLevelForFxp(fxp), fcBalance: ledger.balance,
      ownedObjectIds: objects,
      ownedArenaIds: arenas,
      ownedCosmeticIds: boundedStateIds(source.ownedCosmeticIds, 'ownedCosmeticIds'),
      featureIds: featureIds,
      achievementIds: boundedStateIds(source.achievementIds, 'achievementIds'),
      rewardedAchievementIds: boundedStateIds(source.rewardedAchievementIds,
        'rewardedAchievementIds'),
      defeatedRivalIds: defeated,
      rewardedRivalIds: boundedStateIds(source.rewardedRivalIds, 'rewardedRivalIds'),
      completedActIds: boundedStateIds(source.completedActIds, 'completedActIds'),
      rewardedActIds: boundedStateIds(source.rewardedActIds, 'rewardedActIds'),
      fieldNoteIds: boundedStateIds(source.fieldNoteIds, 'fieldNoteIds'),
      claimedRewardIds: boundedStateIds(source.claimedRewardIds, 'claimedRewardIds'),
      processedClaimIds: processedClaimIds,
      externalClaimEvidence: normalizeExternalLineages(source.externalClaimEvidence),
      pendingRevealIds: pendingRevealIds,
      consumedRevealIds: consumedRevealIds,
      fcTransactions: ledger.transactions,
      fcTransactionRollup: freeze(ledger.rollup),
      legacy: freeze({
        reconciledV111: reconciledV111,
        qualifyingWins: finiteInteger(legacySource.qualifyingWins),
        sourceRelease: String(legacySource.sourceRelease || ''),
        grandfatheredAlien: grandfatheredAlien,
        grandfatheredInsane: grandfatheredInsane,
        quarantinedMatchReservations: finiteInteger(legacySource.quarantinedMatchReservations),
        compactedLegacyClaims: finiteInteger(legacySource.compactedLegacyClaims),
      }),
    });
  }

  function alienGateSatisfied(value) {
    var state = ProgressionStateV4(value);
    return state.flipLevel >= 100 && state.defeatedRivalIds.indexOf('visitor-zero') >= 0;
  }
  function isAlienUsable(value) {
    var state = ProgressionStateV4(value);
    return state.legacy.grandfatheredAlien || alienGateSatisfied(state);
  }
  function isInsaneUsable(value) {
    var state = ProgressionStateV4(value);
    return state.legacy.grandfatheredInsane || alienGateSatisfied(state);
  }

  function createMemoryStorage(seed) {
    var values = Object.assign({}, seed || {});
    var failNext = false;
    return {
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
      setItem: function (key, value) {
        if (failNext) { failNext = false; throw new Error('simulated storage failure'); }
        values[key] = String(value);
      },
      removeItem: function (key) { delete values[key]; },
      failNextWrite: function () { failNext = true; },
      dump: function () { return clone(values); },
    };
  }

  function readStorage(storage, key, fallback) {
    if (!storage || typeof storage.getItem !== 'function') return fallback;
    try { return parse(storage.getItem(key), fallback); } catch (_) { return fallback; }
  }
  function strictStorageRead(storage, key) {
    if (!storage || typeof storage.getItem !== 'function') return null;
    var value;
    try { value = storage.getItem(key); }
    catch (error) { throw new Error('Profile storage read failed for ' + key + ': ' + error.message); }
    if (value != null && typeof value !== 'string') {
      throw new TypeError('Persisted profile bytes must be strings');
    }
    return value;
  }
  function profileJournal(value) {
    if (typeof value !== 'string' || !value || value.length > 12000000) {
      throw new TypeError('Persisted profile journal is corrupt');
    }
    var parsed;
    try { parsed = JSON.parse(value); }
    catch (_) { throw new TypeError('Persisted profile journal is corrupt'); }
    var source = exactOwnRecord(parsed, new Set([
      'schema', 'version', 'phase', 'previousBytes', 'candidateBytes',
    ]), ['schema', 'version', 'phase', 'previousBytes', 'candidateBytes'],
    'ProfileCommitJournalV1');
    if (source.schema !== 'ProfileCommitJournalV1' || source.version !== 1 ||
        (source.phase !== 'prepared' && source.phase !== 'committed')) {
      throw new TypeError('Persisted profile journal has an unsupported state');
    }
    if (source.previousBytes != null && typeof source.previousBytes !== 'string') {
      throw new TypeError('Persisted profile journal has invalid previous bytes');
    }
    if (typeof source.candidateBytes !== 'string' || !source.candidateBytes ||
        source.candidateBytes.length > 5000000 ||
        (source.previousBytes != null && source.previousBytes.length > 5000000)) {
      throw new TypeError('Persisted profile journal exceeds the supported bound');
    }
    var authoritativeBytes = source.phase === 'committed'
      ? source.candidateBytes : source.previousBytes;
    if (authoritativeBytes != null) {
      var authoritativeValue;
      try { authoritativeValue = JSON.parse(authoritativeBytes); }
      catch (_) { throw new TypeError('Persisted profile journal contains unreadable authoritative bytes'); }
      if (!authoritativeValue || authoritativeValue.schema !== 'ProgressionStateV4' ||
          authoritativeValue.version !== 4) {
        throw new TypeError('Persisted profile journal contains unsupported authoritative bytes');
      }
    }
    return freeze({ schema: 'ProfileCommitJournalV1', version: 1,
      phase: source.phase, previousBytes: source.previousBytes,
      candidateBytes: source.candidateBytes });
  }
  function encodeProfileJournal(phase, previousBytes, candidateBytes) {
    return JSON.stringify({ schema: 'ProfileCommitJournalV1', version: 1,
      phase: phase, previousBytes: previousBytes, candidateBytes: candidateBytes });
  }
  function observeStorageWrite(storage, key, value) {
    var writeError = null;
    try { storage.setItem(key, value); } catch (error) { writeError = error; }
    try {
      var current = strictStorageRead(storage, key);
      return { exact: current === value, current: current, writeError: writeError,
        readError: null };
    } catch (readError) {
      return { exact: false, current: undefined, writeError: writeError,
        readError: readError };
    }
  }
  function observeStorageRemove(storage, key) {
    var removeError = null;
    try {
      if (typeof storage.removeItem !== 'function') {
        throw new Error('Profile storage cannot remove journal entries');
      }
      storage.removeItem(key);
    } catch (error) { removeError = error; }
    try {
      var current = strictStorageRead(storage, key);
      return { exact: current == null, current: current, writeError: removeError,
        readError: null };
    } catch (readError) {
      return { exact: false, current: undefined, writeError: removeError,
        readError: readError };
    }
  }
  function authoritativeProfileBytes(storage) {
    var journalBytes = strictStorageRead(storage, JOURNAL_KEY);
    if (journalBytes == null || journalBytes === '') {
      return { encoded: strictStorageRead(storage, KEY), journal: null };
    }
    var journal = profileJournal(journalBytes);
    // Prepared means the transaction never crossed its durable commit point;
    // committed means it did. Readers never infer authority from the primary
    // key while a journal exists.
    return { encoded: journal.phase === 'committed'
      ? journal.candidateBytes : journal.previousBytes, journal: journal };
  }
  function recoverProfileJournal(storage) {
    var authoritative = authoritativeProfileBytes(storage);
    if (!authoritative.journal) return authoritative.encoded;
    var primary = strictStorageRead(storage, KEY);
    if (primary !== authoritative.encoded) {
      var repaired = authoritative.encoded == null
        ? observeStorageRemove(storage, KEY)
        : observeStorageWrite(storage, KEY, authoritative.encoded);
      if (!repaired.exact) {
        throw new Error('Profile journal recovery could not restore authoritative bytes');
      }
    }
    var cleanup = observeStorageRemove(storage, JOURNAL_KEY);
    if (!cleanup.exact) {
      throw new Error('Profile journal recovery could not clear its durable marker');
    }
    return authoritative.encoded;
  }
  function readProfileStorage(storage) {
    if (!storage || typeof storage.getItem !== 'function') {
      return { encoded: null, value: null };
    }
    var encoded = authoritativeProfileBytes(storage).encoded;
    if (encoded == null || encoded === '') return { encoded: encoded, value: null };
    if (typeof encoded !== 'string') {
      throw new TypeError('Persisted v1.12 profile bytes must be a string');
    }
    try { return { encoded: encoded, value: JSON.parse(encoded) }; }
    catch (_) { throw new TypeError('Persisted v1.12 profile is corrupt'); }
  }
  function legacyInputs(input) {
    var source = input || {};
    var storage = source.storage || null;
    function choose(name, key, fallback) {
      if (Object.prototype.hasOwnProperty.call(source, name)) return parse(source[name], fallback);
      return readStorage(storage, key, fallback);
    }
    return {
      progression: choose('progression', LEGACY_KEYS.progression, {}),
      recordsV2: choose('recordsV2', LEGACY_KEYS.recordsV2, {}),
      recordsV1: choose('recordsV1', LEGACY_KEYS.recordsV1, {}),
      achievementsV3: choose('achievementsV3', LEGACY_KEYS.achievementsV3, {}),
      achievementsV1: choose('achievementsV1', LEGACY_KEYS.achievementsV1, []),
      setupV2: choose('setupV2', LEGACY_KEYS.setupV2, {}),
    };
  }
  function achievementIds(v3, v1) {
    var ids = [];
    (Array.isArray(v1) ? v1 : []).forEach(function (id) { addUnique(ids, id); });
    var current = v3 && typeof v3 === 'object' ? v3 : {};
    (Array.isArray(current.earned) ? current.earned : []).forEach(function (entry) {
      if (entry && entry.id) addUnique(ids, entry.id);
    });
    return ids;
  }
  function migrateSetupSelection(setup) {
    var output = safeClone(setup && typeof setup === 'object' ? setup : Object.create(null));
    function migrateParticipant(row) {
      if (!row || typeof row !== 'object') return row;
      var next = safeClone(row);
      if (next.charId != null) next.charId = Catalog.canonicalObjectId(next.charId);
      if (next.objectId != null) next.objectId = Catalog.canonicalObjectId(next.objectId);
      if (next.skin != null) next.skin = Catalog.canonicalObjectId(next.skin);
      if (next.variantId != null) next.variantId = Catalog.canonicalVariantId(next.variantId);
      return next;
    }
    if (Array.isArray(output.rows)) output.rows = output.rows.map(migrateParticipant);
    if (Array.isArray(output.players)) output.players = output.players.map(migrateParticipant);
    if (Array.isArray(output.roster)) output.roster = output.roster.map(migrateParticipant);
    if (output.selectedObjectId != null) output.selectedObjectId = Catalog.canonicalObjectId(output.selectedObjectId);
    if (output.selectedSkin != null) output.selectedSkin = Catalog.canonicalObjectId(output.selectedSkin);
    if (output.selectedVariantId != null) output.selectedVariantId = Catalog.canonicalVariantId(output.selectedVariantId);
    if (output.visualArenaId != null) output.visualArenaId = Catalog.canonicalArenaId(output.visualArenaId);
    if (output.arenaId != null) output.arenaId = Catalog.canonicalArenaId(output.arenaId);
    return freeze(output);
  }

  function appendFc(draft, value) {
    var amount = exactSignedInteger(value.signedAmount, 'FC signedAmount');
    if (!amount) return null;
    var nextBalance = draft.fcBalance + amount;
    if (nextBalance < 0) throw new RangeError('Insufficient Flip Credits');
    if (!Number.isSafeInteger(nextBalance)) throw new RangeError('Flip Credit balance exceeds the supported range');
    var tx = FcTransactionV1(Object.assign({}, value, { balanceAfter: nextBalance }));
    if (draft.fcTransactions.some(function (entry) {
      return entry.txId === tx.txId || entry.idempotencyKey === tx.idempotencyKey;
    })) throw new RangeError('FC transaction identity already exists or is present in compacted history');
    draft.fcTransactions.push(tx);
    draft.fcBalance = nextBalance;
    compactLedger(draft);
    return tx;
  }
  function grantAlienGate(draft, reveal) {
    if (draft.flipLevel < 100 || draft.defeatedRivalIds.indexOf('visitor-zero') < 0) return [];
    var granted = [];
    if (draft.ownedObjectIds.indexOf('alien') < 0) {
      draft.ownedObjectIds.push('alien'); granted.push('object.alien');
    }
    if (draft.featureIds.indexOf('insane-mode') < 0) {
      draft.featureIds.push('insane-mode'); granted.push('feature.insane-mode');
    }
    addUnique(draft.claimedRewardIds, 'condition.alien-defeated-at-level-100');
    if (reveal) granted.forEach(function (id) { queueReveal(draft, id); });
    return granted;
  }
  function grantLevel(draft, level, options) {
    var opts = options || {};
    var granted = [];
    Catalog.rewardsAtLevel(level).forEach(function (reward) {
      if (draft.claimedRewardIds.indexOf(reward.id) >= 0) return;
      addUnique(draft.claimedRewardIds, reward.id);
      if (reward.type === 'object') {
        addUnique(draft.ownedObjectIds, reward.contentId); granted.push('object.' + reward.contentId);
      } else if (reward.type === 'arena') {
        addUnique(draft.ownedArenaIds, reward.contentId); granted.push('arena.' + reward.contentId);
      } else if (reward.type === 'feature') {
        addUnique(draft.featureIds, reward.contentId); granted.push('feature.' + reward.contentId);
      } else if (reward.type === 'fc') {
        appendFc(draft, {
          txId: 'level:' + level + ':fc', idempotencyKey: 'level:' + level + ':fc',
          kind: opts.migration ? 'migration' : 'earn', sourceType: 'level', sourceId: 'level:' + level,
          signedAmount: reward.amount, timestamp: opts.now,
        });
        granted.push(reward.id);
      }
    });
    draft.flipLevel = Economy.flipLevelForFxp(draft.fxp);
    if (opts.reveal) granted.forEach(function (id) { queueReveal(draft, id); });
    return granted;
  }
  function grantLevelsCrossed(draft, previousLevel, options) {
    var granted = [];
    for (var level = Math.max(2, finiteInteger(previousLevel) + 1); level <= draft.flipLevel; level++) {
      granted = granted.concat(grantLevel(draft, level, options));
    }
    return granted;
  }

  function migrateV111(input) {
    var legacy = legacyInputs(input);
    var ids = canonicalAchievementIds(achievementIds(
      legacy.achievementsV3, legacy.achievementsV1));
    var v3 = legacy.progression && typeof legacy.progression === 'object' ? clone(legacy.progression) : {};
    var wins = Math.max(finiteInteger(v3.qualifyingWins), finiteInteger(legacy.recordsV2.qualifyingWins),
      finiteInteger(legacy.recordsV1.totalWins));
    v3.qualifyingWins = wins;
    var legacyRecords = Object.assign({}, legacy.recordsV1, {
      totalWins: wins,
      unlockedSkins: uniqueStrings((legacy.recordsV1.unlockedSkins || []).concat(v3.ownedObjectIds || [])),
    });
    var reconciled = LegacyProgression.migrate({
      progression: v3, legacyRecords: legacyRecords,
      legacyAchievements: canonicalAchievementIds(ids.concat(v3.achievementIds || [])),
    });
    var reconciledObjects = uniqueStrings(reconciled.ownedObjectIds, Catalog.canonicalObjectId)
      .filter(function (id) { return !!Catalog.object(id); });
    var reconciledClaims = uniqueStrings(reconciled.claimedRewardIds);
    var grandfatheredAlien = reconciledObjects.indexOf('alien') >= 0 ||
      reconciledClaims.indexOf('object.alien') >= 0;
    var grandfatheredInsane = reconciledClaims.indexOf('feature.insane-mode') >= 0;
    var draft = clone(ProgressionStateV4({
      fxp: Economy.fxpThresholdForLevel(Math.max(1, Math.min(100, wins))),
      ownedObjectIds: reconciledObjects,
      achievementIds: canonicalAchievementIds((reconciled.achievementIds || []).concat(ids)),
      claimedRewardIds: [],
      legacy: { reconciledV111: true, qualifyingWins: wins, sourceRelease: 'v1.11',
        grandfatheredAlien: grandfatheredAlien, grandfatheredInsane: grandfatheredInsane },
    }));

    (reconciled.claimedRewardIds || []).forEach(function (claim) {
      var id = String(claim || '');
      if (id.indexOf('object.') === 0) {
        var objectId = Catalog.canonicalObjectId(id.slice(7));
        if (Catalog.object(objectId)) {
          addUnique(draft.ownedObjectIds, objectId);
          addUnique(draft.claimedRewardIds, 'object.' + objectId);
        }
      } else if (id.indexOf('feature.') === 0 &&
          ['physics-lab', 'insane-mode'].indexOf(id.slice(8)) >= 0) {
        addUnique(draft.featureIds, id.slice(8));
        addUnique(draft.claimedRewardIds, id);
      } else if (Catalog.storeCosmetic(id)) {
        addUnique(draft.claimedRewardIds, id);
      } else if (id.indexOf('arena.') === 0 && Catalog.arena(Catalog.canonicalArenaId(id))) {
        addUnique(draft.claimedRewardIds, 'arena.' + Catalog.canonicalArenaId(id));
      }
    });
    (reconciled.ownedCosmeticIds || []).forEach(function (id) {
      var value = String(id || '');
      if (value.indexOf('arena.') === 0) {
        var arenaId = Catalog.canonicalArenaId(value);
        if (Catalog.arena(arenaId)) addUnique(draft.ownedArenaIds, arenaId);
      } else if (Catalog.storeCosmetic(value)) addUnique(draft.ownedCosmeticIds, value);
    });
    draft.ownedObjectIds = uniqueStrings(draft.ownedObjectIds, Catalog.canonicalObjectId)
      .filter(function (id) { return !!Catalog.object(id); });
    draft.flipLevel = Economy.flipLevelForFxp(draft.fxp);
    for (var level = 2; level <= draft.flipLevel; level++) grantLevel(draft, level, { migration: true, reveal: false, now: 0 });
    draft.pendingRevealIds = [];
    draft.processedClaimIds = uniqueStrings(draft.processedClaimIds.concat(['migration:v111-to-v4']));
    if (draft.lineageId === 'unassigned-v4') {
      draft.lineageId = opaqueIdentity('migrated-v4', 0);
    }
    return ProgressionStateV4(draft);
  }

  function normalizeLedgerRollup(value) {
    var source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var summary = { schema: 'FcLedgerSummaryV1', version: 1,
      netAmount: signedInteger(source.netAmount),
      transactionCount: finiteInteger(source.transactionCount) };
    if (summary.transactionCount === 0 && summary.netAmount !== 0) throw new TypeError('Invalid FC ledger summary totals');
    return summary;
  }
  function ledgerRollupAdd(value, transaction) {
    var summary = normalizeLedgerRollup(value);
    var net = summary.netAmount + transaction.signedAmount;
    if (!Number.isSafeInteger(net)) throw new RangeError('FC ledger summary exceeds supported range');
    summary.netAmount = net;
    summary.transactionCount = Math.min(Number.MAX_SAFE_INTEGER, summary.transactionCount + 1);
    return summary;
  }

  function compactClaims(draft) {
    if (draft.processedClaimIds.length > RETENTION.legacyClaimIds) {
      throw new RangeError('Legacy claim capacity exhausted; reward-bearing matches require MatchClaimTokenV1');
    }
  }
  function claimWasProcessed(value, id) {
    return value.processedClaimIds.indexOf(id) >= 0;
  }
  function compactLedger(draft) {
    while (draft.fcTransactions.length > RETENTION.fcTransactions) {
      draft.fcTransactionRollup = ledgerRollupAdd(draft.fcTransactionRollup, draft.fcTransactions.shift());
    }
  }
  function revealWasConsumed(value, id) {
    return value.consumedRevealIds.indexOf(id) >= 0;
  }
  function consumeReveal(draft, id) {
    if (revealWasConsumed(draft, id)) return;
    if (draft.consumedRevealIds.length >= RETENTION.consumedRevealIds) {
      throw new RangeError('Consumed reveal capacity exhausted');
    }
    draft.consumedRevealIds.push(id);
  }
  function queueReveal(draft, id) {
    if (!id || revealWasConsumed(draft, id) || draft.pendingRevealIds.indexOf(id) >= 0) return false;
    if (draft.pendingRevealIds.length >= RETENTION.pendingReveals) {
      throw new RangeError('Pending reveal capacity exhausted');
    }
    draft.pendingRevealIds.push(id);
    return true;
  }

  function canonicalEntitlementClaims(value) {
    var source = value || {};
    var achievements = new Set(source.rewardedAchievementIds || []);
    var rivals = new Set(source.rewardedRivalIds || []);
    var acts = new Set((source.rewardedActIds || []).map(String));
    var cosmetics = new Set(source.ownedCosmeticIds || []);
    var retained = [];
    uniqueStrings(source.processedClaimIds).forEach(function (id) {
      var keep = id === 'migration:v111-to-v4';
      if (!keep && id.indexOf('achievement:') === 0) keep = achievements.has(id.slice(12));
      var rival = /^rival\.([a-z0-9-]+)\.first-clear$/.exec(id);
      if (!keep && rival) keep = rivals.has(rival[1]);
      var act = /^story\.act\.([1-4])\.first-clear$/.exec(id);
      if (!keep && act) keep = acts.has(act[1]);
      if (!keep && id.indexOf('cosmetic-purchase:') === 0) {
        keep = cosmetics.has(id.slice(18));
      }
      if (keep) retained.push(id);
    });
    if (retained.length > RETENTION.canonicalEntitlementClaimIds) {
      throw new RangeError('Canonical entitlement claims exceed the v1.12 catalog');
    }
    return retained;
  }

  function exactRewardTransaction(source, definition) {
    return (Array.isArray(source.fcTransactions) ? source.fcTransactions : []).some(function (entry) {
      try {
        var tx = FcTransactionV1(entry);
        if (tx.kind !== 'earn' || tx.sourceType !== definition.sourceType ||
            tx.sourceId !== definition.sourceId || tx.signedAmount !== definition.fc) return false;
        return definition.identities.some(function (identity) {
          return tx.txId === identity.txId && tx.idempotencyKey === identity.idempotencyKey;
        });
      } catch (_) { return false; }
    });
  }

  function canonicalAchievementImport(source, achievementId, validationOptions) {
    var authority = validationOptions && validationOptions.achievementImportAuthority ||
      DEFAULT_ACHIEVEMENT_IMPORT_AUTHORITY;
    if (!authority || !Object.isFrozen(authority) ||
        authority.schema !== 'AchievementImportAuthorityV1' || authority.version !== 1 ||
        typeof authority.verify !== 'function') return false;
    var definition;
    try { definition = authority.verify(achievementId); } catch (_) { return false; }
    if (!definition || !Object.isFrozen(definition) || definition.id !== achievementId ||
        !ACHIEVEMENT_RARITIES.has(definition.rarity)) return false;
    var reward = Economy.achievementReward(definition.rarity);
    if ((source.processedClaimIds || []).indexOf('achievement:' + achievementId) < 0) return false;
    return exactRewardTransaction(source, { sourceType: 'achievement', sourceId: achievementId,
      fc: reward.fc, identities: [{ txId: 'claim:achievement:' + achievementId + ':fc',
        idempotencyKey: 'claim:achievement:' + achievementId + ':fc' }] })
      ? freeze({ id: achievementId, fxp: reward.fxp }) : false;
  }

  function reconcileRewardEvidence(source, validationOptions) {
    var suppliedAchievements = Array.isArray(source.rewardedAchievementIds)
      ? source.rewardedAchievementIds.slice() : [];
    var suppliedRivals = Array.isArray(source.rewardedRivalIds)
      ? source.rewardedRivalIds.slice() : [];
    var suppliedActs = Array.isArray(source.rewardedActIds)
      ? source.rewardedActIds.slice() : [];
    source.rewardedAchievementIds = [];
    source.rewardedRivalIds = [];
    source.rewardedActIds = [];
    var achievements = new Set(Array.isArray(source.achievementIds) ? source.achievementIds : []);
    var rivals = new Set(Array.isArray(source.defeatedRivalIds) ? source.defeatedRivalIds : []);
    var acts = new Set(Array.isArray(source.completedActIds)
      ? source.completedActIds.map(String) : []);

    // The active local profile is already behind the writer/journal boundary.
    // Preserve its finite reward receipts even after the detailed FC ledger has
    // compacted.  Imported files receive no such trust: only exact catalog-owned
    // provenance may suppress a later legitimate award.
    if (validationOptions && validationOptions.preserveLocalRewardEvidence === true) {
      suppliedAchievements.forEach(function (id) {
        if (!achievements.has(id) ||
            (source.processedClaimIds || []).indexOf('achievement:' + id) < 0) {
          throw new TypeError('Persisted achievement reward evidence lacks its canonical processed claim');
        }
        addUnique(source.rewardedAchievementIds, id);
      });
      suppliedRivals.forEach(function (id) {
        if (!rivals.has(id) ||
            (source.processedClaimIds || []).indexOf('rival.' + id + '.first-clear') < 0) {
          throw new TypeError('Persisted rival reward evidence lacks its canonical processed claim');
        }
        addUnique(source.rewardedRivalIds, id);
      });
      suppliedActs.forEach(function (id) {
        var actId = String(id);
        if (!acts.has(actId) ||
            (source.processedClaimIds || []).indexOf('story.act.' + actId + '.first-clear') < 0) {
          throw new TypeError('Persisted Story reward evidence lacks its canonical processed claim');
        }
        addUnique(source.rewardedActIds, actId);
      });
      return source;
    }

    var achievementEvidence = [];
    var rivalEvidence = [];
    var actEvidence = [];
    suppliedAchievements.forEach(function (achievementId) {
      if (!achievements.has(achievementId)) return;
      var evidence = canonicalAchievementImport(source, achievementId, validationOptions);
      if (evidence) achievementEvidence.push(evidence);
    });
    suppliedRivals.forEach(function (rivalId) {
      var rival = Catalog.rival(rivalId);
      var claimId = 'rival.' + rivalId + '.first-clear';
      if (!rival || !rivals.has(rivalId) ||
          (source.processedClaimIds || []).indexOf(claimId) < 0 ||
          (rivalId !== 'visitor-zero' &&
            (source.ownedObjectIds || []).indexOf(rival.objectId) < 0)) return;
      var fc = rivalId === 'visitor-zero' ? 50 : 15;
      if (exactRewardTransaction(source, { sourceType: 'rival', sourceId: rivalId, fc: fc,
        identities: [
          { txId: 'claim:' + claimId + ':fc', idempotencyKey: 'claim:' + claimId + ':fc' },
          { txId: 'component:' + claimId + ':fc', idempotencyKey: claimId + ':fc' },
        ] })) rivalEvidence.push({ id: rivalId, fxp: rivalId === 'visitor-zero' ? 75 : 25 });
    });
    suppliedActs.forEach(function (actId) {
      var id = String(actId);
      var claimId = 'story.act.' + id + '.first-clear';
      if (!acts.has(id) || (source.processedClaimIds || []).indexOf(claimId) < 0 ||
          (source.fieldNoteIds || []).indexOf('field-note-act-' + id) < 0) return;
      if (exactRewardTransaction(source, { sourceType: 'story-act', sourceId: id, fc: 25,
        identities: [
          { txId: 'claim:' + claimId + ':fc', idempotencyKey: 'claim:' + claimId + ':fc' },
          { txId: 'component:' + claimId + ':fc', idempotencyKey: claimId + ':fc' },
        ] })) actEvidence.push({ id: id, fxp: 50 });
    });
    var requiredFxp = achievementEvidence.concat(rivalEvidence, actEvidence)
      .reduce(function (total, evidence) { return total + evidence.fxp; }, 0);
    // FXP has no spend path.  If the cumulative balance cannot contain every
    // claimed canonical award, none of those imported receipts is authoritative.
    if (!Number.isSafeInteger(source.fxp) || source.fxp < requiredFxp) return source;
    achievementEvidence.forEach(function (evidence) {
      addUnique(source.rewardedAchievementIds, evidence.id);
    });
    rivalEvidence.forEach(function (evidence) { addUnique(source.rewardedRivalIds, evidence.id); });
    actEvidence.forEach(function (evidence) { addUnique(source.rewardedActIds, evidence.id); });
    return source;
  }

  function validateImportedState(value, options) {
    var validationOptions = options || {};
    var source = safeClone(preflightImportedState(value));
    if (!source || source.schema !== 'ProgressionStateV4' || source.version !== 4 ||
        source.ownerTestMode === true || source.testData === true) {
      throw new TypeError('Imported profile must use ProgressionStateV4');
    }
    reconcileLegacyRevealNamespaces(source);
    [
      ['rewardedAchievementIds', STATE_CARDINALITY.rewardedAchievementIds],
      ['rewardedRivalIds', STATE_CARDINALITY.rewardedRivalIds],
      ['rewardedActIds', STATE_CARDINALITY.rewardedActIds],
    ].forEach(function (definition) {
      var field = definition[0];
      var values = source[field] == null ? [] : source[field];
      if (!Array.isArray(values) || values.length > definition[1]) {
        throw new TypeError('Imported profile has an invalid ' + field);
      }
      var seen = new Set();
      values.forEach(function (rawId) {
        var id = exactId(rawId, 'Imported ' + field + ' entry');
        if (seen.has(id)) {
          throw new TypeError('Imported profile has duplicate ' + field + ' entries');
        }
        seen.add(id);
      });
    });
    ['achievementIds', 'processedClaimIds', 'pendingRevealIds',
      'consumedRevealIds'].forEach(function (field) {
      var seen = new Set();
      (source[field] || []).forEach(function (rawId) {
        var id = exactId(rawId, 'Imported ' + field + ' entry');
        if (seen.has(id)) {
          throw new TypeError('Imported profile has duplicate ' + field + ' entries');
        }
        seen.add(id);
      });
    });
    if (validationOptions.allowTestOnlyAchievementIds !== true) {
      source.achievementIds = canonicalAchievementIds(source.achievementIds);
      source.rewardedAchievementIds = canonicalAchievementIds(source.rewardedAchievementIds);
      source.processedClaimIds = uniqueStrings(source.processedClaimIds).map(function (id) {
        if (id.indexOf('achievement:') !== 0) return id;
        var achievementId = canonicalAchievementId(id.slice(12));
        return achievementId ? 'achievement:' + achievementId : null;
      }).filter(Boolean);
      ['pendingRevealIds', 'consumedRevealIds'].forEach(function (field) {
        source[field] = uniqueStrings(source[field]).map(function (id) {
          if (id.indexOf('achievement.') !== 0) return id;
          var achievementId = canonicalAchievementId(id.slice(12));
          return achievementId ? 'achievement.' + achievementId : null;
        }).filter(Boolean);
      });
    }
    reconcileRewardEvidence(source, validationOptions);
    ['revision', 'fxp', 'fcBalance'].forEach(function (key) {
      if (!Number.isSafeInteger(source[key]) || source[key] < 0) {
        throw new TypeError('Imported profile has an invalid ' + key);
      }
    });
    if (source.lineageId != null) exactId(source.lineageId, 'Imported lineageId');
    if (source.lineageId === 'unassigned-v4') {
      throw new TypeError('Imported profiles require a unique assigned lineage');
    }
    if (source.matchClaimCursor != null) exactUnsignedInteger(source.matchClaimCursor,
      'Imported matchClaimCursor');
    if (source.consumedMatchOrdinal != null) exactUnsignedInteger(source.consumedMatchOrdinal,
      'Imported consumedMatchOrdinal');
    if ((source.consumedMatchOrdinal || 0) > (source.matchClaimCursor || 0)) {
      throw new TypeError('Imported consumed match ordinal exceeds its cursor');
    }
    if (source.activeMatchReservation != null) MatchClaimTokenV1(source.activeMatchReservation);
    if (source.legacy != null) {
      if (!source.legacy || typeof source.legacy !== 'object' || Array.isArray(source.legacy)) {
        throw new TypeError('Imported profile has invalid legacy metadata');
      }
      ['qualifyingWins', 'quarantinedMatchReservations', 'compactedLegacyClaims'].forEach(function (key) {
        if (source.legacy[key] != null) exactUnsignedInteger(source.legacy[key], 'Imported legacy.' + key);
      });
      ['reconciledV111', 'grandfatheredAlien', 'grandfatheredInsane'].forEach(function (key) {
        if (source.legacy[key] != null && typeof source.legacy[key] !== 'boolean') {
          throw new TypeError('Imported legacy.' + key + ' must be boolean');
        }
      });
      if (source.legacy.sourceRelease != null && typeof source.legacy.sourceRelease !== 'string') {
        throw new TypeError('Imported legacy.sourceRelease must be a string');
      }
    }
    var arrayLimits = {
      ownedObjectIds: STATE_CARDINALITY.ownedObjectIds,
      ownedArenaIds: STATE_CARDINALITY.ownedArenaIds,
      ownedCosmeticIds: STATE_CARDINALITY.ownedCosmeticIds,
      featureIds: STATE_CARDINALITY.featureIds,
      achievementIds: STATE_CARDINALITY.achievementIds,
      rewardedAchievementIds: STATE_CARDINALITY.rewardedAchievementIds,
      defeatedRivalIds: STATE_CARDINALITY.defeatedRivalIds,
      rewardedRivalIds: STATE_CARDINALITY.rewardedRivalIds,
      completedActIds: STATE_CARDINALITY.completedActIds,
      rewardedActIds: STATE_CARDINALITY.rewardedActIds,
      fieldNoteIds: STATE_CARDINALITY.fieldNoteIds,
      claimedRewardIds: STATE_CARDINALITY.claimedRewardIds,
      processedClaimIds: RETENTION.legacyClaimIds, pendingRevealIds: RETENTION.pendingReveals,
      consumedRevealIds: RETENTION.consumedRevealIds,
    };
    Object.keys(arrayLimits).forEach(function (key) {
      if (!Array.isArray(source[key] || (key.indexOf('consumed') === 0 ? [] : null)) ||
          (source[key] || []).length > arrayLimits[key]) {
        throw new TypeError('Imported profile has an invalid ' + key);
      }
      var seen = new Set();
      (source[key] || []).forEach(function (id) {
        var valid = exactId(id, 'Imported ' + key + ' entry');
        if (seen.has(valid)) throw new TypeError('Imported profile has duplicate ' + key + ' entries');
        seen.add(valid);
      });
    });
    if (source.externalClaimEvidence != null) {
      if (!Array.isArray(source.externalClaimEvidence) ||
          source.externalClaimEvidence.length > RETENTION.externalLineages) {
        throw new TypeError('Imported profile has invalid external claim evidence');
      }
      normalizeExternalLineages(source.externalClaimEvidence);
    }
    if (!Array.isArray(source.matchReceipts || []) ||
        (source.matchReceipts || []).length > RETENTION.matchReceipts) {
      throw new TypeError('Imported profile has invalid match receipts');
    }
    normalizeMatchReceipts(source.matchReceipts || [], source.consumedMatchOrdinal || 0);
    var rawSummary = source.fcTransactionRollup;
    if (rawSummary != null && (!rawSummary || typeof rawSummary !== 'object' || Array.isArray(rawSummary) ||
        rawSummary.schema !== 'FcLedgerSummaryV1' || rawSummary.version !== 1 ||
        typeof rawSummary.netAmount !== 'number' || !Number.isSafeInteger(rawSummary.netAmount) ||
        typeof rawSummary.transactionCount !== 'number' ||
        !Number.isSafeInteger(rawSummary.transactionCount) || rawSummary.transactionCount < 0)) {
      throw new TypeError('Imported profile has invalid FC ledger summary');
    }
    var ledgerRollup = normalizeLedgerRollup(rawSummary);
    if (!Array.isArray(source.fcTransactions) || source.fcTransactions.length > RETENTION.fcTransactions) {
      throw new TypeError('Imported profile has an invalid FC ledger');
    }
    var txIds = new Set();
    var keys = new Set();
    var balance = ledgerRollup.netAmount;
    if (balance < 0) throw new TypeError('Imported profile FC rollup starts below zero');
    source.fcTransactions.forEach(function (entry) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
          entry.schema !== 'FcTransactionV1' || entry.version !== 1 ||
          typeof entry.signedAmount !== 'number' || !Number.isSafeInteger(entry.signedAmount) ||
          typeof entry.balanceAfter !== 'number' || !Number.isSafeInteger(entry.balanceAfter) ||
          typeof entry.timestamp !== 'number' || !Number.isSafeInteger(entry.timestamp) || entry.timestamp < 0) {
        throw new TypeError('Imported profile contains an invalid FC transaction');
      }
      exactId(entry.txId, 'Imported FC transaction ID');
      exactId(entry.idempotencyKey, 'Imported FC idempotency key');
      exactId(entry.sourceId, 'Imported FC source ID');
      var tx = FcTransactionV1(entry);
      if (txIds.has(tx.txId) || keys.has(tx.idempotencyKey)) {
        throw new TypeError('Imported profile contains a duplicate FC transaction');
      }
      txIds.add(tx.txId); keys.add(tx.idempotencyKey);
      balance += tx.signedAmount;
      if (balance < 0 || tx.balanceAfter !== balance) {
        throw new TypeError('Imported profile FC ledger is inconsistent');
      }
    });
    if (balance !== source.fcBalance) {
      throw new TypeError('Imported profile FC balance does not match its ledger');
    }
    if (source.flipLevel != null && source.flipLevel !== Economy.flipLevelForFxp(source.fxp)) {
      throw new TypeError('Imported profile Flip Level does not match FXP');
    }
    if (source.activeMatchReservation != null && validationOptions.preserveReservation !== true) {
      var quarantinedReservation = MatchClaimTokenV1(source.activeMatchReservation);
      source.matchReceipts = (source.matchReceipts || []).concat([MatchReceiptV1({
        schema: 'MatchReceiptV1', version: 1,
        matchId: quarantinedReservation.matchId,
        activityId: quarantinedReservation.activityId,
        ordinal: quarantinedReservation.ordinal,
        resolution: 'abandoned',
        bearerNonce: quarantinedReservation.nonce,
        reservedAt: quarantinedReservation.reservedAt,
      })]);
      source.consumedMatchOrdinal = quarantinedReservation.ordinal;
      source.activeMatchReservation = null;
      source.legacy = safeClone(source.legacy || Object.create(null));
      source.legacy.quarantinedMatchReservations = finiteInteger(
        source.legacy.quarantinedMatchReservations) + 1;
    }
    var normalized = ProgressionStateV4(Object.assign(source, { fcTransactionRollup: ledgerRollup }));
    var objectSet = new Set(normalized.ownedObjectIds);
    var arenaSet = new Set(normalized.ownedArenaIds);
    var cosmeticSet = new Set(normalized.ownedCosmeticIds);
    var featureSet = new Set(normalized.featureIds);
    var achievementSet = new Set(normalized.achievementIds);
    var rewardedAchievementSet = new Set(normalized.rewardedAchievementIds);
    var rivalSet = new Set(normalized.defeatedRivalIds);
    var rewardedRivalSet = new Set(normalized.rewardedRivalIds);
    var actSet = new Set(normalized.completedActIds);
    var rewardedActSet = new Set(normalized.rewardedActIds);
    var noteSet = new Set(normalized.fieldNoteIds);
    normalized.rewardedAchievementIds.forEach(function (id) {
      if (!achievementSet.has(id)) {
        throw new TypeError('Imported achievement reward evidence lacks achievement state');
      }
    });
    normalized.rewardedRivalIds.forEach(function (id) {
      if (!rivalSet.has(id)) throw new TypeError('Imported rival reward evidence lacks completion');
    });
    normalized.rewardedActIds.forEach(function (id) {
      if (!actSet.has(id)) throw new TypeError('Imported Story reward evidence lacks completion');
    });
    normalized.ownedObjectIds.forEach(function (id) {
      if (!Catalog.object(id)) throw new TypeError('Imported profile contains an unsupported object');
    });
    normalized.ownedArenaIds.forEach(function (id) {
      if (!Catalog.arena(id)) throw new TypeError('Imported profile contains an unsupported arena');
    });
    normalized.ownedCosmeticIds.forEach(function (id) {
      if (!Catalog.storeCosmetic(id)) {
        throw new TypeError('Imported profile contains an unsupported cosmetic');
      }
    });
    normalized.featureIds.forEach(function (id) {
      if (['physics-lab', 'insane-mode'].indexOf(id) < 0) throw new TypeError('Imported profile contains an unsupported feature');
    });
    normalized.defeatedRivalIds.forEach(function (id) {
      var rival = Catalog.rival(id);
      if (!rival || rival.id !== id) throw new TypeError('Imported profile contains an unsupported rival');
      if (!rival.alien && !objectSet.has(rival.objectId)) throw new TypeError('Imported rival object is missing');
    });
    normalized.completedActIds.forEach(function (id) {
      if (STORY_ACT_IDS.indexOf(id) < 0) throw new TypeError('Imported profile contains an unsupported Story act');
      if (!noteSet.has('field-note-act-' + id)) throw new TypeError('Imported Story field note is missing');
    });
    normalized.fieldNoteIds.forEach(function (id) {
      var match = /^field-note-act-([1-4])$/.exec(id);
      if (!match || !actSet.has(match[1])) throw new TypeError('Imported Story field note is unsupported');
    });

    function assertRewardClaim(id) {
      var levelMatch = /^level\.(\d+)\.(?:object\.[a-z0-9-]+|arena\.[a-z0-9-]+|feature\.[a-z0-9-]+|fc|gate\.alien-insane)$/.exec(id);
      if (levelMatch) {
        var level = Number(levelMatch[1]);
        var reward = Catalog.rewardsAtLevel(level).find(function (entry) { return entry.id === id; });
        if (!reward || level > normalized.flipLevel) throw new TypeError('Imported level reward claim is unsupported');
        if (reward.type === 'object' && !objectSet.has(reward.contentId)) throw new TypeError('Imported object claim lacks ownership');
        if (reward.type === 'arena' && !arenaSet.has(reward.contentId)) throw new TypeError('Imported arena claim lacks ownership');
        if (reward.type === 'feature' && !featureSet.has(reward.contentId)) throw new TypeError('Imported feature claim lacks ownership');
        return;
      }
      var rivalMatch = /^rival\.([a-z0-9-]+)\.first-clear$/.exec(id);
      if (rivalMatch) {
        if (!rivalSet.has(rivalMatch[1])) throw new TypeError('Imported rival claim lacks completion');
        return;
      }
      var actMatch = /^story\.act\.([1-4])\.first-clear$/.exec(id);
      if (actMatch) {
        if (!actSet.has(actMatch[1])) throw new TypeError('Imported Story claim lacks completion');
        return;
      }
      if (id === 'condition.alien-defeated-at-level-100') {
        if (normalized.flipLevel < 100 || !rivalSet.has('visitor-zero')) throw new TypeError('Imported Alien gate claim is unsupported');
        return;
      }
      if (normalized.legacy.reconciledV111) {
        if (id.indexOf('object.') === 0 && objectSet.has(Catalog.canonicalObjectId(id.slice(7)))) return;
        if (id.indexOf('arena.') === 0 && arenaSet.has(Catalog.canonicalArenaId(id.slice(6)))) return;
        if (id.indexOf('feature.') === 0 && featureSet.has(id.slice(8))) return;
        if (cosmeticSet.has(id)) return;
      }
      throw new TypeError('Imported reward claim uses an unsupported namespace or lacks its effect');
    }
    normalized.claimedRewardIds.forEach(assertRewardClaim);
    normalized.processedClaimIds.forEach(function (id) {
      if (id === 'migration:v111-to-v4') return;
      if (id.indexOf('achievement:') === 0) {
        // Missing reward evidence is reconciled below by removing the
        // suppression identity. Entitlement alone must never suppress a later
        // evaluator-issued award.
        return;
      }
      var rivalClaim = /^rival\.([a-z0-9-]+)\.first-clear$/.exec(id);
      if (rivalClaim) {
        return;
      }
      var storyClaim = /^story\.act\.([1-4])\.first-clear$/.exec(id);
      if (storyClaim) {
        return;
      }
      if (id.indexOf('cosmetic-purchase:') === 0) {
        if (!cosmeticSet.has(id.slice(18))) {
          throw new TypeError('Imported cosmetic claim lacks ownership');
        }
        return;
      }
      if (/^(?:match:|story-match:|profile-import:|reveal-dismiss:)/.test(id)) return;
      throw new TypeError('Imported processed claim uses an unsupported namespace');
    });
    Catalog.rewardsThroughLevel(normalized.flipLevel).forEach(function (reward) {
      if (reward.type === 'conditional-feature') return;
      if (normalized.claimedRewardIds.indexOf(reward.id) < 0) {
        throw new TypeError('Imported profile is missing canonical level reward evidence');
      }
    });
    function assertReveal(id) {
      if (id.indexOf('object.') === 0 && objectSet.has(Catalog.canonicalObjectId(id.slice(7)))) return;
      if (id.indexOf('arena.') === 0 && arenaSet.has(Catalog.canonicalArenaId(id.slice(6)))) return;
      if (id.indexOf('feature.') === 0 && featureSet.has(id.slice(8))) return;
      if (/^level\.\d+\.fc$/.test(id) && normalized.claimedRewardIds.indexOf(id) >= 0) return;
      if (id.indexOf('achievement.') === 0 && achievementSet.has(id.slice(12))) return;
      if (id.indexOf('store.') === 0 && cosmeticSet.has(id.slice(6))) return;
      throw new TypeError('Imported reveal is not supported by content state');
    }
    normalized.pendingRevealIds.forEach(function (id) {
      assertReveal(id);
      if (revealWasConsumed(normalized, id)) throw new TypeError('Imported reveal is both pending and consumed');
    });
    normalized.consumedRevealIds.forEach(assertReveal);
    var canonicalProcessed = canonicalEntitlementClaims(normalized);
    if (canonicalProcessed.length !== normalized.processedClaimIds.length) {
      var quarantined = clone(normalized);
      quarantined.processedClaimIds = canonicalProcessed;
      quarantined.legacy.compactedLegacyClaims = Math.min(Number.MAX_SAFE_INTEGER,
        finiteInteger(quarantined.legacy.compactedLegacyClaims) +
        normalized.processedClaimIds.length - canonicalProcessed.length);
      return ProgressionStateV4(quarantined);
    }
    return normalized;
  }

  function isMonotonicExtension(current, incoming) {
    if (incoming.lineageId !== current.lineageId || incoming.revision <= current.revision ||
        incoming.fxp < current.fxp) return false;
    var setFields = ['ownedObjectIds', 'ownedArenaIds', 'ownedCosmeticIds', 'featureIds',
      'achievementIds', 'rewardedAchievementIds', 'defeatedRivalIds',
      'rewardedRivalIds', 'completedActIds', 'rewardedActIds', 'fieldNoteIds',
      'claimedRewardIds'];
    for (var index = 0; index < setFields.length; index++) {
      var nextSet = new Set(incoming[setFields[index]]);
      if (current[setFields[index]].some(function (id) { return !nextSet.has(id); })) return false;
    }
    if (current.processedClaimIds.some(function (id) { return !claimWasProcessed(incoming, id); })) return false;
    if (current.consumedRevealIds.some(function (id) { return !revealWasConsumed(incoming, id); })) return false;
    if (incoming.matchClaimCursor < current.matchClaimCursor ||
        incoming.consumedMatchOrdinal < current.consumedMatchOrdinal) return false;
    if (incoming.matchReceipts.length < current.matchReceipts.length) return false;
    if (current.matchReceipts.some(function (receipt, receiptIndex) {
      var nextReceipt = incoming.matchReceipts[receiptIndex];
      return !nextReceipt || nextReceipt.matchId !== receipt.matchId ||
        nextReceipt.activityId !== receipt.activityId ||
        nextReceipt.ordinal !== receipt.ordinal || nextReceipt.resolution !== receipt.resolution ||
        nextReceipt.bearerNonce !== receipt.bearerNonce ||
        nextReceipt.reservedAt !== receipt.reservedAt;
    })) return false;
    if (current.activeMatchReservation) {
      var stillActive = incoming.activeMatchReservation &&
        JSON.stringify(incoming.activeMatchReservation) === JSON.stringify(current.activeMatchReservation);
      if (!stillActive) {
        if (incoming.consumedMatchOrdinal < current.activeMatchReservation.ordinal) return false;
        var consumedReceipt = incoming.matchReceipts[
          current.activeMatchReservation.ordinal - 1];
        if (!consumedReceipt ||
            consumedReceipt.ordinal !== current.activeMatchReservation.ordinal ||
            consumedReceipt.matchId !== current.activeMatchReservation.matchId ||
            consumedReceipt.activityId !== current.activeMatchReservation.activityId ||
            consumedReceipt.bearerNonce !== current.activeMatchReservation.nonce ||
            consumedReceipt.reservedAt !==
              current.activeMatchReservation.reservedAt) return false;
      }
    }
    if (incoming.fcTransactionRollup.transactionCount < current.fcTransactionRollup.transactionCount) return false;
    var absorbed = incoming.fcTransactionRollup.transactionCount -
      current.fcTransactionRollup.transactionCount;
    if (absorbed > current.fcTransactions.length) return false;
    var expectedRollupNet = current.fcTransactionRollup.netAmount;
    current.fcTransactions.slice(0, absorbed).forEach(function (tx) {
      expectedRollupNet += tx.signedAmount;
    });
    if (incoming.fcTransactionRollup.netAmount !== expectedRollupNet) return false;
    var currentRemainder = current.fcTransactions.slice(Math.min(absorbed, current.fcTransactions.length));
    if (currentRemainder.some(function (tx, txIndex) {
      var next = incoming.fcTransactions[txIndex];
      return !next || next.txId !== tx.txId || next.idempotencyKey !== tx.idempotencyKey ||
        next.kind !== tx.kind || next.sourceType !== tx.sourceType || next.sourceId !== tx.sourceId ||
        next.signedAmount !== tx.signedAmount || next.balanceAfter !== tx.balanceAfter ||
        next.timestamp !== tx.timestamp;
    })) return false;
    if (current.pendingRevealIds.some(function (id) {
      return incoming.pendingRevealIds.indexOf(id) < 0 && !revealWasConsumed(incoming, id);
    })) return false;
    if (current.legacy.grandfatheredAlien && !incoming.legacy.grandfatheredAlien) return false;
    if (current.legacy.grandfatheredInsane && !incoming.legacy.grandfatheredInsane) return false;
    if (current.legacy.reconciledV111 && !incoming.legacy.reconciledV111) return false;
    if (incoming.legacy.qualifyingWins < current.legacy.qualifyingWins ||
        incoming.legacy.quarantinedMatchReservations < current.legacy.quarantinedMatchReservations ||
        incoming.legacy.compactedLegacyClaims < current.legacy.compactedLegacyClaims) return false;
    if (current.legacy.sourceRelease &&
        incoming.legacy.sourceRelease !== current.legacy.sourceRelease) return false;
    var incomingExternal = new Map(incoming.externalClaimEvidence.map(function (entry) {
      return [entry.lineageId, entry];
    }));
    if (current.externalClaimEvidence.some(function (entry) {
      var nextEvidence = incomingExternal.get(entry.lineageId);
      return !nextEvidence || nextEvidence.throughRevision < entry.throughRevision ||
        nextEvidence.fcHighWater < entry.fcHighWater;
    })) return false;
    var changed = incoming.fxp !== current.fxp || incoming.fcBalance !== current.fcBalance ||
      incoming.pendingRevealIds.join('\u0000') !== current.pendingRevealIds.join('\u0000') ||
      incoming.consumedRevealIds.join('\u0000') !== current.consumedRevealIds.join('\u0000') ||
      incoming.processedClaimIds.join('\u0000') !== current.processedClaimIds.join('\u0000') ||
      incoming.matchClaimCursor !== current.matchClaimCursor ||
      incoming.consumedMatchOrdinal !== current.consumedMatchOrdinal ||
      incoming.matchReceipts.length !== current.matchReceipts.length ||
      JSON.stringify(incoming.activeMatchReservation) !== JSON.stringify(current.activeMatchReservation) ||
      JSON.stringify(incoming.externalClaimEvidence) !==
        JSON.stringify(current.externalClaimEvidence) ||
      incoming.fcTransactions.map(function (tx) { return tx.txId; }).join('\u0000') !==
        current.fcTransactions.map(function (tx) { return tx.txId; }).join('\u0000') ||
      incoming.fcTransactionRollup.transactionCount !== current.fcTransactionRollup.transactionCount ||
      incoming.fcTransactionRollup.netAmount !== current.fcTransactionRollup.netAmount;
    if (!changed) changed = setFields.some(function (field) {
      return incoming[field].length !== current[field].length;
    });
    if (!changed) changed = incoming.legacy.qualifyingWins !== current.legacy.qualifyingWins ||
      incoming.legacy.quarantinedMatchReservations !== current.legacy.quarantinedMatchReservations ||
      incoming.legacy.compactedLegacyClaims !== current.legacy.compactedLegacyClaims ||
      incoming.legacy.reconciledV111 !== current.legacy.reconciledV111 ||
      incoming.legacy.grandfatheredAlien !== current.legacy.grandfatheredAlien ||
      incoming.legacy.grandfatheredInsane !== current.legacy.grandfatheredInsane ||
      incoming.legacy.sourceRelease !== current.legacy.sourceRelease;
    return changed;
  }

  function compactLegacyLocalClaimHistory(value) {
    if (!value || !Array.isArray(value.processedClaimIds)) return value;
    var source = safeClone(value);
    var seen = new Set();
    source.processedClaimIds.forEach(function (rawId) {
      var id = exactId(rawId, 'Persisted legacy claim ID');
      seen.add(id);
    });
    var retained = canonicalEntitlementClaims(source);
    var removed = seen.size - retained.length;
    if (!removed && retained.length === source.processedClaimIds.length) return value;
    source.processedClaimIds = retained;
    source.legacy = safeClone(source.legacy || Object.create(null));
    source.legacy.compactedLegacyClaims = Math.min(Number.MAX_SAFE_INTEGER,
      finiteInteger(source.legacy.compactedLegacyClaims) + removed);
    source.revision = Math.min(Number.MAX_SAFE_INTEGER, finiteInteger(source.revision) + 1);
    return source;
  }

  function createStore(options) {
    var opts = options || {};
    var testOnly = opts.testOnly === true;
    var achievementAuthority = opts.achievementAuthority || null;
    if (achievementAuthority != null) {
      exactOwnRecord(achievementAuthority, new Set(['schema', 'version', 'verify']),
        ['schema', 'version', 'verify'], 'Achievement reward authority');
      if (!Object.isFrozen(achievementAuthority) ||
          achievementAuthority.schema !== 'AchievementRewardAuthorityV1' ||
          achievementAuthority.version !== 1 || typeof achievementAuthority.verify !== 'function') {
        throw new TypeError('Achievement reward authority must be frozen AchievementRewardAuthorityV1');
      }
    }
    var storage = opts.storage || null;
    var writeAuthority = typeof opts.writeAuthority === 'function'
      ? opts.writeAuthority : function () { return true; };
    var mutationOwner = Object.freeze({});
    var mutationActive = false;
    var now = typeof opts.now === 'function' ? opts.now : function () { return Date.now(); };
    var listeners = new Set();
    var notificationQueue = [];
    var deliveringNotifications = false;
    var persistencePoisoned = false;
    var persistedSource = readProfileStorage(storage).value;
    var persisted = compactLegacyLocalClaimHistory(persistedSource);
    if (persisted && persisted.schema === 'ProgressionStateV4' && persisted.version !== 4) {
      throw new RangeError('Unsupported persisted ProgressionStateV4 version');
    }
    var loadedV4 = !!(persisted && persisted.schema === 'ProgressionStateV4' && persisted.version === 4);
    var state = loadedV4 ? validateImportedState(persisted, {
      preserveReservation: true, preserveLocalRewardEvidence: true,
      allowTestOnlyAchievementIds: testOnly,
    })
      : migrateV111(Object.assign({}, opts.legacy || {}, { storage: storage }));
    if (!loadedV4 || state.lineageId === 'unassigned-v4') {
      var initial = clone(state);
      initial.lineageId = exactId(opts.lineageId || opaqueIdentity('local-v4', now()), 'lineageId');
      state = ProgressionStateV4(initial);
    }
    var persistenceError = null;
    var hasDurableState = loadedV4;

    function closePersistence(message, cause) {
      persistencePoisoned = true;
      persistenceError = new Error(message + (cause && cause.message ? ': ' + cause.message : ''));
      persistenceError.fatal = true;
      return false;
    }

    function rollBackPrepared(previous, cause) {
      var restored = previous == null
        ? observeStorageRemove(storage, KEY)
        : observeStorageWrite(storage, KEY, previous);
      if (!restored.exact) {
        return closePersistence('Profile persistence rollback failed; store is closed',
          restored.readError || restored.writeError || cause);
      }
      var cleared = observeStorageRemove(storage, JOURNAL_KEY);
      if (!cleared.exact) {
        return closePersistence('Profile persistence rollback journal could not be cleared; store is closed',
          cleared.readError || cleared.writeError || cause);
      }
      persistenceError = cause || new Error('Profile persistence failed before commit');
      return false;
    }

    function persist(candidate) {
      if (!storage || typeof storage.setItem !== 'function') return true;
      if (persistencePoisoned) return false;
      var previous;
      var encoded;
      try {
        if (typeof storage.getItem !== 'function' || typeof storage.removeItem !== 'function') {
          throw new Error('Profile storage cannot support verified journal writes');
        }
        recoverProfileJournal(storage);
        previous = strictStorageRead(storage, KEY);
        encoded = JSON.stringify(candidate);
        if (encoded.length > 5000000) {
          throw new RangeError('Profile exceeds the supported persistence bound');
        }
      } catch (error) {
        persistenceError = error;
        return false;
      }

      if (previous === encoded) {
        hasDurableState = true;
        persistenceError = null;
        return true;
      }
      var prepared = encodeProfileJournal('prepared', previous, encoded);
      var committed = encodeProfileJournal('committed', previous, encoded);
      var journalWrite = observeStorageWrite(storage, JOURNAL_KEY, prepared);
      if (!journalWrite.exact) {
        if (journalWrite.readError) {
          return closePersistence('Profile journal preparation outcome is ambiguous; store is closed',
            journalWrite.readError);
        }
        var discardJournal = observeStorageRemove(storage, JOURNAL_KEY);
        if (!discardJournal.exact) {
          return closePersistence('Profile journal preparation could not be rolled back; store is closed',
            discardJournal.readError || discardJournal.writeError || journalWrite.writeError);
        }
        persistenceError = journalWrite.writeError || new Error('Profile journal preparation failed');
        return false;
      }

      var profileWrite = observeStorageWrite(storage, KEY, encoded);
      if (!profileWrite.exact) {
        if (profileWrite.readError) {
          return closePersistence('Profile candidate write outcome is ambiguous; store is closed',
            profileWrite.readError);
        }
        return rollBackPrepared(previous,
          profileWrite.writeError || new Error('Profile candidate verification failed'));
      }

      var commitWrite = observeStorageWrite(storage, JOURNAL_KEY, committed);
      if (!commitWrite.exact) {
        if (commitWrite.readError) {
          // The durable journal remains the sole recovery authority.  Do not
          // guess whether the commit marker crossed its storage boundary.
          return closePersistence('Profile commit marker outcome is ambiguous; store is closed',
            commitWrite.readError);
        }
        return rollBackPrepared(previous,
          commitWrite.writeError || new Error('Profile commit marker verification failed'));
      }

      var cleanup = observeStorageRemove(storage, JOURNAL_KEY);
      if (!cleanup.exact && cleanup.current !== committed) {
        return closePersistence('Committed profile journal became unreadable; store is closed',
          cleanup.readError || cleanup.writeError);
      }
      // A remove operation that throws before removing leaves an exact
      // committed marker.  It is safe to report success: every reader and the
      // next writer will select the candidate and can retry cleanup.
      hasDurableState = true;
      persistenceError = null;
      return true;
    }
    if (writeAuthority() && (!loadedV4 || JSON.stringify(persistedSource) !== JSON.stringify(state))) {
      hasDurableState = persist(state);
    }

    function snapshot() { return ProgressionStateV4(state); }
    function notify(event) {
      notificationQueue.push(event);
      if (deliveringNotifications) return;
      deliveringNotifications = true;
      try {
        while (notificationQueue.length) {
          var nextEvent = notificationQueue.shift();
          var delivery = Array.from(listeners);
          delivery.forEach(function (listener) {
            try { listener(nextEvent.state, nextEvent); } catch (_) {}
          });
        }
      } finally { deliveringNotifications = false; }
    }
    function result(applied, claimId, extra) {
      return freeze(Object.assign({ applied: applied, duplicate: !applied && !!claimId,
        claimId: claimId || null, state: snapshot() }, extra || {}));
    }
    function refresh() {
      if (persistencePoisoned) return snapshot();
      var external;
      try { external = readProfileStorage(storage).value; }
      catch (error) {
        persistenceError = error;
        persistencePoisoned = true;
        return snapshot();
      }
      if (external && external.schema === 'ProgressionStateV4' && external.version === 4) {
        try {
          var validated = validateImportedState(external, {
            preserveReservation: true, preserveLocalRewardEvidence: true,
            allowTestOnlyAchievementIds: testOnly,
          });
          if (!hasDurableState) {
            var differs = JSON.stringify(validated) !== JSON.stringify(state);
            state = validated;
            hasDurableState = true;
            if (differs) notify(freeze({ applied: true, duplicate: false, claimId: null,
              reason: 'first-durable-lineage', type: 'external-refresh', state: snapshot() }));
          } else if (validated.lineageId !== state.lineageId) {
            persistenceError = new Error('Durable profile lineage divergence; store is closed');
            persistenceError.fatal = true;
            persistencePoisoned = true;
          } else if (validated.revision === state.revision &&
              JSON.stringify(validated) !== JSON.stringify(state)) {
            persistenceError = new Error('Equal-revision profile divergence; store is closed');
            persistenceError.fatal = true;
            persistencePoisoned = true;
          } else if (validated.revision > state.revision && isMonotonicExtension(state, validated)) {
            state = validated;
            notify(freeze({ applied: true, duplicate: false, claimId: null,
              reason: 'external-extension', type: 'external-refresh', state: snapshot() }));
          } else if (validated.revision > state.revision) {
            persistenceError = new Error('Non-monotonic profile extension; store is closed');
            persistenceError.fatal = true;
            persistencePoisoned = true;
          }
        } catch (error) {
          persistenceError = error;
          persistenceError.fatal = true;
          persistencePoisoned = true;
        }
      }
      return snapshot();
    }
    function enterMutation() {
      if (!writeAuthority()) return 'writer-read-only';
      if (mutationActive) return 'writer-busy';
      if (storage && (typeof storage === 'object' || typeof storage === 'function')) {
        var current = IN_REALM_STORAGE_WRITERS.get(storage);
        if (current && current !== mutationOwner) return 'writer-busy';
        IN_REALM_STORAGE_WRITERS.set(storage, mutationOwner);
      }
      mutationActive = true;
      return null;
    }
    function exitMutation() {
      mutationActive = false;
      if (storage && (typeof storage === 'object' || typeof storage === 'function') &&
          IN_REALM_STORAGE_WRITERS.get(storage) === mutationOwner) {
        IN_REALM_STORAGE_WRITERS.delete(storage);
      }
    }
    function commit(claimId, updater) {
      var id = exactId(claimId, 'profile claimId');
      var writerFailure = enterMutation();
      if (writerFailure) return result(false, null, { duplicate: false, reason: writerFailure });
      var committed;
      try {
      if (persistencePoisoned) return result(false, null, { duplicate: false, reason: 'persistence-closed' });
      refresh();
      if (claimWasProcessed(state, id)) return result(false, id, {
        reason: state.processedClaimIds.indexOf(id) >= 0 ? 'duplicate' : 'duplicate-compacted',
      });
      var draft = clone(state);
      var details = updater(draft) || {};
      addUnique(draft.processedClaimIds, id);
      compactClaims(draft);
      draft.revision = Math.max(state.revision + 1, finiteInteger(draft.revision) + 1);
      draft.flipLevel = Economy.flipLevelForFxp(draft.fxp);
      var next = ProgressionStateV4(draft);
      if (!persist(next)) return result(false, null, { duplicate: false,
        reason: persistencePoisoned ? 'persistence-closed' : 'persistence-failed' });
      state = next;
      committed = result(true, id, details);
      } finally {
        exitMutation();
      }
      notify(committed);
      return committed;
    }
    function commitMutation(updater) {
      var writerFailure = enterMutation();
      if (writerFailure) return result(false, null, { duplicate: false, reason: writerFailure });
      var committed;
      try {
      if (persistencePoisoned) return result(false, null, { duplicate: false, reason: 'persistence-closed' });
      refresh();
      var draft = clone(state);
      var details = updater(draft) || {};
      draft.revision = state.revision + 1;
      var next = ProgressionStateV4(draft);
      if (!persist(next)) return result(false, null, { duplicate: false,
        reason: persistencePoisoned ? 'persistence-closed' : 'persistence-failed' });
      state = next;
      committed = result(true, null, details);
      } finally {
        exitMutation();
      }
      notify(committed);
      return committed;
    }
    function sameMatchToken(left, right) {
      return !!left && !!right && left.schema === right.schema && left.version === right.version &&
        left.lineageId === right.lineageId && left.ordinal === right.ordinal &&
        left.nonce === right.nonce && left.matchId === right.matchId &&
        left.activityId === right.activityId && left.reservedAt === right.reservedAt;
    }
    function matchReceiptForId(matchId) {
      for (var index = 0; index < state.matchReceipts.length; index++) {
        if (state.matchReceipts[index].matchId === matchId) return state.matchReceipts[index];
      }
      return null;
    }
    function appendMatchReceipt(draft, token, resolution) {
      if (draft.matchReceipts.some(function (receipt) {
        return receipt.matchId === token.matchId || receipt.ordinal === token.ordinal;
      })) throw new RangeError('Match receipt identity already exists');
      if (draft.matchReceipts.length >= RETENTION.matchReceipts) {
        throw new RangeError('Match receipt capacity is exhausted');
      }
      draft.matchReceipts.push(MatchReceiptV1({ schema: 'MatchReceiptV1', version: 1,
        matchId: token.matchId, activityId: token.activityId,
        ordinal: token.ordinal, resolution: resolution,
        bearerNonce: token.nonce, reservedAt: token.reservedAt }));
    }
    function reserveMatch(matchId, activityId) {
      var immutableMatchId = exactId(matchId, 'matchId');
      var activity = exactId(activityId, 'activityId');
      if (!MATCH_ACTIVITY_IDS.has(activity)) throw new RangeError('Activity cannot reserve reward-bearing matches');
      refresh();
      if (persistencePoisoned) {
        return result(false, null, { duplicate: false, reason: 'persistence-closed' });
      }
      var priorReceipt = matchReceiptForId(immutableMatchId);
      if (priorReceipt) {
        return result(false, 'local-match:' + state.lineageId + ':' + priorReceipt.ordinal,
          { reason: 'match-already-resolved', resolution: priorReceipt.resolution });
      }
      if (state.activeMatchReservation) {
        if (state.activeMatchReservation.matchId === immutableMatchId &&
            state.activeMatchReservation.activityId === activity) {
          return result(false, null, { duplicate: false, resumed: true,
            reason: 'reservation-active' });
        }
        return result(false, null, { duplicate: false, reason: 'another-match-active' });
      }
      if (state.matchReceipts.length >= RETENTION.matchReceipts) {
        return result(false, null, { duplicate: false, reason: 'match-receipt-capacity' });
      }
      if (state.matchClaimCursor >= Number.MAX_SAFE_INTEGER) {
        return result(false, null, { duplicate: false, reason: 'match-ordinal-exhausted' });
      }
      var ordinal = state.matchClaimCursor + 1;
      var reservedAt = finiteInteger(now());
      var token = MatchClaimTokenV1({ schema: 'MatchClaimTokenV1', version: 1,
        lineageId: state.lineageId, ordinal: ordinal,
        nonce: opaqueIdentity('match-nonce-' + ordinal.toString(36), reservedAt),
        matchId: immutableMatchId, activityId: activity, reservedAt: reservedAt });
      return commitMutation(function (draft) {
        if (draft.activeMatchReservation) throw new Error('A reward-bearing match is already reserved');
        draft.matchClaimCursor = ordinal;
        draft.activeMatchReservation = token;
        return { type: 'match-reserved', token: token };
      });
    }
    function resumeMatchReservation() {
      refresh();
      return state.activeMatchReservation;
    }
    function resolveReservationToken(value) {
      var token = MatchClaimTokenV1(value);
      refresh();
      if (token.lineageId !== state.lineageId) throw new RangeError('Match token belongs to another profile lineage');
      if (!state.activeMatchReservation) {
        if (token.ordinal <= state.consumedMatchOrdinal) {
          var receipt = state.matchReceipts[token.ordinal - 1];
          if (!receipt || receipt.ordinal !== token.ordinal ||
              receipt.matchId !== token.matchId || receipt.activityId !== token.activityId ||
              receipt.bearerNonce == null || receipt.reservedAt == null ||
              receipt.bearerNonce !== token.nonce || receipt.reservedAt !== token.reservedAt) {
            throw new RangeError('Resolved match token does not match its exact durable receipt');
          }
          return { token: token, duplicate: true };
        }
        throw new RangeError('Match token is not the active reservation');
      }
      if (!sameMatchToken(token, state.activeMatchReservation)) {
        throw new RangeError('Match token does not match the active reservation');
      }
      return { token: token, duplicate: false };
    }
    function consumeReservedMatch(tokenInput, rewardInput) {
      var resolved = resolveReservationToken(tokenInput);
      var token = resolved.token;
      var claimId = 'local-match:' + token.lineageId + ':' + token.ordinal;
      if (resolved.duplicate) return result(false, claimId, { reason: 'duplicate' });
      if (token.activityId !== 'free-play') {
        throw new RangeError('Story match rewards require claimStoryMatchResolution');
      }
      var rewardSource = validateMatchRewardInput(rewardInput);
      if (Object.prototype.hasOwnProperty.call(rewardSource, 'activityId') &&
          rewardSource.activityId !== token.activityId) {
        throw new RangeError('Match reward activityId does not match its reservation');
      }
      rewardSource.activityId = token.activityId;
      var reward = Economy.calculateMatchReward(rewardSource);
      return commitMutation(function (draft) {
        if (!sameMatchToken(token, draft.activeMatchReservation)) {
          throw new RangeError('Match token was superseded before consumption');
        }
        draft.activeMatchReservation = null;
        draft.consumedMatchOrdinal = token.ordinal;
        appendMatchReceipt(draft, token, 'consumed');
        if (!reward.eligible) return { claimId: claimId, consumed: true,
          reward: reward, reason: reward.reason, fxpAwarded: 0, fcAwarded: 0, granted: [] };
        var beforeLevel = draft.flipLevel;
        var beforeBalance = draft.fcBalance;
        draft.fxp = Math.min(Number.MAX_SAFE_INTEGER, draft.fxp + reward.fxp);
        draft.flipLevel = Economy.flipLevelForFxp(draft.fxp);
        if (reward.fc) appendFc(draft, {
          txId: claimId + ':fc', idempotencyKey: claimId + ':fc',
          kind: 'earn', sourceType: 'match', sourceId: token.matchId,
          signedAmount: reward.fc, timestamp: finiteInteger(now()),
        });
        var granted = grantLevelsCrossed(draft, beforeLevel, { reveal: true, now: finiteInteger(now()) });
        granted = granted.concat(grantAlienGate(draft, true));
        return { claimId: claimId, consumed: true, reward: reward,
          fxpAwarded: reward.fxp, fcAwarded: draft.fcBalance - beforeBalance,
          baseFcAwarded: reward.fc,
          levelsCrossed: Math.max(0, draft.flipLevel - beforeLevel),
          granted: uniqueStrings(granted) };
      });
    }
    function abandonReservedMatch(tokenInput, reasonInput) {
      var resolved = resolveReservationToken(tokenInput);
      var token = resolved.token;
      var claimId = 'local-match:' + token.lineageId + ':' + token.ordinal;
      if (resolved.duplicate) return result(false, claimId, { reason: 'duplicate' });
      var reason = reasonInput == null ? 'abandoned' : exactId(reasonInput, 'abandon reason');
      return commitMutation(function (draft) {
        if (!sameMatchToken(token, draft.activeMatchReservation)) {
          throw new RangeError('Match token was superseded before abandonment');
        }
        draft.activeMatchReservation = null;
        draft.consumedMatchOrdinal = token.ordinal;
        appendMatchReceipt(draft, token, 'abandoned');
        return { claimId: claimId, consumed: true, abandoned: true,
          reason: reason, fxpAwarded: 0, fcAwarded: 0, granted: [] };
      });
    }
    function claimBundle(bundle) {
      var source = exactOwnRecord(bundle, new Set([
        'claimId', 'fxp', 'fc', 'sourceType', 'sourceId', 'objectIds',
        'arenaIds', 'cosmeticIds', 'featureIds', 'achievementIds', 'rivalIds',
        'actIds', 'fieldNoteIds', 'feedbackIds', 'reveal',
      ]), ['claimId', 'sourceType'], 'Canonical reward bundle');
      if (Object.prototype.hasOwnProperty.call(source, 'reveal') &&
          typeof source.reveal !== 'boolean') {
        throw new TypeError('Canonical reward bundle reveal must be boolean');
      }
      var claimId = exactId(source.claimId, 'claimBundle.claimId');
      var fxpInput = source.fxp == null ? 0 : exactUnsignedInteger(source.fxp, 'claimBundle.fxp');
      var fcInput = source.fc == null ? 0 : exactSignedInteger(source.fc, 'claimBundle.fc');
      var sourceTypeInput = source.sourceType == null ? 'match' : exactId(source.sourceType, 'claimBundle.sourceType');
      if (!FC_SOURCES.has(sourceTypeInput)) throw new RangeError('Unknown claimBundle source type');
      if (sourceTypeInput === 'match') {
        throw new TypeError('Reward-bearing match claims require a reserved MatchClaimTokenV1');
      }
      function exactIds(values, label, mapper) {
        if (values == null) return [];
        if (!Array.isArray(values)) throw new TypeError(label + ' must be an array');
        return uniqueStrings(values.map(function (id) { return exactId(id, label + ' entry'); }), mapper);
      }
      var objectInputs = exactIds(source.objectIds, 'claimBundle.objectIds', Catalog.canonicalObjectId);
      var arenaInputs = exactIds(source.arenaIds, 'claimBundle.arenaIds', Catalog.canonicalArenaId);
      var cosmeticInputs = exactIds(source.cosmeticIds, 'claimBundle.cosmeticIds');
      var featureInputs = exactIds(source.featureIds, 'claimBundle.featureIds');
      var achievementInputs = exactIds(source.achievementIds, 'claimBundle.achievementIds');
      var rivalInputs = exactIds(source.rivalIds, 'claimBundle.rivalIds');
      var actInputs = exactIds(source.actIds, 'claimBundle.actIds');
      var noteInputs = exactIds(source.fieldNoteIds, 'claimBundle.fieldNoteIds');
      var feedbackInputs = exactIds(source.feedbackIds, 'claimBundle.feedbackIds');
      objectInputs.forEach(function (id) { if (!Catalog.object(id)) throw new RangeError('Unknown object: ' + id); });
      arenaInputs.forEach(function (id) { if (!Catalog.arena(id)) throw new RangeError('Unknown arena: ' + id); });
      cosmeticInputs.forEach(function (id) { if (!Catalog.storeCosmetic(id)) throw new RangeError('Unknown cosmetic: ' + id); });
      featureInputs.forEach(function (id) {
        if (['physics-lab', 'insane-mode'].indexOf(id) < 0) throw new RangeError('Unknown feature: ' + id);
      });
      rivalInputs.forEach(function (id) {
        var rival = Catalog.rival(id); if (!rival || rival.id !== id) throw new RangeError('Unknown rival: ' + id);
      });
      actInputs.forEach(storyActId);
      noteInputs.forEach(function (id) {
        if (!/^field-note-act-[1-4]$/.test(id)) throw new RangeError('Unknown field note: ' + id);
      });
      return commit(claimId, function (draft) {
        var beforeLevel = draft.flipLevel;
        var beforeBalance = draft.fcBalance;
        var granted = [];
        var fxp = fxpInput;
        var fc = fcInput;
        var sourceType = sourceTypeInput;
        if (fc < 0 && sourceType !== 'cosmetic-purchase') {
          throw new RangeError('Flip Credits may only be spent on a cosmetic purchase');
        }
        draft.fxp = Math.min(Number.MAX_SAFE_INTEGER, draft.fxp + fxp);
        draft.flipLevel = Economy.flipLevelForFxp(draft.fxp);
        if (fc) appendFc(draft, {
          txId: 'claim:' + claimId + ':fc', idempotencyKey: 'claim:' + claimId + ':fc',
          kind: fc < 0 ? 'spend' : (source.sourceType === 'migration' ? 'migration' : 'earn'),
          sourceType: sourceType,
          sourceId: source.sourceId == null ? claimId : exactId(source.sourceId, 'claimBundle.sourceId'),
          signedAmount: fc, timestamp: finiteInteger(now()),
        });
        objectInputs.forEach(function (id) {
          if (draft.ownedObjectIds.indexOf(id) < 0) { draft.ownedObjectIds.push(id); granted.push('object.' + id); }
        });
        arenaInputs.forEach(function (id) {
          if (draft.ownedArenaIds.indexOf(id) < 0) { draft.ownedArenaIds.push(id); granted.push('arena.' + id); }
        });
        cosmeticInputs.forEach(function (id) {
          if (draft.ownedCosmeticIds.indexOf(id) < 0) {
            draft.ownedCosmeticIds.push(id); granted.push('store.' + id);
          }
        });
        featureInputs.forEach(function (id) {
          if (draft.featureIds.indexOf(id) < 0) { draft.featureIds.push(id); granted.push('feature.' + id); }
        });
        achievementInputs.forEach(function (id) {
          addUnique(draft.achievementIds, id);
          if (sourceType === 'achievement') addUnique(draft.rewardedAchievementIds, id);
        });
        rivalInputs.forEach(function (id) {
          addUnique(draft.defeatedRivalIds, id);
          if (sourceType === 'rival') addUnique(draft.rewardedRivalIds, id);
        });
        actInputs.forEach(function (id) {
          addUnique(draft.completedActIds, id);
          if (sourceType === 'story-act') addUnique(draft.rewardedActIds, id);
        });
        noteInputs.forEach(function (id) { addUnique(draft.fieldNoteIds, id); });
        granted = granted.concat(grantLevelsCrossed(draft, beforeLevel, { reveal: source.reveal !== false, now: now() }));
        granted = granted.concat(grantAlienGate(draft, source.reveal !== false));
        var feedback = feedbackInputs;
        feedback.forEach(function (id) {
          if (id.indexOf('achievement.') === 0 && draft.achievementIds.indexOf(id.slice(12)) >= 0) return;
          if (id.indexOf('store.') === 0 && draft.ownedCosmeticIds.indexOf(id.slice(6)) >= 0) return;
          throw new RangeError('Unsupported reward feedback: ' + id);
        });
        if (source.reveal !== false) granted.concat(feedback).forEach(function (id) {
          queueReveal(draft, id);
        });
        return { fxpAwarded: fxp, fcAwarded: draft.fcBalance - beforeBalance,
          baseFcAwarded: fc, levelsCrossed: Math.max(0, draft.flipLevel - beforeLevel),
          granted: uniqueStrings(granted), feedback: feedback };
      });
    }
    function claimMatch(matchToken, rewardInput) {
      return consumeReservedMatch(matchToken, rewardInput);
    }
    function claimAchievement(idOrEvidence, rarity) {
      var definition = testOnly
        ? { id: exactId(idOrEvidence, 'achievementId'),
          rarity: exactId(rarity, 'achievement rarity') }
        : achievementDefinitionFromAuthority(achievementAuthority, idOrEvidence);
      var achievementId = definition.id;
      var achievementRarity = definition.rarity;
      if (!ACHIEVEMENT_RARITIES.has(achievementRarity)) {
        throw new RangeError('Unknown achievement rarity: ' + achievementRarity);
      }
      refresh();
      if (state.rewardedAchievementIds.indexOf(achievementId) >= 0) {
        return result(false, 'achievement:' + achievementId, { reason: 'duplicate' });
      }
      var reward = Economy.achievementReward(achievementRarity);
      return claimBundle({ claimId: 'achievement:' + achievementId, sourceType: 'achievement',
        sourceId: achievementId, fxp: reward.fxp, fc: reward.fc,
        achievementIds: [achievementId], feedbackIds: ['achievement.' + achievementId], reveal: true });
    }
    function claimRivalVictory(idOrObjectId, immutableClaimId) {
      refresh();
      var requestedRivalId = exactId(idOrObjectId, 'rivalId');
      var rival = Catalog.rival(requestedRivalId);
      if (!rival) throw new RangeError('Unknown rival: ' + idOrObjectId);
      var expectedClaimId = 'rival.' + rival.id + '.first-clear';
      var claimId = immutableClaimId == null ? expectedClaimId : exactId(immutableClaimId, 'rival claimId');
      if (claimId !== expectedClaimId) throw new RangeError('Rival claim ID does not match StoryCatalogV1');
      if (state.rewardedRivalIds.indexOf(rival.id) >= 0) return result(false, claimId, { reason: 'duplicate' });
      var alien = rival.id === 'visitor-zero';
      return claimBundle({ claimId: claimId, sourceType: 'rival', sourceId: rival.id,
        fxp: alien ? 75 : 25, fc: alien ? 50 : 15,
        objectIds: alien ? [] : [rival.objectId], rivalIds: [rival.id], reveal: true });
    }
    function claimStoryAct(actId, fieldNoteId, immutableClaimId) {
      refresh();
      var id = storyActId(actId);
      var expectedClaimId = 'story.act.' + id + '.first-clear';
      var claimId = immutableClaimId == null ? expectedClaimId : exactId(immutableClaimId, 'Story act claimId');
      var expectedFieldNoteId = 'field-note-act-' + id;
      var noteId = fieldNoteId == null ? expectedFieldNoteId : exactId(fieldNoteId, 'fieldNoteId');
      if (claimId !== expectedClaimId) throw new RangeError('Story act claim ID does not match StoryCatalogV1');
      if (noteId !== expectedFieldNoteId) throw new RangeError('Story field note ID does not match StoryCatalogV1');
      if (state.rewardedActIds.indexOf(id) >= 0) return result(false, claimId, { reason: 'duplicate' });
      return claimBundle({ claimId: claimId, sourceType: 'story-act', sourceId: id,
        fxp: 50, fc: 25, actIds: [id], fieldNoteIds: [noteId], reveal: false });
    }
    function normalizeStoryReward(rewardInput) {
      var baseFields = new Set(['claimId', 'type', 'fxp', 'fc']);
      var raw = exactOwnRecord(rewardInput,
        new Set(['claimId', 'type', 'rivalId', 'objectId', 'actId',
          'fieldNoteId', 'fxp', 'fc']), ['claimId', 'type', 'fxp', 'fc'],
        'Story reward');
      var type = exactId(raw.type, 'Story reward type');
      if (type === 'rival-first-clear') {
        exactOwnRecord(raw, new Set(Array.from(baseFields).concat(['rivalId', 'objectId'])),
          ['claimId', 'type', 'rivalId', 'objectId', 'fxp', 'fc'], 'Story rival reward');
        var rivalId = exactId(raw.rivalId, 'Story rivalId');
        var objectId = exactId(raw.objectId, 'Story objectId');
        var rival = Catalog.rival(rivalId);
        if (!rival || objectId !== rival.objectId) {
          throw new RangeError('Story rival reward does not match StoryCatalogV1');
        }
        var alien = rival.id === 'visitor-zero';
        if (exactUnsignedInteger(raw.fxp, 'Story reward FXP') !== (alien ? 75 : 25) ||
            exactUnsignedInteger(raw.fc, 'Story reward FC') !== (alien ? 50 : 15)) {
          throw new RangeError('Story rival reward amount does not match StoryCatalogV1');
        }
        var rivalClaimId = exactId(raw.claimId, 'Story rival reward claimId');
        if (rivalClaimId !== 'rival.' + rival.id + '.first-clear') {
          throw new RangeError('Rival claim ID does not match StoryCatalogV1');
        }
        return freeze({ claimId: rivalClaimId, type: type, rivalId: rival.id,
          objectId: rival.objectId, fxp: alien ? 75 : 25, fc: alien ? 50 : 15,
          alien: alien });
      }
      if (type === 'act-first-clear') {
        exactOwnRecord(raw, new Set(Array.from(baseFields).concat(['actId', 'fieldNoteId'])),
          ['claimId', 'type', 'actId', 'fieldNoteId', 'fxp', 'fc'], 'Story act reward');
        var id = storyActId(raw.actId);
        if (exactUnsignedInteger(raw.fxp, 'Story reward FXP') !== 50 ||
            exactUnsignedInteger(raw.fc, 'Story reward FC') !== 25) {
          throw new RangeError('Story act reward amount does not match StoryCatalogV1');
        }
        var actClaimId = exactId(raw.claimId, 'Story act reward claimId');
        var expectedClaimId = 'story.act.' + id + '.first-clear';
        var expectedFieldNoteId = 'field-note-act-' + id;
        if (actClaimId !== expectedClaimId) {
          throw new RangeError('Story act claim ID does not match StoryCatalogV1');
        }
        if (exactId(raw.fieldNoteId, 'Story fieldNoteId') !== expectedFieldNoteId) {
          throw new RangeError('Story field note ID does not match StoryCatalogV1');
        }
        return freeze({ claimId: actClaimId, type: type, actId: id,
          fieldNoteId: expectedFieldNoteId, fxp: 50, fc: 25 });
      }
      throw new RangeError('Unknown Story reward type: ' + type);
    }
    function claimStoryReward(rewardInput) {
      var reward = normalizeStoryReward(rewardInput);
      if (reward.type === 'rival-first-clear') {
        return claimRivalVictory(reward.rivalId, reward.claimId);
      }
      return claimStoryAct(reward.actId, reward.fieldNoteId, reward.claimId);
    }
    function claimStoryMatchResolution(input) {
      var source = exactOwnRecord(input, new Set([
        'matchId', 'ordinaryRewardsEligible', 'rewardInput', 'rewards',
        'matchClaimToken',
      ]), ['matchId', 'ordinaryRewardsEligible', 'rewards'], 'Story match resolution');
      var matchId = exactId(source.matchId, 'Story matchId');
      if (typeof source.ordinaryRewardsEligible !== 'boolean') {
        throw new TypeError('Story ordinaryRewardsEligible must be boolean');
      }
      if (!Array.isArray(source.rewards) || source.rewards.length > 2) {
        throw new TypeError('Story rewards must be an array of at most two canonical components');
      }
      var componentRewards = source.rewards.map(normalizeStoryReward);
      var componentIds = new Set();
      componentRewards.forEach(function (reward) {
        if (componentIds.has(reward.claimId)) {
          throw new RangeError('Duplicate Story component reward: ' + reward.claimId);
        }
        componentIds.add(reward.claimId);
      });
      var ordinaryRequested = source.ordinaryRewardsEligible === true;
      var reservation = null;
      var token = null;
      if (ordinaryRequested) {
        if (!Object.prototype.hasOwnProperty.call(source, 'matchClaimToken')) {
          throw new TypeError('Story ordinary rewards require MatchClaimTokenV1');
        }
        reservation = resolveReservationToken(source.matchClaimToken);
        token = reservation.token;
        if (token.matchId !== matchId || token.activityId !== 'story') {
          throw new RangeError('Story match token does not match the Story resolution');
        }
        if (reservation.duplicate) {
          return result(false, 'local-match:' + token.lineageId + ':' + token.ordinal,
            { reason: 'duplicate' });
        }
      } else if (Object.prototype.hasOwnProperty.call(source, 'matchClaimToken')) {
        throw new TypeError('A component-only Story resolution cannot consume a match token');
      }
      var ordinaryRewardSource = ordinaryRequested ? validateMatchRewardInput(source.rewardInput) : null;
      if (ordinaryRewardSource && Object.prototype.hasOwnProperty.call(
        ordinaryRewardSource, 'activityId') && ordinaryRewardSource.activityId !== token.activityId) {
        throw new RangeError('Story reward activityId does not match its reservation');
      }
      if (ordinaryRewardSource) ordinaryRewardSource.activityId = token.activityId;
      var ordinaryReward = ordinaryRequested ? Economy.calculateMatchReward(ordinaryRewardSource) : null;
      var unapplied = componentRewards.filter(function (reward) {
        return reward.type === 'rival-first-clear'
          ? state.rewardedRivalIds.indexOf(reward.rivalId) < 0
          : state.rewardedActIds.indexOf(reward.actId) < 0;
      });
      if (!token && !unapplied.length) {
        return result(false, null, { duplicate: true, reason: 'duplicate',
          appliedStoryClaimIds: [], skippedStoryClaimIds: componentRewards.map(function (reward) { return reward.claimId; }) });
      }
      var outerClaimId = token ? 'local-match:' + token.lineageId + ':' + token.ordinal
        : 'story-components:' + unapplied.map(function (reward) { return reward.claimId; }).join('+');
      return commitMutation(function (draft) {
        var beforeLevel = draft.flipLevel;
        var beforeBalance = draft.fcBalance;
        var totalFxp = 0;
        var granted = [];
        var appliedComponents = [];
        var skippedComponents = [];

        if (token) {
          if (!sameMatchToken(token, draft.activeMatchReservation)) {
            throw new RangeError('Story match token was superseded before consumption');
          }
          draft.activeMatchReservation = null;
          draft.consumedMatchOrdinal = token.ordinal;
          appendMatchReceipt(draft, token, 'consumed');
        }

        if (ordinaryReward && ordinaryReward.eligible) {
          totalFxp += ordinaryReward.fxp;
          if (ordinaryReward.fc) appendFc(draft, {
            txId: outerClaimId + ':fc',
            idempotencyKey: outerClaimId + ':fc',
            kind: 'earn', sourceType: 'match', sourceId: matchId,
            signedAmount: ordinaryReward.fc, timestamp: finiteInteger(now()),
          });
        }

        componentRewards.forEach(function (reward) {
          var alreadyApplied = claimWasProcessed(draft, reward.claimId);
          if (reward.type === 'rival-first-clear') {
            alreadyApplied = alreadyApplied || draft.rewardedRivalIds.indexOf(reward.rivalId) >= 0;
          } else {
            alreadyApplied = alreadyApplied || draft.rewardedActIds.indexOf(reward.actId) >= 0;
          }
          addUnique(draft.processedClaimIds, reward.claimId);
          compactClaims(draft);
          addUnique(draft.claimedRewardIds, reward.claimId);
          if (alreadyApplied) {
            skippedComponents.push(reward.claimId);
            return;
          }
          totalFxp += reward.fxp;
          appendFc(draft, {
            txId: 'component:' + reward.claimId + ':fc',
            idempotencyKey: reward.claimId + ':fc',
            kind: 'earn',
            sourceType: reward.type === 'rival-first-clear' ? 'rival' : 'story-act',
            sourceId: reward.type === 'rival-first-clear' ? reward.rivalId : reward.actId,
            signedAmount: reward.fc, timestamp: finiteInteger(now()),
          });
          if (reward.type === 'rival-first-clear') {
            addUnique(draft.defeatedRivalIds, reward.rivalId);
            addUnique(draft.rewardedRivalIds, reward.rivalId);
            if (!reward.alien && draft.ownedObjectIds.indexOf(reward.objectId) < 0) {
              draft.ownedObjectIds.push(reward.objectId);
              granted.push('object.' + reward.objectId);
            }
          } else {
            addUnique(draft.completedActIds, reward.actId);
            addUnique(draft.rewardedActIds, reward.actId);
            addUnique(draft.fieldNoteIds, reward.fieldNoteId);
          }
          appliedComponents.push(reward.claimId);
        });

        draft.fxp = Math.min(Number.MAX_SAFE_INTEGER, draft.fxp + totalFxp);
        draft.flipLevel = Economy.flipLevelForFxp(draft.fxp);
        granted = granted.concat(grantLevelsCrossed(draft, beforeLevel, {
          reveal: true, now: now(),
        }));
        granted = granted.concat(grantAlienGate(draft, true));
        granted.forEach(function (id) { queueReveal(draft, id); });
        return {
          claimId: outerClaimId,
          consumed: !!token,
          fxpAwarded: totalFxp,
          fcAwarded: draft.fcBalance - beforeBalance,
          levelsCrossed: Math.max(0, draft.flipLevel - beforeLevel),
          granted: uniqueStrings(granted),
          ordinaryReward: ordinaryReward,
          appliedStoryClaimIds: appliedComponents,
          skippedStoryClaimIds: skippedComponents,
        };
      });
    }
    function purchaseCosmetic(cosmeticId) {
      refresh();
      var requestedCosmeticId = exactId(cosmeticId, 'cosmeticId');
      var cosmetic = Catalog.storeCosmetic(requestedCosmeticId);
      if (!cosmetic) return result(false, null, { duplicate: false, reason: 'unknown-cosmetic' });
      if (state.ownedCosmeticIds.indexOf(cosmetic.id) >= 0) {
        return result(false, 'cosmetic-purchase:' + cosmetic.id, { reason: 'already-owned' });
      }
      if (state.fcBalance < cosmetic.price) return result(false, null, { duplicate: false, reason: 'insufficient-fc' });
      return claimBundle({ claimId: 'cosmetic-purchase:' + cosmetic.id,
        sourceType: 'cosmetic-purchase', sourceId: cosmetic.id,
        fc: -cosmetic.price, cosmeticIds: [cosmetic.id],
        feedbackIds: ['store.' + cosmetic.id], reveal: true });
    }
    function mergeImportedState(importedState, immutableImportId) {
      var incoming = validateImportedState(importedState, {
        allowTestOnlyAchievementIds: testOnly,
      });
      var importId = exactId(immutableImportId, 'importId');
      var outerClaimId = 'profile-import:' + importId;
      refresh();
      var sameLineage = incoming.lineageId === state.lineageId;
      if (sameLineage && incoming.revision > state.revision) {
        throw new RangeError('A divergent future snapshot of the active profile lineage cannot be imported');
      }
      var priorEvidence = state.externalClaimEvidence.find(function (entry) {
        return entry.lineageId === incoming.lineageId;
      }) || null;
      if (!sameLineage && !priorEvidence &&
          state.externalClaimEvidence.length >= RETENTION.externalLineages) {
        return result(false, outerClaimId, { duplicate: false,
          reason: 'import-lineage-capacity', imported: false });
      }
      var sourceRevisionAdvanced = !sameLineage && (!priorEvidence ||
        incoming.revision > priorEvidence.throughRevision);
      var sourceFcHighWater = priorEvidence ? priorEvidence.fcHighWater : 0;
      var requestedFcCredit = sameLineage || !sourceRevisionAdvanced ? 0
        : (priorEvidence
          ? Math.max(0, incoming.fcBalance - sourceFcHighWater)
          : Math.max(0, incoming.fcBalance - state.fcBalance));
      var mergeFields = ['ownedObjectIds', 'ownedArenaIds', 'ownedCosmeticIds', 'featureIds',
        'achievementIds', 'rewardedAchievementIds', 'defeatedRivalIds',
        'rewardedRivalIds', 'completedActIds', 'rewardedActIds', 'fieldNoteIds',
        'claimedRewardIds'];
      var incomingEntitlementClaims = canonicalEntitlementClaims(incoming);
      var noNewContent = state.fxp >= incoming.fxp && requestedFcCredit === 0 && !sourceRevisionAdvanced &&
        mergeFields.every(function (field) {
          var local = new Set(state[field]);
          return incoming[field].every(function (id) { return local.has(id); });
        }) && incomingEntitlementClaims.every(function (id) {
          return state.processedClaimIds.indexOf(id) >= 0;
        }) && incoming.pendingRevealIds.every(function (id) {
          return state.pendingRevealIds.indexOf(id) >= 0 || revealWasConsumed(state, id);
        }) && incoming.consumedRevealIds.every(function (id) { return revealWasConsumed(state, id); });
      if (noNewContent) {
        return result(false, outerClaimId, { reason: 'duplicate', imported: false });
      }
      return commitMutation(function (draft) {
        var beforeLevel = draft.flipLevel;
        var beforeBalance = draft.fcBalance;
        draft.fxp = Math.max(draft.fxp, incoming.fxp);
        draft.flipLevel = Economy.flipLevelForFxp(draft.fxp);
        // Reconcile the canonical level ladder from FXP before accepting claim
        // evidence from the imported file.  A partial or old V4 snapshot can
        // therefore add ownership but can never suppress an earned level grant.
        var granted = grantLevelsCrossed(draft, beforeLevel, { reveal: false, now: now() });

        // The imported balance is a floor, not an independent wallet to sum.
        // In particular, canonical FC granted while reconciling imported FXP
        // may already account for part of the source's balance increase.
        var fcCredit = Math.min(requestedFcCredit,
          Math.max(0, incoming.fcBalance - draft.fcBalance));
        if (fcCredit) appendFc(draft, {
          txId: outerClaimId + ':balance-floor',
          idempotencyKey: outerClaimId + ':balance-floor',
          kind: 'migration', sourceType: 'migration', sourceId: importId,
          signedAmount: fcCredit, timestamp: finiteInteger(now()),
        });

        [
          ['ownedObjectIds', Catalog.canonicalObjectId],
          ['ownedArenaIds', Catalog.canonicalArenaId],
          ['ownedCosmeticIds', null], ['featureIds', null],
          ['achievementIds', null], ['rewardedAchievementIds', null],
          ['defeatedRivalIds', null], ['rewardedRivalIds', null],
          ['completedActIds', null], ['rewardedActIds', null], ['fieldNoteIds', null],
          ['claimedRewardIds', null],
        ].forEach(function (definition) {
          uniqueStrings(incoming[definition[0]], definition[1]).forEach(function (id) {
            addUnique(draft[definition[0]], id);
          });
        });
        incomingEntitlementClaims.forEach(function (id) { addUnique(draft.processedClaimIds, id); });
        compactClaims(draft);
        // Raw claim IDs belong to the source profile's namespace.  They are
        // retained only as bounded external evidence and never participate in
        // this device's live match-id idempotence check.
        if (!sameLineage) {
          draft.externalClaimEvidence = normalizeExternalLineages(
            draft.externalClaimEvidence.concat([{ lineageId: incoming.lineageId,
              throughRevision: incoming.revision,
              fcHighWater: Math.max(incoming.fcBalance, sourceFcHighWater) }]));
        }
        incoming.consumedRevealIds.forEach(function (id) { consumeReveal(draft, id); });
        draft.pendingRevealIds = draft.pendingRevealIds.filter(function (id) {
          return !revealWasConsumed(draft, id);
        });
        incoming.pendingRevealIds.forEach(function (id) { queueReveal(draft, id); });
        draft.legacy = {
          reconciledV111: !!(draft.legacy.reconciledV111 || incoming.legacy.reconciledV111),
          qualifyingWins: Math.max(finiteInteger(draft.legacy.qualifyingWins),
            finiteInteger(incoming.legacy.qualifyingWins)),
          sourceRelease: draft.legacy.sourceRelease || incoming.legacy.sourceRelease,
          grandfatheredAlien: !!(draft.legacy.grandfatheredAlien || incoming.legacy.grandfatheredAlien),
          grandfatheredInsane: !!(draft.legacy.grandfatheredInsane || incoming.legacy.grandfatheredInsane),
          quarantinedMatchReservations: Math.max(
            finiteInteger(draft.legacy.quarantinedMatchReservations),
            finiteInteger(incoming.legacy.quarantinedMatchReservations)),
          compactedLegacyClaims: Math.max(
            finiteInteger(draft.legacy.compactedLegacyClaims),
            finiteInteger(incoming.legacy.compactedLegacyClaims)),
        };
        draft.revision = Math.max(draft.revision, incoming.revision);
        granted = granted.concat(grantAlienGate(draft, false));
        return {
          claimId: outerClaimId,
          imported: true,
          importedRevision: incoming.revision,
          fxpAdded: draft.fxp - state.fxp,
          fcAdded: draft.fcBalance - beforeBalance,
          granted: uniqueStrings(granted),
        };
      });
    }
    function dismissReveals(ids) {
      refresh();
      var requested = ids == null ? state.pendingRevealIds.slice() : (function () {
        if (!Array.isArray(ids)) throw new TypeError('reveal IDs must be an array');
        if (ids.length > RETENTION.pendingReveals) {
          throw new RangeError('reveal dismissal request exceeds the canonical bound');
        }
        return uniqueStrings(ids.map(function (id) { return exactId(id, 'reveal ID'); }));
      })();
      var current = new Set(state.pendingRevealIds);
      var values = requested.filter(function (id) { return current.has(id); });
      if (!values.length) return result(false, null, { duplicate: false, reason: 'empty' });
      return commitMutation(function (draft) {
        var removed = new Set(values);
        draft.pendingRevealIds = draft.pendingRevealIds.filter(function (id) { return !removed.has(id); });
        values.forEach(function (id) { consumeReveal(draft, id); });
        return { dismissed: values };
      });
    }
    function subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('profile subscriber must be a function');
      var options = arguments.length > 1 ? arguments[1] : null;
      if (!deliveringNotifications && options && options.emitCurrent !== false) {
        listener(snapshot(), freeze({ type: 'current', applied: false, duplicate: false,
          claimId: null, state: snapshot() }));
      }
      listeners.add(listener);
      return function () { listeners.delete(listener); };
    }
    function exportState() { return snapshot(); }
    function lastPersistenceError() { return persistenceError; }
    function persistenceStatus() {
      return freeze({ closed: persistencePoisoned, error: persistenceError ? persistenceError.message : null });
    }

    return freeze({
      snapshot: snapshot, refresh: refresh, subscribe: subscribe, exportState: exportState,
      reserveMatch: reserveMatch, resumeMatchReservation: resumeMatchReservation,
      consumeReservedMatch: consumeReservedMatch, abandonReservedMatch: abandonReservedMatch,
      claimMatch: claimMatch, claimAchievement: claimAchievement,
      claimRivalVictory: claimRivalVictory, claimStoryAct: claimStoryAct,
      claimStoryReward: claimStoryReward, claimStoryMatchResolution: claimStoryMatchResolution,
      purchaseCosmetic: purchaseCosmetic, mergeImportedState: mergeImportedState,
      dismissReveals: dismissReveals,
      lastPersistenceError: lastPersistenceError, persistenceStatus: persistenceStatus,
    });
  }

  var browserStorage = null;
  try { browserStorage = root && root.localStorage ? root.localStorage : null; } catch (_) {}
  var productionWriterEnabled = false;
  var productionRuntimeConnected = false;
  var defaultAchievementAuthority = commonJs && Achievements && Achievements.rewardAuthority;
  var defaultStore = createStore({ storage: browserStorage,
    achievementAuthority: defaultAchievementAuthority || null,
    writeAuthority: function () { return productionWriterEnabled; } });
  function connectProductionRuntime(installer) {
    if (typeof installer !== 'function') {
      throw new TypeError('Production runtime installer must be a function');
    }
    if (productionRuntimeConnected) {
      throw new Error('The production profile store is already connected');
    }
    productionRuntimeConnected = true;
    return installer(freeze({
      profileStore: defaultStore,
      setWriterEnabled: function (enabled) { productionWriterEnabled = enabled === true; },
    }));
  }
  function createTestStore(options) {
    var source = options && typeof options === 'object' ? Object.assign({}, options) : {};
    source.testOnly = source.productionSemantics !== true;
    delete source.productionSemantics;
    if (typeof source.writeAuthority !== 'function') {
      source.writeAuthority = function () { return true; };
    }
    return createStore(source);
  }

  function scrubPublicClone(value) {
    if (value == null || typeof value !== 'object') return value;
    if (value.schema === 'MatchClaimTokenV1') return null;
    if (Array.isArray(value)) return value.map(scrubPublicClone);
    var output = {};
    Object.keys(value).forEach(function (key) {
      if (key === 'token' || key === 'nonce' || key === 'bearerNonce' ||
          key === 'reservedAt') return;
      if (key === 'activeMatchReservation') {
        output.activeMatchReservation = null;
        return;
      }
      output[key] = scrubPublicClone(value[key]);
    });
    if (Object.prototype.hasOwnProperty.call(output, 'matchClaimCursor') &&
        Object.prototype.hasOwnProperty.call(output, 'consumedMatchOrdinal')) {
      output.matchClaimCursor = output.consumedMatchOrdinal;
    }
    return output;
  }
  function publicProjection(value) {
    return freeze(scrubPublicClone(safeClone(value)));
  }
  function publicProfileProjection(value) {
    return ProgressionStateV4(publicProjection(value));
  }
  function publicProfileEvent(event, projectedState) {
    var source = safeClone(event || Object.create(null));
    source.state = projectedState;
    return publicProjection(source);
  }
  function publicSnapshot() { return publicProfileProjection(defaultStore.snapshot()); }
  function publicRefresh() { return publicProfileProjection(defaultStore.refresh()); }
  function publicExportState() { return publicProfileProjection(defaultStore.exportState()); }
  function publicSubscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('profile subscriber must be a function');
    var options = arguments.length > 1 ? arguments[1] : undefined;
    return defaultStore.subscribe(function (state, event) {
      var projected = publicProfileProjection(state);
      listener(projected, publicProfileEvent(event, projected));
    }, options);
  }

  var publicApi = {
    schema: 'ProgressionStateV4', version: 4, storageKey: KEY,
    journalStorageKey: JOURNAL_KEY, legacyKeys: clone(LEGACY_KEYS),
    retentionPolicy: clone(RETENTION),
    ProgressionStateV4: ProgressionStateV4,
    validateImportedState: validateImportedState,
    migrateV111: migrateV111, migrateSetupSelection: migrateSetupSelection,
    storyActIds: STORY_ACT_IDS.slice(), alienGateSatisfied: alienGateSatisfied,
    isAlienUsable: isAlienUsable, isInsaneUsable: isInsaneUsable,
    snapshot: publicSnapshot, refresh: publicRefresh, subscribe: publicSubscribe,
    exportState: publicExportState,
    lastPersistenceError: defaultStore.lastPersistenceError,
    persistenceStatus: defaultStore.persistenceStatus,
  };
  if (commonJs) {
    publicApi.FcTransactionV1 = FcTransactionV1;
    publicApi.MatchClaimTokenV1 = MatchClaimTokenV1;
    publicApi.MatchReceiptV1 = MatchReceiptV1;
    publicApi.createMemoryStorage = createMemoryStorage;
    publicApi.createTestStore = createTestStore;
    // This connector exists only between trusted CommonJS modules.  Classic
    // browser scripts intentionally have no callable route to the raw store,
    // writer toggle, or reward authority until the lexical composition wave.
    publicApi.connectProductionRuntime = connectProductionRuntime;
  }
  return freeze(publicApi);
});
