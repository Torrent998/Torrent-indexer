<img src="./brand/icon.svg" alt="Torrent logo" width="144" />

# torrent-indexer

> Torrent — Ownership of when money becomes available.

**Status: M0 + M1 implemented and tested against a recorded real contract event stream; NOT run against a live Testnet RPC.** This repo is one of **exactly four meaningful independent codebases** in the Torrent Stellar-native project. It is not a placeholder created merely to increase Drips Wave submissions.

## Honest status
| Item | State |
|---|---|
| Decoder for torrent-escrow ABI v1 events (table-driven, strict) | implemented; tested on **real** events recorded from the contract's test host (`fixtures/contract-stream.v1.json`) |
| Deterministic projection (pools, members, rights, transfers, totals) with cross-checks against contract-reported totals | implemented |
| Cursor, dedup, durable store, replay/backfill, reorg rollback, fail-closed faults, reconciliation hook | implemented, 50+ tests including failure paths |
| Read-only HTTP API (`/v1/ledger/events`, pools, rights, transfers, status) + JSON Schema snapshot | implemented |
| `SorobanRpcSource` (real RPC adapter) | compiles; **never run against live Testnet** (no deployment exists, no network in the authoring sandbox) |
| RPC-backed `ChainStateReader` for reconciliation | **not built** (interface + labeled test adapter only) |
| Database, queues, auth, production use | **no** |

Tests use `tests/helpers/fake-ledger.ts`, a clearly labeled **TEST ADAPTER** that replays recorded events; it is not an integration.

## Local startup
```bash
npm ci
npm run check        # typecheck + eslint + vitest
cp .env.example .env # then set TORRENT_ESCROW_CONTRACT_ID / CHAIN_START_LEDGER after a Testnet deploy
npm run build && npm start
```
Stop with Ctrl-C/SIGTERM (finishes the in-flight tick, then exits). State lives in `STATE_FILE` (default `data/state.json`, git-ignored). Testnet only: `main.ts` refuses other networks unless `ALLOW_NON_TESTNET=1`.

## Public boundary (versioned, schemaVersion 1)
- `GET /v1/ledger/events?cursor=&limit=` — events after `cursor` with `finality` and a reconciliation record; schema in `generated/ledger-events.schema.json`.
- `GET /v1/pools/:id`, `/v1/pools/:id/rights`, `/v1/rights/:id`, `/v1/transfers/:id`, `/v1/status`, `/healthz`.
- Consumes torrent-contracts event schema v1 (`fixtures/`, mirrored from contracts@6b2bd11). Design: `docs/adr/0001-indexer-design.md`.

## Owns
Soroban event ingestion, canonical ledger-derived read models, reconciliation, replay/backfill, settlement status and event API

## Why it is separate
It has a distinct runtime/toolchain, external interface, tests, release cadence and maintainership boundary. Its siblings depend on its delivered interface, but implementation responsibilities must not be duplicated.

## Sibling repositories
- `torrent-web` — Savings-circle dashboard, governance and identity UX, fully-funded payout inventory, swap/transfer requests, signing and reporting
- `torrent-api` — Authenticated groups, enrollment, policy state, off-chain agreements, transaction intent orchestration, RBAC, compliance and notifications
- `torrent-contracts` — Escrow of backed assets, immutable fully-funded payout rights, transfer restrictions, schedule enforcement, claims, authorized amendments

## Architecture and development context
Start with:
- `AGENTS.md` — coding agent rules;
- `docs/PRD.md` — product purpose and MVP;
- `docs/SRD.md` — user/system requirements, APIs and state;
- `docs/ARCHITECTURE.md` — four-repository responsibilities, data and execution paths;
- `docs/TECHNICAL_BUILD.md` — recommended bootstrap, testing, phases;
- `docs/SECURITY.md` — security/trust boundaries;
- `docs/BRAND.md` — approved flat logo and flexible UI direction;
- `docs/ROADMAP.md` — milestone acceptance gates.

## Technical target
TypeScript ledger/indexer. The actual product implementation starts at milestone M0; no real-money transactions or claims exist in this scaffold.

## Minimal integration contract
Always test the dependency path stated in ARCHITECTURE.md. Every new public endpoint/ABI/package message must be versioned and covered by consumer fixtures. See `docs/SRD.md` and `docs/TECHNICAL_BUILD.md`.

## Drips Wave
Stellar is essential: Soroban escrow contract takes custody of already-funded supported Stellar assets. Approval/eligibility for Wave depends on substantive open-source implementation and organizer review, not repo count.


## Official project identity

The project uses the **approved flat SVG logo** in [`brand/icon.svg`](./brand/icon.svg), with an editable transparent vector mark in [`brand/mark.svg`](./brand/mark.svg). The [512 px GitHub organization avatar](./brand/org-avatar.png) is in the same directory. This logo is shared by all four project repositories. UI design remains intentionally flexible.
