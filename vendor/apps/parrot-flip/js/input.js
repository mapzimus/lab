// input.js — pointer flick detection (mouse + touch unified)

const Input = (() => {
  const MIN_DRAG = 22;   // px — small dead zone so a quick flick registers

  let canvas, onFlick;
  let dragging = false;
  let startX = 0, startY = 0;
  let curX = 0, curY = 0;
  let lastX = 0, lastY = 0, lastT = 0;
  let peakSpeed = 0, peakVx = 0, peakVy = 0;  // fastest instant of the gesture
  let rect = null;                             // canvas rect, captured at gesture start
  let enabled = false;
  let activePointerId = null;                  // the one pointer that owns the in-flight flick

  function attach(cvs, flickCallback) {
    canvas  = cvs;
    onFlick = flickCallback;

    canvas.addEventListener('pointerdown',  onDown);
    canvas.addEventListener('pointermove',  onMove);
    canvas.addEventListener('pointerup',    onUp);
    canvas.addEventListener('pointercancel', onCancel);
  }

  function enable()  { enabled = true;  }
  function disable() { enabled = false; dragging = false; activePointerId = null; }

  function onDown(e) {
    if (!enabled) return;
    // Single-flick ownership: ignore extra fingers while one flick is in flight,
    // so a second touch (or a palm) can't hijack the in-progress drag state.
    if (dragging) return;
    e.preventDefault();
    activePointerId = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    dragging = true;
    // Capture the canvas rect ONCE at gesture start. Recomputing it per move
    // event means a mid-gesture chrome shift (e.g. a mobile address bar
    // collapsing) injects a fake dy and biases the flick's vertical speed.
    rect = canvas.getBoundingClientRect();
    startX = curX = lastX = e.clientX - rect.left;
    startY = curY = lastY = e.clientY - rect.top;
    lastT = performance.now();
    peakSpeed = peakVx = peakVy = 0;
  }

  function onMove(e) {
    if (!dragging || !rect || e.pointerId !== activePointerId) return;
    e.preventDefault();
    curX = e.clientX - rect.left;
    curY = e.clientY - rect.top;
    const now = performance.now();
    const dt = Math.max((now - lastT) / 1000, 0.001);
    const ivx = (curX - lastX) / dt;   // instantaneous velocity this sample
    const ivy = (curY - lastY) / dt;
    const spd = Math.hypot(ivx, ivy);
    // Capture the fastest instant — that's the "snap", robust to a pause
    // before release (which would otherwise read as zero velocity).
    if (spd > peakSpeed) { peakSpeed = spd; peakVx = ivx; peakVy = ivy; }
    lastX = curX; lastY = curY; lastT = now;
  }

  function onUp(e) {
    if (!dragging || !enabled || e.pointerId !== activePointerId) return;
    dragging = false;
    activePointerId = null;

    const dx = curX - startX, dy = curY - startY;
    const dist = Math.hypot(dx, dy);
    if (dist < MIN_DRAG) return;

    // Use the gesture's peak velocity. Fall back to a distance estimate if
    // we somehow captured almost no motion (e.g. one big jump then release).
    let vx = peakVx, vy = peakVy;
    if (peakSpeed < 80) { vx = dx * 10; vy = dy * 10; }

    onFlick(vx, vy);
  }

  // A pointercancel (palm rejection, OS gesture interrupt, lost capture) must
  // ABORT the gesture WITHOUT firing a flick. The old code routed cancel to
  // onUp, so an interrupted drag could launch a phantom flick.
  function onCancel(e) {
    if (e.pointerId !== activePointerId) return;
    dragging = false;
    activePointerId = null;
  }

  // Returns drag vector for drawing the preview arrow
  function getDragState() {
    if (!dragging) return null;
    return { startX, startY, curX, curY };
  }

  return { attach, enable, disable, getDragState };
})();
