// records.js — persisted hall-of-fame (localStorage). Loaded before main.js.
// Pure read of game state — touches no rules or physics.
const Records = (() => {
  const KEY = 'flipgame.records.v1';
  // The edition that is free from the start. Branded ports (Parrot Flip) swap
  // this with the bottle — see window.FLIP_BRAND in skins.js.
  const BASE_SKIN =
    (typeof window !== 'undefined' && window.FLIP_BRAND && window.FLIP_BRAND.baseSkin) || 'bottle';
  const DEFAULTS = {
    bestStreak: 0,      // longest personal consecutive makes
    highestStake: 0,    // highest shared stake (pointCount) ever reached
    totalMakes: 0,
    totalFlips: 0,
    longestOnFire: 0,   // most bonus makes in one ON FIRE run
    greatSaves: 0,      // lifetime tip-past-the-brink-and-recover MAKEs
    capLands: 0,        // lifetime rare upside-down / on-cap MAKEs (worth 2)
    mostWins: {},       // name -> win count
    totalWins: 0,       // wins on this device, across all players — drives skin unlocks
    unlockedSkins: [BASE_SKIN],  // flippable editions earned on this device
  };
  let data = load();

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      const data = raw ? { ...clone(DEFAULTS), ...JSON.parse(raw) } : clone(DEFAULTS);
      // Gold Trophy edition was replaced by Buildings — migrate any saved unlock.
      if (Array.isArray(data.unlockedSkins)) {
        const before = data.unlockedSkins.join(',');
        data.unlockedSkins = [...new Set(
          data.unlockedSkins.map((id) => id === 'trophy_gold' ? 'buildings' : id)
        )];
        if (data.unlockedSkins.join(',') !== before) {
          try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
        }
      } else {
        data.unlockedSkins = [BASE_SKIN];
      }
      return data;
    } catch (e) { return clone(DEFAULTS); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }

  // ── Threshold unlocks (bare-bones ladder) ──────────────────────────────────
  // Free bottle at 0 wins, then one character every 4 wins up to Alien at 100.
  // No random mystery draws — the ladder order in Skins.list() is the order.
  const WINS_PER_BOX = 4;   // kept name for main.js UI (“wins to next unlock”)

  function allChars() {
    return (typeof window !== 'undefined' && window.Skins && typeof Skins.list === 'function')
      ? Skins.list() : [];
  }
  function lockedChars() { return allChars().filter((s) => !isSkinUnlocked(s.id)); }

  // STRICT ladder reconcile: the collection is a pure function of totalWins.
  // Rebuilds unlockedSkins from thresholds, which both grants anything newly
  // earned AND drops out-of-order leftovers (legacy random mystery-box draws,
  // retired edition ids) so the tree always unlocks in sequence.
  // Returns the ids that were newly granted (for the reveal animation).
  function grantEarnedUnlocks() {
    const chars = allChars();
    if (!chars.length) return [];
    const wins = data.totalWins || 0;
    const before = new Set(unlockedSkins());
    const next = [BASE_SKIN];
    for (const c of chars) {
      if (c.unlock != null && wins >= c.unlock && c.id !== BASE_SKIN) next.push(c.id);
    }
    const newly = next.filter((id) => !before.has(id));
    const changed = newly.length > 0 ||
      next.length !== before.size || next.some((id) => !before.has(id)) ||
      [...before].some((id) => !next.includes(id));
    if (changed) {
      data.unlockedSkins = next;
      save();
    }
    return newly;
  }

  // Demo secret (title taps): unlock the whole ladder by granting the win
  // total that earns it — the collection is a pure function of totalWins, so
  // anything less would be revoked by the next boot reconcile.
  function unlockAll() {
    const need = Math.max(0, ...allChars().map((c) => c.unlock || 0));
    if ((data.totalWins || 0) < need) data.totalWins = need;
    return grantEarnedUnlocks();
  }

  function pendingBoxes() {
    // How many threshold unlocks are earned but not yet in unlockedSkins.
    const wins = data.totalWins || 0;
    return allChars().filter((c) => c.unlock != null && wins >= c.unlock && !isSkinUnlocked(c.id)).length;
  }
  function winsToNextBox() {
    const wins = data.totalWins || 0;
    const next = allChars()
      .filter((c) => c.unlock != null && !isSkinUnlocked(c.id))
      .map((c) => c.unlock)
      .sort((a, b) => a - b)[0];
    return next == null ? 0 : Math.max(0, next - wins);
  }

  // BOOT: quietly reconcile the collection with totalWins (returning players,
  // migrations from the random mystery-box era, branded ports).
  function syncUnlocksFromWins() {
    return grantEarnedUnlocks();
  }

  // GAME OVER: grant newly earned unlocks for the reveal animation.
  function claimBoxes() {
    if (!allChars().length) return [];
    return grantEarnedUnlocks();
  }

  // Call AFTER each game.resolveFlip() (normal play and practice).
  // `extra` carries display-only flip detail from main.js (e.g. greatSave).
  // Returns a snapshot of the updated totals so achievement checks can read
  // "lifetime count AFTER this flip" without a second load.
  function recordFlip(g, extra) {
    data.totalFlips++;
    if (g.lastResult === 'MAKE') data.totalMakes++;
    const streak = g.practice ? g.practiceStreak : (g.currentPlayer()?.streak || 0);
    if (streak > data.bestStreak) data.bestStreak = streak;
    if (g.pointCount > data.highestStake) data.highestStake = g.pointCount;
    if (g.onFireBonus > data.longestOnFire) data.longestOnFire = g.onFireBonus;
    if ((g.endedFireBonus || 0) > data.longestOnFire) data.longestOnFire = g.endedFireBonus;
    if (extra && extra.greatSave) data.greatSaves = (data.greatSaves || 0) + 1;
    if (extra && extra.capLand) data.capLands = (data.capLands || 0) + 1;
    save();
    return clone(data);
  }
  function recordWin(name) {
    if (!name) return clone(data);
    data.mostWins[name] = (data.mostWins[name] || 0) + 1;
    data.totalWins = (data.totalWins || 0) + 1;
    save();
    return clone(data);
  }
  function totalWins() { return data.totalWins || 0; }
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
      ['🧤', 'Great Saves', data.greatSaves || 0],
      ['🙃', 'Cap lands',   data.capLands || 0],
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
    if (!Array.isArray(data.unlockedSkins)) data.unlockedSkins = [BASE_SKIN];
    if (!data.unlockedSkins.includes(BASE_SKIN)) data.unlockedSkins.unshift(BASE_SKIN);
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
  // Wipe ONLY the unlock ladder (editions + the win counter that drives it).
  // Hall-of-fame stats stay — "start the collection over" shouldn't erase the
  // party's records. Both fields must clear together: zeroing the skins while
  // keeping totalWins would re-unlock everything at the next game over.
  function resetSkinProgress() {
    data.totalWins = 0;
    data.unlockedSkins = [BASE_SKIN];
    save();
  }

  return { recordFlip, recordWin, renderHtml, reset, totalWins, unlockedSkins,
           isSkinUnlocked, unlockSkin, unlockAll, resetSkinProgress,
           syncUnlocksFromWins, claimBoxes, pendingBoxes, winsToNextBox,
           WINS_PER_BOX };
})();
