// Read-only renderer bridge for the qualified Matter host. Camera geometry is
// recomputed in CSS pixels on resize; the physical board is never resized.
// Load before renderer.js; pass adapter.snapshot() as frame.plinkoSnapshot.
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.defineProperty(root, 'FlipgameV112PlinkoPresentation', { value: factory() });
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  var boards = new WeakMap();
  var kinds = Object.freeze({ 'lives-doubled': 'double', 'everyone-else-halved': 'halve',
    'always-magnet': 'magnet', 'automatic-loss': 'lose', 'automatic-win': 'win' });
  var labels = Object.freeze({ double: 'Lives Doubled', halve: 'Everyone Else Halved',
    magnet: 'Always Magnet', lose: 'Automatic Loss', win: 'Automatic Win' });
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function project(snapshot, viewport) {
    if (!snapshot || snapshot.schema !== 'PlinkoMatterSnapshotV1' ||
        snapshot.phase === 'idle' || snapshot.phase === 'cleaned') return null;
    if (!viewport || !finite(viewport.width) || !finite(viewport.height) ||
        viewport.width <= 0 || viewport.height <= 0) throw new TypeError('Positive CSS viewport required');
    var source = snapshot.board, selected = snapshot.selected;
    if (!source || source.schema !== 'PlinkoMatterRenderBoardV1' || !selected ||
        selected.colliderRef !== 'body:flipper-main' || !selected.sameBody ||
        source.pegRows.length !== 24 || source.slots.length !== 9) {
      throw new TypeError('Qualified Plinko render snapshot required');
    }
    var transform = selected.transform;
    if (![transform.x, transform.y, transform.angle, transform.scaleX, transform.scaleY].every(finite)) {
      throw new TypeError('Measured selected-Flipper transform required');
    }
    var board = boards.get(source);
    if (!board) {
      board = freeze({ left: source.innerLeft, right: source.innerRight,
        top: source.top, bottom: source.bottom,
        slotH: source.bottom - source.slots[0].bounds.top,
        pegs: source.pegs.map(function (peg) { return { x: peg.x, y: peg.y, r: peg.radius }; }),
        dividers: source.dividers.map(function (part) {
          return { x: (part.left + part.right) / 2, y0: part.top, y1: part.bottom };
        }),
        slots: source.slots.map(function (slot) {
          return { index: slot.index, kind: kinds[slot.kind], label: labels[kinds[slot.kind]],
            x0: slot.bounds.left, x1: slot.bounds.right };
        }),
      });
      boards.set(source, board);
    }
    var width = viewport.width, height = viewport.height;
    // Do not use the host's early 'prize-reveal' target while the Flipper is
    // still falling. A phone must track the actual body, not a board midpoint.
    var settled = snapshot.landing.settled;
    var zoom = Math.min(1.6, Math.max(0.65, width / 1000), height / 440);
    var camX = transform.x, camY = transform.y;
    if (settled) {
      zoom = Math.min(width / (board.right - board.left + 100),
        Math.max(1, height - 190) / (board.slotH + 240), 1.6);
      camX = (board.left + board.right) / 2;
      camY = board.bottom - board.slotH / 2 - 20;
    }
    var b = selected.bounds;
    var spring = snapshot.spring, tb = source.trampoline.bounds;
    var progress = Math.max(0, Math.min(1, (transform.y - source.top) / (source.bottom - source.top)));
    return freeze({ schema: 'PlinkoPresentationV1', board: board,
      boardVisible: snapshot.boardEnabled,
      // A render proxy, never a replacement body or a simulated scoring target.
      bottle: { id: selected.matterBodyId, position: { x: transform.x, y: transform.y },
        angle: transform.angle, velocity: { x: selected.velocity.x, y: selected.velocity.y },
        angularVelocity: selected.angularVelocity,
        bounds: { min: { x: b.left, y: b.top }, max: { x: b.right, y: b.bottom } } },
      scale: { x: transform.scaleX, y: transform.scaleY },
      spring: { visible: spring.trampolineVisible, compressed: spring.compressed,
        x: (tb.left + tb.right) / 2, y: (tb.top + tb.bottom) / 2,
        width: tb.width * spring.scaleX, height: tb.height * spring.scaleY },
      view: { camX: camX, camY: camY, zoom: zoom, tracking: 'plinko',
        directTracking: true, sideWalls: false, worldW: board.right + 40,
        worldH: board.bottom + 80 },
      progress: progress, settled: settled,
      selectedSlot: settled ? snapshot.landing.slotIndex : null,
      status: settled ? board.slots[snapshot.landing.slotIndex].label :
        spring.compressed ? 'Spring loaded' : !snapshot.boardEnabled ? 'Lift-off' : 'Peg drop',
      timedOut: snapshot.timedOut,
    });
  }
  return Object.freeze({ project: project });
});
