// achievements.js — unlockable achievement catalog + persisted unlock state.
// Pure display/meta layer: reads flip/game outcomes reported by main.js,
// never influences them. Loaded after records.js, before main.js.
//
// Progress is only awarded when main.js reports a lobby with ≥1 human player
// (AI-only spam games do not unlock anything). Locked cards show their name
// + description up front, except a few `mystery` entries that stay ???.
const Achievements = (() => {
  const KEY = 'flipgame.achievements.v1';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  // Each test(ctx) runs against the context reported for the flip/game that
  // just resolved (see main.js onResult/onGameOver) and returns true/false.
  // `rare` → gold card styling. `mystery` → name/desc hidden until unlocked.
  const CATALOG = [
    { id: 'first_flip', emoji: '🎬', name: 'First Flip',
      desc: 'Take your very first flip.',
      test: (c) => c.totalFlipsLifetime === 1 },

    { id: 'first_make', emoji: '🔩', name: 'Nailed It',
      desc: 'Land your first MAKE.',
      test: (c) => c.result === 'MAKE' && c.totalMakesLifetime === 1 },

    { id: 'ignition', emoji: '🔥', name: 'Ignition',
      desc: 'Go ON FIRE — 3 makes in a row.',
      test: (c) => !!c.justIgnited },

    { id: 'inferno', emoji: '🌋', name: 'Inferno',
      desc: 'Ride an ON FIRE run to +7 bonus lives.',
      test: (c) => c.onFireBonus >= 7 },

    { id: 'supernova', emoji: '☄️', name: 'Supernova',
      desc: 'Max out an ON FIRE run at +10 bonus lives.',
      test: (c) => c.onFireBonus >= 10 },

    { id: 'streak_master', emoji: '⚡', name: 'Streak Master',
      desc: 'String together 10 makes in a row.',
      test: (c) => c.streak >= 10 },

    { id: 'high_roller', emoji: '🎲', name: 'High Roller',
      desc: 'Make it with 8+ lives on the line.',
      test: (c) => c.result === 'MAKE' && c.pointCount >= 8 },

    { id: 'table_setter', emoji: '🏦', name: 'Table Setter',
      desc: 'Make it with 12+ lives on the line.',
      test: (c) => c.result === 'MAKE' && c.pointCount >= 12 },

    { id: 'bullseye', emoji: '🎯', name: 'Bullseye',
      desc: 'Stick a perfect, dead-vertical landing.',
      test: (c) => !!c.perfect },

    { id: 'full_send', emoji: '🚀', name: 'Full Send',
      desc: 'MAKE it on a max-power flick.',
      test: (c) => c.result === 'MAKE' && c.power != null && c.power >= 0.95 },

    { id: 'feather_touch', emoji: '🪶', name: 'Feather Touch',
      desc: 'MAKE it on a whisper-soft flick (≤25% power).',
      test: (c) => c.result === 'MAKE' && c.power != null && c.power > 0 && c.power <= 0.25 },

    { id: 'great_save', emoji: '🧤', name: 'The Great Save', rare: true, mystery: true,
      desc: 'Tip past the point of no return — and stand back up anyway.',
      test: (c) => !!c.greatSave },

    { id: 'cap_land', emoji: '🙃', name: 'Cap Land', rare: true, mystery: true,
      desc: 'Stick it upside-down on the cap — worth 2.',
      test: (c) => !!c.capLand },

    { id: 'mothership', emoji: '👽', name: 'Mothership',
      desc: 'Land the alien bank shot dead on the pad.',
      test: (c) => c.landingReason === 'on-target' },

    { id: 'smooth_operator', emoji: '🛝', name: 'Smooth Operator',
      desc: 'Miss the pad — then slide the alien onto it anyway.',
      test: (c) => c.landingReason === 'slid-on' },

    { id: 'deadeye', emoji: '🎯', name: 'Deadeye',
      desc: 'Bank the alien into the dead center of the pad.',
      test: (c) => c.landingReason === 'on-target' && c.padOffset != null && c.padOffset <= 0.22 },

    { id: 'last_one_standing', emoji: '🏆', name: 'Last One Standing',
      desc: 'Win a game with at least one human player.',
      test: (c) => !!c.won },

    { id: 'dynasty', emoji: '👑', name: 'Dynasty',
      desc: 'One name racks up 5 wins on this device.',
      test: (c) => c.winnerWins >= 5 },

    { id: 'empire', emoji: '🏰', name: 'Empire',
      desc: 'One name racks up 15 wins on this device.',
      test: (c) => c.winnerWins >= 15 },

    { id: 'iron_will', emoji: '🛡️', name: 'Iron Will',
      desc: 'Win a game after dropping to 1 life.',
      test: (c) => !!c.won && !!c.droppedToOneLife },

    { id: 'clean_sweep', emoji: '🧹', name: 'Clean Sweep',
      desc: 'Win a game without ever missing.',
      test: (c) => !!c.won && !!c.wonWithoutMiss },

    { id: 'sudden_survivor', emoji: '💀', name: 'Sudden Survivor',
      desc: 'Win a game that went to sudden death.',
      test: (c) => !!c.won && !!c.sawSuddenDeath },

    { id: 'comeback_kid', emoji: '♻️', name: 'Comeback Kid', rare: true,
      desc: 'Win after hitting 1 life AND surviving sudden death.',
      test: (c) => !!c.won && !!c.droppedToOneLife && !!c.sawSuddenDeath },

    { id: 'party_animal', emoji: '🎉', name: 'Party Animal',
      desc: 'Win a game with 6 or more players.',
      test: (c) => !!c.won && (c.playerCount || 0) >= 6 },

    { id: 'full_house', emoji: '🎱', name: 'Full House',
      desc: 'Win a packed 8-player game.',
      test: (c) => !!c.won && (c.playerCount || 0) >= 8 },

    { id: 'century_club', emoji: '💯', name: 'Century Club',
      desc: 'Reach 250 lifetime flips.',
      test: (c) => c.totalFlipsLifetime >= 250 },

    { id: 'millennial', emoji: '📚', name: 'Millennial',
      desc: 'Reach 1,000 lifetime flips.',
      test: (c) => c.totalFlipsLifetime >= 1000 },

    { id: 'hot_hands', emoji: '✋', name: 'Hot Hands',
      desc: 'Ignite ON FIRE twice in the same game.',
      test: (c) => (c.ignitionsThisGame || 0) >= 2 },

    { id: 'ghost_protocol', emoji: '👻', name: 'Ghost Protocol', rare: true, mystery: true,
      desc: 'Win a clean sweep that also went to sudden death.',
      test: (c) => !!c.won && !!c.wonWithoutMiss && !!c.sawSuddenDeath },

    { id: 'close_encounter', emoji: '🛸', name: 'Close Encounter', mystery: true,
      desc: 'Slide an alien onto the pad after missing it first.',
      test: (c) => c.landingReason === 'slid-on' && c.padOffset != null && c.padOffset <= 0.4 },
  ];

  let unlocked = load();

  function load() {
    try { return new Set(JSON.parse(localStorage.getItem(KEY)) || []); }
    catch (e) { return new Set(); }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify([...unlocked])); } catch (e) {}
  }

  // Runs every not-yet-unlocked achievement's test against ctx; unlocks and
  // returns the ones that newly hit (usually 0 or 1, occasionally more).
  function check(ctx) {
    const fresh = [];
    for (const a of CATALOG) {
      if (unlocked.has(a.id)) continue;
      let hit = false;
      try { hit = !!a.test(ctx); } catch (e) { hit = false; }
      if (hit) { unlocked.add(a.id); fresh.push(a); }
    }
    if (fresh.length) save();
    return fresh;
  }

  function list()          { return CATALOG.slice(); }
  function isUnlocked(id)  { return unlocked.has(id); }
  function unlockedCount() { return unlocked.size; }
  function total()         { return CATALOG.length; }

  function renderGridHtml() {
    return `<div class="records-title ach-heading">🏅 Achievements · ${unlocked.size}/${CATALOG.length}</div>` +
      '<div class="ach-grid">' + CATALOG.map((a) => {
        const on = unlocked.has(a.id);
        const hide = !on && a.mystery;
        const tip = hide ? 'Secret achievement — keep playing!' : a.desc;
        const name = hide ? '???' : a.name;
        const emoji = on ? a.emoji : (hide ? '🔒' : a.emoji);
        const cls = [
          'ach-card',
          on ? 'unlocked' : 'locked',
          on && a.rare ? 'rare' : '',
          hide ? 'mystery' : '',
        ].filter(Boolean).join(' ');
        return `<div class="${cls}" title="${esc(tip)}">
          <div class="ach-emoji">${emoji}</div>
          <div class="ach-name">${esc(name)}</div>
        </div>`;
      }).join('') + '</div>';
  }

  function reset() { unlocked = new Set(); save(); }

  return { check, list, isUnlocked, unlockedCount, total, renderGridHtml, reset };
})();
