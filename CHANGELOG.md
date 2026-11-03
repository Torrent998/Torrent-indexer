# Changelog
## Unreleased
- **ABI v2**: decoder table and projection for `pool_closed`, `member_removed`, `member_left`, `controller_proposed`,
  `controller_changed` and the contract-level `admin_proposed`, `admin_changed`, `upgrade_proposed`, `upgrade_cancelled`,
  `contract_upgraded`, `upgrades_locked`; strict handling of the now-evented transfer cancellations (`Superseded` removed);
  v2 timing and lifecycle checks; `GET /v1/contract`; reconciliation of pool status, controller and governance.
  Fixtures mirrored from torrent-contracts `bindings/*.v2.json`. 78 tests.
- `npm start` loads `.env` when present; README overhaul, security policy, code of conduct, issue forms, Dependabot and repo-specific contributor tasks.
- M0: mirrored ABI v1 event schema and real XDR event stream from torrent-contracts (`fixtures/`), generated JSON Schema for the event API, ADR 0001.
- M1: decoder, deterministic projection, cursor/dedup/reorg/fail-closed indexer, file store, read-only HTTP API, Soroban RPC source (live-untested).
