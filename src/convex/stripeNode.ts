"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { grantFirestorePremium, markStripeEvent, reserveStripeEvent, revokeFirestorePremiumByPaymentIntent } from "./firebaseAdmin";
import { validStripeSignature } from "./stripeSignature";

const STRIPE_API = "https://api.stripe.com/v1";
const PREMIUM_CENTS = 1899;

function stripeSecret(): string | undefined { return process.env.STRIPE_SECRET_KEY; }
function entitlementStoreConfigured(): boolean {
  return Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_WEB_API_KEY);
}

interface StripeSession {
  id: string; url?: string | null; payment_status?: string; amount_total?: number | null;
  payment_intent?: string | null; metadata?: Record<string, string>; error?: { message?: string };
}
function paidPremiumSession(data: StripeSession): boolean {
  return data.payment_status === "paid" && data.amount_total === PREMIUM_CENTS && data.metadata?.product === "premium";
}

function eventIdFromPayload(payload: string): string | undefined {
  try { const value = JSON.parse(payload) as { id?: unknown }; return typeof value.id === "string" ? value.id : undefined; } catch { return undefined; }
}

export const processWebhook = internalAction({
  args: { signature: v.string(), payload: v.string() },
  handler: async (_ctx, { signature, payload }) => {
    if (!stripeSecret() || !process.env.STRIPE_WEBHOOK_SECRET || !entitlementStoreConfigured()) return { status: 503, body: { error: "webhook_not_configured" } };
    if (!signature || !validStripeSignature(payload, signature, process.env.STRIPE_WEBHOOK_SECRET)) return { status: 400, body: { error: "invalid_signature" } };
    try {
      const event = JSON.parse(payload) as { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
      if (!event.id || !event.type) return { status: 400, body: { error: "invalid_event" } };
      if ((await reserveStripeEvent(event.id, event.type)) === "processed") return { status: 200, body: { received: true, duplicate: true } };

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
      return { status: 200, body: { received: true } };
    } catch (err) {
      if (eventIdFromPayload(payload)) {
        try { await markStripeEvent(eventIdFromPayload(payload)!, "failed"); } catch { /* preserve original webhook failure */ }
      }
      return { status: 500, body: { error: `Webhook processing failed: ${err instanceof Error ? err.message : String(err)}` } };
    }
  },
});