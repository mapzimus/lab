// records.js — persisted hall-of-fame (localStorage). Loaded before main.js.
// Pure read of game state — touches no rules or physics.
const Records = (() => {
  const KEY = 'flipgame.records.v1';
  const DEFAULTS = {
    bestStreak: 0,      // longest personal consecutive makes
    highestStake: 0,    // highest shared stake (pointCount) ever reached
    totalMakes: 0,
    totalFlips: 0,
    longestOnFire: 0,   // most bonus makes in one ON FIRE run
    mostWins: {},       // name -> win count
    unlockedSkins: ['bottle'],  // flippable editions earned on this device
  };
  let data = load();

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...clone(DEFAULTS), ...JSON.parse(raw) } : clone(DEFAULTS);
    } catch (e) { return clone(DEFAULTS); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }

  // Call AFTER each game.resolveFlip() (normal play and practice).
  function recordFlip(g) {
    data.totalFlips++;
    if (g.lastResult === 'MAKE') data.totalMakes++;
    const streak = g.practice ? g.practiceStreak : (g.currentPlayer()?.streak || 0);
    if (streak > data.bestStreak) data.bestStreak = streak;
    if (g.pointCount > data.highestStake) data.highestStake = g.pointCount;
    if (g.onFireBonus > data.longestOnFire) data.longestOnFire = g.onFireBonus;
    save();
  }
  function recordWin(name) {
    if (!name) return;
    data.mostWins[name] = (data.mostWins[name] || 0) + 1;
    save();
  }
  function topWinner() {
    let best = null, n = 0;
    for (const [name, c] of Object.entries(data.mostWins)) if (c > n) { best = name; n = c; }
    return best ? `${best} · ${n}` : '—';
  }
  function renderHtml() {
    const rows = [
      ['🏆', 'Most wins',   topWinner()],
      ['🔥', 'Best streak', data.bestStreak],
      ['⚡', 'Top stake',   '×' + data.highestStake],
      ['🔥', 'Hot run',     '+' + data.longestOnFire],
      ['✓',  'Total makes', data.totalMakes],
      ['Σ',  'Total flips', data.totalFlips],
    ];
    return '<div class="records-title">🏅 Hall of Fame</div><div class="records-grid">' +
      rows.map(([icon, key, val]) =>
        `<div class="rec-item"><span class="rec-val">${val}</span>` +
        `<span class="rec-key">${icon} ${key}</span></div>`).join('') + '</div>';
  }
  function reset() { data = clone(DEFAULTS); save(); }

  // ── Unlockable skins ──────────────────────────────────────────────────────
  function unlockedSkins() {
    if (!Array.isArray(data.unlockedSkins)) data.unlockedSkins = ['bottle'];
    if (!data.unlockedSkins.includes('bottle')) data.unlockedSkins.unshift('bottle');
    return data.unlockedSkins.slice();
  }
  function isSkinUnlocked(id) { return unlockedSkins().includes(id); }
  // Returns true only if this call is what newly unlocked it (for the reveal).
  function unlockSkin(id) {
    if (isSkinUnlocked(id)) return false;
    data.unlockedSkins = unlockedSkins().concat(id);
    save();
    return true;
  }

  return { recordFlip, recordWin, renderHtml, reset, unlockedSkins, isSkinUnlocked, unlockSkin };
})();
