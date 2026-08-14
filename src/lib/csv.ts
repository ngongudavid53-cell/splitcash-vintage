import { memberName } from "./balances";
import type { Expense, Group, Settlement } from "./types";

/** Wrap a cell in quotes when it contains anything CSV-hostile. */
function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const dateLabel = (ms: number | undefined): string =>
  ms ? new Date(ms).toLocaleDateString("en-US") : "";

/** A full daybook as CSV — one row per expense (oldest first), then a
 *  settlements section. The premium export. Pure and testable. */
export function buildLedgerCsv(
  group: Group,
  expenses: Expense[],
  settlements: Settlement[],
): string {
  const rows: string[][] = [
    [
      "Date",
      "Description",
      "Paid by",
      "Split",
      "Among",
      "Amount (USD)",
    ],
  ];

  const sorted = [...expenses].sort((a, b) => a.createdAt - b.createdAt);
  for (const e of sorted) {
    const how =
      e.splitMode === "custom"
        ? e.splitType === "percent"
          ? "custom %"
          : "custom $"
        : `equal (${e.splitBetween.length})`;
    rows.push([
      dateLabel(e.createdAt),
      e.description,
      memberName(group, e.paidBy),
      how,
      e.splitBetween.map((uid) => memberName(group, uid)).join("; "),
      e.amount.toFixed(2),
    ]);
  }

  if (settlements.length > 0) {
    rows.push([], ["Settlements (already paid)"]);
    for (const s of settlements) {
      rows.push([
        dateLabel(s.createdAt),
        `${memberName(group, s.from)} paid ${memberName(group, s.to)}`,
        "",
        "",
        "",
        s.amount.toFixed(2),
      ]);
    }
  }

  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

/** Trigger a browser download of a text file. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** "Lisbon, June '26" -> "lisbon-june-26" — for filenames. */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "ledger"
  );
}
