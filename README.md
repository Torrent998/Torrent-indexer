<img src="./brand/icon.svg" alt="Torrent logo" width="144" />

# torrent-indexer

> Torrent — Ownership of when money becomes available.

**Status: repository scaffold / not implemented.** This repo is one of **exactly four meaningful independent codebases** in the Torrent Stellar-native project. It is not a placeholder created merely to increase Drips Wave submissions.

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
