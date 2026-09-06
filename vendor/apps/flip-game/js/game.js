// game.js — state machine and rules (loaded first)

const GAME_STATES = {
  SETUP: 'SETUP',
  TURN_START: 'TURN_START',
  FLIPPING: 'FLIPPING',
  EVALUATING: 'EVALUATING',
  RESULT: 'RESULT',
  ON_FIRE: 'ON_FIRE',
  ELIMINATED: 'ELIMINATED',
  GAME_OVER: 'GAME_OVER',
};

// Sudden death: after this many flips, ordinary misses cost an escalating extra
// penalty. ON FIRE remains a protected reward state: its makes still add lives
// and its ending miss is still free.
const SD_THRESHOLD = 70;
const SD_STEP = 20;   // flips per escalation level (+1 extra life lost each level)

// Additive rewards (ON FIRE and Heart Rush) may raise a player to 150% of
// the selected starting lives. Odd totals round up because lives are whole.
// Explicit multiplier prizes (Double Flip / Plinko) can exceed this ceiling,
// but do not permanently raise it for later additive rewards.
const MAX_LIFE_MULTIPLIER = 1.5;
const STARTING_LIFE_PRESETS = [3, 5, 10, 20, 100];

const game = {
  state: GAME_STATES.SETUP,
  players: [],
  currentPlayerIndex: 0,
  direction: 1,          // 1 = forward through array, -1 = backward
  pointCount: 0,         // lives at risk on a miss; 0 = no stake built yet (free miss)
  lastResult: null,      // 'MAKE' | 'MISS'
  onFirePlayer: null,
  onFireBonus: 0,
  winnerIndex: 0,        // index of last game's winner (for "winner starts next")
  callbacks: {},

  // Per-flip display flags (set in resolveFlip, read by the HUD/banner)
  lastPenalty: 0,        // lives lost on the last miss (captured before reset)
  onFireGain: 0,         // lives gained on the last ON FIRE bonus make
  justIgnited: false,    // last make just triggered ON FIRE
  fireEnded: false,      // last miss ended an ON FIRE run (no penalty)
  fireCapped: false,     // ON FIRE run reached the match life ceiling and passed on
  justEliminated: false, // last miss eliminated the current player
  endedFireBonus: 0,     // peak ON FIRE bonus from the run that just ended (stats/achievements)

  // Modes
  format: 'classic',       // 'classic' | 'cup' | 'team-clash'
  practice: false,       // solo free-flip practice (no lives/turns)
  difficulty: 'medium',  // AI skill: 'easy' | 'medium' | 'hard'
  feel: 'standard',      // physics spin-curve knob: forgiving | standard | pro
  insanity: false,       // 1-in-3 weighted special-event mode (offline)
  practiceMakes: 0,
  practiceAttempts: 0,
  practiceStreak: 0,
  practiceBest: 0,
  turnCounter: 0,        // flips this game (drives sudden death)
  startingLives: 10,
  maxLives: 15,
  suddenDeathFlipThreshold: SD_THRESHOLD,
  perfectLanding: false,
  capLand: false,          // last make was a rare upside-down / on-cap land (worth 2)
  rareLifeGain: 0,         // +3 Heart Rush reward on the last successful rare flip
  doubleFlipReward: false, // last make doubled flipper lives and halved opponents
  lifeDrainTriggered: false, // last make set every opponent to one life
  lifeDrainActive: false,  // persistent sickly-green match state after Life Drain
  eventReward: null,       // normalized reward metadata for the last resolved flip

  // defs: [{ name, color, isAI }]
  init(defs, direction, opts = {}) {
    this.format = ['classic', 'cup', 'team-clash'].includes(opts.format) ? opts.format : 'classic';
    this.practice   = !!opts.practice;
    this.difficulty = opts.difficulty || 'medium';
    this.feel = ['forgiving', 'standard', 'pro'].includes(opts.feel) ? opts.feel : 'standard';
    this.insanity = !!opts.insanity;
    this.startingLives = STARTING_LIFE_PRESETS.includes(+opts.startingLives) ? +opts.startingLives : 10;
    this.maxLives = Math.ceil(this.startingLives * MAX_LIFE_MULTIPLIER);
    this.suddenDeathFlipThreshold = Number.isInteger(opts.suddenDeathFlipThreshold) &&
      opts.suddenDeathFlipThreshold >= 0 ? opts.suddenDeathFlipThreshold : SD_THRESHOLD;
    this.players = defs.map(d => ({
      name: d.name,
      color: d.color || '#0b86ff',
      isAI: !!d.isAI,
      skin: d.skin || 'bottle',   // which flippable edition this player throws
      netId: d.netId || null,    // online multiplayer peer id (null = local/pass-and-play)
      lives: this.startingLives,
      streak: 0,
      isHeatingUp: false,
      isOnFire: false,
      alwaysMagnet: false,
      eliminated: false,
    }));
    this.direction = direction;
    this.currentPlayerIndex = 0;
    this.pointCount = 0;
    this.lastResult = null;
    this.onFirePlayer = null;
    this.onFireBonus = 0;
    this.practiceMakes = this.practiceAttempts = this.practiceStreak = this.practiceBest = 0;
    this.turnCounter = 0;
    this.perfectLanding = false;
    this.capLand = false;
    this.goldenFlip = false;
    this.plinkoPrize = null;
    this.rareLifeGain = 0;
    this.doubleFlipReward = false;
    this.lifeDrainTriggered = false;
    this.lifeDrainActive = false;
    this.eventReward = null;

    // Winner-starts-next: caller passes the winner's INDEX (not name, which is
    // ambiguous when two players share a name). Ignored in practice.
    if (!this.practice && Number.isInteger(opts.startIndex) &&
        opts.startIndex >= 0 && opts.startIndex < this.players.length) {
      this.currentPlayerIndex = opts.startIndex;
    }

    this.setState(GAME_STATES.TURN_START);
  },

  setState(newState) {
    this.state = newState;
    if (this.callbacks[newState]) this.callbacks[newState]();
  },

  on(stateName, fn) {
    this.callbacks[stateName] = fn;
  },

  currentPlayer() {
    return this.players[this.currentPlayerIndex];
  },

  activePlayers() {
    return this.players.filter(p => !p.eliminated);
  },

  resetOutcomeFlags() {
    this.lastPenalty    = 0;
    this.onFireGain     = 0;
    this.justIgnited    = false;
    this.fireEnded      = false;
    this.fireCapped     = false;
    this.justEliminated = false;
    this.endedFireBonus = 0;
    this.rareLifeGain   = 0;
    this.doubleFlipReward = false;
    this.lifeDrainTriggered = false;
  },

  addLivesCapped(player, amount) {
    const before = player.lives;
    if (before >= this.maxLives) return 0;
    player.lives = Math.min(before + amount, this.maxLives);
    return player.lives - before;
  },

  applyDoubleFlipReward(player) {
    player.lives *= 2;
    for (const opponent of this.players) {
      if (opponent === player || opponent.eliminated) continue;
      opponent.lives = Math.max(1, Math.ceil(opponent.lives / 2));
    }
    this.doubleFlipReward = true;
  },

  multiplyLives(player, multiplier) {
    const factor = Number(multiplier);
    if (!Number.isFinite(factor) || factor < 0) return 0;
    const before = player.lives;
    // Explicit multipliers intentionally bypass the additive 150% ceiling.
    player.lives = Math.max(0, Math.ceil(before * factor));
    if (player.lives === 0) this.eliminatePlayer(player);
    return player.lives - before;
  },

  applyEventReward(player, meta = {}) {
    const eventId = meta.eventId || meta.rareEvent || null;
    const detail = meta.eventReward && typeof meta.eventReward === 'object'
      ? meta.eventReward : meta;
    const reward = { eventId, additive: 0, multiplier: null, opponentsHalved: false };

    if (eventId === 'rainbow-corkscrew' || eventId === 'rainbow-trail') {
      reward.additive = this.addLivesCapped(player, 1);
    } else if (eventId === 'heart-rush') {
      reward.additive = this.addLivesCapped(player, 3);
      this.rareLifeGain = reward.additive;
    } else if (eventId === 'shrink-ray') {
      reward.additive = this.addLivesCapped(player, meta.onCap ? 3 : 2);
    } else if (eventId === 'mitosis') {
      const landedCount = Number(detail.landedCount != null ? detail.landedCount : detail.landings);
      // One copy is an ordinary successful flip. Only landing both copies pays
      // the special three-life Mitosis reward.
      reward.additive = landedCount >= 2 ? this.addLivesCapped(player, 3) : 0;
    } else if (eventId === 'cap-toss') {
      reward.additive = this.addLivesCapped(player, 5);
    } else if (eventId === 'roulette-table') {
      const slots = [1, 2, 3, 4, 4, 3, 2, 1];
      const slotIndex = Number(detail.slotIndex);
      const requested = Number(detail.multiplier);
      const multiplier = Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < slots.length
        ? slots[slotIndex]
        : (Number.isInteger(requested) && requested >= 1 && requested <= 4 ? requested : 1);
      this.multiplyLives(player, multiplier);
      reward.multiplier = multiplier;
    } else if (eventId === 'double-flip') {
      this.applyDoubleFlipReward(player);
      reward.multiplier = 2;
      reward.opponentsHalved = true;
    } else if (eventId === 'life-drain') {
      this.applyLifeDrain(player);
    }

    this.eventReward = Object.freeze(reward);
    return this.eventReward;
  },

  applyLifeDrain(player) {
    for (const opponent of this.players) {
      if (opponent === player || opponent.eliminated) continue;
      opponent.lives = 1;
    }
    this.lifeDrainTriggered = true;
    this.lifeDrainActive = true;
  },

  eliminatePlayer(player) {
    player.lives = 0;
    player.eliminated = true;
    player.isOnFire = false;
    player.isHeatingUp = false;
    player.streak = 0;
    if (this.onFirePlayer === player) {
      this.onFirePlayer = null;
      this.onFireBonus = 0;
    }
  },

  // ── Sudden death ────────────────────────────────────────────────────────
  // resolveFlip increments turnCounter before reading SD, so UI helpers that
  // predict "this upcoming flip" must use turnCounter+1 to stay in sync.
  inSuddenDeath() { return !this.practice && this.turnCounter > this.suddenDeathFlipThreshold; },
  sdLevel() {
    return this.inSuddenDeath()
      ? Math.floor((this.turnCounter - this.suddenDeathFlipThreshold - 1) / SD_STEP) + 1
      : 0;
  },
  sdLevelForNextFlip() {
    if (this.practice) return 0;
    const next = this.turnCounter + 1;
    return next > this.suddenDeathFlipThreshold
      ? Math.floor((next - this.suddenDeathFlipThreshold - 1) / SD_STEP) + 1
      : 0;
  },

  // Would the current player be ELIMINATED if they miss this flip? Drives the
  // "Make it or break it" intense finale. There is never elimination risk during
  // ON FIRE: a miss ends the bonus run without charging lives.
  missWouldEliminate() {
    const p = this.currentPlayer();
    if (!p || p.eliminated) return false;
    const sd = this.sdLevelForNextFlip();
    const penalty = p.isOnFire ? 0 : this.pointCount + sd;
    return penalty > 0 && p.lives - penalty <= 0;
  },

  // ── Plinko drop resolution (1/1000 easter egg) ─────────────────────────
  // Replaces the normal make/miss outcome. Stake and ON FIRE state are
  // untouched (the drop happens "outside" the ordinary flip economy).
  //   'win'     center slot → every opponent is out; flipper wins the game
  //   'lose'    center-adjacent slots → flipper is eliminated
  //   'magnet'  inner slots → permanent magnet assistance for this match
  //   'halve'   mid slots → every opponent's lives are halved (ceil, minimum 1)
  //   'double'  outer slots → flipper's lives are doubled
  resolvePlinko(prize) {
    const prizes = ['double', 'halve', 'magnet', 'lose', 'win'];
    if (!prizes.includes(prize)) throw new RangeError('Unknown Plinko prize: ' + prize);
    const automaticLoss = prize === 'lose';
    this.lastResult = automaticLoss ? 'MISS' : 'MAKE';
    const player = this.currentPlayer();
    this.resetOutcomeFlags();
    this.perfectLanding = false;
    this.capLand        = false;
    this.goldenFlip     = false;
    this.plinkoPrize    = prize;
    this.eventReward    = Object.freeze({ eventId: 'plinko', prize });

    if (this.practice) {
      this.practiceAttempts++;
      if (automaticLoss) {
        this.practiceStreak = 0;
      } else {
        this.practiceMakes++;
        this.practiceStreak++;
        this.practiceBest = Math.max(this.practiceBest, this.practiceStreak);
        if (prize === 'magnet') player.alwaysMagnet = true;
      }
      this.setState(GAME_STATES.RESULT);
      return;
    }

    this.turnCounter++;
    if (prize === 'win') {
      for (const p of this.players) {
        if (p === player || p.eliminated) continue;
        this.eliminatePlayer(p);
      }
    } else if (prize === 'halve') {
      for (const p of this.players) {
        if (p === player || p.eliminated) continue;
        p.lives = Math.max(1, Math.ceil(p.lives / 2));
      }
    } else if (prize === 'double') {
      player.lives *= 2;
    } else if (prize === 'magnet') {
      player.alwaysMagnet = true;
    } else if (automaticLoss) {
      this.eliminatePlayer(player);
      this.justEliminated = true;
    }
    this.setState(GAME_STATES.RESULT);
  },

  // Called by physics when bottle result is determined
  resolveFlip(result, meta = {}) {
    if (meta.plinko) return this.resolvePlinko(meta.plinko);
    if (result !== 'MAKE' && result !== 'MISS') {
      throw new RangeError('Flip result must be MAKE or MISS');
    }
    this.lastResult = result;
    const player = this.currentPlayer();
    const wasOnFire = player.isOnFire;   // capture BEFORE we mutate any flags

    // Reset per-flip display flags.
    this.resetOutcomeFlags();
    this.perfectLanding = result === 'MAKE' && !!meta.perfect;
    this.capLand        = result === 'MAKE' && !!meta.onCap;
    this.goldenFlip     = result === 'MAKE' && !!meta.golden;
    this.plinkoPrize    = null;
    this.eventReward    = null;
    // Cap / upside-down makes — and the rare golden flip — are worth 2
    // (stake steps, or ON FIRE lives).
    const worth = (this.capLand || this.goldenFlip) ? 2 : 1;

    // ── Practice: just track stats, no lives/turns/sudden-death counter ─────
    if (this.practice) {
      this.practiceAttempts++;
      if (result === 'MAKE') {
        this.practiceMakes++;
        this.practiceStreak++;
        this.practiceBest = Math.max(this.practiceBest, this.practiceStreak);
      } else {
        this.practiceStreak = 0;
      }
      this.setState(GAME_STATES.RESULT);
      return;
    }

    this.turnCounter++;
    const sd = this.sdLevel();   // 0 normally; >0 once sudden death begins

    // ── ON FIRE bonus flips: each make = +1 life; a miss just ends the run ──
    if (wasOnFire) {
      if (result === 'MAKE') {
        player.streak++;
        // +1 life per flip while ON FIRE — bounded by the match life cap. This
        // reward remains active in sudden death. Multiplier prizes may already
        // have put a player above the additive cap; never clamp those lives down.
        // Cap lands are worth 2 lives (same rarity bonus as the stake).
        this.onFireGain = this.addLivesCapped(player, worth);
        if (this.onFireGain > 0) this.onFireBonus += Math.min(worth, this.onFireGain);
        this.applyEventReward(player, meta);
        // Reaching the fixed additive ceiling ends the bonus run gracefully.
        // The live streak counter advances above three until that boundary.
        if (player.lives >= this.maxLives) {
          player.isOnFire = false;
          player.isHeatingUp = false;
          player.streak = 0;
          this.onFirePlayer = null;
          this.endedFireBonus = this.onFireBonus;
          this.onFireBonus = 0;
          this.fireCapped = true;
        }
      } else {
        // Miss ends ON FIRE with NO life loss. Sudden death still penalizes
        // ordinary misses, but it must not retroactively erase a bonus run.
        player.isOnFire    = false;
        player.isHeatingUp = false;
        player.streak      = 0;
        this.onFirePlayer  = null;
        this.endedFireBonus = this.onFireBonus;
        this.onFireBonus   = 0;
        // Stake is PRESERVED across an ON FIRE run: the main game "pauses" while
        // the hot player takes bonus shots, so the communal stake the table
        // built up carries over to the next player. Only a NORMAL miss spends +
        // resets the stake; the big-lobby fire-cap path likewise preserves it.
        this.fireEnded     = true;
      }
      this.setState(GAME_STATES.RESULT);
      return;
    }

    // ── Normal flip ─────────────────────────────────────────────────────────
    if (result === 'MAKE') {
      player.streak++;
      this.pointCount += worth;   // upright +1; rare cap/upside-down +2
      this.applyEventReward(player, meta);
      player.isHeatingUp = player.streak === 2;
      if (player.streak >= 3) {
        player.isOnFire    = true;
        player.isHeatingUp = false;
        this.onFirePlayer  = player;
        this.onFireBonus   = 0;
        this.justIgnited   = true;
      }
    } else {
      const before = player.lives;
      player.lives       = Math.max(0, player.lives - (this.pointCount + sd));  // +sd in sudden death
      this.lastPenalty   = before - player.lives;   // lives ACTUALLY lost (HUD-accurate)
      player.streak      = 0;
      player.isHeatingUp = false;
      player.isOnFire    = false;
      this.pointCount    = 0;
      if (player.lives <= 0) {
        this.eliminatePlayer(player);
        this.justEliminated = true;
      }
    }

    this.setState(GAME_STATES.RESULT);
  },

  // Forfeit a player by netId (peer left / disconnected). Returns true if someone
  // was removed from play. If it was their turn, sets justEliminated so advance
  // shows the out banner then continues.
  forfeitPlayer(netId, reason) {
    if (!netId || this.practice) return false;
    const idx = this.players.findIndex(p => p.netId === netId && !p.eliminated);
    if (idx < 0) return false;
    const p = this.players[idx];
    this.eliminatePlayer(p);
    this.forfeitReason = reason || 'left';
    if (idx === this.currentPlayerIndex) this.justEliminated = true;
    return true;
  },

  // Called after result display to advance turn
  advanceTurn() {
    // Practice: never ends — just keep flipping
    if (this.practice) { this.setState(GAME_STATES.TURN_START); return; }

    // Win check first
    const active = this.activePlayers();
    if (active.length <= 1) {
      if (active.length === 1) this.winnerIndex = this.players.indexOf(active[0]);
      this.setState(GAME_STATES.GAME_OVER);
      return;
    }

    // Announce an elimination once, then re-enter to actually advance past it
    if (this.justEliminated) {
      this.justEliminated = false;
      this.setState(GAME_STATES.ELIMINATED);
      return;
    }

    // ON FIRE: same player keeps flipping until they miss
    if (this.currentPlayer().isOnFire && !this.currentPlayer().eliminated) {
      this.setState(GAME_STATES.ON_FIRE);
      return;
    }

    // Advance to next active player
    let next = this.currentPlayerIndex;
    let attempts = 0;
    do {
      next = ((next + this.direction) + this.players.length) % this.players.length;
      attempts++;
    } while (this.players[next].eliminated && attempts <= this.players.length);

    this.currentPlayerIndex = next;
    this.setState(GAME_STATES.TURN_START);
  },
};

if (typeof module === 'object' && module.exports) {
  module.exports = {
    GAME_STATES,
    SD_THRESHOLD,
    SD_STEP,
    MAX_LIFE_MULTIPLIER,
    STARTING_LIFE_PRESETS,
    game,
  };
}
