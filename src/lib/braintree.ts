/**
 * Client-side plumbing for the Braintree tip jar.
 *
 * The heavy lifting stays on the server (see main.ts): the browser only ever
 * fetches a short-lived client token, then hands a payment-method nonce back
 * for the actual sale. Keys never appear in this file or the bundle.
 */

import { apiBase } from "./server";

const VITE_BRAINTREE_FUNCTION_URL = import.meta.env
  .VITE_BRAINTREE_FUNCTION_URL as string | undefined;

/** Where the Braintree API lives. Resolution order:
 *  1. VITE_BRAINTREE_FUNCTION_URL — explicit override for a dedicated till
 *     server (legacy option).
 *  2. VITE_API_URL — the shared backend URL (see ./server.ts). Set this once
 *     when the Deno/Hono server in main.ts is deployed on another domain and
 *     every integration (assistant, ads, Braintree) uses it.
 *  3. Same origin as the app — main.ts serves /api/braintree/... alongside
 *     the SPA, so a blank value "just works" when app + server are deployed
 *     together (e.g. both on Deno Deploy). */
export function braintreeBaseUrl(): string {
  const base = VITE_BRAINTREE_FUNCTION_URL ?? apiBase();
  return base.replace(/\/+$/, "");
}

export interface BraintreeSaleResponse {
  success: boolean;
  transaction?: { id: string; status: string; amount: string };
  error?: string;
}

export interface BraintreeEntitlementResponse {
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
export type BraintreeSetupKind =
  | "no-server"
  | "unreachable"
  | "not-configured"
  | "auth-error"
  | "unknown";

export class BraintreeSetupError extends Error {
  readonly kind: BraintreeSetupKind;
  readonly status: number | undefined;

  constructor(kind: BraintreeSetupKind, status: number | undefined, message: string) {
    super(message);
    this.name = "BraintreeSetupError";
    this.kind = kind;
    this.status = status;
  }
}

/** Quick health check of the Braintree backend on its configured base URL.
 *  Tells callers whether a live server exists and whether it has Braintree
 *  keys — without guessing from status codes. Never throws. */
export async function fetchBraintreeServerStatus(): Promise<
  "live" | "no-server" | "not-configured"
> {
  try {
    const res = await fetch(`${braintreeBaseUrl()}/api/config`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return "no-server";
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return "no-server";
    const data = (await res.json()) as { braintree?: boolean };
    return data.braintree ? "live" : "not-configured";
  } catch {
    return "no-server";
  }
}

/** Ask the server for a fresh client token. Throws a BraintreeSetupError with
 *  a `kind` so callers can tell "no server here" from "keys missing" from
 *  "bad URL" — and say so to the user instead of guessing. */
export async function fetchClientToken(): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${braintreeBaseUrl()}/api/braintree/token`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new BraintreeSetupError(
      "unreachable",
      undefined,
      "Couldn't reach the till server.",
    );
  }
  if (res.status === 503) {
    throw new BraintreeSetupError(
      "not-configured",
      503,
      "Braintree is not configured on the server yet.",
    );
  }
  // A static host / Vite preview answers /api/* with HTML or a 404 — that's
  // "no backend here", not a refusal.
  if (res.status === 404) {
    throw new BraintreeSetupError(
      "no-server",
      404,
      "No till server found at that address.",
    );
  }
  if (!res.ok) {
    throw new BraintreeSetupError("auth-error", res.status, `Server answered with ${res.status}`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new BraintreeSetupError(
      "no-server",
      res.status,
      "That address answered with a web page, not a till API — no backend server is running there.",
    );
  }
  let data: { clientToken?: unknown } = {};
  try {
    data = await res.json();
  } catch {
    throw new BraintreeSetupError(
      "no-server",
      res.status,
      "The till server didn't answer with JSON.",
    );
  }
  if (typeof data.clientToken !== "string" || !data.clientToken) {
    throw new BraintreeSetupError("unknown", res.status, "No client token returned");
  }
  return data.clientToken;
}

/** Run the sale on the server with the Drop-in's payment-method nonce. */
export async function submitBraintreeSale(
  amount: string,
  paymentMethodNonce: string,
): Promise<BraintreeSaleResponse> {
  const res = await fetch(`${braintreeBaseUrl()}/api/braintree/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, paymentMethodNonce }),
  });
  let data: BraintreeSaleResponse;
  try {
    data = await res.json();
  } catch {
    throw new Error("The till didn't answer.");
  }
  return data;
}

/** After a successful sale, confirm the server that this transaction was
 *  really a premium purchase (right amount, settling). Returns the result. */
export async function verifyBraintreeEntitlement(
  transactionId: string,
): Promise<BraintreeEntitlementResponse> {
  const res = await fetch(`${braintreeBaseUrl()}/api/braintree/entitle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transactionId }),
  });
  let data: BraintreeEntitlementResponse;
  try {
    data = await res.json();
  } catch {
    throw new Error("The till didn't answer.");
  }
  return data;
}
