// audio.js — tiny synthesized WebAudio SFX (no asset files → stays offline-friendly).
// Must be unlocked from a user gesture (browsers block audio until then).
const Sound = (() => {
  let ctx = null, master = null, muted = false;
  let suddenDeathTimer = null;
  let suddenDeathActive = false;
  let suddenDeathLevel = 1;

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.4;
    master.connect(ctx.destination);
  }

  // A single enveloped oscillator note (optionally pitch-sliding).
  function tone({ freq = 440, type = 'sine', dur = 0.15, gain = 0.3, slideTo = null, delay = 0 }) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }

  // Short filtered noise burst (for the landing thud).
  function noise(dur = 0.12, gain = 0.25, cutoff = 1200) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start(t0);
  }

  const sfx = {
    flick:  () => tone({ freq: 300, slideTo: 760, type: 'triangle', dur: 0.18, gain: 0.16 }),
    make:   () => [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.2, gain: 0.28, delay: i * 0.07 })),
    miss:   () => { noise(0.10, 0.28, 900); tone({ freq: 380, slideTo: 110, type: 'sawtooth', dur: 0.4, gain: 0.2, delay: 0.04 }); },
    life:   () => tone({ freq: 880, slideTo: 1320, type: 'sine', dur: 0.16, gain: 0.22 }),
    ignite: () => { tone({ freq: 200, slideTo: 900, type: 'sawtooth', dur: 0.4, gain: 0.22 });
                    [392, 494, 587, 784].forEach((f, i) => tone({ freq: f, type: 'square', dur: 0.12, gain: 0.16, delay: 0.12 + i * 0.06 })); },
    win:    () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.3, gain: 0.3, delay: i * 0.12 })),
    // Make-it-or-break-it: a low ominous two-note sting + heartbeat thump.
    tension: () => {
      tone({ freq: 110, slideTo: 70, type: 'sine', dur: 0.7, gain: 0.24 });
      tone({ freq: 165, type: 'sine', dur: 0.7, gain: 0.10, delay: 0.04 });
      tone({ freq: 55,  type: 'sine', dur: 0.18, gain: 0.3, delay: 0.0 });
      tone({ freq: 55,  type: 'sine', dur: 0.18, gain: 0.3, delay: 0.45 });
    },
  };

  // Haptic vibration patterns (ms) per event — no-op on devices without it
  // (desktops, most smartboards). ON FIRE events get distinct, punchier patterns.
  const HAPTICS = {
    flick:   10,
    make:    25,
    miss:    [40, 30, 60],
    life:    [12, 16, 12],              // ON FIRE +life — quick double tick
    ignite:  [60, 40, 60, 40, 110],     // ON FIRE ignite — distinct rumble
    win:     [70, 40, 70, 40, 130],
    tension: [25, 70, 25, 70],          // ominous pulse
  };
  function buzz(name) {
    if (muted || !navigator.vibrate) return;
    const p = HAPTICS[name];
    if (p) { try { navigator.vibrate(p); } catch (e) {} }
  }

  function clearSuddenDeathTimer() {
    if (suddenDeathTimer) clearTimeout(suddenDeathTimer);
    suddenDeathTimer = null;
  }

  function pressureTick() {
    if (!ctx || muted || !suddenDeathActive) return;
    const level = Math.max(1, suddenDeathLevel);
    const gain = Math.min(0.18, 0.08 + level * 0.015);
    tone({ freq: 54, type: 'sine', dur: 0.14, gain: gain });
    tone({ freq: 760 + level * 34, slideTo: 520, type: 'square', dur: 0.075, gain: 0.045, delay: 0.035 });
    if (level >= 2) tone({ freq: 54, type: 'sine', dur: 0.10, gain: gain * 0.75, delay: 0.22 });
  }

  function scheduleSuddenDeathTick() {
    clearSuddenDeathTimer();
    if (!ctx || muted || !suddenDeathActive) return;
    const interval = Math.max(260, 720 - suddenDeathLevel * 85);
    suddenDeathTimer = setTimeout(() => {
      pressureTick();
      scheduleSuddenDeathTick();
    }, interval);
  }

  function setSuddenDeath(active, level = 1) {
    const nextLevel = Math.max(1, Math.floor(level) || 1);
    const shouldRun = !!active && !muted;
    if (!shouldRun) {
      suddenDeathActive = !!active;
      suddenDeathLevel = nextLevel;
      clearSuddenDeathTimer();
      return;
    }
    if (suddenDeathActive && suddenDeathLevel === nextLevel && suddenDeathTimer) return;
    suddenDeathActive = true;
    suddenDeathLevel = nextLevel;
    scheduleSuddenDeathTick();
  }

  function stopSuddenDeath() {
    suddenDeathActive = false;
    clearSuddenDeathTimer();
  }

  function setMuted(v) {
    muted = !!v;
    if (muted) clearSuddenDeathTimer();
  }

  return {
    unlock,
    play: (name) => { if (sfx[name]) sfx[name](); buzz(name); },
    setMuted,
    toggleMute: () => { setMuted(!muted); return muted; },
    isMuted: () => muted,
    setSuddenDeath,
    stopSuddenDeath,
  };
})();
