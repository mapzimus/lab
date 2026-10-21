// v112-plinko-matter.js -- deterministic Matter.js host for canonical Plinko.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else Object.defineProperty(root, 'FlipgameV112PlinkoMatter', {
    value: api, enumerable: true, writable: false, configurable: false,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SCHEMA = 'FlipgameV112PlinkoMatterV1';
  var FIXED_TICK_HZ = 60;
  var FIXED_DT_MS = 1000 / FIXED_TICK_HZ;
  var BOARD_START_TICK = 144;
  var RELEASE_TICK = 24;
  var APEX_TICK = 129;
  var RECOVERY_START_TICK = 1464;
  var RECOVERY_INTERVAL_TICKS = 30;
  var RECOVERY_LIMIT = 4;
  var TIMEOUT_TICK = 1944;
  var SPRING_COMMAND_Y = -28;
  var SPRING_VELOCITY_GAIN = 1.64;
  var FLIPPER_COMPRESSED_SCALE_X = 1.18;
  var FLIPPER_COMPRESSED_SCALE_Y = 0.62;
  var DROP_GRAVITY_SCALE = 0.0003;
  var SETTLE_TICKS = 18;
  var CHASSIS_FRICTION = 0.005;
  var CHASSIS_FRICTION_AIR = 0.02;
  var CHASSIS_RESTITUTION = 0.24;
  var SLOT_KINDS = Object.freeze([
    'lives-doubled', 'everyone-else-halved', 'always-magnet',
    'automatic-loss', 'automatic-win', 'automatic-loss',
    'always-magnet', 'everyone-else-halved', 'lives-doubled',
  ]);

  function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
  function plain(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function finite(value, label, minimum, maximum) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(label + ' must be a finite number');
    }
    if (minimum != null && value < minimum) throw new RangeError(label + ' is below its minimum');
    if (maximum != null && value > maximum) throw new RangeError(label + ' exceeds its maximum');
    return value;
  }
  function whole(value, label, minimum, maximum) {
    var result = finite(value, label, minimum, maximum);
    if (!Number.isSafeInteger(result)) throw new TypeError(label + ' must be a safe integer');
    return result;
  }
  function required(value, label, maximum) {
    if (typeof value !== 'string' || !value.length || value.length > maximum) {
      throw new TypeError(label + ' must be a non-empty bounded string');
    }
    return value;
  }
  function close(left, right, epsilon) {
    return Math.abs(left - right) <= (epsilon == null ? 1e-7 : epsilon);
  }
  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }
  function copyPoint(value) { return { x: value.x, y: value.y }; }
  function copyBounds(value) {
    return { left: value.min ? value.min.x : value.left,
      top: value.min ? value.min.y : value.top,
      right: value.max ? value.max.x : value.right,
      bottom: value.max ? value.max.y : value.bottom,
      width: value.max ? value.max.x - value.min.x : value.width,
      height: value.max ? value.max.y - value.min.y : value.height };
  }
  function freezeData(value, seen) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    var visited = seen || new WeakSet();
    if (visited.has(value)) return value;
    visited.add(value);
    Object.keys(value).forEach(function (key) { freezeData(value[key], visited); });
    return Object.freeze(value);
  }
  function hashText(value) {
    var text = String(value);
    var hash = 0x811c9dc5;
    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }
  function digestContacts(contacts) {
    return 'pc1-' + hashText(contacts.map(function (entry) {
      return [entry.tick, entry.kind, entry.ref].join(':');
    }).join('|')).toString(16).padStart(8, '0');
  }
  function exactKeys(value, expected, label) {
    if (!plain(value)) throw new TypeError(label + ' must be an object');
    var allowed = Object.create(null);
    expected.forEach(function (key) { allowed[key] = true; });
    Object.keys(value).forEach(function (key) {
      if (!allowed[key]) throw new TypeError(label + ' contains unsupported field ' + key);
    });
  }

  function validateMatter(value) {
    if (!value || !value.Engine || !value.Bodies || !value.Body ||
        !value.Composite || !value.Constraint || !value.Events) {
      throw new TypeError('A complete Matter.js namespace is required');
    }
    return value;
  }

  function validateGeometry(value) {
    if (!value || value.schema !== 'PlinkoBoardGeometryV1' ||
        !value.physics || value.physics.schema !== 'PlinkoBoardPhysicsV1' ||
        value.rowCount !== 24 || value.slotCount !== 9 ||
        value.innerWidth !== 1080 || value.rowSpacing !== 92 ||
        value.slotWidth !== 120 || value.slotBandHeight !== 150 ||
        !Array.isArray(value.pegRows) || value.pegRows.length !== 24 ||
        !Array.isArray(value.rails) || value.rails.length !== 2 ||
        !Array.isArray(value.dividers) || value.dividers.length !== 8 ||
        !Array.isArray(value.sensors) || value.sensors.length !== 9) {
      throw new TypeError('Canonical PlinkoBoardGeometryV1 is required');
    }
    var pegCount = 0;
    value.pegRows.forEach(function (row, rowIndex) {
      var expected = rowIndex % 2 === 0 ? 11 : 10;
      if (!row || row.rowIndex !== rowIndex || !Array.isArray(row.centers) ||
          row.centers.length !== expected ||
          (rowIndex && !close(row.y - value.pegRows[rowIndex - 1].y, 92))) {
        throw new TypeError('Canonical Plinko peg rows are malformed');
      }
      row.centers.forEach(function (peg) {
        if (!peg || peg.radius !== 9 || !Number.isFinite(peg.x) || !Number.isFinite(peg.y)) {
          throw new TypeError('Canonical Plinko peg geometry is malformed');
        }
        pegCount += 1;
      });
    });
    if (pegCount !== 252 || value.physics.pegField.pegCount !== 252) {
      throw new TypeError('Canonical Plinko peg count must be 252');
    }
    for (var sensorIndex = 0; sensorIndex < value.sensors.length; sensorIndex += 1) {
      var sensor = value.sensors[sensorIndex];
      if (sensor.colliderRef !== 'sensor:plinko-slot-' + sensorIndex ||
          sensor.geometryRole !== 'slot-' + sensorIndex) {
        throw new TypeError('Canonical Plinko sensor ordering is malformed');
      }
      if (sensorIndex && value.sensors[sensorIndex - 1].bounds.right >= sensor.bounds.left) {
        throw new TypeError('Canonical Plinko sensors must not overlap');
      }
    }
    return value;
  }

  function bodyOwnsPart(parent, candidate) {
    return candidate === parent || (candidate && candidate.parent === parent);
  }

  function create(options) {
    var source = options || {};
    exactKeys(source, ['Matter'], 'Plinko Matter options');
    var Matter = validateMatter(source.Matter);
    var Engine = Matter.Engine;
    var Bodies = Matter.Bodies;
    var Body = Matter.Body;
    var Composite = Matter.Composite;
    var Constraint = Matter.Constraint;
    var Events = Matter.Events;

    var phase = 'idle';
    var engine = null;
    var world = null;
    var selectedBody = null;
    var selectedResource = null;
    var contactChassisBody = null;
    var contactChassisConstraint = null;
    var geometry = null;
    var binding = null;
    var seed = 0;
    var viewport = null;
    var originalGravity = null;
    var originalMaterial = null;
    var createdBodies = [];
    var pegBodies = [];
    var pegFieldBody = null;
    var railBodies = [];
    var dividerBodies = [];
    var sensorBodies = [];
    var trampolineBody = null;
    var slotFloorBody = null;
    var byRef = Object.create(null);
    var currentTick = 0;
    var lastDirectiveTick = 0;
    var fieldEnabled = false;
    var springApplied = false;
    var compressed = false;
    var trampolineScale = { x: 1, y: 1 };
    var selectedRenderScale = { x: 1, y: 1 };
    var activeSensors = new Set();
    var contactedSensors = new Set();
    var activePairMetadata = new Map();
    var settleCounter = 0;
    var settled = false;
    var settledTick = null;
    var settledSlot = null;
    var contactLog = [];
    var recoveryApplied = 0;
    var antiBalanceTicks = 0;
    var antiBalanceApplied = 0;
    var antiBalanceBurstTicks = 0;
    var antiBalanceDirection = 0;
    var maximumStepDisplacement = 0;
    var previousPosition = null;
    var rendererBoard = null;

    function assertPhase(allowed, operation) {
      if (allowed.indexOf(phase) < 0) {
        throw new Error(operation + ' is not available during ' + phase);
      }
    }

    function tag(body, reference, kind, extra) {
      body.plugin = body.plugin || {};
      body.plugin.v112Plinko = Object.assign({ ref: reference, kind: kind }, extra || {});
      body.label = 'v112-plinko:' + reference;
      if (Array.isArray(body.parts)) body.parts.forEach(function (part) {
        part.plugin = part.plugin || {};
        part.plugin.v112Plinko = body.plugin.v112Plinko;
        part.label = body.label;
      });
      if (reference) byRef[reference] = body;
      return body;
    }

    function rectangleFromPart(part, optionsValue) {
      return tag(Bodies.rectangle(part.transform.x, part.transform.y,
        part.bounds.width, part.bounds.height, optionsValue),
      part.colliderRef, part.geometryRole);
    }

    function setMask(bodies, mask) {
      bodies.forEach(function (body) {
        body.collisionFilter.mask = mask;
        if (Array.isArray(body.parts)) body.parts.forEach(function (part) {
          part.collisionFilter.mask = mask;
        });
      });
    }

    function rememberMaterial(body) {
      var unique = [];
      [body].concat(body.parts || []).forEach(function (part) {
        if (unique.indexOf(part) < 0) unique.push(part);
      });
      return unique.map(function (part) { return { part: part,
        friction: part.friction, frictionAir: part.frictionAir,
        restitution: part.restitution,
        filter: { category: part.collisionFilter.category,
          mask: part.collisionFilter.mask, group: part.collisionFilter.group },
        isSensor: part.isSensor };
      });
    }

    function restoreMaterial() {
      (originalMaterial || []).forEach(function (entry) {
        entry.part.friction = entry.friction;
        entry.part.frictionAir = entry.frictionAir;
        entry.part.restitution = entry.restitution;
        entry.part.collisionFilter.category = entry.filter.category;
        entry.part.collisionFilter.mask = entry.filter.mask;
        entry.part.collisionFilter.group = entry.filter.group;
        entry.part.isSensor = entry.isSensor;
      });
    }

    function setSelectedMaterial() {
      var profile = geometry.physics.selectedObjectEnvelope;
      [selectedBody].concat(selectedBody.parts || []).forEach(function (part) {
        part.friction = profile.friction;
        part.frictionAir = profile.frictionAir;
        part.restitution = profile.restitution;
      });
      if (contactChassisBody) {
        [contactChassisBody].concat(contactChassisBody.parts || []).forEach(function (part) {
          part.friction = CHASSIS_FRICTION;
          part.frictionAir = CHASSIS_FRICTION_AIR;
          part.restitution = CHASSIS_RESTITUTION;
        });
      }
    }

    function buildContactChassis() {
      // A short rounded capsule can pass between adjacent rows while still
      // tumbling and colliding as a real Matter body. The selected Flipper is
      // never replaced: it remains in the world and is physically tethered to
      // this shared event-only chassis. Its authored parts and internal-motion
      // state remain intact and are restored to ordinary collision on cleanup.
      var x = selectedBody.position.x;
      var y = selectedBody.position.y;
      var chassisOptions = { density: 0.008, friction: CHASSIS_FRICTION,
        frictionAir: CHASSIS_FRICTION_AIR, restitution: CHASSIS_RESTITUTION,
        label: 'v112-plinko-contact-chassis' };
      var capsuleParts = [
        Bodies.rectangle(x, y, 42, 22, chassisOptions),
        Bodies.circle(x, y - 6, 21, chassisOptions),
        Bodies.circle(x, y + 6, 21, chassisOptions),
      ];
      contactChassisBody = tag(Body.create({ parts: capsuleParts,
        friction: chassisOptions.friction, frictionAir: chassisOptions.frictionAir,
        restitution: chassisOptions.restitution,
        label: chassisOptions.label }), 'body:plinko-contact-chassis',
      'contact-chassis', { shape: 'rounded-capsule', width: 42, height: 54 });
      Body.setVelocity(contactChassisBody, copyPoint(selectedBody.velocity));
      Body.setAngularVelocity(contactChassisBody, selectedBody.angularVelocity);
      contactChassisConstraint = Constraint.create({ bodyA: selectedBody,
        bodyB: contactChassisBody, length: 0, stiffness: 0.96, damping: 0.22,
        render: { visible: false }, label: 'v112-plinko-contact-tether' });
      contactChassisConstraint.plugin = contactChassisConstraint.plugin || {};
      contactChassisConstraint.plugin.v112Plinko = {
        ref: 'constraint:plinko-contact-tether', kind: 'contact-tether' };
    }

    function buildRendererBoard() {
      var pegs = [];
      geometry.pegRows.forEach(function (row) {
        row.centers.forEach(function (peg, pegIndex) {
          pegs.push(Object.freeze({ rowIndex: row.rowIndex, pegIndex: pegIndex,
            x: peg.x, y: peg.y, radius: peg.radius }));
        });
      });
      rendererBoard = freezeData({ schema: 'PlinkoMatterRenderBoardV1',
        fingerprint: geometry.fingerprint, bounds: geometry.board.bounds,
        innerLeft: geometry.innerLeft, innerRight: geometry.innerRight,
        top: geometry.top, bottom: geometry.bottom,
        pegRows: geometry.pegRows, pegs: pegs,
        rails: geometry.rails.map(function (part) { return part.bounds; }),
        dividers: geometry.dividers.map(function (part) { return part.bounds; }),
        slots: geometry.sensors.map(function (sensor, index) {
          return { index: index, sensorRef: sensor.colliderRef,
            kind: SLOT_KINDS[index], bounds: sensor.bounds };
        }),
        slotFloor: { left: geometry.innerLeft, right: geometry.innerRight,
          top: geometry.bottom, bottom: geometry.bottom + 24 },
        trampoline: { colliderRef: geometry.trampoline.colliderRef,
          bounds: geometry.trampoline.bounds } });
    }

    function attach(input) {
      assertPhase(['idle'], 'attach');
      exactKeys(input, ['engine', 'world', 'selectedBody', 'selectedResource',
        'geometry', 'binding', 'viewport'], 'Plinko attach input');
      engine = input.engine;
      world = input.world;
      selectedBody = input.selectedBody;
      selectedResource = input.selectedResource == null ? selectedBody : input.selectedResource;
      geometry = validateGeometry(input.geometry);
      binding = input.binding == null ? null : input.binding;
      viewport = input.viewport || { width: 1280, height: 720 };
      if (!engine || engine.world !== world || !selectedBody ||
          typeof selectedBody.id !== 'number' || !Array.isArray(selectedBody.parts)) {
        throw new TypeError('Plinko attach requires one live Matter engine/world/selected body');
      }
      if (Composite.allBodies(world).indexOf(selectedBody) < 0) {
        throw new Error('The selected compound body must already belong to the supplied world');
      }
      if (binding && (binding.objectColliderRef !== 'body:flipper-main' ||
          !binding.appearanceRevision || !binding.colliderFingerprint ||
          !Array.isArray(binding.authoredParts) || !Array.isArray(binding.internalDynamics))) {
        throw new TypeError('Plinko selected-Flipper binding is incomplete');
      }
      finite(viewport.width, 'Plinko viewport width', 240, 100000);
      finite(viewport.height, 'Plinko viewport height', 240, 100000);
      originalGravity = { x: engine.gravity.x, y: engine.gravity.y,
        scale: engine.gravity.scale };
      // Plinko owns one deterministic gravity profile. The host's active
      // Classic/Alien/event profile must not change the spring arc or drop
      // duration before the board switches to its slow-fall scale.
      engine.gravity.x = 0;
      engine.gravity.y = 1;
      engine.gravity.scale = 0.001;
      originalMaterial = rememberMaterial(selectedBody);
      previousPosition = copyPoint(selectedBody.position);
      buildContactChassis();
      // Only the chassis contacts Plinko geometry. The selected Flipper body
      // remains live for gravity, rotation, camera tracking and internal
      // dynamics, and its exact collision filters are restored by cleanup.
      setMask([selectedBody], 0);

      var staticOptions = { isStatic: true, friction: 0.01,
        restitution: CHASSIS_RESTITUTION, label: 'v112-plinko-physical' };
      var pegParts = [];
      geometry.pegRows.forEach(function (row) {
        row.centers.forEach(function (peg, pegIndex) {
          // Five sloped contact faces prevent Matter's deterministic solver
          // from holding a chassis forever at the exact crown of a circle.
          // The authored renderer may retain a rounded bolt/bumper appearance.
          var pegOptions = Object.assign({}, staticOptions, {
            angle: Math.PI / 2 + ((row.rowIndex + pegIndex) % 2 ? 0.08 : -0.08),
          });
          var part = Bodies.polygon(peg.x, peg.y, 5, peg.radius, pegOptions);
          part.plugin = part.plugin || {};
          part.plugin.v112Plinko = { ref: 'peg:' + row.rowIndex + ':' + pegIndex,
            kind: 'peg', rowIndex: row.rowIndex, pegIndex: pegIndex };
          part.label = 'v112-plinko:peg:' + row.rowIndex + ':' + pegIndex;
          pegParts.push(part);
        });
      });
      pegFieldBody = Matter.Body.create({ parts: pegParts, isStatic: true,
        friction: staticOptions.friction, restitution: staticOptions.restitution,
        label: 'v112-plinko:' + geometry.board.colliderRef });
      pegFieldBody.plugin = pegFieldBody.plugin || {};
      pegFieldBody.plugin.v112Plinko = { ref: geometry.board.colliderRef,
        kind: 'peg-field' };
      byRef[geometry.board.colliderRef] = pegFieldBody;
      pegBodies = [pegFieldBody];
      railBodies = geometry.rails.map(function (part) {
        return rectangleFromPart(part, staticOptions);
      });
      dividerBodies = geometry.dividers.map(function (part) {
        return rectangleFromPart(part, Object.assign({}, staticOptions,
          { restitution: 0.25 }));
      });
      sensorBodies = geometry.sensors.map(function (part, index) {
        return tag(Bodies.rectangle(part.transform.x, part.transform.y,
          part.bounds.width, part.bounds.height, {
            isStatic: true, isSensor: true, label: 'v112-plinko-sensor',
          }), part.colliderRef, 'slot-sensor', { slotIndex: index });
      });
      trampolineBody = rectangleFromPart(geometry.trampoline, {
        isStatic: true, friction: 0.9, restitution: 0.05,
        label: 'v112-plinko-trampoline',
      });
      slotFloorBody = tag(Bodies.rectangle(geometry.centerX, geometry.bottom + 12,
        geometry.innerWidth, 24, { isStatic: true, friction: 0.82,
          restitution: 0.015, label: 'v112-plinko-slot-floor' }),
      'body:plinko-slot-floor', 'slot-floor');
      createdBodies = pegBodies.concat(railBodies, dividerBodies,
        sensorBodies, [trampolineBody, slotFloorBody, contactChassisBody,
          contactChassisConstraint]);
      Composite.add(world, createdBodies);
      setMask(pegBodies.concat(railBodies, dividerBodies, sensorBodies,
        [slotFloorBody]), 0);
      buildRendererBoard();
      Events.on(engine, 'collisionStart', onCollisionStart);
      Events.on(engine, 'collisionActive', onCollisionActive);
      Events.on(engine, 'collisionEnd', onCollisionEnd);
      phase = 'attached';
      return snapshot();
    }

    function collisionParts(pair) {
      var aSelected = bodyOwnsPart(selectedBody, pair.bodyA) ||
        bodyOwnsPart(contactChassisBody, pair.bodyA);
      var bSelected = bodyOwnsPart(selectedBody, pair.bodyB) ||
        bodyOwnsPart(contactChassisBody, pair.bodyB);
      if (aSelected === bSelected) return null;
      return { other: aSelected ? pair.bodyB : pair.bodyA };
    }

    function collisionMetadata(pair) {
      var parts = collisionParts(pair);
      if (!parts) return null;
      var other = parts.other;
      var metadata = other.plugin && other.plugin.v112Plinko;
      if (!metadata && other.parent && other.parent.plugin) {
        metadata = other.parent.plugin.v112Plinko;
      }
      return metadata || null;
    }

    function appendContact(metadata) {
      if (!metadata || contactLog.length >= 4096) return;
      contactLog.push(Object.freeze({ tick: currentTick,
        kind: metadata.kind, ref: metadata.ref }));
    }

    function rebuildActiveContactState() {
      activeSensors.clear();
      activePairMetadata.forEach(function (metadata) {
        if (metadata.kind === 'slot-sensor') activeSensors.add(metadata.ref);
      });
    }

    function beginContact(pair, record) {
      var metadata = collisionMetadata(pair);
      if (!metadata) return;
      activePairMetadata.set(pair.id, metadata);
      if (metadata.kind === 'slot-sensor') {
        activeSensors.add(metadata.ref);
        contactedSensors.add(metadata.ref);
      }
      if (record) appendContact(metadata);
    }
    function endContact(pair) {
      var metadata = collisionMetadata(pair);
      if (!metadata) return;
      activePairMetadata.delete(pair.id);
      rebuildActiveContactState();
    }
    function onCollisionStart(event) {
      if (phase !== 'active') return;
      event.pairs.forEach(function (pair) { beginContact(pair, true); });
    }
    function onCollisionActive(event) {
      if (phase !== 'active') return;
      event.pairs.forEach(function (pair) { beginContact(pair, false); });
    }
    function onCollisionEnd(event) {
      if (phase !== 'active') return;
      event.pairs.forEach(endContact);
    }

    function start(input) {
      assertPhase(['attached'], 'start');
      var value = input || {};
      exactKeys(value, ['seed', 'entryVelocityX', 'angularVelocity'],
        'Plinko start input');
      seed = whole(value.seed == null ? 0 : value.seed,
        'Plinko seed', 0, 0xffffffff) >>> 0;
      if (value.entryVelocityX != null) {
        var entryVelocityX = finite(value.entryVelocityX,
          'Plinko entry velocity', -12, 12);
        Body.setVelocity(selectedBody, { x: entryVelocityX,
          y: selectedBody.velocity.y });
        Body.setVelocity(contactChassisBody, { x: entryVelocityX,
          y: contactChassisBody.velocity.y });
      }
      if (value.angularVelocity != null) {
        var entryAngularVelocity = finite(value.angularVelocity,
          'Plinko angular velocity', -1.5, 1.5);
        Body.setAngularVelocity(selectedBody, entryAngularVelocity);
        Body.setAngularVelocity(contactChassisBody, entryAngularVelocity);
      }
      if (selectedBody.position.x < geometry.innerLeft ||
          selectedBody.position.x > geometry.innerRight ||
          selectedBody.bounds.max.y < geometry.trampoline.bounds.top - 90 ||
          selectedBody.bounds.min.y > geometry.trampoline.bounds.bottom + 90) {
        throw new Error('Selected body must physically begin over the canonical trampoline');
      }
      setSelectedMaterial();
      currentTick = 0;
      lastDirectiveTick = 0;
      phase = 'active';
      return snapshot();
    }

    function physicalArrays(directive) {
      return {
        bodies: Array.isArray(directive.bodies) ? directive.bodies : [],
        forces: Array.isArray(directive.forces) ? directive.forces : [],
        impulses: Array.isArray(directive.impulses) ? directive.impulses : [],
        constraints: Array.isArray(directive.constraints) ? directive.constraints : [],
        sensors: Array.isArray(directive.sensors) ? directive.sensors : [],
      };
    }

    function exactScale(command, reference, x, y) {
      return command && command.entityRef === reference &&
        close(command.scaleX, x) && close(command.scaleY, y) &&
        Object.keys(command).every(function (key) {
          return ['entityRef', 'scaleX', 'scaleY'].indexOf(key) >= 0;
        });
    }

    function scaleTrampoline(targetX, targetY) {
      Body.scale(trampolineBody, targetX / trampolineScale.x,
        targetY / trampolineScale.y);
      trampolineScale = { x: targetX, y: targetY };
    }

    function expectedRecovery(previousTick, endTick) {
      var commands = [];
      for (var ordinal = 0; ordinal < RECOVERY_LIMIT; ordinal += 1) {
        var tick = RECOVERY_START_TICK + ordinal * RECOVERY_INTERVAL_TICKS;
        if (tick <= previousTick || tick > endTick) continue;
        var sign = ((seed + ordinal) & 1) === 0 ? 1 : -1;
        commands.push({ entityRef: 'body:flipper-main', x: sign * 2, y: 3,
          atX: null, atY: null });
      }
      return commands;
    }

    function sameImpulse(actual, expected) {
      return actual && actual.entityRef === expected.entityRef &&
        close(actual.x, expected.x) && close(actual.y, expected.y) &&
        (actual.atX == null) && (actual.atY == null) &&
        Object.keys(actual).every(function (key) {
          return ['entityRef', 'x', 'y', 'atX', 'atY'].indexOf(key) >= 0;
        });
    }

    function applyDirective(originValue, directiveValue) {
      assertPhase(['active'], 'applyDirective');
      var origin = required(originValue, 'Plinko directive origin', 16);
      if (['launch', 'step', 'contact'].indexOf(origin) < 0 || !plain(directiveValue)) {
        throw new TypeError('Plinko directive origin/data is invalid');
      }
      var physical = physicalArrays(directiveValue);
      if (origin === 'contact') {
        if (physical.bodies.length || physical.forces.length || physical.impulses.length ||
            physical.constraints.length || physical.sensors.length) {
          throw new Error('Plinko contact directives cannot mutate Matter physics');
        }
        return Object.freeze({ applied: true, origin: origin, commandCount: 0 });
      }
      if (physical.forces.length || physical.constraints.length || physical.sensors.length) {
        throw new Error('Plinko Matter host rejected an unsupported physical command');
      }
      if (origin === 'launch') {
        if (currentTick !== 0 || compressed || physical.impulses.length !== 0 ||
            physical.bodies.length !== 2 ||
            !physical.bodies.some(function (command) { return exactScale(command,
              'body:flipper-main', FLIPPER_COMPRESSED_SCALE_X,
              FLIPPER_COMPRESSED_SCALE_Y); }) ||
            !physical.bodies.some(function (command) { return exactScale(command,
              geometry.trampoline.colliderRef, 1.08, 0.38); })) {
          throw new Error('Plinko Matter host requires the exact one-time compression');
        }
        selectedRenderScale = { x: FLIPPER_COMPRESSED_SCALE_X,
          y: FLIPPER_COMPRESSED_SCALE_Y };
        scaleTrampoline(1.08, 0.38);
        compressed = true;
        return Object.freeze({ applied: true, origin: origin, commandCount: 2 });
      }
      if (!springApplied && currentTick === RELEASE_TICK) {
        if (!compressed || physical.bodies.length !== 2 || physical.impulses.length !== 1 ||
            !physical.bodies.some(function (command) { return exactScale(command,
              'body:flipper-main', 1, 1); }) ||
            !physical.bodies.some(function (command) { return exactScale(command,
              geometry.trampoline.colliderRef, 1, 1); }) ||
            !sameImpulse(physical.impulses[0], { entityRef: 'body:flipper-main',
              x: 0, y: SPRING_COMMAND_Y, atX: null, atY: null })) {
          throw new Error('Plinko Matter host requires the exact centered spring release');
        }
        selectedRenderScale = { x: 1, y: 1 };
        scaleTrampoline(1, 1);
        setMask([trampolineBody], 0);
        Body.setVelocity(selectedBody, { x: selectedBody.velocity.x,
          y: selectedBody.velocity.y + SPRING_COMMAND_Y * SPRING_VELOCITY_GAIN });
        Body.setVelocity(contactChassisBody, { x: contactChassisBody.velocity.x,
          y: contactChassisBody.velocity.y + SPRING_COMMAND_Y * SPRING_VELOCITY_GAIN });
        springApplied = true;
        lastDirectiveTick = currentTick;
        return Object.freeze({ applied: true, origin: origin, commandCount: 3 });
      }
      if (!springApplied && currentTick < RELEASE_TICK &&
          physical.bodies.length === 0 && physical.impulses.length === 0) {
        lastDirectiveTick = currentTick;
        return Object.freeze({ applied: true, origin: origin, commandCount: 0 });
      }
      if (!springApplied || physical.bodies.length) {
        throw new Error('Plinko Matter host rejected a missing, duplicate, or late spring release');
      }
      var expected = expectedRecovery(lastDirectiveTick, currentTick);
      if (physical.impulses.length !== expected.length ||
          physical.impulses.some(function (command, index) {
            return !sameImpulse(command, expected[index]);
          })) {
        throw new Error('Plinko Matter host accepts only scheduled recovery impulses');
      }
      expected.forEach(function (command) {
        Body.setVelocity(contactChassisBody, {
          x: contactChassisBody.velocity.x + command.x,
          y: contactChassisBody.velocity.y + command.y,
        });
        recoveryApplied += 1;
      });
      lastDirectiveTick = currentTick;
      return Object.freeze({ applied: true, origin: origin,
        commandCount: physical.impulses.length });
    }

    function enableBoard() {
      if (fieldEnabled) return;
      setMask(pegBodies.concat(railBodies, dividerBodies, sensorBodies,
        [slotFloorBody]), 0xffffffff);
      engine.gravity.scale = DROP_GRAVITY_SCALE;
      fieldEnabled = true;
    }

    function centroidSlot() {
      var x = contactChassisBody.position.x;
      var y = contactChassisBody.position.y;
      for (var index = 0; index < geometry.sensors.length; index += 1) {
        var bounds = geometry.sensors[index].bounds;
        if (x >= bounds.left && x <= bounds.right &&
            y >= bounds.top && y <= bounds.bottom) return index;
      }
      return null;
    }

    function updateSettlement() {
      if (settled || !fieldEnabled) return;
      var slot = centroidSlot();
      var sensorRef = slot == null ? null : geometry.sensors[slot].colliderRef;
      var speed = Math.hypot(contactChassisBody.velocity.x,
        contactChassisBody.velocity.y);
      var floorContact = Array.from(activePairMetadata.values()).some(function (metadata) {
        return metadata.kind === 'slot-floor';
      });
      var eligible = slot != null && floorContact &&
        contactedSensors.has(sensorRef) && speed < 0.42 &&
        Math.abs(contactChassisBody.angularVelocity) < 0.045;
      settleCounter = eligible ? settleCounter + 1 : 0;
      if (settleCounter >= SETTLE_TICKS) {
        settled = true;
        settledTick = currentTick;
        settledSlot = slot;
      }
    }

    function applyMeasuredAntiBalance(displacement) {
      if (!fieldEnabled || settled || contactChassisBody.position.y >=
          geometry.sensors[0].bounds.top - 60) {
        antiBalanceTicks = 0;
        return;
      }
      var speed = Math.hypot(contactChassisBody.velocity.x,
        contactChassisBody.velocity.y);
      var onField = Array.from(activePairMetadata.values()).some(function (metadata) {
        return metadata.kind === 'peg' || metadata.kind === 'peg-field' ||
          metadata.kind === 'rail-left' || metadata.kind === 'rail-right';
      });
      antiBalanceTicks = onField && speed < 0.08 && displacement < 0.05
        ? antiBalanceTicks + 1 : 0;
      if (antiBalanceTicks < 45 || antiBalanceApplied >= 48) return;
      var nearLeft = contactChassisBody.position.x < geometry.innerLeft + 80;
      var nearRight = contactChassisBody.position.x > geometry.innerRight - 80;
      var direction = nearLeft ? 1 : nearRight ? -1 :
        (((seed + antiBalanceApplied) & 1) === 0 ? 1 : -1);
      // This changes velocity, not position. It is a visible physical nudge
      // derived from an observed stall and cannot encode a destination slot.
      antiBalanceDirection = direction;
      antiBalanceBurstTicks = 8;
      antiBalanceApplied += 1;
      antiBalanceTicks = 0;
    }

    function integrateOneTick() {
      currentTick += 1;
      if (currentTick === BOARD_START_TICK) enableBoard();
      if (antiBalanceBurstTicks > 0) {
        // A short real force burst clears a symmetric balance without moving
        // the body directly. Alternating/rail-inward direction is independent
        // of reward geometry and therefore cannot preselect a slot.
        Body.applyForce(contactChassisBody, contactChassisBody.position, {
          x: antiBalanceDirection * contactChassisBody.mass * 0.02,
          y: contactChassisBody.mass * 0.035,
        });
        antiBalanceBurstTicks -= 1;
      }
      var before = copyPoint(selectedBody.position);
      Engine.update(engine, FIXED_DT_MS);
      var displacement = Math.hypot(selectedBody.position.x - before.x,
        selectedBody.position.y - before.y);
      maximumStepDisplacement = Math.max(maximumStepDisplacement, displacement);
      previousPosition = copyPoint(selectedBody.position);
      applyMeasuredAntiBalance(displacement);
      updateSettlement();
    }

    function rawMotion(startTick) {
      return { schema: 'PlinkoHostMotionEvidenceV1', fixedTickHz: FIXED_TICK_HZ,
        startTick: startTick, endTick: currentTick,
        integratedTicks: currentTick - startTick + 1,
        objectColliderRef: 'body:flipper-main',
        transform: { x: selectedBody.position.x, y: selectedBody.position.y,
          angle: selectedBody.angle },
        velocity: { x: selectedBody.velocity.x, y: selectedBody.velocity.y },
        angularVelocity: selectedBody.angularVelocity };
    }

    function step(input) {
      assertPhase(['active'], 'step');
      if (!plain(input)) throw new TypeError('Plinko step input is required');
      exactKeys(input, ['targetTick', 'elapsedMs'], 'Plinko step input');
      var targetTick;
      if (input.targetTick != null) {
        targetTick = whole(input.targetTick, 'Plinko target tick', currentTick + 1, 10000000);
      } else {
        var elapsedMs = finite(input.elapsedMs, 'Plinko elapsedMs', 0, 600000);
        targetTick = Math.round(elapsedMs * FIXED_TICK_HZ / 1000);
        if (!close(elapsedMs, targetTick * FIXED_DT_MS, 1e-6)) {
          throw new Error('Plinko Matter steps must align to the 60 Hz clock');
        }
        if (targetTick <= currentTick) throw new Error('Plinko Matter ticks must advance');
      }
      var startTick = currentTick + 1;
      while (currentTick < targetTick) integrateOneTick();
      return freezeData(rawMotion(startTick));
    }

    function resolveMotion(resource, metadata) {
      assertPhase(['active'], 'resolveMotion');
      if (resource !== selectedResource && resource !== selectedBody) {
        throw new Error('Plinko motion resolver received another collider resource');
      }
      if (!metadata || metadata.schema !== 'PlinkoMotionResolveContextV1' ||
          metadata.previousTick !== currentTick || metadata.boardGeometry !== geometry ||
          (binding && metadata.binding !== binding) ||
          metadata.binding.objectColliderRef !== 'body:flipper-main') {
        throw new Error('Plinko motion resolver context is stale or foreign');
      }
      return step({ elapsedMs: metadata.requestedStep.elapsedMs });
    }

    function cameraSnapshot() {
      var mode;
      if (currentTick < RELEASE_TICK) mode = 'trampoline-lock';
      else if (currentTick < APEX_TICK) mode = 'object-ascent-follow';
      else if (currentTick < BOARD_START_TICK) mode = 'apex-board-handoff';
      else {
        var sensorTop = geometry.sensors[0].bounds.top;
        var progress = clamp((selectedBody.position.y - geometry.top) /
          Math.max(1, geometry.bottom - geometry.top), 0, 1);
        mode = selectedBody.position.y >= sensorTop - 100
          ? 'prize-reveal' : (progress < 0.08 ? 'board-entry' : 'object-drop-follow');
      }
      var prizeReveal = mode === 'prize-reveal';
      var trackZoom = clamp(viewport.width / 720, 0.55, 0.92);
      var prizeZoom = clamp(viewport.width / (geometry.innerWidth + 80), 0.25, 1);
      return freezeData({ schema: 'PlinkoMatterCameraV1', mode: mode,
        targetRef: 'body:flipper-main',
        camX: prizeReveal ? geometry.centerX : selectedBody.position.x,
        camY: prizeReveal
          ? (geometry.sensors[0].bounds.top + geometry.bottom) / 2
          : selectedBody.position.y + viewport.height * 0.12,
        zoom: prizeReveal ? prizeZoom : trackZoom,
        allSlotsVisible: prizeReveal,
        fitBounds: prizeReveal ? {
          left: geometry.innerLeft - 40, right: geometry.innerRight + 40,
          top: geometry.sensors[0].bounds.top - 80, bottom: geometry.bottom + 40,
        } : null });
    }

    function snapshot() {
      if (phase === 'idle') return Object.freeze({ schema: 'PlinkoMatterSnapshotV1',
        phase: phase });
      var slot = settled ? settledSlot : centroidSlot();
      var elapsedMs = currentTick * FIXED_DT_MS;
      var dropMs = settledTick == null ? null :
        (settledTick - BOARD_START_TICK) * FIXED_DT_MS;
      return freezeData({ schema: 'PlinkoMatterSnapshotV1', phase: phase,
        tick: currentTick, elapsedMs: elapsedMs, fixedTickHz: FIXED_TICK_HZ,
        selected: { colliderRef: 'body:flipper-main', matterBodyId: selectedBody.id,
          sameBody: true, genericCircle: false,
          contactChassis: { colliderRef: 'body:plinko-contact-chassis',
            matterBodyId: contactChassisBody.id, shape: 'rounded-capsule',
            width: 42, height: 54, physicallyTethered: true,
            transform: { x: contactChassisBody.position.x,
              y: contactChassisBody.position.y,
              angle: contactChassisBody.angle },
            velocity: { x: contactChassisBody.velocity.x,
              y: contactChassisBody.velocity.y },
            angularVelocity: contactChassisBody.angularVelocity },
          compoundPartCount: Math.max(0, selectedBody.parts.length - 1),
          transform: { x: selectedBody.position.x, y: selectedBody.position.y,
            angle: selectedBody.angle, scaleX: selectedRenderScale.x,
            scaleY: selectedRenderScale.y }, bounds: copyBounds(selectedBody.bounds),
          velocity: copyPoint(selectedBody.velocity),
          angularVelocity: selectedBody.angularVelocity,
          appearanceRevision: binding ? binding.appearanceRevision : null,
          cosmeticId: binding ? binding.cosmeticId : null,
          colliderFingerprint: binding ? binding.colliderFingerprint : null,
          authoredParts: binding ? binding.authoredParts : [],
          internalDynamics: binding ? binding.internalDynamics : [] },
        spring: { compressed: compressed && !springApplied,
          applied: springApplied, appliedTick: springApplied ? RELEASE_TICK : null,
          impulse: springApplied ? { x: 0, y: SPRING_COMMAND_Y } : null,
          trampolineVisible: trampolineBody.collisionFilter.mask !== 0,
          scaleX: trampolineScale.x, scaleY: trampolineScale.y },
        board: rendererBoard,
        boardEnabled: fieldEnabled,
        camera: cameraSnapshot(),
        landing: { settled: settled, slotIndex: settled ? settledSlot : null,
          sensorRef: settled ? geometry.sensors[settledSlot].colliderRef : null,
          centroidSlotIndex: slot,
          actualSensorContact: settled ? contactedSensors.has(
            geometry.sensors[settledSlot].colliderRef) : false,
          settledTick: settledTick, dropMs: dropMs },
        recovery: { applied: recoveryApplied, limit: RECOVERY_LIMIT,
          antiBalanceApplied: antiBalanceApplied, antiBalanceLimit: 48 },
        timedOut: !settled && currentTick >= TIMEOUT_TICK,
        contactCount: contactLog.length, contactDigest: digestContacts(contactLog),
        maximumStepDisplacement: maximumStepDisplacement });
    }

    function cleanup() {
      if (phase === 'cleaned') return Object.freeze({ schema: 'PlinkoMatterCleanupV1',
        clean: true, removedBodies: 0, selectedPreserved: true, duplicate: true });
      if (phase === 'idle') {
        phase = 'cleaned';
        return Object.freeze({ schema: 'PlinkoMatterCleanupV1', clean: true,
          removedBodies: 0, selectedPreserved: true, duplicate: false });
      }
      Events.off(engine, 'collisionStart', onCollisionStart);
      Events.off(engine, 'collisionActive', onCollisionActive);
      Events.off(engine, 'collisionEnd', onCollisionEnd);
      createdBodies.forEach(function (body) { Composite.remove(world, body, true); });
      if (originalGravity) {
        engine.gravity.x = originalGravity.x;
        engine.gravity.y = originalGravity.y;
        engine.gravity.scale = originalGravity.scale;
      }
      restoreMaterial();
      var selectedPreserved = Composite.allBodies(world).indexOf(selectedBody) >= 0;
      var removed = createdBodies.length;
      phase = 'cleaned';
      createdBodies = [];
      return Object.freeze({ schema: 'PlinkoMatterCleanupV1', clean: selectedPreserved,
        removedBodies: removed, selectedPreserved: selectedPreserved, duplicate: false });
    }

    return Object.freeze({ schema: 'PlinkoMatterAdapterV1', attach: attach,
      start: start, step: step, resolveMotion: resolveMotion,
      applyDirective: applyDirective, snapshot: snapshot, cleanup: cleanup });
  }

  return Object.freeze({ schema: SCHEMA, FIXED_TICK_HZ: FIXED_TICK_HZ,
    FIXED_DT_MS: FIXED_DT_MS, SLOT_KINDS: SLOT_KINDS, create: create });
});
