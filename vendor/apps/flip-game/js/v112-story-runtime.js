// v112-story-runtime.js -- headless Story/Rival orchestration and progression bridge.
// Rendering, rules simulation, input, and statistics remain external consumers.
(function (root, factory) {
  'use strict';
  var commonJs = typeof module === 'object' && module.exports;
  var Activity = root && root.FlipgameV112Activity;
  var Story = root && root.FlipgameV112Story;
  var Profile = root && root.FlipgameV112Profile;
  var View = root && root.FlipgameV112StoryView;
  if (commonJs) {
    Activity = require('./v112-activity.js');
    Story = require('./v112-story.js');
    Profile = require('./v112-profile.js');
    View = require('./v112-story-view.js');
  }
  var api = factory(Activity, Story, Profile, View, root, commonJs);
  if (commonJs) module.exports = api;
  if (root && !commonJs) root.FlipgameV112StoryRuntime = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)),
function (Activity, Story, Profile, View, root, commonJs) {
  'use strict';

  if (!Activity || !Story || !Profile || !View) {
    throw new Error('v1.12 Activity, Story, Profile, and Story view modules must load before Story runtime');
  }

  var STORY_STORAGE_KEY = 'flipgame.story.v1';
  var STORY_JOURNAL_SUFFIX = '.journal';
  var STORY_FINALIZATION_SUFFIX = '.finalization';

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }
  function object(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }
  function nonEmpty(value, label) {
    var text = String(value == null ? '' : value).trim();
    if (!text || /[\u0000-\u001f\u007f]/.test(text)) {
      throw new TypeError((label || 'value') + ' is required');
    }
    return text;
  }
  function unique(values) {
    return Array.from(new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean)));
  }
  function sameStringSet(actual, expected) {
    if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) {
      return false;
    }
    if (actual.some(function (id) { return typeof id !== 'string' || !id; }) ||
        expected.some(function (id) { return typeof id !== 'string' || !id; })) return false;
    var actualSet = new Set(actual);
    var expectedSet = new Set(expected);
    if (actualSet.size !== actual.length || expectedSet.size !== expected.length ||
        actualSet.size !== expectedSet.size) return false;
    return Array.from(expectedSet).every(function (id) { return actualSet.has(id); });
  }
  function chapterFor(value) {
    var source = object(value);
    return Story.chapters.find(function (chapter) {
      return chapter.id === String(source.chapterId || '') ||
        chapter.rivalId === String(source.rivalId || '');
    }) || null;
  }
  function storageRaw(storage, key) {
    if (!storage || typeof storage.getItem !== 'function') return null;
    var value;
    try { value = storage.getItem(key); }
    catch (error) {
      var wrapped = new Error('Story state persistence read failed');
      wrapped.cause = error;
      throw wrapped;
    }
    if (value == null || value === '') return null;
    if (typeof value !== 'string') throw new TypeError('Story storage values must be strings');
    return value;
  }

  function parseJsonRecord(raw, label) {
    var parsed;
    try { parsed = JSON.parse(raw); }
    catch (error) {
      var wrapped = new Error((label || 'Story record') + ' is malformed');
      wrapped.cause = error;
      throw wrapped;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
        (Object.getPrototypeOf(parsed) !== Object.prototype && Object.getPrototypeOf(parsed) !== null)) {
      throw new TypeError((label || 'Story record') + ' must be a plain object');
    }
    return parsed;
  }

  var STORY_STATE_KEYS = Object.keys(Story.defaultState());
  var STORY_RECORD_KEYS = STORY_STATE_KEYS.concat(['runtimeRevision']);
  function exactKeys(value, keys, label) {
    var actual = Object.keys(value).sort();
    var expected = keys.slice().sort();
    if (actual.length !== expected.length || actual.some(function (key, index) {
      return key !== expected[index];
    })) throw new TypeError((label || 'record') + ' has an invalid schema');
  }

  function storyRecord(state, revision) {
    var record = {};
    STORY_STATE_KEYS.forEach(function (field) { record[field] = clone(state[field]); });
    record.runtimeRevision = revision;
    return record;
  }

  function containsEveryId(nextValues, previousValues) {
    var nextSet = new Set(nextValues);
    return previousValues.every(function (id) { return nextSet.has(id); });
  }

  function validateReceiptWindowTransition(previousValues, nextValues, revisionDelta) {
    if (JSON.stringify(previousValues) === JSON.stringify(nextValues)) return 0;
    if (!nextValues.length && previousValues.length) {
      throw new Error('Story attempt receipt window regressed');
    }
    var firstPreviousIndex = nextValues.length ? previousValues.indexOf(nextValues[0]) : -1;
    var newCount;
    if (firstPreviousIndex >= 0) {
      var retained = previousValues.slice(firstPreviousIndex);
      if (nextValues.length < retained.length || retained.some(function (id, index) {
        return nextValues[index] !== id;
      })) throw new Error('Story attempt receipt window was incompatibly rewritten');
      var appended = nextValues.slice(retained.length);
      if (appended.some(function (id) { return previousValues.indexOf(id) >= 0; })) {
        throw new Error('Story attempt receipt window reordered an existing receipt');
      }
      newCount = appended.length;
      var expectedEvictions = Math.max(0,
        previousValues.length + newCount - Story.stateLimits.resolvedAttemptIds);
      if (firstPreviousIndex !== expectedEvictions) {
        throw new Error('Story attempt receipt window discarded receipts before capacity');
      }
    } else {
      if (nextValues.some(function (id) { return previousValues.indexOf(id) >= 0; })) {
        throw new Error('Story attempt receipt window was incompatibly reordered');
      }
      newCount = nextValues.length;
      if (previousValues.length &&
          (nextValues.length !== Story.stateLimits.resolvedAttemptIds ||
            revisionDelta < Story.stateLimits.resolvedAttemptIds)) {
        throw new Error('Story attempt receipt window was incompatibly replaced');
      }
    }
    if (newCount > revisionDelta) {
      throw new Error('Story attempt receipts advanced beyond the persisted revision');
    }
    return newCount;
  }

  function validateMonotonicStoryTransition(previousInput, nextInput, revisionDelta) {
    var previous = Story.validateState(previousInput);
    var next = Story.validateState(nextInput);
    if (!Number.isSafeInteger(revisionDelta) || revisionDelta < 1) {
      throw new TypeError('Story persistence revision must advance monotonically');
    }
    ['clearedPreliminaryIds', 'defeatedRivalIds', 'discoveredRivalIds',
      'clearedChapterIds', 'completedActIds'].forEach(function (field) {
      if (!containsEveryId(next[field], previous[field])) {
        throw new Error('Story persistence would relock completed ' + field);
      }
    });
    var newReceipts = validateReceiptWindowTransition(previous.resolvedAttemptIds,
      next.resolvedAttemptIds, revisionDelta);
    if (newReceipts === 0 && next.lastCheckpoint !== previous.lastCheckpoint) {
      throw new Error('Story checkpoint changed without a new attempt receipt');
    }
    if (newReceipts > 0 && next.lastCheckpoint == null) {
      throw new Error('Story attempt receipt advanced without a checkpoint');
    }
    return next;
  }

  function parseStoryRecord(raw, label) {
    if (raw == null) return null;
    // StoryStateV1 is intentionally small except for its bounded receipt window.
    // Reject impossible payload sizes before JSON can allocate attacker-directed trees.
    if (raw.length > 300000) throw new RangeError((label || 'Story record') + ' is too large');
    var record = parseJsonRecord(raw, label || 'Story record');
    exactKeys(record, STORY_RECORD_KEYS, label || 'Story record');
    if (!Number.isSafeInteger(record.runtimeRevision) || record.runtimeRevision < 1) {
      throw new TypeError((label || 'Story record') + ' runtimeRevision is invalid');
    }
    var stateInput = {};
    STORY_STATE_KEYS.forEach(function (field) { stateInput[field] = record[field]; });
    return { raw: raw, revision: record.runtimeRevision, state: Story.validateState(stateInput) };
  }

  function parseJournal(raw, key) {
    if (raw == null) return null;
    if (raw.length > 620000) throw new RangeError('Story write journal is too large');
    var journal = parseJsonRecord(raw, 'Story write journal');
    exactKeys(journal, ['schema', 'version', 'storageKey', 'previousRaw', 'candidateRaw'],
      'Story write journal');
    if (journal.schema !== 'StoryWriteJournalV1' || journal.version !== 1 ||
        journal.storageKey !== key ||
        (journal.previousRaw !== null && typeof journal.previousRaw !== 'string') ||
        typeof journal.candidateRaw !== 'string') {
      throw new TypeError('Story write journal is invalid');
    }
    var previous = parseStoryRecord(journal.previousRaw, 'Story journal previous record');
    var candidate = parseStoryRecord(journal.candidateRaw, 'Story journal candidate record');
    var expectedRevision = previous ? previous.revision + 1 : 1;
    if (!candidate || candidate.revision !== expectedRevision) {
      throw new RangeError('Story write journal revisions are inconsistent');
    }
    if (previous) {
      validateMonotonicStoryTransition(previous.state, candidate.state, 1);
    }
    return { raw: raw, previousRaw: journal.previousRaw,
      candidateRaw: journal.candidateRaw, previous: previous, candidate: candidate };
  }

  function parseFinalizationIntent(raw) {
    if (raw == null) return null;
    if (raw.length > 620000) throw new RangeError('Story finalization intent is too large');
    var intent = parseJsonRecord(raw, 'Story finalization intent');
    exactKeys(intent, ['schema', 'version', 'profileLineageId', 'receiptOrdinal',
      'matchId', 'activityId', 'attempt', 'success', 'baseState',
      'candidateState', 'rewardClaimIds'], 'Story finalization intent');
    if (intent.schema !== 'StoryFinalizationIntentV1' || intent.version !== 1 ||
        (intent.activityId !== 'story' && intent.activityId !== 'rival-board')) {
      throw new TypeError('Story finalization intent identity is invalid');
    }
    ['profileLineageId', 'matchId'].forEach(function (field) {
      if (typeof intent[field] !== 'string' || !intent[field] || intent[field] !== intent[field].trim() ||
          intent[field].length > 128 || /[\u0000-\u001f\u007f]/.test(intent[field])) {
        throw new TypeError('Story finalization intent ' + field + ' is invalid');
      }
    });
    if ((intent.activityId === 'story' &&
          (!Number.isSafeInteger(intent.receiptOrdinal) || intent.receiptOrdinal < 1)) ||
        (intent.activityId === 'rival-board' && intent.receiptOrdinal !== null)) {
      throw new TypeError('Story finalization intent receipt binding is invalid');
    }
    if (typeof intent.success !== 'boolean') {
      throw new TypeError('Story finalization intent success must be an exact boolean');
    }
    if (!Array.isArray(intent.rewardClaimIds) || intent.rewardClaimIds.length > 2) {
      throw new TypeError('Story finalization intent reward claims exceed their bound');
    }
    var allowedClaims = new Set(Story.rewardIds);
    var seen = new Set();
    for (var index = 0; index < intent.rewardClaimIds.length; index++) {
      var claimId = intent.rewardClaimIds[index];
      if (typeof claimId !== 'string' || !allowedClaims.has(claimId) || seen.has(claimId)) {
        throw new TypeError('Story finalization intent contains an invalid reward claim');
      }
      seen.add(claimId);
    }
    var baseState = Story.validateState(intent.baseState);
    var attempt = Story.validateAttempt(baseState, intent.attempt);
    if (attempt.source !== intent.activityId) {
      throw new RangeError('Story finalization intent activity does not match its attempt');
    }
    if (baseState.resolvedAttemptIds.indexOf(attempt.attemptId) >= 0) {
      throw new RangeError('Story finalization intent base already contains its attempt receipt');
    }
    var expected = Story.resolveAttempt(baseState, attempt, {
      status: 'completed',
      winnerIds: intent.success ? [attempt.alliedHumanIds[0]] : [],
    });
    var expectedClaimIds = expected.rewards.map(function (reward) { return reward.claimId; });
    if (JSON.stringify(intent.rewardClaimIds) !== JSON.stringify(expectedClaimIds)) {
      throw new RangeError('Story finalization intent rewards do not match its one-attempt transition');
    }
    var candidateState = Story.validateState(intent.candidateState);
    if (JSON.stringify(candidateState) !== JSON.stringify(expected.state)) {
      throw new RangeError('Story finalization intent candidate is not its bounded one-attempt transition');
    }
    return freeze({ raw: raw, schema: intent.schema, version: intent.version,
      profileLineageId: intent.profileLineageId, receiptOrdinal: intent.receiptOrdinal,
      matchId: intent.matchId, activityId: intent.activityId,
      attempt: attempt, success: intent.success, baseState: baseState,
      candidateState: candidateState, rewardClaimIds: intent.rewardClaimIds.slice() });
  }

  function clearStorageKey(storage, key) {
    var error = null;
    try {
      if (typeof storage.removeItem === 'function') storage.removeItem(key);
      else storage.setItem(key, '');
    } catch (caught) { error = caught; }
    var remaining = storageRaw(storage, key);
    return { cleared: remaining == null, remaining: remaining, error: error };
  }

  function recoverStoryJournal(storage, key) {
    if (!storage) return { mainRaw: null, cleanupPending: false };
    var journalKey = key + STORY_JOURNAL_SUFFIX;
    var journal = parseJournal(storageRaw(storage, journalKey), key);
    var mainRaw = storageRaw(storage, key);
    if (!journal) return { mainRaw: mainRaw, cleanupPending: false };
    if (mainRaw !== journal.previousRaw && mainRaw !== journal.candidateRaw) {
      throw new Error('Story state persistence is uncertain; journal and durable state diverged');
    }
    var cleared = clearStorageKey(storage, journalKey);
    if (!cleared.cleared && cleared.remaining !== journal.raw) {
      throw new Error('Story state persistence is uncertain; write journal changed unexpectedly');
    }
    return { mainRaw: mainRaw, cleanupPending: !cleared.cleared };
  }

  function createStoryStateStore(options) {
    var opts = object(options);
    var storage = opts.storage || null;
    var key = String(opts.key || STORY_STORAGE_KEY);
    if (storage && (typeof storage.getItem !== 'function' ||
        typeof storage.setItem !== 'function')) {
      throw new TypeError('Story storage must implement getItem and setItem');
    }
    var recovered = recoverStoryJournal(storage, key);
    var persisted = parseStoryRecord(recovered.mainRaw, 'Persisted Story state');
    var state = persisted ? persisted.state
      : Story.normalizeState(opts.initialState == null ? Story.defaultState() : opts.initialState);
    var revision = persisted ? persisted.revision : 0;
    var durableRaw = persisted ? persisted.raw : null;
    var cleanupPending = recovered.cleanupPending;
    var fatalError = null;

    function failClosed(message, cause) {
      var error = new Error(message);
      if (cause) error.cause = cause;
      fatalError = error;
      throw error;
    }
    function healthy() { if (fatalError) throw fatalError; }
    function clearPendingJournal() {
      healthy();
      if (!cleanupPending || !storage) return;
      var journalKey = key + STORY_JOURNAL_SUFFIX;
      var journal = parseJournal(storageRaw(storage, journalKey), key);
      if (!journal) { cleanupPending = false; return; }
      var mainRaw = storageRaw(storage, key);
      if (mainRaw !== journal.previousRaw && mainRaw !== journal.candidateRaw) {
        failClosed('Story state persistence is uncertain; pending journal diverged');
      }
      var cleared = clearStorageKey(storage, journalKey);
      cleanupPending = !cleared.cleared;
      if (cleanupPending) throw new Error('Story state persistence recovery is pending');
    }

    function persist(next, nextRevision) {
      healthy();
      if (!storage) return null;
      clearPendingJournal();
      var actualBefore = storageRaw(storage, key);
      if (actualBefore !== durableRaw) {
        failClosed(actualBefore == null || durableRaw == null
          ? 'Story state persistence changed outside this runtime'
          : 'Story state persistence has an equal-revision or concurrent divergence');
      }
      var candidateRaw = JSON.stringify(storyRecord(next, nextRevision));
      // Parsing our candidate through the same strict boundary proves the bytes
      // that will be journaled are restart-safe before touching durable state.
      parseStoryRecord(candidateRaw, 'Story write candidate');
      var journalKey = key + STORY_JOURNAL_SUFFIX;
      var journalRaw = JSON.stringify({ schema: 'StoryWriteJournalV1', version: 1,
        storageKey: key, previousRaw: durableRaw, candidateRaw: candidateRaw });
      var journalError = null;
      try { storage.setItem(journalKey, journalRaw); } catch (error) { journalError = error; }
      var journalReadback = storageRaw(storage, journalKey);
      if (journalReadback !== journalRaw) {
        if (journalReadback == null) {
          var preparationError = new Error('Story state persistence failed before commit');
          preparationError.cause = journalError;
          throw preparationError;
        }
        failClosed('Story state persistence is uncertain; journal write diverged', journalError);
      }

      var writeError = null;
      try { storage.setItem(key, candidateRaw); } catch (error) { writeError = error; }
      var actualAfter = storageRaw(storage, key);
      if (actualAfter !== candidateRaw) {
        if (actualAfter === durableRaw) {
          var rollbackClear = clearStorageKey(storage, journalKey);
          cleanupPending = !rollbackClear.cleared;
          var wrapped = new Error('Story state persistence failed');
          wrapped.cause = writeError;
          throw wrapped;
        }
        failClosed('Story state persistence is uncertain; candidate write diverged', writeError);
      }

      // An adapter may write the exact bytes and then throw. Exact readback is
      // authoritative: accept that commit so memory, restart, and UI agree.
      var cleared = clearStorageKey(storage, journalKey);
      cleanupPending = !cleared.cleared;
      return candidateRaw;
    }
    function snapshot() { healthy(); return Story.validateState(state); }
    function ensureDurable() {
      healthy();
      if (!storage) return snapshot();
      if (durableRaw !== null) return refresh();
      var nextRevision = revision + 1;
      var persistedRaw = persist(state, nextRevision);
      revision = nextRevision;
      durableRaw = persistedRaw;
      return snapshot();
    }
    function set(next) {
      healthy();
      var normalized = Story.normalizeState(next);
      if (JSON.stringify(normalized) === JSON.stringify(state)) return snapshot();
      var nextRevision = revision + 1;
      validateMonotonicStoryTransition(state, normalized, 1);
      var persistedRaw = persist(normalized, nextRevision);
      state = normalized;
      revision = nextRevision;
      if (storage) durableRaw = persistedRaw;
      return snapshot();
    }
    function refresh() {
      healthy();
      if (!storage) return snapshot();
      var journalRecovery = recoverStoryJournal(storage, key);
      cleanupPending = journalRecovery.cleanupPending;
      var externalRaw = journalRecovery.mainRaw;
      if (externalRaw === durableRaw) return snapshot();
      var external = parseStoryRecord(externalRaw, 'Refreshed Story state');
      if (!external || external.revision < revision) {
        failClosed('Story state persistence rolled back or disappeared');
      }
      if (external.revision === revision) {
        failClosed('Story state persistence has an equal-revision divergence');
      }
      try {
        validateMonotonicStoryTransition(state, external.state,
          external.revision - revision);
      } catch (error) {
        failClosed('Story state persistence contains a higher-revision regression', error);
      }
      state = external.state;
      revision = external.revision;
      durableRaw = external.raw;
      return snapshot();
    }
    function discoverLevel(level) {
      var current = refresh();
      var result = Story.discoverForLevel(current, level);
      if (result.newlyDiscovered.length) set(result.state);
      return freeze({ state: snapshot(), newlyDiscovered: result.newlyDiscovered });
    }
    function discoverRival(rivalId) {
      var id = nonEmpty(rivalId, 'rivalId');
      var current = refresh();
      if (current.discoveredRivalIds.indexOf(id) >= 0) return current;
      if (!Story.chapters.some(function (chapter) { return chapter.rivalId === id; })) {
        throw new RangeError('Unknown Story rival: ' + id);
      }
      return set(Object.assign({}, clone(current), {
        discoveredRivalIds: current.discoveredRivalIds.concat([id]),
      }));
    }

    function exactProfileIds(profile, field, allowed, limit) {
      var values = profile[field] == null ? [] : profile[field];
      if (!Array.isArray(values) || values.length > limit) {
        throw new TypeError('Profile ' + field + ' is outside the Story evidence contract');
      }
      var seen = new Set();
      var output = [];
      for (var index = 0; index < values.length; index++) {
        var id = values[index];
        if (typeof id !== 'string' || !allowed.has(id) || seen.has(id)) {
          throw new TypeError('Profile ' + field + ' contains invalid Story evidence');
        }
        seen.add(id); output.push(id);
      }
      return output;
    }

    var storyRivalIds = new Set(Story.chapters.map(function (chapter) { return chapter.rivalId; }));
    var storyActIds = new Set(['1', '2', '3', '4']);
    function profileEvidence(profileInput) {
      var profile = object(profileInput);
      var completedRivals = exactProfileIds(profile, 'defeatedRivalIds', storyRivalIds, 12);
      var rewardedRivals = exactProfileIds(profile, 'rewardedRivalIds', storyRivalIds, 12);
      var rewardedActs = exactProfileIds(profile, 'rewardedActIds', storyActIds, 4);
      var defeated = unique(completedRivals.concat(rewardedRivals));
      var claims = rewardedRivals.map(function (id) {
        return 'rival.' + id + '.first-clear';
      }).concat(rewardedActs.map(function (id) {
        return 'story.act.' + id + '.first-clear';
      }));
      return { defeatedRivalIds: defeated, claimedRewardIds: claims };
    }

    function compatibleRewardClaims(claimIds, candidateState) {
      return claimIds.filter(function (claimId) {
        var rival = /^rival\.([^.]+)\.first-clear$/.exec(claimId);
        if (rival) return candidateState.defeatedRivalIds.indexOf(rival[1]) >= 0;
        var act = /^story\.act\.([1-4])\.first-clear$/.exec(claimId);
        return !!act && candidateState.completedActIds.indexOf(act[1]) >= 0;
      });
    }

    function reconciledState(stateInput, profileInput) {
      var current = Story.validateState(stateInput);
      var evidence = profileEvidence(profileInput);
      var defeated = unique(current.defeatedRivalIds.concat(evidence.defeatedRivalIds));
      var preliminaries = current.clearedPreliminaryIds.slice();
      var base = Story.normalizeState({
        clearedPreliminaryIds: preliminaries, defeatedRivalIds: defeated,
        discoveredRivalIds: current.discoveredRivalIds,
        resolvedAttemptIds: current.resolvedAttemptIds, claimedRewardIds: [],
        lastCheckpoint: current.lastCheckpoint,
      });
      return Story.normalizeState({
        clearedPreliminaryIds: base.clearedPreliminaryIds,
        defeatedRivalIds: base.defeatedRivalIds,
        discoveredRivalIds: base.discoveredRivalIds,
        resolvedAttemptIds: base.resolvedAttemptIds,
        claimedRewardIds: compatibleRewardClaims(evidence.claimedRewardIds, base),
        lastCheckpoint: base.lastCheckpoint,
      });
    }

    function reconcileProfile(profileInput) {
      var current = refresh();
      var reconciled = reconciledState(current, profileInput);
      if (JSON.stringify(reconciled) === JSON.stringify(current)) return current;
      return set(reconciled);
    }
    function commitResolution(resolutionInput, profileInput) {
      var resolution = object(resolutionInput);
      if (resolution.schema !== 'StoryResolutionV1') {
        throw new TypeError('StoryResolutionV1 is required');
      }
      if (resolution.abandoned === true) {
        return freeze({ applied: false, duplicate: false, reason: 'abandoned', state: snapshot() });
      }
      var current = refresh();
      var incoming = Story.normalizeState(resolution.state);
      var evidence = profileEvidence(profileInput);
      var newAttempts = incoming.resolvedAttemptIds.filter(function (id) {
        return current.resolvedAttemptIds.indexOf(id) < 0;
      });
      if (!newAttempts.length) {
        return freeze({ applied: false, duplicate: true, reason: 'duplicate', state: current });
      }
      var mergedBase = Story.normalizeState({
        clearedPreliminaryIds: unique(current.clearedPreliminaryIds.concat(incoming.clearedPreliminaryIds)),
        defeatedRivalIds: unique(current.defeatedRivalIds.concat(
          incoming.defeatedRivalIds, evidence.defeatedRivalIds)),
        discoveredRivalIds: unique(current.discoveredRivalIds.concat(incoming.discoveredRivalIds)),
        resolvedAttemptIds: Story.mergeAttemptReceipts(current.resolvedAttemptIds,
          incoming.resolvedAttemptIds),
        claimedRewardIds: [],
        lastCheckpoint: incoming.lastCheckpoint || current.lastCheckpoint,
      });
      var merged = Story.normalizeState({
        clearedPreliminaryIds: mergedBase.clearedPreliminaryIds,
        defeatedRivalIds: mergedBase.defeatedRivalIds,
        discoveredRivalIds: mergedBase.discoveredRivalIds,
        resolvedAttemptIds: mergedBase.resolvedAttemptIds,
        // Story mirrors only Profile rewarded evidence that is compatible with
        // its own recovered campaign facts. Loose processed strings never count.
        claimedRewardIds: compatibleRewardClaims(evidence.claimedRewardIds, mergedBase),
        lastCheckpoint: mergedBase.lastCheckpoint,
      });
      return freeze({ applied: true, duplicate: false, state: set(merged), attemptIds: newAttempts });
    }

    var finalizationKey = key + STORY_FINALIZATION_SUFFIX;
    function exactResolutionClaimIds(resolutionInput) {
      var resolution = object(resolutionInput);
      if (!Array.isArray(resolution.rewards) || resolution.rewards.length > 2) {
        throw new RangeError('Story resolution exceeds its two-component reward bound');
      }
      var seen = new Set();
      return resolution.rewards.map(function (reward) {
        var claimId = object(reward).claimId;
        if (typeof claimId !== 'string' || Story.rewardIds.indexOf(claimId) < 0 ||
            seen.has(claimId)) {
          throw new TypeError('Story resolution contains an invalid reward claim');
        }
        seen.add(claimId);
        return claimId;
      });
    }
    function expectedFinalization(baseState, attemptInput, success) {
      if (typeof success !== 'boolean') {
        throw new TypeError('Story resolution success must be an exact boolean');
      }
      var attempt = Story.validateAttempt(baseState, attemptInput);
      if (baseState.resolvedAttemptIds.indexOf(attempt.attemptId) >= 0) {
        throw new RangeError('Story finalization cannot begin from an already-receipted attempt');
      }
      return Story.resolveAttempt(baseState, attempt, {
        status: 'completed', winnerIds: success ? [attempt.alliedHumanIds[0]] : [],
      });
    }
    function assertResolutionMatchesTransition(request, resolution, baseState, attempt) {
      if (resolution.schema !== 'StoryResolutionV1' ||
          resolution.abandoned === true || resolution.duplicate === true) {
        throw new TypeError('Canonical Story finalization data is required');
      }
      var expected = expectedFinalization(baseState, attempt, resolution.success);
      var actualClaimIds = exactResolutionClaimIds(resolution);
      var expectedClaimIds = expected.rewards.map(function (reward) { return reward.claimId; });
      if (resolution.source !== request.activityId ||
          resolution.matchKind !== expected.matchKind ||
          resolution.chapterId !== expected.chapterId ||
          resolution.rivalId !== expected.rivalId ||
          resolution.ordinaryRewardsEligible !== (request.activityId === 'story') ||
          JSON.stringify(actualClaimIds) !== JSON.stringify(expectedClaimIds) ||
          JSON.stringify(Story.validateState(resolution.state)) !== JSON.stringify(expected.state)) {
        throw new RangeError('Story resolution is not its canonical one-attempt transition');
      }
      return freeze({ expected: expected, claimIds: actualClaimIds });
    }
    function assertFinalizationCurrent(intent, profileInput) {
      var current = refresh();
      var candidates = [intent.baseState, intent.candidateState,
        reconciledState(intent.baseState, profileInput),
        reconciledState(intent.candidateState, profileInput)];
      if (!candidates.some(function (candidate) {
        return JSON.stringify(candidate) === JSON.stringify(current);
      })) {
        failClosed('Pending Story finalization is incompatible with current Story state');
      }
      return current;
    }
    function assertFinalizationEvidence(intentInput, profileInput) {
      var intent = intentInput && intentInput.schema === 'StoryFinalizationIntentV1'
        ? intentInput : parseFinalizationIntent(intentInput);
      var profile = object(profileInput);
      if (exactProfileLineage(profile) !== intent.profileLineageId) {
        throw new Error('Profile lineage does not prove the pending Story finalization');
      }
      if (intent.activityId === 'story') {
        var receipt = exactProfileReceipts(profile).byMatchId.get(intent.matchId) || null;
        if (!receipt || receipt.activityId !== 'story' ||
            receipt.ordinal !== intent.receiptOrdinal || receipt.resolution !== 'consumed') {
          throw new Error('Profile receipt does not prove the pending Story finalization');
        }
      }
      var claims = profileEvidence(profile).claimedRewardIds;
      if (!intent.rewardClaimIds.every(function (claimId) {
        return claims.indexOf(claimId) >= 0;
      })) throw new Error('Profile evidence does not prove the pending Story rewards');
      return true;
    }
    function pendingFinalization() {
      healthy();
      return parseFinalizationIntent(storageRaw(storage, finalizationKey));
    }
    function prepareFinalization(requestInput, resolutionInput, bindingInput, profileInput) {
      healthy();
      if (!storage) return null;
      var request = object(requestInput);
      var resolution = object(resolutionInput);
      var binding = object(bindingInput);
      var context = object(request.activityContext);
      var attemptInput = context.attempt;
      if ((request.activityId !== 'story' && request.activityId !== 'rival-board') ||
          resolution.schema !== 'StoryResolutionV1' || resolution.abandoned === true ||
          resolution.duplicate === true) {
        throw new TypeError('Canonical Story finalization data is required');
      }
      var existingRaw = storageRaw(storage, finalizationKey);
      if (existingRaw != null) {
        var existing = parseFinalizationIntent(existingRaw);
        var existingAttempt = Story.validateAttempt(existing.baseState, attemptInput);
        var existingTransition = assertResolutionMatchesTransition(request, resolution,
          existing.baseState, existingAttempt);
        if (existing.profileLineageId !== binding.profileLineageId ||
            existing.receiptOrdinal !== (request.activityId === 'story'
              ? binding.receiptOrdinal : null) ||
            existing.matchId !== request.matchId || existing.activityId !== request.activityId ||
            JSON.stringify(existing.attempt) !== JSON.stringify(existingAttempt) ||
            existing.success !== resolution.success ||
            JSON.stringify(existing.candidateState) !==
              JSON.stringify(Story.validateState(resolution.state)) ||
            JSON.stringify(existing.rewardClaimIds) !== JSON.stringify(existingTransition.claimIds)) {
          failClosed('A different Story finalization is already pending');
        }
        assertFinalizationCurrent(existing, profileInput);
        return existing;
      }
      var baseState = ensureDurable();
      var attempt = Story.validateAttempt(baseState, attemptInput);
      var transition = assertResolutionMatchesTransition(request, resolution, baseState, attempt);
      var record = {
        schema: 'StoryFinalizationIntentV1', version: 1,
        profileLineageId: binding.profileLineageId,
        receiptOrdinal: request.activityId === 'story' ? binding.receiptOrdinal : null,
        matchId: request.matchId, activityId: request.activityId,
        attempt: attempt, success: resolution.success, baseState: baseState,
        candidateState: transition.expected.state, rewardClaimIds: transition.claimIds,
      };
      var raw = JSON.stringify(record);
      var validated = parseFinalizationIntent(raw);
      var writeError = null;
      try { storage.setItem(finalizationKey, raw); } catch (error) { writeError = error; }
      var readback = storageRaw(storage, finalizationKey);
      if (readback === raw) return validated;
      if (readback == null) {
        var wrapped = new Error('Story finalization intent persistence failed');
        wrapped.cause = writeError;
        throw wrapped;
      }
      failClosed('Story finalization intent persistence diverged', writeError);
    }
    function clearFinalization(matchId) {
      healthy();
      if (!storage) return true;
      var pending = pendingFinalization();
      if (!pending) return true;
      if (typeof matchId !== 'string' || matchId !== pending.matchId) {
        failClosed('Story finalization clear does not match the pending intent');
      }
      var cleared = clearStorageKey(storage, finalizationKey);
      if (cleared.cleared) return true;
      if (cleared.remaining !== pending.raw) {
        failClosed('Story finalization intent changed while clearing', cleared.error);
      }
      return false;
    }

    return freeze({
      schema: 'StoryStateStoreV1', key: key,
      snapshot: snapshot, refresh: refresh, ensureDurable: ensureDurable, set: set,
      discoverLevel: discoverLevel, discoverRival: discoverRival,
      reconcileProfile: reconcileProfile, commitResolution: commitResolution,
      pendingFinalization: pendingFinalization,
      prepareFinalization: prepareFinalization,
      assertFinalizationCurrent: assertFinalizationCurrent,
      assertFinalizationEvidence: assertFinalizationEvidence,
      clearFinalization: clearFinalization,
    });
  }

  function normalizeHumanPlayers(input, cooperative) {
    var source = object(input);
    var expected = cooperative ? 2 : 1;
    var players = Array.isArray(source.humans) ? source.humans : [];
    if (!players.length && Array.isArray(source.alliedHumanIds)) {
      players = source.alliedHumanIds.map(function (id) { return { id: id }; });
    }
    if (players.length !== expected) {
      throw new TypeError('Story match requires exactly ' + expected + ' human player' +
        (expected === 1 ? '' : 's'));
    }
    var seen = new Set();
    return players.map(function (entry, index) {
      var player = object(entry);
      var id = nonEmpty(player.id || player.playerId, 'human player id');
      if (seen.has(id)) throw new TypeError('Duplicate human player id: ' + id);
      seen.add(id);
      return freeze({
        id: id, kind: 'human', human: true,
        displayName: String(player.displayName || player.name || ('Player ' + (index + 1))),
        flipperId: String(player.flipperId || player.objectId || 'bottle'),
        variantId: player.variantId == null ? null : String(player.variantId),
        cosmeticId: player.cosmeticId == null ? null : String(player.cosmeticId),
        allianceId: cooperative ? 'story-allies' : null,
      });
    });
  }

  function createCpuRoster(attempt, count) {
    var chapter = chapterFor(attempt);
    var output = [];
    for (var index = 0; index < count; index++) {
      var signature = attempt.matchKind === 'signature' && index === 0;
      output.push(freeze({
        id: signature ? ('rival-' + chapter.rivalId) :
          ('cpu-' + chapter.id + '-' + (index + 1)),
        kind: 'cpu', human: false,
        displayName: signature ? chapter.rivalName : ('WFC Entry ' + (index + 1)),
        callsign: signature ? chapter.callsign : null,
        flipperId: signature ? chapter.flipperId : 'bottle',
        cpuTier: chapter.cpuTier,
        allianceId: 'story-opposition',
      }));
    }
    return output;
  }

  function attemptReplayState(stateInput, attempt, profileInput) {
    var state = Story.normalizeState(stateInput);
    var chapter = chapterFor(attempt);
    var replay;
    if (attempt.matchKind === 'preliminary') {
      replay = state.clearedPreliminaryIds.indexOf(chapter.preliminaryId) >= 0;
      return freeze({ replay: replay, rewardRecovery: false });
    }
    replay = state.defeatedRivalIds.indexOf(chapter.rivalId) >= 0;
    if (!replay) return freeze({ replay: false, rewardRecovery: false });
    var profile = object(profileInput);
    var rewardedRivals = Array.isArray(profile.rewardedRivalIds) ? profile.rewardedRivalIds : [];
    var rewardedActs = Array.isArray(profile.rewardedActIds) ? profile.rewardedActIds : [];
    var actId = String(chapter.act);
    var missingRivalReward = rewardedRivals.indexOf(chapter.rivalId) < 0;
    var missingActReward = state.completedActIds.indexOf(actId) >= 0 &&
      rewardedActs.indexOf(actId) < 0;
    return freeze({ replay: true, rewardRecovery: missingRivalReward || missingActReward });
  }

  function buildRequest(options) {
    var opts = object(options);
    var storyStore = opts.storyStore;
    var profileStore = opts.profileStore;
    if (!storyStore || typeof storyStore.snapshot !== 'function') {
      throw new TypeError('Story state store is required');
    }
    if (!profileStore || typeof profileStore.snapshot !== 'function') {
      throw new TypeError('Profile store is required');
    }
    var input = object(opts.input);
    var matchId = nonEmpty(input.matchId, 'matchId');
    var source = input.activityId === 'rival-board' || input.source === 'rival-board'
      ? 'rival-board' : 'story';
    var cooperative = source === 'story' && input.cooperative === true;
    var humans = normalizeHumanPlayers(input, cooperative);
    var profile = profileStore.snapshot();
    storyStore.reconcileProfile(profile);
    storyStore.discoverLevel(profile.flipLevel);
    var chapter = chapterFor(input);
    if (!chapter) throw new TypeError('Unknown Story chapter or rival');
    var before = storyStore.snapshot();
    var attempt = Story.prepareAttempt(before, {
      attemptId: String(input.attemptId || ('attempt:' + matchId)),
      source: source, chapterId: chapter.id,
      matchKind: input.matchKind,
      cooperative: cooperative,
      alliedHumanIds: humans.map(function (player) { return player.id; }),
      seed: input.seed,
    });
    // Reveal a Story rival only after availability validation. Invalid requests
    // must never leak a later Board identity into the persisted discovery state.
    if (source === 'story') storyStore.discoverRival(chapter.rivalId);
    var replayState = attemptReplayState(before, attempt, profile);
    var cpuCount = attempt.rosterTemplate.cpuCount;
    var roster = humans.concat(createCpuRoster(attempt, cpuCount)).map(function (entry) {
      return Object.assign({}, clone(entry), { startingLives: attempt.rosterTemplate.lives });
    });
    var eventPolicy = freeze({
      enabled: attempt.eventsEnabled,
      oddsProfile: 'normal',
      exactMrHoweBoost: attempt.eventsEnabled,
      nestedEvents: attempt.eventsEnabled,
      forcedEventId: null,
    });
    var opponentTargeting = freeze({
      alliedHumanIds: attempt.alliedHumanIds,
      excludeAlliedHumans: cooperative,
    });
    return Activity.MatchRequestV2({
      matchId: matchId,
      activityId: source,
      formatId: 'classic',
      physicsModeId: attempt.physicsModeId,
      roster: roster,
      rulesOptions: {
        startingLives: attempt.rosterTemplate.lives,
        playerCount: roster.length,
        arenaId: attempt.arenaId,
        prescribedArena: true,
        events: eventPolicy,
        cpuProfile: { tier: attempt.cpuTier },
        clearCondition: { anyWinnerId: attempt.alliedHumanIds },
        opponentTargeting: opponentTargeting,
      },
      activityContext: {
        schema: 'StoryActivityContextV1',
        attempt: attempt,
        chapterId: attempt.chapterId,
        rivalId: attempt.rivalId,
        matchKind: attempt.matchKind,
        source: attempt.source,
        cooperative: attempt.cooperative,
        alliedHumanIds: attempt.alliedHumanIds,
        arenaId: attempt.arenaId,
        prescribedArena: true,
        cpuTier: attempt.cpuTier,
        nativeAlien: attempt.physicsModeId === 'alien',
        events: eventPolicy,
        opponentTargeting: opponentTargeting,
        // Generic `replay` is the Activity no-reward flag. A successful replay
        // with missing canonical first-clear evidence is admitted only to repair
        // those exact components; its ordinary match reward is still suppressed.
        replay: replayState.replay && !replayState.rewardRecovery,
        storyReplay: replayState.replay,
        rewardRecovery: replayState.rewardRecovery,
      },
      seed: attempt.seed,
      createdAt: input.createdAt,
    });
  }

  function abandonedResolution(state, request, reason) {
    var context = object(request.activityContext);
    var attempt = object(context.attempt);
    return freeze({
      schema: 'StoryResolutionV1', duplicate: false, success: false,
      abandoned: true, source: request.activityId,
      matchKind: attempt.matchKind || null, chapterId: attempt.chapterId || null,
      rivalId: attempt.rivalId || null, ordinaryRewardsEligible: false,
      state: Story.normalizeState(state), rewards: [],
      newlyClearedChapterIds: [], newlyCompletedActIds: [],
      nextChapterId: (Story.nextChapter(state) || {}).id || null,
      campaignCompleted: Story.normalizeState(state).campaignCompleted,
      reason: String(reason || 'abandoned'),
    });
  }

  function validateStoryMatchRequest(request, activityId, storyState) {
    var context = object(request.activityContext);
    var attempt = Story.validateAttempt(storyState, context.attempt);
    var chapter = chapterFor(attempt);
    if (request.activityId !== activityId || context.source !== activityId ||
        attempt.schema !== 'StoryAttemptV1' || attempt.source !== activityId || !chapter) {
      throw new TypeError('Invalid ' + activityId + ' activity context');
    }
    var expectedPhysics = chapter.nativeAlien ? 'alien' : 'normal';
    var expectedEvents = !chapter.nativeAlien;
    var rules = object(request.rulesOptions);
    var ruleEvents = object(rules.events);
    var contextEvents = object(context.events);
    var humans = request.roster.filter(function (entry) { return entry.human === true; });
    var cpus = request.roster.filter(function (entry) { return entry.human !== true; });
    var humanIds = humans.map(function (entry) { return entry.id; });
    var alliedHumanIds = Array.isArray(attempt.alliedHumanIds) ? attempt.alliedHumanIds : [];
    var rulesTargeting = object(rules.opponentTargeting);
    var contextTargeting = object(context.opponentTargeting);
    var clearCondition = object(rules.clearCondition);
    var expectedAllyProtection = attempt.cooperative === true;
    if (request.formatId !== 'classic' || request.physicsModeId !== expectedPhysics ||
        request.seed !== attempt.seed ||
        attempt.physicsModeId !== expectedPhysics || attempt.arenaId !== chapter.arenaId ||
        context.chapterId !== attempt.chapterId || context.rivalId !== attempt.rivalId ||
        context.matchKind !== attempt.matchKind || context.cooperative !== attempt.cooperative ||
        context.cpuTier !== attempt.cpuTier ||
        context.nativeAlien !== (chapter.nativeAlien === true) ||
        context.arenaId !== chapter.arenaId || rules.arenaId !== chapter.arenaId ||
        context.prescribedArena !== true || rules.prescribedArena !== true ||
        contextEvents.enabled !== expectedEvents || contextEvents.nestedEvents !== expectedEvents ||
        ruleEvents.enabled !== expectedEvents || ruleEvents.nestedEvents !== expectedEvents ||
        contextEvents.oddsProfile !== 'normal' || ruleEvents.oddsProfile !== 'normal' ||
        humans.length !== attempt.rosterTemplate.humanCount ||
        cpus.length !== attempt.rosterTemplate.cpuCount ||
        rules.startingLives !== attempt.rosterTemplate.lives ||
        request.roster.some(function (entry) {
          return entry.startingLives !== attempt.rosterTemplate.lives;
        })) {
      throw new TypeError('Story request violates its prescribed match contract');
    }
    if (!sameStringSet(alliedHumanIds, humanIds) ||
        !sameStringSet(context.alliedHumanIds, alliedHumanIds) ||
        !sameStringSet(rulesTargeting.alliedHumanIds, alliedHumanIds) ||
        !sameStringSet(contextTargeting.alliedHumanIds, alliedHumanIds) ||
        !sameStringSet(clearCondition.anyWinnerId, alliedHumanIds) ||
        rulesTargeting.excludeAlliedHumans !== expectedAllyProtection ||
        contextTargeting.excludeAlliedHumans !== expectedAllyProtection ||
        context.cooperative !== expectedAllyProtection) {
      throw new TypeError('Story request has inconsistent allied human protection');
    }
    return freeze({ chapter: chapter, attempt: attempt });
  }

  function registerStoryActivities(registry, options) {
    var opts = object(options);
    var storyStore = opts.storyStore;
    if (!registry || typeof registry.register !== 'function') {
      throw new TypeError('ActivityRegistry is required');
    }
    if (!storyStore || typeof storyStore.snapshot !== 'function') {
      throw new TypeError('Story state store is required');
    }
    ['story', 'rival-board'].forEach(function (activityId) {
      registry.register({
        id: activityId,
        prepare: function (payload) {
          var request = object(payload).request;
          var context = object(request.activityContext);
          var validated = validateStoryMatchRequest(request, activityId, storyStore.snapshot());
          return freeze({
            schema: 'PreparedStoryActivityV1', attempt: validated.attempt,
            storyReplay: context.storyReplay === true,
            rewardRecovery: context.rewardRecovery === true,
            broadcast: View.broadcastCard({ attempt: context.attempt,
              replay: context.storyReplay === true }),
          });
        },
        resolve: function (payload) {
          var source = object(payload);
          var request = source.request;
          var outcome = source.outcome;
          if (!outcome || outcome.status !== 'completed') {
            return abandonedResolution(storyStore.snapshot(), request,
              outcome && outcome.completionReason);
          }
          return Story.resolveAttempt(storyStore.snapshot(),
            request.activityContext.attempt, outcome);
        },
        abandon: function (payload) {
          var source = object(payload);
          return abandonedResolution(storyStore.snapshot(), source.request, source.reason);
        },
      });
    });
    return registry;
  }

  function ordinaryRewardInput(command, suppressOrdinaryReward) {
    var request = command.request;
    var outcome = command.outcome;
    var resolution = command.activityResolution;
    var telemetry = object(outcome.telemetry);
    var humanCount = request.roster.filter(function (entry) { return entry.human === true; }).length;
    return Object.assign({}, clone(telemetry.rewardInput || {}), {
      status: outcome.status,
      completed: outcome.status === 'completed',
      resolved: outcome.status === 'completed',
      activityId: request.activityId,
      formatId: request.formatId,
      humanCount: humanCount,
      humanPlayers: humanCount,
      startingLives: request.rulesOptions.startingLives,
      qualifiedManualHumanFlips: suppressOrdinaryReward === true
        ? 0 : (Number(telemetry.qualifiedManualHumanFlips) || 0),
      performanceMultiplier: Number(telemetry.performanceMultiplier) || 1,
      humanWon: resolution.success === true,
      result: resolution.success === true ? 'human-win' : 'loss',
      testData: false,
    });
  }

  function createProfileCommands(command, rewardContext) {
    var resolution = object(command.activityResolution);
    var context = object(command.request && command.request.activityContext);
    var authority = object(rewardContext);
    if (resolution.abandoned === true || resolution.duplicate === true || context.replay === true ||
        authority.canonicalClaimsAllowed !== true) {
      return freeze([]);
    }
    return freeze([freeze({
      kind: 'claimStoryMatchResolution',
      input: freeze({
        matchId: command.matchId,
        ordinaryRewardsEligible: resolution.ordinaryRewardsEligible === true &&
          command.request.activityId === 'story' && authority.reserved === true &&
          authority.rewardsEligible === true,
        rewardInput: ordinaryRewardInput(command, context.storyReplay === true),
        rewards: freeze((Array.isArray(resolution.rewards) ? resolution.rewards : []).map(clone)),
      }),
    })]);
  }

  function executeProfileCommands(profileStore, commands, rewardContext) {
    return commands.map(function (command) {
      var result;
      if (command.kind === 'claimStoryMatchResolution') {
        if (!rewardContext || typeof rewardContext.claimStoryMatchResolution !== 'function') {
          throw new TypeError('Story profile commands require the coordinator reward authority');
        }
        // The coordinator injects its private MatchClaimTokenV1 at this exact
        // call boundary.  It is never copied into MatchRequestV2, telemetry,
        // statistics, presentation, or the returned command log.
        result = rewardContext.claimStoryMatchResolution(command.input);
      } else {
        throw new RangeError('Unknown Story profile command: ' + command.kind);
      }
      if (result && result.reason === 'persistence-failed') {
        throw new Error('Profile persistence failed for ' + command.kind);
      }
      if (!result || (result.applied !== true && result.reason !== 'duplicate')) {
        throw new Error('Profile command did not commit for ' + command.kind +
          (result && result.reason ? ': ' + result.reason : ''));
      }
      return freeze({ command: clone(command), result: clone(result) });
    });
  }

  function createStableRewardAuthority(sourceInput) {
    var source = sourceInput;
    if (!source || typeof source !== 'object') {
      throw new TypeError('A private v1.12 reward authority is required');
    }
    function method(primary, fallback) {
      var fn = typeof source[primary] === 'function' ? source[primary]
        : (fallback && typeof source[fallback] === 'function' ? source[fallback] : null);
      return fn && function () { return fn.apply(source, arguments); };
    }
    var reserveMatch = method('reserveMatch');
    var resumeMatchReservation = method('resumeMatchReservation');
    var claimMatch = method('claimMatch', 'consumeReservedMatch');
    var abandonMatch = method('abandonMatch', 'abandonReservedMatch');
    var claimStoryMatchResolution = method('claimStoryMatchResolution');
    var earnedSnapshot = method('earnedSnapshot', 'snapshot');
    if (!reserveMatch || !resumeMatchReservation || !claimMatch || !abandonMatch ||
        !claimStoryMatchResolution || !earnedSnapshot) {
      throw new TypeError('Private Story reward authority lacks the MatchClaimTokenV1 lifecycle');
    }
    var stableOwnerGuards = new WeakMap();
    var activityPolicyMethod = method('activityPolicy');
    var validateGuardMethod = method('validateOwnerTestGuard');
    function activityPolicy(input) {
      if (!activityPolicyMethod) return input && typeof input === 'object' ? clone(input) : {};
      var policy = activityPolicyMethod(input);
      if (policy && policy.ownerTestMode === true && policy.ownerTestGuard &&
          validateGuardMethod && validateGuardMethod(policy.ownerTestGuard, policy.activityId) === true) {
        // A session that starts under the authenticated owner mode remains Test
        // Data even if the UI toggle changes before its physical result settles.
        stableOwnerGuards.set(policy.ownerTestGuard, policy.activityId);
      }
      return policy;
    }
    function validateOwnerTestGuard(guard, activityId) {
      return (!!guard && typeof guard === 'object' && stableOwnerGuards.get(guard) === activityId) ||
        (!!validateGuardMethod && validateGuardMethod(guard, activityId) === true);
    }
    var authority = {
      reserveMatch: reserveMatch,
      resumeMatchReservation: resumeMatchReservation,
      claimMatch: claimMatch,
      abandonMatch: abandonMatch,
      claimStoryMatchResolution: claimStoryMatchResolution,
      earnedSnapshot: earnedSnapshot,
    };
    if (activityPolicyMethod) authority.activityPolicy = activityPolicy;
    if (validateGuardMethod) authority.validateOwnerTestGuard = validateOwnerTestGuard;
    return freeze(authority);
  }

  function publicProfileProjection(value) {
    var source = object(value);
    return freeze({
      schema: 'StoryProfileProjectionV1',
      flipLevel: Number(source.flipLevel) || 1,
      defeatedRivalIds: unique(source.defeatedRivalIds),
      rewardedRivalIds: unique(source.rewardedRivalIds),
      completedActIds: unique(source.completedActIds),
      rewardedActIds: unique(source.rewardedActIds),
      fieldNoteIds: unique(source.fieldNoteIds),
      ownedObjectIds: unique(source.ownedObjectIds),
      featureIds: unique(source.featureIds),
      ownerTestMode: source.ownerTestMode === true,
      testData: source.testData === true,
    });
  }

  function exactProfileLineage(profileInput) {
    var profile = object(profileInput);
    var lineageId = profile.lineageId;
    if (typeof lineageId !== 'string' || !lineageId || lineageId !== lineageId.trim() ||
        lineageId.length > 128 || /[\u0000-\u001f\u007f]/.test(lineageId)) {
      throw new TypeError('Profile lineage is outside the Story finalization contract');
    }
    return lineageId;
  }

  function exactProfileReceipts(profileInput) {
    var profile = object(profileInput);
    var values = profile.matchReceipts == null ? [] : profile.matchReceipts;
    if (!Array.isArray(values) || values.length > 4096) {
      throw new TypeError('Profile match receipts are outside the Story recovery contract');
    }
    if (!Number.isSafeInteger(profile.consumedMatchOrdinal) ||
        profile.consumedMatchOrdinal < 0) {
      throw new TypeError('Profile match receipt frontier is outside the Story recovery contract');
    }
    var receiptMatchIds = new Set();
    var byMatchId = new Map();
    var normalizedValues = [];
    var previousOrdinal = 0;
    for (var index = 0; index < values.length; index++) {
      var candidate = values[index];
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        throw new TypeError('Profile match receipt must be a plain data record');
      }
      var prototype;
      var names;
      var symbols;
      try {
        prototype = Object.getPrototypeOf(candidate);
        names = Object.getOwnPropertyNames(candidate);
        symbols = Object.getOwnPropertySymbols(candidate);
      } catch (_) {
        throw new TypeError('Profile match receipt structure is unreadable');
      }
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError('Profile match receipt must use a plain prototype');
      }
      if (symbols.length) throw new TypeError('Profile match receipt cannot contain symbol fields');
      var item = Object.create(null);
      for (var nameIndex = 0; nameIndex < names.length; nameIndex++) {
        var field = names[nameIndex];
        var descriptor;
        try { descriptor = Object.getOwnPropertyDescriptor(candidate, field); }
        catch (_) { throw new TypeError('Profile match receipt field is unreadable'); }
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
          throw new TypeError('Profile match receipt must contain data fields only');
        }
        item[field] = descriptor.value;
      }
      var hasBearerNonce = Object.prototype.hasOwnProperty.call(item, 'bearerNonce');
      var hasReservedAt = Object.prototype.hasOwnProperty.call(item, 'reservedAt');
      if (hasBearerNonce !== hasReservedAt) {
        throw new TypeError('Profile private receipt identity fields must appear together');
      }
      var receiptKeys = ['schema', 'version', 'matchId', 'activityId', 'ordinal', 'resolution'];
      if (hasBearerNonce) receiptKeys = receiptKeys.concat(['bearerNonce', 'reservedAt']);
      exactKeys(item, receiptKeys, 'Profile match receipt');
      if (item.schema !== 'MatchReceiptV1' || item.version !== 1 ||
          typeof item.matchId !== 'string' || !item.matchId ||
          item.matchId !== item.matchId.trim() || item.matchId.length > 128 ||
          /[\u0000-\u001f\u007f]/.test(item.matchId) ||
          (item.activityId !== 'story' && item.activityId !== 'free-play') ||
          !Number.isSafeInteger(item.ordinal) || item.ordinal < 1 ||
          item.ordinal > profile.consumedMatchOrdinal ||
          (item.resolution !== 'consumed' && item.resolution !== 'abandoned')) {
        throw new TypeError('Profile match receipt is outside the Story recovery contract');
      }
      if (hasBearerNonce &&
          (typeof item.bearerNonce !== 'string' || !item.bearerNonce ||
            item.bearerNonce !== item.bearerNonce.trim() || item.bearerNonce.length > 128 ||
            /[\u0000-\u001f\u007f]/.test(item.bearerNonce) ||
            !Number.isSafeInteger(item.reservedAt) || item.reservedAt < 0)) {
        throw new TypeError('Profile private receipt identity is outside the Story recovery contract');
      }
      if (receiptMatchIds.has(item.matchId) || item.ordinal <= previousOrdinal) {
        throw new RangeError('Profile match receipt ordering or identity is invalid');
      }
      receiptMatchIds.add(item.matchId);
      previousOrdinal = item.ordinal;
      // The private bearer proves Profile replay identity but is deliberately
      // discarded at the Story boundary. Story binds only the immutable match,
      // activity, ordinal and disposition and never journals the bearer.
      var normalized = freeze({
        schema: item.schema,
        version: item.version,
        matchId: item.matchId,
        activityId: item.activityId,
        ordinal: item.ordinal,
        resolution: item.resolution,
      });
      normalizedValues.push(normalized);
      byMatchId.set(normalized.matchId, normalized);
    }
    return freeze({ values: normalizedValues, byMatchId: byMatchId });
  }

  function storyFinalizationBinding(profileInput, requestInput) {
    var profile = object(profileInput);
    var request = object(requestInput);
    var lineageId = exactProfileLineage(profile);
    if (request.activityId === 'rival-board') {
      return freeze({ profileLineageId: lineageId, receiptOrdinal: null });
    }
    if (request.activityId !== 'story') {
      throw new RangeError('Only Story activities may bind a Story finalization');
    }
    var receipt = exactProfileReceipts(profile).byMatchId.get(request.matchId) || null;
    if (receipt) {
      if (receipt.activityId !== 'story' || receipt.resolution !== 'consumed') {
        throw new Error('Profile match receipt contradicts the Story finalization');
      }
      return freeze({ profileLineageId: lineageId, receiptOrdinal: receipt.ordinal });
    }
    var active = object(profile.activeMatchReservation);
    if (active.schema !== 'MatchClaimTokenV1' || active.version !== 1 ||
        active.lineageId !== lineageId || active.matchId !== request.matchId ||
        active.activityId !== 'story' ||
        !Number.isSafeInteger(active.ordinal) || active.ordinal < 1) {
      throw new Error('Story finalization lacks its exact active Profile reservation');
    }
    return freeze({ profileLineageId: lineageId, receiptOrdinal: active.ordinal });
  }

  function requireFinalizationCleared(storyStore, matchId) {
    if (storyStore.clearFinalization(matchId) !== true) {
      throw new Error('Story finalization cleanup is pending; retry finalization');
    }
  }

  function recoverPendingStoryFinalization(storyStore, rewardAuthority) {
    var pending = storyStore.pendingFinalization();
    if (!pending) return freeze({ recovered: false, pending: false });
    var profile = object(rewardAuthority.earnedSnapshot());
    var lineageId = exactProfileLineage(profile);
    if (lineageId !== pending.profileLineageId) {
      throw new Error('Pending Story finalization belongs to another Profile lineage');
    }
    var receipt = exactProfileReceipts(profile).byMatchId.get(pending.matchId) || null;
    storyStore.assertFinalizationCurrent(pending, profile);
    if (pending.activityId === 'story') {
      if (receipt) {
        if (receipt.schema !== 'MatchReceiptV1' || receipt.version !== 1 ||
            receipt.activityId !== 'story' ||
            receipt.ordinal !== pending.receiptOrdinal ||
            (receipt.resolution !== 'consumed' && receipt.resolution !== 'abandoned')) {
          throw new Error('Profile match receipt contradicts the pending Story finalization');
        }
        if (receipt.resolution === 'consumed') {
          storyStore.assertFinalizationEvidence(pending, profile);
          storyStore.reconcileProfile(profile);
          storyStore.commitResolution({ schema: 'StoryResolutionV1',
            state: pending.candidateState }, profile);
          requireFinalizationCleared(storyStore, pending.matchId);
          return freeze({ recovered: true, pending: false, matchId: pending.matchId });
        }
        requireFinalizationCleared(storyStore, pending.matchId);
        return freeze({ recovered: false, pending: false, abandoned: true,
          matchId: pending.matchId });
      }
      var active = object(profile.activeMatchReservation);
      if (active.matchId === pending.matchId && active.activityId === 'story') {
        if (active.lineageId !== pending.profileLineageId ||
            active.ordinal !== pending.receiptOrdinal) {
          throw new Error('Active Profile reservation contradicts the pending Story finalization');
        }
        var abandoned = rewardAuthority.abandonMatch(active,
          'story-finalization-not-profile-committed');
        if (!abandoned || (abandoned.applied !== true && abandoned.reason !== 'duplicate')) {
          throw new Error('Pending Story reservation could not be safely abandoned');
        }
      }
      // No immutable consumed receipt means the Profile transaction never
      // committed. Discarding the intent preserves the fail-closed reward boundary.
      requireFinalizationCleared(storyStore, pending.matchId);
      return freeze({ recovered: false, pending: false, discarded: true,
        matchId: pending.matchId });
    }

    var rewardedRivalValues = profile.rewardedRivalIds == null ? [] : profile.rewardedRivalIds;
    var rewardedActValues = profile.rewardedActIds == null ? [] : profile.rewardedActIds;
    if (!Array.isArray(rewardedRivalValues) || rewardedRivalValues.length > 12 ||
        !Array.isArray(rewardedActValues) || rewardedActValues.length > 4) {
      throw new TypeError('Profile Story reward evidence exceeds its canonical bound');
    }
    var knownRivals = new Set(Story.chapters.map(function (chapter) { return chapter.rivalId; }));
    var rewardedRivals = new Set();
    rewardedRivalValues.forEach(function (id) {
      if (typeof id !== 'string' || !knownRivals.has(id) || rewardedRivals.has(id)) {
        throw new TypeError('Profile rival reward evidence is invalid');
      }
      rewardedRivals.add(id);
    });
    var rewardedActs = new Set();
    rewardedActValues.forEach(function (id) {
      if (typeof id !== 'string' || !/^[1-4]$/.test(id) || rewardedActs.has(id)) {
        throw new TypeError('Profile act reward evidence is invalid');
      }
      rewardedActs.add(id);
    });
    var componentProof = pending.rewardClaimIds.length > 0 &&
      pending.rewardClaimIds.every(function (claimId) {
        var rival = /^rival\.([^.]+)\.first-clear$/.exec(claimId);
        if (rival) return rewardedRivals.has(rival[1]);
        var act = /^story\.act\.([1-4])\.first-clear$/.exec(claimId);
        return !!act && rewardedActs.has(act[1]);
      });
    if (componentProof) {
      storyStore.assertFinalizationEvidence(pending, profile);
      storyStore.reconcileProfile(profile);
      storyStore.commitResolution({ schema: 'StoryResolutionV1',
        state: pending.candidateState }, profile);
      requireFinalizationCleared(storyStore, pending.matchId);
      return freeze({ recovered: true, pending: false, matchId: pending.matchId });
    }
    requireFinalizationCleared(storyStore, pending.matchId);
    return freeze({ recovered: false, pending: false, discarded: true,
      matchId: pending.matchId });
  }

  function createStoryRuntime(options) {
    var opts = object(options);
    var profileStore = opts.progressionRuntime || opts.profileReader || opts.profileStore || Profile;
    if (!profileStore || typeof profileStore.snapshot !== 'function') {
      throw new TypeError('A read-only v1.12 progression projection is required');
    }
    var privateAuthoritySource = opts.rewardAuthority || opts.profileStore ||
      (typeof profileStore.claimStoryMatchResolution === 'function' ? profileStore : null);
    var rewardAuthority = createStableRewardAuthority(privateAuthoritySource);
    function earnedProfileSnapshot() {
      return rewardAuthority.earnedSnapshot();
    }
    var browserStorage = null;
    try { browserStorage = root && root.localStorage ? root.localStorage : null; } catch (_) {}
    var storyStore = opts.storyStore || createStoryStateStore({
      storage: opts.storage || browserStorage, initialState: opts.initialStoryState,
    });
    var finalizationRecovery = recoverPendingStoryFinalization(storyStore, rewardAuthority);
    if (typeof storyStore.ensureDurable !== 'function') {
      throw new TypeError('Story runtime requires a durable StoryStateStoreV1');
    }
    storyStore.ensureDurable();
    storyStore.reconcileProfile(earnedProfileSnapshot());
    storyStore.discoverLevel(earnedProfileSnapshot().flipLevel);
    var registry = opts.registry || Activity.createActivityRegistry();
    registerStoryActivities(registry, { storyStore: storyStore });

    function transaction(command, rewardContext) {
      var resolution = command.activityResolution;
      var context = object(command.request.activityContext);
      var authority = object(rewardContext);
      var replay = context.storyReplay === true;
      var rewardRecovery = context.rewardRecovery === true;
      if (authority.reserved === true &&
          (resolution.abandoned === true || resolution.duplicate === true ||
            (replay && !rewardRecovery) ||
            authority.rewardsEligible !== true)) {
        authority.abandon(resolution.abandoned === true ? 'abandoned'
          : (resolution.duplicate === true ? 'duplicate' : (replay ? 'replay' : 'test-data')));
      }
      var shouldJournal = authority.canonicalClaimsAllowed === true &&
        resolution.abandoned !== true && resolution.duplicate !== true &&
        (command.request.activityId === 'story' ||
          (command.request.activityId === 'rival-board' &&
            Array.isArray(resolution.rewards) && resolution.rewards.length > 0));
      var preparedFinalization = null;
      if (shouldJournal) {
        var profileBeforeClaim = earnedProfileSnapshot();
        preparedFinalization = storyStore.prepareFinalization(command.request, resolution,
          storyFinalizationBinding(profileBeforeClaim, command.request), profileBeforeClaim);
      }
      var commands = createProfileCommands(command, authority);
      var commandResults = executeProfileCommands(profileStore, commands, authority);
      var earnedAfter = earnedProfileSnapshot();
      if (preparedFinalization) {
        storyStore.assertFinalizationEvidence(preparedFinalization, earnedAfter);
      }
      storyStore.reconcileProfile(earnedAfter);
      // Story and rival progression is itself a reward.  Only the coordinator's
      // positive canonical-claim authority may advance it; replay, owner/test,
      // import, AI-only, unmanaged, and unknown activities all deny by default.
      var storyStateBlocked = authority.canonicalClaimsAllowed !== true;
      var stateResult = resolution.abandoned === true || storyStateBlocked
        ? freeze({ applied: false, duplicate: false, reason: 'abandoned', state: storyStore.snapshot() })
        : storyStore.commitResolution(resolution, earnedAfter);
      if (shouldJournal) requireFinalizationCleared(storyStore, command.matchId);
      var duplicate = resolution.duplicate === true || stateResult.duplicate === true;
      var presentation = View.postMatch({ resolution: resolution, replay: replay });
      return freeze({
        schema: 'StoryProfileTransactionV1', duplicate: duplicate,
        replay: replay, noRewardsReason: duplicate ? 'duplicate'
          : (replay && !rewardRecovery ? 'replay' : (authority.noRewardsReason || null)),
        profileCommands: commands, commandResults: commandResults,
        storyState: stateResult.state, storyCommit: stateResult,
        presentation: presentation,
      });
    }

    var coordinator = Activity.createMatchSessionCoordinator({
      registry: registry,
      transaction: transaction,
      rewardAuthority: rewardAuthority,
      statsSink: typeof opts.statsSink === 'function' ? opts.statsSink : function () {},
    });
    var activeMatchIds = new Set();

    function createMatchRequest(input) {
      return buildRequest({ input: input, storyStore: storyStore, profileStore: profileStore });
    }
    function start(input) {
      if (activeMatchIds.size) {
        throw new Error('Finish or leave the active Story match before starting another');
      }
      var request = createMatchRequest(input);
      var session = coordinator.start(request);
      activeMatchIds.add(request.matchId);
      return session;
    }
    function finalize(outcome) {
      var matchId = nonEmpty(object(outcome).matchId, 'matchId');
      return coordinator.finalize(outcome).then(function (resolution) {
        activeMatchIds.delete(matchId);
        return resolution;
      });
    }
    function abandon(matchId, reason) {
      var result = coordinator.abandon(matchId, reason);
      activeMatchIds.delete(String(matchId));
      return result;
    }
    function views() {
      var state = storyStore.snapshot();
      var profile = profileStore.snapshot();
      return freeze({
        hub: View.storyHub(state),
        rivalBoard: View.rivalBoard({ storyState: state }),
        fieldNotes: View.fieldNotes({ profile: profile }),
        alienGate: View.alienGate({ storyState: state, profile: profile }),
      });
    }

    return freeze({
      schema: 'StoryRuntimeV1',
      finalizationRecovery: clone(finalizationRecovery),
      story: freeze({ schema: 'StoryStateProjectionV1', snapshot: function () {
        return storyStore.snapshot();
      } }),
      profile: freeze({ schema: 'StoryProfileProjectionV1', snapshot: function () {
        return publicProfileProjection(profileStore.snapshot());
      } }),
      createMatchRequest: createMatchRequest, start: start,
      finalize: finalize, abandon: abandon, views: views,
      discoverForCurrentLevel: function () {
        return storyStore.discoverLevel(earnedProfileSnapshot().flipLevel);
      },
    });
  }

  // The browser receives a prewired facade from the eventual live composition
  // boundary. Exposing this dependency-injection constructor would let any
  // page script supply a structural fake reward authority and write the shared
  // Story storage outside that boundary.
  var safeApi = { schema: 'StoryRuntimeV1' };
  if (commonJs) Object.assign(safeApi, {
    createStoryRuntime: createStoryRuntime,
    storageKey: STORY_STORAGE_KEY,
    createStoryStateStore: createStoryStateStore,
    registerStoryActivities: registerStoryActivities,
    validateStoryMatchRequest: validateStoryMatchRequest,
    buildRequest: buildRequest,
    createProfileCommands: createProfileCommands,
  });
  return freeze(safeApi);
});
