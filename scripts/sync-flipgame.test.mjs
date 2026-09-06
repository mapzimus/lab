import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { assertPathInside, syncFlipgame } from "./sync-flipgame.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function command(cwd, executable, args) {
  const result = spawnSync(executable, args, { cwd, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`${executable} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function write(root, relative, contents) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

function createFixture(t) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "flipgame-sync-test-"));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  const source = path.join(fixtureRoot, "source");
  const lab = path.join(fixtureRoot, "lab");
  fs.mkdirSync(path.join(lab, "vendor", "apps", "flip-game"), { recursive: true });
  fs.mkdirSync(source, { recursive: true });

  write(source, "index.html", `<!doctype html><html><head>
    <link rel="manifest" href="manifest.json">
    <link rel="stylesheet" href="css/style.css?v=111">
    </head><body><div id="version-badge">v1.11</div>
    <script src="js/v111-interfaces.js?v=111"></script></body></html>`);
  write(source, "service-worker.js", `const CACHE_NAME = 'flipgame-v1-11';
    const PRECACHE_URLS = ['./', './index.html', './css/style.css', './js/v111-interfaces.js', './manifest.json', './icons/icon-192.png'];`);
  write(source, "manifest.json", `${JSON.stringify({
    name: "Bottle Game",
    start_url: "./",
    scope: "./",
    icons: [{ src: "icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  })}\n`);
  write(source, "css/style.css", "body { color: #fff; }\n");
  write(source, "js/v111-interfaces.js", "var RELEASE_VERSION = 'v1.11';\n");
  write(source, "icons/icon-192.png", "fixture-icon");
  write(source, ".nojekyll", "");
  write(source, "README.md", "must not be copied\n");
  write(source, "secrets/credential.txt", "must not be copied\n");

  command(source, "git", ["init", "-b", "main"]);
  command(source, "git", ["config", "user.email", "sync-test@example.invalid"]);
  command(source, "git", ["config", "user.name", "Sync Test"]);
  command(source, "git", ["add", "."]);
  command(source, "git", ["commit", "-m", "fixture release"]);

  return {
    fixtureRoot,
    source,
    lab,
    sha: command(source, "git", ["rev-parse", "HEAD"]),
    target: path.join(lab, "vendor", "apps", "flip-game"),
  };
}

function filesUnder(root) {
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(path.relative(root, full).split(path.sep).join("/"));
    }
  };
  walk(root);
  return files.sort();
}

test("sync copies only the web runtime, removes stale files, and writes deterministic provenance", (t) => {
  const fixture = createFixture(t);
  write(fixture.target, "roster.html", "stale\n");
  write(fixture.target, "js/deleted.js", "stale\n");

  const first = syncFlipgame({
    upstreamRoot: fixture.source,
    sourceSha: fixture.sha,
    expectedRelease: "v1.11",
    labRoot: fixture.lab,
  });
  const firstMetadataText = fs.readFileSync(path.join(fixture.target, ".upstream.json"), "utf8");

  assert.equal(first.schema, "MapzimusVendorSnapshotV1");
  assert.equal(first.upstream.sourceSha, fixture.sha);
  assert.equal(first.upstream.releaseVersion, "v1.11");
  assert.equal(first.hostedRoute, "/flipgame/");
  assert.match(first.contentSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(filesUnder(fixture.target), [
    ".nojekyll",
    ".upstream.json",
    "css/style.css",
    "icons/icon-192.png",
    "index.html",
    "js/v111-interfaces.js",
    "manifest.json",
    "service-worker.js",
  ]);
  assert.equal(fs.existsSync(path.join(fixture.target, "README.md")), false);
  assert.equal(fs.existsSync(path.join(fixture.target, "secrets")), false);
  assert.equal(fs.existsSync(path.join(fixture.target, "roster.html")), false);

  const second = syncFlipgame({
    upstreamRoot: fixture.source,
    sourceSha: fixture.sha,
    labRoot: fixture.lab,
  });
  assert.deepEqual(second, first);
  assert.equal(fs.readFileSync(path.join(fixture.target, ".upstream.json"), "utf8"), firstMetadataText);
});

test("sync rejects a wrong release, mismatched SHA, dirty source, and missing critical assets", async (t) => {
  await t.test("wrong release", (child) => {
    const fixture = createFixture(child);
    assert.throws(() => syncFlipgame({
      upstreamRoot: fixture.source,
      sourceSha: fixture.sha,
      expectedRelease: "v1.12",
      labRoot: fixture.lab,
    }), /runtime release version is v1\.11, expected v1\.12|visible version badge is v1\.11, expected v1\.12/);
  });

  await t.test("mismatched SHA", (child) => {
    const fixture = createFixture(child);
    assert.throws(() => syncFlipgame({
      upstreamRoot: fixture.source,
      sourceSha: "0".repeat(40),
      expectedRelease: "v1.11",
      labRoot: fixture.lab,
    }), /does not match checkout HEAD/);
  });

  await t.test("dirty checkout", (child) => {
    const fixture = createFixture(child);
    write(fixture.source, "untracked.txt", "dirty\n");
    assert.throws(() => syncFlipgame({
      upstreamRoot: fixture.source,
      sourceSha: fixture.sha,
      expectedRelease: "v1.11",
      labRoot: fixture.lab,
    }), /source checkout is dirty/);
  });

  await t.test("missing runtime directory", (child) => {
    const fixture = createFixture(child);
    fs.rmSync(path.join(fixture.source, "css"), { recursive: true });
    command(fixture.source, "git", ["add", "-A"]);
    command(fixture.source, "git", ["commit", "-m", "remove critical assets"]);
    const sha = command(fixture.source, "git", ["rev-parse", "HEAD"]);
    assert.throws(() => syncFlipgame({
      upstreamRoot: fixture.source,
      sourceSha: sha,
      expectedRelease: "v1.11",
      labRoot: fixture.lab,
    }), /missing critical runtime directory: css\/|css\/ must be a real directory/);
  });
});

test("sync rejects stale or non-fast-forward source commits", (t) => {
  const fixture = createFixture(t);
  const oldSha = fixture.sha;
  write(fixture.source, "css/style.css", "body { color: #0ff; }\n");
  command(fixture.source, "git", ["add", "css/style.css"]);
  command(fixture.source, "git", ["commit", "-m", "newer release snapshot"]);
  const newSha = command(fixture.source, "git", ["rev-parse", "HEAD"]);

  syncFlipgame({ upstreamRoot: fixture.source, sourceSha: newSha, expectedRelease: "v1.11", labRoot: fixture.lab });
  command(fixture.source, "git", ["checkout", "--detach", oldSha]);

  assert.throws(() => syncFlipgame({
    upstreamRoot: fixture.source,
    sourceSha: oldSha,
    expectedRelease: "v1.11",
    labRoot: fixture.lab,
  }), /stale or not a descendant/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(fixture.target, ".upstream.json"))).upstream.sourceSha, newSha);
});

test("path guards reject escapes and overlapping source/lab roots", (t) => {
  const fixture = createFixture(t);
  assert.throws(() => assertPathInside(fixture.lab, path.join(fixture.lab, "..", "escape")), /escapes/);
  const nestedLab = path.join(fixture.source, "nested-lab");
  fs.mkdirSync(path.join(nestedLab, "vendor", "apps"), { recursive: true });
  assert.throws(() => syncFlipgame({
    upstreamRoot: fixture.source,
    sourceSha: fixture.sha,
    expectedRelease: "v1.11",
    labRoot: nestedLab,
  }), /separate, non-overlapping checkouts/);
});

test("lab build and redirects map only the canonical /flipgame/ route", () => {
  const build = fs.readFileSync(path.join(REPO_ROOT, "scripts", "build.mjs"), "utf8");
  assert.match(build, /"flip-game":\s*"\/flipgame\/"/);
  assert.match(build, /"flip-game":\s*"flipgame"/);
  assert.doesNotMatch(build, /"flip-game":\s*"\/flip-game\/"/);

  const redirects = fs.readFileSync(path.join(REPO_ROOT, "src", "_redirects"), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split(/\s+/));
  const destinationFor = (source) => redirects.find(([candidate]) => candidate === source)?.[1];
  assert.equal(destinationFor("/flipgame"), "/flipgame/");
  assert.equal(destinationFor("/flip-game"), "/flipgame/");
  assert.equal(destinationFor("/flip-game/*"), "/flipgame/:splat");
  assert.equal(destinationFor("/bottle-game"), "/flipgame/");
  assert.equal(destinationFor("/games/flip"), "/flipgame/");
  assert.equal(redirects.some(([, destination]) => destination.startsWith("/flip-game")), false);
});
