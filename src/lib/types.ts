/** Firestore document shapes for Common Pot. */
export interface Member {
  uid: string;
  name: string;
}

export type SplitMode = "equal" | "custom";
export type SplitType = "amount" | "percent";

export interface GroupData {
  name: string;
  inviteCode: string;
  members: Member[];
  memberIds: string[];
  createdBy: string;
  createdAt: number; // epoch ms
}

export type Group = GroupData & { id: string };

export interface ExpenseData {
  description: string;
  amount: number; // dollars
  paidBy: string; // member uid
  splitBetween: string[]; // member uids who share the cost
  splitMode: SplitMode;
  splitType?: SplitType; // "amount" | "percent" when splitMode is custom
  shares?: Record<string, number>; // uid -> amount ($) or percent (0-100)
  createdBy: string;
  createdAt: number; // epoch ms
}

export type Expense = ExpenseData & { id: string };

export interface SettlementData {
  from: string; // uid who pays
  to: string; // uid who receives
  amount: number;
  settledBy: string;
  createdAt: number; // epoch ms
}

export type Settlement = SettlementData & { id: string };

/** One simplified "X pays Y" transaction. */
export interface Transfer {
  from: string;
  to: string;
  amount: number;
}
