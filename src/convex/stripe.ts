"use node";

import { httpAction } from "./_generated/server";
import { grantFirestorePremium } from "./firebaseAdmin";

const STRIPE_API = "https://api.stripe.com/v1";
const PREMIUM_PRICE = "18.99";
const PREMIUM_CENTS = 1899;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function stripeSecret(): string | undefined {
  return process.env.STRIPE_SECRET_KEY;
}

function paymentsEnabled(): boolean {
  return process.env.PAYMENTS_ENABLED !== "false" && Boolean(stripeSecret());
}

interface StripeSession {
  id: string;
  url?: string | null;
  payment_status?: string;
  amount_total?: number | null;
  metadata?: Record<string, string>;
  created?: number;
  error?: { message?: string };
}

async function stripeFetch(path: string, init?: RequestInit): Promise<StripeSession> {
  const secret = stripeSecret();
  if (!secret) throw new Error("Stripe is not configured on the server yet.");
  const response = await fetch(`${STRIPE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(init?.headers ?? {}),
    },
  });
  return (await response.json()) as StripeSession;
}

function validUid(uid: string): boolean {
  return uid.length >= 5 && uid.length <= 128 && /^[A-Za-z0-9_-]+$/.test(uid);
}

function paidPremiumSession(data: StripeSession): boolean {
  return data.payment_status === "paid"
    && data.amount_total === PREMIUM_CENTS
    && data.metadata?.product === "premium";
}

export const checkout = httpAction(async (_ctx, request) => {
  if (!paymentsEnabled()) return json({ error: "payments_disabled" }, 503);

  try {
    const body = (await request.json().catch(() => null)) as {
      amount?: unknown;
      origin?: unknown;
      uid?: unknown;
    } | null;
    const amount = String(body?.amount ?? "").trim();
    const origin = String(body?.origin ?? "").replace(/\/+$/, "");
    const uid = String(body?.uid ?? "").trim();

    if (amount && amount !== PREMIUM_PRICE) {
      return json({ error: "That amount isn't on the menu." }, 400);
    }
    if (!origin) return json({ error: "No app origin given for the return trip." }, 400);
    if (!validUid(uid)) return json({ error: "A valid signed-in user is required." }, 400);

    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("success_url", `${origin}/#/app?stripe_session={CHECKOUT_SESSION_ID}`);
    form.set("cancel_url", `${origin}/#/app`);
    form.set("line_items[0][price_data][currency]", "usd");
    form.set("line_items[0][price_data][unit_amount]", String(PREMIUM_CENTS));
    form.set("line_items[0][price_data][product_data][name]", "The Premium Ledger");
    form.set(
      "line_items[0][price_data][product_data][description]",
      "One-time unlock — CSV export of any ledger's full daybook.",
    );
    form.set("line_items[0][quantity]", "1");
    form.set("metadata[product]", "premium");
    form.set("metadata[userId]", uid);

    const data = await stripeFetch("/checkout/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    if (!data.url) {
      return json({ error: data.error?.message ?? "Stripe didn't return a checkout url." }, 500);
    }
    return json({ url: data.url });
  } catch (err) {
    return json({ error: `Checkout creation failed: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});

export const verify = httpAction(async (_ctx, request) => {
  if (!paymentsEnabled()) return json({ success: false, error: "payments_disabled" }, 503);
  try {
    const body = (await request.json().catch(() => null)) as { sessionId?: unknown } | null;
    const sessionId = String(body?.sessionId ?? "").trim();
    if (!sessionId) return json({ success: false, error: "No session id was given." }, 400);

    const data = await stripeFetch(`/checkout/sessions/${encodeURIComponent(sessionId)}`);
    if (!paidPremiumSession(data)) {
      return json({ success: false, error: "That payment wasn't for the premium ledger." });
    }
    return json({
      success: true,
      transactionId: data.id,
      amount: ((data.amount_total ?? 0) / 100).toFixed(2),
      userId: data.metadata?.userId ?? null,
    });
  } catch (err) {
    return json({ success: false, error: `Couldn't verify that payment: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});

/**
 * Durable premium grant.
 *
 * The Stripe session is re-read directly from Stripe, its userId metadata is
 * checked against the currently signed-in uid, then Firebase Admin credentials
 * write both a durable stripeEntitlements/{sessionId} record and the user's
 * premium fields. No in-memory state or client-side premium write is trusted.
 */
export const grant = httpAction(async (_ctx, request) => {
  if (!paymentsEnabled()) return json({ success: false, error: "payments_disabled" }, 503);

  try {
    const body = (await request.json().catch(() => null)) as {
      sessionId?: unknown;
      uid?: unknown;
    } | null;
    const sessionId = String(body?.sessionId ?? "").trim();
    const uid = String(body?.uid ?? "").trim();
    if (!sessionId || !validUid(uid)) {
      return json({ success: false, error: "A session id and a valid user id are required." }, 400);
    }

    const data = await stripeFetch(`/checkout/sessions/${encodeURIComponent(sessionId)}`);
    if (!paidPremiumSession(data)) {
      return json({ success: false, error: "That payment wasn't for the premium ledger." });
    }

    const paidForUid = data.metadata?.userId;
    if (!paidForUid || paidForUid !== uid) {
      return json({ success: false, error: "That payment belongs to a different account." }, 403);
    }

    await grantFirestorePremium({
      uid,
      sessionId,
      transactionId: data.id,
      amount: ((data.amount_total ?? 0) / 100).toFixed(2),
    });

    return json({ success: true, transactionId: data.id });
  } catch (err) {
    return json({
      success: false,
      error: `Couldn't grant premium: ${err instanceof Error ? err.message : String(err)}`,
    }, 500);
  }
});
