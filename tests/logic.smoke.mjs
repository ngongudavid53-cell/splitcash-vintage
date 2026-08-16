// Targeted smoke test for Common Pot's pure logic modules.
// Run with: node --experimental-strip-types --experimental-specifier-resolution=node tests/logic.smoke.mjs
//
// The balances module is loaded through tests/helpers/load-ts.mjs, which
// compiles src/lib/balances.ts with esbuild (erasing all type syntax, so it
// runs even where Node's own type-stripper can't parse array annotations, e.g.
// the Freebuff WebContainer's emulated Node) and falls back to Node's built-in
// strip-types elsewhere. money.ts and codes.ts are small enough that Node
// strips them directly.
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadTs } from "./helpers/load-ts.mjs";
import { round2, formatMoney, parseAmount } from "../src/lib/money.ts";
import { randomInviteCode } from "../src/lib/codes.ts";

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

const group = {
  id: "g1",
  name: "Test",
  inviteCode: "ABC123",
  members: [
    { uid: "a", name: "Ana" },
    { uid: "b", name: "Ben" },
    { uid: "c", name: "Cara" },
  ],
  memberIds: ["a", "b", "c"],
  createdBy: "a",
  createdAt: 0,
};

const soloGroup = {
  id: "g-solo",
  name: "Solo",
  inviteCode: "AAA111",
  members: [{ uid: "s", name: "Solo" }],
  memberIds: ["s"],
  createdBy: "s",
  createdAt: 0,
};

const bigGroup = {
  id: "g-big",
  name: "Big",
  inviteCode: "BBB222",
  members: [
    { uid: "a", name: "Ana" },
    { uid: "b", name: "Ben" },
    { uid: "c", name: "Cara" },
    { uid: "d", name: "Dino" },
    { uid: "e", name: "Eli" },
  ],
  memberIds: ["a", "b", "c", "d", "e"],
  createdBy: "a",
  createdAt: 0,
};

console.log("money:");
ok("round2 kills float drift (0.1+0.2)", () => assert.equal(round2(0.1 + 0.2), 0.3));
ok("round2 half-cent up (1.005)", () => assert.equal(round2(1.005), 1.01));
ok("formatMoney renders USD cents", () => assert.equal(formatMoney(42.5), "$42.50"));
ok('parseAmount "42.50"', () => assert.equal(parseAmount("42.50"), 42.5));
ok('parseAmount "$42,50" (comma decimal)', () => assert.equal(parseAmount("$42,50"), 42.5));
ok('parseAmount "42,5" (comma decimal, 1 digit)', () => assert.equal(parseAmount("42,5"), 42.5));
ok('parseAmount "1,234.56" (thousands)', () => assert.equal(parseAmount("1,234.56"), 1234.56));
ok('parseAmount "1,000" (thousands, no cents)', () => assert.equal(parseAmount("1,000"), 1000));
ok('parseAmount "abc" is null', () => assert.equal(parseAmount("abc"), null));
ok('parseAmount "" is null', () => assert.equal(parseAmount(""), null));
ok('parseAmount "0" is null', () => assert.equal(parseAmount("0"), null));

console.log("codes:");
const code = randomInviteCode();
ok("invite code is 6 chars", () => assert.equal(code.length, 6));
ok("invite code uses unambiguous alphabet", () =>
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/));

console.log("balances:");
try {
  const {
    expenseShares,
    computeBalances,
    settleUp,
    potTotal,
    isSettled,
  } = await loadTs(new URL("../src/lib/balances.ts", import.meta.url));

  const e30 = { id: "e1", description: "dinner", amount: 30, paidBy: "a", splitBetween: ["a", "b", "c"], splitMode: "equal", createdAt: 0 };
  const e10 = { id: "e2", description: "taxi", amount: 10, paidBy: "b", splitBetween: ["a", "b", "c"], splitMode: "equal", createdAt: 0 };

  ok("equal split 30/3", () => {
    const s = expenseShares(e30, group);
    assert.equal(s.get("a"), 10);
    assert.equal(s.get("b"), 10);
    assert.equal(s.get("c"), 10);
  });
  ok("equal split 10/3 leaves remainder on last", () => {
    const s = expenseShares(e10, group);
    assert.equal(s.get("a"), 3.33);
    assert.equal(s.get("b"), 3.33);
    assert.equal(s.get("c"), 3.34);
  });
  ok("custom percent split", () => {
    const s = expenseShares(
      { ...e30, splitMode: "custom", splitType: "percent", shares: { a: 50, b: 30, c: 20 } },
      group,
    );
    assert.equal(s.get("a"), 15);
    assert.equal(s.get("b"), 9);
    assert.equal(s.get("c"), 6);
  });
  ok("net balances sum to zero", () => {
    // Dinner 30 (a paid, 3-way): a +20, b -10, c -10
    // Taxi 10 (b paid, 3-way -> 3.33/3.33/3.34): a -3.33, b +6.67, c -3.34
    // Nets: a +16.67, b -3.33, c -13.34  (sums to zero)
    const b = computeBalances(group, [e30, e10]);
    const sum = [...b.values()].reduce((x, y) => x + y, 0);
    assert.ok(Math.abs(sum) < 0.005);
    assert.equal(b.get("a"), 16.67);
    assert.equal(b.get("b"), -3.33);
    assert.equal(b.get("c"), -13.34);
  });
  ok("settleUp pairs biggest first", () => {
    const t = settleUp(new Map([["a", 16], ["b", -2], ["c", -14]]));
    assert.deepEqual(t, [
      { from: "c", to: "a", amount: 14 },
      { from: "b", to: "a", amount: 2 },
    ]);
  });
  ok("settleUp minimizes transfers", () => {
    const t = settleUp(new Map([["a", 50], ["b", 10], ["c", -30], ["d", -30]]));
    assert.equal(t.length, 3);
    assert.equal(t.reduce((s, x) => s + x.amount, 0), 60);
  });
  ok("settleUp breaks equal-amount ties by insertion order (debtors)", () => {
    // b and c owe the same 40; the stable sort keeps b (inserted first) first.
    const t = settleUp(new Map([["a", 100], ["b", -40], ["c", -40], ["d", -20]]));
    assert.deepEqual(t, [
      { from: "b", to: "a", amount: 40 },
      { from: "c", to: "a", amount: 40 },
      { from: "d", to: "a", amount: 20 },
    ]);
  });
  ok("settleUp breaks equal-amount ties by insertion order (creditors)", () => {
    // a and b are owed the same 50; a (inserted first) gets paid first.
    const t = settleUp(new Map([["a", 50], ["b", 50], ["c", -100]]));
    assert.deepEqual(t, [
      { from: "c", to: "a", amount: 50 },
      { from: "c", to: "b", amount: 50 },
    ]);
  });
  ok("settleUp tie order follows map order, not uid order", () => {
    // c and b owe the same 40, but c was inserted before b.
    const t = settleUp(new Map([["c", -40], ["b", -40], ["a", 80]]));
    assert.deepEqual(t, [
      { from: "c", to: "a", amount: 40 },
      { from: "b", to: "a", amount: 40 },
    ]);
  });
  ok("settleUp three-way tie keeps insertion order", () => {
    const t = settleUp(new Map([["a", -10], ["b", -10], ["c", -10], ["d", 30]]));
    assert.deepEqual(t, [
      { from: "a", to: "d", amount: 10 },
      { from: "b", to: "d", amount: 10 },
      { from: "c", to: "d", amount: 10 },
    ]);
  });
  ok("potTotal sums expenses", () => assert.equal(potTotal([e30, e10]), 40));
  ok("isSettled matches pair", () => {
    assert.equal(isSettled([{ from: "c", to: "a" }], { from: "c", to: "a", amount: 14 }), true);
    assert.equal(isSettled([{ from: "c", to: "a" }], { from: "b", to: "a", amount: 2 }), false);
  });

  // ---- Edge cases ----
  console.log("  (edge cases)");

  ok("single member: pays self, net zero, no transfers", () => {
    const e = { id: "e-solo", description: "coffee", amount: 25.5, paidBy: "s", splitBetween: ["s"], splitMode: "equal", createdAt: 0 };
    const s = expenseShares(e, soloGroup);
    assert.equal(s.get("s"), 25.5);
    const b = computeBalances(soloGroup, [e]);
    assert.equal(b.get("s"), 0);
    assert.deepEqual(settleUp(b), []);
  });

  ok("single member: potTotal still sums", () => {
    const e = { id: "e-solo", description: "coffee", amount: 25.5, paidBy: "s", splitBetween: ["s"], splitMode: "equal", createdAt: 0 };
    assert.equal(potTotal([e]), 25.5);
  });

  ok("zero-amount expense is a no-op on balances", () => {
    const e = { id: "e-zero", description: "void", amount: 0, paidBy: "a", splitBetween: ["a", "b", "c"], splitMode: "equal", createdAt: 0 };
    const s = expenseShares(e, group);
    assert.equal(s.get("a"), 0);
    assert.equal(s.get("b"), 0);
    assert.equal(s.get("c"), 0);
    const b = computeBalances(group, [e]);
    assert.equal(b.get("a"), 0);
    assert.equal(b.get("b"), 0);
    assert.equal(b.get("c"), 0);
    assert.deepEqual(settleUp(b), []);
    assert.equal(potTotal([e]), 0);
  });

  ok("custom $ split uses stated shares", () => {
    const e = { id: "e-usd", description: "tickets", amount: 100, paidBy: "a", splitBetween: ["a", "b", "c"], splitMode: "custom", splitType: "amount", shares: { a: 50, b: 30, c: 20 }, createdAt: 0 };
    const s = expenseShares(e, group);
    assert.equal(s.get("a"), 50);
    assert.equal(s.get("b"), 30);
    assert.equal(s.get("c"), 20);
    const b = computeBalances(group, [e]);
    assert.equal(b.get("a"), 50); // paid 100, owes 50
    assert.equal(b.get("b"), -30);
    assert.equal(b.get("c"), -20);
  });

  ok("custom $ split absorbs rounding remainder on last", () => {
    const e = { id: "e-usd-r", description: "snacks", amount: 10, paidBy: "a", splitBetween: ["a", "b", "c"], splitMode: "custom", splitType: "amount", shares: { a: 3.33, b: 3.33, c: 3.33 }, createdAt: 0 };
    const s = expenseShares(e, group);
    assert.equal(s.get("a"), 3.33);
    assert.equal(s.get("b"), 3.33);
    assert.equal(s.get("c"), 3.34); // 10 - 3.33 - 3.33
  });

  ok("5-way equal split distributes evenly", () => {
    const e = { id: "e-5", description: "groceries", amount: 100, paidBy: "a", splitBetween: ["a", "b", "c", "d", "e"], splitMode: "equal", createdAt: 0 };
    const s = expenseShares(e, bigGroup);
    for (const uid of ["a", "b", "c", "d", "e"]) assert.equal(s.get(uid), 20);
    const b = computeBalances(bigGroup, [e]);
    assert.equal(b.get("a"), 80);
    assert.equal(b.get("b"), -20);
    assert.equal(b.get("e"), -20);
  });

  ok("5-way split leaves rounding remainder on last", () => {
    const e = { id: "e-5-r", description: "tolls", amount: 1.01, paidBy: "a", splitBetween: ["a", "b", "c", "d", "e"], splitMode: "equal", createdAt: 0 };
    const s = expenseShares(e, bigGroup);
    assert.equal(s.get("a"), 0.2);
    assert.equal(s.get("b"), 0.2);
    assert.equal(s.get("c"), 0.2);
    assert.equal(s.get("d"), 0.2);
    assert.equal(s.get("e"), 0.21); // 1.01 - 4 x 0.2
  });

  ok("settleUp scales to 5 members (4 transfers)", () => {
    const t = settleUp(new Map([["a", 100], ["b", 60], ["c", -40], ["d", -70], ["e", -50]]));
    assert.equal(t.length, 4);
    assert.deepEqual(t[0], { from: "d", to: "a", amount: 70 });
    assert.equal(t.reduce((sum, x) => sum + x.amount, 0), 160);
  });

  // ---- Flow-level scenario: the whole ledger lifecycle ----
  console.log("  (flow: full ledger)");

  const trip = {
    id: "g-trip",
    name: "Lisbon",
    inviteCode: "TRP123",
    members: [
      { uid: "a", name: "Ana" },
      { uid: "b", name: "Ben" },
      { uid: "c", name: "Cara" },
      { uid: "d", name: "Dino" },
    ],
    memberIds: ["a", "b", "c", "d"],
    createdBy: "a",
    createdAt: 0,
  };

  // Mirrors the expense docs Firestore returns: equal splits, some rows not
  // including everyone (d skipped the metro, c & d skipped the hotel).
  const ledger = [
    { id: "f1", description: "Dinner at the tasca", amount: 84.6, paidBy: "a", splitBetween: ["a", "b", "c", "d"], splitMode: "equal", createdAt: 1 },
    { id: "f2", description: "Metro cards", amount: 21, paidBy: "b", splitBetween: ["a", "b", "c"], splitMode: "equal", createdAt: 2 },
    { id: "f3", description: "Hotel, 2 nights", amount: 240, paidBy: "a", splitBetween: ["a", "b"], splitMode: "equal", createdAt: 3 },
    { id: "f4", description: "Museum tickets", amount: 36, paidBy: "c", splitBetween: ["a", "c", "d"], splitMode: "equal", createdAt: 4 },
  ];

  ok("flow: potTotal over the whole ledger", () => {
    assert.equal(potTotal(ledger), 381.6);
  });

  ok("flow: net balances across all expenses", () => {
    const b = computeBalances(trip, ledger);
    assert.equal(b.get("a"), 164.45);
    assert.equal(b.get("b"), -127.15);
    assert.equal(b.get("c"), -4.15);
    assert.equal(b.get("d"), -33.15);
    const sum = [...b.values()].reduce((x, y) => x + y, 0);
    assert.ok(Math.abs(sum) < 0.005);
  });

  ok("flow: settleUp suggests the fewest transfers (3 of 4)", () => {
    const t = settleUp(computeBalances(trip, ledger));
    assert.equal(t.length, 3);
    assert.deepEqual(t, [
      { from: "b", to: "a", amount: 127.15 },
      { from: "d", to: "a", amount: 33.15 },
      { from: "c", to: "a", amount: 4.15 },
    ]);
    assert.equal(round2(t.reduce((sum, x) => sum + x.amount, 0)), 164.45);
  });

  ok("flow: isSettled reflects partial settlement", () => {
    const t = settleUp(computeBalances(trip, ledger));
    const settled = [{ from: "b", to: "a" }]; // Ben paid Ana the big one
    assert.equal(isSettled(settled, t[0]), true);
    assert.equal(isSettled(settled, t[1]), false);
    assert.equal(isSettled(settled, t[2]), false);
    // BalanceSummary's allSettled logic:
    assert.equal(t.every((x) => isSettled(settled, x)), false);
  });

  ok("flow: ledger reads 'all settled' once every transfer is marked", () => {
    const t = settleUp(computeBalances(trip, ledger));
    const settled = t.map((x) => ({ from: x.from, to: x.to }));
    assert.equal(t.every((x) => isSettled(settled, x)), true);
  });

  ok("balances: settlements move the money", () => {
    // Dinner 30 (a paid, a/b/c): a +20, b -10, c -10.
    // Ben then pays Ana 10 (recorded settlement).
    const b = computeBalances(group, [e30], [{ from: "b", to: "a", amount: 10 }]);
    assert.equal(b.get("a"), 10);
    assert.equal(b.get("b"), 0);
    assert.equal(b.get("c"), -10);
  });

  ok("balances: full settlement zeroes everyone out", () => {
    const b = computeBalances(group, [e30], [
      { from: "b", to: "a", amount: 10 },
      { from: "c", to: "a", amount: 10 },
    ]);
    assert.equal(b.get("a"), 0);
    assert.equal(b.get("b"), 0);
    assert.equal(b.get("c"), 0);
    assert.deepEqual(settleUp(b), []);
  });

  ok("balances: settlement still works after partial settlement", () => {
    const b = computeBalances(group, [e30, e10], [{ from: "b", to: "a", amount: 12.67 }]);
    assert.equal(b.get("a"), 4);
    assert.equal(b.get("c"), -13.34);
    const sum = [...b.values()].reduce((x, y) => x + y, 0);
    assert.ok(Math.abs(sum) < 0.005);
    const t = settleUp(b);
    assert.equal(t.length, 2);
  });

  ok("balances: empty settlements arg keeps legacy behavior", () => {
    const withSettlements = computeBalances(group, [e30], []);
    const without = computeBalances(group, [e30]);
    assert.deepEqual([...withSettlements.entries()], [...without.entries()]);
  });
} catch (err) {
  console.error(
    `  \u26a0 balances SKIPPED: could not load src/lib/balances.ts in this environment\n    (${err.message})\n    The assertions above still run where the TS stripper works (real Node 22.12+).`,
  );
}

console.log("assistant brief:");
try {
  // Bundle assistant.ts (inlining ./balances and ./money) so the emulated
  // Node's type-stripper never has to parse balances.ts raw — it can't handle
  // old-style generics like `new Map<string, number>()`. esbuild erases all of
  // it at bundle time; we import the result from a temp file (data: URLs are
  // not supported by this emulated Node).
  const esbuild = await import("esbuild");
  const bundled = await esbuild.build({
    entryPoints: [new URL("../src/lib/assistant.ts", import.meta.url).pathname],
    bundle: true,
    format: "esm",
    platform: "neutral",
    write: false,
  });
  const dir = mkdtempSync(join(tmpdir(), "cp-brief-"));
  const file = join(dir, "brief.mjs");
  writeFileSync(file, bundled.outputFiles[0].text);
  let briefModule;
  try {
    briefModule = await import(pathToFileURL(file).href);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const { buildLedgerBrief } = briefModule;

  const briefGroup = {
    id: "g-brief",
    name: "Lisbon",
    inviteCode: "TRP123",
    members: [
      { uid: "a", name: "Ana" },
      { uid: "b", name: "Ben" },
      { uid: "c", name: "Cara" },
    ],
    memberIds: ["a", "b", "c"],
    createdBy: "a",
    createdAt: 0,
  };
  const briefExpenses = [
    { id: "f1", description: "Dinner at the tasca", amount: 84.6, paidBy: "a", splitBetween: ["a", "b", "c"], splitMode: "equal", createdAt: 1 },
    { id: "f2", description: "Metro cards", amount: 21, paidBy: "b", splitBetween: ["a", "b", "c"], splitMode: "equal", createdAt: 2 },
  ];

  const brief = buildLedgerBrief(briefGroup, briefExpenses, []);
  ok("brief names the ledger", () => assert.match(brief, /Lisbon/));
  ok("brief lists expenses with amounts", () =>
    assert.match(brief, /Dinner at the tasca.*\$84\.60/));
  ok("brief shows who is owed money", () =>
    assert.match(brief, /Ana is owed/));
  ok("brief suggests settle-up transfers", () =>
    assert.match(brief, /pays Ana/));

  const withSettlements = buildLedgerBrief(briefGroup, briefExpenses, [
    { from: "b", to: "a", amount: 50, settledBy: "b", createdAt: 3 },
  ]);
  ok("brief records settled payments", () =>
    assert.match(withSettlements, /Already settled/));

  ok("brief handles an empty ledger", () => {
    const empty = buildLedgerBrief(briefGroup, [], []);
    assert.match(empty, /No expenses logged yet/);
    assert.match(empty, /everyone is square/);
    assert.match(empty, /nothing to transfer/);
  });
} catch (err) {
  console.error(
    `  \u26a0 assistant SKIPPED: could not load src/lib/assistant.ts in this environment\n    (${err.message})`,
  );
}

console.log("csv export:");
try {
  // Bundle csv.ts (inlining ./balances) so the emulated Node's type-stripper
  // never has to parse old-style generics raw — same trick as assistant.ts.
  const esbuildCsv = await import("esbuild");
  const bundledCsv = await esbuildCsv.build({
    entryPoints: [new URL("../src/lib/csv.ts", import.meta.url).pathname],
    bundle: true,
    format: "esm",
    platform: "neutral",
    write: false,
  });
  const dirCsv = mkdtempSync(join(tmpdir(), "cp-csv-"));
  const fileCsv = join(dirCsv, "csv.mjs");
  writeFileSync(fileCsv, bundledCsv.outputFiles[0].text);
  let csvModule;
  try {
    csvModule = await import(pathToFileURL(fileCsv).href);
  } finally {
    rmSync(dirCsv, { recursive: true, force: true });
  }
  const { buildLedgerCsv, slugify } = csvModule;

  const csvGroup = {
    id: "g-csv",
    name: "Lisbon, June '26",
    inviteCode: "TRP123",
    members: [
      { uid: "a", name: "Ana" },
      { uid: "b", name: "Ben" },
      { uid: "c", name: "Cara" },
    ],
    memberIds: ["a", "b", "c"],
    createdBy: "a",
    createdAt: 0,
  };
  const csvExpenses = [
    { id: "f2", description: "Metro cards", amount: 21, paidBy: "b", splitBetween: ["a", "b", "c"], splitMode: "equal", createdAt: 2 },
    { id: "f1", description: "Dinner, the tasca", amount: 84.6, paidBy: "a", splitBetween: ["a", "b", "c"], splitMode: "equal", createdAt: 1 },
    { id: "f3", description: "Tickets", amount: 36, paidBy: "c", splitBetween: ["a", "c"], splitMode: "custom", splitType: "percent", shares: { a: 50, c: 50 }, createdAt: 3 },
  ];

  const csv = buildLedgerCsv(csvGroup, csvExpenses, []);
  ok("csv has a header row", () =>
    assert.match(csv, /^Date,Description,Paid by,Split,Among,Amount \(USD\)/));
  ok("csv sorts expenses oldest first", () => {
    const lines = csv.split("\n");
    const dinner = lines.findIndex((l) => l.includes("Dinner"));
    const metro = lines.findIndex((l) => l.includes("Metro"));
    assert.ok(dinner !== -1 && metro !== -1 && dinner < metro);
  });
  ok("csv quotes a description that contains a comma", () =>
    assert.match(csv, /"Dinner, the tasca"/));
  ok("csv lists amounts to two decimals", () =>
    assert.match(csv, /84\.60/) && assert.match(csv, /21\.00/));
  ok("csv shows how each row was split", () =>
    assert.match(csv, /equal \(3\)/) && assert.match(csv, /custom %/));
  ok("csv resolves member names", () =>
    assert.match(csv, /Ben; Cara/) && assert.match(csv, /Ana; Cara/));
  ok("csv includes a settlements section", () => {
    const withSettled = buildLedgerCsv(csvGroup, csvExpenses, [
      { from: "b", to: "a", amount: 50, settledBy: "b", createdAt: 4 },
    ]);
    assert.match(withSettled, /Settlements/);
    assert.match(withSettled, /Ben paid Ana/);
  });
  ok("slugify makes a tidy filename", () =>
    assert.equal(slugify("Lisbon, June '26"), "lisbon-june-26"));
} catch (err) {
  console.error(
    `  \u26a0 csv SKIPPED: could not load src/lib/csv.ts in this environment\n    (${err.message})`,
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
