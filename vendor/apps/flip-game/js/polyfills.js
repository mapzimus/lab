// polyfills.js — tiny environment shims, loaded FIRST (after matter, before game).
// Keeps the game running on older embedded WebViews (the offline-APK target).

// ── CanvasRenderingContext2D.prototype.roundRect ───────────────────────────
// Older Android System WebView builds (pre-Chromium-99) lack roundRect, so the
// renderer's bottle-drawing calls would throw → a blank canvas. Install a
// spec-faithful number-radius implementation only when the native one is absent
// (modern engines keep their native, hardware-accelerated version untouched).
// The renderer only ever passes a single number radius, so that's all we handle.
if (typeof CanvasRenderingContext2D !== 'undefined' &&
    !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    // Normalize negative width/height the way the native impl does.
    if (w < 0) { x += w; w = -w; }
    if (h < 0) { y += h; h = -h; }
    let rad = typeof r === 'number' ? r : 0;
    rad = Math.min(rad, w / 2, h / 2);   // clamp so corners never overlap
    // moveTo + four arcTo traces the same path the native roundRect produces,
    // so fills/strokes/clips inside the caller's transform render identically.
    this.moveTo(x + rad, y);
    this.arcTo(x + w, y,     x + w, y + h, rad);
    this.arcTo(x + w, y + h, x,     y + h, rad);
    this.arcTo(x,     y + h, x,     y,     rad);
    this.arcTo(x,     y,     x + w, y,     rad);
    this.closePath();
    return undefined;   // native returns undefined
  };
}
