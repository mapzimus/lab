// input.js — pointer flick detection (mouse + touch unified)

const Input = (() => {
  const MIN_DRAG = 22;   // px — small dead zone so a quick flick registers
  // Gesture velocities are expressed in one canonical 1280x720 lane. Pointer
  // events arrive in CSS pixels, so an equivalent lane-relative swipe produces
  // the same launch on a phone, desktop, or split-screen lane. This replaces
  // the old pointer-type multipliers, which made touch and mouse fundamentally
  // different controls.
  const REFERENCE_WIDTH = 1280;
  const REFERENCE_HEIGHT = 720;

  let canvas, onFlick;
  let dragging = false;
  let ptrType = 'mouse';   // pointerType of the active gesture (touch/pen/mouse)
  let startX = 0, startY = 0;
  let curX = 0, curY = 0;
  let lastX = 0, lastY = 0, lastT = 0;
  let peakSpeed = 0, peakVx = 0, peakVy = 0;  // fastest instant of the gesture
  let rect = null;                             // canvas rect, captured at gesture start
  let enabled = false;
  let activePointerId = null;                  // the one pointer that owns the in-flight flick

  function eventTime(e) {
    const stamp = Number(e && e.timeStamp);
    return Number.isFinite(stamp) && stamp >= 0 ? stamp : performance.now();
  }

  function normalizedDelta(dx, dy) {
    const width = Math.max(1, Number(rect && rect.width) || REFERENCE_WIDTH);
    const height = Math.max(1, Number(rect && rect.height) || REFERENCE_HEIGHT);
    return {
      x: dx * REFERENCE_WIDTH / width,
      y: dy * REFERENCE_HEIGHT / height,
    };
  }

  function samplePointer(e) {
    if (!rect) return;
    const nextX = Number(e.clientX) - rect.left;
    const nextY = Number(e.clientY) - rect.top;
    if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return;
    const now = eventTime(e);
    // A few browser/driver combinations can repeat a stale coalesced sample.
    // Do not turn a backwards timestamp into a one-millisecond velocity spike.
    if (now < lastT) return;
    if (now === lastT) {
      // Some privacy/touch stacks quantize several samples to one timestamp.
      // Preserve the path endpoint but do not manufacture a one-millisecond
      // velocity spike; the canonical distance fallback remains available.
      curX = nextX;
      curY = nextY;
      lastX = nextX;
      lastY = nextY;
      return;
    }
    const dt = Math.max((now - lastT) / 1000, 0.001);
    const delta = normalizedDelta(nextX - lastX, nextY - lastY);
    const ivx = delta.x / dt;
    const ivy = delta.y / dt;
    const spd = Math.hypot(ivx, ivy);
    if (spd > peakSpeed) { peakSpeed = spd; peakVx = ivx; peakVy = ivy; }
    curX = nextX;
    curY = nextY;
    lastX = nextX;
    lastY = nextY;
    lastT = Math.max(lastT, now);
  }

  function pointerSamples(e) {
    let samples = [];
    if (e && typeof e.getCoalescedEvents === 'function') {
      try { samples = Array.from(e.getCoalescedEvents() || []); } catch (_) {}
    }
    // Browsers differ on whether the dispatching event is also the final
    // coalesced sample. Include it exactly once so pointer-up-only movement is
    // never discarded.
    const last = samples[samples.length - 1];
    if (!last || last.clientX !== e.clientX || last.clientY !== e.clientY ||
        eventTime(last) !== eventTime(e)) samples.push(e);
    samples.sort((a, b) => eventTime(a) - eventTime(b));
    return samples;
  }

  function sampleEvent(e) {
    for (const sample of pointerSamples(e)) samplePointer(sample);
  }

  function currentSignal() {
    const rawDx = curX - startX;
    const rawDy = curY - startY;
    const fallback = normalizedDelta(rawDx, rawDy);
    if (peakSpeed >= 80) return { vx: peakVx, vy: peakVy, peakSpeed };
    return { vx: fallback.x * 10, vy: fallback.y * 10, peakSpeed };
  }

  function attach(cvs, flickCallback) {
    canvas  = cvs;
    onFlick = flickCallback;

    canvas.addEventListener('pointerdown',  onDown);
    canvas.addEventListener('pointermove',  onMove);
    canvas.addEventListener('pointerup',    onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('lostpointercapture', onLostPointerCapture);
  }

  function enable()  { enabled = true;  }
  function disable() {
    enabled = false;
    dragging = false;
    activePointerId = null;
    rect = null;
  }

  function onDown(e) {
    if (!enabled) return;
    // Single-flick ownership: ignore extra fingers while one flick is in flight,
    // so a second touch (or a palm) can't hijack the in-progress drag state.
    if (dragging) return;
    e.preventDefault();
    activePointerId = e.pointerId;
    ptrType = e.pointerType || 'mouse';
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    dragging = true;
    // Capture the canvas rect ONCE at gesture start. Recomputing it per move
    // event means a mid-gesture chrome shift (e.g. a mobile address bar
    // collapsing) injects a fake dy and biases the flick's vertical speed.
    rect = canvas.getBoundingClientRect();
    startX = curX = lastX = e.clientX - rect.left;
    startY = curY = lastY = e.clientY - rect.top;
    lastT = eventTime(e);
    peakSpeed = peakVx = peakVy = 0;
  }

  function onMove(e) {
    if (!dragging || !rect || e.pointerId !== activePointerId) return;
    e.preventDefault();
    sampleEvent(e);
  }

  function onUp(e) {
    if (!dragging || !enabled || e.pointerId !== activePointerId) return;
    e.preventDefault();
    sampleEvent(e);
    const signal = currentSignal();
    const dx = curX - startX, dy = curY - startY;
    const canonicalDrag = normalizedDelta(dx, dy);
    const dist = Math.hypot(canonicalDrag.x, canonicalDrag.y);
    dragging = false;
    activePointerId = null;
    rect = null;
    if (dist + 1e-6 < MIN_DRAG) return;
    onFlick(signal.vx, signal.vy, ptrType);
  }

  // A pointercancel (palm rejection, OS gesture interrupt, lost capture) must
  // ABORT the gesture WITHOUT firing a flick. The old code routed cancel to
  // onUp, so an interrupted drag could launch a phantom flick.
  function onCancel(e) {
    if (e.pointerId !== activePointerId) return;
    dragging = false;
    activePointerId = null;
    rect = null;
  }

  function onLostPointerCapture(e) {
    if (!dragging || e.pointerId !== activePointerId) return;
    dragging = false;
    activePointerId = null;
    rect = null;
  }

  // Returns drag vector for drawing the preview arrow
  function getDragState() {
    if (!dragging) return null;
    // Practice must visualize the same peak-velocity signal that onUp launches.
    // Distance alone badly under-reports a short, fast flick and made a
    // full-power throw look like roughly 25% on the feedback meter.
    const signal = currentSignal();
    const canonicalDrag = normalizedDelta(curX - startX, curY - startY);
    return {
      startX, startY, curX, curY,
      peakVx, peakVy, peakSpeed,
      launchVx: signal.vx,
      launchVy: signal.vy,
      canonicalDx: canonicalDrag.x,
      canonicalDy: canonicalDrag.y,
      canonicalDistance: Math.hypot(canonicalDrag.x, canonicalDrag.y),
      pointerType: ptrType,
    };
  }

  return { attach, enable, disable, getDragState };
})();
