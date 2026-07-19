/*
 * Captain Bellamy — campaign data
 *
 * Ship-management game: short prompts, crew decisions, resource bars.
 * Almost no long reading. Historical bones of Samuel Bellamy + Whydah.
 */
window.CAMPAIGN = {
  startPhase: "ashore",
  shipName: "Marianne",
  goalDays: 28,

  /* ---------- Crew you can boss around ---------- */
  crew: [
    {
      id: "williams",
      name: "Williams",
      role: "Quartermaster",
      skill: "fair",
      mood: 70,
      tip: "Keeps shares fair. Boosts gold finds."
    },
    {
      id: "julian",
      name: "Julian",
      role: "Pilot",
      skill: "sail",
      mood: 65,
      tip: "Reads wind and water. Best in storms."
    },
    {
      id: "davis",
      name: "Davis",
      role: "Carpenter",
      skill: "repair",
      mood: 60,
      tip: "Fixes the ship. Needs wood & rest."
    },
    {
      id: "teach",
      name: "Teach",
      role: "Gunner",
      skill: "fight",
      mood: 55,
      tip: "Loves a scrap. Risky, loud, effective.",
      joinPhase: "hornigold",
      leavePhase: "captain"
    },
    {
      id: "goat",
      name: "Bartholomew",
      role: "Ship's Goat",
      skill: "cheer",
      mood: 80,
      tip: "Eats hats. Raises morale. Chaos.",
      joinPhase: "captain"
    }
  ],

  /* ---------- Voyage phases (story spine, light on words) ---------- */
  phases: {
    ashore: {
      id: "ashore",
      title: "Cape Cod",
      ship: "No ship yet",
      art: "shore",
      blurb: "You are Sam Bellamy. Get a crew. Chase Spanish gold.",
      days: 3,
      next: "florida",
      unlockShip: false
    },
    florida: {
      id: "florida",
      title: "Florida Coast",
      ship: "Sloop",
      art: "florida",
      blurb: "Wrecks full of silver. Dig, or starve.",
      days: 4,
      next: "hornigold"
    },
    hornigold: {
      id: "hornigold",
      title: "With Hornigold",
      ship: "Marianne",
      art: "nassau",
      blurb: "Old Ben teaches the pirate trade. Learn fast.",
      days: 4,
      next: "captain"
    },
    captain: {
      id: "captain",
      title: "Captain Bellamy",
      ship: "Marianne",
      art: "chase",
      blurb: "The crew elected YOU. Run the ship your way.",
      days: 5,
      next: "whydah",
      setShip: "Marianne"
    },
    whydah: {
      id: "whydah",
      title: "Hunt the Whydah",
      ship: "Marianne",
      art: "whydah",
      blurb: "A fat slave ship packed with gold. Take her.",
      days: 4,
      next: "north",
      setShip: "Whydah Gally"
    },
    north: {
      id: "north",
      title: "Sail for Home",
      ship: "Whydah Gally",
      art: "treasure",
      blurb: "Gold below. Cape Cod ahead. Keep the crew together.",
      days: 5,
      next: "storm"
    },
    storm: {
      id: "storm",
      title: "The Nor'easter",
      ship: "Whydah Gally",
      art: "storm",
      blurb: "April 1717. The sky goes black. Hold the wheel.",
      days: 3,
      next: null,
      final: true
    }
  },

  /* ---------- Daily captain orders (management verbs) ---------- */
  actions: [
    {
      id: "sail",
      label: "Order: Make sail",
      icon: "⛵",
      hint: "Push north. Burns food. Advances the voyage.",
      phases: ["florida", "hornigold", "captain", "whydah", "north", "storm"],
      cost: { food: 2 },
      effects: { renown: 1 },
      advance: 1,
      log: "Canvas up. The ship leans into the wind."
    },
    {
      id: "hunt",
      label: "Order: Hunt a prize",
      icon: "⚔️",
      hint: "Chase a merchant. Risk the hull. Win gold.",
      phases: ["hornigold", "captain", "whydah", "north"],
      requires: { hull: 20, morale: 25 },
      effects: { gold: 8, renown: 2, food: 3, hull: -6, morale: -4 },
      log: "You take a prize. Gold comes aboard. So do bruises.",
      minigameChance: 0.45,
      minigame: "duel"
    },
    {
      id: "ration",
      label: "Order: Fair shares",
      icon: "🪙",
      hint: "Williams divides loot. Crew cheers. Gold dips.",
      phases: ["florida", "hornigold", "captain", "whydah", "north"],
      requires: { gold: 5 },
      effects: { gold: -5, morale: 12, food: 2 },
      crewBoost: { williams: 10 },
      log: "Williams counts coins. Nobody cheats today."
    },
    {
      id: "repair",
      label: "Order: Patch the hull",
      icon: "🔨",
      hint: "Davis works timber. Slow day. Safer ship.",
      phases: ["florida", "hornigold", "captain", "whydah", "north", "storm"],
      effects: { hull: 14, food: -1, morale: -2 },
      crewBoost: { davis: 12 },
      advance: 0,
      log: "Hammers ring. The leaks quiet down."
    },
    {
      id: "feast",
      label: "Order: Feast tonight",
      icon: "🍖",
      hint: "Spend food. Raise spirits. Goat approves.",
      phases: ["ashore", "florida", "hornigold", "captain", "whydah", "north"],
      requires: { food: 6 },
      effects: { food: -6, morale: 16 },
      crewBoost: { goat: 8 },
      log: "Fiddles, stew, and too-loud singing."
    },
    {
      id: "drill",
      label: "Order: Gun drill",
      icon: "💥",
      hint: "Teach trains the guns. Morale mixed. Ready for war.",
      phases: ["hornigold", "captain", "whydah"],
      effects: { morale: -3, renown: 2, hull: -2 },
      crewBoost: { teach: 10 },
      flag: "drilled",
      log: "Powder smoke. Teach grins like a storm."
    },
    {
      id: "scout",
      label: "Order: Send the lookout",
      icon: "🔭",
      hint: "Spot trouble early. Julian helps.",
      phases: ["florida", "hornigold", "captain", "whydah", "north", "storm"],
      effects: { food: -1, renown: 1 },
      crewBoost: { julian: 8 },
      flag: "scouted",
      log: "Eyes on the horizon. Fewer surprises.",
      minigameChance: 0.35,
      minigame: "lookout"
    },
    {
      id: "dig",
      label: "Order: Dive for silver",
      icon: "🪙",
      hint: "Florida wrecks. Cold water. Heavy pockets.",
      phases: ["florida"],
      effects: { gold: 6, food: -2, morale: -3 },
      log: "Wet sailors. Shiny coins.",
      minigameChance: 0.7,
      minigame: "dig"
    },
    {
      id: "recruit",
      label: "Order: Recruit sailors",
      icon: "🏴",
      hint: "Grow the crew. Costs gold. Raises renown.",
      phases: ["ashore", "hornigold", "captain"],
      requires: { gold: 4 },
      effects: { gold: -4, morale: 6, food: -3, renown: 2 },
      log: "New hands sign the articles."
    },
    {
      id: "rest",
      label: "Order: Easy day",
      icon: "🌙",
      hint: "No chasing. Heal morale a little. Waste a day.",
      phases: ["ashore", "florida", "hornigold", "captain", "whydah", "north"],
      effects: { morale: 8, food: -1 },
      advance: 0,
      log: "Hammocks. Cards. Quiet water."
    },
    {
      id: "maria",
      label: "Visit Maria",
      icon: "🍎",
      hint: "Orchard talk. She believes in you.",
      phases: ["ashore"],
      effects: { morale: 10, renown: 1 },
      flag: "promisedMaria",
      log: "Apple blossoms. A promise you mean to keep.",
      once: true
    },
    {
      id: "take_whydah",
      label: "Order: Board the Whydah",
      icon: "👑",
      hint: "All or nothing. Cannon first.",
      phases: ["whydah"],
      requires: { morale: 35, hull: 30 },
      effects: { gold: 25, renown: 10, hull: -10, food: 8 },
      flag: "tookWhydah",
      log: "The Whydah is yours. The crew howls.",
      minigameChance: 1,
      minigame: "cannon",
      forceAdvancePhase: true
    },
    {
      id: "helm",
      label: "Order: Take the wheel",
      icon: "🌀",
      hint: "You steer. Julian may stand with you.",
      phases: ["storm"],
      effects: { renown: 3 },
      log: "Spray in your teeth. Hold her steady.",
      minigameChance: 1,
      minigame: "helm",
      forceEnding: true
    }
  ],

  /* ---------- Short random events (1 line + 2–3 buttons) ---------- */
  events: [
    {
      id: "dice_teach",
      phases: ["hornigold"],
      art: "nassau",
      text: "Teach wants to play dice for your share.",
      choices: [
        {
          text: "Play him",
          note: "Skill game",
          minigame: "dice",
          onWin: { gold: 6, morale: 4, renown: 1 },
          onLose: { gold: -4, morale: 2 }
        },
        {
          text: "Refuse",
          note: "Keep your coins",
          effects: { morale: -4 },
          crewBoost: { teach: -8 }
        }
      ]
    },
    {
      id: "goat_hat",
      phases: ["captain", "whydah", "north"],
      art: "goat",
      text: "Bartholomew ate the bosun's hat. Again.",
      choices: [
        {
          text: "Laugh it off",
          effects: { morale: 8 },
          crewBoost: { goat: 10 },
          log: "The crew howls. The bosun buys a new hat."
        },
        {
          text: "Put the goat in the hold",
          effects: { morale: -6, food: 2 },
          crewBoost: { goat: -15 },
          log: "Quiet decks. Sulky goat."
        }
      ]
    },
    {
      id: "leak",
      phases: ["florida", "captain", "north", "storm"],
      art: "chase",
      text: "A plank splits. Seawater sneaks in.",
      choices: [
        {
          text: "Send Davis",
          requiresCrew: "davis",
          effects: { hull: 10, food: -1 },
          crewBoost: { davis: 8 },
          log: "Davis seals it. Good man."
        },
        {
          text: "Ignore it",
          effects: { hull: -12 },
          log: "The bilge gets louder."
        }
      ]
    },
    {
      id: "share_fight",
      phases: ["captain", "whydah", "north"],
      art: "boarding",
      text: "Two sailors argue over a silver cup.",
      choices: [
        {
          text: "Let Williams judge",
          requiresCrew: "williams",
          effects: { morale: 6, gold: -1 },
          crewBoost: { williams: 10 },
          log: "Fair call. Fists unclench."
        },
        {
          text: "Take the cup yourself",
          effects: { gold: 2, morale: -10 },
          log: "You win the cup. You lose respect."
        },
        {
          text: "Throw it overboard",
          effects: { morale: 4, renown: 1 },
          log: "Splash. Problem solved."
        }
      ]
    },
    {
      id: "fog_bank",
      phases: ["north", "storm", "whydah"],
      art: "fog",
      text: "Thick fog. Something big moves out there.",
      choices: [
        {
          text: "Julian takes the helm",
          requiresCrew: "julian",
          effects: { hull: 4, food: -1, renown: 1 },
          crewBoost: { julian: 10 },
          flag: "trustedJulian",
          log: "He threads the fog like a needle."
        },
        {
          text: "Press on anyway",
          effects: { hull: -8, renown: 2 },
          log: "Wood scrapes rock. Close one."
        },
        {
          text: "Drop anchor",
          effects: { food: -2, morale: -3 },
          advance: 0,
          log: "You wait. Safe, slow, hungry."
        }
      ]
    },
    {
      id: "pressed_man",
      phases: ["captain", "whydah"],
      art: "boarding",
      text: "A carpenter from a prize begs not to join.",
      choices: [
        {
          text: "Free him",
          effects: { morale: 4, renown: 3, gold: -2 },
          flag: "sparedDavis",
          log: "He still joins later — as Davis. Grateful."
        },
        {
          text: "Press him in",
          effects: { morale: -6, hull: 6 },
          crewBoost: { davis: -10 },
          log: "Extra hands. Angry eyes."
        }
      ]
    },
    {
      id: "knots_test",
      phases: ["hornigold", "captain"],
      art: "nassau",
      text: "Hornigold drills the new hands on knots.",
      choices: [
        {
          text: "You show them",
          minigame: "knots",
          onWin: { morale: 8, renown: 2 },
          onLose: { morale: -4 }
        },
        {
          text: "Let Williams teach",
          effects: { morale: 4 },
          crewBoost: { williams: 6 }
        }
      ]
    },
    {
      id: "chase_goat",
      phases: ["captain", "north"],
      art: "goat",
      text: "The goat has the cook's keys. Deck chaos.",
      choices: [
        {
          text: "Chase him yourself",
          minigame: "goatchase",
          onWin: { morale: 10, food: 2 },
          onLose: { morale: 2, food: -2 }
        },
        {
          text: "Bribe him with biscuit",
          effects: { food: -3, morale: 6 },
          crewBoost: { goat: 12 }
        }
      ]
    },
    {
      id: "navy_sail",
      phases: ["captain", "whydah", "north"],
      art: "chase",
      text: "A Navy sail on the horizon!",
      choices: [
        {
          text: "Run",
          effects: { food: -3, hull: -4, renown: 1 },
          log: "You escape. Barely."
        },
        {
          text: "Fight",
          requires: { hull: 40, morale: 40 },
          effects: { gold: 10, hull: -15, morale: -8, renown: 5 },
          log: "Smoke and splinters. You win ugly."
        },
        {
          text: "Hide in a cove",
          effects: { food: -2 },
          advance: 0,
          log: "You wait them out."
        }
      ]
    },
    {
      id: "low_food",
      phases: ["florida", "hornigold", "captain", "whydah", "north"],
      when: function (s) { return s.stats.food <= 12; },
      art: "treasure",
      text: "Hardtack's almost gone. Bellies growl.",
      choices: [
        {
          text: "Raid a fishing boat",
          effects: { food: 10, renown: -1, morale: -2 },
          log: "Fish and fear come aboard."
        },
        {
          text: "Tighten belts",
          effects: { morale: -8 },
          log: "Nobody sings tonight."
        }
      ]
    },
    {
      id: "maria_letter",
      phases: ["north"],
      requiresFlag: "promisedMaria",
      art: "bluff",
      text: "A trader brings word: Maria still watches the bluff.",
      choices: [
        {
          text: "Push harder for home",
          effects: { morale: 6, renown: 2, food: -2 },
          advance: 1,
          log: "Home pulls like a tide."
        },
        {
          text: "Stay the course",
          effects: { morale: 2 },
          log: "Steady as she goes."
        }
      ]
    },
    {
      id: "mutiny_talk",
      phases: ["captain", "whydah", "north"],
      when: function (s) { return s.stats.morale <= 30; },
      art: "battle",
      text: "Whispers below: maybe a new captain.",
      choices: [
        {
          text: "Share more gold",
          requires: { gold: 8 },
          effects: { gold: -8, morale: 18 },
          log: "Coins quiet the whispers."
        },
        {
          text: "Call them out",
          effects: { morale: -5, renown: 3 },
          log: "You stare them down. For now."
        },
        {
          text: "Feast and fiddle",
          requires: { food: 5 },
          effects: { food: -5, morale: 12 },
          log: "Music beats mutiny — tonight."
        }
      ]
    }
  ],

  /* ---------- Endings (short) ---------- */
  endings: {
    legend: {
      id: "ending_legend",
      title: "Prince of Pirates",
      badge: "Legend",
      art: "dawnbeach",
      text: "You ride the storm home. Gold. Maria. A name that lasts.",
      epilogue: "History says Bellamy died in the wreck — but legends are stubborn.",
      when: function (s) {
        return s.flags.stormHero && s.stats.renown >= 25 && s.flags.promisedMaria;
      }
    },
    pilot: {
      id: "ending_pilot",
      title: "Julian's Course",
      badge: "Master Pilot",
      art: "storm",
      text: "You trusted Julian. He finds a cut through the storm.",
      epilogue: "John Julian was real — a young Miskito pilot on the Whydah.",
      when: function (s) {
        return s.flags.stormHero && s.flags.trustedJulian;
      }
    },
    survivor: {
      id: "ending_survivor",
      title: "Washed Ashore",
      badge: "Survivor",
      art: "dawnbeach",
      text: "The Whydah breaks. You crawl onto Cape Cod sand — alive.",
      epilogue: "Only a few men survived the real wreck of 26 April 1717.",
      when: function (s) {
        return s.flags.stormTried && s.stats.hull >= 25;
      }
    },
    wreck: {
      id: "ending_wreck",
      title: "The Whydah Goes Down",
      badge: "Shipwreck",
      art: "wreck",
      text: "The nor'easter wins. The gold sinks with the ship.",
      epilogue: "Barry Clifford found the wreck in 1984. The bell still said Whydah.",
      when: function (s) { return s.flags.stormTried; }
    },
    mutiny: {
      id: "ending_mutiny",
      title: "Voted Out",
      badge: "Mutiny",
      art: "battle",
      text: "The crew has had enough. You're captain no more.",
      epilogue: "Pirate crews really did elect — and fire — their captains.",
      when: function (s) { return s.stats.morale <= 0; }
    },
    sunk: {
      id: "ending_sunk",
      title: "Hull Breach",
      badge: "Lost Ship",
      art: "wreck",
      text: "The sea comes in faster than Davis can stop it.",
      epilogue: "A pirate ship is only wood, rope, and luck.",
      when: function (s) { return s.stats.hull <= 0; }
    },
    starve: {
      id: "ending_starve",
      title: "Empty Hold",
      badge: "Starved Out",
      art: "treasure",
      text: "No food. No trust. The voyage ends in a harbor you hate.",
      epilogue: "Hunger ends more voyages than cannonballs.",
      when: function (s) { return s.stats.food <= 0 && s.stats.morale <= 15; }
    },
    caribbean: {
      id: "ending_caribbean",
      title: "Stay in the Islands",
      badge: "Caribbean King",
      art: "nassau",
      text: "You never sail for Cape Cod. The warm seas keep you.",
      epilogue: "A different choice — and a different legend.",
      when: function (s) { return s.flags.staySouth; }
    },
    farmer: {
      id: "ending_farmer",
      title: "Hang Up the Cutlass",
      badge: "Quiet Life",
      art: "farm",
      text: "Enough gold. Enough blood. You buy land and try peace.",
      epilogue: "Bellamy never got this ending. You did.",
      when: function (s) { return s.flags.retire; }
    },
    gallows: {
      id: "ending_gallows",
      title: "The Rope",
      badge: "Caught",
      art: "gallows",
      text: "The Navy boards you. The trial is short.",
      epilogue: "Many of Bellamy's world ended this way. He went to the sea instead.",
      when: function (s) { return s.flags.caught; }
    }
  },

  /* Phase-entry beats — tiny onboarding, not chapters */
  intros: {
    ashore: "Cape Cod, 1715. You have boots, a knife, and a big idea.",
    florida: "Florida wrecks. Silver under sand and surf.",
    hornigold: "Benjamin Hornigold offers a berth. Say yes.",
    captain: "The crew votes. Black Sam is captain now.",
    whydah: "There she is — the Whydah. Fat with gold.",
    north: "Turn the Whydah north. Maria's bluff is waiting.",
    storm: "The sky cracks open. This is the night that makes legends."
  }
};
