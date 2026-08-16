import { useEffect, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { getDb, isFirebaseConfigured } from "./firebase";

/** The one-time price of the Premium Ledger, in USD (must match the server's
 *  PREMIUM_PRICE in main.ts). */
export const PREMIUM_PRICE = "4.99";

/** Fields kept on the user's own `users/{uid}` doc. */
export interface PremiumRecord {
  premium: boolean;
  premiumSince?: number; // epoch ms
  premiumTx?: string;
}

export function isPremium(record: PremiumRecord | null | undefined): boolean {
  return Boolean(record?.premium);
}

/** Timestamp folds: Firestore `serverTimestamp()` arrives as a Timestamp. */
function toMs(value: unknown): number | undefined {
  if (value && typeof value === "object") {
    const ts = value as { toMillis?: () => number };
    if (typeof ts.toMillis === "function") return ts.toMillis();
  }
  return typeof value === "number" ? value : undefined;
}

/** Subscribe to the user's premium record on their `users/{uid}` doc.
 *  `loaded` flips once the first snapshot (or read failure) lands. */
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
        // Rules not published yet (or offline) — behave as not-premium.
        setRecord(null);
        setLoaded(true);
      },
    );
    return unsubscribe;
  }, [uid]);

  return { record, loaded };
}

/** Record a verified premium purchase on the user's own doc.
 *
 * The server is the source of truth now: `POST /api/stripe/grant` re-verifies
 * the paid Stripe session and returns a server-issued proof token, which the
 * hardened Firestore rule requires before `premium` can be flipped to true.
 * A client can never grant itself premium directly. */
export async function grantPremium(
  uid: string,
  sessionId: string,
  apiBase: string,
): Promise<{ transactionId: string }> {
  if (!isFirebaseConfigured) {
    throw new Error("Firebase isn't configured yet.");
  }
  if (!uid || uid.length < 5) {
    throw new Error("We don't know who you are yet.");
  }
  if (!sessionId) {
    throw new Error("There's no payment to honor.");
  }
  const res = await fetch(`${apiBase}/api/stripe/grant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, uid }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    token?: string;
    transactionId?: string;
    error?: unknown;
  };
  if (!res.ok || !data.success || typeof data.token !== "string") {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "The till couldn't honor that payment.",
    );
  }
  await setDoc(
    doc(getDb(), "users", uid),
    {
      premium: true,
      premiumTx: data.token,
      premiumSince: serverTimestamp(),
    },
    { merge: true },
  );
  return { transactionId: data.transactionId ?? "" };
}
