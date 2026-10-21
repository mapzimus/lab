// Journey host: the FlipgameV112JourneyHostV1 the Story/Tour route asks for.
//
// It composes two authorities and adds none of its own. The private application
// reserves Story and owns First Flip Tour. The page owns pointers and physics.
// This module carries the reservation between them and tells the page when to
// put the prescribed roster on the live table.
//
// It never scores a pose, writes a checkpoint or awards FXP.
//
// createJourneyHost({
//   application,       // window.FlipgameV112
//   startLiveMatch,    // ({kind, request?, tour?}) -> void
//   closeLiveMatch,    // () -> void
// })
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.defineProperty(root, 'FlipgameV112JourneyHost', { value: api, enumerable: true });
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function copy(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

  function createJourneyHost(options) {
    var opts = options || {};
    var application = opts.application;
    if (!application || typeof application.prepareStory !== 'function' ||
        typeof application.startTour !== 'function') {
      throw new TypeError('The private application is required');
    }
    var startLiveMatch = typeof opts.startLiveMatch === 'function' ? opts.startLiveMatch : null;
    var closeLiveMatch = typeof opts.closeLiveMatch === 'function' ? opts.closeLiveMatch : null;
    var listeners = new Set();
    var pendingHandle = null;
    var kind = null;
    var live = false;
    var releasing = false;
    var lastSignature = null;
    var unsubscribeApplication = application.subscribe
      ? application.subscribe(function () { wake(); }) : null;

    function wake() {
      var view = activitySnapshot();
      var signature = view == null ? 'closed' : JSON.stringify([
        view.kind, view.status, view.message,
        view.tour && view.tour.step && view.tour.step.id,
        view.tour && view.tour.step && view.tour.step.kind,
      ]);
      if (signature === lastSignature) return;
      lastSignature = signature;
      listeners.forEach(function (listener) { try { listener(); } catch (_) {} });
    }

    function storyViews() { return application.storyViews(); }

    function prepareStory(input) {
      pendingHandle = null; kind = 'story'; live = false;
      var prepared = application.prepareStory(input);
      pendingHandle = prepared.handle;
      wake();
      return { handle: prepared.handle, request: copy(prepared.request), card: copy(prepared.card) };
    }

    function startPreparedStory(handle) {
      if (pendingHandle && pendingHandle !== handle) {
        throw new Error('That Story reservation is not current');
      }
      application.startPreparedStory(handle);
      pendingHandle = handle;
      kind = 'story';
      wake();
      return application.snapshot().session;
    }

    function cancelPreparedStory(handle) {
      releasing = true;
      try {
        application.cancelPreparedStory(handle);
      } catch (error) {
        releasing = false;
        throw error;
      }
      pendingHandle = null; kind = null; live = false; releasing = false; wake();
      return null;
    }

    function activitySnapshot() {
      if (releasing) return null;
      var state = application.snapshot();
      if (kind === 'tour' && state.tour) {
        var tourStatus = state.tour.skipped || (state.tour.state && state.tour.state.completed)
          ? 'settled'
          : (live && state.tour.activeAttempt && state.tour.activeAttempt.phase === 'airborne'
            ? 'playing' : 'settled');
        return copy({
          kind: 'tour',
          status: tourStatus,
          message: state.warning || null,
          tour: state.tour,
        });
      }
      if (kind === 'story' && state.session && state.session.status !== 'abandoned' &&
          (!state.story || state.session.request.matchId === state.story.matchId)) {
        var status = state.session.status === 'finalization-failed' ? 'retryable'
          : state.session.status === 'finalizing' ? 'finalizing'
          : state.session.status === 'completed' ? 'settled'
          : 'playing';
        return copy({
          kind: 'story',
          status: status,
          message: status === 'finalizing' ? 'Saving the match result…'
            : (status === 'retryable' ? (state.warning || 'Match saved pending reward retry')
              : (status === 'settled' ? 'Result saved. Your checkpoint is shown below.' : null)),
        });
      }
      if (kind === 'story' && state.story) {
        return copy({ kind: 'story', status: 'playing', message: null });
      }
      return null;
    }

    function enterLive() {
      var spec;
      if (kind === 'tour') {
        spec = { kind: 'tour', tour: application.tourSnapshot() };
      } else if (kind === 'story') {
        var session = application.snapshot().session;
        if (!session || !session.request) throw new Error('Story is not installed on the table');
        spec = { kind: 'story', request: copy(session.request) };
      } else {
        throw new Error('Nothing is prepared for the live table');
      }
      live = true;
      if (startLiveMatch) startLiveMatch(spec);
      wake();
    }

    function leaveLive() {
      live = false;
      if (closeLiveMatch) closeLiveMatch();
      wake();
    }

    function retryFinalization() {
      return application.retryFinalization();
    }

    function startTour(input) {
      pendingHandle = null; kind = 'tour'; live = false;
      var snapshot = application.startTour(input || {});
      wake();
      return snapshot;
    }

    function acknowledgeTour() {
      var snapshot = application.acknowledgeTour();
      wake();
      return snapshot;
    }

    function launchTourAttempt() {
      var attempt = application.launchTourAttempt();
      kind = 'tour';
      wake();
      return attempt;
    }

    function skipTour() {
      releasing = true;
      try {
        application.skipTour();
      } catch (error) {
        releasing = false;
        throw error;
      }
      if (live) leaveLive();
      kind = null; live = false; releasing = false; wake();
    }

    function qualifyTourLaunch(signal, elapsedMs) {
      return application.qualifyTourLaunch(signal, elapsedMs);
    }

    function resolveTourLanding(outcome) {
      var result = application.resolveTourLanding(outcome);
      live = false;
      if (closeLiveMatch) closeLiveMatch();
      wake();
      return result;
    }

    function close() {
      if (unsubscribeApplication) unsubscribeApplication();
      listeners.clear();
    }

    return Object.freeze({
      schema: 'FlipgameV112JourneyHostV1',
      storyViews: storyViews,
      prepareStory: prepareStory,
      startPreparedStory: startPreparedStory,
      cancelPreparedStory: cancelPreparedStory,
      activitySnapshot: activitySnapshot,
      subscribe: function (wakeFn) {
        if (typeof wakeFn !== 'function') throw new TypeError('Subscriber must be a function');
        listeners.add(wakeFn);
        return function () { listeners.delete(wakeFn); };
      },
      retryFinalization: retryFinalization,
      startTour: startTour,
      acknowledgeTour: acknowledgeTour,
      launchTourAttempt: launchTourAttempt,
      skipTour: skipTour,
      enterLive: enterLive,
      leaveLive: leaveLive,
      qualifyTourLaunch: qualifyTourLaunch,
      resolveTourLanding: resolveTourLanding,
      close: close,
    });
  }

  return Object.freeze({ schema: 'FlipgameV112JourneyHostV1', createJourneyHost: createJourneyHost });
});
