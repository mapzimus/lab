// v112-activity.js -- activity/session contracts shared by Story, Rival Board,
// free play, and Battle. This module owns no DOM, physics, progression, or stats.
(function (root, factory) {
  'use strict';
  var commonJs = typeof module === 'object' && !!module && !!module.exports &&
    typeof require === 'function' && typeof process === 'object' && !!process &&
    !!process.versions && typeof process.versions.node === 'string';
  var api = factory(root, commonJs);
  if (commonJs) module.exports = api;
  else if (root) root.FlipgameV112Activity = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (root, commonJs) {
  'use strict';

  var cachedRulesAuthority = null;
  var cachedBattleAuthority = null;

  function acceptedAuthority(candidate, schema, requiredMethods) {
    return !!candidate && typeof candidate === 'object' && Object.isFrozen(candidate) &&
      candidate.schema === schema && requiredMethods.every(function (method) {
        return typeof candidate[method] === 'function';
      });
  }

  function browserAuthority(name, schema, requiredMethods) {
    if (!root || !Object.prototype.hasOwnProperty.call(root, name)) return null;
    var candidate = root[name];
    if (!acceptedAuthority(candidate, schema, requiredMethods)) {
      throw new Error(name + ' is not a frozen canonical authority');
    }
    return candidate;
  }

  if (!commonJs) {
    cachedRulesAuthority = browserAuthority('FlipgameV112Rules',
      'FlipgameV112RulesV1', ['toMatchOutcomeV2']);
    cachedBattleAuthority = browserAuthority('FlipgameV112Battle',
      'BattleRulesV1', ['normalizeConfig', 'validateBattleState', 'toMatchOutcomeV2']);
  }

  function rulesAuthority() {
    if (!cachedRulesAuthority && commonJs) {
      cachedRulesAuthority = require('./v112-rules.js');
    } else if (!cachedRulesAuthority) {
      cachedRulesAuthority = browserAuthority('FlipgameV112Rules',
        'FlipgameV112RulesV1', ['toMatchOutcomeV2']);
    }
    if (!acceptedAuthority(cachedRulesAuthority, 'FlipgameV112RulesV1',
      ['toMatchOutcomeV2'])) {
      throw new Error('FlipgameV112Rules must load before Rules-state outcomes are accepted');
    }
    return cachedRulesAuthority;
  }

  function battleAuthority() {
    if (!cachedBattleAuthority && commonJs) {
      cachedBattleAuthority = require('./v112-battle.js');
    } else if (!cachedBattleAuthority) {
      cachedBattleAuthority = browserAuthority('FlipgameV112Battle',
        'BattleRulesV1', ['normalizeConfig', 'validateBattleState', 'toMatchOutcomeV2']);
    }
    if (!acceptedAuthority(cachedBattleAuthority, 'BattleRulesV1',
      ['normalizeConfig', 'validateBattleState', 'toMatchOutcomeV2'])) {
      throw new Error('FlipgameV112Battle must load before Battle-state outcomes are accepted');
    }
    return cachedBattleAuthority;
  }

  var ACTIVITY_IDS = Object.freeze([
    'free-play', 'story', 'rival-board', 'practice', 'physics-lab', 'tutorial',
  ]);
  var FORMAT_IDS = Object.freeze(['classic', 'cup', 'team-clash', 'battle']);
  var PHYSICS_MODE_IDS = Object.freeze(['normal', 'insane', 'alien']);
  var LANE_STATES = Object.freeze([
    'ready', 'aiming', 'airborne', 'contact', 'settling', 'resolved', 'disabled',
  ]);
  var LANE_TRANSITIONS = Object.freeze({
    ready: Object.freeze(['aiming', 'disabled']),
    aiming: Object.freeze(['ready', 'airborne', 'disabled']),
    airborne: Object.freeze(['contact', 'settling', 'resolved', 'disabled']),
    contact: Object.freeze(['airborne', 'settling', 'resolved', 'disabled']),
    settling: Object.freeze(['airborne', 'contact', 'resolved', 'disabled']),
    resolved: Object.freeze(['ready', 'disabled']),
    disabled: Object.freeze(['ready']),
  });

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function object(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function nonEmpty(value, label) {
    var text = String(value == null ? '' : value).trim();
    if (!text) throw new TypeError(label + ' is required');
    return text;
  }

  function oneOf(value, values, label) {
    var text = nonEmpty(value, label);
    if (values.indexOf(text) < 0) throw new TypeError('Unsupported ' + label + ': ' + text);
    return text;
  }

  function finiteInteger(value, fallback) {
    var number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.floor(number);
  }

  function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function sameCanonicalValue(left, right) {
    if (left === right) return true;
    if (left == null || right == null || typeof left !== 'object' || typeof right !== 'object') {
      return false;
    }
    if (Array.isArray(left) || Array.isArray(right)) {
      return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
        left.every(function (value, index) { return sameCanonicalValue(value, right[index]); });
    }
    var leftKeys = Object.keys(left).sort();
    var rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length && leftKeys.every(function (key, index) {
      return key === rightKeys[index] && sameCanonicalValue(left[key], right[key]);
    });
  }

  function supportedRulesState(value) {
    var schema = object(value).schema;
    return schema === 'ClassicRulesStateV1' || schema === 'CupRulesStateV1' ||
      schema === 'TeamClashRulesStateV1' || schema === 'BattleStateV1';
  }

  function canonicalRulesOutcome(source, status) {
    var state = object(source.rulesState);
    if (!Object.keys(state).length) return null;
    if (!supportedRulesState(state)) {
      throw new TypeError('A supported Rules state is required');
    }
    var authority = state.schema === 'BattleStateV1' ? battleAuthority() : rulesAuthority();
    var canonical = authority.toMatchOutcomeV2(state, {
      status: status,
      activityState: clone(object(source.activityState)),
      telemetry: clone(object(source.telemetry)),
      endedAt: source.endedAt == null ? null : String(source.endedAt),
    });
    if (String(source.matchId == null ? '' : source.matchId).trim() !== canonical.matchId) {
      throw new RangeError('Match outcome identity contradicts its Rules state');
    }
    if (hasOwn(source, 'winnerIds')) {
      var suppliedWinners = Array.from(new Set(Array.isArray(source.winnerIds)
        ? source.winnerIds.map(String) : []));
      if (!sameCanonicalValue(suppliedWinners, canonical.winnerIds)) {
        throw new RangeError('Match outcome winners contradict the Rules-owned result');
      }
    }
    if (hasOwn(source, 'participantResults') &&
        !sameCanonicalValue(clone(Array.isArray(source.participantResults)
          ? source.participantResults : []), canonical.participantResults)) {
      throw new RangeError('Match outcome participants contradict the Rules-owned result');
    }
    if (source.completionReason != null &&
        String(source.completionReason) !== canonical.completionReason) {
      throw new RangeError('Match completion reason contradicts the Rules-owned result');
    }
    if (hasOwn(source, 'resolutionIdentity') &&
        !sameCanonicalValue(clone(object(source.resolutionIdentity)), canonical.resolutionIdentity)) {
      throw new RangeError('Match resolution identity contradicts the Rules-owned result');
    }
    return canonical;
  }

  // SessionActivityStateProviderV1 is deliberately registered out-of-band from
  // MatchRequestV2: request records stay serializable while coordinators can
  // obtain authoritative, current activity state at prepare/finalize/abandon.
  function createSessionActivityStateProvider(reader) {
    if (typeof reader !== 'function') throw new TypeError('Activity-state reader is required');
    return Object.freeze({ schema: 'SessionActivityStateProviderV1', read: reader });
  }

  function MatchSessionHooksV1(value) {
    var source = object(value);
    var provider = source.activityStateProvider || null;
    if (provider && (provider.schema !== 'SessionActivityStateProviderV1' ||
        typeof provider.read !== 'function')) {
      throw new TypeError('Invalid SessionActivityStateProviderV1');
    }
    return Object.freeze({ schema: 'MatchSessionHooksV1', activityStateProvider: provider });
  }

  function readSessionActivityState(session, phase) {
    var provider = session && session.hooks && session.hooks.activityStateProvider;
    if (!provider) return null;
    var state = provider.read(Object.freeze({
      schema: 'SessionActivityStateReadV1', phase: String(phase),
      request: session.request, prepared: session.prepared || null,
    }));
    if (state == null) return null;
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      throw new TypeError('Session activity-state provider must return an object or null');
    }
    return deepFreeze(clone(state));
  }

  function validateRoster(value) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 16) {
      throw new TypeError('roster must contain 1–16 entries');
    }
    var ids = new Set();
    return value.map(function (entry, index) {
      var source = object(entry);
      var id = nonEmpty(source.id || source.playerId || ('seat-' + (index + 1)), 'roster id');
      if (ids.has(id)) throw new TypeError('Duplicate roster id: ' + id);
      ids.add(id);
      return deepFreeze(Object.assign({}, clone(source), { id: id, seat: index }));
    });
  }

  function validateActivityFormat(activityId, formatId, physicsModeId, activityContext) {
    var context = object(activityContext);
    if ((activityId === 'story' || activityId === 'rival-board') && formatId !== 'classic') {
      throw new TypeError(activityId + ' requires classic format');
    }
    if (activityId === 'story' || activityId === 'rival-board') {
      var nativeAlien = context.nativeAlien === true || context.rivalId === 'visitor-zero';
      if (physicsModeId !== (nativeAlien ? 'alien' : 'normal')) {
        throw new TypeError(activityId + ' requires its prescribed Story physics mode');
      }
    }
    if (activityId === 'tutorial' && (formatId !== 'classic' || physicsModeId !== 'normal')) {
      throw new TypeError('tutorial requires classic format and normal physics');
    }
    if (formatId === 'battle' && physicsModeId === 'alien') {
      throw new TypeError('battle does not support native alien physics');
    }
    if (formatId === 'battle' && activityId !== 'free-play') {
      throw new TypeError('battle is a free-play format');
    }
  }

  function MatchRequestV2(value) {
    var source = object(value);
    var activityId = oneOf(source.activityId || 'free-play', ACTIVITY_IDS, 'activityId');
    var formatId = oneOf(source.formatId || 'classic', FORMAT_IDS, 'formatId');
    var physicsModeId = oneOf(source.physicsModeId || 'normal', PHYSICS_MODE_IDS, 'physicsModeId');
    var activityContext = clone(object(source.activityContext));
    validateActivityFormat(activityId, formatId, physicsModeId, activityContext);
    var record = {
      schema: 'MatchRequestV2',
      matchId: nonEmpty(source.matchId, 'matchId'),
      activityId: activityId,
      formatId: formatId,
      physicsModeId: physicsModeId,
      roster: validateRoster(source.roster),
      rulesOptions: clone(object(source.rulesOptions)),
      activityContext: activityContext,
      seed: finiteInteger(source.seed, 1) >>> 0,
      createdAt: source.createdAt == null ? null : String(source.createdAt),
    };
    if (record.formatId === 'battle') {
      // Fail before a reward reservation is opened: Battle owns the stricter
      // match/roster/team/hardware identity bounds used by its terminal proof.
      battleAuthority().normalizeConfig(record);
    }
    return deepFreeze(record);
  }

  function MatchOutcomeV2(value) {
    var source = object(value);
    var status = String(source.status || (source.completed === false ? 'abandoned' : 'completed'));
    if (['completed', 'abandoned', 'cancelled'].indexOf(status) < 0) {
      throw new TypeError('Unsupported outcome status: ' + status);
    }
    if (hasOwn(source, 'completed') && source.completed !== (status === 'completed')) {
      throw new TypeError('Match outcome completed flag contradicts its status');
    }
    var canonical = canonicalRulesOutcome(source, status);
    var completed = status === 'completed';
    return deepFreeze({
      schema: 'MatchOutcomeV2',
      matchId: nonEmpty(source.matchId, 'matchId'),
      status: status,
      completed: completed,
      winnerIds: completed ? clone(canonical ? canonical.winnerIds
        : Array.from(new Set(Array.isArray(source.winnerIds) ? source.winnerIds.map(String) : []))) : [],
      participantResults: clone(canonical ? canonical.participantResults
        : (Array.isArray(source.participantResults) ? source.participantResults : [])),
      rulesState: clone(canonical ? canonical.rulesState : object(source.rulesState)),
      resolutionIdentity: clone(canonical ? canonical.resolutionIdentity
        : object(source.resolutionIdentity)),
      activityState: clone(object(source.activityState)),
      telemetry: clone(object(source.telemetry)),
      completionReason: completed
        ? (canonical ? canonical.completionReason
          : (source.completionReason == null ? 'completed' : String(source.completionReason)))
        : status,
      endedAt: source.endedAt == null ? null : String(source.endedAt),
    });
  }

  function PostMatchResolutionV1(value) {
    var source = object(value);
    return deepFreeze({
      schema: 'PostMatchResolutionV1',
      matchId: nonEmpty(source.matchId, 'matchId'),
      activityId: oneOf(source.activityId || 'free-play', ACTIVITY_IDS, 'activityId'),
      status: String(source.status || 'completed'),
      duplicate: source.duplicate === true,
      activityResolution: clone(object(source.activityResolution)),
      transaction: clone(object(source.transaction)),
      presentation: clone(object(source.presentation)),
      statsQueued: source.statsQueued !== false,
    });
  }

  function createActivityRegistry(initialDefinitions) {
    var definitions = new Map();

    function register(value) {
      var source = object(value);
      var id = oneOf(source.id, ACTIVITY_IDS, 'activity id');
      if (definitions.has(id)) throw new Error('Activity already registered: ' + id);
      var definition = {
        id: id,
        prepare: typeof source.prepare === 'function' ? source.prepare : function (request) {
          return { request: request };
        },
        resolve: typeof source.resolve === 'function' ? source.resolve : function () { return {}; },
        abandon: typeof source.abandon === 'function' ? source.abandon : function () { return {}; },
      };
      definitions.set(id, Object.freeze(definition));
      return definition;
    }

    function get(id) {
      var definition = definitions.get(String(id));
      if (!definition) throw new Error('Activity is not registered: ' + id);
      return definition;
    }

    (Array.isArray(initialDefinitions) ? initialDefinitions : []).forEach(register);
    return Object.freeze({
      register: register,
      get: get,
      has: function (id) { return definitions.has(String(id)); },
      ids: function () { return Object.freeze(Array.from(definitions.keys())); },
      prepare: function (id, payload) { return get(id).prepare(payload); },
      resolve: function (id, payload) { return get(id).resolve(payload); },
      abandon: function (id, payload) { return get(id).abandon(payload); },
    });
  }

  function createMatchSessionCoordinator(options) {
    var opts = object(options);
    var registry = opts.registry;
    if (!registry || typeof registry.prepare !== 'function') {
      throw new TypeError('Activity registry is required');
    }
    var transaction = typeof opts.transaction === 'function'
      ? opts.transaction : function (payload) { return payload; };
    var statsSink = typeof opts.statsSink === 'function' ? opts.statsSink : function () {};
    var rewardAuthority = opts.rewardAuthority || null;
    var sessions = new Map();
    var maxRetainedSessions = finiteInteger(opts.maxRetainedSessions, 128);
    if (!Number.isSafeInteger(maxRetainedSessions) || maxRetainedSessions < 2 ||
        maxRetainedSessions > 4096) {
      throw new RangeError('maxRetainedSessions must be a safe integer from 2 through 4096');
    }
    var terminalSequence = 0;

    function sessionSnapshot(session) {
      return deepFreeze({ matchId: session.request.matchId, status: session.status,
        request: session.request, prepared: session.prepared,
        resolution: session.resolution,
        hasActivityStateProvider: !!session.hooks.activityStateProvider });
    }

    function markTerminal(session) {
      if (!session.terminalSequence) session.terminalSequence = ++terminalSequence;
    }

    function pruneTerminalSessions(requiredSlots) {
      var slots = Math.max(0, finiteInteger(requiredSlots, 0));
      while (sessions.size + slots > maxRetainedSessions) {
        var oldest = null;
        sessions.forEach(function (candidate) {
          if (!candidate.terminalSequence) return;
          if (!oldest || candidate.terminalSequence < oldest.terminalSequence) oldest = candidate;
        });
        if (!oldest) break;
        sessions.delete(oldest.request.matchId);
      }
      if (sessions.size + slots > maxRetainedSessions) {
        throw new Error('Match session coordinator capacity reached; active sessions cannot be evicted');
      }
    }

    function authorityMethod(primary, fallback) {
      if (!rewardAuthority) return null;
      if (typeof rewardAuthority[primary] === 'function') return rewardAuthority[primary];
      return fallback && typeof rewardAuthority[fallback] === 'function'
        ? rewardAuthority[fallback] : null;
    }

    var reserveRewardMatch = authorityMethod('reserveMatch');
    var resumeRewardMatch = authorityMethod('resumeMatchReservation');
    var consumeRewardMatch = authorityMethod('claimMatch', 'consumeReservedMatch');
    var abandonRewardMatch = authorityMethod('abandonMatch', 'abandonReservedMatch');
    var claimStoryResolution = authorityMethod('claimStoryMatchResolution');
    var rewardSnapshot = authorityMethod('earnedSnapshot', 'snapshot');
    if (rewardAuthority && (!reserveRewardMatch || !resumeRewardMatch ||
        !consumeRewardMatch || !abandonRewardMatch || !rewardSnapshot)) {
      throw new TypeError('Reward authority must implement the MatchClaimTokenV1 lifecycle');
    }

    function exactToken(value) {
      var token = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
      if (!token || token.schema !== 'MatchClaimTokenV1' || token.version !== 1 ||
          typeof token.lineageId !== 'string' || !token.lineageId ||
          !Number.isSafeInteger(token.ordinal) || token.ordinal < 1 ||
          typeof token.nonce !== 'string' || !token.nonce ||
          typeof token.matchId !== 'string' || !token.matchId ||
          typeof token.activityId !== 'string' || !token.activityId ||
          !Number.isSafeInteger(token.reservedAt)) {
        throw new TypeError('Reward authority returned an invalid MatchClaimTokenV1');
      }
      return token;
    }

    function sameToken(left, right) {
      return !!left && !!right && left.schema === right.schema && left.version === right.version &&
        left.lineageId === right.lineageId && left.ordinal === right.ordinal &&
        left.nonce === right.nonce && left.matchId === right.matchId &&
        left.activityId === right.activityId && left.reservedAt === right.reservedAt;
    }

    function authorityState() {
      return rewardAuthority ? object(rewardSnapshot.call(rewardAuthority)) : {};
    }

    function tokenStatus(tokenInput, request) {
      var token = exactToken(tokenInput);
      if (request && (token.matchId !== request.matchId || token.activityId !== request.activityId)) {
        throw new RangeError('Match claim token does not match its request identity');
      }
      var current = authorityState();
      var resumed = resumeRewardMatch.call(rewardAuthority);
      if ((resumed == null) !== (current.activeMatchReservation == null) ||
          (resumed != null && !sameToken(exactToken(resumed), current.activeMatchReservation))) {
        throw new RangeError('Reward authority active-reservation views disagree');
      }
      if (typeof current.lineageId !== 'string' || current.lineageId !== token.lineageId) {
        throw new RangeError('Match claim token does not match the active profile lineage');
      }
      if (Number.isSafeInteger(current.consumedMatchOrdinal) &&
          current.consumedMatchOrdinal >= token.ordinal) return 'consumed';
      if (current.activeMatchReservation && sameToken(token, current.activeMatchReservation)) {
        return 'active';
      }
      throw new RangeError('Match claim token is not active in the reward authority');
    }

    function noRewardFlag(value) {
      var source = object(value);
      return source.testData === true || source.ownerTest === true ||
        source.ownerTestMode === true || source.imported === true ||
        source.importReplay === true || source.replay === true ||
        source.rewardsEligible === false || source.progressionEligible === false;
    }

    function reasonFromFlags(values) {
      var sources = values.map(object);
      if (sources.some(function (source) { return source.replay === true; })) return 'replay';
      if (sources.some(function (source) {
        return source.imported === true || source.importReplay === true;
      })) return 'imported';
      return sources.some(noRewardFlag) ? 'test-data' : null;
    }

    function classifyRewards(request, trustedState, policy, untrustedState) {
      if (!rewardAuthority) return Object.freeze({ managed: false, eligible: false,
        canonicalClaimsAllowed: false, reason: 'unmanaged', testData: false });
      var context = object(request.activityContext);
      var rules = object(request.rulesOptions);
      var policyValue = object(policy);
      if (policyValue.activityId != null && policyValue.activityId !== request.activityId) {
        throw new RangeError('Reward policy does not match the request activity');
      }
      if (policyValue.ownerTest === true || policyValue.ownerTestMode === true) {
        if (typeof rewardAuthority.validateOwnerTestGuard !== 'function' ||
            rewardAuthority.validateOwnerTestGuard(policyValue.ownerTestGuard,
              request.activityId) !== true) {
          throw new TypeError('Owner-test reward policy requires a valid authority guard');
        }
        return Object.freeze({ managed: true, eligible: false,
          canonicalClaimsAllowed: false, reason: 'owner-test-mode', testData: true });
      }
      if (['practice', 'physics-lab', 'tutorial'].indexOf(request.activityId) >= 0) {
        return Object.freeze({ managed: true, eligible: false,
          canonicalClaimsAllowed: false, reason: request.activityId, testData: true });
      }
      if (!request.roster.some(function (entry) {
        return entry.human === true || entry.kind === 'human';
      })) {
        return Object.freeze({ managed: true, eligible: false,
          canonicalClaimsAllowed: false, reason: 'ai-only', testData: false });
      }
      var trustedReason = reasonFromFlags([trustedState, policyValue]);
      if (trustedReason) {
        return Object.freeze({ managed: true, eligible: false,
          canonicalClaimsAllowed: false, reason: trustedReason, testData: true });
      }
      var untrustedReason = reasonFromFlags([context, rules, untrustedState]);
      if (untrustedReason) {
        // Caller-controlled flags may safely deny a reward, but they never
        // become the authoritative Test Data marker consumed by statistics.
        return Object.freeze({ managed: true, eligible: false,
          canonicalClaimsAllowed: false, reason: untrustedReason, testData: false });
      }
      if (request.activityId === 'rival-board') {
        return Object.freeze({ managed: true, eligible: false,
          canonicalClaimsAllowed: true, reason: 'rival-board-no-match-reward', testData: false });
      }
      var eligible = request.activityId === 'story' || request.activityId === 'free-play';
      return Object.freeze({ managed: true, eligible: eligible,
        canonicalClaimsAllowed: request.activityId === 'story' ||
          request.activityId === 'rival-board',
        reason: eligible ? null : 'activity-ineligible', testData: false });
    }

    function classifiedOutcome(input, classification) {
      var outcome = MatchOutcomeV2(input);
      if (!classification.managed || classification.eligible ||
          classification.canonicalClaimsAllowed) return outcome;
      var reason = classification.reason;
      var testData = classification.testData === true;
      var activityState = Object.assign({}, clone(outcome.activityState), {
        rewardsEligible: false,
        progressionEligible: false,
      });
      if (testData) {
        activityState.testData = true;
        activityState.statisticsDefaultEligible = false;
      }
      if (testData && reason === 'owner-test-mode') activityState.ownerTestMode = true;
      if (testData && reason === 'imported') activityState.imported = true;
      if (testData && reason === 'replay') activityState.replay = true;
      if (reason === 'ai-only') activityState.aiOnly = true;
      return MatchOutcomeV2(Object.assign({}, clone(outcome), { activityState: activityState }));
    }

    function monotonicRewardClassification(initialInput, finalInput) {
      var initial = object(initialInput);
      var final = object(finalInput);
      var eligible = initial.eligible === true && final.eligible === true;
      var canonical = initial.canonicalClaimsAllowed === true &&
        final.canonicalClaimsAllowed === true;
      var finalTightened = (initial.eligible === true && final.eligible !== true) ||
        (initial.canonicalClaimsAllowed === true && final.canonicalClaimsAllowed !== true);
      return Object.freeze({
        managed: initial.managed === true && final.managed === true,
        eligible: eligible,
        canonicalClaimsAllowed: canonical,
        reason: eligible ? null : (finalTightened ? final.reason : (initial.reason || final.reason)),
        testData: initial.testData === true || final.testData === true,
      });
    }

    function sanitizeSuppliedActivityState(value) {
      var clean = clone(object(value));
      ['testData', 'ownerTest', 'ownerTestMode', 'rewardsEligible',
        'progressionEligible', 'statisticsDefaultEligible', 'imported',
        'importReplay', 'replay', 'aiOnly'].forEach(function (key) { delete clean[key]; });
      return clean;
    }

    function currentRewardPolicy(request) {
      if (!rewardAuthority || typeof rewardAuthority.activityPolicy !== 'function') return null;
      return rewardAuthority.activityPolicy({ activityId: request.activityId });
    }

    function expectedRulesSchema(formatId) {
      if (formatId === 'classic') return 'ClassicRulesStateV1';
      if (formatId === 'cup') return 'CupRulesStateV1';
      if (formatId === 'team-clash') return 'TeamClashRulesStateV1';
      if (formatId === 'battle') return 'BattleStateV1';
      return null;
    }

    function assertOutcomeMatchesRequest(outcome, request, requireCanonicalRules) {
      if (outcome.matchId !== request.matchId) {
        throw new RangeError('Match outcome does not match the active request identity');
      }
      var requestIds = request.roster.map(function (entry) { return entry.id; });
      var requestIdSet = new Set(requestIds);
      if (outcome.winnerIds.some(function (id) { return !requestIdSet.has(id); })) {
        throw new TypeError('Outcome contains a winner outside the match roster');
      }
      var participantIds = [];
      outcome.participantResults.forEach(function (entry) {
        var source = object(entry);
        var id = source.playerId == null ? source.id : source.playerId;
        if (id == null || !String(id).trim()) {
          throw new TypeError('Outcome participant result requires a roster identity');
        }
        id = String(id);
        if (!requestIdSet.has(id)) {
          throw new TypeError('Outcome contains a participant outside the match roster');
        }
        if (participantIds.indexOf(id) >= 0) {
          throw new TypeError('Outcome contains a duplicate participant result');
        }
        participantIds.push(id);
      });

      var state = object(outcome.rulesState);
      var hasRulesState = Object.keys(state).length > 0;
      if (requireCanonicalRules && !hasRulesState) {
        throw new TypeError('Reward-bearing completion requires a terminal Rules-issued outcome');
      }
      if (!hasRulesState) return true;

      var expectedSchema = expectedRulesSchema(request.formatId);
      if (!expectedSchema || state.schema !== expectedSchema) {
        throw new TypeError('Outcome Rules state does not match the requested format');
      }
      if (state.matchId !== request.matchId || state.formatId !== request.formatId) {
        throw new RangeError('Outcome Rules state does not match the active match identity');
      }
      var config = object(state.config);
      if (request.formatId === 'battle') {
        var canonicalBattleConfig = battleAuthority().normalizeConfig(request);
        if (!sameCanonicalValue(config, canonicalBattleConfig) ||
            state.matchId !== request.matchId || state.formatId !== 'battle') {
          throw new RangeError('Outcome Battle configuration contradicts its MatchRequestV2');
        }
      } else if (config.matchId !== request.matchId || config.formatId !== request.formatId ||
          (config.physicsModeId != null && config.physicsModeId !== request.physicsModeId) ||
          (config.seed != null && (Number(config.seed) >>> 0) !== request.seed)) {
        throw new RangeError('Outcome Rules configuration contradicts its MatchRequestV2');
      }
      var rulesPlayers = Array.isArray(config.players) ? config.players : [];
      var rulesIds = rulesPlayers.map(function (entry) { return String(object(entry).id || ''); });
      if (!sameCanonicalValue(rulesIds, requestIds)) {
        throw new RangeError('Outcome Rules roster does not match the MatchRequestV2 roster');
      }
      if (requireCanonicalRules && !sameCanonicalValue(participantIds, requestIds)) {
        throw new RangeError('Rules-owned participant results do not cover the requested roster');
      }
      return true;
    }

    function mutationSucceeded(result, operation) {
      if (result && (result.applied === true || result.reason === 'duplicate')) return result;
      var reason = result && result.reason ? ': ' + result.reason : '';
      throw new Error(operation + ' failed' + reason);
    }

    function abandonToken(session, reason) {
      if (!session.matchClaimToken) return null;
      var status = tokenStatus(session.matchClaimToken, session.request);
      if (status === 'consumed') return Object.freeze({ applied: false, reason: 'duplicate' });
      var result = abandonRewardMatch.call(rewardAuthority, session.matchClaimToken,
        reason || 'abandoned');
      mutationSucceeded(result, 'Match reward abandonment');
      if (tokenStatus(session.matchClaimToken, session.request) !== 'consumed') {
        throw new Error('Match reward abandonment was not durably consumed');
      }
      return result;
    }

    function activeAuthorityReservation() {
      if (!rewardAuthority) return null;
      var token = resumeRewardMatch.call(rewardAuthority);
      if (token == null) return null;
      token = exactToken(token);
      if (tokenStatus(token, null) !== 'active') {
        throw new RangeError('Persisted match reservation is not active');
      }
      return token;
    }

    function reconcilePersistedReservation(request, classification) {
      var active = activeAuthorityReservation();
      if (!active) return;
      var locallyOwned = Array.from(sessions.values()).some(function (session) {
        return session.matchClaimToken && sameToken(session.matchClaimToken, active) &&
          (session.status === 'active' || session.status === 'finalizing');
      });
      if (locallyOwned) throw new Error('Another reward-bearing match is already active');
      if (classification.eligible && active.matchId === request.matchId &&
          active.activityId === request.activityId) return;
      var abandoned = abandonRewardMatch.call(rewardAuthority, active,
        'orphaned-before-match-start');
      mutationSucceeded(abandoned, 'Persisted match reservation recovery');
      if (tokenStatus(active, null) !== 'consumed') {
        throw new Error('Persisted match reservation recovery was not durable');
      }
    }

    function assertNoUnresolvedFinalization(request) {
      var unresolved = Array.from(sessions.values()).find(function (session) {
        return session.request.matchId !== request.matchId && !!session.matchClaimToken &&
          !!session.outcome && !session.resolution &&
          (session.status === 'active' || session.status === 'finalizing');
      });
      if (unresolved) {
        throw new Error('Unresolved reward finalization must retry before another match starts');
      }
    }

    function privateRewardContext(session, classification) {
      function requireBoundToken(operation) {
        if (!session.matchClaimToken) {
          throw new Error(operation + ' requires a reservation made before match start');
        }
        if (!classification.eligible) {
          throw new Error(operation + ' is forbidden for ' + classification.reason);
        }
        // A transaction may have durably consumed the token and then failed in
        // a later owning store.  Replaying the same private token lets the
        // reward authority return its exact duplicate result so finalization
        // can finish without issuing another reservation or reward.
        tokenStatus(session.matchClaimToken, session.request);
        return session.matchClaimToken;
      }
      return Object.freeze({
        schema: 'PrivateMatchRewardContextV1',
        managed: classification.managed,
        reserved: !!session.matchClaimToken,
        rewardsEligible: classification.eligible,
        canonicalClaimsAllowed: classification.canonicalClaimsAllowed,
        noRewardsReason: classification.reason,
        consumeMatch: function (rewardInput) {
          if (session.request.activityId !== 'free-play') {
            throw new RangeError('Only a free-play transaction may consume a generic match reward');
          }
          var token = requireBoundToken('Match reward consumption');
          return mutationSucceeded(consumeRewardMatch.call(rewardAuthority, token, rewardInput),
            'Match reward consumption');
        },
        claimStoryMatchResolution: function (input) {
          if (session.request.activityId !== 'story' &&
              session.request.activityId !== 'rival-board') {
            throw new RangeError('Only Story activities may claim a Story resolution');
          }
          if (!classification.canonicalClaimsAllowed || !claimStoryResolution) {
            throw new Error('Story rewards are forbidden for ' + classification.reason);
          }
          var source = object(input);
          if (source.matchId !== session.request.matchId) {
            throw new RangeError('Story reward command does not match the active request');
          }
          var ordinary = source.ordinaryRewardsEligible === true;
          var payload = Object.assign({}, clone(source));
          if (ordinary) payload.matchClaimToken = requireBoundToken('Story match reward consumption');
          else if (session.matchClaimToken) {
            throw new Error('A reserved Story match cannot omit its ordinary reward disposition');
          }
          return mutationSucceeded(claimStoryResolution.call(rewardAuthority, payload),
            'Story reward claim');
        },
        abandon: function (reason) { return abandonToken(session, reason); },
      });
    }

    function start(input, sessionHooks) {
      var request = MatchRequestV2(input);
      if (sessions.has(request.matchId)) throw new Error('Match already started: ' + request.matchId);
      pruneTerminalSessions(1);
      var hooks = MatchSessionHooksV1(sessionHooks);
      if (object(request.activityContext).dynamicActivityState === true &&
          !hooks.activityStateProvider) {
        throw new TypeError('Dynamic activity-state requests require an activity-state provider');
      }
      var session = {
        request: request, hooks: hooks, prepared: null,
        status: 'active',
        finalPromise: null,
        resolution: null,
        outcome: null,
        activityResolution: null,
        matchClaimToken: null,
        rewardPolicy: null,
        rewardClassification: null,
        finalRewardClassification: null,
        terminalSequence: 0,
      };
      var initialActivityState = readSessionActivityState(session, 'prepare');
      session.rewardPolicy = currentRewardPolicy(request);
      session.rewardClassification = classifyRewards(request, initialActivityState,
        session.rewardPolicy, null);
      assertNoUnresolvedFinalization(request);
      reconcilePersistedReservation(request, session.rewardClassification);
      var prepared;
      try {
        if (session.rewardClassification.eligible) {
          var reservation = reserveRewardMatch.call(rewardAuthority, request.matchId,
            request.activityId);
          if (!reservation || (!reservation.applied && !reservation.resumed)) {
            throw new Error('Match reward reservation failed' +
              (reservation && reservation.reason ? ': ' + reservation.reason : ''));
          }
          var durableReservation = resumeRewardMatch.call(rewardAuthority);
          session.matchClaimToken = exactToken(durableReservation);
          if (reservation.token &&
              !sameToken(exactToken(reservation.token), session.matchClaimToken)) {
            throw new RangeError('Reward reservation result contradicts durable authority state');
          }
          if (tokenStatus(session.matchClaimToken, request) !== 'active') {
            throw new Error('Match reward reservation was not durably active');
          }
        }
        prepared = registry.prepare(request.activityId, {
          request: request, activityState: initialActivityState,
        });
        session.prepared = deepFreeze(clone(prepared || {}));
      } catch (error) {
        if (session.matchClaimToken) {
          try { abandonToken(session, 'start-failed'); }
          catch (cleanupError) {
            var wrapped = new Error('Match start failed and reward reservation cleanup failed');
            wrapped.cause = error;
            wrapped.cleanupError = cleanupError;
            throw wrapped;
          }
        }
        throw error;
      }
      sessions.set(request.matchId, session);
      return deepFreeze({
        schema: 'MatchSessionV1',
        matchId: request.matchId,
        request: request,
        prepared: session.prepared,
        status: session.status, hasActivityStateProvider: !!hooks.activityStateProvider,
      });
    }

    function finalize(input) {
      var suppliedOutcome;
      try { suppliedOutcome = MatchOutcomeV2(input); }
      catch (error) { return Promise.reject(error); }
      var session = sessions.get(suppliedOutcome.matchId);
      if (!session) return Promise.reject(new Error('Unknown match: ' + suppliedOutcome.matchId));
      // The first finalize call freezes the provider snapshot. Concurrent calls
      // compare against that snapshot rather than re-reading mutable activity state.
      if (session.status === 'finalizing' && session.finalPromise) {
        var repeatedOutcome = MatchOutcomeV2(Object.assign({}, clone(suppliedOutcome), {
          activityState: clone(session.outcome.activityState),
        }));
        if (JSON.stringify(session.outcome) !== JSON.stringify(repeatedOutcome)) {
          return Promise.reject(new Error('Conflicting final outcome for match: ' + suppliedOutcome.matchId));
        }
        return session.finalPromise;
      }
      if (session.status === 'finalized' && session.resolution && session.outcome) {
        var finalizedOutcome = MatchOutcomeV2(Object.assign({}, clone(suppliedOutcome), {
          activityState: clone(session.outcome.activityState),
        }));
        if (JSON.stringify(session.outcome) !== JSON.stringify(finalizedOutcome)) {
          return Promise.reject(new Error('Conflicting final outcome for match: ' +
            suppliedOutcome.matchId));
        }
        return Promise.resolve(session.resolution);
      }
      if (session.status !== 'active') {
        return Promise.reject(new Error('Match is not active: ' + suppliedOutcome.matchId));
      }
      var dynamicActivityState;
      try {
        dynamicActivityState = readSessionActivityState(session, 'finalize');
      } catch (error) {
        return Promise.reject(error);
      }
      var suppliedActivityState = object(suppliedOutcome.activityState);
      var publicActivityState = sanitizeSuppliedActivityState(suppliedActivityState);
      if (dynamicActivityState) {
        publicActivityState = Object.assign(publicActivityState, clone(dynamicActivityState));
      }
      var outcome = MatchOutcomeV2(Object.assign({}, clone(suppliedOutcome), {
        activityState: publicActivityState,
      }));
      var trustedRewardState = Object.assign({}, clone(object(session.prepared)),
        clone(object(dynamicActivityState)));
      var untrustedRewardState = Object.assign({}, clone(object(suppliedOutcome.telemetry)),
        clone(suppliedActivityState));
      var finalRewardClassification = monotonicRewardClassification(
        session.rewardClassification,
        classifyRewards(session.request, trustedRewardState,
          session.rewardPolicy, untrustedRewardState));
      var requiresRulesProof = outcome.status === 'completed' &&
        finalRewardClassification.managed === true &&
        (finalRewardClassification.eligible === true ||
          finalRewardClassification.canonicalClaimsAllowed === true);
      try {
        assertOutcomeMatchesRequest(outcome, session.request, requiresRulesProof);
      } catch (error) {
        return Promise.reject(error);
      }
      outcome = classifiedOutcome(outcome, finalRewardClassification);
      if (session.outcome && JSON.stringify(session.outcome) !== JSON.stringify(outcome)) {
        return Promise.reject(new Error('Conflicting final outcome for match: ' + outcome.matchId));
      }
      if (session.finalPromise) return session.finalPromise;
      session.outcome = outcome;
      session.finalRewardClassification = finalRewardClassification;
      session.status = 'finalizing';
      session.finalPromise = Promise.resolve().then(function () {
        if (!session.activityResolution) {
          session.activityResolution = deepFreeze(clone(registry.resolve(session.request.activityId, {
            request: session.request,
            prepared: session.prepared,
            outcome: outcome,
          }) || {}));
        }
        var activityResolution = session.activityResolution;
        var finalClassification = session.finalRewardClassification;
        if (session.matchClaimToken &&
            (outcome.status !== 'completed' || !finalClassification.eligible)) {
          abandonToken(session, outcome.status !== 'completed'
            ? (outcome.completionReason || outcome.status) : finalClassification.reason);
        }
        var rewards = privateRewardContext(session, finalClassification);
        return Promise.resolve(transaction({
          schema: 'MatchFinalizationCommandV1',
          idempotencyKey: 'match:' + outcome.matchId,
          matchId: outcome.matchId,
          request: session.request,
          outcome: outcome,
          activityResolution: deepFreeze(clone(activityResolution)),
        }, rewards)).then(function (transactionResult) {
          if (session.matchClaimToken &&
              tokenStatus(session.matchClaimToken, session.request) === 'active') {
            throw new Error('Eligible match transaction did not consume its reserved reward token');
          }
          session.status = 'finalized';
          markTerminal(session);
          var duplicate = !!(transactionResult && transactionResult.duplicate);
          session.resolution = PostMatchResolutionV1({
            matchId: outcome.matchId,
            activityId: session.request.activityId,
            status: outcome.status,
            duplicate: duplicate,
            activityResolution: activityResolution,
            transaction: transactionResult,
            presentation: transactionResult && transactionResult.presentation,
            statsQueued: true,
          });
          Promise.resolve().then(function () {
            return statsSink({ request: session.request, outcome: outcome,
              resolution: session.resolution });
          }).catch(function () {});
          return session.resolution;
        });
      });
      session.finalPromise = session.finalPromise.catch(function (error) {
        session.finalPromise = null;
        session.status = 'active';
        throw error;
      });
      return session.finalPromise;
    }

    function abandon(matchId, reason) {
      var id = nonEmpty(matchId, 'matchId');
      var session = sessions.get(id);
      if (!session) throw new Error('Unknown match: ' + id);
      if (session.status !== 'active') return deepFreeze({ matchId: id, status: session.status });
      if (session.matchClaimToken) abandonToken(session,
        reason == null ? 'abandoned' : String(reason));
      var activityState = readSessionActivityState(session, 'abandon');
      var activityResolution = registry.abandon(session.request.activityId, {
        request: session.request,
        prepared: session.prepared,
        activityState: activityState,
        reason: reason == null ? 'abandoned' : String(reason),
      }) || {};
      session.status = 'abandoned';
      markTerminal(session);
      return deepFreeze({ matchId: id, status: 'abandoned',
        activityResolution: clone(activityResolution) });
    }

    function snapshot(matchId) {
      var session = sessions.get(String(matchId));
      if (!session) return null;
      return sessionSnapshot(session);
    }

    function snapshots() {
      return Object.freeze(Array.from(sessions.values()).map(sessionSnapshot));
    }

    return Object.freeze({ start: start, finalize: finalize, abandon: abandon,
      snapshot: snapshot, snapshots: snapshots });
  }

  function createLaneRuntime(input) {
    var source = object(input);
    var laneId = nonEmpty(source.laneId, 'laneId');
    var state = oneOf(source.state || 'ready', LANE_STATES, 'lane state');
    var pointerId = null;
    var attemptId = null;
    var result = null;
    var charge = Math.max(0, Math.min(3, finiteInteger(source.charge, 0)));
    var powerOffer = null;
    var storedPower = null;

    function snapshot() {
      return deepFreeze({ schema: 'LaneRuntimeV1', laneId: laneId,
        ownerId: source.ownerId == null ? null : String(source.ownerId),
        teamId: source.teamId == null ? null : String(source.teamId),
        state: state, pointerId: pointerId, attemptId: attemptId,
        result: clone(result), charge: charge, powerOffer: clone(powerOffer),
        storedPower: clone(storedPower) });
    }
    function transition(next) {
      var desired = oneOf(next, LANE_STATES, 'lane state');
      if (LANE_TRANSITIONS[state].indexOf(desired) < 0) {
        throw new Error('Invalid lane transition: ' + state + ' -> ' + desired);
      }
      state = desired;
      if (state === 'ready') { attemptId = null; result = null; pointerId = null; }
      return snapshot();
    }
    function claimPointer(value) {
      if (state !== 'ready' && state !== 'aiming') throw new Error('Lane cannot claim pointer while ' + state);
      var id = finiteInteger(value, NaN);
      if (!Number.isFinite(id)) throw new TypeError('pointerId is required');
      if (pointerId != null && pointerId !== id) return false;
      pointerId = id;
      if (state === 'ready') state = 'aiming';
      return true;
    }
    function releasePointer(value) {
      if (pointerId == null || pointerId !== finiteInteger(value, NaN)) return false;
      pointerId = null;
      return true;
    }
    function armAttempt(value) {
      if (state !== 'aiming') throw new Error('Lane must be aiming before launch');
      attemptId = nonEmpty(value, 'attemptId');
      pointerId = null;
      state = 'airborne';
      return snapshot();
    }
    function resolveAttempt(value) {
      if (['airborne', 'contact', 'settling'].indexOf(state) < 0) {
        throw new Error('Lane has no active attempt');
      }
      result = clone(object(value));
      state = 'resolved';
      return snapshot();
    }
    function addCharge(amount) {
      charge = Math.max(0, Math.min(3, charge + Math.max(0, finiteInteger(amount, 1))));
      return charge;
    }
    function offerPower(cards) {
      if (charge < 3) throw new Error('Lane requires three charges');
      if (!Array.isArray(cards) || cards.length !== 2) throw new TypeError('Power offer requires two cards');
      powerOffer = cards.map(function (card) { return clone(object(card)); });
      charge = 0;
      return snapshot();
    }
    function storePower(index) {
      if (!powerOffer) throw new Error('No power offer');
      var selected = finiteInteger(index, -1);
      if (selected < 0 || selected >= powerOffer.length) throw new RangeError('Invalid power choice');
      storedPower = clone(powerOffer[selected]);
      powerOffer = null;
      return snapshot();
    }
    function consumePower() {
      var value = clone(storedPower);
      storedPower = null;
      return value;
    }
    return Object.freeze({ snapshot: snapshot, transition: transition,
      claimPointer: claimPointer, releasePointer: releasePointer,
      armAttempt: armAttempt, resolveAttempt: resolveAttempt,
      addCharge: addCharge, offerPower: offerPower, storePower: storePower,
      consumePower: consumePower });
  }

  return deepFreeze({
    schema: 'FlipgameV112ActivityV1',
    ACTIVITY_IDS: ACTIVITY_IDS,
    FORMAT_IDS: FORMAT_IDS,
    PHYSICS_MODE_IDS: PHYSICS_MODE_IDS,
    LANE_STATES: LANE_STATES,
    MatchRequestV2: MatchRequestV2,
    MatchOutcomeV2: MatchOutcomeV2,
    PostMatchResolutionV1: PostMatchResolutionV1,
    createSessionActivityStateProvider: createSessionActivityStateProvider,
    MatchSessionHooksV1: MatchSessionHooksV1,
    createActivityRegistry: createActivityRegistry,
    createMatchSessionCoordinator: createMatchSessionCoordinator,
    createLaneRuntime: createLaneRuntime,
  });
});
