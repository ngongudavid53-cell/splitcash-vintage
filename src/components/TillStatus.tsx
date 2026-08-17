import { Paper } from "@/components/bits";
import { PotIcon } from "@/components/icons";
import { useServerConfig } from "@/lib/server";
import { isGravityConfigured } from "@/lib/gravity";
import { isAssistantConfigured } from "@/hooks/use-assistant";
import { isSupportConfigured } from "@/components/SupportPot";
import { cn } from "@/lib/utils";

type State = "live" | "test" | "off";

const STATE_META: Record<State, { label: string; dot: string }> = {
  live: { label: "Live", dot: "bg-accent" },
  test: { label: "Test", dot: "bg-accent/50" },
  off: { label: "Awaiting", dot: "bg-foreground/20" },
};

function StatusRow({
  label,
  detail,
  state,
}: {
  label: string;
  detail: string;
  state: State;
}) {
  const meta = STATE_META[state];
  return (
    <div className="flex items-start justify-between gap-3 border-b border-dashed border-border/60 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-tight">{label}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</p>
      </div>
      <span className="flex shrink-0 items-center gap-1.5 pt-0.5 text-[0.6rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        <span className={cn("size-1.5 rounded-full", meta.dot)} />
        {meta.label}
      </span>
    </div>
  );
}

/** "The till" — one glance at which monetization channels are wired up and
 *  what's still missing. Reads the backend config (/api/config) plus
 *  explicitly configured browser-safe proxy settings. */
export function TillStatus() {
  const { config: server } = useServerConfig();

  const assistantState: State = server.assistant
    ? "live"
    : isAssistantConfigured()
      ? "test"
      : "off";
  const adsState: State = server.ads
    ? "live"
    : isGravityConfigured()
      ? "test"
      : "off";
  const stripeState: State = server.stripe ? "live" : "off";
  const stripeTipsState: State = isSupportConfigured() ? "live" : "off";

  return (
    <Paper className="flex flex-col px-5 py-4">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-full border border-border bg-secondary text-foreground">
          <PotIcon className="h-4 w-4" />
        </span>
        <div>
          <p className="font-display text-base font-semibold leading-tight">
            The till
          </p>
          <p className="text-[0.58rem] font-bold uppercase tracking-[0.22em] text-muted-foreground">
            What&rsquo;s taking money
          </p>
        </div>
      </div>

      <div className="mt-3">
        <StatusRow
          label="The keeper (Gemini)"
          state={assistantState}
          detail={
            server.assistant
              ? "Key held by the app's backend — no client key needed."
              : isAssistantConfigured()
                ? "A server-side proxy is configured."
                : "Configure GEMINI_API_KEY on the server."
          }
        />
        <StatusRow
          label="Advertisers (Gravity)"
          state={adsState}
          detail={
            server.ads
              ? "Ads proxied through the app's backend."
              : isGravityConfigured()
                ? "A browser-safe proxy is configured."
                : "Configure GRAVITY_API_KEY on the server."
          }
        />
        <StatusRow
          label="Premium ledger (Stripe)"
          state={stripeState}
          detail={
            server.stripe
              ? "Checkout ready — sandbox keys in test mode."
              : "Add STRIPE_SECRET_KEY in the Keys tab."
          }
        />
        <StatusRow
          label="Tip jar (Stripe)"
          state={stripeTipsState}
          detail={
            isSupportConfigured()
              ? "Payment link is live."
              : "Add VITE_STRIPE_PAYMENT_LINK in the Keys tab."
          }
        />
      </div>
    </Paper>
  );
}
