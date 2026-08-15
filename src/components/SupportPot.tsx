import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WalletIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

const PAYMENT_LINK = (
  import.meta.env.VITE_STRIPE_PAYMENT_LINK as string | undefined
)?.trim();

/** A real Stripe Payment Link lives on Stripe's own checkout hosts. */
export function isStripePaymentLink(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      (url.hostname === "buy.stripe.com" ||
        url.hostname === "checkout.stripe.com" ||
        url.hostname === "pay.stripe.com" ||
        url.hostname.endsWith(".stripe.com"))
    );
  } catch {
    return false;
  }
}

export type SupportLinkState = "none" | "invalid" | "live";

export function getSupportLinkState(): SupportLinkState {
  if (!PAYMENT_LINK) return "none";
  return isStripePaymentLink(PAYMENT_LINK) ? "live" : "invalid";
}

export function isSupportConfigured(): boolean {
  return getSupportLinkState() === "live";
}

/** "Support the pot" — a Stripe Payment Link (zero-backend tip jar).
 *  Renders nothing until VITE_STRIPE_PAYMENT_LINK is set in the Keys tab.
 *  If the key holds something that isn't a Stripe link, the button opens a
 *  short setup note instead of a dead page, so nobody lands on a 404. */
export function SupportPot({
  className,
  label = "Support the pot",
}: {
  className?: string;
  label?: string;
}) {
  const [fixOpen, setFixOpen] = useState(false);

  if (!PAYMENT_LINK) return null;

  if (!isStripePaymentLink(PAYMENT_LINK)) {
    return (
      <>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("gap-1.5 border-border bg-card", className)}
          onClick={() => setFixOpen(true)}
        >
          <WalletIcon className="h-4 w-4" />
          {label}
        </Button>

        <Dialog open={fixOpen} onOpenChange={setFixOpen}>
          <DialogContent className="paper-texture max-w-md rounded-sm border-border/80 bg-card">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full border border-border bg-secondary text-foreground">
                  <WalletIcon className="h-5 w-5" />
                </span>
                <div>
                  <DialogTitle className="font-display text-xl">
                    The till isn&rsquo;t hooked up
                  </DialogTitle>
                  <DialogDescription>
                    The payment link in your keys points at a dead page, so the
                    pot can&rsquo;t take coins yet.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <ol className="space-y-3 text-sm leading-6 text-foreground/80">
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-secondary font-display text-xs">
                  1
                </span>
                <span>
                  Open{" "}
                  <a
                    href="https://dashboard.stripe.com/payment-links"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-foreground underline decoration-accent/60 underline-offset-2 hover:text-accent"
                  >
                    dashboard.stripe.com → Payment links
                  </a>{" "}
                  and create a new one.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-secondary font-display text-xs">
                  2
                </span>
                <span>
                  Set the amount to{" "}
                  <em className="font-medium not-italic">
                    customer sets amount
                  </em>{" "}
                  so tippers choose their coin.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-secondary font-display text-xs">
                  3
                </span>
                <span>
                  Copy the full link — it looks like{" "}
                  <code className="rounded-sm bg-secondary px-1 py-0.5 font-mono text-xs">
                    https://buy.stripe.com/…
                  </code>
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-secondary font-display text-xs">
                  4
                </span>
                <span>
                  Paste that whole link into{" "}
                  <code className="rounded-sm bg-secondary px-1 py-0.5 font-mono text-xs">
                    VITE_STRIPE_PAYMENT_LINK
                  </code>{" "}
                  in the Keys tab, then refresh — the button opens it for real.
                </span>
              </li>
            </ol>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Button
      asChild
      variant="outline"
      size="sm"
      className={cn("gap-1.5 border-border bg-card", className)}
    >
      <a href={PAYMENT_LINK} target="_blank" rel="noreferrer">
        <WalletIcon className="h-4 w-4" />
        {label}
      </a>
    </Button>
  );
}
