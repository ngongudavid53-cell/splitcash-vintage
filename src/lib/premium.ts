import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { getDb, isFirebaseConfigured } from "./firebase";

/** The Premium Ledger price in USD. Must match the server's Stripe price. */
export const PREMIUM_PRICE = "18.99";

/** Fields kept on the user's own `users/{uid}` doc. */
export interface PremiumRecord {
  premium: boolean;
  premiumSince?: number;
  premiumTx?: string;
}

export function isPremium(record: PremiumRecord | null | undefined): boolean {
  return Boolean(record?.premium);
}

function toMs(value: unknown): number | undefined {
  if (value && typeof value === "object") {
    const ts = value as { toMillis?: () => number };
    if (typeof ts.toMillis === "function") return ts.toMillis();
  }
  return typeof value === "number" ? value : undefined;
}

export function usePremium(
  uid: string | undefined,
): { record: PremiumRecord | null; loaded: boolean } {
  const [record, setRecord] = useState<PremiumRecord | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured || !uid) {
      setRecord(null);
      setLoaded(false);
      return;
    }
    setLoaded(false);
    const unsubscribe = onSnapshot(
      doc(getDb(), "users", uid),
      (snap) => {
        const d = snap.data();
        setRecord({
          premium: Boolean(d?.premium),
          premiumSince: toMs(d?.premiumSince),
          premiumTx: typeof d?.premiumTx === "string" ? d.premiumTx : undefined,
        });
        setLoaded(true);
      },
      () => {
        setRecord(null);
        setLoaded(true);
      },
    );
    return unsubscribe;
  }, [uid]);

  return { record, loaded };
}

/**
 * Ask the backend to honor a verified Stripe payment.
 *
 * The backend re-verifies the Stripe session and writes the entitlement using
 * Firebase service-account credentials. The browser never writes premium
 * fields itself, so the grant survives backend restarts.
 */
export async function grantPremium(
  uid: string,
  sessionId: string,
  apiBase: string,
): Promise<{ transactionId: string }> {
  if (!isFirebaseConfigured) throw new Error("Firebase isn't configured yet.");
  if (!uid || uid.length < 5) throw new Error("We don't know who you are yet.");
  if (!sessionId) throw new Error("There's no payment to honor.");

  const res = await fetch(`${apiBase}/api/stripe/grant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, uid }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    transactionId?: string;
    error?: unknown;
  };
  if (!res.ok || !data.success || typeof data.transactionId !== "string") {
    throw new Error(
      typeof data.error === "string" ? data.error : "The till couldn't honor that payment.",
    );
  }
  return { transactionId: data.transactionId };
}
