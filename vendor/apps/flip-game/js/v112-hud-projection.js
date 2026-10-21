// Display-only adapter. No timers, persisted state, rules calls or reward writes.
// Host lifecycle:
// - On flip-resolved retain its outcomeId and use presentation:'result'. Rules
//   has already advanced, but RESULT must keep showing the resolving actor.
// - After the existing result interval use presentation:'next'. Do NOT call
//   legacy resolveFlip/advanceTurn. Arm only when canArm is true.
// - A terminal result waits for both that interval and completed finalization;
//   postMatch is exposed only then. A failed finalization stays retryable.
// - Optional landingPresentation:{outcomeId,perfect} is display-only measured
//   Physics.getLastLandingInfo() flair, captured for that exact outcome. No
//   angle/tolerance is inferred here. Current authority omits perfect metadata.
// - This bounded adapter supports ordinary Classic and Practice only. Events,
//   Story/Rival, Cup, Team, Battle, Alien and Insane require separate adapters.
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.defineProperty(root, 'FlipgameV112HudProjection', { value: factory() });
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  function copy(value) {
    if (value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(copy);
    var result = {};
    Object.keys(value).forEach(function (key) {
      Object.defineProperty(result, key, { value: copy(value[key]), enumerable: true });
    });
    return result;
  }
  function freeze(value) {
    if (!value || typeof value !== 'object') return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }
  function unavailable(reason) {
    return freeze({ schema: 'HudProjectionV1', supported: false, reason: reason,
      canArm: false, display: null, postMatch: null });
  }
  function project(snapshot, options) {
    var session = snapshot && snapshot.session;
    if (!session) return unavailable('no-session');
    var request = session.request || {};
    var practice = request.activityId === 'practice';
    if (request.formatId !== 'classic' || request.physicsModeId !== 'normal' ||
        (!practice && request.activityId !== 'free-play')) return unavailable('mode-adapter-required');
    options = options || {};
    var presentation = options.presentation || 'next';
    if (presentation !== 'result' && presentation !== 'next') throw new TypeError('Unknown HUD presentation');
    var rules = session.rules;
    var outcome = session.lastRulesOutcome;
    var roster = request.roster;
    if (!Array.isArray(roster) || !roster.length || (practice && roster.length !== 1)) {
      return unavailable('invalid-roster');
    }
    if (!practice && (!rules || rules.schema !== 'ClassicRulesStateV1' ||
        rules.matchId !== session.matchId)) return unavailable('invalid-rules-snapshot');
    if (outcome && (outcome.matchId !== session.matchId || outcome.formatId !== 'classic' ||
        outcome.type !== 'rules.classic-flip-resolved.v1' || (!practice &&
          (rules.lastOutcomeId !== outcome.outcomeId || rules.sequence !== outcome.sequence)))) {
      return unavailable('stale-or-unsupported-outcome');
    }
    var effects = outcome && outcome.effects;
    if ((session.lastLanding && session.lastLanding.eventId) ||
        (outcome && outcome.landing.golden) || (effects &&
          (effects.additiveRequested || effects.multiplier != null || effects.alwaysMagnetGranted ||
            effects.halvedOpponentIds.length || effects.setOpponentIds.length ||
            effects.forcedEliminatedIds.length || Object.keys(effects.metadata).length))) {
      return unavailable('event-adapter-required');
    }
    // Never infer identities from array position. Roster owns names/art; Rules
    // owns gameplay numbers. In Practice the hidden Rules marker is not shown.
    var identities = new Set(roster.map(function (entry) { return entry.id; }));
    if (identities.size !== roster.length || (outcome && !identities.has(outcome.playerId))) {
      return unavailable('invalid-player-identity');
    }
    var players = roster.map(function (entry) {
      var player = practice ? null : rules.players.find(function (row) { return row.id === entry.id; });
      if (!practice && !player) return null;
      return Object.assign({}, copy(entry), {
        skin: entry.objectId, objectId: entry.objectId, variantId: entry.variantId,
        isAI: entry.human === false || entry.isAI === true,
        lives: practice ? null : player.lives,
        streak: practice ? null : player.streak, bestStreak: practice ? null : player.bestStreak,
        isHeatingUp: practice ? false : player.heatingUp,
        isOnFire: practice ? false : player.onFire,
        eliminated: practice ? false : player.eliminated,
        alwaysMagnet: practice ? false : player.alwaysMagnet,
      });
    });
    if (players.some(function (player) { return !player; }) ||
        (!practice && rules.players.length !== players.length)) return unavailable('invalid-player-identity');
    function index(id) { return id == null ? -1 : players.findIndex(function (player) { return player.id === id; }); }
    var complete = !practice && rules.phase === 'complete';
    var next = practice ? { current: roster[0].id, onDeck: null, afterThat: null, signals: [] } : rules.turn;
    var showingResult = presentation === 'result' && session.flipPhase === 'resolved' && !!outcome;
    var awaitingFinalization = complete && !(session.status === 'completed' && session.resolution);
    var postMatch = complete && !showingResult && !awaitingFinalization ? copy(session.resolution) : null;
    var actorId = outcome ? outcome.playerId : null;
    var actorIndex = index(actorId);
    var winnerIndex = practice || !rules.winnerIds.length ? -1 : index(rules.winnerIds[0]);
    var currentIndex = showingResult || (complete && !postMatch) ? actorIndex :
      (complete ? winnerIndex : index(next.current));
    var result = showingResult ? outcome : null;
    var measured = options.landingPresentation;
    var perfectKnown = !!(result && measured && measured.outcomeId === result.outcomeId &&
      typeof measured.perfect === 'boolean');
    var phase = session.status === 'abandoned' ? 'abandoned' : postMatch ? 'postmatch' :
      showingResult ? 'result' : awaitingFinalization ? 'awaiting-finalization' :
      (session.flipPhase === 'airborne' || session.flipPhase === 'contact' || session.flipPhase === 'settling')
        ? session.flipPhase : 'ready';
    var nextId = next.current;
    var resultAdvanced = showingResult && nextId && nextId !== actorId;
    var display = {
      state: phase === 'postmatch' ? 'GAME_OVER' :
        (phase === 'result' || phase === 'awaiting-finalization') ? 'RESULT' :
        phase === 'airborne' ? 'FLIPPING' :
        (phase === 'contact' || phase === 'settling') ? 'EVALUATING' :
        phase === 'abandoned' ? 'SETUP' : 'TURN_START',
      format: 'classic', practice: practice, players: players,
      currentPlayerIndex: currentIndex,
      onDeckPlayerIndex: index(resultAdvanced ? nextId : next.onDeck),
      afterThatPlayerIndex: index(resultAdvanced ? next.onDeck : next.afterThat),
      pointCount: practice ? 0 : rules.stake,
      turnCounter: practice ? session.practice.flips : rules.rulesTurnCounter,
      attemptCounter: practice ? session.practice.flips : rules.attemptCounter,
      direction: practice ? 1 : rules.config.direction,
      startingLives: practice ? null : rules.config.startingLives,
      maxLives: practice ? null : rules.config.additiveLifeCap,
      suddenDeathFlipThreshold: practice ? null : rules.suddenDeath.activationTurn,
      suddenDeathLevel: practice ? 0 : rules.suddenDeath.level,
      onFirePlayer: practice || rules.onFirePlayerId == null ? null : index(rules.onFirePlayerId),
      onFireBonus: practice ? 0 : rules.onFireEarned,
      winnerIndex: winnerIndex,
      lastResult: result ? result.landing.result : null,
      capLand: !!(result && result.landing.made && result.landing.onCap),
      perfectLanding: !!(perfectKnown && result.landing.made && measured.perfect),
      perfectKnown: perfectKnown,
      lastPenalty: result && !practice && !result.landing.made ? Math.max(0, -result.lives.delta) : 0,
      onFireGain: result && !practice ? result.onFire.rewardApplied : 0,
      justIgnited: !!(result && !practice && result.onFire.justIgnited),
      fireEnded: !!(result && !practice && result.onFire.ended),
      fireCapped: !!(result && !practice && result.onFire.capped),
      justEliminated: !!(result && !practice && result.eliminatedIds.indexOf(actorId) >= 0),
      endedFireBonus: result && !practice && result.onFire.ended && rules.lastFireRun &&
        rules.lastFireRun.playerId === actorId ? rules.lastFireRun.earned : 0,
      // Clear legacy event display leftovers; no event scoring is represented.
      rareLifeGain: 0, doubleFlipReward: false, lifeDrainTriggered: false,
      lifeDrainActive: false, eventReward: null,
      practiceAttempts: practice ? session.practice.flips : 0,
      practiceMakes: practice ? session.practice.makes : 0,
      practiceMisses: practice ? session.practice.misses : 0,
      practiceCaps: practice ? session.practice.caps : 0,
      practiceStreak: null, practiceBest: null,
    };
    return freeze({ schema: 'HudProjectionV1', supported: true, matchId: session.matchId,
      phase: phase, display: display, resultId: result ? result.outcomeId : null,
      actorId: actorId, actorIndex: actorIndex, nextTurn: copy(next),
      nextPlayerIndex: index(next.current), nextOnDeckIndex: index(next.onDeck),
      nextAfterThatIndex: index(next.afterThat),
      canArm: phase === 'ready' && session.status === 'active' && !complete,
      awaitingFinalization: awaitingFinalization,
      retryFinalization: session.status === 'finalization-failed',
      postMatch: postMatch, cues: result ? copy(result.presentation.cues) : [],
      unavailableMetrics: practice ? ['practiceStreak', 'practiceBest'] : [],
    });
  }
  return Object.freeze({ schema: 'HudProjectionAPIv1', project: project });
});
