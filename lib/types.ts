export type GroupSummary = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  member_count: number;
  pending_count: number;
};

export type GroupMember = {
  id: string;
  wallet_address: string;
  display_name: string | null;
  created_at: string;
};

export type Expense = {
  id: string;
  description: string;
  amount_usdc: string;
  paid_by: string;
  split_type: "equal" | "custom";
  created_by: string;
  created_at: string;
};

export type ExpenseSplit = {
  id: string;
  expense_id: string;
  wallet_address: string;
  amount_usdc: string;
  status: "pending" | "paid";
  payment_token: string;
  settled_tx_hash: string | null;
  locked_by_settlement: boolean;
};

export type Transaction = {
  id: string;
  expense_id: string | null;
  payment_token: string | null;
  settlement_transfer_id: string | null;
  from_wallet: string;
  to_wallet: string;
  amount_usdc: string;
  tx_hash: string;
  status: "pending" | "confirmed" | "failed";
  created_at: string;
};

export type SettlementRound = {
  id: string;
  status: "open" | "completed" | "cancelled";
  created_by: string;
  created_at: string;
  completed_at: string | null;
};

export type SettlementTransfer = {
  id: string;
  round_id: string;
  from_wallet: string;
  to_wallet: string;
  amount_usdc: string;
  status: "pending" | "paid";
  tx_hash: string | null;
};

export type GroupDetail = {
  group: {
    id: string;
    name: string;
    created_by: string;
    created_at: string;
  };
  members: GroupMember[];
  expenses: Expense[];
  splits: ExpenseSplit[];
  transactions: Transaction[];
  settlementRounds: SettlementRound[];
  settlementTransfers: SettlementTransfer[];
};

export type PaymentRequest = {
  payment_token: string;
  debtor: string;
  amount_usdc: string;
  status: "pending" | "paid";
  settled_tx_hash: string | null;
  expense_id: string;
  description: string;
  recipient: string;
  group_id: string;
  group_name: string;
  locked_by_settlement?: boolean;
};
