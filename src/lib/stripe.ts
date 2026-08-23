/**
 * Client-side plumbing for the Stripe premium checkout.
 *
 * The heavy lifting stays on the server (see src/convex/till.ts): the browser
 * asks for a hosted Checkout Session, sends the user to Stripe's page, and on
 * the way back hands the session id over to be verified. The secret key never
 * appears in this file or the bundle.
 *
 * IMPORTANT: Entitlements are now granted server-side via Stripe webhook only.
 * The browser should NOT call grantPremium() after verification.
 */

import { apiBase } from "./server";
import { getAuthClient } from "./firebase";

/** Where the Stripe API lives. Resolution order:
 *  1. VITE_CONVEX_SITE_URL — the Convex site URL (auto-detected)
 *  2. VITE_API_URL — the shared backend URL (see ./server.ts)
 *  3. Same origin as the app — Convex serves /api/stripe/... alongside the SPA
 */
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
  userId?: string; // NEW: The user ID that was validated
  error?: string;
}

/** Why the till couldn't be set up — lets the UI explain the exact fix. */
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

/** Quick health check of the Stripe backend. */
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

/** Ask the server for a hosted Checkout Session at the premium price. */
export async function createStripeCheckout(
  amount: string,
  origin: string,
  userId?: string, // NEW: Optional user ID
): Promise<{ url: string }> {
  let res: Response;
  try {
    res = await fetch(`${stripeBaseUrl()}/api/stripe/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, origin, userId }),
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

/** After the user returns from Stripe, confirm the session.
 * IMPORTANT: This now requires a Firebase ID token for authentication.
 * Entitlements are granted by the webhook, not by this call.
 */
export async function verifyStripeSession(
  sessionId: string,
  idToken: string, // NEW: Firebase ID token for authentication
): Promise<StripeEntitlementResponse> {
  const res = await fetch(`${stripeBaseUrl()}/api/stripe/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
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

/** Get the current user's Firebase ID token. */
export async function getIdToken(): Promise<string> {
  const auth = getAuthClient();
  const user = auth.currentUser;
  if (!user) {
    throw new Error("User not authenticated");
  }
  return await user.getIdToken();
}
