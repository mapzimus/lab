// input.js — pointer flick detection (mouse + touch unified)

const Input = (() => {
  const MIN_DRAG = 22;   // px — small dead zone so a quick flick registers

  let canvas, onFlick;
  let dragging = false;
  let activePointerId = null;                  // lock onto ONE pointer per gesture
  let startX = 0, startY = 0;
  let curX = 0, curY = 0;
  let lastX = 0, lastY = 0, lastT = 0;
  let peakSpeed = 0, peakVx = 0, peakVy = 0;  // fastest instant of the gesture
  let enabled = false;
  let lastFlick = null;                        // debug: last flick vector

  function attach(cvs, flickCallback) {
    canvas  = cvs;
    onFlick = flickCallback;

    canvas.addEventListener('pointerdown',   onDown);
    canvas.addEventListener('pointermove',   onMove);
    canvas.addEventListener('pointerup',     onUp);
    canvas.addEventListener('pointercancel', onCancel);  // phantom-flick guard
  }

  function enable()  { enabled = true;  }
  function disable() { enabled = false; releaseGesture(); }

  function onDown(e) {
    if (!enabled) return;
    if (activePointerId !== null) return;      // already tracking a finger — ignore the 2nd
    e.preventDefault();
    activePointerId = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    dragging = true;
    const r = canvas.getBoundingClientRect();
    startX = curX = lastX = e.clientX - r.left;
    startY = curY = lastY = e.clientY - r.top;
    lastT = performance.now();
    peakSpeed = peakVx = peakVy = 0;
  }

  function onMove(e) {
    if (!dragging || e.pointerId !== activePointerId) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    curX = e.clientX - r.left;
    curY = e.clientY - r.top;
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
    if (!dragging || e.pointerId !== activePointerId) return;

    const dx = curX - startX, dy = curY - startY;
    const dist = Math.hypot(dx, dy);
    const wasEnabled = enabled;
    releaseGesture(e);                 // clear capture/state BEFORE the callback

    if (!wasEnabled || dist < MIN_DRAG) return;

    // Use the gesture's peak velocity. Fall back to a distance estimate if
    // we somehow captured almost no motion (e.g. one big jump then release).
    let vx = peakVx, vy = peakVy;
    if (peakSpeed < 80) { vx = dx * 10; vy = dy * 10; }

    lastFlick = { vx: Math.round(vx), vy: Math.round(vy), peak: Math.round(peakSpeed) };
    onFlick(vx, vy);
  }

  // pointercancel (palm rejection, OS gesture steal): reset, do NOT fire a flick.
  function onCancel(e) {
    if (e.pointerId !== activePointerId) return;
    releaseGesture(e);
  }

  function releaseGesture(e) {
    dragging = false;
    if (activePointerId !== null) {
      try { canvas.releasePointerCapture(activePointerId); } catch (_) {}
    }
    activePointerId = null;
  }

  function getLastFlick() { return lastFlick; }

  // Returns drag vector for drawing the preview arrow
  function getDragState() {
    if (!dragging) return null;
    return { startX, startY, curX, curY };
  }

  return { attach, enable, disable, getDragState, getLastFlick };
})();
