# Whydah’s Voyage

A browser game for the Whydah unit. Live the whole voyage: dive a Spanish wreck off Florida, chase down and board the *Whydah*, then run her north to Maine through ten missions of escalating ship battles, hazard, and history — and try to beat the storm the real crew never did. The main game now tells the (mostly) true story of the voyage; the tall tales and sea-monsters have their own place (see **INSANE mode**).

**Play:** open `index.html` on any static host (it is live in the site's Games menu). No build step, no libraries, nothing loaded from the network. Pure Canvas 2D in three files (`index.html`, `game.css`, `game.js`). Runs offline and on Chromebooks.

## The campaign

Ten missions, each its own leg of the real 1716–1717 voyage, each escalating in theme and difficulty. The pirate battles get **harder, distinct boss fights** as the voyage runs north:

1. **Robin Hood's Men** *(Summer 1716, the Bahamas)* — how Bellamy became a captain, and your tutorial fight. The Florida salvage was a bust, so he went on the account with Hornigold's pirates — but Hornigold wouldn't raid English ships, so the crew **voted him out and elected Bellamy**. Take the wheel, run down the English prize Hornigold wouldn't touch, force her to strike, then choose how to treat her crew — spare-and-share (the real "Robin Hood's Men") or strip her hold. Either way, the men elect you captain.
2. **The Three-Day Chase** *(February 1717)* — a pursuit, not a gun duel: no cannons. Ride the glowing **slipstream lane** behind her weaving stern to close the gap, dodging the debris and kegs she throws in her wake, then pull up **alongside her broadside** and grapple across. Clear it and **she becomes your ship** for the rest of the campaign.
3. **Windward Passage** — the island maze. Thread the narrows and fight **THE BOUNTY SLOOP** — the first real ship battle: fast, light, aimed nine-pounders, and a telegraphed raking dash across your row.
4. **Florida Straits** — ride the Gulf Stream, then **the fork**: hug the shore or stand out to sea. Each route plays differently the rest of the way north.
5. **Carolina Coast** — fog rolls in as a real visibility mask, and **THE MOONCUSSER's** false light tries to lure you onto the rocks at the narrows.
6. **Virginia Capes** — a squall leg, with wandering waterspouts, that ends against **THE POWDER BRIG**: paired broadsides, rolled powder kegs, and two live waterspouts on the field at once.
7. **Long Island Sound** — the hunting ground, capped by **THE HUNTER'S FLAGSHIP**, a three-phase man-of-war duel with broadside sweeps and ramming runs.
8. **Rhode Island Sound** — the Ghost Light stretch: night falls, and the **Palatine Light**, a burning ghost ship, crosses your bow.
9. **Cape Cod** — Goody Hallett's shore. Leave an offering or sail on — the choice follows you into the storm. Then the hardest real fight of the run: **THE KING'S BLOCKADE**, two men-of-war throwing alternating broadside sweeps and marked mortar fire, the survivor enraging when the first goes down.
10. **The Nor'easter** — the wolf pack, then the storm that sank the real Whydah — now a four-phase gauntlet (see below). Beat it and the **sea serpent** that followed you out is the one true monster of the main game; then **the Old Sow**, the real giant whirlpool off Eastport, Maine, guarding the harbor mouth.

**Between every mission but the last, you put in at port**: the run's gold banks (a death only ever costs what's been earned since the last port), and you can spend the bank on upgrades before sailing on. **A death never wipes the afternoon** — the title screen remembers the furthest mission reached and offers to resume there, and the two prologue missions (the dive and the chase) become skippable — with a small score stipend — once you've cleared them once.

## The storm — four phases

The nor'easter is no longer one long gauntlet. It comes in four named, escalating phases, each with its own banner and a tick on the progress bar:

1. **The Squall Line** — wreckage on the water and the first single lightning strikes. Learn the wheel.
2. **The Teeth** — forked lightning (two marked columns at once), gusts that grow stronger and last longer, and the first rogue waves.
3. **The Eye** — a lying calm. One breath, one guaranteed barrel, and an uneasy quiet before the worst of it.
4. **The Storm Wall** — triple-forked lightning, rogue waves that arrive in **sets** (two or three back-to-back, each needing its own brace tap), crosswind gusts, and a wandering **storm eddy** — a whirlpool that drags you off your line while you dodge everything else. Survive it and the win locks in.

## Legends and myths

Pirate history is full of stories half the crew believed. Whydah’s Voyage keeps the record in the main game and sends the legends to the multiverse — some as flavor cards, some as things you actually sail through in **INSANE mode**:

- The **Palatine Light** and the **Old Sow** are real Whydah-coast legends and stay in the main game (missions 8 and 10). The **sea serpent** after the storm is the one sanctioned monster of the main campaign.
- The **Kraken** (mission 3), the **Sharknado** (mission 6), and a mid-run **sea-serpent** encounter (mission 9) are now **INSANE-only** — they replace the real ship bosses on those legs when you sail the multiverse.
- **Goody Hallett's curse** is a real choice at Cape Cod, with a real consequence at the storm.
- **Davy Jones' Locker**, **Fiddler's Green**, **a Jonah aboard**, **the Klabautermann**, **a selkie**, **the island that swims away (Aspidochelone)**, tavern talk of **Blackbeard**, and word of **Anne Bonny and Mary Read** are all logbook cards; the mythic ones surface only in INSANE, the historical ones near where they belong.
- The **📖 Tales Logbook** on the title screen collects every card you've found, tagged **⚓ FROM THE RECORD** (real Whydah history), **🌀 SEA YARN** (the stories sailors told), or **🤯 MULTIVERSE** (insane mode only).
- Win your first career voyage and the title screen and logbook both pick up a permanent line: 1984, Barry Clifford finds the wreck.

## Whirlpools

Small whirlpools start appearing from Long Island Sound onward — a force field on top of the helm: the pull grows toward the center, and you can out-row it at the rim but not the core. **The Old Sow**, at the very end of the run, is the same physics at full screen size — the real whirlpool that guards Eastport's harbor mouth.

## Sharks — reworked

The old version put breaching sharks everywhere, and playtesters hated it. Now real sharks only show up on **the open-sea route** of the three "hunting ground" missions (Carolina through Long Island) — the fork warns you first, so choosing the open sea is choosing sharks. Where they do appear, the stalk telegraphs longer, you can shoot the fin before it ever leaps, and the leap itself is slower and shorter-range. Everywhere else, what used to be a shark fin is now a harmless jellyfish bloom.

## Combat: chains, grazes, and the Powder Blast

Every fight in the game now runs a skill loop on top of it:

- **🔥 Combo Chain.** Land hits without getting tagged and a chain climbs — every **fifth** link pays a **PLUNDER bonus** (gold + score, with a popup) and the counter heats up white → gold → orange → red. Take a hit and the chain snaps back to zero. The tension is keeping it alive.
- **✦ Graze.** An enemy cannonball that whistles past by a hair — close but no hit — rewards you and charges your blast meter. Sailing *into* the fire, and threading it, is worth points.
- **⚡ Powder Blast.** Grazes and combos fill a meter at the bottom of the screen. When it's full, press **Q** (or tap the ⚡ button on touch) to unleash a **screen-clearing broadside**: it sweeps away every shot coming at you and lands a free hit on **every** enemy on the board, plus a breath of invincibility. Save it for when the fire gets thick — or spend it to punch through a boss.

It all interlocks: hit → chain climbs → dodge close → charge → blast to survive → keep the chain going. Works in ship battles, boss fights, the chase, and open-sea sail legs alike.

## How it plays

- **Steer the whole sea.** Full 2D helm: left/right AND forward/back (arrow keys, WASD, drag, or the on-screen buttons — SPACE fires). Steering is eased — a quick tap is a small precise nudge, holding crosses at full speed, and letting go stops fast.
- **Pausable.** A ⏸ button next to the mute toggle, or Escape/P — freezes the run with a RESUME / QUIT TO TITLE panel. The tab auto-pauses when it's hidden, so a mid-class interruption never costs a run.
- **Four difficulties, meaningfully different.** **EASY** — an extra heart, a longer breath of grace after every hit, a sea full of coins and cargo, and bosses that throw one threat at a time; genuinely gentle. **HARD** — the classic tuning. **EXTREME** — tougher ships, denser hazards, a longer storm, a score bonus. **🌀 INSANE** — unlocked by beating EXTREME **or** the secret word. Difficulty now scales *every* boss's secondary threats (dashes, kegs, spouts, broadside sweeps, mortars, ramming runs), not just its hull and fire rate, so easy sheds the pile-ups instead of just softening them.
- **A lively sea, full of treasure.** Between fights the water is busy with things worth grabbing, on a steady pickup stream that's separate from the hazard stream (so the sea can be full without being deadly). A whole spread of treasure, common to rare: **coins** and drifting **coin arcs**, **cargo crates** (📦 +20g), message **bottles**, **pearls** (🦪 +18g), **gems** (💎 +30g, in five colours), **silver ingots** (🥈 +40g), and the rare **treasure chest** (💰 +70g). Wind and repair barrels too, and hearts when you're hurt.
- **Ship battles.** An escalating boss ladder — the bounty sloop, the mooncusser, the powder brig, the Hunter's flagship, and the King's blockade — plus the wolf pack before the storm.
- **Navigator games.** A sun-sight (backstaff), a depth sounding (lead line), and a speed count (log-line) — quick skill checks for points and gold.
- **Gold banks at every port**, spendable on eight upgrades: Oak Timbers, Bilge Pumps, Chain Shot, Crow's Nest, Weather Helm, Lucky Charm, Full Canvas, Long Nines. Buying Oak Timbers mid-run raises your hull cap immediately.
- **The nor'easter.** Four escalating phases (see above): forked lightning, telegraphed gusts, rogue-wave sets you brace with well-timed taps, and a wandering storm eddy in the final wall. Beat it and the win locks in — make for port, or turn and fight the Grandfather Serpent that followed you out. Either way, the Old Sow is waiting.

## v8 — the depth pass

- **A pirate-captain opening.** The prologue is the making of Bellamy: **Robin Hood's Men** (win the crew's vote by taking the prize Hornigold wouldn't) and the **Three-Day Chase** (run the Whydah down through her slipstream and board her alongside). Two exciting, historically-grounded missions before the campaign proper — no slow solo dive.
- **A boss for every mission.** New: THE MOONCUSSER (a false-light narrows gauntlet with a shootable shore battery), THE SHARKNADO (yes, really — telegraphed shark volleys, shoot the eye when it opens), and THE HUNTER'S FLAGSHIP (a three-phase man-of-war duel with broadside sweeps and ramming runs).
- **No more quick cuts.** Scenes crossfade; sail legs wind down — spawns stop early, leftover coins sweep to the ship, hazards fade, and a LEG CLEAR banner plays you out.
- **Merchant hails.** Mid-campaign, a trading brig may heave to: repairs, powder, weather gossip, mystery crates, and tea/spice cargo that pays double at your next port (if you live to reach it).
- **Ship liveries.** Nine unlockable paint schemes earned by feats — win a voyage, beat each boss, witness the ghost light untouched, speak the secret word. Pick yours in the Harbor.
- **A suggestion box.** The 📮 IDEAS button in the Harbor sends student suggestions to the class Supabase project (the same backend the photo gallery uses) via an insert-only RPC — the teacher reviews them all in the Supabase Table Editor. A local copy is kept as an offline fallback.
- **The secret word.** INSANE mode unlocks by beating EXTREME **or** by a certain word typed on the title screen (tap the locked 🌀 chip five times to speak it).
- Faster on Chromebooks (particle caps, cheaper whirlpool/sea rendering), and the multiverse traded its brainrot for the Great Meme Reset of 2026.

## INSANE mode

Beat EXTREME once — **or** speak the secret word (tap the locked 🌀 chip five times) — and the multiverse opens up. INSANE is where all the truly unrealistic content lives now, and it runs **longer than history**: the ten-mission voyage grows to **twelve**, with two mythic legs that exist only here — **Davy Jones' Locker** (rising chains on marked columns, sea chests bursting into rings, schools of the drowned) and **Poseidon's Domain** (trident bolts, summoned wave walls with gaps to thread, and a stirred whirlpool). The real ship bosses are swapped out for their legends: the bounty sloop becomes the **Kraken**, the powder brig becomes the **Sharknado**, and the King's blockade becomes a mid-run **sea-serpent**.

On top of that, every run draws **two random mutators** (coins as cheese wheels, watching gulls, big head mode, everything's bouncier) and every leg spins a chaos modifier (low gravity, a speed run, a tiny ship, mirrored steering, disco seas, upside-down gulls, everything's legally a crab, sudden night). The enemy fleet stops being ships entirely — battles and squadrons roll a **Colossal Rubber Duck**, **a Belligerent Toaster**, **a Furious Snowman** (it melts as it takes damage), **the Garden Gnome Flotilla**, **a Haunted Grand Piano**, or **Crab With A Sword** — same hp and fire rate as the ship they replace, just funnier. The final sea serpent becomes **the Sea Pug** (tennis-ball venom, a "BOOP!" when it lunges), and the last boss becomes **PUGNAROK, the three-headed good boy**. Multiverse-only logbook cards round it out. Easy/Hard/Extreme are completely untouched — the chaos is opt-in.

## Controls

Arrow keys or WASD to steer in all four directions, or drag on the sea. Space (or Enter, or the fire button) to fire — hold for a rolling broadside. On event choices, tap a button or press ← / →. Escape or P pauses. 🔇 toggles sound (off by default for the classroom). Works on phones and Chromebook touchscreens.

## Notes

- Self-contained: no dependencies, no build, no network requests.
- The history behind it: Sam Bellamy took the *Whydah* in a three-day chase in February 1717, then sailed her north until a nor'easter wrecked her off Cape Cod that April. In the game you get the chance her crew never had. Barry Clifford found the wreck in 1984 — the bell still reads THE WHYDAH GALLY 1716, the first pirate ship ever proven authentic.
- v9 ("Whydah's Voyage"): renamed from "First Sail"; split the realism so the main game tells the (mostly) true voyage while every truly-unrealistic element (Kraken, Sharknado, mid-run serpent, Davy Jones, Poseidon) moves to an expanded twelve-mission INSANE campaign; added an escalating real ship-boss ladder (bounty sloop → mooncusser → powder brig → flagship → King's blockade); rebuilt the nor'easter into four escalating phases; INSANE unlocks by beating EXTREME or the secret word. July 2026.
- v7 ("The Voyage"): rebuilt around a ten-mission campaign with a resumable, mission-scoped save, port-to-port ship upgrades, a reworked and confined shark encounter, new legend/myth event cards, whirlpools, and a full INSANE-mode comedy rebuild. July 2026.
