// v112-multipointer.js -- lane-relative concurrent pointer routing for Battle.
// The router owns browser pointer capture and gesture sampling, but no rules or
// physics. Each gesture freezes its lane geometry at pointerdown so a resize
// cannot alter a launch that is already being aimed.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112MultiPointer = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function () {
  'use strict';

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }

  function object(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function finite(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function pointerIdOf(event) {
    var pointerId = Math.floor(finite(event && event.pointerId, NaN));
    if (!Number.isFinite(pointerId)) throw new TypeError('pointerId is required');
    return pointerId;
  }

  function normalizeRect(value, laneId) {
    var source = object(value);
    var width = finite(source.width, finite(source.right, 0) - finite(source.left, 0));
    var height = finite(source.height, finite(source.bottom, 0) - finite(source.top, 0));
    if (!(width > 0) || !(height > 0)) {
      throw new TypeError('Lane ' + laneId + ' requires a positive CSS-pixel rectangle');
    }
    var left = finite(source.left, 0);
    var top = finite(source.top, 0);
    return freeze({
      laneId: String(laneId),
      left: left,
      top: top,
      width: width,
      height: height,
      right: left + width,
      bottom: top + height,
    });
  }

  function eventTime(event, fallback) {
    var stamp = Number(event && event.timeStamp);
    return Number.isFinite(stamp) && stamp >= 0 ? stamp : fallback;
  }

  function sampleFromEvent(event, gesture, fallbackTime) {
    var clientX = finite(event && event.clientX, gesture.lastClientX);
    var clientY = finite(event && event.clientY, gesture.lastClientY);
    var timeStamp = eventTime(event, fallbackTime);
    var geometry = gesture.geometry;
    return freeze({
      pointerId: gesture.pointerId,
      pointerType: gesture.pointerType,
      clientX: clientX,
      clientY: clientY,
      x: clientX - geometry.left,
      y: clientY - geometry.top,
      nx: (clientX - geometry.left) / geometry.width,
      ny: (clientY - geometry.top) / geometry.height,
      pressure: Math.max(0, finite(event && event.pressure, 0)),
      timeStamp: timeStamp,
      elapsedMs: Math.max(0, timeStamp - gesture.startedAt),
    });
  }

  function eventSamples(event, fallbackTime) {
    var samples = [];
    if (event && typeof event.getCoalescedEvents === 'function') {
      try {
        var coalesced = event.getCoalescedEvents();
        if (coalesced && typeof coalesced.length === 'number') {
          for (var i = 0; i < coalesced.length; i++) samples.push(coalesced[i]);
        }
      } catch (_) {}
    }
    // Browsers disagree on whether the dispatched event is already the final
    // coalesced sample. Include it exactly once, then restore chronological
    // order before measuring peak velocity.
    var last = samples.length ? samples[samples.length - 1] : null;
    if (event && (!last || finite(last.clientX, NaN) !== finite(event.clientX, NaN) ||
        finite(last.clientY, NaN) !== finite(event.clientY, NaN) ||
        eventTime(last, fallbackTime) !== eventTime(event, fallbackTime))) samples.push(event);
    return samples.map(function (sample, index) {
      return { sample: sample, index: index, timeStamp: eventTime(sample, fallbackTime) };
    }).sort(function (a, b) {
      return a.timeStamp === b.timeStamp ? a.index - b.index : a.timeStamp - b.timeStamp;
    }).map(function (entry) { return entry.sample; });
  }

  function createMultiPointerRouter(options) {
    var opts = object(options);
    var laneRects = new Map();
    var laneOrder = [];
    var enabledLanes = new Set();
    var gestures = new Map();
    var pointerByLane = new Map();
    var attachedTarget = null;
    var laneRectsInitialized = false;
    var hasExplicitEnabledLanes = Object.prototype.hasOwnProperty.call(opts, 'enabledLaneIds');

    var onStart = typeof opts.onStart === 'function' ? opts.onStart : function () { return true; };
    var onSample = typeof opts.onSample === 'function' ? opts.onSample : function () {};
    var onRelease = typeof opts.onRelease === 'function' ? opts.onRelease : function () {};
    var onCancel = typeof opts.onCancel === 'function' ? opts.onCancel : function () {};
    var captureTarget = opts.captureTarget || null;
    var clock = typeof opts.now === 'function' ? opts.now
      : (typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? function () { return performance.now(); } : function () { return Date.now(); });

    function setLaneRects(values) {
      var entries;
      if (Array.isArray(values)) {
        entries = values.map(function (entry) {
          var source = object(entry);
          return [String(source.laneId || source.id), source.rect || source];
        });
      } else {
        entries = Object.keys(object(values)).map(function (laneId) {
          return [laneId, values[laneId]];
        });
      }
      if (!entries.length) throw new TypeError('At least one lane rectangle is required');
      var nextRects = new Map();
      var nextOrder = [];
      entries.forEach(function (entry) {
        var laneId = String(entry[0] || '').trim();
        if (!laneId) throw new TypeError('laneId is required');
        if (nextRects.has(laneId)) throw new TypeError('Duplicate lane rectangle: ' + laneId);
        nextRects.set(laneId, normalizeRect(entry[1], laneId));
        nextOrder.push(laneId);
      });
      laneRects = nextRects;
      laneOrder = nextOrder;
      if (!laneRectsInitialized && !hasExplicitEnabledLanes) {
        nextOrder.forEach(function (laneId) { enabledLanes.add(laneId); });
      }
      Array.from(enabledLanes).forEach(function (laneId) {
        if (!nextRects.has(laneId)) enabledLanes.delete(laneId);
      });
      laneRectsInitialized = true;
      return snapshot();
    }

    function setEnabledLaneIds(values) {
      var next = new Set((Array.isArray(values) ? values : []).map(String));
      next.forEach(function (laneId) {
        if (!laneRects.has(laneId)) throw new TypeError('Unknown lane: ' + laneId);
      });
      enabledLanes = next;
      return snapshot();
    }

    function findLane(clientX, clientY) {
      for (var i = 0; i < laneOrder.length; i++) {
        var laneId = laneOrder[i];
        if (!enabledLanes.has(laneId) || pointerByLane.has(laneId)) continue;
        var rect = laneRects.get(laneId);
        if (clientX >= rect.left && clientX <= rect.right &&
            clientY >= rect.top && clientY <= rect.bottom) return laneId;
      }
      return null;
    }

    function targetFor(event) {
      return captureTarget || (event && event.currentTarget) || attachedTarget || null;
    }

    function capture(event, pointerId) {
      var target = targetFor(event);
      if (!target || typeof target.setPointerCapture !== 'function') return;
      try { target.setPointerCapture(pointerId); } catch (_) {}
    }

    function releaseCapture(event, pointerId) {
      var target = targetFor(event);
      if (!target || typeof target.releasePointerCapture !== 'function') return;
      try {
        if (typeof target.hasPointerCapture !== 'function' || target.hasPointerCapture(pointerId)) {
          target.releasePointerCapture(pointerId);
        }
      } catch (_) {}
    }

    function prevent(event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
    }

    function appendSamples(gesture, event) {
      var fallbackTime = clock();
      var raw = eventSamples(event, fallbackTime);
      raw.forEach(function (candidate) {
        if (candidate && candidate.pointerId != null &&
            Math.floor(Number(candidate.pointerId)) !== gesture.pointerId) return;
        var sample = sampleFromEvent(candidate, gesture, fallbackTime);
        // A stale driver sample must not become a one-millisecond speed spike
        // or move the canonical gesture endpoint backwards in time.
        if (sample.timeStamp < gesture.lastTimeStamp) return;
        var last = gesture.samples.length ? gesture.samples[gesture.samples.length - 1] : null;
        if (last && last.clientX === sample.clientX && last.clientY === sample.clientY &&
            last.timeStamp === sample.timeStamp) return;
        gesture.samples.push(sample);
        gesture.lastClientX = sample.clientX;
        gesture.lastClientY = sample.clientY;
        gesture.lastTimeStamp = Math.max(gesture.lastTimeStamp, sample.timeStamp);
        onSample(freeze({ laneId: gesture.laneId, pointerId: gesture.pointerId,
          geometry: gesture.geometry, sample: sample }));
      });
    }

    function publicGesture(gesture, reason) {
      return freeze({
        laneId: gesture.laneId,
        pointerId: gesture.pointerId,
        pointerType: gesture.pointerType,
        geometry: gesture.geometry,
        samples: gesture.samples.slice(),
        startedAt: gesture.startedAt,
        endedAt: gesture.lastTimeStamp,
        reason: reason || null,
      });
    }

    function handlePointerDown(event) {
      var pointerId = pointerIdOf(event);
      if (gestures.has(pointerId)) return false;
      var clientX = finite(event && event.clientX, NaN);
      var clientY = finite(event && event.clientY, NaN);
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
      var laneId = findLane(clientX, clientY);
      if (!laneId) return false;
      var geometry = laneRects.get(laneId);
      var startedAt = eventTime(event, clock());
      var gesture = {
        laneId: laneId,
        pointerId: pointerId,
        pointerType: String(event && event.pointerType || 'unknown'),
        geometry: geometry,
        samples: [],
        startedAt: startedAt,
        lastClientX: clientX,
        lastClientY: clientY,
        lastTimeStamp: startedAt,
      };
      var accepted = onStart(freeze({ laneId: laneId, pointerId: pointerId,
        pointerType: gesture.pointerType, geometry: geometry,
        startedAt: startedAt })) !== false;
      if (!accepted) return false;
      gestures.set(pointerId, gesture);
      pointerByLane.set(laneId, pointerId);
      capture(event, pointerId);
      appendSamples(gesture, event);
      prevent(event);
      return true;
    }

    function handlePointerMove(event) {
      var pointerId = pointerIdOf(event);
      var gesture = gestures.get(pointerId);
      if (!gesture) return false;
      appendSamples(gesture, event);
      prevent(event);
      return true;
    }

    function finish(event, cancelled, reason) {
      var pointerId = pointerIdOf(event);
      var gesture = gestures.get(pointerId);
      if (!gesture) return false;
      if (!cancelled) appendSamples(gesture, event);
      gestures.delete(pointerId);
      pointerByLane.delete(gesture.laneId);
      releaseCapture(event, pointerId);
      var value = publicGesture(gesture, reason);
      if (cancelled) onCancel(value);
      else onRelease(value);
      prevent(event);
      return true;
    }

    function handlePointerUp(event) { return finish(event, false, 'pointerup'); }
    function handlePointerCancel(event) { return finish(event, true, 'pointercancel'); }
    function handleLostPointerCapture(event) {
      return finish(event, true, 'lostpointercapture');
    }

    function cancelPointer(pointerId, reason) {
      var id = Math.floor(finite(pointerId, NaN));
      var gesture = gestures.get(id);
      if (!gesture) return false;
      gestures.delete(id);
      pointerByLane.delete(gesture.laneId);
      releaseCapture(null, id);
      onCancel(publicGesture(gesture, reason || 'cancelled'));
      return true;
    }

    function cancelLane(laneId, reason) {
      var pointerId = pointerByLane.get(String(laneId));
      return pointerId == null ? false : cancelPointer(pointerId, reason || 'lane-disabled');
    }

    function snapshot() {
      var active = Array.from(gestures.values()).map(function (gesture) {
        return publicGesture(gesture, null);
      });
      return freeze({ schema: 'MultiPointerRouterV1', laneOrder: laneOrder.slice(),
        enabledLaneIds: Array.from(enabledLanes), activeGestures: active });
    }

    var handlers = {
      pointerdown: handlePointerDown,
      pointermove: handlePointerMove,
      pointerup: handlePointerUp,
      pointercancel: handlePointerCancel,
      lostpointercapture: handleLostPointerCapture,
    };

    function attach(target) {
      if (!target || typeof target.addEventListener !== 'function') {
        throw new TypeError('Pointer event target is required');
      }
      if (attachedTarget) throw new Error('Pointer router is already attached');
      attachedTarget = target;
      Object.keys(handlers).forEach(function (type) {
        target.addEventListener(type, handlers[type], { passive: false });
      });
      return detach;
    }

    function detach() {
      if (!attachedTarget) return;
      var target = attachedTarget;
      Object.keys(handlers).forEach(function (type) {
        target.removeEventListener(type, handlers[type], { passive: false });
      });
      Array.from(gestures.keys()).forEach(function (pointerId) {
        cancelPointer(pointerId, 'detached');
      });
      attachedTarget = null;
    }

    setLaneRects(opts.laneRects || opts.lanes);
    if (hasExplicitEnabledLanes) setEnabledLaneIds(opts.enabledLaneIds);

    return freeze({ setLaneRects: setLaneRects, setEnabledLaneIds: setEnabledLaneIds,
      handlePointerDown: handlePointerDown, handlePointerMove: handlePointerMove,
      handlePointerUp: handlePointerUp, handlePointerCancel: handlePointerCancel,
      handleLostPointerCapture: handleLostPointerCapture, cancelPointer: cancelPointer,
      cancelLane: cancelLane, attach: attach, detach: detach, snapshot: snapshot });
  }

  return freeze({ schema: 'FlipgameMultiPointerV1', createMultiPointerRouter: createMultiPointerRouter });
});
