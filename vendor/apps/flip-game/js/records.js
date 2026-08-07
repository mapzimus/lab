// records.js — persisted lifetime stats (Hall of Fame). Pure storage + render;
// touches no rules or physics. Loaded before achievements.js and main.js.
const Records = (() => {
  const KEY = 'flipgame.records.v1';
  const DEFAULTS = {
    totalFlips:    0,
    totalMakes:    0,
    bestStreak:    0,   // longest personal run of consecutive makes, ever
    highestStake:  0,   // highest shared stake (pointCount) ever reached
    longestOnFire: 0,   // most bonus makes in one ON FIRE run
    soCloseCount:  0,   // lifetime "So close!" near-misses
    greatSaves:    0,   // lifetime rare tip-and-recover MAKEs
    gamesPlayed:   0,
    mostWins:      {},  // name -> win count
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

  // Call once per resolved flip (practice or real). `info`:
  //   { result:'MAKE'|'MISS', practice, streak, pointCount, onFireBonus, soClose, greatSave }
  // Returns a snapshot of the updated totals (handy for achievement checks
  // that need "lifetime count AFTER this flip").
  function recordFlip(info) {
    data.totalFlips++;
    if (info.result === 'MAKE') data.totalMakes++;
    if (info.streak > data.bestStreak) data.bestStreak = info.streak;
    if (!info.practice) {
      if (info.pointCount > data.highestStake) data.highestStake = info.pointCount;
      if (info.onFireBonus > data.longestOnFire) data.longestOnFire = info.onFireBonus;
    }
    if (info.soClose)   data.soCloseCount++;
    if (info.greatSave) data.greatSaves++;
    save();
    return clone(data);
  }

  function recordWin(name) {
    data.gamesPlayed++;
    if (name) data.mostWins[name] = (data.mostWins[name] || 0) + 1;
    save();
    return clone(data);
  }

  function topWinner() {
    let best = null, n = 0;
    for (const [name, c] of Object.entries(data.mostWins)) if (c > n) { best = name; n = c; }
    return best ? `${best} (${n})` : '—';
  }

  function snapshot() { return clone(data); }

  function renderHtml() {
    const pct = data.totalFlips ? Math.round(data.totalMakes / data.totalFlips * 100) : 0;
    const rows = [
      ['🏆', 'Most wins',    topWinner()],
      ['🎮', 'Games played', data.gamesPlayed],
      ['🔥', 'Best streak',  data.bestStreak],
      ['⚡', 'Top stake',    '×' + data.highestStake],
      ['🌋', 'Hottest run',  '+' + data.longestOnFire],
      ['🧤', 'Great Saves',  data.greatSaves],
      ['😩', 'So close',     data.soCloseCount],
      ['✓',  'Total makes',  data.totalMakes],
      ['Σ',  'Total flips',  data.totalFlips],
      ['%',  'Make rate',    pct + '%'],
    ];
    return '<div class="records-title">🏅 Hall of Fame</div><div class="records-grid">' +
      rows.map(([icon, key, val]) =>
        `<div class="rec-item"><span class="rec-val">${val}</span>` +
        `<span class="rec-key">${icon} ${key}</span></div>`).join('') + '</div>';
  }

  function reset() { data = clone(DEFAULTS); save(); }

  return { recordFlip, recordWin, renderHtml, snapshot, reset };
})();
