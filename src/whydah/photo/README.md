# Photography Unit — `/photo`

A small standalone section of whydahstory.com for the photography unit, reachable at
**https://whydahstory.com/photo**. It is deliberately separate from the pirate curriculum
site (different audience) and is not linked from the main dashboard.

## Pages

| Page | URL | Purpose |
|------|-----|---------|
| `index.html` | `/photo` | Landing page linking the three tools below. |
| `map.html` | `/photo/map.html` | The **Salem Photography Walks** scouting map — 17 walkable shooting spots around Collins Middle School, color-coded by category (nature / historic / urban / train), each with a walking time from the school, plus a true 5/10/15-minute pedestrian walk-shed and the commuter rail line. Draggable pins, GeoJSON export, and print. This is a copy of the canonical map in the `maxwellhowegis` repo (`salem-photo-walk/index.html`); edit the `SPOTS` array near the top to change locations, and re-copy here if you update the master. Uses Leaflet + Tabler Icons + CARTO/Esri/OSM tiles from CDNs (the one part of `/photo` that depends on outside hosts). |
| `claim.html` | `/photo/claim.html` | **Camera photo pickup.** Teacher uploads a batch of photos from the shared digital cameras (via the "Teacher" panel at the bottom); students find their shots, tap **Claim** to put their name on one, then **Download** to their Chromebook. Students can also download all their claimed photos as a `.zip`. |
| `gallery.html` | `/photo/gallery.html` | **Student galleries.** A student uploads phone photos into a gallery they create, then opens the gallery on their Chromebook and downloads everything (individually or as a `.zip`) to edit. |

## Why this exists (the Chromebook problem)

Student Chromebooks are locked down and can't read from thumb drives, but they *can* download
files from a website that's unblocked on school WiFi. So photos go **up** to this site (from a
phone, a camera card, or the teacher's computer) and come **down** onto the Chromebook as normal
browser downloads.

## Backend

No server code — the pages talk directly to a **Supabase** project (free tier) over plain
`fetch`, so there are no external JS libraries that school WiFi might block (except Leaflet on the
map page, which degrades gracefully).

- Project URL and the **publishable/anon** key are in `photo.js`. These are safe to ship publicly.
- Storage bucket `photos` is public-read; anonymous users may **upload** but not overwrite or
  delete (enforced by row-level security policies).
- Two tables: `galleries` (student gallery metadata) and `claims` (who claimed which camera photo).
  Anyone may read and insert; nobody may update or delete via the public key. A unique constraint
  on `claims.photo_path` means the first person to claim a photo wins (others get a friendly
  "already claimed" message).

### Clearing photos between units

Everything here is meant to be temporary. To wipe it, in the Supabase dashboard for the
`whydah-photo` project:

1. **Storage → `photos`** — delete the `drops/` and `galleries/` folders.
2. **Table editor** — empty the `galleries` and `claims` tables.

### `photo.js`

Shared helpers used by all three pages: Supabase REST/Storage calls, client-side image shrinking
before upload (saves storage and upload time on the free tier), individual downloads, and a tiny
dependency-free ZIP writer for "download all" / "download my claimed photos".
