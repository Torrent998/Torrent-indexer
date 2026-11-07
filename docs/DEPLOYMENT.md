# Torrent — Environment, Deployment and Recovery

## Environment boundaries
- Local: deterministic Docker Compose services, Stellar local network/Testnet, synthetic users/fixtures.
- Staging: separate database, bucket, API credentials, signing identities, Testnet assets/contracts, observability.
- Production: requires security audit, real issuer/provider agreements and relevant jurisdictional legal/compliance review. Not included in this Testnet prototype.

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

## Live run against Testnet (2026-11-04)

Config: `TORRENT_ESCROW_CONTRACT_ID=CBWF73FUJDGXSXOYUVYHP3XAFSPZWX65YGFSXDSSF5VRFLEWFFTQUIJG`, `CHAIN_START_LEDGER=5553711`, `PORT=4002`
(the workspace also runs other services on 3000-3002), `POLL_MS=5000`, `RECONCILE_EVERY_TICKS=60`.

Observed after the contract's smoke run and the API live runs (see `Torrent-contracts/docs/DEPLOYMENT.md`):
- `GET /v1/status`: `SYNCED`, `lagLedgers 0`, `reorgCount 0`, `faults []`.
- Every event kind the contract emitted during the smoke lifecycle was ingested (pool_created, member_joined, funded, right_issued, transfer_proposed, transfer_completed, right_claimed, member_left, controller_proposed, controller_changed, pool_closed, unreserved_withdrawn).
- Smoke pool 8: the indexer's totals (`funded 10000000, claimed 6000000, withdrawn 4000000, reserved 0`) equal the contract's own `get_totals` read directly from the chain, status `Closed`, coverage fully backed.
- Reconciliation ran on its schedule (every 60 ticks, about 5 minutes) with no fault recorded. I did not force a drift to watch it trip; that path is covered by the unit tests only.
- `GET /v1/contract` returns ABI 2 with `admin: null`: the constructor emits no event, so the admin stays unknown to the indexer until the first admin rotation. This is a known gap (contract change + redeploy), not fixed.
