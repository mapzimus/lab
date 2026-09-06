// v111-modes.js — pure/data-driven Cup, Team Clash, and shared reward rules.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.FlipgameV111Modes = api;
    if (root.FlipgameV111) api.install(root.FlipgameV111);
  }
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function () {
  'use strict';

  var SCHEMA = 'FlipgameModeStateV1';
  var VERSION = 1;
  var CONTRACT_REVISION = 4;
  var TEAM_COUNTS = Object.freeze([2, 4, 6, 8]);
  var ROULETTE_MULTIPLIERS = Object.freeze([1, 2, 3, 4, 4, 3, 2, 1]);
  var PLINKO_SLOTS = Object.freeze([
    Object.freeze({ label: 'Lives Doubled', prize: 'double' }),
    Object.freeze({ label: 'Everyone Else Halved', prize: 'halve' }),
    Object.freeze({ label: 'Always Magnet', prize: 'magnet' }),
    Object.freeze({ label: 'Automatic Loss', prize: 'lose' }),
    Object.freeze({ label: 'Automatic Win', prize: 'win' }),
    Object.freeze({ label: 'Automatic Loss', prize: 'lose' }),
    Object.freeze({ label: 'Always Magnet', prize: 'magnet' }),
    Object.freeze({ label: 'Everyone Else Halved', prize: 'halve' }),
    Object.freeze({ label: 'Lives Doubled', prize: 'double' }),
  ]);

  var CUP_FORMATS = Object.freeze({
    short: Object.freeze({ id: 'short', startingLives: 3, suddenDeathRotations: 3 }),
    full: Object.freeze({ id: 'full', startingLives: 10, suddenDeathRotations: 5 }),
  });

  // These descriptors deliberately contain no reward hooks. A physics module
  // may map physicsProfileId to sanitized forces, but every profile is applied
  // to the whole heat and can never target a seat or change a reward.
  var ARENA_DRAFT_PROFILES = Object.freeze([
    Object.freeze({ id: 'crosswind', label: 'Crosswind', physicsProfileId: 'wind-tunnel', competitiveEligible: true, symmetric: true, affectsAllPlayers: true, rewardFree: true }),
    Object.freeze({ id: 'moon-gravity', label: 'Moon Gravity', physicsProfileId: 'moon-gravity', competitiveEligible: true, symmetric: true, affectsAllPlayers: true, rewardFree: true }),
    Object.freeze({ id: 'gravity-slam', label: 'Gravity Slam', physicsProfileId: 'gravity-slam', competitiveEligible: true, symmetric: true, affectsAllPlayers: true, rewardFree: true }),
    Object.freeze({ id: 'spring-table', label: 'Spring Table', physicsProfileId: 'trampoline', competitiveEligible: true, symmetric: true, affectsAllPlayers: true, rewardFree: true }),
    Object.freeze({ id: 'slick-table', label: 'Slick Table', physicsProfileId: 'ice-slide', competitiveEligible: true, symmetric: true, affectsAllPlayers: true, rewardFree: true }),
  ]);

  function clone(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clone);
    var result = {};
    Object.keys(value).forEach(function (key) { result[key] = clone(value[key]); });
    return result;
  }

  function deepFreeze(value) {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function snapshot(value) { return deepFreeze(clone(value)); }
  function modulo(value, length) { return ((value % length) + length) % length; }
  function otherTeam(teamIndex) { return teamIndex === 0 ? 1 : 0; }
  function assertPlayerCount(count) {
    if (!Number.isInteger(count) || count < 2 || count > 8) {
      throw new RangeError('Player count must be between 2 and 8');
    }
  }
  function assertTeamPlayerCount(count) {
    if (TEAM_COUNTS.indexOf(count) < 0) {
      throw new RangeError('Team Clash needs 2, 4, 6, or 8 players');
    }
  }
  function normalizeDirection(value) { return value === -1 ? -1 : 1; }
  function normalizeResult(value) {
    var result = String(value || '').toUpperCase();
    if (result !== 'MAKE' && result !== 'MISS') throw new RangeError('Result must be MAKE or MISS');
    return result;
  }
  function playerId(definition, index) {
    return definition && definition.id != null ? String(definition.id) : 'seat-' + (index + 1);
  }

  function arenaProfile(profileId) {
    if (profileId == null || profileId === '') return null;
    var match = ARENA_DRAFT_PROFILES.find(function (profile) { return profile.id === profileId; });
    if (!match) throw new RangeError('Arena Draft profile is not competitively eligible: ' + profileId);
    return match;
  }

  function normalizeDraftSeed(seed) {
    if (seed == null || seed === '') return 'cup-draft-v111';
    return String(seed);
  }

  // FNV-1a provides a small, stable ordering primitive without touching the
  // gameplay/event random stream (or Math.random). It is not used for physics.
  function stableHash(value) {
    var hash = 2166136261;
    var text = String(value);
    for (var index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function draftSeriesSignature(input) {
    var value = input || {};
    var results = Array.isArray(value.heatResults) ? value.heatResults : [];
    return JSON.stringify({
      cupLength: value.cupLength || 'short',
      playerCount: Number(value.playerCount) || 0,
      playerIds: Array.isArray(value.playerIds) ? value.playerIds.map(String) : [],
      heatNumber: Number(value.heatNumber) || 0,
      heatWins: Array.isArray(value.heatWins) ? value.heatWins.map(Number) : [],
      heatResults: results.map(function (result) {
        return {
          heatNumber: Number(result.heatNumber) || 0,
          winnerIndex: Number(result.winnerIndex),
          openerIndex: Number(result.openerIndex),
          arenaProfileId: result.arenaProfileId || null,
        };
      }),
      openerIndex: Number(value.openerIndex) || 0,
    });
  }

  function createArenaDraftOffer(input) {
    var value = input || {};
    var heatNumber = Number(value.heatNumber);
    if (!Number.isInteger(heatNumber) || heatNumber < 2 || heatNumber > 3) {
      throw new RangeError('Arena Draft offers exist only between Cup regulation heats');
    }
    var seed = normalizeDraftSeed(value.seed);
    var signature = draftSeriesSignature(value);
    var choices = ARENA_DRAFT_PROFILES.map(function (profile) {
      return { profile: profile, score: stableHash(seed + '|' + signature + '|' + profile.id) };
    }).sort(function (left, right) {
      return left.score - right.score || left.profile.id.localeCompare(right.profile.id);
    }).slice(0, 3).map(function (entry) { return entry.profile; });
    return snapshot({
      schema: 'ArenaDraftOfferV1',
      version: 1,
      offerId: 'arena-draft-' + stableHash(seed + '|' + signature).toString(16).padStart(8, '0'),
      seed: seed,
      heatNumber: heatNumber,
      choices: choices,
      selectedProfileId: null,
    });
  }

  function resolveRouletteMultiplier(detail) {
    var data = detail || {};
    var slotIndex = Number(data.slotIndex);
    if (Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < ROULETTE_MULTIPLIERS.length) {
      return ROULETTE_MULTIPLIERS[slotIndex];
    }
    var multiplier = Number(data.multiplier);
    return Number.isInteger(multiplier) && multiplier >= 1 && multiplier <= 4 ? multiplier : 1;
  }

  function additiveLifeCap(startingLives) {
    return Math.ceil(Number(startingLives) * 1.5);
  }

  function addLivesCapped(lives, amount, startingLives) {
    var before = Math.max(0, Number(lives) || 0);
    var cap = additiveLifeCap(startingLives);
    var after = Math.min(cap, before + Math.max(0, Number(amount) || 0));
    // A prior multiplier can be above the additive ceiling; never clamp it.
    if (before >= cap) after = before;
    return Object.freeze({ lives: after, gained: after - before, cap: cap });
  }

  function multiplyLives(lives, multiplier) {
    var before = Math.max(0, Number(lives) || 0);
    var factor = Number(multiplier);
    if (!Number.isFinite(factor) || factor < 0) throw new RangeError('Life multiplier must be non-negative');
    return Math.max(0, Math.ceil(before * factor));
  }

  function halveLives(lives) {
    return Math.max(1, Math.ceil(Math.max(0, Number(lives) || 0) / 2));
  }

  function classicEventReward(input) {
    var value = input || {};
    var eventId = value.eventId || null;
    var detail = value.eventReward || value.metadata || {};
    var onCap = !!value.onCap;
    var result = normalizeResult(value.result);
    if (result !== 'MAKE') return snapshot({ eventId: eventId, additive: 0, multiplier: null, opponentEffect: null });
    var additive = 0;
    var multiplier = null;
    var opponentEffect = null;
    if (eventId === 'rainbow-corkscrew') additive = 1;
    else if (eventId === 'heart-rush') additive = 3;
    else if (eventId === 'shrink-ray') additive = onCap ? 3 : 2;
    else if (eventId === 'mitosis') additive = Number(detail.landedCount) >= 2 ? 3 : 0;
    else if (eventId === 'cap-toss') additive = 5;
    else if (eventId === 'roulette-table') multiplier = resolveRouletteMultiplier(detail);
    else if (eventId === 'double-flip') { multiplier = 2; opponentEffect = 'halve-lives'; }
    else if (eventId === 'life-drain') opponentEffect = 'set-lives-to-one';
    return snapshot({ eventId: eventId, additive: additive, multiplier: multiplier, opponentEffect: opponentEffect });
  }

  function orderFromOpener(count, openerIndex, direction, allowed) {
    var result = [];
    var allow = allowed ? new Set(allowed) : null;
    for (var offset = 0; offset < count; offset++) {
      var index = modulo(openerIndex + offset * direction, count);
      if (!allow || allow.has(index)) result.push(index);
    }
    return result;
  }

  function CupSeries(options) {
    if (!(this instanceof CupSeries)) return new CupSeries(options);
    var config = options || {};
    var count = Number(config.playerCount || (config.playerIds && config.playerIds.length));
    assertPlayerCount(count);
    var cupFormat = CUP_FORMATS[config.cupLength || config.length || 'short'];
    if (!cupFormat) throw new RangeError('Cup length must be short or full');
    var direction = normalizeDirection(config.direction);
    var openingIndex = Number.isInteger(config.openingIndex) ? modulo(config.openingIndex, count) : 0;
    var source = config.state && typeof config.state === 'object' ? config.state : null;
    var state = source ? clone(source) : {
      schema: SCHEMA,
      version: VERSION,
      format: 'cup',
      cupLength: cupFormat.id,
      bestOf: 3,
      winsNeeded: 2,
      startingLives: cupFormat.startingLives,
      suddenDeathRotations: cupFormat.suddenDeathRotations,
      playerCount: count,
      playerIds: (config.playerIds || Array.from({ length: count }, function (_, index) { return 'seat-' + (index + 1); })).map(String),
      direction: direction,
      initialOpenerIndex: openingIndex,
      openerIndex: openingIndex,
      heatNumber: 1,
      heatWins: Array(count).fill(0),
      heatResults: [],
      phase: 'heat',
      seriesWinnerIndex: null,
      seriesTied: false,
      tiebreakPlayers: [],
      tiebreakRound: 0,
      tiebreakResults: [],
      queue: [],
      clutch: null,
      highlight: null,
      persistentMagnetPlayerIndexes: [],
      arenaProfileId: config.arenaProfileId || null,
      arenaDraftSeed: normalizeDraftSeed(config.arenaDraftSeed || config.seriesSeed || config.seed),
      arenaDraft: null,
    };
    if (state.playerCount !== count || !Array.isArray(state.heatWins) || state.heatWins.length !== count) {
      throw new Error('Cup state does not match the player roster');
    }
    if (!Array.isArray(state.playerIds) || state.playerIds.length !== count ||
        state.playerIds.some(function (id, index) { return String(id) !== String((config.playerIds || state.playerIds)[index]); })) {
      throw new Error('Cup state player identities do not match the player roster');
    }
    arenaProfile(state.arenaProfileId);
    if (!Array.isArray(state.persistentMagnetPlayerIndexes)) state.persistentMagnetPlayerIndexes = [];
    state.persistentMagnetPlayerIndexes = Array.from(new Set(state.persistentMagnetPlayerIndexes
      .filter(function (index) { return Number.isInteger(index) && index >= 0 && index < count; })));
    state.arenaDraftSeed = normalizeDraftSeed(state.arenaDraftSeed || config.arenaDraftSeed || config.seriesSeed || config.seed);

    function currentDraftOffer() {
      return createArenaDraftOffer({
        seed: state.arenaDraftSeed,
        cupLength: state.cupLength,
        playerCount: state.playerCount,
        playerIds: state.playerIds,
        heatNumber: state.heatNumber,
        heatWins: state.heatWins,
        heatResults: state.heatResults,
        openerIndex: state.openerIndex,
      });
    }

    function validateOrRestoreDraft() {
      if (state.phase === 'shootout') {
        state.arenaProfileId = null;
        state.arenaDraft = null;
        return;
      }
      if (state.heatNumber <= 1 || (state.phase !== 'heat' && state.phase !== 'between-heats')) return;
      var expected = currentDraftOffer();
      var expectedIds = expected.choices.map(function (profile) { return profile.id; });
      if (state.arenaDraft == null) {
        var migratedSelection = state.phase === 'heat' && expectedIds.indexOf(state.arenaProfileId) >= 0
          ? state.arenaProfileId : null;
        state.arenaDraft = clone(expected);
        state.arenaDraft.selectedProfileId = migratedSelection;
      } else {
        var storedIds = Array.isArray(state.arenaDraft.choices)
          ? state.arenaDraft.choices.map(function (profile) { return profile && profile.id; }) : [];
        if (state.arenaDraft.schema !== expected.schema || state.arenaDraft.offerId !== expected.offerId ||
            storedIds.length !== 3 || storedIds.some(function (id, index) { return id !== expectedIds[index]; })) {
          throw new RangeError('Arena Draft save contains a forged or stale offer');
        }
        var selected = state.arenaDraft.selectedProfileId;
        if (selected != null && expectedIds.indexOf(selected) < 0) {
          throw new RangeError('Arena Draft selection is not in the current offer');
        }
        state.arenaDraft = clone(expected);
        state.arenaDraft.selectedProfileId = selected || null;
      }
      if (state.phase === 'heat' && state.arenaDraft.selectedProfileId !== state.arenaProfileId) {
        throw new RangeError('Arena Draft active profile does not match the saved selection');
      }
    }

    validateOrRestoreDraft();

    function shootoutQueue() {
      return orderFromOpener(count, state.openerIndex, direction, state.tiebreakPlayers).map(function (index, position) {
        return { position: position, playerIndex: index, playerId: state.playerIds[index], round: state.tiebreakRound };
      });
    }
    function updateQueue() {
      state.queue = state.phase === 'shootout' ? shootoutQueue() : [];
      state.clutch = state.phase === 'shootout' ? {
        active: true,
        kind: 'cup-shootout',
        tiebreakRound: state.tiebreakRound,
        nextPlayerIndex: state.queue.length ? state.queue[0].playerIndex : null,
      } : { active: false, kind: null, tiebreakRound: state.tiebreakRound, nextPlayerIndex: null };
    }
    updateQueue();

    this.recordHeatWinner = function (winnerIndex, metadata) {
      if (state.phase !== 'heat') throw new Error('Cup is not accepting a heat result');
      if (!Number.isInteger(winnerIndex) || winnerIndex < 0 || winnerIndex >= count) throw new RangeError('Invalid heat winner');
      state.heatWins[winnerIndex]++;
      state.heatResults.push({
        heatNumber: state.heatNumber,
        winnerIndex: winnerIndex,
        winnerId: state.playerIds[winnerIndex],
        openerIndex: state.openerIndex,
        arenaProfileId: state.arenaProfileId,
        metadata: clone(metadata || {}),
      });
      state.highlight = {
        kind: 'cup-heat', heatNumber: state.heatNumber, winnerIndex: winnerIndex,
        heatWins: state.heatWins.slice(),
      };
      if (state.heatWins[winnerIndex] >= 2) {
        state.phase = 'complete';
        state.seriesWinnerIndex = winnerIndex;
        state.seriesTied = false;
      } else if (state.heatNumber < 3) {
        state.phase = 'between-heats';
        state.heatNumber++;
        state.openerIndex = modulo(state.openerIndex + direction, count);
        state.arenaDraft = clone(currentDraftOffer());
      } else {
        var high = Math.max.apply(Math, state.heatWins);
        state.tiebreakPlayers = state.heatWins.map(function (wins, index) { return wins === high ? index : -1; })
          .filter(function (index) { return index >= 0; });
        state.phase = 'shootout';
        state.seriesTied = true;
        state.tiebreakRound = 1;
        state.openerIndex = modulo(state.openerIndex + direction, count);
        state.openerIndex = orderFromOpener(count, state.openerIndex, direction, state.tiebreakPlayers)[0];
        state.tiebreakResults = [];
        state.arenaProfileId = null;
        state.arenaDraft = null;
      }
      updateQueue();
      return this.snapshot();
    };

    this.recordPlinko = function (playerIndex, prize, metadata) {
      if (state.phase !== 'heat') throw new Error('Cup is not accepting a Plinko result');
      if (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex >= count) {
        throw new RangeError('Invalid Plinko player');
      }
      if (prize === 'magnet') {
        if (state.persistentMagnetPlayerIndexes.indexOf(playerIndex) < 0) {
          state.persistentMagnetPlayerIndexes.push(playerIndex);
          state.persistentMagnetPlayerIndexes.sort(function (a, b) { return a - b; });
        }
        return snapshot({ heatResolved: false, winnerIndex: null, state: state });
      }
      if (prize !== 'win' && prize !== 'lose') {
        return snapshot({ heatResolved: false, winnerIndex: null, state: state });
      }
      var winnerIndex = playerIndex;
      if (prize === 'lose') {
        winnerIndex = modulo(playerIndex + state.direction, count);
      }
      this.recordHeatWinner(winnerIndex, Object.assign({}, metadata || {}, {
        eventId: 'plinko', prize: prize, automatic: true, playerIndex: playerIndex,
      }));
      return snapshot({ heatResolved: true, winnerIndex: winnerIndex, state: state });
    };

    this.selectArenaDraft = function (arenaProfileId) {
      if (state.phase !== 'between-heats') throw new Error('Cup is not between heats');
      if (!state.arenaDraft || !Array.isArray(state.arenaDraft.choices)) {
        throw new Error('Cup has no current Arena Draft offer');
      }
      var requested = arenaProfile(arenaProfileId).id;
      var offered = state.arenaDraft.choices.some(function (profile) { return profile.id === requested; });
      if (!offered) throw new RangeError('Arena Draft selection is not in the current offer');
      state.arenaDraft.selectedProfileId = requested;
      return this.snapshot();
    };

    this.beginNextHeat = function (arenaProfileId) {
      if (state.phase !== 'between-heats') throw new Error('Cup is not between heats');
      if (arenaProfileId != null) this.selectArenaDraft(arenaProfileId);
      if (!state.arenaDraft.selectedProfileId) this.selectArenaDraft(state.arenaDraft.choices[0].id);
      state.arenaProfileId = state.arenaDraft.selectedProfileId;
      state.phase = 'heat';
      state.highlight = null;
      updateQueue();
      return this.snapshot();
    };

    this.recordShootoutFlip = function (playerIndex, result, metadata) {
      if (state.phase !== 'shootout') throw new Error('Cup is not in a shootout');
      var expected = state.queue[state.tiebreakResults.length];
      if (!expected || playerIndex !== expected.playerIndex) throw new Error('Shootout flip is out of order');
      var normalized = normalizeResult(result);
      state.tiebreakResults.push({
        round: state.tiebreakRound,
        playerIndex: playerIndex,
        playerId: state.playerIds[playerIndex],
        result: normalized,
        metadata: clone(metadata || {}),
      });
      state.highlight = {
        kind: 'cup-shootout-flip', tiebreakRound: state.tiebreakRound,
        playerIndex: playerIndex, result: normalized,
      };
      if (state.tiebreakResults.length === state.queue.length) {
        var makers = state.tiebreakResults.filter(function (entry) { return entry.result === 'MAKE'; });
        if (makers.length === 1) {
          state.seriesWinnerIndex = makers[0].playerIndex;
          state.seriesTied = false;
          state.phase = 'complete';
          state.highlight = {
            kind: 'cup-shootout-win', tiebreakRound: state.tiebreakRound,
            winnerIndex: state.seriesWinnerIndex,
          };
        } else {
          state.tiebreakRound++;
          var position = state.tiebreakPlayers.indexOf(state.openerIndex);
          state.openerIndex = state.tiebreakPlayers[modulo(position + 1, state.tiebreakPlayers.length)];
          state.tiebreakResults = [];
          state.highlight = {
            kind: 'cup-shootout-repeat', tiebreakRound: state.tiebreakRound,
            reason: makers.length === 0 ? 'no-makers' : 'multiple-makers',
          };
        }
      }
      updateQueue();
      return this.snapshot();
    };

    this.snapshot = function () { return snapshot(state); };
    this.arenaDraftOffer = function () { return state.arenaDraft ? snapshot(state.arenaDraft) : null; };
    this.currentOpenerIndex = function () { return state.openerIndex; };
    this.isComplete = function () { return state.phase === 'complete'; };
    this.newCupOptions = function () {
      return snapshot({
        playerCount: count,
        playerIds: state.playerIds,
        cupLength: state.cupLength,
        direction: state.direction,
        openingIndex: modulo(state.initialOpenerIndex + state.direction, count),
        arenaProfileId: state.arenaProfileId,
        arenaDraftSeed: state.arenaDraftSeed,
      });
    };
  }

  function defaultTeams(count) {
    var teams = [[], []];
    for (var index = 0; index < count; index++) teams[index % 2].push(index);
    return teams;
  }

  function normalizeTeams(teams, count) {
    var value = teams ? clone(teams) : defaultTeams(count);
    if (!Array.isArray(value) || value.length !== 2 || !value[0].length || !value[1].length) {
      throw new TypeError('Team Clash requires two non-empty teams');
    }
    var flat = value[0].concat(value[1]);
    if (flat.length !== count || new Set(flat).size !== count ||
        flat.some(function (index) { return !Number.isInteger(index) || index < 0 || index >= count; })) {
      throw new Error('Each Team Clash player must appear on exactly one team');
    }
    if (value[0].length !== value[1].length) throw new Error('Team Clash teams must be equal');
    return value;
  }

  function teamEventOutcome(input) {
    var value = input || {};
    var result = normalizeResult(value.result);
    var eventId = value.eventId || null;
    var detail = value.eventReward || value.metadata || {};
    var onCap = !!value.onCap;
    var golden = !!value.golden || eventId === 'golden-flip';
    var plinko = value.plinko || detail.plinko || detail.prize || null;
    var outcome = {
      eventId: eventId,
      result: result,
      rawPoints: result === 'MAKE' ? (golden ? 2 : 1) : 0,
      halveOpponentRound: false,
      halveOpponentScore: false,
      persistentMagnet: false,
      automaticWinner: null,
      excluded: false,
    };
    if (eventId === 'life-drain') {
      outcome.rawPoints = 0;
      outcome.excluded = true;
      return snapshot(outcome);
    }
    if (eventId === 'plinko') {
      if (plinko === 'win') outcome.automaticWinner = 'current';
      else if (plinko === 'lose') outcome.automaticWinner = 'opponent';
      else if (plinko === 'double') outcome.rawPoints = 2;
      else if (plinko === 'halve') outcome.halveOpponentScore = true;
      else if (plinko === 'magnet') outcome.persistentMagnet = true;
      return snapshot(outcome);
    }
    if (result !== 'MAKE') return snapshot(outcome);
    if (eventId === 'rainbow-corkscrew') outcome.rawPoints = 2;
    else if (eventId === 'heart-rush') outcome.rawPoints = 4;
    else if (eventId === 'shrink-ray') outcome.rawPoints = onCap ? 3 : 2;
    else if (eventId === 'mitosis') outcome.rawPoints = Number(detail.landedCount) >= 2 ? 3 : 1;
    else if (eventId === 'roulette-table') outcome.rawPoints *= resolveRouletteMultiplier(detail);
    else if (eventId === 'cap-toss') outcome.rawPoints = 5;
    else if (eventId === 'double-flip') { outcome.rawPoints = 2; outcome.halveOpponentRound = true; }
    // Mirror replays normalized launch/spin/seed/profile with events disabled;
    // only the copied flip's final verdict scores, so rewards never nest.
    else if (eventId === 'mirror-match') outcome.rawPoints = 1;
    // Rewind deliberately has no special branch: only its final verdict scores.
    return snapshot(outcome);
  }

  function TeamClash(options) {
    if (!(this instanceof TeamClash)) return new TeamClash(options);
    var config = options || {};
    var count = Number(config.playerCount || (config.playerIds && config.playerIds.length));
    assertTeamPlayerCount(count);
    var playerIds = (config.playerIds || Array.from({ length: count }, function (_, index) { return 'seat-' + (index + 1); })).map(String);
    var teams = normalizeTeams(config.teams, count);
    var source = config.state && typeof config.state === 'object' ? config.state : null;
    var state = source ? clone(source) : {
      schema: SCHEMA,
      version: VERSION,
      format: 'team-clash',
      playerCount: count,
      playerIds: playerIds,
      teams: teams,
      teamNames: Array.isArray(config.teamNames) && config.teamNames.length === 2 ? config.teamNames.map(String) : ['A', 'B'],
      targetScore: 11,
      flipsPerTeam: 3,
      scores: [0, 0],
      roundNumber: 1,
      roundStartingTeam: config.startingTeam === 1 ? 1 : 0,
      matchStartingTeam: config.startingTeam === 1 ? 1 : 0,
      teammateOffsets: Array.isArray(config.teammateOffsets) ? config.teammateOffsets.slice(0, 2) : [0, 0],
      matchOpeningOffsets: Array.isArray(config.teammateOffsets) ? config.teammateOffsets.slice(0, 2) : [0, 0],
      roundRaw: [0, 0],
      flipsTaken: [0, 0],
      queuePosition: 0,
      queue: [],
      winnerTeamIndex: null,
      winningPlayerIndex: null,
      phase: 'round',
      rematchNumber: Number(config.rematchNumber) || 0,
      persistentMagnetPlayerIndexes: [],
      lastAction: null,
      clutch: null,
      highlight: null,
      arenaProfileId: config.arenaProfileId || null,
    };
    if (state.playerCount !== count) throw new Error('Team Clash state does not match the player roster');
    if (!Array.isArray(state.playerIds) || state.playerIds.length !== count ||
        state.playerIds.some(function (id, index) { return String(id) !== String(playerIds[index]); })) {
      throw new Error('Team Clash state player identities do not match the player roster');
    }
    state.teams = normalizeTeams(state.teams, count);
    arenaProfile(state.arenaProfileId);

    function buildQueue() {
      var result = [];
      for (var flip = 0; flip < 3; flip++) {
        for (var alternating = 0; alternating < 2; alternating++) {
          var teamIndex = alternating === 0 ? state.roundStartingTeam : otherTeam(state.roundStartingTeam);
          var roster = state.teams[teamIndex];
          var playerIndex = roster[modulo(state.teammateOffsets[teamIndex] + flip, roster.length)];
          result.push({
            position: result.length,
            round: state.roundNumber,
            teamIndex: teamIndex,
            playerIndex: playerIndex,
            playerId: state.playerIds[playerIndex],
            teamFlip: flip + 1,
          });
        }
      }
      return result;
    }

    function updateClutch() {
      var next = state.queue[state.queuePosition] || null;
      if (!next || state.phase === 'complete') {
        state.clutch = { active: false, kind: null, teamIndex: null, playerIndex: null };
        return;
      }
      var opponent = otherTeam(next.teamIndex);
      var finalFlip = state.queuePosition === state.queue.length - 1;
      var gainOnBaseMake = Math.max(0, state.roundRaw[next.teamIndex] + 1 - state.roundRaw[opponent]);
      var gainOnMiss = Math.max(0, state.roundRaw[next.teamIndex] - state.roundRaw[opponent]);
      state.clutch = {
        active: finalFlip && (state.scores[next.teamIndex] + gainOnBaseMake >= 11 ||
          state.scores[opponent] + Math.max(0, state.roundRaw[opponent] - state.roundRaw[next.teamIndex]) >= 11),
        kind: finalFlip ? 'round-closing' : null,
        teamIndex: next.teamIndex,
        playerIndex: next.playerIndex,
        matchPointOnBaseMake: finalFlip && state.scores[next.teamIndex] + gainOnBaseMake >= 11,
        opponentMatchPointOnMiss: finalFlip && state.scores[opponent] + Math.max(0, state.roundRaw[opponent] - state.roundRaw[next.teamIndex] - gainOnMiss) >= 11,
      };
    }

    function startRound() {
      state.roundRaw = [0, 0];
      state.flipsTaken = [0, 0];
      state.queuePosition = 0;
      state.queue = buildQueue();
      updateClutch();
    }
    if (!source || !Array.isArray(state.queue) || !state.queue.length) startRound();
    else updateClutch();

    this.recordFlip = function (input) {
      if (state.phase !== 'round') throw new Error('Team Clash match is complete');
      var expected = state.queue[state.queuePosition];
      var playerIndex = Number(input && input.playerIndex);
      if (!expected || playerIndex !== expected.playerIndex) throw new Error('Team Clash flip is out of order');
      var teamIndex = expected.teamIndex;
      var opponent = otherTeam(teamIndex);
      var outcome = teamEventOutcome({
        result: input.result,
        eventId: input.eventId,
        onCap: input.onCap,
        golden: input.golden,
        plinko: input.plinko,
        eventReward: input.eventReward || input.metadata,
      });
      if (outcome.excluded) throw new Error('Life Drain is not eligible in Team Clash');
      if (outcome.halveOpponentRound) state.roundRaw[opponent] = Math.ceil(state.roundRaw[opponent] / 2);
      if (outcome.halveOpponentScore) state.scores[opponent] = Math.ceil(state.scores[opponent] / 2);
      if (outcome.persistentMagnet && state.persistentMagnetPlayerIndexes.indexOf(playerIndex) < 0) {
        state.persistentMagnetPlayerIndexes.push(playerIndex);
      }
      state.roundRaw[teamIndex] += outcome.rawPoints;
      state.flipsTaken[teamIndex]++;
      state.lastAction = {
        round: state.roundNumber,
        queuePosition: state.queuePosition,
        teamIndex: teamIndex,
        playerIndex: playerIndex,
        result: outcome.result,
        eventId: outcome.eventId,
        rawPoints: outcome.rawPoints,
        effects: {
          opponentRoundHalved: outcome.halveOpponentRound,
          opponentScoreHalved: outcome.halveOpponentScore,
          persistentMagnet: outcome.persistentMagnet,
        },
      };
      state.highlight = Object.assign({ kind: 'team-flip' }, clone(state.lastAction));
      state.queuePosition++;

      if (outcome.automaticWinner) {
        state.winnerTeamIndex = outcome.automaticWinner === 'current' ? teamIndex : opponent;
        state.winningPlayerIndex = outcome.automaticWinner === 'current' ? playerIndex : state.teams[opponent][0];
        state.phase = 'complete';
        state.highlight = Object.assign({}, state.highlight, { kind: 'team-automatic-result', winnerTeamIndex: state.winnerTeamIndex });
      } else if (state.queuePosition === state.queue.length) {
        var difference = state.roundRaw[0] - state.roundRaw[1];
        var awardedTeam = difference === 0 ? null : (difference > 0 ? 0 : 1);
        var awardedPoints = Math.abs(difference);
        if (awardedTeam !== null) state.scores[awardedTeam] += awardedPoints;
        state.highlight = {
          kind: 'team-round', round: state.roundNumber, raw: state.roundRaw.slice(),
          cancelled: Math.min(state.roundRaw[0], state.roundRaw[1]),
          awardedTeamIndex: awardedTeam, awardedPoints: awardedPoints, scores: state.scores.slice(),
        };
        if (state.scores[0] >= 11 || state.scores[1] >= 11) {
          state.winnerTeamIndex = state.scores[0] >= 11 ? 0 : 1;
          state.winningPlayerIndex = state.teams[state.winnerTeamIndex][0];
          state.phase = 'complete';
        } else {
          state.roundNumber++;
          state.roundStartingTeam = otherTeam(state.roundStartingTeam);
          state.teammateOffsets = state.teammateOffsets.map(function (offset, index) {
            return modulo(offset + 3, state.teams[index].length);
          });
          startRound();
        }
      }
      updateClutch();
      return this.snapshot();
    };

    this.snapshot = function () { return snapshot(state); };
    this.nextFlip = function () { return state.queue[state.queuePosition] ? snapshot(state.queue[state.queuePosition]) : null; };
    this.isComplete = function () { return state.phase === 'complete'; };
    this.rematchOptions = function () {
      return snapshot({
        playerCount: count,
        playerIds: state.playerIds,
        teams: state.teams,
        teamNames: state.teamNames,
        startingTeam: otherTeam(state.matchStartingTeam),
        teammateOffsets: state.matchOpeningOffsets.map(function (offset, index) {
          return modulo(offset + 1, state.teams[index].length);
        }),
        rematchNumber: state.rematchNumber + 1,
        arenaProfileId: state.arenaProfileId,
      });
    };
    this.swapTeamOptions = function () {
      return snapshot({
        playerCount: count,
        playerIds: state.playerIds,
        teams: [state.teams[1].slice(), state.teams[0].slice()],
        teamNames: [state.teamNames[1], state.teamNames[0]],
        startingTeam: otherTeam(state.matchStartingTeam),
        teammateOffsets: [0, 0],
        rematchNumber: state.rematchNumber + 1,
        arenaProfileId: state.arenaProfileId,
      });
    };
  }

  function eventMetadata(context) {
    var meta = context.meta || {};
    return {
      eventId: context.eventId || meta.eventId || meta.rareEvent || null,
      onCap: !!meta.onCap,
      golden: !!meta.golden,
      plinko: meta.plinko || null,
      eventReward: meta.eventReward || meta,
    };
  }

  function emit(outcomes, type, payload) {
    if (!outcomes || typeof outcomes.emit !== 'function') return null;
    return outcomes.emit(type, payload, { source: 'v111-modes', contractRevision: CONTRACT_REVISION });
  }

  function createCupAdapter(options) {
    var config = options || {};
    var series = null;
    var resolutionEmitted = false;
    return {
      id: 'cup',
      prepareMatch: function (request) {
        resolutionEmitted = false;
        var opts = Object.assign({}, request.options || {});
        var defs = Array.isArray(request.defs) ? request.defs : [];
        var priorState = opts.cupState || null;
        series = new CupSeries({
          playerCount: defs.length,
          playerIds: defs.map(playerId),
          cupLength: opts.cupLength || (priorState && priorState.cupLength) || 'short',
          direction: request.direction,
          openingIndex: Number.isInteger(opts.startIndex) ? opts.startIndex : 0,
          arenaProfileId: opts.arenaProfileId || (priorState && priorState.arenaProfileId),
          arenaDraftSeed: opts.arenaDraftSeed || opts.seriesSeed || opts.seed,
          state: priorState,
        });
        var cup = series.snapshot();
        if (cup.phase === 'between-heats') {
          series.beginNextHeat(opts.arenaDraftSelectionId);
          cup = series.snapshot();
        }
        opts.format = 'cup';
        opts.cupLength = cup.cupLength;
        opts.startingLives = cup.startingLives;
        opts.startIndex = cup.openerIndex;
        opts.suddenDeathFlipThreshold = cup.suddenDeathRotations * defs.length;
        opts.eventsDisabled = cup.phase === 'shootout';
        opts.arenaDraftSeed = cup.arenaDraftSeed;
        opts.arenaDraft = cup.arenaDraft;
        opts.arenaProfileId = cup.arenaProfileId;
        opts.persistentMagnetPlayerIndexes = cup.persistentMagnetPlayerIndexes.slice();
        opts.arenaProfile = cup.phase === 'shootout' ? null : arenaProfile(cup.arenaProfileId);
        opts.arenaRewardsDisabled = !!opts.arenaProfile;
        return Object.assign({}, request, { options: opts });
      },
      resolveFlip: function (context) {
        if (!series) return false;
        var cup = series.snapshot();
        if (cup.phase !== 'shootout') {
          if (context.meta && context.meta.plinko && context.game.resolvePlinko) {
            var prize = context.meta.plinko;
            var currentIndex = context.game.currentPlayerIndex;
            context.game.resolvePlinko(prize);
            var plinko = series.recordPlinko(currentIndex, prize, { turns: context.game.turnCounter });
            if (prize === 'magnet') context.game.currentPlayer().alwaysMagnet = true;
            if (plinko.heatResolved) {
              context.game.players.forEach(function (player, index) {
                if (index === plinko.winnerIndex) return;
                if (context.game.eliminatePlayer) context.game.eliminatePlayer(player);
                else { player.lives = 0; player.eliminated = true; }
              });
              context.game.winnerIndex = plinko.winnerIndex;
              emit(config.outcomes, 'mode.cup-heat-resolved.v1', series.snapshot());
              if (series.isComplete() && !resolutionEmitted) {
                emit(config.outcomes, 'mode.cup-resolved.v1', series.snapshot());
                resolutionEmitted = true;
              }
            }
          } else context.game.resolveFlip(context.result, Object.assign({}, context.meta, { eventId: context.eventId }));
          return true;
        }
        var game = context.game;
        if (game.resetOutcomeFlags) game.resetOutcomeFlags();
        game.lastResult = normalizeResult(context.result);
        game.perfectLanding = game.lastResult === 'MAKE' && !!(context.meta && context.meta.perfect);
        game.capLand = game.lastResult === 'MAKE' && !!(context.meta && context.meta.onCap);
        game.turnCounter++;
        series.recordShootoutFlip(game.currentPlayerIndex, game.lastResult, { landing: clone(context.landing || {}) });
        emit(config.outcomes, 'mode.cup-shootout-flip.v1', series.snapshot());
        game.setState('RESULT');
        return true;
      },
      advanceTurn: function (context) {
        if (!series) return false;
        var game = context.game;
        var cup = series.snapshot();
        if (cup.phase === 'complete' && cup.tiebreakRound > 0) {
          game.players.forEach(function (player, index) {
            if (index === cup.seriesWinnerIndex) return;
            if (game.eliminatePlayer) game.eliminatePlayer(player);
            else { player.lives = 0; player.eliminated = true; }
          });
          game.winnerIndex = cup.seriesWinnerIndex;
          if (!resolutionEmitted) {
            emit(config.outcomes, 'mode.cup-resolved.v1', cup);
            resolutionEmitted = true;
          }
          game.setState('GAME_OVER');
          return true;
        }
        if (cup.phase === 'shootout') {
          if (cup.queue.length === 0) return true;
          game.currentPlayerIndex = cup.queue[cup.tiebreakResults.length].playerIndex;
          game.setState('TURN_START');
          return true;
        }
        var active = game.activePlayers();
        if (active.length <= 1 && cup.phase === 'heat') {
          var winnerIndex = active.length ? game.players.indexOf(active[0]) : game.winnerIndex;
          series.recordHeatWinner(winnerIndex, { turns: game.turnCounter });
          emit(config.outcomes, 'mode.cup-heat-resolved.v1', series.snapshot());
          if (series.isComplete() && !resolutionEmitted) {
            emit(config.outcomes, 'mode.cup-resolved.v1', series.snapshot());
            resolutionEmitted = true;
          }
        }
        game.advanceTurn();
        return true;
      },
      snapshot: function () {
        if (!series) return null;
        return snapshot(Object.assign({}, series.snapshot(), {
          newCupOptions: series.newCupOptions(),
        }));
      },
    };
  }

  function createTeamAdapter(options) {
    var config = options || {};
    var match = null;
    var resolutionEmitted = false;
    return {
      id: 'team-clash',
      prepareMatch: function (request) {
        resolutionEmitted = false;
        var opts = Object.assign({}, request.options || {});
        var defs = Array.isArray(request.defs) ? request.defs : [];
        match = new TeamClash({
          playerCount: defs.length,
          playerIds: defs.map(playerId),
          teams: opts.teams,
          teamNames: opts.teamNames,
          startingTeam: opts.startingTeam,
          teammateOffsets: opts.teammateOffsets,
          rematchNumber: opts.rematchNumber,
          arenaProfileId: opts.arenaProfileId,
          state: opts.teamState,
        });
        var next = match.nextFlip();
        opts.format = 'team-clash';
        opts.startIndex = next.playerIndex;
        opts.eventsDisabled = false;
        opts.excludedEventIds = ['life-drain'];
        opts.arenaProfile = arenaProfile(opts.arenaProfileId);
        opts.arenaRewardsDisabled = !!opts.arenaProfile;
        return Object.assign({}, request, { options: opts });
      },
      resolveFlip: function (context) {
        if (!match) return false;
        var game = context.game;
        var meta = eventMetadata(context);
        if (game.resetOutcomeFlags) game.resetOutcomeFlags();
        game.lastResult = normalizeResult(context.result);
        game.perfectLanding = game.lastResult === 'MAKE' && !!(context.meta && context.meta.perfect);
        game.capLand = game.lastResult === 'MAKE' && meta.onCap;
        game.goldenFlip = game.lastResult === 'MAKE' && meta.golden;
        game.plinkoPrize = meta.plinko;
        game.turnCounter++;
        var state = match.recordFlip(Object.assign({
          playerIndex: game.currentPlayerIndex,
          result: game.lastResult,
        }, meta));
        if (state.persistentMagnetPlayerIndexes.indexOf(game.currentPlayerIndex) >= 0) {
          game.currentPlayer().alwaysMagnet = true;
        }
        game.teamClash = state;
        game.eventReward = state.highlight;
        if (state.highlight && state.highlight.kind === 'team-round') {
          emit(config.outcomes, 'mode.team-round-resolved.v1', state);
        }
        game.setState('RESULT');
        return true;
      },
      advanceTurn: function (context) {
        if (!match) return false;
        var game = context.game;
        var state = match.snapshot();
        if (state.phase === 'complete') {
          state.teams[otherTeam(state.winnerTeamIndex)].forEach(function (index) {
            if (game.eliminatePlayer) game.eliminatePlayer(game.players[index]);
            else { game.players[index].lives = 0; game.players[index].eliminated = true; }
          });
          game.winnerIndex = state.winningPlayerIndex != null
            ? state.winningPlayerIndex : state.teams[state.winnerTeamIndex][0];
          if (!resolutionEmitted) {
            emit(config.outcomes, 'mode.team-resolved.v1', state);
            resolutionEmitted = true;
          }
          game.setState('GAME_OVER');
          return true;
        }
        var next = match.nextFlip();
        game.currentPlayerIndex = next.playerIndex;
        game.setState('TURN_START');
        return true;
      },
      snapshot: function () {
        if (!match) return null;
        return snapshot(Object.assign({}, match.snapshot(), {
          rematchOptions: match.rematchOptions(),
          swapTeamOptions: match.swapTeamOptions(),
        }));
      },
    };
  }

  function install(runtime) {
    if (!runtime || !runtime.modes || typeof runtime.modes.register !== 'function') return false;
    if (!runtime.modes.has('cup')) runtime.modes.register(createCupAdapter({ outcomes: runtime.outcomes }));
    if (!runtime.modes.has('team-clash')) runtime.modes.register(createTeamAdapter({ outcomes: runtime.outcomes }));
    return true;
  }

  return Object.freeze({
    schema: 'FlipgameRulesModesV1',
    version: VERSION,
    contractRevision: CONTRACT_REVISION,
    CUP_FORMATS: CUP_FORMATS,
    TEAM_COUNTS: TEAM_COUNTS,
    PLINKO_SLOTS: PLINKO_SLOTS,
    ROULETTE_MULTIPLIERS: ROULETTE_MULTIPLIERS,
    ARENA_DRAFT_PROFILES: ARENA_DRAFT_PROFILES,
    arenaProfile: arenaProfile,
    createArenaDraftOffer: createArenaDraftOffer,
    additiveLifeCap: additiveLifeCap,
    addLivesCapped: addLivesCapped,
    multiplyLives: multiplyLives,
    halveLives: halveLives,
    classicEventReward: classicEventReward,
    teamEventOutcome: teamEventOutcome,
    CupSeries: CupSeries,
    TeamClash: TeamClash,
    createCupAdapter: createCupAdapter,
    createTeamAdapter: createTeamAdapter,
    install: install,
  });
});
