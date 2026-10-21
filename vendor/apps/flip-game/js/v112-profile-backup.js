// v112-profile-backup.js -- checksummed V4 profile/setup export and monotonic import.
(function (root, factory) {
  'use strict';
  if (root && root.FlipgameV112ProfileBackup &&
      root.FlipgameV112ProfileBackup.schema === 'FlipgameProfileBackupV2') {
    if (typeof module === 'object' && module.exports) module.exports = root.FlipgameV112ProfileBackup;
    return;
  }
  var SaveBackup = root && root.FlipgameV111SaveBackup;
  var Profile = root && root.FlipgameV112Profile;
  var Catalog = root && root.FlipgameV112ProgressionCatalog;
  if (typeof module === 'object' && module.exports) {
    SaveBackup = require('./v111-save-backup.js');
    Profile = require('./v112-profile.js');
    Catalog = require('./v112-progression-catalog.js');
  }
  var api = factory(SaveBackup, Profile, Catalog);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112ProfileBackup = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (SaveBackup, Profile, Catalog) {
  'use strict';
  if (!SaveBackup || !Profile || !Catalog) {
    throw new Error('v1.11 backup core and v1.12 profile/catalog must load before profile backup');
  }

  var PAYLOAD_SCHEMA = 'FlipgameLocalSaveV2';
  var PAYLOAD_VERSION = 2;
  var V4_KEY = 'flipgame.profile.v4';
  var SETUP_KEY = 'flipgame.setup.v2';
  var UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
  var SAFE_CLONE_MAX_DEPTH = 64;
  var SAFE_CLONE_MAX_NODES = 100000;
  var PAYLOAD_FIELDS = new Set([
    'schema', 'version', 'profileV4', 'setupSelection', 'sections',
  ]);

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function safeClone(value, context, depth) {
    var tracker = context && context.active instanceof Set ? context : {
      active: new Set(), nodes: 0,
    };
    var level = depth == null ? 0 : depth;
    if (level > SAFE_CLONE_MAX_DEPTH) throw new RangeError('Safe save nesting limit exceeded');
    tracker.nodes++;
    if (tracker.nodes > SAFE_CLONE_MAX_NODES) throw new RangeError('Safe save node limit exceeded');
    if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError('Unsafe non-finite number');
      return value;
    }
    if (typeof value !== 'object') throw new TypeError('Unsafe save value type');
    var prototype = Object.getPrototypeOf(value);
    var crossRealmPlain = !Array.isArray(value) && prototype &&
      Object.getPrototypeOf(prototype) === null;
    if (prototype !== null && prototype !== Object.prototype &&
        !crossRealmPlain && !Array.isArray(value)) {
      throw new TypeError('Unsafe save object prototype');
    }
    if (typeof Object.getOwnPropertySymbols === 'function' &&
        Object.getOwnPropertySymbols(value).length) throw new TypeError('Unsafe save symbol key');
    if (tracker.active.has(value)) throw new TypeError('Cyclic save values are not supported');
    tracker.active.add(value);
    var output;
    if (Array.isArray(value)) {
      if (value.length > SAFE_CLONE_MAX_NODES) throw new RangeError('Safe save array limit exceeded');
      output = [];
      for (var index = 0; index < value.length; index++) {
        var arrayDescriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!arrayDescriptor || !Object.prototype.hasOwnProperty.call(arrayDescriptor, 'value')) {
          throw new TypeError('Sparse or accessor save arrays are not supported');
        }
        output.push(safeClone(arrayDescriptor.value, tracker, level + 1));
      }
    } else {
      output = Object.create(null);
      Object.getOwnPropertyNames(value).forEach(function (key) {
        if (UNSAFE_KEYS.has(key)) throw new TypeError('Unsafe save key: ' + key);
        var descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
          throw new TypeError('Accessor save properties are not supported');
        }
        output[key] = safeClone(descriptor.value, tracker, level + 1);
      });
    }
    tracker.active.delete(value);
    return output;
  }
  function safeMerge() {
    var output = Object.create(null);
    Array.prototype.slice.call(arguments).forEach(function (source) {
      if (!source || typeof source !== 'object' || Array.isArray(source)) return;
      var safe = safeClone(source);
      Object.keys(safe).forEach(function (key) { output[key] = safe[key]; });
    });
    return output;
  }
  function storedValue(value) {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch (_) { return value; }
  }
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }
  function stateFrom(value) {
    var state = value && typeof value.snapshot === 'function' ? value.snapshot() : value;
    if (state && (state.ownerTestMode === true || state.testData === true)) {
      throw new TypeError('Ephemeral owner-test state cannot be exported');
    }
    return Profile.validateImportedState(state);
  }
  function sectionCopy(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? safeClone(value) : Object.create(null);
  }
  function createPayload(profileOrStore, setupSelection, sections) {
    return freeze({
      schema: PAYLOAD_SCHEMA, version: PAYLOAD_VERSION,
      profileV4: stateFrom(profileOrStore),
      setupSelection: Profile.migrateSetupSelection(setupSelection || {}),
      sections: sectionCopy(sections),
    });
  }
  function createDocument(profileOrStore, setupSelection, options) {
    var opts = options || {};
    return SaveBackup.createDocument(createPayload(profileOrStore, setupSelection, opts.sections), {
      releaseVersion: 'v1.12', createdAt: opts.createdAt,
    });
  }
  function serialize(profileOrStore, setupSelection, options) {
    return JSON.stringify(createDocument(profileOrStore, setupSelection, options));
  }
  function legacyPayload(value) {
    var payload = value && typeof value === 'object' ? safeClone(value) : Object.create(null);
    if (payload.schema === 'FlipgameLocalSaveV1' && payload.storage &&
        typeof payload.storage === 'object' && !Array.isArray(payload.storage)) {
      var storage = payload.storage;
      var sections = Object.create(null);
      Object.keys(storage).forEach(function (key) {
        if (key === V4_KEY || key === SETUP_KEY || key === 'flipgame.progression.v3') return;
        sections[key] = storage[key];
      });
      var v4 = storedValue(storage[V4_KEY]);
      var profile = v4 && v4.schema === 'ProgressionStateV4'
        ? Profile.validateImportedState(v4)
        : Profile.migrateV111({
          progression: storedValue(storage['flipgame.progression.v3']),
          recordsV2: storedValue(storage['flipgame.records.v2']),
          recordsV1: storedValue(storage['flipgame.records.v1']),
          achievementsV3: storedValue(storage['flipgame.achievements.v3']),
          achievementsV1: storedValue(storage['flipgame.achievements.v1']),
          setupV2: storedValue(storage[SETUP_KEY]),
        });
      return freeze({ schema: PAYLOAD_SCHEMA, version: PAYLOAD_VERSION,
        profileV4: profile,
        setupSelection: Profile.migrateSetupSelection(storedValue(storage[SETUP_KEY]) || {}),
        sections: sectionCopy(sections) });
    }
    // Early v1.11 exports used named sections rather than the storage wrapper.
    if (payload.progression || payload.records || payload.achievements || payload.setup) {
      return freeze({ schema: PAYLOAD_SCHEMA, version: PAYLOAD_VERSION,
        profileV4: Profile.migrateV111({
          progression: payload.progression || (payload.records && payload.records.progression),
          recordsV2: payload.records && (payload.records.records || payload.records),
          achievementsV3: payload.achievements,
          setupV2: payload.setup,
        }),
        setupSelection: Profile.migrateSetupSelection(payload.setup || {}),
        sections: sectionCopy({ settings: payload.settings, records: payload.records,
          achievements: payload.achievements }) });
    }
    throw new TypeError('Unsupported Flipgame save payload');
  }
  function normalizePayload(value) {
    var payload = value && typeof value === 'object' ? safeClone(value) : Object.create(null);
    if (payload.schema !== PAYLOAD_SCHEMA) return legacyPayload(payload);
    if (typeof payload.version !== 'number' || payload.version !== PAYLOAD_VERSION) {
      throw new RangeError('Unsupported FlipgameLocalSaveV2 version');
    }
    Object.keys(payload).forEach(function (key) {
      if (!PAYLOAD_FIELDS.has(key)) {
        throw new TypeError('Unsupported FlipgameLocalSaveV2 field: ' + key);
      }
    });
    if (!Object.prototype.hasOwnProperty.call(payload, 'profileV4')) {
      throw new TypeError('FlipgameLocalSaveV2 profileV4 is required');
    }
    return freeze({ schema: PAYLOAD_SCHEMA, version: PAYLOAD_VERSION,
      profileV4: Profile.validateImportedState(payload.profileV4),
      setupSelection: Profile.migrateSetupSelection(payload.setupSelection || {}),
      sections: sectionCopy(payload.sections) });
  }
  function parse(input) {
    var parsed = SaveBackup.parse(input);
    return freeze({ valid: true, schema: parsed.schema, version: parsed.version,
      releaseVersion: parsed.releaseVersion, createdAt: parsed.createdAt,
      checksum: clone(parsed.checksum), payload: normalizePayload(parsed.payload) });
  }
  function validate(input) {
    try { return parse(input); }
    catch (error) {
      return freeze({ valid: false, error: 'invalid-save-backup', message: error.message });
    }
  }

  function owns(profile, type, id) {
    if (type === 'object') {
      var objectId = Catalog.canonicalObjectId(id);
      return objectId === 'alien' ? Profile.isAlienUsable(profile)
        : profile.ownedObjectIds.indexOf(objectId) >= 0;
    }
    if (type === 'arena') return profile.ownedArenaIds.indexOf(Catalog.canonicalArenaId(id)) >= 0;
    if (type === 'cosmetic') return profile.ownedCosmeticIds.indexOf(String(id || '')) >= 0;
    return false;
  }
  function safeObject(value, fallback, profile) {
    var id = Catalog.canonicalObjectId(value);
    if (Catalog.object(id) && owns(profile, 'object', id)) return id;
    var other = Catalog.canonicalObjectId(fallback);
    return Catalog.object(other) && owns(profile, 'object', other) ? other : 'bottle';
  }
  function safeArena(value, fallback, profile) {
    var id = Catalog.canonicalArenaId(value);
    if (Catalog.arena(id) && owns(profile, 'arena', id)) return id;
    var other = Catalog.canonicalArenaId(fallback);
    return Catalog.arena(other) && owns(profile, 'arena', other) ? other : 'baseline-table';
  }
  function safeCosmetic(value, fallback, profile) {
    var id = String(value || '');
    if (Catalog.storeCosmetic(id) && owns(profile, 'cosmetic', id)) return id;
    var other = String(fallback || '');
    return Catalog.storeCosmetic(other) && owns(profile, 'cosmetic', other) ? other : null;
  }
  function safeVariant(value, objectId, fallback) {
    var migrated = Catalog.canonicalVariantId(value);
    var variant = Catalog.variant(objectId, migrated);
    if (variant) return variant.id;
    var fallbackVariant = Catalog.variant(objectId, Catalog.canonicalVariantId(fallback));
    return fallbackVariant ? fallbackVariant.id : Catalog.variantIdsFor(objectId)[0];
  }
  function normalizeParticipant(incoming, current, profile) {
    var row = safeMerge(current && typeof current === 'object' ? current : null,
      incoming && typeof incoming === 'object' ? incoming : null);
    var requested = row.charId != null ? row.charId : (row.objectId != null ? row.objectId : row.skin);
    var prior = current && (current.charId != null ? current.charId
      : (current.objectId != null ? current.objectId : current.skin));
    var objectId = safeObject(requested, prior, profile);
    if (Object.prototype.hasOwnProperty.call(row, 'charId')) row.charId = objectId;
    if (Object.prototype.hasOwnProperty.call(row, 'objectId')) row.objectId = objectId;
    if (Object.prototype.hasOwnProperty.call(row, 'skin')) row.skin = objectId;
    if (!Object.prototype.hasOwnProperty.call(row, 'charId') &&
        !Object.prototype.hasOwnProperty.call(row, 'objectId') &&
        !Object.prototype.hasOwnProperty.call(row, 'skin')) row.charId = objectId;
    if (row.variantId != null) row.variantId = safeVariant(row.variantId, objectId,
      current && current.variantId);
    if (row.cosmeticId != null) row.cosmeticId = safeCosmetic(row.cosmeticId,
      current && current.cosmeticId, profile);
    return row;
  }
  function mergeSetupSelection(currentValue, importedValue, profileValue) {
    var profile = Profile.ProgressionStateV4(profileValue);
    var current = Profile.migrateSetupSelection(currentValue || {});
    var incoming = Profile.migrateSetupSelection(importedValue || {});
    var merged = safeMerge(current, incoming);
    ['rows', 'players', 'roster'].forEach(function (key) {
      if (!Array.isArray(incoming[key])) return;
      var currentRows = Array.isArray(current[key]) ? current[key] : [];
      merged[key] = incoming[key].slice(0, 16).map(function (row, index) {
        return normalizeParticipant(row, currentRows[index], profile);
      });
    });
    var requestedObject = incoming.selectedObjectId != null ? incoming.selectedObjectId : incoming.selectedSkin;
    var currentObject = current.selectedObjectId != null ? current.selectedObjectId : current.selectedSkin;
    if (requestedObject != null || currentObject != null) {
      var selectedObject = safeObject(requestedObject, currentObject, profile);
      if (Object.prototype.hasOwnProperty.call(merged, 'selectedObjectId')) merged.selectedObjectId = selectedObject;
      if (Object.prototype.hasOwnProperty.call(merged, 'selectedSkin')) merged.selectedSkin = selectedObject;
      if (merged.selectedVariantId != null) merged.selectedVariantId = safeVariant(
        incoming.selectedVariantId, selectedObject, current.selectedVariantId);
    }
    if (incoming.visualArenaId != null || current.visualArenaId != null) {
      merged.visualArenaId = safeArena(incoming.visualArenaId, current.visualArenaId, profile);
    }
    if (incoming.arenaId != null || current.arenaId != null) {
      merged.arenaId = safeArena(incoming.arenaId, current.arenaId, profile);
    }
    if (incoming.cosmeticId != null || current.cosmeticId != null) {
      merged.cosmeticId = safeCosmetic(incoming.cosmeticId, current.cosmeticId, profile);
    }
    return freeze(merged);
  }
  function importInto(input, store, currentSetup) {
    if (!store || typeof store.mergeImportedState !== 'function' || typeof store.snapshot !== 'function') {
      throw new TypeError('Profile backup import requires the authoritative V4 store');
    }
    var parsed = parse(input);
    // Preflight every caller-controlled non-profile section before committing
    // the authoritative profile.  Profile import is intentionally monotonic
    // and cannot be rolled back, so no validation that can still throw may be
    // deferred until after mergeImportedState changes durable state.
    var safeCurrentSetup = Profile.migrateSetupSelection(currentSetup || {});
    var safeImportedSetup = Profile.migrateSetupSelection(
      parsed.payload.setupSelection || {});
    var safeSections = safeClone(parsed.payload.sections);
    mergeSetupSelection(safeCurrentSetup, safeImportedSetup, store.snapshot());
    var importId = 'save-' + parsed.checksum.value;
    var profileResult = store.mergeImportedState(parsed.payload.profileV4, importId);
    if (!profileResult.applied && profileResult.reason !== 'duplicate') {
      return freeze({ imported: false, reason: profileResult.reason,
        profileResult: profileResult, setupSelection: null });
    }
    var setup = mergeSetupSelection(safeCurrentSetup, safeImportedSetup, store.snapshot());
    return freeze({ imported: true, duplicate: profileResult.reason === 'duplicate',
      checksum: parsed.checksum.value, profileResult: profileResult,
      setupSelection: setup, sections: safeSections,
      state: store.snapshot() });
  }

  return freeze({
    schema: 'FlipgameProfileBackupV2', version: 2,
    payloadSchema: PAYLOAD_SCHEMA, payloadVersion: PAYLOAD_VERSION,
    extension: SaveBackup.extension,
    createPayload: createPayload, createDocument: createDocument,
    serialize: serialize, parse: parse, validate: validate,
    normalizePayload: normalizePayload, mergeSetupSelection: mergeSetupSelection,
    importInto: importInto,
  });
});
