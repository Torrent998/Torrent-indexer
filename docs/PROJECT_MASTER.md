# Torrent — Master Context / Index

This is the full product context of the Torrent four-repo system. Docs are mirrored here to keep every repo standalone for coding agents. **The canonical maintained copy is in `torrent-api`.** Before merging breaking changes sync all mirrors via a script/CI.

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

---
# Torrent — Software Requirements & Domain Specification

## System boundaries
A fully funded savings-circle financial system in which verified eligible members can exchange the timing/ownership of scheduled payout claims. No claim can be traded unless an equivalent supported asset amount is actually reserved on Stellar. This is a prototype of a rights market, not a guarantee of future unpaid contributions.

### Domain objects (minimum initial schema)
- User: UUID/opaque public ref + timestamps + status/metadata, no unverified external fields
- Circle: UUID/opaque public ref + timestamps + status/metadata, no unverified external fields
- CircleMember: UUID/opaque public ref + timestamps + status/metadata, no unverified external fields
- CircleRuleSet: UUID/opaque public ref + timestamps + status/metadata, no unverified external fields
- FundingIntent: UUID/opaque public ref + timestamps + status/metadata, no unverified external fields
- FundingPosition: UUID/opaque public ref + timestamps + status/metadata, no unverified external fields
- PayoutRight: UUID/opaque public ref + timestamps + status/metadata, no unverified external fields
- RightTransferIntent: UUID/opaque public ref + timestamps + status/metadata, no unverified external fields
- EligibilityDecision: UUID/opaque public ref + timestamps + status/metadata, no unverified external fields
- ClaimIntent: UUID/opaque public ref + timestamps + status/metadata, no unverified external fields
- ContractEvent: UUID/opaque public ref + timestamps + status/metadata, no unverified external fields
- LedgerCursor: UUID/opaque public ref + timestamps + status/metadata, no unverified external fields
- AuditEvent: UUID/opaque public ref + timestamps + status/metadata, no unverified external fields

### State transitions
- financial request/transaction: DRAFT -> VERIFIED -> AWAITING_SIGNATURE -> SUBMITTED -> CONFIRMED; failures go to FAILED or RECONCILING.
- authorization is evaluated server-side before signature requests.
- network confirmations trigger reconciliation; queued retries are idempotent and observable.
- ledger watchers must process duplicate events safely and replay historical ranges.

### Stable public API endpoints (v1 initial contract)
- POST /v1/circles
- GET /v1/circles
- GET /v1/circles/:id
- POST /v1/circles/:id/invitations
- POST /v1/circles/:id/funding-intents
- GET /v1/circles/:id/coverage
- GET /v1/circles/:id/rights
- POST /v1/rights/:id/transfers/intent
- POST /v1/transfers/:id/approve
- POST /v1/transfers/:id/submit
- POST /v1/rights/:id/claim-intent
- GET /v1/ledger/events?cursor=
- GET /v1/circles/:id/audit

**Request/response convention:** JSON keys camelCase; public IDs opaque; `requestId` and `schemaVersion` included in asynchronous requests; error schema `{"error":{"code":"STRING_ENUM","message":"safe summary","requestId":"opaque"}}`. All writes requiring on-chain action return a stateful intent, not a fake immediate success. Produce OpenAPI documentation and integration fixtures before client implementation.

### Authoritative data ownership
- The main API owns users, policy, product workflow and off-chain financial obligations.
- The Stellar owner repo owns network adapters and ledger protocol semantics; do not duplicate transaction-building code in web/mobile.
- The user signs funds movement; server signing, if any, must use scoped secure keys and explicit sponsorship logic.
- Client caches are not accounting books.

### Failure modes to design first
- Traditional rotating savings schemes with unpaid future contributions are not fully backed; do not tokenize them as guaranteed payout rights.
- Moving payout dates is not the same as creating new money or profit.
- Transferability, consumer protection and potential financial instrument rules need legal review.
- Keep the first product Testnet-only with synthetic funds and members.
- repeated HTTP submit with same idempotency key -> exactly one business intent;
- chain timeout after submission -> RECONCILING, never assume failed or retry with changed parameters;
- stale quote / stale pool state / expired channel -> require new user approval;
- unrecognized network passphrase or issuer -> fail closed;
- disconnect / process crash -> resumable, replayable state;
- reconciliation discrepancy -> pause sensitive actions pending investigation.

### Performance baselines (engineering targets, not guarantees)
- local API reads p95 < 500ms under synthetic demo load;
- ledger confirmation times must reflect actual Testnet conditions, never a fixed animation;
- background jobs: retry bounded with dead-letter visibility;
- mobile poor-network state includes retry, offline read-only and recovery messaging;
- audit records capture actor, scope, action, time, object and request id, never secret keys.

### Security
- secure device key storage; no raw signing seeds in browser persistent storage;
- RBAC per role and resource; validated typed schemas for all inputs;
- TLS for network APIs, explicit local peer protocol auth for Sideband;
- no fake fiat settlement or institutional verification;
- rate limits, security logging without sensitive leakage, backup/restore, secret rotation;
- Testnet is default; Mainnet requires external review and compliance planning.

### QA
- domain state-machine unit tests; API integration tests; chain/sandbox end-to-end tests;
- on-chain amount and signature tests; invalid/missing auth; replay/rollback tests;
- client error/offline/permission tests; no secrets in builds;
- reproducible full product demo with documented assertions.

---
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

---
# Torrent — Technical Build Guide (AI-agent source of truth)


# Recommended stack and scaffolding

- Mobile: Flutter stable / Dart 3, Riverpod for app state, go_router for navigation, secure keystore/keychain, integration_test on real devices.
- Web: Next.js 16 / React / TypeScript / Tailwind; do not hard-code a final look. Responsive, accessible and measured.
- API: Node.js 24 LTS / NestJS / PostgreSQL / Prisma / Redis + BullMQ, OpenAPI 3.1, Zod at boundaries.
- Stellar adapters: TypeScript with current compatible `@stellar/stellar-sdk`; native Horizon path/order-book functions for Unbound, Soroban RPC/contracts for Torrent/Sideband.
- Indexing: cursor-based ledger polling with backfill/replay, confirmations, dedup, deterministic recovery from missed events.
- Contracts: Rust stable + matching Soroban SDK/Stellar CLI protocol versions; local sandbox -> Testnet; security review before Mainnet.
- Dev infra: Docker Compose for local DB/Redis, `.env.example`, GitHub Actions (format/lint/test), typed generated client schemas, test fixtures.
- Versioning policy: lockfiles checked in. Pin actual patch versions after initial reproducible build, rather than inventing version numbers now.
- Secrets: NEVER in Git, CI logs, client code, generated demos, documentation examples with valid keys, or screenshots.


# Cross-repository contract

- One repo = one independent engineering ownership boundary, not one artificially split folder.
- Application clients never control authoritative financial state or store server signing keys.
- One authoritative backend owns identity, application access policy and audit; chain-facing repos own ledger interpretation/transaction tooling; no overlapping writers.
- Separate on-chain truth from off-chain projections. Recovery and reconciliation are first-class.
- Financial operations use idempotency keys and explicit state transitions (`CREATED`, `AUTHORIZED`, `SUBMITTED`, `CONFIRMED`, `FAILED`, `RECONCILING`).
- Never show a transaction as settled before the expected finality proof is observed.
- Specify exact data provenance, network passphrases, issuer addresses and contract addresses; no invented partner integrations.
- Every amount uses integer minimal units or arbitrary-precision decimals, never binary floats.
- No real-money or production promises in MVP. Default to Stellar Testnet and dummy merchants/assets/providers.
- Version every message schema and API contract. Any breaking change requires coordinated PRs and an integration test.
- Architecture is fixed for ownership, while UI design direction is intentionally revisable.
- Design decisions may evolve with an ADR inside the affected repo; update cross-repo interfaces when they do.
- Never fabricate user activity, prices, payout rights, liquidity, provider status, or app-store availability.
- A repo is Wave-worthy only if it has independently meaningful tests, release artifacts, issues and contributors, not because of its name.


## Scaffolding and repo paths
### `torrent-web` — Next.js web
- Responsibility: Savings-circle dashboard, governance and identity UX, fully-funded payout inventory, swap/transfer requests, signing and reporting
- Suggested bootstrap: `pnpm create next-app@latest . --ts --tailwind --eslint --app --src-dir`
- Proposed top-level directories: `src/app/, src/components/, src/features/, src/lib/api/, public/brand/, tests/e2e/`
- Required before any feature: typecheck/lint/test, `.env.example`, security-first README, generated schema/version contracts and synthetic fixtures.

### `torrent-api` — NestJS backend
- Responsibility: Authenticated groups, enrollment, policy state, off-chain agreements, transaction intent orchestration, RBAC, compliance and notifications
- Suggested bootstrap: `pnpm dlx @nestjs/cli new . --strict` then add Prisma, PostgreSQL, BullMQ and OpenAPI
- Proposed top-level directories: `src/{modules,auth,persistence,integrations,common}/, prisma/, test/, scripts/`
- Required before any feature: typecheck/lint/test, `.env.example`, security-first README, generated schema/version contracts and synthetic fixtures.

### `torrent-contracts` — Rust/Soroban
- Responsibility: Escrow of backed assets, immutable fully-funded payout rights, transfer restrictions, schedule enforcement, claims, authorized amendments
- Suggested bootstrap: `stellar contract init .` or `cargo new --lib` followed by a Rust workspace and pinned Soroban SDK
- Proposed top-level directories: `contracts/, crates/, tests/, scripts/, bindings/, deployments/`
- Required before any feature: typecheck/lint/test, `.env.example`, security-first README, generated schema/version contracts and synthetic fixtures.

### `torrent-indexer` — TypeScript ledger/indexer
- Responsibility: Soroban event ingestion, canonical ledger-derived read models, reconciliation, replay/backfill, settlement status and event API
- Suggested bootstrap: `pnpm init` + TypeScript; add Stellar SDK, durable cursors, test fixture generator
- Proposed top-level directories: `src/{rpc,ledger,indexer,quotes,types}/, tests/, scripts/, generated/`
- Required before any feature: typecheck/lint/test, `.env.example`, security-first README, generated schema/version contracts and synthetic fixtures.

## Development stages and exact phase gates

**M0 — Contract-first planning (all repos).** Freeze API events/payloads, chain addresses/versions, DB ownership, demo story and test fixtures. README must state connected siblings and local startup commands.

**M1 — Protocol proof.** Produce a minimal local/Testnet transaction across the Stellar-dependent engine with independent tests. No product UI polish required. Explicitly demonstrate what cannot work without Stellar.

**M2 — Authoritative backend.** Implement persistent domain state, identity, validation, permissions, API docs, queues, reconciliation and safe failure states.

**M3 — Frontend/device vertical slice.** Build one end-to-end flow consuming the real M1/M2 code. Test mobile on devices where applicable; for web, add accessible route/state tests.

**M4 — Operability.** Diagnostics, documentation, test coverage, security review, backup/recovery, monitoring, rate limits, token/cost safety.

**M5 — Release candidate.** Repeatable demo from fresh clone, audited build provenance, no false status claims, responsible Open Source issue backlog.

## Required deliverables per repo
- Functional implementation and independent test runner;
- generated OpenAPI/JSON schema or ABI/bindings for its public boundary;
- local setup + clean shutdown + deployment instructions;
- telemetry, failure/retry patterns and synthetic fixtures;
- changelog/release tags, contribution guidance and typed dependencies;
- CI with tests and security scans;
- an E2E demonstrated use of the subsystem by at least one sibling repo.

## External research and upstream dependencies
- [Stellar smart contracts](https://developers.stellar.org/docs/build/smart-contracts/overview) — verify license/API compatibility before adopting.
- [Soroban SDK](https://github.com/stellar/rs-soroban-sdk) — verify license/API compatibility before adopting.
- [Stellar JS SDK](https://github.com/stellar/js-stellar-sdk) — verify license/API compatibility before adopting.
- Implement property-based proofs of `sum(outstanding_claims) <= escrow_balance` (accounting for already paid claims) and strict transfer/claim authorization.

---
# Torrent — Threat Model / Trust & Safety

## Core assets to protect
- end-user wallet authorization and secrets;
- canonical ledger truth, quotes, settlement state, pool/channel collateral;
- merchant/provider or membership authority and representation;
- customer privacy, audit history, and safe account recovery.

## Threats and mitigations
- **Fake asset/issuer/provider** -> verify addresses/network and issuer/identity evidence, show issuer status and require explicit user confirmation.
- **Stale rate or condition** -> expiring quote/offer/maturity/channel state; revalidate before signature.
- **Transaction submitted but response lost** -> idempotent reconcile by stable tx hash; no blind double pay.
- **Replay or old signatures** -> domain separation, nonce/session ID, monotonic states, scoped expiry.
- **Key compromise** -> hardware-backed secure storage when available; rotate server secrets and support freeze/recovery flows.
- **Ledger indexing drift** -> process durable cursors, replay from known ledger, verify source and rehydrate read models.
- **Privacy leakage** -> do not put PII, contact data or commercial secrets into on-chain metadata or public source code.
- **Supply-chain attacks** -> pinned/reviewed dependencies, license inspection, security scanning, CI role separation.
- **Client manipulation** -> server validates authorization, user signs critical financial actions; clients not authoritative.

## Domain risks
- Traditional rotating savings schemes with unpaid future contributions are not fully backed; do not tokenize them as guaranteed payout rights.
- Moving payout dates is not the same as creating new money or profit.
- Transferability, consumer protection and potential financial instrument rules need legal review.
- Keep the first product Testnet-only with synthetic funds and members.

## Go-live restriction
MVP is Testnet/synthetic only. Prior to production or external real-money custody, obtain applicable legal/compliance review, security audit, incident response/insurance assessment, operational risk acceptance, verified issuer/provider integrations and UX consumer disclosures. Do not claim that a Stellar transaction alone establishes a valid real-world legal claim.

---
# Torrent — Approved Logo & Flexible Product Design

![Torrent logo](../brand/icon.svg)

**Logo approved as the project identity:** use `../brand/icon.svg` and `../brand/mark.svg` consistently. Do not revert to previously proposed placeholder logos.

**Approved palette:** primary `#42DEB4`, background `#00191C`, light `#FBF8F1`; all fills are solid flat colors.

**Logo meaning:** Two directional planes form an abstract flowing passage, suggesting timing and the transfer of funded payout rights.

**Design flexibility:** This approval is about the logo only. Claude or another build agent can improve UI, typography, layout, animation and information architecture; it must preserve financial truth and accessibility.

---

## Interface principles
- Financial truth comes before animation. Always show recipient/issuer, asset/currency, quoted rate, network, fees, authorization, and settlement state precisely.
- No fake 'approved' ticks or unverified trust claims.
- Include skeleton, empty, partial-confirmation, failure, retry, and low-connectivity states.
- Provide dark and light themes; respect reduced-motion preferences.
- Motion can be sophisticated but cannot delay important actions or disguise pending money.

## Mobile app store landing requirements
- Torrent is web-first; no app-store badges required. Primary CTA launches the web app.

---
# Torrent — Implementation Roadmap & Quality Gates

- A Testnet circle can be created, funded and verified fully collateralized.
- Payout rights cannot be minted beyond escrowed backing.
- An authorized eligible member can transfer one backed payout right.
- Old owner cannot claim after transfer; new owner cannot claim before maturity.
- At maturity, rightful owner claims exactly once.
- Indexer can rebuild from deployment ledger without diverging from contract state.

## Milestones
M0. Four GitHub repos exist under one organization; readmes and versioned API/ABI plan checked in. All repos have meaningful independent deliverables.

M1. Stellar-native protocol slice proven on Local/Testnet with reproducible transaction hashes and failure tests.

M2. Persistent service, API, reconciliation and identity layer with synthetic fixtures, migrations and observable jobs.

M3. Mobile/web UI working with real M1/M2 integration, including offline/error/retry states.

M4. Reliability: chain lag/replay, permission revocation, transaction idempotency, security review, key-management, data export.

M5. Release readiness: comprehensive README and onboarding, CI green, reproducible E2E from clean checkout; collect product feedback.

## Wave contributor lanes
- Repo-specific open issues only after a minimal working foundation exists.
- Each issue has motivation, target repo, interface touchpoints, acceptance tests, complexity and non-goals.
- Do not manufacture duplicated repos, duplicate work or fake contributions.
- Do not claim approval, future earnings or fixed Wave schedules.


# Wave preparation and execution

Before requesting a Stellar Wave listing:
1. Implement an actual vertical slice, not only documentation or placeholder code.
2. Ensure all repos are public, substantive, licensable, tested and actively maintained.
3. Split public contributor issues along the **real** repo boundaries described in ARCHITECTURE.
4. Issues must be specific, appropriately sized and testable. Do not fabricate meaningless tasks to increase repo count or rewards.
5. Set up GitHub labels (good first issue, bug, documentation, stellar, blocked) and PR templates.
6. Onboard each organization using the Drips maintainers flow, install the Drips GitHub App, sync repos and apply (subject to approval and per-user/per-org limits).
7. A shared maintainer application limit may prevent submitting 12 repos in a single Wave cycle. Do not assume approval or payment.

Official: https://docs.drips.network/wave/maintainers/participating-in-a-wave/
Limits: https://docs.drips.network/wave/maintainers/repo-application-limits/


---
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

---
# UX Routes & Brand Delivery (implementation brief, not locked art direction)

## Primary experience map
1. Web landing and member login
2. Create/join circle & signed rules
3. Funding and backing/coverage dashboard
4. List of issued rights with date and ownership
5. Transfer/negotiation and eligibility review
6. Wallet signing and transaction status
7. Rights claim & payout history
8. Governance, permissions and group audit history

## Landing / discoverability
`torrent-web`: product marketing home and authenticated web application in one Next.js codebase, accessible desktop/tablet/mobile, real financial numbers prominently visible; no app-store badges.

## Interaction rules
- Do not imply a payment finalized until Stellar confirms it.
- Prefer one unmistakable primary CTA and clear financial disclosure over experimental visual gimmicks.
- Accessibility: keyboard and screen-reader semantics on web, reduced motion, useful focus, large tap targets on mobile.
- All transitions, fonts, layouts and hero art are open to revision by the building/design agent, with explicit design review.
- Official store badge guidance: https://developer.apple.com/app-store/marketing/guidelines/ and Google Play brand resources. Do not recreate the vendor badges with generative art.

---
# Torrent — Environment, Deployment and Recovery

## Environment boundaries
- Local: deterministic Docker Compose services, Stellar local network/Testnet, synthetic users/fixtures.
- Staging: separate database, bucket, API credentials, signing identities, Testnet assets/contracts, observability.
- Production: requires security audit, real issuer/provider agreements and relevant jurisdictional legal/compliance review. Not included in preimplementation scaffold.

## Suggested variables (non-secret examples only)
```dotenv
APP_ENV=development
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
HORIZON_URL=https://horizon-testnet.stellar.org
DATABASE_URL=postgresql://localhost:5432/torrent
REDIS_URL=redis://localhost:6379
API_BASE_URL=http://localhost:3001
CHAIN_START_LEDGER=0
LOG_LEVEL=info
```
- Credentials to sign on-chain go into a secure secret manager or hardware-backed user wallet, never into a public mobile/web bundle.
- Signed store badge links are configured after actual publication; no fabricated App Store or Google Play app URLs.

## CI & GitHub setup
- GitHub Actions per repo: formatting/lint, schema checks, unit tests, dependency scanning; chain/devices smoke tests where supported.
- Branch protection and PR review recommended.
- Release tag points to tested sibling versions in an integration lockfile.
- All paths use offline/synthetic test fixtures, not real user financial records.

## Failure recovery
- Rebuild indexers from ledger cursor; compare DB projection vs chain truth.
- Restore DB backups after verifying transaction-intent reconciliation.
- Never republish user transactions solely because a client request timed out.
- Test signing-key rotation, dependency outages, stale quotes, malicious user input, insufficient balances and duplicate delivery.
- External reference infrastructure may change; check upstream project versions and licenses at build time.

---
# Scoped Potential Contributor Issues (not yet created on GitHub)

These are **potential tasks**, not manufactured or claimed completed contributions. Create issues only when actual dependencies and acceptance tests are ready.

- [ ] Define published cross-repo schema and OpenAPI/ABI golden fixture
- [ ] Create repository-specific CI checks and minimal sample test
- [ ] Build idempotent transaction intent state machine and reconciliation harness
- [ ] Add testnet happy-path E2E and timeout recovery
- [ ] Write contributor reproduction guide and dependency boundary tests
- [ ] Soroban pool funded coverage invariant tests
- [ ] Transfer authorization and revocation model
- [ ] Ledger indexer rescan/backfill worker
- [ ] Maturity+double-claim property tests
