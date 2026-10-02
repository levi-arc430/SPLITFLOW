# SplitFlow

SplitFlow is a non-custodial group expense and settlement app built for USDC on Arc.

**Live app:** https://splitflow-opal.vercel.app

## Why SplitFlow

Most shared-expense apps calculate who owes what, but the actual payment still happens somewhere else. SplitFlow connects the accounting layer to real USDC settlement on Arc.

The core differentiator is **Net Settlement**: instead of asking every member to pay every individual debt, SplitFlow calculates each wallet's final net position and reduces the group to a smaller set of transfers.

Example:

- A owes B 30 USDC
- B owes C 20 USDC
- C owes A 10 USDC

Net positions:

- A: -20
- B: +10
- C: +10

Optimized settlement:

- A → B 10
- A → C 10

## Demo flow

1. Connect an EVM wallet.
2. Sign the free wallet-auth message.
3. Create a group and add at least one other wallet.
4. Add an expense with an equal or custom USDC split.
5. Copy a member's payment link and settle it from that wallet.
6. Create a Net Settlement plan to reduce multiple outstanding debts.
7. Pay the optimized transfers.
8. Open Verified Arc Activity to inspect confirmed transactions on ArcScan.
9. If a settlement is only partially completed, use **Recalculate remaining**. SplitFlow preserves confirmed transfers and creates a new plan without charging anyone twice.

## Current features

- EVM wallet connection with mobile MetaMask handoff
- Wallet-signature authentication
- Owner/member group permissions
- Add members after group creation
- Equal and custom USDC expense splits
- Search and filter expenses
- Delete incorrect unpaid expenses
- Shareable payment links
- Circle App Kit USDC transfers on Arc Testnet
- Exact bigint micro-USDC accounting
- Net Settlement optimization
- Partial-settlement recovery
- One active settlement plan per group
- Onchain transfer verification before marking anything paid
- Arc transaction-hash replay protection
- Verified transaction history
- CSV expense export
- Responsive desktop/mobile UI

## Settlement safety

SplitFlow does not trust the browser's claim that a payment succeeded. The server fetches the Arc transaction receipt and confirms the expected sender, recipient and exact USDC amount before updating payment state.

A transaction hash is unique in the database, so one Arc transaction cannot be reused to satisfy multiple SplitFlow obligations.

## Architecture

- **Frontend:** Next.js App Router, React, TypeScript
- **Wallet:** wagmi, viem
- **Payments:** Circle App Kit
- **Network:** Arc Testnet
- **Database:** Neon Postgres
- **State/data:** TanStack Query
- **CI:** GitHub Actions
- **Hosting:** Vercel

### Settlement path

```
Group expenses
      ↓
Exact USDC split balances
      ↓
Net Settlement optimizer
      ↓
Connected wallet → Circle App Kit → Arc
      ↓
Arc receipt + USDC transfer verification
      ↓
SplitFlow marks the obligation paid
```

## Smart Settlement implementation

Amounts are handled as integer micro-USDC units rather than floating-point values.

For small groups, SplitFlow searches for a settlement plan with a minimum number of transfers. Larger groups use a deterministic greedy fallback to keep runtime bounded.

When a plan is only partially paid, confirmed optimized transfers are applied to the group's remaining net balances before a replacement plan is generated.

## Contract note

`contracts/SplitFlowSettlement.sol` is an experimental reference for a future contract-based batching architecture. The current MVP intentionally settles wallet-to-wallet through Circle App Kit and verifies the resulting Arc transactions onchain. The production runtime does **not** depend on the Solidity contract.

## Local development

```bash
npm install
cp .env.example .env.local
npm run typecheck
npm test
npm run build
npm run dev
```

Set a Postgres connection string in `DATABASE_URL` (or `POSTGRES_URL` / `NEON_DATABASE_URL`).

## CI gates

Every push to `main` runs:

- TypeScript validation
- settlement unit tests
- production Next.js build

## Network

- Arc Testnet chain ID: `5042002`
- USDC: `0x3600000000000000000000000000000000000000`
