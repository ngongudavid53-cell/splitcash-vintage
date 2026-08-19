"use node";

import { createSign } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/datastore";

type FirestoreValue =
  | { stringValue: string }
  | { booleanValue: boolean }
  | { timestampValue: string };

type FirestoreFields = Record<string, FirestoreValue>;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server secret: ${name}`);
  return value;
}

function base64Url(value: string | Uint8Array): string {
  const encoded = typeof value === "string"
    ? Buffer.from(value, "utf8").toString("base64")
    : Buffer.from(value).toString("base64");
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function accessToken(): Promise<string> {
  const clientEmail = requiredEnv("FIREBASE_CLIENT_EMAIL");
  const privateKey = requiredEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey);
  const assertion = `${unsigned}.${base64Url(signature)}`;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Firebase service-account token request failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  const data = (await response.json()) as { access_token?: unknown };
  if (typeof data.access_token !== "string" || !data.access_token) {
    throw new Error("Firebase service-account token response did not contain an access token.");
  }
  return data.access_token;
}

function firestoreBase(): string {
  const projectId = requiredEnv("FIREBASE_PROJECT_ID");
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
}

async function firestoreRequest<T>(path: string, init: RequestInit = {}): Promise<{ status: number; data: T | null }> {
  const token = await accessToken();
  const response = await fetch(`${firestoreBase()}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let data: T | null = null;
  if (text) {
    try { data = JSON.parse(text) as T; } catch { /* handled by status below */ }
  }
  return { status: response.status, data };
}

interface EntitlementDocument {
  name?: string;
  fields?: {
    uid?: { stringValue?: string };
    stripeSessionId?: { stringValue?: string };
    status?: { stringValue?: string };
  };
}

/**
 * Durably grants Premium in Firestore using a server service account.
 *
 * The Firestore security rules intentionally reject client writes to premium
 * fields. This helper bypasses those rules through authenticated server
 * credentials and records the Stripe session separately so the grant is
 * idempotent across Convex restarts.
 */
export async function grantFirestorePremium(params: {
  uid: string;
  sessionId: string;
  transactionId: string;
  amount: string;
}): Promise<void> {
  const { uid, sessionId, transactionId, amount } = params;
  const documentId = encodeURIComponent(sessionId);
  const existing = await firestoreRequest<EntitlementDocument>(
    `stripeEntitlements/${documentId}`,
    { method: "GET" },
  );

  if (existing.status === 200 && existing.data) {
    const existingUid = existing.data.fields?.uid?.stringValue;
    if (existingUid && existingUid !== uid) {
      throw new Error("That Stripe payment is already linked to another account.");
    }
  } else if (existing.status === 404) {
    const created = await firestoreRequest<unknown>(
      `stripeEntitlements?documentId=${documentId}`,
      {
        method: "POST",
        body: JSON.stringify({
          fields: {
            uid: { stringValue: uid },
            stripeSessionId: { stringValue: sessionId },
            transactionId: { stringValue: transactionId },
            amount: { stringValue: amount },
            status: { stringValue: "paid" },
            grantedAt: { timestampValue: new Date().toISOString() },
          } satisfies FirestoreFields,
        }),
      },
    );
    if (created.status !== 200) {
      // A concurrent request may have created the entitlement first. Re-read
      // and only continue when the stored owner matches this uid.
      const raced = await firestoreRequest<EntitlementDocument>(
        `stripeEntitlements/${documentId}`,
        { method: "GET" },
      );
      const racedUid = raced.data?.fields?.uid?.stringValue;
      if (raced.status !== 200 || racedUid !== uid) {
        throw new Error("Couldn't durably record the Stripe entitlement.");
      }
    }
  } else {
    throw new Error("Couldn't read the Stripe entitlement store.");
  }

  const updated = await firestoreRequest<unknown>(
    `users/${encodeURIComponent(uid)}?updateMask.fieldPaths=premium&updateMask.fieldPaths=premiumTx&updateMask.fieldPaths=premiumSince`,
    {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          premium: { booleanValue: true },
          premiumTx: { stringValue: transactionId },
          premiumSince: { timestampValue: new Date().toISOString() },
        } satisfies FirestoreFields,
      }),
    },
  );
  if (updated.status !== 200) {
    throw new Error("Payment was verified, but the Premium entitlement could not be written to the user record.");
  }
}
