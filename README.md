# SplitFlow

SplitFlow is a non-custodial group payments app for settling shared expenses in USDC on Arc.

## MVP

- Connect an EVM wallet
- Create groups and expenses
- Equal/custom splits
- Track paid and pending balances
- Shareable payment requests
- Smart Settlement optimization
- USDC settlement contract
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

Next.js, React, TypeScript, wagmi, viem, TanStack Query, Solidity.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Network

The app starts on Arc Testnet (chain ID 5042002). Network-specific addresses are kept in environment variables so they can be verified before production deployment.

## Contract

`contracts/SplitFlowSettlement.sol` is intentionally non-custodial. Users authorize transfers from their own wallets; SplitFlow never holds user private keys.
