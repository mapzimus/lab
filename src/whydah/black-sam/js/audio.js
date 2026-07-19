/*
 * Black Sam & the Whydah — synthesized sound
 *
 * All audio is generated with the Web Audio API — no audio files, so the
 * game stays self-contained. Sound is MUTED by default; the engine wires
 * the HUD toggle to SFX.setMuted and persists the preference.
 *
 * Invariant (from an earlier bug fix): NO AudioContext is ever created or
 * resumed while muted. Every sound function checks `muted` BEFORE touching
 * ac(); setMuted(false) is the only unmute path, and muting suspends the
 * context so nothing keeps processing in the background.
 */
(function () {
  "use strict";

  var ctx = null;
  var muted = true;
  var seaGain = null;   // ambient master gain (null until the sea starts)
  var seaWanted = false; // startSea() was asked for (maybe while muted)
  var noiseBuf = null;  // shared 4s white-noise buffer, built lazily
  var SEA_LEVEL = 0.055;

  function ac() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function env(g, t, attack, peak, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  // One shared noise buffer; short sounds read from a random offset so no
  // two thunks are quite alike and nothing is reallocated per call.
  function noise(c) {
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate * 4, c.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  // Connect `node` to the speakers, nudged a little off-centre where the
  // browser supports StereoPannerNode; silently mono everywhere else.
  function toOut(c, node, pan) {
    if (pan && c.createStereoPanner) {
      var p = c.createStereoPanner();
      p.pan.value = pan;
      node.connect(p); p.connect(c.destination);
    } else {
      node.connect(c.destination);
    }
  }

  // opts: { delay, attack, pan, q, freqEnd } — all optional.
  function playNoise(dur, filterType, freq, peak, decay, opts) {
    // Check `muted` before touching ac() — otherwise every SFX call (e.g.
    // the click sound fired on every choice, regardless of the sound
    // setting) would create/resume a live AudioContext just to immediately
    // discard it, defeating the point of sound being off by default.
    if (muted) return;
    var c = ac(); if (!c) return;
    opts = opts || {};
    var t = c.currentTime + (opts.delay || 0);
    var src = c.createBufferSource();
    src.buffer = noise(c);
    var f = c.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t);
    if (opts.freqEnd) f.frequency.exponentialRampToValueAtTime(opts.freqEnd, t + dur);
    if (opts.q) f.Q.value = opts.q;
    var g = c.createGain();
    env(g, t, opts.attack || 0.01, peak, decay);
    src.connect(f); f.connect(g);
    toOut(c, g, opts.pan || 0);
    var offset = Math.random() * Math.max(0, 4 - dur - 0.05);
    src.start(t, offset, dur);
    src.stop(t + dur);
  }

  // opts: { delay, attack, pan } — all optional; older 5-arg calls still work.
  function tone(type, f0, f1, dur, peak, opts) {
    if (muted) return; // see playNoise() above
    var c = ac(); if (!c) return;
    opts = opts || {};
    var t = c.currentTime + (opts.delay || 0);
    var o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    var g = c.createGain();
    env(g, t, opts.attack || 0.008, peak, dur);
    o.connect(g);
    toOut(c, g, opts.pan || 0);
    o.start(t); o.stop(t + dur + 0.05);
  }

  window.SFX = {
    isMuted: function () { return muted; },

    setMuted: function (m) {
      muted = !!m;
      if (muted) {
        if (seaGain) {
          if (ctx && seaGain.gain.cancelScheduledValues) {
            seaGain.gain.cancelScheduledValues(ctx.currentTime);
          }
          seaGain.gain.value = 0;
        }
        if (ctx && ctx.state === "running") {
          ctx.suspend(); // stop processing audio entirely while muted
        }
        return;
      }
      ac(); // resume/create context on user gesture
      // If the sea was requested while muted, start it now.
      if (!seaGain && seaWanted) window.SFX.startSea();
      if (seaGain && ctx) {
        // Ease the ambience back in rather than slamming it on.
        if (seaGain.gain.setTargetAtTime) {
          seaGain.gain.cancelScheduledValues(ctx.currentTime);
          seaGain.gain.setValueAtTime(0.0001, ctx.currentTime);
          seaGain.gain.setTargetAtTime(SEA_LEVEL, ctx.currentTime, 0.5);
        } else {
          seaGain.gain.value = SEA_LEVEL;
        }
      }
    },

    // Small dry click for choice selection: soft blip plus a tiny tick.
    click: function () {
      tone("triangle", 700, 340, 0.06, 0.11);
      playNoise(0.03, "highpass", 4000, 0.05, 0.025);
    },

    // Layered cannon: muzzle crack, deep thump, boom body, and a long low
    // rumble that rolls away across the water on the other side.
    cannon: function () {
      var side = Math.random() * 0.5 - 0.25;
      playNoise(0.08, "highpass", 1500, 0.28, 0.06, { pan: side, attack: 0.004 });
      tone("sine", 120, 34, 0.55, 0.42, { pan: side });
      playNoise(0.5, "lowpass", 420, 0.32, 0.45, { pan: side });
      playNoise(1.4, "lowpass", 150, 0.15, 1.3, { pan: -side * 0.6, attack: 0.05, freqEnd: 60 });
    },

    // Sword clash: two inharmonic metal partials, a bright scrape, and a
    // thin ring left hanging in the air after the blades part.
    clash: function () {
      tone("square", 2093, 1400, 0.08, 0.06, { pan: -0.2 });
      tone("square", 3136, 2500, 0.06, 0.045, { pan: 0.25 });
      playNoise(0.12, "highpass", 3500, 0.15, 0.1);
      tone("sine", 2637, 2600, 0.5, 0.04, { pan: 0.1 });
    },

    // Shovel in wet sand: dull pitch-dropping thud, the thunk of the blade,
    // then a softer slop as the sand comes off the shovel.
    dig: function () {
      tone("sine", 100, 45, 0.12, 0.2);
      playNoise(0.14, "lowpass", 500, 0.24, 0.12);
      playNoise(0.22, "bandpass", 900, 0.1, 0.18, { delay: 0.07, q: 1.2, freqEnd: 500 });
    },

    // Coins: quick pings that skitter across the stereo field, each one a
    // detuned pair so it shimmers like real metal.
    coins: function () {
      if (muted) return;
      [1568, 1976, 2349].forEach(function (f, i) {
        var pan = (i - 1) * 0.3;
        tone("sine", f, f * 0.985, 0.16, 0.09, { delay: i * 0.055, pan: pan });
        tone("sine", f * 1.008, f, 0.1, 0.04, { delay: i * 0.055, pan: pan });
      });
    },

    // Wind swell for storm moments: builds for nearly a second, the gust
    // sweeping up in pitch as it rises, then sighs back down and away.
    wind: function () {
      if (muted) return;
      var c = ac(); if (!c) return;
      var t = c.currentTime;
      var src = c.createBufferSource();
      src.buffer = noise(c);
      src.loop = true;
      var f = c.createBiquadFilter();
      f.type = "bandpass"; f.Q.value = 0.9;
      f.frequency.setValueAtTime(300, t);
      f.frequency.exponentialRampToValueAtTime(950, t + 1.1);
      f.frequency.exponentialRampToValueAtTime(250, t + 2.4);
      var g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      src.connect(f); f.connect(g);
      toOut(c, g, Math.random() * 0.6 - 0.3);
      src.start(t); src.stop(t + 2.5);
    },

    // Creaking hull: two barely-detuned saws bending downward through a
    // lowpass, answered by a lower groan from somewhere aft.
    creak: function () {
      if (muted) return;
      var c = ac(); if (!c) return;
      var t = c.currentTime;
      var g = c.createGain();
      env(g, t, 0.06, 0.05, 0.5);
      var f = c.createBiquadFilter();
      f.type = "lowpass"; f.frequency.value = 600;
      [88, 89.7].forEach(function (base) {
        var o = c.createOscillator();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(base, t);
        o.frequency.exponentialRampToValueAtTime(base * 0.6, t + 0.55);
        o.connect(f);
        o.start(t); o.stop(t + 0.6);
      });
      f.connect(g);
      toOut(c, g, -0.15);
      tone("sawtooth", 70, 48, 0.4, 0.035, { delay: 0.3, pan: 0.2 });
    },

    // Victory sting: a warm major arpeggio — each note carries a soft sine
    // an octave below, and the last chord is left glowing for a moment.
    victory: function () {
      if (muted) return;
      [523, 659, 784, 1047].forEach(function (f, i) {
        var d = i * 0.09;
        var pan = (i - 1.5) * 0.16;
        tone("triangle", f, null, 0.3, 0.12, { delay: d, pan: pan });
        tone("sine", f / 2, null, 0.35, 0.055, { delay: d, pan: pan });
      });
      tone("sine", 523, null, 0.7, 0.05, { delay: 0.36 });
      tone("sine", 784, null, 0.7, 0.04, { delay: 0.36 });
    },

    // Loss sting: falling minor pair, with a quiet low undertone.
    loss: function () {
      tone("triangle", 392, 370, 0.35, 0.13);
      tone("sine", 196, 185, 0.5, 0.055);
      tone("triangle", 311, 290, 0.6, 0.13, { delay: 0.18 });
      tone("sine", 155, 145, 0.8, 0.055, { delay: 0.18 });
    },

    // Bell toll (endings): a soft strike, then the partials of a real bell
    // — a slowly beating hum, the prime, tierce, quint and nominal — each
    // fading at its own pace, the lowest lingering longest.
    bell: function () {
      if (muted) return;
      playNoise(0.04, "highpass", 2500, 0.05, 0.03);
      tone("sine", 329, 327, 3.2, 0.08);   // hum
      tone("sine", 331, 329, 3.0, 0.04);   // detuned hum — slow beating
      tone("sine", 660, 655, 2.4, 0.11);   // prime
      tone("sine", 792, 788, 1.6, 0.05);   // tierce
      tone("sine", 990, 984, 1.1, 0.035);  // quint
      tone("sine", 1320, 1310, 0.8, 0.03); // nominal
    },

    // Continuous sea ambience: two looped noise layers whose slow LFOs
    // swell both loudness and brightness together (waves get louder as
    // they get brighter), decorrelated and spread left/right, over a very
    // quiet low sine drone. Idempotent; a strict no-op while muted, but it
    // remembers being asked so setMuted(false) can start it.
    startSea: function () {
      seaWanted = true;
      if (muted || seaGain) return; // never touch ac() while muted
      var c = ac(); if (!c) return;
      seaGain = c.createGain();
      seaGain.gain.value = SEA_LEVEL;
      seaGain.connect(c.destination);
      [
        { cutoff: 300, rate: 0.07, depth: 130, gain: 0.6, pan: -0.25 },
        { cutoff: 480, rate: 0.11, depth: 200, gain: 0.4, pan: 0.25 }
      ].forEach(function (L) {
        var src = c.createBufferSource();
        src.buffer = noise(c);
        src.loop = true;
        var f = c.createBiquadFilter();
        f.type = "lowpass"; f.frequency.value = L.cutoff;
        var lfo = c.createOscillator();
        lfo.frequency.value = L.rate;
        var fDepth = c.createGain();
        fDepth.gain.value = L.depth;
        lfo.connect(fDepth); fDepth.connect(f.frequency);
        var g = c.createGain();
        g.gain.value = L.gain;
        var swell = c.createGain();
        swell.gain.value = L.gain * 0.4;
        lfo.connect(swell); swell.connect(g.gain);
        src.connect(f); f.connect(g);
        if (c.createStereoPanner) {
          var p = c.createStereoPanner();
          p.pan.value = L.pan;
          g.connect(p); p.connect(seaGain);
        } else {
          g.connect(seaGain);
        }
        lfo.start();
        src.start(0, Math.random() * 2); // decorrelate the shared buffer
      });
      var drone = c.createOscillator();
      drone.type = "sine";
      drone.frequency.value = 55;
      var dg = c.createGain();
      dg.gain.value = 0.25; // ~0.014 absolute under the master gain
      drone.connect(dg); dg.connect(seaGain);
      drone.start();
    }
  };
})();
