// v111-runtime.js — passive extension points shared by v111 feature modules.
// Loaded after v111-interfaces.js and before feature registrations/main.js.
(function (root, factory) {
  'use strict';
  var interfaces = root && root.FlipgameV111Interfaces;
  if (typeof module === 'object' && module.exports) {
    interfaces = require('./v111-interfaces.js');
  }
  var api = factory(interfaces);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.FlipgameV111Runtime = api;
    root.FlipgameV111 = api;
    // Stable browser entrypoint; the Name Safety module installs its concrete
    // validator here without replacing the object main/UI consumers reference.
    if (!root.NamePolicy) root.NamePolicy = api.namePolicy;
  }
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Interfaces) {
  'use strict';

  if (!Interfaces) throw new Error('FlipgameV111Interfaces must load before v111-runtime.js');

  var copy = Interfaces.immutableCopy;
  var OUTCOMES = Interfaces.OUTCOME_EVENT_TYPES;
  var LIFECYCLE = Interfaces.LIFECYCLE_EVENT_TYPES;

  function safeCall(onError, fn, args) {
    try { return fn.apply(null, args || []); }
    catch (error) {
      if (typeof onError === 'function') {
        try { onError(error); } catch (_) {}
      }
      return undefined;
    }
  }

  function OutcomeHub(options) {
    if (!(this instanceof OutcomeHub)) return new OutcomeHub(options);
    var config = options || {};
    var listeners = new Map();
    var sequence = 0;
    var now = typeof config.now === 'function' ? config.now : Date.now;
    var onError = typeof config.onError === 'function' ? config.onError : null;

    this.on = function (type, listener) {
      if (typeof listener !== 'function') throw new TypeError('Outcome listener must be a function');
      var key = String(type || '*');
      var set = listeners.get(key);
      if (!set) { set = new Set(); listeners.set(key, set); }
      set.add(listener);
      return function () {
        set.delete(listener);
        if (!set.size) listeners.delete(key);
      };
    };

    this.emit = function (type, payload, metadata) {
      if (typeof type !== 'string' || !type) throw new TypeError('Outcome event type is required');
      var event = copy({
        schema: 'FlipgameOutcomeEventV1',
        version: 1,
        type: type,
        sequence: ++sequence,
        timestamp: Number(now()),
        payload: payload || {},
        metadata: metadata || {},
      });
      var direct = listeners.get(type);
      var wildcard = listeners.get('*');
      if (direct) Array.from(direct).forEach(function (listener) {
        safeCall(onError, listener, [event]);
      });
      if (wildcard) Array.from(wildcard).forEach(function (listener) {
        safeCall(onError, listener, [event]);
      });
      return event;
    };

    this.listenerCount = function (type) {
      var set = listeners.get(String(type || '*'));
      return set ? set.size : 0;
    };
  }

  function ModeAdapterRegistry(options) {
    if (!(this instanceof ModeAdapterRegistry)) return new ModeAdapterRegistry(options);
    var config = options || {};
    var onError = typeof config.onError === 'function' ? config.onError : null;
    var adapters = new Map();
    var activeId = 'classic';

    function normalize(adapter) {
      if (!adapter || typeof adapter !== 'object') throw new TypeError('Mode adapter must be an object');
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(adapter.id || ''))) {
        throw new TypeError('Mode adapter id must be lowercase kebab-case');
      }
      return Object.freeze({
        id: adapter.id,
        prepareMatch: typeof adapter.prepareMatch === 'function' ? adapter.prepareMatch : null,
        resolveFlip: typeof adapter.resolveFlip === 'function' ? adapter.resolveFlip : null,
        advanceTurn: typeof adapter.advanceTurn === 'function' ? adapter.advanceTurn : null,
        snapshot: typeof adapter.snapshot === 'function' ? adapter.snapshot : null,
      });
    }

    this.register = function (adapter) {
      var value = normalize(adapter);
      if (adapters.has(value.id)) throw new Error('Mode adapter already registered: ' + value.id);
      adapters.set(value.id, value);
      return value;
    };
    this.has = function (id) { return adapters.has(id); };
    this.get = function (id) { return adapters.get(id) || null; };
    this.list = function () { return Object.freeze(Array.from(adapters.values())); };
    this.activate = function (id) {
      if (!adapters.has(id)) throw new RangeError('Unknown mode adapter: ' + id);
      activeId = id;
      return adapters.get(id);
    };
    this.active = function () { return adapters.get(activeId); };
    this.prepareMatch = function (request) {
      var requested = request && request.options && request.options.format;
      var id = adapters.has(requested) ? requested : 'classic';
      activeId = id;
      var adapter = adapters.get(id);
      if (!adapter || !adapter.prepareMatch) return request;
      var result = safeCall(onError, adapter.prepareMatch, [request]);
      return result && typeof result === 'object' ? result : request;
    };
    this.resolveFlip = function (context) {
      var adapter = adapters.get(activeId);
      if (!adapter || !adapter.resolveFlip) return false;
      return safeCall(onError, adapter.resolveFlip, [context]) === true;
    };
    this.advanceTurn = function (context) {
      var adapter = adapters.get(activeId);
      if (!adapter || !adapter.advanceTurn) return false;
      return safeCall(onError, adapter.advanceTurn, [context]) === true;
    };
    this.snapshot = function (context) {
      var adapter = adapters.get(activeId);
      if (!adapter || !adapter.snapshot) return null;
      var value = safeCall(onError, adapter.snapshot, [context]);
      return value == null ? null : copy(value);
    };

    this.register({ id: 'classic' });
  }

  function NamePolicyEntrypoint(options) {
    if (!(this instanceof NamePolicyEntrypoint)) return new NamePolicyEntrypoint(options);
    var config = options || {};
    var onError = typeof config.onError === 'function' ? config.onError : null;
    var policy = null;

    this.install = function (candidate) {
      if (!candidate || typeof candidate.validate !== 'function') {
        throw new TypeError('NamePolicy must expose validate()');
      }
      policy = candidate;
      return policy;
    };
    this.current = function () { return policy; };
    this.validate = function (input, context) {
      var original = String(input == null ? '' : input);
      if (!policy) {
        return Object.freeze({ valid: true, ok: true, value: original, error: null, code: null });
      }
      try {
        var result = policy.validate(original, context || {});
        if (!result || typeof result !== 'object') throw new TypeError('NamePolicy.validate() must return an object');
        var valid = result.valid !== undefined ? !!result.valid : !!result.ok;
        return Object.freeze({
          valid: valid,
          ok: valid,
          value: valid ? String(result.value == null ? original : result.value) : original,
          error: valid ? null : 'Choose a different name.',
          code: result.code == null ? null : String(result.code),
        });
      } catch (error) {
        if (onError) safeCall(null, onError, [error]);
        return Object.freeze({
          valid: false,
          ok: false,
          value: original,
          error: 'Choose a different name.',
          code: 'policy-error',
        });
      }
    };
  }

  function capturePlayer(player, index) {
    if (!player) return null;
    return {
      index: index,
      id: player.id == null ? null : String(player.id),
      name: player.name == null ? '' : String(player.name),
      color: player.color == null ? null : String(player.color),
      isAI: !!player.isAI,
      skin: player.skin == null ? null : String(player.skin),
      variantId: player.variantId == null ? null : String(player.variantId),
      cosmeticId: player.cosmeticId == null ? null : String(player.cosmeticId),
      lives: Number.isFinite(Number(player.lives)) ? Number(player.lives) : null,
      streak: Number.isFinite(Number(player.streak)) ? Number(player.streak) : 0,
      isHeatingUp: !!player.isHeatingUp,
      isOnFire: !!player.isOnFire,
      alwaysMagnet: !!player.alwaysMagnet,
      eliminated: !!player.eliminated,
    };
  }

  function captureGame(game) {
    if (!game || typeof game !== 'object') return null;
    var players = Array.isArray(game.players) ? game.players : [];
    return copy({
      state: game.state == null ? null : String(game.state),
      format: game.format == null ? 'classic' : String(game.format),
      practice: !!game.practice,
      insanity: !!game.insanity,
      feel: game.feel == null ? null : String(game.feel),
      direction: Number(game.direction) || 1,
      currentPlayerIndex: Number(game.currentPlayerIndex) || 0,
      turnCounter: Number(game.turnCounter) || 0,
      startingLives: Number(game.startingLives) || 0,
      maxLives: Number(game.maxLives) || 0,
      pointCount: Number(game.pointCount) || 0,
      lastResult: game.lastResult == null ? null : String(game.lastResult),
      winnerIndex: Number.isInteger(game.winnerIndex) ? game.winnerIndex : null,
      players: players.map(capturePlayer),
      flags: {
        perfectLanding: !!game.perfectLanding,
        capLand: !!game.capLand,
        goldenFlip: !!game.goldenFlip,
        plinkoPrize: game.plinkoPrize == null ? null : String(game.plinkoPrize),
        justIgnited: !!game.justIgnited,
        fireEnded: !!game.fireEnded,
        fireCapped: !!game.fireCapped,
        justEliminated: !!game.justEliminated,
        lifeDrainTriggered: !!game.lifeDrainTriggered,
      },
    });
  }

  function captureFlick(info) {
    if (!info || typeof info !== 'object') return null;
    return copy(info);
  }

  function captureLanding(result, info) {
    return Interfaces.LandingVerdict.fromLegacy(result, info || {});
  }

  function Lifecycle(outcomes) {
    if (!(this instanceof Lifecycle)) return new Lifecycle(outcomes);
    if (!outcomes || typeof outcomes.emit !== 'function') {
      throw new TypeError('Lifecycle requires an OutcomeHub');
    }
    var current = { screen: 'menu', matchActive: false, landingPhase: null };

    function update(patch) {
      current = Object.assign({}, current, patch);
      return copy(current);
    }

    this.snapshot = function () { return copy(current); };
    this.menuEntered = function (payload) {
      update({ screen: 'menu', matchActive: false, landingPhase: null });
      return outcomes.emit(LIFECYCLE.MENU_ENTERED, payload || {});
    };
    this.matchStarted = function (payload) {
      update({ screen: 'game', matchActive: true, landingPhase: null });
      return outcomes.emit(OUTCOMES.MATCH_STARTED, payload || {});
    };
    this.flipStarted = function (payload) {
      update({ landingPhase: Interfaces.LANDING_PHASES.AIRBORNE });
      return outcomes.emit(OUTCOMES.FLIP_STARTED, payload || {});
    };
    this.contact = function (payload) {
      update({ landingPhase: Interfaces.LANDING_PHASES.CONTACT });
      return outcomes.emit(LIFECYCLE.LANDING_CONTACT, payload || {});
    };
    this.settling = function (payload) {
      update({ landingPhase: Interfaces.LANDING_PHASES.SETTLING });
      return outcomes.emit(LIFECYCLE.LANDING_SETTLING, payload || {});
    };
    this.flipResolved = function (payload) {
      update({ landingPhase: Interfaces.LANDING_PHASES.RESOLVED });
      return outcomes.emit(OUTCOMES.FLIP_RESOLVED, payload || {});
    };
    this.matchResolved = function (payload) {
      update({ screen: 'game-over', matchActive: false, landingPhase: null });
      return outcomes.emit(OUTCOMES.MATCH_RESOLVED, payload || {});
    };
    this.matchAbandoned = function (payload) {
      update({ screen: 'menu', matchActive: false, landingPhase: null });
      return outcomes.emit(OUTCOMES.MATCH_ABANDONED, payload || {});
    };
  }

  function StatsInstrumentation(outcomes, options) {
    if (!(this instanceof StatsInstrumentation)) return new StatsInstrumentation(outcomes, options);
    var config = options || {};
    var schedule = typeof config.schedule === 'function'
      ? config.schedule
      : function (work) { Promise.resolve().then(work); };
    var onError = typeof config.onError === 'function' ? config.onError : null;
    var store = null;
    var subscriptions = [];

    function write(method, event) {
      if (!store) return;
      schedule(function () {
        try {
          if (typeof store.onOutcome === 'function') store.onOutcome(event);
          else store[method](event);
        } catch (error) {
          if (onError) safeCall(null, onError, [error]);
        }
      });
    }

    subscriptions.push(outcomes.on(OUTCOMES.FLIP_RESOLVED, function (event) {
      write('recordFlip', event);
    }));
    subscriptions.push(outcomes.on(OUTCOMES.MATCH_RESOLVED, function (event) {
      write('recordMatch', event);
    }));

    this.install = function (candidate) {
      store = Interfaces.StatsStore(candidate);
      return store;
    };
    this.current = function () { return store; };
    this.dispose = function () {
      subscriptions.splice(0).forEach(function (unsubscribe) { unsubscribe(); });
      store = null;
    };
  }

  var errors = [];
  function recordError(error) { errors.push(error); }
  var outcomes = new OutcomeHub({ onError: recordError });
  var modes = new ModeAdapterRegistry({ onError: recordError });
  var namePolicy = new NamePolicyEntrypoint({ onError: recordError });
  var lifecycle = new Lifecycle(outcomes);
  var stats = new StatsInstrumentation(outcomes, { onError: recordError });

  var artCatalog = null;
  var art = Object.freeze({
    register: function (catalog) {
      if (!catalog || typeof catalog !== 'object') throw new TypeError('v111 art catalog is required');
      artCatalog = catalog;
      return catalog;
    },
    current: function () { return artCatalog; },
  });

  var bridge = Object.freeze({
    prepareMatch: function (request) { return modes.prepareMatch(request); },
    resolveFlip: function (context) { return modes.resolveFlip(context); },
    advanceTurn: function (context) { return modes.advanceTurn(context); },
    matchStarted: function (context) {
      var value = context || {};
      return lifecycle.matchStarted({
        game: captureGame(value.game),
        options: copy(value.options || {}),
        online: !!value.online,
        mode: modes.active().id,
        modeState: modes.snapshot(value),
      });
    },
    flipStarted: function (context) {
      var value = context || {};
      return lifecycle.flipStarted({
        game: captureGame(value.game),
        flick: captureFlick(value.flick),
        eventId: value.eventId == null ? null : String(value.eventId),
        forced: !!value.forced,
        testData: !!value.testData,
        online: !!value.online,
      });
    },
    flipResolved: function (context) {
      var value = context || {};
      var result = value.result || (value.game && value.game.lastResult) || null;
      return lifecycle.flipResolved({
        record: copy(value.record || {}),
        game: captureGame(value.game),
        flick: captureFlick(value.flick),
        landing: captureLanding(result, value.landing || {}),
        eventId: value.eventId == null ? null : String(value.eventId),
        forced: !!value.forced,
        testData: !!value.testData,
        online: !!value.online,
        modeState: modes.snapshot(value),
      });
    },
    matchResolved: function (context) {
      var value = context || {};
      return lifecycle.matchResolved({
        record: copy(value.record || (value.match && value.match.record) || {}),
        game: captureGame(value.game),
        match: copy(value.match || {}),
        online: !!value.online,
        modeState: modes.snapshot(value),
      });
    },
    menuEntered: function (context) {
      var value = context || {};
      if (lifecycle.snapshot().matchActive) {
        return lifecycle.matchAbandoned({ game: captureGame(value.game), reason: value.reason || 'menu' });
      }
      return lifecycle.menuEntered({ reason: value.reason || 'menu' });
    },
  });

  return Object.freeze({
    contractRevision: Interfaces.CONTRACT_REVISION,
    releaseVersion: Interfaces.RELEASE_VERSION,
    interfaces: Interfaces,
    outcomes: outcomes,
    modes: modes,
    stats: stats,
    namePolicy: namePolicy,
    lifecycle: lifecycle,
    art: art,
    bridge: bridge,
    captureGame: captureGame,
    captureFlick: captureFlick,
    captureLanding: captureLanding,
    constructors: Object.freeze({
      OutcomeHub: OutcomeHub,
      ModeAdapterRegistry: ModeAdapterRegistry,
      NamePolicyEntrypoint: NamePolicyEntrypoint,
      Lifecycle: Lifecycle,
      StatsInstrumentation: StatsInstrumentation,
    }),
    getErrors: function () { return errors.slice(); },
  });
});
