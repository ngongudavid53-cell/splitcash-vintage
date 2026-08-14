import type { Expense, Group, Transfer } from "./types";
import { round2 } from "./money";

/** How much each participant owes on a single expense, rounded to the cent
 *  with the remainder absorbed by the last participant. */
export function expenseShares(e: Expense, group: Group): Map<string, number> {
  const participants =
    e.splitBetween.length > 0
      ? e.splitBetween
      : group.members.map((m) => m.uid);
  const map = new Map<string, number>();
  const last = participants[participants.length - 1];
  let acc = 0;

  if (e.splitMode === "equal" || !e.shares) {
    const each = round2(e.amount / participants.length);
    for (const uid of participants) {
      const share = uid === last ? round2(e.amount - acc) : each;
      map.set(uid, share);
      acc += share;
    }
    return map;
  }

  const isPercent = e.splitType === "percent";
  for (const uid of participants) {
    const raw = e.shares[uid] ?? 0;
    const share = isPercent ? (raw / 100) * e.amount : raw;
    const final = uid === last ? round2(e.amount - acc) : round2(share);
    map.set(uid, final);
    acc += final;
  }
  return map;
}

/** What a given member owes on a given expense. */
export function memberShare(e: Expense, group: Group, uid: string): number {
  return expenseShares(e, group).get(uid) ?? 0;
}

/** Net balance per member: positive = they are owed, negative = they owe. */
export function computeBalances(
  group: Group,
  expenses: Expense[],
): Map<string, number> {
  const balances = new Map<string, number>();
  for (const m of group.members) balances.set(m.uid, 0);
  for (const e of expenses) {
    if (!group.members.some((m) => m.uid === e.paidBy)) continue;
    balances.set(e.paidBy, (balances.get(e.paidBy) ?? 0) + e.amount);
    const shares = expenseShares(e, group);
    for (const [uid, share] of shares) {
      balances.set(uid, (balances.get(uid) ?? 0) - share);
    }
  }
  for (const [uid, v] of balances) balances.set(uid, round2(v));
  return balances;
}

/** Simplified "settle up" — pair the biggest debts with the biggest credits
 *  so the fewest transfers are needed. */
export function settleUp(balances: Map<string, number>): Transfer[] {
  const debtors: { uid: string; amount: number }[] = [];
  const creditors: { uid: string; amount: number }[] = [];
  for (const [uid, bal] of balances) {
    if (bal > 0.005) creditors.push({ uid, amount: bal });
    else if (bal < -0.005) debtors.push({ uid, amount: -bal });
  }
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const amt = round2(Math.min(d.amount, c.amount));
    if (amt > 0.005) transfers.push({ from: d.uid, to: c.uid, amount: amt });
    d.amount = round2(d.amount - amt);
    c.amount = round2(c.amount - amt);
    if (d.amount <= 0.005) i++;
    if (c.amount <= 0.005) j++;
  }
  return transfers;
}

export function potTotal(expenses: Expense[]): number {
  return round2(expenses.reduce((sum, e) => sum + (e.amount ?? 0), 0));
}

export function memberName(group: Group, uid: string): string {
  return group.members.find((m) => m.uid === uid)?.name ?? "Someone";
}

export function isSettled(
  settlements: { from: string; to: string }[],
  transfer: Transfer,
): boolean {
  return settlements.some(
    (s) => s.from === transfer.from && s.to === transfer.to,
  );
}
