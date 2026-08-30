// Scrape the per-park facts the boundary service does not carry: the date each
// park was established, its official acreage, its recreation visits, and a
// one-paragraph description.
//
//   node src/lab/national-parks/pipeline/02_fetch_facts.mjs
//
// Output: pipeline/raw/park-facts.json (git-ignored)
//
// Source is the English Wikipedia article "List of national parks of the United
// States", whose table columns are themselves cited to NPS publications: the
// Land Resources Division acreage report and the Visitor Use Statistics annual
// summary. Wikipedia is the transcription, NPS is the origin; both are credited
// on the page. Descriptions are CC BY-SA 4.0.
//
// The parse asserts hard on shape — 63 rows, every row with a date, an acreage
// and a visitor count — so a table restructure upstream fails the build loudly
// instead of quietly shipping blanks.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PAGE = "List of national parks of the United States";
const API =
  "https://en.wikipedia.org/w/api.php?action=parse&prop=text|revid&formatversion=2&format=json&page=" +
  encodeURIComponent(PAGE);

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "raw");
const outFile = path.join(outDir, "park-facts.json");

const res = await fetch(API, {
  headers: { "User-Agent": "mapzimus-lab/1.0 (https://mapzimus.com; mhowe.gis@gmail.com)" },
});
if (!res.ok) throw new Error(`wikipedia HTTP ${res.status}`);
const body = await res.json();
const html = body.parse?.text;
if (!html) throw new Error("no parsed HTML in the API response");

const start = html.indexOf('<table class="wikitable sortable">');
if (start < 0) throw new Error("could not find the parks table");
const table = html.slice(start, html.indexOf("</table>", start));

const ENTITIES = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#039;": "'",
  "&#39;": "'", "&nbsp;": " ", "&#160;": " ", "&ndash;": "–", "&mdash;": "—",
};
const decode = (s) =>
  s
    .replace(/&(?:amp|lt|gt|quot|#039|#39|nbsp|#160|ndash|mdash);/g, (m) => ENTITIES[m])
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

// Drop citation markers and the hidden sort-key spans before flattening to text.
const text = (fragment) =>
  decode(
    fragment
      .replace(/<sup class="reference"[\s\S]*?<\/sup>/g, "")
      .replace(/<sup[^>]*class="[^"]*reference[^"]*"[\s\S]*?<\/sup>/g, "")
      .replace(/<style[\s\S]*?<\/style>/g, "")
      .replace(/<span[^>]*style="display:none"[\s\S]*?<\/span>/g, "")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();

const rows = table.split(/<tr>/).slice(1);
const parks = [];

for (const row of rows) {
  const nameCell = /<th scope="row"[^>]*>([\s\S]*?)<\/th>/.exec(row);
  if (!nameCell) continue; // header row

  const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
  if (cells.length < 6) throw new Error(`row has ${cells.length} cells: ${text(row).slice(0, 80)}`);

  const article = /<a href="\/wiki\/([^"]+)"[^>]*title="([^"]+)"/.exec(nameCell[1]);
  if (!article) throw new Error(`no article link: ${text(nameCell[1])}`);

  const [locationCell, dateCell, areaCell, visitorCell, descriptionCell] = [
    cells[1], cells[2], cells[3], cells[4], cells[5],
  ];

  const iso = /data-sort-value="0*(\d{4})-(\d{2})-(\d{2})/.exec(dateCell);
  if (!iso) throw new Error(`no establishment date for ${decode(article[2])}`);

  const acres = /([\d,]+(?:\.\d+)?)\s*acres/.exec(decode(areaCell));
  if (!acres) throw new Error(`no acreage for ${decode(article[2])}`);

  const visitors = /^([\d,]+)$/.exec(text(visitorCell));
  if (!visitors) throw new Error(`no visitor count for ${decode(article[2])}`);

  const point = /<span class="geo">(-?[\d.]+);\s*(-?[\d.]+)<\/span>/.exec(locationCell);

  parks.push({
    article: decode(article[2]),
    wikipedia: `https://en.wikipedia.org/wiki/${article[1]}`,
    location: text(locationCell.replace(/<small>[\s\S]*?<\/small>/g, "")),
    established: `${iso[1]}-${iso[2]}-${iso[3]}`,
    acres: Number(acres[1].replace(/,/g, "")),
    visitors: Number(visitors[1].replace(/,/g, "")),
    labelPoint: point ? [Number(point[2]), Number(point[1])] : null,
    description: text(descriptionCell),
  });
}

if (parks.length !== 63) {
  throw new Error(`expected 63 national parks, parsed ${parks.length}`);
}

// The column headers name the years the figures belong to; carry them through so
// the page can label the numbers honestly instead of implying "current".
const acreageYear = /Area \((\d{4})\)/.exec(table)?.[1] ?? null;
const visitorYear = /Recreation visitors \((\d{4})\)/.exec(table)?.[1] ?? null;
if (!acreageYear || !visitorYear) throw new Error("could not read the column years");

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  outFile,
  JSON.stringify(
    {
      source: { page: PAGE, revision: body.parse.revid, retrieved: new Date().toISOString().slice(0, 10) },
      acreageYear: Number(acreageYear),
      visitorYear: Number(visitorYear),
      parks,
    },
    null,
    2,
  ),
);
console.log(`wrote ${outFile}: ${parks.length} parks, acreage ${acreageYear}, visits ${visitorYear}`);
