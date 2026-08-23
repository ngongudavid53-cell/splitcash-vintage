/**
 * The till — the app's own backend endpoints, running inside the project's
 * Convex deployment. No separate server to deploy: the secret keys (Stripe,
 * Gemini, Gravity) are set in the project's Keys / API keys tab and arrive
 * here as process.env on the server side only.
 *
 * These are HTTP actions, routed from ./http.ts. Convex does not add CORS
 * headers automatically, so every response carries the shared CORS block and
 * an OPTIONS preflight route is registered for each path in http.ts.
 *
 * Stripe is called through its REST API with plain fetch (no SDK dependency),
 * exactly like the Gravity proxy below.
 *
 * Firebase Admin is used to manage premium entitlements server-side.
 */

"use node";

import { httpAction } from "./_generated/server";
import { GoogleGenerativeAI, type Content } from "@google/generative-ai";
import * as admin from "firebase-admin";

/** The one-time price of the Premium Ledger (must match src/lib/premium.ts). */
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

/** In-memory usage tally, exposed at /api/stats (resets on restart). */
const stats = {
  assistant: {
    requests: 0,
    errors: 0,
    rateLimited: 0,
    chunks: 0,
    models: {} as Record<string, number>,
  },
  ads: { requests: 0, served: 0, errors: 0 },
  stripe: { checkouts: 0, verified: 0, failed: 0, webhooks: 0 },
  startedAt: new Date().toISOString(),
};

/** Tiny spend limiter (protects the app owner's quota, not abusers). */
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

// --- Firebase Admin initialization ------------------------------------------

let firebaseApp: admin.app.App | null = null;

function getFirebaseApp(): admin.app.App | null {
  if (firebaseApp) return firebaseApp;
  
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) {
    console.warn("[Common Pot] Firebase service account not configured. Entitlements will not work.");
    return null;
  }
  
  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccount)),
    });
    return firebaseApp;
  } catch (err) {
    console.error("[Common Pot] Firebase Admin initialization failed:", err);
    return null;
  }
}

function getFirestore(): admin.firestore.Firestore | null {
  const app = getFirebaseApp();
  return app ? admin.firestore(app) : null;
}

// --- Premium entitlement management -----------------------------------------

/** Idempotently grant premium entitlement to a user. */
async function grantPremiumEntitlement(uid: string, transactionId: string): Promise<boolean> {
  const db = getFirestore();
  if (!db) {
    console.error("[Common Pot] Firebase not initialized, cannot grant premium");
    return false;
  }
  
  try {
    const userDoc = db.collection("users").doc(uid);
    await userDoc.set({
      premium: true,
      premiumTx: transactionId,
      premiumSince: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log("[Common Pot] Granted premium to user:", uid, "tx:", transactionId);
    return true;
  } catch (err) {
    console.error("[Common Pot] Failed to grant premium:", err);
    return false;
  }
}

/** Idempotently revoke premium entitlement from a user. */
async function revokePremiumEntitlement(uid: string): Promise<boolean> {
  const db = getFirestore();
  if (!db) {
    console.error("[Common Pot] Firebase not initialized, cannot revoke premium");
    return false;
  }
  
  try {
    const userDoc = db.collection("users").doc(uid);
    await userDoc.set({
      premium: false,
      premiumTx: admin.firestore.FieldValue.delete(),
      premiumSince: admin.firestore.FieldValue.delete(),
    }, { merge: true });
    console.log("[Common Pot] Revoked premium from user:", uid);
    return true;
  } catch (err) {
    console.error("[Common Pot] Failed to revoke premium:", err);
    return false;
  }
}
