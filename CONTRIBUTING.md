# Contributing to Torrent-indexer

Thanks for helping build Torrent. This repository turns Soroban contract events into durable, ledger-derived read models (pools, rights, transfers) with a persistent cursor, reorg handling and reconciliation against the contract. Work that belongs to another boundary goes to the
sibling repository that owns it (all four are in the [Torrent998](https://github.com/Torrent998) organization).

## How work is organized (Stellar Wave)

Torrent takes part in the Stellar Wave program on [Drips](https://www.drips.network/wave/stellar). Scoped tasks are GitHub issues:

- They carry the `Stellar Wave` label and exactly one complexity label: `trivial` (100 points), `medium` (150) or `high` (200), following Drips' guidance.
- Each issue has a Summary, Context, Scope, Implementation notes, Acceptance criteria (a checklist) and the tech stack involved. If anything is unclear, ask on the issue before you start.
- Browse them: [open Stellar Wave issues](https://github.com/Torrent998/Torrent-indexer/issues?q=is%3Aissue+is%3Aopen+label%3A%22Stellar+Wave%22). Good first tasks are labeled `good first issue`.
- To take one, comment with a two-line plan and wait for a maintainer to assign it. Keep to one open claim at a time so others get a chance.
- Points and rewards are handled by Drips under [its terms](https://docs.drips.network/wave/terms-and-rules). Maintainers do not promise rewards, and approval of this repository is up to Drips.

## Set up

```bash
git clone https://github.com/Torrent998/Torrent-indexer && cd Torrent-indexer
npm ci
npm run check     # lint, typecheck, tests, build
```

Requires Node 22.12 or newer. To run against the Testnet contract, copy `.env.example` to `.env` and set `TORRENT_ESCROW_CONTRACT_ID` and `CHAIN_START_LEDGER` (see the README).

## What every change needs

- Tests for the behavior and for the failure paths, not only the happy path. Do not weaken or delete a test to get a green build.
- The indexer must never invent state. If you change how an event is decoded, update the recorded fixtures in `fixtures/` from the contract's real event stream and say which `Torrent-contracts` commit they come from.
- Record architecture changes as an ADR in [docs/adr/](./docs/adr/).
- Keep commits small and use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- The gate is `npm run check`. It is the same gate CI runs, and it must pass before you open a PR.

## Rules that do not bend

- No payout right without escrowed backing.
- Nothing is shown as settled before the ledger confirms it.
- No secret key, seed phrase or token in code, tests, fixtures, logs or screenshots.
- Testnet and synthetic data only.

## Pull requests and review

1. Fork, branch from `main`, make the change, run the gate.
2. Open a PR that links the issue (`Closes #123`) and fills in the template: what changes, why it belongs here, sibling impact, tests and evidence, security and Stellar impact.
3. A maintainer reviews against the issue's acceptance criteria. Expect a first response within a few days (best effort, not a promise). Reviewers ask for changes in the open, and a PR that stalls for two weeks without a reply may be closed.
4. Do not include fabricated results, screenshots of things you did not run, or numbers you did not measure.

## Conduct and security

By taking part you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md). Report vulnerabilities privately as described in [SECURITY.md](./SECURITY.md), never in a public issue.
Questions about the design go to [GitHub Discussions](https://github.com/Torrent998/Torrent-indexer/discussions).
