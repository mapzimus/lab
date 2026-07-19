import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
const failures = [];

/** Incomplete product mirrors — catalog may link the landing page, but deep
 *  in-app routes still live on their own domains. Skip deep href scans here. */
const skipDeepScanPrefixes = [
  path.join(output, "tappymaps") + path.sep,
  path.join(output, "geopuesto") + path.sep,
];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function localTarget(page, rawValue) {
  const value = rawValue.split(/[?#]/, 1)[0];
  if (!value) return null;
  const target = value.startsWith("/")
    ? path.join(output, value.slice(1))
    : path.resolve(path.dirname(page), value);
  return value.endsWith("/") ? path.join(target, "index.html") : target;
}

function skipDeepScan(file) {
  return skipDeepScanPrefixes.some((prefix) => file.startsWith(prefix));
}

if (!fs.existsSync(output)) {
  console.error("dist/ is missing. Run npm run build first.");
  process.exit(1);
}

const htmlFiles = walk(output).filter((file) => file.endsWith(".html"));
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  if (/mapzimus\.github\.io/i.test(markup) && !skipDeepScan(file)) {
    failures.push(`${path.relative(output, file)}: still links to mapzimus.github.io`);
  }
  if (skipDeepScan(file)) continue;
  for (const match of markup.matchAll(/(?:src|href)\s*=\s*(["'])(.*?)\1/gi)) {
    const value = match[2];
    if (/^(?:https?:|\/\/|data:|mailto:|tel:|javascript:|#|blob:)/i.test(value)) continue;
    if (/[${}]/.test(value)) continue;
    // Markdown / non-deployed docs referenced from test harnesses.
    if (/\.md$/i.test(value)) continue;
    const target = localTarget(file, value);
    if (target && !fs.existsSync(target)) {
      failures.push(`${path.relative(output, file)}: ${value} -> missing ${path.relative(output, target)}`);
    }
  }
}

const catalog = JSON.parse(fs.readFileSync(path.join(output, "data", "catalog.json"), "utf8"));
for (const item of catalog) {
  if (item.external) continue;
  if (!item.url.startsWith("/")) failures.push(`${item.slug}: catalog URL is not first-party (${item.url})`);
  const target = localTarget(path.join(output, "index.html"), item.url);
  if (!target || !fs.existsSync(target)) failures.push(`${item.slug}: hosted route is missing (${item.url})`);
}

if (failures.length) {
  console.error(`Link check failed:\n${failures.map((failure) => `  - ${failure}`).join("\n")}`);
  process.exit(1);
}

console.log(`Checked ${htmlFiles.length} HTML files and ${catalog.filter((i) => !i.external).length} first-party catalog routes.`);
