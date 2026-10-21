// v112-plinko-live.js -- bounded live-engine bridge for canonical Matter Plinko.
(function (root, factory) {
  'use strict';
  var PlinkoMatter = root && root.FlipgameV112PlinkoMatter;
  if (typeof module === 'object' && module && module.exports) {
    PlinkoMatter = require('./v112-plinko-matter.js');
  }
  var api = factory(PlinkoMatter);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) Object.defineProperty(root, 'FlipgameV112PlinkoLive', {
    value: api, enumerable: true, writable: false, configurable: false,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this, function (PlinkoMatter) {
  'use strict';

  if (!PlinkoMatter || PlinkoMatter.schema !== 'FlipgameV112PlinkoMatterV1') {
    throw new Error('FlipgameV112PlinkoMatter must load before the live Plinko bridge');
  }

  var SCHEMA = 'FlipgameV112PlinkoLiveV1';
  var FIXED_TICK_HZ = PlinkoMatter.FIXED_TICK_HZ;
  var RELEASE_TICK = 24;
  var RECOVERY_START_TICK = 1464;
  var RECOVERY_INTERVAL_TICKS = 30;
  var RECOVERY_LIMIT = 4;
  var CANONICAL_TO_LEGACY = Object.freeze({
    'lives-doubled': 'double',
    'everyone-else-halved': 'halve',
    'always-magnet': 'magnet',
    'automatic-loss': 'lose',
    'automatic-win': 'win',
  });

  function finite(value, label, minimum, maximum) {
    var result = Number(value);
    if (!Number.isFinite(result)) throw new TypeError(label + ' must be finite');
    if (minimum != null && result < minimum) throw new RangeError(label + ' is below its minimum');
    if (maximum != null && result > maximum) throw new RangeError(label + ' exceeds its maximum');
    return result;
  }
  function uint32(value, label) {
    var result = finite(value, label, 0, 0xffffffff);
    if (!Number.isSafeInteger(result)) throw new TypeError(label + ' must be an unsigned integer');
    return result >>> 0;
  }
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }
  function rectanglePart(entityId, colliderRef, geometryRole,
      left, top, width, height) {
    return freeze({ entityId: entityId, colliderRef: colliderRef,
      geometryRole: geometryRole,
      transform: { x: left + width / 2, y: top + height / 2,
        angle: 0, scaleX: 1, scaleY: 1 },
      bounds: { left: left, top: top, width: width, height: height,
        right: left + width, bottom: top + height } });
  }
  function hashText(value) {
    var text = String(value);
    var hash = 0x811c9dc5;
    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }
  function stableFingerprint(prefix, value) {
    return prefix + '-' + hashText(prefix + ':' + JSON.stringify(value));
  }
  function rounded(value) { return Math.round(Number(value) * 1000) / 1000; }

  // This is the live projection of the private PlinkoBoardGeometryV1 contract.
  // The qualified Matter adapter validates every invariant again at attach.
  function canonicalGeometry(layoutValue) {
    var layout = layoutValue || {};
    var width = finite(layout.width, 'Plinko layout width', 240, 100000);
    finite(layout.height, 'Plinko layout height', 240, 100000);
    var groundY = finite(layout.groundY, 'Plinko ground', -100000, 100000);
    var railWidth = 18;
    var innerWidth = 1080;
    var boardWidth = innerWidth + railWidth * 2;
    var centerX = width / 2;
    var bottom = groundY + 40;
    var top = bottom - 2450;
    var innerLeft = centerX - innerWidth / 2;
    var innerRight = centerX + innerWidth / 2;
    var slotWidth = 120;
    var slotBandHeight = 150;
    var sensorTop = bottom - slotBandHeight;
    var pegRows = [];
    for (var rowIndex = 0; rowIndex < 24; rowIndex += 1) {
      var pegCount = rowIndex % 2 === 0 ? 11 : 10;
      var rowY = top + 105 + rowIndex * 92;
      var centers = [];
      for (var pegIndex = 0; pegIndex < pegCount; pegIndex += 1) {
        centers.push(freeze({
          x: innerLeft + (pegIndex + (pegCount === 11 ? 0.5 : 1)) *
            (innerWidth / 11),
          y: rowY,
          radius: 9,
        }));
      }
      pegRows.push(freeze({ rowIndex: rowIndex, y: rowY,
        centers: Object.freeze(centers) }));
    }
    var rails = [
      rectanglePart('plinko-rail-left', 'body:plinko-rail-left', 'rail-left',
        centerX - boardWidth / 2, top, railWidth, bottom - top),
      rectanglePart('plinko-rail-right', 'body:plinko-rail-right', 'rail-right',
        centerX + boardWidth / 2 - railWidth, top, railWidth, bottom - top),
    ];
    var dividers = [];
    for (var dividerIndex = 0; dividerIndex < 8; dividerIndex += 1) {
      dividers.push(rectanglePart('plinko-divider-' + dividerIndex,
        'body:plinko-divider-' + dividerIndex, 'divider-' + dividerIndex,
        innerLeft + slotWidth * (dividerIndex + 1) - 5,
        sensorTop - 18, 10, bottom - sensorTop + 18));
    }
    var sensors = [];
    for (var sensorIndex = 0; sensorIndex < 9; sensorIndex += 1) {
      sensors.push(rectanglePart('plinko-slot-' + sensorIndex,
        'sensor:plinko-slot-' + sensorIndex, 'slot-' + sensorIndex,
        innerLeft + slotWidth * sensorIndex + 1, sensorTop,
        slotWidth - 2, bottom - sensorTop));
    }
    var board = rectanglePart('plinko-board-24', 'body:plinko-board-24',
      'peg-field-compound', centerX - boardWidth / 2, top,
      boardWidth, bottom - top);
    var trampoline = rectanglePart('plinko-opening-trampoline',
      'body:plinko-opening-trampoline', 'opening-trampoline',
      centerX - 130, groundY - 28, 260, 56);
    var physics = freeze({ schema: 'PlinkoBoardPhysicsV1',
      fixedTickHz: FIXED_TICK_HZ,
      // The selected authored compound remains the visible/live resource. A
      // standardized rounded capsule, physically tethered by the Matter host,
      // is its event-only contact envelope so every Flipper traverses the
      // same board without replacing or simplifying the selected body.
      selectedObjectEnvelope: { shape: 'rounded-capsule', width: 42,
        height: 54, density: 0.008, friction: 0.005,
        frictionAir: 0.02, restitution: 0.24 },
      pegField: { colliderRef: board.colliderRef,
        bodyType: 'static-compound', shapeSource: 'pegRows', pegCount: 252,
        pegRadius: 9 },
      rails: { bodyType: 'static-rectangles',
        colliderRefs: rails.map(function (part) { return part.colliderRef; }) },
      dividers: { bodyType: 'static-rectangles',
        colliderRefs: dividers.map(function (part) { return part.colliderRef; }) },
      slotSensors: { bodyType: 'static-sensors',
        colliderRefs: sensors.map(function (part) { return part.colliderRef; }) },
      trampoline: { colliderRef: trampoline.colliderRef,
        bodyType: 'kinematic-spring-platform', compressedScaleX: 1.08,
        compressedScaleY: 0.38, releaseImpulse: { x: 0, y: -28 } },
    });
    var core = { schema: 'PlinkoBoardGeometryV1', version: 1,
      rowCount: 24, slotCount: 9, centerX: centerX, top: top,
      bottom: bottom, width: boardWidth, innerLeft: innerLeft,
      innerRight: innerRight, innerWidth: innerWidth, rowSpacing: 92,
      slotWidth: slotWidth, slotBandHeight: slotBandHeight,
      board: board, trampoline: trampoline, pegRows: Object.freeze(pegRows),
      rails: Object.freeze(rails), dividers: Object.freeze(dividers),
      sensors: Object.freeze(sensors), physics: physics };
    core.fingerprint = stableFingerprint('plinko-board-geometry-v1', core);
    return freeze(core);
  }

  function colliderFingerprint(body) {
    var parts = body.parts && body.parts.length > 1 ? body.parts.slice(1) : [body];
    var material = parts.map(function (part) {
      return [rounded(part.position.x - body.position.x),
        rounded(part.position.y - body.position.y),
        rounded(part.bounds.max.x - part.bounds.min.x),
        rounded(part.bounds.max.y - part.bounds.min.y),
        rounded(part.area)].join(':');
    }).join('|');
    return 'matter-compound-' + parts.length + '-' + hashText(material);
  }

  function bindingFor(body, appearanceValue) {
    var appearance = appearanceValue || {};
    var authoredParts = Array.isArray(appearance.authoredParts)
      ? appearance.authoredParts.map(String).slice(0, 32)
      : (body.parts && body.parts.length > 1 ? body.parts.slice(1) : [body])
        .map(function (_, index) { return 'selected-part-' + (index + 1); });
    var dynamics = Array.isArray(appearance.internalDynamics)
      ? appearance.internalDynamics.map(String).slice(0, 32)
      : ['host-owned-object-dynamics'];
    var core = { schema: 'PlinkoFlipperBindingV1', version: 1,
      flipperId: String(appearance.flipperId || 'selected-flipper'),
      variantId: String(appearance.variantId || 'selected-variant'),
      appearanceRevision: String(appearance.appearanceRevision || 'live-selected-v1'),
      cosmeticId: String(appearance.cosmeticId || 'none'),
      authoredParts: authoredParts,
      internalDynamics: dynamics,
      physicsProfileId: String(appearance.physicsProfileId || 'competitive-shared'),
      objectColliderRef: 'body:flipper-main',
      colliderFingerprint: colliderFingerprint(body),
    };
    core.fingerprint = stableFingerprint('plinko-flipper-binding-v1', core);
    return freeze(core);
  }

  function directiveAt(tick, seed) {
    if (tick === 0) return { origin: 'launch', value: { bodies: [
      { entityRef: 'body:flipper-main', scaleX: 1.18, scaleY: 0.62 },
      { entityRef: 'body:plinko-opening-trampoline', scaleX: 1.08,
        scaleY: 0.38 },
    ], impulses: [] } };
    if (tick === RELEASE_TICK) return { origin: 'step', value: { bodies: [
      { entityRef: 'body:flipper-main', scaleX: 1, scaleY: 1 },
      { entityRef: 'body:plinko-opening-trampoline', scaleX: 1, scaleY: 1 },
    ], impulses: [{ entityRef: 'body:flipper-main', x: 0, y: -28,
      atX: null, atY: null }] } };
    var ordinal = tick >= RECOVERY_START_TICK &&
      tick <= RECOVERY_START_TICK + (RECOVERY_LIMIT - 1) * RECOVERY_INTERVAL_TICKS &&
      (tick - RECOVERY_START_TICK) % RECOVERY_INTERVAL_TICKS === 0
      ? (tick - RECOVERY_START_TICK) / RECOVERY_INTERVAL_TICKS : null;
    var impulses = ordinal == null ? [] : [{ entityRef: 'body:flipper-main',
      x: ((seed + ordinal) & 1) === 0 ? 2 : -2, y: 3,
      atX: null, atY: null }];
    return { origin: 'step', value: { bodies: [], impulses: impulses } };
  }

  function legacyBoardBase(snapshot) {
    var board = snapshot.board;
    return freeze({ schema: 'PlinkoLiveRenderBoardV1',
      authority: board.fingerprint, left: board.innerLeft,
      right: board.innerRight, top: board.top, bottom: board.bottom,
      slotH: board.slots[0].bounds.height, rows: board.pegRows.length,
      pegs: board.pegs.map(function (peg) {
        return { x: peg.x, y: peg.y, r: peg.radius,
          rowIndex: peg.rowIndex, pegIndex: peg.pegIndex };
      }),
      dividers: board.dividers.map(function (bounds) {
        return { x: (bounds.left + bounds.right) / 2,
          y0: bounds.top, y1: bounds.bottom, bounds: bounds };
      }),
      slots: board.slots.map(function (slot) {
        return { index: slot.index, kind: CANONICAL_TO_LEGACY[slot.kind],
          canonicalKind: slot.kind, sensorRef: slot.sensorRef,
          x0: slot.bounds.left, x1: slot.bounds.right, bounds: slot.bounds };
      }),
      rails: board.rails,
      trampoline: board.trampoline,
      antiWedge: true,
    });
  }

  // The 252 pegs and sensor geometry are immutable. Keep one projection and
  // allocate only the tiny dynamic shell per fixed tick; rebuilding/freeze-
  // walking the full board at 60 Hz would create avoidable classroom-device
  // garbage collection pauses.
  function legacyBoard(snapshot, baseValue) {
    var base = baseValue || legacyBoardBase(snapshot);
    return freeze(Object.assign({}, base, {
      trampoline: Object.assign({}, base.trampoline, {
        compressed: snapshot.spring.compressed,
        released: snapshot.spring.applied,
        scaleX: snapshot.spring.scaleX,
        scaleY: snapshot.spring.scaleY,
      }),
      camera: snapshot.camera,
      boardEnabled: snapshot.boardEnabled,
      contactDigest: snapshot.contactDigest,
      antiWedgeNudges: snapshot.recovery.antiBalanceApplied,
    }));
  }

  function outcomeFrom(snapshot) {
    var landing = snapshot.landing;
    if (!landing.settled || landing.actualSensorContact !== true ||
        !Number.isSafeInteger(landing.slotIndex) || landing.slotIndex < 0 ||
        landing.slotIndex >= snapshot.board.slots.length) return null;
    var slot = snapshot.board.slots[landing.slotIndex];
    if (slot.sensorRef !== landing.sensorRef) {
      throw new Error('Plinko settled sensor does not match its canonical slot');
    }
    return freeze({ schema: 'PlinkoLiveOutcomeV1', slotIndex: landing.slotIndex,
      sensorRef: landing.sensorRef, canonicalPrize: slot.kind,
      legacyPrize: CANONICAL_TO_LEGACY[slot.kind],
      result: slot.kind === 'automatic-loss' ? 'MISS' : 'MAKE',
      settledTick: landing.settledTick, dropMs: landing.dropMs,
      actualSensorContact: true, contactDigest: snapshot.contactDigest });
  }

  function create(optionsValue) {
    var options = optionsValue || {};
    var Matter = options.Matter;
    if (!Matter || !Matter.Body || !Matter.Composite || !Matter.Engine) {
      throw new TypeError('The live Plinko bridge requires Matter.js');
    }
    var adapter = PlinkoMatter.create({ Matter: Matter });
    var phase = 'idle';
    var selectedBody = null;
    var geometry = null;
    var seed = 0;
    var last = null;
    var originalPartIds = null;
    var renderBoardBase = null;

    function attach(inputValue) {
      if (phase !== 'idle') throw new Error('Live Plinko can attach only once');
      var input = inputValue || {};
      seed = uint32(input.seed, 'Plinko seed');
      selectedBody = input.selectedBody;
      if (!selectedBody || typeof selectedBody.id !== 'number' ||
          !Array.isArray(selectedBody.parts) ||
          Matter.Composite.allBodies(input.world).indexOf(selectedBody) < 0) {
        throw new TypeError('Live Plinko requires the selected world body');
      }
      originalPartIds = selectedBody.parts.map(function (part) { return part.id; });
      geometry = canonicalGeometry({ width: input.width, height: input.height,
        groundY: input.groundY });
      // Seat the existing selected body above the physical trampoline. This is
      // the only prelaunch placement; no in-flight position correction exists.
      var desiredBottom = geometry.trampoline.bounds.top - 7;
      Matter.Body.translate(selectedBody, { x: geometry.centerX - selectedBody.position.x,
        y: desiredBottom - selectedBody.bounds.max.y });
      var binding = bindingFor(selectedBody, input.appearance);
      try {
        adapter.attach({ engine: input.engine, world: input.world,
          selectedBody: selectedBody, selectedResource: selectedBody,
          geometry: geometry, binding: binding,
          viewport: { width: input.width, height: input.height } });
        adapter.start({ seed: seed,
          entryVelocityX: finite(input.entryVelocityX, 'Plinko entry velocity', -12, 12),
          angularVelocity: finite(input.angularVelocity,
            'Plinko angular velocity', -1.5, 1.5) });
        var launch = directiveAt(0, seed);
        adapter.applyDirective(launch.origin, launch.value);
        last = adapter.snapshot();
        renderBoardBase = legacyBoardBase(last);
        phase = 'active';
        return snapshot();
      } catch (error) {
        try { adapter.cleanup(); } catch (_) {}
        phase = 'failed';
        throw error;
      }
    }

    function step() {
      if (phase !== 'active') throw new Error('Live Plinko is not active');
      var targetTick = last.tick + 1;
      adapter.step({ targetTick: targetTick });
      var directive = directiveAt(targetTick, seed);
      adapter.applyDirective(directive.origin, directive.value);
      last = adapter.snapshot();
      return snapshot();
    }

    function snapshot() {
      if (!last) return freeze({ schema: 'PlinkoLiveSnapshotV1', phase: phase });
      var partIds = selectedBody.parts.map(function (part) { return part.id; });
      var sameParts = partIds.length === originalPartIds.length &&
        partIds.every(function (id, index) { return id === originalPartIds[index]; });
      return freeze({ schema: 'PlinkoLiveSnapshotV1', phase: phase,
        tick: last.tick, elapsedMs: last.elapsedMs,
        selectedBodyId: selectedBody.id, selectedBodyPreserved: sameParts &&
          last.selected.sameBody === true && last.selected.genericCircle === false,
        selectedCompoundPartCount: last.selected.compoundPartCount,
        board: legacyBoard(last, renderBoardBase), camera: last.camera,
        spring: last.spring, boardEnabled: last.boardEnabled,
        landing: last.landing, outcome: outcomeFrom(last),
        timedOut: last.timedOut, contactCount: last.contactCount,
        contactDigest: last.contactDigest, recovery: last.recovery,
        adapter: last });
    }

    function cleanup() {
      if (phase === 'cleaned') return freeze({ schema: 'PlinkoLiveCleanupV1',
        clean: true, duplicate: true, selectedBodyPreserved: true });
      var report = adapter.cleanup();
      var preserved = !!selectedBody &&
        selectedBody.parts.map(function (part) { return part.id; }).every(
          function (id, index) { return id === originalPartIds[index]; });
      phase = 'cleaned';
      last = null;
      renderBoardBase = null;
      return freeze({ schema: 'PlinkoLiveCleanupV1',
        clean: report.clean === true && preserved,
        duplicate: false, selectedBodyPreserved: preserved,
        adapter: report });
    }

    return Object.freeze({ schema: 'PlinkoLiveBridgeV1', attach: attach,
      step: step, snapshot: snapshot, cleanup: cleanup });
  }

  return Object.freeze({ schema: SCHEMA, FIXED_TICK_HZ: FIXED_TICK_HZ,
    canonicalGeometry: canonicalGeometry, create: create });
});
