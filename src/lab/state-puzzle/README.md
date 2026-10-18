# State Puzzle

The 50 states broken apart, packed back together into one random landmass,
the cracks filled, the borders erased, the cities left where they were. The
player draws the old borders back on and is scored on how much of them the ink
found.

Everything runs in the browser (`puzzle.js`), on a raster grid at 2.5 km/px:

1. Each state is projected on its own Lambert azimuthal equal-area projection,
   so its shape and size survive, and rasterised. Alaska and Hawaii are
   bridged first so each travels as one piece.
2. Pieces are dropped onto a coarse grid from random directions and slid in
   toward the centre of the pile until they touch.
3. Cracks between pieces are healed: water near the Voronoi seam between two
   pieces and inside a large morphological closing of the union becomes land.
   Enclosed gaps under 5,000 km² silt up; bigger ones become lakes.
4. The result is painted as paper on water, cities drawn on top, and the
   player's ink is scored against the state outlines that ended up inland.
   Coasts and lake shores are free.

`?seed=…` fixes the landmass (the default is today's date, so everyone gets
the same one each day); `&rot=1` lets pieces turn.

`pipeline/states.mjs` trims the Census outlines shipped with State Extremes
down to `data/states.json`. `data/cities.json` is hand-entered: the capital
plus the biggest cities of each state.
