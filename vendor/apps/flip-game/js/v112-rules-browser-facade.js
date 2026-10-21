// v112-rules-browser-facade.js -- inert browser status for the private Rules core.
//
// This entry point deliberately exposes no functions, schemas, constructors,
// validators, or capabilities. A future generated lexical bundle may replace
// liveAvailable with a coordinator-owned UI facade; the Rules core itself must
// never be loaded as a classic script.
(function (root) {
  'use strict';
  var KEY = 'FlipgameV112RulesBrowserFacadeV1';
  if (!root) throw new Error('Rules browser facade requires a global object');
  if (KEY in Object(root)) {
    throw new Error('Refusing duplicate or preseeded ' + KEY);
  }
  var facade = Object.freeze({
    schema: 'FlipgameV112RulesBrowserFacadeV1',
    version: 1,
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
