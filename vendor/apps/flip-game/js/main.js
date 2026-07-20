// main.js — game loop, wires everything together (loaded last)

(function () {
  const canvas       = document.getElementById('game-canvas');
  const setupScreen  = document.getElementById('setup-screen');
  const gameScreen   = document.getElementById('game-screen');
  const gameOverEl   = document.getElementById('game-over');
  const winnerNameEl = document.getElementById('winner-name');
  const scoreboardEl = document.getElementById('scoreboard');
  const playAgainBtn = document.getElementById('play-again-btn');
  const playerListEl = document.getElementById('player-list');
  const pointCountEl = document.getElementById('point-count');
  const turnBannerEl = document.getElementById('turn-banner');
  const streakBannerEl = document.getElementById('streak-banner');
  const turnTimerEl  = document.getElementById('turn-timer');
  const turnTimerFillEl = document.getElementById('turn-timer-fill');
  const flipHintEl   = document.getElementById('flip-hint');
  const startBtn     = document.getElementById('start-btn');
  const practiceBtn  = document.getElementById('practice-btn');
  const addPlayerBtn = document.getElementById('add-player-btn');
  const playerInputs = document.getElementById('player-inputs');
  const muteBtn      = document.getElementById('mute-btn');
  const recordsPanel = document.getElementById('records-panel');
  const passScreen   = document.getElementById('pass-screen');
  const passCardEl   = document.getElementById('pass-card');
  const passNameEl   = document.getElementById('pass-name');
  const passGoBtn    = document.getElementById('pass-go-btn');
  const gameStatsEl  = document.getElementById('game-stats');
  const menuBtn      = document.getElementById('menu-btn');
  const homeBtn      = document.getElementById('home-btn');

  // ── Sizing ─────────────────────────────────────────────────────────────────
  // Scale the backing store by devicePixelRatio so everything is crisp on a
  // hi-DPI smartboard. We draw in LOGICAL (CSS) pixels — the transform maps
  // them to physical pixels — so physics/renderer keep using logical coords.
  function stageBottomInset() {
    return Math.min(150, Math.max(92, Math.round(window.innerHeight * 0.18)));
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2 (fill-rate)
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    Renderer.resize(w, h);
    scheduleReflow();
  }

  // Re-fit the physics world to the new size (debounced). Without this, the
  // floor + walls keep their original dimensions after a resize/orientation
  // change and the bottle flips against an off-screen floor. Re-place the
  // bottle only when it's at rest (not mid-flight), so a stray resize can't
  // void an in-progress flip.
  let reflowTimer = null;
  function scheduleReflow() {
    clearTimeout(reflowTimer);
    reflowTimer = setTimeout(() => {
      if (!gameStarted) return;
      Physics.reflow(window.innerWidth, window.innerHeight, stageBottomInset());
      // B2: only re-place the bottle when one is genuinely at rest — never mid-flick
      // (a stray resize must not reset a bottle in flight and void it as a MISS).
      if (!evaluating &&
          (game.state === GAME_STATES.TURN_START || game.state === GAME_STATES.ON_FIRE)) {
        Physics.resetBottle();
      }
    }, 150);
  }
  window.addEventListener('resize', resize);

  // ── Gatorade flavors (liquid color = whose turn it is) ──────────────────────
  // Names lightly twisted off the real Gatorade flavors. Ordered so the first 8
  // (max players) are maximally distinct colors.
  const FLAVORS = [
    { name: 'Cool Blue',       color: '#1f9bff' },
    { name: 'Fruit Punch',     color: '#e3263c' },
    { name: 'Lemon-Lime',      color: '#8ed11a' },
    { name: 'Orange',          color: '#ff7a00' },
    { name: 'Grape',           color: '#8a3ffc' },
    { name: 'Glacier Frost',   color: '#5fcfe6' },
    { name: 'Green Apple',     color: '#3fae1a' },
    { name: 'Strawberry Kiwi', color: '#ff5b86' },
    { name: 'Riptide',         color: '#4f63e0' },
    { name: 'Citrus Cooler',   color: '#ffc233' },
    { name: 'Cherry',          color: '#c8203a' },
    { name: 'Berry Frost',     color: '#ff9ecf' },
  ];

  // ── Player setup rows (name + flavor picker + Human/CPU) ────────────────────
  let playerCount = 2;

  function swatchesHtml(sel) {
    return FLAVORS.map((f, i) =>
      `<button type="button" class="flavor-swatch${i === sel ? ' selected' : ''}" data-idx="${i}" style="background:${f.color}" title="${f.name}"></button>`
    ).join('');
  }

  // ── Skins (flippable editions: bottle, parrot, …) ───────────────────────────
  // A fully-themed port (e.g. the parrot site) sets window.FLIP_FORCE_SKIN to
  // force one edition and hide the picker. Otherwise players choose per-row once
  // an edition is unlocked (see Records.unlockSkin).
  const FORCE_SKIN = (typeof window !== 'undefined' && window.FLIP_FORCE_SKIN) || null;

  function availableSkins() {
    const all = window.Skins ? Skins.list() : [{ id: 'bottle', name: 'Bottle', emoji: '🍾' }];
    return all.filter(s => s.id === 'bottle' || Records.isSkinUnlocked(s.id));
  }
  function skinChoiceHtml(sel) {
    const list = availableSkins();
    if (FORCE_SKIN || list.length < 2) return '';   // nothing to choose yet
    return '<div class="skin-picker">' + list.map(s =>
      `<button type="button" class="skin-choice${s.id === sel ? ' selected' : ''}" data-skin="${s.id}">${s.emoji} ${s.name}</button>`
    ).join('') + '</div>';
  }

  function rowHtml(i, def) {
    const skin = def.skin || 'bottle';
    return `<div class="player-input-row" data-flavor="${def.flavor}" data-ai="${def.ai ? 1 : 0}" data-skin="${skin}">
      <div class="prow-top">
        <span class="player-num" style="color:${FLAVORS[def.flavor].color}">P${i + 1}</span>
        <input type="text" placeholder="${escapeHtml(FLAVORS[def.flavor].name)}" maxlength="14" value="${escapeHtml(def.name)}">
        <button type="button" class="ai-toggle${def.ai ? ' cpu' : ''}" title="Tap to switch Human / CPU">${def.ai ? 'CPU' : 'Human'}</button>
        ${i >= 2 ? '<button type="button" class="remove-player-btn" title="Remove">✕</button>' : ''}
      </div>
      <div class="flavor-picker">${swatchesHtml(def.flavor)}</div>
      ${skinChoiceHtml(skin)}
    </div>`;
  }

  function readRows() {
    return [...playerInputs.querySelectorAll('.player-input-row')].map(row => ({
      name: row.querySelector('input').value,
      flavor: parseInt(row.dataset.flavor) || 0,
      ai: row.dataset.ai === '1',
      skin: row.dataset.skin || 'bottle',
    }));
  }

  function renderFrom(defs) {
    playerCount = defs.length;
    playerInputs.innerHTML = defs.map((d, i) => rowHtml(i, d)).join('');
    addPlayerBtn.disabled = playerCount >= 8;
  }

  function addPlayerInput() {
    if (playerCount >= 8) return;
    const defs = readRows();
    const fl = defs.length % FLAVORS.length;
    defs.push({ name: FLAVORS[fl].name, flavor: fl, ai: false });
    renderFrom(defs);
  }

  // event delegation: flavor select, AI toggle, remove
  playerInputs.addEventListener('click', (e) => {
    const sw = e.target.closest('.flavor-swatch');
    if (sw) {
      const row = sw.closest('.player-input-row');
      const oldIdx = +row.dataset.flavor, newIdx = +sw.dataset.idx;
      const input = row.querySelector('input');
      // The name follows the flavor unless the player typed a custom one.
      if (!input.value.trim() || input.value.trim() === FLAVORS[oldIdx].name) {
        input.value = FLAVORS[newIdx].name;
      }
      row.dataset.flavor = newIdx;
      row.querySelectorAll('.flavor-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      row.querySelector('.player-num').style.color = FLAVORS[newIdx].color;
      input.placeholder = FLAVORS[newIdx].name;
      return;
    }
    const ai = e.target.closest('.ai-toggle');
    if (ai) {
      const row = ai.closest('.player-input-row');
      const on = row.dataset.ai === '1';
      row.dataset.ai = on ? '0' : '1';
      ai.textContent = on ? 'Human' : 'CPU';
      ai.classList.toggle('cpu', !on);
      return;
    }
    const sk = e.target.closest('.skin-choice');
    if (sk) {
      const row = sk.closest('.player-input-row');
      row.dataset.skin = sk.dataset.skin;
      row.querySelectorAll('.skin-choice').forEach(s => s.classList.remove('selected'));
      sk.classList.add('selected');
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
    return rows.map((r) => ({
      name: (r.name || '').trim() || FLAVORS[r.flavor].name,
      color: FLAVORS[r.flavor].color,
      isAI: r.ai,
      skin: FORCE_SKIN || r.skin || 'bottle',
    }));
  }
  function chosenDifficulty() {
    return document.querySelector('input[name="difficulty"]:checked')?.value || 'medium';
  }
  function chosenStartingLives() {
    const v = parseInt(document.querySelector('input[name="starting-lives"]:checked')?.value || '10', 10);
    return [3, 5, 10, 20, 100].includes(v) ? v : 10;
  }

  // ── Start game ─────────────────────────────────────────────────────────────
  // ── Immersive mode: fullscreen + keep the screen awake (panel ergonomics) ──
  // Best-effort + feature-detected; only works from a user gesture (the Start /
  // Practice / Play-Again taps) and silently no-ops where unsupported (e.g. the
  // bundled APK, which is already fullscreen + awake).
  let wakeLock = null;
  async function enterImmersive() {
    const el = document.documentElement;
    const reqFS = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    try { if (reqFS && !document.fullscreenElement) await reqFS.call(el); } catch (e) {}
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); }
    catch (e) { wakeLock = null; }
  }
  // Wake locks auto-release when the tab is hidden — re-acquire a held one on return.
  document.addEventListener('visibilitychange', async () => {
    try {
      if (document.visibilityState === 'visible' && wakeLock && wakeLock.released) {
        wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch (e) {}
  });

  startBtn.addEventListener('click', () => {
    const defs = rowsToDefs(readRows());
    if (defs.length < 2) { alert('Need at least 2 players!'); return; }
    const dir = parseInt(document.querySelector('input[name="direction"]:checked')?.value ?? '1');
    Sound.unlock();   // first user gesture — unlock audio
    enterImmersive();
    setupScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    gameOverEl.classList.add('hidden');
    startGame(defs, dir, {
      difficulty: chosenDifficulty(),
      startingLives: chosenStartingLives(),
      newMatch: true,
    });
  });

  // ── Practice (solo, no lives) ───────────────────────────────────────────────
  practiceBtn.addEventListener('click', () => {
    const r0 = readRows()[0] || { name: 'You', flavor: 0 };
    const def = { name: (r0.name || '').trim() || 'You', color: FLAVORS[r0.flavor].color, isAI: false,
                  skin: FORCE_SKIN || r0.skin || 'bottle' };
    Sound.unlock();
    enterImmersive();
    setupScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    gameOverEl.classList.add('hidden');
    startGame([def], 1, {
      practice: true,
      startingLives: chosenStartingLives(),
      newMatch: true,
    });
  });

  playAgainBtn.addEventListener('click', () => {
    enterImmersive();
    gameOverEl.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    if (game.practice) {
      startGame(
        [{ name: game.players[0].name, color: game.players[0].color, isAI: false,
           skin: FORCE_SKIN || game.players[0].skin || 'bottle' }],
        1,
        { practice: true, startingLives: game.startingLives }
      );
    } else {
      const defs = game.players.map(p => ({ name: p.name, color: p.color, isAI: p.isAI,
                                            skin: FORCE_SKIN || p.skin || 'bottle' }));
      // Winner starts the next game (by index — robust to duplicate names).
      startGame(defs, game.direction, {
        difficulty: game.difficulty,
        startingLives: game.startingLives,
        startIndex: game.winnerIndex,
      });
    }
  });

  // initial two rows — names default to the flavor (overridable)
  renderFrom([
    { name: FLAVORS[0].name, flavor: 0, ai: false },
    { name: FLAVORS[1].name, flavor: 1, ai: false },
  ]);

  // ── Game loop state ────────────────────────────────────────────────────────
  let lastTime    = 0;
  let loopId      = null;
  let evaluating  = false;
  let showGlow    = false;
  let resultTimer = 0;
  let resultAlpha = 0;
  let aiTimer     = null;
  let elimTimer   = null;
  let gameStarted = false;
  let intenseTurn = false;   // "make it or break it" — a miss this flip eliminates the player
  let matchWins   = [];      // wins per player across the current series (by index)
  let gameStats   = null;    // per-game stats (reset each game), shown on game-over
  let timerActive = false, turnTimeLeft = 0, turnTimeLimit = 0, timedOut = false;
  const RESULT_MS = 1500;
  const TURN_SECONDS = 10, FIRE_SECONDS = 4;   // flip clock (less when ON FIRE)

  // Per-turn flip clock — only for HUMAN turns (CPU flicks on its own ~1.1s).
  function startTurnTimer(seconds) {
    turnTimeLimit = turnTimeLeft = seconds;
    timerActive = true;
    turnTimerEl.classList.add('active');
    updateTimerBar();
  }
  function stopTurnTimer() {
    timerActive = false;
    turnTimerEl.classList.remove('active');
  }
  function updateTimerBar() {
    const frac = Math.max(0, turnTimeLeft / turnTimeLimit);
    turnTimerFillEl.style.width = (frac * 100) + '%';
    // green → amber → red as it drains
    turnTimerFillEl.style.background =
      frac > 0.5 ? 'var(--make)' : frac > 0.25 ? 'var(--heat)' : 'var(--miss)';
  }
  // Ran out of time → forfeit the flip as a miss (you had your window).
  function onTimeout() {
    stopTurnTimer();
    timedOut = true;
    Input.disable();
    flipHintEl.classList.add('hidden');
    evaluating = false;
    Sound.play('miss');
    game.resolveFlip('MISS');
  }

  function clearTimers() { clearTimeout(aiTimer); clearTimeout(elimTimer); }

  function landingMeta(landingInfo = null) {
    return {
      perfect: !!(landingInfo && landingInfo.perfect),
    };
  }

  // CPU takes its turn: aim near the sweet-spot flick, with error set by difficulty.
  function aiFlick() {
    if (game.state !== GAME_STATES.TURN_START && game.state !== GAME_STATES.ON_FIRE) return;
    const sigma = { easy: 1000, medium: 400, hard: 220 }[game.difficulty] || 400;
    const u1 = Math.random() || 1e-6, u2 = Math.random();
    const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const up = Math.max(500, 2100 + gauss * sigma);   // sweet spot ~2100 px/s
    const vx = (Math.random() - 0.5) * 420;           // slight lean
    onFlick(vx, -up);
  }

  function startGame(defs, dir, opts) {
    clearTimers();
    Sound.setSuddenDeath(false);
    passScreen.classList.add('hidden');
    Renderer.init(canvas);
    Renderer.setReduceMotion(reduceMotionActive());
    if (window.Skins) Skins.preload(defs.map(d => d.color));   // warm skin sprites
    resize();   // sets DPR transform + renderer logical dims (must run after init)
    Physics.init(window.innerWidth, window.innerHeight, stageBottomInset());  // logical coords

    game.on(GAME_STATES.TURN_START, onTurnStart);
    game.on(GAME_STATES.RESULT,     onResult);
    game.on(GAME_STATES.ON_FIRE,    onOnFire);
    game.on(GAME_STATES.ELIMINATED, onEliminated);
    game.on(GAME_STATES.GAME_OVER,  onGameOver);

    game.init(defs, dir, opts || {});
    gameStarted = true;
    gameStats = { topStake: 0, longestFire: 0, perPlayer: game.players.map(() => ({ makes: 0, flips: 0, bestStreak: 0 })) };
    if (opts && opts.newMatch) matchWins = defs.map(() => 0);   // fresh series

    if (loopId) cancelAnimationFrame(loopId);
    lastTime = performance.now();
    loop(lastTime);
  }

  // Playback speed: AI turns run fast, and once every human is out we blitz to
  // the end so the all-CPU finish + stats come up quickly. 1 = real-time.
  function gameSpeed() {
    if (game.practice) return 1;
    const humansLeft = game.players.some(p => !p.eliminated && !p.isAI);
    if (!humansLeft) return 25;            // all humans out → fast-forward to the end
    const cur = game.currentPlayer();
    if (cur && cur.isAI) return 4;         // an AI is shooting → speed it up
    return 1;
  }

  function syncSuddenDeathAudio() {
    const active = gameStarted &&
      !game.practice &&
      game.state !== GAME_STATES.GAME_OVER &&
      game.inSuddenDeath();
    Sound.setSuddenDeath(active, game.sdLevel());
  }

  function loop(now) {
    // Stop stepping/rendering once the game is over (the game-over screen is a
    // plain HTML overlay). startGame() restarts the loop for the next game.
    if (game.state === GAME_STATES.GAME_OVER) {
      Sound.setSuddenDeath(false);
      loopId = null;
      return;
    }
    loopId = requestAnimationFrame(loop);
    syncSuddenDeathAudio();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    // "Time stands still": slow the bottle's FLIGHT during a make-or-break flip.
    // Only while airborne — once it nears the table we resume normal speed so the
    // settle/landing detection (frame-based) is unaffected.
    const speed = gameSpeed();
    let stepDt = dt;
    // Make-or-break slow-mo only in real-time (human) turns — never while fast-forwarding.
    if (speed === 1 && intenseTurn && evaluating) {
      const b = Physics.getBottle();
      if (b && b.position.y < Physics.getGroundY() - 70) stepDt = dt * 0.4;
    }
    // Run `speed` physics sub-steps this frame (fast-forward AI / all-CPU turns).
    // Each sub-step uses a normal dt so the sim stays stable, and landing is polled
    // per sub-step so verdicts + settle/cap windows behave identically at any speed.
    for (let s = 0; s < speed; s++) {
      Physics.step(stepDt);
      if (evaluating) {
        const result = Physics.checkLanding();
        if (result) {
          evaluating = false;
          showGlow   = result === 'MAKE';
          const landingInfo = Physics.getLastLandingInfo();
          game.resolveFlip(result, landingMeta(landingInfo));
          break;
        }
      }
    }

    // Per-turn flip clock (human turns only) — runs out → forfeited miss
    if (timerActive && !evaluating &&
        (game.state === GAME_STATES.TURN_START || game.state === GAME_STATES.ON_FIRE)) {
      turnTimeLeft -= dt;
      updateTimerBar();
      if (turnTimeLeft <= 0) onTimeout();
    }

    // Result countdown + fade
    if (game.state === GAME_STATES.RESULT) {
      resultTimer -= dt * 1000 * speed;
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
      skin:        game.currentPlayer()?.skin,
      intense:     intenseTurn,
      suddenDeath: game.inSuddenDeath(),
      awaitingFlick: game.state === GAME_STATES.TURN_START || game.state === GAME_STATES.ON_FIRE,
      stake:       game.pointCount,
    });
  }

  // ── State callbacks ────────────────────────────────────────────────────────
  // Arm a human's turn: show the hint, fire the make-or-break sting (timed to
  // when the player is actually ready), enable input, start the flip clock.
  function armHumanTurn() {
    passScreen.classList.add('hidden');
    flipHintEl.classList.remove('hidden');
    if (intenseTurn) Sound.play('tension');
    Input.enable();
    startTurnTimer(TURN_SECONDS);
  }

  // Big flavor-colored "PASS TO {name}" handoff card (a deferred-input gate).
  function showPassGate(p) {
    passNameEl.textContent = p.name;
    passNameEl.style.color = p.color;
    passCardEl.style.borderColor = p.color;
    passScreen.classList.remove('hidden');
  }

  function onTurnStart() {
    evaluating  = false;
    showGlow    = false;
    resultAlpha = 0;
    intenseTurn = false;
    timedOut    = false;
    stopTurnTimer();
    clearTimeout(aiTimer);
    passScreen.classList.add('hidden');
    Physics.resetBottle();
    flipHintEl.classList.remove('hidden');

    const p = game.currentPlayer();
    streakBannerEl.textContent = '';
    streakBannerEl.className = 'streak-banner';

    if (game.practice) {
      turnBannerEl.textContent = '🎯 Practice';
      pointCountEl.textContent = '';
      Input.enable();
      updateHUD();
      return;
    }

    intenseTurn = game.missWouldEliminate();   // make-it-or-break-it
    pointCountEl.textContent = '';   // stake shown big on the canvas (drawStake)

    if (p.isAI) {
      turnBannerEl.textContent = `${p.name}'s turn · CPU`;
      if (intenseTurn) Sound.play('tension');
      Input.disable();
      flipHintEl.classList.add('hidden');
      aiTimer = setTimeout(aiFlick, 1100 / gameSpeed());
      updateHUD();
      return;
    }

    turnBannerEl.textContent = `${p.name}'s turn`;
    updateHUD();
    // "PASS TO {name}" handoff card — only with >2 players still alive (with 2
    // it's obvious whose turn it is). Defers input + flip clock + the tension
    // sting until the new player taps "Tap to flip".
    if (game.activePlayers().length > 2) {
      Input.disable();
      flipHintEl.classList.add('hidden');
      showPassGate(p);
    } else {
      armHumanTurn();
    }
  }

  function onOnFire() {
    evaluating  = false;
    showGlow    = false;
    timedOut    = false;
    stopTurnTimer();
    clearTimeout(aiTimer);
    passScreen.classList.add('hidden');
    Physics.resetBottle();
    flipHintEl.classList.remove('hidden');

    const p = game.currentPlayer();
    intenseTurn = game.missWouldEliminate();   // only in sudden death (ON FIRE miss is otherwise free)
    if (intenseTurn) Sound.play('tension');
    turnBannerEl.textContent  = `🔥 ${p.name} IS ON FIRE!`;
    streakBannerEl.textContent = `+${game.onFireBonus} lives earned`;
    streakBannerEl.className   = 'streak-banner on-fire';
    pointCountEl.textContent   = '';
    if (p.isAI) {
      Input.disable();
      flipHintEl.classList.add('hidden');
      aiTimer = setTimeout(aiFlick, 1000 / gameSpeed());
    } else {
      Input.enable();
      startTurnTimer(FIRE_SECONDS);   // tighter clock when ON FIRE
    }
    updateHUD();
  }

  function onResult() {
    Input.disable();
    stopTurnTimer();
    passScreen.classList.add('hidden');
    flipHintEl.classList.add('hidden');
    resultTimer = RESULT_MS;
    Records.recordFlip(game);

    const p = game.currentPlayer();

    if (!game.practice && gameStats) {
      const pp = gameStats.perPlayer[game.currentPlayerIndex];
      const st = p ? p.streak : 0;
      if (pp) {
        pp.flips++;
        if (game.lastResult === 'MAKE') pp.makes++;
        if (st > pp.bestStreak) pp.bestStreak = st;
      }
      if (game.pointCount > gameStats.topStake) gameStats.topStake = game.pointCount;
      if (game.onFireBonus > gameStats.longestFire) gameStats.longestFire = game.onFireBonus;
    }

    if (game.practice) {
      if (game.lastResult === 'MAKE') {
        streakBannerEl.textContent = game.practiceStreak > 1
          ? `${game.practiceStreak} in a row!`
          : (game.perfectLanding ? 'Perfect make!' : 'Make!');
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
      if (game.fireCapped) {
        // Big-lobby ON FIRE cap — banked the gains, pass it on
        streakBannerEl.textContent = '🔥 Fire maxed — pass it on!';
        streakBannerEl.className   = 'streak-banner on-fire';
        Sound.play('life');
      } else if (game.onFireGain > 0) {
        // ON FIRE bonus make — gained a life
        streakBannerEl.textContent = `🔥 +1 life!  (+${game.onFireBonus} total)`;
        streakBannerEl.className   = 'streak-banner on-fire';
        Sound.play('life');
      } else if (game.justIgnited) {
        streakBannerEl.textContent = '🔥 ON FIRE!';
        streakBannerEl.className   = 'streak-banner on-fire';
        Sound.play('ignite');
      } else if (p.isOnFire) {
        // On fire but at the match life cap — no life granted, so don't claim one
        streakBannerEl.textContent = '🔥 Maxed out!';
        streakBannerEl.className   = 'streak-banner on-fire';
        Sound.play('make');
      } else if (p.isHeatingUp) {
        streakBannerEl.textContent = '🌡 Heating up!';
        streakBannerEl.className   = 'streak-banner heating-up';
        Sound.play('make');
      } else {
        streakBannerEl.textContent = game.perfectLanding ? 'Perfect landing!' : '';
        streakBannerEl.className   = game.perfectLanding ? 'streak-banner heating-up' : 'streak-banner';
        Sound.play('make');
      }
    } else if (game.fireEnded) {
      // ON FIRE ended on a miss — no penalty
      streakBannerEl.textContent = timedOut ? '⏱ Out of time — streak over' : '🔥 Streak over — no penalty';
      streakBannerEl.className   = 'streak-banner on-fire';
      Sound.play('miss');
    } else {
      const n = game.lastPenalty;
      const lives = `${n} ${n === 1 ? 'life' : 'lives'}`;
      streakBannerEl.textContent = timedOut ? `⏱ Out of time!  −${lives}` : `−${lives}`;
      streakBannerEl.className   = 'streak-banner miss-penalty';
      Sound.play('miss');
    }

    updateHUD();
  }

  function onEliminated() {
    passScreen.classList.add('hidden');
    const p = game.currentPlayer();
    turnBannerEl.textContent = `❌ ${p.name} is out!`;
    updateHUD();
    clearTimeout(elimTimer);
    elimTimer = setTimeout(() => game.advanceTurn(), 1800 / gameSpeed());
  }

  // Lightweight toast (self-creating so it needs no markup). Used for unlocks.
  function showToast(msg) {
    let t = document.getElementById('skin-toast');
    if (!t) { t = document.createElement('div'); t.id = 'skin-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.remove('show'), 4000);
  }

  function onGameOver() {
    clearTimers();   // no stray advanceTurn/AI flick fires after the game ends
    Sound.setSuddenDeath(false);
    stopTurnTimer();
    passScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    gameOverEl.classList.remove('hidden');
    const active = game.activePlayers();
    winnerNameEl.textContent = active.length ? active[0].name : '???';
    Records.recordWin(active.length ? active[0].name : null);
    if (recordsPanel) recordsPanel.innerHTML = Records.renderHtml();
    // First win unlocks the Parrot edition on this device; the per-player skin
    // picker then appears in setup. Re-render setup rows so it shows next time.
    if (active.length && window.Skins && Records.unlockSkin('parrot')) {
      showToast('🦜 Parrots unlocked! Pick them per player in setup.');
      try { renderFrom(readRows()); } catch (_) {}
    }
    Sound.play('win');
    Input.disable();

    // Series scoreboard: tally this game's win, then show the running totals.
    if (matchWins.length !== game.players.length) matchWins = game.players.map(() => 0);
    if (game.winnerIndex >= 0 && game.winnerIndex < matchWins.length) matchWins[game.winnerIndex]++;
    renderScoreboard();
    if (gameStatsEl) gameStatsEl.innerHTML = renderGameStats();
  }

  // Per-game stats on the game-over screen (this match, not all-time): each
  // player's make %, plus the game's peak stake and longest ON FIRE run.
  function renderGameStats() {
    if (!gameStats) return '';
    const rows = game.players.map((p, i) => {
      const pp = (gameStats.perPlayer && gameStats.perPlayer[i]) || { makes: 0, flips: 0, bestStreak: 0 };
      const pct = pp.flips ? Math.round(pp.makes / pp.flips * 100) : 0;
      return `<div class="gs-row">
        <span class="score-dot" style="background:${p.color}"></span>
        <span class="gs-name">${escapeHtml(p.name)}</span>
        <span class="gs-pct">${pct}%</span>
        <span class="gs-sub">${pp.makes}/${pp.flips} · 🔥${pp.bestStreak}</span>
      </div>`;
    }).join('');
    const cells = [
      ['⚡', 'Top stake',    '×' + gameStats.topStake],
      ['🔥', 'Longest fire', '+' + gameStats.longestFire],
    ];
    const grid = cells.map(([i, k, v]) =>
      `<div class="rec-item"><span class="rec-val">${v}</span><span class="rec-key">${i} ${k}</span></div>`).join('');
    return `<div class="gs-title">This game</div><div class="gs-players">${rows}</div>` +
           `<div class="records-grid gs-grid2">${grid}</div>`;
  }

  function renderScoreboard() {
    const total = matchWins.reduce((a, c) => a + c, 0);
    if (total < 1) { scoreboardEl.innerHTML = ''; return; }
    const max = Math.max(...matchWins);
    const rows = game.players
      .map((p, i) => ({ p, w: matchWins[i] || 0 }))
      .sort((a, b) => b.w - a.w)
      .map(({ p, w }) => `
        <div class="score-row${w === max && w > 0 ? ' leader' : ''}">
          <span class="score-dot" style="background:${p.color}"></span>
          <span class="score-name">${escapeHtml(p.name)}</span>
          <span class="score-wins">${w}</span>
        </div>`).join('');
    scoreboardEl.innerHTML = `<div class="sb-title">Series — ${total} ${total === 1 ? 'game' : 'games'}</div>${rows}`;
  }

  // ── Flick ──────────────────────────────────────────────────────────────────
  function onFlick(vx, vy) {
    // B1: bail if a flip is already in flight (the `evaluating` flag is the
    // authoritative signal) so a second pointer event can't fire a 2nd flick.
    if (evaluating) return;
    if (game.state !== GAME_STATES.TURN_START &&
        game.state !== GAME_STATES.ON_FIRE) return;

    // Lock input + mark in-flight BEFORE launching, closing the re-arm window.
    evaluating = true;
    stopTurnTimer();
    Input.disable();
    flipHintEl.classList.add('hidden');
    Sound.unlock();
    Sound.play('flick');
    Physics.applyFlick(vx, vy);
    game.setState(GAME_STATES.EVALUATING);
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
      if (game.maxLives >= 100) cls += ' marathon-lives';

      return `<div class="${cls}">
        <span class="p-name">${escapeHtml(p.name)}</span>
        <span class="p-lives-num">${p.lives}</span>
        <span class="p-lives-label">lives</span>
      </div>`;
    }).join('');
  }

  // ── Settings / records wiring ───────────────────────────────────────────────
  function reduceMotionActive() {
    return Settings.reduceMotion ||
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || false;
  }
  function syncMuteBtn() {
    if (!muteBtn) return;
    muteBtn.textContent = Settings.sound ? '🔊' : '🔇';
    muteBtn.setAttribute('aria-label', Settings.sound ? 'Mute' : 'Unmute');
  }
  if (muteBtn) muteBtn.addEventListener('click', () => {
    const on = !Settings.sound;
    Settings.setSound(on);
    Sound.setMuted(!on);
    if (on) Sound.unlock();
    syncMuteBtn();
  });
  if (passGoBtn) passGoBtn.addEventListener('click', () => {
    passScreen.classList.add('hidden');
    Sound.unlock();
    armHumanTurn();
  });

  // Exit to the main menu (setup): stop the loop + timers, show setup fresh.
  function backToMenu() {
    if (loopId) cancelAnimationFrame(loopId);
    loopId = null;
    clearTimers();
    Sound.setSuddenDeath(false);
    stopTurnTimer();
    Input.disable();
    gameStarted = false;
    game.state = GAME_STATES.SETUP;
    gameScreen.classList.add('hidden');
    gameOverEl.classList.add('hidden');
    passScreen.classList.add('hidden');
    if (recordsPanel) recordsPanel.innerHTML = Records.renderHtml();
    setupScreen.classList.remove('hidden');
  }
  if (menuBtn) menuBtn.addEventListener('click', () => {
    if (confirm('Return to the main menu? The current game will end.')) backToMenu();
  });
  if (homeBtn) homeBtn.addEventListener('click', backToMenu);
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMq = () => Renderer.setReduceMotion(reduceMotionActive());
    if (mq.addEventListener) mq.addEventListener('change', onMq);
    else if (mq.addListener) mq.addListener(onMq);
  }

  Input.attach(canvas, onFlick);

  // Apply persisted prefs + render the hall-of-fame
  Sound.setMuted(!Settings.sound);
  Renderer.setReduceMotion(reduceMotionActive());
  syncMuteBtn();
  if (recordsPanel) recordsPanel.innerHTML = Records.renderHtml();

  // Show setup on load
  setupScreen.classList.remove('hidden');
  gameScreen.classList.add('hidden');
  gameOverEl.classList.add('hidden');
})();
