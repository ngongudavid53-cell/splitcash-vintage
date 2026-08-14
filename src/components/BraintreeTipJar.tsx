import { useEffect, useRef, useState, type FormEvent } from "react";
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
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import {
  BraintreeSetupError,
  fetchBraintreeServerStatus,
  fetchClientToken,
  submitBraintreeSale,
  type BraintreeSaleResponse,
} from "@/lib/braintree";
import { CheckIcon, WalletIcon } from "@/components/icons";
import { Stamp } from "@/components/bits";
import { BraintreeSetupNote } from "@/components/BraintreeSetupNote";
import type { Dropin } from "braintree-web-drop-in";

type Phase = "idle" | "loading" | "ready" | "paying" | "done";

const QUICK_AMOUNTS = ["3.00", "5.00", "10.00", "25.00"];

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

/** "Support the pot" — a Braintree Drop-in tip jar.
 *
 *  When a real backend answers (main.ts deployed with the BRAINTREE_* keys),
 *  this runs the genuine Drop-in and settles server-side. When there's no
 *  backend at all — like the live preview — it says so precisely, and offers
 *  a clearly-labelled demo till (test card, DEMO stamp, nothing charged) so
 *  the checkout can still be felt before the keys arrive.
 */
export function BraintreeTipJar({
  className,
  label = "Support the pot",
}: {
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [amount, setAmount] = useState("5.00");
  const [canPay, setCanPay] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [receipt, setReceipt] = useState<BraintreeSaleResponse["transaction"] | null>(null);
  const [demo, setDemo] = useState(false);
  const [demoDone, setDemoDone] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<Dropin | null>(null);
  const setupStartedRef = useRef(false);

  const amountValid = AMOUNT_RE.test(amount.trim()) && Number(amount) > 0;

  // Reset + tear down whenever the window closes.
  useEffect(() => {
    if (!open) {
      instanceRef.current?.teardown(() => {});
      instanceRef.current = null;
      setupStartedRef.current = false;
      setPhase("idle");
      setCanPay(false);
      setError(null);
      setReceipt(null);
      setDemo(false);
      setDemoDone(false);
    }
  }, [open]);

  async function setupDropin() {
    if (setupStartedRef.current || !containerRef.current) return;
    setupStartedRef.current = true;
    setPhase("loading");
    setError(null);
    try {
      // Health-check first so the failure message is exact: no server at all
      // vs. server up but keys missing vs. everything fine.
      const status = await fetchBraintreeServerStatus();
      if (status === "no-server") {
        throw new BraintreeSetupError(
          "no-server",
          undefined,
          "No till server is running at this address yet.",
        );
      }
      if (status === "not-configured") {
        throw new BraintreeSetupError(
          "not-configured",
          undefined,
          "Braintree is not configured on the server yet.",
        );
      }
      const clientToken = await fetchClientToken();
      const mod = await import("braintree-web-drop-in");
      const instance = await mod.default.create({
        authorization: clientToken,
        container: containerRef.current,
        paypal: { flow: "vault" },
      });
      instanceRef.current = instance;
      setCanPay(instance.isPaymentMethodRequestable());
      instance.on("paymentMethodRequestable", () => setCanPay(true));
      instance.on("noPaymentMethodRequestable", () => setCanPay(false));
      setPhase("ready");
    } catch (err) {
      setupStartedRef.current = false;
      setPhase("idle");
      setError(
        err instanceof Error ? err : new Error("Something went wrong setting up the till."),
      );
    }
  }

  // Wait a beat for the dialog to lay out before the Drop-in measures its container.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(setupDropin, 80);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handlePay() {
    if (!amountValid) {
      toast.error("Enter an amount in the till, like 5.00");
      return;
    }
    const instance = instanceRef.current;
    if (!instance) return;
    setPhase("paying");
    try {
      const { nonce } = await instance.requestPaymentMethod();
      const res = await submitBraintreeSale(amount.trim(), nonce);
      if (res.success && res.transaction) {
        setReceipt(res.transaction);
        setPhase("done");
        return;
      }
      setPhase("ready");
      toast.error(res.error ?? "The till declined that one.");
    } catch (err) {
      setPhase("ready");
      toast.error(err instanceof Error ? err.message : "Couldn't complete the payment.");
    }
  }

  function handleDemoDone() {
    setReceipt({ id: "DEMO-000001", status: "settled", amount: amount.trim() });
    setDemoDone(true);
    setPhase("done");
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("gap-1.5 border-border bg-card", className)}
        onClick={() => setOpen(true)}
      >
        <WalletIcon className="h-4 w-4" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="paper-texture max-w-md rounded-sm border-border/80 bg-card">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full border border-border bg-secondary text-foreground">
                <WalletIcon className="h-5 w-5" />
              </span>
              <div>
                <DialogTitle className="font-display text-xl">
                  Support the pot
                </DialogTitle>
                <DialogDescription>
                  A few coins for the keeper — card, PayPal or wallet.
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
                {formatMoney(Number(receipt.amount ?? amount))}
              </p>
              <p className="mt-1 text-sm leading-6 text-foreground/70">
                {demoDone
                  ? "dropped in the demo pot. Nothing was charged — a dry run."
                  : "dropped in the pot. Tick, done — obrigada!"}
              </p>
              <div className="mt-5 flex items-center justify-center gap-3">
                <Stamp tone={demoDone ? "accent" : "paid"}>
                  {demoDone ? "Demo ✓" : "Settled ✓"}
                </Stamp>
                <span className="font-mono text-[0.65rem] tracking-wider text-muted-foreground">
                  #{receipt.id}
                </span>
              </div>
              {demoDone && (
                <p className="mt-4 rounded-sm border border-dashed border-accent/50 bg-accent/5 px-3 py-2 text-xs leading-5 text-foreground/70">
                  Demo only — nothing was charged. To take real tips: grab keys
                  at{" "}
                  <a
                    href="https://sandbox.braintreegateway.com"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-foreground underline decoration-accent/60 underline-offset-2 hover:text-accent"
                  >
                    sandbox.braintreegateway.com
                  </a>{" "}
                  (Settings → API keys), deploy <code className="font-mono">main.ts</code>, and
                  paste the <code className="font-mono">BRAINTREE_*</code> vars
                  into the server — the real Drop-in switches on automatically.
                </p>
              )}
            </div>
          ) : demo ? (
            <DemoTillForm
              amount={amount}
              onAmount={setAmount}
              onDone={handleDemoDone}
              onBack={() => setDemo(false)}
            />
          ) : error ? (
            <div className="space-y-3">
              <BraintreeSetupNote error={error} />
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
                  Try the demo till
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Amount */}
              <div className="space-y-2">
                <label className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                  The till
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="5.00"
                    className="max-w-32 rounded-sm border-input bg-card text-center font-display text-xl tabular-nums"
                    aria-label="Tip amount"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_AMOUNTS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setAmount(q)}
                        className={cn(
                          "rounded-sm border px-2 py-1 text-xs font-medium transition-colors",
                          amount === q
                            ? "border-primary/60 bg-primary/10 text-primary"
                            : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                        )}
                      >
                        {formatMoney(Number(q))}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Drop-in container */}
              <div
                ref={containerRef}
                className={cn(
                  "min-h-[230px] overflow-hidden rounded-sm border border-border/70 bg-white transition-opacity",
                  phase === "loading" && "animate-pulse opacity-60",
                )}
              >
                {phase === "loading" && (
                  <p className="px-4 py-6 text-center text-xs italic text-muted-foreground">
                    Fetching the till&hellip;
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs italic text-muted-foreground">
                  {amountValid
                    ? `You're putting ${formatMoney(Number(amount))} in the pot.`
                    : "Enter a valid amount to pay."}
                </p>
                <Button
                  type="button"
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={!canPay || !amountValid || phase === "paying"}
                  onClick={handlePay}
                >
                  {phase === "paying" ? "Settling…" : "Pay"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** A client-side dry run of the checkout — the Braintree test card, the same
 *  receipt, but stamped DEMO. Nothing is charged, ever; it exists so the till
 *  can be felt before the server keys arrive. Exported so the Premium
 *  checkout can offer the same dry run. */
export function DemoTillForm({
  amount,
  onAmount,
  onDone,
  onBack,
}: {
  amount: string;
  onAmount: (amount: string) => void;
  onDone: () => void;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const [card, setCard] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [processing, setProcessing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const digits = card.replace(/\s/g, "");
  const cardValid = digits.length >= 13 && digits.length <= 19;
  const expiryValid = /^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry);
  const cvvValid = /^\d{3,4}$/.test(cvv);
  const canSubmit = cardValid && expiryValid && cvvValid && name.trim().length > 0;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      setFormError(
        "Almost — use the test card 4111 1111 1111 1111, any future expiry, any CVV.",
      );
      return;
    }
    setFormError(null);
    setProcessing(true);
    window.setTimeout(() => {
      setProcessing(false);
      onDone();
    }, 1200);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-sm border border-dashed border-accent/50 bg-accent/5 px-3.5 py-2.5">
        <p className="text-[0.6rem] font-bold uppercase tracking-[0.22em] text-muted-foreground">
          Demo till · nothing is charged
        </p>
        <p className="mt-0.5 text-xs leading-5 text-foreground/75">
          A dry run of the checkout so you can feel the flow before your keys
          arrive. Test card:{" "}
          <span className="font-mono">4111 1111 1111 1111</span>, any future
          expiry, any CVV.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={amount}
          onChange={(e) => onAmount(e.target.value)}
          inputMode="decimal"
          placeholder="5.00"
          className="max-w-28 rounded-sm border-input bg-card text-center font-display text-xl tabular-nums"
          aria-label="Tip amount"
        />
        <div className="flex flex-wrap gap-1.5">
          {QUICK_AMOUNTS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onAmount(q)}
              className={cn(
                "rounded-sm border px-2 py-1 text-xs font-medium transition-colors",
                amount === q
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {formatMoney(Number(q))}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2.5">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name on card"
          className="rounded-sm border-input bg-card"
          autoComplete="off"
        />
        <Input
          value={card}
          onChange={(e) =>
            setCard(
              e.target.value
                .replace(/\D/g, "")
                .slice(0, 16)
                .replace(/(\d{4})(?=\d)/g, "$1 "),
            )
          }
          placeholder="4111 1111 1111 1111"
          inputMode="numeric"
          className="rounded-sm border-input bg-card font-mono tracking-widest"
          autoComplete="off"
        />
        <div className="grid grid-cols-2 gap-2.5">
          <Input
            value={expiry}
            onChange={(e) =>
              setExpiry(
                e.target.value
                  .replace(/\D/g, "")
                  .slice(0, 4)
                  .replace(/(\d{2})(\d)/, "$1/$2"),
              )
            }
            placeholder="MM/YY"
            inputMode="numeric"
            className="rounded-sm border-input bg-card font-mono"
            autoComplete="off"
          />
          <Input
            value={cvv}
            onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="CVV"
            inputMode="numeric"
            className="rounded-sm border-input bg-card font-mono"
            autoComplete="off"
          />
        </div>

        {formError && (
          <p className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">
            {formError}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            disabled={processing}
          >
            Back
          </Button>
          <Button
            type="submit"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={!canSubmit || processing}
          >
            {processing
              ? "Settling…"
              : `Pay ${formatMoney(Number(amount))} (demo)`}
          </Button>
        </div>
      </form>
    </div>
  );
}
