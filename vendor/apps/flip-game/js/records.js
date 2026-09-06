// records.js -- safe local Hall-of-Fame aggregates and progression adapter.
(function (root, factory) {
  'use strict';
  var Progression = root && root.FlipgameV111Progression;
  var NamePolicy = root && root.FlipgameV111NamePolicy;
  if (typeof module === 'object' && module.exports) {
    Progression = require('./v111-progression.js');
    NamePolicy = require('./v111-name-policy.js');
  }
  var api = factory(Progression, NamePolicy, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Records = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Progression, NamePolicy, root) {
  'use strict';
  if (!Progression) throw new Error('v111 progression must load before records.js');

  var KEY = 'flipgame.records.v2';
  var LEGACY_KEY = 'flipgame.records.v1';
  var BASE_OBJECT = (root && root.FLIP_BRAND && root.FLIP_BRAND.baseSkin) || 'bottle';
  var DEFAULTS = {
    schema: 'RecordSummaryV2', version: 2,
    bestStreak: 0, highestStake: 0, totalMakes: 0, totalFlips: 0,
    longestOnFire: 0, greatSaves: 0, capLands: 0,
    winnerRecords: [], qualifyingWins: 0, pendingRevealIds: [],
  };

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function number(value) { return Math.max(0, Number(value) || 0); }
  function parse(raw, fallback) {
    if (raw == null || raw === '') return fallback;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch (_) { return fallback; }
  }
  function unique(values) {
    var seen = new Set();
    return (Array.isArray(values) ? values : []).map(String).filter(function (id) {
      if (!id || seen.has(id)) return false;
      seen.add(id); return true;
    });
  }
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function safeName(value) {
    return NamePolicy && typeof NamePolicy.safeDisplay === 'function'
      ? NamePolicy.safeDisplay(value, 'Player') : 'Player';
  }
  function stableLegacyPlayerId(name) {
    var text = String(name || '').normalize ? String(name || '').normalize('NFKC') : String(name || '');
    var hash = 2166136261;
    for (var i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return 'legacy-player-' + (hash >>> 0).toString(36);
  }
  function normalizeWinnerRecord(entry) {
    if (!entry || typeof entry !== 'object') return null;
    var displayName = safeName(entry.displayName);
    return {
      playerId: String(entry.playerId || stableLegacyPlayerId(displayName)),
      displayName: displayName,
      wins: number(entry.wins),
    };
  }
  function migrate(current, legacy) {
    var source = current && typeof current === 'object' ? current : {};
    var old = legacy && typeof legacy === 'object' ? legacy : {};
    var records = (Array.isArray(source.winnerRecords) ? source.winnerRecords : [])
      .map(normalizeWinnerRecord).filter(Boolean);
    if (!records.length && old.mostWins && typeof old.mostWins === 'object') {
      Object.keys(old.mostWins).forEach(function (displayName) {
        records.push({ playerId: stableLegacyPlayerId(displayName), displayName: safeName(displayName), wins: number(old.mostWins[displayName]) });
      });
    }
    return {
      schema: 'RecordSummaryV2', version: 2,
      bestStreak: Math.max(number(source.bestStreak), number(old.bestStreak)),
      highestStake: Math.max(number(source.highestStake), number(old.highestStake)),
      totalMakes: Math.max(number(source.totalMakes), number(old.totalMakes)),
      totalFlips: Math.max(number(source.totalFlips), number(old.totalFlips)),
      longestOnFire: Math.max(number(source.longestOnFire), number(old.longestOnFire)),
      greatSaves: Math.max(number(source.greatSaves), number(old.greatSaves)),
      capLands: Math.max(number(source.capLands), number(old.capLands)),
      winnerRecords: records,
      qualifyingWins: Math.max(number(source.qualifyingWins), number(old.totalWins)),
      pendingRevealIds: unique(source.pendingRevealIds),
    };
  }
  function isQualifyingPlay(context) {
    var c = context && typeof context === 'object' ? context : {};
    var mode = String(c.mode || c.activity || '').toLowerCase();
    if (c.qualifying === false || c.practice || c.isPractice || c.lab || c.physicsLab ||
        c.forced || c.isForced || c.test || c.testData || c.testMode || c.simulated || c.aiOnly ||
        mode === 'practice' || mode === 'lab' || mode === 'physics-lab') return false;
    if (c.qualifying === true || c.humanParticipant === true || c.hasHumanPlayer === true || Number(c.humanPlayers) > 0) return true;
    return Array.isArray(c.players) && c.players.some(function (player) { return player && player.isAI === false; });
  }

  function createMemoryStorage(seed) {
    var values = Object.assign({}, seed || {});
    return {
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
      setItem: function (key, value) { values[key] = String(value); },
      dump: function () { return clone(values); },
    };
  }

  function createStore(options) {
    var opts = options || {};
    var storage = opts.storage || null;
    var progression = opts.progression || Progression.createStore({
      storage: storage,
      legacyRecords: opts.legacyRecords,
      legacyAchievements: opts.legacyAchievements,
    });
    var current = opts.initialState || (storage ? parse(storage.getItem(KEY), {}) : {});
    var legacy = opts.legacyRecords || (storage ? parse(storage.getItem(LEGACY_KEY), {}) : {});
    var data = migrate(current, legacy);

    function save() { if (storage) { try { storage.setItem(KEY, JSON.stringify(data)); } catch (_) {} } }
    function snapshot() { return clone(data); }
    function exportState() {
      return Object.freeze({ records: Object.freeze(snapshot()), progression: progression.exportState() });
    }
    function recordFlip(game, extra, context) {
      var c = context || (extra && extra.context) || null;
      if (!isQualifyingPlay(c)) return null;
      var g = game || {};
      data.totalFlips++;
      if (g.lastResult === 'MAKE') data.totalMakes++;
      var currentPlayer = typeof g.currentPlayer === 'function' ? g.currentPlayer() : null;
      var streak = currentPlayer ? number(currentPlayer.streak) : number(g.streak);
      data.bestStreak = Math.max(data.bestStreak, streak);
      data.highestStake = Math.max(data.highestStake, number(g.pointCount));
      data.longestOnFire = Math.max(data.longestOnFire, number(g.onFireBonus), number(g.endedFireBonus));
      if (extra && extra.greatSave) data.greatSaves++;
      if (extra && extra.capLand) data.capLands++;
      save();
      return snapshot();
    }
    function recordWin(nameOrContext, maybeContext) {
      var name = typeof nameOrContext === 'string' ? nameOrContext : null;
      var context = typeof nameOrContext === 'object' ? nameOrContext : (maybeContext || {});
      if (name && context.displayName == null) context = Object.assign({}, context, { displayName: name });
      var progress = progression.recordQualifyingWin(context);
      if (!progress.qualified) return null;

      var displayName = safeName(context.displayName || (context.winner && context.winner.name) || name || 'Player');
      var playerId = String(context.playerId || context.winnerId ||
        (context.winner && context.winner.id) || stableLegacyPlayerId(displayName));
      var row = data.winnerRecords.find(function (entry) { return entry.playerId === playerId; });
      if (!row) {
        row = { playerId: playerId, displayName: displayName, wins: 0 };
        data.winnerRecords.push(row);
      }
      row.displayName = displayName;
      row.wins++;
      data.qualifyingWins = progress.state.qualifyingWins;
      progress.unlocked.filter(function (reward) { return reward.type === 'object'; }).forEach(function (reward) {
        if (data.pendingRevealIds.indexOf(reward.contentId) < 0) data.pendingRevealIds.push(reward.contentId);
      });
      save();
      var result = snapshot();
      result.progression = progress.state;
      result.unlocked = progress.unlocked.slice();
      result.winnerWins = row.wins;
      return result;
    }
    function topWinnerRecord() {
      var best = null;
      data.winnerRecords.forEach(function (entry) { if (!best || entry.wins > best.wins) best = entry; });
      return best ? clone(best) : null;
    }
    function topWinner() {
      var best = topWinnerRecord();
      return best ? best.displayName + ' · ' + best.wins : '—';
    }
    function winnerWins(playerId) {
      var row = data.winnerRecords.find(function (entry) { return entry.playerId === String(playerId); });
      return row ? row.wins : 0;
    }
    function renderHtml() {
      var rows = [
        ['🏆', 'Most wins', topWinner()], ['🔥', 'Best streak', data.bestStreak],
        ['⚡', 'Top stake', '×' + data.highestStake], ['🔥', 'Hot run', '+' + data.longestOnFire],
        ['🧤', 'Great Saves', data.greatSaves], ['🙃', 'Cap lands', data.capLands],
        ['✓', 'Total makes', data.totalMakes], ['Σ', 'Total flips', data.totalFlips],
      ];
      return '<div class="records-title">🏅 Hall of Fame</div><div class="records-grid">' +
        rows.map(function (row) {
          return '<div class="rec-item"><span class="rec-val">' + escapeHtml(row[2]) + '</span>' +
            '<span class="rec-key">' + escapeHtml(row[0] + ' ' + row[1]) + '</span></div>';
        }).join('') + '</div>';
    }
    function totalWins() { return progression.snapshot().qualifyingWins; }
    function unlockedSkins() {
      var ids = progression.snapshot().ownedObjectIds.slice();
      if (ids.indexOf(BASE_OBJECT) < 0) ids.unshift(BASE_OBJECT);
      return unique(ids);
    }
    function isSkinUnlocked(id) { return unlockedSkins().indexOf(String(id)) >= 0; }
    function unlockSkin() { return false; } // Forced/manual unlocks do not award progression in v111.
    function unlockAll() { return []; } // Demo/test play may not mutate progression.
    function claimBoxes() {
      var ids = data.pendingRevealIds.slice();
      data.pendingRevealIds = [];
      save();
      return ids;
    }
    function pendingBoxes() { return data.pendingRevealIds.length; }
    function winsToNextBox() { return 0; } // Deprecated: revealing progress is forbidden.
    function syncUnlocksFromWins() { return []; }
    function resetSkinProgress() { return false; } // v111 never relocks earned content.
    function reset() {
      var preservedWins = data.qualifyingWins;
      data = clone(DEFAULTS);
      data.qualifyingWins = preservedWins;
      save();
    }

    save();
    return Object.freeze({
      recordFlip: recordFlip, recordWin: recordWin, renderHtml: renderHtml, reset: reset,
      totalWins: totalWins, unlockedSkins: unlockedSkins, isSkinUnlocked: isSkinUnlocked,
      unlockSkin: unlockSkin, unlockAll: unlockAll, resetSkinProgress: resetSkinProgress,
      syncUnlocksFromWins: syncUnlocksFromWins, claimBoxes: claimBoxes,
      pendingBoxes: pendingBoxes, winsToNextBox: winsToNextBox, winnerWins: winnerWins,
      topWinnerRecord: topWinnerRecord, exportState: exportState, snapshot: snapshot,
      WINS_PER_BOX: 0,
    });
  }

  var browserStorage = null;
  try { browserStorage = root && root.localStorage ? root.localStorage : null; } catch (_) {}
  var defaultStore = createStore({ storage: browserStorage });
  return Object.freeze({
    recordFlip: defaultStore.recordFlip, recordWin: defaultStore.recordWin,
    renderHtml: defaultStore.renderHtml, reset: defaultStore.reset,
    totalWins: defaultStore.totalWins, unlockedSkins: defaultStore.unlockedSkins,
    isSkinUnlocked: defaultStore.isSkinUnlocked, unlockSkin: defaultStore.unlockSkin,
    unlockAll: defaultStore.unlockAll, resetSkinProgress: defaultStore.resetSkinProgress,
    syncUnlocksFromWins: defaultStore.syncUnlocksFromWins, claimBoxes: defaultStore.claimBoxes,
    pendingBoxes: defaultStore.pendingBoxes, winsToNextBox: defaultStore.winsToNextBox,
    winnerWins: defaultStore.winnerWins, topWinnerRecord: defaultStore.topWinnerRecord,
    exportState: defaultStore.exportState, snapshot: defaultStore.snapshot,
    createStore: createStore, createMemoryStorage: createMemoryStorage,
    stableLegacyPlayerId: stableLegacyPlayerId, isQualifyingPlay: isQualifyingPlay,
    WINS_PER_BOX: 0,
  });
});
