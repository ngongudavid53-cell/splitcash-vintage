import { useState, type ReactNode } from "react";
import { BraintreeSetupError } from "@/lib/braintree";

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-sm bg-secondary px-1 py-0.5 font-mono text-xs">
      {children}
    </code>
  );
}

/** The env var names to paste on the server that runs main.ts. Copying this
 *  block is the whole setup: no other keys are needed for the till. */
const SERVER_ENV_VARS = [
  "BRAINTREE_MERCHANT_ID=",
  "BRAINTREE_PUBLIC_KEY=",
  "BRAINTREE_PRIVATE_KEY=",
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
          server env
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

/** The shared "till isn't wired up yet" note for the Braintree dialogs.
 *  Reads the classified setup error and explains the exact fix:
 *   - no server at all (e.g. the Vite preview) → the 3-step go-live recipe
 *     with a copyable env block, plus the zero-backend Stripe tip jar.
 *   - server up but unconfigured → paste the env block into the server.
 *   - refused request → wrong function URL. */
export function BraintreeSetupNote({ error }: { error: unknown }) {
  const kind =
    error instanceof BraintreeSetupError ? error.kind : ("unknown" as const);
  const showDetail =
    error instanceof Error &&
    !(error instanceof BraintreeSetupError && kind !== "unknown");

  return (
    <div className="rounded-sm border border-dashed border-border bg-secondary/30 px-4 py-4">
      <p className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-muted-foreground">
        The till isn&rsquo;t wired up yet
      </p>
      <div className="mt-2 text-sm leading-6 text-foreground/75">
        {kind === "not-configured" ? (
          <>
            <p>
              The till server is up, but it hasn&rsquo;t been given its keys.
              Paste these into the server&rsquo;s environment (Deno Deploy →
              Project → Settings → Environment Variables), then reopen this
              window — the real Drop-in takes over automatically:
            </p>
            <EnvBlock />
          </>
        ) : kind === "no-server" || kind === "unreachable" ? (
          <>
            <p>
              There&rsquo;s no till server at this address — you&rsquo;re on
              the live preview, which has no backend of its own. Taking real
              tips is three steps, then it stays automatic:
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-4">
              <li>
                Get your sandbox keys at{" "}
                <Link href="https://sandbox.braintreegateway.com">
                  sandbox.braintreegateway.com
                </Link>{" "}
                → Settings → API keys.
              </li>
              <li>
                Deploy <Code>main.ts</Code> to{" "}
                <Link href="https://console.deno.com">Deno Deploy</Link>{" "}
                (entrypoint <Code>main.ts</Code> — the repo&rsquo;s{" "}
                <Code>deno.json</Code> is already set up for it).
              </li>
              <li>
                Paste these into the server, and set <Code>VITE_API_URL</Code>{" "}
                (or <Code>VITE_BRAINTREE_FUNCTION_URL</Code>) in the Keys tab
                only if the server lives on another domain:
              </li>
            </ol>
            <EnvBlock />
            <p className="mt-2">
              That&rsquo;s it — the moment the server answers, this note
              disappears and the real Drop-in replaces it.
            </p>
            <p className="mt-2">
              Want tips working right now? The Stripe{" "}
              <span className="font-semibold">&ldquo;Support the pot&rdquo;</span>{" "}
              button needs no backend at all — just add{" "}
              <Code>VITE_STRIPE_PAYMENT_LINK</Code> in the Keys tab.
            </p>
          </>
        ) : kind === "auth-error" ? (
          <p>
            The till server refused the request. Double-check that{" "}
            <Code>VITE_BRAINTREE_FUNCTION_URL</Code> points at the server
            hosting <Code>main.ts</Code>.
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
