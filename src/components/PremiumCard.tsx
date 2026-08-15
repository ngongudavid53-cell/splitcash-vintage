import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Paper, Stamp } from "@/components/bits";
import { SparkIcon } from "@/components/icons";
import { useAuth } from "@/hooks/use-auth";
import { isPremium, usePremium, PREMIUM_PRICE } from "@/lib/premium";
import { formatMoney } from "@/lib/money";
import { PremiumDialog } from "@/components/PremiumDialog";

/** The Premium Ledger card — locked until a one-time purchase lands, then a
 *  keepsake of the receipt. Lives on the dashboard's "till" row. */
export function PremiumCard() {
  const { user } = useAuth();
  const { record, loaded } = usePremium(user?.uid);
  const [open, setOpen] = useState(false);

  const premium = isPremium(record);

  return (
    <Paper className="flex flex-col px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-full border border-border bg-secondary text-foreground">
            <SparkIcon className="h-4 w-4 text-accent" />
          </span>
          <div>
            <p className="font-display text-base font-semibold leading-tight">
              The Premium Ledger
            </p>
            <p className="text-[0.58rem] font-bold uppercase tracking-[0.22em] text-muted-foreground">
              One-time · forever
            </p>
          </div>
        </div>
        {premium && <Stamp tone="paid">Premium ✓</Stamp>}
      </div>

      {!loaded ? (
        <p className="mt-3 text-xs italic text-muted-foreground">
          Checking the till…
        </p>
      ) : premium ? (
        <div className="mt-3 space-y-1.5 text-sm leading-6 text-foreground/80">
          <p>
            Every ledger now carries an{" "}
            <span className="font-semibold text-foreground">Export</span>{" "}
            ticket — the whole daybook as a CSV you own.
          </p>
          {record?.premiumSince && (
            <p className="text-xs text-muted-foreground">
              Unlocked{" "}
              {new Date(record.premiumSince).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
              {record.premiumTx ? ` · receipt #${record.premiumTx}` : ""}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm leading-6 text-foreground/75">
            CSV export of any ledger&rsquo;s full daybook — a one-time{" "}
            {formatMoney(Number(PREMIUM_PRICE))} keeps the keeper fed.
          </p>
          <Button
            type="button"
            className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setOpen(true)}
          >
            <SparkIcon className="h-4 w-4" />
            Unlock for {formatMoney(Number(PREMIUM_PRICE))}
          </Button>
        </div>
      )}

      <PremiumDialog uid={user?.uid} open={open} onOpenChange={setOpen} />
    </Paper>
  );
}
