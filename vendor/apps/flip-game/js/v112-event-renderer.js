// v112-event-renderer.js -- presentation-only dispatch for issued EventFrameV1.
(function (factory) {
  'use strict';
  var nodeModule = null;
  try {
    if (typeof process === 'object' && process !== null &&
        typeof process.getBuiltinModule === 'function') nodeModule = process.getBuiltinModule('module');
  } catch (_) { nodeModule = null; }
  var commonJs = typeof nodeModule === 'function' && nodeModule._cache &&
    typeof module === 'object' && module !== null && module.constructor === nodeModule &&
    Object.getPrototypeOf(module) === nodeModule.prototype &&
    nodeModule._cache[module.filename] === module &&
    Object.prototype.hasOwnProperty.call(module, 'exports') &&
    module.require === nodeModule.prototype.require && typeof module.filename === 'string' &&
    typeof process === 'object' && process !== null &&
    process.release && process.release.name === 'node' &&
    process.versions && typeof process.versions.node === 'string';
  if (!commonJs) {
    throw new Error('v112-event-renderer.js is a private CommonJS core and cannot initialize as a classic script');
  }
  module.exports = factory(module.require('./v112-event-kernel.js'));
})(function (Kernel) {
  'use strict';

  if (!Kernel || Kernel.schema !== 'FlipgameEventKernelV2') {
    throw new Error('FlipgameV112EventKernel V2 must load before v112-event-renderer.js');
  }

  function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
  function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

  function defineRenderPack(input) {
    if (!Kernel.isPlainObject(input)) throw new TypeError('EventRenderPackV1 definition is required');
    Kernel.exactKeys(input, ['schema', 'eventClass', 'ids', 'render'], 'EventRenderPackV1');
    if (input.schema != null && input.schema !== 'EventRenderPackV1') {
      throw new TypeError('Invalid EventRenderPackV1 schema');
    }
    var eventClass = Kernel.primitiveString(input.eventClass, 'render eventClass', 16, false);
    if (Kernel.EVENT_CLASSES.indexOf(eventClass) < 0) throw new TypeError('Unsupported render eventClass');
    if (!Array.isArray(input.ids) || !input.ids.length || input.ids.length > Kernel.LIMITS.packIds) {
      throw new TypeError('Render pack requires a bounded ID list');
    }
    var ids = input.ids.map(function (value) {
      var id = Kernel.primitiveString(value, 'render eventId', 64, false);
      if (!own(Kernel.EVENT_CLASS_BY_ID, id)) throw new TypeError('Unknown canonical render eventId: ' + id);
      if (Kernel.EVENT_CLASS_BY_ID[id] !== eventClass) throw new Error('Render pack class authority mismatch for ' + id);
      return id;
    });
    if (new Set(ids).size !== ids.length) throw new TypeError('Render pack IDs must be unique');
    if (typeof input.render !== 'function') throw new TypeError('Render pack render function is required');
    Kernel.assertNoAmbientRandom(input.render, 'EventRenderPackV1.render');
    return Object.freeze({ schema: 'EventRenderPackV1', eventClass: eventClass,
      ids: Object.freeze(ids.slice()), render: input.render });
  }

  function validateRenderPack(value) {
    if (!value || value.schema !== 'EventRenderPackV1' || !Object.isFrozen(value) ||
        !Object.isFrozen(value.ids)) throw new TypeError('Immutable EventRenderPackV1 is required');
    Kernel.exactKeys(value, ['schema', 'eventClass', 'ids', 'render'], 'EventRenderPackV1');
    // Re-create validates canonical ID/class authority and function shape.
    var checked = Object.freeze({ schema: value.schema, eventClass: value.eventClass,
      ids: value.ids, render: value.render });
    if (typeof checked.render !== 'function') throw new TypeError('Render function is required');
    Kernel.assertNoAmbientRandom(checked.render, 'EventRenderPackV1.render');
    var eventClass = Kernel.primitiveString(checked.eventClass, 'render eventClass', 16, false);
    if (Kernel.EVENT_CLASSES.indexOf(eventClass) < 0 || !Array.isArray(checked.ids) ||
        !checked.ids.length || checked.ids.length > Kernel.LIMITS.packIds) {
      throw new TypeError('Invalid EventRenderPackV1');
    }
    var seen = Object.create(null);
    checked.ids.forEach(function (value) {
      var id = Kernel.primitiveString(value, 'render eventId', 64, false);
      if (!own(Kernel.EVENT_CLASS_BY_ID, id) || Kernel.EVENT_CLASS_BY_ID[id] !== eventClass) {
        throw new Error('Render pack canonical class authority mismatch');
      }
      if (seen[id]) throw new Error('Render pack IDs must be unique');
      seen[id] = true;
    });
    return value;
  }

  function commandFromEntity(entity) {
    return { entityId: entity.entityId, role: entity.role,
      transform: entity.transform, bounds: entity.bounds,
      colliderRef: entity.colliderRef, appearanceRef: entity.appearanceRef,
      visualStateRef: entity.visualStateRef, visible: entity.visible, zIndex: entity.zIndex };
  }

  function normalizeCommand(value, entity) {
    if (!Kernel.isPlainObject(value)) throw new TypeError('Event render command must be an object');
    Kernel.exactKeys(value, ['entityId', 'role', 'transform', 'bounds', 'colliderRef',
      'appearanceRef', 'visualStateRef', 'visible', 'zIndex'], 'Event render command');
    var copy = Kernel.immutableData(value, 'event render command');
    var authoritative = Kernel.immutableData(commandFromEntity(entity), 'authoritative render entity');
    if (!same(copy, authoritative)) {
      throw new Error('Render command diverges from authoritative frame entity: ' + entity.entityId);
    }
    return copy;
  }

  function normalizePlan(value, frame) {
    var source = value == null ? Object.create(null) : value;
    if (!Kernel.isPlainObject(source)) throw new TypeError('EventRenderPlanV1 must be a data object');
    Kernel.exactKeys(source, ['schema', 'eventId', 'laneId', 'sequence', 'commands',
      'cues', 'reducedMotion', 'plinkoTransport'], 'EventRenderPlanV1');
    if (source.schema != null && source.schema !== 'EventRenderPlanV1') throw new TypeError('Invalid render plan schema');
    if (source.eventId != null && source.eventId !== frame.eventId) throw new Error('Render plan eventId mismatch');
    if (source.laneId != null && source.laneId !== frame.laneId) throw new Error('Render plan laneId mismatch');
    if (source.sequence != null && source.sequence !== frame.sequence) throw new Error('Render plan sequence mismatch');
    if (source.reducedMotion != null && source.reducedMotion !== frame.reducedMotion) {
      throw new Error('Render plan reduced-motion mismatch');
    }
    if (own(source, 'plinkoTransport') &&
        !same(source.plinkoTransport, frame.plinkoTransport)) {
      throw new Error('Render plan Plinko transport mismatch');
    }
    var commands = source.commands == null ? frame.entities.map(commandFromEntity) : source.commands;
    if (!Array.isArray(commands) || commands.length !== frame.entities.length ||
        commands.length > Kernel.LIMITS.entities) {
      throw new Error('Render plan must contain exactly one command per frame entity');
    }
    var byId = Object.create(null);
    frame.entities.forEach(function (entity) { byId[entity.entityId] = entity; });
    var seen = Object.create(null);
    var normalizedCommands = commands.map(function (command) {
      if (!Kernel.isPlainObject(command)) throw new TypeError('Event render command must be an object');
      var id = Kernel.primitiveString(command.entityId, 'render command entityId', 128, false);
      if (!own(byId, id)) throw new Error('Render command refers to an unknown entity: ' + id);
      if (seen[id]) throw new Error('Render command duplicates entity: ' + id);
      seen[id] = true;
      return normalizeCommand(command, byId[id]);
    });
    var cues = source.cues == null ? frame.cues : Kernel.normalizeCues(source.cues, 'render cues');
    if (frame.eventId === 'plinko' && !same(cues, frame.cues)) {
      throw new Error('Plinko render packs cannot replace, extend, or retarget the camera plan');
    }
    return Kernel.deepFreeze({ schema: 'EventRenderPlanV1', eventId: frame.eventId,
      laneId: frame.laneId, sequence: frame.sequence, commands: normalizedCommands,
      cues: cues, reducedMotion: frame.reducedMotion,
      plinkoTransport: frame.plinkoTransport,
      mechanicsSignature: Kernel.mechanicsSignature(frame) });
  }

  function createEventRenderer(options) {
    if (!Kernel.isPlainObject(options)) throw new TypeError('Event renderer options are required');
    Kernel.exactKeys(options, ['packs', 'authority'], 'Event renderer options');
    if (!Array.isArray(options.packs) || !options.packs.length ||
        options.packs.length > Kernel.EVENT_CLASSES.length) {
      throw new TypeError('One to three EventRenderPackV1 packs are required');
    }
    Kernel.rendererAuthorityInfo(options.authority);
    var byId = Object.create(null);
    options.packs.forEach(function (value) {
      var pack = validateRenderPack(value);
      pack.ids.forEach(function (id) {
        if (own(byId, id)) throw new Error('Duplicate event render owner for ' + id);
        byId[id] = pack;
      });
    });

    function render(frame) {
      if (!Kernel.verifyFrame(options.authority, frame)) {
        throw new Error('Renderer accepts only a kernel-issued authoritative EventFrameV1');
      }
      var pack = byId[frame.eventId];
      if (!pack) throw new Error('No EventRenderPackV1 owns ' + frame.eventId);
      if (pack.eventClass !== frame.eventClass) throw new Error('Render pack class mismatch');
      var output = Kernel.callSynchronous(pack.render, pack, [frame, Object.freeze({
        schema: 'EventRenderContextV1', reducedMotion: frame.reducedMotion,
        plinkoTransport: frame.plinkoTransport,
      })], 'EventRenderPackV1.render');
      return normalizePlan(output, frame);
    }

    return Object.freeze({ schema: 'EventRendererV2', render: render });
  }

  return Object.freeze({ schema: 'FlipgameEventRendererV2',
    defineRenderPack: defineRenderPack, createEventRenderer: createEventRenderer });
});
