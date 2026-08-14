import { computeBalances, memberName, potTotal, settleUp } from "./balances";
import { formatMoney } from "./money";
import type { Expense, Group, Settlement } from "./types";

/** A compact, human-readable summary of one ledger, handed to the AI so it
 *  can answer real questions about the books. Pure and testable. */
export function buildLedgerBrief(
  group: Group,
  expenses: Expense[],
  settlements: Settlement[],
): string {
  const lines: string[] = [];
  lines.push(`Ledger: ${group.name}`);
  lines.push(
    `Members: ${group.members.map((m) => m.name).join(", ") || "none yet"}`,
  );

  if (expenses.length === 0) {
    lines.push("No expenses logged yet.");
  } else {
    lines.push("Expenses (newest first):");
    const sorted = [...expenses].sort((a, b) => b.createdAt - a.createdAt);
    for (const e of sorted) {
      const paid = memberName(group, e.paidBy);
      const how =
        e.splitMode === "custom"
          ? e.splitType === "percent"
            ? "custom split by percentage"
            : "custom split by amount"
          : `split ${e.splitBetween.length} way${e.splitBetween.length === 1 ? "" : "s"}`;
      const among = e.splitBetween
        .map((uid) => memberName(group, uid))
        .join(", ");
      lines.push(
        `- ${e.description}: ${formatMoney(e.amount)} (${paid} paid; ${how}; among ${among})`,
      );
    }
  }

  const balances = computeBalances(group, expenses);
  const owed: string[] = [];
  const owes: string[] = [];
  for (const m of group.members) {
    const bal = balances.get(m.uid) ?? 0;
    if (bal > 0.005) owed.push(`${m.name} is owed ${formatMoney(bal)}`);
    else if (bal < -0.005) owes.push(`${m.name} owes ${formatMoney(-bal)}`);
  }
  if (owed.length || owes.length) {
    lines.push(`Net: ${[...owed, ...owes].join("; ")}.`);
  } else {
    lines.push("Net: everyone is square.");
  }

  const transfers = settleUp(balances);
  if (transfers.length === 0) {
    lines.push("Settle-up: nothing to transfer.");
  } else {
    lines.push(
      `Settle-up (fewest transfers): ${transfers
        .map(
          (t) =>
            `${memberName(group, t.from)} pays ${memberName(group, t.to)} ${formatMoney(t.amount)}`,
        )
        .join("; ")}.`,
    );
  }

  if (settlements.length > 0) {
    lines.push(
      `Already settled: ${settlements
        .map(
          (s) =>
            `${memberName(group, s.from)} paid ${memberName(group, s.to)} ${formatMoney(s.amount)}`,
        )
        .join("; ")}.`,
    );
  }

  lines.push(`Total in the pot: ${formatMoney(potTotal(expenses))}.`);
  return lines.join("\n");
}
