# World XI (hosted copy)

Hosted copy of [mapzimus/world-xi-map](https://github.com/mapzimus/world-xi-map)
at https://mapzimus.com/lab/world-xi/ — an interactive 3D globe of every
top-flight club of the men's big five leagues plus the WSL and NWSL (124 clubs,
2025-26 / NWSL 2026), each at its home stadium, filterable per league.

That repo is the source of truth: the data pipeline (`scripts/build-data.mjs`,
hand-curated rosters, overrides) lives there, and `data/clubs.geojson` here is
its committed output. To update this copy, regenerate in the source repo and
re-copy `index.html`, `app.js`, `styles.css`, and `data/clubs.geojson`
(this copy's paths are absolute `/lab/world-xi/...`; the source repo's are
relative — see the head of `index.html` and `DATA_URL` in `app.js`).

Data: Wikidata (CC0). Crests are hotlinked from Wikipedia/Commons at runtime
and remain trademarks of their clubs; no crest files are committed.
Basemap: OpenFreeMap. MapLibre GL JS 5.6.1 vendored (see `vendor/README.md`).
