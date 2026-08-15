/**
 * Client-side plumbing for the Stripe premium checkout.
 *
 * The heavy lifting stays on the server (see main.ts): the browser asks for a
 * hosted Checkout Session, sends the user to Stripe's page, and on the way
 * back hands the session id over to be verified. The secret key never appears
 * in this file or the bundle.
 */

import { apiBase } from "./server";

/** Where the Stripe API lives. Resolution order:
 *  1. VITE_API_URL — the shared backend URL (see ./server.ts). Set this once
 *     when the Deno/Hono server in main.ts is deployed on another domain and
 *     every integration (assistant, ads, Stripe) uses it.
 *  2. Same origin as the app — main.ts serves /api/stripe/... alongside the
 *     SPA, so a blank value "just works" when app + server are deployed
 *     together (e.g. both on Deno Deploy). */
export function stripeBaseUrl(): string {
  return apiBase().replace(/\/+$/, "");
}

export interface StripeCheckoutResponse {
  url?: string;
  error?: string;
}

export interface StripeEntitlementResponse {
  success: boolean;
  transactionId?: string;
  amount?: string;
  error?: string;
}

/** Why the till couldn't be set up — lets the UI explain the exact fix:
 *   - "no-server":      something answered, but it wasn't our API (e.g. the
 *                       Vite preview returns the SPA's HTML page for /api/*,
 *                       or a 404 from a host with no backend).
 *   - "unreachable":    the network call itself failed (server offline).
 *   - "not-configured": the real server answered 503 — keys missing there.
 *   - "auth-error":     the server answered, but refused (bad URL / 4xx).
 *   - "unknown":        anything else. */
export type StripeSetupKind =
  | "no-server"
  | "unreachable"
  | "not-configured"
  | "auth-error"
  | "unknown";

export class StripeSetupError extends Error {
  readonly kind: StripeSetupKind;
  readonly status: number | undefined;

  constructor(kind: StripeSetupKind, status: number | undefined, message: string) {
    super(message);
    this.name = "StripeSetupError";
    this.kind = kind;
    this.status = status;
  }
}

/** Quick health check of the Stripe backend on its configured base URL.
 *  Tells callers whether a live server exists and whether it has Stripe keys
 *  — without guessing from status codes. Never throws. */
export async function fetchStripeServerStatus(): Promise<
  "live" | "no-server" | "not-configured"
> {
  try {
    const res = await fetch(`${stripeBaseUrl()}/api/config`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return "no-server";
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return "no-server";
    const data = (await res.json()) as { stripe?: boolean };
    return data.stripe ? "live" : "not-configured";
  } catch {
    return "no-server";
  }
}

/** Ask the server for a hosted Checkout Session at the premium price. Returns
 *  the Stripe-hosted page url to send the user to. Throws a StripeSetupError
 *  with a `kind` so callers can explain the exact fix. */
export async function createStripeCheckout(
  amount: string,
  origin: string,
): Promise<{ url: string }> {
  let res: Response;
  try {
    res = await fetch(`${stripeBaseUrl()}/api/stripe/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, origin }),
    });
  } catch {
    throw new StripeSetupError(
      "unreachable",
      undefined,
      "Couldn't reach the till server.",
    );
  }
  if (res.status === 503) {
    throw new StripeSetupError(
      "not-configured",
      503,
      "Stripe is not configured on the server yet.",
    );
  }
  if (!res.ok) {
    throw new StripeSetupError("auth-error", res.status, `Server answered with ${res.status}`);
  }
  let data: StripeCheckoutResponse;
  try {
    data = await res.json();
  } catch {
    throw new StripeSetupError("no-server", res.status, "The till server didn't answer with JSON.");
  }
  if (typeof data.url !== "string" || !data.url) {
    throw new StripeSetupError("unknown", res.status, "No checkout url returned");
  }
  return { url: data.url };
}

/** After the user returns from Stripe, confirm the session really was a paid
 *  premium purchase before any entitlement is granted. */
export async function verifyStripeSession(
  sessionId: string,
): Promise<StripeEntitlementResponse> {
  const res = await fetch(`${stripeBaseUrl()}/api/stripe/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  let data: StripeEntitlementResponse;
  try {
    data = await res.json();
  } catch {
    throw new Error("The till didn't answer.");
  }
  return data;
}
