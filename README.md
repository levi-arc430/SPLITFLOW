# SplitFlow

SplitFlow is a non-custodial group payments app for settling shared expenses in USDC on Arc.

## MVP

- Connect an EVM wallet
- Create groups and expenses
- Equal/custom splits
- Track paid and pending balances
- Shareable payment requests
- Smart Settlement optimization
- Circle App Kit USDC settlement on Arc
- Arc transaction history

## Smart Settlement

SplitFlow calculates every member's net balance, then reduces unnecessary transfers before settlement.

Example:

- A owes B 30
- B owes C 20
- C owes A 10

Net:

- A: -20
- B: +10
- C: +10

Optimized:

- A -> B 10
- A -> C 10

## Stack

Next.js, React, TypeScript, wagmi, viem, TanStack Query, Circle App Kit, Neon Postgres.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Network

The app starts on Arc Testnet (chain ID 5042002). Set DATABASE_URL in production; SplitFlow automatically creates the required Postgres schema on first database use.

## Settlement architecture

The MVP settles USDC directly from each user's connected browser wallet on Arc using Circle App Kit. SplitFlow verifies the resulting Arc transaction onchain before changing a request from Pending to Paid.

`contracts/SplitFlowSettlement.sol` is retained as an experimental reference for a future contract-based batching design. It is not used by the current MVP runtime.


## Deployment

The Vercel project is linked to the `main` branch. Production deployments are triggered from GitHub pushes after Vercel project setup.


Deployment verification: wallet sessions are signed by the connected wallet.
