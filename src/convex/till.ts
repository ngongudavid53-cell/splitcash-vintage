/*
 * The till — the app's own backend endpoints, running inside the project's
 * Convex deployment.
 */

"use node";

import { httpAction } from "./_generated/server";
import { GoogleGenerativeAI, type Content } from "@google/generative-ai";
import * as admin from "firebase-admin";
import { ReadableStream } from "stream/web";

const PREMIUM_PRICE = "4.99";
const PREMIUM_CENTS = 499;

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

const stats = {
  assistant: { requests: 0, errors: 0, rateLimited: 0, chunks: 0, models: {} as Record<string, number> },
  ads: { requests: 0, served: 0, errors: 0 },
  stripe: { checkouts: 0, verified: 0, failed: 0, webhooks: 0 },
  startedAt: new Date().toISOString(),
};

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX = 30;
const rateBuckets = new Map<string, number[]>();

function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  const hits = (rateBuckets.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) {
    rateBuckets.set(key, hits);
    return true;
  }
  hits.push(now);
  rateBuckets.set(key, hits);
  return false;
}

// Firebase Admin
let firebaseApp: admin.app.App | null = null;
function getFirebaseApp(): admin.app.App | null {
  if (firebaseApp) return firebaseApp;
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) {
    console.warn("[Common Pot] Firebase service account not configured");
    return null;
  }
  try {
    firebaseApp = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccount)) });
    return firebaseApp;
  } catch (err) {
    console.error("[Common Pot] Firebase Admin init failed:", err);
    return null;
  }
}
function getFirestore(): admin.firestore.Firestore | null {
  return getFirebaseApp() ? admin.firestore(getFirebaseApp()!) : null;
}

async function grantPremiumEntitlement(uid: string, txId: string): Promise<boolean> {
  const db = getFirestore();
  if (!db) { console.error("[Common Pot] Firebase not initialized"); return false; }
  try {
    await db.collection("users").doc(uid).set({
      premium: true, premiumTx: txId, premiumSince: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return true;
  } catch (err) { console.error("[Common Pot] Failed to grant premium:", err); return false; }
}

async function revokePremiumEntitlement(uid: string): Promise<boolean> {
  const db = getFirestore();
  if (!db) { console.error("[Common Pot] Firebase not initialized"); return false; }
  try {
    await db.collection("users").doc(uid).set({
      premium: false, premiumTx: admin.firestore.FieldValue.delete(), premiumSince: admin.firestore.FieldValue.delete()
    }, { merge: true });
    return true;
  } catch (err) { console.error("[Common Pot] Failed to revoke premium:", err); return false; }
}

export const preflight = httpAction(async () => new Response(null, { status: 204, headers: CORS_HEADERS }));

export const config = httpAction(async () => json({
  assistant: Boolean(process.env.GEMINI_API_KEY),
  ads: Boolean(process.env.GRAVITY_API_KEY),
  braintree: false,
  stripe: Boolean(process.env.STRIPE_SECRET_KEY),
  version: 2,
}));

export const statsHandler = httpAction(async () => json(stats));

const ASSISTANT_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];
const ASSISTANT_SYSTEM = (brief: string) => ["You are the keeper of the books for Common Pot, a shared expense ledger.", "Answer questions about THIS ledger. Be warm, brief and plain — no lectures.", "Use ONLY the numbers and entries given below. Never invent expenses, people, or amounts.", "If a question goes beyond the ledger, say in one line that it's outside the books.", "Keep money in the same format as the brief.", "THE LEDGER:", brief].join("\n");

export const assistant = httpAction(async (_ctx, request) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json({ error: "assistant_not_configured" }, 503);
  if (rateLimited(clientKey(request))) { stats.assistant.rateLimited++; return json({ error: "rate_limited" }, 429); }
  stats.assistant.requests++;
  const body = (await request.json().catch(() => null)) as { messages?: { role?: string; parts?: { text?: string }[] }[]; brief?: unknown; } | null;
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) { stats.assistant.errors++; return json({ error: "bad_request" }, 400); }
  const contents = body.messages.slice(-30).map((m) => ({ role: m.role === "model" ? ("model" as const) : ("user" as const), parts: [{ text: String(m.parts?.[0]?.text ?? "").slice(0, 20000) }] }));
  const brief = String(body.brief ?? "").slice(0, 12000);
  const genAI = new GoogleGenerativeAI(key);
  const systemInstruction = ASSISTANT_SYSTEM(brief);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const sse = (event: string | undefined, data: string) => controller.enqueue(encoder.encode(event ? `event: ${event}
data: ${data}

` : `data: ${data}

`));
      try {
        let lastError: unknown = null, started = false;
        for (const model of ASSISTANT_MODELS) {
          if (started) break;
          try {
            const gemini = genAI.getGenerativeModel({ model, systemInstruction });
            const result = await gemini.generateContentStream({ contents: contents as Content[] });
            for await (const chunk of result.stream) {
              let text = "";
              try { text = chunk.text(); } catch {}
              if (!text) continue;
              started = true;
              stats.assistant.models[model] = (stats.assistant.models[model] ?? 0) + 1;
              stats.assistant.chunks++;
              sse(undefined, JSON.stringify({ text }));
            }
            lastError = null; break;
          } catch (err) { lastError = err; }
        }
        if (lastError && !started) { stats.assistant.errors++; sse("error", JSON.stringify({ message: String(lastError) })); }
        sse("done", "{}");
      } finally { controller.close(); }
    },
  });
  return new Response(stream as unknown as ReadableStream<Uint8Array>, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", ...CORS_HEADERS } });
});

export const ad = httpAction(async (_ctx, request) => {
  const key = process.env.GRAVITY_API_KEY;
  if (!key) return json({ error: "ads_not_configured" }, 503);
  const production = process.env.GRAVITY_PRODUCTION === "true";
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "bad_request" }, 400);
  stats.ads.requests++;
  try {
    const res = await fetch("https://server.trygravity.ai/api/v1/ad", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ ...(body as object), testAd: !production }),
    });
    if (res.status === 204 || !res.ok) return new Response(null, { status: 204, headers: CORS_HEADERS });
    const data = await res.json(); stats.ads.served++; return json(data);
  } catch (err) { stats.ads.errors++; return json({ error: `ad_service_unreachable: ${err}` }, 502); }
});

const STRIPE_API = "https://api.stripe.com/v1";
interface StripeSession { id: string; url?: string | null; payment_status?: string; amount_total?: number | null; metadata?: Record<string, string>; customer?: string; error?: { message?: string }; }
interface StripeEvent { id: string; type: string; data: { object: StripeSession & { customer?: string; customer_email?: string; client_reference_id?: string; }; }; }
function stripeSecret(): string | undefined { return process.env.STRIPE_SECRET_KEY; }
function stripeWebhookSecret(): string | undefined { return process.env.STRIPE_WEBHOOK_SECRET; }
async function stripeFetch(path: string, init?: RequestInit): Promise<StripeSession> {
  const secret = stripeSecret();
  const res = await fetch(`${STRIPE_API}${path}`, { ...init, headers: { Authorization: `Bearer ${secret}`, ...(init?.headers ?? {}) } });
  return (await res.json()) as StripeSession;
}
function verifyStripeSignature(body: string, signature: string | null, webhookSecret: string): boolean {
  const crypto = require("crypto");
  const hmac = crypto.createHmac("sha256", webhookSecret);
  return signature === `v1,${hmac.update(body).digest("hex")}`;
}

export const stripeCheckout = httpAction(async (_ctx, request) => {
  if (!stripeSecret()) return json({ error: "Stripe is not configured on the server yet." }, 503);
  try {
    const body = (await request.json().catch(() => null)) as { amount?: unknown; origin?: unknown; userId?: unknown; } | null;
    const amount = String(body?.amount ?? "").trim();
    if (amount && amount !== PREMIUM_PRICE) return json({ error: "That amount isn't on the menu." }, 400);
    const origin = String(body?.origin ?? "").replace(/\/+$/, "");
    if (!origin) return json({ error: "No app origin given for the return trip." }, 400);
    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("success_url", `${origin}/#/app?stripe_session=${{CHECKOUT_SESSION_ID}}`);
    form.set("cancel_url", `${origin}/#/app`);
    form.set("line_items[0][price_data][currency]", "usd");
    form.set("line_items[0][price_data][unit_amount]", String(PREMIUM_CENTS));
    form.set("line_items[0][price_data][product_data][name]", "The Premium Ledger");
    form.set("line_items[0][price_data][product_data][description]", "One-time unlock — CSV export of any ledger's full daybook.");
    form.set("line_items[0][quantity]", "1");
    form.set("metadata[product]", "premium");
    if (body?.userId && typeof body.userId === "string") form.set("metadata[userId]", body.userId);
    const data = await stripeFetch("/checkout/sessions", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() });
    stats.stripe.checkouts++;
    if (!data.url) return json({ error: data.error?.message ?? "Stripe didn't return a checkout url." }, 500);
    return json({ url: data.url });
  } catch (err) { stats.stripe.failed++; return json({ error: `Checkout creation failed: ${err}` }, 500); }
});

export const stripeVerify = httpAction(async (_ctx, request) => {
  if (!stripeSecret()) return json({ success: false, error: "Stripe is not configured on the server yet." }, 503);
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) return json({ success: false, error: "Authentication required." }, 401);
    const idToken = authHeader.substring(7);
    let uid: string;
    try { const decodedToken = await admin.auth().verifyIdToken(idToken); uid = decodedToken.uid; }
    catch (err) { return json({ success: false, error: "Invalid authentication token." }, 401); }
    const body = (await request.json().catch(() => null)) as { sessionId?: unknown; } | null;
    const sessionId = String(body?.sessionId ?? "").trim();
    if (!sessionId) return json({ success: false, error: "No session id was given." }, 400);
    const data = await stripeFetch(`/checkout/sessions/${encodeURIComponent(sessionId)}`);
    const paid = data.payment_status === "paid";
    const rightPrice = data.amount_total === PREMIUM_CENTS;
    const rightProduct = data.metadata?.product === "premium";
    const sessionUserId = data.metadata?.userId;
    if (sessionUserId && sessionUserId !== uid) { stats.stripe.failed++; return json({ success: false, error: "This payment session doesn't belong to you." }, 403); }
    if (!paid || !rightPrice || !rightProduct) { stats.stripe.failed++; return json({ success: false, error: "That payment wasn't for the premium ledger." }); }
    if (!sessionUserId) console.warn("[Common Pot] Legacy session without userId:", sessionId);
    stats.stripe.verified++;
    return json({ success: true, transactionId: data.id, amount: ((data.amount_total ?? 0) / 100).toFixed(2), userId: uid });
  } catch (err) { return json({ success: false, error: `Couldn't verify that payment: ${err}` }, 500); }
});

export const stripeWebhook = httpAction(async (_ctx, request) => {
  if (!stripeSecret() || !stripeWebhookSecret()) return json({ error: "Stripe webhook not configured on the server yet." }, 503);
  const signature = request.headers.get("Stripe-Signature");
  const body = await request.text();
  if (!verifyStripeSignature(body, signature, stripeWebhookSecret()!)) { stats.stripe.failed++; return json({ error: "Invalid webhook signature." }, 401); }
  let event: StripeEvent;
  try { event = JSON.parse(body) as StripeEvent; } catch (err) { stats.stripe.failed++; return json({ error: "Invalid webhook payload." }, 400); }
  stats.stripe.webhooks++;
  try {
    switch (event.type) {
      case "checkout.session.completed":
        const session = event.data.object;
        if (session.metadata?.product !== "premium" || session.amount_total !== PREMIUM_CENTS) { console.log("[Common Pot] Ignoring non-premium session:", session.id); return json({ status: "ignored" }); }
        const uid = session.metadata?.userId;
        if (!uid) { console.warn("[Common Pot] Webhook: Session without userId:", session.id); return json({ status: "no_user" }); }
        const granted = await grantPremiumEntitlement(uid, session.id);
        if (granted) console.log("[Common Pot] Granted premium via webhook:", session.id); else console.error("[Common Pot] Failed to grant premium:", session.id);
        return json({ status: "success", action: "granted", userId: uid });
      case "charge.refunded":
        const charge = event.data.object;
        if (!charge.customer) { console.warn("[Common Pot] Refund without customer:", charge.id); return json({ status: "no_customer" }); }
        console.log("[Common Pot] Refund detected for customer:", charge.customer);
        return json({ status: "needs_mapping" });
      case "payment_intent.canceled":
        const pi = event.data.object;
        if (!pi.customer) { console.warn("[Common Pot] Cancellation without customer:", pi.id); return json({ status: "no_customer" }); }
        console.log("[Common Pot] Payment cancelled for customer:", pi.customer);
        return json({ status: "needs_mapping" });
      default:
        console.log("[Common Pot] Webhook: Unhandled event:", event.type);
        return json({ status: "ignored" });
    }
  } catch (err) { console.error("[Common Pot] Webhook error:", err); stats.stripe.failed++; return json({ error: `Webhook handling failed: ${err}` }, 500); }
});
