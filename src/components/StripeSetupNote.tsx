import { useState, type ReactNode } from "react";
import { StripeSetupError } from "@/lib/stripe";

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-sm bg-secondary px-1 py-0.5 font-mono text-xs">
      {children}
    </code>
  );
}

/** The env var names to paste into the project's Keys / API keys tab.
 *  Copying this block is the whole setup: no server, no Deno Deploy. */
const SERVER_ENV_VARS = [
  "STRIPE_SECRET_KEY=",
  "GEMINI_API_KEY=",
  "GRAVITY_API_KEY=",
];

/** A small copyable block so the exact key names are one click away. */
function EnvBlock() {
  const [copied, setCopied] = useState(false);
  const text = SERVER_ENV_VARS.join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (permissions) — the block is selectable anyway.
    }
  }

  return (
    <div className="mt-2 overflow-hidden rounded-sm border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border/60 bg-secondary/40 px-2.5 py-1">
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
          keys to paste
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          className="text-[0.65rem] font-semibold text-accent hover:underline"
        >
          {copied ? "copied ✓" : "copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-2.5 py-2 font-mono text-[0.65rem] leading-5 text-foreground/80">
        {text}
      </pre>
    </div>
  );
}

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-foreground underline decoration-accent/60 underline-offset-2 hover:text-accent"
    >
      {children}
    </a>
  );
}

/** The shared "till isn't wired up yet" note for the Stripe premium checkout.
 *  Reads the classified setup error and explains the exact fix:
 *   - backend up but unconfigured → paste the keys into the Keys tab.
 *   - no backend at all (e.g. the Vite preview) → the 3-step go-live recipe
 *     with a copyable env block.
 *   - refused request → wrong backend address. */
export function StripeSetupNote({ error }: { error: unknown }) {
  const kind =
    error instanceof StripeSetupError ? error.kind : ("unknown" as const);
  const showDetail =
    error instanceof Error &&
    !(error instanceof StripeSetupError && kind !== "unknown");

  return (
    <div className="rounded-sm border border-dashed border-border bg-secondary/30 px-4 py-4">
      <p className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-muted-foreground">
        The till isn&rsquo;t wired up yet
      </p>
      <div className="mt-2 text-sm leading-6 text-foreground/75">
        {kind === "not-configured" ? (
          <>
            <p>
              The till is up, but it hasn&rsquo;t been given its keys. Paste
              these into the project&rsquo;s <b>Keys / API keys</b> tab, then
              reopen this window — the real Stripe checkout takes over
              automatically:
            </p>
            <EnvBlock />
          </>
        ) : kind === "no-server" || kind === "unreachable" ? (
          <>
            <p>
              There&rsquo;s no till backend at this address — you&rsquo;re on
              the live preview, which has no backend of its own. Taking real
              payments is three steps, then it stays automatic:
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-4">
              <li>
                Get your secret key at{" "}
                <Link href="https://dashboard.stripe.com/apikeys">
                  dashboard.stripe.com → Developers → API keys
                </Link>{" "}
                (any <Code>sk_test_…</Code> or <Code>sk_live_…</Code> key
                works).
              </li>
              <li>
                In this project&rsquo;s <b>Keys / API keys</b> tab, paste{" "}
                <Code>STRIPE_SECRET_KEY</Code> with that value — plus{" "}
                <Code>GEMINI_API_KEY</Code> and <Code>GRAVITY_API_KEY</Code>{" "}
                if you want the assistant and ads too.
              </li>
              <li>
                Refresh the app. No server to deploy, no Deno Deploy, nothing
                else to set up.
              </li>
            </ol>
            <EnvBlock />
            <p className="mt-2">
              That&rsquo;s it — the moment the key lands, this note disappears
              and the real checkout replaces it.
            </p>
          </>
        ) : kind === "auth-error" ? (
          <p>
            The till refused the request. Double-check the backend address in
            the Keys tab (<Code>VITE_CONVEX_SITE_URL</Code> or the legacy{" "}
            <Code>VITE_API_URL</Code>).
          </p>
        ) : (
          <p>Something went wrong setting up the till.</p>
        )}
      </div>
      {showDetail && (
        <p className="mt-2 text-xs italic text-muted-foreground">
          {error instanceof Error ? error.message : String(error)}
        </p>
      )}
    </div>
  );
}
