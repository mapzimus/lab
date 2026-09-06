// v111-platform.js — shared browser/Android match lifecycle services.
(function (root, factory) {
  'use strict';
  var api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV111Platform = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (root) {
  'use strict';

  function WakeLockLifecycle(options) {
    if (!(this instanceof WakeLockLifecycle)) return new WakeLockLifecycle(options);
    var config = options || {};
    var documentRef = config.document || root.document || null;
    var navigatorRef = config.navigator || root.navigator || null;
    var androidBridge = config.androidBridge || root.FlipgamePlatform || null;
    var sentinel = null;
    var pending = null;
    var matchActive = false;
    var generation = 0;
    var attachedRuntime = null;
    var unsubscribers = [];

    function visible() {
      return !documentRef || !documentRef.visibilityState || documentRef.visibilityState === 'visible';
    }

    function setNativeActive(active) {
      if (!androidBridge || typeof androidBridge.setMatchActive !== 'function') return;
      try { androidBridge.setMatchActive(!!active); } catch (_) {}
    }

    function requestWakeLock() {
      if (!matchActive || !visible()) return Promise.resolve(false);
      if (sentinel && !sentinel.released) return Promise.resolve(true);
      if (pending) return pending;
      var wakeLock = navigatorRef && navigatorRef.wakeLock;
      if (!wakeLock || typeof wakeLock.request !== 'function') return Promise.resolve(false);
      var requestedGeneration = generation;
      pending = Promise.resolve().then(function () {
        return wakeLock.request('screen');
      }).then(function (value) {
        pending = null;
        if (!value) return false;
        if (!matchActive || requestedGeneration !== generation || !visible()) {
          try {
            return Promise.resolve(value.release()).then(function () {
              return matchActive && visible() ? requestWakeLock() : false;
            });
          }
          catch (_) { return false; }
        }
        sentinel = value;
        if (typeof sentinel.addEventListener === 'function') {
          sentinel.addEventListener('release', function () {
            if (sentinel === value) sentinel = null;
          }, { once: true });
        }
        return true;
      }).catch(function () {
        pending = null;
        sentinel = null;
        return false;
      });
      return pending;
    }

    function requestFullscreen() {
      if (!documentRef || !documentRef.documentElement) return Promise.resolve(false);
      if (documentRef.fullscreenElement || documentRef.webkitFullscreenElement) return Promise.resolve(true);
      var element = documentRef.documentElement;
      var request = element.requestFullscreen || element.webkitRequestFullscreen || element.msRequestFullscreen;
      if (typeof request !== 'function') return Promise.resolve(false);
      try {
        return Promise.resolve(request.call(element)).then(function () { return true; }, function () { return false; });
      } catch (_) { return Promise.resolve(false); }
    }

    this.enterMatch = function (options) {
      var value = options || {};
      if (!matchActive) {
        matchActive = true;
        generation++;
        setNativeActive(true);
      }
      var fullscreen = value.fullscreen ? requestFullscreen() : Promise.resolve(false);
      return Promise.all([fullscreen, requestWakeLock()]).then(function (states) {
        return !!(states[0] || states[1] || androidBridge);
      });
    };

    this.leaveMatch = function () {
      if (matchActive) {
        matchActive = false;
        generation++;
        setNativeActive(false);
      }
      var held = sentinel;
      sentinel = null;
      if (!held || held.released || typeof held.release !== 'function') return Promise.resolve();
      try { return Promise.resolve(held.release()).catch(function () {}); }
      catch (_) { return Promise.resolve(); }
    };

    this.restoreActiveMatch = function () {
      return matchActive && visible() ? requestWakeLock() : Promise.resolve(false);
    };

    this.snapshot = function () {
      return Object.freeze({
        matchActive: matchActive,
        lockHeld: !!(sentinel && !sentinel.released),
        lockPending: !!pending,
      });
    };

    this.attachLifecycle = function (runtime) {
      var target = runtime || root.FlipgameV111Runtime;
      if (!target || !target.outcomes || typeof target.outcomes.on !== 'function') return false;
      if (attachedRuntime === target) return true;
      this.detachLifecycle();
      attachedRuntime = target;
      var self = this;
      unsubscribers.push(target.outcomes.on('match.started.v1', function () {
        self.enterMatch({ fullscreen: false });
      }));
      ['match.resolved.v1', 'match.abandoned.v1', 'lifecycle.menu-entered.v1'].forEach(function (type) {
        unsubscribers.push(target.outcomes.on(type, function () { self.leaveMatch(); }));
      });
      return true;
    };

    this.detachLifecycle = function () {
      unsubscribers.splice(0).forEach(function (unsubscribe) {
        try { unsubscribe(); } catch (_) {}
      });
      attachedRuntime = null;
    };

    if (documentRef && typeof documentRef.addEventListener === 'function') {
      var self = this;
      documentRef.addEventListener('visibilitychange', function () {
        if (visible()) self.restoreActiveMatch();
      });
    }
  }

  var lifecycle = new WakeLockLifecycle();
  lifecycle.attachLifecycle(root.FlipgameV111Runtime);

  return Object.freeze({
    enterMatch: function (options) { return lifecycle.enterMatch(options); },
    leaveMatch: function () { return lifecycle.leaveMatch(); },
    restoreActiveMatch: function () { return lifecycle.restoreActiveMatch(); },
    snapshot: function () { return lifecycle.snapshot(); },
    attachLifecycle: function (runtime) { return lifecycle.attachLifecycle(runtime); },
    constructors: Object.freeze({ WakeLockLifecycle: WakeLockLifecycle }),
  });
});
