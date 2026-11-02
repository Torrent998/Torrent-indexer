# ADR 0001 — Event-log-first indexer with fail-closed halts

Status: accepted (M1). Sources: `docs/ARCHITECTURE.md`, `docs/SRD.md` (ledger watchers, reconciliation event contract), `docs/TECHNICAL_BUILD.md`, and the contracts repo's ABI v1 (`fixtures/`). Specific docs win over the master index; the canonical doc set lives in `torrent-api`.

## Decisions
1. **The stored, ordered event log is the source of truth; the read model is a pure function of it** (`Projection.replay`). Rollback (reorg) and full rebuild are the same operation: truncate/reset the log, replay. Determinism is tested by comparing snapshots.
2. **Cursor = last ingested Soroban event id** (`<toid>-<index>`, lexicographically ordered). Persisted atomically (temp file + fsync + rename) with the log after every page.
3. **Idempotency**: an id already stored with an identical payload is dropped; the same id with a different payload (`INTEGRITY_CONFLICT`) or an unseen id behind the cursor (`OUT_OF_ORDER`) halts.
4. **Fail closed**: wrong network (`network_id` != sha256(passphrase)), unknown event name, schema drift, a projection inconsistency, a reconciliation mismatch, or a reorg deeper than retained checkpoints records a persisted `Fault`; status becomes `RECONCILING`; `tick()` stops fetching until an operator calls `resetForReplay()` (rebuild from the deployment ledger). Faults survive restarts.
5. **Cross-check against the contract's own numbers**: events carry `funded_total`, `reserved_total`, `claimed_total`, `withdrawn_total`; the projection recomputes them and halts on any difference, and re-verifies `reserved <= funded - claimed - withdrawn`. The indexer does *not* re-implement contract authorization; it only checks the stream is self-consistent.
6. **Reorgs** are detected with ledger-hash checkpoints (kept per scanned page). Stellar has fast deterministic finality, so this is defensive: it protects against RPC/source inconsistency and mis-configured networks. Ledgers the source can no longer vouch for are skipped, not treated as a fork.
7. **Finality labels** (`SUBMITTED` until `confirmations` ledgers deep, then `CONFIRMED`) are computed at read time and exposed in the reconciliation event record `{id, sourceRepo, schemaVersion, network, ledgerCursor, entityRef, status, observedAt}`.
8. Two implicit contract behaviours are projected without events: an expired proposal replaced by a new one (`Superseded`), and a pending proposal voided by a claim (`Cancelled`).

## Limits / not done
- `SorobanRpcSource` has never run against a live Testnet RPC here; RPC history retention (days) means old deployments need a ledger-archive source (not built).
- No RPC-backed `ChainStateReader` yet; `reconcile()` is tested with a labeled test adapter.
- Single-file JSON store (O(n) rewrite). Fine for a Testnet demo; replace with a database before real volume.
- Shorter-chain rewinds (tip moves backwards) are not detected; Stellar does not do this.
