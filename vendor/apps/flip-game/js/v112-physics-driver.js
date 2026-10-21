// Passive bridge from the actual Matter Physics singleton to the private
// browser composition. This driver never calls step/checkLanding/resolveFlip.
// Host: const driver = FlipgameV112PhysicsDriver.create(Physics);
//       FlipgameV112.attachPhysics(driver);
// Just before an accepted Physics.applyFlick: driver.armLaunch({manual: !isCpu});
// Cancel the marker if that launch is abandoned before applyFlick.
// Do not mutate Physics synchronously from observation/render subscribers.
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.defineProperty(root, 'FlipgameV112PhysicsDriver', {
    value: api, enumerable: true, writable: false, configurable: false,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  let driverSerial = 0;
  const SUPPORTED_EVENT_ADAPTERS = Object.freeze({ plinko: true });
  function create(physics) {
    if (!physics || typeof physics.getObservation !== 'function' ||
        typeof physics.subscribeObservations !== 'function') {
      throw new TypeError('PhysicsObservationV1 engine hooks are required');
    }
    const prefix = 'engine-' + (++driverSerial) + '-';
    const listeners = new Set();
    let pending = null, active = null, frame = null, closed = false;
    let lastRevision = -1, warning = null, acceptedLaunches = 0;
    function notify() {
      listeners.forEach(listener => { try { listener(); } catch (_) {} });
    }
    function observe(observation) {
      if (closed || !observation || observation.schema !== 'PhysicsObservationV1') return;
      if (!Number.isSafeInteger(observation.revision) || observation.revision <= lastRevision) return;
      lastRevision = observation.revision;
      if (observation.kind === 'reset') {
        if (active && !active.resolved) warning = 'An observed launch was reset before resolution';
        active = null; frame = null; pending = null; notify(); return;
      }
      if (observation.kind === 'launch') {
        const marker = pending; pending = null;
        if (!marker) { active = null; frame = null; return; }
        if (active && !active.resolved) {
          warning = 'Another launch arrived before the observed flip resolved';
          notify(); return;
        }
        active = { sequence: observation.launchSequence,
          launchId: prefix + (++acceptedLaunches), manual: marker.manual, resolved: false };
        warning = null;
      }
      if (!active || active.sequence !== observation.launchSequence || active.resolved) return;
      const eventId = observation.eventId || null;
      let unsupportedReason = eventId && !SUPPORTED_EVENT_ADAPTERS[eventId]
        ? 'event-adapter-required' : null;
      if (observation.landing && !eventId && observation.firstContactMs == null &&
          !observation.landing.airborneTerminalEvidence) {
        unsupportedReason = 'airborne-terminal-adapter-required';
      }
      if (unsupportedReason) warning = unsupportedReason;
      frame = Object.freeze({
        launchId: active.launchId, atMs: observation.atMs, qualified: true,
        manual: active.manual, grounded: observation.grounded,
        phase: observation.phase, eventId,
        landing: observation.landing,
        supported: !unsupportedReason, unsupportedReason,
      });
      if (observation.landing) active.resolved = true;
      notify();
    }
    const unsubscribe = physics.subscribeObservations(observe);
    if (typeof unsubscribe !== 'function') throw new TypeError('Physics observer must supply unsubscribe');
    return Object.freeze({
      schema: 'PhysicsCompositionDriverV1',
      armLaunch(input) {
        if (closed) throw new Error('Physics driver is closed');
        if (!input || typeof input.manual !== 'boolean') throw new TypeError('Launch marker requires an exact manual boolean');
        if (pending) throw new Error('A launch marker is already armed');
        if (active && !active.resolved) throw new Error('Wait for the current flip to resolve');
        pending = Object.freeze({ manual: input.manual });
        return Object.freeze({ armed: true });
      },
      cancelArmedLaunch() { const cancelled = !!pending; pending = null; return cancelled; },
      snapshot() { return frame; },
      status() { return Object.freeze({ closed, armed: !!pending,
        active: !!active && !active.resolved, acceptedLaunches, warning }); },
      subscribe(listener) {
        if (closed) throw new Error('Physics driver is closed');
        if (typeof listener !== 'function') throw new TypeError('Physics subscriber must be a function');
        listeners.add(listener); return () => listeners.delete(listener);
      },
      close() { if (closed) return; closed = true; pending = null; active = null;
        frame = null; unsubscribe(); listeners.clear(); },
    });
  }
  return Object.freeze({ schema: 'PhysicsCompositionDriverFactoryV1', create });
});
