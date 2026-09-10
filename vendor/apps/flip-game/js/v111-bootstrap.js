// v111-bootstrap.js — verifies and exposes the complete v111 vector-art pack.
(function (root, factory) {
  'use strict';
  var api;
  if (typeof module === 'object' && module.exports) {
    api = factory(
      require('./v111-art-platform.js'),
      require('./v111-object-manifest.js'),
      [
        require('./v111-art-pack-a.js'),
        require('./v111-art-pack-b.js'),
        require('./v111-art-pack-c.js'),
      ]
    );
    module.exports = api;
  } else {
    api = factory(root.FlipArtV111, root.FLIP_V111_OBJECT_MANIFEST, [
      root.FlipArtV111PackA,
      root.FlipArtV111PackB,
      root.FlipArtV111PackC,
    ]);
  }
  if (root) {
    root.FlipgameV111Art = api;
    if (root.FlipgameV111 && root.FlipgameV111.art) {
      root.FlipgameV111.art.register(api);
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (platform, manifest, packs) {
  'use strict';

  if (!platform || typeof platform.listObjects !== 'function') {
    throw new Error('FlipArtV111 must load before v111-bootstrap.js');
  }
  if (!manifest || !Array.isArray(manifest.objects) || !Array.isArray(manifest.variants)) {
    throw new Error('FLIP_V111_OBJECT_MANIFEST must load before v111-bootstrap.js');
  }
  if (!Array.isArray(packs) || packs.length !== 3 || packs.some(function (pack) { return !pack; })) {
    throw new Error('All three v111 art packs must load before v111-bootstrap.js');
  }

  var manifestObjectIds = manifest.objects.map(function (object) { return object.id; });
  var registeredObjectIds = platform.listObjects().map(function (object) { return object.id; });
  if (manifestObjectIds.length !== 25 || registeredObjectIds.length !== 25 ||
      manifestObjectIds.some(function (id, index) { return registeredObjectIds[index] !== id; })) {
    throw new Error('v111 art registry must match the ordered 25-object manifest');
  }

  var packObjectIds = [];
  packs.forEach(function (pack) {
    if (!Array.isArray(pack.objectIds)) throw new TypeError('A v111 art pack is missing objectIds');
    pack.objectIds.forEach(function (id) {
      if (packObjectIds.indexOf(id) >= 0) throw new Error('Duplicate v111 art-pack object: ' + id);
      packObjectIds.push(id);
    });
  });
  if (packObjectIds.length !== 25 ||
      manifestObjectIds.some(function (id) { return packObjectIds.indexOf(id) < 0; })) {
    throw new Error('v111 art packs do not cover the complete manifest');
  }

  var variantIds = manifest.variants.map(function (variant) { return variant.id; });
  if (variantIds.length !== 300 || new Set(variantIds).size !== variantIds.length) {
    throw new Error('v111 art bootstrap requires 300 unique canonical variants');
  }

  function object(id) {
    return manifest.objects.find(function (entry) { return entry.id === id; }) || null;
  }

  function variant(canonicalId) {
    return manifest.variants.find(function (entry) { return entry.id === canonicalId; }) || null;
  }

  return Object.freeze({
    schema: 'FlipgameArtCatalogV1',
    contractRevision: 4,
    objectIds: Object.freeze(manifestObjectIds.slice()),
    variantIds: Object.freeze(variantIds.slice()),
    packs: Object.freeze(packs.slice()),
    manifest: manifest,
    platform: platform,
    object: object,
    variant: variant,
    getRenderVariant: function (objectId, variantId) {
      return platform.getRenderVariant(objectId, variantId);
    },
    face: function (objectId, variantId) {
      return platform.getRenderVariant(objectId, variantId).face;
    },
    physicalDynamics: function (objectId, state) {
      return platform.physicalDynamicsSnapshot(objectId, state);
    },
    renderPreview: function (ctx, options) { return platform.renderPreview(ctx, options); },
    renderGameplay: function (ctx, options) { return platform.renderGameplay(ctx, options); },
  });
});
