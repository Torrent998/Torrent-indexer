# AI Coding Agent Instructions — torrent-indexer

## Mission
Implement **only the `torrent-indexer` subsystem** as defined in `docs/PROJECT_MASTER.md`, `docs/ARCHITECTURE.md`, `docs/SRD.md`, and `docs/TECHNICAL_BUILD.md`. The entire product is Torrent: A fully funded savings-circle financial system in which verified eligible members can exchange the timing/ownership of scheduled payout claims. No claim can be traded unless an equivalent supported asset amount is actually reserved on Stellar. This is a prototype of a rights market, not a guarantee of future unpaid contributions.

## Neighbor repositories
`torrent-web`, `torrent-api`, `torrent-contracts`. You are responsible for your own component and versioned integrations; do not duplicate their owners' logic.

## Do not assume this is already built
This is an initial build-handoff scaffold with documents, brand drafts, environment guidance and directories. There is no existing working product, deployment, live integration, approved Drips application, mobile store listing or audited production contract.

## Execution
1. Read all project docs and verify the **domain safety constraints** first.
2. Define your contracts with sibling repos using schema/ABI and fixtures. Agree on versioned handshake.
3. Complete M0 and M1 before style polish or unrelated new features.
4. Make small, testable PRs and record architecture changes in ADRs.
5. Never pretend missing product or chain integrations are working; use clearly labeled test adapters.
6. Write real tests for system logic and failure paths, not only mocked happy paths.
7. Don't ask for production funds/credentials; use Testnet and synthetic providers.
8. Keep UI architecture flexible and let design be refined while respecting the brand's flat-icon and functional requirements.
