"use node";

import { createHmac, timingSafeEqual } from "node:crypto";
import { httpAction } from "./_generated/server";
import { grantFirestorePremium, markStripeEvent, reserveStripeEvent, revokeFirestorePremiumByPaymentIntent } from "./firebaseAdmin";
import { requireFirebaseUser } from "./firebaseAuth";

const STRIPE_API = "https://api.stripe.com/v1";
const PREMIUM_PRICE = "18.99";
const PREMIUM_CENTS = 1899;
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Stripe-Signature",
  "Access-Control-Max-Age": "86400",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
function stripeSecret(): string | undefined { return process.env.STRIPE_SECRET_KEY; }
function entitlementStoreConfigured(): boolean {
  return Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_WEB_API_KEY);
}
function paymentsEnabled(): boolean {
  return process.env.PAYMENTS_ENABLED === "true" && Boolean(stripeSecret()) && entitlementStoreConfigured();
}
interface StripeSession {
  id: string; url?: string | null; payment_status?: string; amount_total?: number | null;
  payment_intent?: string | null; metadata?: Record<string, string>; error?: { message?: string };
}
function paidPremiumSession(data: StripeSession): boolean {
  return data.payment_status === "paid" && data.amount_total === PREMIUM_CENTS && data.metadata?.product === "premium";
}
async function stripeFetch(path: string, init?: RequestInit): Promise<StripeSession> {
  const secret = stripeSecret();
  if (!secret) throw new Error("Stripe is not configured on the server yet.");
  const response = await fetch(`${STRIPE_API}${path}`, { ...init, headers: { Authorization: `Bearer ${secret}`, ...(init?.headers ?? {}) } });
  return (await response.json()) as StripeSession;
}

export const status = httpAction(async () => json({ stripe: paymentsEnabled(), entitlementStore: entitlementStoreConfigured(), paymentsEnabled: process.env.PAYMENTS_ENABLED === "true" }));

export const checkout = httpAction(async (_ctx, request) => {
  if (!paymentsEnabled()) return json({ error: "payments_not_configured" }, 503);
  try {
    const { uid } = await requireFirebaseUser(request);
    const body = (await request.json().catch(() => null)) as { amount?: unknown; origin?: unknown } | null;
    const amount = String(body?.amount ?? "").trim();
    const origin = String(body?.origin ?? "").replace(/\/+$/, "");
    if (amount && amount !== PREMIUM_PRICE) return json({ error: "That amount isn't on the menu." }, 400);
    if (!origin) return json({ error: "No app origin given for the return trip." }, 400);

    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("success_url", `${origin}/#/app?stripe_session={CHECKOUT_SESSION_ID}`);
    form.set("cancel_url", `${origin}/#/app`);
    form.set("line_items[0][price_data][currency]", "usd");
    form.set("line_items[0][price_data][unit_amount]", String(PREMIUM_CENTS));
    form.set("line_items[0][price_data][product_data][name]", "The Premium Ledger");
    form.set("line_items[0][price_data][product_data][description]", "One-time unlock — CSV export of any ledger's full daybook.");
    form.set("line_items[0][quantity]", "1");
    form.set("metadata[product]", "premium");
    form.set("metadata[uid]", uid);

    const data = await stripeFetch("/checkout/sessions", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() });
    if (!data.url) return json({ error: data.error?.message ?? "Stripe didn't return a checkout url." }, 500);
    return json({ url: data.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message === "Authentication required." || message === "Invalid Firebase ID token." ? "authentication_required" : `Checkout creation failed: ${message}` }, message.includes("Authentication") || message.includes("Invalid Firebase") ? 401 : 500);
  }
});

export const verify = httpAction(async (_ctx, request) => {
  if (!paymentsEnabled()) return json({ success: false, error: "payments_not_configured" }, 503);
  try {
    const { uid } = await requireFirebaseUser(request);
    const body = (await request.json().catch(() => null)) as { sessionId?: unknown } | null;
    const sessionId = String(body?.sessionId ?? "").trim();
    if (!sessionId) return json({ success: false, error: "No session id was given." }, 400);
    const data = await stripeFetch(`/checkout/sessions/${encodeURIComponent(sessionId)}`);
    if (!paidPremiumSession(data) || data.metadata?.uid !== uid) return json({ success: false, error: "That payment isn't valid for this account." }, 403);
    return json({ success: true, transactionId: data.id, amount: ((data.amount_total ?? 0) / 100).toFixed(2) });
  } catch (err) {
    return json({ success: false, error: `Couldn't verify that payment: ${err instanceof Error ? err.message : String(err)}` }, 401);
  }
});

function validStripeSignature(payload: string, header: string, secret: string): boolean {
  const values = new Map<string, string[]>();
  for (const part of header.split(",")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    values.set(key, [...(values.get(key) ?? []), value]);
  }
  const timestamp = Number(values.get("t")?.[0]);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return (values.get("v1") ?? []).some((signature) => {
    if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
    const actual = Buffer.from(signature, "hex");
    return actual.length === expectedBytes.length && timingSafeEqual(expectedBytes, actual);
  });
}

export const webhook = httpAction(async (_ctx, request) => {
  if (!stripeSecret() || !process.env.STRIPE_WEBHOOK_SECRET || !entitlementStoreConfigured()) return json({ error: "webhook_not_configured" }, 503);
  const signature = request.headers.get("Stripe-Signature");
  const payload = await request.text();
  if (!signature || !validStripeSignature(payload, signature, process.env.STRIPE_WEBHOOK_SECRET)) return json({ error: "invalid_signature" }, 400);
  try {
    const event = JSON.parse(payload) as { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
    if (!event.id || !event.type) return json({ error: "invalid_event" }, 400);
    if ((await reserveStripeEvent(event.id, event.type)) === "processed") return json({ received: true, duplicate: true });

    const object = event.data?.object ?? {};
    if (event.type === "checkout.session.completed") {
      const session = object as unknown as StripeSession;
      const uid = session.metadata?.uid;
      if (!uid || !paidPremiumSession(session)) throw new Error("Invalid paid checkout session.");
      await grantFirestorePremium({ uid, sessionId: session.id, transactionId: session.id, amount: ((session.amount_total ?? 0) / 100).toFixed(2), paymentIntentId: session.payment_intent ?? undefined });
    } else if (event.type === "charge.refunded" || event.type === "payment_intent.canceled") {
      const fullyRefunded = event.type !== "charge.refunded" || object.refunded === true;
      const paymentIntent = object.payment_intent;
      const paymentIntentId = typeof paymentIntent === "string"
        ? paymentIntent
        : paymentIntent && typeof paymentIntent === "object" && typeof (paymentIntent as { id?: unknown }).id === "string"
          ? (paymentIntent as { id: string }).id
          : typeof object.id === "string" && event.type === "payment_intent.canceled" ? object.id : undefined;
      if (fullyRefunded && paymentIntentId) await revokeFirestorePremiumByPaymentIntent(paymentIntentId);
    }
    await markStripeEvent(event.id, "processed");
    return json({ received: true });
  } catch (err) {
    if (eventIdFromPayload(payload)) {
      try { await markStripeEvent(eventIdFromPayload(payload)!, "failed"); } catch { /* preserve original webhook failure */ }
    }
    return json({ error: `Webhook processing failed: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});

function eventIdFromPayload(payload: string): string | undefined {
  try { const value = JSON.parse(payload) as { id?: unknown }; return typeof value.id === "string" ? value.id : undefined; } catch { return undefined; }
}
