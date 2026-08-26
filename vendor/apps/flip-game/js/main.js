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
  const practiceMeterEl = document.getElementById('practice-meter');
  const startBtn     = document.getElementById('start-btn');
  const practiceBtn  = document.getElementById('practice-btn');
  const onlineBtn    = document.getElementById('online-btn');
  const onlineScreen = document.getElementById('online-screen');
  const onlineForm   = document.getElementById('online-form');
  const onlineLobby  = document.getElementById('online-lobby');
  const onlineNameEl = document.getElementById('online-name');
  const onlineCodeEl = document.getElementById('online-code');
  const onlineCreateBtn = document.getElementById('online-create-btn');
  const onlineJoinBtn   = document.getElementById('online-join-btn');
  const onlineBackBtn   = document.getElementById('online-back-btn');
  const onlineLeaveBtn  = document.getElementById('online-leave-btn');
  const onlineStartBtn  = document.getElementById('online-start-btn');
  const onlineRoomCodeEl = document.getElementById('online-room-code');
  const onlineStatusEl   = document.getElementById('online-status');
  const onlineRosterEl   = document.getElementById('online-roster');
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
  const ONLINE_ENABLED = BRAND.online !== false;

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
    return c.id === BASE_SKIN || c.unlock == null || Records.isSkinUnlocked(c.id);
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
    if (window.Skins && Skins.nameFor) return Skins.nameFor(charId, col);
    const f = FLAVORS.find((x) => x.color === col);
    const c = characterById(resolveCharForColor(charId, col));
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

  // The picker grid: one tile per family, art drawn in the player's CURRENT
  // color so the choice previews exactly what they'll flip.
  function familyTilesHtml(curCharId, curColor) {
    const curFam = familyKey(curCharId);
    return familyCatalog().map((e) => {
      const label = familyLabel(e.rep.id);
      // 200x280 matches the renderer's 300x420 content aspect so the art fills
      // the tile, and keeps >=1.7x DPR at both the ~82px phone tile and the
      // ~114px tile in the wider card. drawPreview auto-fits any canvas size.
      const art = (id) => `<canvas class="fam-art" width="200" height="280" ` +
        `data-preview-char="${id}" aria-hidden="true"></canvas>`;
      // Show art the player actually owns. Resolving the current color straight
      // through would display an uncollected variant — spoiling art they haven't
      // earned and misrepresenting what picking this tile would give them.
      const forColor = resolveCharForColor(e.rep.id, curColor);
      const artId = (e.unlocked && !isCharUnlocked(forColor)) ? e.rep.id : forColor;
      // Cast families report progress; single-object skins are all-or-nothing.
      const count = e.cast ? `${e.owned}/${e.total}` : '';
      if (!e.unlocked) {
        const need = (e.rep && e.rep.unlock != null) ? e.rep.unlock : '?';
        // Locked characters stay HIDDEN — a big "?" instead of ghosted art, so
        // each unlock is a genuine reveal. The win threshold still shows so
        // players know what they're working toward.
        // aria-disabled, NOT disabled: a disabled button drops out of the tab
        // order and tells a screen-reader user nothing about why. This stays
        // focusable and the click handler explains itself with a toast.
        return `<button type="button" class="fam-tile fam-hidden" data-locked="1" aria-disabled="true"` +
          ` data-need="${need}"` +
          ` aria-label="Hidden character — unlocks at ${need} wins">` +
          `<span class="fam-mystery" aria-hidden="true">?</span>` +
          `<span class="fam-name">???</span>` +
          `<span class="fam-need">🔒 ${need} wins</span>` +
          `</button>`;
      }
      const sel = e.key === curFam;
      const partial = e.cast && e.owned < e.total;
      return `<button type="button" class="fam-tile${sel ? ' selected' : ''}"` +
        ` data-char="${e.rep.id}"${sel ? ' aria-current="true"' : ''}` +
        ` aria-label="${escapeHtml(label)}${count ? ' — ' + count + ' collected' : ''}">` +
        art(artId) +
        `<span class="fam-name">${escapeHtml(label)}</span>` +
        (count ? `<span class="fam-count${partial ? '' : ' complete'}">${count}</span>` : '') +
        `</button>`;
    }).join('');
  }

  // For a cast family each color IS a separate character, so a colour the player
  // hasn't drawn from a mystery box yet is genuinely unavailable and renders
  // locked. Single-object skins recolor freely, so all 12 stay open.
  function colorSwatchesHtml(selColor, charId) {
    const sel = normalizeColor(selColor);
    const id = charId || defaultCharId();
    return FLAVORS.map((f) => {
      const nm = defaultNameFor(id, f.color);
      const open = isColorAvailable(id, f.color);
      return `<button type="button" class="flavor-swatch${f.color === sel ? ' selected' : ''}` +
        `${open ? '' : ' locked'}" data-color="${f.color}"${open ? '' : ' aria-disabled="true"'}` +
        ` style="background:${f.color}"` +
        ` title="${escapeHtml(open ? nm : nm + ' — not collected yet')}"></button>`;
    }).join('');
  }

  function rowHtml(i, def) {
    const col = normalizeColor(def.color || defaultColorFor(def.charId || defaultCharId()));
    const charId = resolveCharForColor(def.charId || defaultCharId(), col);
    const name = def.name != null ? def.name : defaultNameFor(charId, col);
    // Two control lines beside the preview: a 440px card can't fit preview +
    // P# + name + Change + CPU + remove on one row without crushing the input.
    // FORCE_SKIN hides the Change button outright — rowsToDefs and the
    // practice/online paths all hard-override the skin, so offering a choice
    // that gets silently discarded is worse than offering none.
    return `<div class="player-input-row" data-char="${charId}" data-color="${col}" data-ai="${def.ai ? 1 : 0}">
      <div class="prow-top">
        <canvas class="skin-preview" width="160" height="224" aria-hidden="true"></canvas>
        <div class="prow-main">
          <div class="prow-line">
            <span class="player-num" style="color:${col}">P${i + 1}</span>
            <input type="text" placeholder="${escapeHtml(defaultNameFor(charId, col))}" maxlength="14" value="${escapeHtml(name)}">
          </div>
          <div class="prow-line">
            ${FORCE_SKIN ? '' : `<button type="button" class="char-change-btn" aria-haspopup="dialog" title="Change character"><span class="charbtn-label">${escapeHtml(familyLabel(charId))}</span><span aria-hidden="true">▾</span></button>`}
            <button type="button" class="ai-toggle${def.ai ? ' cpu' : ''}" title="Tap to switch Human / CPU">${def.ai ? 'CPU' : 'Human'}</button>
            ${i >= 2 ? '<button type="button" class="remove-player-btn" title="Remove">✕</button>' : ''}
          </div>
        </div>
      </div>
      <div class="picker-label">Color — <span class="flavor-name">${escapeHtml(defaultNameFor(charId, col))}</span></div>
      <div class="flavor-picker">${colorSwatchesHtml(col, charId)}</div>
    </div>`;
  }

  function readRows() {
    return [...playerInputs.querySelectorAll('.player-input-row')].map(row => {
      const color = normalizeColor(row.dataset.color || defaultColorFor(row.dataset.char));
      const charId = resolveCharForColor(row.dataset.char || defaultCharId(), color);
      return {
        name: row.querySelector('input').value,
        charId,
        color,
        ai: row.dataset.ai === '1',
      };
    });
  }

  function paintRowPreview(row) {
    const cv = row && row.querySelector('.skin-preview');
    if (!cv || typeof Renderer === 'undefined' || !Renderer.drawPreview) return;
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
      s.title = open ? nm : nm + ' — not collected yet';
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

  function renderFrom(defs) {
    // Re-rendering replaces the rows wholesale; an open picker would be left
    // holding a detached node whose mutations go nowhere.
    if (pickerRow) closeCharPicker();
    playerCount = defs.length;
    playerInputs.innerHTML = defs.map((d, i) => rowHtml(i, d)).join('');
    addPlayerBtn.disabled = playerCount >= 8;
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
    if (playerCount >= 8) return;
    const defs = readRows();
    defs.push(seatDefaults(defs.length, defs.map((d) => d.color)));
    renderFrom(defs);
    if (typeof saveSetup === 'function') saveSetup();
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
        const id = row.dataset.char || defaultCharId();
        showToast(`🔒 ${defaultNameFor(id, sw.dataset.color)} unlocks later — keep winning!`);
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
      if (typeof saveSetup === 'function') saveSetup();
      return;
    }
    const rm = e.target.closest('.remove-player-btn');
    if (rm && playerCount > 2) {
      const defs = readRows();
      defs.splice([...playerInputs.children].indexOf(rm.closest('.player-input-row')), 1);
      renderFrom(defs);
      if (typeof saveSetup === 'function') saveSetup();
    }
  });
  // Debounced name typing → persist the lobby.
  let nameSaveTimer = null;
  playerInputs.addEventListener('input', (e) => {
    if (!e.target || e.target.tagName !== 'INPUT') return;
    clearTimeout(nameSaveTimer);
    nameSaveTimer = setTimeout(() => {
      if (typeof saveSetup === 'function') saveSetup();
    }, 400);
  });

  addPlayerBtn.addEventListener('click', addPlayerInput);

  // ── Character picker overlay ────────────────────────────────────────────────
  // Holds the live row ELEMENT, not an index, so adding/removing players can't
  // desync it. Non-null doubles as the "picker is open" flag.
  // NB: declared before the initial renderFrom() call below, which reads it.
  let pickerRow = null;
  let pickerOpener = null;   // the button to hand focus back to

  function openCharPicker(row, opener) {
    if (!row || !charPickScreen) return;
    pickerRow = row;
    pickerOpener = opener || null;
    const col = normalizeColor(row.dataset.color || defaultColorFor(row.dataset.char));
    const charId = resolveCharForColor(row.dataset.char || defaultCharId(), col);
    const idx = [...playerInputs.children].indexOf(row);
    charPickTitle.textContent = `Choose a character for P${idx + 1}`;
    // Bake every family's sprite for this color in ONE pass — otherwise each of
    // the ~17 drawPreview calls kicks off its own lazy bake and the resulting
    // onload storm repaints the whole grid once per sprite.
    if (window.Skins && Skins.preload) Skins.preload([col]);
    charPickGrid.innerHTML = familyTilesHtml(charId, col);
    charPickScreen.classList.remove('hidden');
    // aria-modal is a lie to screen readers without a focus trap; inert is the
    // cheap honest version. Feature-detected — this also ships as a WebView APK.
    if ('inert' in HTMLElement.prototype) setupScreen.inert = true;
    paintPickerPreviews();
    (charPickGrid.querySelector('.fam-tile.selected') || charPickClose).focus();
  }

  function closeCharPicker() {
    if (!pickerRow) return;
    pickerRow = null;
    charPickScreen.classList.add('hidden');
    charPickGrid.innerHTML = '';   // release ~17 canvases and their 2D contexts
    if ('inert' in HTMLElement.prototype) setupScreen.inert = false;
    if (pickerOpener && pickerOpener.isConnected) pickerOpener.focus();
    pickerOpener = null;
  }

  function paintPickerPreviews() {
    if (!pickerRow || typeof Renderer === 'undefined' || !Renderer.drawPreview) return;
    const col = normalizeColor(pickerRow.dataset.color || defaultColorFor(pickerRow.dataset.char));
    charPickGrid.querySelectorAll('canvas[data-preview-char]').forEach((cv) => {
      const id = cv.dataset.previewChar;
      const drawAs = (window.Skins && Skins.drawAs) ? Skins.drawAs(id) : id;
      Renderer.drawPreview(cv, drawAs === 'bottle' ? 'bottle' : id, drawTintFor(id, col));
    });
  }

  if (charPickGrid) charPickGrid.addEventListener('click', (e) => {
    const tile = e.target.closest('.fam-tile');
    if (!tile || !pickerRow) return;
    if (tile.dataset.locked === '1') {
      showToast(`🔒 Hidden character — reach ${tile.dataset.need} total wins to reveal it!`);
      return;
    }
    applyRowChar(pickerRow, tile.dataset.char, null);   // null = keep their color
    closeCharPicker();
  });
  if (charPickClose) charPickClose.addEventListener('click', closeCharPicker);
  if (charPickScreen) charPickScreen.addEventListener('click', (e) => {
    if (e.target === charPickScreen) closeCharPicker();   // backdrop only
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    if (pickerRow) { e.preventDefault(); closeCharPicker(); return; }
    // The characters are already granted and saved by the time a box is shown,
    // so escaping out of the queue only skips the animation — nothing is lost.
    if (mysteryCurrent) { e.preventDefault(); dismissMystery(); }
  });

  // ── Mystery box reveal ──────────────────────────────────────────────────────
  // A won box hatches one random flippable. Reveals are queued so winning two
  // thresholds in one sitting shows two boxes back to back rather than racing.
  const mysteryQueue = [];
  let mysteryCurrent = null;   // char id being revealed (null = idle)
  let mysteryOpened = false;   // has the current box been popped?

  function queueMysteryReveals(ids) {
    if (!ids || !ids.length || !mysteryScreen) return;
    mysteryQueue.push(...ids);
    if (!mysteryCurrent) nextMysteryReveal();
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
    // Warm the sprite for this character's own tint before it's on screen.
    const c = characterById(mysteryCurrent);
    const tint = (c && (c.tint || c.color)) || defaultColorFor(mysteryCurrent);
    if (window.Skins && Skins.preload) Skins.preload([tint]);

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
    if (!mysteryCurrent || !mysteryArtEl || typeof Renderer === 'undefined' || !Renderer.drawPreview) return;
    const c = characterById(mysteryCurrent);
    const tint = (c && (c.tint || c.color)) || defaultColorFor(mysteryCurrent);
    const drawAs = (window.Skins && Skins.drawAs) ? Skins.drawAs(mysteryCurrent) : mysteryCurrent;
    Renderer.drawPreview(mysteryArtEl, drawAs === 'bottle' ? 'bottle' : mysteryCurrent,
                         drawTintFor(mysteryCurrent, tint));
  }

  function openMysteryBox() {
    if (!mysteryCurrent) return;
    mysteryOpened = true;
    paintMysteryArt();
    mysteryScreen.classList.add('opening');
    mysteryHeadlineEl.textContent = 'Unlocked — yours forever!';
    mysteryNameEl.textContent = defaultNameFor(mysteryCurrent, null);
    mysteryFamilyEl.textContent = `Win #${(characterById(mysteryCurrent) && characterById(mysteryCurrent).unlock) || '—'} on the ladder`;
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

  function rowsToDefs(rows) {
    return rows.map((r) => {
      const color = normalizeColor(r.color || defaultColorFor(r.charId || defaultCharId()));
      const charId = FORCE_SKIN || resolveCharForColor(r.charId || defaultCharId(), color);
      return {
        name: (r.name || '').trim() || defaultNameFor(charId, color),
        color,
        isAI: r.ai,
        skin: charId, // character id — Skins.draw/physicsFor resolve it
      };
    });
  }
  function chosenDifficulty() {
    return document.querySelector('input[name="difficulty"]:checked')?.value || 'medium';
  }
  function chosenFeel() {
    return document.querySelector('input[name="feel"]:checked')?.value ||
      (window.Settings && Settings.feel) || 'standard';
  }
  function chosenStartingLives() {
    const v = parseInt(document.querySelector('input[name="starting-lives"]:checked')?.value || '10', 10);
    return [3, 5, 10, 20, 100].includes(v) ? v : 10;
  }
  function flickFeedbackOn() {
    const el = document.getElementById('flick-feedback-toggle');
    if (el) return !!el.checked;
    return !!(window.Settings && Settings.flickFeedback);
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
          name: String(r.name || '').slice(0, 14),
          charId: r.charId,
          color: r.color,
          ai: !!r.ai,
        })),
        direction:  document.querySelector('input[name="direction"]:checked')?.value ?? '1',
        difficulty: chosenDifficulty(),
        feel:       chosenFeel(),
        startingLives: String(chosenStartingLives()),
        feedback:   flickFeedbackOn(),
      }));
    } catch (_) {}
  }
  function loadSetup() {
    try {
      const s = JSON.parse(localStorage.getItem(SETUP_KEY));
      if (!s || !Array.isArray(s.rows) || s.rows.length < 1) return false;
      const rows = s.rows.slice(0, 8).map((r, i) => {
        const color = normalizeColor(r.color || defaultColorFor(r.charId || defaultCharId()));
        const charId = resolveCharForColor(r.charId || defaultCharId(), color);
        return {
          name: String(r.name ?? '').slice(0, 14),
          charId,
          color,
          ai: !!r.ai,
          // Keep seatDefaults-compatible shape for rowHtml
        };
      });
      // Need at least 2 seats for a lobby; pad if a solo save somehow landed.
      while (rows.length < 2) rows.push(seatDefaults(rows.length, rows.map((x) => x.color)));
      renderFrom(rows);
      setRadio('direction', s.direction);
      setRadio('difficulty', s.difficulty);
      setRadio('feel', s.feel);
      setRadio('starting-lives', s.startingLives);
      const fb = document.getElementById('flick-feedback-toggle');
      if (fb) fb.checked = !!s.feedback;
      if (window.Settings) {
        if (s.feel) Settings.setFeel(s.feel);
        Settings.setFlickFeedback(!!s.feedback);
      }
      return true;
    } catch (_) { return false; }
  }

  // Persist feel / flick-feedback whenever the player picks them.
  document.querySelectorAll('input[name="feel"]').forEach((el) => {
    el.addEventListener('change', () => {
      if (window.Settings) Settings.setFeel(el.value);
      saveSetup();
    });
  });
  const flickFeedbackEl = document.getElementById('flick-feedback-toggle');
  if (flickFeedbackEl) {
    if (window.Settings) flickFeedbackEl.checked = !!Settings.flickFeedback;
    flickFeedbackEl.addEventListener('change', () => {
      if (window.Settings) Settings.setFlickFeedback(flickFeedbackEl.checked);
      saveSetup();
    });
  }
  document.querySelectorAll('input[name="direction"], input[name="difficulty"], input[name="starting-lives"]')
    .forEach((el) => el.addEventListener('change', saveSetup));
  if (window.Settings) setFeelRadio(Settings.feel);

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
    saveSetup();
    Sound.unlock();   // first user gesture — unlock audio
    onlineMode = false;
    if (window.Net) Net.leave();
    enterImmersive();
    setupScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    gameOverEl.classList.add('hidden');
    startGame(defs, dir, {
      difficulty: chosenDifficulty(),
      feel: chosenFeel(),
      startingLives: chosenStartingLives(),
      newMatch: true,
    });
  });

  // ── Practice (solo, no lives) ───────────────────────────────────────────────
  practiceBtn.addEventListener('click', () => {
    const r0 = readRows()[0] || { name: 'You', charId: defaultCharId(), color: defaultColorFor(defaultCharId()) };
    const color = normalizeColor(r0.color || defaultColorFor(r0.charId || defaultCharId()));
    const charId = FORCE_SKIN || resolveCharForColor(r0.charId || defaultCharId(), color);
    const def = {
      name: (r0.name || '').trim() || defaultNameFor(charId, color),
      color,
      isAI: false,
      skin: charId,
    };
    saveSetup();
    Sound.unlock();
    onlineMode = false;
    if (window.Net) Net.leave();
    enterImmersive();
    setupScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    gameOverEl.classList.add('hidden');
    startGame([def], 1, {
      practice: true,
      feel: chosenFeel(),
      startingLives: chosenStartingLives(),
      newMatch: true,
    });
  });

  playAgainBtn.addEventListener('click', () => {
    enterImmersive();
    gameOverEl.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    if (onlineMode) {
      // Online rematch: only the host can kick off; others wait for start.
      if (window.Net && Net.isHost) {
        const defs = game.players.map(p => ({
          name: p.name, color: p.color, isAI: false,
          skin: FORCE_SKIN || p.skin || BASE_SKIN, netId: p.netId,
        }));
        const payload = {
          defs, direction: game.direction, startingLives: game.startingLives,
          startIndex: game.winnerIndex, newMatch: false,
          feel: game.feel || chosenFeel(),
        };
        Net.startMatch(payload);
        if (playAgainBtn) playAgainBtn.textContent = 'Play Again';
        startGame(defs, game.direction, {
          difficulty: 'medium',
          feel: payload.feel,
          startingLives: game.startingLives,
          startIndex: game.winnerIndex,
          newMatch: false,
        });
      } else if (onlineStatusEl) {
        // Non-host waits — Net.on('start') will fire beginOnlineMatch path via startGame
        // Re-show a tiny waiting state on the game-over card label.
        playAgainBtn.textContent = 'Waiting for host…';
      }
      return;
    }
    if (game.practice) {
      startGame(
        [{ name: game.players[0].name, color: game.players[0].color, isAI: false,
           skin: FORCE_SKIN || game.players[0].skin || BASE_SKIN }],
        1,
        { practice: true, feel: game.feel || chosenFeel(), startingLives: game.startingLives }
      );
    } else {
      const defs = game.players.map(p => ({ name: p.name, color: p.color, isAI: p.isAI,
                                            skin: FORCE_SKIN || p.skin || BASE_SKIN }));
      // Winner starts the next game (by index — robust to duplicate names).
      startGame(defs, game.direction, {
        difficulty: game.difficulty,
        feel: game.feel || chosenFeel(),
        startingLives: game.startingLives,
        startIndex: game.winnerIndex,
      });
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
  let timerActive = false, turnTimeLeft = 0, turnTimeLimit = 0, timedOut = false;
  let lastFlickPower = null;   // 0..1 strength of the current flip's flick (achievements)
  let greatSaveActive = false; // the RESULT being shown is a rare Great Save
  let capLandActive = false;   // the RESULT being shown is a rare on-cap / upside-down make
  // Easter egg: ~1/150 flicks is a GOLDEN FLIP — the object bakes in gold and a
  // make is worth 2 (same bonus as a cap land). Derived from the flick seed so
  // online peers replaying the same seed see the same golden throw.
  let goldenFlipActive = false;  // this flick rolled golden
  let goldenShowActive = false;  // the RESULT being shown is a golden make
  const GOLDEN_COLOR = '#f2c14e';
  // Easter egg: ~1/200 throws happen on the moon (physics rolls it from the
  // flick seed) — floaty low-gravity flight, moon in the sky, normal scoring.
  let moonFlipActive = false;
  // Easter egg: ~1/1000 flips the floor vanishes and the throw drops into a
  // plinko board (center = auto win). Physics rolls it from the flick seed;
  // disabled online because prizes rewrite lives directly.
  let plinkoFlipActive = false;
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
  // Secret plinko triggers: name a player "plinko" (every flick drops), or
  // type the letters p-l-i-n-k-o on a keyboard (arms the next flick only).
  const isPlinkoName = (n) => /^plinko$/i.test(String(n || '').trim());
  let plinkoArmed = false;
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
  let onlineMode = false;      // playing via Net rooms
  let netAuthority = false;    // this client owns the current flick's verdict
  let pendingNetResult = null; // authoritative result waiting to apply
  const RESULT_MS = 1500;
  const TURN_SECONDS = 10, FIRE_SECONDS = 4;   // flip clock (less when ON FIRE)
  // Worst grounded tilt (rad) a MAKE must have survived to count as a Great
  // Save. FALLEN_ANGLE in physics.js is 1.20 — beyond ~1.0 the bottle is deep
  // in the teeter zone and almost never recovers, so this fires roughly
  // once-in-a-thousand flips: exactly the freak comeback worth celebrating.
  const GREAT_SAVE_TILT = 1.0;

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
    if (onlineMode && netAuthority && window.Net) {
      Net.sendResult({
        result: 'MISS',
        info: { reason: 'timeout', tilt: null, perfect: false },
        playerId: Net.selfId,
      });
      netAuthority = false;
    }
    game.resolveFlip('MISS');
  }

  function clearTimers() { clearTimeout(aiTimer); clearTimeout(elimTimer); clearTimeout(gameOverTimer); }

  function landingMeta(landingInfo = null) {
    return {
      perfect: !!(landingInfo && landingInfo.perfect),
      onCap:   !!(landingInfo && (landingInfo.onCap || landingInfo.reason === 'cap')),
      golden:  goldenFlipActive,
      plinko:  (landingInfo && landingInfo.plinko) || null,
    };
  }

  // CPU takes its turn: aim near the sweet-spot flick, with error set by difficulty.
  // Alien bank-shot skins get a sideways aim instead of a pure vertical flip.
  function aiFlick() {
    if (game.state !== GAME_STATES.TURN_START && game.state !== GAME_STATES.ON_FIRE) return;
    const sigma = { easy: 1000, medium: 400, hard: 220 }[game.difficulty] || 400;
    const u1 = Math.random() || 1e-6, u2 = Math.random();
    const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const skin = game.currentPlayer()?.skin || BASE_SKIN;
    const bank = window.Skins && Skins.physicsFor && Skins.physicsFor(skin);
    if (bank && bank.floorResolve) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const vx = side * (1100 + Math.abs(gauss) * sigma * 0.9 + Math.random() * 500);
      const up = Math.max(900, 1700 + gauss * sigma * 0.55);
      onFlick(vx, -up);
      return;
    }
    // Aim at the measured sweet spot. This drifted out of date when POWER_SPEED
    // was retuned: at the stale 2100 the CPU sat on the slope, so hard (63%)
    // was barely better than medium (60%). At 2500 the tiers separate properly
    // — easy 45% / medium 74% / hard 85%.
    const up = Math.max(500, 2500 + gauss * sigma);   // sweet spot ~2500 px/s
    const vx = (Math.random() - 0.5) * 420;           // slight lean
    onFlick(vx, -up);
  }

  // Deterministic turn seed shared by all online peers (same turnCounter + seat).
  function turnArenaSeed() {
    const tc = game.turnCounter | 0;
    const pi = game.currentPlayerIndex | 0;
    return ((tc * 0x9E3779B1) ^ ((pi + 1) * 0x85EBCA6B) ^ 0xC2B2AE35) >>> 0;
  }

  function prepareTurnArena() {
    if (Physics.seedTurn) Physics.seedTurn(turnArenaSeed());
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
    const feel = (opts && opts.feel) || chosenFeel();
    if (Physics.setFeel) Physics.setFeel(feel);
    if (window.Settings && !onlineMode) Settings.setFeel(feel);
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
    game.feel = feel;
    gameStarted = true;
    gameStats = {
      topStake: 0, longestFire: 0, sawSuddenDeath: false, ignitionsThisGame: 0,
      perPlayer: game.players.map(() => ({ makes: 0, flips: 0, bestStreak: 0, lowestLives: Infinity })),
    };
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
        // Remote peers may receive the authoritative verdict before local settle.
        if (pendingNetResult) {
          const forced = Physics.forceLanding
            ? Physics.forceLanding(pendingNetResult.result, pendingNetResult.info)
            : pendingNetResult.result;
          pendingNetResult = null;
          evaluating = false;
          showGlow = forced === 'MAKE';
          game.resolveFlip(forced, landingMeta(Physics.getLastLandingInfo()));
          break;
        }
        // Online non-authority: display-only sim — wait for the flicker's result
        // so cross-device pad/float drift can't fork lives/turns.
        if (onlineMode && !netAuthority) continue;
        const result = Physics.checkLanding();
        if (result) {
          evaluating = false;
          showGlow   = result === 'MAKE';
          const landingInfo = Physics.getLastLandingInfo();
          if (onlineMode && netAuthority && window.Net) {
            Net.sendResult({
              result,
              info: {
                tilt: landingInfo && landingInfo.tilt,
                perfect: !!(landingInfo && landingInfo.perfect),
                reason: landingInfo && landingInfo.reason,
                onCap: !!(landingInfo && (landingInfo.onCap || landingInfo.reason === 'cap')),
                maxTilt: landingInfo && landingInfo.maxTilt,
                padOffset: landingInfo && landingInfo.padOffset,
              },
              playerId: Net.selfId,
            });
          }
          netAuthority = false;
          const meta = landingMeta(landingInfo);
          if (meta.plinko && game.resolvePlinko) game.resolvePlinko(meta.plinko);
          else game.resolveFlip(result, meta);
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
      specialLabel: game.state === GAME_STATES.RESULT
        ? (game.plinkoPrize ? (game.plinkoPrize === 'win' ? '🎰 JACKPOT!' : '🎰 PLINKO!')
          : capLandActive ? '🙃 CAP LAND! ×2'
          : goldenShowActive ? '🌟 GOLDEN FLIP! ×2'
          : greatSaveActive ? '🧤 THE GREAT SAVE!'
          : null)
        : null,
      showGlow,
      isOnFire:    !!(game.onFirePlayer),
      // Ninja/rainbow work by re-baking the sprite in a different color (the
      // old ctx.filter approach silently no-ops on older iOS Safari).
      liquidColor: goldenFlipActive ? GOLDEN_COLOR
        : isNinjaName(game.currentPlayer()?.name) ? '#2a2633'
        : isRainbowName(game.currentPlayer()?.name) ? rainbowColor()
        : game.currentPlayer()?.color,
      golden:      goldenFlipActive,
      moon:        moonFlipActive,
      ghostly:     isGhostName(game.currentPlayer()?.name),
      ninja:       isNinjaName(game.currentPlayer()?.name),
      rainbow:     isRainbowName(game.currentPlayer()?.name),
      sizeFx:      isTinyName(game.currentPlayer()?.name) ? 0.68
                   : isGiantName(game.currentPlayer()?.name) ? 1.28 : 1,
      party:       konamiParty || game.players.some((pl) => isPartyName(pl.name)),
      plinkoBoard: Physics.getPlinko ? Physics.getPlinko() : null,
      skin:        game.currentPlayer()?.skin,
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
      ? 'Flick sideways — bank off the walls onto the pad!'
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
    showToast('👽 Bank shot! Flick sideways — walls & ceiling bounce, green pad scores.');
  }

  function nearMissLabel(landing) {
    if (!landing || landing.result === 'MAKE') return null;
    // Alien bank shot: just outside the pad / slide window.
    if (landing.padOffset != null && landing.padOffset < 1.35) return 'Almost on the pad!';
    // Normal flip: tipped just past the make cone (not a flat under-rotate).
    if (landing.reason === 'underrotated') return null;
    if (landing.tilt != null && landing.tilt < 0.95 &&
        (landing.reason === 'leaning' || landing.reason === 'fallen')) {
      return 'So close!';
    }
    return null;
  }

  // Arm a human's turn: show the hint, fire the make-or-break sting (timed to
  // when the player is actually ready), enable input, start the flip clock.
  function armHumanTurn() {
    passScreen.classList.add('hidden');
    updateFlipHint();
    maybeTeachBankShot();
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
    greatSaveActive = false;
    capLandActive   = false;
    goldenFlipActive = false;
    goldenShowActive = false;
    moonFlipActive  = false;
    plinkoFlipActive = false;
    lastFlickPower  = null;
    if (Physics.setPlinkoEnabled) Physics.setPlinkoEnabled(!onlineMode);
    stopTurnTimer();
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

    // Online: only the peer whose netId matches can flick; everyone else watches.
    if (onlineMode && window.Net) {
      Input.disable();
      flipHintEl.classList.add('hidden');
      passScreen.classList.add('hidden');
      if (p.netId === Net.selfId) {
        turnBannerEl.textContent = `${p.name}'s turn · YOU`;
        armHumanTurn();
      } else {
        turnBannerEl.textContent = `${p.name}'s turn · waiting…`;
      }
      return;
    }

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
    greatSaveActive = false;
    capLandActive   = false;
    lastFlickPower  = null;
    stopTurnTimer();
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
    } else if (onlineMode && window.Net) {
      Input.disable();
      flipHintEl.classList.add('hidden');
      if (p.netId === Net.selfId) {
        Input.enable();
        flipHintEl.classList.remove('hidden');
        startTurnTimer(FIRE_SECONDS);
      }
    } else {
      Input.enable();
      startTurnTimer(FIRE_SECONDS);   // tighter clock when ON FIRE
    }
    updateHUD();
  }

  // Edition unlocks + achievements only count when a human is in the lobby.
  // Kids were farming AI-vs-AI blitz games to unlock the whole ladder.
  function progressCounts() {
    return game.practice || game.players.some((p) => !p.isAI);
  }

  function onResult() {
    Input.disable();
    stopTurnTimer();
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
    // Cap land wins the special label over Great Save (mutually exclusive anyway).
    const counts = progressCounts();
    const rec = counts
      ? Records.recordFlip(game, { greatSave: greatSaveActive, capLand: capLandActive })
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

    // NB: achievements.js declares `const Achievements` (script scope, not on
    // window) — same gotcha as Renderer above, so feature-detect via typeof.
    if (counts && typeof Achievements !== 'undefined' && rec) {
      const fresh = Achievements.check({
        result:        game.lastResult,
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
        totalFlipsLifetime: rec.totalFlips,
        totalMakesLifetime: rec.totalMakes,
        playerCount:   game.players.length,
        ignitionsThisGame: gameStats ? gameStats.ignitionsThisGame : 0,
      });
      announceAchievements(fresh);
    }

    if (game.practice) {
      if (game.lastResult === 'MAKE') {
        if (game.plinkoPrize) {
          streakBannerEl.textContent = game.plinkoPrize === 'win'
            ? '🎰👑 PLINKO JACKPOT!' : '🎰 Plinko drop — nice!';
          streakBannerEl.className = 'streak-banner on-fire';
          Sound.play('win');
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
          game.lastResult === 'MAKE' ? 18 : 10);
      }
      if (game.lastResult === 'MAKE' && Renderer.nudge) Renderer.nudge(3);
      updateHUD();
      return;
    }

    if (game.lastResult === 'MAKE') {
      if (game.plinkoPrize) {
        // 1/1000 plinko drop — the prize IS the outcome.
        streakBannerEl.textContent =
          game.plinkoPrize === 'win' ? `🎰👑 PLINKO JACKPOT — ${p.name} WINS THE GAME!`
          : game.plinkoPrize === 'zap' ? '🎰⚡ Plinko: every opponent loses a life!'
          : '🎰❤️ Plinko: +2 lives!';
        streakBannerEl.className = 'streak-banner on-fire';
        Sound.play(game.plinkoPrize === 'win' ? 'win' : 'life');
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
      const almost = !timedOut ? nearMissLabel(landing) : null;
      streakBannerEl.textContent = timedOut
        ? `⏱ Out of time!  −${lives}`
        : (almost ? `${almost}  −${lives}` : `−${lives}`);
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
        game.lastResult === 'MAKE' ? 20 : 12);
    }
    if (game.lastResult === 'MAKE' && Renderer.nudge) Renderer.nudge(3.5);

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

  function onGameOver() {
    clearTimers();   // no stray advanceTurn/AI flick fires after the game ends
    Sound.setSuddenDeath(false);
    stopTurnTimer();
    Input.disable();
    passScreen.classList.add('hidden');

    const active = game.activePlayers();
    const loser  = game.currentPlayer();
    const finalElim = !game.practice && !!(loser && loser.eliminated);
    if (finalElim) {
      turnBannerEl.textContent = `❌ ${loser.name} is out!`;
      Sound.play('miss');
    }
    // All-CPU blitz endings shouldn't sit through the theatrical pause.
    const humansPlayed = game.players.some((p) => !p.isAI);
    const holdMs = (finalElim && humansPlayed ? GAME_OVER_HOLD_MS : 400) / gameSpeed();

    clearTimeout(gameOverTimer);
    gameOverTimer = setTimeout(() => {
      gameScreen.classList.add('hidden');
      gameOverEl.classList.remove('hidden');
      winnerNameEl.textContent = active.length ? active[0].name : '???';
      // AI-only lobbies can still finish for fun, but they do not advance the
      // unlock ladder, hall-of-fame wins, or achievements.
      let winRec = null;
      if (humansPlayed) {
        winRec = Records.recordWin(active.length ? active[0].name : null);
        renderRecordsPanel();
        // Threshold unlocks: every 4 wins earns the next character on the
        // bare-bones ladder (Alien at 100). Multiple thresholds queue reveals.
        if (active.length && window.Skins) {
          const drawn = Records.claimBoxes();
          if (drawn.length) {
            queueMysteryReveals(drawn);
            try { renderFrom(readRows()); } catch (_) {}
          }
        }
      } else {
        renderRecordsPanel();
        showToast('🤖 AI-only games don’t count toward unlocks or achievements.');
      }
      Sound.play('win');

      // Win-based achievements (display-only) — human required in the lobby.
      if (humansPlayed && typeof Achievements !== 'undefined' && active.length && gameStats) {
        const winner = active[0];
        const wIdx = game.players.indexOf(winner);
        const pp = (gameStats.perPlayer && gameStats.perPlayer[wIdx]) || { makes: 0, flips: 0, lowestLives: Infinity };
        announceAchievements(Achievements.check({
          won:              true,
          wonWithoutMiss:   pp.flips > 0 && pp.makes === pp.flips,
          droppedToOneLife: pp.lowestLives <= 1,
          sawSuddenDeath:   !!gameStats.sawSuddenDeath,
          winnerWins:       (winRec && winRec.mostWins && winRec.mostWins[winner.name]) || 0,
          playerCount:      game.players.length,
          ignitionsThisGame: gameStats.ignitionsThisGame || 0,
        }));
      }

      // Series scoreboard: tally this game's win, then show the running totals.
      if (matchWins.length !== game.players.length) matchWins = game.players.map(() => 0);
      if (game.winnerIndex >= 0 && game.winnerIndex < matchWins.length) matchWins[game.winnerIndex]++;
      renderScoreboard();
      if (gameStatsEl) gameStatsEl.innerHTML = renderGameStats();
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
  function launchFlick(vx, vy, seed, asAuthority) {
    if (evaluating) return;
    if (game.state !== GAME_STATES.TURN_START &&
        game.state !== GAME_STATES.ON_FIRE) return;

    evaluating = true;
    netAuthority = !!asAuthority;
    pendingNetResult = null;
    stopTurnTimer();
    Input.disable();
    flipHintEl.classList.add('hidden');
    Sound.unlock();
    Sound.play('flick');
    lastFlickPower = Math.min(Math.max(0, -vy) / 4000, 1);
    // Secret plinko test triggers (never online — prizes rewrite lives).
    if (!onlineMode && Physics.forcePlinko &&
        (plinkoArmed || isPlinkoName(game.currentPlayer()?.name))) {
      Physics.forcePlinko();
      plinkoArmed = false;
    }
    Physics.applyFlick(vx, vy, seed);
    // Golden flip lottery — read the seed physics actually used (it generates
    // one when we pass undefined) so local and replayed flicks agree.
    const fi = Physics.getLastFlickInfo ? Physics.getLastFlickInfo() : null;
    goldenFlipActive = !!(fi && fi.seed % 150 === 77);
    moonFlipActive = !!(fi && fi.moon);
    plinkoFlipActive = !!(fi && fi.plinko);
    if (game.practice) updatePracticeMeter(fi, false);
    if (plinkoFlipActive) {
      streakBannerEl.textContent = '🎰 PLINKO DROP! The floor is gone!';
      streakBannerEl.className = 'streak-banner on-fire';
      Sound.play('ignite');
    } else if (moonFlipActive) {
      streakBannerEl.textContent = '🌙 MOON GRAVITY!';
      streakBannerEl.className = 'streak-banner on-fire';
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
      // Flip scale 1000..3600; green 2100..2900 around the 2500 sweet spot
      if (powerBand) { powerBand.style.left = '42.3%'; powerBand.style.width = '30.8%'; }
      if (powerLabel) powerLabel.textContent = 'flick strength — green ≈ one clean flip';
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
  function sideAimPct(vx, liveDx) {
    if (liveDx != null) {
      const span = Math.max(160, window.innerWidth * 0.42);
      return Math.max(0, Math.min(100, 50 + (liveDx / span) * 50));
    }
    // Post-flick: vx px/s → same track (±2400 ≈ full width)
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
      sm.style.left = sideAimPct(info.vx || 0, info.liveDx) + '%';
      sm.classList.toggle('pm-live', !!live);
    }
  }

  function practiceMeterFromDrag(drag) {
    if (!drag) return null;
    const dx = drag.curX - drag.startX;
    const dy = drag.curY - drag.startY;
    if (Math.hypot(dx, dy) < 18) return null;
    // Distance→speed proxy matches Input's fallback (dx*10); a bit hotter so
    // the live needle reaches the green band before you release.
    let vx = dx * 12, vy = dy * 12;
    // Same equalizer as onFlick so the live needle matches the real throw.
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      vx *= 1.32; vy *= 1.32;
    } else {
      vx *= 0.92; vy *= 0.92;
    }
    return { upSpeed: Math.max(0, -vy), vx, vy, liveDx: dx };
  }

  function onFlick(vx, vy, ptrType) {
    // Flick-feel equalizer: a thumb flick on glass reports far fewer px/s than
    // a mouse sweep for the same intent, so touch gets a boost and mouse/pen a
    // small trim. AI flicks pass no pointer type and stay untouched (their
    // aim is tuned to raw speeds).
    if (ptrType === 'touch') { vx *= 1.32; vy *= 1.32; }
    else if (ptrType) { vx *= 0.92; vy *= 0.92; }
    // Online: only the current player may flick, and only on their device.
    if (onlineMode && window.Net) {
      const cur = game.currentPlayer();
      if (!cur || cur.netId !== Net.selfId) return;
      const seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
      Net.sendFlick({ vx, vy, seed, playerId: Net.selfId });
      launchFlick(vx, vy, seed, true);
      return;
    }
    launchFlick(vx, vy, undefined, false);
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
    onlineMode = false;
    netAuthority = false;
    pendingNetResult = null;
    if (window.Net) Net.leave();
    game.state = GAME_STATES.SETUP;
    gameScreen.classList.add('hidden');
    gameOverEl.classList.add('hidden');
    passScreen.classList.add('hidden');
    if (practiceMeterEl) practiceMeterEl.classList.add('hidden');
    dismissMystery();
    if (onlineScreen) onlineScreen.classList.add('hidden');
    renderRecordsPanel();
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

  // ── Online multiplayer lobby ────────────────────────────────────────────────
  function showOnlineLobby() {
    if (!onlineForm || !onlineLobby) return;
    onlineForm.classList.add('hidden');
    onlineLobby.classList.remove('hidden');
    onlineRoomCodeEl.textContent = Net.roomCode || '----';
    onlineStatusEl.textContent = Net.transport
      ? `Connected via ${Net.transport}${Net.isHost ? ' · you are host' : ''}`
      : 'Connecting…';
    if (onlineStartBtn) onlineStartBtn.classList.toggle('hidden', !Net.isHost);
    renderOnlineRoster();
  }

  function renderOnlineRoster() {
    if (!onlineRosterEl || !window.Net) return;
    const list = Net.roster;
    onlineRosterEl.innerHTML = list.map(p => `
      <div class="online-peer">
        <span class="dot" style="background:${p.color || '#4fc3f7'}"></span>
        <span>${escapeHtml(p.name || 'Player')}</span>
        ${p.host || p.id === (list.find(x => x.host) || {}).id ? '<span class="host-tag">host</span>' : ''}
        ${p.id === Net.selfId ? '<span class="host-tag">you</span>' : ''}
      </div>`).join('') || '<div class="online-status">Waiting for players…</div>';
    if (onlineStartBtn) {
      onlineStartBtn.disabled = list.length < 2;
      onlineStartBtn.textContent = list.length < 2 ? 'Need 2+ players' : 'Start Match';
    }
  }

  function onlinePlayerFromSetup() {
    const rows = readRows();
    const r0 = rows[0] || { name: '', charId: defaultCharId(), color: defaultColorFor(defaultCharId()) };
    const color = normalizeColor(r0.color || defaultColorFor(r0.charId || defaultCharId()));
    const charId = FORCE_SKIN || resolveCharForColor(r0.charId || defaultCharId(), color);
    const name = (onlineNameEl && onlineNameEl.value.trim()) ||
      (r0.name || '').trim() || defaultNameFor(charId, color);
    return {
      name,
      color,
      skin: charId,
    };
  }

  function beginOnlineMatch(defs, dir, opts) {
    onlineMode = true;
    Sound.unlock();
    enterImmersive();
    if (onlineScreen) onlineScreen.classList.add('hidden');
    setupScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    gameOverEl.classList.add('hidden');
    if (playAgainBtn) playAgainBtn.textContent = 'Play Again';
    startGame(defs, dir || 1, {
      difficulty: 'medium',
      feel: (opts && opts.feel) || chosenFeel(),
      startingLives: (opts && opts.startingLives) || chosenStartingLives(),
      startIndex: (opts && Number.isInteger(opts.startIndex)) ? opts.startIndex : undefined,
      // Default true for first match; rematch host sends newMatch: false.
      newMatch: !(opts && opts.newMatch === false),
    });
  }

  // Ports that ship without networking (Parrot Flip) hide the entry point
  // entirely rather than leaving a button that goes nowhere.
  if (onlineBtn && !ONLINE_ENABLED) onlineBtn.classList.add('hidden');
  if (onlineBtn && window.Net && ONLINE_ENABLED) {
    onlineBtn.addEventListener('click', () => {
      setupScreen.classList.add('hidden');
      onlineScreen.classList.remove('hidden');
      onlineForm.classList.remove('hidden');
      onlineLobby.classList.add('hidden');
      if (onlineNameEl && !onlineNameEl.value) {
        const r0 = readRows()[0];
        onlineNameEl.value = (r0 && r0.name) || defaultNameFor(defaultCharId());
      }
    });

    onlineBackBtn && onlineBackBtn.addEventListener('click', () => {
      Net.leave();
      onlineScreen.classList.add('hidden');
      setupScreen.classList.remove('hidden');
    });

    onlineLeaveBtn && onlineLeaveBtn.addEventListener('click', () => {
      Net.leave();
      onlineLobby.classList.add('hidden');
      onlineForm.classList.remove('hidden');
      onlineStatusEl.textContent = '';
    });

    onlineCreateBtn && onlineCreateBtn.addEventListener('click', async () => {
      try {
        onlineStatusEl.textContent = 'Creating room…';
        await Net.createRoom(onlinePlayerFromSetup());
        showOnlineLobby();
      } catch (e) {
        onlineStatusEl.textContent = 'Could not create room — try ?net=local or a relay.';
        console.error(e);
      }
    });

    onlineJoinBtn && onlineJoinBtn.addEventListener('click', async () => {
      try {
        onlineStatusEl.textContent = 'Joining…';
        await Net.joinRoom(onlineCodeEl.value, onlinePlayerFromSetup());
        showOnlineLobby();
      } catch (e) {
        onlineStatusEl.textContent = e.message || 'Join failed';
        console.error(e);
      }
    });

    onlineStartBtn && onlineStartBtn.addEventListener('click', () => {
      if (!Net.isHost || Net.roster.length < 2) return;
      const defs = Net.roster.map(p => ({
        name: p.name,
        color: p.color,
        isAI: false,
        skin: FORCE_SKIN || p.skin || BASE_SKIN,
        netId: p.id,
      }));
      const payload = {
        defs,
        direction: 1,
        startingLives: chosenStartingLives(),
        feel: chosenFeel(),
      };
      Net.startMatch(payload);
      beginOnlineMatch(defs, 1, payload);
    });

    Net.on('roster', () => {
      renderOnlineRoster();
      if (onlineStatusEl && Net.connected) {
        onlineStatusEl.textContent =
          `Connected via ${Net.transport} · ${Net.roster.length} player${Net.roster.length === 1 ? '' : 's'}`;
      }
    });
    Net.on('welcome', () => showOnlineLobby());
    Net.on('start', (msg) => {
      if (Net.isHost) return; // host already started locally
      const defs = (msg.defs || []).map(d => ({ ...d, isAI: false }));
      beginOnlineMatch(defs, msg.direction || 1, msg);
    });
    Net.on('flick', (msg) => {
      if (!onlineMode || !gameStarted) return;
      if (msg.playerId === Net.selfId) return;
      launchFlick(msg.vx, msg.vy, msg.seed, false);
    });
    Net.on('result', (msg) => {
      if (!onlineMode || !gameStarted) return;
      if (msg.playerId === Net.selfId) return;
      pendingNetResult = { result: msg.result, info: msg.info || {} };
    });
    Net.on('leave', (peerId) => {
      if (!onlineMode || !gameStarted || !peerId) return;
      const p = game.players.find(x => x.netId === peerId && !x.eliminated);
      if (!p) return;
      const wasCurrent = game.currentPlayer() === p;
      if (!game.forfeitPlayer(peerId, 'left')) return;
      showToast(`${p.name} left — forfeited.`);
      stopTurnTimer();
      Input.disable();
      clearTimeout(aiTimer);
      evaluating = false;
      pendingNetResult = null;
      netAuthority = false;
      updateHUD();
      if (wasCurrent || game.activePlayers().length <= 1) {
        // Treat like an elimination so advanceTurn can end or rotate.
        game.justEliminated = true;
        game.advanceTurn();
      }
    });
    Net.on('disconnected', () => {
      if (onlineStatusEl) onlineStatusEl.textContent = 'Disconnected — reconnecting…';
    });
    Net.on('reconnected', () => {
      if (onlineStatusEl) onlineStatusEl.textContent = 'Reconnected';
    });
  }

  // Apply persisted prefs + render the hall-of-fame
  Sound.setMuted(!Settings.sound);
  Renderer.setReduceMotion(reduceMotionActive());
  syncMuteBtn();
  if (Records.syncUnlocksFromWins) Records.syncUnlocksFromWins();
  renderRecordsPanel();

  // ── Secret: tap the two title words alternating, 3× each ───────────────────
  // Bottle Game → Bottle/Game/Bottle/Game/Bottle/Game.
  // Parrot Flip  → Parrot/Flip/Parrot/Flip/Parrot/Flip (same pattern via data-secret).
  // Unlocks every character (demo) or, if already fully unlocked, wipes progress.
  const secretParts = [...setupScreen.querySelectorAll('h1 [data-secret]')];
  if (secretParts.length >= 2) {
    const a = secretParts[0].dataset.secret;
    const b = secretParts[1].dataset.secret;
    const SECRET_SEQ = [a, b, a, b, a, b];
    let seq = [];
    let lastTap = 0;
    function triggerSecret() {
      if (!window.Skins) return;
      const allUnlocked = Skins.list().every((s) => Records.isSkinUnlocked(s.id));
      if (!allUnlocked) {
        // unlockAll also raises totalWins to the top threshold — the ladder is
        // strictly win-derived now, so plain unlockSkin calls wouldn't survive
        // the next boot reconcile.
        const fresh = Records.unlockAll ? Records.unlockAll()
          : Skins.list().filter((s) => Records.unlockSkin(s.id));
        showToast(`🔓 Secret! Unlocked everything (+${fresh.length}).`);
        Sound.play('win');
        renderFrom(readRows());
        return;
      }
      Records.resetSkinProgress();
      const defs = readRows().map((d) => {
        const id = d.charId || defaultCharId();
        const col = normalizeColor(d.color || defaultColorFor(id));
        if (isFamilyUnlocked(id)) return d;
        const wasDefault = !d.name.trim() || d.name.trim() === defaultNameFor(id, col);
        const baseCol = defaultColorFor(BASE_SKIN);
        return {
          ...d,
          charId: BASE_SKIN,
          color: baseCol,
          name: wasDefault ? defaultNameFor(BASE_SKIN, baseCol) : d.name,
        };
      });
      showToast('🔒 Secret! Progress wiped — earn it all back.');
      renderFrom(defs);
    }
    function onSecretTap(which) {
      const now = Date.now();
      if (seq.length && now - lastTap > 2500) seq = [];
      lastTap = now;
      const expect = SECRET_SEQ[seq.length];
      if (which !== expect) {
        seq = (which === SECRET_SEQ[0]) ? [which] : [];
        return;
      }
      seq.push(which);
      if (seq.length < SECRET_SEQ.length) return;
      seq = [];
      triggerSecret();
    }
    secretParts.forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSecretTap(el.dataset.secret);
      });
    });
  }

  // ── Secret: Konami code toggles party mode (keyboard / smartboard) ─────────
  {
    const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
                    'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let konamiIdx = 0;
    // Typed-word secrets (skip when focus is in a text input — player names).
    const WORDS = { plinko: () => {
      plinkoArmed = true;
      showToast('🎰 Plinko armed — next flip drops!');
      Sound.play('ignite');
    } };
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
      typed = (typed + e.key.toLowerCase()).slice(-12);
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

  // Show setup on load
  setupScreen.classList.remove('hidden');
  gameScreen.classList.add('hidden');
  gameOverEl.classList.add('hidden');
})();
