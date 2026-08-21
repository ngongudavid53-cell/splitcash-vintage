import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useExpenses, useGroup, useSettlements } from "@/hooks/use-realtime";
import { computeBalances, potTotal, settleUp } from "@/lib/balances";
import { isFirebaseConfigured } from "@/lib/firebase";
import { setSettlement } from "@/lib/firestore";
import { formatMoney } from "@/lib/money";
import { isPremium, usePremium } from "@/lib/premium";
import type { Expense } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AddExpenseDialog } from "@/components/AddExpenseDialog";
import { BalanceSummary } from "@/components/BalanceSummary";
import { ExpenseHistory } from "@/components/ExpenseHistory";
import { BrandMark, Monogram, Paper, Rule, Stamp } from "@/components/bits";
import {
  ArrowIcon,
  CopyIcon,
  LogoutIcon,
  PenIcon,
  PotIcon,
} from "@/components/icons";
import { SetupNotice } from "@/components/SetupNotice";
import { AskTheBooks } from "@/components/AskTheBooks";
import { ExportLedger } from "@/components/ExportLedger";

type Tab = "balances" | "ledger";

/** Shown when Firestore rejects a read — most often because the rules in
 *  firestore.rules haven't been published to the Firebase project yet. */
function ReadNotice() {
  return (
    <div className="mt-6 rounded-sm border border-destructive/40 bg-destructive/10 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-destructive">
        The books won&rsquo;t open
      </p>
      <p className="mt-1 text-xs leading-5 text-foreground/80">
        Firestore is refusing to read this ledger. If you&rsquo;ve just set up
        Firebase, publish the rules from the{" "}
        <code className="rounded-sm bg-secondary px-1 py-0.5 font-mono">
          firestore.rules
        </code>{" "}
        file (Firestore Database → Rules → Publish), then refresh.
      </p>
    </div>
  );
}

export default function GroupView() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();

  const { data: group, loaded: groupLoaded, error: groupError } =
    useGroup(groupId);
  const { data: expenses, loaded: expensesLoaded, error: expensesError } =
    useExpenses(groupId);
  const {
    data: settlements,
    loaded: settlementsLoaded,
    error: settlementsError,
  } = useSettlements(groupId);

  const [tab, setTab] = useState<Tab>("balances");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  const me = user?.uid ?? "";
  const displayName =
    profile?.name ?? user?.displayName ?? user?.email?.split("@")[0] ?? "Friend";

  const { record: premiumRecord } = usePremium(user?.uid);
  const premium = isPremium(premiumRecord);

  const expensesSafe = expenses ?? [];
  const settlementsSafe = settlements ?? [];

  const total = useMemo(() => potTotal(expensesSafe), [expensesSafe]);
  const balances = useMemo(
    () => computeBalances(group ?? ({} as never), expensesSafe),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [group, expensesSafe],
  );
  const outstanding = useMemo(
    () => settleUp(balances).reduce((sum, t) => sum + t.amount, 0),
    [balances],
  );

  function openNewExpense() {
    setEditing(null);
    setAddOpen(true);
  }

  function openEditExpense(e: Expense) {
    setEditing(e);
    setAddOpen(true);
  }

  async function copyCode() {
    if (!group) return;
    try {
      await navigator.clipboard.writeText(group.inviteCode);
      toast.success("Code copied — pass it around");
    } catch {
      toast.error("Couldn't copy — the code is " + group.inviteCode);
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
      navigate("/");
    } catch {
      toast.error("Couldn't sign out just now");
    }
  }

  if (!isFirebaseConfigured) {
    return (
      <div className="min-h-screen">
        <AppBar displayName={displayName} onSignOut={handleSignOut} />
        <main className="mx-auto max-w-6xl px-5 pt-10 sm:px-8">
          <SetupNotice />
        </main>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-screen">
        <AppBar displayName={displayName} onSignOut={handleSignOut} />
        <main className="mx-auto max-w-6xl px-5 pt-16 sm:px-8">
          {groupLoaded ? (
            groupError ? (
              <ReadNotice />
            ) : (
              <div className="text-center">
                <p className="font-display text-3xl">No such ledger</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  This page isn&rsquo;t in the books. It may have been renamed,
                  or the code was made up.
                </p>
                <Button
                  asChild
                  variant="outline"
                  className="mt-6 border-border bg-card"
                >
                  <Link to="/app">← Back to your ledgers</Link>
                </Button>
              </div>
            )
          ) : (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-sm border border-border/60 bg-card/50"
                />
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  const readError = groupError || expensesError || settlementsError;

  return (
    <div className="min-h-screen">
      <AppBar displayName={displayName} onSignOut={handleSignOut} />

      <main className="mx-auto max-w-6xl px-5 pb-28 sm:px-8">
        {/* Back + heading */}
        <Link
          to="/app"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-primary"
        >
          <ArrowIcon className="h-4 w-4 rotate-180" />
          All ledgers
        </Link>

        <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.3em] text-primary">
              Ledger № {group.id.slice(0, 6)} · opened{" "}
              {group.createdAt
                ? new Date(group.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                : "recently"}
            </p>
            <h1 className="mt-2 break-words text-4xl sm:text-5xl">
              {group.name}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              {group.members.map((m) => (
                <span key={m.uid} className="inline-flex items-center gap-1.5">
                  <Monogram name={m.name} size="sm" />
                  <span className="text-sm text-foreground/80">
                    {m.name}
                    {m.uid === me && (
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        (you)
                      </span>
                    )}
                  </span>
                </span>
              ))}
            </div>
          </div>

          {/* Invite ticket + premium export */}
          <div className="w-full shrink-0 lg:w-72">
            <div className="rounded-sm border border-dashed border-primary/50 bg-secondary/40 px-4 py-3.5">
              <p className="text-[0.6rem] font-bold uppercase tracking-[0.25em] text-muted-foreground">
                Invite code · tear off &amp; share
              </p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="font-display text-2xl font-semibold tracking-[0.3em] text-primary">
                  {group.inviteCode}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-border bg-card"
                  onClick={copyCode}
                >
                  <CopyIcon className="h-3.5 w-3.5" />
                  Copy
                </Button>
              </div>
              <p className="mt-1.5 text-[0.68rem] leading-4 text-muted-foreground">
                Friends open the app, tap &ldquo;Join with a code&rdquo; and
                type this in.
              </p>
            </div>

            <ExportLedger
              group={group}
              expenses={expensesSafe}
              settlements={settlementsSafe}
              premium={premium}
            />
          </div>
        </div>

        {readError && <ReadNotice />}

        {/* Totals strip */}
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <Paper className="px-5 py-4">
            <p className="text-[0.6rem] font-bold uppercase tracking-[0.25em] text-muted-foreground">
              In the pot
            </p>
            <p className="mt-1 font-display text-2xl tabular-nums">
              {formatMoney(total)}
            </p>
          </Paper>
          <Paper className="px-5 py-4">
            <p className="text-[0.6rem] font-bold uppercase tracking-[0.25em] text-muted-foreground">
              Outstanding
            </p>
            <p className="mt-1 font-display text-2xl tabular-nums">
              {formatMoney(outstanding)}
            </p>
            <p className="mt-0.5 text-[0.68rem] text-muted-foreground">
              after simplification
            </p>
          </Paper>
          <div className="flex items-center">
            <Button
              type="button"
              size="lg"
              className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={openNewExpense}
            >
              <PenIcon className="h-4 w-4" />
              Record an expense
            </Button>
          </div>
        </div>

        {/* Ledger content + Ask the books */}
        <div className="mt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_330px] lg:items-start lg:gap-8">
          <div className="min-w-0">
            {/* Tabs */}
            <div className="flex gap-1 border-b border-border/70">
              {(
                [
                  ["balances", "Balances"],
                  [
                    "ledger",
                    `The ledger${expensesLoaded && expensesSafe.length > 0 ? ` (${expensesSafe.length})` : ""}`,
                  ],
                ] as [Tab, string][]
              ).map(([t, label]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    "-mb-px rounded-t-sm border px-4 py-2.5 text-sm font-semibold transition-colors",
                    tab === t
                      ? "border-border border-b-card bg-card text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="rounded-b-sm border border-t-0 border-border/70 bg-card p-5 sm:p-7">
              {tab === "balances" ? (
                settlementsLoaded ? (
                  <BalanceSummary
                    group={group}
                    expenses={expensesSafe}
                    settlements={settlementsSafe}
                    me={me}
                  />
                ) : (
                  <Skeleton />
                )
              ) : expensesLoaded ? (
                <ExpenseHistory
                  group={group}
                  expenses={expensesSafe}
                  me={me}
                  onEdit={openEditExpense}
                />
              ) : (
                <Skeleton />
              )}
            </div>
          </div>

          <div className="mt-10 lg:sticky lg:top-6 lg:mt-0">
            <AskTheBooks
              group={group}
              expenses={expensesSafe}
              settlements={settlementsSafe}
              userId={me}
              displayName={displayName}
            />
          </div>
        </div>
      </main>

      <AddExpenseDialog
        group={group}
        me={me}
        open={addOpen}
        onOpenChange={setAddOpen}
        editing={editing}
      />
    </div>
  );
}

function AppBar({
  displayName,
  onSignOut,
}: {
  displayName: string;
  onSignOut: () => void;
}) {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
      <Link to="/app" aria-label="Your ledgers">
        <BrandMark compact />
      </Link>
      <div className="flex items-center gap-3">
        <span className="hidden max-w-32 truncate text-sm font-medium sm:block">
          {displayName}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 border-border bg-card"
          onClick={onSignOut}
        >
          <LogoutIcon className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </header>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3 py-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-sm border border-border/60 bg-secondary/40"
        />
      ))}
    </div>
  );
}
