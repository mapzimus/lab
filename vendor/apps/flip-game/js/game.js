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

const game = {
  state: GAME_STATES.SETUP,
  players: [],
  currentPlayerIndex: 0,
  direction: 1,          // 1 = forward through array, -1 = backward
  pointCount: 1,         // current stakes
  lastResult: null,      // 'MAKE' | 'MISS'
  onFirePlayer: null,
  onFireBonus: 0,
  previousWinnerName: null,
  resultTimer: 0,        // countdown before advancing from RESULT state
  callbacks: {},

  // Per-flip display flags (set in resolveFlip, read by the HUD/banner)
  lastPenalty: 0,        // lives lost on the last miss (captured before reset)
  onFireGain: 0,         // lives gained on the last ON FIRE bonus make
  justIgnited: false,    // last make just triggered ON FIRE
  fireEnded: false,      // last miss ended an ON FIRE run (no penalty)
  justEliminated: false, // last miss eliminated the current player

  // Modes
  practice: false,       // solo free-flip practice (no lives/turns)
  difficulty: 'medium',  // AI skill: 'easy' | 'medium' | 'hard'
  practiceMakes: 0,
  practiceAttempts: 0,
  practiceStreak: 0,
  practiceBest: 0,

  // defs: [{ name, color, isAI }]
  init(defs, direction, opts = {}) {
    this.practice   = !!opts.practice;
    this.difficulty = opts.difficulty || 'medium';
    this.players = defs.map(d => ({
      name: d.name,
      color: d.color || '#0b86ff',
      isAI: !!d.isAI,
      lives: 10,
      streak: 0,
      isHeatingUp: false,
      isOnFire: false,
      eliminated: false,
    }));
    this.direction = direction;
    this.currentPlayerIndex = 0;
    this.pointCount = 1;
    this.lastResult = null;
    this.onFirePlayer = null;
    this.onFireBonus = 0;
    this.practiceMakes = this.practiceAttempts = this.practiceStreak = this.practiceBest = 0;

    // If there's a previous winner, start with them (skip in practice)
    if (!this.practice && this.previousWinnerName) {
      const idx = this.players.findIndex(p => p.name === this.previousWinnerName);
      if (idx !== -1) this.currentPlayerIndex = idx;
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

  // Called by physics when bottle result is determined
  resolveFlip(result) {
    this.lastResult = result;
    const player = this.currentPlayer();
    const wasOnFire = player.isOnFire;   // capture BEFORE we mutate any flags

    // reset per-flip display flags
    this.lastPenalty    = 0;
    this.onFireGain     = 0;
    this.justIgnited    = false;
    this.fireEnded      = false;
    this.justEliminated = false;

    // ── Practice: just track stats, no lives/streak stakes ──────────────────
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

    // ── ON FIRE bonus flips: each make = +1 life; a miss just ends the run ──
    if (wasOnFire) {
      if (result === 'MAKE') {
        this.onFireBonus = Math.min(this.onFireBonus + 1, 10);
        player.lives     = Math.min(player.lives + 1, 20);
        this.onFireGain  = 1;
      } else {
        // Miss ends ON FIRE — NO life loss (that's the reward)
        player.isOnFire    = false;
        player.isHeatingUp = false;
        player.streak      = 0;
        this.onFirePlayer  = null;
        this.onFireBonus   = 0;
        this.pointCount    = 1;     // stake clears, but it costs no lives
        this.fireEnded     = true;
      }
      this.setState(GAME_STATES.RESULT);
      return;
    }

    // ── Normal flip ─────────────────────────────────────────────────────────
    if (result === 'MAKE') {
      player.streak++;
      this.pointCount++;
      player.isHeatingUp = player.streak === 2;
      if (player.streak >= 3) {
        player.isOnFire    = true;
        player.isHeatingUp = false;
        this.onFirePlayer  = player;
        this.onFireBonus   = 0;
        this.justIgnited   = true;
      }
    } else {
      this.lastPenalty   = this.pointCount;   // capture before reset (for HUD)
      player.lives      -= this.pointCount;
      player.streak      = 0;
      player.isHeatingUp = false;
      player.isOnFire    = false;
      this.pointCount    = 1;
      if (player.lives <= 0) {
        player.lives      = 0;
        player.eliminated = true;
        this.justEliminated = true;
      }
    }

    this.setState(GAME_STATES.RESULT);
  },

  // Called after result display to advance turn
  advanceTurn() {
    // Practice: never ends — just keep flipping
    if (this.practice) { this.setState(GAME_STATES.TURN_START); return; }

    // Win check first
    const active = this.activePlayers();
    if (active.length <= 1) {
      if (active.length === 1) this.previousWinnerName = active[0].name;
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
