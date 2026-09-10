// v111-progression.js -- qualification, migration, persistence, and reward claims.
(function (root, factory) {
  'use strict';
  var Interfaces = root && root.FlipgameV111Interfaces;
  var Content = root && root.FlipgameV111Content;
  var Cosmetics = root && root.FlipgameV111Cosmetics;
  if (typeof module === 'object' && module.exports) {
    Interfaces = require('./v111-interfaces.js');
    Content = require('./v111-content-catalog.js');
    Cosmetics = require('./v111-cosmetic-catalog.js');
  }
  var api = factory(Interfaces, Content, Cosmetics, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV111Progression = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Interfaces, Content, Cosmetics, root) {
  'use strict';
  if (!Interfaces || !Content || !Cosmetics) {
    throw new Error('v111 interfaces, content, and cosmetics must load before progression');
  }

  var KEY = 'flipgame.progression.v3';
  var LEGACY_RECORDS_KEY = 'flipgame.records.v1';
  var LEGACY_ACHIEVEMENTS_KEY = 'flipgame.achievements.v1';

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function uniqueStrings(values) {
    var seen = new Set();
    return (Array.isArray(values) ? values : []).map(String).filter(function (id) {
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }
  function parse(raw, fallback) {
    if (raw == null || raw === '') return fallback;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch (_) { return fallback; }
  }
  function integer(value) { return Math.max(0, Math.floor(Number(value) || 0)); }

  function rewardClaimsThrough(wins) {
    var result = [];
    for (var n = 1; n <= Math.min(100, integer(wins)); n++) {
      Content.rewardsAt(n).forEach(function (reward) { result.push(reward.id); });
      var cosmetic = Cosmetics.earnedAt(n);
      if (cosmetic) result.push(cosmetic.id);
    }
    return uniqueStrings(result);
  }

  function rewardDetailsAt(wins) {
    var details = Content.rewardsAt(wins);
    var cosmetic = Cosmetics.earnedAt(wins);
    if (cosmetic) {
      details.push({
        id: cosmetic.id,
        type: cosmetic.type,
        contentId: cosmetic.id,
        scope: cosmetic.scope,
      });
    }
    return details;
  }

  function normalize(source) {
    var value = source && typeof source === 'object' ? source : {};
    var state = Interfaces.ProgressionStateV3({
      qualifyingWins: integer(value.qualifyingWins),
      ownedObjectIds: uniqueStrings(['bottle'].concat(value.ownedObjectIds || [])),
      ownedCosmeticIds: uniqueStrings(value.ownedCosmeticIds),
      achievementIds: uniqueStrings(value.achievementIds),
      claimedRewardIds: uniqueStrings(value.claimedRewardIds),
    });
    return state;
  }

  function reconcile(source) {
    var before = normalize(source);
    var objectIds = uniqueStrings(before.ownedObjectIds);
    var cosmeticIds = uniqueStrings(before.ownedCosmeticIds);
    var claims = uniqueStrings(before.claimedRewardIds.concat(rewardClaimsThrough(before.qualifyingWins)));

    Content.internalObjects().forEach(function (object) {
      if (claims.indexOf('object.' + object.id) >= 0 && objectIds.indexOf(object.id) < 0) {
        objectIds.push(object.id);
      }
    });
    Cosmetics.internalCatalog().forEach(function (cosmetic) {
      if (claims.indexOf(cosmetic.id) >= 0 && cosmeticIds.indexOf(cosmetic.id) < 0) {
        cosmeticIds.push(cosmetic.id);
      }
    });

    // Owned arrays are authoritative migration evidence. Backfill claims so a
    // later reconcile can never revoke an unlock merely because a counter fell.
    objectIds.forEach(function (id) {
      var claim = 'object.' + id;
      if (claims.indexOf(claim) < 0) claims.push(claim);
    });
    cosmeticIds.forEach(function (id) {
      if (claims.indexOf(id) < 0) claims.push(id);
    });

    return Interfaces.ProgressionStateV3({
      qualifyingWins: before.qualifyingWins,
      ownedObjectIds: objectIds,
      ownedCosmeticIds: cosmeticIds,
      achievementIds: before.achievementIds,
      claimedRewardIds: claims,
    });
  }

  function migrate(input) {
    var sources = input && typeof input === 'object' ? input : {};
    var current = parse(sources.progression || sources.current, {}) || {};
    var legacyRecords = parse(sources.legacyRecords, {}) || {};
    var legacyAchievements = parse(sources.legacyAchievements, []) || [];
    var legacyObjects = Array.isArray(legacyRecords.unlockedSkins)
      ? legacyRecords.unlockedSkins.map(function (id) { return id === 'trophy_gold' ? 'tall-buildings' : id; }) : [];
    var legacyAchievementIds = Array.isArray(legacyAchievements) ? legacyAchievements
      : (Array.isArray(legacyAchievements.achievementIds) ? legacyAchievements.achievementIds : []);

    return reconcile({
      qualifyingWins: Math.max(integer(current.qualifyingWins), integer(legacyRecords.totalWins)),
      ownedObjectIds: uniqueStrings(['bottle'].concat(current.ownedObjectIds || [], legacyObjects)),
      ownedCosmeticIds: uniqueStrings(current.ownedCosmeticIds),
      achievementIds: uniqueStrings((current.achievementIds || []).concat(legacyAchievementIds)),
      claimedRewardIds: uniqueStrings(current.claimedRewardIds),
    });
  }

  function truthy(value) { return value === true || value === 1 || value === 'true'; }
  function isQualifyingHumanWin(context) {
    var c = context && typeof context === 'object' ? context : {};
    var mode = String(c.mode || c.format || c.activity || '').toLowerCase();
    if (truthy(c.practice) || truthy(c.isPractice) || truthy(c.lab) || truthy(c.physicsLab) ||
        truthy(c.forced) || truthy(c.isForced) || truthy(c.test) || truthy(c.testData) ||
        truthy(c.testMode) || truthy(c.simulated) || truthy(c.aiOnly) || truthy(c.abandoned) ||
        mode === 'practice' || mode === 'lab' || mode === 'physics-lab') return false;
    if (c.completed === false || c.resolved === false || c.won === false || c.result === 'loss') return false;
    if (c.winnerIsAI === true || c.humanWinner === false || c.winnerIsHuman === false) return false;

    if (c.humanWinner === true || c.winnerIsHuman === true || c.isHumanWin === true ||
        c.winningTeamHasHuman === true) return true;
    if (c.winner && typeof c.winner === 'object') {
      if (c.winner.isAI === false || c.winner.human === true || c.winner.type === 'human') return true;
      if (c.winner.isAI === true || c.winner.type === 'ai') return false;
    }
    if (Number(c.humanPlayers) > 0 || c.hasHumanPlayer === true || c.hasHuman === true) return true;
    if (Array.isArray(c.players) && c.players.some(function (player) {
      return player && player.isAI === false;
    })) return c.winnerIsAI !== true;
    return false; // Secure by default: an unclassified result cannot advance progression.
  }

  function createMemoryStorage(seed) {
    var values = Object.assign({}, seed || {});
    return {
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
      setItem: function (key, value) { values[key] = String(value); },
      removeItem: function (key) { delete values[key]; },
      dump: function () { return clone(values); },
    };
  }

  function createStore(options) {
    var opts = options || {};
    var storage = opts.storage || null;
    var state;

    function load() {
      var current = opts.initialState || (storage ? parse(storage.getItem(KEY), null) : null);
      var legacyRecords = opts.legacyRecords || (storage ? parse(storage.getItem(LEGACY_RECORDS_KEY), {}) : {});
      var legacyAchievements = opts.legacyAchievements ||
        (storage ? parse(storage.getItem(LEGACY_ACHIEVEMENTS_KEY), []) : []);
      state = migrate({
        progression: current,
        legacyRecords: legacyRecords,
        legacyAchievements: legacyAchievements,
      });
      save();
      return snapshot();
    }
    function save() {
      if (!storage) return;
      try { storage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
    }
    function snapshot() { return reconcile(state); }
    function recordQualifyingWin(context) {
      if (!isQualifyingHumanWin(context)) {
        return Object.freeze({ qualified: false, state: snapshot(), unlocked: Object.freeze([]) });
      }
      var nextWins = state.qualifyingWins + 1;
      var beforeClaims = new Set(state.claimedRewardIds);
      state = reconcile(Object.assign({}, state, { qualifyingWins: nextWins }));
      save();
      var unlocked = rewardDetailsAt(nextWins).filter(function (reward) { return !beforeClaims.has(reward.id); });
      return Object.freeze({ qualified: true, state: snapshot(), unlocked: Object.freeze(unlocked) });
    }
    function preserveOwned(patch) {
      var value = patch || {};
      state = reconcile({
        qualifyingWins: Math.max(state.qualifyingWins, integer(value.qualifyingWins)),
        ownedObjectIds: state.ownedObjectIds.concat(value.ownedObjectIds || []),
        ownedCosmeticIds: state.ownedCosmeticIds.concat(value.ownedCosmeticIds || []),
        achievementIds: state.achievementIds.concat(value.achievementIds || []),
        claimedRewardIds: state.claimedRewardIds.concat(value.claimedRewardIds || []),
      });
      save();
      return snapshot();
    }
    function addAchievement(id) {
      if (!id) return snapshot();
      return preserveOwned({ achievementIds: [String(id)] });
    }
    function exportState() { return snapshot(); }

    load();
    return Object.freeze({
      snapshot: snapshot,
      recordQualifyingWin: recordQualifyingWin,
      preserveOwned: preserveOwned,
      importState: preserveOwned,
      addAchievement: addAchievement,
      exportState: exportState,
    });
  }

  var browserStorage = null;
  try { browserStorage = root && root.localStorage ? root.localStorage : null; } catch (_) {}
  var defaultStore = createStore({ storage: browserStorage });

  return Object.freeze({
    schema: 'ProgressionStateV3',
    storageKey: KEY,
    isQualifyingHumanWin: isQualifyingHumanWin,
    rewardsAt: rewardDetailsAt,
    reconcile: reconcile,
    migrate: migrate,
    createStore: createStore,
    createMemoryStorage: createMemoryStorage,
    snapshot: defaultStore.snapshot,
    recordQualifyingWin: defaultStore.recordQualifyingWin,
    preserveOwned: defaultStore.preserveOwned,
    importState: defaultStore.importState,
    addAchievement: defaultStore.addAchievement,
    exportState: defaultStore.exportState,
  });
});
