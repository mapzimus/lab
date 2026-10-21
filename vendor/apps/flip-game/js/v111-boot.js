// v111-boot.js -- atomic release controller gate and ordered runtime loader.
// Opt-in on-device diagnostics: open the game with ?debug=1 to get a panel
// listing taps, the screen shown after each tap, and every script error.
(function () {
  if (!/[?&]debug=1\b/.test(location.search)) return;
  var lines = [];
  var panel = null;
  function render() {
    if (!panel && document.body) {
      panel = document.createElement('pre');
      panel.id = 'debug-panel';
      panel.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;max-height:40vh;overflow:auto;' +
        'margin:0;padding:6px 8px;background:rgba(0,0,0,.88);color:#9f9;font:11px/1.35 monospace;white-space:pre-wrap;pointer-events:auto;';
      document.body.appendChild(panel);
    }
    if (panel) panel.textContent = lines.join('\n');
  }
  function log(text) {
    lines.push(new Date().toISOString().slice(11, 19) + ' ' + text);
    if (lines.length > 60) lines.shift();
    render();
  }
  function visibleScreens() {
    return Array.prototype.filter.call(document.querySelectorAll('section.screen'), function (s) {
      return !s.classList.contains('hidden');
    }).map(function (s) { return s.id; }).join(',') || '(none)';
  }
  window.__flipDebugLog = log;
  window.addEventListener('error', function (e) {
    log('ERROR ' + (e.message || e.error) + ' @ ' + (e.filename || '').split('/').pop() + ':' + e.lineno + ':' + e.colno);
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    log('REJECTION ' + (r && (r.stack || r.message) || r));
  });
  var consoleError = console.error;
  console.error = function () {
    log('console.error ' + Array.prototype.map.call(arguments, function (a) {
      return a && a.stack ? a.stack : String(a);
    }).join(' ').slice(0, 400));
    return consoleError.apply(console, arguments);
  };
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('button,a,[id]') : null;
    log('tap ' + (el ? (el.id || el.textContent.trim().slice(0, 24)) : e.target.tagName));
    setTimeout(function () {
      var msg = document.getElementById('journey-message');
      log('  -> screens: ' + visibleScreens() + (msg && msg.textContent ? ' | msg: ' + msg.textContent.slice(0, 120) : ''));
    }, 600);
  }, true);
  log('debug on · ' + navigator.userAgent);
  document.addEventListener('DOMContentLoaded', render);
})();

(function () {
  'use strict';

  var VERSION = '115';
  var WORKER_URL = 'service-worker.js?v=115';
  var STYLE_URLS = ['css/style.css?v=115', 'css/v112-broadcast.css?v=115'];
  var SCRIPT_URLS = [
    'js/vendor/matter.min.js?v=115',
    'js/polyfills.js?v=115',
    'js/v111-interfaces.js?v=115',
    'js/v111-runtime.js?v=115',
    'js/v111-name-policy.js?v=115',
    'js/v111-save-backup.js?v=115',
    'js/v111-stats.js?v=115',
    // The private v1.12 authority captures the already-loaded shared Stats
    // writer. Its readiness gate must resolve before legacy presentation boots.
    'js/v112-browser-bundle.js?v=115',
    'js/v111-platform.js?v=115',
    'js/v111-art-platform.js?v=115',
    'js/v111-object-manifest.js?v=115',
    'js/v111-art-reference.js?v=115',
    // Optional, local-only sphere renderer. It must load before art pack B so
    // the existing Desk Globe stand can delegate its sphere without changing
    // any competitive art or physics.
    'js/v112-globe.js?v=115',
    'js/v112-globe-live.js?v=115',
    'js/v112-art-system.js?v=115',
    'js/v111-art-pack-a.js?v=115',
    'js/v111-art-pack-b.js?v=115',
    'js/v111-art-pack-c.js?v=115',
    'js/v111-legacy-object-dynamics.js?v=115',
    'js/v111-reaction-renderer.js?v=115',
    'js/v111-bootstrap.js?v=115',
    'js/v111-content-catalog.js?v=115',
    'js/v111-cosmetic-catalog.js?v=115',
    'js/v111-progression.js?v=115',
    'js/v111-modes.js?v=115',
    'js/v111-physics-events.js?v=115',
    'js/v111-mirror-match.js?v=115',
    'js/game.js?v=115',
    // Canonical v1.12 Plinko authority. The Matter host and live bridge must
    // load before physics.js so Plinko cannot fall back to the retired path.
    'js/v112-plinko-matter.js?v=115',
    'js/v112-plinko-live.js?v=115',
    'js/physics.js?v=115',
    'js/v112-physics-driver.js?v=115',
    'js/v112-hud-projection.js?v=115',
    // Staged v1.12 development dependency. The release integrator will fold
    // this into the v1.12 cache identity and precache at the release gate.
    'js/v112-cpu.js?v=115',
    'js/input.js?v=115',
    'js/v112-plinko-presentation.js?v=115',
    'js/renderer.js?v=115',
    'js/audio.js?v=115',
    'js/settings.js?v=115',
    'js/records.js?v=115',
    'js/achievements.js?v=115',
    'js/cast25.js?v=115',
    'js/v112-variant-names.js?v=115',
    'js/v112-arena-preview.js?v=115',
    'js/v112-easter-eggs.js?v=115',
    'js/v112-easter-presentation.js?v=115',
    'js/v112-journey-routes.js?v=115',
    'js/v112-journey-host.js?v=115',
    // Battle plays its series in the page, because only the page owns pointers,
    // lanes and physics. These are the rules, input router and coordinator it
    // needs; the private application still owns the reward for a finished one.
    'js/v112-battle.js?v=115',
    'js/v112-activity.js?v=115',
    'js/v112-multipointer.js?v=115',
    'js/v112-battle-runtime.js?v=115',
    'js/v112-battle-host.js?v=115',
    'js/v112-battle-routes.js?v=115',
    'js/skins.js?v=115',
    'js/main.js?v=115',
  ];
  var started = false;
  var bootFailure = null;

  window.__FLIPGAME_BOOT_VERSION__ = 'v1.15';
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
      var timer = setTimeout(function () { finish(new Error('The v1.15 offline update did not finish.')); }, 30000);
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
        })) finish(new Error('The v1.15 offline update was rejected.'));
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
    if (!controlledByThisRelease()) throw new Error('The v1.15 worker is not controlling this page.');
  }

  async function start() {
    if (started) return;
    started = true;
    await ensureReleaseController();
    for (var style of STYLE_URLS) await loadStyle(style);
    for (var script of SCRIPT_URLS) {
      await loadScript(script);
      if (script.indexOf('js/v112-browser-bundle.js') === 0) {
        var application = window.FlipgameV112;
        if (!application || !application.ready || typeof application.ready.then !== 'function') {
          throw new Error('The v1.12 application authority did not initialize.');
        }
        await application.ready;
      }
    }
    var status = document.getElementById('flipgame-boot-status');
    if (status && status.parentNode) status.parentNode.removeChild(status);
    document.body.classList.add('flipgame-boot-ready');
    if (window.__flipDebugLog) window.__flipDebugLog('boot ready · screens: ' + Array.prototype.filter.call(document.querySelectorAll('section.screen'), function (x) { return !x.classList.contains('hidden'); }).map(function (x) { return x.id; }).join(','));
  }

  function showFailure(error) {
    if (window.__flipDebugLog) window.__flipDebugLog('BOOT FAILED ' + (error && (error.stack || error.message) || error));
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
    title.textContent = 'Flipgame v1.15 update paused';
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
      bootFailure = event.error || new Error(event.message || 'A v1.15 runtime script could not execute.');
      showFailure(bootFailure);
    }
  });
  window.__FLIPGAME_BOOT_PROMISE__ = start().then(function () { return true; }, function (error) {
    showFailure(error);
    return false;
  });
})();
