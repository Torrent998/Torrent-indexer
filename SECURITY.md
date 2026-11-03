# Security policy

Torrent is an **unaudited prototype for Stellar Testnet** with synthetic funds. It is not deployed to Mainnet and
must not be used with anything of value. We still take reports seriously: they shape what has to be true before any
real use.

## Supported versions

Only the latest commit on `main` is supported. There are no releases yet.

## Reporting a vulnerability

Please **do not** open a public issue, discussion or pull request for a vulnerability.

1. Use GitHub's private reporting: **[Report a vulnerability](https://github.com/Torrent998/Torrent-indexer/security/advisories/new)**
   (Security tab -> Advisories).
2. If that form is unavailable, open a public issue titled "Security contact request" **with no details**, and a
   maintainer will arrange a private channel.

Include the affected repository and commit, the impact (for example: a right issued without backing, a claim by a
non-owner, a double claim, a signing request that differs from what the user approved), and reproduction steps,
ideally a failing test.

We aim to acknowledge reports within 5 working days and to agree on a disclosure timeline with you. There is no
bug bounty.

## Scope

In scope: code in this repository and its interaction with the sibling repositories
([Torrent-contracts](https://github.com/Torrent998/Torrent-contracts), [Torrent-indexer](https://github.com/Torrent998/Torrent-indexer),
[Torrent-api](https://github.com/Torrent998/Torrent-api), [Torrent-web](https://github.com/Torrent998/Torrent-web)).

Out of scope: findings that require Mainnet funds (none are supported), third-party services, and social
engineering.

Never include real secret keys, seed phrases or personal data in a report. The threat model is in
[docs/SECURITY.md](./docs/SECURITY.md).
