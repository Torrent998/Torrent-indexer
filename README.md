<div align="center">

<img src="./brand/icon.svg" alt="Torrent logo" width="96" height="96" />

# Torrent-indexer

**Ledger-derived state for Torrent: Soroban event ingestion, replay and reconciliation.**

[![CI](https://github.com/Torrent998/Torrent-indexer/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Torrent998/Torrent-indexer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-42DEB4.svg)](./LICENSE)
[![Network: Stellar Testnet](https://img.shields.io/badge/network-Stellar%20Testnet-00191C.svg)](#status)
[![Status: prototype, unaudited](https://img.shields.io/badge/status-prototype%2C%20unaudited-A5F9DE.svg)](#status)

Part of **Torrent** — ownership of *when* money becomes available.

</div>

## This repository

The indexer turns Soroban contract events into **canonical, ledger-derived read models** that the API and the
web app trust instead of their own databases:

- **Strict decoder** for Torrent-contracts ABI v1 events, tested on the **real** events recorded from the contract
  (`fixtures/contract-stream.v1.json`).
- **Deterministic projection** of pools, members, rights, transfers and totals, cross-checked against the
  contract's own `get_totals` / `get_right`.
- **Durable cursor** with dedup, replay and backfill from the deployment ledger, reorg rollback and fail-closed
  faults; cursor commits atomically with events (SQLite, WAL).
- **Read-only HTTP API**: `GET /v1/ledger/events?cursor=&limit=`, `/v1/pools/:id`, `/v1/pools/:id/rights`,
  `/v1/rights/:id`, `/v1/transfers/:id`, `/v1/status`, `/healthz`. Schema snapshot:
  [`generated/ledger-events.schema.json`](./generated/ledger-events.schema.json).

## Quickstart

Requires Node.js 22.12 or newer.

```bash
git clone https://github.com/Torrent998/Torrent-indexer && cd Torrent-indexer
npm ci
npm run check            # typecheck + eslint + vitest
npm run build
cp .env.example .env     # set TORRENT_ESCROW_CONTRACT_ID and CHAIN_START_LEDGER after a Testnet deployment
npm start                # http://localhost:3002  (/healthz, /v1/status)
```

`npm start` loads `.env` when present and refuses to start without the required settings or on a non-Testnet
network (unless `ALLOW_NON_TESTNET=1`). State is SQLite at `DATABASE_PATH` (default `data/indexer.db`, git-ignored).
Stop with Ctrl-C/SIGTERM: the in-flight tick finishes, then the process exits.

## Status

| Area | State |
|---|---|
| ABI v1 event decoder (table-driven, strict) | implemented; tested on real recorded contract events |
| Projection with cross-checks against contract-reported totals | implemented |
| Cursor, dedup, durable store, replay/backfill, reorg rollback, fail-closed faults, reconciliation | implemented, failure paths tested |
| Read-only HTTP API + JSON Schema snapshot | implemented |
| `SorobanRpcSource` (live RPC adapter) | compiles; **never run against live Testnet** (no deployment exists) |
| RPC-backed reconciliation via `simulateTransaction` | decoding tested on real recorded return values; never run live |
| Storage | SQLite (`node:sqlite`, experimental in Node 22); a JSON store remains for tests |
| Tests | 67 passing; `tests/helpers/fake-ledger.ts` is a labelled **TEST ADAPTER** that replays recorded events |
| Production use / Mainnet | **no** / **no** |

Design record: [docs/adr/0001-indexer-design.md](./docs/adr/0001-indexer-design.md).

## What is Torrent?

In a savings circle, members contribute to a shared pot and take turns receiving it. Sometimes a member
needs their payout earlier, or would happily take it later. **Torrent lets members exchange the timing of a
payout, but only for payouts that are already fully funded.**

1. **Create a circle.** An organizer sets the rules; their hash binds the circle to an on-chain pool.
2. **Fund the pool.** Members deposit a supported Stellar asset into a Soroban escrow contract.
3. **Issue payout rights.** Each right has a unique id, owner, amount and maturity. The contract refuses to
   issue a right that is not covered by unreserved escrow.
4. **Transfer or claim.** The owner proposes, the recipient accepts, both sign. At maturity the current owner
   claims exactly once.

The contract enforces one invariant after every call: `reserved <= funded - claimed - withdrawn`.
A payout right never represents a future contribution that has not been paid.

## Architecture

Torrent is four independently tested repositories, each owning one boundary. The contract is the only source of truth for backing, ownership and payout; the indexer reconstructs that truth from the ledger; the API organizes people and signing requests; the web app shows it honestly.

```mermaid
flowchart LR
  U(["Member wallet"]) -.->|signs each call| W
  W["<b>Torrent-web</b><br/>Next.js app"] -->|HTTPS, OpenAPI v1| A["<b>Torrent-api</b><br/>circles, invitations, signing requests"]
  A -->|ledger read models| I["<b>Torrent-indexer</b><br/>ledger-derived state"]
  A -->|user-signed transactions| C["<b>Torrent-contracts</b><br/>Soroban escrow on Stellar"]
  C -->|contract events via RPC| I
  classDef here fill:#42DEB4,stroke:#00191C,color:#00191C
  class I here
```

| Repository | Stack | Owns |
|---|---|---|
| [Torrent-contracts](https://github.com/Torrent998/Torrent-contracts) | Rust · Soroban SDK 29 | Escrow pools, fully backed payout rights, member-only transfers and one-time claims. The only writer of financial truth. |
| **[Torrent-indexer](https://github.com/Torrent998/Torrent-indexer)** (this repo) | TypeScript · Node 22 · Stellar RPC | Ingests contract events with a durable cursor and rebuilds pools, rights and transfers from the ledger. |
| [Torrent-api](https://github.com/Torrent998/Torrent-api) | TypeScript · NestJS · SQLite | Circles, invitations, wallet sign-in and the signing-request state machine. Holds no keys and no balances. |
| [Torrent-web](https://github.com/Torrent998/Torrent-web) | TypeScript · Next.js 16 · Tailwind CSS 4 | Landing page and web app: circles, coverage, rights, transfers, claims and signing requests. |

## Project documents

| Document | What it covers |
|---|---|
| [docs/PRD.md](./docs/PRD.md) | Product purpose, users, MVP and non-goals |
| [docs/SRD.md](./docs/SRD.md) | Domain model, state machine, API surface |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | The four repositories and how data flows between them |
| [docs/STELLAR_PROTOCOL.md](./docs/STELLAR_PROTOCOL.md) | Contract specification and invariants |
| [docs/SECURITY.md](./docs/SECURITY.md) | Threat model and go-live restrictions |
| [docs/ROADMAP.md](./docs/ROADMAP.md) | Milestones and quality gates |
| [docs/BRAND.md](./docs/BRAND.md) | Approved logo and interface principles |
| [docs/adr/](./docs/adr/) | Architecture decision records for this repository |
| [AGENTS.md](./AGENTS.md) | Rules for AI coding agents working in this repository |

The shared product documents are mirrored in all four repositories; the canonical copy lives in
[Torrent-api](https://github.com/Torrent998/Torrent-api/tree/main/docs).

## Contributing and Drips Wave

Contributions are welcome. Start with [CONTRIBUTING.md](./CONTRIBUTING.md), then pick a scoped task from
[docs/CONTRIBUTOR_ISSUES.md](./docs/CONTRIBUTOR_ISSUES.md). Each task names its motivation, the files it touches,
acceptance tests and non-goals. Changes that cross a repository boundary go through the versioned fixtures
each repo publishes, so every PR stays reviewable on its own.

Torrent intends to apply to the [Drips Wave](https://docs.drips.network/wave/maintainers/participating-in-a-wave/)
program for Stellar projects. Participation is subject to Drips' review; nothing here implies approval or rewards.
Please follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Security

Torrent is an **unaudited prototype for Stellar Testnet**. Do not use it with real funds.
Please report vulnerabilities privately as described in [SECURITY.md](./SECURITY.md); do not open public issues
for them. The threat model is in [docs/SECURITY.md](./docs/SECURITY.md).

## License

[MIT](./LICENSE). The Torrent logo in [`brand/`](./brand/) is the project's approved identity and is shared by all four
repositories; see [brand/README.md](./brand/README.md) for usage rules.
