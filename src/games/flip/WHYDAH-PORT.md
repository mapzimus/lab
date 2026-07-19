# Port Grog Flip into Whydah-Unit (whydahstory.com)

This folder is a drop-in pirate reskin of Flip Game. Physics (`js/physics.js`), scoring, AI, and input are unchanged from the original.

## Copy into Whydah-Unit

1. Copy the entire `grog-flip/` directory into the [Whydah-Unit](https://github.com/mapzimus/Whydah-Unit) repo root.
2. Whitelist it in `.gitignore` (the repo ignores everything by default):

```
# Grog Flip (pirate bottle-flip game, whole folder is public)
!grog-flip/
!grog-flip/**
```

3. Link it from the site:
   - Homepage footer / games blurb → `/grog-flip/`
   - `whydah-dashboard.html` Games nav + promo → `grog-flip/`
   - Root `README.md` games list

4. After merge + GitHub Pages deploy, play at **https://whydahstory.com/grog-flip/**

## Easiest path

Apply the included patch from a Whydah-Unit checkout:

```bash
cd Whydah-Unit
git apply /path/to/flipgame/whydah-unit-grog-flip.patch
# or: git am /path/to/flipgame/whydah-unit-grog-flip.patch
```

## Pirate theme (visual / copy only)

- Amber grog bottle + cork (same hitbox silhouette)
- Night sea + ship-deck table
- Crew “grog” colors instead of Gatorade flavors
- WhydahStory navy / gold / rust palette

Live Flip Game remains at https://mapzimus.github.io/flipgame/.
