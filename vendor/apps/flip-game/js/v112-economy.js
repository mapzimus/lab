// v112-economy.js -- deterministic FXP, Flip Level, FC, and match reward math.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112Economy = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function () {
  'use strict';

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }
  function finite(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }
  function integer(value) { return Math.max(0, Math.floor(finite(value, 0))); }
  function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
  function roundHalfAwayFromZero(value) {
    var number = finite(value, 0);
    if (number === 0) return 0;
    return (number < 0 ? -1 : 1) * Math.floor(Math.abs(number) + 0.5);
  }

  function transitionCost(level) {
    var current = clamp(integer(level) || 1, 1, 99);
    if (current <= 25) return 30;
    if (current <= 50) return 35;
    if (current <= 75) return 40;
    return 45;
  }
  function fxpThresholdForLevel(level) {
    var target = clamp(integer(level) || 1, 1, 100);
    var total = 0;
    for (var current = 1; current < target; current++) total += transitionCost(current);
    return total;
  }
  function flipLevelForFxp(fxp) {
    var value = integer(fxp);
    var level = 1;
    while (level < 100 && value >= fxpThresholdForLevel(level + 1)) level++;
    return level;
  }
  function levelProgress(fxp) {
    var value = integer(fxp);
    var level = flipLevelForFxp(value);
    var floor = fxpThresholdForLevel(level);
    if (level >= 100) return freeze({ level: 100, fxp: value, floor: floor, next: null, earned: value - floor, required: 0, ratio: 1 });
    var next = fxpThresholdForLevel(level + 1);
    return freeze({ level: level, fxp: value, floor: floor, next: next,
      earned: value - floor, required: next - floor, ratio: clamp((value - floor) / (next - floor), 0, 1) });
  }

  // Initial deterministic tuning. Wave 8 may tune these visible tables without
  // changing the reward formula or persisted schema. There are deliberately no
  // adaptive, retention, streak-protection, or player-history inputs.
  var MODE_BONUSES = freeze({
    classic: 0, alien: 0, insane: 0,
    'short-cup': 8, 'full-cup': 16, 'team-clash': 8,
    'battle-duel': 4, 'battle-doubles': 8, 'battle-four-way': 8,
    'battle-ffa': 8, 'battle-relay': 12, 'battle-team': 12,
  });
  var SETUP_DEFAULTS = freeze({
    mode: MODE_BONUSES,
    humanRoster: [
      { maximum: 2, bonus: 0 }, { maximum: 4, bonus: 4 },
      { maximum: 8, bonus: 8 }, { maximum: 12, bonus: 11 },
      { maximum: 16, bonus: 14 },
    ],
    classicLives: [
      { maximum: 5, bonus: 0 }, { maximum: 10, bonus: 3 },
      { maximum: 100, bonus: 5 },
    ],
    cpuChallenge: { minimumManualFlips: 4, easy: 0, medium: 2, hard: 4 },
    teamwork: { bonus: 5, minimumHumans: 2, requiresEveryHumanOrdinaryMake: true },
    maximum: 25,
  });
  // Standard and Pro currently share the same raw prelaunch transfer and all
  // postlaunch physics. Their neutral performance baseline must therefore be
  // identical; selecting a label cannot change progression rewards.
  var EXPECTED_MAKE_RATE = freeze({ forgiving: 0.60, standard: 0.50, pro: 0.50 });
  var ACHIEVEMENT_REWARDS = freeze({
    common: { fxp: 15, fc: 10 },
    notable: { fxp: 30, fc: 20 },
    rare: { fxp: 50, fc: 30 },
    legendary: { fxp: 75, fc: 50 },
  });

  function normalizedMode(input) {
    var source = input || {};
    var rules = source.rulesOptions && typeof source.rulesOptions === 'object' ? source.rulesOptions : {};
    var explicit = String(source.rewardMode || source.modeKey || '').toLowerCase();
    if (MODE_BONUSES[explicit] != null) return explicit;
    var format = String(source.formatId || source.format || source.mode || '').toLowerCase();
    var activity = String(source.physicsModeId || source.physicsMode || source.gameMode || '').toLowerCase();
    if (format === 'cup') return String(source.cupLength || rules.cupLength || '').toLowerCase() === 'full'
      ? 'full-cup' : 'short-cup';
    if (format === 'team' || format === 'team-clash') return 'team-clash';
    if (format === 'battle') {
      var battle = String(source.battleFormatId || source.battleFormat || source.battleType ||
        rules.battleFormatId || rules.battleFormat || '').toLowerCase();
      if (battle === 'duel' || battle === '1v1') return 'battle-duel';
      if (battle === 'doubles' || battle === '2v2') return 'battle-doubles';
      if (battle === 'four-way' || battle === 'ffa' || battle === '1v1v1v1') return 'battle-four-way';
      if (battle === 'relay') return 'battle-relay';
      return 'battle-team';
    }
    if (activity === 'alien' || format === 'alien') return 'alien';
    if (activity === 'insane' || format === 'insane') return 'insane';
    return 'classic';
  }
  function humanRosterBonus(count) {
    var humans = integer(count);
    var band = SETUP_DEFAULTS.humanRoster.find(function (entry) { return humans <= entry.maximum; });
    return band ? band.bonus : SETUP_DEFAULTS.humanRoster[SETUP_DEFAULTS.humanRoster.length - 1].bonus;
  }
  function livesBonus(input, modeKey) {
    if (modeKey !== 'classic') return 0;
    var source = input || {};
    var rules = source.rulesOptions && typeof source.rulesOptions === 'object' ? source.rulesOptions : {};
    var lives = integer(source.startingLives == null ? rules.startingLives : source.startingLives);
    var band = SETUP_DEFAULTS.classicLives.find(function (entry) { return lives <= entry.maximum; });
    return band ? band.bonus : SETUP_DEFAULTS.classicLives[SETUP_DEFAULTS.classicLives.length - 1].bonus;
  }
  function cpuChallengeBonus(input) {
    var source = input || {};
    if (integer(source.qualifiedManualHumanFlips) < SETUP_DEFAULTS.cpuChallenge.minimumManualFlips ||
        source.opposingCpuTurnOccurred !== true) return 0;
    var difficulty = String(source.cpuDifficulty || source.difficulty || '').toLowerCase();
    return SETUP_DEFAULTS.cpuChallenge[difficulty] || 0;
  }
  function teamworkBonus(input) {
    var source = input || {};
    var mode = normalizedMode(source);
    var teamMode = mode === 'team-clash' || mode === 'battle-doubles' || mode === 'battle-relay' || mode === 'battle-team';
    var humansWon = source.winningTeam === true || source.winningTeamHasHuman === true || source.humanWon === true;
    return teamMode && humansWon &&
      integer(source.humansOnWinningTeam) >= SETUP_DEFAULTS.teamwork.minimumHumans &&
      source.everyHumanTeammateOrdinaryMake === true ? SETUP_DEFAULTS.teamwork.bonus : 0;
  }
  function explicitSetupComponents(input) {
    var source = input || {};
    var supplied = source.setupComponents || source.setupBonusParts;
    if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) return null;
    return {
      mode: clamp(integer(supplied.mode), 0, 25),
      humanRoster: clamp(integer(supplied.humanRoster), 0, 25),
      lives: clamp(integer(supplied.lives), 0, 25),
      cpuChallenge: clamp(integer(supplied.cpuChallenge), 0, 25),
      teamwork: clamp(integer(supplied.teamwork), 0, 25),
    };
  }
  function calculateSetupBonus(input) {
    var source = input || {};
    var mode = normalizedMode(source);
    var explicit = explicitSetupComponents(source);
    var parts = explicit || {
      mode: MODE_BONUSES[mode] || 0,
      humanRoster: humanRosterBonus(source.humanPlayers == null ? source.humanCount : source.humanPlayers),
      lives: livesBonus(source, mode),
      cpuChallenge: cpuChallengeBonus(source),
      teamwork: teamworkBonus(source),
    };
    var summed = parts.mode + parts.humanRoster + parts.lives + parts.cpuChallenge + parts.teamwork;
    var precomputed = source.setupBonus == null ? null : clamp(integer(source.setupBonus), 0, SETUP_DEFAULTS.maximum);
    var total = precomputed == null ? Math.min(SETUP_DEFAULTS.maximum, summed) : precomputed;
    return freeze({ modeKey: mode, source: precomputed == null ? (explicit ? 'components' : 'defaults') : 'total',
      parts: parts, total: total });
  }

  function expectedMakeRate(feel, laneCount) {
    var key = String(feel || 'standard').toLowerCase();
    var expected = EXPECTED_MAKE_RATE[key] == null ? EXPECTED_MAKE_RATE.standard : EXPECTED_MAKE_RATE[key];
    var lanes = integer(laneCount) || 1;
    if (lanes >= 4) expected -= 0.05;
    else if (lanes >= 2) expected -= 0.03;
    return Number(clamp(expected, 0.05, 0.95).toFixed(2));
  }
  function rateComponent(observedRate, expectedRate) {
    var observed = clamp(finite(observedRate, expectedRate), 0, 1);
    var expected = clamp(finite(expectedRate, 0.5), 0.01, 0.99);
    return clamp(observed >= expected
      ? (observed - expected) / (1 - expected)
      : (observed - expected) / expected, -1, 1);
  }
  function performanceMultiplier(input) {
    var source = input || {};
    var shots = Math.min(24, integer(source.eligibleShots));
    var expected = expectedMakeRate(source.feel, source.laneCount);
    var make = source.adjustedMake == null
      ? rateComponent(source.makeRate, expected) : clamp(finite(source.adjustedMake, 0), -1, 1);
    var components = {
      adjustedMake: make,
      landingQuality: clamp(finite(source.landingQuality, 0), -1, 1),
      ordinaryStreak: clamp(finite(source.ordinaryStreak, 0), -1, 1),
      clutch: clamp(finite(source.clutch, 0), -1, 1),
      teamContribution: clamp(finite(source.teamContribution, 0), -1, 1),
    };
    var raw = 0.60 * components.adjustedMake + 0.15 * components.landingQuality +
      0.10 * components.ordinaryStreak + 0.075 * components.clutch +
      0.075 * components.teamContribution;
    raw = clamp(raw, -1, 1);
    var confidence = shots < 4 ? 0 : Math.min(1, (shots - 3) / 9);
    var score = raw * confidence;
    var multiplier = score >= 0 ? 1 + 0.25 * score : 1 + 0.15 * score;
    multiplier = Number(clamp(multiplier, 0.85, 1.25).toFixed(6));
    return freeze({ multiplier: multiplier, eligibleShots: shots, expectedMakeRate: expected,
      confidence: confidence, score: score, raw: raw, components: components });
  }

  function excludedActivity(input) {
    var source = input || {};
    var activity = String(source.activityId || source.activity || source.mode || '').toLowerCase();
    return activity === 'practice' || activity === 'tutorial' || activity === 'physics-lab' ||
      activity === 'lab' || activity === 'rival-board' || activity === 'owner-test';
  }
  function isMatchRewardEligible(input) {
    var source = input || {};
    if (excludedActivity(source)) return false;
    var completed = source.completed === true || String(source.status || '').toLowerCase() === 'completed';
    if (!completed || source.resolved === false || source.abandoned === true ||
        source.imported === true || source.aiOnly === true || source.testData === true ||
        source.test === true || source.testMode === true || source.forced === true ||
        source.isForced === true || source.ownerTest === true || source.ownerTestMode === true ||
        source.practice === true || source.isPractice === true || source.physicsLab === true ||
        source.tutorial === true || source.debug === true || source.simulated === true) return false;
    return integer(source.qualifiedManualHumanFlips) > 0;
  }
  function outcomeKind(input) {
    var source = input || {};
    if (source.draw === true || String(source.result || '').toLowerCase() === 'draw') return 'draw';
    if (source.humanWon === true || source.winningSideHasHuman === true ||
        String(source.result || '').toLowerCase() === 'win') return 'human-win';
    return 'loss';
  }
  function zeroReward(reason) {
    return freeze({ eligible: false, reason: reason, fxp: 0, fc: 0, performanceMultiplier: 1,
      breakdown: { activityScale: 0, completionFXP: 0, participation: 0, setupBonus: 0,
        variableBase: 0, winBonus: 0, completionFC: 0, variableFC: 0,
        performanceFCAdjustment: 0, winFC: 0 } });
  }
  function calculateRewardFormula(input) {
    var source = input || {};
    var attempts = Math.min(6, integer(source.qualifiedManualHumanFlips == null
      ? source.attempts : source.qualifiedManualHumanFlips));
    var activityScale = Math.min(1, attempts / 4);
    var completionFXP = roundHalfAwayFromZero(30 * activityScale);
    var participation = 4 * attempts;
    var setupBonus = Math.min(25, integer(source.setupBonus));
    var variableBase = Math.min(50, participation + setupBonus);
    var p = clamp(finite(source.performanceMultiplier, 1), 0.85, 1.25);
    var baseWinBonus = roundHalfAwayFromZero(0.30 * (completionFXP + variableBase));
    var outcome = String(source.outcome || 'loss');
    // The frozen equation defines a win bonus, not a draw bonus. Draws still
    // receive completion, participation, setup, and performance credit.
    var winBonus = outcome === 'human-win' ? baseWinBonus : 0;
    var completionFC = roundHalfAwayFromZero(8 * activityScale);
    var variableFC = Math.max(1, roundHalfAwayFromZero(variableBase / 4));
    var performanceFCAdjustment = roundHalfAwayFromZero(variableFC * (p - 1));
    var winFC = roundHalfAwayFromZero(winBonus / 4);
    return freeze({
      fxp: completionFXP + roundHalfAwayFromZero(variableBase * p) + winBonus,
      fc: Math.max(0, completionFC + variableFC + performanceFCAdjustment + winFC),
      breakdown: { attempts: attempts, activityScale: activityScale,
        completionFXP: completionFXP, participation: participation, setupBonus: setupBonus,
        variableBase: variableBase, winBonus: winBonus, completionFC: completionFC,
        variableFC: variableFC, performanceFCAdjustment: performanceFCAdjustment, winFC: winFC },
    });
  }
  function calculateMatchReward(input) {
    var source = input || {};
    if (!isMatchRewardEligible(source)) return zeroReward('ineligible');
    var setup = calculateSetupBonus(source);
    var performance = source.performanceMultiplier == null
      ? performanceMultiplier(source.performance || source)
      : freeze({ multiplier: clamp(finite(source.performanceMultiplier, 1), 0.85, 1.25) });
    var p = performance.multiplier;
    var outcome = outcomeKind(source);
    var formula = calculateRewardFormula({
      qualifiedManualHumanFlips: source.qualifiedManualHumanFlips,
      setupBonus: setup.total, performanceMultiplier: p, outcome: outcome,
    });
    var breakdown = clone(formula.breakdown);
    breakdown.setupParts = clone(setup.parts);
    breakdown.setupSource = setup.source;
    return freeze({ eligible: true, reason: null, outcome: outcome, fxp: formula.fxp, fc: formula.fc,
      performanceMultiplier: p, performance: clone(performance),
      breakdown: breakdown });
  }
  function achievementReward(rarity) {
    var key = String(rarity || 'common').toLowerCase();
    var reward = ACHIEVEMENT_REWARDS[key];
    if (!reward) throw new RangeError('Unknown achievement rarity: ' + rarity);
    return freeze({ rarity: key, fxp: reward.fxp, fc: reward.fc });
  }

  if (fxpThresholdForLevel(50) !== 1590 || fxpThresholdForLevel(100) !== 3705) {
    throw new Error('v1.12 Flip Level curve invariant failed');
  }

  return freeze({
    schema: 'FlipEconomyV1', version: 1,
    MAX_LEVEL: 100, MAX_LEVEL_FXP: 3705,
    modeBonuses: clone(MODE_BONUSES), setupDefaults: clone(SETUP_DEFAULTS),
    expectedMakeRates: clone(EXPECTED_MAKE_RATE),
    achievementRewards: clone(ACHIEVEMENT_REWARDS),
    roundHalfAwayFromZero: roundHalfAwayFromZero,
    transitionCost: transitionCost, fxpThresholdForLevel: fxpThresholdForLevel,
    flipLevelForFxp: flipLevelForFxp, levelProgress: levelProgress,
    expectedMakeRate: expectedMakeRate, rateComponent: rateComponent,
    performanceMultiplier: performanceMultiplier,
    calculateSetupBonus: calculateSetupBonus,
    calculateRewardFormula: calculateRewardFormula,
    isMatchRewardEligible: isMatchRewardEligible,
    calculateMatchReward: calculateMatchReward,
    achievementReward: achievementReward,
  });
});
