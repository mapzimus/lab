// Battle host: the FlipgameV112BattleHostV1 the Battle route asks for.
//
// It composes two authorities and adds none of its own. The private application
// reserves the match and decides what a completed series is worth. The lane
// runtime plays that series, because only the page owns pointers, lanes and
// physics. This module carries the reservation between them, drives the frame
// clock the runtime needs, and projects lanes for the screen.
//
// It never scores a pose, names a winner or writes progression.
//
// createBattleHost({
//   application,          // window.FlipgameV112
//   laneAdapterFactory,   // BattleLaneAdapterContractV1 factory: the real flip
//   laneCapacity,         // lanes that factory can genuinely run at once
//   measureDisplay,       // () -> {width, observedContacts}
//   laneRects,            // (stage, count) -> lane rectangles in client pixels
//   openLane/closeLane,   // bring the physics surface up and give it back
//   cpuLaunch,            // ({laneId, playerId, matchId}) -> {vx, vy} | null
//   cpuThinkMs,           // pause before a CPU flicks
//   requestFrame/cancelFrame/now,
// })
//
// The page must call resize() when the glass changes size: lane rectangles are
// client pixels, and the runtime qualifies gestures against them.
(function (root, factory) {
  'use strict';
  var Runtime = root && root.FlipgameV112BattleRuntime;
  if (typeof module === 'object' && module.exports) Runtime = require('./v112-battle-runtime.js');
  var api = factory(Runtime);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.defineProperty(root, 'FlipgameV112BattleHost', { value: api, enumerable: true });
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Runtime) {
  'use strict';
  if (!Runtime || typeof Runtime.createBattleRuntime !== 'function') {
    throw new Error('FlipgameV112BattleRuntime must load before v112-battle-host.js');
  }
  var LANE_STATUS = {
    ready: 'Flick to launch', aiming: 'Aiming', armed: 'Launching',
    airborne: 'In flight', contact: 'Landing', settling: 'Settling',
    resolved: 'Scored', disabled: 'Waiting',
  };
  // A CPU lane never takes a pointer, so if nothing can supply its gesture the
  // heat cannot go on. The screen has to be told, or it invites a person to wait
  // for a turn that will never come.
  var CPU_UNAVAILABLE = 'Nothing here can flick for a CPU competitor. Leave and give every seat to a person.';
  function copy(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

  function defaultLaneRects(stage, count) {
    var box = stage.getBoundingClientRect();
    var width = box.width / count;
    var rects = [];
    for (var index = 0; index < count; index += 1) {
      rects.push({ laneId: 'lane-' + (index + 1), left: box.left + index * width,
        top: box.top, width: width, height: box.height });
    }
    return rects;
  }

  function createBattleHost(options) {
    var opts = options || {};
    var application = opts.application;
    if (!application || !application.battle) throw new TypeError('The private application is required');
    if (typeof opts.laneAdapterFactory !== 'function') throw new TypeError('A lane adapter factory is required');
    var laneRectsFor = opts.laneRects || defaultLaneRects;
    var buildRuntime = opts.createRuntime || Runtime.createBattleRuntime;
    var openLane = opts.openLane || null;
    var closeLane = opts.closeLane || null;
    // A contact is only worth a lane if the injected adapter can actually run
    // that lane. One physics surface means one lane, whatever the glass reports.
    var laneCapacity = Math.max(1, Math.floor(opts.laneCapacity || 1));
    var cpuLaunch = typeof opts.cpuLaunch === 'function' ? opts.cpuLaunch : null;
    // A CPU that flicked the instant its lane opened would make the relay snap
    // between turns with nothing to watch. This is presentation pacing only.
    var cpuThinkMs = Number(opts.cpuThinkMs);
    if (!Number.isFinite(cpuThinkMs) || cpuThinkMs < 0) cpuThinkMs = 900;
    var now = opts.now || function () { return Date.now(); };
    var requestFrame = opts.requestFrame || function (fn) { return setTimeout(fn, 16); };
    var cancelFrame = opts.cancelFrame || function (id) { clearTimeout(id); };
    var listeners = new Set();
    var reservation = null;   // { handle, config }
    var runtime = null;
    var stageElement = null;
    var detachPointers = null;
    var frameId = null;
    var laneOpen = false;
    var lastFrameAt = 0;
    var series = null;        // last BattleStateV1 this host saw
    var message = '';
    var releasing = false;    // true while the authority is being asked to let go
    var cpuBlocked = '';      // set while a CPU lane has no gesture to be given
    var submission = null;
    var cpuTurns = new Map(); // laneId -> { playerId, dueAt }
    var unsubscribeApplication = application.subscribe
      ? application.subscribe(function () { wake(); }) : null;

    // The frame clock runs every frame; the screen must not. Waking only on a
    // changed view keeps the HUD off the animation path.
    var lastSignature = null;
    function wake() {
      var view = snapshot();
      var signature = view == null ? 'closed' : JSON.stringify([view.status, view.message,
        view.lanes, view.state.phase, view.state.heatNumber, view.state.volleyIndex,
        view.state.scores, view.state.heatWins, view.state.charges, view.state.powerOffers,
        view.state.storedPowers, view.state.suddenDeath, view.state.elapsedMs,
        view.state.winnerId]);
      if (signature === lastSignature) return;
      lastSignature = signature;
      listeners.forEach(function (listener) { try { listener(); } catch (_) {} });
    }

    function capabilities() {
      var measured = (opts.measureDisplay || function () { return { width: 0, observedContacts: 1 }; })();
      var observed = Math.max(1, Math.floor(Number(measured.observedContacts) || 1));
      return application.battle.observeDisplay({ width: measured.width,
        observedContacts: Math.min(observed, laneCapacity) });
    }

    function prepare(input) {
      var source = input || {};
      // The last series goes before the new reservation is asked for, not after.
      // Reserving makes the application emit, and a screen woken in between would
      // be handed the finished heat under the new match's status.
      series = null; message = ''; cpuBlocked = ''; submission = null;
      var ticket = application.battle.prepare({ battleFormatId: source.formatId,
        paceId: source.paceId, powerProfileId: source.powerProfileId,
        players: source.players });
      reservation = { handle: ticket.handle, config: copy(ticket.config) };
      return { handle: ticket.handle };
    }

    // The authority decides whether a reservation may be dropped. Nothing is
    // torn down until it has agreed, so a refusal leaves the lane exactly as it
    // was instead of taking the table away from a Battle that is still running.
    function cancel(handle) {
      releasing = true;
      try {
        application.battle.cancel(handle);
      } catch (error) {
        releasing = false;
        throw error;
      }
      stopRuntime();
      reservation = null; series = null; releasing = false; wake();
      return null;
    }

    function start(handle, context) {
      if (!reservation || reservation.handle !== handle) throw new Error('That Battle reservation is not current');
      var stage = (context || {}).stage;
      if (!stage) throw new Error('Battle needs its stage before a heat can open');
      var config = reservation.config;
      // A failure from here has to give back whatever it took rather than leave
      // a lane on screen, or a match nobody can finish or leave.
      var live = false;
      try {
        // The surface has to exist before lane geometry is measured against it
        // or an attempt is launched into it.
        if (openLane) { laneOpen = true; openLane({ stage: stage, config: config }); }
        stageElement = stage;
        var rects = laneRectsFor(stage, config.hardware.activeLaneLimit);
        runtime = buildRuntime({ matchId: config.matchId, config: config, laneRects: rects,
          laneAdapterFactory: opts.laneAdapterFactory, captureTarget: stage,
          // One clock. The frame clock drives tick(), and a Timed Rush horn is
          // decided against pointer timestamps, so leaving the runtime on its own
          // default would measure the heat on a clock this host never advances.
          now: now, inputNow: now,
          onError: function (error) { message = error && error.message ? error.message : String(error); },
        });
        application.battle.start(handle);
        live = true;
        detachPointers = runtime.attach(stage);
        runtime.startHeat();
        series = copy(runtime.snapshot().battle);
      } catch (error) {
        stopRuntime();
        if (live) application.battle.abandon('start-failed');
        reservation = null; series = null; wake();
        throw error;
      }
      lastFrameAt = now();
      frameId = requestFrame(frame);
      wake();
      return snapshot();
    }

    function frame() {
      frameId = null;
      if (!runtime) return;
      var at = now();
      var delta = Math.max(0, at - lastFrameAt);
      lastFrameAt = at;
      try { runtime.tick(delta); } catch (error) { message = error.message; }
      settle();
      if (runtime) frameId = requestFrame(frame);
    }

    // Between heats the next heat has to be opened, a stored card has to be
    // deployed before its owner's next launch, and a completed series has to be
    // handed to the composition exactly once.
    function settle() {
      var state = runtime.snapshot().battle;
      if (state.phase === 'between-heats') { runtime.startHeat(); state = runtime.snapshot().battle; }
      deployStoredPowers(state);
      driveCpuLanes(state);
      series = copy(runtime.snapshot().battle);
      if (series.phase === 'complete' && !submission) submit();
      wake();
    }

    function deployStoredPowers(state) {
      Object.keys(state.storedPowers).forEach(function (competitorId) {
        if (!state.storedPowers[competitorId]) return;
        var owner = state.config.players.find(function (player) {
          return competitorKey(player) === competitorId;
        });
        if (!owner) return;
        // A deployment that is merely early keeps its card: the runtime refuses
        // it until the recipient is between launches, and this retries then.
        try { runtime.deployPower(owner.id); } catch (_) {}
      });
    }

    // Nothing routes a pointer to a CPU lane, so a Battle with an AI entry would
    // sit on a ready lane for ever unless something flicks for it. The intent is
    // the page's, because only the page owns physics; the schedule is this
    // host's, because only this host owns the frame clock. Neither decides a
    // pose: the CPU attempt lands the same way a person's does.
    function driveCpuLanes(state) {
      if (!runtime || state.phase !== 'active') return;
      var active = state.activePlayerIds || [];
      runtime.snapshot().lanes.forEach(function (lane) {
        if (!(lane.cpu && lane.playerId && lane.state === 'ready' &&
            active.indexOf(lane.playerId) >= 0)) {
          cpuTurns.delete(lane.laneId);
          return;
        }
        // A CPU lane takes no pointer, so a gesture nobody can supply is not a
        // slow turn, it is a lane that waits for ever. Saying so is the only way
        // out of it: the screen keeps its way back, and a page that supplies the
        // gesture later still plays on.
        if (!cpuLaunch) { cpuBlocked = CPU_UNAVAILABLE; return; }
        var turn = cpuTurns.get(lane.laneId);
        if (!turn || turn.playerId !== lane.playerId) {
          cpuTurns.set(lane.laneId, { playerId: lane.playerId, dueAt: now() + cpuThinkMs });
          return;
        }
        if (now() < turn.dueAt) return;
        cpuTurns.delete(lane.laneId);
        try {
          var signal = cpuLaunch({ laneId: lane.laneId, playerId: lane.playerId,
            matchId: state.matchId });
          if (!signal) { cpuBlocked = CPU_UNAVAILABLE; return; }
          cpuBlocked = '';
          runtime.prepareCpuLaunch(lane.playerId, { launchSignal: signal, startedAt: now() });
        } catch (error) {
          message = error && error.message ? error.message : String(error);
        }
      });
    }

    function competitorKey(player) {
      var formatId = reservation ? reservation.config.formatId : null;
      return formatId === 'doubles' || formatId === 'team' ? player.teamId : player.id;
    }

    function submit() {
      var handle = reservation.handle;
      var completed = series;
      submission = Promise.resolve()
        .then(function () { return application.battle.submitResult(handle, completed); })
        .then(function () { stopRuntime(); wake(); })
        .catch(function (error) {
          message = error && error.message ? error.message : String(error);
          // A refused series is not a reward waiting to be written: the authority
          // never took it, so no retry can change its mind. Leaving the
          // reservation open would keep the screen on a save nothing can finish,
          // with no retry to offer and no Battle able to open behind it, so the
          // reservation goes back and the series becomes something to read.
          // A finalization that failed on its way to storage is the other case:
          // that reward is owed and the authority keeps it for the retry.
          var view = application.battle.snapshot();
          if (view && view.status !== 'finalizing' && view.status !== 'finalization-failed') {
            try { application.battle.abandon('result-refused'); } catch (_) {}
            reservation = null;
          }
          stopRuntime(); wake();
        });
      return submission;
    }

    // Every path out of a running series comes through here, so the lane is
    // given back exactly once however the series ended.
    // A lane rectangle is client pixels on real glass. When the glass changes
    // size the rules keep running, so the pointer router has to be re-aimed or
    // every flick after a rotation is qualified against a lane that has moved.
    function resize() {
      if (!runtime || !stageElement || !reservation) return snapshot();
      try {
        runtime.updateLaneRects(laneRectsFor(stageElement,
          reservation.config.hardware.activeLaneLimit));
      } catch (error) {
        message = error && error.message ? error.message : String(error);
      }
      wake();
      return snapshot();
    }

    function stopRuntime() {
      stageElement = null;
      cpuTurns.clear();
      cpuBlocked = '';
      if (frameId != null) { cancelFrame(frameId); frameId = null; }
      if (detachPointers) { try { detachPointers(); } catch (_) {} detachPointers = null; }
      if (runtime) { try { runtime.destroy(); } catch (_) {} runtime = null; }
      if (laneOpen) {
        laneOpen = false;
        if (closeLane) { try { closeLane(); } catch (_) {} }
      }
    }

    function choosePower(input) {
      if (!runtime) throw new Error('No Battle is running');
      var source = input || {};
      var state = runtime.snapshot().battle;
      var player = state.config.players.find(function (entry) { return entry.id === source.playerId; });
      if (!player) throw new Error('That player is not in this Battle');
      var offer = state.powerOffers[competitorKey(player)] || [];
      var index = -1;
      for (var position = 0; position < offer.length; position += 1) {
        if (offer[position].id === source.cardId) index = position;
      }
      if (index < 0) throw new Error('That card is not on offer');
      runtime.choosePower({ playerId: source.playerId, index: index, targetId: source.targetId });
      settle();
      return snapshot();
    }

    // Only lanes the rules currently expect a launch from are shown, so the
    // screen can never invite a flick the runtime would refuse.
    function lanes() {
      if (!runtime || !series || series.phase === 'complete') return [];
      var active = series.activePlayerIds || [];
      return runtime.snapshot().lanes.filter(function (lane) {
        return lane.playerId && active.indexOf(lane.playerId) >= 0;
      }).slice(0, series.config.hardware.activeLaneLimit).map(function (lane) {
        // A CPU lane takes no pointer, so it must never invite a flick — and it
        // must not claim to be lining one up when nothing can flick for it.
        return { laneId: lane.laneId, playerId: lane.playerId,
          status: lane.cpu && lane.state === 'ready'
            ? (cpuBlocked ? 'Waiting' : 'CPU is lining up')
            : (LANE_STATUS[lane.state] || 'Waiting') };
      });
    }

    function status() {
      var view = application.battle.snapshot();
      if (!view) return 'settled';
      if (view.status === 'finalizing') return 'finalizing';
      if (view.status === 'finalization-failed') return 'retryable';
      if (view.status === 'completed') return 'settled';
      // The last heat is in: the series is on its way to the reward authority,
      // and the screen must stop inviting flicks before that lands.
      if (series && series.phase === 'complete') return 'finalizing';
      return 'playing';
    }

    function snapshot() {
      // Releasing a reservation makes the authority emit, and its Battle view is
      // already empty by then: projecting the series still in hand at that moment
      // reads as a settled one. There is no series to show on the way out.
      if (!series || releasing) return null;
      // A real fault says more than a stalled CPU lane does, so it keeps the line.
      return { status: status(), state: series, lanes: lanes(),
        message: message || cpuBlocked };
    }

    // Leaving a Battle is not finishing one, so nothing on the way out may look
    // like a result. A refused release still leaves the lane exactly as it was.
    function abandon() {
      var left;
      releasing = true;
      try {
        left = Promise.resolve(application.battle.abandon('left-battle'));
      } catch (error) {
        releasing = false;
        throw error;
      }
      stopRuntime();
      reservation = null; series = null; releasing = false;
      wake();
      return left;
    }

    return Object.freeze({
      schema: 'FlipgameV112BattleHostV1',
      capabilities: capabilities,
      prepare: prepare,
      start: start,
      cancel: cancel,
      resize: resize,
      snapshot: snapshot,
      subscribe: function (listener) {
        listeners.add(listener);
        return function () { listeners.delete(listener); };
      },
      choosePower: choosePower,
      abandon: abandon,
      retryFinalization: function () {
        return Promise.resolve(application.battle.retryFinalization()).then(function (result) {
          wake(); return result;
        }, function (error) { message = error.message; wake(); throw error; });
      },
      close: function () {
        stopRuntime();
        if (unsubscribeApplication) { unsubscribeApplication(); unsubscribeApplication = null; }
        listeners.clear();
      },
    });
  }

  return Object.freeze({ schema: 'FlipgameBattleHostFactoryV1', createBattleHost: createBattleHost });
});
