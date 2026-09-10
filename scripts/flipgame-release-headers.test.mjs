import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Flipgame disables response transformation and browser telemetry injection", () => {
  const headers = fs.readFileSync(path.join(root, "src", "_headers"), "utf8");
  assert.match(headers, /\/flipgame\/\*\s*\r?\n\s*Cache-Control:\s*public, max-age=0, must-revalidate, no-transform/i);
});
