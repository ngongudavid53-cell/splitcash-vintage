import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatMoney } from "@/lib/money";
import { apiBase } from "@/lib/server";
import {
  StripeSetupError,
  createStripeCheckout,
  fetchStripeServerStatus,
  verifyStripeSession,
} from "@/lib/stripe";
import { grantPremium, PREMIUM_PRICE } from "@/lib/premium";
import { CheckIcon, SparkIcon } from "@/components/icons";
import { Stamp } from "@/components/bits";
import { StripeSetupNote } from "@/components/StripeSetupNote";
import { DemoTillForm } from "@/components/BraintreeTipJar";

type Phase = "idle" | "loading" | "ready" | "paying" | "done";

/** The Premium Ledger checkout — a one-time purchase through Stripe Checkout
 *  at the fixed premium price. The client asks the backend for a hosted
 *  Checkout Session, the user pays on Stripe's page, and on the way back the
 *  session is verified server-side before the entitlement is written to the
 *  user's Firestore record.
 *
 *  When no till backend is reachable (like the live preview), the same dry-run
 *  demo checkout as the tip jar is offered — stamped DEMO, nothing charged,
 *  nothing unlocked — so the flow can be felt before the keys arrive. */
export function PremiumDialog({
  uid,
  open,
  onOpenChange,
}: {
  uid: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [receipt, setReceipt] = useState<{ id: string } | null>(null);
  const [demo, setDemo] = useState(false);
  const [demoDone, setDemoDone] = useState(false);
  const [pendingSession, setPendingSession] = useState<string | null>(null);

  const setupStartedRef = useRef(false);

  // --- Detect a return from Stripe Checkout --------------------------------
  // The backend builds the success_url as /#/app?stripe_session={CHECKOUT_SESSION_ID}.
  // When the user lands back here, verify the session and grant the
  // entitlement, then open the dialog with the receipt.
  useEffect(() => {
    const hash = window.location.hash;
    const query = hash.split("?")[1] ?? "";
    const sessionId = new URLSearchParams(query).get("stripe_session");
    if (!sessionId) return;
    setPendingSession(sessionId);
    // Clean the url so a refresh doesn't re-verify the same session.
    const cleanHash = hash.replace(/[?&]stripe_session=[^&]*/, "");
    const next = `${window.location.pathname}${window.location.search}${cleanHash || "#/app"}`;
    window.history.replaceState(null, "", next);
  }, []);

  // --- Verify the pending session (returning from Stripe) ------------------
  useEffect(() => {
    if (!pendingSession) return;
    let cancelled = false;
    setPhase("loading");
    void (async () => {
      try {
        const res = await verifyStripeSession(pendingSession);
        if (cancelled) return;
        if (!res.success) {
          setPhase("idle");
          setError(new Error(res.error ?? "Couldn't confirm that payment."));
          return;
        }
        if (uid) {
          try {
            await grantPremium(uid, pendingSession, apiBase());
          } catch {
            // The money moved; only the record failed. Surface it clearly.
            setPhase("idle");
            setError(
              new Error(
                "Payment went through but recording it failed — check that Firestore rules are published.",
              ),
            );
            return;
          }
        }
        setReceipt({ id: res.transactionId ?? pendingSession });
        setPhase("done");
        onOpenChange(true);
      } catch (err) {
        if (cancelled) return;
        setPhase("idle");
        setError(
          err instanceof Error
            ? err
            : new Error("Couldn't confirm that payment."),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSession]);

  // --- Reset + set up whenever the window opens ----------------------------
  useEffect(() => {
    if (!open) {
      setupStartedRef.current = false;
      setPhase("idle");
      setError(null);
      setReceipt(null);
      setDemo(false);
      setDemoDone(false);
      return;
    }
    if (pendingSession) return; // the verify effect above owns this open
    if (setupStartedRef.current) return;
    setupStartedRef.current = true;
    setPhase("loading");
    setError(null);
    void (async () => {
      try {
        // Health-check first so the failure message is exact: no backend at
        // all vs. backend up but keys missing vs. everything fine.
        const status = await fetchStripeServerStatus();
        if (status === "no-server") {
          throw new StripeSetupError(
            "no-server",
            undefined,
            "No till backend is running at this address yet.",
          );
        }
        if (status === "not-configured") {
          throw new StripeSetupError(
            "not-configured",
            undefined,
            "Stripe is not configured on the backend yet.",
          );
        }
        setPhase("ready");
      } catch (err) {
        setupStartedRef.current = false;
        setPhase("idle");
        setError(
          err instanceof Error
            ? err
            : new Error("Something went wrong setting up the till."),
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingSession]);

  async function handlePay() {
    if (!uid) {
      toast.error("Sign in again to unlock the premium ledger.");
      return;
    }
    setPhase("paying");
    try {
      // Ask the backend for a hosted Checkout Session, then hand the user to
      // Stripe's own page. On the way back they land on /#/app?stripe_session=….
      const { url } = await createStripeCheckout(
        PREMIUM_PRICE,
        window.location.origin,
      );
      window.location.assign(url);
    } catch (err) {
      setPhase("ready");
      toast.error(err instanceof Error ? err.message : "Couldn't start the checkout.");
    }
  }

  function handleDemoDone() {
    setReceipt({ id: "DEMO-000001" });
    setDemoDone(true);
    setPhase("done");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="paper-texture max-w-md rounded-sm border-border/80 bg-card">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full border border-border bg-secondary text-foreground">
              <SparkIcon className="h-5 w-5 text-accent" />
            </span>
            <div>
              <DialogTitle className="font-display text-xl">
                The Premium Ledger
              </DialogTitle>
              <DialogDescription>
                One-time · {formatMoney(Number(PREMIUM_PRICE))} · yours forever
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {phase === "done" && receipt ? (
          <div className="py-2 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full border-2 border-accent text-accent">
              <CheckIcon className="h-6 w-6" />
            </span>
            <p className="mt-4 font-display text-2xl">
              {demoDone ? "Premium, in a dry run" : "Premium, at last"}
            </p>
            <p className="mt-1 text-sm leading-6 text-foreground/70">
              {demoDone
                ? "A rehearsal — nothing was charged and nothing was unlocked. Paste STRIPE_SECRET_KEY in the project's Keys tab and the real checkout takes over automatically."
                : "The whole daybook is yours to export. Look for the Export ticket in any ledger."}
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              <Stamp tone={demoDone ? "accent" : "paid"}>
                {demoDone ? "Demo ✓" : "Premium ✓"}
              </Stamp>
              <span className="font-mono text-[0.65rem] tracking-wider text-muted-foreground">
                #{receipt.id}
              </span>
            </div>
            {demoDone && (
              <p className="mt-4 rounded-sm border border-dashed border-accent/50 bg-accent/5 px-3 py-2 text-xs leading-5 text-foreground/70">
                Demo only — the CSV Export stays locked until a real payment
                lands. Grab a secret key at{" "}
                <a
                  href="https://dashboard.stripe.com/apikeys"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-foreground underline decoration-accent/60 underline-offset-2 hover:text-accent"
                >
                  dashboard.stripe.com → Developers → API keys
                </a>
                , and add <code className="font-mono">STRIPE_SECRET_KEY</code>{" "}
                to the project&rsquo;s Keys tab.
              </p>
            )}
          </div>
        ) : demo ? (
          <DemoTillForm
            amount={PREMIUM_PRICE}
            onAmount={() => {}}
            onDone={handleDemoDone}
            onBack={() => setDemo(false)}
          />
        ) : error ? (
          <div className="space-y-3">
            <StripeSetupNote error={error} />
            {error instanceof StripeSetupError && (
              <div className="flex items-center justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-border bg-card"
                  onClick={() => {
                    setError(null);
                    setDemo(true);
                  }}
                >
                  Try the demo checkout
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-sm border border-dashed border-accent/50 bg-accent/5 px-4 py-3">
              <p className="text-sm leading-6 text-foreground/80">
                Unlocks{" "}
                <span className="font-semibold text-foreground">
                  CSV export of any ledger
                </span>{" "}
                — the full daybook, settlements included, as a file you own. A
                one-time payment keeps the keeper fed.
              </p>
            </div>

            {phase === "loading" ? (
              <div className="flex min-h-40 items-center justify-center rounded-sm border border-border/70 bg-white">
                <p className="px-4 py-6 text-center text-xs italic text-muted-foreground">
                  Fetching the till&hellip;
                </p>
              </div>
            ) : (
              <div className="rounded-sm border border-border/70 bg-white px-4 py-6">
                <p className="font-display text-2xl tabular-nums text-center">
                  {formatMoney(Number(PREMIUM_PRICE))}
                </p>
                <p className="mt-1 text-center text-xs italic text-muted-foreground">
                  card · Apple Pay · Google Pay — paid on Stripe&rsquo;s own
                  page, nothing leaves this app.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs italic text-muted-foreground">
                {formatMoney(Number(PREMIUM_PRICE))} · one-time · forever
              </p>
              <Button
                type="button"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={phase !== "ready"}
                onClick={handlePay}
              >
                {phase === "paying"
                  ? "Heading to Stripe…"
                  : `Unlock for ${formatMoney(Number(PREMIUM_PRICE))}`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
