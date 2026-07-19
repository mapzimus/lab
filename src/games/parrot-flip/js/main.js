// main.js — game loop, wires everything together (loaded last)

(function () {
  const canvas       = document.getElementById('game-canvas');
  const setupScreen  = document.getElementById('setup-screen');
  const gameScreen   = document.getElementById('game-screen');
  const gameOverEl   = document.getElementById('game-over');
  const winnerNameEl = document.getElementById('winner-name');
  const playAgainBtn = document.getElementById('play-again-btn');
  const playerListEl = document.getElementById('player-list');
  const pointCountEl = document.getElementById('point-count');
  const turnBannerEl = document.getElementById('turn-banner');
  const streakBannerEl = document.getElementById('streak-banner');
  const flipHintEl   = document.getElementById('flip-hint');
  const startBtn     = document.getElementById('start-btn');
  const practiceBtn  = document.getElementById('practice-btn');
  const addPlayerBtn = document.getElementById('add-player-btn');
  const playerInputs = document.getElementById('player-inputs');
  const handoffEl    = document.getElementById('handoff-overlay');
  const handoffNameEl = document.getElementById('handoff-name');
  const tutorialEl   = document.getElementById('tutorial-overlay');
  const tutorialDoneBtn = document.getElementById('tutorial-done-btn');
  const practiceMeterEl = document.getElementById('practice-meter');
  const matchSummaryEl  = document.getElementById('match-summary');

  // ── Sizing ─────────────────────────────────────────────────────────────────
  // Scale the backing store by devicePixelRatio so everything is crisp on a
  // hi-DPI smartboard. We draw in LOGICAL (CSS) pixels — the transform maps
  // them to physical pixels — so physics/renderer keep using logical coords.
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2 (fill-rate)
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    Renderer.resize(w, h);
    Physics.resizeWorld(w, h);   // keep ground/walls in sync (no-op before init)
  }
  window.addEventListener('resize', resize);

  // ── Parrot roster (feather color = whose turn it is) ────────────────────────
  // Every bird wears the eye patch — that's the brand. accent tints wing/tail.
  const PARROTS = [
    { name: 'Captain Squawk',  color: '#d62828', accent: '#ffd166', vibe: 'Bossy. Claims every make was intentional.' },
    { name: 'Pegleg Polly',    color: '#ff4d8d', accent: '#ffe3ef', vibe: 'Dramatic. Screams on every miss.' },
    { name: 'Doubloon Dave',   color: '#e9c46a', accent: '#b8860b', vibe: 'Greedy. Only flips for gold.' },
    { name: 'Stormy Beak',     color: '#457b9d', accent: '#a8dadc', vibe: 'Gloomy. Predicted this miss yesterday.' },
    { name: 'Barnacle Bill',   color: '#2a9d8f', accent: '#e9c46a', vibe: 'Salty. Has notes on your flick form.' },
    { name: 'Sir Chirpsalot',  color: '#7b2cbf', accent: '#e0aaff', vibe: 'Posh. Tips a tiny hat after makes.' },
    { name: 'Cannonball Carl', color: '#f4a261', accent: '#e76f51', vibe: 'Explosive. Zero chill, maximum spin.' },
    { name: 'Whisper Wing',    color: '#2ec4b6', accent: '#cbf3f0', vibe: 'Mysterious. Knows what the wind knows.' },
    { name: 'Hardtack Helen',  color: '#bc6c25', accent: '#ffe8c2', vibe: 'Hungry. Flips better after crackers.' },
  ];
  const FLAVORS = PARROTS;   // legacy alias — the rest of the code predates the birds

  // ── Player setup rows (name + flavor picker + Human/CPU) ────────────────────
  let playerCount = 2;

  function swatchesHtml(sel) {
    return FLAVORS.map((f, i) =>
      `<button type="button" class="flavor-swatch${i === sel ? ' selected' : ''}" data-idx="${i}" style="background:${f.color}" title="${f.name}"></button>`
    ).join('');
  }

  function rowHtml(i, def) {
    return `<div class="player-input-row" data-flavor="${def.flavor}" data-ai="${def.ai ? 1 : 0}">
      <div class="prow-top">
        <span class="player-num" style="color:${FLAVORS[def.flavor].color}">P${i + 1}</span>
        <input type="text" placeholder="Player ${i + 1}" maxlength="14" value="${escapeHtml(def.name)}">
        <button type="button" class="ai-toggle${def.ai ? ' cpu' : ''}" title="Tap to switch Human / CPU">${def.ai ? '🤖' : '🧑'}</button>
        ${i >= 2 ? '<button type="button" class="remove-player-btn" title="Remove">✕</button>' : ''}
      </div>
      <div class="flavor-picker">${swatchesHtml(def.flavor)}</div>
      <div class="parrot-vibe"><b>${PARROTS[def.flavor].name}</b> — ${PARROTS[def.flavor].vibe}</div>
    </div>`;
  }

  function readRows() {
    return [...playerInputs.querySelectorAll('.player-input-row')].map(row => ({
      name: row.querySelector('input').value,
      flavor: parseInt(row.dataset.flavor) || 0,
      ai: row.dataset.ai === '1',
    }));
  }

  function renderFrom(defs) {
    playerCount = defs.length;
    playerInputs.innerHTML = defs.map((d, i) => rowHtml(i, d)).join('');
    addPlayerBtn.disabled = playerCount >= 8;
    markTakenSwatches();
  }

  // Soft visual guidance only — dims flavors picked by another row. Duplicates
  // remain legal (the liquid color is the turn indicator, so distinct is nicer).
  function markTakenSwatches() {
    const rows = [...playerInputs.querySelectorAll('.player-input-row')];
    const taken = rows.map(r => parseInt(r.dataset.flavor));
    rows.forEach((row, ri) => {
      row.querySelectorAll('.flavor-swatch').forEach(sw => {
        const idx = parseInt(sw.dataset.idx);
        const usedByOther = taken.some((t, ti) => ti !== ri && t === idx);
        sw.classList.toggle('taken', usedByOther);
      });
    });
  }

  function addPlayerInput() {
    if (playerCount >= 8) return;
    const defs = readRows();
    defs.push({ name: `Player ${defs.length + 1}`, flavor: defs.length % FLAVORS.length, ai: false });
    renderFrom(defs);
  }

  // event delegation: flavor select, AI toggle, remove
  playerInputs.addEventListener('click', (e) => {
    const sw = e.target.closest('.flavor-swatch');
    if (sw) {
      const row = sw.closest('.player-input-row');
      row.dataset.flavor = sw.dataset.idx;
      row.querySelectorAll('.flavor-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      row.querySelector('.player-num').style.color = FLAVORS[+sw.dataset.idx].color;
      const bird = PARROTS[+sw.dataset.idx];
      const vibeEl = row.querySelector('.parrot-vibe');
      if (vibeEl) vibeEl.innerHTML = `<b>${bird.name}</b> — ${bird.vibe}`;
      // Auto-fill the parrot's name unless the player typed a custom one
      const input = row.querySelector('input');
      const autoNames = PARROTS.map(p => p.name);
      if (!input.value.trim() || autoNames.includes(input.value) || /^Player \d+$/.test(input.value)) {
        input.value = bird.name;
      }
      markTakenSwatches();
      return;
    }
    const ai = e.target.closest('.ai-toggle');
    if (ai) {
      const row = ai.closest('.player-input-row');
      const on = row.dataset.ai === '1';
      row.dataset.ai = on ? '0' : '1';
      ai.textContent = on ? '🧑' : '🤖';
      ai.classList.toggle('cpu', !on);
      return;
    }
    const rm = e.target.closest('.remove-player-btn');
    if (rm && playerCount > 2) {
      const defs = readRows();
      defs.splice([...playerInputs.children].indexOf(rm.closest('.player-input-row')), 1);
      renderFrom(defs);
    }
  });

  addPlayerBtn.addEventListener('click', addPlayerInput);

  function rowsToDefs(rows) {
    return rows.map((r, i) => ({
      name: (r.name || '').trim() || `Player ${i + 1}`,
      color: FLAVORS[r.flavor].color,
      isAI: r.ai,
    }));
  }
  function chosenDifficulty() {
    return document.querySelector('input[name="difficulty"]:checked')?.value || 'medium';
  }
  function chosenFeel() {
    return document.querySelector('input[name="feel"]:checked')?.value || 'standard';
  }
  function flickFeedbackOn() {
    return !!document.getElementById('flick-feedback-toggle')?.checked;
  }

  // ── Setup persistence — don't make the class re-type names every day ────────
  const SETUP_KEY = 'flipgame.setup';

  function setRadio(name, value) {
    const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (el) el.checked = true;
  }

  function saveSetup() {
    try {
      localStorage.setItem(SETUP_KEY, JSON.stringify({
        rows:       readRows(),
        direction:  document.querySelector('input[name="direction"]:checked')?.value ?? '1',
        difficulty: chosenDifficulty(),
        feel:       chosenFeel(),
        feedback:   flickFeedbackOn(),
      }));
    } catch (_) {}
  }

  function loadSetup() {
    try {
      const s = JSON.parse(localStorage.getItem(SETUP_KEY));
      if (!s || !Array.isArray(s.rows) || s.rows.length < 2) return false;
      renderFrom(s.rows.slice(0, 8).map((r, i) => ({
        name:   String(r.name ?? `Player ${i + 1}`).slice(0, 14),
        flavor: Math.min(Math.max(parseInt(r.flavor) || 0, 0), FLAVORS.length - 1),
        ai:     !!r.ai,
      })));
      setRadio('direction',  s.direction);
      setRadio('difficulty', s.difficulty);
      setRadio('feel',       s.feel);
      const fb = document.getElementById('flick-feedback-toggle');
      if (fb) fb.checked = !!s.feedback;
      return true;
    } catch (_) { return false; }
  }

  // ── Kiosk mode: fullscreen + keep the panel awake during play ───────────────
  let wakeLock = null;
  async function acquireWakeLock() {
    try {
      if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    } catch (_) {}
  }
  async function enterKioskMode() {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch (_) {}
    await acquireWakeLock();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wakeLock === null) acquireWakeLock();
  });

  // ── Start game ─────────────────────────────────────────────────────────────
  startBtn.addEventListener('click', () => {
    const defs = rowsToDefs(readRows());
    if (defs.length < 2) { alert('Need at least 2 players!'); return; }
    const dir = parseInt(document.querySelector('input[name="direction"]:checked')?.value ?? '1');
    saveSetup();
    Sound.unlock();   // first user gesture — unlock audio
    enterKioskMode();
    maybeShowTutorial(() => {
      setupScreen.classList.add('hidden');
      gameScreen.classList.remove('hidden');
      gameOverEl.classList.add('hidden');
      startGame(defs, dir, { difficulty: chosenDifficulty(), feel: chosenFeel() });
    });
  });

  // ── Practice (solo, no lives) ───────────────────────────────────────────────
  practiceBtn.addEventListener('click', () => {
    const r0 = readRows()[0] || { name: 'You', flavor: 0 };
    const def = { name: (r0.name || '').trim() || 'You', color: FLAVORS[r0.flavor].color, isAI: false };
    saveSetup();
    Sound.unlock();
    enterKioskMode();
    maybeShowTutorial(() => {
      setupScreen.classList.add('hidden');
      gameScreen.classList.remove('hidden');
      gameOverEl.classList.add('hidden');
      startGame([def], 1, { practice: true, feel: chosenFeel() });
    });
  });

  playAgainBtn.addEventListener('click', () => {
    gameOverEl.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    if (game.practice) {
      startGame([{ name: game.players[0].name, color: game.players[0].color, isAI: false }], 1, { practice: true, feel: chosenFeel() });
    } else {
      const defs = game.players.map(p => ({ name: p.name, color: p.color, isAI: p.isAI }));
      startGame(defs, game.direction, { difficulty: game.difficulty, feel: chosenFeel() });
    }
  });

  // initial rows — restore the last saved roster, else defaults
  if (!loadSetup()) {
    renderFrom([
      { name: 'Player 1', flavor: 0, ai: false },
      { name: 'Player 2', flavor: 1, ai: false },
    ]);
  }

  // ── Game loop state ────────────────────────────────────────────────────────
  let lastTime    = 0;
  let loopId      = null;
  let evaluating  = false;
  let showGlow    = false;
  let resultTimer = 0;
  let resultAlpha = 0;
  let aiTimer     = null;
  let matchStats  = null;   // per-player display-only tallies (index-aligned, null in practice)
  const RESULT_MS = 1500;

  // CPU takes its turn: aim near the sweet-spot flick, with error set by difficulty.
  function aiFlick() {
    if (game.state !== GAME_STATES.TURN_START && game.state !== GAME_STATES.ON_FIRE) return;
    const sigma = { easy: 650, medium: 400, hard: 220 }[game.difficulty] || 400;
    const u1 = Math.random() || 1e-6, u2 = Math.random();
    const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const up = Math.max(500, 2100 + gauss * sigma);   // sweet spot ~2100 px/s
    const vx = (Math.random() - 0.5) * 420;           // slight lean
    onFlick(vx, -up);
  }

  // CPU pacing: harder CPUs commit a touch faster/steadier; add jitter + a brief
  // wind-up so turns don't read as instant/robotic.
  function aiThinkDelay() {
    const base = { easy: 1300, medium: 1050, hard: 850 }[game.difficulty] || 1050;
    return base + Math.random() * 500;
  }
  function scheduleAi() {
    Input.disable();
    flipHintEl.classList.add('hidden');
    streakBannerEl.textContent = '🤖 rival lining up…';
    streakBannerEl.className = 'streak-banner';
    aiTimer = setTimeout(() => {
      streakBannerEl.textContent = '';
      aiFlick();
    }, aiThinkDelay());
  }

  // ── Turn-handoff gate (pass-and-play clarity + no accidental flicks) ────────
  let handoffCb = null;

  function showHandoff(player, cb) {
    handoffCb = cb;
    handoffNameEl.textContent = player.name;
    handoffNameEl.style.color = player.color;
    handoffEl.classList.remove('hidden');
  }

  handoffEl.addEventListener('click', () => {
    handoffEl.classList.add('hidden');
    const cb = handoffCb; handoffCb = null;
    if (cb) cb();
  });

  // ── First-launch tutorial (shown once, then never blocks) ───────────────────
  const TUTORIAL_KEY = 'flipgame.tutorialSeen';

  function maybeShowTutorial(after) {
    let seen = false;
    try { seen = localStorage.getItem(TUTORIAL_KEY) === '1'; } catch (_) {}
    if (seen) { after(); return; }
    tutorialEl.classList.remove('hidden');
    tutorialDoneBtn.onclick = () => {
      try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch (_) {}
      tutorialEl.classList.add('hidden');
      after();
    };
  }

  function startGame(defs, dir, opts) {
    opts = opts || {};
    Renderer.init(canvas);
    resize();   // sets DPR transform + renderer logical dims (must run after init)
    Physics.init(window.innerWidth, window.innerHeight);  // logical coords
    Physics.setFeel(opts.feel || 'standard');
    Physics.setImpactCallback((type, speed) => {
      if (type === 'ground')     Sound.play('thud', 0.06 + speed * 0.015);
      else if (type === 'wall')  Sound.play('wall');
    });

    game.on(GAME_STATES.TURN_START, onTurnStart);
    game.on(GAME_STATES.RESULT,     onResult);
    game.on(GAME_STATES.ON_FIRE,    onOnFire);
    game.on(GAME_STATES.ELIMINATED, onEliminated);
    game.on(GAME_STATES.GAME_OVER,  onGameOver);

    game.init(defs, dir, opts);

    matchStats = opts.practice ? null
      : game.players.map(() => ({ attempts: 0, makes: 0, cur: 0, bestStreak: 0, bestFire: 0, worstLoss: 0 }));
    practiceMeterEl.classList.add('hidden');   // revealed by the first practice flick

    if (loopId) cancelAnimationFrame(loopId);
    lastTime = performance.now();
    loop(lastTime);
  }

  function loop(now) {
    loopId = requestAnimationFrame(loop);
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    Physics.step(dt); // always step — bottle settles on table during TURN_START too

    // Physics-based landing check
    if (evaluating) {
      const result = Physics.checkLanding();
      if (result) {
        evaluating = false;
        showGlow   = result === 'MAKE';
        const b = Physics.getBottle();
        Renderer.kick(result, {
          x: b.position.x,
          y: b.position.y,
          color: game.currentPlayer()?.color || '#69f0ae',
        });
        game.resolveFlip(result);
      }
    }

    // Result countdown + fade
    if (game.state === GAME_STATES.RESULT) {
      resultTimer -= dt * 1000;
      if (resultTimer > RESULT_MS - 350) {
        resultAlpha = (RESULT_MS - resultTimer) / 350;
      } else if (resultTimer < 400) {
        resultAlpha = resultTimer / 400;
      } else {
        resultAlpha = 1;
      }
      if (resultTimer <= 0) {
        showGlow    = false;
        resultAlpha = 0;
        game.advanceTurn();
      }
    }

    Renderer.frame(dt, {
      bottle:      Physics.getBottle(),
      liquid:      Physics.getLiquid(),
      groundY:     Physics.getGroundY(),
      drag:        Input.getDragState(),
      result:      game.state === GAME_STATES.RESULT ? game.lastResult : null,
      resultAlpha,
      showGlow,
      isOnFire:    !!(game.onFirePlayer),
      liquidColor: game.currentPlayer()?.color,
      accentColor: (PARROTS.find(f => f.color === game.currentPlayer()?.color) || PARROTS[0]).accent,
    });
  }

  // ── State callbacks ────────────────────────────────────────────────────────
  function onTurnStart() {
    evaluating  = false;
    showGlow    = false;
    resultAlpha = 0;
    clearTimeout(aiTimer);
    Physics.resetBottle();
    flipHintEl.classList.remove('hidden');

    const p = game.currentPlayer();
    turnBannerEl.style.color = p.color;   // HUD agrees with liquid + handoff color
    streakBannerEl.textContent = '';
    streakBannerEl.className = 'streak-banner';

    if (game.practice) {
      turnBannerEl.textContent = '🎯 Solo practice';
      pointCountEl.textContent = '';
      Input.enable();
      updateHUD();
      return;
    }

    // Spell the stake out for the room — "×4" is expert shorthand
    pointCountEl.textContent = game.pointCount > 1 ? `⚡ Miss costs ${game.pointCount} lives` : '';
    if (p.isAI) {
      turnBannerEl.textContent = `🤖 ${p.name}`;
      scheduleAi();
    } else {
      turnBannerEl.textContent = `${p.name}'s turn`;
      flipHintEl.classList.add('hidden');           // hidden until they tap in
      showHandoff(p, () => {
        flipHintEl.classList.remove('hidden');
        Input.enable();
      });
    }
    updateHUD();
  }

  function onOnFire() {
    evaluating  = false;
    showGlow    = false;
    clearTimeout(aiTimer);
    Physics.resetBottle();
    flipHintEl.classList.remove('hidden');

    const p = game.currentPlayer();
    turnBannerEl.textContent  = `🔥 ${p.name} IS ON FIRE!`;
    turnBannerEl.style.color  = '#ff6600';
    streakBannerEl.textContent = `+${game.onFireBonus} lives earned`;
    streakBannerEl.className   = 'streak-banner on-fire';
    pointCountEl.textContent   = '';
    if (p.isAI) {
      scheduleAi();
    } else {
      Input.enable();
    }
    updateHUD();
  }

  function onResult() {
    Input.disable();
    flipHintEl.classList.add('hidden');
    resultTimer = RESULT_MS;
    buzz(game.lastResult === 'MAKE' ? 30 : [60, 50, 90]);

    const p = game.currentPlayer();

    // Display-only match tallies for the game-over summary
    if (matchStats) {
      const s = matchStats[game.currentPlayerIndex];
      s.attempts++;
      if (game.lastResult === 'MAKE') {
        s.makes++;
        s.cur++;
        s.bestStreak = Math.max(s.bestStreak, s.cur);
        s.bestFire   = Math.max(s.bestFire, game.onFireBonus);
      } else {
        s.cur = 0;
        s.worstLoss = Math.max(s.worstLoss, game.lastPenalty);
      }
    }

    if (game.practice) {
      if (game.lastResult === 'MAKE') {
        streakBannerEl.textContent = game.practiceStreak > 1 ? `✓ ${game.practiceStreak} in a row!` : '✓ Make!';
        streakBannerEl.className = 'streak-banner on-fire';
        Sound.play('make');
      } else {
        streakBannerEl.textContent = '✗ Miss';
        streakBannerEl.className = 'streak-banner miss-penalty';
        Sound.play('miss');
      }
      updateHUD();
      return;
    }

    if (game.lastResult === 'MAKE') {
      if (game.onFireGain > 0) {
        // ON FIRE bonus make — gained a life
        streakBannerEl.textContent = `🔥 +1 life!  (+${game.onFireBonus} total)`;
        streakBannerEl.className   = 'streak-banner on-fire';
        Sound.play('life');
      } else if (game.justIgnited) {
        streakBannerEl.textContent = '🔥 ON FIRE!';
        streakBannerEl.className   = 'streak-banner on-fire';
        Sound.play('ignite');
      } else if (p.isHeatingUp) {
        streakBannerEl.textContent = '🌡 Heating up!';
        streakBannerEl.className   = 'streak-banner heating-up';
        Sound.play('make');
      } else {
        streakBannerEl.textContent = '';
        streakBannerEl.className   = 'streak-banner';
        Sound.play('make');
      }
    } else if (game.fireEnded) {
      // ON FIRE ended on a miss — no penalty
      streakBannerEl.textContent = '🔥 Streak over — no penalty';
      streakBannerEl.className   = 'streak-banner on-fire';
      Sound.play('miss');
    } else {
      const info = Physics.getLandingInfo();
      const soClose = info && info.flipped && Math.abs(info.finalAngle) < 0.9;
      const n = game.lastPenalty;
      const penalty = `−${n} ${n === 1 ? 'life' : 'lives'}`;
      streakBannerEl.textContent = soClose ? `So close! ${penalty}` : penalty;
      streakBannerEl.className   = 'streak-banner miss-penalty';
      Sound.play('miss');
    }

    updateHUD();
  }

  function onEliminated() {
    const p = game.currentPlayer();
    turnBannerEl.textContent = `❌ ${p.name} is out!`;
    turnBannerEl.style.color = '#ff5252';
    Sound.play('eliminated');
    buzz([80, 60, 80, 60, 160]);
    updateHUD();
    // one-shot flash on the eliminated player's card (cards map 1:1 to players)
    playerListEl.children[game.currentPlayerIndex]?.classList.add('just-out');
    setTimeout(() => game.advanceTurn(), 1800);
  }

  function onGameOver() {
    gameScreen.classList.add('hidden');
    gameOverEl.classList.remove('hidden');
    const active = game.activePlayers();
    winnerNameEl.textContent = active.length ? active[0].name : '???';
    renderMatchSummary(active[0]);
    runConfetti(active[0] ? active[0].color : '#ffcc00');
    Sound.play('win');
    Input.disable();
  }

  function renderMatchSummary(winner) {
    if (game.practice || !matchStats) { matchSummaryEl.innerHTML = ''; return; }
    matchSummaryEl.innerHTML = game.players.map((p, i) => {
      const s = matchStats[i];
      const pct = s.attempts ? Math.round(s.makes / s.attempts * 100) : 0;
      const bits = [`${s.makes}/${s.attempts} (${pct}%)`, `streak ${s.bestStreak}`];
      if (s.bestFire > 0)  bits.push(`🔥 +${s.bestFire}`);
      if (s.worstLoss > 1) bits.push(`worst −${s.worstLoss}`);
      return `<div class="ms-row${winner && p === winner ? ' ms-winner' : ''}">
        <span class="ms-name" style="color:${p.color}">${escapeHtml(p.name)}</span>
        <span class="ms-stats">${bits.join(' · ')}</span>
      </div>`;
    }).join('');
  }

  // ── Flick ──────────────────────────────────────────────────────────────────
  function onFlick(vx, vy) {
    if (game.state !== GAME_STATES.TURN_START &&
        game.state !== GAME_STATES.ON_FIRE) return;

    Sound.unlock();
    Sound.play('flick');
    Physics.applyFlick(vx, vy);

    // Practice trainer: show where this flick landed on the strength meter
    if (game.practice) updatePracticeMeter(Physics.getLastFlickInfo());

    // Optional learning aid: flash how this flick's strength compares to the
    // ~2100 px/s sweet spot. Shown during airtime; onResult overwrites it.
    if (flickFeedbackOn()) {
      const info = Physics.getLastFlickInfo();
      if (info) {
        const d = info.upSpeed - 2100;
        streakBannerEl.textContent = Math.abs(d) < 250 ? '✦ Perfect snap' : (d < 0 ? 'Too soft' : 'Too hard');
        streakBannerEl.className = 'streak-banner';
      }
    }

    Input.disable();
    flipHintEl.classList.add('hidden');
    evaluating = true;
    game.setState(GAME_STATES.EVALUATING);  // flag-only state (no callback registered)
  }

  // ── HUD ────────────────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function updateHUD() {
    if (game.practice) {
      const pct = game.practiceAttempts ? Math.round(game.practiceMakes / game.practiceAttempts * 100) : 0;
      playerListEl.innerHTML = `<div class="practice-stats">
        <div class="ps-item"><span class="ps-num">${game.practiceMakes}/${game.practiceAttempts}</span><span class="ps-label">makes</span></div>
        <div class="ps-item"><span class="ps-num">${pct}%</span><span class="ps-label">rate</span></div>
        <div class="ps-item"><span class="ps-num">${game.practiceStreak}</span><span class="ps-label">streak</span></div>
        <div class="ps-item"><span class="ps-num">${game.practiceBest}</span><span class="ps-label">best</span></div>
      </div>`;
      return;
    }
    playerListEl.innerHTML = game.players.map((p, i) => {
      const active = i === game.currentPlayerIndex && !p.eliminated;
      let cls = 'player-card';
      if (p.eliminated)       cls += ' eliminated';
      else if (active)        cls += ' active';
      if (p.isOnFire)         cls += ' on-fire';
      else if (p.isHeatingUp) cls += ' heating-up';
      if (!p.eliminated && p.lives <= 3) cls += ' low-lives';

      return `<div class="${cls}">
        <span class="p-name">${escapeHtml(p.name)}</span>
        <span class="p-lives-num">${p.lives}</span>
        <span class="p-lives-label">lives</span>
      </div>`;
    }).join('');
  }

  Input.attach(canvas, onFlick);

  // ── Haptics (phones; skipped under reduced motion) ──────────────────────────
  function buzz(pattern) {
    if (reduceMotion) return;
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) {}
  }

  // ── Practice strength meter ─────────────────────────────────────────────────
  // Maps upSpeed 1000..3200 px/s onto the track; the green band is the make
  // window (~1800–2400, sweet spot 2100 — see HANDOFF Part 6).
  function updatePracticeMeter(info) {
    if (!info) return;
    practiceMeterEl.classList.remove('hidden');
    const pct = Math.max(0, Math.min(1, (info.upSpeed - 1000) / 2200)) * 100;
    practiceMeterEl.querySelector('.pm-marker').style.left = pct + '%';
  }

  // ── Winner confetti (game-over screen has its own small canvas) ─────────────
  function runConfetti(color) {
    if (reduceMotion) return;
    const c = document.getElementById('confetti-canvas');
    if (!c) return;
    c.width = window.innerWidth;
    c.height = window.innerHeight;
    const cx = c.getContext('2d');
    const colors = [color, '#ffcc00', '#ffffff'];
    const parts = [];
    for (let i = 0; i < 130; i++) {
      parts.push({
        x: c.width / 2 + (Math.random() - 0.5) * 220,
        y: c.height * 0.35,
        vx: (Math.random() - 0.5) * 520,
        vy: -Math.random() * 560 - 120,
        r: 3 + Math.random() * 4,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 10,
        life: 1.6 + Math.random() * 1.2,
        c: colors[i % colors.length],
      });
    }
    let last = performance.now(), elapsed = 0;
    function tick(now) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now; elapsed += dt;
      cx.clearRect(0, 0, c.width, c.height);
      let alive = false;
      for (const p of parts) {
        p.life -= dt;
        if (p.life <= 0) continue;
        alive = true;
        p.vy += 900 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        cx.save();
        cx.translate(p.x, p.y);
        cx.rotate(p.rot);
        cx.globalAlpha = Math.min(1, p.life);
        cx.fillStyle = p.c;
        cx.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2);
        cx.restore();
      }
      if (alive && elapsed < 4 && !gameOverEl.classList.contains('hidden')) {
        requestAnimationFrame(tick);
      } else {
        cx.clearRect(0, 0, c.width, c.height);
      }
    }
    requestAnimationFrame(tick);
  }

  // ── Mute toggle (persisted) ─────────────────────────────────────────────────
  const MUTE_KEY = 'flipgame.muted';
  const muteBtn = document.getElementById('mute-btn');

  function applyMute(v) {
    Sound.setMuted(v);
    muteBtn.textContent = v ? '🔇' : '🔊';
    try { localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch (_) {}
  }
  let muted0 = false;
  try { muted0 = localStorage.getItem(MUTE_KEY) === '1'; } catch (_) {}
  applyMute(muted0);
  muteBtn.addEventListener('click', () => applyMute(!Sound.isMuted()));

  // ── Reduced motion ──────────────────────────────────────────────────────────
  const reduceMotion = !!(window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  Renderer.setReduceMotion(reduceMotion);
  if (reduceMotion) document.body.classList.add('reduce-motion');

  // Show setup on load
  setupScreen.classList.remove('hidden');
  gameScreen.classList.add('hidden');
  gameOverEl.classList.add('hidden');
})();
