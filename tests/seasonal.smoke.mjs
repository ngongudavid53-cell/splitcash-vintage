import { strict as assert } from "node:assert";
import { getCurrentSeason } from "../src/lib/seasonal.ts";

console.log("seasonal:");

let passed = 0;
let failed = 0;

function ok(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failed++;
    console.error(`  \u2717 ${name}\n    ${err.message}`);
  }
}

ok("detects Christmas 2025", () => {
  const s = getCurrentSeason(new Date("2025-12-25T12:00:00Z"));
  assert.ok(s);
  assert.equal(s.id, "christmas");
});

ok("detects New Year cross-year boundary (Jan 1)", () => {
  const s = getCurrentSeason(new Date("2026-01-01T12:00:00Z"));
  assert.ok(s);
  assert.equal(s.id, "new_year");
});

ok("detects Ramadan 2025 (March 10)", () => {
  const s = getCurrentSeason(new Date("2025-03-10T12:00:00Z"));
  assert.ok(s);
  assert.equal(s.id, "ramadan");
});

ok("detects Eid al-Fitr 2025 (March 31)", () => {
  const s = getCurrentSeason(new Date("2025-03-31T12:00:00Z"));
  assert.ok(s);
  assert.equal(s.id, "eid_al_fitr");
});

ok("detects Valentine's 2026", () => {
  const s = getCurrentSeason(new Date("2026-02-14T12:00:00Z"));
  assert.ok(s);
  assert.equal(s.id, "valentines");
});

ok("returns null on a non-seasonal day (e.g. May 10)", () => {
  const s = getCurrentSeason(new Date("2025-05-10T12:00:00Z"));
  assert.equal(s, null);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
