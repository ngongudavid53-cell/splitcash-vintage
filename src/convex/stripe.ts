import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
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

export const webhook = httpAction(async (ctx, request) => {
  const signature = request.headers.get("Stripe-Signature") ?? "";
  const payload = await request.text();
  try {
    const result = await ctx.runAction(internal.stripeNode.processWebhook, {
      signature,
      payload,
    });
    return json(result.body as Record<string, unknown>, result.status);
  } catch (err) {
    return json({ error: `Webhook processing failed: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});
