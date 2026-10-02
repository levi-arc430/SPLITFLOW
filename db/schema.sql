CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  wallet_address text NOT NULL,
  display_name text,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS group_members_wallet_idx
  ON group_members(wallet_address);

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 120),
  amount_usdc numeric(20,6) NOT NULL CHECK (amount_usdc > 0),
  paid_by text NOT NULL,
  split_type text NOT NULL CHECK (split_type IN ('equal', 'custom')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expense_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  wallet_address text NOT NULL,
  amount_usdc numeric(20,6) NOT NULL CHECK (amount_usdc >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  payment_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  settled_tx_hash text,
  settlement_round_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expense_splits_payment_idx
  ON expense_splits(payment_token);

CREATE UNIQUE INDEX IF NOT EXISTS expense_splits_member_idx
  ON expense_splits(expense_id, wallet_address);

CREATE TABLE IF NOT EXISTS settlement_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_by text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS one_open_settlement_round_per_group
  ON settlement_rounds(group_id)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS settlement_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES settlement_rounds(id) ON DELETE CASCADE,
  from_wallet text NOT NULL,
  to_wallet text NOT NULL,
  amount_usdc numeric(20,6) NOT NULL CHECK (amount_usdc > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  tx_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settlement_round_splits (
  round_id uuid NOT NULL REFERENCES settlement_rounds(id) ON DELETE CASCADE,
  split_id uuid NOT NULL REFERENCES expense_splits(id) ON DELETE CASCADE,
  PRIMARY KEY(round_id, split_id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  expense_id uuid REFERENCES expenses(id) ON DELETE SET NULL,
  payment_token uuid,
  settlement_transfer_id uuid REFERENCES settlement_transfers(id) ON DELETE SET NULL,
  from_wallet text NOT NULL,
  to_wallet text NOT NULL,
  amount_usdc numeric(20,6) NOT NULL,
  tx_hash text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('pending', 'confirmed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transactions_group_idx
  ON transactions(group_id, created_at DESC);
