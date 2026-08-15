import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ReceiptIcon } from "@/components/icons";
import { buildLedgerCsv, downloadCsv, slugify } from "@/lib/csv";
import type { Expense, Group, Settlement } from "@/lib/types";

/** The premium "Export" ticket on every ledger page. Without the Premium
 *  Ledger it shows a locked note pointing back to the dashboard; with it, the
 *  whole daybook drops as a CSV the user owns. */
export function ExportLedger({
  group,
  expenses,
  settlements,
  premium,
}: {
  group: Group;
  expenses: Expense[];
  settlements: Settlement[];
  premium: boolean;
}) {
  const [busy, setBusy] = useState(false);

  function handleExport() {
    setBusy(true);
    try {
      const csv = buildLedgerCsv(group, expenses, settlements);
      downloadCsv(`${slugify(group.name)}-ledger.csv`, csv);
      toast.success("The daybook is yours — check your downloads");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't make that file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-sm border border-dashed border-border/80 bg-card/60 px-4 py-3.5">
      <p className="text-[0.6rem] font-bold uppercase tracking-[0.25em] text-muted-foreground">
        Export · Premium
      </p>
      {premium ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs leading-5 text-foreground/75">
            The full daybook, settlements included.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5 border-border bg-card"
            onClick={handleExport}
            disabled={busy || expenses.length === 0}
          >
            <ReceiptIcon className="h-3.5 w-3.5" />
            {busy ? "Writing…" : "Export .csv"}
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-xs leading-5 text-foreground/70">
          A keepsake of the whole daybook is a Premium perk.{" "}
          <Link
            to="/app"
            className="underline decoration-dotted underline-offset-4 transition-colors hover:text-primary"
          >
            Unlock it on your dashboard
          </Link>
          .
        </p>
      )}
    </div>
  );
}
