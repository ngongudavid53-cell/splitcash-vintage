/**
 * Client-side plumbing for the Stripe premium checkout.
 *
 * Secret Stripe work stays on the Convex backend. The browser asks for a
 * hosted Checkout Session, sends the user to Stripe, and returns with the
 * session id. The backend then verifies and durably records the entitlement.
 */

import { getAuthClient } from "./firebase";
import { apiBase } from "./server";

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
  userId?: string | null;
  error?: string;
}

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

export async function createStripeCheckout(
  amount: string,
  origin: string,
  uid?: string,
): Promise<{ url: string }> {
  const signedInUid = uid?.trim() || getAuthClient().currentUser?.uid || "";
  if (!signedInUid) {
    throw new StripeSetupError("auth-error", 401, "Sign in before starting checkout.");
  }

  let res: Response;
  try {
    res = await fetch(`${stripeBaseUrl()}/api/stripe/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, origin, uid: signedInUid }),
    });
  } catch {
    throw new StripeSetupError("unreachable", undefined, "Couldn't reach the till server.");
  }
  if (res.status === 503) {
    throw new StripeSetupError("not-configured", 503, "Stripe is not configured on the server yet.");
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
