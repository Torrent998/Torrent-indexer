# Changelog
## 0.1.0 - 2026-11-06 (Testnet prototype)
- **Live on Stellar Testnet**: follows the deployed `torrent-escrow` from ledger 5553711 (`SYNCED`, 54 events, no faults; the smoke pool's totals match the contract's own `get_totals`). Hosted on Render's free plan.
- Fixes found by the first live run: the temp state file is now fsynced with `r+` (read-only handles fail on Windows), snapshot tests are line-ending safe, SQLite stores are closed in tests.
- Repository documentation rewritten for public review; internal planning notes removed; `docs.yml` checks required files and relative links.
- **ABI v2**: decoder table and projection for `pool_closed`, `member_removed`, `member_left`, `controller_proposed`,
  `controller_changed` and the contract-level `admin_proposed`, `admin_changed`, `upgrade_proposed`, `upgrade_cancelled`,
  `contract_upgraded`, `upgrades_locked`; strict handling of the now-evented transfer cancellations (`Superseded` removed);
  v2 timing and lifecycle checks; `GET /v1/contract`; reconciliation of pool status, controller and governance.
  Fixtures mirrored from torrent-contracts `bindings/*.v2.json`. 78 tests.
- `npm start` loads `.env` when present; security policy, code of conduct, issue forms and Dependabot.
- M0: mirrored ABI v1 event schema and real XDR event stream from torrent-contracts (`fixtures/`), generated JSON Schema for the event API, ADR 0001.
- M1: decoder, deterministic projection, cursor/dedup/reorg/fail-closed indexer, file store, read-only HTTP API, Soroban RPC source.
