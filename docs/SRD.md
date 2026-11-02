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
