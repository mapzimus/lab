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

// Sudden death: after this many flips, ON FIRE stops minting free lives and every
// miss costs an escalating extra penalty — guarantees even high-skill games end.
const SD_THRESHOLD = 70;
const SD_STEP = 20;   // flips per escalation level (+1 extra life lost each level)

// In lobbies with MORE than this many players, an ON FIRE run is capped at
// ONFIRE_CAP_LIVES gained then passes on — so others aren't kept waiting.
const ONFIRE_CAP_PLAYERS = 4;
const ONFIRE_CAP_LIVES = 5;
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
  fireCapped: false,     // ON FIRE run hit the big-lobby +cap and passed on (no penalty)
  justEliminated: false, // last miss eliminated the current player
  endedFireBonus: 0,     // peak ON FIRE bonus from the run that just ended (stats/achievements)

  // Modes
  practice: false,       // solo free-flip practice (no lives/turns)
  difficulty: 'medium',  // AI skill: 'easy' | 'medium' | 'hard'
  practiceMakes: 0,
  practiceAttempts: 0,
  practiceStreak: 0,
  practiceBest: 0,
  turnCounter: 0,        // flips this game (drives sudden death)
  startingLives: 10,
  maxLives: 20,
  perfectLanding: false,
  capLand: false,          // last make was a rare upside-down / on-cap land (worth 2)

  // defs: [{ name, color, isAI }]
  init(defs, direction, opts = {}) {
    this.practice   = !!opts.practice;
    this.difficulty = opts.difficulty || 'medium';
    this.startingLives = STARTING_LIFE_PRESETS.includes(+opts.startingLives) ? +opts.startingLives : 10;
    // Headroom above the start count so ON FIRE can actually mint lives.
    // Classic 10-life games keep the old 20 cap; 100-life games were stuck at
    // max==start so every fire make gained 0 and immediately "Fire maxed".
    this.maxLives = Math.max(20, this.startingLives + ONFIRE_CAP_LIVES);
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

  // ── Sudden death ────────────────────────────────────────────────────────
  // resolveFlip increments turnCounter before reading SD, so UI helpers that
  // predict "this upcoming flip" must use turnCounter+1 to stay in sync.
  inSuddenDeath() { return !this.practice && this.turnCounter > SD_THRESHOLD; },
  sdLevel()       { return this.inSuddenDeath() ? Math.floor((this.turnCounter - SD_THRESHOLD) / SD_STEP) + 1 : 0; },
  sdLevelForNextFlip() {
    if (this.practice) return 0;
    const next = this.turnCounter + 1;
    return next > SD_THRESHOLD ? Math.floor((next - SD_THRESHOLD) / SD_STEP) + 1 : 0;
  },

  // Would the current player be ELIMINATED if they miss this flip? Drives the
  // "Make it or break it" intense finale. (No risk during a normal ON FIRE run,
  // since a miss there costs nothing — unless sudden death has added a cost.)
  missWouldEliminate() {
    const p = this.currentPlayer();
    if (!p || p.eliminated) return false;
    const sd = this.sdLevelForNextFlip();
    const penalty = p.isOnFire ? sd : this.pointCount + sd;
    return penalty > 0 && p.lives - penalty <= 0;
  },

  // Called by physics when bottle result is determined
  resolveFlip(result, meta = {}) {
    this.lastResult = result;
    const player = this.currentPlayer();
    const wasOnFire = player.isOnFire;   // capture BEFORE we mutate any flags

    // reset per-flip display flags
    this.lastPenalty    = 0;
    this.onFireGain     = 0;
    this.justIgnited    = false;
    this.fireEnded      = false;
    this.fireCapped     = false;
    this.justEliminated = false;
    this.endedFireBonus = 0;
    this.perfectLanding = result === 'MAKE' && !!meta.perfect;
    this.capLand        = result === 'MAKE' && !!meta.onCap;
    this.goldenFlip     = result === 'MAKE' && !!meta.golden;
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
        // +1 life per flip while ON FIRE — bounded by the match life cap. In SUDDEN
        // DEATH, ON FIRE stops minting free lives (the deflation valve) but the
        // run continues until a miss (or a real life/+5 cap below).
        // Cap lands are worth 2 lives (same rarity bonus as the stake).
        if (!sd) {
          const before = player.lives;
          player.lives    = Math.min(player.lives + worth, this.maxLives);
          this.onFireGain = player.lives - before;
          if (this.onFireGain > 0) this.onFireBonus += Math.min(worth, this.onFireGain);
        } else {
          this.onFireGain = 0;
        }
        // End the run gracefully (keep gains, NO penalty, NOT a miss) when the
        // player hits the match life cap, or when a big lobby (>4) has handed
        // out its +5 bonus lives. Do NOT treat "gain 0 because SD" as a cap —
        // that wrongly ended every SD ON FIRE make in 5+ player games.
        const hitLifeCap = player.lives >= this.maxLives;
        const hitLobbyCap = this.players.length > ONFIRE_CAP_PLAYERS &&
                            this.onFireBonus >= ONFIRE_CAP_LIVES;
        if (hitLifeCap || hitLobbyCap) {
          player.isOnFire    = false;
          player.isHeatingUp = false;
          player.streak      = 0;
          this.onFirePlayer  = null;
          this.endedFireBonus = this.onFireBonus; // preserve for Inferno / hot-run stats
          this.onFireBonus   = 0;
          this.fireCapped    = true;
        }
      } else {
        // Miss ends ON FIRE — normally NO life loss (the reward); in sudden death
        // it costs the escalating penalty so a hot player can't stall forever.
        if (sd) {
          const before = player.lives;
          player.lives     = Math.max(0, player.lives - sd);
          this.lastPenalty = before - player.lives;
          if (player.lives <= 0) { player.eliminated = true; this.justEliminated = true; }
        }
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
        player.eliminated = true;
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
    p.eliminated = true;
    p.isOnFire = false;
    p.isHeatingUp = false;
    p.streak = 0;
    if (this.onFirePlayer === p) {
      this.onFirePlayer = null;
      this.onFireBonus = 0;
    }
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
