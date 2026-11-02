# Torrent — Soroban Payout-Rights and Escrow Contract Specification

## Core invariant: fully backed, non-speculative claims
No payout right exists before the underlying asset has been locked and verified in escrow. `totalOutstandingRights + pendingAuthorizedDistributions <= totalEscrowAssetsAvailable` must hold after every action. Token decimals use precise integer token base units. No claim represents unpaid future contributions. Deposits and claims require explicit authorization.

## Required on-chain state (illustrative schema)
- `PoolConfig(poolId, controller, tokenAddress, membershipPolicyHash, startLedger, status)`
- `Member(poolId, address, eligible, joinedAt, signerPolicy)`
- `PayoutRight(rightId, poolId, amount, ownerAddress, maturityTimestamp, transferPolicyHash, state)`
- `EscrowTotals(poolId, funded, reserved, claimed, withdrawn)`
- `TransferApproval(transferId, rightId, from, to, expiry, status)`
- `Nonce(address, seq)` for auth/replay where Soroban built-in auth is insufficient.

## Proposed external contract entrypoints (adapt naming/types to Soroban SDK)
```text
create_pool(controller, token, membership_policy_hash) -> pool_id
join_pool(pool_id, member, signed_policy_hash) -> ()
deposit(pool_id, from, amount) -> receipt_id
issue_right(pool_id, owner, amount, maturity, policy_hash) -> right_id
propose_transfer(right_id, new_owner, expiry) -> transfer_id
accept_transfer(transfer_id) -> ()
claim(right_id, recipient) -> token transfer
pause_pool(pool_id) -> ()
get_pool(pool_id) -> PoolSummary
get_right(right_id) -> RightSummary
```
All mutating calls enforce permissions with Soroban authorization primitives and test unauthorized paths. Membership rules are **not** changeable unilaterally after funding; breaking changes need explicit consent and versioned contract policy.

## Contract events
- `pool_created`, `funded`, `right_issued`, `transfer_proposed`, `transfer_completed`, `right_claimed`, `pool_paused`.
Each includes network, contract ID and opaque pool/right refs; never embed personal/financial agreement data unnecessarily. `torrent-indexer` defines deterministic projection and a durable cursor; a new indexer instance can replay from the deployment ledger.

## Financial protection
- Contract refuses minting if reserved rights would exceed unallocated funded value.
- `issue_right` locks additional reserved value, does not duplicate spending rights.
- A transferred right has only one owner at a time.
- A right cannot be claimed twice or before maturity.
- Withdrawals are restricted; no operator backdoor to unreserve issued rights.
- Pausing prevents new risky operations but cannot confiscate user funds without disclosed policy.
- Never use a web dashboard balance to determine what the chain contract should pay.

## Off-chain API responsibilities
`torrent-api` handles invitations, KYC/eligibility status, off-chain group agreement history, notifications and transaction-intent tracking; it does **not** own custody. `torrent-indexer` owns the confirmed ledger-derived state and emits read models/events with finality metadata. `torrent-web` reads the API, signs through supported wallets and displays unconfirmed states honestly.

## Critical property tests
- overcollateralization invariant across random deposit/issue/transfer/claim sequences;
- invalid member transfer rejected;
- old owner cannot claim after transfer;
- new owner cannot claim before maturity;
- double-claim and replay blocked;
- no unexpected funds leave pool;
- indexer catch-up after missed ledgers yields identical projection.
