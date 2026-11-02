# Torrent — Product Requirements Document

**Status:** technical product specification, preimplementation. **Platform:** Responsive Next.js web application.  **Target:** Stellar Testnet demo, real adoption only after risk/legal validation.

## Vision
A fully funded savings-circle financial system in which verified eligible members can exchange the timing/ownership of scheduled payout claims. No claim can be traded unless an equivalent supported asset amount is actually reserved on Stellar. This is a prototype of a rights market, not a guarantee of future unpaid contributions.

## Who needs it
Membership-based communities with documented agreement, group rules, clear funding and eligible right transfers.

## Core user outcomes
- create and govern a savings circle
- fund and verify escrow before issuing claims
- mint uniquely identified payout rights with due dates
- display and negotiate a permitted member-to-member right transfer
- signed on-chain transfer and ledger-derived ownership
- claim payout once matured and prove contract balance invariants

## Core customer journey
1. A verified group creates explicit rules and fully funds an escrow pool on Testnet.
2. Contract issues backed rights with amounts, owners and maturity dates; no unfunded payout claims.
3. Members view due dates and ownership; only eligible transfers may be proposed.
4. Both parties confirm a transfer under the group's rules.
5. Contract updates the right owner after authorization; indexer independently reconstructs new state.
6. On maturity, only the final owner can claim the exact payout once.

## Functional requirements
- create and govern a savings circle
- fund and verify escrow before issuing claims
- mint uniquely identified payout rights with due dates
- display and negotiate a permitted member-to-member right transfer
- signed on-chain transfer and ledger-derived ownership
- claim payout once matured and prove contract balance invariants

## Non-goals for first MVP
- unfunded promises of future contributions as guaranteed assets
- loans, interest, APY, investing recommendations or gambling mechanics
- anonymous public right trading without jurisdiction review
- bank custody or fiat promises

## Safety and commercial reality
- Traditional rotating savings schemes with unpaid future contributions are not fully backed; do not tokenize them as guaranteed payout rights.
- Moving payout dates is not the same as creating new money or profit.
- Transferability, consumer protection and potential financial instrument rules need legal review.
- Keep the first product Testnet-only with synthetic funds and members.

## Core success measures
- rights backed / liabilities
- completed rights transfers
- time-to-reconcile event state
- unauthorized claim/transfer rejection rate
- claim at scheduled maturity success

## Acceptance tests
- A Testnet circle can be created, funded and verified fully collateralized.
- Payout rights cannot be minted beyond escrowed backing.
- An authorized eligible member can transfer one backed payout right.
- Old owner cannot claim after transfer; new owner cannot claim before maturity.
- At maturity, rightful owner claims exactly once.
- Indexer can rebuild from deployment ledger without diverging from contract state.

## Repository architecture
See `ARCHITECTURE.md`. Exactly four repos are proposed as stable engineering ownership boundaries. Reducing or increasing them requires a written technical justification, not reward optimization.
