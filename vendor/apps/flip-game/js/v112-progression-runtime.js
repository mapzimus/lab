// v112-progression-runtime.js -- one live V4 ownership, reveal, and owner-test boundary.
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
      Object.prototype.hasOwnProperty.call(root, 'FlipgameV112ProgressionRuntime')) {
    throw new Error('FlipgameV112ProgressionRuntime is already defined; refusing an ambiguous browser runtime');
  }
  var Catalog = root && root.FlipgameV112ProgressionCatalog;
  var Economy = root && root.FlipgameV112Economy;
  var Profile = root && root.FlipgameV112Profile;
  var Backup = root && root.FlipgameV112ProfileBackup;
  if (commonJs) {
    Catalog = module.require('./v112-progression-catalog.js');
    Economy = module.require('./v112-economy.js');
    Profile = module.require('./v112-profile.js');
    try { Backup = module.require('./v112-profile-backup.js'); } catch (_) { Backup = null; }
  }
  var api = factory(Catalog, Economy, Profile, Backup, root, commonJs);
  if (commonJs) {
    module.exports = api;
  } else if (root) {
    Object.defineProperty(root, 'FlipgameV112ProgressionRuntime', {
      value: api, enumerable: true, writable: false, configurable: false,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Catalog, Economy, Profile, Backup, root, commonJs) {
  'use strict';
  if (!Catalog || !Economy || !Profile) {
    throw new Error('v1.12 catalog, economy, and profile must load before progression runtime');
  }

  var OWNER_CODE = 'Howe Test Mode';
  var WRITER_LOCK_NAME = 'flipgame.profile.v4.writer';
  var WRITER_COORDINATION = Object.freeze({
    schema: 'ProfileWriterCoordinationV1', version: 1,
    lockName: WRITER_LOCK_NAME,
    lifetimeExclusive: true,
    supportedAdapter: 'web-locks',
    adapterInterface: 'request(name, options, callback) with exclusive lifetime ownership',
    androidAdapter: 'required-not-implemented',
    statuses: Object.freeze(['acquiring', 'queued', 'active', 'unavailable', 'closed']),
  });
  var LIVE_WRITER_CAPABILITIES = new WeakSet();
  var LOCKED = Object.freeze({ locked: true, symbol: '🔒', ariaLabel: 'Locked' });
  var FEATURE_NAMES = Object.freeze({
    'physics-lab': 'Physics Lab',
    alien: 'Alien',
    'insane-mode': 'INSANE MODE',
  });
  var ACTIVITY_IDS = new Set(['free-play', 'story', 'rival-board', 'practice', 'physics-lab', 'tutorial']);
  var OWNER_INTEGRATION = freeze({
    schema: 'OwnerTestIntegrationV1', version: 1,
    defaultActivityId: 'practice',
    registeredActivityIds: Array.from(ACTIVITY_IDS),
    storyInjectionRequired: true,
    matchReservationRequired: true,
    rule: 'MatchSessionCoordinator must reserve then consume/abandon one MatchClaimTokenV1. Story and Rival Board must receive this runtime (not the raw profile store) and validate the issued owner guard before resolution.',
  });

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }
  function publicRuntimeProjection(value) {
    var active = new Set();
    var nodes = 0;
    function project(input, depth) {
      if (input == null || typeof input === 'string' || typeof input === 'boolean' ||
          typeof input === 'undefined') return input;
      if (typeof input === 'number') {
        if (!Number.isFinite(input)) throw new TypeError('Public progression value is non-finite');
        return input;
      }
      if (typeof input !== 'object') {
        throw new TypeError('Public progression value contains an unsupported type');
      }
      if (depth > 24 || ++nodes > 10000) {
        throw new RangeError('Public progression projection exceeds its data bound');
      }
      if (active.has(input)) throw new TypeError('Public progression values cannot be cyclic');
      var names;
      try { names = Object.getOwnPropertyNames(input); }
      catch (_) { throw new TypeError('Public progression value is unreadable'); }
      var schemaDescriptor = names.indexOf('schema') >= 0
        ? Object.getOwnPropertyDescriptor(input, 'schema') : null;
      if (schemaDescriptor && Object.prototype.hasOwnProperty.call(schemaDescriptor, 'value') &&
          schemaDescriptor.value === 'MatchClaimTokenV1') return null;
      active.add(input);
      var output;
      if (Array.isArray(input)) {
        names.forEach(function (key) {
          if (key === 'length') return;
          if (!/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= input.length) {
            throw new TypeError('Public progression arrays must be dense data arrays');
          }
        });
        output = [];
        for (var index = 0; index < input.length; index++) {
          var itemDescriptor = Object.getOwnPropertyDescriptor(input, String(index));
          if (!itemDescriptor || !Object.prototype.hasOwnProperty.call(itemDescriptor, 'value')) {
            throw new TypeError('Public progression arrays cannot contain accessors or holes');
          }
          output.push(project(itemDescriptor.value, depth + 1));
        }
      } else {
        output = {};
        names.forEach(function (key) {
          if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
            throw new TypeError('Public progression value contains an unsafe key');
          }
          var descriptor = Object.getOwnPropertyDescriptor(input, key);
          if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
            throw new TypeError('Public progression values cannot contain accessors');
          }
          if (key === 'token' || key === 'nonce' || key === 'bearerNonce' ||
              key === 'reservedAt') return;
          if (key === 'activeMatchReservation') {
            output.activeMatchReservation = null;
            return;
          }
          output[key] = project(descriptor.value, depth + 1);
        });
        if (Object.prototype.hasOwnProperty.call(output, 'matchClaimCursor') &&
            Object.prototype.hasOwnProperty.call(output, 'consumedMatchOrdinal')) {
          output.matchClaimCursor = output.consumedMatchOrdinal;
        }
      }
      active.delete(input);
      return output;
    }
    return freeze(project(value, 0));
  }
  function unique(values) {
    var seen = new Set();
    return (Array.isArray(values) ? values : []).map(String).filter(function (id) {
      if (!id || seen.has(id)) return false;
      seen.add(id); return true;
    });
  }
  function noMutation(state, reason, extra) {
    return freeze(Object.assign({ applied: false, duplicate: false, claimId: null,
      reason: reason, testData: reason === 'owner-test-mode', state: state }, extra || {}));
  }
  function lockedView() { return LOCKED; }

  function createRuntime(options) {
    var opts = options || {};
    var store = opts.profileStore;
    if (!store || typeof store.snapshot !== 'function' || typeof store.subscribe !== 'function') {
      throw new TypeError('progression runtime requires one authoritative V4 profile store');
    }
    var writerControl = opts.writerControl || { status: 'test-writer', capability: null };
    var testOnly = opts.testOnly === true;
    var backup = opts.backupAdapter || Backup;
    var ownerActive = false;
    var ownerGeneration = 0;
    var listeners = new Set();
    var issuedGuards = new WeakSet();
    var notificationQueue = [];
    var deliveringNotifications = false;
    var runtimeClosed = false;
    var detach = store.subscribe(function (state, result) {
      emit({ type: 'profile-commit', result: publicRuntimeProjection(result),
        earnedState: publicProfileProjection(state) });
    });

    function writerStatus() {
      var status = String(writerControl.status || 'read-only');
      return freeze({ writable: testOnly || (status === 'active' &&
        LIVE_WRITER_CAPABILITIES.has(writerControl.capability)), status: status,
        reason: writerControl.reason || null });
    }
    function writableMutation() {
      var status = writerStatus();
      return status.writable ? null : noMutation(earnedSnapshot(),
        ['acquiring', 'queued', 'busy'].indexOf(status.status) >= 0
          ? 'writer-busy' : 'writer-read-only',
        { writerStatus: status.status });
    }

    function privateSnapshot() { return store.snapshot(); }
    function publicProfileProjection(value) {
      return publicRuntimeProjection(value || privateSnapshot());
    }
    function earnedSnapshot() { return publicProfileProjection(privateSnapshot()); }
    function isObjectAvailable(id) {
      var objectId = Catalog.canonicalObjectId(id);
      if (!Catalog.object(objectId)) return false;
      if (ownerActive) return true;
      var state = earnedSnapshot();
      if (objectId === 'alien') return Profile.isAlienUsable(state);
      return state.ownedObjectIds.indexOf(objectId) >= 0;
    }
    function isArenaAvailable(id) {
      var arenaId = Catalog.canonicalArenaId(id);
      return !!Catalog.arena(arenaId) && (ownerActive || earnedSnapshot().ownedArenaIds.indexOf(arenaId) >= 0);
    }
    function isCosmeticAvailable(id) {
      return !!Catalog.storeCosmetic(id) &&
        (ownerActive || earnedSnapshot().ownedCosmeticIds.indexOf(String(id)) >= 0);
    }
    function isFeatureAvailable(id) {
      var featureId = String(id || '');
      if (!FEATURE_NAMES[featureId]) return false;
      if (ownerActive) return true;
      var state = earnedSnapshot();
      if (featureId === 'alien') return Profile.isAlienUsable(state);
      if (featureId === 'insane-mode') return Profile.isInsaneUsable(state);
      return state.featureIds.indexOf(featureId) >= 0;
    }
    function effectiveSnapshot() {
      var earned = earnedSnapshot();
      if (!ownerActive) return earned;
      return freeze(Object.assign({}, clone(earned), {
        ownerTestMode: true,
        testData: true,
        rewardsEligible: false,
        ownedObjectIds: Catalog.objectIds.slice(),
        ownedArenaIds: Catalog.arenaIds.slice(),
        ownedCosmeticIds: Catalog.storeCosmetics.map(function (item) { return item.id; }),
        featureIds: unique(earned.featureIds.concat(['physics-lab', 'insane-mode'])),
      }));
    }
    function objectView(entry) {
      if (!isObjectAvailable(entry.id)) return lockedView();
      return freeze({ locked: false, id: entry.id, displayName: entry.displayName,
        ariaLabel: entry.displayName,
        variants: Catalog.variantIdsFor(entry.id).map(function (id) {
          var item = Catalog.variant(entry.id, id);
          return freeze({ locked: false, id: item.id, objectId: item.objectId,
            variantId: item.variantId, displayName: item.displayName,
            color: item.color, ariaLabel: item.displayName });
        }) });
    }
    function viewObject(id) {
      var entry = Catalog.object(id);
      return entry ? objectView(entry) : null;
    }
    function listObjects() {
      return freeze(Catalog.objects.map(objectView));
    }
    function viewVariant(id) {
      var canonical = Catalog.canonicalVariantId(id);
      var split = canonical.indexOf('.');
      if (split < 0) return null;
      var objectId = canonical.slice(0, split);
      var item = Catalog.variant(objectId, canonical);
      if (!item) return null;
      return isObjectAvailable(objectId) ? freeze({ locked: false, id: item.id,
        objectId: item.objectId, variantId: item.variantId,
        displayName: item.displayName, color: item.color, ariaLabel: item.displayName }) : lockedView();
    }
    function arenaView(entry) {
      if (!isArenaAvailable(entry.id)) return lockedView();
      return freeze({ locked: false, id: entry.id, displayName: entry.displayName,
        ariaLabel: entry.displayName });
    }
    function viewArena(id) {
      var entry = Catalog.arena(id);
      return entry ? arenaView(entry) : null;
    }
    function listArenas() {
      return freeze(Catalog.arenaIds.map(function (id) { return arenaView(Catalog.arena(id)); }));
    }
    function viewFeature(id) {
      var featureId = String(id || '');
      if (!FEATURE_NAMES[featureId]) return null;
      if (!isFeatureAvailable(featureId)) return lockedView();
      return freeze({ locked: false, id: featureId, displayName: FEATURE_NAMES[featureId],
        ariaLabel: FEATURE_NAMES[featureId] });
    }
    function viewStore() {
      var state = earnedSnapshot();
      return freeze(Catalog.storeCosmetics.map(function (item) {
        var owned = isCosmeticAvailable(item.id);
        return freeze({ id: item.id, type: item.type, displayName: item.displayName,
          price: item.price, currency: item.currency, owned: owned,
          affordable: ownerActive || owned || state.fcBalance >= item.price });
      }));
    }
    function ownerProjection() {
      if (!ownerActive) return null;
      var variantsByObject = {};
      var variantIds = [];
      Catalog.objectIds.forEach(function (id) {
        variantsByObject[id] = Catalog.variantIdsFor(id);
        variantIds = variantIds.concat(variantsByObject[id]);
      });
      return freeze({ schema: 'OwnerTestProjectionV1', version: 1,
        active: true, ephemeral: true, testData: true, rewardsEligible: false,
        statisticsDefaultIncluded: false, achievementPreviewOnly: true,
        objectIds: Catalog.objectIds.slice(), variantIds: variantIds,
        variantsByObject: variantsByObject, arenaIds: Catalog.arenaIds.slice(),
        cosmeticIds: Catalog.storeCosmetics.map(function (item) { return item.id; }),
        featureIds: ['physics-lab', 'alien', 'insane-mode'],
        counts: { objects: Catalog.objectIds.length, variants: variantIds.length,
          arenas: Catalog.arenaIds.length, cosmetics: Catalog.storeCosmetics.length },
      });
    }
    function activityPolicy(input) {
      var source = input && typeof input === 'object'
        ? publicRuntimeProjection(input) : freeze({});
      if (!ownerActive) return source;
      var activityId = source.activityId == null ? OWNER_INTEGRATION.defaultActivityId : source.activityId;
      if (typeof activityId !== 'string' || !ACTIVITY_IDS.has(activityId)) {
        throw new RangeError('Owner test activity must be a registered ActivityRegistry identity');
      }
      var guard = Object.freeze({ schema: 'OwnerTestGuardV1', version: 1,
        activityId: activityId, generation: ownerGeneration,
        testData: true, rewardsEligible: false });
      issuedGuards.add(guard);
      return freeze(Object.assign({}, source, {
        activityId: activityId,
        ownerTest: true, ownerTestMode: true, testData: true,
        rewardsEligible: false, progressionEligible: false,
        achievementsEligible: false, statisticsDefaultIncluded: false,
        ownerTestGuard: guard,
        storyRuntimeInjectionRequired: activityId === 'story' || activityId === 'rival-board',
      }));
    }
    function validateOwnerTestGuard(guard, activityId) {
      // A guard binds the session to Test Data permanently.  Toggling the
      // owner preview off must not strand a match that already started, and
      // retaining this negative-only capability can never make rewards
      // eligible.  Object identity still prevents a structural forgery.
      return !!guard && typeof guard === 'object' && issuedGuards.has(guard) &&
        typeof activityId === 'string' && ACTIVITY_IDS.has(activityId) && guard.activityId === activityId &&
        Number.isSafeInteger(guard.generation) && guard.generation >= 0 &&
        guard.testData === true && guard.rewardsEligible === false;
    }
    function emit(event) {
      notificationQueue.push({ snapshot: effectiveSnapshot(),
        event: publicRuntimeProjection(Object.assign({ ownerTestMode: ownerActive }, event)) });
      if (deliveringNotifications) return;
      deliveringNotifications = true;
      try {
        while (notificationQueue.length) {
          var deliveryEvent = notificationQueue.shift();
          var delivery = Array.from(listeners);
          delivery.forEach(function (listener) {
            try { listener(deliveryEvent.snapshot, deliveryEvent.event); } catch (_) {}
          });
        }
      } finally { deliveringNotifications = false; }
    }
    function subscribe(listener, options) {
      if (typeof listener !== 'function') throw new TypeError('progression subscriber must be a function');
      if (!deliveringNotifications && (!options || options.emitCurrent !== false)) {
        listener(effectiveSnapshot(), freeze({ type: 'current', ownerTestMode: ownerActive }));
      }
      listeners.add(listener);
      return function () { listeners.delete(listener); };
    }
    writerControl.notifyStatus = function () {
      emit({ type: 'writer-status', writerStatus: writerStatus(),
        earnedState: earnedSnapshot() });
    };
    function activateOwnerTestMode(value) {
      if (typeof value !== 'string' || value !== OWNER_CODE) {
        return freeze({ activated: false, reason: 'exact-code-required', active: ownerActive });
      }
      if (!ownerActive) {
        ownerGeneration++;
        ownerActive = true;
        emit({ type: 'owner-test-activated' });
      }
      return freeze({ activated: true, active: true, projection: ownerProjection() });
    }
    function deactivateOwnerTestMode() {
      var changed = ownerActive;
      ownerActive = false;
      if (changed) ownerGeneration++;
      if (changed) emit({ type: 'owner-test-deactivated' });
      return freeze({ deactivated: changed, active: false });
    }
    function blocked() { return noMutation(earnedSnapshot(), 'owner-test-mode'); }
    function mutationBlock() { return ownerActive ? blocked() : writableMutation(); }
    function reserveMatch(matchId, activityId) {
      var denied = mutationBlock();
      return denied || store.reserveMatch(matchId, activityId);
    }
    function resumeMatchReservation() {
      return ownerActive ? null : store.resumeMatchReservation();
    }
    function claimMatch(matchToken, rewardInput) {
      var denied = mutationBlock();
      return denied || store.consumeReservedMatch(matchToken, rewardInput);
    }
    function abandonMatch(matchToken, reason) {
      var denied = mutationBlock();
      return denied || store.abandonReservedMatch(matchToken, reason);
    }
    function claimAchievement(id, rarity) {
      var denied = mutationBlock();
      return denied || store.claimAchievement(id, rarity);
    }
    function claimRivalVictory(id, claimId) {
      var denied = mutationBlock();
      return denied || store.claimRivalVictory(id, claimId);
    }
    function claimStoryAct(id, noteId, claimId) {
      var denied = mutationBlock();
      return denied || store.claimStoryAct(id, noteId, claimId);
    }
    function claimStoryReward(reward) {
      var denied = mutationBlock();
      return denied || store.claimStoryReward(reward);
    }
    function claimStoryMatchResolution(resolution) {
      var denied = mutationBlock();
      return denied || store.claimStoryMatchResolution(resolution);
    }
    function purchaseCosmetic(id) {
      var denied = mutationBlock();
      return denied || store.purchaseCosmetic(id);
    }
    function revealDescriptor(id) {
      var value = String(id || '');
      var match = /^level\.(\d+)\.fc$/.exec(value);
      if (match) return freeze({ id: value, type: 'fc', level: Number(match[1]),
        amount: Catalog.levelFc[match[1]] || 0, displayName: 'Flip Credits' });
      if (value.indexOf('object.') === 0) {
        var object = Catalog.object(value.slice(7));
        return object ? freeze({ id: value, type: 'object', contentId: object.id,
          level: object.level, displayName: object.displayName }) : null;
      }
      if (value.indexOf('arena.') === 0) {
        var arena = Catalog.arena(value.slice(6));
        return arena ? freeze({ id: value, type: 'arena', contentId: arena.id,
          level: arena.level, displayName: arena.displayName }) : null;
      }
      if (value.indexOf('feature.') === 0) {
        var featureId = value.slice(8);
        return FEATURE_NAMES[featureId] ? freeze({ id: value, type: 'feature',
          contentId: featureId, level: featureId === 'physics-lab' ? 50 : 100,
          displayName: FEATURE_NAMES[featureId] }) : null;
      }
      if (value.indexOf('achievement.') === 0) return freeze({ id: value,
        type: 'achievement', contentId: value.slice(12), displayName: 'Achievement earned' });
      if (value.indexOf('store.') === 0) {
        var cosmetic = Catalog.storeCosmetic(value.slice(6));
        return cosmetic ? freeze({ id: value, type: 'store', contentId: cosmetic.id,
          displayName: cosmetic.displayName }) : null;
      }
      return freeze({ id: value, type: 'reward', displayName: 'Reward available' });
    }
    function pendingReveals() {
      var state = earnedSnapshot();
      return freeze(state.pendingRevealIds.map(revealDescriptor).filter(Boolean));
    }
    function dismissReveal(id) {
      var denied = mutationBlock();
      if (denied) return denied;
      return store.dismissReveals([id]);
    }
    function dismissAllReveals() {
      var denied = mutationBlock();
      if (denied) return denied;
      return store.dismissReveals();
    }
    function exportBackup(setupSelection, options) {
      if (!backup || typeof backup.serialize !== 'function') throw new Error('v1.12 profile backup is unavailable');
      return backup.serialize(store, setupSelection, options);
    }
    function importBackup(value, currentSetup, options) {
      var denied = mutationBlock();
      if (denied) return denied;
      if (!backup || typeof backup.importInto !== 'function') throw new Error('v1.12 profile backup is unavailable');
      return backup.importInto(value, store, currentSetup, options);
    }
    function publicRefresh() {
      store.refresh();
      return earnedSnapshot();
    }
    function publicStoreResult(method, args) {
      return publicRuntimeProjection(method.apply(null, args || []));
    }
    function close() {
      if (runtimeClosed) return;
      runtimeClosed = true;
      if (typeof opts.onClose === 'function') opts.onClose();
      if (typeof detach === 'function') detach();
      listeners.clear(); ownerActive = false;
    }

    var rewardAuthority = {
      snapshot: privateSnapshot, earnedSnapshot: privateSnapshot,
      activityPolicy: activityPolicy, validateOwnerTestGuard: validateOwnerTestGuard,
      reserveMatch: reserveMatch, resumeMatchReservation: resumeMatchReservation,
      claimMatch: claimMatch, abandonMatch: abandonMatch,
      claimAchievement: claimAchievement,
      claimStoryMatchResolution: claimStoryMatchResolution,
    };
    if (testOnly) Object.assign(rewardAuthority, {
      claimRivalVictory: claimRivalVictory, claimStoryAct: claimStoryAct,
      claimStoryReward: claimStoryReward,
    });
    rewardAuthority = freeze(rewardAuthority);
    if (typeof opts.installRewardAuthority === 'function') {
      opts.installRewardAuthority(rewardAuthority);
    }
    var runtimeApi = {
      schema: 'ProgressionRuntimeV1', version: 1,
      snapshot: effectiveSnapshot, earnedSnapshot: earnedSnapshot,
      refresh: publicRefresh, subscribe: subscribe, close: close,
      writerStatus: writerStatus,
      listObjects: listObjects, viewObject: viewObject, viewVariant: viewVariant,
      listArenas: listArenas, viewArena: viewArena, viewFeature: viewFeature,
      viewStore: viewStore, isObjectAvailable: isObjectAvailable,
      isArenaAvailable: isArenaAvailable, isCosmeticAvailable: isCosmeticAvailable,
      isFeatureAvailable: isFeatureAvailable,
      activateOwnerTestMode: activateOwnerTestMode,
      deactivateOwnerTestMode: deactivateOwnerTestMode,
      ownerProjection: ownerProjection, activityPolicy: activityPolicy,
      validateOwnerTestGuard: validateOwnerTestGuard,
      ownerTestIntegration: OWNER_INTEGRATION,
      purchaseCosmetic: function (id) {
        return publicStoreResult(purchaseCosmetic, [id]);
      },
      pendingReveals: pendingReveals,
      dismissReveal: function (id) {
        return publicStoreResult(dismissReveal, [id]);
      },
      dismissAllReveals: function () {
        return publicStoreResult(dismissAllReveals);
      },
      exportState: earnedSnapshot, exportBackup: exportBackup,
      importBackup: function (value, currentSetup, options) {
        return publicStoreResult(importBackup, [value, currentSetup, options]);
      },
    };
    if (testOnly) {
      // Test runtimes expose the mutation verbs used by headless fixtures,
      // but must retain the same public/effective projection as production.
      // In particular, never overwrite snapshot() with the private earned
      // snapshot or Owner Test Data would disappear from activity policy.
      [
        'reserveMatch', 'resumeMatchReservation', 'claimMatch', 'abandonMatch',
        'claimAchievement', 'claimStoryMatchResolution', 'claimRivalVictory',
        'claimStoryAct', 'claimStoryReward',
      ].forEach(function (name) {
        runtimeApi[name] = function () {
          return publicStoreResult(rewardAuthority[name], Array.prototype.slice.call(arguments));
        };
      });
    }
    return freeze(runtimeApi);
  }

  function createTestRuntime(options) {
    return createRuntime(Object.assign({}, options || {}, { testOnly: true,
      writerControl: { status: 'test-writer', capability: null } }));
  }

  function beginLiveRuntime(options) {
    var opts = options || {};
    var lockManager = opts.lockManager;
    var setWriterEnabled = typeof opts.setWriterEnabled === 'function'
      ? opts.setWriterEnabled : function () {};
    var writer = { status: 'acquiring', reason: null, capability: null,
      release: null, closed: false };
    var resolveReady;
    var ready = new Promise(function (resolve) { resolveReady = resolve; });
    var settled = false;
    var abortController = null;
    var AbortCtor = opts.AbortController;
    if (typeof AbortCtor !== 'function') {
      try { AbortCtor = root && root.AbortController; } catch (_) { AbortCtor = null; }
    }
    if (typeof AbortCtor === 'function') {
      try { abortController = new AbortCtor(); } catch (_) { abortController = null; }
    }
    function settle() {
      if (settled) return;
      settled = true;
      resolveReady(runtime);
    }
    function publishStatus() {
      if (typeof writer.notifyStatus === 'function') writer.notifyStatus();
    }
    function closeWriter() {
      if (writer.closed) { settle(); return; }
      writer.closed = true;
      setWriterEnabled(false);
      writer.capability = null;
      writer.status = 'closed';
      writer.reason = 'runtime-closed';
      if (abortController && abortController.signal &&
          abortController.signal.aborted !== true) {
        try { abortController.abort(); } catch (_) {}
      }
      var release = writer.release;
      writer.release = null;
      if (typeof release === 'function') release();
      publishStatus();
      settle();
    }
    var runtime = createRuntime({ profileStore: opts.profileStore,
      backupAdapter: opts.backupAdapter || Backup, writerControl: writer,
      installRewardAuthority: opts.installRewardAuthority,
      onClose: closeWriter });
    if (!lockManager || typeof lockManager.request !== 'function') {
      writer.status = 'unavailable';
      writer.reason = 'web-locks-unavailable';
      if (typeof writer.notifyStatus === 'function') writer.notifyStatus();
      settle();
      return { runtime: runtime, ready: ready };
    }
    function requestOptions(source) {
      var output = Object.assign({}, source);
      // Native Web Locks forbid combining signal with a non-blocking probe.
      // The queued request remains abortable; holdLock rejects a late grant
      // after close even when this immediate ifAvailable probe is in flight.
      if (!source.ifAvailable && abortController && abortController.signal) output.signal = abortController.signal;
      return output;
    }
    function fail(error) {
      setWriterEnabled(false);
      writer.capability = null;
      writer.status = writer.closed ? 'closed' : 'unavailable';
      writer.reason = writer.closed ? 'runtime-closed'
        : (error && error.message ? error.message : 'writer-lock-failed');
      publishStatus();
      settle();
    }
    function holdLock(lock) {
      if (!lock || writer.closed) {
        if (writer.closed) {
          writer.status = 'closed';
          writer.reason = 'runtime-closed';
        }
        return undefined;
      }
      // Always reconcile the complete durable profile immediately before this
      // queued tab is allowed to mutate it.
      if (opts.profileStore && typeof opts.profileStore.refresh === 'function') {
        opts.profileStore.refresh();
      }
      if (writer.closed) return undefined;
      if (opts.profileStore && typeof opts.profileStore.persistenceStatus === 'function' &&
          opts.profileStore.persistenceStatus().closed) {
        writer.capability = null;
        writer.status = 'unavailable';
        writer.reason = 'profile-persistence-closed';
        publishStatus();
        settle();
        return undefined;
      }
      if (writer.closed) return undefined;
      writer.capability = Object.freeze({});
      LIVE_WRITER_CAPABILITIES.add(writer.capability);
      writer.status = 'active';
      writer.reason = null;
      setWriterEnabled(true);
      publishStatus();
      settle();
      return new Promise(function (release) {
        writer.release = function () {
          writer.release = null;
          release();
        };
        if (writer.closed) writer.release();
      });
    }
    function queueForLock() {
      if (writer.closed) return;
      writer.status = 'queued';
      writer.reason = 'writer-held-elsewhere';
      publishStatus();
      settle();
      try {
        Promise.resolve(lockManager.request(WRITER_LOCK_NAME,
          requestOptions({ mode: 'exclusive' }), holdLock)).catch(fail);
      } catch (error) { fail(error); }
    }
    try {
      Promise.resolve(lockManager.request(WRITER_LOCK_NAME,
        requestOptions({ mode: 'exclusive', ifAvailable: true }), function (lock) {
          if (lock) return holdLock(lock);
          queueForLock();
          return undefined;
        })).catch(fail);
    } catch (error) {
      setWriterEnabled(false);
      writer.capability = null;
      writer.status = 'unavailable';
      writer.reason = error && error.message ? error.message : 'writer-lock-failed';
      publishStatus();
      settle();
    }
    return { runtime: runtime, ready: ready };
  }

  function acquireLiveRuntime(options) {
    return beginLiveRuntime(options).ready;
  }

  var moduleApi = {
    schema: 'ProgressionRuntimeV1', version: 1,
    liveAvailable: false, writerLockName: WRITER_LOCK_NAME,
    writerCoordination: WRITER_COORDINATION,
    ownerTestIntegration: OWNER_INTEGRATION,
  };
  if (commonJs) {
    var browserLockManager = null;
    try { browserLockManager = root && root.navigator ? root.navigator.locks : null; } catch (_) {}
    var defaultHandle = Profile.connectProductionRuntime(function (connection) {
      return beginLiveRuntime({ profileStore: connection.profileStore,
        setWriterEnabled: connection.setWriterEnabled,
        lockManager: browserLockManager, backupAdapter: Backup });
    });
    moduleApi.liveAvailable = true;
    moduleApi.defaultRuntime = defaultHandle.runtime;
    moduleApi.defaultRuntimeReady = defaultHandle.ready;
    moduleApi.acquireLiveRuntime = acquireLiveRuntime;
    moduleApi.createTestRuntime = createTestRuntime;
  }
  return freeze(moduleApi);
});
