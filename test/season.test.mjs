// When the lobby dresses up for Christmas. esbuild compiles the TypeScript so Node can import it.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { build } from "esbuild";

const dir = mkdtempSync(join(tmpdir(), "season-"));
after(() => rmSync(dir, { recursive: true, force: true }));
const outfile = join(dir, "season.mjs");
await build({ entryPoints: ["src/lobby/season.ts"], outfile, bundle: true, format: "esm", platform: "neutral", logLevel: "warning" });
const { seasonOf } = await import("file://" + outfile);

const on = (y, m, d) => new Date(y, m - 1, d, 12);

test("the lobby is dressed for Christmas from 16 November to 6 January", () => {
  assert.equal(seasonOf(on(2026, 11, 16)), "christmas");
  assert.equal(seasonOf(on(2026, 12, 1)), "christmas");
  assert.equal(seasonOf(on(2026, 12, 24)), "christmas");
  assert.equal(seasonOf(on(2027, 1, 6)), "christmas");
});

test("and not the rest of the year", () => {
  assert.equal(seasonOf(on(2026, 11, 15)), null);
  assert.equal(seasonOf(on(2027, 1, 7)), null);
  assert.equal(seasonOf(on(2027, 8, 17)), null);
});

test("the address can force the season either way, for previewing", () => {
  assert.equal(seasonOf(on(2026, 7, 1), "?season=christmas"), "christmas");
  assert.equal(seasonOf(on(2026, 12, 24), "?season=none"), null);
  assert.equal(seasonOf(on(2026, 12, 24), "?season=easter"), "christmas", "an unknown value changes nothing");
});
