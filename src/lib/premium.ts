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

/** Record a verified premium purchase on the user's own doc. The transaction
 *  was already checked by the server (POST /api/braintree/entitle) before
 *  this is called. */
export async function grantPremium(uid: string, txId: string): Promise<void> {
  if (!isFirebaseConfigured) {

[FILE_TOO_LARGE]: The combined read_files output exceeded the 100,000 character hard limit. This file was truncated after 2,355 characters. Read it separately or use code_search for the relevant section.