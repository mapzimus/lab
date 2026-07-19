import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
const failures = [];

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

if (!fs.existsSync(output)) {
  console.error("dist/ is missing. Run npm run build first.");
  process.exit(1);
}

// Single-page snapshots of multi-page apps: their internal links point at
// sub-pages that were deliberately not vendored, so skip dead-link checks
// inside them (the pages themselves are still checked as link targets).
const SNAPSHOT_APPS = ["tappymaps", "whydah", "mcas", "savvas", "geopuesto"];

const htmlFiles = walk(output).filter((file) => file.endsWith(".html"));
for (const file of htmlFiles) {
  const rel = path.relative(output, file);
  if (SNAPSHOT_APPS.some((dir) => rel === `${dir}/index.html` || rel.startsWith(`${dir}${path.sep}`))) continue;
  const html = fs.readFileSync(file, "utf8");
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  if (/mapzimus\.github\.io/i.test(markup)) {
    failures.push(`${path.relative(output, file)}: still links to mapzimus.github.io`);
  }
  for (const match of markup.matchAll(/(?:src|href)\s*=\s*(["'])(.*?)\1/gi)) {
    const value = match[2];
    if (/^(?:https?:|\/\/|data:|mailto:|tel:|javascript:|#|blob:)/i.test(value)) continue;
    if (/[${}]/.test(value)) continue;
    const target = localTarget(file, value);
    if (target && !fs.existsSync(target)) {
      failures.push(`${path.relative(output, file)}: ${value} -> missing ${path.relative(output, target)}`);
    }
  }
}

const catalog = JSON.parse(fs.readFileSync(path.join(output, "data", "catalog.json"), "utf8"));
for (const item of catalog) {
  if (item.external) continue; // external entries (e.g. tappymaps.com) keep their own URL
  if (!item.url.startsWith("/")) failures.push(`${item.slug}: catalog URL is not first-party (${item.url})`);
  const target = localTarget(path.join(output, "index.html"), item.url);
  if (!target || !fs.existsSync(target)) failures.push(`${item.slug}: hosted route is missing (${item.url})`);
}

if (failures.length) {
  console.error(`Link check failed:\n${failures.map((failure) => `  - ${failure}`).join("\n")}`);
  process.exit(1);
}

console.log(`Checked ${htmlFiles.length} HTML files and ${catalog.length} first-party catalog routes.`);
