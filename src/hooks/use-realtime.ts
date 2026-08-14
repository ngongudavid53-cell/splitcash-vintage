import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { getDb, isFirebaseConfigured } from "@/lib/firebase";
import type { Expense, Group, Member, Settlement } from "@/lib/types";

/** Firestore `serverTimestamp()` arrives as a Timestamp — fold it to epoch ms. */
function toMs(value: unknown): number {
  if (value && typeof value === "object") {
    const ts = value as { toMillis?: () => number };
    if (typeof ts.toMillis === "function") return ts.toMillis();
  }
  return typeof value === "number" ? value : Date.now();
}

function mapGroup(id: string, g: Record<string, unknown>): Group {
  return {
    id,
    name: typeof g.name === "string" ? g.name : "Unnamed ledger",
    inviteCode: typeof g.inviteCode === "string" ? g.inviteCode : "",
    members: Array.isArray(g.members) ? (g.members as Member[]) : [],
    memberIds: Array.isArray(g.memberIds) ? (g.memberIds as string[]) : [],
    createdBy: typeof g.createdBy === "string" ? g.createdBy : "",
    createdAt: toMs(g.createdAt),
  };
}

function mapExpense(id: string, e: Record<string, unknown>): Expense {
  return {
    id,
    description: typeof e.description === "string" ? e.description : "",
    amount: typeof e.amount === "number" ? e.amount : 0,
    paidBy: typeof e.paidBy === "string" ? e.paidBy : "",
    splitBetween: Array.isArray(e.splitBetween)
      ? (e.splitBetween as string[])
      : [],
    splitMode: e.splitMode === "custom" ? "custom" : "equal",
    splitType: e.splitType === "percent" ? "percent" : "amount",
    shares:
      e.shares && typeof e.shares === "object"
        ? (e.shares as Record<string, number>)
        : undefined,
    createdBy: typeof e.createdBy === "string" ? e.createdBy : "",
    createdAt: toMs(e.createdAt),
  };
}

function mapSettlement(id: string, s: Record<string, unknown>): Settlement {
  return {
    id,
    from: typeof s.from === "string" ? s.from : "",
    to: typeof s.to === "string" ? s.to : "",
    amount: typeof s.amount === "number" ? s.amount : 0,
    settledBy: typeof s.settledBy === "string" ? s.settledBy : "",
    createdAt: toMs(s.createdAt),
  };
}

interface ReadState<T> {
  data: T | undefined;
  loaded: boolean;
  /** Set when Firestore rejects the read (e.g. rules not published yet). */
  error: string | null;
}

/** All the ledgers the user is a member of (filtered by invite-code membership). */
export function useMyGroups(uid: string | undefined): ReadState<Group[]> {
  const [data, setData] = useState<Group[] | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !uid) {
      setLoaded(false);
      setError(null);
      return;
    }
    setError(null);
    const q = query(
      collection(getDb(), "groups"),
      where("memberIds", "array-contains", uid),
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const groups = snap.docs.map((d) => mapGroup(d.id, d.data()));
        groups.sort((a, b) => b.createdAt - a.createdAt);
        setData(groups);
        setLoaded(true);
      },
      (err) => {
        console.error("[Common Pot] Couldn't read your ledgers:", err);
        setError("Couldn't read your ledgers from Firestore.");
        setLoaded(true);
      },
    );
    return unsubscribe;
  }, [uid]);

  return { data, loaded, error };
}

/** A single ledger by id. */
export function useGroup(groupId: string | undefined): ReadState<Group> {
  const [data, setData] = useState<Group | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !groupId) {
      setLoaded(false);
      setError(null);
      return;
    }
    setError(null);
    const unsubscribe = onSnapshot(
      doc(getDb(), "groups", groupId),
      (snap) => {
        if (snap.exists()) {
          setData(mapGroup(snap.id, snap.data()));
        } else {
          setData(undefined);
        }
        setLoaded(true);
      },
      (err) => {
        console.error("[Common Pot] Couldn't read that ledger:", err);
        setError("Couldn't read that ledger from Firestore.");
        setLoaded(true);
      },
    );
    return unsubscribe;
  }, [groupId]);

  return { data, loaded, error };
}

/** The expense daybook, newest first. */
export function useExpenses(groupId: string | undefined): ReadState<Expense[]> {
  const [data, setData] = useState<Expense[] | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !groupId) {
      setLoaded(false);
      setError(null);
      return;
    }
    setError(null);
    const q = query(collection(getDb(), "groups", groupId, "expenses"));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const expenses = snap.docs.map((d) => mapExpense(d.id, d.data()));
        expenses.sort((a, b) => b.createdAt - a.createdAt);
        setData(expenses);
        setLoaded(true);
      },
      (err) => {
        console.error("[Common Pot] Couldn't read the daybook:", err);
        setError("Couldn't read the daybook from Firestore.");
        setLoaded(true);
      },
    );
    return unsubscribe;
  }, [groupId]);

  return { data, loaded, error };
}

/** The settlements subcollection — "X paid Y" records, newest first. */
export function useSettlements(
  groupId: string | undefined,
): ReadState<Settlement[]> {
  const [data, setData] = useState<Settlement[] | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !groupId) {
      setLoaded(false);
      setError(null);
      return;
    }
    setError(null);
    const q = query(collection(getDb(), "groups", groupId, "settlements"));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const settlements = snap.docs.map((d) => mapSettlement(d.id, d.data()));
        settlements.sort((a, b) => b.createdAt - a.createdAt);
        setData(settlements);
        setLoaded(true);
      },
      (err) => {
        console.error("[Common Pot] Couldn't read the settlements:", err);
        setError("Couldn't read the settlements from Firestore.");
        setLoaded(true);
      },
    );
    return unsubscribe;
  }, [groupId]);

  return { data, loaded, error };
}
