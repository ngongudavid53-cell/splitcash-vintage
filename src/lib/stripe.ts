/** Client-side Stripe plumbing. Identity is sent only as a Firebase ID token. */

import { getAuthClient } from "./firebase";
import { apiBase } from "./server";

export function stripeBaseUrl(): string { return apiBase().replace(/\/+$/, ""); }
export interface StripeCheckoutResponse { url?: string; error?: string; }
export interface StripeEntitlementResponse { success: boolean; transactionId?: string; amount?: string; error?: string; }
export type StripeSetupKind = "no-server" | "unreachable" | "not-configured" | "auth-error" | "unknown";
export class StripeSetupError extends Error {
  readonly kind: StripeSetupKind; readonly status: number | undefined;
  constructor(kind: StripeSetupKind, status: number | undefined, message: string) { super(message); this.name = "StripeSetupError"; this.kind = kind; this.status = status; }
}

async function authHeaders(): Promise<Record<string, string>> {
  const user = getAuthClient().currentUser;
  if (!user) throw new StripeSetupError("auth-error", 401, "Sign in before starting checkout.");
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

export async function fetchStripeServerStatus(): Promise<"live" | "no-server" | "not-configured"> {
  try {
    const res = await fetch(`${stripeBaseUrl()}/api/stripe/status`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return "no-server";
    const contentType = res.headers.get("content-type") ?? ""; if (!contentType.includes("application/json")) return "no-server";
    const data = await res.json() as { stripe?: boolean }; return data.stripe ? "live" : "not-configured";
  } catch { return "no-server"; }
}

export async function createStripeCheckout(amount: string, origin: string): Promise<{ url: string }> {
  let res: Response;
  try {
    res = await fetch(`${stripeBaseUrl()}/api/stripe/checkout`, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ amount, origin }) });
  } catch { throw new StripeSetupError("unreachable", undefined, "Couldn't reach the till server."); }
  if (res.status === 503) throw new StripeSetupError("not-configured", 503, "Stripe is not configured on the server yet.");
  if (res.status === 401 || res.status === 403) throw new StripeSetupError("auth-error", res.status, "Your sign-in session needs refreshing.");
  if (!res.ok) throw new StripeSetupError("auth-error", res.status, `Server answered with ${res.status}`);
  const data = await res.json().catch(() => null) as StripeCheckoutResponse | null;
  if (!data || typeof data.url !== "string" || !data.url) throw new StripeSetupError("unknown", res.status, "No checkout url returned");
  return { url: data.url };
}

export async function verifyStripeSession(sessionId: string): Promise<StripeEntitlementResponse> {
  const res = await fetch(`${stripeBaseUrl()}/api/stripe/verify`, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ sessionId }) });
  const data = await res.json().catch(() => null) as StripeEntitlementResponse | null;
  if (!data) throw new Error("The till didn't answer.");
  return data;
}
