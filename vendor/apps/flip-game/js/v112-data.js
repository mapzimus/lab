// V2 diagnostics projection. Private composition holds the recorder; UI gets
// only views/export/import. This module never owns rules, RNG, or progression.
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./v111-stats.js'));
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Stats) {
  'use strict';
  function copy(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function createDataPipeline(options) {
    var opts = options || {};
    // The legacy Stats Lab and new sessions must share one writer/cache.
    var store = opts.store || (Stats && Array.isArray(Stats.FLIP_RECORD_V2_FIELDS) && Stats.defaultStore);
    var now = opts.now || Date.now;
    var pending = Promise.resolve();
    var warning = null;
    function enqueue(method, record) {
      var captured;
      try { captured = copy(record); } catch (_) { warning = 'Statistics could not capture this result.'; return; }
      pending = pending.then(function () {
        if (!store || typeof store[method] !== 'function') throw new Error('Statistics storage is unavailable.');
        return store[method](captured);
      }).then(function (result) {
        if (result && result.stored === false && !result.duplicate) warning = 'Statistics could not store this result.';
      }).catch(function () { warning = 'Statistics storage is unavailable. Gameplay is unaffected.'; });
    }
    function base(request, testData) {
      var context = request.activityContext || {};
      return { version: 2, releaseVersion: opts.releaseVersion || 'v1.12',
        timestamp: now(), matchId: request.matchId, activityId: request.activityId,
        formatId: request.formatId, physicsModeId: request.physicsModeId,
        playerCount: request.roster.length, arenaId: context.arenaId || 'baseline-table',
        viewport: copy(context.viewport || null), online: false,
        practice: request.activityId === 'practice',
        testData: !!(testData || context.testData || ['practice','physics-lab','tutorial'].indexOf(request.activityId) >= 0),
        storyChapterId: context.chapterId || null, rivalId: context.rivalId || null,
        battleFormatId: context.battleFormatId || null };
    }
    function recordFlip(input) {
      if (!Stats) { warning = 'Statistics storage is unavailable. Gameplay is unaffected.'; return; }
      var request = input.request;
      var landing = input.landing || {};
      var player = input.player || {};
      var frame = input.frame || {};
      var after = input.after || {};
      var afterPlayer = (after.players || []).find(function (entry) { return entry.id === player.id; }) || {};
      var record = Object.assign(base(request, input.testData), {
        schema: 'FlipRecordV2', uuid: Stats.stableUuid('v112-flip', request.matchId + '|' + input.launchId),
        launchLeaseId: input.launchId, laneId: input.laneId || 'main',
        player: copy(player), playerId: player.id, seat: input.seat,
        turn: input.before && input.before.attemptCounter, result: landing.result,
        pose: landing.pose, landingReason: landing.reason,
        power: frame.power, direction: frame.direction, rotations: frame.rotations,
        contacts: frame.contacts, bounces: frame.bounces, banks: frame.banks,
        eventId: frame.eventId || null, eventSeed: frame.eventSeed,
        trajectorySeed: frame.trajectorySeed, oddsProfile: frame.oddsProfile || 'normal',
        flightMs: Math.max(0, frame.atMs - input.launchedAtMs),
        firstContactMs: input.firstContactAtMs == null ? null : Math.max(0, input.firstContactAtMs - input.launchedAtMs),
        settleMs: input.firstContactAtMs == null ? null : Math.max(0, frame.atMs - input.firstContactAtMs),
        objectId: player.objectId || player.flipperId,
        stakeBefore: input.before && input.before.stake, stakeAfter: after.stake,
        livesBefore: player.lives, livesAfter: afterPlayer.lives,
        streakBefore: player.streak, streakAfter: afterPlayer.streak,
        onFireBefore: player.onFire, onFireAfter: afterPlayer.onFire,
        suddenDeathBefore: !!(input.before && input.before.suddenDeath && input.before.suddenDeath.phase === 'sudden-death'),
        suddenDeathAfter: !!(after.suddenDeath && after.suddenDeath.phase === 'sudden-death'),
        appliedReward: copy(input.rulesOutcome),
      });
      enqueue('recordFlip', record);
    }
    function recordMatch(input) {
      if (!Stats) { warning = 'Statistics storage is unavailable. Gameplay is unaffected.'; return; }
      var request = input.request;
      var outcome = input.outcome || {};
      enqueue('recordMatch', Object.assign(base(request, input.testData), {
        schema: 'MatchRecordV2', uuid: Stats.stableUuid('v112-match', request.matchId),
        startedAt: input.startedAt, durationMs: Math.max(0, now() - input.startedAt),
        players: (input.players || request.roster).map(function (player) {
          return Object.assign({}, copy(player), { objectId: player.objectId || player.flipperId,
            startingLives: request.rulesOptions && request.rulesOptions.startingLives });
        }), winnerIds: copy(outcome.winnerIds || []),
        winnerTeamId: outcome.winnerTeamId || null, totalFlips: input.totalFlips || 0,
        completed: input.completed !== false,
        completionReason: input.completed === false ? 'abandoned' : 'completed',
        startingSettings: copy(request.rulesOptions),
        story: copy(input.story), battle: copy(input.battle),
      }));
    }
    function read(method, args) {
      if (!store || typeof store[method] !== 'function') return Promise.reject(new Error('Statistics storage is unavailable.'));
      // A UI query immediately after resolve must include its queued record.
      return pending.then(function () { return store[method].apply(store, args); });
    }
    var view = Object.freeze({
      schema: 'FlipgameStatisticsViewV2',
      query: function () { return read('query', arguments); },
      datasets: function () { return read('datasets', arguments); },
      summary: function () { return read('summary', arguments); },
      exportJSON: function () { return read('exportJSON', arguments); },
      exportCSV: function () { return read('exportCSV', arguments); },
      importJSON: function () { return read('importJSON', arguments); },
      warning: function () { return warning || (store && store.getWarning ? store.getWarning() : 'Statistics storage is unavailable.'); },
      flush: function () { return pending.then(function () { return store && store.flush ? store.flush() : null; }); },
    });
    return Object.freeze({ recordFlip: recordFlip, recordMatch: recordMatch, view: view });
  }
  return Object.freeze({ createDataPipeline: createDataPipeline });
});
