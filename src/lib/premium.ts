import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { getDb, isFirebaseConfigured } from "./firebase";

/** The Premium Ledger price in USD. Must match the server's Stripe price. */
export const PREMIUM_PRICE = "18.99";
export interface PremiumRecord { premium: boolean; premiumSince?: number; premiumTx?: string; }
export function isPremium(record: PremiumRecord | null | undefined): boolean { return Boolean(record?.premium); }
function toMs(value: unknown): number | undefined { if (value && typeof value === "object") { const ts = value as { toMillis?: () => number }; if (typeof ts.toMillis === "function") return ts.toMillis(); } return typeof value === "number" ? value : undefined; }
export function usePremium(uid: string | undefined): { record: PremiumRecord | null; loaded: boolean } {
  const [record, setRecord] = useState<PremiumRecord | null>(null); const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!isFirebaseConfigured || !uid) {
      // This effect resets local subscription state when the authenticated identity changes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRecord(null);
      setLoaded(false);
      return;
    }
    setLoaded(false);
    return onSnapshot(doc(getDb(), "users", uid), (snap) => {
      const d = snap.data(); setRecord({ premium: Boolean(d?.premium), premiumSince: toMs(d?.premiumSince), premiumTx: typeof d?.premiumTx === "string" ? d.premiumTx : undefined }); setLoaded(true);
    }, () => { setRecord(null); setLoaded(true); });
  }, [uid]);
  return { record, loaded };
}

// Premium fields are intentionally read-only from the browser. The Stripe
// webhook is the sole entitlement writer through Firebase service credentials.
