// achievements.js — unlockable achievement catalog + persisted unlock state.
// Pure display/meta layer: reads flip/game outcomes reported by main.js,
// never influences them. Loaded after records.js, before main.js.
const Achievements = (() => {
  const KEY = 'flipgame.achievements.v1';

  // Each test(ctx) runs against the context reported for the flip/game that
  // just resolved (see main.js recordFlip/recordGameOver call sites) and
  // returns true/false. `rare` just flags the toast/card for special styling.
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
      desc: 'Ride an ON FIRE run to +5 bonus lives.',
      test: (c) => c.onFireBonus >= 5 },

    { id: 'supernova', emoji: '☄️', name: 'Supernova',
      desc: 'Max out an ON FIRE run at +10 bonus lives.',
      test: (c) => c.onFireBonus >= 10 },

    { id: 'streak_master', emoji: '⚡', name: 'Streak Master',
      desc: 'String together 6 makes in a row.',
      test: (c) => c.streak >= 6 },

    { id: 'high_roller', emoji: '🎲', name: 'High Roller',
      desc: 'Survive a shared stake of ×6 or more.',
      test: (c) => c.result === 'MAKE' && c.pointCount >= 6 },

    { id: 'bullseye', emoji: '🎯', name: 'Bullseye',
      desc: 'Land within 5° of dead vertical.',
      test: (c) => c.result === 'MAKE' && c.finalAngle != null && Math.abs(c.finalAngle) < 0.09 },

    { id: 'full_send', emoji: '🚀', name: 'Full Send',
      desc: 'MAKE it on a max-power flick.',
      test: (c) => c.result === 'MAKE' && c.power != null && c.power >= 0.95 },

    { id: 'feather_touch', emoji: '🪶', name: 'Feather Touch',
      desc: 'MAKE it on a soft, gentle flick.',
      test: (c) => c.result === 'MAKE' && c.power != null && c.power <= 0.32 },

    { id: 'so_close_club', emoji: '😩', name: 'So Close Club',
      desc: 'Rack up 10 lifetime "So close!" near-misses.',
      test: (c) => c.soCloseCountLifetime >= 10 },

    { id: 'great_save', emoji: '🧤', name: 'The Great Save', rare: true,
      desc: 'Tip past the point of no return — and land it anyway.',
      test: (c) => !!c.greatSave },

    { id: 'last_one_standing', emoji: '🏆', name: 'Last One Standing',
      desc: 'Win a game.',
      test: (c) => !!c.won },

    { id: 'dynasty', emoji: '👑', name: 'Dynasty',
      desc: 'Win 3 games on this device.',
      test: (c) => c.gamesWonLifetime >= 3 },

    { id: 'iron_will', emoji: '🛡️', name: 'Iron Will',
      desc: 'Win a game after dropping to 1 life.',
      test: (c) => !!c.won && !!c.droppedToOneLife },

    { id: 'clean_sweep', emoji: '🧹', name: 'Clean Sweep',
      desc: 'Win a game without ever missing.',
      test: (c) => !!c.won && !!c.wonWithoutMiss },

    { id: 'century_club', emoji: '💯', name: 'Century Club',
      desc: 'Reach 100 lifetime flips.',
      test: (c) => c.totalFlipsLifetime >= 100 },
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
    return `<div class="ach-title">🏅 Achievements <span class="ach-count">${unlocked.size}/${CATALOG.length}</span></div>` +
      '<div class="ach-grid">' + CATALOG.map((a) => {
        const on = unlocked.has(a.id);
        return `<div class="ach-card${on ? ' unlocked' : ''}${on && a.rare ? ' rare' : ''}" title="${on ? a.desc : 'Locked'}">
          <div class="ach-emoji">${on ? a.emoji : '🔒'}</div>
          <div class="ach-name">${on ? a.name : '???'}</div>
        </div>`;
      }).join('') + '</div>';
  }

  function reset() { unlocked = new Set(); save(); }

  return { check, list, isUnlocked, unlockedCount, total, renderGridHtml, reset };
})();
