import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT_RELATIVE_PATH = path.join("vendor", "apps", "flip-game");
const METADATA_FILE = ".upstream.json";
const ROOT_FILES = ["index.html", "service-worker.js", "manifest.json"];
const OPTIONAL_ROOT_FILES = [".nojekyll"];
const RUNTIME_DIRECTORIES = ["css", "js", "icons"];
const RELEASE_RE = /^v\d+\.\d+$/;
const SHA_RE = /^[0-9a-f]{40}$/i;

function fail(message) {
  throw new Error(`Flipgame sync refused: ${message}`);
}

function samePath(left, right) {
  const normalize = (value) => {
    const resolved = path.resolve(value);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

function isSameOrInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return !relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function assertPathInside(parent, candidate, label = "path") {
  const base = path.resolve(parent);
  const target = path.resolve(candidate);
  const relative = path.relative(base, target);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail(`${label} escapes or aliases its required parent`);
  }
  return target;
}

function assertDirectory(target, label) {
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch {
    fail(`${label} does not exist: ${target}`);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`${label} must be a real directory: ${target}`);
  return fs.realpathSync(target);
}

function assertNoSymlinkChain(base, candidate, label) {
  const relative = path.relative(base, candidate);
  let current = base;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) continue;
    if (fs.lstatSync(current).isSymbolicLink()) fail(`${label} traverses a symbolic link: ${current}`);
  }
}

function git(root, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) fail(`could not run git: ${result.error.message}`);
  if (result.status !== 0 && !allowFailure) {
    fail(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`);
  }
  return result;
}

function toRuntimePath(value) {
  return value.split(path.sep).join("/");
}

function isAllowedRuntimePath(relativePath) {
  const clean = toRuntimePath(path.normalize(relativePath)).replace(/^\.\//, "");
  if (!clean || clean === "." || clean.startsWith("../") || path.isAbsolute(clean)) return false;
  if (ROOT_FILES.includes(clean) || OPTIONAL_ROOT_FILES.includes(clean)) return true;
  return RUNTIME_DIRECTORIES.some((directory) => clean.startsWith(`${directory}/`));
}

function walkRuntimeFiles(root, relativeDirectory) {
  const directory = path.join(root, relativeDirectory);
  if (!fs.existsSync(directory)) fail(`missing critical runtime directory: ${relativeDirectory}/`);
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`${relativeDirectory}/ must be a real directory`);
  const found = [];
  const walk = (current, relative) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      const next = path.join(relative, entry.name);
      const actual = fs.lstatSync(full);
      if (actual.isSymbolicLink()) fail(`runtime asset is a symbolic link: ${toRuntimePath(next)}`);
      if (actual.isDirectory()) walk(full, next);
      else if (actual.isFile()) found.push(toRuntimePath(next));
      else fail(`runtime asset is not a regular file: ${toRuntimePath(next)}`);
    }
  };
  walk(directory, relativeDirectory);
  if (!found.length) fail(`${relativeDirectory}/ contains no runtime assets`);
  return found;
}

function requireFile(root, relativePath) {
  const full = path.join(root, relativePath);
  if (!fs.existsSync(full)) fail(`missing critical runtime asset: ${toRuntimePath(relativePath)}`);
  const stat = fs.lstatSync(full);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`critical runtime asset is not a regular file: ${toRuntimePath(relativePath)}`);
  return full;
}

function validateManifest(upstreamRoot) {
  const manifestPath = requireFile(upstreamRoot, "manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail(`manifest.json is invalid JSON: ${error.message}`);
  }
  if (manifest.start_url !== "./" || manifest.scope !== "./") {
    fail('manifest.json must use relative start_url and scope values of "./"');
  }
  if (!Array.isArray(manifest.icons) || !manifest.icons.length) fail("manifest.json has no icons");
  for (const icon of manifest.icons) {
    const relative = String(icon?.src || "").replace(/^\.\//, "");
    if (!relative.startsWith("icons/") || !isAllowedRuntimePath(relative)) fail(`manifest icon path is unsafe: ${icon?.src || "(empty)"}`);
    requireFile(upstreamRoot, relative);
  }
}

function validateLocalReferences(upstreamRoot, runtimeFiles) {
  const runtimeSet = new Set(runtimeFiles);
  const index = fs.readFileSync(path.join(upstreamRoot, "index.html"), "utf8");
  for (const match of index.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
    const raw = match[1];
    if (!raw || raw.startsWith("#") || /^(?:[a-z]+:|\/\/)/i.test(raw)) continue;
    const relative = raw.split(/[?#]/, 1)[0].replace(/^\.\//, "");
    if (!isAllowedRuntimePath(relative) || !runtimeSet.has(relative)) {
      fail(`index.html references an asset outside the runtime allowlist or missing from source: ${raw}`);
    }
  }

  const worker = fs.readFileSync(path.join(upstreamRoot, "service-worker.js"), "utf8");
  const precache = worker.match(/const\s+PRECACHE_URLS\s*=\s*\[([\s\S]*?)\];/);
  if (!precache) fail("service-worker.js has no static PRECACHE_URLS array");
  for (const match of precache[1].matchAll(/["'](\.\/?[^"']*)["']/g)) {
    const raw = match[1];
    const relative = raw.replace(/^\.\//, "").split(/[?#]/, 1)[0];
    if (!relative) continue;
    if (!isAllowedRuntimePath(relative) || !runtimeSet.has(relative)) {
      fail(`service-worker.js precaches an asset outside the runtime allowlist or missing from source: ${raw}`);
    }
  }
}

function validateRelease(upstreamRoot, expectedRelease) {
  if (expectedRelease != null && !RELEASE_RE.test(expectedRelease)) fail(`invalid expected release label: ${expectedRelease}`);
  const interfacesPath = requireFile(upstreamRoot, path.join("js", "v111-interfaces.js"));
  const interfaces = fs.readFileSync(interfacesPath, "utf8");
  const runtimeRelease = interfaces.match(/\bRELEASE_VERSION\s*=\s*["'](v\d+\.\d+)["']/)?.[1];
  const release = expectedRelease || runtimeRelease;
  if (!release || !RELEASE_RE.test(release)) fail(`runtime release version is invalid or missing: ${runtimeRelease || "missing"}`);
  if (runtimeRelease !== release) fail(`runtime release version is ${runtimeRelease || "missing"}, expected ${release}`);

  const index = fs.readFileSync(path.join(upstreamRoot, "index.html"), "utf8");
  const badge = index.match(/<[^>]+id=["']version-badge["'][^>]*>\s*(v\d+\.\d+)\s*<\//i)?.[1];
  if (badge !== release) fail(`visible version badge is ${badge || "missing"}, expected ${release}`);

  const cacheName = `flipgame-${release.replaceAll(".", "-")}`;
  const worker = fs.readFileSync(path.join(upstreamRoot, "service-worker.js"), "utf8");
  const actualCache = worker.match(/\bCACHE_NAME\s*=\s*["']([^"']+)["']/)?.[1];
  if (actualCache !== cacheName) fail(`service-worker cache is ${actualCache || "missing"}, expected ${cacheName}`);
  return release;
}

function collectRuntimeFiles(upstreamRoot) {
  const files = [];
  for (const relative of ROOT_FILES) {
    requireFile(upstreamRoot, relative);
    files.push(relative);
  }
  for (const relative of OPTIONAL_ROOT_FILES) {
    if (fs.existsSync(path.join(upstreamRoot, relative))) {
      requireFile(upstreamRoot, relative);
      files.push(relative);
    }
  }
  for (const directory of RUNTIME_DIRECTORIES) files.push(...walkRuntimeFiles(upstreamRoot, directory));
  const normalized = [...new Set(files.map(toRuntimePath))].sort();
  for (const relative of normalized) {
    if (!isAllowedRuntimePath(relative)) fail(`internal allowlist error for ${relative}`);
  }
  return normalized;
}

function digestFiles(root, runtimeFiles) {
  const hash = crypto.createHash("sha256");
  for (const relative of runtimeFiles) {
    hash.update(relative, "utf8");
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(root, ...relative.split("/"))));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function readExistingMetadata(target) {
  const file = path.join(target, METADATA_FILE);
  if (!fs.existsSync(file)) return null;
  let metadata;
  try {
    metadata = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`existing ${METADATA_FILE} is invalid: ${error.message}`);
  }
  if (metadata.schema !== "MapzimusVendorSnapshotV1" || metadata.upstream?.repository !== "mapzimus/flipgame" || !SHA_RE.test(metadata.upstream?.sourceSha || "")) {
    fail(`existing ${METADATA_FILE} is not trusted Flipgame provenance`);
  }
  return metadata;
}

function verifyGitSource(upstreamRoot, sourceSha) {
  if (!SHA_RE.test(sourceSha)) fail(`source SHA must be a full 40-character Git commit: ${sourceSha}`);
  const top = git(upstreamRoot, ["rev-parse", "--show-toplevel"]).stdout.trim();
  if (!samePath(fs.realpathSync(top), upstreamRoot)) fail("source must be the root of its Git checkout");
  const head = git(upstreamRoot, ["rev-parse", "HEAD"]).stdout.trim().toLowerCase();
  if (head !== sourceSha.toLowerCase()) fail(`source SHA ${sourceSha} does not match checkout HEAD ${head}`);
  const dirty = git(upstreamRoot, ["status", "--porcelain=v1", "--untracked-files=all"]).stdout.trim();
  if (dirty) fail("source checkout is dirty");
  return head;
}

function verifyForwardUpdate(upstreamRoot, existingMetadata, sourceSha) {
  if (!existingMetadata || existingMetadata.upstream.sourceSha.toLowerCase() === sourceSha) return;
  const prior = existingMetadata.upstream.sourceSha.toLowerCase();
  const known = git(upstreamRoot, ["cat-file", "-e", `${prior}^{commit}`], { allowFailure: true });
  if (known.status !== 0) fail(`prior snapshot commit ${prior} is unavailable; use a full upstream checkout`);
  const ancestry = git(upstreamRoot, ["merge-base", "--is-ancestor", prior, sourceSha], { allowFailure: true });
  if (ancestry.status === 1) fail(`source SHA ${sourceSha} is stale or not a descendant of current snapshot ${prior}`);
  if (ancestry.status !== 0) fail(`could not verify update ancestry from ${prior} to ${sourceSha}`);
}

function replaceSnapshot(target, stage) {
  const appsRoot = path.dirname(target);
  const suffix = crypto.randomBytes(8).toString("hex");
  const backup = path.join(appsRoot, `.flip-game-backup-${process.pid}-${suffix}`);
  let movedOld = false;
  let installedNew = false;
  try {
    if (fs.existsSync(target)) {
      fs.renameSync(target, backup);
      movedOld = true;
    }
    fs.renameSync(stage, target);
    installedNew = true;
    if (movedOld) fs.rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (installedNew && fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    if (movedOld && fs.existsSync(backup) && !fs.existsSync(target)) fs.renameSync(backup, target);
    throw error;
  } finally {
    if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true });
  }
}

export function syncFlipgame({ upstreamRoot, sourceSha, expectedRelease, labRoot = SCRIPT_ROOT }) {
  const realLabRoot = assertDirectory(path.resolve(labRoot), "lab repository root");
  const realUpstreamRoot = assertDirectory(path.resolve(upstreamRoot), "upstream checkout");
  const target = assertPathInside(realLabRoot, path.join(realLabRoot, SNAPSHOT_RELATIVE_PATH), "snapshot target");
  const appsRoot = assertPathInside(realLabRoot, path.dirname(target), "vendor apps directory");
  assertNoSymlinkChain(realLabRoot, appsRoot, "snapshot target");
  if (!fs.existsSync(appsRoot)) fail(`vendor apps directory does not exist: ${appsRoot}`);
  if (!fs.lstatSync(appsRoot).isDirectory()) fail(`vendor apps path is not a directory: ${appsRoot}`);
  assertNoSymlinkChain(realLabRoot, target, "snapshot target");

  const overlap = isSameOrInside(realUpstreamRoot, realLabRoot) || isSameOrInside(realLabRoot, realUpstreamRoot);
  if (overlap) fail("upstream and lab roots must be separate, non-overlapping checkouts");

  const verifiedSha = verifyGitSource(realUpstreamRoot, String(sourceSha || "").toLowerCase());
  const existingMetadata = readExistingMetadata(target);
  verifyForwardUpdate(realUpstreamRoot, existingMetadata, verifiedSha);

  for (const relative of ROOT_FILES) requireFile(realUpstreamRoot, relative);
  const release = validateRelease(realUpstreamRoot, expectedRelease);
  validateManifest(realUpstreamRoot);
  const runtimeFiles = collectRuntimeFiles(realUpstreamRoot);
  validateLocalReferences(realUpstreamRoot, runtimeFiles);

  const metadata = {
    schema: "MapzimusVendorSnapshotV1",
    snapshotVersion: 1,
    upstream: {
      repository: "mapzimus/flipgame",
      sourceUrl: "https://github.com/mapzimus/flipgame",
      sourceSha: verifiedSha,
      releaseVersion: release,
    },
    hostedRoute: "/flipgame/",
    runtimeAllowlist: ["index.html", "service-worker.js", "manifest.json", "css/**", "js/**", "icons/**", ".nojekyll (optional)"],
    runtimeFiles,
    contentSha256: digestFiles(realUpstreamRoot, runtimeFiles),
  };

  const stage = fs.mkdtempSync(path.join(appsRoot, ".flip-game-sync-"));
  try {
    for (const relative of runtimeFiles) {
      const source = path.join(realUpstreamRoot, ...relative.split("/"));
      const destination = path.join(stage, ...relative.split("/"));
      assertPathInside(stage, destination, "staged runtime asset");
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
    }
    fs.writeFileSync(path.join(stage, METADATA_FILE), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    replaceSnapshot(target, stage);
  } catch (error) {
    if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true });
    throw error;
  }

  return metadata;
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--source", "--source-commit"].includes(flag) || !value) {
      fail("usage: node scripts/sync-flipgame.mjs --source <checkout> --source-commit <full-commit>");
    }
    if (values.has(flag)) fail(`duplicate argument: ${flag}`);
    values.set(flag, value);
  }
  if (values.size !== 2) fail("--source and --source-commit are both required");
  return {
    upstreamRoot: values.get("--source"),
    sourceSha: values.get("--source-commit"),
  };
}

const isCli = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isCli) {
  try {
    const metadata = syncFlipgame(parseArguments(process.argv.slice(2)));
    console.log(`Synced Flipgame ${metadata.upstream.releaseVersion} at ${metadata.upstream.sourceSha} to ${metadata.hostedRoute}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
