// v111-boot.js -- atomic release controller gate and ordered runtime loader.
(function () {
  'use strict';

  var VERSION = '111';
  var WORKER_URL = 'service-worker.js?v=' + VERSION;
  var STYLE_URLS = ['css/style.css?v=' + VERSION];
  var SCRIPT_URLS = [
    'js/vendor/matter.min.js?v=111',
    'js/polyfills.js?v=111',
    'js/v111-interfaces.js?v=111',
    'js/v111-runtime.js?v=111',
    'js/v111-name-policy.js?v=111',
    'js/v111-save-backup.js?v=111',
    'js/v111-stats.js?v=111',
    'js/v111-platform.js?v=111',
    'js/v111-art-platform.js?v=111',
    'js/v111-object-manifest.js?v=111',
    'js/v111-art-reference.js?v=111',
    'js/v111-art-pack-a.js?v=111',
    'js/v111-art-pack-b.js?v=111',
    'js/v111-art-pack-c.js?v=111',
    'js/v111-legacy-object-dynamics.js?v=111',
    'js/v111-reaction-renderer.js?v=111',
    'js/v111-bootstrap.js?v=111',
    'js/v111-content-catalog.js?v=111',
    'js/v111-cosmetic-catalog.js?v=111',
    'js/v111-progression.js?v=111',
    'js/v111-modes.js?v=111',
    'js/v111-physics-events.js?v=111',
    'js/v111-mirror-match.js?v=111',
    'js/game.js?v=111',
    'js/physics.js?v=111',
    'js/input.js?v=111',
    'js/renderer.js?v=111',
    'js/audio.js?v=111',
    'js/settings.js?v=111',
    'js/records.js?v=111',
    'js/achievements.js?v=111',
    'js/cast25.js?v=111',
    'js/skins.js?v=111',
    'js/v111-network-protocol.js?v=111',
    'js/net.js?v=111',
    'js/main.js?v=111',
  ];
  var started = false;
  var bootFailure = null;

  window.__FLIPGAME_BOOT_VERSION__ = 'v1.11';
  window.__FLIPGAME_BOOT_ASSETS__ = Object.freeze({
    styles: Object.freeze(STYLE_URLS.slice()),
    scripts: Object.freeze(SCRIPT_URLS.slice()),
  });

  function versionOfWorker(worker) {
    if (!worker || !worker.scriptURL) return null;
    try { return new URL(worker.scriptURL, location.href).searchParams.get('v'); }
    catch (_) { return null; }
  }

  function controlledByThisRelease() {
    return versionOfWorker(navigator.serviceWorker && navigator.serviceWorker.controller) === VERSION;
  }

  function productionHttp() {
    return /^https?:$/.test(location.protocol) &&
      location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';
  }

  function loadStyle(url) {
    return new Promise(function (resolve, reject) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.onload = resolve;
      link.onerror = function () { reject(new Error('Could not load ' + url)); };
      document.head.appendChild(link);
    });
  }

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = url;
      script.async = false;
      script.onload = function () {
        if (bootFailure) reject(bootFailure); else resolve();
      };
      script.onerror = function () { reject(new Error('Could not load ' + url)); };
      document.body.appendChild(script);
    });
  }

  function waitForReleaseController(registration) {
    if (controlledByThisRelease()) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () { finish(new Error('The v1.11 offline update did not finish.')); }, 30000);
      var workers = [registration.installing, registration.waiting, registration.active].filter(Boolean);

      function cleanup() {
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener('controllerchange', check);
        workers.forEach(function (worker) { worker.removeEventListener('statechange', check); });
      }
      function finish(error) {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error); else resolve();
      }
      function check() {
        if (controlledByThisRelease()) finish();
        else if (workers.some(function (worker) {
          return versionOfWorker(worker) === VERSION && worker.state === 'redundant';
        })) finish(new Error('The v1.11 offline update was rejected.'));
      }

      navigator.serviceWorker.addEventListener('controllerchange', check);
      workers.forEach(function (worker) { worker.addEventListener('statechange', check); });
      check();
    });
  }

  async function ensureReleaseController() {
    if (!productionHttp() || !('serviceWorker' in navigator)) return;
    // A matching controller owns a complete, atomically installed release.
    // Accept it before touching the network so a cold installed PWA can boot
    // entirely from that worker's cache while the device is offline.
    if (controlledByThisRelease()) return;
    var registration = await navigator.serviceWorker.register(WORKER_URL, {
      scope: './', updateViaCache: 'none',
    });
    await waitForReleaseController(registration);
    if (!controlledByThisRelease()) throw new Error('The v1.11 worker is not controlling this page.');
  }

  async function start() {
    if (started) return;
    started = true;
    await ensureReleaseController();
    for (var style of STYLE_URLS) await loadStyle(style);
    for (var script of SCRIPT_URLS) await loadScript(script);
    var status = document.getElementById('flipgame-boot-status');
    if (status && status.parentNode) status.parentNode.removeChild(status);
    document.body.classList.add('flipgame-boot-ready');
  }

  function showFailure(error) {
    document.body.classList.add('flipgame-boot-failed');
    var status = document.getElementById('flipgame-boot-status');
    if (!status) {
      status = document.createElement('div');
      status.id = 'flipgame-boot-status';
      status.setAttribute('role', 'alert');
      document.body.appendChild(status);
    }
    status.textContent = '';
    var title = document.createElement('strong');
    title.textContent = 'Flipgame v1.11 update paused';
    var message = document.createElement('p');
    message.textContent = 'Reconnect to the internet, then retry. Your local game data is safe.';
    var retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Retry update';
    retry.addEventListener('click', function () { location.reload(); });
    status.appendChild(title);
    status.appendChild(message);
    status.appendChild(retry);
    try { console.error(error); } catch (_) {}
  }

  window.addEventListener('error', function (event) {
    if (!document.body.classList.contains('flipgame-boot-ready')) {
      bootFailure = event.error || new Error(event.message || 'A v1.11 runtime script could not execute.');
      showFailure(bootFailure);
    }
  });
  window.__FLIPGAME_BOOT_PROMISE__ = start().then(function () { return true; }, function (error) {
    showFailure(error);
    return false;
  });
})();
