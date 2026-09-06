// v111-save-backup.js -- checksummed, lossless local save backup core.
(function (root, factory) {
  'use strict';
  var NamePolicy = root && root.FlipgameV111NamePolicy;
  var Interfaces = root && root.FlipgameV111Interfaces;
  if (typeof module === 'object' && module.exports) {
    NamePolicy = require('./v111-name-policy.js');
    Interfaces = require('./v111-interfaces.js');
  }
  var api = factory(NamePolicy, Interfaces);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV111SaveBackup = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (NamePolicy, Interfaces) {
  'use strict';

  var SCHEMA = 'FlipgameSaveBackupV1';
  var VERSION = 1;
  var EXTENSION = '.flipgame-save';
  var ALGORITHM = 'crc32-canonical-json-v1';
  var UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

  function safeJson(value, state, depth) {
    var current = state || { nodes: 0, seen: new Set() };
    var level = depth || 0;
    if (++current.nodes > 250000 || level > 64) throw new TypeError('Save backup is too large or deeply nested');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError('Save backup contains a non-finite number');
      return Object.is(value, -0) ? 0 : value;
    }
    if (Array.isArray(value)) {
      if (current.seen.has(value)) throw new TypeError('Save backup contains a cycle');
      current.seen.add(value);
      var array = value.map(function (entry) { return safeJson(entry, current, level + 1); });
      current.seen.delete(value);
      return array;
    }
    if (!value || typeof value !== 'object') throw new TypeError('Save backup contains unsupported data');
    if (current.seen.has(value)) throw new TypeError('Save backup contains a cycle');
    current.seen.add(value);
    var output = {};
    Object.keys(value).forEach(function (key) {
      if (UNSAFE_KEYS.has(key)) throw new TypeError('Save backup contains an unsafe key');
      if (value[key] === undefined || typeof value[key] === 'function' || typeof value[key] === 'symbol') {
        throw new TypeError('Save backup contains unsupported data');
      }
      output[key] = safeJson(value[key], current, level + 1);
    });
    current.seen.delete(value);
    return output;
  }

  function sanitizeNames(value, options) {
    var opts = options || {};
    var replacement = opts.invalidReplacement == null ? '' : String(opts.invalidReplacement);
    var source = safeJson(value);
    function visit(node, contextKey) {
      if (Array.isArray(node)) return node.map(function (entry) { return visit(entry, contextKey); });
      if (!node || typeof node !== 'object') return node;
      var output = {};
      var playerContext = /^(player|players|participants|winner|winners|roster|members|savedSetup|rows)$/i.test(contextKey || '') ||
        node.playerId != null || node.netId != null || node.seat != null || node.playerIndex != null || node.isAI != null;
      Object.keys(node).forEach(function (key) {
        if (/^(displayName|playerName)$/i.test(key) || (key === 'name' && playerContext)) {
          var checked = NamePolicy && typeof NamePolicy.validate === 'function'
            ? NamePolicy.validate(node[key]) : { valid: false };
          output[key] = checked && checked.valid ? checked.value : replacement;
        } else output[key] = visit(node[key], key);
      });
      return output;
    }
    return visit(source, 'save');
  }

  function canonicalStringify(value) {
    var source = safeJson(value);
    function encode(node) {
      if (node === null || typeof node !== 'object') return JSON.stringify(node);
      if (Array.isArray(node)) return '[' + node.map(encode).join(',') + ']';
      return '{' + Object.keys(node).sort().map(function (key) {
        return JSON.stringify(key) + ':' + encode(node[key]);
      }).join(',') + '}';
    }
    return encode(source);
  }

  function checksum(value) {
    var source = unescape(encodeURIComponent(canonicalStringify(value)));
    var table = checksum.table || (checksum.table = Array.from({ length: 256 }, function (_, index) {
      var entry = index;
      for (var bit = 0; bit < 8; bit++) entry = (entry & 1) ? (0xedb88320 ^ (entry >>> 1)) : (entry >>> 1);
      return entry >>> 0;
    }));
    var crc = 0xffffffff;
    for (var i = 0; i < source.length; i++) crc = table[(crc ^ source.charCodeAt(i)) & 255] ^ (crc >>> 8);
    return ('00000000' + ((crc ^ 0xffffffff) >>> 0).toString(16)).slice(-8);
  }

  function documentBody(document) {
    return {
      schema: document.schema, version: document.version, releaseVersion: document.releaseVersion,
      createdAt: document.createdAt, payload: document.payload,
    };
  }

  function migratePayload(payload, adapters) {
    var migrated = sanitizeNames(payload, { invalidReplacement: '' });
    var list = typeof adapters === 'function' ? [adapters] : (Array.isArray(adapters) ? adapters : []);
    list.forEach(function (adapter) {
      if (typeof adapter === 'function') migrated = safeJson(adapter(safeJson(migrated)));
      else if (adapter && typeof adapter.migrate === 'function' &&
          (!adapter.test || adapter.test(migrated))) migrated = safeJson(adapter.migrate(safeJson(migrated)));
    });
    return sanitizeNames(migrated, { invalidReplacement: '' });
  }

  function createDocument(payload, options) {
    var opts = options || {};
    var document = {
      schema: SCHEMA, version: VERSION,
      releaseVersion: String(opts.releaseVersion || (Interfaces && Interfaces.RELEASE_VERSION) || 'v1.11'),
      createdAt: Number.isFinite(Number(opts.createdAt)) ? Math.trunc(Number(opts.createdAt)) : Date.now(),
      payload: sanitizeNames(payload, { invalidReplacement: '' }),
    };
    document.checksum = { algorithm: ALGORITHM, value: checksum(documentBody(document)) };
    return Object.freeze(safeJson(document));
  }

  function serialize(payload, options) { return JSON.stringify(createDocument(payload, options)); }

  function parse(input, options) {
    var document = typeof input === 'string' ? JSON.parse(input) : safeJson(input);
    document = safeJson(document);
    if (document.schema !== SCHEMA || document.version !== VERSION || !document.payload ||
        typeof document.payload !== 'object' || !document.checksum || document.checksum.algorithm !== ALGORITHM ||
        !/^[a-f0-9]{8}$/.test(String(document.checksum.value || ''))) {
      throw new TypeError('Invalid .flipgame-save document');
    }
    var expected = checksum(documentBody(document));
    if (expected !== document.checksum.value) throw new Error('Save backup checksum does not match');
    var payload = migratePayload(document.payload, options && options.adapters);
    return Object.freeze({
      valid: true, schema: document.schema, version: document.version,
      releaseVersion: document.releaseVersion, createdAt: document.createdAt,
      checksum: Object.freeze(safeJson(document.checksum)), payload: Object.freeze(payload),
    });
  }

  function validate(input, options) {
    try { return parse(input, options); }
    catch (error) { return Object.freeze({ valid: false, error: 'invalid-save-backup', message: error.message }); }
  }

  return Object.freeze({
    schema: SCHEMA, version: VERSION, extension: EXTENSION, checksumAlgorithm: ALGORITHM,
    canonicalStringify: canonicalStringify, checksum: checksum, sanitizeNames: sanitizeNames,
    migratePayload: migratePayload, createDocument: createDocument, serialize: serialize,
    parse: parse, validate: validate, importBackup: parse,
  });
});
