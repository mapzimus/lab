# World XI (hosted copy)

Hosted copy of [mapzimus/world-xi-map](https://github.com/mapzimus/world-xi-map)
at https://mapzimus.com/lab/world-xi/ — an interactive 3D globe of every club of
46 leagues, men's and women's, across five continents (1,039 clubs), each at its
home stadium, searchable and filterable per league. That includes the whole
United States pyramid, MLS down to the fourth tier. Only the men's big five are
shown at first; the rest switch on from the legend.

That repo is the source of truth: the data pipeline (`scripts/build-data.mjs`,
hand-curated rosters, overrides) lives there, and `data/clubs.geojson` here is
its committed output. To update this copy, regenerate in the source repo and
re-copy `index.html`, `app.js`, `styles.css`, and `data/clubs.geojson`, then
re-apply the four adaptations this copy carries: the `<title>`, the canonical
link and site favicon, absolute `/lab/world-xi/...` asset paths plus the
`← Lab` backlink in `index.html`, the `.backlink` rules in `styles.css`, and
`DATA_URL` in `app.js`. Nothing else should differ — `diff` against the source
after copying.

Data: Wikidata (CC0) plus club rosters, grounds and towns read from Wikipedia.
142 clubs in the lower US tiers have no Wikidata item, and 83 clubs are placed
on their town rather than their ground; the map labels those as approximate.
53 grounds come from OpenStreetMap, which Wikidata and Wikipedia do not carry —
so clubs.geojson is a derived database under ODbL 1.0 and must credit
"© OpenStreetMap contributors" (https://www.openstreetmap.org/copyright). Each
club's `source` field says which coordinates those are.
Crests are hotlinked from Wikipedia/Commons at runtime and remain trademarks of
their clubs; no crest files are committed.
Basemap: OpenFreeMap. MapLibre GL JS 5.6.1 vendored (see `vendor/README.md`).
