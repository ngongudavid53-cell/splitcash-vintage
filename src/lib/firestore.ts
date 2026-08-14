import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getDb, isFirebaseConfigured } from "./firebase";
import { randomInviteCode } from "./codes";
import type { Member, SplitMode, SplitType } from "./types";

function requireConfigured() {
  if (!isFirebaseConfigured) {
    throw new Error("Firebase isn't configured yet.");
  }
}

/** Pick a code that isn't already in the inviteCodes index. */
async function pickFreeInviteCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const inviteCode = randomInviteCode();
    const existing = await getDoc(doc(getDb(), "inviteCodes", inviteCode));
    if (!existing.exists()) return inviteCode;
  }
  return randomInviteCode();
}

export async function createGroup(
  name: string,
  creator: Member,
): Promise<string> {
  requireConfigured();
  const inviteCode = await pickFreeInviteCode();
  const ref = await addDoc(collection(getDb(), "groups"), {
    name: name.trim(),
    inviteCode,
    members: [creator],
    memberIds: [creator.uid],
    createdBy: creator.uid,
    createdAt: serverTimestamp(),
  });
  // Index the code -> group so friends can join with a single-document read
  // (list scans of `groups` can't pass the membership read rule).
  try {
    await setDoc(doc(getDb(), "inviteCodes", inviteCode), { groupId: ref.id });
  } catch (err) {
    console.warn("[Common Pot] Couldn't index the invite code:", err);
  }
  return ref.id;
}

export async function joinGroupByCode(
  code: string,
  member: Member,
): Promise<string> {
  requireConfigured();
  const normalized = code.trim().toUpperCase();
  const indexDoc = await getDoc(doc(getDb(), "inviteCodes", normalized));
  if (!indexDoc.exists()) {
    throw new Error("No ledger found with that code — double-check it with a friend.");
  }
  const groupId = (indexDoc.data() as { groupId?: string }).groupId;
  if (!groupId) {
    throw new Error("That code seems to have faded — ask a friend to re-share it.");
  }
  // Adds the joiner to the ledger. The rules let a member add exactly one new
  // member (themselves); joining when already a member is a harmless no-op
  // that also passes.
  await updateDoc(doc(getDb(), "groups", groupId), {
    members: arrayUnion(member),
    memberIds: arrayUnion(member.uid),
  });
  return groupId;
}

export interface NewExpenseInput {
  description: string;
  amount: number;
  paidBy: string;
  splitBetween: string[];
  splitMode: SplitMode;
  splitType?: SplitType;
  shares?: Record<string, number>;
}

export async function addExpense(
  groupId: string,
  input: NewExpenseInput,
  createdBy: string,
): Promise<void> {
  requireConfigured();
  await addDoc(collection(getDb(), "groups", groupId, "expenses"), {
    description: input.description,
    amount: input.amount,
    paidBy: input.paidBy,
    splitBetween: input.splitBetween,
    splitMode: input.splitMode,
    splitType: input.splitType ?? null,
    shares: input.shares ?? null,
    createdBy,
    createdAt: serverTimestamp(),
  });
}

/** Correct a mis-entered entry. Keeps its original timestamp so the daybook
 *  order doesn't jump around. */
export async function updateExpense(
  groupId: string,
  expenseId: string,
  input: NewExpenseInput,
): Promise<void> {
  requireConfigured();
  await updateDoc(doc(getDb(), "groups", groupId, "expenses", expenseId), {
    description: input.description,
    amount: input.amount,
    paidBy: input.paidBy,
    splitBetween: input.splitBetween,
    splitMode: input.splitMode,
    splitType: input.splitType ?? null,
    shares: input.shares ?? null,
  });
}

export async function removeExpense(
  groupId: string,
  expenseId: string,
): Promise<void> {
  requireConfigured();
  await deleteDoc(doc(getDb(), "groups", groupId, "expenses", expenseId));
}

const settlementId = (from: string, to: string) => `${from}__${to}`;

/** Record that "from" has paid "to" — idempotent per pair. */
export async function setSettlement(
  groupId: string,
  from: string,
  to: string,
  amount: number,
  settledBy: string,
): Promise<void> {
  requireConfigured();
  await setDoc(doc(getDb(), "groups", groupId, "settlements", settlementId(from, to)), {
    from,
    to,
    amount,
    settledBy,
    createdAt: serverTimestamp(),
  });
}

export async function clearSettlement(
  groupId: string,
  from: string,
  to: string,
): Promise<void> {
  requireConfigured();
  await deleteDoc(doc(getDb(), "groups", groupId, "settlements", settlementId(from, to)));
}
