import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { memberName, memberShare } from "@/lib/balances";
import { removeExpense } from "@/lib/firestore";
import { formatMoney } from "@/lib/money";
import type { Expense, Group } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PenIcon, ReceiptIcon, XIcon } from "./icons";

interface ExpenseHistoryProps {
  group: Group;
  expenses: Expense[];
  me: string;
  onEdit: (expense: Expense) => void;
}

function dayLabel(ms: number): string {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return sameYear ? format(d, "EEE, d MMM") : format(d, "d MMM yyyy");
}

export function ExpenseHistory({
  group,
  expenses,
  me,
  onEdit,
}: ExpenseHistoryProps) {
  async function handleDelete(e: Expense) {
    if (!window.confirm("Remove this entry from the ledger?")) return;
    try {
      await removeExpense(group.id, e.id);
      toast.success("Entry removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove that");
    }
  }

  if (expenses.length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-border bg-card/60 px-5 py-14 text-center">
        <ReceiptIcon className="mx-auto h-8 w-8 text-muted-foreground/60" />
        <p className="mt-3 font-display text-lg">The ledger is still blank</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Record the first expense — the dinner, the cab, the questionable
          souvenir — and it will appear here, in ink.
        </p>
      </div>
    );
  }

  return (
    <ol className="divide-y divide-dashed divide-border/70">
      {expenses.map((e) => {
        const myShare = e.splitBetween.includes(me)
          ? memberShare(e, group, me)
          : null;
        const paidByName = memberName(group, e.paidBy);
        const splitBy =
          e.splitMode === "equal"
            ? `${e.splitBetween.length} ways`
            : e.splitType === "percent"
              ? "custom %"
              : "custom $";
        const isMine = e.createdBy === me;

        return (
          <li key={e.id} className="group flex gap-4 py-4 first:pt-0 last:pb-0">
            <div className="w-24 shrink-0 pt-0.5">
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                {dayLabel(e.createdAt)}
              </p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[1.05rem] leading-snug">
                {e.description}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {paidByName}
                {e.paidBy === me && <span> (you)</span>} paid · split{" "}
                {splitBy}
                {myShare != null && (
                  <>
                    {" "}
                    · your share{" "}
                    <span className="font-medium text-foreground/80">
                      {formatMoney(myShare)}
                    </span>
                  </>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <p
                className={cn(
                  "font-display text-base tabular-nums",
                  myShare != null && myShare > 0 && "text-foreground",
                )}
              >
                {formatMoney(e.amount)}
              </p>
              {isMine && (
                <span className="flex items-center gap-1 opacity-0 transition-all focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => onEdit(e)}
                    title="Edit this entry"
                    className="rounded-sm p-1 text-muted-foreground/50 transition-colors hover:bg-secondary/70 hover:text-foreground"
                  >
                    <PenIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(e)}
                    title="Remove this entry"
                    className="rounded-sm p-1 text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
