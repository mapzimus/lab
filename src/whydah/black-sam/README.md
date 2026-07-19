# Black Sam & the Whydah

*A Choose Your Own Destiny game.*

Play the rise and reckoning of **Samuel "Black Sam" Bellamy** — the poor
English sailor who came to Cape Cod in 1715, chased a sunken Spanish treasure
fleet, turned pirate, was elected captain by his own crew, seized the slave
ship **Whydah Gally**, styled himself a "free prince" and Robin Hood of the
sea, and sailed north into the storm that made him a legend.

Your choices decide the rest.

**Play it now:** https://mapzimus.github.io/black-sam/

## Play it locally

No build step, no server, no dependencies. Just open the file:

```
open index.html      # macOS
xdg-open index.html  # Linux
start index.html     # Windows
```

## The game

A branching narrative of **50+ scenes and ten endings**, with animated SVG
scene art, four skill mini-games woven into the story, and synthesized sound
(off by default — toggle it in the header). Three stats shape your path:

| Stat | Meaning |
| --- | --- |
| **Plunder** | Your growing fortune in gold and cargo. |
| **Crew** | How fiercely your men stand with you. |
| **Renown** | The spreading legend of the Robin Hood of the Sea. |

Some choices are locked until your legend has grown — they stay visible with
a hint, so you know what a greater captain might have dared.

### Hall of Fame

Every completed voyage is scored and logged to a local **Hall of Fame**
(stored in your browser — no account, no server). Your **Legend Score**
rewards a rich, skilful, adventurous run:

- **Fortune** — your final Plunder + Crew + Renown
- **Skill** — how well you played the mini-games you attempted
- **Fate** — the ending you reached (rarer/harder endings score higher)
- **Discovery** — a bonus for every distinct ending you've ever found

The board keeps your best voyages with medals for the top three, tracks how
many of the ten endings you've discovered, and lets you log each run under a
captain's name. Reach it from the title screen or the end of any run.

### Mini-games

Each can also be delegated to the crew for a lesser reward; none blocks the
story.

- **Treasure dig** — salvage the Spanish wrecks on the Florida coast.
- **Boarding duel** — cross steel with a prize's mate, first over the rail.
- **Cannon duel** — lay the great guns yourself to take the Whydah.
- **Storm at the helm** — steer through the nor'easter; how well you hold
  the wheel (and whether the pilot John Julian stands beside you) decides
  which of the storm's five endings claims you.

### Characters

Maria Hallett of the orchard, the goldsmith Paulsgrave Williams, old
Benjamin Hornigold, a dice-playing Edward "Blackbeard" Teach, the young
Miskito pilot John Julian, the pressed carpenter Thomas Davis, Captains
Prince and Beer — every one drawn from the historical record, and every one
a thread your choices can pull.

## Historical note

The bones of the tale are true. Bellamy took over 50 ships in roughly a year,
captured the Whydah in February 1717, and drowned with nearly all ~145 of his
crew when she foundered in a nor'easter off Cape Cod on **26 April 1717**,
aged about 28. Two men reached shore alive — Thomas Davis and John Julian.
The wreck lay lost until **Barry Clifford located it in 1984** and raised a
bell reading *"THE WHYDAH GALLY 1716"* — still the only fully authenticated
pirate shipwreck ever discovered. The romance with Maria Hallett, the "Witch
of Wellfleet," is Cape Cod folklore woven through the history. Each ending
closes with a note separating what happened from what legend (or this game)
added.

## Project layout

```
index.html       # page shell + title/scene markup
css/style.css    # nautical / weathered-parchment styling + art & minigame CSS
js/story.js      # the branching narrative (scene data + storm routing)
js/engine.js     # scene renderer, stats/flags, mini-game routing, save v2
js/art.js        # hand-coded animated SVG scene illustrations
js/minigames.js  # the eight mini-games
js/audio.js      # Web Audio synthesized SFX (muted by default)
js/scoreboard.js # the local Hall of Fame (Legend Score + leaderboard)
```

The narrative lives entirely in `js/story.js` as data — add or edit scenes
without touching the engine. Scene fields `art:` and `minigame:` hook into
the art and mini-game libraries by key. Progress saves to `localStorage`, so
a **Continue Voyage** option appears if you leave mid-story.

Deployment: `.github/workflows/pages.yml` publishes the repo root to GitHub
Pages on every push to `main`.
