# Contributing to Torrent-indexer

Thanks for helping build Torrent. This repository owns one boundary of the system
(ingests contract events with a durable cursor and rebuilds pools, rights and transfers from the ledger); changes elsewhere belong in the
[sibling repository](https://github.com/Torrent998) that owns them.

## Before you start

1. Read [README.md](./README.md), [AGENTS.md](./AGENTS.md) and the relevant parts of [docs/](./docs/).
2. Pick a task from [docs/CONTRIBUTOR_ISSUES.md](./docs/CONTRIBUTOR_ISSUES.md) or open an issue with the
   feature-request template. Comment on the issue before starting large work, so effort is not duplicated.
3. Respect the domain rules: no payout right without escrowed backing, nothing shown as settled before the ledger
   confirms it, no secret keys in clients, Testnet and synthetic data only.

## Development

```bash
npm ci
npm run check   # the same gate CI runs; it must pass before a PR
```

- Write tests for behavior and for failure paths, not only the happy path.
- If you change a public boundary (OpenAPI, ABI, event schema, fixtures), version it, update the recorded
  fixtures, and describe the impact on sibling repositories in the PR.
- Record architecture changes as an ADR in [docs/adr/](./docs/adr/).
- Keep commits small and use [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `test:`, `chore:` ...).

## Pull requests

Fill in the PR template: what changes, why it belongs here, sibling impact, tests and evidence, and security,
privacy and Stellar impact. Never include keys, personal data, real funds or fabricated screenshots or results.

## Drips Wave

Torrent intends to take part in [Drips Wave](https://docs.drips.network/wave/maintainers/participating-in-a-wave/).
Wave tasks are the scoped issues in [docs/CONTRIBUTOR_ISSUES.md](./docs/CONTRIBUTOR_ISSUES.md) once they are
opened on GitHub. Nothing here promises approval, rewards or a schedule.

By participating you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md). Report vulnerabilities privately as
described in [SECURITY.md](./SECURITY.md).
