# Torrent — Cross-repository Architecture

## Why exactly four repositories?
These are four distinct deployable/reusable engineering domains. They must remain independently testable and publishable. Splitting arbitrary features into extra repos solely for Wave incentives is prohibited.

| Repository | Independent ownership | Outputs | Consumers |
|---|---|---|---|
| `torrent-web` | Savings-circle dashboard, governance and identity UX, fully-funded payout inventory, swap/transfer requests, signing and reporting | Next.js web | product users or other repo services |
| `torrent-api` | Authenticated groups, enrollment, policy state, off-chain agreements, transaction intent orchestration, RBAC, compliance and notifications | NestJS backend | product users or other repo services |
| `torrent-contracts` | Escrow of backed assets, immutable fully-funded payout rights, transfer restrictions, schedule enforcement, claims, authorized amendments | Rust/Soroban | other project repos via versioned API/SDK |
| `torrent-indexer` | Soroban event ingestion, canonical ledger-derived read models, reconciliation, replay/backfill, settlement status and event API | TypeScript ledger/indexer | product users or other repo services |

## Request and ownership paths
```
Torrent Next.js web ---> torrent-api (identity + groups + intents)
                                |                      ^
                       submit contract operations    | read models
                                v                      |
                         torrent-contracts <---- torrent-indexer
                                  ^              (chain events only)
                                  +-- Stellar RPC -> chain truth
```
The indexer reconstructs on-chain state but cannot mutate financial group policy. The API owns off-chain agreements and invitations, not escrow balances. The contracts are the only source of truth for backing, right ownership and payout.

## Stellar integration: essential system, not decoration
- Soroban escrow contract takes custody of already-funded supported Stellar assets.
- PayoutRight registry records unique claim ID, owner, amount, payout timestamp/ledger and transfer policy.
- Member-approved rights transfer updates on-chain owner; requires explicit auth and prevents replay.
- Claim checks maturity, ownership, non-duplication and escrow coverage before releasing tokens.
- Indexer consumes contract events and reconstructs state; API read models cannot override contract truth.

## Service and package contracts
- OpenAPI for network APIs; generated Dart/TypeScript clients; schema snapshots checked into CI.
- Published package semver for reusable SDK/contract bindings; explicit peer version compatibility table.
- Idempotency tokens across all state-changing network/ledger operations.
- Reconciliation event contract: `{id, sourceRepo, schemaVersion, network, ledgerCursor, entityRef, status, observedAt}`.
- Never assume a wallet knows off-chain business rights or that an API database can overrule confirmed on-chain state.

## Integration test order
1. Each repository passes independent lint/build/unit tests.
2. Publish local SDKs and generated interfaces.
3. Run network local/sandbox or Testnet tests.
4. Run API/service orchestration tests with fake wallets and then test wallets.
5. Run frontend/device E2E.
6. Verify failure and recovery (network loss, duplicate event, stale authorization, partial settlement).

## Long-term release strategy
- Independent tags/releases in each repo.
- Project-wide integration lockfile references tested SHAs/tags of dependencies.
- Before shipping any release, each repo README links the matching version of its three siblings.
