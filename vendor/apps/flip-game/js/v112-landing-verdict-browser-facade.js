// v112-landing-verdict-browser-facade.js -- inert browser status only.
(function (root) {
  'use strict';
  var KEY = 'FlipgameV112LandingVerdictBrowserFacadeV1';
  if (!root) throw new Error('LandingVerdict browser facade requires a global object');
  if (KEY in Object(root)) throw new Error('Refusing duplicate or preseeded ' + KEY);
  var facade = Object.freeze({
    schema: 'FlipgameV112LandingVerdictBrowserFacadeV1',
    version: 1,
    liveAvailable: false,
  });
  Object.defineProperty(root, KEY, {
    value: facade, enumerable: true, writable: false, configurable: false,
  });
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)));
