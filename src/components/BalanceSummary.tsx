import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  computeBalances,
  isSettled,
  memberName,
  settleUp,
} from "@/lib/balances";
import { clearSettlement, setSettlement } from "@/lib/firestore";
import { formatMoney } from "@/lib/money";
import type { Expense, Group, Settlement, Transfer } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Monogram, Rule, Stamp } from "./bits";
import { ArrowIcon, CheckIcon, TallyIcon } from "./icons";

interface BalanceSummaryProps {
  group: Group;
  expenses: Expense[];
  settlements: Settlement[];
  me: string;
}

export function BalanceSummary({
  group,
  expenses,
  settlements,
  me,
}: BalanceSummaryProps) {
  const balances = computeBalances(group, expenses, settlements);
  const transfers = settleUp(balances);
  const myNet = balances.get(me) ?? 0;

  const rows = [...group.members]
    .map((m) => ({
      member: m,
      net: balances.get(m.uid) ?? 0,
      involvements: transfers.filter(
        (t) => t.from === m.uid || t.to === m.uid,
      ).length,
    }))
    .sort((a, b) => b.net - a.net);

  const allSettled =
    transfers.length > 0 && transfers.every((t) => isSettled(settlements, t));

  async function toggleSettled(t: Transfer) {
    try {
      if (isSettled(settlements, t)) {
        await clearSettlement(group.id, t.from, t.to);
        toast.success("Settlement undone");
      } else {
        await setSettlement(group.id, t.from, t.to, t.amount, me);
        toast.success("Marked settled — nice");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update that");
    }
  }

  return (
    <div className="space-y-8">
      {/* Your standing in the pot */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.25em] text-muted-foreground">
            Your standing
          </p>
          <p className="mt-1 font-display text-3xl tabular-nums">
            {myNet > 0.005 ? (
              <>You&rsquo;re owed {formatMoney(myNet)}</>
            ) : myNet < -0.005 ? (
              <>You owe {formatMoney(-myNet)}</>
            ) : (
              <>All square — for now</>
            )}
          </p>
        </div>
        {allSettled && <Stamp tone="paid">All settled ✓</Stamp>}
      </div>

      {/* Who owes whom */}
      <section>
        <Rule label="Who owes whom" className="mb-5" />
        <ul className="divide-y divide-dashed divide-border/70">
          {rows.map(({ member, net, involvements }) => (
            <li
              key={member.uid}
              className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              <Monogram name={member.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {member.name}
                  {member.uid === me && (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      (you)
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {net > 0.005
                    ? "is owed"
                    : net < -0.005
                      ? "owes"
                      : "square"}
                </p>
              </div>
              {involvements > 0 && (
                <span
                  className="mr-1 hidden items-center gap-1 text-muted-foreground sm:flex"
                  title={`in ${involvements} suggested transfer${involvements === 1 ? "" : "s"}`}
                >
                  <TallyIcon className="h-4 w-4" />
                  <span className="text-xs tabular-nums">×{involvements}</span>
                </span>
              )}
              <p
                className={cn(
                  "font-display text-base tabular-nums",
                  net > 0.005 && "text-primary",
                  net < -0.005 && "text-foreground",
                )}
              >
                {net > 0.005 ? "+" : net < -0.005 ? "−" : ""}
                {formatMoney(Math.abs(net))}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Simplified settle-up */}
      <section>
        <Rule label="Simplified pay-offs" className="mb-5" />
        {transfers.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border bg-card/60 px-5 py-8 text-center">
            <p className="font-display text-lg">Nothing to settle</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Either the ledger is empty or everyone has chipped in evenly.
              Record an expense to get the arithmetic moving.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {transfers.map((t) => {
              const settled = isSettled(settlements, t);
              return (
                <li
                  key={`${t.from}->${t.to}`}
                  className={cn(
                    "flex flex-wrap items-center gap-3 rounded-sm border bg-card px-4 py-3 transition-colors",
                    settled ? "border-destructive/30 opacity-70" : "border-border",
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <Monogram name={memberName(group, t.from)} size="sm" />
                    <ArrowIcon
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground",
                        settled && "text-destructive/60",
                      )}
                    />
                    <Monogram name={memberName(group, t.to)} size="sm" />
                    <p className="ml-1 truncate text-sm text-foreground/85">
                      <span className="font-medium">
                        {memberName(group, t.from)}
                      </span>
                      <span className="text-muted-foreground"> pays </span>
                      <span className="font-medium">
                        {memberName(group, t.to)}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                    <p className="font-display text-base tabular-nums">
                      {formatMoney(t.amount)}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant={settled ? "outline" : "default"}
                      className={cn(
                        "gap-1.5",
                        settled &&
                          "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive",
                      )}
                      onClick={() => toggleSettled(t)}
                    >
                      {settled ? (
                        <>
                          <CheckIcon className="h-3.5 w-3.5" />
                          Settled
                        </>
                      ) : (
                        "Mark settled"
                      )}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {transfers.length > 0 && (
          <p className="mt-4 text-xs italic text-muted-foreground">
            We&rsquo;ve trimmed the bookkeeping to the fewest transfers —{" "}
            {transfers.length} in all. The rest is between friends.
          </p>
        )}
      </section>
    </div>
  );
}
