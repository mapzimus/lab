// v112-event-kernel-browser-facade.js -- inert browser status for EventKernel.
//
// Event capabilities stay inside a future generated lexical composition. This
// file is metadata only and intentionally cannot select, force, resolve, claim,
// consume, render, or otherwise participate in a match.
(function (root) {
  'use strict';
  var KEY = 'FlipgameV112EventKernelBrowserFacadeV1';
  if (!root) throw new Error('EventKernel browser facade requires a global object');
  if (KEY in Object(root)) {
    throw new Error('Refusing duplicate or preseeded ' + KEY);
  }
  var facade = Object.freeze({
    schema: 'FlipgameV112EventKernelBrowserFacadeV1',
    version: 2,
    liveAvailable: false,
  });
  Object.defineProperty(root, KEY, {
    value: facade,
    enumerable: true,
    writable: false,
    configurable: false,
  });
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)));
