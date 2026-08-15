import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { addExpense, updateExpense } from "@/lib/firestore";
import { formatMoney, parseAmount, round2 } from "@/lib/money";
import type { Expense, Group, SplitMode, SplitType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CheckIcon, PenIcon, XIcon } from "./icons";

interface AddExpenseDialogProps {
  group: Group;
  me: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this entry instead of creating a new one. */
  editing?: Expense | null;
}

const inputCls =
  "h-9 w-full rounded-sm border border-input bg-card px-3 text-sm text-foreground shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

export function AddExpenseDialog({
  group,
  me,
  open,
  onOpenChange,
  editing,
}: AddExpenseDialogProps) {
  const [description, setDescription] = useState("");
  const [amountRaw, setAmountRaw] = useState("");
  const [paidBy, setPaidBy] = useState(me);
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [splitType, setSplitType] = useState<SplitType>("amount");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(group.members.map((m) => m.uid)),
  );
  const [shares, setShares] = useState<Record<string, string>>(() =>
    Object.fromEntries(group.members.map((m) => [m.uid, ""])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh page each time the drawer opens — prefilled when editing.
  useEffect(() => {
    if (!open) return;
    setDescription(editing?.description ?? "");
    setAmountRaw(editing ? String(editing.amount) : "");
    setPaidBy(editing?.paidBy ?? me);
    setSplitMode(editing?.splitMode ?? "equal");
    setSplitType(editing?.splitType ?? "amount");
    setSelected(
      editing
        ? new Set(editing.splitBetween)
        : new Set(group.members.map((m) => m.uid)),
    );
    setShares(
      editing
        ? Object.fromEntries(
            group.members.map((m) => [
              m.uid,
              editing.shares?.[m.uid] != null ? String(editing.shares[m.uid]) : "",
            ]),
          )
        : Object.fromEntries(group.members.map((m) => [m.uid, ""])),
    );
    setSaving(false);
    setError(null);
  }, [open, group, me, editing]);

  const amount = parseAmount(amountRaw);
  const participants = group.members.filter((m) => selected.has(m.uid));

  const sharesTotal = useMemo(() => {
    return round2(
      Object.entries(shares).reduce((sum, [uid, raw]) => {
        if (!selected.has(uid)) return sum;
        const n = Number(raw.trim());
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0),
    );
  }, [shares, selected]);

  const customValid =
    splitMode === "equal" ||
    (splitType === "amount"
      ? amount != null && Math.abs(sharesTotal - amount) < 0.005
      : Math.abs(sharesTotal - 100) < 0.01);

  const each = participants.length > 0 && amount != null ? amount / participants.length : 0;
  const valid =
    description.trim().length > 0 &&
    amount != null &&
    participants.length >= 1 &&
    customValid;

  function toggleMember(uid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  function setShare(uid: string, raw: string) {
    setShares((prev) => ({ ...prev, [uid]: raw }));
  }

  async function handleSubmit() {
    if (!valid || amount == null) return;
    setSaving(true);
    setError(null);
    try {
      const sharesRecord: Record<string, number> = {};
      if (splitMode === "custom") {
        for (const m of group.members) {
          const raw = shares[m.uid]?.trim();
          sharesRecord[m.uid] = raw ? Number(raw) : 0;
        }
      }
      const input = {
        description: description.trim(),
        amount,
        paidBy,
        splitBetween: participants.map((m) => m.uid),
        splitMode,
        splitType: splitMode === "custom" ? splitType : undefined,
        shares: splitMode === "custom" ? sharesRecord : undefined,
      };
      if (editing) {
        await updateExpense(group.id, editing.id, input);
        toast.success("Entry corrected in the ledger");
      } else {
        await addExpense(group.id, input, me);
        toast.success("Logged in the ledger");
      }
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't log that expense.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="paper-texture max-w-md rounded-sm border-border/80 bg-card sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full border border-border bg-secondary text-foreground">
              <PenIcon className="h-4.5 w-4.5" />
            </span>
            <div>
              <DialogTitle className="font-display text-xl">
                {editing ? "Edit the entry" : "Record an expense"}
              </DialogTitle>
              <DialogDescription>
                {editing
                  ? `Correct the daybook, ${group.name}`
                  : `Enter it in the daybook, ${group.name}`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-muted-foreground">
              What was it?
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Dinner at the tasca, metro cards, the hotel…"
              className="rounded-sm border-input bg-card"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                Amount
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-display text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  value={amountRaw}
                  onChange={(e) => setAmountRaw(e.target.value)}
                  inputMode="decimal"
                  placeholder="42.50"
                  className="rounded-sm border-input bg-card pl-7 font-display tabular-nums"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                Paid by
              </label>
              <select
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                className={inputCls}
              >
                {group.members.map((m) => (
                  <option key={m.uid} value={m.uid}>
                    {m.name}
                    {m.uid === me ? " (you)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                Split between
              </label>
              <div className="flex rounded-sm border border-border p-0.5">
                {(
                  [
                    ["equal", "Equal"],
                    ["custom", "Custom"],
                  ] as [SplitMode, string][]
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSplitMode(mode)}
                    className={cn(
                      "rounded-sm px-2.5 py-1 text-xs font-semibold transition-colors",
                      splitMode === mode
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {group.members.map((m) => {
                const on = selected.has(m.uid);
                return (
                  <button
                    key={m.uid}
                    type="button"
                    onClick={() => toggleMember(m.uid)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs font-medium transition-colors",
                      on
                        ? "border-primary/50 bg-primary/10 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {on ? (
                      <CheckIcon className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <span className="size-3.5 rounded-full border border-border" />
                    )}
                    {m.name}
                    {m.uid === me ? " (you)" : ""}
                  </button>
                );
              })}
            </div>
          </div>

          {splitMode === "equal" && participants.length > 0 && amount != null && (
            <p className="text-xs text-muted-foreground">
              Each of {participants.length} pays{" "}
              <span className="font-semibold text-foreground">
                {formatMoney(round2(each))}
              </span>
            </p>
          )}

          {splitMode === "custom" && (
            <div className="space-y-3 rounded-sm border border-dashed border-border bg-secondary/30 p-3.5">
              <div className="flex items-center justify-between">
                <label className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                  Custom shares
                </label>
                <div className="flex rounded-sm border border-border bg-card p-0.5">
                  {(
                    [
                      ["amount", "$ each"],
                      ["percent", "% each"],
                    ] as [SplitType, string][]
                  ).map(([type, label]) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setSplitType(type)}
                      className={cn(
                        "rounded-sm px-2 py-1 text-[0.68rem] font-semibold transition-colors",
                        splitType === type
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                {group.members
                  .filter((m) => selected.has(m.uid))
                  .map((m) => (
                    <div key={m.uid} className="flex items-center gap-3">
                      <span className="w-24 truncate text-sm text-foreground/80">
                        {m.name}
                        {m.uid === me ? " (you)" : ""}
                      </span>
                      <div className="relative flex-1">
                        {splitType === "amount" && (
                          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            $
                          </span>
                        )}
                        <Input
                          value={shares[m.uid] ?? ""}
                          onChange={(e) => setShare(m.uid, e.target.value)}
                          inputMode="decimal"
                          placeholder={
                            splitType === "amount" ? "0.00" : "0"
                          }
                          className={cn(
                            "h-8 rounded-sm border-input bg-card pl-6 text-right font-display tabular-nums",
                            splitType === "percent" && "pl-2",
                          )}
                        />
                        {splitType === "percent" && (
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            %
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>

              <div
                className={cn(
                  "flex items-center justify-between text-xs",
                  customValid ? "text-foreground/80" : "text-destructive",
                )}
              >
                <span className="uppercase tracking-[0.18em]">Total</span>
                <span className="font-display tabular-nums">
                  {splitType === "amount"
                    ? `${formatMoney(sharesTotal)} of ${amount != null ? formatMoney(amount) : "—"}`
                    : `${sharesTotal} of 100%`}
                  {customValid ? (
                    <CheckIcon className="ml-1.5 inline h-3.5 w-3.5 text-primary" />
                  ) : (
                    <XIcon className="ml-1.5 inline h-3.5 w-3.5" />
                  )}
                </span>
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!valid || saving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving
                ? "Inking…"
                : editing
                  ? "Save changes"
                  : "Log it in the ledger"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
