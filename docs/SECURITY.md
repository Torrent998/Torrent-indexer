# Torrent — Threat Model / Trust & Safety

## Core assets to protect
- end-user wallet authorization and secrets;
- canonical ledger truth, quotes, settlement state, pool/channel collateral;
- merchant/provider or membership authority and representation;
- customer privacy, audit history, and safe account recovery.

## Threats and mitigations
- **Fake asset/issuer/provider** -> verify addresses/network and issuer/identity evidence, show issuer status and require explicit user confirmation.
- **Stale rate or condition** -> expiring quote/offer/maturity/channel state; revalidate before signature.
- **Transaction submitted but response lost** -> idempotent reconcile by stable tx hash; no blind double pay.
- **Replay or old signatures** -> domain separation, nonce/session ID, monotonic states, scoped expiry.
- **Key compromise** -> hardware-backed secure storage when available; rotate server secrets and support freeze/recovery flows.
- **Ledger indexing drift** -> process durable cursors, replay from known ledger, verify source and rehydrate read models.
- **Privacy leakage** -> do not put PII, contact data or commercial secrets into on-chain metadata or public source code.
- **Supply-chain attacks** -> pinned/reviewed dependencies, license inspection, security scanning, CI role separation.
- **Client manipulation** -> server validates authorization, user signs critical financial actions; clients not authoritative.

## Domain risks
- Traditional rotating savings schemes with unpaid future contributions are not fully backed; do not tokenize them as guaranteed payout rights.
- Moving payout dates is not the same as creating new money or profit.
- Transferability, consumer protection and potential financial instrument rules need legal review.
- Keep the first product Testnet-only with synthetic funds and members.

## Go-live restriction
MVP is Testnet/synthetic only. Prior to production or external real-money custody, obtain applicable legal/compliance review, security audit, incident response/insurance assessment, operational risk acceptance, verified issuer/provider integrations and UX consumer disclosures. Do not claim that a Stellar transaction alone establishes a valid real-world legal claim.
