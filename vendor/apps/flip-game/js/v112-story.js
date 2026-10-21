// v112-story.js -- Pressure Signal catalog, Rival Board, and campaign reducer.
// Rules, rendering, persistence, and progression are injected by callers.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112Story = api;
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
  function unique(values) { return Array.from(new Set((Array.isArray(values) ? values : []).map(String))); }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }

  var CHAPTERS = freeze([
    { id: 'first-broadcast', act: 1, order: 1, title: 'The First Broadcast', arenaId: 'rooftop',
      preliminaryId: 'wfc-qualifier', rivalId: 'first-light', rivalName: 'Mara Venn', callsign: 'First Light',
      flipperId: 'coffee-mug', cpuTier: 1, clue: 'Furst WFC Qualifier — doors at seven.' },
    { id: 'scatterline', act: 1, order: 2, title: 'Scatterline', arenaId: 'arcade',
      rivalId: 'scatterline', rivalName: 'Ivo Bell', callsign: 'Scatterline',
      flipperId: 'gumball-machine', cpuTier: 2, clue: 'Geometry is just timing with corners.' },
    { id: 'lane-09', act: 1, order: 3, title: 'Lane 09', arenaId: 'grand-library',
      rivalId: 'meridian', rivalName: 'Safiya Rowan', callsign: 'Meridian',
      flipperId: 'desk-globe', cpuTier: 2, clue: 'LANE 09 — RETURN RECEIVED.' },
    { id: 'under-lights', act: 2, order: 4, title: 'Under the Lights', arenaId: 'sports-locker-room',
      preliminaryId: 'broadcast-heat', rivalId: 'cold-read', rivalName: 'Jules Mercer', callsign: 'Cold Read',
      flipperId: 'penguin', cpuTier: 3, clue: 'The replay clock lost eleven seconds.' },
    { id: 'true-axis', act: 2, order: 5, title: 'True Axis', arenaId: 'neon-grid',
      rivalId: 'true-axis', rivalName: 'Niko Arden', callsign: 'True Axis',
      flipperId: 'desk-gyroscope', cpuTier: 3, clue: 'INBOUND VECTOR — SOURCE ABOVE ARRAY.' },
    { id: 'standard-bearer', act: 2, order: 6, title: 'Standard Bearer', arenaId: 'movie-soundstage',
      rivalId: 'standard-bearer', rivalName: 'Reina Sol', callsign: 'Standard Bearer',
      flipperId: 'trophy-cup', cpuTier: 4, clue: 'EIGHT ENTRIES. NINE RETURNS. REVIEW OPEN.' },
    { id: 'case-50a', act: 3, order: 7, title: 'Case 50-A', arenaId: 'space-station',
      preliminaryId: 'instrumented-heat', rivalId: 'fine-point', rivalName: 'Dr. Arun Vale', callsign: 'Fine Point',
      flipperId: 'microscope', cpuTier: 5, clue: 'MASS VERIFIED. TRAJECTORY DID NOT COMPLY.' },
    { id: 'white-noise', act: 3, order: 8, title: 'White Noise', arenaId: 'ice-cave',
      rivalId: 'white-noise', rivalName: 'Inez Park', callsign: 'White Noise',
      flipperId: 'snow-globe', cpuTier: 5, clue: 'LOCAL AIR: STILL.' },
    { id: 'high-water', act: 3, order: 9, title: 'High Water', arenaId: 'island-beach',
      rivalId: 'high-water', rivalName: 'Beck Holloway', callsign: 'High Water',
      flipperId: 'huge-rubber-duck', cpuTier: 6, clue: 'VOLUME ACCOUNTED FOR. AGAIN.' },
    { id: 'nine-tracks', act: 4, order: 10, title: 'Nine Tracks', arenaId: 'storm-table',
      preliminaryId: 'wfc-semifinal', rivalId: 'ensemble', rivalName: 'Ren Damar', callsign: 'Ensemble',
      flipperId: 'action-figures', cpuTier: 6, clue: 'SUBJECTS: 8 / TRACKS: 9.' },
    { id: 'deep-time', act: 4, order: 11, title: 'Deep Time', arenaId: 'stadium-night',
      preliminaryId: 'wfc-final', rivalId: 'deep-time', rivalName: 'Talia Quill', callsign: 'Deep Time',
      flipperId: 'trex', cpuTier: 7, clue: 'ORIGINAL MODEL. ORIGINAL MASS. NEW SHADOW.' },
    { id: 'visitor-zero', act: 4, order: 12, title: 'Visitor Zero', arenaId: 'aurora-stage',
      rivalId: 'visitor-zero', rivalName: 'Veyr', callsign: 'Visitor Zero',
      flipperId: 'alien', cpuTier: 8, nativeAlien: true,
      clue: 'NO SEED / NO FEDERATION / SIGNAL VERIFIED.' },
  ]);
  var INVITATIONS = freeze([
    ['first-light', 5], ['scatterline', 13], ['meridian', 21], ['cold-read', 29],
    ['true-axis', 37], ['standard-bearer', 45], ['fine-point', 50],
    ['white-noise', 61], ['high-water', 71], ['ensemble', 81],
    ['deep-time', 91], ['visitor-zero', 100],
  ].map(function (row) { return { rivalId: row[0], level: row[1] }; }));
  var BY_CHAPTER = Object.create(null);
  var BY_RIVAL = Object.create(null);
  CHAPTERS.forEach(function (chapter) { BY_CHAPTER[chapter.id] = chapter; BY_RIVAL[chapter.rivalId] = chapter; });

  var PRELIMINARY_IDS = freeze(CHAPTERS.filter(function (chapter) {
    return !!chapter.preliminaryId;
  }).map(function (chapter) { return chapter.preliminaryId; }));
  var CHAPTER_IDS = freeze(CHAPTERS.map(function (chapter) { return chapter.id; }));
  var RIVAL_IDS = freeze(CHAPTERS.map(function (chapter) { return chapter.rivalId; }));
  var ACT_IDS = freeze(['1', '2', '3', '4']);
  var REWARD_IDS = freeze(RIVAL_IDS.map(function (id) {
    return 'rival.' + id + '.first-clear';
  }).concat(ACT_IDS.map(function (id) {
    return 'story.act.' + id + '.first-clear';
  })));
  var STATE_ARRAY_LIMITS = freeze({
    clearedPreliminaryIds: PRELIMINARY_IDS.length,
    defeatedRivalIds: RIVAL_IDS.length,
    discoveredRivalIds: RIVAL_IDS.length,
    clearedChapterIds: CHAPTER_IDS.length,
    completedActIds: ACT_IDS.length,
    resolvedAttemptIds: 1000,
    claimedRewardIds: REWARD_IDS.length,
  });
  var STATE_KEYS = freeze([
    'schema', 'clearedPreliminaryIds', 'defeatedRivalIds', 'discoveredRivalIds',
    'clearedChapterIds', 'completedActIds', 'resolvedAttemptIds',
    'claimedRewardIds', 'lastCheckpoint', 'alienDefeated', 'campaignCompleted',
  ]);
  var STATE_KEY_SET = new Set(STATE_KEYS);
  var ATTEMPT_KEYS = freeze([
    'schema', 'attemptId', 'source', 'chapterId', 'rivalId', 'matchKind',
    'cooperative', 'alliedHumanIds', 'rosterTemplate', 'arenaId', 'cpuTier',
    'physicsModeId', 'eventsEnabled', 'seed',
  ]);
  var ROSTER_TEMPLATE_KEYS = freeze(['humanCount', 'cpuCount', 'lives', 'format']);
  var ALLOWED_IDS = {
    clearedPreliminaryIds: new Set(PRELIMINARY_IDS),
    defeatedRivalIds: new Set(RIVAL_IDS),
    discoveredRivalIds: new Set(RIVAL_IDS),
    clearedChapterIds: new Set(CHAPTER_IDS),
    completedActIds: new Set(ACT_IDS),
    claimedRewardIds: new Set(REWARD_IDS),
  };

  function plainRecord(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError((label || 'value') + ' must be a plain object');
    }
    var prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError((label || 'value') + ' must be a plain object');
    }
    return value;
  }

  function ownDataKeys(source, label) {
    if (typeof Object.getOwnPropertySymbols === 'function' &&
        Object.getOwnPropertySymbols(source).length) {
      throw new TypeError((label || 'record') + ' cannot contain symbol fields');
    }
    var keys = Object.getOwnPropertyNames(source);
    keys.forEach(function (key) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
        throw new TypeError((label || 'record') + ' contains an unsafe field');
      }
      var descriptor = Object.getOwnPropertyDescriptor(source, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        throw new TypeError((label || 'record') + ' fields must be ordinary data properties');
      }
    });
    return keys;
  }

  function exactSafeId(value, label) {
    if (typeof value !== 'string' || !value || value !== value.trim() ||
        value.length > 128 || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new TypeError((label || 'ID') + ' must be a non-empty safe string');
    }
    return value;
  }

  function exactRecordKeys(source, keys, label) {
    var actual = ownDataKeys(source, label).sort();
    var expected = keys.slice().sort();
    if (actual.length !== expected.length || actual.some(function (key, index) {
      return key !== expected[index];
    })) throw new TypeError((label || 'record') + ' has an invalid exact schema');
  }

  function boundedIdArray(source, field, options) {
    var opts = options || {};
    if (!Object.prototype.hasOwnProperty.call(source, field)) {
      if (opts.required) throw new TypeError('StoryStateV1 is missing ' + field);
      return [];
    }
    var values = source[field];
    if (!Array.isArray(values)) throw new TypeError('StoryStateV1 ' + field + ' must be an array');
    var limit = STATE_ARRAY_LIMITS[field];
    // The cardinality check intentionally precedes every element read.  A hostile
    // imported array cannot make normalization walk or coerce an unbounded input.
    if (values.length > limit) {
      throw new RangeError('StoryStateV1 ' + field + ' exceeds its ' + limit + '-entry limit');
    }
    if (typeof Object.getOwnPropertySymbols === 'function' &&
        Object.getOwnPropertySymbols(values).length) {
      throw new TypeError('StoryStateV1 ' + field + ' cannot contain symbol fields');
    }
    var arrayKeys = Object.getOwnPropertyNames(values);
    if (arrayKeys.length !== values.length + 1 || arrayKeys.some(function (key) {
      return key !== 'length' && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= values.length);
    })) {
      throw new TypeError('StoryStateV1 ' + field + ' must be a dense ordinary array');
    }
    var allowed = ALLOWED_IDS[field] || null;
    var seen = new Set();
    var output = [];
    for (var index = 0; index < values.length; index++) {
      var descriptor = Object.getOwnPropertyDescriptor(values, String(index));
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        throw new TypeError('StoryStateV1 ' + field + ' entries must be ordinary data properties');
      }
      var id = exactSafeId(descriptor.value,
        'StoryStateV1 ' + field + '[' + index + ']');
      if (seen.has(id)) throw new RangeError('StoryStateV1 ' + field + ' contains a duplicate ID');
      if (allowed && !allowed.has(id)) {
        throw new RangeError('StoryStateV1 ' + field + ' contains an unknown ID');
      }
      seen.add(id);
      output.push(id);
    }
    return output;
  }

  function preflightStateArrayBounds(source) {
    Object.keys(STATE_ARRAY_LIMITS).forEach(function (field) {
      if (!Object.prototype.hasOwnProperty.call(source, field)) return;
      var values = source[field];
      if (!Array.isArray(values)) {
        throw new TypeError('StoryStateV1 ' + field + ' must be an array');
      }
      var limit = STATE_ARRAY_LIMITS[field];
      if (values.length > limit) {
        throw new RangeError('StoryStateV1 ' + field + ' exceeds its ' + limit + '-entry limit');
      }
    });
  }

  function sameArray(left, right) {
    return Array.isArray(left) && left.length === right.length && left.every(function (value, index) {
      return value === right[index];
    });
  }

  function mergeKnown(left, right) {
    var seen = new Set(left);
    var output = left.slice();
    right.forEach(function (id) {
      if (!seen.has(id)) { seen.add(id); output.push(id); }
    });
    return output;
  }

  function appendAttemptReceipt(values, id) {
    var output = values.filter(function (value) { return value !== id; });
    output.push(id);
    return output.slice(-STATE_ARRAY_LIMITS.resolvedAttemptIds);
  }

  function mergeAttemptReceipts(left, right) {
    var leftReceipts = boundedIdArray({ resolvedAttemptIds: left }, 'resolvedAttemptIds',
      { required: true });
    var rightReceipts = boundedIdArray({ resolvedAttemptIds: right }, 'resolvedAttemptIds',
      { required: true });
    var combined = leftReceipts.concat(rightReceipts);
    var seen = new Set();
    var reversed = [];
    for (var index = combined.length - 1;
      index >= 0 && reversed.length < STATE_ARRAY_LIMITS.resolvedAttemptIds; index--) {
      if (!seen.has(combined[index])) {
        seen.add(combined[index]); reversed.push(combined[index]);
      }
    }
    return reversed.reverse();
  }

  function defaultState() {
    return freeze({
      schema: 'StoryStateV1',
      clearedPreliminaryIds: [],
      defeatedRivalIds: [],
      discoveredRivalIds: [],
      clearedChapterIds: [],
      completedActIds: [],
      resolvedAttemptIds: [],
      claimedRewardIds: [],
      lastCheckpoint: null,
      alienDefeated: false,
      campaignCompleted: false,
    });
  }

  function assertStateKeys(source, exact) {
    ownDataKeys(source, 'StoryStateV1').forEach(function (key) {
      if (!STATE_KEY_SET.has(key)) throw new TypeError('Unknown StoryStateV1 field: ' + key);
    });
    if (exact) STATE_KEYS.forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) {
        throw new TypeError('StoryStateV1 is missing ' + key);
      }
    });
  }

  function recompute(value) {
    var source = plainRecord(value, 'Story state');
    assertStateKeys(source, false);
    // Check every collection cardinality before reading a single element from
    // any collection. This makes an oversized late field fail in O(field-count)
    // even when earlier arrays expose getters or expensive imported values.
    preflightStateArrayBounds(source);
    if (Object.prototype.hasOwnProperty.call(source, 'schema') && source.schema !== 'StoryStateV1') {
      throw new TypeError('StoryStateV1 schema is required');
    }
    var defeated = boundedIdArray(source, 'defeatedRivalIds');
    var prelim = boundedIdArray(source, 'clearedPreliminaryIds');
    var discovered = boundedIdArray(source, 'discoveredRivalIds');
    var receipts = boundedIdArray(source, 'resolvedAttemptIds');
    var rewardClaims = boundedIdArray(source, 'claimedRewardIds');
    if (Object.prototype.hasOwnProperty.call(source, 'clearedChapterIds')) {
      boundedIdArray(source, 'clearedChapterIds');
    }
    if (Object.prototype.hasOwnProperty.call(source, 'completedActIds')) {
      boundedIdArray(source, 'completedActIds');
    }
    if (Object.prototype.hasOwnProperty.call(source, 'alienDefeated') &&
        typeof source.alienDefeated !== 'boolean') {
      throw new TypeError('StoryStateV1 alienDefeated must be boolean');
    }
    if (Object.prototype.hasOwnProperty.call(source, 'campaignCompleted') &&
        typeof source.campaignCompleted !== 'boolean') {
      throw new TypeError('StoryStateV1 campaignCompleted must be boolean');
    }
    var checkpoint = source.lastCheckpoint == null ? null
      : exactSafeId(source.lastCheckpoint, 'StoryStateV1 lastCheckpoint');
    if (checkpoint !== null && CHAPTER_IDS.indexOf(checkpoint) < 0) {
      throw new RangeError('StoryStateV1 lastCheckpoint is not a Story chapter');
    }
    var cleared = CHAPTERS.filter(function (chapter) {
      return defeated.indexOf(chapter.rivalId) >= 0 &&
        (!chapter.preliminaryId || prelim.indexOf(chapter.preliminaryId) >= 0);
    }).map(function (chapter) { return chapter.id; });
    var acts = [1, 2, 3, 4].filter(function (act) {
      return CHAPTERS.filter(function (chapter) { return chapter.act === act; })
        .every(function (chapter) { return cleared.indexOf(chapter.id) >= 0; });
    }).map(String);
    rewardClaims.forEach(function (claimId) {
      var rival = /^rival\.([^.]+)\.first-clear$/.exec(claimId);
      if (rival && defeated.indexOf(rival[1]) < 0) {
        throw new RangeError('StoryStateV1 rival reward evidence lacks its completion');
      }
      var act = /^story\.act\.([1-4])\.first-clear$/.exec(claimId);
      if (act && acts.indexOf(act[1]) < 0) {
        throw new RangeError('StoryStateV1 act reward evidence lacks its completion');
      }
    });
    return freeze({
      schema: 'StoryStateV1',
      clearedPreliminaryIds: prelim,
      defeatedRivalIds: defeated,
      discoveredRivalIds: mergeKnown(discovered, defeated),
      clearedChapterIds: cleared,
      completedActIds: acts,
      resolvedAttemptIds: receipts,
      claimedRewardIds: rewardClaims,
      lastCheckpoint: checkpoint,
      alienDefeated: defeated.indexOf('visitor-zero') >= 0,
      campaignCompleted: cleared.length === CHAPTERS.length,
    });
  }

  function validateState(value) {
    var source = plainRecord(value, 'StoryStateV1');
    assertStateKeys(source, true);
    if (source.schema !== 'StoryStateV1') throw new TypeError('StoryStateV1 schema is required');
    if (typeof source.alienDefeated !== 'boolean' || typeof source.campaignCompleted !== 'boolean') {
      throw new TypeError('StoryStateV1 derived flags must be boolean');
    }
    boundedIdArray(source, 'clearedChapterIds', { required: true });
    boundedIdArray(source, 'completedActIds', { required: true });
    var canonical = recompute(source);
    if (!sameArray(source.clearedPreliminaryIds, canonical.clearedPreliminaryIds) ||
        !sameArray(source.defeatedRivalIds, canonical.defeatedRivalIds) ||
        !sameArray(source.discoveredRivalIds, canonical.discoveredRivalIds) ||
        !sameArray(source.clearedChapterIds, canonical.clearedChapterIds) ||
        !sameArray(source.completedActIds, canonical.completedActIds) ||
        !sameArray(source.resolvedAttemptIds, canonical.resolvedAttemptIds) ||
        !sameArray(source.claimedRewardIds, canonical.claimedRewardIds) ||
        source.lastCheckpoint !== canonical.lastCheckpoint ||
        source.alienDefeated !== canonical.alienDefeated ||
        source.campaignCompleted !== canonical.campaignCompleted) {
      throw new RangeError('StoryStateV1 derived progression does not match its canonical source fields');
    }
    return canonical;
  }

  function normalizeState(value) {
    if (value == null) return defaultState();
    var source = plainRecord(value, 'Story state');
    return Object.prototype.hasOwnProperty.call(source, 'schema')
      ? validateState(source) : recompute(source);
  }

  function nextChapter(state) {
    var current = normalizeState(state);
    return CHAPTERS.find(function (chapter) {
      return current.clearedChapterIds.indexOf(chapter.id) < 0;
    }) || null;
  }

  function discoverForLevel(state, level) {
    var current = normalizeState(state);
    var discovered = current.discoveredRivalIds.slice();
    var newlyDiscovered = [];
    INVITATIONS.forEach(function (invitation) {
      if (Number(level) >= invitation.level && discovered.indexOf(invitation.rivalId) < 0) {
        discovered.push(invitation.rivalId);
        newlyDiscovered.push(invitation.rivalId);
      }
    });
    return freeze({ state: recompute(Object.assign({}, current, { discoveredRivalIds: discovered })),
      newlyDiscovered: freeze(newlyDiscovered) });
  }

  function prepareAttempt(state, input) {
    var current = normalizeState(state);
    var source = object(input);
    var attemptId = exactSafeId(source.attemptId, 'attemptId');
    var route = source.source === 'rival-board' ? 'rival-board' : 'story';
    var chapter = source.chapterId ? BY_CHAPTER[String(source.chapterId)]
      : BY_RIVAL[String(source.rivalId)];
    if (!chapter) throw new TypeError('Unknown Story chapter or rival');
    if (route === 'rival-board' && current.discoveredRivalIds.indexOf(chapter.rivalId) < 0) {
      throw new Error('Rival is not discovered: ' + chapter.rivalId);
    }
    if (route === 'story') {
      var frontier = nextChapter(current);
      var replay = current.clearedChapterIds.indexOf(chapter.id) >= 0;
      if (!replay && frontier && frontier.id !== chapter.id) throw new Error('Story chapter is not available');
    }
    var preliminaryComplete = !chapter.preliminaryId ||
      current.clearedPreliminaryIds.indexOf(chapter.preliminaryId) >= 0;
    var defaultMatchKind = route === 'rival-board' || preliminaryComplete
      ? 'signature' : 'preliminary';
    var matchKind = String(source.matchKind || defaultMatchKind);
    if (matchKind !== 'preliminary' && matchKind !== 'signature') throw new TypeError('Unknown matchKind');
    if (matchKind === 'preliminary' && !chapter.preliminaryId) throw new Error('Chapter has no preliminary');
    if (route === 'rival-board' && matchKind !== 'signature') {
      throw new Error('Rival Board attempts are signature duels');
    }
    if (route === 'story' && matchKind === 'signature' && !preliminaryComplete) {
      throw new Error('Chapter preliminary must be cleared before its signature encounter');
    }
    var cooperative = source.cooperative === true;
    if (route === 'rival-board' && cooperative) throw new Error('Rival Board attempts are solo');
    var expectedHumans = cooperative ? 2 : 1;
    if (!Array.isArray(source.alliedHumanIds) || source.alliedHumanIds.length > expectedHumans) {
      throw new TypeError('Story attempt requires ' + expectedHumans + ' allied human player ID' +
        (expectedHumans === 1 ? '' : 's'));
    }
    var alliedHumanIds = [];
    var alliedSeen = new Set();
    source.alliedHumanIds.forEach(function (value, index) {
      var id = exactSafeId(value, 'alliedHumanIds[' + index + ']');
      if (alliedSeen.has(id)) throw new TypeError('Duplicate allied human player ID');
      alliedSeen.add(id); alliedHumanIds.push(id);
    });
    if (alliedHumanIds.length !== expectedHumans) {
      throw new TypeError('Story attempt requires ' + expectedHumans + ' allied human player ID' +
        (expectedHumans === 1 ? '' : 's'));
    }
    var rosterTemplate = cooperative
      ? { humanCount: 2, cpuCount: 6, lives: 10, format: 'classic' }
      : (matchKind === 'preliminary'
        ? { humanCount: 1, cpuCount: 7, lives: 10, format: 'classic' }
        : { humanCount: 1, cpuCount: 1, lives: 3, format: 'classic' });
    var numericSeed = source.seed == null ? 1 : Number(source.seed);
    var seed = Number.isFinite(numericSeed) ? (Math.trunc(numericSeed) >>> 0) : 1;
    if (seed === 0) seed = 1;
    return freeze({ schema: 'StoryAttemptV1', attemptId: attemptId, source: route,
      chapterId: chapter.id, rivalId: chapter.rivalId, matchKind: matchKind,
      cooperative: cooperative, alliedHumanIds: alliedHumanIds,
      rosterTemplate: rosterTemplate, arenaId: chapter.arenaId,
      cpuTier: chapter.cpuTier, physicsModeId: chapter.nativeAlien ? 'alien' : 'normal',
      eventsEnabled: !chapter.nativeAlien, seed: seed });
  }

  function validateAttempt(state, value) {
    var source = plainRecord(value, 'StoryAttemptV1');
    exactRecordKeys(source, ATTEMPT_KEYS, 'StoryAttemptV1');
    if (source.schema !== 'StoryAttemptV1') {
      throw new TypeError('StoryAttemptV1 schema is required');
    }
    ['attemptId', 'source', 'chapterId', 'rivalId', 'matchKind', 'arenaId',
      'physicsModeId'].forEach(function (field) {
      exactSafeId(source[field], 'StoryAttemptV1 ' + field);
    });
    if (source.source !== 'story' && source.source !== 'rival-board') {
      throw new RangeError('StoryAttemptV1 source is invalid');
    }
    if (source.matchKind !== 'preliminary' && source.matchKind !== 'signature') {
      throw new RangeError('StoryAttemptV1 matchKind is invalid');
    }
    if (typeof source.cooperative !== 'boolean' || typeof source.eventsEnabled !== 'boolean') {
      throw new TypeError('StoryAttemptV1 boolean fields must be exact booleans');
    }
    if (!Array.isArray(source.alliedHumanIds) || source.alliedHumanIds.length > 2) {
      throw new TypeError('StoryAttemptV1 alliedHumanIds is outside its canonical bound');
    }
    if (typeof Object.getOwnPropertySymbols === 'function' &&
        Object.getOwnPropertySymbols(source.alliedHumanIds).length) {
      throw new TypeError('StoryAttemptV1 alliedHumanIds cannot contain symbol fields');
    }
    var alliedKeys = Object.getOwnPropertyNames(source.alliedHumanIds);
    if (alliedKeys.length !== source.alliedHumanIds.length + 1 ||
        alliedKeys.some(function (key) {
          return key !== 'length' &&
            (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= source.alliedHumanIds.length);
        })) {
      throw new TypeError('StoryAttemptV1 alliedHumanIds must be a dense ordinary array');
    }
    var alliedHumanIds = [];
    var alliedSeen = new Set();
    for (var alliedIndex = 0; alliedIndex < source.alliedHumanIds.length; alliedIndex++) {
      var alliedDescriptor = Object.getOwnPropertyDescriptor(
        source.alliedHumanIds, String(alliedIndex));
      if (!alliedDescriptor ||
          !Object.prototype.hasOwnProperty.call(alliedDescriptor, 'value')) {
        throw new TypeError('StoryAttemptV1 alliedHumanIds entries must be ordinary data properties');
      }
      var alliedId = exactSafeId(alliedDescriptor.value,
        'StoryAttemptV1 alliedHumanIds[' + alliedIndex + ']');
      if (alliedSeen.has(alliedId)) {
        throw new TypeError('StoryAttemptV1 alliedHumanIds contains a duplicate ID');
      }
      alliedSeen.add(alliedId);
      alliedHumanIds.push(alliedId);
    }
    var roster = plainRecord(source.rosterTemplate, 'StoryAttemptV1 rosterTemplate');
    exactRecordKeys(roster, ROSTER_TEMPLATE_KEYS, 'StoryAttemptV1 rosterTemplate');
    ['humanCount', 'cpuCount', 'lives'].forEach(function (field) {
      if (!Number.isSafeInteger(roster[field]) || roster[field] < 0) {
        throw new TypeError('StoryAttemptV1 rosterTemplate ' + field + ' is invalid');
      }
    });
    if (roster.format !== 'classic' || !Number.isSafeInteger(source.cpuTier) ||
        source.cpuTier < 1 || source.cpuTier > 8 ||
        !Number.isSafeInteger(source.seed) || source.seed < 1 || source.seed > 0xffffffff) {
      throw new TypeError('StoryAttemptV1 derived fields are invalid');
    }
    var canonical = prepareAttempt(state, {
      attemptId: source.attemptId,
      source: source.source,
      chapterId: source.chapterId,
      matchKind: source.matchKind,
      cooperative: source.cooperative,
      alliedHumanIds: alliedHumanIds,
      seed: source.seed,
    });
    var projected = {};
    ATTEMPT_KEYS.forEach(function (field) {
      if (field !== 'rosterTemplate') projected[field] = clone(source[field]);
    });
    projected.rosterTemplate = {};
    ROSTER_TEMPLATE_KEYS.forEach(function (field) {
      projected.rosterTemplate[field] = clone(roster[field]);
    });
    // Restore the canonical top-level position of rosterTemplate before the
    // fields that follow it; object key order itself is not part of the schema.
    var ordered = {};
    ATTEMPT_KEYS.forEach(function (field) { ordered[field] = projected[field]; });
    if (JSON.stringify(ordered) !== JSON.stringify(canonical)) {
      throw new RangeError('StoryAttemptV1 does not match its canonical Story state and chapter');
    }
    return canonical;
  }

  function pushReward(rewards, claims, id, reward) {
    if (claims.indexOf(id) >= 0) return false;
    claims.push(id);
    rewards.push(Object.assign({ claimId: id }, reward));
    return true;
  }

  function resolveAttempt(state, attemptInput, outcomeInput) {
    var before = normalizeState(state);
    var attempt = validateAttempt(before, attemptInput);
    if (before.resolvedAttemptIds.indexOf(attempt.attemptId) >= 0) {
      return freeze({ schema: 'StoryResolutionV1', duplicate: true, success: false,
        state: before, rewards: [], newlyClearedChapterIds: [], newlyCompletedActIds: [] });
    }
    var outcome = object(outcomeInput);
    var completed = outcome.status === 'completed' || outcome.completed === true;
    var winners = unique(outcome.winnerIds);
    var allied = attempt.alliedHumanIds;
    var success = completed && allied.some(function (id) { return winners.indexOf(id) >= 0; });
    var next = clone(before);
    next.resolvedAttemptIds = appendAttemptReceipt(next.resolvedAttemptIds, attempt.attemptId);
    next.lastCheckpoint = attempt.chapterId;
    var chapter = BY_CHAPTER[attempt.chapterId];
    if (next.discoveredRivalIds.indexOf(chapter.rivalId) < 0) next.discoveredRivalIds.push(chapter.rivalId);
    var rewards = [];
    var claims = next.claimedRewardIds;
    if (success && attempt.matchKind === 'preliminary' &&
        next.clearedPreliminaryIds.indexOf(chapter.preliminaryId) < 0) {
      next.clearedPreliminaryIds.push(chapter.preliminaryId);
    }
    if (success && attempt.matchKind === 'signature') {
      if (next.defeatedRivalIds.indexOf(chapter.rivalId) < 0) {
        next.defeatedRivalIds.push(chapter.rivalId);
      }
      var isAlien = chapter.rivalId === 'visitor-zero';
      pushReward(rewards, claims, 'rival.' + chapter.rivalId + '.first-clear', {
        type: 'rival-first-clear', rivalId: chapter.rivalId, objectId: chapter.flipperId,
        fxp: isAlien ? 75 : 25, fc: isAlien ? 50 : 15,
      });
    }
    var afterCore = recompute(next);
    var newChapters = afterCore.clearedChapterIds.filter(function (id) {
      return before.clearedChapterIds.indexOf(id) < 0;
    });
    var newActs = afterCore.completedActIds.filter(function (id) {
      return before.completedActIds.indexOf(id) < 0;
    });
    next = clone(afterCore);
    claims = next.claimedRewardIds;
    afterCore.completedActIds.filter(function (actId) {
      // One match may repair only the act that owns its chapter. This keeps the
      // atomic Profile command at its frozen two-component maximum (rival + act).
      return actId === String(chapter.act);
    }).forEach(function (actId) {
      pushReward(rewards, claims, 'story.act.' + actId + '.first-clear', {
        type: 'act-first-clear', actId: String(actId), fxp: 50, fc: 25,
        fieldNoteId: 'field-note-act-' + actId,
      });
    });
    var finalState = recompute(next);
    return freeze({ schema: 'StoryResolutionV1', duplicate: false, success: success,
      source: attempt.source, matchKind: attempt.matchKind, chapterId: chapter.id,
      rivalId: chapter.rivalId, ordinaryRewardsEligible: attempt.source === 'story' && completed,
      state: finalState, rewards: rewards, newlyClearedChapterIds: newChapters,
      newlyCompletedActIds: newActs, nextChapterId: (nextChapter(finalState) || {}).id || null,
      campaignCompleted: finalState.campaignCompleted });
  }

  function canSelectAlien(state, flipLevel, grandfathered) {
    return grandfathered === true || (Number(flipLevel) >= 100 && normalizeState(state).alienDefeated);
  }

  function catalogView(state) {
    var current = normalizeState(state);
    var frontier = nextChapter(current);
    return freeze(CHAPTERS.map(function (chapter) {
      var knownRival = current.discoveredRivalIds.indexOf(chapter.rivalId) >= 0 ||
        current.clearedChapterIds.indexOf(chapter.id) >= 0 || (frontier && frontier.id === chapter.id);
      if (!knownRival) return { locked: true, symbol: '🔒', ariaLabel: 'Locked' };
      return { locked: false, id: chapter.id, act: chapter.act, title: chapter.title,
        rivalId: chapter.rivalId, rivalName: chapter.rivalName, callsign: chapter.callsign,
        flipperId: chapter.flipperId, arenaId: chapter.arenaId,
        cleared: current.clearedChapterIds.indexOf(chapter.id) >= 0 };
    }));
  }

  return freeze({ schema: 'StoryCatalogV1', chapters: CHAPTERS, invitations: INVITATIONS,
    stateLimits: STATE_ARRAY_LIMITS, rewardIds: REWARD_IDS,
    defaultState: defaultState, normalizeState: normalizeState, validateState: validateState,
    mergeAttemptReceipts: mergeAttemptReceipts, nextChapter: nextChapter,
    discoverForLevel: discoverForLevel, prepareAttempt: prepareAttempt,
    validateAttempt: validateAttempt,
    resolveAttempt: resolveAttempt, canSelectAlien: canSelectAlien,
    catalogView: catalogView });
});
