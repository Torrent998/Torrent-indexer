# Contributor tasks for Torrent-indexer

Scoped tasks for contributors, including Drips Wave participants. Each one is real remaining work in this repository, with acceptance tests. They are opened as GitHub issues when a maintainer is ready to review them; nothing here is claimed as done or as funded.

Sizes: small (a day or two), medium (up to a week), large (more, usually with an ADR).

## 1. First live Testnet run

- **Motivation:** `SorobanRpcSource` has never run against live Testnet.
- **Touches:** `src/rpc`, docs
- **Acceptance:** After a Torrent-contracts Testnet deployment, the indexer syncs from the deployment ledger and its projection matches `get_totals` for every pool; the run is documented with ledger numbers.
- **Size:** medium
- **Non-goals:** Mainnet.

## 2. Metrics endpoint

- **Motivation:** Operators cannot see lag, tick failures or faults without reading logs.
- **Touches:** `src/http`
- **Acceptance:** `GET /metrics` exposes lag, last tick, event count and fault counters in Prometheus text format; tested.
- **Size:** small
- **Non-goals:** A metrics backend.

## 3. Rebuild-and-diff command

- **Motivation:** Replay is tested, but there is no operator command to prove a fresh rebuild matches the live store.
- **Touches:** new script
- **Acceptance:** A command replays from the deployment ledger into a fresh database and reports any difference with the live projection; tested with the fake ledger.
- **Size:** medium
- **Non-goals:** Automatic repair.

## 4. Streaming ledger events

- **Motivation:** Consumers poll `/v1/ledger/events`.
- **Touches:** `src/http`
- **Acceptance:** A server-sent events endpoint delivers the same events with the same cursor semantics; reconnect resumes from `Last-Event-ID`.
- **Size:** medium
- **Non-goals:** WebSockets.

## 5. PostgreSQL store

- **Motivation:** SQLite is experimental in Node 22 and single-node.
- **Touches:** `src/indexer` store
- **Acceptance:** The store test suite passes against PostgreSQL with atomic cursor and event commits.
- **Size:** large
- **Non-goals:** Dropping SQLite.

## Already done

Earlier items on this list (cross-repo schemas and golden fixtures, per-repo CI, the intent state machine and reconciliation, coverage-invariant and double-claim property tests, transfer authorization, and indexer replay/backfill) are implemented; see each repository's README status table.
