// main.js — game loop, wires everything together (loaded last)

(function () {
  // settings.js owns the one preference object for the whole classic-script
  // runtime. Keep a local alias to that exact browser global, never a copy.
  const Settings = window.Settings;
  if (!Settings) throw new Error('Settings must load before main.js');
  const canvas       = document.getElementById('game-canvas');
  const setupScreen  = document.getElementById('setup-screen');
  const gameScreen   = document.getElementById('game-screen');
  const gameOverEl   = document.getElementById('game-over');
  const winnerNameEl = document.getElementById('winner-name');
  const scoreboardEl = document.getElementById('scoreboard');
  const playAgainBtn = document.getElementById('play-again-btn');
  const playerListEl = document.getElementById('player-list');
  let rosterDrawerOpen = false;
  const pointCountEl = document.getElementById('point-count');
  const turnBannerEl = document.getElementById('turn-banner');
  const streakBannerEl = document.getElementById('streak-banner');
  const modeBadgeEl   = document.getElementById('mode-badge');
  const flipHintEl   = document.getElementById('flip-hint');
  const practiceMeterEl = document.getElementById('practice-meter');
  const startBtn     = document.getElementById('start-btn');
  const practiceBtn  = document.getElementById('practice-btn');
  const addPlayerBtn = document.getElementById('add-player-btn');
  const playerInputs = document.getElementById('player-inputs');
  const charPickScreen = document.getElementById('char-picker-screen');
  const charPickGrid   = document.getElementById('charpick-grid');
  const charPickTitle  = document.getElementById('charpick-title');
  const charPickClose  = document.getElementById('charpick-close');
  const mysteryScreen   = document.getElementById('mystery-screen');
  const mysteryHeadlineEl = document.getElementById('mystery-headline');
  const mysteryArtEl    = document.getElementById('mystery-art');
  const mysteryNameEl   = document.getElementById('mystery-name');
  const mysteryFamilyEl = document.getElementById('mystery-family');
  const mysteryGoBtn    = document.getElementById('mystery-go-btn');
  const mysteryQueueEl  = document.getElementById('mystery-queue');
  const muteBtn      = document.getElementById('mute-btn');
  const recordsPanel = document.getElementById('records-panel');
  const passScreen   = document.getElementById('pass-screen');
  const passCardEl   = document.getElementById('pass-card');
  const passNameEl   = document.getElementById('pass-name');
  const passGoBtn    = document.getElementById('pass-go-btn');
  const gameStatsEl  = document.getElementById('game-stats');
  const menuBtn      = document.getElementById('menu-btn');
  const homeBtn      = document.getElementById('home-btn');
  const statsBtn     = document.getElementById('stats-btn');
  const statsScreen  = document.getElementById('stats-screen');
  const achievementsBtn = document.getElementById('achievements-btn');
  const achievementsScreen = document.getElementById('achievements-screen');
  const appStatusEl  = document.getElementById('app-status');
  const appErrorEl   = document.getElementById('app-error');
  const eventStatusEl = document.getElementById('event-status');
  const labScreen = document.getElementById('lab-screen');
  const labReadoutEl = document.getElementById('lab-readout');

  // v111 feature modules attach through this passive bridge. Every call is
  // optional and isolated so the legacy controller remains the authority when
  // no v111 implementation is registered.
  const v111Runtime = (typeof window !== 'undefined' && window.FlipgameV111) || null;
  const v111Platform = (typeof window !== 'undefined' && window.FlipgameV111Platform) || null;
  function v111Bridge(method, payload, fallback) {
    try {
      const fn = v111Runtime && v111Runtime.bridge && v111Runtime.bridge[method];
      return typeof fn === 'function' ? fn(payload) : fallback;
    } catch (_) { return fallback; }
  }

  // One private v1.12 application owns session, physics observation, and
  // progression writes. Legacy Records/Achievements stay display-only for
  // those matches so rewards cannot be scored twice.
  const v112App = window.FlipgameV112 || null;
  const v112PhysicsDriver = (v112App && window.FlipgameV112PhysicsDriver && window.Physics)
    ? FlipgameV112PhysicsDriver.create(Physics) : null;
  if (v112App && v112PhysicsDriver) FlipgameV112.attachPhysics(v112PhysicsDriver);
  // Assigned once the Battle lane host is composed below. Until then the Battle
  // route has no host and refuses to start a heat.
  let battleHost = null;
  let journeyHost = null;
  let v112OwnsMatch = false;
  function privateRewardAuthorityActive() { return v112OwnsMatch === true; }
  function abandonPrivateSession() {
    if (v112App) {
      try {
        const session = v112App.snapshot && v112App.snapshot().session;
        if (session && session.status === 'active') v112App.abandonSession();
      } catch (_) {}
    }
    v112OwnsMatch = false;
  }
  function startPrivateSession(defs, opts) {
    v112OwnsMatch = false;
    if (!v112App || typeof v112App.beginSession !== 'function') return false;
    const options = opts || {};
    if (options.lab || options.forced || options.testData) return false;
    // Story already reserved the match. A second beginSession would double-book
    // the coordinator. Tour is Test Data and never opens a reward session.
    if (options.reservedSession) {
      v112OwnsMatch = options.tour !== true;
      return v112OwnsMatch;
    }
    const activityId = options.practice ? 'practice' : 'free-play';
    const formatId = options.format === 'team' || options.format === 'team-clash' ? 'team-clash'
      : options.format === 'cup' ? 'cup' : 'classic';
    const physicsModeId = options.insanity || options.physicsModeId === 'insane' ? 'insane'
      : options.physicsModeId === 'alien' ? 'alien' : 'normal';
    const roster = (defs || []).map((definition) => ({
      name: definition.name, human: !definition.isAI,
      objectId: definition.skin || BASE_SKIN, variantId: definition.variantId,
      cosmeticId: definition.cosmeticId, teamId: definition.teamId || null,
    }));
    try {
      const current = v112App.snapshot && v112App.snapshot().session;
      if (current && current.status === 'active') v112App.abandonSession();
      FlipgameV112.beginSession({
        activityId, formatId, physicsModeId, roster,
        startingLives: options.startingLives, cupLength: options.cupLength,
        arenaId: options.visualArenaId || options.arenaId || visualArenaId || 'baseline-table',
        suddenDeathEnabled: true,
      });
      v112OwnsMatch = true;
      return true;
    } catch (error) {
      console.warn('Private v1.12 session not started', error);
      return false;
    }
  }
  function announce(message, assertive = false) {
    const target = assertive ? appErrorEl : appStatusEl;
    if (!target) return;
    target.textContent = '';
    requestAnimationFrame(() => { target.textContent = String(message || ''); });
  }

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
  // Editions may bring their own physics (see Skins.physicsFor / skins.js META).
  // Applied per turn, so one player can be flipping a bottle while the next
  // takes a bank shot with the alien. Must run BEFORE Physics.resetBottle —
  // setProfile may resize the world (alien expand), and the bottle has to
  // spawn at the new center.
  function applyTurnPhysics() {
    if (!Physics.setProfile) return;
    const skin = (game && game.currentPlayer && game.currentPlayer()?.skin) || BASE_SKIN;
    Physics.setProfile(window.Skins && Skins.physicsFor ? Skins.physicsFor(skin) : null);
  }

  function scheduleReflow() {
    clearTimeout(reflowTimer);
    reflowTimer = setTimeout(() => {
      // A live Battle holds the table instead of a classic match, and its lane
      // rectangles are client pixels, so the runtime has to be told the glass
      // moved as well or it keeps aiming flicks at the old lane.
      if (battleLane.live()) {
        battleLane.reflow();
        if (battleHost) battleHost.resize();
        return;
      }
      if (!gameStarted) return;
      Physics.reflow(window.innerWidth, window.innerHeight, stageBottomInset());
      // B2: only re-place the bottle when one is genuinely at rest — never mid-flick
      // (a stray resize must not reset a bottle in flight and void it as a MISS).
      if (!evaluating &&
          (game.state === GAME_STATES.TURN_START || game.state === GAME_STATES.ON_FIRE)) {
        applyTurnPhysics();
        Physics.resetBottle();
        prepareTurnArena();
      }
    }, 150);
  }
  window.addEventListener('resize', resize);

  // ── Flavors (liquid color = whose turn it is) ───────────────────────────────
  // Pun-forward names, each riffing on its color. Ordered so the first 8
  // (max players) are maximally distinct colors. NB: skins.js name rosters and
  // FLAVOR_ORDER are index-aligned to this list — keep the colors in place.
  const FLAVORS = [
    { name: 'Blue Steel',       color: '#1f9bff' },
    { name: 'Sucker Punch',     color: '#e3263c' },
    { name: 'Lime Light',       color: '#8ed11a' },
    { name: 'Orange Crush',     color: '#ff7a00' },
    { name: 'Grape Expectations', color: '#8a3ffc' },
    { name: 'Ice Ice Baby',     color: '#5fcfe6' },
    { name: 'Apple-solutely',   color: '#3fae1a' },
    { name: 'Berry Nice',       color: '#ff5b86' },
    { name: 'Making Waves',     color: '#4f63e0' },
    { name: 'Lemon Aid',        color: '#ffc233' },
    { name: 'Very Cherry',      color: '#c8203a' },
    { name: 'Pink Fluff',       color: '#ff9ecf' },
  ];

  // ── Player setup rows (skin family + color + Human/CPU) ────────────────────
  // Character chips are one per skin family (Bottle, People, Aliens…).
  // Color freely recolors that skin / swaps cast variants, and updates the
  // default name to match.
  let playerCount = 2;

  const FORCE_SKIN = (typeof window !== 'undefined' && window.FLIP_FORCE_SKIN) || null;
  const BRAND = (typeof window !== 'undefined' && window.FLIP_BRAND) || {};
  const BASE_SKIN = BRAND.baseSkin || 'bottle';
  // Local previews must not masquerade as the published build.
  if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
    const versionBadge = document.getElementById('version-badge');
    if (versionBadge) {
      versionBadge.textContent = 'v1.15 · DEV';
      versionBadge.setAttribute('aria-label', 'Flipgame v1.15 development preview, not released');
    }
  }
  function characterList() {
    return window.Skins && Skins.list ? Skins.list() : [{ id: BASE_SKIN, name: 'Bottle', emoji: '🍾', color: '#1f9bff', tint: '#1f9bff' }];
  }
  function characterById(id) {
    if (window.Skins && Skins.character) return Skins.character(id);
    return characterList().find((c) => c.id === id) || null;
  }
  function isCharUnlocked(id) {
    const c = characterById(id);
    if (!c) return false;
    // Whoever pays the rewards decides what is unlocked, and when the private
    // v1.12 composition is here that is the whole answer. Consulting an older
    // ladder as well takes the intersection of the two: it would offer nothing
    // that authority refuses -- which is the point -- but it would also withhold
    // Flippers that authority has already granted, so earned rewards never
    // reach the picker.
    if (v112App && typeof v112App.isObjectAvailable === 'function') {
      return v112App.isObjectAvailable(id) === true;
    }
    if (window.FlipgameV111Content && window.FlipgameV111Progression) {
      const view = FlipgameV111Content.viewObject(FlipgameV111Progression.snapshot(), id);
      if (view) return !view.locked;
    }
    return c.id === BASE_SKIN || c.unlock == null || Records.isSkinUnlocked(c.id);
  }
  function isFeatureUnlocked(id) {
    if (window.FlipgameV111Content && window.FlipgameV111Progression &&
        typeof FlipgameV111Content.viewFeature === 'function') {
      const view = FlipgameV111Content.viewFeature(FlipgameV111Progression.snapshot(), id);
      return !!view && !view.locked;
    }
    return isCharUnlocked('alien');
  }
  function isInsaneUnlocked() {
    return isCharUnlocked('alien') && isFeatureUnlocked('insane-mode');
  }
  function isPhysicsLabUnlocked() {
    return isCharUnlocked('alien') && isFeatureUnlocked('insane-mode') && isFeatureUnlocked('physics-lab');
  }
  function syncInsaneModeUnlock() {
    const radio = document.getElementById('insane-mode-radio');
    const option = document.getElementById('insane-mode-option');
    const label = document.getElementById('insane-mode-label');
    const note = document.getElementById('insane-mode-note');
    if (!radio) return;
    const unlocked = isInsaneUnlocked();
    const labUnlocked = isPhysicsLabUnlocked();
    radio.disabled = !unlocked;
    if (option) {
      option.classList.toggle('mode-locked', !unlocked);
      option.classList.toggle('locked-tile', !unlocked);
      option.setAttribute('aria-label', unlocked ? 'INSANE MODE' : 'Locked');
    }
    if (label) label.textContent = unlocked ? 'INSANE MODE' : '🔒';
    if (note) {
      note.textContent = unlocked ? 'Special events can happen on any flip.' : '';
      note.classList.toggle('hidden', !unlocked);
    }
    if (!unlocked && radio.checked) {
      const normal = document.querySelector('input[name="game-mode"][value="normal"]');
      if (normal) normal.checked = true;
    }
    const labButton = document.getElementById('physics-lab-btn');
    if (labButton) {
      labButton.classList.toggle('locked-tile', !labUnlocked);
      labButton.classList.toggle('lock-action', !labUnlocked);
      labButton.setAttribute('aria-label', labUnlocked ? 'Physics Lab' : 'Locked');
      labButton.innerHTML = labUnlocked ? 'Physics Lab' : '<span aria-hidden="true">🔒</span>';
    }
  }
  function availableCharacters() {
    return characterList().filter((c) => isCharUnlocked(c.id));
  }
  function familyKey(id) {
    if (window.Skins && Skins.familyKey) return Skins.familyKey(id);
    const c = characterById(id);
    return (c && c.drawAs) || id;
  }
  // One chip per unlocked skin family (first unlocked member as representative).
  function availableFamilies() {
    const seen = new Set();
    const out = [];
    for (const c of availableCharacters()) {
      const k = familyKey(c.id);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(c);
    }
    return out;
  }
  function resolveCharForColor(charId, color) {
    if (window.Skins && Skins.resolveForColor) return Skins.resolveForColor(charId, color);
    return charId;
  }
  function defaultCharId() {
    if (FORCE_SKIN && characterById(FORCE_SKIN)) return FORCE_SKIN;
    const avail = availableFamilies();
    return (avail[0] && avail[0].id) || BASE_SKIN;
  }
  function defaultColorFor(charId) {
    const c = characterById(charId);
    return (c && (c.color || c.tint)) || FLAVORS[0].color;
  }
  function normalizeColor(hex) {
    const h = String(hex || '').toLowerCase();
    const hit = FLAVORS.find((f) => f.color === h);
    return hit ? hit.color : defaultColorFor(defaultCharId());
  }
  // Default player name for a skin + color — always a unique pun per flavor.
  function defaultNameFor(charId, color) {
    const col = color != null ? normalizeColor(color) : defaultColorFor(charId);
    const id = resolveCharForColor(charId, col);
    const names = window.FLIP_V112_VARIANT_NAMES;
    if (names && typeof names.nameFor === 'function') {
      const authored = names.nameFor(id, col) || names.nameFor(familyKey(id), col);
      if (authored) return authored;
    }
    if (window.Skins && Skins.nameFor) return Skins.nameFor(charId, col);
    const f = FLAVORS.find((x) => x.color === col);
    const c = characterById(id);
    return (c && c.name) || (f && f.name) || 'Player';
  }
  function familyLabel(charId) {
    if (window.Skins && Skins.familyLabel) return Skins.familyLabel(charId);
    const c = characterById(charId);
    return (c && c.name) || 'Character';
  }
  function drawTintFor(charId, color) {
    if (window.Skins && Skins.drawColor) return Skins.drawColor(charId, color);
    return color || defaultColorFor(charId);
  }
  function testEventForName(name) {
    const events = window.FlipgameV111PhysicsEvents;
    return events && typeof events.forcedEventId === 'function'
      ? events.forcedEventId(name) : null;
  }
  function persistedPlayerName(value) {
    const name = String(value == null ? '' : value);
    const policy = window.FlipgameV111NamePolicy;
    const checked = policy && typeof policy.validate === 'function'
      ? policy.validate(name, { source: 'setup-persistence' }) : null;
    // NamePolicy owns normalization, the profanity screen, the ordinary
    // grapheme limit, and the exact long QA-name allowlist. Invalid text is
    // replaced before the debounced setup write and is never echoed to storage.
    return checked && checked.valid ? String(checked.value) : '';
  }
  function isFamilyUnlocked(id) {
    const k = familyKey(id);
    if (k === familyKey(BASE_SKIN)) return true;
    return availableCharacters().some((c) => familyKey(c.id) === k);
  }

  // One entry per skin family: { key, rep, members, owned, total, cast, unlocked }.
  // Since a mystery box grants ONE random character, a family is partially
  // collected for most of the game — `owned/total` is what the tile reports.
  //
  // `cast` families (people, pets, ocean…) have a distinct character per color,
  // so an uncollected color is genuinely unavailable. Single-object families
  // (bottle, trex, parrot…) are ONE character recolored, so owning it grants all
  // 12 colors — Skins.isCastFamily is what distinguishes them.
  function familyCatalog() {
    const byFam = new Map();
    for (const c of characterList()) {
      const k = familyKey(c.id);
      let e = byFam.get(k);
      if (!e) {
        e = { key: k, rep: c, members: [], owned: 0, total: 0,
              cast: !!(window.Skins && Skins.isCastFamily && Skins.isCastFamily(c.id)) };
        byFam.set(k, e);
      }
      e.members.push(c);
      e.total++;
      if (isCharUnlocked(c.id)) {
        e.owned++;
        // First collected member represents the family on its tile.
        if (e.owned === 1) e.rep = c;
      }
    }
    // Ladder order: unlocks are earned in a fixed sequence, so the picker lists
    // them in that order (free bottle first, alien last) — never alphabetically.
    const ladder = (e) =>
      e.members.reduce((m, c) => Math.min(m, c.unlock == null ? -1 : c.unlock), Infinity);
    return [...byFam.values()].map((e) => ({ ...e, unlocked: e.owned > 0 }))
      .sort((a, b) => ladder(a) - ladder(b));
  }

  // Is this exact color playable for the row's family? Cast families need that
  // specific variant collected; single-object skins recolor freely.
  function isColorAvailable(charId, color) {
    const fam = familyCatalog().find((e) => e.key === familyKey(charId));
    if (!fam || !fam.cast) return true;
    return isCharUnlocked(resolveCharForColor(fam.rep.id, color));
  }
  // The color to fall back to when the requested one isn't collected yet.
  function firstOwnedColor(charId) {
    const fam = familyCatalog().find((e) => e.key === familyKey(charId));
    if (!fam) return defaultColorFor(charId);
    const hit = fam.members.find((m) => isCharUnlocked(m.id));
    return normalizeColor((hit && (hit.tint || hit.color)) || defaultColorFor(charId));
  }
  function undiscoveredTileHtml() {
    return '<button type="button" class="picker-tile locked-tile undiscovered-tile" role="gridcell" ' +
      'data-locked="1" aria-disabled="true" aria-label="Locked" tabindex="-1"><span aria-hidden="true">🔒</span></button>';
  }

  // The picker grid: one tile per family, art drawn in the player's CURRENT
  // color so the choice previews exactly what they'll flip.
  function familyTilesHtml(curCharId, curColor) {
    const curFam = familyKey(curCharId);
    const catalog = familyCatalog();
    const unlocked = catalog.filter((entry) => entry.unlocked)
      .sort((a, b) => familyLabel(a.rep.id).localeCompare(familyLabel(b.rep.id)));
    const tiles = unlocked.map((e) => {
      const label = familyLabel(e.rep.id);
      const art = (id) => `<canvas class="fam-art" width="200" height="280" ` +
        `data-preview-char="${id}" aria-hidden="true"></canvas>`;
      const forColor = resolveCharForColor(e.rep.id, curColor);
      const artId = (e.unlocked && !isCharUnlocked(forColor)) ? e.rep.id : forColor;
      const sel = e.key === curFam;
      return `<button type="button" class="picker-tile" role="gridcell" data-char="${e.rep.id}" ` +
        `aria-pressed="${sel}" tabindex="${sel ? '0' : '-1'}" aria-label="${escapeHtml(label)}${sel ? ', selected' : ''}">` +
        art(artId) + `<span class="fam-name">${escapeHtml(label)}</span></button>`;
    });
    if (unlocked.length < catalog.length) tiles.push(undiscoveredTileHtml());
    return tiles.join('');
  }

  // For a cast family each color IS a separate character, so a colour the player
  // hasn't drawn from a mystery box yet is genuinely unavailable and renders
  // locked. Single-object skins recolor freely, so all 12 stay open.
  function colorSwatchesHtml(selColor, charId) {
    const sel = normalizeColor(selColor);
    const id = charId || defaultCharId();
    const values = FLAVORS.map((f) => {
      const nm = defaultNameFor(id, f.color);
      const open = isColorAvailable(id, f.color);
      if (!open) return null;
      return `<button type="button" role="gridcell" class="picker-tile variant-tile" data-color="${f.color}" ` +
        `aria-pressed="${f.color === sel}" tabindex="${f.color === sel ? '0' : '-1'}" aria-label="${escapeHtml(nm)}">` +
        `<canvas class="fam-art" width="200" height="280" data-preview-char="${escapeHtml(resolveCharForColor(id, f.color))}" data-preview-color="${f.color}" aria-hidden="true"></canvas>` +
        `<span class="variant-caption"><span class="variant-swatch" style="background:${f.color}" aria-hidden="true"></span><span>${escapeHtml(nm)}</span></span></button>`;
    });
    const tiles = values.filter(Boolean);
    if (tiles.length < values.length) tiles.push(undiscoveredTileHtml());
    return tiles.join('');
  }

  function rowHtml(i, def) {
    const col = normalizeColor(def.color || defaultColorFor(def.charId || defaultCharId()));
    const charId = resolveCharForColor(def.charId || defaultCharId(), col);
    const name = def.name != null ? def.name : defaultNameFor(charId, col);
    const stableId = def.id || `seat-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 7)}`;
    return `<div class="player-input-row" data-player-id="${escapeHtml(stableId)}" data-char="${charId}" data-color="${col}" data-ai="${def.ai ? 1 : 0}" data-cosmetic="${escapeHtml(def.cosmeticId || '')}">
      <div class="prow-top">
        <canvas class="skin-preview" width="160" height="224" aria-hidden="true"></canvas>
        <div class="prow-main">
          <div class="prow-line">
            <span class="player-num" style="color:${col}">P${i + 1}</span>
            <label class="player-name-label" for="player-name-${escapeHtml(stableId)}">Player name</label>
            <input id="player-name-${escapeHtml(stableId)}" type="text" aria-label="Player name" aria-describedby="player-help-${escapeHtml(stableId)} player-error-${escapeHtml(stableId)}" value="${escapeHtml(name)}">
            <span id="player-help-${escapeHtml(stableId)}" class="name-helper">14 max</span>
          </div>
          <div class="prow-line">
            ${FORCE_SKIN ? '' : `<button type="button" class="char-change-btn" aria-label="Customize P${i + 1}, ${escapeHtml(familyLabel(charId))}"><span class="charbtn-label">${escapeHtml(familyLabel(charId))}</span><span aria-hidden="true">›</span></button>`}
            <button type="button" class="ai-toggle${def.ai ? ' cpu' : ''}" aria-label="P${i + 1} player type, ${def.ai ? 'CPU' : 'Human'}">${def.ai ? 'CPU' : 'Human'}</button>
            ${i >= 2 ? `<button type="button" class="remove-player-btn" aria-label="Remove P${i + 1}">✕</button>` : ''}
          </div>
        </div>
      </div>
      <span id="player-error-${escapeHtml(stableId)}" class="field-error"></span>
    </div>`;
  }

  function readRows() {
    return [...playerInputs.querySelectorAll('.player-input-row')].map(row => {
      const color = normalizeColor(row.dataset.color || defaultColorFor(row.dataset.char));
      const charId = resolveCharForColor(row.dataset.char || defaultCharId(), color);
      return {
        id: row.dataset.playerId,
        name: row.querySelector('input').value,
        charId,
        color,
        ai: row.dataset.ai === '1',
        cosmeticId: row.dataset.cosmetic || null,
      };
    });
  }

  function paintRowPreview(row) {
    const cv = row && row.querySelector('.skin-preview');
    if (!cv || typeof Renderer === 'undefined' || !Renderer.drawPreview) return;
    clearPreviewCanvas(cv);
    const color = normalizeColor(row.dataset.color || defaultColorFor(row.dataset.char));
    const charId = resolveCharForColor(row.dataset.char || defaultCharId(), color);
    const drawAs = (window.Skins && Skins.drawAs) ? Skins.drawAs(charId) : charId;
    Renderer.drawPreview(cv, drawAs === 'bottle' ? 'bottle' : charId, drawTintFor(charId, color));
  }
  function paintAllPreviews() {
    playerInputs.querySelectorAll('.player-input-row').forEach(paintRowPreview);
  }

  // Repaint everything on a row that's derived from data-char / data-color.
  function syncRowChrome(row) {
    if (!row) return;
    const charId = row.dataset.char || defaultCharId();
    const col = normalizeColor(row.dataset.color || defaultColorFor(charId));
    row.querySelectorAll('.flavor-swatch').forEach((s) => {
      s.classList.toggle('selected', s.dataset.color === col);
      // Both of these are per-family, so they must be recomputed on every sync:
      // the pun roster (stale titles used to show the OLD family's names), and
      // which colors are collected (a cast family locks the ones you don't own).
      const open = isColorAvailable(charId, s.dataset.color);
      s.classList.toggle('locked', !open);
      if (open) s.removeAttribute('aria-disabled'); else s.setAttribute('aria-disabled', 'true');
      const nm = defaultNameFor(charId, s.dataset.color);
      s.title = open ? nm : 'Locked';
      s.setAttribute('aria-label', open ? nm : 'Locked');
    });
    const num = row.querySelector('.player-num');
    if (num) num.style.color = col;
    const lbl = row.querySelector('.charbtn-label');
    if (lbl) lbl.textContent = familyLabel(charId);
    const fl = row.querySelector('.flavor-name');
    if (fl) fl.textContent = defaultNameFor(charId, col);
    paintRowPreview(row);
  }

  // Single source of truth for "this row now wants character X at color Y".
  // Pass null for either to keep the row's current family / color. A name the
  // player typed survives; one still sitting at the old default pun is updated.
  function applyRowChar(row, familyRepOrCharId, color) {
    if (!row) return;
    const oldId = row.dataset.char || defaultCharId();
    const oldCol = normalizeColor(row.dataset.color || defaultColorFor(oldId));
    const wantId = familyRepOrCharId || oldId;
    let col = normalizeColor(color != null ? color : oldCol);
    // Switching to a cast family whose variant for this color isn't collected yet
    // would seat the player on a locked character — snap to one they do own.
    if (!isColorAvailable(wantId, col)) col = firstOwnedColor(wantId);
    const newId = resolveCharForColor(wantId, col);
    const input = row.querySelector('input');
    const oldDefault = defaultNameFor(oldId, oldCol);
    const nextDefault = defaultNameFor(newId, col);
    if (input && (!input.value.trim() || input.value.trim() === oldDefault)) {
      input.value = nextDefault;
    }
    // State stays in data-* so readRows()/rowsToDefs keep working untouched.
    row.dataset.char = newId;
    row.dataset.color = col;
    if (input) input.placeholder = nextDefault;
    syncRowChrome(row);
  }

  // Paging changes visibility only: every seat remains in readRows/saveSetup.
  const rosterPages = { setup: 0, ready: 0 };
  function showRosterPage(kind, page) {
    const container = kind === 'setup' ? playerInputs : document.getElementById('broadcast-ready-lineup');
    const rows = [...container.children];
    const pages = Math.max(1, Math.ceil(rows.length / 8));
    rosterPages[kind] = Math.max(0, Math.min(pages - 1, page));
    rows.forEach((row, index) => { row.hidden = Math.floor(index / 8) !== rosterPages[kind]; });
    document.getElementById(`${kind}-roster-pages`).classList.toggle('hidden', pages === 1);
    document.getElementById(`${kind}-roster-page`).textContent = `Entries ${rosterPages[kind] * 8 + 1}–${Math.min(rows.length, (rosterPages[kind] + 1) * 8)} of ${rows.length}`;
    document.getElementById(`${kind}-roster-prev`).disabled = rosterPages[kind] === 0;
    document.getElementById(`${kind}-roster-next`).disabled = rosterPages[kind] === pages - 1;
  }
  for (const kind of ['setup', 'ready']) {
    for (const [direction, change] of [['prev', -1], ['next', 1]]) {
      document.getElementById(`${kind}-roster-${direction}`).addEventListener('click', () => {
        showRosterPage(kind, rosterPages[kind] + change);
      });
    }
  }

  function renderFrom(defs) {
    // Re-rendering replaces the rows wholesale; an open picker would be left
    // holding a detached node whose mutations go nowhere.
    if (pickerRow) closeCharPicker();
    playerCount = defs.length;
    playerInputs.innerHTML = defs.map((d, i) => rowHtml(i, d)).join('');
    showRosterPage('setup', rosterPages.setup);
    const rosterMax = (window.FlipgameV111Interfaces && window.FlipgameV111Interfaces.PLAYER_LIMITS
      ? window.FlipgameV111Interfaces.PLAYER_LIMITS.rosterMax : 16);
    addPlayerBtn.disabled = playerCount >= rosterMax;
    addPlayerBtn.tabIndex = playerCount >= rosterMax ? -1 : 0;
    const countLabel = document.getElementById('player-count-label');
    const limitNote = document.getElementById('player-limit-note');
    if (countLabel) countLabel.textContent = `${playerCount} players`;
    if (limitNote) limitNote.textContent = playerCount >= rosterMax ? rosterMax + ' player maximum' : 'Up to ' + rosterMax + ' players';
    syncCpuDifficulty();
    syncFormatControls();
    paintAllPreviews();
  }

  // Defaults for a fresh seat: rotate through the collected families, and keep
  // the family's own tint unless another seat already took it. On a first-run
  // device every seat is a Bottle, so without this both players start as an
  // identical blue "Blue Steel" and there's nothing to tell them apart.
  function seatDefaults(i, takenColors) {
    const avail = availableFamilies();
    const pick = avail[i % Math.max(1, avail.length)] || avail[0];
    const famId = (pick && pick.id) || defaultCharId();
    const taken = new Set(takenColors || []);
    const options = [defaultColorFor(famId), ...FLAVORS.map((f) => f.color)]
      .filter((c) => isColorAvailable(famId, c));
    const color = options.find((c) => !taken.has(c)) || options[0] || firstOwnedColor(famId);
    const charId = resolveCharForColor(famId, color);
    return { name: defaultNameFor(charId, color), charId, color, ai: false };
  }

  function addPlayerInput() {
    const rosterMax = (window.FlipgameV111Interfaces && window.FlipgameV111Interfaces.PLAYER_LIMITS
      ? window.FlipgameV111Interfaces.PLAYER_LIMITS.rosterMax : 16);
    if (playerCount >= rosterMax) return;
    const defs = readRows();
    defs.push(seatDefaults(defs.length, defs.map((d) => d.color)));
    renderFrom(defs);
    showRosterPage('setup', Math.floor((defs.length - 1) / 8));
    if (typeof saveSetup === 'function') saveSetup();
    const row = playerInputs.lastElementChild;
    if (row) row.querySelector('input[type="text"]')?.focus();
  }

  // event delegation: open picker, color, AI toggle, remove
  playerInputs.addEventListener('click', (e) => {
    const chg = e.target.closest('.char-change-btn');
    if (chg) {
      openCharPicker(chg.closest('.player-input-row'), chg);
      return;
    }
    const sw = e.target.closest('.flavor-swatch');
    if (sw) {
      const row = sw.closest('.player-input-row');
      if (sw.classList.contains('locked')) {
        announce('Locked');
        return;
      }
      // Keep the family, switch the color — resolveCharForColor swaps a cast to
      // that color's variant and leaves a single-object skin to recolor in place.
      applyRowChar(row, null, sw.dataset.color);
      if (typeof saveSetup === 'function') saveSetup();
      return;
    }
    const ai = e.target.closest('.ai-toggle');
    if (ai) {
      const row = ai.closest('.player-input-row');
      const on = row.dataset.ai === '1';
      row.dataset.ai = on ? '0' : '1';
      ai.textContent = on ? 'Human' : 'CPU';
      ai.classList.toggle('cpu', !on);
      ai.setAttribute('aria-label', `${row.querySelector('.player-num')?.textContent || 'Player'} player type, ${on ? 'Human' : 'CPU'}`);
      syncCpuDifficulty();
      if (typeof saveSetup === 'function') saveSetup();
      return;
    }
    const rm = e.target.closest('.remove-player-btn');
    if (rm && playerCount > 2) {
      const removedIndex = [...playerInputs.children].indexOf(rm.closest('.player-input-row'));
      const defs = readRows();
      defs.splice(removedIndex, 1);
      renderFrom(defs);
      showRosterPage('setup', Math.floor(Math.max(0, removedIndex - 1) / 8));
      if (typeof saveSetup === 'function') saveSetup();
      const previous = playerInputs.children[Math.max(0, removedIndex - 1)];
      (previous?.querySelector('.remove-player-btn') || addPlayerBtn).focus();
    }
  });
  // Debounced name typing → persist the lobby.
  let nameSaveTimer = null;
  playerInputs.addEventListener('input', (e) => {
    if (!e.target || e.target.tagName !== 'INPUT') return;
    if (e.target.matches('input[type="text"]')) {
      e.target.setAttribute('aria-invalid', 'false');
      const error = e.target.closest('.player-input-row')?.querySelector('.field-error');
      if (error) error.textContent = '';
      if (appErrorEl) appErrorEl.textContent = '';
    }
    clearTimeout(nameSaveTimer);
    nameSaveTimer = setTimeout(() => {
      if (typeof saveSetup === 'function') saveSetup();
    }, 400);
  });

  addPlayerBtn.addEventListener('click', addPlayerInput);

  // ── Full-screen Customize draft ─────────────────────────────────────────────
  let pickerRow = null;
  let pickerOpener = null;
  let pickerIndex = 0;
  let pickerTab = 'object';
  let pickerDraftRows = [];
  let arenaDraft = null;
  let visualArenaId = null;

  function currentDraft() { return pickerDraftRows[pickerIndex] || null; }
  function cosmeticTilesHtml(type) {
    const selected = type === 'arena' ? arenaDraft : currentDraft()?.cosmeticId;
    const noneSelected = !selected;
    const none = `<button type="button" role="gridcell" class="picker-tile" data-${type}="" ` +
      `aria-pressed="${noneSelected}" tabindex="${noneSelected ? '0' : '-1'}"><span aria-hidden="true">∅</span><span>None</span></button>`;
    if (type === 'arena' && v112App && typeof v112App.arenas === 'function') {
      const arenas = v112App.arenas();
      const visible = arenas.filter((row) => !row.locked);
      const tiles = visible.map((row) =>
        `<button type="button" role="gridcell" class="picker-tile" data-arena="${escapeHtml(row.id)}" aria-pressed="${selected === row.id}" tabindex="${selected === row.id ? '0' : '-1'}"><span aria-hidden="true">🏟️</span><span>${escapeHtml(row.displayName)}</span></button>`);
      if (arenas.some((row) => row.locked)) tiles.push(undiscoveredTileHtml());
      return none + tiles.join('');
    }
    if (type !== 'arena' && v112App && typeof v112App.store === 'function') {
      const items = v112App.store().filter((item) => !item.locked && (type === 'cosmetic' || !item.slot || item.slot === type || item.kind === type));
      const visible = items.filter((item) => item.owned);
      const tiles = visible.map((item) =>
        `<button type="button" role="gridcell" class="picker-tile" data-cosmetic="${escapeHtml(item.id)}" aria-pressed="${selected === item.id}" tabindex="${selected === item.id ? '0' : '-1'}"><span aria-hidden="true">✦</span><span>${escapeHtml(item.displayName)}</span></button>`);
      if (items.some((item) => !item.owned)) tiles.push(undiscoveredTileHtml());
      return none + tiles.join('');
    }
    const state = window.FlipgameV111Progression ? FlipgameV111Progression.snapshot() : {};
    const views = window.FlipgameV111Cosmetics ? FlipgameV111Cosmetics.listForPlayer(state) : [];
    const internal = window.FlipgameV111Cosmetics?.internalCatalog?.() || [];
    const wantedScope = type === 'arena' ? 'global' : 'personal';
    const scoped = views.map((view, index) => ({ view, scope: internal[index]?.scope }))
      .filter((entry) => entry.scope === wantedScope);
    const visible = scoped.map((entry) => entry.view).filter((view) => !view.locked);
    const tiles = visible.map((view) =>
      `<button type="button" role="gridcell" class="picker-tile" data-${type}="${escapeHtml(view.id)}" aria-pressed="${selected === view.id}" tabindex="${selected === view.id ? '0' : '-1'}"><span aria-hidden="true">✦</span><span>${escapeHtml(view.displayName)}</span></button>`);
    if (scoped.some((entry) => entry.view.locked)) tiles.push(undiscoveredTileHtml());
    return none + tiles.join('');
  }

  function renderCustomizeGrid(focusGrid = false) {
    const draft = currentDraft();
    if (!draft) return;
    charPickTitle.textContent = `Choose Your Flipper · P${pickerIndex + 1}`;
    const previewName = document.getElementById('customize-preview-name');
    const previewFamily = document.getElementById('customize-preview-family');
    if (previewName) previewName.textContent = defaultNameFor(draft.charId, draft.color);
    if (previewFamily) previewFamily.textContent = familyLabel(draft.charId);
    document.getElementById('customize-seat').textContent = `P${pickerIndex + 1}`;
    document.getElementById('customize-prev').disabled = pickerIndex === 0;
    document.getElementById('customize-next').disabled = pickerIndex === pickerDraftRows.length - 1;
    document.getElementById('arena-scope-note').classList.toggle('hidden', pickerTab !== 'arena');
    if (pickerTab === 'object') charPickGrid.innerHTML = familyTilesHtml(draft.charId, draft.color);
    else if (pickerTab === 'variant') charPickGrid.innerHTML = colorSwatchesHtml(draft.color, draft.charId);
    else charPickGrid.innerHTML = cosmeticTilesHtml(pickerTab);
    const active = charPickGrid.querySelector('[aria-pressed="true"]') || charPickGrid.querySelector('button:not([aria-disabled="true"])') || charPickGrid.querySelector('button');
    charPickGrid.querySelectorAll('button').forEach((tile) => { tile.tabIndex = tile === active ? 0 : -1; });
    paintPickerPreviews();
    if (focusGrid && active) active.focus();
  }

  function openCharPicker(row, opener) {
    if (!row || !charPickScreen) return;
    pickerRow = row;
    pickerOpener = opener || null;
    pickerIndex = [...playerInputs.children].indexOf(row);
    pickerDraftRows = readRows().map((entry) => ({ ...entry }));
    pickerTab = 'object';
    arenaDraft = visualArenaId;
    if (window.Skins && Skins.preload) Skins.preload([{ id: currentDraft().charId, color: currentDraft().color }]);
    charPickScreen.classList.remove('hidden');
    if ('inert' in HTMLElement.prototype) setupScreen.inert = true;
    document.querySelectorAll('[data-customize-tab]').forEach((tab) => {
      const selected = tab.dataset.customizeTab === pickerTab;
      tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    });
    renderCustomizeGrid();
    charPickTitle.focus();
  }

  function closeCharPicker(apply = false) {
    if (!pickerRow) return;
    if (apply) {
      [...playerInputs.children].forEach((row, index) => {
        const draft = pickerDraftRows[index];
        if (!draft) return;
        applyRowChar(row, draft.charId, draft.color);
        row.dataset.cosmetic = draft.cosmeticId || '';
      });
      visualArenaId = arenaDraft || null;
      saveSetup();
      const d = pickerDraftRows[pickerIndex];
      if (d) announce(`${familyLabel(d.charId)}, ${defaultNameFor(d.charId, d.color)}, ${d.cosmeticId || 'no cosmetic'} selected.`);
    }
    pickerRow = null;
    pickerDraftRows = [];
    charPickScreen.classList.add('hidden');
    charPickGrid.innerHTML = '';
    if ('inert' in HTMLElement.prototype) setupScreen.inert = false;
    if (pickerOpener && pickerOpener.isConnected) pickerOpener.focus();
    pickerOpener = null;
  }

  function clearPreviewCanvas(canvas) {
    if (!canvas) return;
    const context = canvas.getContext('2d');
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
  }
  function paintPickerPreviews() {
    if (!pickerRow || typeof Renderer === 'undefined' || !Renderer.drawPreview) return;
    const draft = currentDraft();
    const col = normalizeColor(draft?.color || defaultColorFor(draft?.charId));
    charPickGrid.querySelectorAll('canvas[data-preview-char]').forEach((cv) => {
      if (cv.closest('[data-locked="1"]')) {
        clearPreviewCanvas(cv);
        return;
      }
      const id = cv.dataset.previewChar;
      const previewColor = cv.dataset.previewColor || col;
      const drawAs = (window.Skins && Skins.drawAs) ? Skins.drawAs(id) : id;
      clearPreviewCanvas(cv);
      Renderer.drawPreview(cv, drawAs === 'bottle' ? 'bottle' : id, drawTintFor(id, previewColor));
    });
    const hero = document.getElementById('customize-preview');
    if (hero && draft) {
      const id = resolveCharForColor(draft.charId, col);
      const drawAs = (window.Skins && Skins.drawAs) ? Skins.drawAs(id) : id;
      clearPreviewCanvas(hero);
      Renderer.drawPreview(hero, drawAs === 'bottle' ? 'bottle' : id, drawTintFor(id, col));
    }
  }

  if (charPickGrid) charPickGrid.addEventListener('click', (e) => {
    const tile = e.target.closest('.picker-tile');
    if (!tile || !pickerRow) return;
    if (tile.dataset.locked === '1') {
      announce('Locked');
      return;
    }
    const draft = currentDraft();
    if (tile.dataset.char) draft.charId = tile.dataset.char;
    if (tile.dataset.color) { draft.color = tile.dataset.color; draft.variantId = flavorIdForColor(tile.dataset.color); }
    if (Object.prototype.hasOwnProperty.call(tile.dataset, 'cosmetic')) draft.cosmeticId = tile.dataset.cosmetic || null;
    if (Object.prototype.hasOwnProperty.call(tile.dataset, 'arena')) arenaDraft = tile.dataset.arena || null;
    renderCustomizeGrid(true);
  });
  if (charPickClose) charPickClose.addEventListener('click', () => closeCharPicker(false));
  document.getElementById('customize-cancel')?.addEventListener('click', () => closeCharPicker(false));
  document.getElementById('customize-apply')?.addEventListener('click', () => closeCharPicker(true));
  document.getElementById('customize-prev')?.addEventListener('click', () => { if (pickerIndex > 0) { pickerIndex--; renderCustomizeGrid(); } });
  document.getElementById('customize-next')?.addEventListener('click', () => { if (pickerIndex + 1 < pickerDraftRows.length) { pickerIndex++; renderCustomizeGrid(); } });
  document.querySelectorAll('[data-customize-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      pickerTab = tab.dataset.customizeTab;
      document.querySelectorAll('[data-customize-tab]').forEach((item) => {
        const selected = item === tab; item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1;
      });
      document.getElementById('customize-panel').setAttribute('aria-labelledby', tab.id);
      renderCustomizeGrid();
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    if (pickerRow) { e.preventDefault(); closeCharPicker(false); return; }
    // The characters are already granted and saved by the time a box is shown,
    // so escaping out of the queue only skips the animation — nothing is lost.
    if (mysteryCurrent) { e.preventDefault(); dismissMystery(); }
  });

  // ── Mystery box reveal ──────────────────────────────────────────────────────
  // A won box hatches one random flippable. Reveals are queued so winning two
  // rewards in one sitting shows two boxes back to back rather than racing.
  const mysteryQueue = [];
  let mysteryCurrent = null;   // char id being revealed (null = idle)
  let mysteryOpened = false;   // has the current box been popped?

  function queueMysteryReveals(ids) {
    if (!ids || !ids.length || !mysteryScreen) return;
    mysteryQueue.push(...ids.map((value) => (value && typeof value === 'object'
      ? value : { id: value, contentId: value, type: 'object' })));
    if (!mysteryCurrent) nextMysteryReveal();
  }
  function queueAuthorityReveals(reveals) {
    const items = (reveals || []).filter((entry) => entry &&
      (entry.type === 'object' || entry.type === 'store' || entry.type === 'cosmetic'
        || entry.type === 'arena' || entry.type === 'feature'));
    if (items.length) queueMysteryReveals(items);
  }
  function mysteryContentId(entry) {
    if (!entry) return null;
    if (typeof entry === 'string') return entry;
    return entry.contentId || entry.id;
  }

  function nextMysteryReveal() {
    if (!mysteryQueue.length) {
      mysteryCurrent = null;
      mysteryScreen.classList.add('hidden');
      mysteryScreen.classList.remove('opening');
      return;
    }
    mysteryCurrent = mysteryQueue.shift();
    mysteryOpened = false;
    const revealId = mysteryContentId(mysteryCurrent);
    // A queued reveal must start with an empty canvas, including after a
    // late sprite decode from the previous prize.
    if (mysteryArtEl) {
      const context = mysteryArtEl.getContext('2d');
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, mysteryArtEl.width, mysteryArtEl.height);
      context.restore();
    }
    // Warm the sprite for this character's own tint before it's on screen.
    const c = characterById(revealId);
    const tint = (c && (c.tint || c.color)) || defaultColorFor(revealId);
    if (window.Skins && Skins.preload && c) Skins.preload([{ id: revealId, color: tint }]);

    mysteryScreen.classList.remove('opening');
    mysteryHeadlineEl.textContent = 'New unlock!';
    mysteryNameEl.textContent = '';
    mysteryFamilyEl.textContent = '';
    mysteryGoBtn.textContent = 'Tap to reveal';
    mysteryQueueEl.textContent = mysteryQueue.length
      ? `${mysteryQueue.length} more unlock${mysteryQueue.length === 1 ? '' : 's'} waiting`
      : '';
    mysteryScreen.classList.remove('hidden');
    mysteryGoBtn.focus();
  }

  function paintMysteryArt() {
    if (!mysteryCurrent || !mysteryOpened || !mysteryArtEl || typeof Renderer === 'undefined' || !Renderer.drawPreview) return;
    const revealId = mysteryContentId(mysteryCurrent);
    const c = characterById(revealId);
    if (!c) return;
    const tint = (c && (c.tint || c.color)) || defaultColorFor(revealId);
    const drawAs = (window.Skins && Skins.drawAs) ? Skins.drawAs(revealId) : revealId;
    Renderer.drawPreview(mysteryArtEl, drawAs === 'bottle' ? 'bottle' : revealId,
                         drawTintFor(revealId, tint));
  }

  function openMysteryBox() {
    if (!mysteryCurrent) return;
    mysteryOpened = true;
    paintMysteryArt();
    mysteryScreen.classList.add('opening');
    const revealId = mysteryContentId(mysteryCurrent);
    const character = characterById(revealId);
    const label = (mysteryCurrent && mysteryCurrent.displayName) || (character
      ? defaultNameFor(revealId, null) : String(revealId));
    mysteryHeadlineEl.textContent = character ? 'A new Flipper joins the roster'
      : 'Something new is yours';
    mysteryNameEl.textContent = label;
    mysteryFamilyEl.textContent = character ? 'Added to Customize' : 'Added to your collection';
    if (v112App && typeof v112App.dismissReveal === 'function' && mysteryCurrent && mysteryCurrent.id) {
      try { v112App.dismissReveal(mysteryCurrent.id); } catch (_) {}
    }
    mysteryGoBtn.textContent = mysteryQueue.length ? 'Next ▶' : 'Nice!';
    Sound.play('win');
  }

  // Abandon the whole queue (menu exit / Escape). Safe: openBoxes already saved.
  function dismissMystery() {
    mysteryQueue.length = 0;
    nextMysteryReveal();
  }

  if (mysteryGoBtn) mysteryGoBtn.addEventListener('click', () => {
    Sound.unlock();
    if (!mysteryOpened) openMysteryBox();
    else nextMysteryReveal();
  });
  let seenRevealIds = new Set();
  if (v112App && typeof v112App.subscribe === 'function') {
    v112App.subscribe((state) => {
      const pending = (state && state.pendingReveals) || [];
      const fresh = pending.filter((entry) => entry && !seenRevealIds.has(entry.id));
      fresh.forEach((entry) => seenRevealIds.add(entry.id));
      if (!fresh.length) return;
      queueAuthorityReveals(fresh);
      try { renderFrom(readRows()); } catch (_) {}
      if (pickerRow) renderCustomizeGrid();
    });
  }

  function rosterToLiveDefs(roster) {
    return (roster || []).map((entry, index) => {
      const skin = entry.flipperId || entry.objectId || entry.skin || BASE_SKIN;
      const flavor = FLAVORS[index % FLAVORS.length];
      return {
        id: entry.id || ('seat-' + (index + 1)),
        name: entry.displayName || entry.name || ('Player ' + (index + 1)),
        color: flavor.color,
        isAI: entry.human === false || entry.kind === 'cpu' || entry.isAI === true,
        skin,
        variantId: entry.variantId || flavorIdForColor(flavor.color),
        cosmeticId: entry.cosmeticId || null,
        teamId: entry.teamId || entry.allianceId || null,
      };
    });
  }
  function rowsToDefs(rows) {
    return rows.map((r) => {
      const color = normalizeColor(r.color || defaultColorFor(r.charId || defaultCharId()));
      const charId = FORCE_SKIN || resolveCharForColor(r.charId || defaultCharId(), color);
      return {
        id: r.id,
        name: (r.name || '').trim() || defaultNameFor(charId, color),
        color,
        isAI: r.ai,
        skin: charId, // character id — Skins.draw/physicsFor resolve it
        variantId: r.variantId || flavorIdForColor(color),
        cosmeticId: r.cosmeticId || null,
      };
    });
  }
  function flavorIdForColor(color) {
    const hit = FLAVORS.find((f) => f.color.toLowerCase() === String(color || '').toLowerCase());
    return hit ? hit.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : 'blue-steel';
  }
  function validateNameInput(input) {
    if (!input) return true;
    const result = v111Runtime && v111Runtime.namePolicy
      ? v111Runtime.namePolicy.validate(input.value, { source: 'ui' })
      : { valid: String(input.value || '').trim().length > 0, value: String(input.value || '').trim() };
    const valid = result.valid !== undefined ? !!result.valid : !!result.ok;
    input.setAttribute('aria-invalid', valid ? 'false' : 'true');
    const row = input.closest('.player-input-row');
    const error = row && row.querySelector('.field-error');
    if (error) error.textContent = valid ? '' : 'Please choose another name';
    if (valid && result.value != null) input.value = String(result.value);
    return valid;
  }
  function setupNameInputs() { return [...playerInputs.querySelectorAll('input[type="text"]')]; }
  // Marks every field but announces nothing and takes no focus, so a screen that
  // is not on the glass can ask whether the roster is usable without speaking
  // over the screen the player is actually looking at.
  function firstInvalidSetupName(inputs) {
    return inputs.filter((input) => !validateNameInput(input))[0] || null;
  }
  function validateSetupNames() {
    const inputs = setupNameInputs();
    const invalid = firstInvalidSetupName(inputs);
    if (!invalid) return true;
    announce('Please choose another name', true);
    showRosterPage('setup', Math.floor(inputs.indexOf(invalid) / 8));
    invalid.focus();
    return false;
  }
  playerInputs.addEventListener('focusout', (event) => {
    if (event.target && event.target.matches('input[type="text"]')) validateNameInput(event.target);
  });
  function chosenDifficulty() {
    return document.querySelector('input[name="difficulty"]:checked')?.value || 'medium';
  }
  function chosenFeel() {
    return Settings.feel;
  }
  function chosenStartingLives() {
    const v = parseInt(document.querySelector('input[name="starting-lives"]:checked')?.value || '10', 10);
    return [3, 5, 10, 20, 100].includes(v) ? v : 10;
  }
  function chosenGameMode() {
    return isInsaneUnlocked() &&
      document.querySelector('input[name="game-mode"]:checked')?.value === 'insanity'
      ? 'insanity' : 'normal';
  }
  function chosenFormat() {
    return document.querySelector('input[name="match-format"]:checked')?.value || 'classic';
  }
  function chosenCupLength() {
    return document.querySelector('input[name="cup-length"]:checked')?.value === 'full' ? 'full' : 'short';
  }
  function chosenArenaProfile() {
    return document.getElementById('arena-profile')?.value || null;
  }
  function syncCpuDifficulty() {
    const group = document.getElementById('difficulty-group');
    if (group) group.classList.toggle('hidden', ![...playerInputs.children].some((row) => row.dataset.ai === '1'));
  }
  function syncFormatControls() {
    const format = chosenFormat();
    const teamAllowed = playerCount >= 2 && playerCount <= 16 && playerCount % 2 === 0;
    const teamLabel = document.getElementById('team-format-option');
    if (teamLabel) teamLabel.setAttribute('aria-disabled', teamAllowed ? 'false' : 'true');
    if (!teamAllowed && format === 'team-clash') {
      document.querySelector('input[name="match-format"][value="classic"]').checked = true;
      announce('Team Clash needs an even roster from 2 to 16 players.');
    }
    const active = !teamAllowed && format === 'team-clash' ? 'classic' : format;
    document.getElementById('classic-lives')?.classList.toggle('hidden', active !== 'classic');
    document.getElementById('cup-options')?.classList.toggle('hidden', active !== 'cup');
    const summaries = {
      classic: 'Classic elimination. Last player standing wins.',
      cup: chosenCupLength() === 'full' ? 'Best of three. 10 lives; sudden death after 5 rotations.' : 'Best of three. 3 lives; sudden death after 3 rotations.',
      'team-clash': 'Three flips per team. First to 11.',
    };
    const summary = document.getElementById('format-summary');
    if (summary) summary.textContent = summaries[active];
    if (startBtn) startBtn.textContent = active === 'cup' ? 'Start Cup' : active === 'team-clash' ? 'Start Team Clash' : 'Start Classic';
  }
  document.querySelectorAll('input[name="match-format"], input[name="cup-length"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      if (event.target.value === 'team-clash' &&
          !(playerCount >= 2 && playerCount <= 16 && playerCount % 2 === 0)) {
        event.target.checked = false;
        document.querySelector('input[name="match-format"][value="classic"]').checked = true;
        announce('Team Clash needs an even roster from 2 to 16 players.');
      }
      syncFormatControls(); saveSetup();
    });
  });
  const reduceMotionToggle = document.getElementById('reduce-motion-toggle');
  if (reduceMotionToggle) reduceMotionToggle.addEventListener('change', () => {
    Settings.setReduceMotion(reduceMotionToggle.checked);
    applyReducedMotion();
    saveSetup();
  });
  let labLastSuccessful = null;
  let activeLabTrajectory = [];
  let labTrajectoryStartedAt = 0;
  let activeLaunchInput = null;
  let activeLaunchRoster = null;
  let activeLaunchProfile = null;
  function labShotQuality(record) {
    if (!record || record.result !== 'MAKE') return 0;
    const tilt = Number(record.tilt);
    const settle = Number(record.settleMs);
    return 100000 + (record.perfect ? 10000 : 0) + (record.cap ? 5000 : 0) +
      (Number.isFinite(tilt) ? Math.max(0, 2000 - Math.abs(tilt) * 2000) : 0) +
      (Number.isFinite(settle) ? Math.max(0, 1000 - settle / 10) : 0);
  }
  function captureLabTrajectoryPoint(force = false) {
    if (!currentMatchOptions.lab || (!evaluating && !force)) return;
    const body = Physics.getBottle && Physics.getBottle();
    const x = Number(body?.position?.x);
    const y = Number(body?.position?.y);
    const angle = Number(body?.angle) || 0;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const previous = activeLabTrajectory[activeLabTrajectory.length - 1];
    const moved = !previous || Math.hypot(x - previous.x, y - previous.y) >= 4 || Math.abs(angle - previous.angle) >= 0.04;
    if (!force && !moved) return;
    activeLabTrajectory.push({ x, y, angle, t: Math.max(0, performance.now() - labTrajectoryStartedAt) });
    if (activeLabTrajectory.length > 480) activeLabTrajectory.splice(1, 1);
  }
  function populateLabControls() {
    const object = document.getElementById('lab-object');
    const variant = document.getElementById('lab-variant');
    const event = document.getElementById('lab-event');
    if (!object || !variant || !event) return;
    const previousObject = object.value;
    object.replaceChildren(...availableCharacters().map((character) => {
      const option = document.createElement('option'); option.value = character.id; option.textContent = character.name; return option;
    }));
    if ([...object.options].some((option) => option.value === previousObject)) object.value = previousObject;
    variant.replaceChildren(...FLAVORS.map((flavor) => {
      const option = document.createElement('option'); option.value = flavor.color; option.textContent = flavor.name; return option;
    }));
    const none = document.createElement('option'); none.value = ''; none.textContent = 'None';
    const definitions = window.FlipgameV111PhysicsEvents?.list?.() || [];
    event.replaceChildren(none, ...definitions.map((definition) => {
      const option = document.createElement('option'); option.value = definition.id; option.textContent = definition.displayName; return option;
    }));
    const replay = document.getElementById('lab-replay-btn');
    if (replay) replay.disabled = !labLastSuccessful;
  }
  function openPhysicsLab(opener) {
    if (!isPhysicsLabUnlocked()) { announce('Locked'); return; }
    populateLabControls();
    enterRoute(labScreen, opener || document.getElementById('physics-lab-btn'));
  }
  document.getElementById('physics-lab-btn')?.addEventListener('click', (event) => openPhysicsLab(event.currentTarget));
  document.getElementById('lab-back-btn')?.addEventListener('click', () => leaveRoute(labScreen));

  function selectedLabConfig(replaying = false) {
    const rawSeed = document.getElementById('lab-seed')?.value.trim();
    const seedNumber = rawSeed === '' ? null : Number(rawSeed);
    if (seedNumber != null && (!Number.isSafeInteger(seedNumber) || seedNumber < 0 || seedNumber > 0xffffffff)) {
      announce('Seed must be a whole number from 0 to 4294967295.', true);
      document.getElementById('lab-seed')?.focus();
      return null;
    }
    const preset = document.getElementById('lab-viewport')?.value || 'actual';
    const size = /^\d+x\d+$/.test(preset) ? preset.split('x').map(Number) : null;
    return {
      objectId: document.getElementById('lab-object')?.value || defaultCharId(),
      color: document.getElementById('lab-variant')?.value || FLAVORS[0].color,
      eventId: document.getElementById('lab-event')?.value || null,
      seed: seedNumber == null ? null : seedNumber >>> 0,
      viewportPreset: size ? { width: size[0], height: size[1], bucket: preset } : null,
      slowMotion: !!document.getElementById('lab-slow-motion')?.checked,
      showGhost: !!document.getElementById('lab-ghost')?.checked,
      replaying,
    };
  }
  function startPhysicsLab(replaying = false) {
    const config = selectedLabConfig(replaying);
    if (!config) return;
    const replayShot = replaying ? labLastSuccessful : null;
    if (replayShot) {
      config.objectId = replayShot.objectId;
      config.color = replayShot.color;
      config.eventId = replayShot.forcedEventId || null;
      config.seed = replayShot.seed;
      config.viewportPreset = replayShot.viewportPreset;
      config.slowMotion = replayShot.slowMotion;
    }
    const row = readRows()[0] || {};
    const skin = resolveCharForColor(config.objectId, config.color);
    const definition = {
      id: row.id || 'lab-player', name: safeStatsName(row.name || 'Player'), color: config.color,
      isAI: false, skin, variantId: replayShot?.variantId || flavorIdForColor(config.color),
      cosmeticId: replayShot?.cosmeticId || row.cosmeticId || null,
    };
    Sound.unlock(); enterImmersive();
    labScreen.classList.add('hidden'); setupScreen.classList.add('hidden'); gameScreen.classList.remove('hidden'); gameOverEl.classList.add('hidden');
    const advancedLabUsed = !!(config.eventId || config.seed != null || config.viewportPreset ||
      config.slowMotion || config.replaying || config.objectId !== (row.charId || defaultCharId()) ||
      normalizeColor(config.color) !== normalizeColor(row.color || defaultColorFor(row.charId || defaultCharId())) ||
      (config.showGhost && labLastSuccessful));
    startGame([definition], 1, {
      practice: true, lab: true, testData: true, forced: !!config.eventId,
      labEventId: config.eventId, labSeed: config.seed, viewportPreset: config.viewportPreset,
      slowMotion: config.slowMotion, showSuccessfulGhost: config.showGhost, replaying: config.replaying,
      labReplayShot: replayShot, advancedLabUsed,
      feel: replayShot?.feel || chosenFeel(), startingLives: chosenStartingLives(), insanity: false,
      arenaProfileId: replayShot?.arenaProfileId || chosenArenaProfile(),
      visualArenaId: replayShot?.visualArenaId || visualArenaId, newMatch: true,
    });
    if (labReadoutEl) { labReadoutEl.classList.remove('hidden'); labReadoutEl.textContent = 'Lab shot ready.'; }
    if (replayShot) requestAnimationFrame(() => launchFlick(replayShot.vx, replayShot.vy, replayShot.seed));
  }
  document.getElementById('lab-start-btn')?.addEventListener('click', () => startPhysicsLab(false));
  document.getElementById('lab-replay-btn')?.addEventListener('click', () => {
    if (!labLastSuccessful) return;
    document.getElementById('lab-seed').value = String(labLastSuccessful.seed);
    document.getElementById('lab-object').value = labLastSuccessful.objectId;
    document.getElementById('lab-variant').value = labLastSuccessful.color;
    document.getElementById('lab-event').value = labLastSuccessful.forcedEventId || '';
    startPhysicsLab(true);
  });
  function flickFeedbackOn() {
    return Settings.flickFeedback;
  }
  function setRadio(name, value) {
    const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (el) el.checked = true;
  }
  function setFeelRadio(value) { setRadio('feel', value); }

  // ── Setup persistence — names, lives, direction, difficulty, feel ──────────
  const SETUP_KEY = 'flipgame.setup.v2';
  function saveSetup() {
    try {
      localStorage.setItem(SETUP_KEY, JSON.stringify({
        rows: readRows().map((r) => ({
          id: r.id,
          name: persistedPlayerName(r.name),
          charId: r.charId,
          color: r.color,
          ai: !!r.ai,
          cosmeticId: r.cosmeticId || null,
        })),
        direction:  document.querySelector('input[name="direction"]:checked')?.value ?? '1',
        difficulty: chosenDifficulty(),
        startingLives: String(chosenStartingLives()),
        gameMode:    chosenGameMode(),
        format:      chosenFormat(),
        cupLength:   chosenCupLength(),
        arenaProfileId: chosenArenaProfile(),
        visualArenaId,
      }));
    } catch (_) {}
  }
  function loadSetup() {
    try {
      const s = JSON.parse(localStorage.getItem(SETUP_KEY));
      if (!s || !Array.isArray(s.rows) || s.rows.length < 1) return false;
      const rows = s.rows.slice(0, 16).map((r, i) => {
        const color = normalizeColor(r.color || defaultColorFor(r.charId || defaultCharId()));
        const charId = resolveCharForColor(r.charId || defaultCharId(), color);
        return {
          id: r.id,
          name: persistedPlayerName(r.name),
          charId,
          color,
          ai: !!r.ai,
          cosmeticId: r.cosmeticId || null,
          // Keep seatDefaults-compatible shape for rowHtml
        };
      });
      // Need at least 2 seats for a lobby; pad if a solo save somehow landed.
      while (rows.length < 2) rows.push(seatDefaults(rows.length, rows.map((x) => x.color)));
      renderFrom(rows);
      setRadio('direction', s.direction);
      setRadio('difficulty', s.difficulty);
      setRadio('starting-lives', s.startingLives);
      setRadio('game-mode', s.gameMode || 'normal');
      setRadio('match-format', s.format || 'classic');
      setRadio('cup-length', s.cupLength || 'short');
      const arena = document.getElementById('arena-profile');
      if (arena) arena.value = s.arenaProfileId || '';
      visualArenaId = s.visualArenaId || null;
      syncPreferenceControls();
      syncFormatControls(); syncCpuDifficulty();
      return true;
    } catch (_) { return false; }
  }

  // Persist feel / flick-feedback whenever the player picks them.
  document.querySelectorAll('input[name="feel"]').forEach((el) => {
    el.addEventListener('change', () => {
      Settings.setFeel(el.value);
      saveSetup();
    });
  });
  const flickFeedbackEl = document.getElementById('flick-feedback-toggle');
  if (flickFeedbackEl) {
    flickFeedbackEl.addEventListener('change', () => {
      Settings.setFlickFeedback(flickFeedbackEl.checked);
      saveSetup();
    });
  }
  document.querySelectorAll('input[name="direction"], input[name="difficulty"], input[name="starting-lives"], input[name="game-mode"], #arena-profile')
    .forEach((el) => el.addEventListener('change', saveSetup));
  syncPreferenceControls();

  // ── Start game ─────────────────────────────────────────────────────────────
  // Presentation routes only: these screens never resolve shots or grant
  // progression. The existing launchConfiguredMatch remains the sole action.
  const broadcastHome = document.getElementById('broadcast-home');
  const broadcastReady = document.getElementById('broadcast-ready');
  function showBroadcastHome() {
    setupScreen.classList.add('hidden');
    broadcastReady.classList.add('hidden');
    broadcastHome.classList.remove('hidden');
    document.getElementById('broadcast-home-title').focus({ preventScroll: true });
    Renderer.drawPreview(document.getElementById('broadcast-home-object'), 'bottle', '#0b86ff');
  }
  function showBroadcastSetup() {
    broadcastHome.classList.add('hidden');
    setupScreen.classList.remove('hidden');
    document.getElementById('setup-title').focus({ preventScroll: true });
  }
  document.getElementById('broadcast-setup').addEventListener('click', showBroadcastSetup);
  document.getElementById('broadcast-home-back').addEventListener('click', showBroadcastHome);
  document.getElementById('broadcast-practice').addEventListener('click', () => {
    showBroadcastSetup(); practiceBtn.click();
  });
  // ── Battle lane ────────────────────────────────────────────────────────────
  // Battle borrows the one physics surface this build has: the live table, the
  // real bottle, the real collider. The lane runtime decides whose launch this
  // is; the adapter below only launches what it is handed and reports what
  // settled. It never chooses a player, a score or a winner.
  const battleLane = (() => {
    let live = false;
    let frameId = null;
    let lastAt = 0;
    let airborne = null;
    let aim = null;
    let arenaTurn = 0;
    let armedFor = null;
    let struck = true;
    let seats = new Map();
    let laneSeat = null;
    let openLanes = 0;
    // The reward authority renames every competitor to its seat position, so the
    // look of a seat is found by where it sat in the lineup, never by the id the
    // setup screen happened to generate for that row.
    function seatFor(playerId) { return seats.get(String(playerId)) || null; }
    function paint(dt) {
      const seat = laneSeat || {};
      Renderer.frame(dt, {
        bottle: Physics.getBottle(), liquid: Physics.getLiquid(),
        groundY: Physics.getGroundY(), drag: aim,
        liquidColor: seat.color, skin: seat.skin || BASE_SKIN,
        variantId: seat.variantId || null, cosmeticId: seat.cosmeticId || null,
        playerName: seat.name || 'Player',
        visualArenaId: visualArenaId || null,
        awaitingFlick: !airborne,
        eventRenderState: Physics.getEventRenderState
          ? Physics.getEventRenderState(reduceMotionActive()) : null,
        landingLifecycle: Physics.getLandingLifecycle ? Physics.getLandingLifecycle() : null,
        eventBodies: Physics.getEventBodies ? Physics.getEventBodies() : [],
        plinkoBoard: null, plinkoSnapshot: null,
        target: Physics.getTarget ? Physics.getTarget() : null,
        obstacles: Physics.getObstacles ? Physics.getObstacles() : null,
        view: Physics.getViewHint ? Physics.getViewHint() : null,
      });
    }
    function frame(now) {
      if (!live) return;
      frameId = requestAnimationFrame(frame);
      const dt = Math.min((now - lastAt) / 1000, 0.05);
      lastAt = now;
      Physics.step(dt);
      if (airborne) {
        const result = Physics.checkLanding();
        if (result) {
          const info = Physics.getLastLandingInfo() || {};
          // The pose is whatever the collider settled into. Nothing here may
          // upgrade a miss or invent a cap.
          const pose = result !== 'MAKE' ? 'miss' : (info.onCap ? 'cap' : 'upright');
          const settled = airborne;
          airborne = null;
          // Whatever it landed as, it is lying there now and has to be set up
          // again before anyone flicks it.
          struck = true;
          Sound.play(result === 'MAKE' ? 'make' : 'miss');
          settled.resolve({ pose, reason: info.reason || null });
        }
      }
      paint(dt);
    }
    // Set the table for whoever the lane belongs to now: their Flipper, their
    // colour, an upright bottle and a fresh arena seed. A flip in the air is
    // never disturbed, and a table already set for the same competitor is left
    // alone so a waiting bottle does not twitch every frame.
    function arenaSeed() { return (arenaTurn * 0x9E3779B1) >>> 0; }
    function setTableFor(playerId) {
      const seat = seatFor(playerId);
      if (airborne) return;
      if (!struck && armedFor === playerId) { laneSeat = seat || laneSeat; return; }
      laneSeat = seat;
      if (Physics.setProfile) {
        Physics.setProfile(window.Skins && Skins.physicsFor
          ? Skins.physicsFor(seat && seat.skin || BASE_SKIN) : null);
      }
      Physics.resetBottle();
      // Battle keeps its own arena seed. The classic turn counter never advances
      // during a Battle, so borrowing it would deal every competitor the same
      // table for the whole series.
      arenaTurn += 1;
      if (Physics.seedTurn) Physics.seedTurn(arenaSeed());
      armedFor = playerId;
      struck = false;
    }
    return {
      // One physics surface plays one lane, so the lane covers the whole table
      // and every competitor takes it in turn. The host measures that lane off
      // the stage itself, which is the same glass this table is painted on.
      capacity: 1,
      measure: () => ({ width: window.innerWidth, observedContacts: 1 }),
      live: () => live,
      // The glass changed size, so the table is re-fitted under a bottle that is
      // only waiting. A flip already in the air keeps the world it was launched
      // into: Physics holds the reflow back until that flip resolves.
      reflow() {
        if (!live) return;
        Physics.reflow(window.innerWidth, window.innerHeight, stageBottomInset());
        if (airborne) return;
        Physics.resetBottle();
        // Anything the arena seed places belongs to the glass it was placed on.
        // Re-fitting the world alone moves the floor and leaves a target pad or a
        // tractor ring at the height it was dealt for the old viewport, so the
        // same seed is dealt again for the new one. A classic turn does this
        // through prepareTurnArena; the lane has to do it too.
        if (Physics.seedTurn) Physics.seedTurn(arenaSeed());
      },
      remember(defs) { seats = new Map(defs.map((def, index) => ['seat-' + (index + 1), def])); },
      // A CPU competitor still has to flick something. The intent comes from the
      // same calibrated module a classic CPU turn uses, off the same seeded
      // table, so a Battle opponent is exactly as good as one in a normal match
      // and no better. It reports no pose: the collider decides that.
      cpuLaunch(request) {
        const cpu = window.FlipgameV112Cpu;
        if (!live || !cpu || typeof cpu.createLaunch !== 'function') return null;
        const playerId = request && request.playerId;
        setTableFor(playerId);
        const seat = seatFor(playerId) || {};
        const profile = (window.Skins && Skins.physicsFor
          && Skins.physicsFor(seat.skin || BASE_SKIN)) || {};
        const seed = arenaSeed();
        // Battle runs no ordinary events, so the only bank-shot table a CPU can
        // be dealt is one its own Flipper brings.
        const alien = !!profile.floorResolve;
        const target = alien && Physics.alienTargetForSeed
          ? Physics.alienTargetForSeed(seed) : null;
        const view = Physics.getViewHint ? Physics.getViewHint() : null;
        const intent = cpu.createLaunch({
          seed, difficulty: chosenDifficulty(),
          physicsModeId: alien ? 'alien' : 'normal', target,
          arena: {
            worldW: target?.worldW || view?.worldW || window.innerWidth,
            viewW: target?.viewW || window.innerWidth,
            viewH: target?.viewH || window.innerHeight,
          },
        });
        return { vx: intent.vx, vy: intent.vy };
      },
      adapter(context) {
        // One physics surface, one bottle, one attempt in the air. A second lane
        // built here would share all three and report one competitor's pose as
        // another's, so raising the capacity has to fail loudly instead.
        if (openLanes) throw new Error('The live table runs one Battle lane at a time');
        openLanes += 1;
        return {
          resources: context.resources,
          destroy() { openLanes = 0; },
          // The aim trail is paint only: the runtime's qualifier reads the
          // pointer samples itself, and nothing here feeds back into a launch.
          beginAim() { aim = null; },
          sampleAim(sample) {
            const point = sample && sample.sample;
            if (!point) return;
            if (!aim) aim = { startX: point.clientX, startY: point.clientY, curX: point.clientX, curY: point.clientY };
            else { aim.curX = point.clientX; aim.curY = point.clientY; }
          },
          cancelAim() { aim = null; },
          launch(launch) {
            aim = null;
            setTableFor(launch.playerId);
            const signal = launch.gesture && launch.gesture.launchSignal || {};
            const power = (launch.powerEffects || []).find(effect => effect && effect.eventAdapterId);
            // A stored card is the only event a Battle flick may run: with one
            // forced adapter the engine rolls nothing of its own.
            if (power && Physics.forceSpecialEvent) Physics.forceSpecialEvent(power.eventAdapterId);
            Sound.unlock();
            Sound.play('flick');
            // Physics Feel is a human input preference. A CPU tier is calibrated
            // against the canonical transfer, so letting that preference reach a
            // CPU launch would quietly change how strong the opponent is.
            const cpu = launch.gesture && launch.gesture.pointerType === 'cpu';
            Physics.applyFlick(Number(signal.vx) || 0, Number(signal.vy) || 0,
              cpu ? arenaSeed() : undefined, 1, power ? 'normal' : 'disabled', false,
              cpu ? { inputFeelMode: 'standard' } : {});
            return new Promise(resolve => { airborne = { resolve }; });
          },
          // The lane is someone else's now, so the table is set for them before
          // they touch it. Waiting for their flick would show them the last
          // bottle lying where it fell, wearing their colour.
          onAssignment(assignment) { setTableFor(assignment.playerId); },
          // A resolved attempt leaves the bottle wherever it fell, and the lane
          // is handed straight back — to the next competitor, or to the same one
          // for the next volley. Only an assignment change announces itself, so
          // relying on that alone left whoever leads the next volley staring at
          // the last bottle lying on its side in their own colour.
          reset(info) { if (info && info.playerId) setTableFor(info.playerId); },
        };
      },
      enter(context) {
        if (live) return;
        live = true;
        airborne = null; aim = null; armedFor = null; struck = true; openLanes = 0;
        gameScreen.classList.remove('hidden');
        gameScreen.classList.add('battle-lane');
        document.body.classList.add('battle-lane-live');
        // The runtime owns every pointer in a Battle, so the classic flick
        // router must not be listening to the same glass.
        if (Input.disable) Input.disable();
        Renderer.init(canvas);
        Renderer.setReduceMotion(reduceMotionActive());
        const roster = ((context && context.config && context.config.players) || [])
          .map(player => seatFor(player.id)).filter(Boolean);
        if (window.Skins) Skins.preload(roster.map(seat => ({ id: seat.skin || BASE_SKIN, color: seat.color })));
        resize();
        Physics.init(window.innerWidth, window.innerHeight, stageBottomInset());
        if (Physics.setFeel) Physics.setFeel(chosenFeel());
        // A first heat opens on the first seat's table; the runtime's own
        // assignment corrects it the moment it decides who actually leads.
        setTableFor('seat-1');
        lastAt = performance.now();
        frameId = requestAnimationFrame(frame);
      },
      exit() {
        if (!live) return;
        live = false;
        if (frameId) cancelAnimationFrame(frameId);
        frameId = null;
        // A lane that leaves mid-flight resolves nothing: an attempt with no
        // reported pose never enters the ledger, so it can never be scored.
        airborne = null; aim = null; laneSeat = null; armedFor = null; struck = true;
        openLanes = 0;
        gameScreen.classList.add('hidden');
        gameScreen.classList.remove('battle-lane');
        document.body.classList.remove('battle-lane-live');
        if (Input.enable) Input.enable();
      },
    };
  })();
  if (window.FlipgameV112BattleRoutes) {
    if (v112App && window.FlipgameV112BattleHost) {
      battleHost = FlipgameV112BattleHost.createBattleHost({
        application: v112App,
        laneAdapterFactory: context => battleLane.adapter(context),
        laneCapacity: battleLane.capacity,
        measureDisplay: battleLane.measure,
        openLane: battleLane.enter,
        closeLane: battleLane.exit,
        cpuLaunch: battleLane.cpuLaunch,
        // A Battle is a game loop, so it runs on the paint clock and on a clock
        // that only moves forward. Wall time can step sideways, and a Timed Rush
        // horn must not be decided by the system clock being corrected.
        requestFrame: callback => requestAnimationFrame(callback),
        cancelFrame: id => cancelAnimationFrame(id),
        now: () => performance.now(),
      });
    }
    FlipgameV112BattleRoutes.mount({ document,
      getHost: () => battleHost,
      getPlayers: () => {
        if (firstInvalidSetupName(setupNameInputs())) return [];
        const defs = rowsToDefs(readRows());
        // The lane needs the look of each competitor; the Battle rules need only
        // their identity. Both read the same roster so a seat cannot drift.
        battleLane.remember(defs);
        return defs.map(entry => ({
          id: entry.id, displayName: entry.name, type: entry.isAI ? 'cpu' : 'human',
          flipperId: entry.skin, variantId: entry.variantId, cosmeticId: entry.cosmeticId,
        }));
      },
      onOpen: () => broadcastHome.classList.add('hidden'),
      onHome: showBroadcastHome,
      onEditRoster: showBroadcastSetup,
    });
  } else {
    document.getElementById('battle-open').addEventListener('click', () => {
      document.getElementById('journey-home-status').textContent = 'Battle is not connected in this development build. Your progress has not changed.';
    });
  }
  // Presentation host is injected by the private activity composition. Missing
  // capability means no Story reservation, simulated victory or reward write.
  if (v112App && v112App.ready) {
    v112App.ready.then(() => {
      const owner = new URLSearchParams(location.search).get('owner');
      if (owner === 'Howe Test Mode') {
        try { v112App.enableOwnerTesting(owner); } catch (_) {}
      }
    }).catch(() => {});
  }
  if (window.FlipgameV112JourneyRoutes) {
    if (v112App && window.FlipgameV112JourneyHost) {
      journeyHost = FlipgameV112JourneyHost.createJourneyHost({
        application: v112App,
        startLiveMatch(spec) {
          broadcastHome.classList.add('hidden');
          document.getElementById('journey-screen')?.classList.add('hidden');
          if (spec.kind === 'tour') {
            const attempt = spec.tour && spec.tour.activeAttempt;
            const human = spec.tour && spec.tour.request && spec.tour.request.roster
              ? spec.tour.request.roster[0] : { displayName: 'Player', flipperId: 'bottle' };
            const skin = (attempt && attempt.flipperId) || human.flipperId || BASE_SKIN;
            const eventId = attempt && attempt.eventSelection && attempt.eventSelection.eventId;
            startGame(rosterToLiveDefs([{
              id: human.id || 'tour-human', displayName: human.displayName || 'Player',
              flipperId: skin, variantId: human.variantId, cosmeticId: human.cosmeticId, human: true,
            }]), 1, {
              practice: true, testData: true, reservedSession: true, tour: true,
              forced: !!eventId, labEventId: eventId || null, startingLives: 10,
            });
            return;
          }
          const request = spec.request;
          if (!request || !Array.isArray(request.roster)) {
            throw new Error('A prescribed Story request is required');
          }
          startGame(rosterToLiveDefs(request.roster), 1, {
            format: 'classic',
            startingLives: request.rulesOptions && request.rulesOptions.startingLives,
            physicsModeId: request.physicsModeId,
            insanity: request.physicsModeId === 'insane',
            visualArenaId: (request.rulesOptions && request.rulesOptions.arenaId)
              || (request.activityContext && request.activityContext.arenaId),
            reservedSession: true, journey: 'story',
            eventsDisabled: !!(request.rulesOptions && request.rulesOptions.events
              && request.rulesOptions.events.enabled === false),
          });
        },
        closeLiveMatch() {
          gameStarted = false;
          if (loopId) { cancelAnimationFrame(loopId); loopId = null; }
          gameScreen.classList.add('hidden');
          document.getElementById('journey-screen')?.classList.remove('hidden');
        },
      });
    }
    FlipgameV112JourneyRoutes.mount({ document,
      getHost: () => journeyHost,
      getHumans: count => {
        if (!validateSetupNames()) return [];
        return rowsToDefs(readRows()).filter(entry => !entry.isAI).slice(0, count).map((entry, index) => ({
          id: entry.id || ('human-' + (index + 1)), displayName: entry.name, flipperId: entry.skin,
          variantId: entry.variantId, cosmeticId: entry.cosmeticId,
        }));
      },
      onOpen: () => broadcastHome.classList.add('hidden'),
      onHome: showBroadcastHome,
      onPlay: () => {
        broadcastHome.classList.add('hidden');
        if (journeyHost && typeof journeyHost.enterLive === 'function') journeyHost.enterLive();
      },
    });
  } else {
    for (const id of ['journey-story', 'journey-rivals', 'journey-tour']) {
      document.getElementById(id).addEventListener('click', () => {
        document.getElementById('journey-home-status').textContent = 'This activity is not connected in this development build. Your progress has not changed.';
      });
    }
  }
  function showAppRoute(screen) {
    document.getElementById('broadcast-home')?.classList.add('hidden');
    setupScreen.classList.add('hidden');
    ['journey-screen', 'store-screen', 'tutorial-screen'].forEach((id) => {
      document.getElementById(id)?.classList.toggle('hidden', id !== screen.id);
    });
    screen.classList.remove('hidden');
    screen.querySelector('h1')?.focus();
  }
  function hideAppRoute(screen) {
    screen.classList.add('hidden');
    document.getElementById('broadcast-home')?.classList.remove('hidden');
  }
  function renderStoreGrid() {
    const grid = document.getElementById('store-grid');
    const wallet = document.getElementById('store-wallet');
    if (!grid) return;
    const items = (v112App && typeof v112App.store === 'function') ? v112App.store() : [];
    const profile = v112App && v112App.snapshot ? v112App.snapshot().profile : null;
    if (wallet) wallet.textContent = profile && profile.fc != null
      ? `${profile.fc} Flip Credits · looks only`
      : 'Flip Credits buy looks only.';
    grid.replaceChildren();
    items.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'picker-tile';
      button.textContent = item.owned ? item.displayName : `${item.displayName} · ${item.price || item.fc || ''} FC`;
      if (item.owned) button.disabled = true;
      else button.addEventListener('click', () => {
        try { v112App.purchaseCosmetic(item.id); renderStoreGrid(); }
        catch (error) { announce(error.message || 'Could not buy that cosmetic.', true); }
      });
      grid.appendChild(button);
    });
  }
  document.getElementById('journey-store')?.addEventListener('click', () => {
    renderStoreGrid();
    showAppRoute(document.getElementById('store-screen'));
  });
  document.getElementById('journey-tutorial')?.addEventListener('click', () => {
    showAppRoute(document.getElementById('tutorial-screen'));
  });
  document.getElementById('store-back')?.addEventListener('click', () => hideAppRoute(document.getElementById('store-screen')));
  document.getElementById('tutorial-back')?.addEventListener('click', () => hideAppRoute(document.getElementById('tutorial-screen')));
  document.getElementById('tutorial-start-tour')?.addEventListener('click', () => {
    hideAppRoute(document.getElementById('tutorial-screen'));
    document.getElementById('journey-tour')?.click();
  });
  // Platform owns the single wake lock and visibility lifecycle.
  async function enterImmersive() {
    try { if (v111Platform && v111Platform.enterMatch) await v111Platform.enterMatch({ fullscreen: true }); }
    catch (_) {}
  }

  function launchConfiguredMatch() {
    if (!validateSetupNames()) return;
    const defs = rowsToDefs(readRows());
    if (defs.length < 2) { alert('Need at least 2 players!'); return; }
    const format = chosenFormat();
    const limits = window.FlipgameV111Interfaces;
    const cupLimit = chosenCupLength() === 'full'
      ? (limits && limits.PLAYER_LIMITS ? limits.PLAYER_LIMITS.cupFull.max : 8)
      : (limits && limits.PLAYER_LIMITS ? limits.PLAYER_LIMITS.cupShort.max : 12);
    if (format === 'cup' && defs.length > cupLimit) {
      announce(`${chosenCupLength() === 'full' ? 'Full' : 'Short'} Cup supports up to ${cupLimit} players.`, true);
      return;
    }
    if (format === 'team-clash' && (defs.length > 16 || defs.length % 2 !== 0)) {
      announce('Team Clash needs an even roster from 2 to 16 players.', true);
      return;
    }
    const dir = parseInt(document.querySelector('input[name="direction"]:checked')?.value ?? '1');
    saveSetup();
    Sound.unlock();   // first user gesture — unlock audio
    enterImmersive();
    setupScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    gameOverEl.classList.add('hidden');
    startGame(defs, dir, {
      difficulty: chosenDifficulty(),
      feel: chosenFeel(),
      startingLives: chosenStartingLives(),
      insanity: chosenGameMode() === 'insanity',
      format,
      cupLength: chosenCupLength(),
      arenaProfileId: chosenArenaProfile(),
      visualArenaId,
      newMatch: true,
    });
  }

  // Venue selection is a separate pre-match step, never a per-player cosmetic.
  const arenaSelectScreen = document.getElementById('arena-select-screen');
  const arenaSelectGrid = document.getElementById('arena-select-grid');
  let arenaFrame = 0;
  let arenaChoices = [];
  function availableArenaChoices() {
    if (v112App && typeof v112App.arenas === 'function') {
      return v112App.arenas().map((row, index) => row.locked
        ? { id: null, displayName: '🔒', locked: true, key: 'locked-' + index }
        : { id: row.id, displayName: row.displayName, locked: false, key: row.id });
    }
    if (window.FlipgameV112ArenaPreview) return FlipgameV112ArenaPreview.list().map((row) => ({
      id: row.id, displayName: row.displayName, locked: false, key: row.id,
    }));
    return [{ id: 'baseline-table', displayName: 'Baseline Table', locked: false, key: 'baseline-table' }];
  }
  function paintArenaPreview(time = 0) {
    if (arenaSelectScreen.classList.contains('hidden')) return;
    const canvas = document.getElementById('arena-preview');
    const ctx = canvas.getContext('2d');
    if (window.FlipgameV112ArenaPreview) {
      FlipgameV112ArenaPreview.draw(ctx, {arenaId: arenaDraft || 'baseline-table', width: canvas.width, height: canvas.height, timeMs: time, reducedMotion: document.body.classList.contains('reduce-motion')});
    } else {
      ctx.fillStyle = '#172b39'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#415564'; ctx.fillRect(0, canvas.height * .7, canvas.width, canvas.height * .03);
    }
    arenaFrame = requestAnimationFrame(paintArenaPreview);
  }
  function selectArena(id, focus = false) {
    const choice = arenaChoices.find(v => !v.locked && v.id === id) || arenaChoices.find(v => !v.locked) || arenaChoices[0];
    arenaDraft = choice.id;
    document.getElementById('arena-preview-name').textContent = choice.displayName;
    document.getElementById('arena-play').textContent = 'Play';
    arenaSelectGrid.querySelectorAll('[data-venue]').forEach(button => {
      const selected = button.dataset.venue === choice.id;
      button.setAttribute('aria-pressed', String(selected));
      if (selected && focus) button.focus();
    });
  }
  function closeArenaSelect() {
    cancelAnimationFrame(arenaFrame);
    arenaSelectScreen.classList.add('hidden');
    setupScreen.classList.remove('hidden');
    startBtn.focus();
  }
  startBtn.addEventListener('click', () => {
    if (!validateSetupNames()) return;
    arenaChoices = availableArenaChoices();
    arenaSelectGrid.replaceChildren();
    for (const choice of arenaChoices) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'picker-tile';
      button.dataset.venue = choice.key || choice.id || '';
      button.textContent = choice.displayName;
      if (choice.locked) { button.disabled = true; button.setAttribute('aria-label', 'Locked'); }
      else button.addEventListener('click', () => selectArena(choice.id));
      arenaSelectGrid.appendChild(button);
    }
    selectArena(visualArenaId || 'baseline-table');
    setupScreen.classList.add('hidden');
    arenaSelectScreen.classList.remove('hidden');
    document.getElementById('arena-select-title').focus();
    cancelAnimationFrame(arenaFrame); arenaFrame = requestAnimationFrame(paintArenaPreview);
  });
  document.getElementById('arena-select-back').addEventListener('click', closeArenaSelect);
  document.getElementById('arena-random').addEventListener('click', () => {
    const unlocked = arenaChoices.filter((choice) => !choice.locked && choice.id);
    selectArena((unlocked[Math.floor(Math.random() * unlocked.length)] || arenaChoices[0]).id, true);
  });
  document.getElementById('arena-play').addEventListener('click', () => {
    if (!validateSetupNames()) return;
    cancelAnimationFrame(arenaFrame);
    arenaSelectScreen.classList.add('hidden');
    const lineup = document.getElementById('broadcast-ready-lineup');
    lineup.replaceChildren();
    rowsToDefs(readRows()).forEach((entry, index) => {
      const card = document.createElement('article'); card.className = 'broadcast-ready-entry';
      const art = document.createElement('canvas'); art.width = 120; art.height = 150; art.setAttribute('aria-hidden', 'true');
      const body = document.createElement('div');
      const seat = document.createElement('span'); seat.className = 'broadcast-eyebrow'; seat.textContent = `P${index + 1}`;
      const name = document.createElement('h3'); name.textContent = entry.name;
      const kind = document.createElement('p'); kind.textContent = entry.isAI ? 'CPU' : 'Human';
      body.append(seat, name, kind); card.append(art, body); lineup.append(card);
      Renderer.drawPreview(art, entry.skin || 'bottle', entry.color);
    });
    showRosterPage('ready', 0);
    document.getElementById('broadcast-ready-arena').textContent = document.getElementById('arena-preview-name').textContent;
    const details = document.getElementById('broadcast-ready-details'); details.replaceChildren();
    const summary = [['Format', document.querySelector('input[name="match-format"]:checked')?.nextElementSibling?.textContent || 'Classic'],
      ['Players', String(readRows().length)], ['Feel', chosenFeel()],
      ['Direction', document.querySelector('input[name="direction"]:checked')?.nextElementSibling?.textContent || 'Left to right']];
    if (chosenFormat() === 'classic') summary.splice(2, 0, ['Starting lives', String(chosenStartingLives())]);
    for (const [label, value] of summary) {
      const term = document.createElement('dt'), definition = document.createElement('dd');
      term.textContent = label; definition.textContent = value; details.append(term, definition);
    }
    broadcastReady.classList.remove('hidden');
    document.getElementById('broadcast-ready-title').focus({ preventScroll: true });
  });
  function closeBroadcastReady() {
    broadcastReady.classList.add('hidden'); arenaSelectScreen.classList.remove('hidden');
    document.getElementById('arena-play').focus();
    cancelAnimationFrame(arenaFrame); arenaFrame = requestAnimationFrame(paintArenaPreview);
  }
  document.getElementById('broadcast-ready-back').addEventListener('click', closeBroadcastReady);
  broadcastReady.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closeBroadcastReady(); }
  });
  document.getElementById('broadcast-ready-play').addEventListener('click', () => {
    if (broadcastReady.classList.contains('hidden')) return;
    if (!validateSetupNames()) return;
    visualArenaId = arenaDraft || null;
    broadcastReady.classList.add('hidden'); launchConfiguredMatch();
  });
  arenaSelectScreen.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closeArenaSelect(); }
  });

  // ── Practice (solo, no lives) ───────────────────────────────────────────────
  practiceBtn.addEventListener('click', () => {
    if (!validateSetupNames()) return;
    const r0 = readRows()[0] || { name: 'You', charId: defaultCharId(), color: defaultColorFor(defaultCharId()) };
    const color = normalizeColor(r0.color || defaultColorFor(r0.charId || defaultCharId()));
    const charId = FORCE_SKIN || resolveCharForColor(r0.charId || defaultCharId(), color);
    const def = {
      name: (r0.name || '').trim() || defaultNameFor(charId, color),
      color,
      isAI: false,
      skin: charId,
      id: r0.id,
      variantId: r0.variantId || flavorIdForColor(color),
      cosmeticId: r0.cosmeticId || null,
    };
    saveSetup();
    Sound.unlock();
    enterImmersive();
    setupScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    gameOverEl.classList.add('hidden');
    startGame([def], 1, {
      practice: true,
      feel: chosenFeel(),
      startingLives: chosenStartingLives(),
      insanity: chosenGameMode() === 'insanity',
      visualArenaId,
      newMatch: true,
    });
  });

  let arenaDraftOffer = null;
  let arenaDraftSelection = null;
  let proposedNextDefs = null;
  let confirmedNextDefs = null;
  let proposedTeamSwap = false;
  let confirmedTeamSwap = false;

  function defsFromCurrentGame() {
    return game.players.map((player, index) => Object.assign({}, currentMatchDefs[index] || {}, {
      name: player.name, color: player.color, isAI: !!player.isAI,
      skin: FORCE_SKIN || player.skin || currentMatchDefs[index]?.skin || BASE_SKIN,
      netId: player.netId,
    }));
  }

  function renderArenaDraft(offer) {
    const panel = document.getElementById('arena-draft');
    const choicesEl = document.getElementById('arena-draft-choices');
    arenaDraftOffer = offer && Array.isArray(offer.choices) && offer.choices.length === 3 ? offer : null;
    arenaDraftSelection = null;
    panel?.classList.toggle('hidden', !arenaDraftOffer);
    if (!choicesEl) return;
    choicesEl.innerHTML = arenaDraftOffer ? arenaDraftOffer.choices.map((entry) => {
      const profile = entry.profile || entry;
      const name = profile.displayName || profile.name || dimensionName(profile.id);
      const description = profile.description || profile.summary || 'Symmetrical physics modifier';
      return `<button type="button" class="arena-choice" role="radio" aria-checked="false" data-arena-choice="${escapeHtml(profile.id)}"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(description)}</span></button>`;
    }).join('') : '';
  }

  document.getElementById('arena-draft-choices')?.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-arena-choice]');
    if (!choice || !arenaDraftOffer) return;
    const id = choice.dataset.arenaChoice;
    const offered = arenaDraftOffer.choices.some((entry) => String((entry.profile || entry).id) === id);
    if (!offered) return;
    arenaDraftSelection = id;
    document.querySelectorAll('[data-arena-choice]').forEach((button) => button.setAttribute('aria-checked', String(button === choice)));
    playAgainBtn.disabled = false;
    announce(`${choice.querySelector('strong')?.textContent || 'Arena'} selected for the next heat.`);
  });

  function applyModeRematchOptions(options, modeState) {
    if (game.format === 'cup' && modeState?.phase === 'between-heats') {
      options.cupState = modeState;
      delete options.arenaProfileId;
      if (arenaDraftSelection) options.arenaDraftSelectionId = arenaDraftSelection;
    } else if (game.format === 'cup' && modeState?.newCupOptions) {
      Object.assign(options, detached(modeState.newCupOptions));
    }
    if (game.format === 'team-clash') {
      const fairOptions = confirmedTeamSwap ? modeState?.swapTeamOptions : modeState?.rematchOptions;
      if (fairOptions) Object.assign(options, detached(fairOptions));
    }
    return options;
  }

  playAgainBtn.addEventListener('click', () => {
    const replayModeState = v111Runtime?.modes?.snapshot({ game }) || null;
    enterImmersive();
    gameOverEl.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    if (game.practice) {
      startGame(
        [{ name: game.players[0].name, color: game.players[0].color, isAI: false,
           skin: FORCE_SKIN || game.players[0].skin || BASE_SKIN }],
        1,
        { practice: true, feel: game.feel || chosenFeel(), startingLives: game.startingLives,
          insanity: game.insanity, visualArenaId: currentMatchOptions.visualArenaId || visualArenaId }
      );
    } else {
      const defs = (confirmedNextDefs || defsFromCurrentGame()).map((definition) => ({ ...definition }));
      const modeState = replayModeState;
      const nextOptions = {
        difficulty: game.difficulty,
        feel: game.feel || chosenFeel(),
        startingLives: game.startingLives,
        startIndex: confirmedNextDefs ? 0 : game.winnerIndex,
        insanity: game.insanity,
        format: game.format,
        cupLength: currentMatchOptions.cupLength,
        arenaProfileId: currentMatchOptions.arenaProfileId,
        visualArenaId: currentMatchOptions.visualArenaId || visualArenaId,
      };
      applyModeRematchOptions(nextOptions, modeState);
      confirmedNextDefs = null;
      confirmedTeamSwap = false;
      proposedNextDefs = null;
      proposedTeamSwap = false;
      arenaDraftOffer = null;
      arenaDraftSelection = null;
      startGame(defs, game.direction, nextOptions);
    }
  });

  // Restore yesterday's lobby, else two fresh seats (rotate families / colors).
  if (!loadSetup()) {
    renderFrom((() => {
      const seats = [];
      for (let i = 0; i < 2; i++) seats.push(seatDefaults(i, seats.map((s) => s.color)));
      return seats;
    })());
  }

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
  let lastFlickPower = null;   // 0..1 strength of the current flip's flick (achievements)
  let greatSaveActive = false; // the RESULT being shown is a rare Great Save
  let capLandActive = false;   // the RESULT being shown is a rare on-cap / upside-down make
  // Golden Flip is selected exclusively by the canonical v111 event registry.
  // There is deliberately no second controller-side lottery.
  let goldenFlipActive = false;
  let goldenShowActive = false;  // the RESULT being shown is a golden make
  const GOLDEN_COLOR = '#f2c14e';
  // Moon Gravity is part of the deterministic rare-event ladder in physics.js.
  let moonFlipActive = false;
  // Easter egg: ~1/1000 flips the floor vanishes and the throw drops into a
  // plinko board (center = auto win). Physics rolls it from the flick seed;
  let plinkoFlipActive = false;
  let rareEventActive = null;
  let activeArenaPhysicsId = null;
  let testDataFlipActive = false; // forced-name/typed-event marker for observers
  let matchTestDataActive = false; // once forced, the whole match/Cup remains Test Data
  let bridgeLandingInfo = null;
  let currentMatchOptions = {};
  let currentMatchDefs = [];
  let currentMatchId = null;
  let easterEggState = null;
  let easterPresentation = null;
  // Captured after a committed Globe result. This contains only paint data;
  // it never participates in selection, physics, outcomes, or rewards.
  let easterGlobeFocus = null;

  function resolvePresentationSecret(record, flick) {
    easterPresentation = null;
    easterGlobeFocus = null;
    const registry = window.FlipgameV112EasterEggs;
    if (!registry || !currentMatchId || !record) return;
    if (!easterEggState || easterEggState.matchId !== currentMatchId) {
      easterEggState = registry.createMatchState(currentMatchId);
    }
    const count = value => Math.max(0, Math.floor(Number(value) || 0));
    const alien = record.objectId === 'alien' || record.eventId === 'alien-invasion' || /tractor|portal/.test(record.landingReason || '');
    const sequence = easterEggState.lastSequence + 1;
    const flipId = `${currentMatchId}:${record.heat || 0}:${record.turn}:${game.practiceAttempts}`;
    // Hash domain is presentation-only: it never advances the event/input RNG.
    const presentationSeed = `egg:${currentMatchId}:${flick?.seed ?? 0}:${record.turn}:${game.practiceAttempts}`;
    try {
      const response = registry.evaluate(easterEggState, {
        schema: 'EasterEggOutcomeContextV1', matchId: currentMatchId, flipId, sequence,
        presentationSeed, objectId: record.objectId, variantId: record.variantId,
        arenaId: String(record.arenaId || 'baseline-table').replace(/^arena\./, ''),
        playerName: record.displayName, physicsModeId: alien ? 'alien' : game.insanity ? 'insane' : 'normal',
        eventId: record.eventId, laneId: 'main', outcomePhase: 'committed',
        verdict: record.result, physical: true, automatic: record.eventId === 'plinko',
        landingClass: alien && record.result === 'MAKE' ? 'alien-ring' : record.cap ? 'cap' : record.result === 'MAKE' ? 'upright' : 'miss',
        rotationCount: count(record.rotations), bounceCount: count(record.bounces),
        bankCount: count(record.banks), settleMs: Math.max(0, Number(record.settleMs) || 0),
        clean: count(record.bounces) === 0, recovery: count(record.bounces) > 0,
        pressureShot: !!record.suddenDeathBefore, matchTerminal: game.activePlayers().length <= 1,
        testData: !!(record.testData || record.forced || record.practice || record.lab),
        reducedMotion: reduceMotionActive(), audioMuted: !Settings.sound,
      });
      easterEggState = response.state;
      easterPresentation = response.presentation;
      if (easterPresentation && window.FlipgameV112EasterPresentation) {
        // Camera requests are deliberately not granted over an event/reaction
        // camera. The authored scene stays in its own screen-space inset.
        if (easterPresentation.id === 'desk-globe-visible-wurld') {
          const globe = window.FlipgameV112GlobeLive;
          const orientation = globe && typeof globe.currentOrientation === 'function'
            ? globe.currentOrientation() : null;
          if (orientation) {
            easterGlobeFocus = Object.freeze({ orientation, seed: presentationSeed,
              durationMs: easterPresentation.visual.durationMs });
          }
        }
        // Do not announce or play a Globe focus unless the real, visible
        // hemisphere was actually captured. Other cues remain unaffected.
        if (easterPresentation.id !== 'desk-globe-visible-wurld' || easterGlobeFocus) {
          announce(easterPresentation.cue.accessibilityText);
          const sound = FlipgameV112EasterPresentation.audioCue(easterPresentation);
          if (sound) Sound.play(sound);
        }
      }
    } catch (error) {
      // Presentation failure must never roll back or change a committed flip.
      console.warn('Optional presentation unavailable:', error.message);
    }
  }
  let currentMatchStartedAt = 0;
  let matchTelemetry = null;
  let flipTelemetry = null;
  const RARE_EVENT_LABELS = {
    'rainbow-corkscrew': '🌈 RAINBOW CORKSCREW!',
    'rainbow-trail': '🌈 RAINBOW TRAIL!',
    'half-full': '💧 HALF FULL!',
    'power-launch': '⚡ POWER LAUNCH!',
    'fizz-jet': '🫧 FIZZ JET!',
    'golden-flip': '✨ GOLDEN FLIP!',
    'bouncy-bottle': '🟢 BOUNCY BOTTLE!',
    earthquake: '🌋 EARTHQUAKE!',
    'moon-gravity': '🌙 MOON GRAVITY!',
    'ice-slide': '🧊 ICE SLIDE!',
    'alien-invasion': '👽 ALIEN INVASION!',
    'gravity-slam': '💥 GRAVITY SLAM!',
    trampoline: '🟢 TRAMPOLINE TABLE!',
    'wind-tunnel': '🌪️ WIND TUNNEL!',
    'shrink-ray': '📉 SHRINK RAY!',
    'portal-pair': '🌀 PORTAL PAIR!',
    'tether-swing': '🪢 TETHER SWING!',
    mitosis: '🦠 MITOSIS!',
    'double-flip': '🚀 DOUBLE FLIP!',
    'ceiling-flip': '🔝 CEILING FLIP!',
    'meteor-shower': '☄️ METEOR SHOWER!',
    magnet: '🧲 MAGNET LANDING!',
    'heart-rush': '💗 HEART RUSH!',
    'black-hole': '🕳️ BLACK HOLE!',
    boomerang: '🪃 BOOMERANG!',
    'roulette-table': '🎰 ROULETTE TABLE!',
    rewind: '⏪ REWIND!',
    plinko: '🎰 PLINKO DROP!',
    'mirror-match': '🪞 MIRROR MATCH!',
    'cap-toss': '🧢 CAP TOSS!',
    'life-drain': '☣️ LIFE DRAIN!',
  };
  function rareEventLabel(id) {
    if (!id) return null;
    const metadata = window.FlipgameV111PhysicsEvents?.getMetadata(id);
    return RARE_EVENT_LABELS[id] || (metadata?.displayName ? `${metadata.displayName.toUpperCase()}!` : null);
  }
  // Exact, case-sensitive event QA profile.
  const isMrHoweName = (name) => String(name || '') === 'Mr. Howe';
  // Offline test names force their matching event on every flip. Normalize
  // spaces/hyphens so both "Double Flip" and "doubleflip" work in the roster.
  // Easter egg: secret player names — all pure cosmetics.
  //   party/disco   → rainbow table edge      ghost/boo     → see-through object
  //   tiny/smol     → pocket-sized object     giant/jumbo   → oversized object
  //   ninja/shadow  → silhouette object       rainbow/unicorn → hue-cycling object
  const isPartyName = (n) => /^(party|disco)$/i.test(String(n || '').trim());
  const isGhostName = (n) => /^(ghost|boo)$/i.test(String(n || '').trim());
  const isTinyName  = (n) => /^(tiny|smol)$/i.test(String(n || '').trim());
  const isGiantName = (n) => /^(giant|jumbo|biggie)$/i.test(String(n || '').trim());
  const isNinjaName = (n) => /^(ninja|shadow)$/i.test(String(n || '').trim());
  const isRainbowName = (n) => /^(rainbow|unicorn)$/i.test(String(n || '').trim());
  // Typed event words arm the next flip only; roster test names repeat forever.
  let specialEventArmed = null;
  // Rainbow egg: cycle the 12 flavor colors (~1.1s each) — each is a cached
  // sprite bake, so no per-frame cache churn.
  function rainbowColor() {
    const flavors = (window.FLIP_CAST25 && FLIP_CAST25.flavors) ||
      ['#1f9bff', '#e3263c', '#8ed11a', '#ff7a00', '#8a3ffc', '#5fcfe6'];
    return flavors[Math.floor(Date.now() / 1100) % flavors.length];
  }
  // Konami code (keyboard) toggles party mode without the secret name.
  let konamiParty = false;
  try { konamiParty = localStorage.getItem('flipgame.party') === '1'; } catch (_) {}
  let mirrorMatch = null;
  let activeMirrorClaim = null;
  function detached(value) { return JSON.parse(JSON.stringify(value)); }
  function stablePlayerId(player, index) {
    return String(currentMatchDefs[index]?.id || player?.netId || `seat-${index + 1}`);
  }
  function activeMirrorRoster() {
    return game.players.map((player, index) => ({
      playerId: stablePlayerId(player, index),
      playerIndex: index,
      active: !player.eliminated,
      eliminated: !!player.eliminated,
    }));
  }
  function physicsProfileForPlayer(index) {
    const player = game.players[index];
    const skin = currentMatchDefs[index]?.skin || player?.skin || BASE_SKIN;
    return detached((window.Skins && Skins.physicsFor && Skins.physicsFor(skin)) || {});
  }
  function claimMirrorCopy() {
    if (!mirrorMatch || currentMatchOptions.lab) return null;
    const index = game.currentPlayerIndex;
    const player = game.players[index];
    if (!player || player.eliminated) return null;
    const request = { playerId: stablePlayerId(player, index), playerIndex: index, activeRoster: activeMirrorRoster() };
    try {
      if (!mirrorMatch.peek(request)) return null;
      return mirrorMatch.claim(request);
    } catch (error) {
      console.error('Mirror Match claim failed', error);
      return null;
    }
  }
  function mirrorLaunch(claim, vx, vy, seed) {
    if (!claim) return { vx, vy, seed, claim: null };
    return { vx: Number(claim.launch.vector.x), vy: Number(claim.launch.vector.y), seed: claim.launch.seed, claim };
  }
  function syncMirrorRoster() {
    try { if (mirrorMatch) mirrorMatch.syncRoster(activeMirrorRoster()); }
    catch (error) { console.error('Mirror Match roster sync failed', error); }
  }
  const RESULT_MS = 1500;
  // Worst grounded tilt (rad) a MAKE must have survived to count as a Great
  // Save. FALLEN_ANGLE in physics.js is 1.20 — beyond ~1.0 the bottle is deep
  // in the teeter zone and almost never recovers, so this fires roughly
  // once-in-a-thousand flips: exactly the freak comeback worth celebrating.
  const GREAT_SAVE_TILT = 1.0;

  function clearTimers() { clearTimeout(aiTimer); clearTimeout(elimTimer); clearTimeout(gameOverTimer); }

  function landingMeta(landingInfo = null) {
    if (activeMirrorClaim?.policy?.baseVerdictOnly &&
        activeMirrorClaim.policy.copyRewards === false &&
        activeMirrorClaim.policy.copySideEffects === false) {
      return {
        perfect: !!(landingInfo && landingInfo.perfect),
        onCap: false,
        golden: false,
        plinko: null,
        rareEvent: null,
        eventId: null,
        eventReward: null,
      };
    }
    if (activeArenaPhysicsId) {
      return {
        perfect: !!(landingInfo && landingInfo.perfect),
        onCap: !!(landingInfo && (landingInfo.onCap || landingInfo.reason === 'cap')),
        golden: false,
        plinko: null,
        rareEvent: null,
        eventId: null,
        eventReward: null,
      };
    }
    const eventResult = (Physics.getEventResultMetadata && Physics.getEventResultMetadata()) || {};
    const eventReward = eventResult.eventReward && typeof eventResult.eventReward === 'object'
      ? eventResult.eventReward : {};
    return Object.assign({}, eventResult, {
      perfect: !!(landingInfo && landingInfo.perfect),
      onCap:   !!(landingInfo && (landingInfo.onCap || landingInfo.reason === 'cap')),
      golden:  goldenFlipActive,
      plinko:  eventResult.plinko || eventResult.prize || (landingInfo && landingInfo.plinko) || null,
      rareEvent: rareEventActive,
      eventId: canonicalEventId(),
      landedCount: eventResult.landedCount ?? eventReward.landedCount,
      rouletteMultiplier: eventResult.rouletteMultiplier || eventResult.multiplier || eventReward.multiplier,
      rouletteSlot: eventResult.rouletteSlot ?? eventReward.slotIndex,
      automaticOutcome: eventResult.automaticOutcome,
      eventReward,
    });
  }

  function canonicalEventId() {
    if (activeArenaPhysicsId && rareEventActive === activeArenaPhysicsId) return null;
    if (plinkoFlipActive) return 'plinko';
    // v110 called this event rainbow-trail; v111's durable id is frozen as
    // rainbow-corkscrew. The alias affects observer data only.
    return rareEventActive === 'rainbow-trail' ? 'rainbow-corkscrew' : rareEventActive;
  }

  function resolveGameFlip(result, landingInfo) {
    const meta = landingMeta(landingInfo);
    bridgeLandingInfo = landingInfo || null;
    if (currentMatchOptions.tour && journeyHost) {
      const pose = result === 'MAKE' ? (meta.onCap ? 'cap' : 'upright') : 'miss';
      try {
        journeyHost.resolveTourLanding({ phase: 'resolved', result, pose });
      } catch (error) { console.warn('Tour landing was not accepted', error); }
      return;
    }
    const handled = v111Bridge('resolveFlip', {
      game,
      result,
      meta,
      landing: landingInfo || null,
      eventId: canonicalEventId(),
      online: false,
      forced: testDataFlipActive,
      testData: matchTestDataActive,
    }, false);
    if (handled) return;
    if (meta.plinko && game.resolvePlinko) game.resolvePlinko(meta.plinko);
    else game.resolveFlip(result, meta);
  }

  function advanceGameTurn() {
    const handled = v111Bridge('advanceTurn', { game, online: false }, false);
    if (!handled) game.advanceTurn();
  }

  function predictedCpuEvent(seed) {
    if (currentMatchOptions.eventsDisabled) return null;
    if ((currentMatchOptions.lab || currentMatchOptions.tour) && currentMatchOptions.labEventId) {
      return String(currentMatchOptions.labEventId);
    }
    if (currentMatchOptions.arenaProfile?.physicsProfileId) {
      return String(currentMatchOptions.arenaProfile.physicsProfileId);
    }
    const excludedEventIds = Array.isArray(currentMatchOptions.excludedEventIds)
      ? currentMatchOptions.excludedEventIds.map((id) => String(id)) : [];
    if (game.insanity && Physics.insanityEventForSeed) {
      return Physics.insanityEventForSeed(seed, excludedEventIds);
    }
    if (!Physics.rareEventForSeed) return null;
    const eventMultiplier = isMrHoweName(game.currentPlayer()?.name) ? 10 : 1;
    return Physics.rareEventForSeed(seed, false, eventMultiplier, excludedEventIds);
  }

  // CPU intent is selected before release from the same deterministic seed
  // that places Alien's tractor ring and later drives applyFlick. This keeps
  // native Alien and a preselected Alien Invasion on the identical physical
  // bank-and-ring challenge, without peeking at (or forcing) a verdict.
  function aiFlick() {
    if (game.state !== GAME_STATES.TURN_START && game.state !== GAME_STATES.ON_FIRE) return;
    const cpu = window.FlipgameV112Cpu;
    if (!cpu || typeof cpu.createLaunch !== 'function') {
      throw new Error('FlipgameV112Cpu must load before a CPU turn');
    }
    const seed = turnArenaSeed();
    const skin = game.currentPlayer()?.skin || BASE_SKIN;
    const profile = (window.Skins && Skins.physicsFor && Skins.physicsFor(skin)) || {};
    const eventId = predictedCpuEvent(seed);
    const alien = !!profile.floorResolve || eventId === 'alien-invasion';
    const target = alien && Physics.alienTargetForSeed
      ? Physics.alienTargetForSeed(seed) : null;
    const view = Physics.getViewHint ? Physics.getViewHint() : null;
    const intent = cpu.createLaunch({
      seed,
      difficulty: game.difficulty,
      physicsModeId: alien ? 'alien' : 'normal',
      target,
      arena: {
        worldW: target?.worldW || view?.worldW || window.innerWidth,
        viewW: target?.viewW || window.innerWidth,
        viewH: target?.viewH || window.innerHeight,
      },
    });
    onFlick(intent.vx, intent.vy, {
      seed: intent.seed,
      inputFeelMode: intent.inputFeelMode,
      source: 'cpu',
    });
  }

  function cpuLaunchPolicy(value) {
    if (!value || typeof value !== 'object' || value.source !== 'cpu') return null;
    return {
      seed: Number(value.seed) >>> 0,
      // Keep difficulty independent from the human accessibility/input choice.
      inputFeelMode: 'standard',
    };
  }

  // Deterministic turn seed from the local turn counter and seat.
  function turnArenaSeed() {
    const tc = game.turnCounter | 0;
    const pi = game.currentPlayerIndex | 0;
    return ((tc * 0x9E3779B1) ^ ((pi + 1) * 0x85EBCA6B) ^ 0xC2B2AE35) >>> 0;
  }

  function prepareTurnArena() {
    if (Physics.seedTurn) Physics.seedTurn(turnArenaSeed());
  }

  function startGame(defs, dir, opts) {
    const prepared = v111Bridge('prepareMatch', {
      defs,
      direction: dir,
      options: opts || {},
      online: false,
    }, null);
    if (prepared) {
      if (Array.isArray(prepared.defs)) defs = prepared.defs;
      if (prepared.direction === 1 || prepared.direction === -1) dir = prepared.direction;
      if (prepared.options && typeof prepared.options === 'object') opts = prepared.options;
    }
    currentMatchOptions = Object.assign({}, opts || {});
    gameScreen.classList.toggle('practice-active', !!currentMatchOptions.practice);
    currentMatchDefs = defs.map((definition) => ({ ...definition }));
    const cupContinuation = currentMatchOptions.format === 'cup' &&
      currentMatchOptions.cupState?.phase === 'between-heats' && matchTelemetry;
    if (!cupContinuation) {
      matchTestDataActive = !!(currentMatchOptions.testData || currentMatchOptions.lab || currentMatchOptions.forced);
    } else if (currentMatchOptions.testData || currentMatchOptions.forced) {
      matchTestDataActive = true;
    }
    currentMatchOptions.testData = matchTestDataActive;
    if (!cupContinuation) {
      currentMatchStartedAt = Number(currentMatchOptions.resumeMatchStartedAt) || Date.now();
      currentMatchId = currentMatchOptions.resumeMatchId || `match-${currentMatchStartedAt.toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
      matchTelemetry = { totalFlips: 0, eventCounts: {}, roundSummaries: [], scorerIds: [], frameMs: 0, frames: 0, slowFrames: 0 };
    }
    const mirrorApi = window.FlipgameV111MirrorMatch;
    if (mirrorApi) {
      const roster = defs.map((definition, index) => ({
        playerId: String(definition.id || definition.netId || `seat-${index + 1}`),
        playerIndex: index,
        active: true,
      }));
      try {
        if (currentMatchOptions.mirrorSnapshot) {
          mirrorMatch = mirrorApi.restore(currentMatchOptions.mirrorSnapshot, { matchId: currentMatchId, activeRoster: roster });
        } else if (!cupContinuation || !mirrorMatch) {
          mirrorMatch = mirrorApi.create({ matchId: currentMatchId, activeRoster: roster });
        }
      } catch (error) {
        mirrorMatch = null;
        console.error('Mirror Match restore failed', error);
      }
    }
    activeMirrorClaim = null;
    delete currentMatchOptions.mirrorSnapshot;
    delete currentMatchOptions.resumeMatchId;
    delete currentMatchOptions.resumeMatchStartedAt;
    clearTimers();
    Sound.setSuddenDeath(false);
    passScreen.classList.add('hidden');
    Renderer.init(canvas);
    Renderer.setReduceMotion(reduceMotionActive());
    if (window.Skins) Skins.preload(defs.map((definition) => ({
      id: definition.skin || BASE_SKIN,
      color: definition.color,
    })));
    resize();   // sets DPR transform + renderer logical dims (must run after init)
    const labViewport = opts?.lab && opts.viewportPreset;
    const physicsWidth = Number(labViewport?.width) || window.innerWidth;
    const physicsHeight = Number(labViewport?.height) || window.innerHeight;
    const physicsInset = Math.min(150, Math.max(92, Math.round(physicsHeight * 0.18)));
    Physics.init(physicsWidth, physicsHeight, physicsInset);  // logical coords
    const feel = (opts && opts.feel) || chosenFeel();
    if (Physics.setFeel) Physics.setFeel(feel);
    Settings.setFeel(feel);
    if (Physics.setImpactCallback) {
      let lastWallT = 0;
      Physics.setImpactCallback((type, speed, x, y) => {
        if (type === 'ground') {
          Sound.play('thud');
          if (Renderer.burst) Renderer.burst(x, y, '#c4a484', 8);
          if (Renderer.nudge) Renderer.nudge(Math.min(5, 1.5 + speed * 0.15));
          return;
        }
        // Caroms can fire many collisions per bounce — throttle the juice.
        const now = performance.now();
        if (now - lastWallT < 80) return;
        lastWallT = now;
        Sound.play('wall');
        if (Renderer.burst) Renderer.burst(x, y, '#9ec9ff', 10);
        if (Renderer.nudge) Renderer.nudge(Math.min(4, 1.2 + speed * 0.1));
      });
    }

    if (practiceMeterEl) {
      practiceMeterEl.classList.toggle('hidden', !(opts && opts.practice));
      practiceMeterEl.classList.remove('pm-bank');
      // Reset markers until the first drag/flick.
      const pm = document.getElementById('pm-power-marker');
      const sm = document.getElementById('pm-side-marker');
      if (pm) pm.style.left = '50%';
      if (sm) sm.style.left = '50%';
    }

    game.on(GAME_STATES.TURN_START, onTurnStart);
    game.on(GAME_STATES.RESULT,     onResult);
    game.on(GAME_STATES.ON_FIRE,    onOnFire);
    game.on(GAME_STATES.ELIMINATED, onEliminated);
    game.on(GAME_STATES.GAME_OVER,  onGameOver);

    game.init(defs, dir, opts || {});
    if (game.format === 'cup' && Array.isArray(currentMatchOptions.persistentMagnetPlayerIndexes)) {
      currentMatchOptions.persistentMagnetPlayerIndexes.forEach((index) => {
        if (game.players[index]) game.players[index].alwaysMagnet = true;
      });
    }
    if (modeBadgeEl) modeBadgeEl.textContent = game.insanity ? '🤯 INSANE MODE' : '';
    document.body.classList.remove('life-drain-active');
    game.feel = feel;
    gameStarted = true;
    gameStats = {
      topStake: 0, longestFire: 0, sawSuddenDeath: false, ignitionsThisGame: 0,
      perPlayer: game.players.map(() => ({ makes: 0, flips: 0, bestStreak: 0, lowestLives: Infinity })),
    };
    if (opts && opts.newMatch) matchWins = defs.map(() => 0);   // fresh series
    startPrivateSession(defs, Object.assign({
      format: game.format || currentMatchOptions.format || chosenFormat(),
      cupLength: currentMatchOptions.cupLength || chosenCupLength(),
      startingLives: game.startingLives || currentMatchOptions.startingLives,
      insanity: !!(game.insanity || currentMatchOptions.insanity),
      visualArenaId: currentMatchOptions.visualArenaId || visualArenaId,
    }, opts || {}));
    v111Bridge('matchStarted', { game, options: opts || {}, online: false }, null);

    if (loopId) cancelAnimationFrame(loopId);
    lastTime = performance.now();
    loop(lastTime);
  }

  // Playback speed: ordinary AI turns run fast, and once every human is out
  // we blitz to the end. Events and ON FIRE stay at 1× so a heater or a
  // power-up is actually visible instead of a 4× smear.
  function gameSpeed() {
    if (game.practice) return 1;
    const humansLeft = game.players.some(p => !p.eliminated && !p.isAI);
    if (!humansLeft) return 25;
    const cur = game.currentPlayer();
    if (cur && cur.isAI) {
      if (rareEventActive || plinkoFlipActive || cur.isOnFire) return 1;
      return 4;
    }
    return 1;
  }

  function syncSuddenDeathAudio() {
    const active = gameStarted &&
      !game.practice &&
      game.state !== GAME_STATES.GAME_OVER &&
      (game.sdLevelForNextFlip ? game.sdLevelForNextFlip() > 0 : game.inSuddenDeath());
    Sound.setSuddenDeath(active, game.sdLevelForNextFlip ? game.sdLevelForNextFlip() : game.sdLevel());
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
    if (matchTelemetry) {
      matchTelemetry.frameMs += dt * 1000;
      matchTelemetry.frames++;
      if (dt > 0.025) matchTelemetry.slowFrames++;
    }
    if (flipTelemetry) {
      flipTelemetry.frameMs += dt * 1000;
      flipTelemetry.frames++;
      if (dt > 0.025) flipTelemetry.slowFrames++;
    }

    // "Time stands still": slow the bottle's FLIGHT during a make-or-break flip.
    // Only while airborne — once it nears the table we resume normal speed so the
    // settle/landing detection (frame-based) is unaffected.
    const speed = gameSpeed();
    let stepDt = dt * (currentMatchOptions.lab && currentMatchOptions.slowMotion ? 0.25 : 1);
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
      if (currentMatchOptions.lab && evaluating) captureLabTrajectoryPoint();
      if (evaluating) {
        const result = Physics.checkLanding();
        if (result) {
          evaluating = false;
          showGlow   = result === 'MAKE';
          const landingInfo = Physics.getLastLandingInfo();
          resolveGameFlip(result, landingInfo);
          break;
        }
      }
    }

    // Practice trainer: live needle while dragging (before the flick fires).
    if (game.practice && !evaluating &&
        (game.state === GAME_STATES.TURN_START || game.state === GAME_STATES.ON_FIRE)) {
      const live = practiceMeterFromDrag(Input.getDragState && Input.getDragState());
      if (live) updatePracticeMeter(live, true);
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
        advanceGameTurn();
      }
    }

    const activePlayer = game.currentPlayer();
    const activeName = activePlayer && activePlayer.name;
    const eventRenderState = Physics.getEventRenderState
      ? Physics.getEventRenderState(reduceMotionActive()) : null;
    const landingLifecycle = Physics.getLandingLifecycle ? Physics.getLandingLifecycle() : null;
    const lastFlickInfo = Physics.getLastFlickInfo ? Physics.getLastFlickInfo() : null;
    const globeFocus = game.state === GAME_STATES.RESULT && easterPresentation && easterGlobeFocus &&
      window.FlipgameV112GlobeLive && typeof window.FlipgameV112GlobeLive.focusView === 'function'
      ? window.FlipgameV112GlobeLive.focusView({ orientation: easterGlobeFocus.orientation,
        seed: easterGlobeFocus.seed, elapsedMs: RESULT_MS - resultTimer,
        durationMs: easterGlobeFocus.durationMs, reducedMotion: reduceMotionActive() })
      : null;
    if (eventStatusEl) {
      const label = eventRenderState && eventRenderState.metadata && eventRenderState.metadata.displayName;
      eventStatusEl.textContent = label ? `${label} active` : '';
    }
    Renderer.frame(dt, {
      bottle:      Physics.getBottle(),
      liquid:      Physics.getLiquid(),
      groundY:     Physics.getGroundY(),
      drag:        Input.getDragState(),
      result:      game.state === GAME_STATES.RESULT ? game.lastResult : null,
      resultAlpha,
      easterPresentation: game.state === GAME_STATES.RESULT ? easterPresentation : null,
      easterElapsedMs: RESULT_MS - resultTimer,
      globeSurface: globeFocus && globeFocus.globeSurface,
      globeRequest: globeFocus && globeFocus.globeRequest,
      specialLabel: game.state === GAME_STATES.RESULT
        ? (game.plinkoPrize ? (game.plinkoPrize === 'win' ? '🎰 AUTO WIN!'
          : game.plinkoPrize === 'lose' ? '🎰 AUTO LOSS!'
          : game.plinkoPrize === 'magnet' ? '🎰 ALWAYS MAGNET!' : '🎰 PLINKO!')
          : (rareEventActive === 'double-flip' || rareEventActive === 'life-drain')
            ? rareEventLabel(rareEventActive)
          : capLandActive ? '🙃 CAP LAND! ×2'
          : goldenShowActive ? '🌟 GOLDEN FLIP! ×2'
          : greatSaveActive ? '🧤 THE GREAT SAVE!'
          : rareEventActive ? rareEventLabel(rareEventActive)
          : null)
        : null,
      showGlow,
      isOnFire:    !!(game.onFirePlayer),
      // Ninja/rainbow work by re-baking the sprite in a different color (the
      // old ctx.filter approach silently no-ops on older iOS Safari).
      liquidColor: goldenFlipActive ? GOLDEN_COLOR
        : isNinjaName(activeName) ? '#2a2633'
        : isRainbowName(activeName) ? rainbowColor()
        : activePlayer && activePlayer.color,
      golden:      goldenFlipActive,
      moon:        moonFlipActive,
      ghostly:     isGhostName(activeName),
      ninja:       isNinjaName(activeName),
      rainbow:     isRainbowName(activeName),
      sizeFx:      isTinyName(activeName) ? 0.68
                   : isGiantName(activeName) ? 1.28 : 1,
      party:       konamiParty || game.players.some((pl) => isPartyName(pl.name)),
      plinkoBoard: Physics.getPlinko ? Physics.getPlinko() : null,
      plinkoSnapshot: Physics.getPlinkoSnapshot ? Physics.getPlinkoSnapshot() : null,
      rareEvent:   rareEventActive,
      eventRenderState,
      landingLifecycle,
      // The renderer derives paint-only motion phases from this trajectory-bound
      // seed. It never draws a replacement seed or feeds anything back to rules.
      flipSeed: lastFlickInfo && lastFlickInfo.seed,
      eventBodies: Physics.getEventBodies ? Physics.getEventBodies() : [],
      alwaysMagnet: !!(activePlayer && activePlayer.alwaysMagnet),
      skin:        activePlayer && activePlayer.skin,
      variantId:   currentMatchDefs[game.currentPlayerIndex]?.variantId || flavorIdForColor(activePlayer?.color),
      cosmeticId:  currentMatchDefs[game.currentPlayerIndex]?.cosmeticId || null,
      visualArenaId: currentMatchOptions.visualArenaId || null,
      playerName:  activeName || 'Player',
      successfulShotGhost: currentMatchOptions.lab && currentMatchOptions.showSuccessfulGhost ? labLastSuccessful : null,
      intense:     intenseTurn,
      suddenDeath: game.sdLevelForNextFlip ? game.sdLevelForNextFlip() > 0 : game.inSuddenDeath(),
      awaitingFlick: game.state === GAME_STATES.TURN_START || game.state === GAME_STATES.ON_FIRE,
      stake:       game.pointCount,
      // Both null unless the active edition runs a bounce profile.
      target:      Physics.getTarget ? Physics.getTarget() : null,
      obstacles:   Physics.getObstacles ? Physics.getObstacles() : null,
      view:        Physics.getViewHint ? Physics.getViewHint() : null,
    });
  }

  // ── State callbacks ────────────────────────────────────────────────────────
  function currentIsBankShot() {
    const skin = game.currentPlayer()?.skin || BASE_SKIN;
    const bank = window.Skins && Skins.physicsFor && Skins.physicsFor(skin);
    return !!(bank && bank.floorResolve);
  }

  function updateFlipHint() {
    if (!flipHintEl) return;
    flipHintEl.textContent = currentIsBankShot()
      ? 'Flick sideways — bank once, then fly through the tractor ring!'
      : 'Flick up to flip!';
  }

  // First time an alien/bank-shot seat comes up, teach the mode once.
  const ALIEN_HINT_KEY = 'flipgame.alienHintSeen';
  function maybeTeachBankShot() {
    if (!currentIsBankShot()) return;
    let seen = false;
    try { seen = localStorage.getItem(ALIEN_HINT_KEY) === '1'; } catch (_) {}
    if (seen) return;
    try { localStorage.setItem(ALIEN_HINT_KEY, '1'); } catch (_) {}
    showToast('👽 Zero-G bank shot! Hit a wall or obstacle, then fly through the tractor ring.');
  }

  function nearMissLabel(landing) {
    if (!landing || landing.result === 'MAKE') return null;
    // Alien bank shot: just outside the floating ring.
    if (landing.padOffset != null && landing.padOffset < 1.35) return 'Almost through the tractor ring!';
    // Normal flip: tipped just past the make cone (not a flat under-rotate).
    if (landing.reason === 'underrotated') return null;
    if (landing.tilt != null && landing.tilt < 0.95 &&
        (landing.reason === 'leaning' || landing.reason === 'fallen')) {
      return 'So close!';
    }
    return null;
  }

  // Arm a human's turn after any pass-device handoff.
  function armHumanTurn() {
    passScreen.classList.add('hidden');
    updateFlipHint();
    maybeTeachBankShot();
    flipHintEl.classList.remove('hidden');
    if (intenseTurn) Sound.play('tension');
    Input.enable();
  }

  // Big flavor-colored "PASS TO {name}" handoff card (a deferred-input gate).
  function showPassGate(p) {
    passNameEl.textContent = p.name;
    passNameEl.style.color = p.color;
    passCardEl.style.borderColor = p.color;
    passScreen.classList.remove('hidden');
  }

  function resetFlipPresentation() {
    greatSaveActive = false;
    capLandActive = false;
    goldenFlipActive = false;
    goldenShowActive = false;
    moonFlipActive = false;
    plinkoFlipActive = false;
    rareEventActive = null;
    activeArenaPhysicsId = null;
    lastFlickPower = null;
    testDataFlipActive = false;
    bridgeLandingInfo = null;
  }

  function onTurnStart() {
    evaluating  = false;
    showGlow    = false;
    resultAlpha = 0;
    intenseTurn = false;
    resetFlipPresentation();
    if (Physics.setPlinkoEnabled) Physics.setPlinkoEnabled(true);
    clearTimeout(aiTimer);
    passScreen.classList.add('hidden');
    applyTurnPhysics();
    Physics.resetBottle();
    prepareTurnArena();
    updateFlipHint();
    flipHintEl.classList.remove('hidden');

    const p = game.currentPlayer();
    streakBannerEl.textContent = '';
    streakBannerEl.className = 'streak-banner';

    if (game.practice) {
      turnBannerEl.textContent = '🎯 Practice';
      pointCountEl.textContent = '';
      maybeTeachBankShot();
      configurePracticeMeter();
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
    // it's obvious whose turn it is). Defers input and the tension
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
    resetFlipPresentation();
    clearTimeout(aiTimer);
    passScreen.classList.add('hidden');
    applyTurnPhysics();
    Physics.resetBottle();
    prepareTurnArena();
    updateFlipHint();
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
    }
    updateHUD();
  }

  // Edition unlocks + achievements only count when a human is in the lobby.
  // Kids were farming AI-vs-AI blitz games to unlock the whole ladder.
  function progressCounts() {
    return !game.practice && !matchTestDataActive && game.players.some((p) => !p.isAI);
  }

  function viewportRecord() {
    const preset = currentMatchOptions.lab && currentMatchOptions.viewportPreset;
    const width = Math.max(0, Math.round(Number(preset?.width) || window.innerWidth || 0));
    const height = Math.max(0, Math.round(Number(preset?.height) || window.innerHeight || 0));
    const short = Math.min(width, height);
    const long = Math.max(width, height);
    const bucket = short <= 480 ? 'compact' : long >= 3000 ? '4k' : long >= 1920 ? 'large' :
      long >= 1200 ? 'desktop' : 'tablet';
    return { width, height, bucket, orientation: width >= height ? 'landscape' : 'portrait' };
  }

  function performanceRecord(telemetry) {
    const frames = Math.max(0, Number(telemetry?.frames) || 0);
    const average = frames ? Number(telemetry.frameMs || 0) / frames : 0;
    const fps = average ? 1000 / average : 0;
    const slowRate = frames ? Number(telemetry.slowFrames || 0) / frames : 0;
    return {
      fpsBucket: !fps ? 'unobserved' : fps >= 55 ? '55+' : fps >= 40 ? '40–54' : fps >= 25 ? '25–39' : '<25',
      frameTimeBucket: !average ? 'unobserved' : average <= 18 ? '≤18ms' : average <= 25 ? '19–25ms' : average <= 40 ? '26–40ms' : '>40ms',
      slowFrameRateBucket: !frames ? 'unobserved' : slowRate < 0.01 ? '<1%' : slowRate < 0.05 ? '1–4%' : slowRate < 0.15 ? '5–14%' : '15%+',
    };
  }

  function playerTeamId(index, modeState) {
    if (!Array.isArray(modeState?.teams)) return null;
    const teamIndex = modeState.teams.findIndex((team) => Array.isArray(team) && team.includes(index));
    return teamIndex < 0 ? null : String(modeState.teamNames?.[teamIndex] || `team-${teamIndex + 1}`);
  }

  function beginFlipTelemetry() {
    const playerIndex = game.currentPlayerIndex;
    const player = game.players[playerIndex];
    flipTelemetry = {
      startedAt: Date.now(), playerIndex,
      livesBefore: Number(player?.lives) || 0,
      stakeBefore: Number(game.pointCount) || 0,
      streakBefore: Number(player?.streak) || 0,
      onFireBefore: !!player?.isOnFire,
      suddenDeathBefore: !!(game.inSuddenDeath && game.inSuddenDeath()),
      frameMs: 0, frames: 0, slowFrames: 0,
    };
    return flipTelemetry;
  }

  function flipStatsRecord(landing, flick) {
    const lifecycle = Physics.getLandingLifecycle ? Physics.getLandingLifecycle() : {};
    const localEventResult = Physics.getEventResultMetadata ? (Physics.getEventResultMetadata() || {}) : {};
    const eventResult = landing?.eventReward ? {
      eventId: landing.eventId || canonicalEventId(),
      eventReward: landing.eventReward,
      meta: landing.meta || {},
      automaticOutcome: landing.automaticOutcome || null,
    } : localEventResult;
    const eventMeta = Physics.getEventMetadata ? (Physics.getEventMetadata() || {}) : {};
    const modeState = v111Runtime?.modes?.snapshot({ game, online: false }) || {};
    const index = flipTelemetry?.playerIndex ?? game.currentPlayerIndex;
    const player = game.players[index] || game.currentPlayer();
    const definition = currentMatchDefs[index] || {};
    const eventId = canonicalEventId();
    const firstContactMs = lifecycle.firstContactMs ?? landing?.firstContactMs ?? null;
    const settleMs = landing?.settleMs ?? lifecycle.settleMs ?? null;
    const measuredFlightMs = flipTelemetry?.startedAt == null ? null : Math.max(0, Date.now() - flipTelemetry.startedAt);
    const flightMs = firstContactMs != null && settleMs != null
      ? Math.max(0, Number(firstContactMs) + Number(settleMs)) : measuredFlightMs;
    const record = {
      releaseVersion: v111Runtime?.releaseVersion || 'v1.15',
      matchId: currentMatchId,
      heat: Number(modeState.heatNumber ?? modeState.heatIndex ?? 0) || null,
      round: Number(modeState.roundNumber ?? modeState.tiebreakRound ?? 0) || null,
      turn: Number(game.turnCounter) || 0,
      playerCount: game.players.length,
      playerId: definition.id || player?.netId || `seat-${index + 1}`,
      displayName: player?.name || 'Player',
      playerIndex: index,
      seat: index,
      isAI: !!player?.isAI,
      teamId: playerTeamId(index, modeState),
      mode: currentMatchOptions.lab ? 'physics-lab' : game.practice ? 'practice' : game.format,
      objectId: definition.skin || player?.skin || BASE_SKIN,
      variantId: definition.variantId || flavorIdForColor(player?.color),
      cosmeticId: definition.cosmeticId || null,
      arenaId: currentMatchOptions.visualArenaId || currentMatchOptions.arenaProfileId || modeState.arenaProfileId || null,
      viewport: viewportRecord(),
      oddsProfile: testDataFlipActive ? 'forced-test' : game.insanity ? 'insane' :
        Number(flick?.rareMultiplier) === 10 ? 'qa-multiplier' : 'normal',
      eventSeed: flick?.seed ?? null,
      trajectorySeed: flick?.seed ?? null,
      result: game.lastResult,
      eventId,
      eventSuccess: eventId ? game.lastResult === 'MAKE' : null,
      landingReason: landing?.reason || lifecycle.reason || null,
      pose: landing?.onCap || lifecycle.onCap ? 'cap' : game.lastResult === 'MAKE' ? 'upright' : 'other',
      perfect: !!(landing?.perfect || lifecycle.perfect),
      cap: !!(landing?.onCap || lifecycle.onCap),
      power: flick?.upSpeed ?? null,
      direction: flick?.vx == null ? null : flick.vx < 0 ? -1 : 1,
      rotations: landing?.rotations ?? lifecycle.rotations ?? null,
      contacts: landing?.contacts ?? lifecycle.contacts ?? 0,
      bounces: landing?.bounces ?? lifecycle.bounces ?? 0,
      banks: landing?.bankHits ?? lifecycle.banks ?? 0,
      flightMs,
      firstContactMs,
      settleMs,
      tilt: landing?.tilt ?? lifecycle.tilt ?? null,
      stakeBefore: flipTelemetry?.stakeBefore ?? null,
      stakeAfter: Number(game.pointCount) || 0,
      livesBefore: flipTelemetry?.livesBefore ?? null,
      livesAfter: Number(player?.lives) || 0,
      streakBefore: flipTelemetry?.streakBefore ?? null,
      streakAfter: Number(player?.streak) || 0,
      onFireBefore: !!flipTelemetry?.onFireBefore,
      onFireAfter: !!player?.isOnFire,
      suddenDeathBefore: !!flipTelemetry?.suddenDeathBefore,
      suddenDeathAfter: !!(game.inSuddenDeath && game.inSuddenDeath()),
      appliedReward: eventResult.eventReward || eventResult.reward || null,
      appliedEffect: modeState.lastAction?.effects || eventResult.appliedEffect || eventMeta.physicsKind || null,
      performance: performanceRecord(flipTelemetry),
      online: false,
      practice: !!game.practice,
      lab: !!currentMatchOptions.lab,
      forced: !!testDataFlipActive,
      testData: !!matchTestDataActive,
    };
    if (matchTelemetry) {
      matchTelemetry.totalFlips++;
      if (eventId) matchTelemetry.eventCounts[eventId] = (matchTelemetry.eventCounts[eventId] || 0) + 1;
      if (modeState.highlight?.kind === 'team-round') matchTelemetry.roundSummaries.push(detached(modeState.highlight));
      if (Number(modeState.lastAction?.rawPoints) > 0 && !matchTelemetry.scorerIds.includes(record.playerId)) matchTelemetry.scorerIds.push(record.playerId);
    }
    flipTelemetry = null;
    return record;
  }

  function resolveMirrorMatch(landing, flick) {
    if (!mirrorMatch || !flick || currentMatchOptions.lab) { activeMirrorClaim = null; return; }
    const index = game.currentPlayerIndex;
    const player = game.players[index];
    const identity = { playerId: stablePlayerId(player, index), playerIndex: index, activeRoster: activeMirrorRoster() };
    if (activeMirrorClaim) {
      try {
        mirrorMatch.consume(Object.assign({}, identity, {
          verdict: {
            phase: 'resolved',
            result: game.lastResult,
            reason: landing?.reason || null,
            onCap: !!(landing && (landing.onCap || landing.reason === 'cap')),
          },
        }));
      } catch (error) {
        console.error('Mirror Match consume failed', error);
      }
      if (Physics.setProfile) Physics.setProfile(physicsProfileForPlayer(index));
      activeMirrorClaim = null;
      return;
    }
    if (canonicalEventId() !== 'mirror-match') return;
    try {
      const status = mirrorMatch.snapshot()?.status;
      const roster = activeLaunchRoster || activeMirrorRoster();
      if (status === 'armed' || roster.filter((entry) => entry.active !== false && !entry.eliminated).length < 2) return;
      mirrorMatch.arm({
        source: { playerId: stablePlayerId(player, index), playerIndex: index },
        activeRoster: roster,
        launch: {
          vector: { x: Number(activeLaunchInput?.vx), y: Number(activeLaunchInput?.vy) },
          spin: Number(flick.spin),
          seed: flick.seed,
        },
        profile: detached(activeLaunchProfile || physicsProfileForPlayer(index)),
      });
    } catch (error) {
      console.error('Mirror Match arm failed', error);
    }
  }

  function onResult() {
    Input.disable();
    passScreen.classList.add('hidden');
    flipHintEl.classList.add('hidden');
    resultTimer = RESULT_MS;

    // Rare-event + achievement wiring (display-only, never touches the rules).
    const landing = Physics.getLastLandingInfo();
    greatSaveActive = !!(game.lastResult === 'MAKE' && landing &&
                         landing.maxTilt > GREAT_SAVE_TILT);
    capLandActive = !!(game.lastResult === 'MAKE' && (game.capLand ||
                      (landing && (landing.onCap || landing.reason === 'cap'))));
    goldenShowActive = !!(game.lastResult === 'MAKE' && game.goldenFlip);
    document.body.classList.toggle('life-drain-active', !!game.lifeDrainActive);
    // Cap land wins the special label over Great Save (mutually exclusive anyway).
    const counts = progressCounts() && !privateRewardAuthorityActive();
    const rec = counts
      ? Records.recordFlip(game, { greatSave: greatSaveActive, capLand: capLandActive }, {
          mode: currentMatchOptions.lab ? 'physics-lab' : game.practice ? 'practice' : game.format,
          format: game.format, practice: !!game.practice, lab: !!currentMatchOptions.lab,
          forced: !!testDataFlipActive, testData: !!matchTestDataActive,
          humanPlayers: game.players.filter((player) => !player.isAI).length,
          players: game.players.map((player) => ({ isAI: !!player.isAI })),
        })
      : null;
    if (capLandActive || goldenShowActive) Sound.play('capland');
    else if (greatSaveActive) Sound.play('greatsave');

    // Lifetime flip milestones on this device — tiny celebration, no effect.
    if (rec && [100, 500, 1000, 2500, 5000, 10000, 25000].includes(rec.totalFlips)) {
      showToast(`🎉 Flip #${rec.totalFlips.toLocaleString()} on this device!`);
    }

    const p = game.currentPlayer();

    if (!game.practice && gameStats) {
      const pp = gameStats.perPlayer[game.currentPlayerIndex];
      const st = p ? p.streak : 0;
      if (pp) {
        pp.flips++;
        if (game.lastResult === 'MAKE') pp.makes++;
        if (st > pp.bestStreak) pp.bestStreak = st;
        if (p) pp.lowestLives = Math.min(pp.lowestLives, p.lives);
      }
      if (game.pointCount > gameStats.topStake) gameStats.topStake = game.pointCount;
      const firePeak = Math.max(game.onFireBonus || 0, game.endedFireBonus || 0);
      if (firePeak > gameStats.longestFire) gameStats.longestFire = firePeak;
      if (game.inSuddenDeath && game.inSuddenDeath()) gameStats.sawSuddenDeath = true;
      if (game.justIgnited) gameStats.ignitionsThisGame = (gameStats.ignitionsThisGame || 0) + 1;
    }

    const flick = Physics.getLastFlickInfo ? Physics.getLastFlickInfo() : null;
    const statsRecord = flipStatsRecord(landing || bridgeLandingInfo || {}, flick);
    resolvePresentationSecret(statsRecord, flick);
    resolveMirrorMatch(landing || bridgeLandingInfo || {}, flick);
    v111Bridge('flipResolved', {
      game,
      result: game.lastResult,
      landing: landing || bridgeLandingInfo,
      flick,
      eventId: canonicalEventId(),
      online: false,
      forced: testDataFlipActive,
      testData: matchTestDataActive,
      record: statsRecord,
    }, null);

    if (currentMatchOptions.lab) {
      captureLabTrajectoryPoint(true);
      const reason = dimensionName(statsRecord.landingReason || 'unresolved');
      const readout = `${reason} · ${Number(statsRecord.rotations || 0).toFixed(2)} rotations · ${statsRecord.contacts} contacts · ${statsRecord.settleMs == null ? 'no settle time' : `${Math.round(statsRecord.settleMs)} ms settling`}`;
      if (labReadoutEl) { labReadoutEl.classList.remove('hidden'); labReadoutEl.textContent = readout; }
      const routeReadout = document.getElementById('lab-route-readout'); if (routeReadout) routeReadout.textContent = readout;
      if (game.lastResult === 'MAKE' && flick?.seed != null) {
        const body = Physics.getBottle();
        const definition = currentMatchDefs[game.currentPlayerIndex] || {};
        const modeState = v111Runtime?.modes?.snapshot({ game }) || {};
        labLastSuccessful = {
          seed: flick.seed,
          vx: Number(activeLaunchInput?.vx),
          vy: Number(activeLaunchInput?.vy),
          x: body?.position?.x,
          y: body?.position?.y,
          angle: body?.angle || 0,
          path: activeLabTrajectory.map((point) => ({ ...point })),
          objectId: definition.skin || p?.skin || BASE_SKIN,
          color: p?.color || definition.color || FLAVORS[0].color,
          variantId: definition.variantId || flavorIdForColor(p?.color),
          cosmeticId: definition.cosmeticId || null,
          forcedEventId: currentMatchOptions.labEventId || null,
          resolvedEventId: statsRecord.eventId || null,
          viewportPreset: detached(currentMatchOptions.viewportPreset || null),
          slowMotion: !!currentMatchOptions.slowMotion,
          feel: game.feel || currentMatchOptions.feel || chosenFeel(),
          arenaProfileId: currentMatchOptions.arenaProfileId || modeState.arenaProfileId || null,
          visualArenaId: currentMatchOptions.visualArenaId || null,
          result: statsRecord.result,
          perfect: !!statsRecord.perfect,
          cap: !!statsRecord.cap,
          tilt: statsRecord.tilt,
          settleMs: statsRecord.settleMs,
          quality: labShotQuality(statsRecord),
        };
        const replay = document.getElementById('lab-replay-btn');
        if (replay) replay.disabled = false;
      }
      if (typeof Achievements !== 'undefined' && !privateRewardAuthorityActive()) {
        announceAchievements(Achievements.check({
          mode: 'physics-lab',
          physicsLab: true,
          qualifying: false,
          qualifyingLabAction: true,
          humanParticipant: !p?.isAI,
          players: game.players.map((player) => ({ isAI: !!player.isAI })),
          advancedLabUsed: !!currentMatchOptions.advancedLabUsed,
          replayedSeedImproved: !!currentMatchOptions.replaying &&
            labShotQuality(statsRecord) > Number(currentMatchOptions.labReplayShot?.quality || 0),
          eventId: statsRecord.eventId,
          eventResolved: !!statsRecord.eventId,
          result: game.lastResult,
        }));
      }
    }

    // NB: achievements.js declares `const Achievements` (script scope, not on
    // window) — same gotcha as Renderer above, so feature-detect via typeof.
    if (counts && typeof Achievements !== 'undefined' && rec) {
      matchTelemetry.perfectRun = statsRecord.perfect ? (Number(matchTelemetry.perfectRun) || 0) + 1 : 0;
      if (statsRecord.cap && statsRecord.result === 'MAKE') matchTelemetry.capMakes = (Number(matchTelemetry.capMakes) || 0) + 1;
      const fresh = Achievements.check({
        qualifying: !game.practice && !currentMatchOptions.lab && !matchTestDataActive,
        humanParticipant: !p?.isAI,
        players: game.players.map((player) => ({ isAI: !!player.isAI })),
        format: game.format === 'team-clash' ? 'team' : game.format,
        result:        game.lastResult,
        eventId:       statsRecord.eventId,
        eventResolved: !!statsRecord.eventId,
        justIgnited:   game.justIgnited,
        onFireBonus:   Math.max(game.onFireBonus || 0, game.endedFireBonus || 0),
        streak:        game.practice ? game.practiceStreak : (p ? p.streak : 0),
        pointCount:    game.pointCount,
        perfect:       !!game.perfectLanding,
        power:         lastFlickPower,
        greatSave:     greatSaveActive,
        capLand:       capLandActive,
        landingReason: landing ? landing.reason : null,
        padOffset: landing && landing.padOffset != null ? landing.padOffset : null,
        bankHits: landing && landing.bankHits != null ? landing.bankHits : 0,
        totalFlipsLifetime: rec.totalFlips,
        totalMakesLifetime: rec.totalMakes,
        playerCount:   game.players.length,
        ignitionsThisGame: gameStats ? gameStats.ignitionsThisGame : 0,
        openingFlip:   Number(statsRecord.turn) <= 1,
        edgeLanding:   Number(landing?.padOffset) >= 0.75,
        rotations:     statsRecord.rotations,
        livesBefore:   statsRecord.livesBefore,
        suddenDeathBefore: statsRecord.suddenDeathBefore,
        stakeBefore:   statsRecord.stakeBefore,
        perfectPair:   Number(matchTelemetry.perfectRun) >= 2,
        capMakesThisMatch: Number(matchTelemetry.capMakes) || 0,
        reachedOnFireCap: !!p?.isOnFire && Number(p?.lives) >= Number(game.maxLives),
      });
      announceAchievements(fresh);
    }

    if (game.practice) {
      if (game.plinkoPrize === 'lose') {
        streakBannerEl.textContent = '🎰☠ Plinko automatic loss!';
        streakBannerEl.className = 'streak-banner miss-penalty';
        Sound.play('miss');
      } else if (game.lastResult === 'MAKE') {
        if (game.plinkoPrize) {
          streakBannerEl.textContent = game.plinkoPrize === 'win'
            ? '🎰👑 PLINKO AUTO WIN!'
            : game.plinkoPrize === 'magnet' ? '🎰🧲 ALWAYS MAGNET unlocked for this practice!'
            : game.plinkoPrize === 'halve' ? '🎰⚡ Plinko halves the opponents!'
            : '🎰❤️ Plinko doubles your lives!';
          streakBannerEl.className = 'streak-banner on-fire';
          Sound.play('win');
        } else if (rareEventActive === 'double-flip') {
          streakBannerEl.textContent = '🚀 Two full flips landed!';
          streakBannerEl.className = 'streak-banner on-fire';
        } else if (rareEventActive === 'life-drain') {
          streakBannerEl.textContent = '☣️ Life Drain landing!';
          streakBannerEl.className = 'streak-banner on-fire';
        } else if (capLandActive) {
          streakBannerEl.textContent = '🙃 Cap land! Worth 2!';
          streakBannerEl.className = 'streak-banner on-fire';
        } else if (goldenShowActive) {
          streakBannerEl.textContent = '🌟 Golden flip! Worth 2!';
          streakBannerEl.className = 'streak-banner on-fire';
        } else {
          streakBannerEl.textContent = game.practiceStreak > 1
            ? `${game.practiceStreak} in a row!`
            : (game.perfectLanding ? 'Perfect make!' : 'Make!');
          streakBannerEl.className = 'streak-banner on-fire';
        }
        Sound.play(capLandActive ? 'capland' : 'make');
      } else {
        const almost = nearMissLabel(landing);
        streakBannerEl.textContent = almost ? `✗ ${almost}` : '✗ Miss';
        streakBannerEl.className = 'streak-banner miss-penalty';
        Sound.play('miss');
      }
      // Verdict juice in practice too.
      const b = Physics.getBottle && Physics.getBottle();
      if (b && Renderer.burst) {
        Renderer.burst(b.position.x, b.position.y,
          game.lastResult === 'MAKE' ? '#69f0ae' : '#ff5252',
          game.lastResult === 'MAKE' ? 18 : 10,
          currentMatchDefs[game.currentPlayerIndex]?.cosmeticId || null);
      }
      if (game.lastResult === 'MAKE' && Renderer.nudge) Renderer.nudge(3);
      updateHUD();
      return;
    }

    if (game.plinkoPrize === 'lose') {
      streakBannerEl.textContent = `🎰☠ PLINKO AUTOMATIC LOSS — ${p.name} is eliminated!`;
      streakBannerEl.className = 'streak-banner miss-penalty';
      Sound.play('miss');
    } else if (game.lastResult === 'MAKE') {
      if (game.plinkoPrize) {
        // 1/1000 plinko drop — the prize IS the outcome.
        streakBannerEl.textContent =
          game.plinkoPrize === 'win' ? `🎰👑 PLINKO AUTO WIN — ${p.name} WINS THE GAME!`
          : game.plinkoPrize === 'halve' ? `🎰⚡ Plinko: every opponent's lives are halved!`
          : game.plinkoPrize === 'magnet' ? `🎰🧲 ALWAYS MAGNET — ${p.name} is magnetized for the rest of the game!`
          : `🎰❤️ Plinko: ${p.name}'s lives are doubled!`;
        streakBannerEl.className = 'streak-banner on-fire';
        Sound.play(game.plinkoPrize === 'win' ? 'win' : 'life');
      } else if (game.lifeDrainTriggered) {
        streakBannerEl.textContent = `☣️ LIFE DRAIN! Every opponent now has 1 life!`;
        streakBannerEl.className = 'streak-banner on-fire';
        Sound.play('life');
      } else if (game.doubleFlipReward) {
        streakBannerEl.textContent = `🚀 DOUBLE FLIP! ${p.name}'s lives doubled — opponents halved!`;
        streakBannerEl.className = 'streak-banner on-fire';
        Sound.play('life');
      } else if (game.rareLifeGain > 0) {
        streakBannerEl.textContent = `💗 HEART RUSH! +${game.rareLifeGain} lives!`;
        streakBannerEl.className = 'streak-banner on-fire';
        Sound.play('life');
      } else if (capLandActive) {
        // Rare upside-down / on-cap — celebrates over everything else this flip.
        const stakeBit = game.onFireGain > 0
          ? `+${game.onFireGain} life!`
          : `Miss now costs ${game.pointCount}!`;
        streakBannerEl.textContent = `🙃 CAP LAND! Worth 2 — ${stakeBit}`;
        streakBannerEl.className   = 'streak-banner on-fire';
      } else if (goldenShowActive) {
        // Rare golden flip — banked double, same celebration tier as cap land.
        const stakeBit = game.onFireGain > 0
          ? `+${game.onFireGain} life!`
          : `Miss now costs ${game.pointCount}!`;
        streakBannerEl.textContent = `🌟 GOLDEN FLIP! Worth 2 — ${stakeBit}`;
        streakBannerEl.className   = 'streak-banner on-fire';
      } else if (greatSaveActive) {
        // The freak comeback — celebrate over everything else this flip.
        streakBannerEl.textContent = '🧤 THE GREAT SAVE! It came back from the brink!';
        streakBannerEl.className   = 'streak-banner on-fire';
      } else if (game.fireCapped) {
        // Match life ceiling reached — bank the gains and pass it on.
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
      streakBannerEl.textContent = '🔥 Streak over — no penalty';
      streakBannerEl.className   = 'streak-banner on-fire';
      Sound.play('miss');
    } else {
      const n = game.lastPenalty;
      const lives = `${n} ${n === 1 ? 'life' : 'lives'}`;
      const almost = nearMissLabel(landing);
      streakBannerEl.textContent = almost ? `${almost}  −${lives}` : `−${lives}`;
      streakBannerEl.className   = 'streak-banner miss-penalty';
      Sound.play('miss');
    }

    // 11:11 (AM or PM) — land a make on the wishing minute and the banner
    // sparkles. Pure flourish.
    const wish = new Date();
    if (game.lastResult === 'MAKE' && wish.getHours() % 12 === 11 && wish.getMinutes() === 11) {
      streakBannerEl.textContent = `${streakBannerEl.textContent || 'Make!'}  11:11 ✨`;
      if (!streakBannerEl.className.includes('on-fire')) {
        streakBannerEl.className = 'streak-banner heating-up';
      }
    }

    // MAKE/MISS celebration burst at the object.
    const b = Physics.getBottle && Physics.getBottle();
    if (b && Renderer.burst) {
      Renderer.burst(b.position.x, b.position.y,
        game.lastResult === 'MAKE' ? '#69f0ae' : '#ff5252',
        game.lastResult === 'MAKE' ? 20 : 12,
        currentMatchDefs[game.currentPlayerIndex]?.cosmeticId || null);
    }
    if (game.lastResult === 'MAKE' && Renderer.nudge) Renderer.nudge(3.5);

    updateHUD();
  }

  function onEliminated() {
    passScreen.classList.add('hidden');
    const p = game.currentPlayer();
    turnBannerEl.textContent = `❌ ${p.name} is out!`;
    updateHUD();
    syncMirrorRoster();
    clearTimeout(elimTimer);
    elimTimer = setTimeout(advanceGameTurn, 1800 / gameSpeed());
  }

  // Lightweight toast queue (self-creating so it needs no markup). Used for
  // unlocks + achievements — queued so game-over don't overwrite each other.
  const toastQueue = [];
  let toastBusy = false;
  function showToast(msg) {
    toastQueue.push(msg);
    pumpToast();
  }
  function pumpToast() {
    if (toastBusy || !toastQueue.length) return;
    toastBusy = true;
    const msg = toastQueue.shift();
    let t = document.getElementById('skin-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'skin-toast';
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      t.classList.remove('show');
      toastBusy = false;
      // Brief gap so consecutive toasts are readable.
      setTimeout(pumpToast, 280);
    }, 3600);
  }

  function announceAchievements(fresh) {
    if (!fresh || !fresh.length) return;
    const names = fresh.map((a) => `${a.emoji} ${a.name}`).join(' · ');
    showToast(`🏅 Achievement${fresh.length > 1 ? 's' : ''} unlocked: ${names}`);
    Sound.play(fresh.some((a) => a.rare) ? 'greatsave' : 'life');
    renderRecordsPanel();
  }

  function renderRecordsPanel() {
    if (!recordsPanel) return;
    recordsPanel.innerHTML = Records.renderHtml() +
      (typeof Achievements !== 'undefined' ? Achievements.renderGridHtml() : '');
  }

  // The finale deserves a beat. When the game-ending flip eliminates the last
  // opponent, game.js jumps straight from RESULT to GAME_OVER and skips the
  // usual "X is out!" elimination banner — so the winner card used to slam in
  // the instant the object stopped moving. Hold on the settled scene (with the
  // elimination beat) for a moment of suspense before the reveal. Display-only.
  const GAME_OVER_HOLD_MS = 1500;
  let gameOverTimer = null;

  async function achievementLifetimeContext(currentModeState) {
    const fallback = Records.snapshot ? Records.snapshot() : {};
    const currentArena = currentMatchOptions.visualArenaId || currentMatchOptions.arenaProfileId || null;
    const objects = new Set(currentMatchDefs.map((definition) => definition.skin).filter(Boolean));
    const cosmetics = new Set(currentMatchDefs.map((definition) => definition.cosmeticId).filter(Boolean));
    const arenas = new Set(currentArena ? [currentArena] : []);
    let perfect = Number(fallback.perfectLandings) || 0;
    let caps = Number(fallback.capLands) || 0;
    let matches = Number(fallback.matches) || 0;
    let flips = Number(fallback.totalFlips) || 0;
    let cupWins = 0;
    const cupStarterPositions = new Set();
    const store = v111Runtime?.stats;
    if (!store || typeof store.query !== 'function') {
      return { objects, cosmetics, arenas, perfect, caps, matches, flips, cupWins, cupStarterPositions };
    }
    try {
      if (typeof store.flush === 'function') await store.flush();
      const raw = await store.query({ scope: 'device', includeTestData: false });
      const isCompetitive = (record) => {
        const mode = String(record?.mode || '').toLowerCase();
        return !record?.practice && !record?.lab && !record?.forced && !record?.testData &&
          mode !== 'practice' && mode !== 'physics-lab' && mode !== 'lab';
      };
      const flipRows = (Array.isArray(raw?.flips) ? raw.flips : []).filter(isCompetitive);
      const matchRows = (Array.isArray(raw?.matches) ? raw.matches : []).filter(isCompetitive);
      flipRows.forEach((record) => {
        if (record.objectId) objects.add(record.objectId);
        if (record.cosmeticId) cosmetics.add(record.cosmeticId);
        if (record.arenaId) arenas.add(record.arenaId);
      });
      perfect = flipRows.filter((record) => record.perfect).length || perfect;
      caps = flipRows.filter((record) => record.cap || record.onCap).length || caps;
      matches = matchRows.length || matches;
      flips = flipRows.length || flips;
      const matchingCupRows = matchRows.filter((record) => String(record.mode || '').toLowerCase() === 'cup');
      cupWins = matchingCupRows.length;
      matchingCupRows.forEach((record) => {
        const settings = record.startingSettings || {};
        if (Number(settings.playerCount) !== game.players.length) return;
        const heats = record.heatSummaries || record.cup?.heatResults || [];
        const opener = Number(heats[0]?.openerIndex);
        if (Number.isInteger(opener) && opener >= 0 && opener < game.players.length) cupStarterPositions.add(opener);
      });
      if (game.format === 'cup' && currentModeState?.phase === 'complete' &&
          !matchingCupRows.some((record) => String(record.matchId) === String(currentMatchId))) {
        cupWins++;
        const opener = Number(currentModeState.heatResults?.[0]?.openerIndex);
        if (Number.isInteger(opener) && opener >= 0 && opener < game.players.length) cupStarterPositions.add(opener);
      }
    } catch (error) {
      console.error('Achievement lifetime context failed', error);
    }
    return { objects, cosmetics, arenas, perfect, caps, matches, flips, cupWins, cupStarterPositions };
  }

  function onGameOver() {
    clearTimers();   // no stray advanceTurn/AI flick fires after the game ends
    Sound.setSuddenDeath(false);
    Input.disable();
    passScreen.classList.add('hidden');

    const active = game.activePlayers();
    const loser  = game.currentPlayer();
    const finalElim = !game.practice && !!(loser && loser.eliminated);
    const modeState = v111Runtime?.modes?.snapshot({ game, online: false }) || null;
    const cupBetweenHeats = game.format === 'cup' && modeState?.phase === 'between-heats';
    const cupComplete = game.format === 'cup' && modeState?.phase === 'complete';
    const teamComplete = game.format !== 'team-clash' || modeState?.phase === 'complete';
    const finalModeResult = !cupBetweenHeats && teamComplete;
    if (finalModeResult && mirrorMatch) {
      try { mirrorMatch.cleanup('match-ended'); } catch (error) { console.error('Mirror Match cleanup failed', error); }
      activeMirrorClaim = null;
    }
    if (finalElim) {
      turnBannerEl.textContent = `❌ ${loser.name} is out!`;
      Sound.play('miss');
    }
    // All-CPU blitz endings shouldn't sit through the theatrical pause.
    const humansPlayed = game.players.some((p) => !p.isAI);
    const winnerIndex = cupComplete && Number.isInteger(modeState?.seriesWinnerIndex)
      ? modeState.seriesWinnerIndex : Number.isInteger(modeState?.winningPlayerIndex)
        ? modeState.winningPlayerIndex : game.winnerIndex;
    const winner = game.players[winnerIndex] || active[0] || null;
    const winningTeamHasHuman = game.format === 'team-clash' && Number.isInteger(modeState?.winnerTeamIndex)
      ? (modeState.teams?.[modeState.winnerTeamIndex] || []).some((index) => !game.players[index]?.isAI) : false;
    const qualifyingResult = finalModeResult && !game.practice && !matchTestDataActive &&
      !!winner && (!winner.isAI || winningTeamHasHuman);
    if (finalModeResult) {
      const participantRecords = game.players.map((player, index) => {
        const stats = gameStats?.perPlayer?.[index] || {};
        const definition = currentMatchDefs[index] || {};
        return {
          playerId: definition.id || player.netId || `seat-${index + 1}`,
          displayName: player.name,
          playerIndex: index,
          seat: index,
          isAI: !!player.isAI,
          teamId: playerTeamId(index, modeState),
          objectId: definition.skin || player.skin || BASE_SKIN,
          variantId: definition.variantId || flavorIdForColor(player.color),
          cosmeticId: definition.cosmeticId || null,
          startingLives: game.startingLives,
          endingLives: player.lives,
          lives: player.lives,
          eliminated: !!player.eliminated,
          winner: index === winnerIndex,
          flips: Number(stats.flips) || 0,
          makes: Number(stats.makes) || 0,
          bestStreak: Number(stats.bestStreak) || 0,
        };
      });
      const teamRecords = Array.isArray(modeState?.teams) ? modeState.teams.map((seats, index) => ({
        teamId: String(modeState.teamNames?.[index] || `team-${index + 1}`),
        name: String(modeState.teamNames?.[index] || `Team ${index + 1}`),
        score: Number(modeState.scores?.[index]) || 0,
        playerIds: seats.map((seat) => participantRecords[seat]?.playerId).filter(Boolean),
      })) : [];
      const matchRecord = {
        releaseVersion: v111Runtime?.releaseVersion || 'v1.15',
        matchId: currentMatchId,
        startedAt: currentMatchStartedAt,
        durationMs: Math.max(0, Date.now() - currentMatchStartedAt),
        mode: currentMatchOptions.lab ? 'physics-lab' : game.practice ? 'practice' : game.format,
        online: false,
        practice: !!game.practice,
        lab: !!currentMatchOptions.lab,
        forced: !!matchTestDataActive,
        testData: !!matchTestDataActive,
        participants: participantRecords,
        players: participantRecords,
        winner: participantRecords[winnerIndex] || null,
        winnerId: participantRecords[winnerIndex]?.playerId || null,
        winnerIndex,
        winnerIds: participantRecords[winnerIndex] ? [participantRecords[winnerIndex].playerId] : [],
        winnerTeamId: Number.isInteger(modeState?.winnerTeamIndex) ? teamRecords[modeState.winnerTeamIndex]?.teamId || null : null,
        teams: teamRecords,
        heatSummaries: detached(modeState?.heatResults || []),
        roundSummaries: detached(matchTelemetry?.roundSummaries || []),
        totalFlips: Number(matchTelemetry?.totalFlips) || 0,
        eventCounts: detached(matchTelemetry?.eventCounts || {}),
        startingSettings: {
          format: game.format,
          cupLength: currentMatchOptions.cupLength || null,
          startingLives: game.startingLives,
          direction: game.direction,
          feel: game.feel,
          difficulty: game.difficulty,
          arenaId: currentMatchOptions.visualArenaId || currentMatchOptions.arenaProfileId || modeState?.arenaProfileId || null,
          playerCount: game.players.length,
        },
        completionReason: modeState?.highlight?.kind === 'team-automatic-result' ? 'automatic-result' :
          Number(modeState?.tiebreakRound) > 0 ? 'shootout' : 'completed',
        performance: performanceRecord(matchTelemetry),
        completed: true,
      };
      v111Bridge('matchResolved', {
        game,
        online: false,
        match: { stats: gameStats, seriesWins: matchWins, format: game.format, modeState },
        record: matchRecord,
      }, null);
    }
    const holdMs = (finalElim && humansPlayed ? GAME_OVER_HOLD_MS : 400) / gameSpeed();

    clearTimeout(gameOverTimer);
    gameOverTimer = setTimeout(async () => {
      gameScreen.classList.add('hidden');
      gameOverEl.classList.remove('hidden');
      const title = document.getElementById('game-over-title');
      const rotate = document.getElementById('rotate-order-btn');
      const shuffle = document.getElementById('shuffle-order-btn');
      const swap = document.getElementById('swap-teams-btn');
      const proposal = document.getElementById('next-order');
      proposedNextDefs = null;
      proposedTeamSwap = false;
      if (proposal) { proposal.classList.add('hidden'); proposal.replaceChildren(); }
      playAgainBtn.disabled = false;
      renderArenaDraft(cupBetweenHeats ? modeState?.arenaDraft : null);
      if (cupBetweenHeats) {
        title.textContent = `Heat ${Math.max(1, (modeState?.heatNumber || 2) - 1)} complete`;
        winnerNameEl.textContent = winner?.name || 'Heat complete';
        playAgainBtn.textContent = 'Next heat';
      } else if (cupComplete) {
        title.textContent = `${winner?.name || 'Player'} wins the Cup`;
        winnerNameEl.textContent = winner?.name || 'Cup winner';
        playAgainBtn.textContent = 'New Cup';
      } else if (game.format === 'team-clash') {
        const score = modeState?.scores || [0, 0];
        title.textContent = `Team ${modeState?.teamNames?.[modeState.winnerTeamIndex] || (modeState?.winnerTeamIndex + 1)} wins · ${score[0]}–${score[1]}`;
        winnerNameEl.textContent = modeState?.teamNames?.[modeState.winnerTeamIndex] || `Team ${Number(modeState?.winnerTeamIndex) + 1}`;
        playAgainBtn.textContent = 'Same Setup';
      } else {
        title.textContent = `${winner?.name || 'Player'} wins`;
        winnerNameEl.textContent = winner?.name || 'Winner';
        playAgainBtn.textContent = 'Same Setup';
      }
      rotate?.classList.toggle('hidden', game.format !== 'classic');
      shuffle?.classList.toggle('hidden', game.format !== 'classic');
      swap?.classList.toggle('hidden', game.format !== 'team-clash');
      playAgainBtn.classList.remove('hidden');
      const series = document.getElementById('cup-series');
      if (series) series.textContent = game.format === 'cup'
        ? `Heats: ${(modeState?.heatWins || []).join(' · ')}${modeState?.clutch?.active ? ` · Clutch round ${modeState.clutch.tiebreakRound}` : ''}${modeState?.queue?.length ? ` · ${modeState.queue.length} flips queued` : ''}` : '';
      // AI-only lobbies can still finish for fun, but they do not advance the
      // unlock ladder, hall-of-fame wins, or achievements.
      let winRec = null;
      if (qualifyingResult) {
        const qualification = {
          completed: true, resolved: true, won: true, format: game.format,
          practice: false, lab: false, forced: false, testData: false,
          simulated: false, aiOnly: false, online: false,
          winnerIsAI: !!winner.isAI && !winningTeamHasHuman, humanWinner: !winner.isAI || winningTeamHasHuman,
          winningTeamHasHuman, humanPlayers: game.players.filter((player) => !player.isAI).length,
          players: game.players.map((player) => ({ isAI: !!player.isAI })),
          displayName: winner.name,
          playerId: currentMatchDefs[winnerIndex]?.id || winner.netId || `seat-${winnerIndex + 1}`,
          winner: { isAI: !!winner.isAI && !winningTeamHasHuman, name: winner.name },
        };
        winRec = privateRewardAuthorityActive() ? null : Records.recordWin(qualification);
        renderRecordsPanel();
        if (winner && window.Skins) {
          const unlockedRewards = (winRec?.unlocked || []).filter((entry) =>
            entry && (entry.type === 'object' || entry.type === 'store' || entry.type === 'arena'
              || entry.type === 'feature' || entry.type === 'cosmetic'));
          const revealIds = unlockedRewards.map((entry) => entry.contentId || entry.id).filter(Boolean);
          if (revealIds.length) {
            queueMysteryReveals(revealIds);
            try { renderFrom(readRows()); } catch (_) {}
            if (pickerRow) renderCustomizeGrid();
          }
        }
      } else {
        renderRecordsPanel();
      }
      Sound.play('win');

      // Win-based achievements (display-only) — human required in the lobby.
      if (qualifyingResult && typeof Achievements !== 'undefined' && winner && gameStats && !privateRewardAuthorityActive()) {
        const wIdx = game.players.indexOf(winner);
        const pp = (gameStats.perPlayer && gameStats.perPlayer[wIdx]) || { makes: 0, flips: 0, lowestLives: Infinity };
        const heatResults = modeState?.heatResults || [];
        const otherHeatWins = (modeState?.heatWins || []).filter((_, index) => index !== wIdx);
        const winningTeam = Number.isInteger(modeState?.winnerTeamIndex) ? modeState.teams?.[modeState.winnerTeamIndex] || [] : [];
        const scorerIds = matchTelemetry?.scorerIds || [];
        playAgainBtn.disabled = true;
        const lifetime = await achievementLifetimeContext(modeState);
        announceAchievements(Achievements.check({
          qualifying: true,
          qualifyingLabAction: false,
          humanParticipant: !winner.isAI || winningTeamHasHuman,
          players: game.players.map((player) => ({ isAI: !!player.isAI })),
          format: game.format === 'team-clash' ? 'team' : game.format,
          won:              true,
          wonWithoutMiss:   pp.flips > 0 && pp.makes === pp.flips,
          droppedToOneLife: pp.lowestLives <= 1,
          sawSuddenDeath:   !!gameStats.sawSuddenDeath,
          winnerWins:       (winRec && winRec.winnerWins) || 0,
          playerCount:      game.players.length,
          ignitionsThisGame: gameStats.ignitionsThisGame || 0,
          loserHeatWins: Math.max(0, ...otherHeatWins.map(Number)),
          lostFirstHeat: game.format === 'cup' && heatResults.length > 0 && heatResults[0].winnerIndex !== wIdx,
          cupLength: currentMatchOptions.cupLength || modeState?.cupLength || null,
          allCupStarterPositionsCovered: game.format === 'cup' && lifetime.cupStarterPositions.size >= game.players.length,
          lifetimeCupWins: lifetime.cupWins,
          cancellationPoints: (matchTelemetry?.roundSummaries || []).reduce((sum, round) => sum + (Number(round.cancelled) || 0), 0),
          largestDeficit: Number(modeState?.largestDeficit) || 0,
          everyTeammateScored: game.format === 'team-clash' && winningTeam.length > 0 && winningTeam.every((seat) => scorerIds.includes(currentMatchDefs[seat]?.id || `seat-${seat + 1}`)),
          matchPointCancellation: !!modeState?.matchPointCancellation,
          everyTeammateMadeInRound: !!modeState?.everyTeammateMadeInRound,
          distinctObjectsUsed: lifetime.objects.size,
          distinctCosmeticsEquipped: lifetime.cosmetics.size,
          distinctArenasPlayed: lifetime.arenas.size,
          perfectLandingsLifetime: lifetime.perfect,
          capLandingsLifetime: lifetime.caps,
          matchesLifetime: lifetime.matches,
          totalFlipsLifetime: lifetime.flips,
        }));
        playAgainBtn.disabled = false;
      }

      // Series scoreboard: tally this game's win, then show the running totals.
      if (matchWins.length !== game.players.length) matchWins = game.players.map(() => 0);
      if (game.winnerIndex >= 0 && game.winnerIndex < matchWins.length) matchWins[game.winnerIndex]++;
      renderScoreboard();
      if (gameStatsEl) gameStatsEl.innerHTML = renderGameStats();
      requestAnimationFrame(() => title.focus({ preventScroll: true }));
    }, holdMs);
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
    const modeState = v111Runtime?.modes?.snapshot({ game }) || {};
    const rows = game.players.map((player, index) => {
      const teamIndex = Array.isArray(modeState.teams)
        ? modeState.teams.findIndex((team) => Array.isArray(team) && team.includes(index)) : -1;
      const modeScore = game.format === 'cup'
        ? `${Number(modeState.heatWins?.[index]) || 0} heat wins`
        : game.format === 'team-clash' && teamIndex >= 0
          ? `${escapeHtml(modeState.teamNames?.[teamIndex] || `Team ${teamIndex + 1}`)} · ${Number(modeState.scores?.[teamIndex]) || 0}`
          : `${Number(matchWins[index]) || 0} wins`;
      return `<div class="score-row${player.eliminated ? ' eliminated' : ''}" role="row">
        <span role="cell" class="score-seat">P${index + 1}</span>
        <span role="cell" class="score-dot" style="background:${player.color}" aria-label="Player color"></span>
        <span role="cell" class="score-name">${escapeHtml(player.name)}</span>
        <span role="cell" class="score-lives">${Number(player.lives) || 0} lives</span>
        <span role="cell" class="score-wins">${modeScore}</span>
      </div>`;
    }).join('');
    scoreboardEl.setAttribute('role', 'table');
    scoreboardEl.setAttribute('aria-label', 'Final result in seat order');
    scoreboardEl.innerHTML = rows;
  }

  function showNextSetupProposal(kind) {
    const panel = document.getElementById('next-order');
    if (!panel) return;
    proposedNextDefs = null;
    proposedTeamSwap = false;
    const current = defsFromCurrentGame();
    if (kind === 'rotate') proposedNextDefs = current.slice(1).concat(current.slice(0, 1));
    if (kind === 'shuffle') {
      proposedNextDefs = current.slice();
      for (let index = proposedNextDefs.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [proposedNextDefs[index], proposedNextDefs[swapIndex]] = [proposedNextDefs[swapIndex], proposedNextDefs[index]];
      }
    }
    if (kind === 'teams') proposedTeamSwap = true;
    let preview;
    if (proposedTeamSwap) {
      const state = v111Runtime?.modes?.snapshot({ game }) || {};
      const teams = Array.isArray(state.teams) ? [state.teams[1], state.teams[0]] : [];
      preview = teams.map((team, index) => `<li><strong>${escapeHtml(state.teamNames?.[1 - index] || `Team ${index + 1}`)}</strong>: ${team.map((seat) => `P${seat + 1} ${escapeHtml(game.players[seat]?.name || 'Player')}`).join(', ')}</li>`).join('');
    } else {
      preview = (proposedNextDefs || current).map((definition, index) => `<li>P${index + 1} · ${escapeHtml(definition.name || 'Player')}</li>`).join('');
    }
    panel.innerHTML = `<h2>Proposed next setup</h2><ol>${preview}</ol><div class="proposal-actions"><button type="button" class="secondary-action" data-proposal-cancel>Cancel</button><button type="button" class="primary-action" data-proposal-apply>Apply proposal</button></div>`;
    panel.classList.remove('hidden');
    panel.querySelector('[data-proposal-apply]')?.focus();
  }

  document.getElementById('rotate-order-btn')?.addEventListener('click', () => showNextSetupProposal('rotate'));
  document.getElementById('shuffle-order-btn')?.addEventListener('click', () => showNextSetupProposal('shuffle'));
  document.getElementById('swap-teams-btn')?.addEventListener('click', () => showNextSetupProposal('teams'));
  document.getElementById('next-order')?.addEventListener('click', (event) => {
    const panel = event.currentTarget;
    if (event.target.closest('[data-proposal-cancel]')) {
      proposedNextDefs = null;
      proposedTeamSwap = false;
      panel.classList.add('hidden');
      panel.replaceChildren();
      announce('Next setup unchanged.');
      return;
    }
    if (event.target.closest('[data-proposal-apply]')) {
      if (proposedNextDefs) confirmedNextDefs = proposedNextDefs.map((definition) => ({ ...definition }));
      if (proposedTeamSwap) confirmedTeamSwap = true;
      proposedNextDefs = null;
      proposedTeamSwap = false;
      panel.classList.add('hidden');
      panel.replaceChildren();
      announce('Next setup updated.');
      playAgainBtn.focus();
    }
  });

  // ── Flick ──────────────────────────────────────────────────────────────────
  function launchFlick(vx, vy, seed, mirrorClaim = null, launchPolicy = null) {
    if (evaluating) return;
    if (game.state !== GAME_STATES.TURN_START &&
        game.state !== GAME_STATES.ON_FIRE) return;

    evaluating = true;
    activeMirrorClaim = mirrorClaim;
    activeLaunchRoster = activeMirrorRoster();
    activeLaunchProfile = mirrorClaim ? detached(mirrorClaim.profile || {}) : physicsProfileForPlayer(game.currentPlayerIndex);
    activeLaunchInput = { vx: Number(vx), vy: Number(vy), seed: seed == null ? null : seed };
    if (mirrorClaim && Physics.setProfile) {
      Physics.setProfile(activeLaunchProfile);
      Physics.resetBottle();
      prepareTurnArena();
    }
    if (currentMatchOptions.lab) {
      activeLabTrajectory = [];
      labTrajectoryStartedAt = performance.now();
      captureLabTrajectoryPoint(true);
    }
    Input.disable();
    flipHintEl.classList.add('hidden');
    Sound.unlock();
    Sound.play('flick');
    lastFlickPower = Math.min(Math.max(0, -vy) / 4000, 1);
    // Typed test commands mark the session as Test Data.
    testDataFlipActive = false;
    beginFlipTelemetry();
    if ((currentMatchOptions.lab || currentMatchOptions.tour) && Physics.forceSpecialEvent) {
      if (currentMatchOptions.labEventId) Physics.forceSpecialEvent(currentMatchOptions.labEventId);
      testDataFlipActive = true;
      matchTestDataActive = true;
      currentMatchOptions.testData = true;
      if (currentMatchOptions.tour && journeyHost) {
        try {
          journeyHost.qualifyTourLaunch({
            qualifiedManual: !game.currentPlayer()?.isAI,
            normalizedPower: lastFlickPower || 0.6,
            normalizedDirection: 0,
            pointerType: 'touch',
          }, 10000);
        } catch (error) { console.warn('Tour launch was not accepted', error); }
      }
    } else if (!mirrorClaim && !currentMatchOptions.eventsDisabled && currentMatchOptions.arenaProfile?.physicsProfileId && Physics.forceSpecialEvent) {
      activeArenaPhysicsId = currentMatchOptions.arenaProfile.physicsProfileId;
      Physics.forceSpecialEvent(activeArenaPhysicsId);
    } else if (Physics.forceSpecialEvent) {
      if (game.practice && specialEventArmed) {
        Physics.forceSpecialEvent(specialEventArmed);
        specialEventArmed = null;
        testDataFlipActive = true;
        matchTestDataActive = true;
        currentMatchOptions.testData = true;
      } else if (game.practice) {
        const namedEvent = game.practice ? testEventForName(game.currentPlayer()?.name) : null;
        if (namedEvent) {
          Physics.forceSpecialEvent(namedEvent);
          testDataFlipActive = true;
          matchTestDataActive = true;
          currentMatchOptions.testData = true;
        }
      }
    }
    const eventMultiplier = isMrHoweName(game.currentPlayer()?.name) ? 10 : 1;
    const mirrorPolicy = mirrorClaim?.policy || null;
    const mirrorEventsDisabled = !!(mirrorPolicy &&
      (mirrorPolicy.eventMode === 'disabled' || mirrorPolicy.eventPolicy?.eventsDisabled || mirrorPolicy.nestingDisabled));
    if (Physics.setPlinkoAppearance) {
      const player = game.currentPlayer();
      const definition = currentMatchDefs[game.currentPlayerIndex] || {};
      const selectedBody = Physics.getBottle ? Physics.getBottle() : null;
      const objectId = definition.skin || player?.skin || BASE_SKIN;
      const variantId = definition.variantId || flavorIdForColor(player?.color);
      const artProfile = window.FlipgameV111Art?.platform?.dynamicProfile?.(objectId) || null;
      Physics.setPlinkoAppearance({
        flipperId: objectId,
        variantId,
        appearanceRevision: 'v1.12-live-selected',
        cosmeticId: definition.cosmeticId || 'none',
        physicsProfileId: activeArenaPhysicsId || activeLaunchProfile?.id || 'competitive-shared',
        authoredParts: selectedBody?.parts?.map((part, index) =>
          String(part.label || `compound-part-${index}`)) || [],
        internalDynamics: artProfile
          ? [artProfile.internal, artProfile.accessory].filter((value) => value && value !== 'none')
          : [],
      });
    }
    if (v112PhysicsDriver && v112OwnsMatch) {
      try { v112PhysicsDriver.cancelArmedLaunch(); } catch (_) {}
      try { v112PhysicsDriver.armLaunch({ manual: !game.currentPlayer()?.isAI }); }
      catch (error) { console.warn('Private physics launch marker failed', error); }
    }
    Physics.applyFlick(vx, vy, seed, eventMultiplier,
      mirrorEventsDisabled ? 'disabled' : (currentMatchOptions.eventsDisabled ? 'disabled' : (game.insanity ? 'insanity' : 'normal')),
      mirrorClaim ? false : !!game.currentPlayer()?.alwaysMagnet,
      {
        excludedEventIds: mirrorPolicy?.eventPolicy?.excludedEventIds || currentMatchOptions.excludedEventIds || [],
        inputFeelMode: launchPolicy?.inputFeelMode,
      });
    const fi = Physics.getLastFlickInfo ? Physics.getLastFlickInfo() : null;
    if (activeLaunchInput) activeLaunchInput.seed = fi?.seed ?? activeLaunchInput.seed;
    rareEventActive = (fi && fi.rareEvent) || null;
    goldenFlipActive = rareEventActive === 'golden-flip';
    moonFlipActive = !!(fi && fi.moon);
    plinkoFlipActive = !!(fi && fi.plinko);
    v111Bridge('flipStarted', {
      game,
      flick: fi,
      eventId: canonicalEventId(),
      online: false,
      forced: testDataFlipActive,
      testData: matchTestDataActive,
    }, null);
    document.body.classList.toggle('life-drain-active',
      !!game.lifeDrainActive || rareEventActive === 'life-drain');
    if (game.practice) updatePracticeMeter(fi, false);
    if (plinkoFlipActive) {
      streakBannerEl.textContent = '🎰 PLINKO DROP! The floor is gone!';
      streakBannerEl.className = 'streak-banner on-fire';
      Sound.play('ignite');
    } else if (moonFlipActive) {
      streakBannerEl.textContent = '🌙 MOON GRAVITY!';
      streakBannerEl.className = 'streak-banner on-fire';
    } else if (rareEventActive) {
      streakBannerEl.textContent = RARE_EVENT_LABELS[rareEventActive] || '✦ RARE EVENT!';
      streakBannerEl.className = 'streak-banner on-fire';
      Sound.play('ignite');
    } else if (flickFeedbackOn() && fi && !currentIsBankShot()) {
      // Learning aid during airtime (onResult overwrites). Sweet spot ~2500 px/s.
      const d = fi.upSpeed - 2500;
      streakBannerEl.textContent = Math.abs(d) < 280 ? '✦ Sweet spot'
        : (d < 0 ? 'Too soft' : 'Too hard');
      streakBannerEl.className = 'streak-banner';
    } else if (flickFeedbackOn() && fi && currentIsBankShot()) {
      const side = Math.abs(fi.vx || 0);
      streakBannerEl.textContent = side < 400 ? 'More sideways!'
        : (side > 2200 ? 'Easy on the side' : '✦ Nice bank angle');
      streakBannerEl.className = 'streak-banner';
    }
    game.setState(GAME_STATES.EVALUATING);
  }

  // ── Practice trainer meter ─────────────────────────────────────────────────
  // Flip mode: one track for flick strength (sweet spot ~2500 px/s).
  // Bank-shot (alien) mode: strength + sideways aim vs the pad diamond.
  function configurePracticeMeter() {
    if (!practiceMeterEl || !game.practice) {
      if (practiceMeterEl) practiceMeterEl.classList.add('hidden');
      return;
    }
    practiceMeterEl.classList.remove('hidden');
    const bank = currentIsBankShot();
    practiceMeterEl.classList.toggle('pm-bank', bank);
    const sideRow = document.getElementById('pm-side-row');
    if (sideRow) sideRow.classList.toggle('hidden', !bank);

    const powerBand = document.getElementById('pm-power-band');
    const powerLabel = document.getElementById('pm-power-label');
    // Map px/s → % on a fixed scale. Flip sweet ~2500; alien wants less pure-up.
    if (bank) {
      // Alien scale 600..3200; green 1100..2300
      if (powerBand) { powerBand.style.left = '19.2%'; powerBand.style.width = '46.2%'; }
      if (powerLabel) powerLabel.textContent = 'launch power — green keeps the bank airborne';
    } else {
      // Flip scale 1000..3600; green 2300..3300 covers the calibrated
      // controlled-flip window without teaching the old quarter-bar launch.
      if (powerBand) { powerBand.style.left = '50%'; powerBand.style.width = '38.5%'; }
      if (powerLabel) powerLabel.textContent = 'flick strength — green = controlled flip';
    }

    const sideBand = document.getElementById('pm-side-band');
    if (sideBand) {
      // Sideways |vx| isn't the pad — the pad diamond is. Keep a soft "useful
      // sideways" band in the middle of the aim track as a training cue.
      sideBand.style.left = '22%';
      sideBand.style.width = '56%';
    }
    syncPracticePadMark();
  }

  function syncPracticePadMark() {
    const padEl = document.getElementById('pm-pad-mark');
    if (!padEl || !practiceMeterEl || practiceMeterEl.classList.contains('hidden')) return;
    const t = Physics.getTarget && Physics.getTarget();
    const view = Physics.getViewHint && Physics.getViewHint();
    const worldW = (view && view.worldW) || window.innerWidth;
    if (!t || !worldW) {
      padEl.style.display = 'none';
      return;
    }
    padEl.style.display = '';
    padEl.style.left = Math.max(2, Math.min(98, (t.x / worldW) * 100)) + '%';
  }

  function powerPct(upSpeed, bank) {
    if (bank) return Math.max(0, Math.min(1, (upSpeed - 600) / 2600)) * 100;
    return Math.max(0, Math.min(1, (upSpeed - 1000) / 2600)) * 100;
  }

  // Sideways aim: map gesture/flick horizontal onto the arena (0=left wall).
  function sideAimPct(vx) {
    // Live and post-flick markers share the canonical launch velocity.
    // ±2400 lane-relative px/s maps to the full practice aim track.
    return Math.max(0, Math.min(100, 50 + (vx / 2400) * 50));
  }

  function updatePracticeMeter(info, live) {
    if (!practiceMeterEl || !game.practice || !info) return;
    configurePracticeMeter();
    const bank = currentIsBankShot();
    const pm = document.getElementById('pm-power-marker');
    const sm = document.getElementById('pm-side-marker');
    if (pm) {
      pm.style.left = powerPct(info.upSpeed || 0, bank) + '%';
      pm.classList.toggle('pm-live', !!live);
    }
    if (sm && bank) {
      sm.style.left = sideAimPct(info.vx || 0) + '%';
      sm.classList.toggle('pm-live', !!live);
    }
  }

  function practiceMeterFromDrag(drag) {
    if (!drag) return null;
    const canonicalDistance = Number(drag.canonicalDistance);
    if (!Number.isFinite(canonicalDistance) || canonicalDistance + 1e-6 < 22) return null;
    // Input owns sampling, coalescing, and lane-relative normalization. Feed
    // its exact release signal through Physics' prelaunch Feel transfer so the
    // live needle and the eventual launch can never disagree.
    const rawVx = Number(drag.launchVx);
    const rawVy = Number(drag.launchVy);
    if (!Number.isFinite(rawVx) || !Number.isFinite(rawVy)) return null;
    const signal = Physics.previewInput
      ? Physics.previewInput(rawVx, rawVy)
      : { vx: rawVx, vy: rawVy };
    return { upSpeed: Math.max(0, -signal.vy), vx: signal.vx, vy: signal.vy };
  }

  function onFlick(vx, vy, source = null) {
    const cpuPolicy = cpuLaunchPolicy(source);
    const copied = mirrorLaunch(claimMirrorCopy(), vx, vy, undefined);
    vx = copied.vx;
    vy = copied.vy;
    const labSeed = currentMatchOptions.lab && currentMatchOptions.labSeed != null
      ? Number(currentMatchOptions.labSeed) >>> 0 : undefined;
    const launchSeed = copied.claim ? copied.seed : (cpuPolicy ? cpuPolicy.seed : labSeed);
    launchFlick(vx, vy, launchSeed, copied.claim, cpuPolicy);
  }

  // ── HUD ────────────────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function playerCardHtml(p, i, extraClass, focusLabel) {
    const active = i === game.currentPlayerIndex && !p.eliminated;
    let cls = 'player-card';
    if (extraClass) cls += ' ' + extraClass;
    if (p.eliminated)       cls += ' eliminated';
    else if (active)        cls += ' active';
    if (p.isOnFire)         cls += ' on-fire';
    else if (p.isHeatingUp) cls += ' heating-up';
    if (!p.eliminated && p.lives <= 3) cls += ' low-lives';
    if (game.maxLives >= 100) cls += ' marathon-lives';
    const label = focusLabel
      ? `<span class="p-focus-label">${escapeHtml(focusLabel)}</span>`
      : '';
    return `<div class="${cls}" data-seat="${i}">
      ${label}
      <span class="p-name">${escapeHtml(p.name)}${p.alwaysMagnet ? ' 🧲' : ''}</span>
      <span class="p-lives-num">${p.lives}</span>
      <span class="p-lives-label">lives</span>
    </div>`;
  }

  function upcomingActiveSeats() {
    const order = [];
    if (!game || !game.players.length) return order;
    let idx = game.currentPlayerIndex;
    for (let n = 0; n < game.players.length; n++) {
      const player = game.players[idx];
      if (player && !player.eliminated) order.push({ player, index: idx });
      idx = ((idx + game.direction) + game.players.length) % game.players.length;
    }
    return order;
  }

  function updateHUD() {
    document.body.classList.toggle('on-fire-live', !!(game && game.onFirePlayer));
    if (game.practice) {
      rosterDrawerOpen = false;
      playerListEl.classList.remove('player-list-focus', 'roster-open');
      const pct = game.practiceAttempts ? Math.round(game.practiceMakes / game.practiceAttempts * 100) : 0;
      playerListEl.innerHTML = `<div class="practice-stats">
        <div class="ps-item"><span class="ps-num">${game.practiceMakes}/${game.practiceAttempts}</span><span class="ps-label">makes</span></div>
        <div class="ps-item"><span class="ps-num">${pct}%</span><span class="ps-label">rate</span></div>
        <div class="ps-item"><span class="ps-num">${game.practiceStreak}</span><span class="ps-label">streak</span></div>
        <div class="ps-item"><span class="ps-num">${game.practiceBest}</span><span class="ps-label">best</span></div>
      </div>`;
      return;
    }
    const focusHud = game.players.length >= 9;
    if (!focusHud) rosterDrawerOpen = false;
    playerListEl.classList.toggle('player-list-focus', focusHud);
    playerListEl.classList.toggle('roster-open', !!(focusHud && rosterDrawerOpen));
    if (focusHud && !rosterDrawerOpen) {
      const upcoming = upcomingActiveSeats();
      const labels = ['Current', 'On Deck', 'After That'];
      const cards = upcoming.slice(0, 3).map((entry, order) =>
        playerCardHtml(entry.player, entry.index, order === 0 ? 'focus-current' : 'focus-next', labels[order]));
      const activeCount = upcoming.length;
      cards.push(`<button type="button" class="roster-drawer-btn" id="roster-drawer-btn">${activeCount} active · ${game.players.length} seats</button>`);
      playerListEl.innerHTML = cards.join('');
      return;
    }
    playerListEl.innerHTML = game.players.map((p, i) => playerCardHtml(p, i)).join('')
      + (focusHud
        ? `<button type="button" class="roster-drawer-btn" id="roster-drawer-btn">Hide roster</button>`
        : '');
    const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    playerListEl.querySelector('.player-card.active')?.scrollIntoView({
      inline: 'center', block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }
  playerListEl?.addEventListener('click', (event) => {
    if (!event.target.closest('#roster-drawer-btn')) return;
    rosterDrawerOpen = !rosterDrawerOpen;
    updateHUD();
  });

  // ── Non-game routes, local statistics, and achievement gallery ─────────────
  let routeOpener = null;
  function enterRoute(screen, opener) {
    routeOpener = opener || document.activeElement;
    [setupScreen, statsScreen, achievementsScreen, labScreen].forEach((item) => item?.classList.add('hidden'));
    screen?.classList.remove('hidden');
    const heading = screen?.querySelector('h1');
    if (heading) requestAnimationFrame(() => heading.focus({ preventScroll: true }));
  }
  function leaveRoute(screen) {
    screen?.classList.add('hidden');
    setupScreen.classList.remove('hidden');
    if (routeOpener?.isConnected) routeOpener.focus(); else document.getElementById('setup-title')?.focus();
    routeOpener = null;
  }
  function percent(numerator, denominator) {
    if (!denominator) return 'No recorded flips';
    const value = numerator / denominator * 100;
    return `${value < 10 ? value.toFixed(1) : Math.round(value)}% Observed`;
  }
  function statsFilters() {
    const period = document.querySelector('input[name="stats-period"]:checked')?.value || 'all';
    const format = document.getElementById('stats-format')?.value || 'all';
    const includePractice = !!document.getElementById('stats-practice')?.checked;
    const includeTestData = !!document.getElementById('stats-test-data')?.checked;
    const filters = {
      scope: document.getElementById('stats-scope')?.value || 'device',
      includeTestData,
      // Test-event identities are an internal opt-in coupled to the explicit
      // Test Data control. They must never be discoverable from normal data.
      includeTestEventNames: includeTestData,
    };
    if (period === '30-days') filters.from = Date.now() - 30 * 86400000;
    if (period === '20-matches') filters.last20Matches = true;
    const fromDate = document.getElementById('stats-from')?.value;
    if (fromDate) filters.from = new Date(`${fromDate}T00:00:00`).getTime();
    if (format === 'practice') filters.modes = ['practice'];
    else if (format === 'physics-lab') filters.modes = ['physics-lab', 'lab'];
    else if (format !== 'all') filters.modes = [format];
    else if (!includePractice) filters.modes = ['classic', 'cup', 'team-clash', 'team'];
    const one = (id, key) => {
      const value = document.getElementById(id)?.value;
      if (value && value !== 'all') filters[key] = [value];
    };
    one('stats-player', 'playerIds');
    one('stats-seat', 'seats');
    one('stats-object', 'objectIds');
    one('stats-variant', 'variantIds');
    one('stats-cosmetic', 'cosmeticIds');
    one('stats-arena', 'arenaIds');
    one('stats-event', 'eventIds');
    one('stats-player-count', 'playerCounts');
    one('stats-viewport', 'viewportBuckets');
    const type = document.getElementById('stats-human')?.value;
    if (type === 'human') filters.isAI = false;
    if (type === 'cpu') filters.isAI = true;
    return filters;
  }
  function statsStore() { return v111Runtime && v111Runtime.stats && v111Runtime.stats.current(); }
  let watchedStatsStore = null;
  function showStatsStorageWarning(warning) {
    const target = document.getElementById('stats-storage-warning');
    if (!target || !warning) return;
    target.textContent = String(warning.message || 'Detailed statistics could not be stored. Summary totals are still being kept on this device.');
    target.classList.remove('hidden');
  }
  function watchStatsStorageWarnings() {
    const store = statsStore();
    if (!store || store === watchedStatsStore) return;
    watchedStatsStore = store;
    if (typeof store.onWarning === 'function') store.onWarning(showStatsStorageWarning);
    if (typeof store.getWarning === 'function') showStatsStorageWarning(store.getWarning());
  }
  window.addEventListener('flipgame:stats-warning', (event) => showStatsStorageWarning(event.detail));
  watchStatsStorageWarnings();
  function eventPublicName(id) {
    const metadata = window.FlipgameV111PhysicsEvents?.getMetadata(id);
    return metadata?.displayName || String(id || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  function safeStatsName(value) {
    const candidate = String(value || '').trim();
    const checked = v111Runtime?.namePolicy?.validate(candidate, { source: 'stats-display' });
    return checked && (checked.valid === false || checked.ok === false) ? 'Player' : (candidate || 'Player');
  }
  function statsSeatLabel(value) {
    const seat = Number(value);
    return Number.isInteger(seat) && seat >= 0 && seat <= 15 ? `P${seat + 1}` : 'Other';
  }
  function dimensionName(value) {
    return String(value == null || value === '' ? 'None' : value)
      .replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  function setObservedOptions(id, entries) {
    const select = document.getElementById(id);
    if (!select) return;
    const previous = select.value;
    const first = select.options[0]?.cloneNode(true);
    select.replaceChildren();
    if (first) select.appendChild(first);
    entries.forEach((entry) => {
      const option = document.createElement('option');
      option.value = String(entry.value);
      option.textContent = String(entry.label);
      select.appendChild(option);
    });
    select.value = [...select.options].some((option) => option.value === previous) ? previous : 'all';
  }
  function populateObservedStatsFilters(raw) {
    const flips = raw.flips || [];
    const players = new Map();
    flips.forEach((flip) => {
      if (flip.playerId != null && !players.has(String(flip.playerId))) {
        players.set(String(flip.playerId), `${statsSeatLabel(flip.seat ?? flip.playerIndex)} · ${safeStatsName(flip.displayName)}`);
      }
    });
    (raw.matches || []).forEach((match) => (match.participants || match.players || []).forEach((player, index) => {
      const id = String(player.playerId || player.id || '');
      if (id && !players.has(id)) players.set(id, `${statsSeatLabel(player.seat ?? player.playerIndex ?? index)} · ${safeStatsName(player.displayName || player.name)}`);
    }));
    setObservedOptions('stats-player', [...players].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)));
    const seats = new Set(flips.map((flip) => flip.seat ?? flip.playerIndex).filter((value) => value != null));
    (raw.matches || []).forEach((match) => (match.participants || match.players || []).forEach((player) => {
      const seat = player.seat ?? player.playerIndex;
      if (seat != null) seats.add(seat);
    }));
    setObservedOptions('stats-seat', [...seats].sort((a, b) => Number(a) - Number(b))
      .map((value) => ({ value, label: statsSeatLabel(value) })));
    const observed = (id, field, label = dimensionName) => {
      const values = [...new Set(flips.map((row) => field.split('.').reduce((value, key) => value?.[key], row)).filter((value) => value != null && value !== ''))];
      setObservedOptions(id, values.sort((a, b) => String(a).localeCompare(String(b))).map((value) => ({ value, label: label(value) })));
    };
    observed('stats-object', 'objectId');
    observed('stats-variant', 'variantId');
    observed('stats-cosmetic', 'cosmeticId');
    observed('stats-arena', 'arenaId');
    observed('stats-viewport', 'viewport.bucket');
    observed('stats-event', 'eventId', eventPublicName);
  }
  function observedPercent(count, total) {
    if (!total) return 'No observations';
    const value = count / total * 100;
    return `${value < 10 ? value.toFixed(1) : Math.round(value)}% observed`;
  }
  function probabilityCells(count, total) {
    return `<td>${count}</td><td>${count}/${total}</td><td>${observedPercent(count, total)}</td>`;
  }
  function observedSection(title, rows, labelFor, denominator, empty = 'No observations') {
    const values = Array.isArray(rows) ? rows : [];
    if (!values.length) return `<section class="stats-chart-card"><h2>${escapeHtml(title)}</h2><p class="empty-state">${escapeHtml(empty)}</p></section>`;
    const max = Math.max(1, ...values.map((row) => Number(row.count ?? row.observed ?? 0)));
    const bars = values.slice(0, 40).map((row) => {
      const count = Number(row.count ?? row.observed ?? 0);
      const label = String(labelFor(row));
      return `<div class="observed-bar-row"><span>${escapeHtml(label)}</span><span class="observed-bar-track" aria-hidden="true"><i style="width:${Math.max(2, count / max * 100)}%"></i></span><strong>${count} · ${count}/${denominator} · ${observedPercent(count, denominator)}</strong></div>`;
    }).join('');
    const table = values.map((row) => {
      const count = Number(row.count ?? row.observed ?? 0);
      return `<tr><th scope="row">${escapeHtml(String(labelFor(row)))}</th>${probabilityCells(count, denominator)}</tr>`;
    }).join('');
    return `<section class="stats-chart-card"><h2>${escapeHtml(title)}</h2><div class="observed-bars" role="img" aria-label="${escapeHtml(title)}, observed data">${bars}</div><details><summary>View data table</summary><div class="table-scroll" tabindex="0"><table class="data-table"><thead><tr><th>Bin</th><th>Count</th><th>Fraction</th><th>Observed</th></tr></thead><tbody>${table}</tbody></table></div></details></section>`;
  }
  async function resolvedStatsFilters(store) {
    const filters = statsFilters();
    if (filters.last20Matches) {
      delete filters.last20Matches;
      const preview = await store.query(filters);
      const matches = (preview.matches || []).slice().sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
      if (matches.length >= 20) filters.from = Math.max(Number(filters.from) || 0, Number(matches[19].timestamp) || 0);
    }
    return filters;
  }
  async function renderStats() {
    const output = document.getElementById('stats-results');
    const store = statsStore();
    if (!output) return;
    if (!store) { output.innerHTML = '<p class="empty-state">No recorded flips</p>'; return; }
    const filters = await resolvedStatsFilters(store);
    const allObserved = await store.query({
      scope: 'all',
      includeTestData: filters.includeTestData === true,
      includeTestEventNames: filters.includeTestEventNames === true,
    });
    populateObservedStatsFilters(allObserved);
    const [summary, datasets, raw] = await Promise.all([store.summary(filters), store.datasets(filters), store.query(filters)]);
    const scopeLabels = { session: 'Session', device: 'Device lifetime', import: 'Imported', all: 'All data' };
    const title = document.getElementById('stats-title');
    if (title) title.textContent = `Stats · ${scopeLabels[filters.scope] || 'Device lifetime'}`;
    const active = document.querySelector('[data-stats-tab][aria-selected="true"]')?.dataset.statsTab || 'overview';
    const metric = (label, value) => `<div class="metric-card"><span>${label}</span><strong>${value}</strong></div>`;
    if (active === 'overview') {
      const cumulative = datasets.cumulativeMakeRate || [];
      const points = cumulative.length > 80 ? cumulative.filter((_, index) => index % Math.ceil(cumulative.length / 80) === 0 || index === cumulative.length - 1) : cumulative;
      const cumulativeRows = points.map((row) => ({ count: row.makes, total: row.flips, label: new Date(row.timestamp).toLocaleDateString() }));
      const cumulativeChart = cumulativeRows.length ? `<section class="stats-chart-card"><h2>Cumulative make rate</h2><div class="spark-bars" role="img" aria-label="Cumulative observed make rate">${cumulativeRows.map((row) => `<i style="height:${Math.max(2, row.total ? row.count / row.total * 100 : 0)}%" aria-label="${escapeHtml(row.label)}: ${row.count}, ${row.count}/${row.total}, ${observedPercent(row.count, row.total)}"></i>`).join('')}</div><details><summary>View data table</summary><div class="table-scroll"><table class="data-table"><thead><tr><th>Date</th><th>Count</th><th>Fraction</th><th>Observed</th></tr></thead><tbody>${cumulativeRows.map((row) => `<tr><th>${escapeHtml(row.label)}</th>${probabilityCells(row.count, row.total)}</tr>`).join('')}</tbody></table></div></details></section>` : observedSection('Cumulative make rate', [], () => '', summary.flips);
      const strip = (datasets.sequenceStrip || []).slice(-160);
      const sequenceChart = `<section class="stats-chart-card"><h2>Make / miss strip</h2>${strip.length ? `<div class="sequence-strip" role="img" aria-label="Last ${strip.length} observed flip outcomes">${strip.map((row) => `<i class="${row.made ? 'made' : 'missed'}" title="${row.made ? 'Make' : 'Miss'}" aria-label="${row.made ? 'Make' : 'Miss'}"></i>`).join('')}</div><p>${summary.makes} makes · ${summary.makes}/${summary.flips} · ${observedPercent(summary.makes, summary.flips)}</p>` : '<p class="empty-state">No recorded flips</p>'}</section>`;
      const averageTime = (value) => Number(value) > 0 ? `${Math.round(Number(value))} ms` : 'No observations';
      output.innerHTML = `<div class="metric-grid">${metric('Recorded flips', summary.sampleSize ?? summary.flips)}${metric('Makes', summary.makes)}${metric('Misses', summary.misses)}${metric('Make rate', summary.flips ? `${summary.makes} · ${summary.fraction || `${summary.makes}/${summary.flips}`} · ${observedPercent(summary.makes, summary.flips)}` : 'No recorded flips')}${metric('Upright landings', summary.upright)}${metric('Cap landings', summary.caps)}${metric('Perfect landings', summary.perfect)}${metric('Best make streak', summary.bestStreak)}${metric('ON FIRE runs', summary.onFireRuns)}${metric('Matches', summary.matches)}${metric('Cups', summary.cups)}${metric('Team wins', summary.teamWins)}${metric('Observed events', summary.events)}${metric('Average flight time', averageTime(summary.averageFlightMs))}${metric('Average settle time', averageTime(summary.averageSettleMs))}</div>${cumulativeChart}${sequenceChart}`;
    } else if (active === 'events') {
      const eventRows = datasets.observedEventFrequencySuccess || datasets.events || [];
      const rows = eventRows.map((row) => `<tr><th scope="row">${escapeHtml(eventPublicName(row.eventId))}</th>${probabilityCells(row.observed, summary.flips)}<td>${row.successes} · ${row.successes}/${row.observed} · ${observedPercent(row.successes, row.observed)}</td></tr>`).join('');
      output.innerHTML = rows ? `<div class="table-scroll" role="region" aria-label="Observed events table" tabindex="0"><table class="data-table"><thead><tr><th>Event</th><th>Observed</th><th>Fraction</th><th>Frequency</th><th>Success</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="empty-state">No discovered events in these recorded flips.</p>';
    } else if (active === 'players') {
      const byPlayer = new Map();
      (raw.flips || []).forEach((flip) => { if (!byPlayer.has(flip.playerId)) byPlayer.set(flip.playerId, { id: flip.playerId, name: safeStatsName(flip.displayName), seatLabel: statsSeatLabel(flip.seat ?? flip.playerIndex) }); });
      const playerRows = await Promise.all([...byPlayer.values()].map(async (player) => ({ player, summary: await store.summary(Object.assign({}, filters, { playerIds: [player.id] })) })));
      playerRows.sort((a,b) => b.summary.flips - a.summary.flips);
      const playersTable = playerRows.length ? `<div class="table-scroll" role="region" aria-label="Player statistics table" tabindex="0"><table class="data-table"><thead><tr><th aria-sort="descending">Player, sorted by flips descending</th><th>Flips</th><th>Makes</th><th>Fraction</th><th>Observed</th><th>Cap landings</th><th>Matches</th></tr></thead><tbody>${playerRows.map(({player,summary:s}) => `<tr><th scope="row">${player.seatLabel} · ${escapeHtml(player.name)}</th><td>${s.flips}</td><td>${s.makes}</td><td>${s.makes}/${s.flips}</td><td>${observedPercent(s.makes,s.flips)}</td><td>${s.caps}</td><td>${s.matches}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty-state">No recorded flips</p>';
      output.innerHTML = playersTable + observedSection('Object comparison', datasets.objects || [], (row) => dimensionName(row.objectId), summary.flips);
    } else {
      const heat = observedSection('Power × direction heatmap', datasets.powerDirectionHeatmap || [], (row) => `${row.powerBucket || row.cell || 'Unknown'} · ${Number(row.direction) < 0 ? 'left' : Number(row.direction) > 0 ? 'right' : 'center'}`, summary.flips);
      const rotations = observedSection('Rotations', datasets.rotations || [], (row) => row.rotations ?? 'Unknown', summary.flips);
      const reasons = observedSection('Landing reasons', datasets.landingReasons || [], (row) => dimensionName(row.reason), summary.flips);
      const lives = observedSection('Lives timeline', datasets.livesStake?.livesTimeline || datasets.livesStake?.lives || [],
        (row) => row.before != null || row.after != null ? `${row.before ?? '—'} → ${row.after ?? '—'}` : row.lives ?? 'Unknown', summary.flips);
      const stake = observedSection('Stake timeline', datasets.livesStake?.stakeTimeline || datasets.livesStake?.stake || [],
        (row) => row.before != null || row.after != null ? `${row.before ?? '—'} → ${row.after ?? '—'}` : row.stake ?? 'Unknown', summary.flips);
      const streaks = observedSection('Streaks', datasets.streaks || [], (row) => row.streak ?? 'Unknown', summary.flips);
      const cupRows = datasets.cupTeam?.cup || [];
      const teamRows = datasets.cupTeam?.team || [];
      const timeline = (label, rows) => `<section class="stats-chart-card"><h2>${label}</h2>${rows.length ? `<ol class="mode-timeline">${rows.map((row) => `<li><time datetime="${new Date(row.timestamp).toISOString()}">${new Date(row.timestamp).toLocaleString()}</time><span>${escapeHtml(row.summary || (row.heats ? `Heats ${JSON.stringify(row.heats)}` : row.scores ? `Score ${row.scores.join('–')}` : 'Completed'))}</span><strong>1 · 1/${rows.length} · ${observedPercent(1, rows.length)}</strong></li>`).join('')}</ol>` : '<p class="empty-state">No observed matches</p>'}</section>`;
      output.innerHTML = heat + rotations + reasons + lives + stake + streaks + timeline('Cup timeline', cupRows) + timeline('Team Clash timeline', teamRows);
    }
    announce(`${summary.flips} recorded flips`);
  }
  function downloadText(filename, textValue, type) {
    const url = URL.createObjectURL(new Blob([textValue], { type }));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const GAME_SAVE_KEYS = Object.freeze([
    'flipgame.setup.v2', 'flipgame.settings.v1', 'flipgame.records.v2',
    'flipgame.progression.v3', 'flipgame.achievements.v3',
    'flipgame.party', 'flipgame.alienHintSeen',
  ]);
  function readGameSaveValue(key) {
    const raw = localStorage.getItem(key);
    if (raw == null) return undefined;
    try { return JSON.parse(raw); } catch (_) { return raw; }
  }
  function gameSavePayload() {
    saveSetup();
    const storage = {};
    GAME_SAVE_KEYS.forEach((key) => {
      const value = readGameSaveValue(key);
      if (value !== undefined) storage[key] = value;
    });
    return { schema: 'FlipgameLocalSaveV1', version: 1, storage };
  }
  function normalizeGameSavePayload(payload) {
    if (payload?.schema === 'FlipgameLocalSaveV1' && payload.storage && typeof payload.storage === 'object') return payload;
    const storage = {};
    if (payload?.setup) storage['flipgame.setup.v2'] = payload.setup;
    if (payload?.settings) storage['flipgame.settings.v1'] = payload.settings;
    if (payload?.records) storage['flipgame.records.v2'] = payload.records.records || payload.records;
    if (payload?.progression || payload?.records?.progression) storage['flipgame.progression.v3'] = payload.progression || payload.records.progression;
    if (payload?.achievements) storage['flipgame.achievements.v3'] = payload.achievements;
    return { schema: 'FlipgameLocalSaveV1', version: 1, storage };
  }
  function uniqueSaveValues(...lists) {
    return [...new Set(lists.flatMap((list) => Array.isArray(list) ? list.map(String) : []))];
  }
  function mergeProgressionSave(imported, importedAchievementIds = []) {
    const current = window.FlipgameV111Progression?.exportState?.() || {};
    const incoming = imported && typeof imported === 'object' ? imported : {};
    const merged = {
      qualifyingWins: Math.max(Number(current.qualifyingWins) || 0, Number(incoming.qualifyingWins) || 0),
      ownedObjectIds: uniqueSaveValues(current.ownedObjectIds, incoming.ownedObjectIds),
      ownedCosmeticIds: uniqueSaveValues(current.ownedCosmeticIds, incoming.ownedCosmeticIds),
      achievementIds: uniqueSaveValues(current.achievementIds, incoming.achievementIds, importedAchievementIds),
      claimedRewardIds: uniqueSaveValues(current.claimedRewardIds, incoming.claimedRewardIds),
    };
    return window.FlipgameV111Progression?.reconcile?.(merged) || merged;
  }
  function mergeAchievementSave(imported) {
    const current = window.Achievements?.exportState?.() || {};
    const incoming = imported && typeof imported === 'object' ? imported : {};
    const earned = new Map();
    [...(current.earned || []), ...(incoming.earned || [])].forEach((entry) => {
      if (!entry?.id || earned.has(String(entry.id))) return;
      earned.set(String(entry.id), { id: String(entry.id), earnedAt: entry.earnedAt || null });
    });
    return { ...current, ...incoming, schema: 'AchievementStateV3', version: 3, earned: [...earned.values()] };
  }
  function mergeRecordSave(imported) {
    const current = window.Records?.snapshot?.() || {};
    const incoming = imported && typeof imported === 'object' ? imported : {};
    const numeric = ['bestStreak','highestStake','totalMakes','totalFlips','longestOnFire','greatSaves','capLands','qualifyingWins'];
    const merged = { ...current, ...incoming, schema: 'RecordSummaryV2', version: 2 };
    numeric.forEach((key) => { merged[key] = Math.max(Number(current[key]) || 0, Number(incoming[key]) || 0); });
    const winners = new Map();
    [...(current.winnerRecords || []), ...(incoming.winnerRecords || [])].forEach((row) => {
      if (!row?.playerId) return;
      const id = String(row.playerId);
      const known = winners.get(id);
      if (!known || Number(row.wins) > Number(known.wins)) winners.set(id, { ...row, playerId: id, wins: Math.max(0, Number(row.wins) || 0) });
    });
    merged.winnerRecords = [...winners.values()];
    merged.pendingRevealIds = uniqueSaveValues(current.pendingRevealIds, incoming.pendingRevealIds);
    delete merged.mostWins;
    return merged;
  }
  function applyGameSavePayload(payload) {
    const normalizedInput = normalizeGameSavePayload(payload);
    const normalized = window.FlipgameV111SaveBackup?.sanitizeNames
      ? window.FlipgameV111SaveBackup.sanitizeNames(normalizedInput, { invalidReplacement: '' })
      : normalizedInput;
    if (normalized.schema !== 'FlipgameLocalSaveV1' || !normalized.storage || typeof normalized.storage !== 'object') {
      throw new TypeError('Unsupported game save');
    }
    const incoming = normalized.storage;
    const achievements = mergeAchievementSave(incoming['flipgame.achievements.v3']);
    const records = mergeRecordSave(incoming['flipgame.records.v2']);
    const importedProgression = { ...(incoming['flipgame.progression.v3'] || {}) };
    importedProgression.qualifyingWins = Math.max(Number(importedProgression.qualifyingWins) || 0,
      Number(records.qualifyingWins) || 0, Number(incoming['flipgame.records.v1']?.totalWins) || 0);
    const progression = mergeProgressionSave(importedProgression, achievements.earned.map((entry) => entry.id));
    const values = { ...incoming,
      'flipgame.records.v2': records,
      'flipgame.progression.v3': progression,
      'flipgame.achievements.v3': achievements,
    };
    let importedCount = 0;
    GAME_SAVE_KEYS.forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(values, key)) return;
      localStorage.setItem(key, JSON.stringify(values[key]));
      importedCount++;
    });
    if (!importedCount) throw new TypeError('Game save has no supported data');
    return importedCount;
  }
  statsBtn?.addEventListener('click', () => { watchStatsStorageWarnings(); enterRoute(statsScreen, statsBtn); renderStats(); });
  document.getElementById('stats-back-btn')?.addEventListener('click', () => leaveRoute(statsScreen));
  document.querySelectorAll('[data-stats-tab]').forEach((tab) => tab.addEventListener('click', () => {
    document.querySelectorAll('[data-stats-tab]').forEach((item) => { const selected = item === tab; item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1; }); renderStats();
  }));
  document.getElementById('stats-apply')?.addEventListener('click', renderStats);
  document.getElementById('stats-clear')?.addEventListener('click', () => {
    setRadio('stats-period', 'all');
    ['stats-format','stats-player','stats-seat','stats-human','stats-object','stats-variant','stats-cosmetic','stats-arena','stats-event','stats-player-count','stats-viewport'].forEach((id) => { const input = document.getElementById(id); if (input) input.value = 'all'; });
    document.getElementById('stats-scope').value = 'device';
    document.getElementById('stats-from').value = '';
    document.getElementById('stats-practice').checked = false;
    document.getElementById('stats-test-data').checked = false;
    renderStats();
  });
  document.querySelector('.stats-rail')?.addEventListener('change', () => { if (innerWidth >= 900) renderStats(); });
  document.getElementById('stats-export-json')?.addEventListener('click', async () => { const store = statsStore(); if (!store) return; const value = await store.exportJSON({ filters: await resolvedStatsFilters(store) }); if (value) downloadText('flipgame.flipstats.json', value, 'application/json'); });
  document.getElementById('stats-export-csv')?.addEventListener('click', async () => {
    const store = statsStore(); if (!store) return;
    const requested = document.getElementById('stats-csv-type')?.value || 'player-summary';
    const type = { flips: 'flip', matches: 'match', 'player-summary': 'player', 'event-summary': 'event' }[requested] || requested;
    const value = await store.exportCSV(type, { filters: await resolvedStatsFilters(store), includeNames: !!document.getElementById('stats-export-names').checked });
    if (value) downloadText(`flipgame-${requested}.csv`, value, 'text/csv');
  });
  document.getElementById('save-export')?.addEventListener('click', () => {
    const backup = window.FlipgameV111SaveBackup;
    if (!backup?.serialize) return announce('Game save backup is unavailable.', true);
    const releaseVersion = window.FlipgameV111Interfaces?.RELEASE_VERSION || 'v1.15';
    const value = backup.serialize(gameSavePayload(), { releaseVersion });
    downloadText(`flipgame-${releaseVersion}.flipgame-save`, value, 'application/octet-stream');
  });
  document.getElementById('save-import')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const target = document.getElementById('save-import-result');
    try {
      const backup = window.FlipgameV111SaveBackup;
      if (!backup?.parse) throw new Error('Game save backup is unavailable');
      const parsed = backup.parse(await file.text(), { adapters: [normalizeGameSavePayload] });
      const count = applyGameSavePayload(parsed.payload);
      target.textContent = `Game save imported · ${count} sections restored. Reloading…`;
      target.focus();
      setTimeout(() => location.reload(), 700);
    } catch (_) {
      target.textContent = 'Game save not imported. The file is invalid or damaged.';
      target.focus();
    } finally { event.target.value = ''; }
  });
  document.getElementById('stats-import')?.addEventListener('change', async (event) => { const file = event.target.files?.[0]; if (!file) return; const result = await statsStore()?.importJSON(await file.text()); const target = document.getElementById('stats-import-result'); target.textContent = result?.imported ? `1 file read · ${result.flips + result.matches + result.rollups} new records · ${result.duplicates} duplicates skipped · 0 invalid records rejected` : '1 file read · 0 new records · 0 duplicates skipped · 1 invalid record rejected'; target.focus(); renderStats(); });
  document.getElementById('stats-delete')?.addEventListener('click', async () => { if (prompt('Type DELETE to delete local statistics. Progression and achievements are unaffected.') !== 'DELETE') return; await statsStore()?.close(); try { indexedDB.deleteDatabase(window.FlipgameV111Stats?.DB_NAME); localStorage.removeItem(window.FlipgameV111Stats?.FALLBACK_KEY); } catch (_) {} location.reload(); });

  let achievementFilter = 'all', achievementCategory = null;
  function renderAchievements() {
    const grid = document.getElementById('achievement-grid');
    if (!grid) return;
    if (!v112App && typeof Achievements === 'undefined') return;
    const all = (v112App && typeof v112App.achievements === 'function')
      ? v112App.achievements().map((view) => ({
          locked: !!view.locked, name: view.name, desc: view.description || view.desc,
          emoji: view.icon || view.emoji || '★', category: view.category, earnedAt: view.earnedAt || null,
        }))
      : [];
    let views = achievementFilter === 'earned' ? all.filter((view) => !view.locked) : all;
    if (achievementCategory) views = views.filter((view) => !view.locked && (view.category === achievementCategory || (achievementCategory === 'lab-stats' && /lab|stat/.test(view.category))));
    const discovered = views.filter((view) => !view.locked);
    const tiles = discovered.map((view, index) =>
      `<button type="button" role="gridcell" class="picker-tile achievement-tile" aria-label="${escapeHtml(view.name)}" tabindex="${index ? -1 : 0}"><span aria-hidden="true">${escapeHtml(view.emoji)}</span><strong>${escapeHtml(view.name)}</strong><span>${escapeHtml(view.desc || '')}</span>${view.earnedAt ? `<time datetime="${escapeHtml(view.earnedAt)}">Earned ${new Date(view.earnedAt).toLocaleDateString()}</time>` : ''}</button>`);
    if (achievementFilter !== 'earned' && views.some((view) => view.locked)) tiles.push(undiscoveredTileHtml());
    grid.innerHTML = tiles.join('');
    document.getElementById('achievement-summary').textContent = `${discovered.length} of ${all.length || 120} discovered`;
    document.getElementById('achievement-empty').classList.toggle('hidden', views.length > 0);
  }
  achievementsBtn?.addEventListener('click', () => { enterRoute(achievementsScreen, achievementsBtn); renderAchievements(); });
  document.getElementById('achievements-back-btn')?.addEventListener('click', () => leaveRoute(achievementsScreen));
  document.getElementById('achievement-filters')?.addEventListener('click', (event) => { const button = event.target.closest('button'); if (!button) return; if (button.dataset.achFilter) { achievementFilter = button.dataset.achFilter; achievementCategory = null; } else achievementCategory = button.dataset.achCategory || null; document.querySelectorAll('#achievement-filters button').forEach((item) => item.setAttribute('aria-pressed', String(item === button))); renderAchievements(); });

  // Shared roving focus for galleries and tabs.
  document.addEventListener('keydown', (event) => {
    const current = event.target.closest('.picker-grid > button, .tab-list > button');
    if (!current || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
    const container = current.parentElement;
    const items = [...container.querySelectorAll(':scope > button')];
    const columns = Math.max(1, Math.round(container.clientWidth / Math.max(1, current.getBoundingClientRect().width)));
    let index = items.indexOf(current);
    if (event.key === 'ArrowLeft') index--; if (event.key === 'ArrowRight') index++;
    if (event.key === 'ArrowUp') index -= columns; if (event.key === 'ArrowDown') index += columns;
    if (event.key === 'Home') index = event.ctrlKey ? 0 : Math.floor(index / columns) * columns;
    if (event.key === 'End') index = event.ctrlKey ? items.length - 1 : Math.min(items.length - 1, Math.floor(index / columns) * columns + columns - 1);
    index = Math.max(0, Math.min(items.length - 1, index)); event.preventDefault(); items.forEach((item, i) => item.tabIndex = i === index ? 0 : -1); items[index].focus();
  });

  // ── Settings / records wiring ───────────────────────────────────────────────
  function reduceMotionActive() {
    return Settings.reduceMotion ||
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || false;
  }
  function applyReducedMotion() {
    const active = reduceMotionActive();
    document.body.classList.toggle('reduce-motion', active);
    Renderer.setReduceMotion(active);
    return active;
  }
  function syncPreferenceControls() {
    if (reduceMotionToggle) reduceMotionToggle.checked = Settings.reduceMotion;
    if (flickFeedbackEl) flickFeedbackEl.checked = Settings.flickFeedback;
    setFeelRadio(Settings.feel);
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
  async function backToMenu() {
    const returnToLab = !!currentMatchOptions.lab;
    if (loopId) cancelAnimationFrame(loopId);
    loopId = null;
    clearTimers();
    Sound.setSuddenDeath(false);
    Input.disable();
    gameStarted = false;
    if (mirrorMatch) {
      try { mirrorMatch.cleanup('match-abandoned'); } catch (error) { console.error('Mirror Match cleanup failed', error); }
      mirrorMatch = null;
      activeMirrorClaim = null;
    }
    document.body.classList.remove('life-drain-active');
    abandonPrivateSession();
    v111Bridge('menuEntered', { game, reason: 'menu' }, null);
    try { if (v111Platform && v111Platform.leaveMatch) await v111Platform.leaveMatch(); } catch (_) {}
    game.state = GAME_STATES.SETUP;
    gameScreen.classList.add('hidden');
    gameOverEl.classList.add('hidden');
    passScreen.classList.add('hidden');
    if (practiceMeterEl) practiceMeterEl.classList.add('hidden');
    labReadoutEl?.classList.add('hidden');
    dismissMystery();
    renderRecordsPanel();
    syncInsaneModeUnlock();
    if (returnToLab && isPhysicsLabUnlocked()) {
      populateLabControls();
      setupScreen.classList.add('hidden');
      labScreen?.classList.remove('hidden');
      requestAnimationFrame(() => document.getElementById('lab-title')?.focus({ preventScroll: true }));
    } else {
      labScreen?.classList.add('hidden');
      showBroadcastHome();
    }
  }
  if (menuBtn) menuBtn.addEventListener('click', () => {
    if (confirm('Return to the main menu? The current game will end.')) backToMenu();
  });
  if (homeBtn) homeBtn.addEventListener('click', backToMenu);
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMq = () => applyReducedMotion();
    if (mq.addEventListener) mq.addEventListener('change', onMq);
    else if (mq.addListener) mq.addListener(onMq);
  }

  Input.attach(canvas, onFlick);

  // Apply persisted prefs + render the hall-of-fame
  syncPreferenceControls();
  Sound.setMuted(!Settings.sound);
  applyReducedMotion();
  syncMuteBtn();
  if (Records.syncUnlocksFromWins) Records.syncUnlocksFromWins();
  syncInsaneModeUnlock();
  renderRecordsPanel();

  // ── Secret: Konami code toggles party mode (keyboard / smartboard) ─────────
  {
    const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
                    'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let konamiIdx = 0;
    // Typed-word secrets (skip when focus is in a text input — player names).
    const armEvent = (id, label) => () => {
      if (!gameStarted || !game.practice) {
        showToast('Event tests are available in Practice.');
        return;
      }
      specialEventArmed = id;
      showToast(`${label} armed — next flip!`);
      Sound.play('ignite');
    };
    const WORDS = {
      plinko: armEvent('plinko', '🎰 Plinko'),
      rainbowtrail: armEvent('rainbow-trail', '🌈 Rainbow Trail'),
      powerlaunch: armEvent('power-launch', '⚡ Power Launch'),
      moongravity: armEvent('moon-gravity', '🌙 Moon Gravity'),
      iceslide: armEvent('ice-slide', '🧊 Ice Slide'),
      gravityslam: armEvent('gravity-slam', '💥 Gravity Slam'),
      trampoline: armEvent('trampoline', '🟢 Trampoline'),
      windtunnel: armEvent('wind-tunnel', '🌪️ Wind Tunnel'),
      doubleflip: armEvent('double-flip', '🚀 Double Flip'),
      magnet: armEvent('magnet', '🧲 Magnet'),
      heartrush: armEvent('heart-rush', '💗 Heart Rush'),
      lifedrain: armEvent('life-drain', '☣️ Life Drain'),
    };
    let typed = '';
    window.addEventListener('keydown', (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      konamiIdx = (k === KONAMI[konamiIdx]) ? konamiIdx + 1 : (k === KONAMI[0] ? 1 : 0);
      if (konamiIdx >= KONAMI.length) {
        konamiIdx = 0;
        konamiParty = !konamiParty;
        try { localStorage.setItem('flipgame.party', konamiParty ? '1' : '0'); } catch (_) {}
        showToast(konamiParty ? '🪩 Party mode ON!' : '🪩 Party mode off.');
        Sound.play('win');
        return;
      }
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') { typed = ''; return; }
      if (e.key.length !== 1) return;
      typed = (typed + e.key.toLowerCase()).slice(-16);
      for (const [word, fire] of Object.entries(WORDS)) {
        if (typed.endsWith(word)) { typed = ''; fire(); }
      }
    });
  }

  // Sprites are SVG data URIs that decode a beat after they're requested, so
  // the first preview paint can land on the placeholder. Repaint when one
  // arrives (no-op once the setup screen is gone).
  //
  // Coalesced through a single rAF: opening the picker bakes ~18 Images, and
  // every one of their onloads fires spriteLoaded() -> every listener. Painting
  // synchronously there meant ~18 x 18 drawPreview calls in one burst.
  let previewRepaintQueued = false;
  function schedulePreviewRepaint() {
    if (previewRepaintQueued) return;
    previewRepaintQueued = true;
    requestAnimationFrame(() => {
      previewRepaintQueued = false;
      paintAllPreviews();
      paintPickerPreviews();
      if (mysteryOpened) paintMysteryArt();   // the reveal art decodes late too
    });
  }
  if (window.Skins && Skins.onSpriteLoad) Skins.onSpriteLoad(schedulePreviewRepaint);
  if (window.FLIP_CAST25 && FLIP_CAST25.onSpriteLoad) FLIP_CAST25.onSpriteLoad(schedulePreviewRepaint);
  paintAllPreviews();

  // Home is the first presentation route; setup and saved values stay intact.
  showBroadcastHome();
  gameScreen.classList.add('hidden');
  gameOverEl.classList.add('hidden');
})();
